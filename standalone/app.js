/**
 * Standalone Dashboard Frontend App Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const statScanned = document.getElementById('statScanned');
  const statQualified = document.getElementById('statQualified');
  const statBids = document.getElementById('statBids');
  const statSkipped = document.getElementById('statSkipped');
  const projectsList = document.getElementById('projectsList');
  const bidsList = document.getElementById('bidsList');
  const pollNowBtn = document.getElementById('pollNowBtn');

  // Settings inputs
  const mandatorySkillsInput = document.getElementById('mandatorySkillsInput');
  const negativeKeywordsInput = document.getElementById('negativeKeywordsInput');
  const minBudgetInput = document.getElementById('minBudgetInput');
  const maxBudgetInput = document.getElementById('maxBudgetInput');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const saveConfigBtn2 = document.getElementById('saveConfigBtn2');

  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  const tabContents = {
    feed: document.getElementById('tab-feed'),
    bids: document.getElementById('tab-bids'),
    settings: document.getElementById('tab-settings'),
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      Object.keys(tabContents).forEach((k) => {
        tabContents[k].style.display = k === target ? 'block' : 'none';
      });
    });
  });

  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const stats = await res.json();
        statScanned.textContent = stats.totalScanned || 0;
        statQualified.textContent = stats.totalQualified || 0;
        statBids.textContent = stats.totalBidsPlaced || 0;
        statSkipped.textContent = stats.totalSkipped || 0;
      }
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const projects = await res.json();
        renderProjects(projects);
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    }
  }

  async function loadBids() {
    try {
      const res = await fetch('/api/bids');
      if (res.ok) {
        const bids = await res.json();
        renderBids(bids);
      }
    } catch (e) {
      console.error('Failed to load bids', e);
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        mandatorySkillsInput.value = (config.mandatorySkills || []).join(', ');
        negativeKeywordsInput.value = (config.negativeKeywords || []).join(', ');
        minBudgetInput.value = config.minBudget || 50;
        maxBudgetInput.value = config.maxBudget || 2500;
        systemPromptInput.value = config.systemPrompt || '';
      }
    } catch (e) {
      console.error('Failed to load config', e);
    }
  }

  async function saveConfig() {
    const updated = {
      mandatorySkills: mandatorySkillsInput.value.split(',').map((s) => s.trim()).filter(Boolean),
      negativeKeywords: negativeKeywordsInput.value.split(',').map((s) => s.trim()).filter(Boolean),
      minBudget: Number(minBudgetInput.value) || 50,
      maxBudget: Number(maxBudgetInput.value) || 2500,
      systemPrompt: systemPromptInput.value,
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        alert('Settings saved successfully!');
      }
    } catch (e) {
      alert('Failed to save settings: ' + e.message);
    }
  }

  saveConfigBtn.addEventListener('click', saveConfig);
  if (saveConfigBtn2) saveConfigBtn2.addEventListener('click', saveConfig);

  pollNowBtn.addEventListener('click', async () => {
    pollNowBtn.textContent = 'Polling...';
    try {
      await fetch('/api/poll-now', { method: 'POST' });
      await Promise.all([loadStats(), loadProjects(), loadBids()]);
    } catch (e) {
      console.error('Manual poll failed', e);
    } finally {
      pollNowBtn.textContent = '⚡ Poll Now';
    }
  });

  function renderProjects(projects) {
    if (!projects || projects.length === 0) {
      projectsList.innerHTML = '<div style="color: #64748b; padding: 20px; text-align: center;">No projects scanned yet. Click Poll Now or start background polling.</div>';
      return;
    }

    projectsList.innerHTML = projects.map((p) => {
      let badgeClass = 'badge-pending';
      if (p.status === 'BID_PLACED') badgeClass = 'badge-bid';
      if (p.status === 'SKIPPED') badgeClass = 'badge-skipped';

      return `
        <div class="project-card">
          <div class="project-header">
            <div class="project-title">${escapeHtml(p.title)}</div>
            <span class="badge ${badgeClass}">${p.status}</span>
          </div>
          <div class="meta-row">
            <span>💰 Budget: ${p.budget.minimum} - ${p.budget.maximum} ${p.budget.currency}</span>
            <span>👤 Client: ${escapeHtml(p.client.username)} (${p.client.country || 'Global'})</span>
            <span>⭐ Rating: ${p.client.rating.toFixed(1)} (${p.client.reviewsCount} reviews)</span>
            <span>🛡️ Payment: ${p.client.paymentVerified ? 'Verified' : 'Unverified'}</span>
          </div>
          <p style="color: #94a3b8; font-size: 13px; margin-bottom: 8px;">${escapeHtml(p.description.slice(0, 240))}...</p>
          ${p.skipReason ? `<div class="reason-box"><strong>Reason:</strong> ${escapeHtml(p.skipReason)}</div>` : ''}
          ${p.generatedProposal ? `<div class="proposal-box"><strong>Generated Proposal (${p.bidAmount} ${p.budget.currency}):</strong><br/>${escapeHtml(p.generatedProposal)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderBids(bids) {
    if (!bids || bids.length === 0) {
      bidsList.innerHTML = '<div style="color: #64748b; padding: 20px; text-align: center;">No bids placed yet.</div>';
      return;
    }

    bidsList.innerHTML = bids.map((b) => `
      <div class="project-card">
        <div class="project-header">
          <div class="project-title">${escapeHtml(b.projectTitle)}</div>
          <span class="badge badge-bid">${b.status}</span>
        </div>
        <div class="meta-row">
          <span>💰 Bid Amount: $${b.bidAmount} ${b.currency}</span>
          <span>⏱️ Delivery: ${b.deliveryDays} days</span>
          <span>📅 Date: ${new Date(b.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="proposal-box">
          ${escapeHtml(b.proposal)}
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Initial fetch and 10s auto-refresh
  loadStats();
  loadProjects();
  loadBids();
  loadConfig();
  setInterval(() => {
    loadStats();
    loadProjects();
    loadBids();
  }, 10000);
});
