import fs from 'fs';
import path from 'path';
import { FreelancerProject, FilterConfig, BidLog, SystemStats, DEFAULT_CONFIG } from '../types.ts';
import { generateProposal } from './openai.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

export { DEFAULT_CONFIG };

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
      this.seedInitialProjects();
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
        return {
          config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
          processedProjectIds: parsed.processedProjectIds || [],
          projects: parsed.projects || [],
          bids: parsed.bids || [],
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
      return jobNames.some((j) => j.includes(sLower)) || fullText.includes(sLower);
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

    // Rule 3: Budget & Client Qualification
    if (project.budget.maximum < config.minBudget) {
      return {
        qualified: false,
        reason: `Budget too low (${project.budget.maximum} < min ${config.minBudget} ${project.budget.currency})`,
      };
    }

    if (project.budget.minimum > config.maxBudget) {
      return {
        qualified: false,
        reason: `Budget exceeds ceiling (${project.budget.minimum} > max ${config.maxBudget} ${project.budget.currency})`,
      };
    }

    if (config.allowedCurrencies.length > 0 && !config.allowedCurrencies.includes(project.budget.currency)) {
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

      this.insertProject(project);
      this.persist();
      return project;
    }

    // Qualified!
    this.state.stats.totalQualified += 1;
    project.status = 'QUALIFIED';
    project.matchedTags = evaluation.matchedTags;

    // Calculate smart bid amount based on percentage of client maximum budget
    const bidAmount = Math.max(
      project.budget.minimum,
      Math.round(project.budget.maximum * (config.bidPercentageOfMaxBudget / 100))
    );
    project.bidAmount = bidAmount;
    project.bidPeriodDays = config.defaultDeliveryDays;

    // Generate Proposal using gpt-4o-mini
    try {
      const aiResult = await generateProposal({
        projectTitle: project.title,
        projectDescription: project.description,
        skills: project.jobs.map((j) => j.name),
        budget: project.budget,
        clientCountry: project.client.country,
        mySkills: config.freelancerSkills,
        portfolioLinks: config.portfolioLinks,
        ctaQuestion: config.ctaQuestion,
        customSystemPrompt: config.systemPrompt,
        model: config.openaiModel,
      });

      project.generatedProposal = aiResult.proposal;

      // Auto-submit bid if enabled
      if (config.autoBidEnabled) {
        const isSimulated = config.dryRunMode;
        project.status = 'BID_PLACED';
        project.bidPlacedAt = Date.now();
        this.state.stats.totalBidsPlaced += 1;

        const bidLog: BidLog = {
          id: `bid-${Date.now()}-${project.id}`,
          projectId: project.id,
          projectTitle: project.title,
          clientUsername: project.client.username,
          bidAmount: bidAmount,
          currency: project.budget.currency,
          deliveryDays: config.defaultDeliveryDays,
          proposal: project.generatedProposal,
          timestamp: Date.now(),
          status: isSimulated ? 'SIMULATED' : 'SUCCESS',
        };

        this.state.bids.unshift(bidLog);
      }
    } catch (error: any) {
      console.error('Error generating bid for project:', project.id, error);
      project.status = 'FAILED';
      project.skipReason = `AI Bid Error: ${error.message}`;
    }

    // Deduplication registration
    this.state.processedProjectIds.push(project.id);
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

  private seedInitialProjects() {
    const sampleProjects: FreelancerProject[] = [
      {
        id: 38920141,
        title: 'Fix WooCommerce checkout slow loading and Stripe payment webhook error',
        description: 'We run a high-volume WordPress WooCommerce store and since updating to WP 6.5 the checkout page takes over 8 seconds to load. Furthermore, Stripe webhooks are intermittently failing with a 500 error. Need an experienced PHP & WooCommerce specialist to debug and resolve this today.',
        submitDate: Date.now() - 120000,
        budget: { minimum: 150, maximum: 400, currency: 'USD' },
        jobs: [
          { id: 1, name: 'WordPress' },
          { id: 2, name: 'PHP' },
          { id: 3, name: 'WooCommerce' },
          { id: 4, name: 'Stripe' },
          { id: 5, name: 'HTML' },
        ],
        client: {
          id: 991204,
          username: 'ecom_austin',
          rating: 4.9,
          reviewsCount: 28,
          paymentVerified: true,
          identityVerified: true,
          country: 'United States',
        },
        status: 'BID_PLACED',
        matchedTags: ['WordPress', 'PHP', 'HTML'],
        bidAmount: 340,
        bidPeriodDays: 2,
        bidPlacedAt: Date.now() - 95000,
        generatedProposal: `I reviewed your checkout latency and Stripe webhook issue. Checkout delays in WooCommerce 6.5+ are typically triggered by unindexed wp_options autoload bloat, synchronous session lockouts on order creation, or unhandled transients blocking the REST webhook worker.

I specialize in high-throughput WordPress/PHP architecture. I will inspect your MySQL query locks, run Query Monitor profiles, and trace the Stripe webhook endpoint to guarantee sub-1.5s checkout flow without transaction drops.

Portfolio references: https://github.com/my-profile | https://myportfolio.dev

Do you have server error logs and staging access ready so I can trace the Stripe 500 payload right now?`,
      },
      {
        id: 38920142,
        title: 'Build automated CRM for real estate agents with cold email marketing campaign',
        description: 'Need someone to manage our real estate marketing CRM and send out 50,000 cold emails a week. Must have experience with lead scraping, cold outreach, and sales closing.',
        submitDate: Date.now() - 240000,
        budget: { minimum: 500, maximum: 1200, currency: 'USD' },
        jobs: [
          { id: 10, name: 'CRM' },
          { id: 11, name: 'Email Marketing' },
          { id: 12, name: 'Lead Generation' },
        ],
        client: {
          id: 882190,
          username: 'prime_realty',
          rating: 4.6,
          reviewsCount: 14,
          paymentVerified: true,
          identityVerified: false,
          country: 'Canada',
        },
        status: 'SKIPPED',
        skipReason: 'Discarded: Blacklisted keyword match (CRM, Marketing)',
        matchedBlacklist: ['CRM', 'Marketing'],
      },
      {
        id: 38920143,
        title: 'Custom Shopify Liquid theme section for bundle builder with discount logic',
        description: 'Looking for a skilled Shopify developer to write a custom Liquid and vanilla JavaScript product bundle section for our Dawn 14.0 theme. Users should be able to pick 3 items and automatically receive a tiered 20% discount via Shopify Cart API.',
        submitDate: Date.now() - 360000,
        budget: { minimum: 250, maximum: 600, currency: 'USD' },
        jobs: [
          { id: 20, name: 'Shopify' },
          { id: 21, name: 'Shopify Templates' },
          { id: 22, name: 'JavaScript' },
          { id: 23, name: 'CSS' },
        ],
        client: {
          id: 771239,
          username: 'nordic_apparel',
          rating: 5.0,
          reviewsCount: 42,
          paymentVerified: true,
          identityVerified: true,
          country: 'United Kingdom',
        },
        status: 'BID_PLACED',
        matchedTags: ['Shopify', 'JavaScript', 'CSS'],
        bidAmount: 510,
        bidPeriodDays: 3,
        bidPlacedAt: Date.now() - 310000,
        generatedProposal: `I analyzed your Dawn 14.0 bundle builder requirement. The cleanest way to handle tiered bundle discounts without third-party app slowdowns is combining native Liquid section schema with Shopify Cart Ajax API and line-item properties, utilizing Shopify Functions or automatic discount rules.

I build clean, lightweight Shopify themes with zero dependencies and 100/100 Lighthouse performance.

Portfolio references: https://github.com/my-profile | https://myportfolio.dev

Are your products using separate variants for the bundle, or should the custom section bundle existing standalone SKUs dynamically?`,
      },
      {
        id: 38920144,
        title: 'Urgent: I need someone to write my college essay on microeconomics',
        description: 'Need a 2000 word academic paper on supply and demand in developing nations. Must be 0% AI and passed Turnitin check.',
        submitDate: Date.now() - 480000,
        budget: { minimum: 30, maximum: 45, currency: 'USD' },
        jobs: [
          { id: 30, name: 'Academic Writing' },
          { id: 31, name: 'Research' },
        ],
        client: {
          id: 661201,
          username: 'student_92',
          rating: 0,
          reviewsCount: 0,
          paymentVerified: false,
          identityVerified: false,
          country: 'Australia',
        },
        status: 'SKIPPED',
        skipReason: 'Ineligible: Missing mandatory platform tech tags',
      },
      {
        id: 38920145,
        title: 'Full Stack React & Node.js Developer to build real-time dashboard with WebSockets',
        description: 'We need a senior React, TypeScript, and Node.js engineer to build a high-frequency telemetry dashboard. It streams data from IoT sensors via WebSockets, renders live line charts, and manages user auth with JWT tokens.',
        submitDate: Date.now() - 600000,
        budget: { minimum: 800, maximum: 2000, currency: 'USD' },
        jobs: [
          { id: 40, name: 'React.js' },
          { id: 41, name: 'Node.js' },
          { id: 42, name: 'JavaScript' },
          { id: 43, name: 'TypeScript' },
          { id: 44, name: 'WebSockets' },
        ],
        client: {
          id: 551029,
          username: 'iot_analytics_corp',
          rating: 4.8,
          reviewsCount: 19,
          paymentVerified: true,
          identityVerified: true,
          country: 'Germany',
        },
        status: 'BID_PLACED',
        matchedTags: ['React', 'Node.js', 'JavaScript'],
        bidAmount: 1700,
        bidPeriodDays: 7,
        bidPlacedAt: Date.now() - 540000,
        generatedProposal: `I reviewed your IoT telemetry dashboard specs. The primary challenge with high-frequency WebSocket streams in React is preventing render thrashing; I solve this by offloading stream ingestion to Web Workers or RxJS buffers and rendering charts via Canvas or optimized WebGL layers.

With extensive production experience building full-stack Node.js and TypeScript architectures, I will deliver a resilient WebSocket reconnection lifecycle, secure JWT authentication, and responsive UI.

Portfolio references: https://github.com/my-profile | https://myportfolio.dev

What is the expected message frequency per second, and do you have a defined JSON schema for the IoT sensor payloads?`,
      },
    ];

    sampleProjects.forEach((p) => {
      this.state.processedProjectIds.push(p.id);
      this.state.projects.push(p);
      this.state.stats.totalScanned += 1;
      if (p.status === 'BID_PLACED') {
        this.state.stats.totalQualified += 1;
        this.state.stats.totalBidsPlaced += 1;
        this.state.bids.push({
          id: `bid-${p.id}`,
          projectId: p.id,
          projectTitle: p.title,
          clientUsername: p.client.username,
          bidAmount: p.bidAmount || 300,
          currency: p.budget.currency,
          deliveryDays: p.bidPeriodDays || 3,
          proposal: p.generatedProposal || '',
          timestamp: p.bidPlacedAt || Date.now(),
          status: 'SIMULATED',
        });
      } else {
        this.state.stats.totalSkipped += 1;
        if (p.skipReason?.includes('Missing')) {
          this.state.stats.skipBreakdown.missingMandatoryTags += 1;
        } else if (p.skipReason?.includes('Blacklisted')) {
          this.state.stats.skipBreakdown.blacklistedKeyword += 1;
        }
      }
    });

    this.persist();
  }
}

export const projectStore = new ProjectStore();
