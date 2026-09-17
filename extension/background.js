/**
 * Freelancer AutoBid - Background Service Worker (Manifest V3)
 * 
 * Features:
 * 1. Background interval polling (every 30s or 60s / 1 min) directly from Freelancer's public feed
 *    - Freelancer Public RSS XML feed (https://www.freelancer.com/rss.xml)
 *    - Freelancer Public Active Projects API (/api/projects/0.1/projects/active/)
 *    - NO Freelancer OAuth Token required!
 * 2. Instant Chrome Desktop Notifications on newly discovered & qualified projects.
 * 3. Clicking notifications opens the project page immediately on Freelancer.com.
 * 4. Real-time qualification filtering:
 *    - Mandatory platform tech tags
 *    - Negative keyword blacklist
 *    - Budget range & client filters
 *    - Deduplication against processed IDs
 * 5. OpenAI (gpt-4o-mini, gpt-4o, etc.) personalized proposal generation strictly adhering to custom markdown rules.
 *    (Template fallback completely removed)
 * 6. Automated bid submission (or Dry-Run simulation / manual copy & apply).
 * 7. Real-time synchronization with local dashboard at http://localhost:3000.
 */

const LOCAL_DASHBOARD_URL = 'http://localhost:3000';
const DEFAULT_POLL_INTERVAL_SECONDS = 30;

// Default configuration (defaults to Public Feed with NO OAuth token required)
const DEFAULT_CONFIG = {
  autoBidEnabled: true,
  dryRunMode: false, // Live bidding ready
  pollIntervalSeconds: 30, // 30s or 60s (1 min)
  feedSource: 'auto', // 'auto' | 'rss' | 'public_api' (100% No OAuth required!)
  desktopNotifications: true,
  audioAlerts: true,
  freelancerOAuthToken: '', // Optional! Left blank for public feed
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  mandatorySkills: ['WordPress', 'Shopify', 'PHP', 'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Next.js', 'Python', 'SEO', 'Data Entry', 'Web Development', 'Full Stack Development'],
  minMatchingSkills: 1,
  negativeKeywords: ['Casino', 'Betting', 'Academic', 'Essay', 'Adult', 'Crypto Trading Bot'],
  blockedCountries: [],
  allowedLanguages: ['English', 'ALL'],
  blockedCategories: ['Adult Content', 'Academic Writing', 'Illegal Activities'],
  minBudget: 15,
  maxBudget: 5000,
  allowedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR', 'SGD', 'NZD', 'PHP', 'ALL'],
  requirePaymentVerified: false, // Default false so public feed projects aren't rejected
  minClientRating: 4.0,
  minClientReviews: 0,
  freelancerSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'WordPress', 'Shopify', 'TailwindCSS', 'REST APIs', 'Python'],
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
  bidPercentageOfMaxBudget: 85,
  defaultDeliveryDays: 5,
  handsFreeAutoSubmit: true,
  autoSubmitDelaySeconds: 2,
  autoOpenQualified: true,
  autoCloseTabOnSuccess: true,
  autoCloseDelaySeconds: 3,
  closeTabOnFailure: false,
};

// In-memory runtime cache
let activeConfig = { ...DEFAULT_CONFIG };
let processedIds = new Set();
let isPolling = false;
const notificationUrls = new Map();

// Initialize service worker
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[FreelancerAutoBid] Service worker installed.');
  await loadStoredConfig();
  setupPollingAlarm(activeConfig.pollIntervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[FreelancerAutoBid] Service worker started.');
  await loadStoredConfig();
  setupPollingAlarm(activeConfig.pollIntervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS);
});

// Alarm Listener for periodic background execution (30s / 60s)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'freelancer_poll_alarm') {
    if (activeConfig.autoBidEnabled && !isPolling) {
      await runPollingCycle();
    }
  }
});

// Tab update listener: whenever a Freelancer project page completes loading, deliver autofill payload
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('freelancer.com/projects')) {
      const stored = await chrome.storage.local.get(['pendingAutoBid', 'handsFreeAutoSubmit', 'autoSubmitDelaySeconds']);
      if (stored && stored.pendingAutoBid) {
        const pb = stored.pendingAutoBid;
        if (Date.now() - (pb.timestamp || 0) < 5 * 60 * 1000) {
          console.log('[FreelancerAutoBid] Dispatching AUTOFILL_BID to loaded tab:', tabId);
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              type: 'AUTOFILL_BID',
              data: {
                ...pb,
                autoSubmit: stored.handsFreeAutoSubmit !== false,
                delaySeconds: stored.autoSubmitDelaySeconds || 2,
              }
            }).catch(() => {
              // Tab might still be initializing content script
            });
          }, 800);
        }
      }
    }
  });
}

// Notification click listener: opens project URL directly on Freelancer!
if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const url = notificationUrls.get(notificationId);
    if (url) {
      chrome.tabs.create({ url });
    }
  });
}

// Message Listener from Popup / Dashboard / Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      activeConfig,
      processedCount: processedIds.size,
      isPolling,
    });
    return true;
  }

  if (message.type === 'UPDATE_CONFIG') {
    activeConfig = { ...activeConfig, ...message.config };
    chrome.storage.local.set({ config: activeConfig });
    setupPollingAlarm(activeConfig.pollIntervalSeconds);
    sendResponse({ success: true, activeConfig });
    return true;
  }

  if (message.type === 'CLOSE_CURRENT_TAB') {
    if (sender.tab && sender.tab.id) {
      console.log('[FreelancerAutoBid] Auto-closing completed tab:', sender.tab.id);
      chrome.tabs.remove(sender.tab.id);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TRIGGER_POLL_NOW') {
    runPollingCycle().then((results) => {
      sendResponse({ success: true, results });
    });
    return true;
  }
});

async function loadStoredConfig() {
  const data = await chrome.storage.local.get(['config', 'processedIds', 'openaiApiKey']);
  if (data.config) {
    activeConfig = { ...DEFAULT_CONFIG, ...data.config };
  } else {
    // Try to fetch initial config from local dashboard if running
    try {
      const res = await fetch(`${LOCAL_DASHBOARD_URL}/api/config`);
      if (res.ok) {
        const remoteConfig = await res.json();
        activeConfig = { ...DEFAULT_CONFIG, ...remoteConfig };
        await chrome.storage.local.set({ config: activeConfig });
      }
    } catch (e) {
      console.log('[FreelancerAutoBid] Local dashboard not reachable yet, using defaults.');
    }
  }

  if (data.openaiApiKey && !activeConfig.openaiApiKey) {
    activeConfig.openaiApiKey = data.openaiApiKey;
  }

  if (activeConfig.autoOpenQualified === undefined) {
    activeConfig.autoOpenQualified = true;
  }

  if (Array.isArray(data.processedIds)) {
    processedIds = new Set(data.processedIds);
  }
}

function setupPollingAlarm(intervalSeconds = 30) {
  const periodInMinutes = Math.max(0.5, intervalSeconds / 60); // 30s is 0.5 minutes, 60s is 1.0 minute
  chrome.alarms.clear('freelancer_poll_alarm', () => {
    chrome.alarms.create('freelancer_poll_alarm', {
      periodInMinutes: periodInMinutes,
    });
    console.log(`[FreelancerAutoBid] Polling alarm configured for every ${intervalSeconds}s`);
  });
}

/**
 * Main Polling Cycle - Polls every 30s/60s without OAuth
 */
async function runPollingCycle() {
  if (isPolling) return [];
  isPolling = true;

  console.log(`[FreelancerAutoBid] Executing poll cycle from public feed (Interval: ${activeConfig.pollIntervalSeconds}s)...`);
  const newProjectsProcessed = [];

  try {
    // 1. Fetch active projects from Freelancer public feed (RSS or public API)
    const projects = await fetchActiveFreelancerProjects();

    for (const project of projects) {
      // Deduplication check
      if (processedIds.has(project.id)) {
        continue;
      }

      // Evaluate Qualification Filters
      const evalResult = evaluateQualification(project, activeConfig);

      if (!evalResult.qualified) {
        // Disqualified / Skipped
        project.status = 'SKIPPED';
        project.skipReason = evalResult.reason;
        project.matchedBlacklist = evalResult.matchedBlacklist;
        await recordProjectResult(project);
        processedIds.add(project.id);
        continue;
      }

      // Check Active Hours
      const fromH = activeConfig.activeHoursFrom ?? 0;
      const toH = activeConfig.activeHoursTo ?? 24;
      const curH = new Date().getHours();
      const inWindow = (fromH === 0 && toH === 24) ||
        (fromH < toH && curH >= fromH && curH < toH) ||
        (fromH > toH && (curH >= fromH || curH < toH));

      if (!inWindow) {
        console.log(`[FreelancerAutoBid] Outside active hours (${fromH}:00 - ${toH}:00). Skipping bid placement.`);
        project.status = 'SKIPPED';
        project.skipReason = `Outside active hours (${fromH}:00 - ${toH}:00)`;
        await recordProjectResult(project);
        processedIds.add(project.id);
        continue;
      }

      // Project Qualified!
      project.status = 'QUALIFIED';
      project.matchedTags = evalResult.matchedTags;

      // Calculate Bid Amount according to strategy & tiers
      const maxBudget = project.budget?.maximum || activeConfig.minBudget;
      const minBudget = project.budget?.minimum || activeConfig.minBudget;
      let bidAmount = minBudget;
      let bidDays = activeConfig.defaultDeliveryDays || 5;

      if (activeConfig.budgetTiersEnabled && activeConfig.budgetTiers && activeConfig.budgetTiers.length > 0) {
        const matchedTier = activeConfig.budgetTiers.find((t) => maxBudget >= t.minBudget && minBudget <= t.maxBudget);
        if (matchedTier) {
          bidAmount = Math.round(maxBudget * ((matchedTier.bidPercentage || 85) / 100));
          bidDays = matchedTier.deliveryDays || bidDays;
        } else {
          bidAmount = Math.round(maxBudget * ((activeConfig.bidPercentageOfMaxBudget || 85) / 100));
        }
      } else {
        switch (activeConfig.bidStrategy) {
          case 'low_end':
            bidAmount = minBudget;
            break;
          case 'midpoint':
            bidAmount = Math.round((minBudget + maxBudget) / 2);
            break;
          case 'fixed':
            bidAmount = activeConfig.fixedBidAmount || 50;
            break;
          case 'percentage_max':
          default:
            bidAmount = Math.round(maxBudget * ((activeConfig.bidPercentageOfMaxBudget || 85) / 100));
            break;
        }
      }
      bidAmount = Math.max(minBudget, Math.min(bidAmount, maxBudget));

      project.bidAmount = bidAmount;
      project.bidPeriodDays = bidDays;

      // Generate AI Proposal with OpenAI according to user custom markdown prompt rules
      let proposal = '';
      try {
        proposal = await generateAiProposal(project, activeConfig);
        project.generatedProposal = proposal;
      } catch (genError) {
        console.error('[FreelancerAutoBid] Proposal generation failed:', genError.message);
        project.skipReason = `OpenAI Error: ${genError.message}`;
        project.status = 'FAILED';
        await recordProjectResult(project);
        processedIds.add(project.id);
        continue;
      }

      // Submit Bid or Simulate / Dry-Run
      if (activeConfig.autoBidEnabled && proposal) {
        // Cache pending proposal and bid data to extension storage
        await chrome.storage.local.set({
          pendingAutoBid: {
            proposal,
            amount: bidAmount,
            period: project.bidPeriodDays || 5,
            autoSubmit: activeConfig.handsFreeAutoSubmit !== false,
            projectId: project.id,
            timestamp: Date.now(),
          },
          handsFreeAutoSubmit: activeConfig.handsFreeAutoSubmit !== false,
          autoSubmitDelaySeconds: activeConfig.autoSubmitDelaySeconds || 2,
        });

        // Build direct AutoBid URL with proposal and auto_submit flag
        const autoSubmitFlag = activeConfig.handsFreeAutoSubmit !== false ? '1' : '0';
        const autobidHash = `#autobid_p=${encodeURIComponent(proposal)}&amount=${bidAmount}&period=${project.bidPeriodDays || 5}&auto_submit=${autoSubmitFlag}&autobid=1&pid=${project.id}`;
        const directApplyUrl = project.url ? `${project.url}${autobidHash}` : '';

        if (activeConfig.dryRunMode || !activeConfig.freelancerOAuthToken) {
          project.status = 'BID_PLACED';
          project.bidPlacedAt = Date.now();
          console.log(`[FreelancerAutoBid] [FEED NOTIFICATION] Qualified: "${project.title}" ($${bidAmount} ${project.budget.currency})`);
          
          if (activeConfig.desktopNotifications) {
            showProjectNotification(
              project.id,
              `🎯 Qualified: ${project.title.slice(0, 45)}...`,
              `Budget: ${project.budget.minimum}-${project.budget.maximum} ${project.budget.currency} | AutoBid Ready! Click to open & apply.`,
              directApplyUrl || project.url
            );
          }

          // Autonomous mode: open tab automatically if autoOpenQualified is enabled (defaults to true)
          if (directApplyUrl && (activeConfig.autoOpenQualified !== false)) {
            console.log('[FreelancerAutoBid] Autonomous Auto-Open matched project in tab:', project.id, directApplyUrl);
            chrome.tabs.create({ url: directApplyUrl, active: true });
          }
        } else {
          // If real token provided, submit via Freelancer API
          const bidSuccess = await submitFreelancerBid(project, bidAmount, proposal);
          if (bidSuccess) {
            project.status = 'BID_PLACED';
            project.bidPlacedAt = Date.now();
            if (activeConfig.desktopNotifications) {
              showProjectNotification(
                project.id,
                `⚡ Real Bid Placed: ${project.title.slice(0, 45)}...`,
                `Amount: ${bidAmount} ${project.budget.currency}. Click to view on Freelancer.`,
                directApplyUrl || project.url
              );
            }
          } else {
            project.status = 'FAILED';
            project.skipReason = 'Freelancer API bid submission rejected';
          }
        }
      }

      await recordProjectResult(project);
      processedIds.add(project.id);
      newProjectsProcessed.push(project);
    }

    // Persist processed IDs cache
    const idArray = Array.from(processedIds).slice(-1000);
    await chrome.storage.local.set({ processedIds: idArray });
  } catch (error) {
    console.error('[FreelancerAutoBid] Polling cycle failed:', error);
  } finally {
    isPolling = false;
  }

  return newProjectsProcessed;
}

/**
 * Fetch and parse Freelancer's public RSS feed: https://www.freelancer.com/rss.xml
 * 100% No OAuth Token required!
 */
async function fetchFromFreelancerRssFeed() {
  try {
    const res = await fetch('https://www.freelancer.com/rss.xml', {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const projects = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

    for (const match of itemMatches) {
      const itemContent = match[1];

      const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                         itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled Project';

      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : '';

      const guidMatch = itemContent.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      const rawGuid = guidMatch ? guidMatch[1].trim() : '';
      const idMatch = rawGuid.match(/\d+/) || link.match(/\/(\d+)(?:\.html)?$/);
      const id = idMatch ? parseInt(idMatch[0], 10) : Math.floor(Math.random() * 8999999) + 40000000;

      const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                        itemContent.match(/<description>([\s\S]*?)<\/description>/);
      const rawDesc = descMatch ? descMatch[1].trim() : '';

      const categories = [];
      const catMatches = itemContent.matchAll(/<category[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g);
      for (const cat of catMatches) {
        const catName = cat[1].trim();
        if (catName && !categories.includes(catName)) {
          categories.push(catName);
        }
      }

      let budgetMin = 50;
      let budgetMax = 250;
      let currency = 'USD';

      const budgetRangeMatch = rawDesc.match(/\(Budget:\s*([^\d\s]*)\s*(\d+(?:\.\d+)?)\s*-\s*([^\d\s]*)\s*(\d+(?:\.\d+)?)\s*([A-Z]{3})/i);
      const budgetSingleMatch = rawDesc.match(/\(Budget:\s*([^\d\s]*)\s*(\d+(?:\.\d+)?)\s*([A-Z]{3})/i);

      if (budgetRangeMatch) {
        budgetMin = parseFloat(budgetRangeMatch[2]);
        budgetMax = parseFloat(budgetRangeMatch[4]);
        currency = budgetRangeMatch[5].toUpperCase();
      } else if (budgetSingleMatch) {
        budgetMin = parseFloat(budgetSingleMatch[2]);
        budgetMax = budgetMin * 2;
        currency = budgetSingleMatch[3].toUpperCase();
      }

      const cleanDesc = rawDesc.replace(/\(Budget:.*?\)$/i, '').replace(/\.\.\.\s*$/, '').trim();
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const submitDate = pubDateMatch ? new Date(pubDateMatch[1].trim()).getTime() : Date.now();

      projects.push({
        id,
        title,
        description: cleanDesc || title,
        submitDate: isNaN(submitDate) ? Date.now() : submitDate,
        budget: {
          minimum: budgetMin,
          maximum: budgetMax,
          currency,
        },
        jobs: (categories.length > 0 ? categories : ['General Freelance']).map((name, idx) => ({ id: idx + 1, name })),
        client: {
          id: 0,
          username: 'freelancer_client',
          rating: 5.0,
          reviewsCount: 1,
          paymentVerified: true,
          identityVerified: true,
          country: 'Global',
        },
        url: link || `https://www.freelancer.com/projects/${id}`,
        feedSource: 'rss',
      });
    }

    return projects;
  } catch (err) {
    console.warn('[FreelancerAutoBid] RSS fetch error:', err);
    return [];
  }
}

/**
 * Fetch from Freelancer's public JSON API
 * 100% No OAuth Token required for public listings!
 */
async function fetchFromFreelancerPublicApi() {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (activeConfig.freelancerOAuthToken) {
      headers['freelancer-oauth-v1'] = activeConfig.freelancerOAuthToken;
    }

    const endpoint = 'https://www.freelancer.com/api/projects/0.1/projects/active/?limit=20&compact=true&job_details=true&user_details=true';
    const response = await fetch(endpoint, { headers });

    if (!response.ok) return [];

    const data = await response.json();
    const rawProjects = data.result?.projects || [];
    const users = data.result?.users || {};

    return rawProjects.map((p) => {
      const owner = users[p.owner_id] || {};
      return {
        id: p.id,
        title: p.title || 'Untitled Project',
        description: p.preview_description || p.description || p.title,
        submitDate: (p.submitdate || Math.floor(Date.now() / 1000)) * 1000,
        budget: {
          minimum: p.budget?.minimum || 20,
          maximum: p.budget?.maximum || 250,
          currency: p.currency?.code || 'USD',
        },
        jobs: (p.jobs || []).map((j) => ({ id: j.id, name: j.name })),
        client: {
          id: p.owner_id || 0,
          username: owner.username || `client_${p.owner_id || 'feed'}`,
          rating: owner.reputation?.entire_history?.overall || 4.8,
          reviewsCount: owner.reputation?.entire_history?.reviews || 0,
          paymentVerified: !!owner.status?.payment_verified,
          identityVerified: !!owner.status?.identity_verified,
          country: owner.location?.country?.name || 'Global',
        },
        url: `https://www.freelancer.com/projects/${p.seo_url || p.id}`,
        feedSource: 'public_api',
      };
    });
  } catch (err) {
    console.warn('[FreelancerAutoBid] Public API fetch error:', err);
    return [];
  }
}

/**
 * Fetch active projects from Freelancer using selected feed
 */
async function fetchActiveFreelancerProjects() {
  const feedSource = activeConfig.feedSource || 'auto';

  if (feedSource === 'rss') {
    const rss = await fetchFromFreelancerRssFeed();
    if (rss.length > 0) return rss;
  }

  if (feedSource === 'public_api') {
    const api = await fetchFromFreelancerPublicApi();
    if (api.length > 0) return api;
  }

  // Auto mode: combine both feeds
  const [rss, api] = await Promise.all([
    fetchFromFreelancerRssFeed().catch(() => []),
    fetchFromFreelancerPublicApi().catch(() => []),
  ]);

  const map = new Map();
  for (const p of [...rss, ...api]) {
    if (!map.has(p.id)) {
      map.set(p.id, p);
    }
  }

  return Array.from(map.values());
}

/**
 * Local Qualification Filtering Logic (Stage 1)
 */
function evaluateQualification(project, config) {
  const fullText = `${project.title || ''} ${project.description || ''}`.toLowerCase();
  const jobNames = (project.jobs || []).map((j) => (typeof j === 'string' ? j : j.name || '').toLowerCase());

  // 1. Blocked Countries Check
  if (config.blockedCountries && config.blockedCountries.length > 0 && project.client?.country) {
    const clientCountry = project.client.country.trim().toLowerCase();
    const isBlocked = config.blockedCountries.some((c) => {
      const cLower = c.trim().toLowerCase();
      return cLower && (clientCountry === cLower || clientCountry.includes(cLower));
    });
    if (isBlocked) {
      return { qualified: false, reason: `Disqualified: Blocked client country (${project.client.country})` };
    }
  }

  // 2. Blocked Categories Check
  if (config.blockedCategories && config.blockedCategories.length > 0) {
    const matchedBlockedCategory = config.blockedCategories.find((cat) => {
      const catLower = cat.trim().toLowerCase();
      return catLower && (jobNames.some((j) => j.includes(catLower)) || fullText.includes(catLower));
    });
    if (matchedBlockedCategory) {
      return { qualified: false, reason: `Discarded: Blocked category match (${matchedBlockedCategory})` };
    }
  }

  // 3. Mandatory Platform Check: Require explicit tech tags
  const matchedTags = [];
  if (config.mandatorySkills && config.mandatorySkills.length > 0) {
    for (const skill of config.mandatorySkills) {
      const sLower = skill.trim().toLowerCase();
      if (!sLower) continue;
      const matched = jobNames.some((j) => j === sLower || j.includes(sLower) || sLower.includes(j)) || fullText.includes(sLower);
      if (matched) matchedTags.push(skill);
    }

    const minReq = Math.max(1, config.minMatchingSkills || 1);
    if (matchedTags.length < minReq) {
      return { qualified: false, reason: `Ineligible: Missing mandatory tech skills (Matched ${matchedTags.length}/${minReq})` };
    }
  }

  // 4. Negative Keyword Blacklist
  if (config.negativeKeywords && config.negativeKeywords.length > 0) {
    const matchedBlacklist = config.negativeKeywords.filter((neg) => {
      const nLower = neg.trim().toLowerCase();
      return nLower && (fullText.includes(nLower) || jobNames.some((j) => j.includes(nLower)));
    });

    if (matchedBlacklist.length > 0) {
      return {
        qualified: false,
        reason: `Discarded: Blacklisted keyword match (${matchedBlacklist.join(', ')})`,
        matchedBlacklist,
      };
    }
  }

  // 5. Budget & Client Qualification
  if (project.budget.maximum > 0 && project.budget.maximum < config.minBudget) {
    return { qualified: false, reason: `Budget below minimum ($${project.budget.maximum} < $${config.minBudget})` };
  }

  if (project.budget.minimum > config.maxBudget) {
    return { qualified: false, reason: `Budget exceeds ceiling ($${project.budget.minimum} > $${config.maxBudget})` };
  }

  if (config.allowedCurrencies.length > 0 && !config.allowedCurrencies.includes('ALL') && !config.allowedCurrencies.includes(project.budget.currency)) {
    return { qualified: false, reason: `Currency not permitted (${project.budget.currency})` };
  }

  if (config.requirePaymentVerified && !project.client.paymentVerified && project.feedSource !== 'rss') {
    return { qualified: false, reason: 'Client payment is unverified' };
  }

  if (project.feedSource !== 'rss' && project.client.reviewsCount > 0 && project.client.rating < config.minClientRating) {
    return { qualified: false, reason: `Client rating low (${project.client.rating.toFixed(1)} < ${config.minClientRating})` };
  }

  return { qualified: true, matchedTags };
}

/**
 * OpenAI Proposal Generator strictly adhering to the user's custom markdown rules.
 * No template fallback.
 */
async function generateAiProposal(project, config) {
  let apiKey = config.openaiApiKey;
  if (!apiKey || apiKey.trim() === '') {
    const st = await chrome.storage.local.get(['openaiApiKey', 'config']);
    apiKey = st.openaiApiKey || st.config?.openaiApiKey;
  }

  // Also try local dashboard if key is not yet set in extension storage
  if (!apiKey || apiKey.trim() === '') {
    try {
      const res = await fetch(`${LOCAL_DASHBOARD_URL}/api/config`);
      if (res.ok) {
        const remoteConfig = await res.json();
        if (remoteConfig.openaiApiKey) {
          apiKey = remoteConfig.openaiApiKey;
          activeConfig.openaiApiKey = apiKey;
          await chrome.storage.local.set({ openaiApiKey: apiKey });
        }
      }
    } catch (e) {}
  }

  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_openai')) {
    showProjectNotification(
      project.id,
      '⚠️ OpenAI API Key Required',
      'Please enter your OpenAI API Key in the extension popup or dashboard to generate proposals according to your markdown rules.',
      'http://localhost:3000'
    );
    throw new Error('OpenAI API Key is required. Please configure your OpenAI API Key.');
  }

  const skillsList = (config.freelancerSkills || []).join(', ');
  const portfolioList = (config.portfolioLinks || []).slice(0, 2).join(' | ');

  let systemInstruction = config.systemPrompt || DEFAULT_CONFIG.systemPrompt;
  systemInstruction = systemInstruction
    .replace(/\{skills\}/g, skillsList)
    .replace(/\{portfolio_links\}/g, portfolioList);

  if (systemInstruction.includes('{cta_question}')) {
    systemInstruction = systemInstruction.replace(
      /\{cta_question\}/g,
      config.ctaQuestion && config.ctaQuestion.trim() !== '' ? config.ctaQuestion : "Let's discuss in chat."
    );
  }

  const userPrompt = `Project Title: ${project.title}
Budget: ${project.budget.minimum} - ${project.budget.maximum} ${project.budget.currency}
Required Skills: ${(project.jobs || []).map((j) => (typeof j === 'string' ? j : j.name || '')).join(', ')}

Job Description:
"""
${project.description}
"""

Generate the proposal now following the markdown rules strictly:`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.openaiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.65,
      max_tokens: 400,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error (${response.status}): ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawProposal = data.choices?.[0]?.message?.content?.trim() || '';
  let cleaned = rawProposal.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  // Enforce Line 1: "Hi" alone
  const lines = cleaned.split('\n');
  if (lines.length > 0 && lines[0].trim().toLowerCase().startsWith('hi')) {
    lines[0] = 'Hi';
    cleaned = lines.join('\n');
  }

  if (!cleaned) {
    throw new Error('OpenAI returned an empty response.');
  }

  return cleaned;
}

/**
 * Submit real bid via Freelancer API (if user has OAuth token)
 */
async function submitFreelancerBid(project, amount, proposal) {
  const token = activeConfig.freelancerOAuthToken;
  if (!token) return false;

  try {
    const response = await fetch('https://www.freelancer.com/api/projects/0.1/bids/', {
      method: 'POST',
      headers: {
        'freelancer-oauth-v1': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: project.id,
        bidder_id: 0,
        amount: amount,
        period: activeConfig.defaultDeliveryDays,
        milestone_percentage: 100,
        description: proposal,
      }),
    });

    return response.ok;
  } catch (e) {
    console.error('[FreelancerAutoBid] Error posting bid to Freelancer API:', e);
    return false;
  }
}

/**
 * Sync scanned/bid result with Local Express Dashboard
 */
async function recordProjectResult(project) {
  try {
    await fetch(`${LOCAL_DASHBOARD_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
  } catch (e) {
    // Local dashboard is offline or unreachable; continue
  }
}

function showProjectNotification(projectId, title, message, url) {
  if (chrome.notifications) {
    const notifId = `freelancer_notif_${projectId}_${Date.now()}`;
    if (url) {
      notificationUrls.set(notifId, url);
    }
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: title,
      message: message,
      priority: 2,
    });
  }
}
