export type ClientVerificationKey =
  | 'payment_verified'
  | 'identity_verified'
  | 'deposit_made'
  | 'email_verified'
  | 'profile_complete'
  | 'phone_verified'
  | 'custom_charge_verified'
  | 'freelancer_verified_user';

export type CategoryRatingKey = 'clarity_spec' | 'communication' | 'payment_prom' | 'professionalism' | 'hire_again';

export type ListingTypeKey =
  | 'featured'
  | 'sealed'
  | 'nda'
  | 'urgent'
  | 'recruiter'
  | 'ipContract'
  | 'premium'
  | 'enterprise'
  | 'pfOnly'
  | 'nonCompete';

export interface FreelancerProject {
  id: number;
  title: string;
  description: string;
  submitDate: number;
  type?: 'fixed' | 'hourly';
  bidPeriod?: number | null;
  language?: string | null;
  seoUrl?: string | null;
  budget: {
    minimum: number;
    maximum: number;
    currency: string;
  };
  jobs: Array<{ id: number; name: string }>;
  bidCount?: number;
  bidAvg?: number;
  upgrades?: Record<ListingTypeKey | 'nonpublic', boolean>;
  alreadyBid?: boolean;
  clientDataAvailable?: boolean;
  client: {
    id: number;
    username: string;
    rating: number;
    reviewsCount: number;
    completionRate?: number | null;
    categoryRatings?: Record<CategoryRatingKey, number> | null;
    verifications?: Record<ClientVerificationKey, boolean> | null;
    paymentVerified: boolean;
    identityVerified: boolean;
    country: string;
    registrationDate?: number | null;
  };
  status: 'PENDING' | 'QUALIFIED' | 'SKIPPED' | 'BID_PLACED' | 'FAILED';
  skipReason?: string;
  matchedTags?: string[];
  matchedBlacklist?: string[];
  generatedProposal?: string;
  proposalSource?: 'openai' | 'gemini' | 'template';
  modelUsed?: string;
  pricingReasoning?: string;
  generatedAt?: number;
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
  minMatchingSkills: number; // Minimum number of mandatory skills that must match (default 1)
  blockedSkills: string[]; // A project carrying any of these skills is never bid on
  negativeKeywords: string[];
  blockedCountries: string[]; // Block projects from specific client countries (e.g. ['India', 'Pakistan'])
  allowedLanguages: string[]; // Allowed project languages (e.g. ['English', 'ALL'])
  blockedCategories: string[]; // Blacklisted project categories/jobs
  allowedListingTypes: ListingTypeKey[]; // A project flagged with a type not in this list is skipped
  maxProjectAgeHours: number; // 0 disables
  maxExistingBids: number; // Skip once a project has this many bids; 0 ignores competition
  minBudget: number; // Fixed-price range, USD; 0 disables
  maxBudget: number;
  minBudgetHourly: number; // Hourly-rate range, USD per hour; 0 disables
  maxBudgetHourly: number;
  allowedCurrencies: string[];
  requirePaymentVerified: boolean; // Legacy shorthand for requiredClientVerifications including payment_verified
  requiredClientVerifications: ClientVerificationKey[]; // Client must have every one of these
  minClientRating: number;
  minClientCategoryRatings: Partial<Record<CategoryRatingKey, number>>; // 0 or absent skips none
  minClientReviews: number;
  freelancerSkills: string[];
  portfolioLinks: string[];
  ctaQuestion: string;
  systemPrompt: string;
  openaiApiKey?: string;
  openaiModel: string;
  customOpenAiModel?: string; // Free-form custom model string (e.g. gpt-5.5, gpt-5.6, sol)
  generateOnDemand: boolean; // Generate proposal only when clicking 1-Click Apply to save tokens
  bidPercentageOfMaxBudget: number; // e.g. 85% of client max budget
  defaultDeliveryDays: number;
  useAiPricingAndDays: boolean; // Use OpenAI API to analyze scope & choose optimal budget & delivery days
  bidStrategy: 'low_end' | 'percentage_max' | 'midpoint' | 'custom_formula' | 'fixed';
  bidAmountFormula?: string;
  fixedBidAmount?: number;
  budgetTiersEnabled: boolean;
  budgetTiers: Array<{
    id: string;
    minBudget: number;
    maxBudget: number;
    bidPercentage: number;
    deliveryDays: number;
  }>;
  delayBetweenBidsSeconds: number; // Minimum delay between consecutive bids (e.g. 0s)
  maxBidsPerDay: number; // Maximum successful auto-bids per day (e.g. 40)
  activeHoursFrom: number; // 0 to 23 (24h format)
  activeHoursTo: number; // 1 to 24 (24h format)
  autoPostClarification: boolean; // Auto-post questions to project Clarification Board (never private chat)
  allowFreeSealedUpgrade: boolean; // Take Sealed upgrade only when price is confirmed $0 / Free
  allowFreeNdaUpgrade: boolean; // Take NDA upgrade only when price is confirmed $0 / Free
  handsFreeAutoSubmit: boolean; // Automatically click Freelancer.com 'Place Bid' button via extension
  autoSubmitDelaySeconds: number; // Countdown seconds before auto-clicking (e.g. 2s)
  autoOpenQualified: boolean; // Autonomously open and submit qualified projects as they arrive
  autoCloseTabOnSuccess: boolean; // Automatically close project tab after bid is successfully submitted
  autoCloseDelaySeconds: number; // Delay before closing successful project tab (10s)
  closeTabOnFailure: boolean; // Automatically close tab if project fails in-page safety or validation (10s)
}

export const DEFAULT_CONFIG: FilterConfig = {
  autoBidEnabled: true,
  dryRunMode: false, // Live bidding ready
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
  minMatchingSkills: 1,
  blockedSkills: [],
  negativeKeywords: ['Casino', 'Betting', 'Academic', 'Essay', 'Adult', 'Crypto Trading Bot'],
  blockedCountries: [],
  allowedLanguages: ['English', 'ALL'],
  blockedCategories: ['Adult Content', 'Academic Writing', 'Illegal Activities'],
  allowedListingTypes: ['featured', 'sealed', 'nda', 'urgent', 'recruiter', 'ipContract', 'premium', 'enterprise', 'pfOnly', 'nonCompete'],
  maxProjectAgeHours: 0,
  maxExistingBids: 0,
  minBudget: 15,
  maxBudget: 5000,
  minBudgetHourly: 0,
  maxBudgetHourly: 0,
  allowedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR', 'SGD', 'NZD', 'PHP', 'ALL'],
  requirePaymentVerified: false, // Most clients never verify; requiring it skips the majority of projects
  requiredClientVerifications: [],
  minClientRating: 0,
  minClientCategoryRatings: {},
  minClientReviews: 0,
  freelancerSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'WordPress', 'Shopify', 'TailwindCSS', 'REST APIs', 'PHP', 'Python'],
  portfolioLinks: ['https://github.com/my-profile', 'https://myportfolio.dev'],
  ctaQuestion: '',
  systemPrompt: `OUTPUT FORMAT (follow exactly):

Line 1: "Hi"
[blank line]
Paragraph 1 (1–2 sentences): Restate the client's exact problem or goal using details from the job post, then say clearly that I can fix/build it. Do not start with "I".
[blank line]
Paragraph 2 (2–3 sentences): Proof. Mention a similar project I've done using {skills}, with one specific result or detail. Keep it believable and concrete.
[blank line]
Paragraph 3 (1–2 sentences): My quick plan — how I would approach this job in simple steps written as a sentence.
[blank line]
Let's discuss in chat.

HARD RULES:
- The first word of the proposal must always be "Hi". No exceptions.
- Put exactly one blank line between every section.
- Total length under 140 words.
- Plain text only. No bullet points, no bold, no emojis, no headings, no signature, no name at the end.
- Write like a real person typing a message: short sentences, simple English, confident tone.
- Never use these phrases: "I came across your project", "I am excited", "I am the perfect fit", "Dear Sir", "I have read your job description", "look no further", "seamless", "leverage", "delve".
- Do not repeat the job post back word for word.
- Do not invent fake client names, fake links, or fake numbers.
- Output only the proposal text, nothing before or after it.`,
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  customOpenAiModel: '',
  generateOnDemand: true, // Saves OpenAI tokens by generating only when applying!
  bidPercentageOfMaxBudget: 85,
  defaultDeliveryDays: 5,
  useAiPricingAndDays: true, // Intelligently use OpenAI API to select bid amount and delivery days within client budget
  bidStrategy: 'percentage_max',
  bidAmountFormula: 'No formula set — bids use the low end of the budget.',
  fixedBidAmount: 50,
  budgetTiersEnabled: false,
  budgetTiers: [
    { id: 'tier-1', minBudget: 0, maxBudget: 100, bidPercentage: 90, deliveryDays: 2 },
    { id: 'tier-2', minBudget: 100, maxBudget: 500, bidPercentage: 85, deliveryDays: 4 },
    { id: 'tier-3', minBudget: 500, maxBudget: 5000, bidPercentage: 80, deliveryDays: 7 },
  ],
  delayBetweenBidsSeconds: 0, // 0s minimum delay
  maxBidsPerDay: 40, // 40 max bids / day
  activeHoursFrom: 0, // 12 AM midnight
  activeHoursTo: 24, // 12 AM midnight end of day
  autoPostClarification: false, // Only on clarification board, never private chat
  allowFreeSealedUpgrade: true, // Auto take Sealed upgrade only if 100% free ($0)
  allowFreeNdaUpgrade: true, // Auto take NDA upgrade only if 100% free ($0)
  handsFreeAutoSubmit: true, // Auto-clicks 'Place Bid' button on Freelancer without human touch
  autoSubmitDelaySeconds: 2, // 2-second countdown before auto-submit
  autoOpenQualified: true, // Automatically opens matched projects in a new tab for instant bidding
  autoCloseTabOnSuccess: true, // Closes tab after success, then the next queued project opens
  autoCloseDelaySeconds: 20, // Review window before the tab closes and the queue moves on
  closeTabOnFailure: true, // Close the tab when the project is closed, already bid, or unbiddable
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

export interface ActivityPoint {
  label: string;
  scans: number;
  bids: number;
}

export interface DashboardRecentBid {
  id: string;
  projectId: number;
  projectTitle: string;
  projectUrl: string;
  projectType: 'Fixed' | 'Hourly';
  bidAmount: number;
  currency: string;
  deliveryDays: number;
  skills: string[];
  timestamp: number;
  status: string;
  reasonBadge: string;
}

export interface DashboardRecentScan {
  id: number;
  title: string;
  url: string;
  projectType: string;
  budgetFormatted: string;
  currency: string;
  skills: string[];
  timestamp: number;
  eligibility: 'Ineligible' | 'Eligible' | 'Excluded by you';
  skipReason: string;
}

export interface DashboardData {
  user: {
    name: string;
    email: string;
    trialDaysLeft: number;
    extensionVersion: string;
    extensionStatus: 'idle' | 'running' | 'polling';
  };
  stats: {
    bidsToday: number;
    scansToday: number;
    bidsThisWeek: number;
    scansThisWeek: number;
    bidsThisMonth: number;
    scansThisMonth: number;
    bidsAllTime: number;
    scansAllTime: number;
  };
  comparisons: {
    bidsWeekChange: number;
    scansWeekChange: number;
  };
  activity24h: {
    points: ActivityPoint[];
    totalBids24h: number;
    totalScans24h: number;
  };
  recentBids: DashboardRecentBid[];
  recentScans: DashboardRecentScan[];
}
