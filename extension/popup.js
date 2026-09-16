/**
 * Popup Script for Freelancer AutoBid Chrome Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const autoBidToggle = document.getElementById('autoBidToggle');
  const dryRunToggle = document.getElementById('dryRunToggle');
  const notifToggle = document.getElementById('notifToggle');
  const intervalSelect = document.getElementById('intervalSelect');
  const statusBadge = document.getElementById('statusBadge');
  const scannedCount = document.getElementById('scannedCount');
  const bidsCount = document.getElementById('bidsCount');
  const pollNowBtn = document.getElementById('pollNowBtn');

  // Load status from background service worker
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response && response.activeConfig) {
      const cfg = response.activeConfig;
      autoBidToggle.checked = !!cfg.autoBidEnabled;
      dryRunToggle.checked = !!cfg.dryRunMode;
      if (notifToggle) notifToggle.checked = cfg.desktopNotifications !== false;
      if (intervalSelect && cfg.pollIntervalSeconds) {
        intervalSelect.value = cfg.pollIntervalSeconds >= 60 ? '60' : '30';
      }
      updateStatusBadge(cfg.autoBidEnabled);
      scannedCount.textContent = response.processedCount || 0;
    }
  });

  // Try to query local dashboard for up-to-date stats
  try {
    const res = await fetch('http://localhost:3000/api/stats');
    if (res.ok) {
      const stats = await res.json();
      scannedCount.textContent = stats.totalScanned || 0;
      bidsCount.textContent = stats.totalBidsPlaced || 0;
    }
  } catch (e) {
    // Local dashboard not responding
  }

  function updateStatusBadge(isActive) {
    if (isActive) {
      statusBadge.textContent = 'ACTIVE';
      statusBadge.className = 'status-badge status-active';
    } else {
      statusBadge.textContent = 'PAUSED';
      statusBadge.className = 'status-badge status-paused';
    }
  }

  autoBidToggle.addEventListener('change', () => {
    const enabled = autoBidToggle.checked;
    updateStatusBadge(enabled);
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { autoBidEnabled: enabled },
    });
  });

  dryRunToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { dryRunMode: dryRunToggle.checked },
    });
  });

  if (notifToggle) {
    notifToggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: { desktopNotifications: notifToggle.checked },
      });
    });
  }

  if (intervalSelect) {
    intervalSelect.addEventListener('change', () => {
      const seconds = parseInt(intervalSelect.value, 10) || 30;
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: { pollIntervalSeconds: seconds },
      });
    });
  }

  pollNowBtn.addEventListener('click', () => {
    pollNowBtn.textContent = 'Polling Feed...';
    chrome.runtime.sendMessage({ type: 'TRIGGER_POLL_NOW' }, () => {
      setTimeout(() => {
        pollNowBtn.textContent = '⚡ Poll Feed Now';
      }, 1000);
    });
  });
});
