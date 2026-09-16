/**
 * Standalone Local Dashboard & AutoBid Server (server.js)
 * Stack: Node.js, Express, SQLite / Embedded Database
 * Run directly with: node server.js
 */

const express = require('express');
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

// Initialize OpenAI Service
const openaiService = new OpenAIService(process.env.OPENAI_API_KEY, 'gpt-4o-mini');

// Local SQLite-compatible persistence state
const defaultDb = {
  config: {
    autoBidEnabled: true,
    dryRunMode: true,
    pollIntervalSeconds: 20,
    mandatorySkills: ['WordPress', 'Shopify', 'PHP', 'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Next.js'],
    negativeKeywords: ['Marketing', 'CRM', 'Accounting', 'Casino', 'Betting', 'Academic'],
    minBudget: 50,
    maxBudget: 2500,
    allowedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD'],
    requirePaymentVerified: true,
    minClientRating: 4.0,
    freelancerSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'WordPress', 'Shopify', 'TailwindCSS'],
    portfolioLinks: ['https://github.com/my-profile'],
    ctaQuestion: 'Are you available for a brief 5-minute technical review call to confirm the timeline?',
    bidPercentageOfMaxBudget: 85,
    defaultDeliveryDays: 5,
  },
  processedIds: [],
  projects: [],
  bids: [],
  stats: {
    totalScanned: 0,
    totalQualified: 0,
    totalBidsPlaced: 0,
    totalSkipped: 0,
    lastPollTimestamp: Date.now(),
  }
};

function loadDb() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not read DB file, using defaults');
  }
  return defaultDb;
}

let db = loadDb();

function saveDb() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save DB file:', e);
  }
}

// REST APIs
app.get('/api/config', (req, res) => {
  res.json(db.config);
});

app.post('/api/config', (req, res) => {
  db.config = { ...db.config, ...req.body };
  saveDb();
  res.json({ success: true, config: db.config });
});

app.get('/api/stats', (req, res) => {
  res.json(db.stats);
});

app.get('/api/projects', (req, res) => {
  res.json(db.projects.slice(0, 100));
});

app.post('/api/projects', (req, res) => {
  const project = req.body;
  if (!project || !project.id) {
    return res.status(400).json({ error: 'Invalid project payload' });
  }

  // Deduplication check
  if (db.processedIds.includes(project.id)) {
    return res.json({ success: true, deduplicated: true });
  }

  db.processedIds.push(project.id);
  db.projects.unshift(project);
  if (db.projects.length > 300) db.projects = db.projects.slice(0, 300);

  db.stats.totalScanned += 1;
  db.stats.lastPollTimestamp = Date.now();

  if (project.status === 'BID_PLACED') {
    db.stats.totalQualified += 1;
    db.stats.totalBidsPlaced += 1;
    db.bids.unshift({
      id: `bid-${project.id}-${Date.now()}`,
      projectId: project.id,
      projectTitle: project.title,
      clientUsername: project.client?.username || 'client',
      bidAmount: project.bidAmount || 0,
      currency: project.budget?.currency || 'USD',
      deliveryDays: project.bidPeriodDays || 5,
      proposal: project.generatedProposal || '',
      timestamp: Date.now(),
      status: db.config.dryRunMode ? 'SIMULATED' : 'SUCCESS',
    });
  } else if (project.status === 'SKIPPED') {
    db.stats.totalSkipped += 1;
  }

  saveDb();
  res.json({ success: true, project });
});

app.get('/api/bids', (req, res) => {
  res.json(db.bids.slice(0, 100));
});

// Proposal Generation API
app.post('/api/generate-bid', async (req, res) => {
  try {
    const { project } = req.body;
    if (!project) return res.status(400).json({ error: 'Project data missing' });

    const proposal = await openaiService.generateProposal(project, {
      skills: db.config.freelancerSkills,
      portfolioLinks: db.config.portfolioLinks,
      ctaQuestion: db.config.ctaQuestion,
      customSystemPrompt: db.config.systemPrompt,
    });

    res.json({ proposal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health & Root
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[FreelancerAutoBid] Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/dashboard.html to view dashboard`);
});
