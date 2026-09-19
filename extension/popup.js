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

  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

  const { dashboardUrl: savedUrl } = await chrome.storage.local.get('dashboardUrl');
  const dashboard = (savedUrl || 'http://localhost:3000').replace(/\/+$/, '');
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
    if (!status.activeConfig.openaiApiKey) lines.push('<span class="err">No OpenAI key — set it on the dashboard.</span>');
    if (status.lastError) lines.push(`<span class="err">${String(status.lastError).slice(0, 90)}</span>`);
    if (lines.length) activity.innerHTML = lines.join('<br>');
  };

  const refresh = () => chrome.runtime.sendMessage({ type: 'GET_STATUS' }, renderStatus);
  refresh();

  // Bids placed today, from the dashboard's own count.
  try {
    const res = await fetch(`${dashboard}/api/dashboard`);
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
