import fs from 'fs';
import path from 'path';
import { FreelancerProject, FilterConfig, BidLog, BidOutcome, SystemStats, DashboardData, DEFAULT_CONFIG } from '../types.ts';
import { generateProposal } from './openai.ts';
import { normalizeBidAmount } from './pricing.ts';
import {
  CURRENCY_RATES_TO_USD as SHARED_RATES,
  convertToUSD as sharedConvertToUSD,
  evaluateProject as sharedEvaluateProject,
} from '../../extension/qualification.js';
import { checkRelevance } from '../../extension/relevance.js';
import { getOpenAiKey, setSecret, hasSecret } from './auth.ts';
import { getDb, getMeta, setMeta } from './db.ts';
import { findById as findUser, trialInfo, canUserBid } from './users.ts';

const MANIFEST_FILE = path.join(process.cwd(), 'extension', 'manifest.json');
const LEGACY_STORE_FILE = path.join(process.cwd(), 'data', 'store.json');

const PROJECT_CACHE_LIMIT = 250;
const BID_CACHE_LIMIT = 500;
const LEGACY_MOCK_IDS = [38994889, 38920141, 38920142, 38920143, 38920144, 38920145];

export function getExtensionVersion(): string {
  try {
    return `v${JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8')).version}`;
  } catch {
    return '';
  }
}

export { DEFAULT_CONFIG };

export const CURRENCY_RATES_TO_USD: Record<string, number> = SHARED_RATES;

export function convertToUSD(amount: number, currency: string): number {
  return sharedConvertToUSD(amount, currency);
}

/**
 * One user's working set. Loaded from SQLite on first touch and kept in memory; every
 * mutation is written through row-by-row, so the cache never needs a bulk flush.
 */
interface UserState {
  config: FilterConfig;
  processedProjectIds: Set<number>;
  projects: FreelancerProject[]; // newest first, capped
  bids: BidLog[]; // newest first, capped
  stats: SystemStats;
}

function initialStats(): SystemStats {
  return {
    totalScanned: 0,
    totalQualified: 0,
    totalBidsPlaced: 0,
    totalSkipped: 0,
    lastPollTimestamp: Date.now(),
    skipBreakdown: {
      missingMandatoryTags: 0,
      blacklistedKeyword: 0,
      budgetOutOfRange: 0,
      unverifiedPayment: 0,
      lowRating: 0,
      alreadyProcessed: 0,
    },
  };
}

function sanitizeConfig(raw: Partial<FilterConfig> | null | undefined): FilterConfig {
  const cfg: FilterConfig = { ...DEFAULT_CONFIG, ...(raw || {}) };
  if (cfg.autoOpenQualified === undefined) cfg.autoOpenQualified = true;
  if (cfg.allowedCurrencies && !cfg.allowedCurrencies.includes('INR')) {
    cfg.allowedCurrencies = [...cfg.allowedCurrencies, 'INR', 'SGD', 'NZD', 'PHP'];
  }
  cfg.openaiApiKey = '';
  return cfg;
}

class ProjectStore {
  private cache = new Map<string, UserState>();

  // ---------------------------------------------------------------- persistence

  private load(userId: string): UserState {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const db = getDb();
    const cfgRow = db.prepare('SELECT config_json FROM user_config WHERE user_id = ?').get(userId) as { config_json: string } | undefined;
    const statsRow = db.prepare('SELECT stats_json FROM stats WHERE user_id = ?').get(userId) as { stats_json: string } | undefined;
    const projectRows = db
      .prepare('SELECT data_json FROM projects WHERE user_id = ? ORDER BY submit_date DESC, id DESC LIMIT ?')
      .all(userId, PROJECT_CACHE_LIMIT) as Array<{ data_json: string }>;
    const bidRows = db
      .prepare('SELECT data_json FROM bids WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?')
      .all(userId, BID_CACHE_LIMIT) as Array<{ data_json: string }>;
    const processedRows = db.prepare('SELECT project_id FROM processed_project_ids WHERE user_id = ?').all(userId) as Array<{ project_id: number }>;

    const state: UserState = {
      config: sanitizeConfig(cfgRow ? JSON.parse(cfgRow.config_json) : null),
      processedProjectIds: new Set(processedRows.map((r) => r.project_id)),
      projects: projectRows.map((r) => JSON.parse(r.data_json)),
      bids: bidRows.map((r) => JSON.parse(r.data_json)),
      stats: statsRow ? JSON.parse(statsRow.stats_json) : initialStats(),
    };
    this.cache.set(userId, state);
    return state;
  }

  /** Drop a user's cached state (after admin deletes the user, or to force a reload). */
  public evict(userId: string) {
    this.cache.delete(userId);
  }

  private saveConfig(userId: string, config: FilterConfig) {
    getDb()
      .prepare('INSERT INTO user_config(user_id, config_json) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json')
      .run(userId, JSON.stringify(config));
  }

  private saveStats(userId: string, stats: SystemStats) {
    getDb()
      .prepare('INSERT INTO stats(user_id, stats_json) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET stats_json = excluded.stats_json')
      .run(userId, JSON.stringify(stats));
  }

  private saveProject(userId: string, project: FreelancerProject) {
    getDb()
      .prepare(
        'INSERT INTO projects(user_id, id, data_json, submit_date) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET data_json = excluded.data_json, submit_date = excluded.submit_date'
      )
      .run(userId, project.id, JSON.stringify(project), project.submitDate || 0);
  }

  private saveBid(userId: string, bid: BidLog) {
    getDb()
      .prepare(
        'INSERT INTO bids(user_id, bid_key, project_id, data_json, timestamp) VALUES(?, ?, ?, ?, ?) ON CONFLICT(user_id, bid_key) DO UPDATE SET data_json = excluded.data_json, timestamp = excluded.timestamp'
      )
      .run(userId, bid.id, bid.projectId, JSON.stringify(bid), bid.timestamp || Date.now());
  }

  private markProcessed(userId: string, state: UserState, projectId: number) {
    state.processedProjectIds.add(projectId);
    getDb().prepare('INSERT OR IGNORE INTO processed_project_ids(user_id, project_id) VALUES(?, ?)').run(userId, projectId);
  }

  private insertProject(userId: string, state: UserState, project: FreelancerProject) {
    const idx = state.projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) state.projects[idx] = project;
    else state.projects.unshift(project);
    if (state.projects.length > PROJECT_CACHE_LIMIT) state.projects.length = PROJECT_CACHE_LIMIT;
    this.saveProject(userId, project);
  }

  private pushBid(userId: string, state: UserState, bid: BidLog) {
    state.bids.unshift(bid);
    if (state.bids.length > BID_CACHE_LIMIT) state.bids.length = BID_CACHE_LIMIT;
    this.saveBid(userId, bid);
  }

  /**
   * One-time import of the single-tenant data/store.json into the first admin account, so
   * nothing that was already scanned or bid on is lost in the move to per-user storage.
   */
  public importLegacyStore(userId: string): { projects: number; bids: number } | null {
    if (getMeta('legacy_store_imported')) return null;
    if (!fs.existsSync(LEGACY_STORE_FILE)) {
      setMeta('legacy_store_imported', 'none');
      return null;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(LEGACY_STORE_FILE, 'utf-8'));
      let config = sanitizeConfig(parsed.config);
      if (process.env.AUTOBID_CONFIG_JSON) {
        try {
          config = sanitizeConfig({ ...config, ...JSON.parse(process.env.AUTOBID_CONFIG_JSON) });
        } catch {}
      }
      if (parsed.config?.openaiApiKey && !hasSecret('openaiApiKey')) {
        setSecret('openaiApiKey', String(parsed.config.openaiApiKey).trim());
      }

      const projects: FreelancerProject[] = (parsed.projects || []).filter(
        (p: FreelancerProject) => p && p.id && !p.url?.includes('sample-job') && !LEGACY_MOCK_IDS.includes(p.id)
      );
      const bids: BidLog[] = (parsed.bids || []).filter((b: BidLog) => b && b.projectId && !LEGACY_MOCK_IDS.includes(b.projectId));
      const processed: number[] = (parsed.processedProjectIds || []).filter((id: number) => !LEGACY_MOCK_IDS.includes(id));

      const db = getDb();
      db.exec('BEGIN');
      try {
        this.saveConfig(userId, config);
        this.saveStats(userId, parsed.stats || initialStats());
        for (const p of projects) this.saveProject(userId, p);
        for (const b of bids) this.saveBid(userId, b);
        const ins = db.prepare('INSERT OR IGNORE INTO processed_project_ids(user_id, project_id) VALUES(?, ?)');
        for (const id of processed) ins.run(userId, id);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      setMeta('legacy_store_imported', new Date().toISOString());
      this.cache.delete(userId);
      console.log(`[Store] Imported legacy store.json into admin: ${projects.length} projects, ${bids.length} bids.`);
      return { projects: projects.length, bids: bids.length };
    } catch (e) {
      console.warn('[Store] Legacy import failed:', e);
      return null;
    }
  }

  // ---------------------------------------------------------------- config / reads

  public getConfig(userId: string): FilterConfig {
    return this.load(userId).config;
  }

  public updateConfig(userId: string, newConfig: Partial<FilterConfig>, isAdmin = false): FilterConfig {
    const state = this.load(userId);
    const { openaiApiKey, ...rest } = newConfig;
    // Only an admin may change the shared key, and never through config itself.
    if (isAdmin && typeof openaiApiKey === 'string' && openaiApiKey.trim() && !openaiApiKey.includes('…')) {
      setSecret('openaiApiKey', openaiApiKey.trim());
    }
    state.config = { ...state.config, ...rest, openaiApiKey: '' };
    this.saveConfig(userId, state.config);
    return state.config;
  }

  public getStats(userId: string): SystemStats {
    return this.load(userId).stats;
  }

  public getProjects(userId: string, limit = 100): FreelancerProject[] {
    return this.load(userId).projects.slice(0, limit);
  }

  public getBids(userId: string, limit = 100): BidLog[] {
    return this.load(userId).bids.slice(0, limit);
  }

  public clearHistory(userId: string) {
    const db = getDb();
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM projects WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM bids WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM processed_project_ids WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM stats WHERE user_id = ?').run(userId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    const state = this.load(userId);
    state.projects = [];
    state.bids = [];
    state.processedProjectIds = new Set();
    state.stats = initialStats();
  }

  // ---------------------------------------------------------------- outcomes

  public recordBidOutcomes(
    userId: string,
    updates: Array<{ projectId: number; outcome: BidOutcome; paidStatus?: string | null; freelancerBidId?: number }>
  ): number {
    const state = this.load(userId);
    let changed = 0;
    for (const u of updates) {
      const log = state.bids.find((b) => b.projectId === u.projectId);
      if (!log) continue;
      if (log.outcome !== u.outcome || log.paidStatus !== (u.paidStatus || undefined)) changed += 1;
      log.outcome = u.outcome;
      log.outcomeCheckedAt = Date.now();
      if (u.paidStatus) log.paidStatus = u.paidStatus;
      if (u.freelancerBidId) log.freelancerBidId = u.freelancerBidId;
      this.saveBid(userId, log);
    }
    return changed;
  }

  public getOutcomeAnalytics(userId: string) {
    const state = this.load(userId);
    const bids = state.bids.filter((b) => b.status === 'SUCCESS');
    const decided = bids.filter((b) => b.outcome === 'won' || b.outcome === 'lost');
    const won = decided.filter((b) => b.outcome === 'won');

    const byOutcome: Record<string, number> = {};
    for (const b of bids) byOutcome[b.outcome || 'pending'] = (byOutcome[b.outcome || 'pending'] || 0) + 1;

    const group = (keyOf: (b: BidLog) => string | null) => {
      const acc: Record<string, { bids: number; won: number; lost: number }> = {};
      for (const b of bids) {
        const k = keyOf(b);
        if (!k) continue;
        acc[k] = acc[k] || { bids: 0, won: 0, lost: 0 };
        acc[k].bids += 1;
        if (b.outcome === 'won') acc[k].won += 1;
        if (b.outcome === 'lost') acc[k].lost += 1;
      }
      return Object.entries(acc)
        .map(([key, v]) => ({ key, ...v, winRate: v.won + v.lost ? v.won / (v.won + v.lost) : null }))
        .sort((a, c) => c.bids - a.bids);
    };

    const project = (b: BidLog) => state.projects.find((p) => p.id === b.projectId);
    const budgetBand = (b: BidLog) => {
      const p = project(b);
      const usd = p ? convertToUSD(p.budget.maximum, p.budget.currency) : b.bidAmount;
      if (usd < 100) return '<$100';
      if (usd < 500) return '$100-500';
      if (usd < 2000) return '$500-2k';
      return '$2k+';
    };

    return {
      totalBids: bids.length,
      decided: decided.length,
      won: won.length,
      lost: decided.length - won.length,
      winRate: decided.length ? won.length / decided.length : null,
      byOutcome,
      bySkill: this.groupBySkill(state, bids),
      byBudgetBand: group(budgetBand),
      byProjectType: group((b) => b.projectType || project(b)?.type || null),
      byCountry: group((b) => project(b)?.client?.country || null),
      byHourOfDay: group((b) => String(new Date(b.timestamp).getHours()).padStart(2, '0') + ':00'),
      byRelevanceScore: group((b) => {
        const s = b.relevanceScore ?? project(b)?.relevance?.score;
        if (s == null) return null;
        return s >= 80 ? '80-100' : s >= 60 ? '60-79' : '<60';
      }),
    };
  }

  private groupBySkill(state: UserState, bids: BidLog[]) {
    const acc: Record<string, { bids: number; won: number; lost: number }> = {};
    for (const b of bids) {
      const p = state.projects.find((x) => x.id === b.projectId);
      const skills = b.skills || p?.jobs?.map((j) => j.name) || [];
      for (const s of skills) {
        acc[s] = acc[s] || { bids: 0, won: 0, lost: 0 };
        acc[s].bids += 1;
        if (b.outcome === 'won') acc[s].won += 1;
        if (b.outcome === 'lost') acc[s].lost += 1;
      }
    }
    return Object.entries(acc)
      .map(([key, v]) => ({ key, ...v, winRate: v.won + v.lost ? v.won / (v.won + v.lost) : null }))
      .sort((a, c) => c.bids - a.bids)
      .slice(0, 25);
  }

  /**
   * The extension reports what happened in the tab. processProject never changes the
   * status of a project it has already stored, so without this a bid that failed on
   * Freelancer stays listed as ready forever.
   */
  public recordBidOutcome(userId: string, projectId: number, outcome: 'submitted' | 'failed', reason?: string): FreelancerProject | null {
    const state = this.load(userId);
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return null;

    if (outcome === 'failed') {
      project.status = 'FAILED';
      project.skipReason = reason || 'Bid could not be placed';
      const log = state.bids.find((b) => b.projectId === projectId);
      if (log) {
        log.status = 'FAILED';
        log.errorMessage = project.skipReason;
        this.saveBid(userId, log);
      }
    } else {
      project.status = 'BID_PLACED';
      project.bidPlacedAt = Date.now();
      if (!state.bids.some((b) => b.projectId === projectId)) {
        this.pushBid(userId, state, {
          id: `bid-${Date.now()}-${projectId}`,
          projectId,
          projectTitle: project.title,
          clientUsername: project.client?.username || '',
          bidAmount: project.bidAmount || 0,
          currency: project.budget?.currency || 'USD',
          deliveryDays: project.bidPeriodDays || state.config.defaultDeliveryDays,
          proposal: project.generatedProposal || '',
          timestamp: Date.now(),
          status: 'SUCCESS',
          outcome: 'pending',
          skills: (project.jobs || []).map((j) => j.name),
          projectType: project.type,
          relevanceScore: project.relevance?.score,
        });
        state.stats.totalBidsPlaced += 1;
        this.saveStats(userId, state.stats);
      }
    }

    this.saveProject(userId, project);
    return project;
  }

  // ---------------------------------------------------------------- dashboard

  public getDashboardData(userId: string): DashboardData {
    const state = this.load(userId);
    const user = findUser(userId);
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    const bids = state.bids;
    const projects = state.projects;

    const bidsToday = bids.filter((b) => (b.timestamp || 0) >= startOfTodayMs).length;
    const scansToday = projects.filter((p) => (p.submitDate || 0) >= startOfTodayMs).length;
    const bidsThisWeek = bids.filter((b) => (b.timestamp || 0) >= oneWeekAgo).length;
    const scansThisWeek = projects.filter((p) => (p.submitDate || 0) >= oneWeekAgo).length;
    const bidsThisMonth = bids.filter((b) => (b.timestamp || 0) >= startOfMonthMs).length;
    const scansThisMonth = projects.filter((p) => (p.submitDate || 0) >= startOfMonthMs).length;
    const bidsAllTime = Math.max(state.stats.totalBidsPlaced || 0, bids.length);
    const scansAllTime = Math.max(state.stats.totalScanned || 0, projects.length);

    const intervals = [
      { label: '-24h', start: now - 24 * 3600000, end: now - 18 * 3600000 },
      { label: '-18h', start: now - 18 * 3600000, end: now - 12 * 3600000 },
      { label: '-12h', start: now - 12 * 3600000, end: now - 6 * 3600000 },
      { label: '-6h', start: now - 6 * 3600000, end: now - 1 * 3600000 },
      { label: 'Now', start: now - 1 * 3600000, end: now + 60000 },
    ];
    const activityPoints = intervals.map((int) => ({
      label: int.label,
      scans: projects.filter((p) => (p.submitDate || 0) >= int.start && (p.submitDate || 0) <= int.end).length,
      bids: bids.filter((b) => (b.timestamp || 0) >= int.start && (b.timestamp || 0) <= int.end).length,
    }));

    const totalBids24h = bids.filter((b) => (b.timestamp || 0) >= oneDayAgo).length;
    const totalScans24h = projects.filter((p) => (p.submitDate || 0) >= oneDayAgo).length;

    const recentBids = bids.slice(0, 10).map((b) => {
      const matchedProj = projects.find((p) => p.id === b.projectId);
      const skills = b.skills || matchedProj?.jobs?.map((j: any) => (typeof j === 'string' ? j : j.name)) || [];
      return {
        id: b.id,
        projectId: b.projectId,
        projectTitle: b.projectTitle || matchedProj?.title || `Freelancer Project #${b.projectId}`,
        projectUrl: matchedProj?.url || `https://www.freelancer.com/projects/${b.projectId}`,
        projectType: ((b.projectType || matchedProj?.type) === 'hourly' ? 'Hourly' : 'Fixed') as 'Fixed' | 'Hourly',
        bidAmount: b.bidAmount || 0,
        currency: b.currency || matchedProj?.budget?.currency || 'USD',
        deliveryDays: b.deliveryDays || 0,
        skills,
        timestamp: b.timestamp || Date.now(),
        status: b.status,
        reasonBadge: b.outcome ? `Outcome: ${b.outcome}` : b.status === 'SIMULATED' ? 'Dry run' : 'Submitted',
      };
    });

    const recentScans = projects.slice(0, 10).map((p) => {
      const isSkipped = p.status === 'SKIPPED';
      const isBlacklisted = p.skipReason?.includes('Excluded') || (p.matchedBlacklist && p.matchedBlacklist.length > 0);
      let eligibility: 'Ineligible' | 'Eligible' | 'Excluded by you' = 'Eligible';
      if (isSkipped) eligibility = isBlacklisted ? 'Excluded by you' : 'Ineligible';
      const skills = (p.jobs || []).map((j: any) => (typeof j === 'string' ? j : j.name));
      return {
        id: p.id,
        title: p.title,
        url: p.url || `https://www.freelancer.com/projects/${p.id}`,
        projectType: p.type === 'hourly' ? 'Hourly' : 'Fixed',
        budgetFormatted: p.budget ? `${p.budget.currency} ${p.budget.minimum} - ${p.budget.maximum}` : 'Budget Undefined',
        currency: p.budget?.currency || 'USD',
        skills,
        timestamp: p.submitDate || Date.now(),
        eligibility,
        skipReason: p.skipReason || 'Matched all configured qualification filters and skill requirements.',
      };
    });

    const trial = user ? trialInfo(user) : { trialDaysLeft: 0, trialExpired: true, trialEndsAt: 0 };

    return {
      user: {
        name: user?.name || user?.email || 'User',
        email: user?.email || '',
        trialDaysLeft: trial.trialDaysLeft,
        extensionVersion: getExtensionVersion(),
        extensionStatus: state.config.autoBidEnabled ? 'running' : 'idle',
      },
      stats: { bidsToday, scansToday, bidsThisWeek, scansThisWeek, bidsThisMonth, scansThisMonth, bidsAllTime, scansAllTime },
      comparisons: { bidsWeekChange: bidsThisWeek, scansWeekChange: scansThisWeek },
      activity24h: { points: activityPoints, totalBids24h, totalScans24h },
      recentBids,
      recentScans,
    };
  }

  // ---------------------------------------------------------------- bidding rules

  public isInsideActiveHours(fromHour = 0, toHour = 24, currentHour?: number): boolean {
    const hour = currentHour !== undefined ? currentHour : new Date().getHours();
    if (fromHour === 0 && toHour === 24) return true;
    if (fromHour < toHour) return hour >= fromHour && hour < toHour;
    if (fromHour > toHour) return hour >= fromHour || hour < toHour;
    return true;
  }

  /**
   * Whether this user may place a bid right now. Account state (suspended, trial over)
   * is checked first, then the user's own timing rules.
   */
  public canBidNow(userId: string): { allowed: boolean; reason?: string; code?: string } {
    const user = findUser(userId);
    if (!user) return { allowed: false, reason: 'Account not found', code: 'no_user' };
    const account = canUserBid(user);
    if (!account.allowed) {
      return {
        allowed: false,
        code: account.reason,
        reason:
          account.reason === 'suspended'
            ? 'Account suspended. Contact the administrator.'
            : 'Your free trial has ended. Contact the administrator to continue bidding.',
      };
    }

    const state = this.load(userId);
    const config = state.config;
    if (!config.autoBidEnabled) return { allowed: false, reason: 'AutoBid is currently paused/disabled.', code: 'paused' };

    const fromHour = config.activeHoursFrom ?? 0;
    const toHour = config.activeHoursTo ?? 24;
    if (!this.isInsideActiveHours(fromHour, toHour)) {
      return { allowed: false, code: 'outside_hours', reason: `[AUTOBID] Paused — outside configured active hours (${fromHour}:00 - ${toHour}:00).` };
    }

    const now = Date.now();
    const startOfDayMs = new Date().setHours(0, 0, 0, 0);
    const todayBids = state.bids.filter((b) => (b.timestamp || 0) >= startOfDayMs && (b.status === 'SUCCESS' || b.status === 'SIMULATED')).length;
    const maxDaily = config.maxBidsPerDay || 40;
    if (todayBids >= maxDaily) {
      return { allowed: false, code: 'daily_limit', reason: `[AUTOBID] Daily bid limit reached (${todayBids}/${maxDaily} bids placed today).` };
    }

    const delaySeconds = config.delayBetweenBidsSeconds || 0;
    if (delaySeconds > 0 && state.bids.length > 0) {
      const elapsedSeconds = (now - (state.bids[0].timestamp || 0)) / 1000;
      if (elapsedSeconds < delaySeconds) {
        return { allowed: false, code: 'cooldown', reason: `[AUTOBID] Delay cooldown in effect (${Math.ceil(delaySeconds - elapsedSeconds)}s remaining).` };
      }
    }

    return { allowed: true };
  }

  public resolveBidAmount(userId: string, project: FreelancerProject): { amount: number; deliveryDays: number; formulaSummary: string } {
    const config = this.load(userId).config;
    const min = project.budget.minimum || 15;
    const max = project.budget.maximum || 500;

    let amount = min;
    let days = config.defaultDeliveryDays || 5;
    let formulaSummary = 'No formula set — bids use the low end of the budget.';

    if (config.budgetTiersEnabled && config.budgetTiers && config.budgetTiers.length > 0) {
      const matchedTier = config.budgetTiers.find((tier) => max >= tier.minBudget && min <= tier.maxBudget);
      if (matchedTier) {
        const pct = matchedTier.bidPercentage || 85;
        amount = Math.round(max * (pct / 100));
        days = matchedTier.deliveryDays || days;
        formulaSummary = `Tier rule (${pct}% of max budget, ${days} days)`;
      }
    } else {
      switch (config.bidStrategy) {
        case 'low_end':
          amount = min;
          formulaSummary = 'Bid = Minimum Budget';
          break;
        case 'midpoint':
          amount = Math.round((min + max) / 2);
          formulaSummary = 'Bid = Midpoint of Budget';
          break;
        case 'fixed':
          amount = config.fixedBidAmount || 50;
          formulaSummary = `Bid = Fixed ${project.budget.currency} ${amount}`;
          break;
        case 'percentage_max':
        default: {
          const pct = config.bidPercentageOfMaxBudget || 85;
          amount = Math.round(max * (pct / 100));
          formulaSummary = `Bid = ${pct}% of Maximum Budget`;
          break;
        }
      }
    }

    amount = normalizeBidAmount(amount);
    amount = Math.max(min, Math.min(amount, max));
    return { amount, deliveryDays: days, formulaSummary };
  }

  public evaluateProject(userId: string, project: FreelancerProject): { qualified: boolean; reason?: string; matchedTags?: string[]; matchedBlacklist?: string[] } {
    const state = this.load(userId);
    if (state.processedProjectIds.has(project.id)) {
      return { qualified: false, reason: 'Already processed (Deduplication)' };
    }
    return sharedEvaluateProject(project, state.config);
  }

  // ---------------------------------------------------------------- pipeline

  public async processProject(userId: string, rawProject: FreelancerProject): Promise<FreelancerProject> {
    const state = this.load(userId);
    const config = state.config;

    const existing = state.projects.find((p) => p.id === rawProject.id);
    if (existing) return existing;
    if (state.processedProjectIds.has(rawProject.id)) return rawProject;

    const project = { ...rawProject };
    state.stats.totalScanned += 1;
    state.stats.lastPollTimestamp = Date.now();

    const evaluation = this.evaluateProject(userId, project);

    if (!evaluation.qualified) {
      project.status = 'SKIPPED';
      project.skipReason = evaluation.reason;
      project.matchedBlacklist = evaluation.matchedBlacklist;

      state.stats.totalSkipped += 1;
      const reason = evaluation.reason || '';
      if (reason.startsWith('Missing mandatory skills')) state.stats.skipBreakdown.missingMandatoryTags += 1;
      else if (reason.startsWith('Excluded keyword')) state.stats.skipBreakdown.blacklistedKeyword += 1;
      else if (reason.startsWith('Below minimum') || reason.startsWith('Above maximum')) state.stats.skipBreakdown.budgetOutOfRange += 1;
      else if (reason.startsWith('Client not ')) state.stats.skipBreakdown.unverifiedPayment += 1;
      else if (reason.startsWith('Client rating') || reason.startsWith('Client reviews') || /^Client \w+ below/.test(reason)) state.stats.skipBreakdown.lowRating += 1;
      else if (reason.includes('Already processed')) state.stats.skipBreakdown.alreadyProcessed += 1;

      this.markProcessed(userId, state, project.id);
      this.insertProject(userId, state, project);
      this.saveStats(userId, state.stats);
      return project;
    }

    project.matchedTags = evaluation.matchedTags;

    if (config.aiRelevanceEnabled !== false) {
      try {
        const verdict = await checkRelevance(project, { ...config, openaiApiKey: getOpenAiKey() });
        project.relevance = { eligible: verdict.eligible, score: verdict.score, reason: verdict.reason, model: verdict.model, costUSD: verdict.costUSD };
        state.stats.aiChecks = (state.stats.aiChecks || 0) + 1;
        state.stats.aiCostUSD = (state.stats.aiCostUSD || 0) + verdict.costUSD;

        if (!verdict.eligible) {
          project.status = 'SKIPPED';
          project.skipReason = `Not relevant (${verdict.score}/100): ${verdict.reason}`;
          state.stats.totalSkipped += 1;
          state.stats.skipBreakdown.notRelevant = (state.stats.skipBreakdown.notRelevant || 0) + 1;
          this.markProcessed(userId, state, project.id);
          this.insertProject(userId, state, project);
          this.saveStats(userId, state.stats);
          return project;
        }
      } catch (error: any) {
        project.status = 'SKIPPED';
        project.skipReason = `AI relevance check failed: ${error.message}`;
        state.stats.totalSkipped += 1;
        this.markProcessed(userId, state, project.id);
        this.insertProject(userId, state, project);
        this.saveStats(userId, state.stats);
        return project;
      }
    }

    state.stats.totalQualified += 1;
    project.status = 'BID_PLACED';

    const resolved = this.resolveBidAmount(userId, project);
    project.bidAmount = resolved.amount;
    project.bidPeriodDays = resolved.deliveryDays;

    const chosenModel = config.customOpenAiModel?.trim() || config.openaiModel || 'gpt-4o-mini';

    if (config.autoBidEnabled || !config.generateOnDemand) {
      try {
        const aiResult = await generateProposal({
          projectTitle: project.title,
          projectDescription: project.description,
          skills: project.jobs.map((j) => j.name),
          budget: project.budget,
          clientCountry: project.client.country,
          clientName: project.client.username,
          mySkills: config.freelancerSkills,
          portfolioLinks: config.portfolioLinks,
          ctaQuestion: config.ctaQuestion,
          customSystemPrompt: config.systemPrompt,
          customApiKey: getOpenAiKey(),
          model: chosenModel,
          useAiPricingAndDays: config.useAiPricingAndDays !== false,
        });

        project.generatedProposal = aiResult.proposal;
        project.proposalSource = aiResult.proposalSource;
        project.modelUsed = aiResult.modelUsed;
        project.pricingReasoning = aiResult.pricingReasoning;
        project.generatedAt = Date.now();
        if (aiResult.recommendedBidAmount && config.useAiPricingAndDays !== false) project.bidAmount = aiResult.recommendedBidAmount;
        if (aiResult.recommendedDeliveryDays && config.useAiPricingAndDays !== false) project.bidPeriodDays = aiResult.recommendedDeliveryDays;

        const bidGate = this.canBidNow(userId);
        if (config.autoBidEnabled && bidGate.allowed && config.dryRunMode) {
          // Dry run only. A real bid is logged when the extension reports it submitted.
          this.pushBid(userId, state, {
            id: `bid-${Date.now()}-${project.id}`,
            projectId: project.id,
            projectTitle: project.title,
            clientUsername: project.client.username,
            bidAmount: project.bidAmount,
            currency: project.budget.currency,
            deliveryDays: project.bidPeriodDays || config.defaultDeliveryDays,
            proposal: project.generatedProposal,
            timestamp: Date.now(),
            status: 'SIMULATED',
            skills: (project.jobs || []).map((j) => j.name),
            projectType: project.type,
            relevanceScore: project.relevance?.score,
          });
        } else if (config.autoBidEnabled && !bidGate.allowed) {
          console.log(`[AUTOBID GATE] ${userId.slice(0, 8)} project #${project.id}: ${bidGate.reason}`);
        }
      } catch (error: any) {
        console.error('Error generating bid for project:', project.id, error);
        project.skipReason = `AI Bid Error: ${error.message}`;
      }
    }

    this.markProcessed(userId, state, project.id);
    this.insertProject(userId, state, project);
    this.saveStats(userId, state.stats);
    return project;
  }

  public async generateProposalForProject(userId: string, projectId: number): Promise<FreelancerProject> {
    const state = this.load(userId);
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Project #${projectId} not found`);

    if (!project.url || project.url.includes('sample-job')) {
      project.url = project.id > 40000000
        ? `https://www.freelancer.com/projects/${project.id}`
        : `https://www.freelancer.com/search/projects?q=${encodeURIComponent(project.jobs?.[0]?.name || 'web development')}`;
    }

    if (project.generatedProposal && project.generatedProposal.trim() !== '') return project;

    const config = state.config;
    const chosenModel = config.customOpenAiModel?.trim() || config.openaiModel || 'gpt-4o-mini';

    const aiResult = await generateProposal({
      projectTitle: project.title,
      projectDescription: project.description,
      skills: (project.jobs || []).map((j: any) => (typeof j === 'string' ? j : j.name)),
      budget: project.budget || { minimum: 20, maximum: 250, currency: 'USD' },
      clientCountry: project.client?.country,
      clientName: project.client?.username,
      mySkills: config.freelancerSkills,
      portfolioLinks: config.portfolioLinks,
      ctaQuestion: config.ctaQuestion,
      customSystemPrompt: config.systemPrompt,
      customApiKey: getOpenAiKey(),
      model: chosenModel,
      useAiPricingAndDays: config.useAiPricingAndDays !== false,
    });

    project.generatedProposal = aiResult.proposal;
    project.proposalSource = aiResult.proposalSource;
    project.modelUsed = aiResult.modelUsed;
    project.pricingReasoning = aiResult.pricingReasoning;
    project.generatedAt = Date.now();
    project.status = 'BID_PLACED';

    if (aiResult.recommendedBidAmount) project.bidAmount = aiResult.recommendedBidAmount;
    else if (!project.bidAmount) {
      project.bidAmount = Math.max(project.budget.minimum, Math.round(project.budget.maximum * (config.bidPercentageOfMaxBudget / 100)));
    }
    if (aiResult.recommendedDeliveryDays) project.bidPeriodDays = aiResult.recommendedDeliveryDays;
    else if (!project.bidPeriodDays) project.bidPeriodDays = config.defaultDeliveryDays;

    this.insertProject(userId, state, project);
    return project;
  }

  public async purgeMockAndRefresh(userId: string, freshProjects: FreelancerProject[]) {
    for (const p of freshProjects) await this.processProject(userId, p);
  }
}

export const projectStore = new ProjectStore();
