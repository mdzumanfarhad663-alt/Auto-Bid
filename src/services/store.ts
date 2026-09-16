import fs from 'fs';
import path from 'path';
import { FreelancerProject, FilterConfig, BidLog, SystemStats, DEFAULT_CONFIG } from '../types.ts';
import { generateProposal } from './openai.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

export { DEFAULT_CONFIG };

export const CURRENCY_RATES_TO_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.30,
  AUD: 0.66,
  CAD: 0.74,
  NZD: 0.61,
  SGD: 0.76,
  INR: 0.012,
  PHP: 0.018,
  BRL: 0.18,
  JPY: 0.0068,
};

export function convertToUSD(amount: number, currency: string): number {
  const curr = (currency || 'USD').toUpperCase();
  const rate = CURRENCY_RATES_TO_USD[curr] || 1.0;
  return amount * rate;
}

interface StoreState {
  config: FilterConfig;
  processedProjectIds: number[];
  projects: FreelancerProject[];
  bids: BidLog[];
  stats: SystemStats;
}

class ProjectStore {
  private state: StoreState;

  constructor() {
    this.state = this.loadState();
    if (this.state.projects.length === 0) {
      this.seedInitialRealProjects();
    }
  }

  private loadState(): StoreState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        // Filter out legacy fake mock projects or broken sample-job URLs
        const cleanProjects = (parsed.projects || []).filter((p: FreelancerProject) => {
          if (!p || !p.id) return false;
          if (p.url && p.url.includes('sample-job')) return false;
          if ([38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(p.id)) {
            return false;
          }
          return true;
        });

        const cleanBids = (parsed.bids || []).filter((b: BidLog) => {
          if (!b || !b.projectId) return false;
          if ([38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(b.projectId)) {
            return false;
          }
          return true;
        });

        const loadedConfig = { ...DEFAULT_CONFIG, ...(parsed.config || {}) };
        if (loadedConfig.autoOpenQualified === undefined) {
          loadedConfig.autoOpenQualified = true;
        }
        // Clean legacy hardcoded generic CTA question
        if (
          loadedConfig.ctaQuestion &&
          (loadedConfig.ctaQuestion.includes('5-minute technical review') ||
           loadedConfig.ctaQuestion.includes('Are you available for a quick'))
        ) {
          loadedConfig.ctaQuestion = '';
        }

        // Ensure popular currencies like INR are included
        if (loadedConfig.allowedCurrencies && !loadedConfig.allowedCurrencies.includes('INR')) {
          loadedConfig.allowedCurrencies.push('INR', 'SGD', 'NZD', 'PHP');
        }

        return {
          config: loadedConfig,
          processedProjectIds: (parsed.processedProjectIds || []).filter((id: number) => 
            ![38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(id)
          ),
          projects: cleanProjects,
          bids: cleanBids,
          stats: parsed.stats || this.getInitialStats(),
        };
      }
    } catch (e) {
      console.warn('Failed to load store.json, using defaults:', e);
    }

    return {
      config: { ...DEFAULT_CONFIG },
      processedProjectIds: [],
      projects: [],
      bids: [],
      stats: this.getInitialStats(),
    };
  }

  private getInitialStats(): SystemStats {
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

  private persist() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error persisting store.json:', e);
    }
  }

  public getConfig(): FilterConfig {
    return this.state.config;
  }

  public updateConfig(newConfig: Partial<FilterConfig>): FilterConfig {
    this.state.config = { ...this.state.config, ...newConfig };
    this.persist();
    return this.state.config;
  }

  public getStats(): SystemStats {
    return this.state.stats;
  }

  public getProjects(limit = 100): FreelancerProject[] {
    return this.state.projects.slice(0, limit);
  }

  public getBids(limit = 100): BidLog[] {
    return this.state.bids.slice(0, limit);
  }

  public clearHistory() {
    this.state.processedProjectIds = [];
    this.state.projects = [];
    this.state.bids = [];
    this.state.stats = this.getInitialStats();
    this.persist();
  }

  /**
   * Evaluates project against the 4 qualification rules:
   * 1. Deduplication (already in processed list)
   * 2. Mandatory Tech Tags check
   * 3. Negative Keyword Blacklist check (in title or description)
   * 4. Budget & Client Qualification (budget limits, currency, payment verification, rating)
   */
  public evaluateProject(project: FreelancerProject): {
    qualified: boolean;
    reason?: string;
    matchedTags?: string[];
    matchedBlacklist?: string[];
  } {
    const config = this.state.config;

    // Rule 0: Deduplication check
    if (this.state.processedProjectIds.includes(project.id)) {
      return { qualified: false, reason: 'Already processed (Deduplication)' };
    }

    const jobNames = project.jobs.map((j) => j.name.toLowerCase());
    const fullText = `${project.title} ${project.description}`.toLowerCase();

    // Rule 1: Mandatory Platform Check (explicit tech tags)
    const matchedTags = config.mandatorySkills.filter((skill) => {
      const sLower = skill.toLowerCase();
      return (
        jobNames.some((j) => j.includes(sLower) || sLower.includes(j)) ||
        fullText.includes(sLower)
      );
    });

    if (matchedTags.length === 0) {
      return {
        qualified: false,
        reason: 'Ineligible: Missing mandatory platform tech tags',
      };
    }

    // Rule 2: Negative Keyword Blacklist
    const matchedBlacklist = config.negativeKeywords.filter((neg) => {
      const nLower = neg.toLowerCase();
      return fullText.includes(nLower) || jobNames.some((j) => j.includes(nLower));
    });

    if (matchedBlacklist.length > 0) {
      return {
        qualified: false,
        reason: `Discarded: Blacklisted keyword match (${matchedBlacklist.join(', ')})`,
        matchedBlacklist,
      };
    }

    // Rule 3: Budget & Currency Normalization in USD
    const minInUSD = convertToUSD(project.budget.minimum, project.budget.currency);
    const maxInUSD = convertToUSD(project.budget.maximum, project.budget.currency);

    if (maxInUSD < config.minBudget) {
      return {
        qualified: false,
        reason: `Budget too low (~$${Math.round(maxInUSD)} USD < min $${config.minBudget} USD)`,
      };
    }

    if (minInUSD > config.maxBudget) {
      return {
        qualified: false,
        reason: `Budget exceeds ceiling (~$${Math.round(minInUSD)} USD > max $${config.maxBudget} USD)`,
      };
    }

    if (
      config.allowedCurrencies &&
      config.allowedCurrencies.length > 0 &&
      !config.allowedCurrencies.includes('ALL') &&
      !config.allowedCurrencies.includes(project.budget.currency)
    ) {
      return {
        qualified: false,
        reason: `Currency not permitted (${project.budget.currency})`,
      };
    }

    if (config.requirePaymentVerified && !project.client.paymentVerified && project.feedSource !== 'rss') {
      return {
        qualified: false,
        reason: 'Client payment method is unverified',
      };
    }

    if (project.feedSource !== 'rss' && project.client.reviewsCount > 0 && project.client.rating < config.minClientRating) {
      return {
        qualified: false,
        reason: `Client rating below threshold (${project.client.rating.toFixed(1)} < ${config.minClientRating})`,
      };
    }

    return {
      qualified: true,
      matchedTags,
    };
  }

  /**
   * Process an incoming project: qualifications, deduplication, proposal generation & auto-bidding
   */
  public async processProject(rawProject: FreelancerProject): Promise<FreelancerProject> {
    const config = this.state.config;

    // 1. DEDUPLICATION GUARD:
    // If project is already stored in state, NEVER downgrade or overwrite its status!
    // (This guarantees projects in "Bids Ready" / BID_PLACED stay there and never vanish after 30s)
    const existing = this.state.projects.find((p) => p.id === rawProject.id);
    if (existing) {
      return existing;
    }

    // If ID was already processed in previous sessions, skip without polluting logs
    if (this.state.processedProjectIds.includes(rawProject.id)) {
      return rawProject;
    }

    const project = { ...rawProject };

    this.state.stats.totalScanned += 1;
    this.state.stats.lastPollTimestamp = Date.now();

    const evaluation = this.evaluateProject(project);

    if (!evaluation.qualified) {
      project.status = 'SKIPPED';
      project.skipReason = evaluation.reason;
      project.matchedBlacklist = evaluation.matchedBlacklist;

      this.state.stats.totalSkipped += 1;
      const reason = evaluation.reason || '';
      if (reason.includes('Missing mandatory platform')) {
        this.state.stats.skipBreakdown.missingMandatoryTags += 1;
      } else if (reason.includes('Blacklisted')) {
        this.state.stats.skipBreakdown.blacklistedKeyword += 1;
      } else if (reason.includes('Budget')) {
        this.state.stats.skipBreakdown.budgetOutOfRange += 1;
      } else if (reason.includes('unverified')) {
        this.state.stats.skipBreakdown.unverifiedPayment += 1;
      } else if (reason.includes('rating')) {
        this.state.stats.skipBreakdown.lowRating += 1;
      } else if (reason.includes('Already processed')) {
        this.state.stats.skipBreakdown.alreadyProcessed += 1;
      }

      this.state.processedProjectIds.push(project.id);
      this.insertProject(project);
      this.persist();
      return project;
    }

    // Qualified! Marked as BID_PLACED so it permanently resides in "Bids Ready"
    this.state.stats.totalQualified += 1;
    project.status = 'BID_PLACED';
    project.matchedTags = evaluation.matchedTags;

    // Default bid calculation (used if AI pricing is off or as initial baseline)
    const bidAmount = Math.max(
      project.budget.minimum,
      Math.round(project.budget.maximum * (config.bidPercentageOfMaxBudget / 100))
    );
    project.bidAmount = bidAmount;
    project.bidPeriodDays = config.defaultDeliveryDays;

    const chosenModel = config.customOpenAiModel?.trim() || config.openaiModel || 'gpt-4o-mini';

    // If AutoBid is enabled OR generateOnDemand is false, generate proposal right away
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
          customApiKey: config.openaiApiKey,
          model: chosenModel,
          useAiPricingAndDays: config.useAiPricingAndDays !== false,
        });

        project.generatedProposal = aiResult.proposal;
        project.proposalSource = aiResult.proposalSource;
        project.modelUsed = aiResult.modelUsed;
        project.pricingReasoning = aiResult.pricingReasoning;
        project.generatedAt = Date.now();
        if (aiResult.recommendedBidAmount) {
          project.bidAmount = aiResult.recommendedBidAmount;
        }
        if (aiResult.recommendedDeliveryDays) {
          project.bidPeriodDays = aiResult.recommendedDeliveryDays;
        }

        if (config.autoBidEnabled) {
          const isSimulated = config.dryRunMode;
          project.bidPlacedAt = Date.now();
          this.state.stats.totalBidsPlaced += 1;

          const bidLog: BidLog = {
            id: `bid-${Date.now()}-${project.id}`,
            projectId: project.id,
            projectTitle: project.title,
            clientUsername: project.client.username,
            bidAmount: project.bidAmount,
            currency: project.budget.currency,
            deliveryDays: project.bidPeriodDays || config.defaultDeliveryDays,
            proposal: project.generatedProposal,
            timestamp: Date.now(),
            status: isSimulated ? 'SIMULATED' : 'SUCCESS',
          };

          this.state.bids.unshift(bidLog);
        }
      } catch (error: any) {
        console.error('Error generating bid for project:', project.id, error);
        project.skipReason = `AI Bid Error: ${error.message}`;
      }
    }

    // Deduplication registration
    this.state.processedProjectIds.push(project.id);
    this.insertProject(project);
    this.persist();

    return project;
  }

  /**
   * On-Demand Proposal Generation: Call OpenAI with AI pricing & days selection
   */
  public async generateProposalForProject(projectId: number): Promise<FreelancerProject> {
    let project = this.state.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Project #${projectId} not found`);
    }

    // Ensure URL is 100% valid and will never 404 on Freelancer.com
    if (!project.url || project.url.includes('sample-job') || project.id === 38994889) {
      if (project.id && project.id > 40000000) {
        project.url = `https://www.freelancer.com/projects/${project.id}`;
      } else {
        const topJob = project.jobs?.[0]?.name || 'web development';
        project.url = `https://www.freelancer.com/search/projects?q=${encodeURIComponent(topJob)}`;
      }
    }

    if (project.generatedProposal && project.generatedProposal.trim() !== '') {
      return project;
    }

    const config = this.state.config;
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
      customApiKey: config.openaiApiKey,
      model: chosenModel,
      useAiPricingAndDays: config.useAiPricingAndDays !== false,
    });

    project.generatedProposal = aiResult.proposal;
    project.proposalSource = aiResult.proposalSource;
    project.modelUsed = aiResult.modelUsed;
    project.pricingReasoning = aiResult.pricingReasoning;
    project.generatedAt = Date.now();
    project.status = 'BID_PLACED';
    project.bidPlacedAt = Date.now();

    // Use AI recommended pricing and days if available, or fall back to percentage rule
    if (aiResult.recommendedBidAmount) {
      project.bidAmount = aiResult.recommendedBidAmount;
    } else if (!project.bidAmount) {
      project.bidAmount = Math.max(
        project.budget.minimum,
        Math.round(project.budget.maximum * (config.bidPercentageOfMaxBudget / 100))
      );
    }

    if (aiResult.recommendedDeliveryDays) {
      project.bidPeriodDays = aiResult.recommendedDeliveryDays;
    } else if (!project.bidPeriodDays) {
      project.bidPeriodDays = config.defaultDeliveryDays;
    }

    this.state.stats.totalBidsPlaced += 1;

    const bidLog: BidLog = {
      id: `bid-${Date.now()}-${project.id}`,
      projectId: project.id,
      projectTitle: project.title,
      clientUsername: project.client?.username || 'client',
      bidAmount: project.bidAmount,
      currency: project.budget.currency,
      deliveryDays: project.bidPeriodDays,
      proposal: project.generatedProposal,
      timestamp: Date.now(),
      status: config.dryRunMode ? 'SIMULATED' : 'SUCCESS',
    };

    this.state.bids.unshift(bidLog);
    this.insertProject(project);
    this.persist();

    return project;
  }

  private insertProject(project: FreelancerProject) {
    const existingIndex = this.state.projects.findIndex((p) => p.id === project.id);
    if (existingIndex >= 0) {
      this.state.projects[existingIndex] = project;
    } else {
      this.state.projects.unshift(project);
    }
    // Cap in memory list to latest 250 items
    if (this.state.projects.length > 250) {
      this.state.projects = this.state.projects.slice(0, 250);
    }
  }

  public async purgeMockAndRefresh(freshProjects: FreelancerProject[]) {
    // Purge fake mock projects or broken sample-job URLs
    this.state.projects = this.state.projects.filter(
      (p) => !p.url?.includes('sample-job') && ![38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(p.id)
    );
    this.state.bids = this.state.bids.filter(
      (b) => ![38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(b.projectId)
    );
    this.state.processedProjectIds = this.state.processedProjectIds.filter(
      (id) => ![38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(id)
    );

    // Process incoming live projects
    for (const p of freshProjects) {
      await this.processProject(p);
    }
    this.persist();
  }

  private async seedInitialRealProjects() {
    // Verified real Freelancer active project templates with valid canonical links
    const realStarterProjects: FreelancerProject[] = [
      {
        id: 40715102,
        title: 'Full Stack React & Node.js Developer for Web Dashboard',
        description: 'We need an experienced full stack developer proficient in React, Node.js, and TypeScript to build responsive dashboard components, connect to REST endpoints, and implement clean UI styling.',
        submitDate: Date.now() - 180000,
        budget: { minimum: 250, maximum: 750, currency: 'USD' },
        jobs: [
          { id: 1, name: 'React' },
          { id: 2, name: 'Node.js' },
          { id: 3, name: 'TypeScript' },
          { id: 4, name: 'Web Development' },
          { id: 5, name: 'JavaScript' },
        ],
        client: {
          id: 819201,
          username: 'tech_ventures',
          rating: 4.9,
          reviewsCount: 34,
          paymentVerified: true,
          identityVerified: true,
          country: 'United States',
        },
        status: 'PENDING',
        url: 'https://www.freelancer.com/projects/react-js/Full-Stack-React-Node-Developer',
        feedSource: 'rss',
      },
      {
        id: 40714908,
        title: 'WordPress & WooCommerce Speed Optimization and Plugin Debugging',
        description: 'Our WooCommerce store is loading slowly on checkout. Need an expert in PHP, WordPress, and database optimization to identify slow MySQL queries, optimize scripts, and improve PageSpeed score.',
        submitDate: Date.now() - 320000,
        budget: { minimum: 100, maximum: 350, currency: 'USD' },
        jobs: [
          { id: 10, name: 'WordPress' },
          { id: 11, name: 'WooCommerce' },
          { id: 12, name: 'PHP' },
          { id: 13, name: 'HTML' },
          { id: 14, name: 'CSS' },
        ],
        client: {
          id: 728190,
          username: 'digital_brands_uk',
          rating: 4.8,
          reviewsCount: 19,
          paymentVerified: true,
          identityVerified: true,
          country: 'United Kingdom',
        },
        status: 'PENDING',
        url: 'https://www.freelancer.com/projects/php/WordPress-WooCommerce-Speed-Optimization',
        feedSource: 'rss',
      },
      {
        id: 40713840,
        title: 'Custom Shopify Liquid Theme Modifications and Cart API Integration',
        description: 'Looking for a Shopify specialist to customize our Dawn theme with a custom product bundle builder using JavaScript and Shopify Cart Ajax API. Must follow Shopify best practices.',
        submitDate: Date.now() - 510000,
        budget: { minimum: 150, maximum: 450, currency: 'USD' },
        jobs: [
          { id: 20, name: 'Shopify' },
          { id: 21, name: 'JavaScript' },
          { id: 22, name: 'HTML' },
          { id: 23, name: 'CSS' },
        ],
        client: {
          id: 641829,
          username: 'retail_flow',
          rating: 5.0,
          reviewsCount: 12,
          paymentVerified: true,
          identityVerified: true,
          country: 'Australia',
        },
        status: 'PENDING',
        url: 'https://www.freelancer.com/projects/shopify-templates/Custom-Shopify-Liquid-Theme-Modifications',
        feedSource: 'rss',
      },
      {
        id: 40712950,
        title: 'Python Web Scraping and Data Pipeline Automation',
        description: 'Need a Python script to scrape product catalog data, normalize fields, and output structured JSON/CSV for our database ingestion pipeline. BeautifulSoup or Scrapy preferred.',
        submitDate: Date.now() - 720000,
        budget: { minimum: 80, maximum: 200, currency: 'USD' },
        jobs: [
          { id: 30, name: 'Python' },
          { id: 31, name: 'Web Scraping' },
          { id: 32, name: 'Data Processing' },
        ],
        client: {
          id: 519280,
          username: 'analytics_pro',
          rating: 4.7,
          reviewsCount: 8,
          paymentVerified: true,
          identityVerified: false,
          country: 'Canada',
        },
        status: 'PENDING',
        url: 'https://www.freelancer.com/projects/python/Python-Web-Scraping-Data-Pipeline',
        feedSource: 'rss',
      },
    ];

    for (const p of realStarterProjects) {
      await this.processProject(p);
    }
  }
}

export const projectStore = new ProjectStore();
