import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { projectStore, getExtensionVersion } from './src/services/store.ts';
import { generateProposal } from './src/services/openai.ts';
import { runPollCycle, startBackgroundPoller, fetchFreelancerActiveProjects } from './src/services/freelancer-poller.ts';
import { checkRelevance } from './extension/relevance.js';
import {
  isPasswordConfigured,
  checkPassword,
  setPassword,
  issueSessionCookie,
  verifySessionCookie,
  parseCookies,
  SESSION_COOKIE_NAME,
  generateExtensionToken,
  revokeExtensionToken,
  verifyExtensionToken,
  extensionTokenStatus,
  getOpenAiKey,
  setSecret,
  maskSecret,
  loginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} from './src/services/auth.ts';

const app = express();
const PORT = 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// The extension is the only cross-origin caller and it authenticates with a bearer token,
// so the browser never needs credentialed CORS. Cookies stay same-origin.
app.use(cors({ origin: false }));
app.use(express.json({ limit: '10mb' }));

// -------------------------------------------------------------
// AUTH
// -------------------------------------------------------------

function clientIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function bearerToken(req: express.Request): string | undefined {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

function hasSession(req: express.Request): boolean {
  return verifySessionCookie(parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]);
}

function hasExtensionToken(req: express.Request): boolean {
  return verifyExtensionToken(bearerToken(req));
}

const PUBLIC_API = new Set(['/api/health', '/api/auth/login', '/api/auth/me']);

// Every /api route needs the admin session or the extension token. Admin-only routes
// additionally reject the extension token further down.
app.use('/api', (req, res, next) => {
  if (PUBLIC_API.has(req.path === '/' ? '/api' : `/api${req.path}`)) return next();
  if (hasSession(req) || hasExtensionToken(req)) return next();
  res.status(401).json({ error: 'Authentication required' });
});

function adminOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (hasSession(req)) return next();
  res.status(403).json({ error: 'Admin session required' });
}

function setSessionCookie(res: express.Response) {
  const c = issueSessionCookie();
  res.setHeader(
    'Set-Cookie',
    `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(c.maxAgeMs / 1000)}${IS_PROD ? '; Secure' : ''}`
  );
}

app.post('/api/auth/login', (req, res) => {
  if (!isPasswordConfigured()) {
    return res.status(503).json({ error: 'No admin password configured. Set ADMIN_PASSWORD in the server environment.' });
  }
  const ip = clientIp(req);
  const gate = loginAllowed(ip);
  if (!gate.allowed) {
    return res.status(429).json({ error: `Too many attempts. Try again in ${gate.retryAfterSeconds}s.` });
  }
  const { password } = req.body || {};
  if (!checkPassword(password)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Incorrect password' });
  }
  clearLoginFailures(ip);
  setSessionCookie(res);
  res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? '; Secure' : ''}`);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ authenticated: hasSession(req), passwordConfigured: isPasswordConfigured() });
});

app.post('/api/auth/change-password', adminOnly, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!checkPassword(currentPassword)) return res.status(401).json({ error: 'Current password is incorrect' });
  if (typeof newPassword !== 'string' || newPassword.length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters' });
  }
  setPassword(newPassword);
  setSessionCookie(res);
  res.json({
    success: true,
    note: 'Saved on this server. On Render the disk is ephemeral: also update ADMIN_PASSWORD in the environment so it survives a redeploy.',
  });
});

// -------------------------------------------------------------
// ADMIN: secrets and extension token
// -------------------------------------------------------------

app.get('/api/admin/status', adminOnly, (req, res) => {
  const key = getOpenAiKey();
  res.json({
    openaiKey: { configured: !!key, masked: maskSecret(key), source: key && !process.env.OPENAI_API_KEY ? 'encrypted store' : key ? 'environment' : null },
    extensionToken: extensionTokenStatus(),
    sessionSecretFromEnv: !!(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD,
  });
});

app.post('/api/admin/openai-key', adminOnly, async (req, res) => {
  const key = String(req.body?.apiKey || '').trim();
  if (!key) {
    setSecret('openaiApiKey', '');
    return res.json({ success: true, cleared: true });
  }
  const probe = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
  if (!probe || !probe.ok) {
    return res.status(400).json({ error: `OpenAI rejected that key (HTTP ${probe ? probe.status : 'network error'})` });
  }
  setSecret('openaiApiKey', key);
  res.json({ success: true, masked: maskSecret(key) });
});

app.post('/api/admin/extension-token', adminOnly, (req, res) => {
  const token = generateExtensionToken();
  res.json({ success: true, token, note: 'Shown once. Paste it into the extension popup.' });
});

app.delete('/api/admin/extension-token', adminOnly, (req, res) => {
  revokeExtensionToken();
  res.json({ success: true });
});

// The extension needs the real key to call OpenAI itself. Token holders only.
app.get('/api/admin/secrets', (req, res) => {
  if (!hasExtensionToken(req)) return res.status(403).json({ error: 'Extension token required' });
  res.json({ openaiApiKey: getOpenAiKey() });
});

// -------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FreelancerAutoBid Engine',
    uptime: process.uptime(),
    dryRun: projectStore.getConfig().dryRunMode,
  });
});

// The extension service worker reports its state here. Its own console is only reachable
// from chrome://extensions, so without this there is no way to see why it is idle.
let lastExtensionHeartbeat: any = null;

app.post('/api/extension-heartbeat', (req, res) => {
  lastExtensionHeartbeat = { ...req.body, receivedAt: Date.now() };
  res.json({ success: true });
});

app.get('/api/extension-status', (req, res) => {
  if (!lastExtensionHeartbeat) {
    return res.json({ connected: false, message: 'No heartbeat received from the extension yet.' });
  }
  const ageSeconds = Math.round((Date.now() - lastExtensionHeartbeat.receivedAt) / 1000);
  res.json({ connected: ageSeconds < 300, ageSeconds, ...lastExtensionHeartbeat });
});

// Extension version, read from the manifest that the download ZIP is built from
app.get('/api/extension-version', (req, res) => {
  res.json({ version: getExtensionVersion() });
});

// Config endpoints. The key never rides along; hasOpenAiKey says whether one exists.
app.get('/api/config', (req, res) => {
  const key = getOpenAiKey();
  res.json({ ...projectStore.getConfig(), openaiApiKey: maskSecret(key), hasOpenAiKey: !!key });
});

app.post('/api/config', (req, res) => {
  const updated = projectStore.updateConfig(req.body);
  res.json({ success: true, config: updated });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json(projectStore.getStats());
});

// Dashboard aggregated data endpoint
app.get('/api/dashboard', (req, res) => {
  res.json(projectStore.getDashboardData());
});

// Projects feed
app.get('/api/projects', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(projectStore.getProjects(limit));
});

app.post('/api/projects', async (req, res) => {
  try {
    const rawProject = req.body;
    if (!rawProject || !rawProject.id) {
      return res.status(400).json({ error: 'Missing project payload' });
    }
    const processed = await projectStore.processProject(rawProject);
    res.json({ success: true, project: processed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Extension reports the result of a bid attempt in the project tab
app.post('/api/projects/:id/outcome', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { outcome, reason } = req.body || {};
  if (isNaN(projectId) || (outcome !== 'submitted' && outcome !== 'failed')) {
    return res.status(400).json({ error: 'Expected a project id and outcome of "submitted" or "failed"' });
  }
  const project = projectStore.recordBidOutcome(projectId, outcome, reason);
  if (!project) {
    return res.status(404).json({ error: `Project #${projectId} not found` });
  }
  res.json({ success: true, project });
});

// Generate proposal on-demand for a project (Saves OpenAI tokens!)
app.post('/api/projects/:id/prepare-bid', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const updated = await projectStore.generateProposalForProject(projectId);
    res.json({
      success: true,
      project: updated,
      proposal: updated.generatedProposal,
      proposalSource: updated.proposalSource,
      modelUsed: updated.modelUsed,
      pricingReasoning: updated.pricingReasoning,
      bidAmount: updated.bidAmount,
      bidPeriodDays: updated.bidPeriodDays,
      currency: updated.budget.currency,
      url: updated.url,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Validate OpenAI API Key
app.post('/api/validate-openai-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({ valid: false, error: 'API Key is empty' });
    }
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });
    if (response.ok) {
      res.json({ valid: true, message: 'OpenAI API key verified successfully!' });
    } else {
      const errorData = await response.json().catch(() => ({}));
      res.status(400).json({
        valid: false,
        error: errorData.error?.message || `OpenAI rejected key (HTTP ${response.status})`,
      });
    }
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Extension syncs what Freelancer says became of submitted bids
app.post('/api/bids/outcomes', (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  const valid = updates.filter(
    (u: any) => u && Number.isFinite(Number(u.projectId)) && ['pending', 'won', 'lost', 'closed', 'retracted'].includes(u.outcome)
  );
  const changed = projectStore.recordBidOutcomes(valid.map((u: any) => ({ ...u, projectId: Number(u.projectId) })));
  res.json({ success: true, received: updates.length, applied: valid.length, changed });
});

// Win-rate by skill, budget band, project type, country, hour and relevance score
app.get('/api/analytics/outcomes', (req, res) => {
  res.json(projectStore.getOutcomeAnalytics());
});

// Bids logs
app.get('/api/bids', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(projectStore.getBids(limit));
});

// Clear history
app.post('/api/clear-history', (req, res) => {
  projectStore.clearHistory();
  res.json({ success: true });
});

// Manual poll trigger
app.post('/api/poll-now', async (req, res) => {
  try {
    const results = await runPollCycle();
    res.json({
      success: true,
      scannedCount: results.length,
      projects: results,
      stats: projectStore.getStats(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Purge mock/stale entries and refresh live Freelancer feed immediately
app.post('/api/refresh-live-feed', async (req, res) => {
  try {
    const liveProjects = await fetchFreelancerActiveProjects();
    await projectStore.purgeMockAndRefresh(liveProjects);
    res.json({
      success: true,
      count: liveProjects.length,
      projects: projectStore.getProjects(100),
      stats: projectStore.getStats(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Try the relevance prompt against one project without touching its stored status
app.post('/api/relevance-check', async (req, res) => {
  try {
    const { project, projectId, relevancePrompt, relevanceMinScore } = req.body || {};
    const target = project || (projectId ? projectStore.getProjects(500).find((p) => p.id === Number(projectId)) : null);
    if (!target) {
      return res.status(400).json({ error: 'Provide a project or a projectId that has been scanned' });
    }
    const config = projectStore.getConfig();
    const verdict = await checkRelevance(target, {
      ...config,
      relevancePrompt: typeof relevancePrompt === 'string' ? relevancePrompt : config.relevancePrompt,
      relevanceMinScore: typeof relevanceMinScore === 'number' ? relevanceMinScore : config.relevanceMinScore,
      openaiApiKey: getOpenAiKey(),
    });
    res.json({ success: true, projectId: target.id, title: target.title, ...verdict });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Bid Proposal Generation tester endpoint
app.post('/api/generate-bid', async (req, res) => {
  try {
    const { project, customPrompt, customApiKey, model } = req.body;
    if (!project) {
      return res.status(400).json({ error: 'Missing project details' });
    }

    const config = projectStore.getConfig();
    const result = await generateProposal({
      projectTitle: project.title,
      projectDescription: project.description,
      skills: (project.jobs || []).map((j: any) => (typeof j === 'string' ? j : j.name)),
      budget: project.budget || { minimum: 100, maximum: 500, currency: 'USD' },
      clientCountry: project.client?.country,
      clientName: project.client?.username,
      mySkills: config.freelancerSkills,
      portfolioLinks: config.portfolioLinks,
      ctaQuestion: config.ctaQuestion,
      customSystemPrompt: customPrompt || config.systemPrompt,
      customApiKey: customApiKey || getOpenAiKey(),
      model: model || config.customOpenAiModel?.trim() || config.openaiModel,
      useAiPricingAndDays: config.useAiPricingAndDays !== false,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download Chrome Extension ZIP bundle
app.get('/api/download-extension-zip', async (req, res) => {
  try {
    const zip = new JSZip();
    const extDir = path.join(process.cwd(), 'extension');

    for (const file of ['manifest.json', 'background.js', 'qualification.js', 'relevance.js', 'outcomes.js', 'content.js', 'popup.html', 'popup.js']) {
      zip.file(file, fs.readFileSync(path.join(extDir, file), 'utf-8'));
    }

    const iconsFolder = zip.folder('icons');
    const iconsDir = path.join(extDir, 'icons');
    if (fs.existsSync(iconsDir)) {
      const iconFiles = fs.readdirSync(iconsDir);
      for (const iconFile of iconFiles) {
        const iconBuf = fs.readFileSync(path.join(iconsDir, iconFile));
        iconsFolder?.file(iconFile, iconBuf);
      }
    }

    // Include instructions README inside the ZIP
    const readmeContent = `# Freelancer AutoBid - Chrome Extension (Manifest V3)
1. Open Google Chrome and navigate to: chrome://extensions
2. Enable "Developer mode" in the top-right corner.
3. Click "Load unpacked".
4. Select this unzipped folder!
5. Ensure your local dashboard server is running:
   npm start (or node server.js on port 3000)
`;
    zip.file('README.txt', readmeContent);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="freelancer-autobid-extension.zip"');
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate ZIP: ${err.message}` });
  }
});

// Serve standalone files
app.use('/standalone', express.static(path.join(process.cwd(), 'standalone')));
app.use('/extension', express.static(path.join(process.cwd(), 'extension')));

// -------------------------------------------------------------
// VITE INTEGRATION & SERVER STARTUP
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // data/ holds the store and auth state, written every poll. Vite would otherwise
        // treat those JSON writes as source changes and full-reload the dashboard.
        watch: { ignored: ['**/data/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start background poller (defaults to 30s as configured)
  const initialConfig = projectStore.getConfig();
  startBackgroundPoller(initialConfig.pollIntervalSeconds || 30);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FreelancerAutoBid] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
