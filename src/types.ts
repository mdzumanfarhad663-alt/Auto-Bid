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
  openaiModel: string;
  bidPercentageOfMaxBudget: number; // e.g. 85% of client max budget
  defaultDeliveryDays: number;
}

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
