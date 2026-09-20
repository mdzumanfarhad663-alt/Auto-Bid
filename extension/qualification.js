/**
 * Shared project mapping and qualification rules.
 *
 * Imported by both the dashboard server (tsx, allowJs) and the extension service worker
 * (manifest "type": "module"), so a filter behaves identically in both places. Anything
 * runtime-specific (chrome.*, fs, fetch of the feed itself) stays out of this file.
 */

export const CURRENCY_RATES_TO_USD = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  AUD: 0.66,
  CAD: 0.74,
  INR: 0.012,
  SGD: 0.74,
  NZD: 0.61,
  PHP: 0.018,
  HKD: 0.13,
  JPY: 0.0067,
  MYR: 0.21,
  ZAR: 0.054,
  BRL: 0.2,
  MXN: 0.058,
  SEK: 0.093,
  CHF: 1.12,
  PLN: 0.25,
};

export function convertToUSD(amount, currency) {
  const rate = CURRENCY_RATES_TO_USD[(currency || 'USD').toUpperCase()] ?? 1;
  return (Number(amount) || 0) * rate;
}

// Query string the Freelancer search page itself uses. Without owner_info and
// upgrade_details the feed returns no client data and the filters have to guess.
export const RICH_FEED_PARAMS = {
  full_description: 'true',
  job_details: 'true',
  upgrade_details: 'true',
  owner_info: 'true',
  location_details: 'true',
  sort_field: 'submitdate',
  compact: 'true',
  new_errors: 'true',
};

export function buildActiveFeedUrl(limit = 30) {
  const params = new URLSearchParams({ limit: String(limit), ...RICH_FEED_PARAMS });
  return `https://www.freelancer.com/api/projects/0.1/projects/active/?${params.toString()}`;
}

export const CLIENT_VERIFICATION_KEYS = [
  'payment_verified',
  'identity_verified',
  'deposit_made',
  'email_verified',
  'profile_complete',
  'phone_verified',
  'custom_charge_verified',
  'freelancer_verified_user',
];

export const CLIENT_VERIFICATION_LABELS = {
  payment_verified: 'Payment verified',
  identity_verified: 'Identity verified',
  deposit_made: 'Deposit made',
  email_verified: 'Email verified',
  profile_complete: 'Profile completed',
  phone_verified: 'Phone verified',
  custom_charge_verified: 'Custom charge verified',
  freelancer_verified_user: 'Freelancer verified',
};

export const CATEGORY_RATING_KEYS = ['clarity_spec', 'communication', 'payment_prom', 'professionalism', 'hire_again'];

export const CATEGORY_RATING_LABELS = {
  clarity_spec: 'Clarity',
  communication: 'Communication',
  payment_prom: 'Payment promptness',
  professionalism: 'Professionalism',
  hire_again: 'Work for again',
};

export const LISTING_TYPE_KEYS = [
  'featured',
  'sealed',
  'nda',
  'urgent',
  'recruiter',
  'ipContract',
  'premium',
  'enterprise',
  'pfOnly',
  'nonCompete',
];

export const LISTING_TYPE_LABELS = {
  featured: 'Featured',
  sealed: 'Sealed',
  nda: 'NDA',
  urgent: 'Urgent',
  recruiter: 'Recruiter',
  ipContract: 'IP Agreement',
  premium: 'Premium',
  enterprise: 'Enterprise',
  pfOnly: 'Preferred Freelancer Only',
  nonCompete: 'Non Compete',
};

/**
 * Map one raw project from /projects/0.1/projects/active into the shape the rest of the
 * system uses. Client fields come from owner_info; nothing is invented when it is absent.
 */
export function mapActiveProject(raw) {
  const owner = raw.owner_info || {};
  const rep = (owner.reputation && owner.reputation.entire_history) || {};
  const status = owner.status || {};
  const up = raw.upgrades || {};
  const type = raw.type === 'hourly' ? 'hourly' : 'fixed';
  const hasOwnerInfo = !!raw.owner_info;

  return {
    id: raw.id,
    title: raw.title || 'Untitled Project',
    description: raw.description || raw.preview_description || raw.title || '',
    submitDate: raw.submitdate ? raw.submitdate * 1000 : Date.now(),
    type,
    bidPeriod: raw.bidperiod || null,
    language: raw.language || null,
    seoUrl: raw.seo_url || null,
    budget: {
      minimum: Number(raw.budget?.minimum) || 0,
      maximum: Number(raw.budget?.maximum) || 0,
      currency: raw.currency?.code || 'USD',
    },
    jobs: (raw.jobs || []).map((j) => ({ id: j.id, name: j.name })),
    bidCount: Number(raw.bid_stats?.bid_count) || 0,
    bidAvg: Number(raw.bid_stats?.bid_avg) || 0,
    upgrades: {
      featured: !!up.featured,
      sealed: !!up.sealed,
      nda: !!up.NDA,
      urgent: !!up.urgent,
      recruiter: !!up.recruiter,
      ipContract: !!up.ip_contract,
      premium: !!up.premium,
      enterprise: !!up.enterprise,
      pfOnly: !!up.pf_only,
      nonCompete: !!up.non_compete,
      nonpublic: !!up.nonpublic,
    },
    client: {
      id: raw.owner_id || 0,
      username: raw.owner_username || `client_${raw.owner_id || 'unknown'}`,
      rating: Number(rep.overall) || 0,
      reviewsCount: Number(rep.reviews) || 0,
      completionRate: typeof rep.completion_rate === 'number' ? rep.completion_rate : null,
      categoryRatings: rep.category_ratings
        ? {
            clarity_spec: Number(rep.category_ratings.clarity_spec) || 0,
            communication: Number(rep.category_ratings.communication) || 0,
            payment_prom: Number(rep.category_ratings.payment_prom) || 0,
            professionalism: Number(rep.category_ratings.professionalism) || 0,
            hire_again: Number(rep.category_ratings.hire_again) || 0,
          }
        : null,
      paymentVerified: !!status.payment_verified,
      identityVerified: !!status.identity_verified,
      verifications: hasOwnerInfo
        ? {
            payment_verified: !!status.payment_verified,
            identity_verified: !!status.identity_verified,
            deposit_made: !!status.deposit_made,
            email_verified: !!status.email_verified,
            profile_complete: !!status.profile_complete,
            phone_verified: !!status.phone_verified,
            custom_charge_verified: !!status.custom_charge_verified,
            freelancer_verified_user: !!status.freelancer_verified_user,
          }
        : null,
      country: owner.country?.name || 'Unknown',
      registrationDate: owner.registration_date ? owner.registration_date * 1000 : null,
    },
    status: 'PENDING',
    url: `https://www.freelancer.com/projects/${raw.seo_url || raw.id}`,
    feedSource: 'public_api',
    clientDataAvailable: hasOwnerInfo,
  };
}

function matchSkill(skill, jobNames, fullText) {
  const s = skill.trim().toLowerCase();
  if (!s) return false;
  for (const j of jobNames) {
    if (j === s || j.includes(s) || s.includes(j)) return true;
  }
  try {
    const escaped = s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(fullText);
  } catch {
    return fullText.includes(s);
  }
}

function budgetBoundsFor(project, config) {
  if (project.type === 'hourly') {
    return {
      min: Number(config.minBudgetHourly) || 0,
      max: Number(config.maxBudgetHourly) || 0,
      label: 'hourly rate',
    };
  }
  return {
    min: Number(config.minBudget) || 0,
    max: Number(config.maxBudget) || 0,
    label: 'budget',
  };
}

/**
 * Decide whether a project qualifies. Gates run cheapest first and in the order a user
 * would expect to see them explained. Every rejection names the exact rule.
 */
export function evaluateProject(project, config, options = {}) {
  const now = options.now || Date.now();
  const jobNames = (project.jobs || []).map((j) => (typeof j === 'string' ? j : j.name || '').toLowerCase());
  const fullText = `${project.title || ''} ${project.description || ''}`.toLowerCase();
  const client = project.client || {};
  const clientKnown = project.clientDataAvailable === true;

  // Already bid
  if (project.alreadyBid) {
    return { qualified: false, reason: 'Already bid on this project in your account' };
  }

  // Blocked countries
  if (Array.isArray(config.blockedCountries) && config.blockedCountries.length && client.country) {
    const cc = String(client.country).trim().toLowerCase();
    const hit = config.blockedCountries.find((c) => {
      const v = String(c).trim().toLowerCase();
      return v && (cc === v || cc.includes(v));
    });
    if (hit) return { qualified: false, reason: `Country blocked (${client.country})` };
  }

  // Never-bid-on skills: any one of these on the project skips it
  if (Array.isArray(config.blockedSkills) && config.blockedSkills.length) {
    const hit = config.blockedSkills.find((s) => {
      const v = String(s).trim().toLowerCase();
      return v && jobNames.some((j) => j === v || j.includes(v));
    });
    if (hit) return { qualified: false, reason: `Excluded skill (${hit})` };
  }

  // Blocked categories (keyword match on skills or text)
  if (Array.isArray(config.blockedCategories) && config.blockedCategories.length) {
    const hit = config.blockedCategories.find((cat) => {
      const v = String(cat).trim().toLowerCase();
      return v && (jobNames.some((j) => j.includes(v)) || fullText.includes(v));
    });
    if (hit) return { qualified: false, reason: `Blocked category (${hit})` };
  }

  // Listing types: when a list is set, every flagged upgrade on the project must be allowed
  if (Array.isArray(config.allowedListingTypes) && project.upgrades) {
    const allowed = new Set(config.allowedListingTypes);
    const disallowed = LISTING_TYPE_KEYS.find((key) => project.upgrades[key] && !allowed.has(key));
    if (disallowed) {
      return { qualified: false, reason: `Listing type not allowed (${LISTING_TYPE_LABELS[disallowed] || disallowed})` };
    }
  }

  // Project age
  const maxAgeHours = Number(config.maxProjectAgeHours) || 0;
  if (maxAgeHours > 0 && project.submitDate) {
    const ageHours = (now - project.submitDate) / 3600000;
    if (ageHours > maxAgeHours) {
      return { qualified: false, reason: `Too old (${Math.round(ageHours)}h > ${maxAgeHours}h)` };
    }
  }

  // Competition
  const maxBids = Number(config.maxExistingBids) || 0;
  if (maxBids > 0 && typeof project.bidCount === 'number' && project.bidCount >= maxBids) {
    return { qualified: false, reason: `Too much competition (${project.bidCount} bids >= ${maxBids})` };
  }

  // Mandatory skills
  const matchedTags = [];
  if (Array.isArray(config.mandatorySkills) && config.mandatorySkills.length) {
    for (const skill of config.mandatorySkills) {
      if (matchSkill(String(skill), jobNames, fullText)) matchedTags.push(skill);
    }
    const minReq = Math.max(1, Number(config.minMatchingSkills) || 1);
    if (matchedTags.length < minReq) {
      return { qualified: false, reason: `Missing mandatory skills (matched ${matchedTags.length}/${minReq})` };
    }
  }

  // Negative keywords
  if (Array.isArray(config.negativeKeywords) && config.negativeKeywords.length) {
    const matchedBlacklist = config.negativeKeywords.filter((neg) => {
      const v = String(neg).trim().toLowerCase();
      if (!v) return false;
      try {
        const escaped = v.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        return re.test(fullText) || jobNames.some((j) => re.test(j));
      } catch {
        return fullText.includes(v) || jobNames.some((j) => j.includes(v));
      }
    });
    if (matchedBlacklist.length) {
      return { qualified: false, reason: `Excluded keyword (${matchedBlacklist.join(', ')})`, matchedBlacklist };
    }
  }

  // Currency
  if (
    Array.isArray(config.allowedCurrencies) &&
    config.allowedCurrencies.length &&
    !config.allowedCurrencies.includes('ALL') &&
    !config.allowedCurrencies.includes(project.budget.currency)
  ) {
    return { qualified: false, reason: `Currency not permitted (${project.budget.currency})` };
  }

  // Budget, in USD, against the range for this project type. 0 disables a bound.
  const bounds = budgetBoundsFor(project, config);
  const minUSD = convertToUSD(project.budget.minimum, project.budget.currency);
  const maxUSD = convertToUSD(project.budget.maximum, project.budget.currency);
  if (bounds.min > 0 && maxUSD > 0 && maxUSD < bounds.min) {
    return { qualified: false, reason: `Below minimum ${bounds.label} (~$${Math.round(maxUSD)} < $${bounds.min})` };
  }
  if (bounds.max > 0 && minUSD > bounds.max) {
    return { qualified: false, reason: `Above maximum ${bounds.label} (~$${Math.round(minUSD)} > $${bounds.max})` };
  }

  // Client verification. Only enforceable when the feed supplied client data.
  const required = Array.isArray(config.requiredClientVerifications)
    ? config.requiredClientVerifications.slice()
    : [];
  if (config.requirePaymentVerified && !required.includes('payment_verified')) required.push('payment_verified');
  if (required.length && clientKnown && client.verifications) {
    const missing = required.find((key) => !client.verifications[key]);
    if (missing) {
      return { qualified: false, reason: `Client not ${(CLIENT_VERIFICATION_LABELS[missing] || missing).toLowerCase()}` };
    }
  }

  // Ratings apply only once a client has been reviewed; a new client has nothing to judge.
  if (clientKnown && client.reviewsCount > 0) {
    const minOverall = Number(config.minClientRating) || 0;
    if (minOverall > 0 && client.rating < minOverall) {
      return { qualified: false, reason: `Client rating below ${minOverall} (${client.rating.toFixed(1)})` };
    }
    const minCats = config.minClientCategoryRatings || {};
    if (client.categoryRatings) {
      for (const key of CATEGORY_RATING_KEYS) {
        const min = Number(minCats[key]) || 0;
        if (min > 0 && client.categoryRatings[key] < min) {
          return {
            qualified: false,
            reason: `Client ${(CATEGORY_RATING_LABELS[key] || key).toLowerCase()} below ${min} (${client.categoryRatings[key].toFixed(1)})`,
          };
        }
      }
    }
  }

  const minReviews = Number(config.minClientReviews) || 0;
  if (clientKnown && minReviews > 0 && (client.reviewsCount || 0) < minReviews) {
    return { qualified: false, reason: `Client reviews below ${minReviews} (${client.reviewsCount || 0})` };
  }

  return { qualified: true, matchedTags };
}

/**
 * Picks the portfolio links to insert into a proposal for a given project.
 * A category matches when any of its keywords appears (case-insensitive) in the
 * project's title or its listed skills. The first matching category with at least
 * one link wins; otherwise falls back to the general portfolioLinks list.
 */
export function selectPortfolioLinks(config, project) {
  const categories = Array.isArray(config?.portfolioCategories) ? config.portfolioCategories : [];
  const fallback = Array.isArray(config?.portfolioLinks) ? config.portfolioLinks : [];

  if (categories.length === 0 || !project) return fallback;

  const title = String(project.title || '').toLowerCase();
  const skills = (project.jobs || project.skills || [])
    .map((j) => (typeof j === 'string' ? j : j?.name || ''))
    .join(' ')
    .toLowerCase();
  const haystack = `${title} ${skills}`;

  for (const cat of categories) {
    const keywords = Array.isArray(cat?.keywords) ? cat.keywords : [];
    const links = Array.isArray(cat?.links) ? cat.links : [];
    if (links.length === 0) continue;
    const matched = keywords.some((kw) => kw && haystack.includes(String(kw).toLowerCase()));
    if (matched) return links;
  }

  return fallback;
}
