import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { projectStore } from './src/services/store.ts';
import { generateProposal } from './src/services/openai.ts';
import { runPollCycle, startBackgroundPoller } from './src/services/freelancer-poller.ts';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// Config endpoints
app.get('/api/config', (req, res) => {
  res.json(projectStore.getConfig());
});

app.post('/api/config', (req, res) => {
  const updated = projectStore.updateConfig(req.body);
  res.json({ success: true, config: updated });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json(projectStore.getStats());
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
      mySkills: config.freelancerSkills,
      portfolioLinks: config.portfolioLinks,
      ctaQuestion: config.ctaQuestion,
      customSystemPrompt: customPrompt || config.systemPrompt,
      customApiKey: customApiKey,
      model: model || config.openaiModel,
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

    const manifestContent = fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8');
    const backgroundContent = fs.readFileSync(path.join(extDir, 'background.js'), 'utf-8');
    const popupHtml = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf-8');
    const popupJs = fs.readFileSync(path.join(extDir, 'popup.js'), 'utf-8');

    zip.file('manifest.json', manifestContent);
    zip.file('background.js', backgroundContent);
    zip.file('popup.html', popupHtml);
    zip.file('popup.js', popupJs);

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
      server: { middlewareMode: true },
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
