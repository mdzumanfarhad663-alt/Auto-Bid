import React, { useState } from 'react';
import { 
  Key, 
  Terminal, 
  Chrome, 
  ShieldCheck, 
  Copy, 
  Check, 
  ExternalLink, 
  AlertTriangle 
} from 'lucide-react';

export const SetupGuide: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'env' | 'server' | 'extension' | 'security'>('env');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Terminal className="h-5 w-5 text-sky-400" />
          Complete Deployment &amp; Extension Setup Guide
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Follow these 4 straightforward steps to connect your Freelancer account, configure OpenAI gpt-4o-mini, and run the automated bidding listener.
        </p>

        {/* Sub Navigation */}
        <div className="flex gap-2 mt-4 border-t border-slate-800 pt-3 flex-wrap">
          <button
            onClick={() => setActiveSubTab('env')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'env'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Key className="h-3.5 w-3.5" />
            1. Environment &amp; API Keys
          </button>

          <button
            onClick={() => setActiveSubTab('server')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'server'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            2. Run Local Server
          </button>

          <button
            onClick={() => setActiveSubTab('extension')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'extension'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Chrome className="h-3.5 w-3.5" />
            3. Load Chrome Extension
          </button>

          <button
            onClick={() => setActiveSubTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'security'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            4. Security Best Practices
          </button>
        </div>
      </div>

      {/* Tab 1: Environment Variables */}
      {activeSubTab === 'env' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-sky-400" />
              Step 1: Setting Up Environment Variables
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Create a <code className="text-sky-300 font-mono">.env</code> file in the project root directory. Do NOT commit this file to public git repositories.
            </p>
          </div>

          {/* Zero OAuth Notice Banner */}
          <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 flex items-start gap-3">
            <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-semibold text-emerald-300">Public Feed Mode: No Freelancer OAuth Token Needed!</span>
              <p className="text-slate-300 leading-relaxed">
                You do <strong>not</strong> need a Freelancer OAuth token or developer app. The background engine and Chrome extension poll Freelancer's public feeds (RSS &amp; public API) every 30 seconds or 1 minute automatically. You only need your OpenAI API key to draft winning AI proposals!
              </p>
            </div>
          </div>

          {/* Code Block for .env */}
          <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200">
            <button
              onClick={() => handleCopy('env', `OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxxxxxxxxx"
# FREELANCER_OAUTH_TOKEN is optional (Public feed works with no token!)
FREELANCER_OAUTH_TOKEN=""
PORT=3000`)}
              className="absolute top-3 right-3 flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              {copiedKey === 'env' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy .env Template</span>
                </>
              )}
            </button>
            <div className="text-slate-500"># .env configuration</div>
            <div>OPENAI_API_KEY=&quot;sk-proj-xxxxxxxxxxxxxxxxxxxx&quot;</div>
            <div className="text-slate-500"># FREELANCER_OAUTH_TOKEN is optional (Public feed works with NO token!)</div>
            <div>FREELANCER_OAUTH_TOKEN=&quot;&quot;</div>
            <div>PORT=3000</div>
          </div>

          <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
              <h4 className="font-semibold text-sky-300 flex items-center gap-1.5">
                <span>A. Obtaining your OpenAI API Key:</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Log in to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-sky-400 underline inline-flex items-center gap-0.5">OpenAI Platform <ExternalLink className="h-3 w-3" /></a>.</li>
                <li>Generate a new secret key named <code>freelancer-autobid</code>.</li>
                <li>Ensure the key has permission to call <code>gpt-4o-mini</code> (which provides 10x lower cost and sub-second generation latency).</li>
              </ol>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
              <h4 className="font-semibold text-sky-300 flex items-center gap-1.5">
                <span>B. Obtaining your Freelancer.com OAuth Token:</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Go to <a href="https://www.freelancer.com/developers" target="_blank" rel="noreferrer" className="text-sky-400 underline inline-flex items-center gap-0.5">Freelancer Developer Portal <ExternalLink className="h-3 w-3" /></a>.</li>
                <li>Click <strong>Create App</strong> or navigate to <strong>Manage Apps</strong>.</li>
                <li>Under <strong>OAuth Tokens</strong>, generate a personal access token.</li>
                <li>Ensure the scopes include <code>project:view</code> and <code>bid:create</code>.</li>
                <li>Paste this token as the <code>FREELANCER_OAUTH_TOKEN</code> variable.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Running Server */}
      {activeSubTab === 'server' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              Step 2: How to Run the Local Dashboard Server
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              The server runs locally on port 3000 to manage SQLite persistence, deduplication, proposal generation, and dashboard statistics.
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200">
              <div className="text-slate-500 mb-1"># 1. Install dependencies</div>
              <div className="text-emerald-400">npm install</div>
              <div className="text-slate-500 mt-3 mb-1"># 2. Launch the server in development or standalone mode</div>
              <div className="text-sky-400">npm run dev</div>
              <div className="text-slate-500 mt-1"># Or run standalone vanilla script:</div>
              <div className="text-slate-300">node standalone/server.js</div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-xs text-emerald-300 space-y-1">
              <span className="font-semibold block text-emerald-200">Server Verification:</span>
              <p>Once started, open <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="underline font-bold text-white">http://localhost:3000</a> in your browser. The REST API endpoints will be ready to communicate with your Chrome Extension background worker.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Load Chrome Extension */}
      {activeSubTab === 'extension' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Chrome className="h-4 w-4 text-sky-400" />
              Step 3: How to Load the Unpacked Extension into Chrome
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Google Chrome Manifest V3 extensions can be loaded directly from your filesystem without needing the Chrome Web Store.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="h-6 w-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</div>
              <div className="text-xs text-slate-300">
                <strong>Download and Unzip the Extension:</strong> Click the <span className="text-sky-400 font-semibold">&quot;Download Extension (.ZIP)&quot;</span> button in the top navigation or extract the <code className="text-slate-200">/extension</code> directory.
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="h-6 w-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</div>
              <div className="text-xs text-slate-300">
                <strong>Navigate to Chrome Extensions:</strong> In Google Chrome address bar, enter <code className="text-sky-300 font-mono">chrome://extensions</code> and press Enter.
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="h-6 w-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</div>
              <div className="text-xs text-slate-300">
                <strong>Enable Developer Mode:</strong> Toggle the switch in the top right corner labeled <strong>&quot;Developer mode&quot;</strong>.
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="h-6 w-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0">4</div>
              <div className="text-xs text-slate-300">
                <strong>Load Unpacked:</strong> Click the <strong>&quot;Load unpacked&quot;</strong> button in the top left and select the unzipped <code className="text-slate-200">extension</code> folder containing <code>manifest.json</code>.
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="h-6 w-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0">5</div>
              <div className="text-xs text-slate-300">
                <strong>Pin the Extension:</strong> Click the puzzle icon in Chrome toolbar and pin <strong className="text-sky-300">&quot;Freelancer AutoBid&quot;</strong>. The background listener is now active!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Security Best Practices */}
      {activeSubTab === 'security' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Step 4: Security Best Practices for Local Automated Bidders
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Protect your API keys, Freelancer reputation, and budget credits with these crucial measures.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                1. Always Start in Dry-Run Mode
              </div>
              <p className="text-slate-400 leading-relaxed">
                Keep <strong>Dry-Run Mode</strong> enabled while refining your prompt template. This lets the AI draft real proposals and lets you audit them in the dashboard without deducting your real Freelancer bid limit.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <ShieldCheck className="h-4 w-4 text-sky-400" />
                2. Strict Server-Side Key Isolation
              </div>
              <p className="text-slate-400 leading-relaxed">
                Your OpenAI API key and Freelancer tokens stay in <code className="text-sky-300">.env</code> on your local Express server. The Chrome extension background worker communicates via authenticated localhost API proxy rather than hardcoding credentials.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                3. Rate Limit &amp; Polling Politeness
              </div>
              <p className="text-slate-400 leading-relaxed">
                The poller is set to 20-second intervals to respect Freelancer API rate limits. Deduplication prevents re-bidding on the same project ID multiple times.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <ShieldCheck className="h-4 w-4 text-indigo-400" />
                4. Client Payment Verification Guard
              </div>
              <p className="text-slate-400 leading-relaxed">
                By default, the qualification engine rejects unverified payment clients and 0-rating accounts, protecting you from scam postings and disputed milestones.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
