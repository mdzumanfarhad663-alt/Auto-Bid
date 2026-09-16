export interface FreelancerProject {
  id: number;
  title: string;
  description: string;
  submitDate: number;
  budget: {
    minimum: number;
    maximum: number;
    currency: string;
  };
  jobs: Array<{ id: number; name: string }>;
  client: {
    id: number;
    username: string;
    rating: number;
    reviewsCount: number;
    paymentVerified: boolean;
    identityVerified: boolean;
    country: string;
  };
  status: 'PENDING' | 'QUALIFIED' | 'SKIPPED' | 'BID_PLACED' | 'FAILED';
  skipReason?: string;
  matchedTags?: string[];
  matchedBlacklist?: string[];
  generatedProposal?: string;
  bidAmount?: number;
  bidPeriodDays?: number;
  bidPlacedAt?: number;
  url?: string;
  feedSource?: 'rss' | 'public_api' | 'direct';
}

export interface FilterConfig {
  autoBidEnabled: boolean;
  dryRunMode: boolean; // Dry-run / simulation mode doesn't deduct real bids
  pollIntervalSeconds: number; // e.g. 30 or 60
  feedSource: 'auto' | 'rss' | 'public_api';
  desktopNotifications: boolean;
  audioAlerts: boolean;
  mandatorySkills: string[];
  negativeKeywords: string[];
  minBudget: number;
  maxBudget: number;
  allowedCurrencies: string[];
  requirePaymentVerified: boolean;
  minClientRating: number;
  minClientReviews: number;
  freelancerSkills: string[];
  portfolioLinks: string[];
  ctaQuestion: string;
  systemPrompt: string;
  openaiApiKey?: string;
  openaiModel: string;
  generateOnDemand: boolean; // Generate proposal only when clicking 1-Click Apply to save tokens
  bidPercentageOfMaxBudget: number; // e.g. 85% of client max budget
  defaultDeliveryDays: number;
}

export const DEFAULT_CONFIG: FilterConfig = {
  autoBidEnabled: true,
  dryRunMode: true, // safe default: simulated bids until live token confirmed
  pollIntervalSeconds: 30, // Default 30s or 60s
  feedSource: 'auto', // 'auto' | 'rss' | 'public_api' - 100% No OAuth required!
  desktopNotifications: true,
  audioAlerts: true,
  mandatorySkills: [
    'WordPress',
    'Shopify',
    'PHP',
    'HTML',
    'CSS',
    'JavaScript',
    'React',
    'Node.js',
    'Next.js',
    'Python',
    'Web Development',
    'Full Stack Development',
    'SEO',
    'Data Entry'
  ],
  negativeKeywords: ['Casino', 'Betting', 'Academic', 'Essay', 'Adult', 'Crypto Trading Bot'],
  minBudget: 15,
  maxBudget: 5000,
  allowedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR', 'SGD', 'NZD', 'PHP', 'ALL'],
  requirePaymentVerified: false, // Default false so public live feeds are not blocked
  minClientRating: 4.0,
  minClientReviews: 0,
  freelancerSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'WordPress', 'Shopify', 'TailwindCSS', 'REST APIs', 'PHP', 'Python'],
  portfolioLinks: ['https://github.com/my-profile', 'https://myportfolio.dev'],
  ctaQuestion: 'Are you available for a quick 5-minute technical review call to confirm the timeline?',
  systemPrompt: `You are an elite top-rated freelancer drafting a winning bid on Freelancer.com.
RULES:
1. Strict limit: UNDER 140 WORDS.
2. Directly identify and address the client's exact problem in sentence #1. No generic greetings.
3. Reference relevant skills: {skills}.
4. Provide portfolio proof: {portfolio_links}.
5. End with this technical question: "{cta_question}"`,
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  generateOnDemand: true, // Saves OpenAI tokens by generating only when applying!
  bidPercentageOfMaxBudget: 85,
  defaultDeliveryDays: 5,
};

export interface BidLog {
  id: string;
  projectId: number;
  projectTitle: string;
  clientUsername: string;
  bidAmount: number;
  currency: string;
  deliveryDays: number;
  proposal: string;
  timestamp: number;
  status: 'SUCCESS' | 'SIMULATED' | 'REJECTED' | 'FAILED';
  errorMessage?: string;
}

export interface SystemStats {
  totalScanned: number;
  totalQualified: number;
  totalBidsPlaced: number;
  totalSkipped: number;
  lastPollTimestamp: number;
  skipBreakdown: {
    missingMandatoryTags: number;
    blacklistedKeyword: number;
    budgetOutOfRange: number;
    unverifiedPayment: number;
    lowRating: number;
    alreadyProcessed: number;
  };
}

export interface ExtensionFileExport {
  name: string;
  path: string;
  description: string;
  content: string;
  language: string;
}
