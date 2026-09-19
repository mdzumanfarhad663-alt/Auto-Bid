/**
 * Freelancer AutoBid - Background Service Worker (Manifest V3)
 * 
 * Features:
 * 1. Background interval polling directly from Freelancer public feed (RSS/API).
 * 2. Instant Chrome Desktop Notifications on newly discovered & qualified projects.
 * 3. Centralized AutoBid Tab Management & Tracking:
 *    - Strict tab ownership: only closes tabs opened by AutoBid.
 *    - Centralized 10-second auto-close on terminal SUCCESS and terminal FAILURE.
 *    - Race-condition and duplicate-timer prevention.
 * 4. Real-time qualification filtering (tech tags, negative keywords, budget normalization).
 * 5. Normalized Round-Figure Bid Pricing ($5, $10, $50 ceiling steps).
 * 6. OpenAI proposal generation adhering to strict custom markdown rules.
 */

import { buildActiveFeedUrl, mapActiveProject, evaluateProject } from './qualification.js';
import { checkRelevance } from './relevance.js';

const LOCAL_DASHBOARD_URL = 'http://localhost:3000';

// The dashboard can be hosted anywhere (Render, a VPS, localhost). The extension reads its
// config and OpenAI key from it, so the URL has to be settable rather than hardcoded.
let dashboardUrl = LOCAL_DASHBOARD_URL;

function getDashboardUrl() {
  return (dashboardUrl || LOCAL_DASHBOARD_URL).replace(/\/+$/, '');
}

async function loadDashboardUrl() {
  try {
    const { dashboardUrl: stored } = await chrome.storage.local.get('dashboardUrl');
    if (stored && typeof stored === 'string' && stored.trim()) {
      dashboardUrl = stored.trim();
      console.log('[FreelancerAutoBid] Dashboard URL:', getDashboardUrl());
    }
  } catch (e) {}
}
const DEFAULT_POLL_INTERVAL_SECONDS = 30;

// Default configuration
const DEFAULT_CONFIG = {
  autoBidEnabled: true,
  dryRunMode: false,
  pollIntervalSeconds: 30,
  feedSource: 'auto',
  desktopNotifications: true,
  audioAlerts: true,
  freelancerOAuthToken: '',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  mandatorySkills: ['WordPress', 'Shopify', 'PHP', 'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Next.js', 'Python', 'SEO', 'Data Entry', 'Web Development', 'Full Stack Development'],
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
  requirePaymentVerified: false,
  requiredClientVerifications: [],
  minClientRating: 0,
  minClientCategoryRatings: {},
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
  aiRelevanceEnabled: true,
  relevancePrompt: '',
  relevanceMinScore: 60,
  bidPercentageOfMaxBudget: 85,
  defaultDeliveryDays: 5,
  handsFreeAutoSubmit: true,
  autoSubmitDelaySeconds: 2,
  autoOpenQualified: true,
  autoCloseTabOnSuccess: true,
  autoCloseDelaySeconds: 20,
  closeTabOnFailure: true,
};

// In-memory runtime cache
let activeConfig = { ...DEFAULT_CONFIG };
let processedIds = new Set();
let isPolling = false;

// Last-known worker state, reported to the dashboard. Without this the service worker is a
// black box: its console is only reachable from chrome://extensions.
let lastPollAt = 0;
let lastPollSummary = null;
let lastError = null;

// Projects whose proposal generation or relevance check failed for a recoverable
// reason, and how often. Given up on after MAX_PROPOSAL_ATTEMPTS.
const proposalFailureCounts = new Map();
const aiFailureCounts = new Map();
const MAX_PROPOSAL_ATTEMPTS = 3;

let configSource = 'defaults';

async function reportHeartbeat(extra = {}) {
  const payload = {
    version: chrome.runtime.getManifest().version,
    reportedAt: Date.now(),
    lastPollAt,
    lastPollSummary,
    lastError,
    queueLength: bidQueue.length,
    processedCount: processedIds.size,
    activeBid: activeBid ? { projectId: activeBid.projectId, title: activeBid.title, tabId: activeBid.tabId } : null,
    config: {
      autoBidEnabled: activeConfig.autoBidEnabled,
      autoOpenQualified: activeConfig.autoOpenQualified,
      handsFreeAutoSubmit: activeConfig.handsFreeAutoSubmit,
      dryRunMode: activeConfig.dryRunMode,
      hasOpenAiKey: !!(activeConfig.openaiApiKey && activeConfig.openaiApiKey.trim()),
      pollIntervalSeconds: activeConfig.pollIntervalSeconds,
      mandatorySkills: activeConfig.mandatorySkills || [],
      requirePaymentVerified: activeConfig.requirePaymentVerified,
      minClientRating: activeConfig.minClientRating,
      minBudget: activeConfig.minBudget,
      maxBudget: activeConfig.maxBudget,
      allowedCurrencies: activeConfig.allowedCurrencies,
    },
    configSource,
    dashboardUrl: getDashboardUrl(),
    ...extra,
  };

  try {
    await fetch(`${getDashboardUrl()}/api/extension-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.log('[FreelancerAutoBid] Heartbeat failed (dashboard unreachable):', e.message);
  }
}
const notificationUrls = new Map();

// Tab Ownership & Auto-Close Management
const autoBidOpenedTabs = new Set();
const scheduledTabCloses = new Map(); // tabId -> timerId

// Serial bid queue: exactly one project tab open at a time. A poll cycle can match several
// projects, and opening them all at once floods the browser and makes every tab race over
// the single pendingAutoBid payload in storage.
let bidQueue = [];
let activeBid = null; // { tabId, projectId, title, startedAt }
let bidWatchdogTimer = null;

// Every project ever opened for bidding, with what happened. A project gets exactly one
// attempt: once it is here it is never queued or opened again, whatever the outcome, and
// clearing the seen list does not touch it. Persisted, because the worker restarts often.
let bidOutcomes = {}; // projectId -> { outcome: 'submitted' | 'failed', reason, at }

function hasBeenAttempted(projectId) {
  return Object.prototype.hasOwnProperty.call(bidOutcomes, String(projectId));
}

async function persistQueueState() {
  try {
    await chrome.storage.local.set({ bidQueue, activeBid, bidOutcomes });
  } catch (e) {}
}

async function persistProcessedIds() {
  try {
    await chrome.storage.local.set({ processedIds: Array.from(processedIds).slice(-1000) });
  } catch (e) {}
}

/**
 * Rebuild queue state after a service worker restart. The active tab may or may not
 * still exist; if it is gone the slot is released so the queue can move on.
 */
async function restoreQueueState() {
  try {
    const data = await chrome.storage.local.get(['bidQueue', 'activeBid', 'bidOutcomes']);
    if (data.bidOutcomes && typeof data.bidOutcomes === 'object') bidOutcomes = data.bidOutcomes;
    if (Array.isArray(data.bidQueue)) bidQueue = data.bidQueue.filter((e) => e && e.projectId && !hasBeenAttempted(e.projectId));

    if (data.activeBid && data.activeBid.tabId) {
      try {
        await chrome.tabs.get(data.activeBid.tabId);
        activeBid = data.activeBid;
        console.log(`[AutoBid Queue] Resumed active bid on "${activeBid.title}" in tab ${activeBid.tabId}`);
      } catch (e) {
        console.log('[AutoBid Queue] Active bid tab is gone after restart, releasing the slot.');
        recordOutcome(data.activeBid.projectId, 'failed', 'tab closed during worker restart');
        activeBid = null;
      }
    }
  } catch (e) {}
  await persistQueueState();
  processBidQueue();
}

function recordOutcome(projectId, outcome, reason) {
  if (!projectId) return;
  bidOutcomes[String(projectId)] = { outcome, reason: reason || '', at: Date.now() };
  processedIds.add(projectId);

  fetch(`${getDashboardUrl()}/api/projects/${projectId}/outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome, reason }),
  }).catch(() => {});
}

const QUEUE_MAX_AGE_MS = 15 * 60 * 1000; // a project this stale has too many bids to be worth one
const BID_WATCHDOG_MS = 3 * 60 * 1000; // a stuck tab must never freeze the queue forever

/**
 * Centralized Bid Amount Normalization (Ceiling / Round-Up)
 */
function normalizeBidAmount(amount) {
  if (!amount || isNaN(amount) || amount <= 0) return 15;
  const raw = Number(amount);
  if (raw <= 50) return Math.ceil(raw / 5) * 5;
  if (raw <= 300) return Math.ceil(raw / 10) * 10;
  return Math.ceil(raw / 50) * 50;
}

/**
 * Close an AutoBid-opened project tab after a delay, so the result stays readable first.
 */
function scheduleProjectTabClose(tabId, reason, delayMs) {
  if (!tabId) return;
  if (scheduledTabCloses.has(tabId)) return;

  const wait = Number.isFinite(delayMs) ? delayMs : (activeConfig.autoCloseDelaySeconds || 20) * 1000;
  console.log(`[AutoBid Tab] Closing tab ${tabId} in ${Math.round(wait / 1000)}s (${reason})`);

  const timer = setTimeout(() => {
    scheduledTabCloses.delete(tabId);
    chrome.tabs.remove(tabId).catch(() => {
      // Already gone, which is fine: onRemoved has done the bookkeeping.
    });
  }, wait);

  scheduledTabCloses.set(tabId, timer);
}

/**
 * Queue a qualified project instead of opening it immediately.
 */
function enqueueProjectForBid(entry) {
  if (!entry || !entry.url) return;

  if (hasBeenAttempted(entry.projectId)) {
    console.log(`[AutoBid Queue] Not re-queueing "${entry.title}": already attempted (${bidOutcomes[String(entry.projectId)].outcome})`);
    return;
  }

  const alreadyQueued = bidQueue.some((q) => q.projectId === entry.projectId);
  const isActive = activeBid && activeBid.projectId === entry.projectId;
  if (alreadyQueued || isActive) return;

  bidQueue.push({ ...entry, queuedAt: Date.now() });
  console.log(`[AutoBid Queue] Queued "${entry.title}" (queue length: ${bidQueue.length})`);
  persistQueueState();
  processBidQueue();
}

/**
 * Open the next queued project, but only when no bid is currently in flight.
 */
function processBidQueue() {
  if (activeBid) return;
  if (activeConfig.autoOpenQualified === false) return;

  // Drop anything that sat in the queue too long to be worth bidding on.
  const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
  const fresh = bidQueue.filter((e) => e.queuedAt >= cutoff);
  if (fresh.length !== bidQueue.length) {
    console.log(`[AutoBid Queue] Dropped ${bidQueue.length - fresh.length} stale project(s)`);
    bidQueue = fresh;
  }

  let next = bidQueue.shift();
  while (next && hasBeenAttempted(next.projectId)) next = bidQueue.shift();
  if (!next) {
    persistQueueState();
    return;
  }

  // Claim the slot synchronously. Opening a tab is async, and several projects can be
  // enqueued in the same tick, so waiting for the callback to set activeBid would let
  // every one of them past the guard above and open all their tabs at once.
  activeBid = { tabId: null, projectId: next.projectId, title: next.title, startedAt: Date.now() };

  // The payload is written per project, immediately before its tab opens, so the content
  // script in that tab can never pick up another project's proposal.
  chrome.storage.local.set({
    pendingAutoBid: {
      proposal: next.proposal,
      amount: next.amount,
      period: next.period,
      autoSubmit: activeConfig.handsFreeAutoSubmit !== false,
      projectId: next.projectId,
      timestamp: Date.now(),
    },
    handsFreeAutoSubmit: activeConfig.handsFreeAutoSubmit !== false,
    autoSubmitDelaySeconds: activeConfig.autoSubmitDelaySeconds || 2,
  }).then(() => {
    chrome.tabs.create({ url: next.url, active: true }, (newTab) => {
      if (!newTab || !newTab.id) {
        console.warn('[AutoBid Queue] Failed to open project tab, moving to next.');
        activeBid = null;
        processBidQueue();
        return;
      }

      autoBidOpenedTabs.add(newTab.id);
      if (activeBid && activeBid.projectId === next.projectId) {
        activeBid.tabId = newTab.id;
      }
      persistQueueState();
      console.log(`[AutoBid Queue] Bidding on "${next.title}" in tab ${newTab.id} (${bidQueue.length} waiting)`);

      if (bidWatchdogTimer) clearTimeout(bidWatchdogTimer);
      bidWatchdogTimer = setTimeout(() => {
        if (activeBid && activeBid.tabId === newTab.id) {
          console.warn('[AutoBid Queue] Bid timed out with no result, releasing the queue.');
          finishActiveBid('watchdog timeout', activeConfig.closeTabOnFailure !== false, 'failed');
        }
      }, BID_WATCHDOG_MS);
    });
  });
}

/**
 * Release the queue after the active bid settles, record the outcome, then start the next.
 */
function finishActiveBid(reason, shouldClose, outcome = 'failed') {
  if (!activeBid) return;

  const { tabId, title, projectId } = activeBid;
  activeBid = null;
  recordOutcome(projectId, outcome, reason);
  persistQueueState();
  persistProcessedIds();

  if (bidWatchdogTimer) {
    clearTimeout(bidWatchdogTimer);
    bidWatchdogTimer = null;
  }

  console.log(`[AutoBid Queue] Finished "${title}": ${reason}`);

  const delayMs = (activeConfig.autoCloseDelaySeconds || 20) * 1000;
  if (shouldClose) {
    scheduleProjectTabClose(tabId, reason, delayMs);
    // Start the next project as the finished tab closes, so only one is ever open.
    setTimeout(processBidQueue, delayMs);
  } else {
    processBidQueue();
  }
}

// Clean up tab tracking if user manually closes tab
if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    await ensureStateLoaded();
    if (scheduledTabCloses.has(tabId)) {
      clearTimeout(scheduledTabCloses.get(tabId));
      scheduledTabCloses.delete(tabId);
    }
    autoBidOpenedTabs.delete(tabId);

    // Closing the active tab by hand is a valid way to skip a project.
    if (activeBid && activeBid.tabId === tabId) {
      finishActiveBid('tab closed by user', false, 'failed');
    }
  });
}

// State is loaded once per worker lifetime. Every entry point awaits this, because a
// revived worker starts with empty module variables regardless of which event woke it.
let stateReady = null;
function ensureStateLoaded() {
  if (!stateReady) {
    stateReady = loadStoredConfig().catch((e) => {
      console.error('[FreelancerAutoBid] Failed to load state:', e);
    });
  }
  return stateReady;
}

// Initialize service worker
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[FreelancerAutoBid] Service worker installed.');
  await ensureStateLoaded();
  setupPollingAlarm(activeConfig.pollIntervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[FreelancerAutoBid] Service worker started.');
  await ensureStateLoaded();
  setupPollingAlarm(activeConfig.pollIntervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS);
});

// Runs on every worker evaluation, including revivals for alarms, messages and tab events.
ensureStateLoaded();

// Alarm Listener for periodic background execution (30s / 60s)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'freelancer_poll_alarm') {
    // Chrome kills an idle worker and revives it for the alarm with empty module state.
    // Without reloading, processedIds is empty and the whole feed gets re-queued.
    await ensureStateLoaded();
    if (activeConfig.autoBidEnabled && !isPolling) {
      await runPollingCycle();
    }
  }
});

// Tab update listener: whenever a Freelancer project page completes loading, deliver autofill payload
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('freelancer.com/projects')) {
      await ensureStateLoaded();
      // Only the tab the queue opened gets the payload. Any other Freelancer project tab,
      // such as one opened by hand, would otherwise be filled with a stale proposal.
      if (!activeBid || activeBid.tabId !== tabId) return;

      const stored = await chrome.storage.local.get(['pendingAutoBid', 'handsFreeAutoSubmit', 'autoSubmitDelaySeconds']);
      if (stored && stored.pendingAutoBid && stored.pendingAutoBid.projectId === activeBid.projectId) {
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

// Notification click listener: opens project URL directly on Freelancer and tracks tab
if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const url = notificationUrls.get(notificationId);
    if (url) {
      chrome.tabs.create({ url }, (newTab) => {
        if (newTab && newTab.id) {
          autoBidOpenedTabs.add(newTab.id);
          console.log('[FreelancerAutoBid] Tracked notification-opened AutoBid tab:', newTab.id);
        }
      });
    }
  });
}

// Message Listener from Popup / Dashboard / Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ensureStateLoaded().then(() => handleMessage(message, sender, sendResponse));
  return true; // response is sent asynchronously
});

function handleMessage(message, sender, sendResponse) {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      activeConfig,
      processedCount: processedIds.size,
      isPolling,
      lastPollAt,
      lastPollSummary,
      lastError,
      queueLength: bidQueue.length,
      activeBid: activeBid ? { projectId: activeBid.projectId, title: activeBid.title } : null,
      configSource,
    });
    return true;
  }

  // The master switch. Written to the dashboard as well, because the dashboard is the
  // source of truth and would otherwise revert it on the next config sync.
  if (message.type === 'SET_AUTOMATION_ENABLED') {
    const enabled = message.enabled !== false;
    activeConfig.autoBidEnabled = enabled;
    chrome.storage.local.set({ config: activeConfig });
    fetch(`${getDashboardUrl()}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoBidEnabled: enabled }),
    })
      .then((res) => sendResponse({ success: true, enabled, dashboardUpdated: res.ok }))
      .catch(() => sendResponse({ success: true, enabled, dashboardUpdated: false }));
    console.log(`[FreelancerAutoBid] Automation ${enabled ? 'enabled' : 'paused'} from popup.`);
    return true;
  }

  if (message.type === 'REGISTER_AUTOBID_TAB') {
    if (sender.tab && sender.tab.id) {
      autoBidOpenedTabs.add(sender.tab.id);
      console.log('[FreelancerAutoBid] Registered AutoBid tab:', sender.tab.id);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'UPDATE_CONFIG') {
    activeConfig = { ...activeConfig, ...message.config };
    chrome.storage.local.set({ config: activeConfig });
    setupPollingAlarm(activeConfig.pollIntervalSeconds);
    sendResponse({ success: true, activeConfig });
    return true;
  }

  // Forget which projects have been seen, so the current feed is evaluated again.
  // Projects already opened for a bid stay excluded: they get one attempt, ever.
  if (message.type === 'CLEAR_PROCESSED_IDS') {
    const attempted = new Set(Object.keys(bidOutcomes).map(Number));
    const cleared = Array.from(processedIds).filter((id) => !attempted.has(id)).length;
    processedIds = new Set(attempted);
    proposalFailureCounts.clear();
    persistProcessedIds();
    console.log(`[FreelancerAutoBid] Cleared ${cleared} seen project ids (${attempted.size} attempted kept).`);
    sendResponse({ success: true, cleared, kept: attempted.size });
    return true;
  }

  if (message.type === 'SET_DASHBOARD_URL') {
    dashboardUrl = (message.url || '').trim() || LOCAL_DASHBOARD_URL;
    chrome.storage.local.set({ dashboardUrl });
    console.log('[FreelancerAutoBid] Dashboard URL set to:', getDashboardUrl());
    sendResponse({ success: true, dashboardUrl: getDashboardUrl() });
    return true;
  }

  // A bid finished: close its tab after the review delay, then release the queue.
  if (message.type === 'BID_AUTO_SUBMITTED' || message.type === 'BID_COMPLETED') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;
    if (activeBid && activeBid.tabId === tabId) {
      finishActiveBid('bid submitted', activeConfig.autoCloseTabOnSuccess !== false, 'submitted');
    } else if (tabId && autoBidOpenedTabs.has(tabId) && activeConfig.autoCloseTabOnSuccess !== false) {
      scheduleProjectTabClose(tabId, 'bid submitted');
    }
    sendResponse({ success: true });
    return true;
  }

  // The project turned out to be closed, already bid on, or otherwise unbiddable.
  if (message.type === 'BID_FAILED' || message.type === 'SCHEDULE_TAB_CLOSE' || message.type === 'CLOSE_CURRENT_TAB') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;
    const reason = message.reason || 'bid not possible';
    if (activeBid && activeBid.tabId === tabId) {
      finishActiveBid(reason, activeConfig.closeTabOnFailure !== false, 'failed');
    } else if (tabId && autoBidOpenedTabs.has(tabId) && activeConfig.closeTabOnFailure !== false) {
      scheduleProjectTabClose(tabId, reason);
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

  sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
  return true;
}

/**
 * Pull the current filter settings from the dashboard.
 * The dashboard is where the user edits filters, so it wins over the stored copy. Loading
 * the stored copy whenever one existed meant the extension kept running whatever settings
 * it first cached and never saw a change made on the dashboard again.
 */
async function syncConfigFromDashboard() {
  try {
    const res = await fetch(`${getDashboardUrl()}/api/config`);
    if (!res.ok) return false;

    const remoteConfig = await res.json();
    if (!remoteConfig || typeof remoteConfig !== 'object') return false;

    const localKey = activeConfig.openaiApiKey;
    activeConfig = { ...DEFAULT_CONFIG, ...activeConfig, ...remoteConfig };

    // Keep a key held only by the extension when the dashboard has none.
    if (!activeConfig.openaiApiKey && localKey) activeConfig.openaiApiKey = localKey;

    await chrome.storage.local.set({ config: activeConfig });
    configSource = 'dashboard';
    return true;
  } catch (e) {
    configSource = 'local (dashboard unreachable)';
    return false;
  }
}

async function loadStoredConfig() {
  await loadDashboardUrl();
  const data = await chrome.storage.local.get(['config', 'processedIds', 'openaiApiKey']);
  if (data.config) {
    activeConfig = { ...DEFAULT_CONFIG, ...data.config };
    configSource = 'local';
  }

  // Always ask the dashboard, so edits made there take effect here.
  await syncConfigFromDashboard();

  if (data.openaiApiKey && !activeConfig.openaiApiKey) {
    activeConfig.openaiApiKey = data.openaiApiKey;
  }

  if (activeConfig.autoOpenQualified === undefined) {
    activeConfig.autoOpenQualified = true;
  }

  if (Array.isArray(data.processedIds)) {
    processedIds = new Set(data.processedIds);
  }

  await restoreQueueState();
}

function setupPollingAlarm(intervalSeconds = 30) {
  const periodInMinutes = Math.max(0.5, intervalSeconds / 60);
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
  const summary = { fetched: 0, alreadySeen: 0, skipped: 0, qualified: 0, queued: 0, proposalErrors: 0, aiChecks: 0, aiRejected: 0, aiCostUSD: 0, topSkipReason: null, skipReasons: {} };
  const skipReasons = summary.skipReasons;

  // Pick up filter changes made on the dashboard before evaluating this batch.
  await syncConfigFromDashboard();

  try {
    const projects = await fetchActiveFreelancerProjects();
    summary.fetched = projects.length;

    for (const project of projects) {
      if (processedIds.has(project.id) || hasBeenAttempted(project.id)) {
        summary.alreadySeen += 1;
        continue;
      }

      const evalResult = evaluateQualification(project, activeConfig);

      if (!evalResult.qualified) {
        summary.skipped += 1;
        const key = (evalResult.reason || 'unknown').split('(')[0].trim();
        skipReasons[key] = (skipReasons[key] || 0) + 1;
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

      project.matchedTags = evalResult.matchedTags;

      // AI relevance gate. Only survivors of the exact filters cost a model call.
      if (activeConfig.aiRelevanceEnabled !== false) {
        try {
          const apiKey = await resolveOpenAiKey();
          const verdict = await checkRelevance(project, { ...activeConfig, openaiApiKey: apiKey });
          project.relevance = {
            eligible: verdict.eligible,
            score: verdict.score,
            reason: verdict.reason,
            model: verdict.model,
            costUSD: verdict.costUSD,
          };
          summary.aiChecks += 1;
          summary.aiCostUSD += verdict.costUSD;
          aiFailureCounts.delete(project.id);

          if (!verdict.eligible) {
            summary.aiRejected += 1;
            project.status = 'SKIPPED';
            project.skipReason = `Not relevant (${verdict.score}/100): ${verdict.reason}`;
            skipReasons['Not relevant'] = (skipReasons['Not relevant'] || 0) + 1;
            await recordProjectResult(project);
            processedIds.add(project.id);
            await persistProcessedIds();
            continue;
          }
        } catch (relevanceError) {
          // Fail closed and retry later, the same way a failed proposal is handled.
          console.error('[FreelancerAutoBid] Relevance check failed:', relevanceError.message);
          summary.proposalErrors += 1;
          lastError = `Relevance check failed: ${relevanceError.message}`;
          const attempts = (aiFailureCounts.get(project.id) || 0) + 1;
          aiFailureCounts.set(project.id, attempts);
          if (attempts >= MAX_PROPOSAL_ATTEMPTS) {
            project.status = 'SKIPPED';
            project.skipReason = `AI relevance check failed: ${relevanceError.message}`;
            await recordProjectResult(project);
            processedIds.add(project.id);
            await persistProcessedIds();
            aiFailureCounts.delete(project.id);
          }
          continue;
        }
      }

      // Project Qualified!
      summary.qualified += 1;
      project.status = 'QUALIFIED';

      // Calculate Bid Amount according to strategy & tiers
      const maxBudget = project.budget?.maximum || activeConfig.minBudget;
      const minBudget = project.budget?.minimum || activeConfig.minBudget;
      let rawBidAmount = minBudget;
      let bidDays = activeConfig.defaultDeliveryDays || 5;

      if (activeConfig.budgetTiersEnabled && activeConfig.budgetTiers && activeConfig.budgetTiers.length > 0) {
        const matchedTier = activeConfig.budgetTiers.find((t) => maxBudget >= t.minBudget && minBudget <= t.maxBudget);
        if (matchedTier) {
          rawBidAmount = Math.round(maxBudget * ((matchedTier.bidPercentage || 85) / 100));
          bidDays = matchedTier.deliveryDays || bidDays;
        } else {
          rawBidAmount = Math.round(maxBudget * ((activeConfig.bidPercentageOfMaxBudget || 85) / 100));
        }
      } else {
        switch (activeConfig.bidStrategy) {
          case 'low_end':
            rawBidAmount = minBudget;
            break;
          case 'midpoint':
            rawBidAmount = Math.round((minBudget + maxBudget) / 2);
            break;
          case 'fixed':
            rawBidAmount = activeConfig.fixedBidAmount || 50;
            break;
          case 'percentage_max':
          default:
            rawBidAmount = Math.round(maxBudget * ((activeConfig.bidPercentageOfMaxBudget || 85) / 100));
            break;
        }
      }

      // Centralized Ceiling Normalization
      let finalBidAmount = normalizeBidAmount(rawBidAmount);
      finalBidAmount = Math.max(minBudget, Math.min(finalBidAmount, maxBudget));

      console.log(`[AI PRICE] Recommended amount: $${rawBidAmount}`);
      console.log(`[BID PRICE] Rounded amount: $${finalBidAmount}`);

      project.bidAmount = finalBidAmount;
      project.bidPeriodDays = bidDays;

      // Generate AI Proposal with OpenAI according to user custom markdown prompt rules
      let proposal = '';
      try {
        proposal = await generateAiProposal(project, activeConfig);
        project.generatedProposal = proposal;
      } catch (genError) {
        console.error('[FreelancerAutoBid] Proposal generation failed:', genError.message);
        summary.proposalErrors += 1;
        lastError = `Proposal generation failed: ${genError.message}`;
        project.skipReason = `OpenAI Error: ${genError.message}`;
        project.status = 'FAILED';
        await recordProjectResult(project);

        // A missing key, a rate limit or a network blip is recoverable, so the project is
        // NOT marked as seen: marking it here permanently hides a biddable project from
        // every later poll. It is retried on the next cycles, then given up on.
        const attempts = (proposalFailureCounts.get(project.id) || 0) + 1;
        proposalFailureCounts.set(project.id, attempts);
        if (attempts >= MAX_PROPOSAL_ATTEMPTS) {
          console.warn(`[FreelancerAutoBid] Giving up on project ${project.id} after ${attempts} proposal attempts.`);
          processedIds.add(project.id);
          proposalFailureCounts.delete(project.id);
        }
        continue;
      }

      proposalFailureCounts.delete(project.id);

      // Submit Bid or Simulate / Dry-Run
      if (activeConfig.autoBidEnabled && proposal) {
        const autoSubmitFlag = activeConfig.handsFreeAutoSubmit !== false ? '1' : '0';
        const autobidHash = `#autobid_p=${encodeURIComponent(proposal)}&amount=${finalBidAmount}&period=${project.bidPeriodDays || 5}&auto_submit=${autoSubmitFlag}&autobid=1&pid=${project.id}`;
        const directApplyUrl = project.url ? `${project.url}${autobidHash}` : '';

        if (activeConfig.dryRunMode || !activeConfig.freelancerOAuthToken) {
          project.status = 'BID_PLACED';
          project.bidPlacedAt = Date.now();
          console.log(`[FreelancerAutoBid] [FEED NOTIFICATION] Qualified: "${project.title}" ($${finalBidAmount} ${project.budget.currency})`);
          
          if (activeConfig.desktopNotifications) {
            showProjectNotification(
              project.id,
              `🎯 Qualified: ${project.title.slice(0, 45)}...`,
              `Budget: ${project.budget.minimum}-${project.budget.maximum} ${project.budget.currency} | AutoBid Ready!`,
              directApplyUrl || project.url
            );
          }

          // Autonomous mode: queue the project. The queue opens one tab at a time.
          if (directApplyUrl && (activeConfig.autoOpenQualified !== false)) {
            summary.queued += 1;
            enqueueProjectForBid({
              projectId: project.id,
              title: project.title,
              url: directApplyUrl,
              proposal,
              amount: finalBidAmount,
              period: project.bidPeriodDays || 5,
            });
          }
        } else {
          // If real token provided, submit via Freelancer API
          const bidSuccess = await submitFreelancerBid(project, finalBidAmount, proposal);
          if (bidSuccess) {
            project.status = 'BID_PLACED';
            project.bidPlacedAt = Date.now();
            if (activeConfig.desktopNotifications) {
              showProjectNotification(
                project.id,
                `⚡ Real Bid Placed: ${project.title.slice(0, 45)}...`,
                `Amount: ${finalBidAmount} ${project.budget.currency}. Click to view on Freelancer.`,
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
      // Persist now, not at the end of the cycle: a worker restart mid-cycle must not
      // forget a project that was just queued and open it a second time.
      await persistProcessedIds();
      newProjectsProcessed.push(project);
    }

    await persistProcessedIds();
  } catch (error) {
    console.error('[FreelancerAutoBid] Polling cycle failed:', error);
    lastError = `Poll cycle failed: ${error.message}`;
  } finally {
    isPolling = false;
  }

  const sortedSkips = Object.entries(skipReasons).sort((a, b) => b[1] - a[1]);
  summary.topSkipReason = sortedSkips.length ? `${sortedSkips[0][0]} (${sortedSkips[0][1]})` : null;
  lastPollAt = Date.now();
  lastPollSummary = summary;
  console.log('[FreelancerAutoBid] Poll summary:', JSON.stringify(summary));
  reportHeartbeat();

  return newProjectsProcessed;
}

/**
 * Fetch and parse Freelancer's public RSS feed: https://www.freelancer.com/rss.xml
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

      let currency = 'USD';
      let minimum = 250;
      let maximum = 750;

      const budgetMatch = rawDesc.match(/Budget[:\s]+([A-Z]{3}|\$|€|£)\s*([\d,.]+)\s*-\s*([\d,.]+)/i) ||
                          rawDesc.match(/Budget[:\s]+([\d,.]+)\s*-\s*([\d,.]+)\s*([A-Z]{3})/i);

      if (budgetMatch) {
        const rawMin = parseFloat(budgetMatch[2].replace(/,/g, ''));
        const rawMax = parseFloat(budgetMatch[3].replace(/,/g, ''));
        if (!isNaN(rawMin)) minimum = rawMin;
        if (!isNaN(rawMax)) maximum = rawMax;
      }

      const cleanDesc = rawDesc
        .replace(/<[^>]*>/g, ' ')
        .replace(/Budget:[^.\n]+(\.|$)/gi, '')
        .replace(/Jobs:[^.\n]+(\.|$)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      projects.push({
        id,
        title,
        description: cleanDesc || title,
        submitDate: Date.now(),
        budget: {
          minimum,
          maximum,
          currency,
        },
        jobs: categories.map((cat, idx) => ({ id: idx + 1, name: cat })),
        // RSS carries no client data. Flagged so client-based filters skip rather than
        // judging invented values.
        client: {
          id: 0,
          username: 'freelancer_client',
          rating: 0,
          reviewsCount: 0,
          paymentVerified: false,
          identityVerified: false,
          country: 'Unknown',
        },
        clientDataAvailable: false,
        status: 'PENDING',
        url: link || `https://www.freelancer.com/projects/${id}`,
        feedSource: 'rss',
      });
    }

    return projects;
  } catch (err) {
    console.error('[FreelancerAutoBid] Error fetching RSS feed:', err);
    return [];
  }
}

/**
 * Fetch projects from Freelancer public active API
 */
async function fetchFromFreelancerPublicApi() {
  try {
    const res = await fetch(buildActiveFeedUrl(30));
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.result || !data.result.projects) return [];

    return data.result.projects.map(mapActiveProject);
  } catch (err) {
    console.error('[FreelancerAutoBid] Error querying Freelancer public API:', err);
    return [];
  }
}

/**
 * Fetch active projects from best available public feed
 */
// The logged-in Freelancer user, resolved once per worker lifetime. Null when the browser
// has no Freelancer session, in which case the already-bid check is left to the page.
let myFreelancerUserId = undefined;

async function getMyFreelancerUserId() {
  if (myFreelancerUserId !== undefined) return myFreelancerUserId;
  try {
    const res = await fetch('https://www.freelancer.com/api/users/0.1/self?compact=true&new_errors=true', {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    myFreelancerUserId = data.result && data.result.id ? data.result.id : null;
  } catch (e) {
    myFreelancerUserId = null;
  }
  if (!myFreelancerUserId) console.log('[FreelancerAutoBid] No Freelancer session in this browser; already-bid check deferred to the project page.');
  return myFreelancerUserId;
}

/**
 * Mark projects this account has already bid on. One request for the whole batch.
 */
async function markAlreadyBid(projects) {
  const me = await getMyFreelancerUserId();
  if (!me || !projects.length) return projects;

  try {
    const params = new URLSearchParams({ compact: 'true', new_errors: 'true' });
    params.append('bidders[]', String(me));
    for (const p of projects) params.append('projects[]', String(p.id));

    const res = await fetch(`https://www.freelancer.com/api/projects/0.1/bids?${params.toString()}`, {
      credentials: 'include',
    });
    if (!res.ok) return projects;

    const data = await res.json();
    const bidOn = new Set((data.result && data.result.bids ? data.result.bids : []).map((b) => b.project_id));
    for (const p of projects) {
      if (bidOn.has(p.id)) p.alreadyBid = true;
    }
  } catch (e) {
    console.log('[FreelancerAutoBid] Already-bid lookup failed:', e.message);
  }
  return projects;
}

async function fetchActiveFreelancerProjects() {
  const source = activeConfig.feedSource || 'auto';
  let projects;

  if (source === 'rss') {
    projects = await fetchFromFreelancerRssFeed();
  } else {
    // API first: it is the only source that carries client data.
    projects = await fetchFromFreelancerPublicApi();
    if (!projects || projects.length === 0) {
      projects = await fetchFromFreelancerRssFeed();
    }
  }

  return markAlreadyBid(projects || []);
}

/**
 * Real-time filter & qualification evaluation engine
 */
function evaluateQualification(project, config) {
  return evaluateProject(project, config);
}

/**
 * OpenAI Proposal Generator strictly adhering to the user's custom markdown rules.
 */
/**
 * OpenAI key, in precedence order: active config, extension storage, dashboard.
 */
async function resolveOpenAiKey() {
  let apiKey = activeConfig.openaiApiKey;
  if (!apiKey || apiKey.trim() === '') {
    const st = await chrome.storage.local.get(['openaiApiKey', 'config']);
    apiKey = st.openaiApiKey || st.config?.openaiApiKey;
  }

  if (!apiKey || apiKey.trim() === '') {
    try {
      const res = await fetch(`${getDashboardUrl()}/api/config`);
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

  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_openai')) return '';
  return apiKey.trim();
}

async function generateAiProposal(project, config) {
  const apiKey = (config.openaiApiKey && config.openaiApiKey.trim()) || (await resolveOpenAiKey());

  if (!apiKey) {
    showProjectNotification(
      project.id,
      '⚠️ OpenAI API Key Required',
      'Please enter your OpenAI API Key in the extension popup or dashboard to generate proposals according to your markdown rules.',
      getDashboardUrl()
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
    await fetch(`${getDashboardUrl()}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
  } catch (e) {}
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
