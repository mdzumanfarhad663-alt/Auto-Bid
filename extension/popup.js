/**
 * Popup Script for Freelancer AutoBid Chrome Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const autoBidToggle = document.getElementById('autoBidToggle');
  const handsFreeToggle = document.getElementById('handsFreeToggle');
  const delaySelect = document.getElementById('delaySelect');
  const autoOpenToggle = document.getElementById('autoOpenToggle');
  const dryRunToggle = document.getElementById('dryRunToggle');
  const notifToggle = document.getElementById('notifToggle');
  const intervalSelect = document.getElementById('intervalSelect');
  const statusBadge = document.getElementById('statusBadge');
  const scannedCount = document.getElementById('scannedCount');
  const bidsCount = document.getElementById('bidsCount');
  const pollNowBtn = document.getElementById('pollNowBtn');
  const openaiKeyInput = document.getElementById('openaiKeyInput');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const keyStatus = document.getElementById('keyStatus');

  // Load status from background service worker & storage
  chrome.storage.local.get(['handsFreeAutoSubmit', 'autoSubmitDelaySeconds', 'autoOpenQualified', 'openaiApiKey', 'config'], (localData) => {
    if (handsFreeToggle) handsFreeToggle.checked = localData.handsFreeAutoSubmit !== false;
    if (delaySelect && localData.autoSubmitDelaySeconds !== undefined) {
      delaySelect.value = localData.autoSubmitDelaySeconds.toString();
    }
    if (autoOpenToggle) autoOpenToggle.checked = !!localData.autoOpenQualified;
    
    const key = localData.openaiApiKey || localData.config?.openaiApiKey || '';
    if (openaiKeyInput && key) {
      openaiKeyInput.value = key;
      if (keyStatus) {
        keyStatus.textContent = '✓ OpenAI API Key configured';
        keyStatus.style.color = '#34d399';
      }
    }
  });

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response && response.activeConfig) {
      const cfg = response.activeConfig;
      autoBidToggle.checked = !!cfg.autoBidEnabled;
      dryRunToggle.checked = !!cfg.dryRunMode;
      if (handsFreeToggle && cfg.handsFreeAutoSubmit !== undefined) {
        handsFreeToggle.checked = !!cfg.handsFreeAutoSubmit;
      }
      if (delaySelect && cfg.autoSubmitDelaySeconds !== undefined) {
        delaySelect.value = cfg.autoSubmitDelaySeconds.toString();
      }
      if (autoOpenToggle && cfg.autoOpenQualified !== undefined) {
        autoOpenToggle.checked = !!cfg.autoOpenQualified;
      }
      if (notifToggle) notifToggle.checked = cfg.desktopNotifications !== false;
      if (intervalSelect && cfg.pollIntervalSeconds) {
        intervalSelect.value = cfg.pollIntervalSeconds >= 60 ? '60' : '30';
      }
      if (openaiKeyInput && cfg.openaiApiKey && !openaiKeyInput.value) {
        openaiKeyInput.value = cfg.openaiApiKey;
        if (keyStatus) {
          keyStatus.textContent = '✓ OpenAI API Key configured';
          keyStatus.style.color = '#34d399';
        }
      }
      updateStatusBadge(cfg.autoBidEnabled);
      scannedCount.textContent = response.processedCount || 0;
    }
  });

  // Try to query local dashboard for up-to-date stats and sync key
  try {
    const res = await fetch('http://localhost:3000/api/stats');
    if (res.ok) {
      const stats = await res.json();
      scannedCount.textContent = stats.totalScanned || 0;
      bidsCount.textContent = stats.totalBidsPlaced || 0;
    }

    const cfgRes = await fetch('http://localhost:3000/api/config');
    if (cfgRes.ok) {
      const remoteConfig = await cfgRes.json();
      if (remoteConfig.openaiApiKey && (!openaiKeyInput.value || openaiKeyInput.value === '')) {
        openaiKeyInput.value = remoteConfig.openaiApiKey;
        if (keyStatus) {
          keyStatus.textContent = '✓ OpenAI API Key loaded from Dashboard';
          keyStatus.style.color = '#34d399';
        }
      }
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

  if (saveKeyBtn) {
    saveKeyBtn.addEventListener('click', () => {
      const key = openaiKeyInput.value.trim();
      chrome.storage.local.set({ openaiApiKey: key });
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: { openaiApiKey: key },
      });
      if (keyStatus) {
        keyStatus.textContent = key ? '✓ OpenAI API Key saved!' : '⚠️ Key is empty';
        keyStatus.style.color = key ? '#34d399' : '#fbbf24';
      }
    });
  }

  autoBidToggle.addEventListener('change', () => {
    const enabled = autoBidToggle.checked;
    updateStatusBadge(enabled);
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { autoBidEnabled: enabled },
    });
  });

  if (handsFreeToggle) {
    handsFreeToggle.addEventListener('change', () => {
      const enabled = handsFreeToggle.checked;
      chrome.storage.local.set({ handsFreeAutoSubmit: enabled });
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: { handsFreeAutoSubmit: enabled },
      });
    });
  }

  if (delaySelect) {
    delaySelect.addEventListener('change', () => {
      const delay = parseInt(delaySelect.value, 10) || 0;
      chrome.storage.local.set({ autoSubmitDelaySeconds: delay });
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: { autoSubmitDelaySeconds: delay },
      });
    });
  }

  if (autoOpenToggle) {
    autoOpenToggle.addEventListener('change', () => {
      const enabled = autoOpenToggle.checked;
      chrome.storage.local.set({ autoOpenQualified: enabled });
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: { autoOpenQualified: enabled },
      });
    });
  }

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
