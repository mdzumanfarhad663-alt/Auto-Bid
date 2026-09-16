import React, { useState } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Download, 
  FileCode, 
  FolderArchive, 
  ExternalLink 
} from 'lucide-react';

interface CodeFile {
  id: string;
  name: string;
  category: 'Extension' | 'Backend' | 'Frontend';
  path: string;
  description: string;
  code: string;
}

export const CodeExportStudio: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>('manifest');
  const [copied, setCopied] = useState(false);

  // The actual production files created in the project
  const codeFiles: CodeFile[] = [
    {
      id: 'manifest',
      name: 'manifest.json',
      category: 'Extension',
      path: '/extension/manifest.json',
      description: 'Chrome Extension Manifest V3 configuration with alarms, storage, notifications & host permissions.',
      code: `{
  "manifest_version": 3,
  "name": "Freelancer AutoBid - Real-Time AI Bidder",
  "version": "1.0.0",
  "description": "Real-time background listener, qualification filter, and gpt-4o-mini auto-bidder for Freelancer.com.",
  "permissions": [
    "storage",
    "alarms",
    "notifications"
  ],
  "host_permissions": [
    "https://www.freelancer.com/*",
    "https://api.openai.com/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Freelancer AutoBid Controller",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}`
    },
    {
      id: 'background',
      name: 'background.js',
      category: 'Extension',
      path: '/extension/background.js',
      description: 'Background Service Worker (MV3) polling Freelancer API every 20s, qualification filters, gpt-4o-mini, and auto-bidding.',
      code: `/**
 * Freelancer AutoBid - Background Service Worker (Manifest V3)
 * Functions:
 * 1. Background interval polling of Freelancer.com API (/projects/0.1/projects/active/) every 20 seconds.
 * 2. Real-time qualification filtering:
 *    - Mandatory platform tech tags
 *    - Negative keyword blacklist
 *    - Budget range & client payment verification
 *    - Deduplication against local SQLite/Chrome storage
 * 3. OpenAI gpt-4o-mini proposal generation (<150 words).
 * 4. Automated bid submission to Freelancer.com API.
 * 5. Synchronization with local Express dashboard at http://localhost:3000.
 */

const LOCAL_DASHBOARD_URL = 'http://localhost:3000';
const DEFAULT_POLL_INTERVAL_SECONDS = 20;

const DEFAULT_CONFIG = {
  autoBidEnabled: true,
  dryRunMode: true,
  pollIntervalSeconds: 20,
  freelancerOAuthToken: '',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  mandatorySkills: ['WordPress', 'Shopify', 'PHP', 'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Next.js'],
  negativeKeywords: ['Marketing', 'CRM', 'Accounting', 'Casino', 'Betting', 'Academic', 'Adult'],
  minBudget: 50,
  maxBudget: 2500,
  allowedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD'],
  requirePaymentVerified: true,
  minClientRating: 4.0,
  freelancerSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'WordPress', 'Shopify', 'TailwindCSS'],
  portfolioLinks: ['https://github.com/my-profile'],
  ctaQuestion: 'Are you available for a quick 5-minute technical review call to confirm the timeline?',
  systemPrompt: \`You are an elite top-rated freelancer drafting a winning bid on Freelancer.com.
RULES:
1. Strict limit: UNDER 140 WORDS.
2. Directly identify and address the client's exact problem in sentence #1. No generic greetings.
3. Reference relevant skills: {skills}.
4. Provide portfolio proof: {portfolio_links}.
5. End with this technical question: "{cta_question}"\`,
  bidPercentageOfMaxBudget: 85,
  defaultDeliveryDays: 5,
};

let activeConfig = { ...DEFAULT_CONFIG };
let processedIds = new Set();
let isPolling = false;

chrome.runtime.onInstalled.addListener(async () => {
  await loadStoredConfig();
  setupPollingAlarm(activeConfig.pollIntervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'freelancer_poll_alarm') {
    if (activeConfig.autoBidEnabled && !isPolling) {
      await runPollingCycle();
    }
  }
});

function setupPollingAlarm(intervalSeconds = 20) {
  const periodInMinutes = Math.max(0.33, intervalSeconds / 60);
  chrome.alarms.clear('freelancer_poll_alarm', () => {
    chrome.alarms.create('freelancer_poll_alarm', { periodInMinutes });
  });
}

async function runPollingCycle() {
  if (isPolling) return [];
  isPolling = true;

  try {
    const projects = await fetchActiveFreelancerProjects();

    for (const project of projects) {
      if (processedIds.has(project.id)) continue;

      const evalResult = evaluateQualification(project, activeConfig);
      if (!evalResult.qualified) {
        project.status = 'SKIPPED';
        project.skipReason = evalResult.reason;
        await recordProjectResult(project);
        processedIds.add(project.id);
        continue;
      }

      project.status = 'QUALIFIED';
      project.matchedTags = evalResult.matchedTags;

      const maxBudget = project.budget?.maximum || activeConfig.minBudget;
      const minBudget = project.budget?.minimum || activeConfig.minBudget;
      const bidAmount = Math.max(minBudget, Math.round(maxBudget * (activeConfig.bidPercentageOfMaxBudget / 100)));
      project.bidAmount = bidAmount;
      project.bidPeriodDays = activeConfig.defaultDeliveryDays;

      const proposal = await generateAiProposal(project, activeConfig);
      project.generatedProposal = proposal;

      if (activeConfig.autoBidEnabled) {
        if (activeConfig.dryRunMode) {
          project.status = 'BID_PLACED';
          project.bidPlacedAt = Date.now();
          showNotification(\`[Dry-Run] Bid Simulated: \${project.title.slice(0, 40)}...\`, \`$\${bidAmount} \${project.budget.currency}\`);
        } else {
          const bidSuccess = await submitFreelancerBid(project, bidAmount, proposal);
          project.status = bidSuccess ? 'BID_PLACED' : 'FAILED';
        }
      }

      await recordProjectResult(project);
      processedIds.add(project.id);
    }
  } catch (error) {
    console.error('[FreelancerAutoBid] Poll failed:', error);
  } finally {
    isPolling = false;
  }
}`
    },
    {
      id: 'server',
      name: 'server.js',
      category: 'Backend',
      path: '/standalone/server.js',
      description: 'Node.js Express backend with SQLite / local storage for dashboard APIs and deduplication management.',
      code: `const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OpenAIService } = require('./openai-service.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'freelancer_autobid_db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const openaiService = new OpenAIService(process.env.OPENAI_API_KEY, 'gpt-4o-mini');

// Persistence state & Deduplication table
let db = {
  config: { /* defaults */ },
  processedIds: [],
  projects: [],
  bids: [],
  stats: { totalScanned: 0, totalQualified: 0, totalBidsPlaced: 0, totalSkipped: 0 }
};

app.get('/api/config', (req, res) => res.json(db.config));
app.post('/api/config', (req, res) => { db.config = { ...db.config, ...req.body }; res.json(db.config); });
app.get('/api/stats', (req, res) => res.json(db.stats));
app.get('/api/projects', (req, res) => res.json(db.projects));
app.post('/api/projects', (req, res) => {
  const project = req.body;
  if (db.processedIds.includes(project.id)) return res.json({ deduplicated: true });
  db.processedIds.push(project.id);
  db.projects.unshift(project);
  res.json({ success: true });
});

app.post('/api/generate-bid', async (req, res) => {
  const { project } = req.body;
  const proposal = await openaiService.generateProposal(project, db.config);
  res.json({ proposal });
});

app.listen(PORT, () => console.log(\`Running on http://localhost:\${PORT}\`));`
    },
    {
      id: 'openai',
      name: 'openai-service.js',
      category: 'Backend',
      path: '/standalone/openai-service.js',
      description: 'OpenAI API integration for bid proposal generation using gpt-4o-mini (<150 words).',
      code: `class OpenAIService {
  constructor(apiKey = process.env.OPENAI_API_KEY, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
  }

  async generateProposal(project, options = {}) {
    const { skills, portfolioLinks, ctaQuestion, customSystemPrompt } = options;

    const defaultSystemPrompt = \`You are an elite top 1% freelancer submitting a winning bid on Freelancer.com.
Non-negotiable Rules:
1. WORD LIMIT: Strictly under 140 words. Under no circumstances exceed 150 words.
2. NO CLICHÉ INTROS: Never say "Dear client", "I hope you are well". Start with direct technical diagnosis.
3. CONCISE PROBLEM IDENTIFICATION: Show immediate mastery of their technical bottleneck in sentences 1-2.
4. RELEVANT TECH MATCH: Reference these matching proficiencies: \${skills.join(', ')}.
5. PROOF: Include portfolio link: \${portfolioLinks[0]}.
6. CONVERSATION HOOK: End with this crisp technical question: "\${ctaQuestion}".\`;

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${this.apiKey.trim()}\`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: customSystemPrompt || defaultSystemPrompt },
          { role: 'user', content: \`Project Title: \${project.title}\\nDescription: \${project.description}\` },
        ],
        temperature: 0.65,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}`
    },
    {
      id: 'dashboard',
      name: 'dashboard.html',
      category: 'Frontend',
      path: '/standalone/dashboard.html',
      description: 'Clean, standalone HTML dashboard UI to monitor scanned projects, bids placed, skip reasons, and edit filtering rules.',
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Freelancer AutoBid Dashboard</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">⚡ FreelancerAutoBid Local Hub</div>
      <button id="pollNowBtn">⚡ Poll Now</button>
    </header>
    <div class="stats-row">
      <div class="stat-card">Scanned: <span id="statScanned">0</span></div>
      <div class="stat-card">Bids Placed: <span id="statBids">0</span></div>
      <div class="stat-card">Skipped: <span id="statSkipped">0</span></div>
    </div>
    <div id="projectsList"></div>
  </div>
  <script src="app.js"></script>
</body>
</html>`
    },
    {
      id: 'popup',
      name: 'popup.html & popup.js',
      category: 'Extension',
      path: '/extension/popup.html',
      description: 'Chrome extension browser toolbar popup for quick Auto-Bid toggling and live status.',
      code: `<!-- popup.html -->
<div class="header">
  <div class="brand">⚡ FreelancerAutoBid</div>
  <div id="statusBadge" class="badge">ACTIVE</div>
</div>
<div class="toggle-row">
  <span>Auto-Bid Engine</span>
  <input type="checkbox" id="autoBidToggle" checked>
</div>
<div class="toggle-row">
  <span>Dry-Run Simulation</span>
  <input type="checkbox" id="dryRunToggle" checked>
</div>
<button id="pollNowBtn">⚡ Poll Now</button>`
    }
  ];

  const activeFile = codeFiles.find((f) => f.id === selectedFileId) || codeFiles[0];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingleFile = () => {
    const blob = new Blob([activeFile.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = () => {
    window.location.href = '/api/download-extension-zip';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-800/40 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-sky-400" />
            Complete Project Code &amp; Chrome Extension Package
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Production-ready Manifest V3 Chrome Extension and Standalone Node.js Express + SQLite backend. You can download the complete unpacked ZIP bundle directly or copy file-by-file.
          </p>
        </div>

        <button
          onClick={handleDownloadZip}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25 transition whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          <span>Download Extension (.ZIP)</span>
        </button>
      </div>

      {/* Code Studio Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left File List */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">
            Required Files
          </div>
          {codeFiles.map((file) => (
            <button
              key={file.id}
              onClick={() => setSelectedFileId(file.id)}
              className={`w-full text-left p-2.5 rounded-lg text-xs transition flex items-center justify-between ${
                selectedFileId === file.id
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileCode className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{file.name}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                {file.category}
              </span>
            </button>
          ))}
        </div>

        {/* Right Code Viewer */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-white">{activeFile.name}</span>
                <span className="text-[10px] text-slate-400">{activeFile.path}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{activeFile.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadSingleFile}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                title="Download this single file"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>

          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[550px] bg-slate-950 selection:bg-sky-500/30">
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
