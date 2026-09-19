/**
 * Popup: the automation switch, live counters, and the dashboard link.
 * Every other setting lives on the dashboard and is pulled by the worker before each poll,
 * so a control here would be overwritten within seconds; the master switch writes through.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const autoBidToggle = $('autoBidToggle');
  const masterSub = $('masterSub');
  const statusBadge = $('statusBadge');
  const versionLabel = $('versionLabel');
  const activity = $('activity');
  const dashboardUrlInput = $('dashboardUrlInput');
  const saveDashboardBtn = $('saveDashboardBtn');
  const dashboardStatus = $('dashboardStatus');
  const openDashboardLink = $('openDashboardLink');
  const pollNowBtn = $('pollNowBtn');
  const resetSeenBtn = $('resetSeenBtn');
  const resetSeenStatus = $('resetSeenStatus');
  const tokenInput = $('tokenInput');
  const saveTokenBtn = $('saveTokenBtn');
  const tokenStatus = $('tokenStatus');

  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

  const { dashboardUrl: savedUrl, extensionToken: savedToken } = await chrome.storage.local.get(['dashboardUrl', 'extensionToken']);
  const dashboard = (savedUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const authHeaders = savedToken ? { Authorization: `Bearer ${savedToken}` } : {};
  if (savedToken) {
    tokenInput.value = savedToken;
    tokenStatus.textContent = '✓ Token saved';
    tokenStatus.style.color = '#34d399';
  }
  dashboardUrlInput.value = dashboard;
  openDashboardLink.href = dashboard;

  const renderEnabled = (enabled) => {
    autoBidToggle.checked = !!enabled;
    statusBadge.textContent = enabled ? 'ACTIVE' : 'PAUSED';
    statusBadge.className = `status-badge ${enabled ? 'status-active' : 'status-paused'}`;
    masterSub.textContent = enabled ? 'Scanning the feed and bidding on matches' : 'Scanning and bidding are off';
  };

  const renderStatus = (status) => {
    if (!status || !status.activeConfig) return;
    renderEnabled(status.activeConfig.autoBidEnabled);
    $('scannedCount').textContent = status.processedCount || 0;
    $('queuedCount').textContent = status.queueLength || 0;

    const s = status.lastPollSummary;
    const lines = [];
    if (status.lastPollAt) {
      const ago = Math.max(0, Math.round((Date.now() - status.lastPollAt) / 1000));
      lines.push(`Last poll <strong>${ago}s ago</strong>`);
    }
    if (s) {
      lines.push(`Fetched <strong>${s.fetched}</strong> · new <strong>${s.fetched - s.alreadySeen}</strong> · qualified <strong>${s.qualified}</strong>`);
      if (s.aiChecks) lines.push(`AI checked <strong>${s.aiChecks}</strong>, rejected <strong>${s.aiRejected}</strong>`);
      if (s.topSkipReason) lines.push(`Top skip: ${s.topSkipReason}`);
      $('eligibleCount').textContent = s.qualified || 0;
    }
    if (status.activeBid) lines.push(`<span class="warn">Bidding now:</span> ${status.activeBid.title.slice(0, 40)}`);
    if (!status.hasExtensionToken) lines.push('<span class="err">No extension token. Generate one on Dashboard → Admin.</span>');
    else if (status.lastAuthFailureAt && Date.now() - status.lastAuthFailureAt < 10 * 60000) lines.push('<span class="err">Dashboard rejected the token. Regenerate it on Dashboard → Admin.</span>');
    if (!status.activeConfig.openaiApiKey) lines.push('<span class="err">No OpenAI key — set it on Dashboard → Admin.</span>');
    if (status.lastError) {
      const ago = status.lastErrorAt ? Math.round((Date.now() - status.lastErrorAt) / 60000) : null;
      const when = ago === null ? '' : ago < 1 ? ' (just now)' : ` (${ago}m ago)`;
      lines.push(`<span class="err">Last poll error${when}: ${String(status.lastError).slice(0, 90)}</span>`);
    }
    if (lines.length) activity.innerHTML = lines.join('<br>');
  };

  const refresh = () => chrome.runtime.sendMessage({ type: 'GET_STATUS' }, renderStatus);
  refresh();

  // Bids placed today, from the dashboard's own count.
  try {
    const res = await fetch(`${dashboard}/api/dashboard`, { headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      $('bidsCount').textContent = data.stats?.bidsToday ?? 0;
    }
  } catch (e) {}

  // The master switch is the only setting written from here. It must reach the dashboard
  // too, otherwise the next config sync would flip it straight back.
  autoBidToggle.addEventListener('change', () => {
    const enabled = autoBidToggle.checked;
    renderEnabled(enabled);
    chrome.runtime.sendMessage({ type: 'SET_AUTOMATION_ENABLED', enabled }, (res) => {
      if (res && res.dashboardUpdated === false) {
        masterSub.textContent = 'Saved locally; dashboard unreachable';
      }
    });
  });

  saveTokenBtn.addEventListener('click', () => {
    const token = (tokenInput.value || '').trim();
    tokenStatus.textContent = 'Checking…';
    tokenStatus.style.color = '#94a3b8';
    chrome.runtime.sendMessage({ type: 'SET_EXTENSION_TOKEN', token }, (res) => {
      if (res && res.success) {
        tokenStatus.textContent = '✓ Token accepted by the dashboard';
        tokenStatus.style.color = '#34d399';
      } else {
        tokenStatus.textContent = res && res.status === 401 ? '✗ Dashboard rejected this token' : `✗ Could not reach the dashboard (${res ? res.status : 'no response'})`;
        tokenStatus.style.color = '#f87171';
      }
      refresh();
    });
  });

  saveDashboardBtn.addEventListener('click', () => {
    const url = (dashboardUrlInput.value || '').trim().replace(/\/+$/, '');
    chrome.runtime.sendMessage({ type: 'SET_DASHBOARD_URL', url }, () => {
      dashboardStatus.textContent = `✓ Dashboard set to ${url || 'http://localhost:3000'}`;
      dashboardStatus.style.color = '#34d399';
      openDashboardLink.href = url || 'http://localhost:3000';
    });
  });

  pollNowBtn.addEventListener('click', () => {
    pollNowBtn.textContent = 'Polling…';
    pollNowBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'TRIGGER_POLL_NOW' }, () => {
      pollNowBtn.textContent = '⚡ Poll Now';
      pollNowBtn.disabled = false;
      refresh();
    });
  });

  resetSeenBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_PROCESSED_IDS' }, (res) => {
      resetSeenStatus.textContent = `✓ Cleared ${res?.cleared ?? 0} seen projects (${res?.kept ?? 0} attempted kept). Poll Now to re-evaluate.`;
      resetSeenStatus.style.color = '#34d399';
      refresh();
    });
  });
});
