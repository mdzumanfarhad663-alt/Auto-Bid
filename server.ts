import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { projectStore, getExtensionVersion } from './src/services/store.ts';
import { generateProposal } from './src/services/openai.ts';
import { runPollCycleFor, startBackgroundPoller, fetchFreelancerActiveProjects } from './src/services/freelancer-poller.ts';
import { checkRelevance } from './extension/relevance.js';
import { selectPortfolioLinks } from './extension/qualification.js';
import {
  issueSessionCookie,
  verifySessionCookie,
  issueSignedState,
  verifySignedState,
  parseCookies,
  SESSION_COOKIE_NAME,
  getOpenAiKey,
  setSecret,
  maskSecret,
  loginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} from './src/services/auth.ts';
import * as users from './src/services/users.ts';
import type { UserRow } from './src/services/users.ts';

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

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      authVia?: 'session' | 'token';
    }
  }
}

function clientIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function bearerToken(req: express.Request): string | undefined {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

/** Resolve the caller: admin/user session cookie, or a per-user extension token. */
function resolveUser(req: express.Request): { user: UserRow; via: 'session' | 'token' } | null {
  const uid = verifySessionCookie(parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]);
  if (uid) {
    const u = users.findById(uid);
    if (u) return { user: u, via: 'session' };
  }
  const tokenUser = users.verifyExtensionToken(bearerToken(req));
  if (tokenUser) return { user: tokenUser, via: 'token' };
  return null;
}

const PUBLIC_API = new Set(['/api/health', '/api/auth/login', '/api/auth/register', '/api/auth/me', '/api/auth/google', '/api/auth/google/callback', '/api/auth/logout']);

app.use('/api', (req, res, next) => {
  const full = `/api${req.path === '/' ? '' : req.path}`;
  const resolved = resolveUser(req);
  if (resolved) {
    req.user = resolved.user;
    req.authVia = resolved.via;
  }
  if (PUBLIC_API.has(full)) return next();
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended.' });
  next();
});

function adminOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.user && req.authVia === 'session' && req.user.role === 'admin') return next();
  res.status(403).json({ error: 'Admin session required' });
}

/** Routes the extension must not reach with its token (account changes, admin). */
function sessionOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.user && req.authVia === 'session') return next();
  res.status(403).json({ error: 'Sign in on the dashboard to do this' });
}

function setSessionCookie(res: express.Response, userId: string) {
  const c = issueSessionCookie(userId);
  res.setHeader(
    'Set-Cookie',
    `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(c.maxAgeMs / 1000)}${IS_PROD ? '; Secure' : ''}`
  );
}

function clearSessionCookie(res: express.Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? '; Secure' : ''}`);
}

const GOOGLE_ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function publicBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && !process.env.APP_URL.startsWith('MY_')) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}`;
}

app.post('/api/auth/register', (req, res) => {
  const ip = clientIp(req);
  const gate = loginAllowed(ip);
  if (!gate.allowed) return res.status(429).json({ error: `Too many attempts. Try again in ${gate.retryAfterSeconds}s.` });
  try {
    const { email, password, name } = req.body || {};
    const u = users.createUser({ email, password, name });
    setSessionCookie(res, u.id);
    res.json({ success: true, user: users.toPublic(u) });
  } catch (err: any) {
    recordLoginFailure(ip);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const ip = clientIp(req);
  const gate = loginAllowed(ip);
  if (!gate.allowed) return res.status(429).json({ error: `Too many attempts. Try again in ${gate.retryAfterSeconds}s.` });
  const { email, password } = req.body || {};
  const result = users.verifyLogin(String(email || ''), String(password || ''));
  if (!result.user) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: result.error });
  }
  clearLoginFailures(ip);
  setSessionCookie(res, result.user.id);
  res.json({ success: true, user: users.toPublic(result.user) });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const sessionUser = req.authVia === 'session' ? req.user : null;
  res.json({
    authenticated: !!sessionUser,
    user: sessionUser ? users.toPublic(sessionUser) : null,
    googleEnabled: GOOGLE_ENABLED,
    registrationOpen: true,
    adminConfigured: users.countAdmins() > 0,
  });
});

// ---- Google OAuth 2.0 (authorization code, no library)

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(404).json({ error: 'Google sign-in is not configured' });
  const state = issueSignedState();
  res.setHeader('Set-Cookie', `autobid_oauth_state=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${IS_PROD ? '; Secure' : ''}`);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${publicBaseUrl(req)}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const fail = (msg: string) => res.redirect(`/login?error=${encodeURIComponent(msg)}`);
  if (!GOOGLE_ENABLED) return fail('Google sign-in is not configured');

  const { code, state, error } = req.query as Record<string, string>;
  if (error) return fail(`Google: ${error}`);
  const stateCookie = parseCookies(req.headers.cookie)['autobid_oauth_state'];
  if (!code || !state || state !== stateCookie || !verifySignedState(state)) return fail('Sign-in session expired or invalid. Try again.');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${publicBaseUrl(req)}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return fail('Google rejected the sign-in code');
    const tokens = await tokenRes.json();

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return fail('Could not read your Google profile');
    const info = await infoRes.json();
    if (!info.sub || !info.email) return fail('Google did not return an email');
    if (info.email_verified === false) return fail('Your Google email is not verified');

    let u = users.findByGoogleId(info.sub);
    if (!u) {
      const byEmail = users.findByEmail(info.email);
      u = byEmail
        ? users.linkGoogle(byEmail.id, info.sub, info.picture, info.name)
        : users.createUser({ email: info.email, password: null, name: info.name, googleId: info.sub, avatarUrl: info.picture });
    }
    if (u.status === 'suspended') return fail('This account has been suspended');

    res.setHeader('Set-Cookie', `autobid_oauth_state=; Path=/api/auth/google; Max-Age=0`);
    setSessionCookie(res, u.id);
    res.redirect('/dashboard');
  } catch (err: any) {
    fail(`Google sign-in failed: ${err.message}`);
  }
});

// ---- Account (self-service)

app.patch('/api/account', sessionOnly, (req, res) => {
  try {
    const { name, email } = req.body || {};
    const u = users.updateProfile(req.user!.id, { name, email });
    res.json({ success: true, user: users.toPublic(u) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/account/change-password', sessionOnly, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    users.changePassword(req.user!.id, currentPassword, newPassword);
    setSessionCookie(res, req.user!.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/account/extension-token', sessionOnly, (req, res) => {
  const token = users.generateExtensionTokenFor(req.user!.id);
  res.json({ success: true, token, note: 'Shown once. Paste it into the extension popup.' });
});

app.delete('/api/account/extension-token', sessionOnly, (req, res) => {
  users.revokeExtensionTokenFor(req.user!.id);
  res.json({ success: true });
});

// ---- Admin: shared OpenAI key, users

app.get('/api/admin/status', adminOnly, (req, res) => {
  const key = getOpenAiKey();
  const all = users.listUsers();
  res.json({
    openaiKey: { configured: !!key, masked: maskSecret(key), source: key && !process.env.OPENAI_API_KEY ? 'encrypted store' : key ? 'environment' : null },
    users: { total: all.length, active: all.filter((u) => u.status === 'active').length, admins: all.filter((u) => u.role === 'admin').length },
    googleEnabled: GOOGLE_ENABLED,
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

app.get('/api/admin/users', adminOnly, (req, res) => {
  res.json(users.listUsers().map(users.toPublic));
});

app.post('/api/admin/users/:id/suspend', adminOnly, (req, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'You cannot suspend yourself' });
  try { res.json({ success: true, user: users.toPublic(users.setStatus(req.params.id, 'suspended')) }); }
  catch (err: any) { res.status(404).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/activate', adminOnly, (req, res) => {
  try { res.json({ success: true, user: users.toPublic(users.setStatus(req.params.id, 'active')) }); }
  catch (err: any) { res.status(404).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/extend-trial', adminOnly, (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days < 1 || days > 3650) return res.status(400).json({ error: 'days must be between 1 and 3650' });
  try {
    const u = users.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const from = Math.max(Date.now(), users.trialInfo(u).trialEndsAt);
    res.json({ success: true, user: users.toPublic(users.extendTrial(u.id, from + days * 86400_000)) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/end-trial', adminOnly, (req, res) => {
  try { res.json({ success: true, user: users.toPublic(users.extendTrial(req.params.id, Date.now() - 1)) }); }
  catch (err: any) { res.status(404).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/role', adminOnly, (req, res) => {
  const role = req.body?.role;
  if (role !== 'user' && role !== 'admin') return res.status(400).json({ error: 'role must be user or admin' });
  if (req.params.id === req.user!.id && role !== 'admin') return res.status(400).json({ error: 'You cannot remove your own admin role' });
  try { res.json({ success: true, user: users.toPublic(users.setRole(req.params.id, role)) }); }
  catch (err: any) { res.status(404).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', adminOnly, (req, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  const ok = users.deleteUser(req.params.id);
  projectStore.evict(req.params.id);
  if (!ok) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

// The extension needs the shared key to call OpenAI itself. Token holders only.
app.get('/api/admin/secrets', (req, res) => {
  if (req.authVia !== 'token') return res.status(403).json({ error: 'Extension token required' });
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
  res.json({ ...projectStore.getConfig(req.user!.id), openaiApiKey: maskSecret(key), hasOpenAiKey: !!key });
});

app.post('/api/config', (req, res) => {
  const updated = projectStore.updateConfig(req.user!.id, req.body, req.user!.role === 'admin' && req.authVia === 'session');
  res.json({ success: true, config: updated });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json(projectStore.getStats(req.user!.id));
});

// Dashboard aggregated data endpoint
app.get('/api/dashboard', (req, res) => {
  res.json(projectStore.getDashboardData(req.user!.id));
});

// Projects feed
app.get('/api/projects', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(projectStore.getProjects(req.user!.id, limit));
});

app.post('/api/projects', async (req, res) => {
  try {
    const rawProject = req.body;
    if (!rawProject || !rawProject.id) {
      return res.status(400).json({ error: 'Missing project payload' });
    }
    const processed = await projectStore.processProject(req.user!.id, rawProject);
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
  const project = projectStore.recordBidOutcome(req.user!.id, projectId, outcome, reason);
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
    const updated = await projectStore.generateProposalForProject(req.user!.id, projectId);
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
  const changed = projectStore.recordBidOutcomes(req.user!.id, valid.map((u: any) => ({ ...u, projectId: Number(u.projectId) })));
  res.json({ success: true, received: updates.length, applied: valid.length, changed });
});

// Win-rate by skill, budget band, project type, country, hour and relevance score
app.get('/api/analytics/outcomes', (req, res) => {
  res.json(projectStore.getOutcomeAnalytics(req.user!.id));
});

// Bids logs
app.get('/api/bids', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(projectStore.getBids(req.user!.id, limit));
});

// Clear history
app.post('/api/clear-history', (req, res) => {
  projectStore.clearHistory(req.user!.id);
  res.json({ success: true });
});

// Manual poll trigger
app.post('/api/poll-now', async (req, res) => {
  try {
    const results = await runPollCycleFor(req.user!.id);
    res.json({
      success: true,
      scannedCount: results.length,
      projects: results,
      stats: projectStore.getStats(req.user!.id),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Purge mock/stale entries and refresh live Freelancer feed immediately
app.post('/api/refresh-live-feed', async (req, res) => {
  try {
    const liveProjects = await fetchFreelancerActiveProjects(projectStore.getConfig(req.user!.id).feedSource);
    await projectStore.purgeMockAndRefresh(req.user!.id, liveProjects);
    res.json({
      success: true,
      count: liveProjects.length,
      projects: projectStore.getProjects(req.user!.id, 100),
      stats: projectStore.getStats(req.user!.id),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Try the relevance prompt against one project without touching its stored status
app.post('/api/relevance-check', async (req, res) => {
  try {
    const { project, projectId, relevancePrompt, relevanceMinScore } = req.body || {};
    const target = project || (projectId ? projectStore.getProjects(req.user!.id, 500).find((p) => p.id === Number(projectId)) : null);
    if (!target) {
      return res.status(400).json({ error: 'Provide a project or a projectId that has been scanned' });
    }
    const config = projectStore.getConfig(req.user!.id);
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

    const config = projectStore.getConfig(req.user!.id);
    const result = await generateProposal({
      projectTitle: project.title,
      projectDescription: project.description,
      skills: (project.jobs || []).map((j: any) => (typeof j === 'string' ? j : j.name)),
      budget: project.budget || { minimum: 100, maximum: 500, currency: 'USD' },
      clientCountry: project.client?.country,
      clientName: project.client?.username,
      mySkills: config.freelancerSkills,
      portfolioLinks: selectPortfolioLinks(config, project),
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

  // Never let bootstrap fail the whole process: a bad env var here should degrade to
  // "no admin created yet" (visible on /api/auth/me), not an unrecoverable crash loop.
  try {
    const admin = users.ensureAdminFromEnv();
    const firstAdmin = admin || users.listUsers().find((u) => u.role === 'admin');
    if (firstAdmin) projectStore.importLegacyStore(firstAdmin.id);
  } catch (err) {
    console.error('[Boot] Admin bootstrap / legacy import failed, continuing without it:', err);
  }

  startBackgroundPoller(Number(process.env.POLL_INTERVAL_SECONDS) || 30);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FreelancerAutoBid] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
