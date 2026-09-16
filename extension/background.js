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
 * 5. OpenAI gpt-4o-mini personalized proposal generation (<140 words).
 * 6. Automated bid submission (or Dry-Run simulation / manual copy & apply).
 * 7. Real-time synchronization with local dashboard at http://localhost:3000.
 */

const LOCAL_DASHBOARD_URL = 'http://localhost:3000';
const DEFAULT_POLL_INTERVAL_SECONDS = 30;

// Default configuration (defaults to Public Feed with NO OAuth token required)
const DEFAULT_CONFIG = {
  autoBidEnabled: true,
  dryRunMode: true, // Safe default: generates proposals and notifies without spending real bid credits
  pollIntervalSeconds: 30, // 30s or 60s (1 min)
  feedSource: 'auto', // 'auto' | 'rss' | 'public_api' (100% No OAuth required!)
  desktopNotifications: true,
  audioAlerts: true,
  freelancerOAuthToken: '', // Optional! Left blank for public feed
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  mandatorySkills: ['WordPress', 'Shopify', 'PHP', 'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Next.js', 'Python', 'SEO', 'Data Entry'],
  negativeKeywords: ['Casino', 'Betting', 'Academic', 'Essay', 'Adult', 'Crypto Trading Bot'],
  minBudget: 20,
  maxBudget: 3500,
  allowedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR'],
  requirePaymentVerified: false, // Default false so public feed projects aren't rejected
  minClientRating: 4.0,
  freelancerSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'WordPress', 'Shopify', 'TailwindCSS', 'REST APIs', 'Python'],
  portfolioLinks: ['https://github.com/my-profile', 'https://myportfolio.dev'],
  ctaQuestion: 'Are you available for a quick 5-minute technical review call to confirm the timeline?',
  systemPrompt: `You are an elite top-rated freelancer drafting a winning bid on Freelancer.com.
RULES:
1. Strict limit: UNDER 140 WORDS.
2. Directly identify and address the client's exact problem in sentence #1. No generic greetings.
3. Reference relevant skills: {skills}.
4. Provide portfolio proof: {portfolio_links}.
5. End with this technical question: "{cta_question}"`,
  bidPercentageOfMaxBudget: 85,
  defaultDeliveryDays: 5,
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

// Notification click listener: opens project URL directly on Freelancer!
if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const url = notificationUrls.get(notificationId);
    if (url) {
      chrome.tabs.create({ url });
    }
  });
}

// Message Listener from Popup / Dashboard
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

  if (message.type === 'TRIGGER_POLL_NOW') {
    runPollingCycle().then((results) => {
      sendResponse({ success: true, results });
    });
    return true;
  }
});

async function loadStoredConfig() {
  const data = await chrome.storage.local.get(['config', 'processedIds']);
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

      // Project Qualified!
      project.status = 'QUALIFIED';
      project.matchedTags = evalResult.matchedTags;

      // Calculate Bid Amount
      const maxBudget = project.budget?.maximum || activeConfig.minBudget;
      const minBudget = project.budget?.minimum || activeConfig.minBudget;
      const bidAmount = Math.max(
        minBudget,
        Math.round(maxBudget * (activeConfig.bidPercentageOfMaxBudget / 100))
      );

      project.bidAmount = bidAmount;
      project.bidPeriodDays = activeConfig.defaultDeliveryDays;

      // Generate AI Proposal with gpt-4o-mini
      const proposal = await generateAiProposal(project, activeConfig);
      project.generatedProposal = proposal;

      // Submit Bid or Simulate / Dry-Run
      if (activeConfig.autoBidEnabled) {
        // Build direct AutoBid URL with proposal and auto_submit flag
        const autoSubmitFlag = activeConfig.handsFreeAutoSubmit !== false ? '1' : '0';
        const autobidHash = `#autobid_p=${encodeURIComponent(proposal)}&amount=${bidAmount}&period=${project.bidPeriodDays || 5}&auto_submit=${autoSubmitFlag}`;
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

          // Autonomous mode: open tab automatically if autoOpenQualified is enabled
          if (activeConfig.autoOpenQualified && directApplyUrl) {
            console.log('[FreelancerAutoBid] Autonomous Auto-Open triggered for project:', project.id);
            chrome.tabs.create({ url: directApplyUrl, active: false });
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
 * Local Qualification Filtering Logic
 */
function evaluateQualification(project, config) {
  const fullText = `${project.title} ${project.description}`.toLowerCase();
  const jobNames = (project.jobs || []).map((j) => j.name.toLowerCase());

  // 1. Mandatory Platform Check: Require explicit tech tags
  const matchedTags = config.mandatorySkills.filter((skill) => {
    const sLower = skill.toLowerCase();
    return jobNames.some((j) => j.includes(sLower)) || fullText.includes(sLower);
  });

  if (matchedTags.length === 0) {
    return { qualified: false, reason: 'Ineligible: Missing mandatory platform tech tags' };
  }

  // 2. Negative Keyword Blacklist
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

  // 3. Budget & Client Qualification
  if (project.budget.maximum > 0 && project.budget.maximum < config.minBudget) {
    return { qualified: false, reason: `Budget below minimum ($${project.budget.maximum} < $${config.minBudget})` };
  }

  if (project.budget.minimum > config.maxBudget) {
    return { qualified: false, reason: `Budget exceeds ceiling ($${project.budget.minimum} > $${config.maxBudget})` };
  }

  if (config.allowedCurrencies.length > 0 && !config.allowedCurrencies.includes(project.budget.currency)) {
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
 * OpenAI gpt-4o-mini Bid Proposal Generator
 */
async function generateAiProposal(project, config) {
  const apiKey = config.openaiApiKey;
  const skillsList = config.freelancerSkills.join(', ');
  const portfolioList = config.portfolioLinks.slice(0, 2).join(' | ');

  const systemInstruction = config.systemPrompt
    .replace('{skills}', skillsList)
    .replace('{portfolio_links}', portfolioList)
    .replace('{cta_question}', config.ctaQuestion);

  const userPrompt = `Project Title: ${project.title}
Budget: ${project.budget.minimum} - ${project.budget.maximum} ${project.budget.currency}
Required Skills: ${project.jobs.map((j) => j.name).join(', ')}
Description:
${project.description}

Write a winning proposal under 140 words:`;

  if (apiKey) {
    try {
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
          max_tokens: 300,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch (e) {
      console.warn('[FreelancerAutoBid] Direct OpenAI call failed, falling back to local dashboard proxy:', e);
    }
  }

  // Fallback: Proxy to local server or fallback template
  try {
    const proxyRes = await fetch(`${LOCAL_DASHBOARD_URL}/api/generate-bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    });
    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      return proxyData.proposal;
    }
  } catch (err) {
    console.warn('[FreelancerAutoBid] Local server proxy unavailable:', err);
  }

  // Standard Deterministic Fallback
  return `Hi, I reviewed your requirements for "${project.title}". With deep production expertise in ${skillsList.split(',').slice(0, 3).join(', ')}, I can deliver this cleanly and reliably within your timeline. Portfolio proof: ${portfolioList}. ${config.ctaQuestion}`;
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
