import React, { useState, useEffect } from 'react';
import { FilterConfig, DEFAULT_CONFIG } from '../types.ts';
import { 
  Settings, 
  Save, 
  Sparkles, 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  Tag, 
  Ban, 
  ShieldCheck, 
  Check, 
  Plus, 
  X, 
  Download, 
  Upload, 
  RotateCcw, 
  Cpu, 
  Bot, 
  Clock, 
  Radio, 
  Bell, 
  Volume2, 
  Trash2,
  ExternalLink,
  HelpCircle,
  FileCode,
  Layers,
  ArrowRight
} from 'lucide-react';

interface SettingsPageProps {
  config: FilterConfig;
  onSave: (updated: Partial<FilterConfig>) => void;
  onOpenTester: () => void;
  onClearHistory: () => void;
}

const POPULAR_OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini (Fast, High Quality, Cost-Effective - Recommended)', tier: 'Recommended' },
  { id: 'gpt-4o', label: 'gpt-4o (High Intelligence, Deep Technical Reasoning)', tier: 'Flagship' },
  { id: 'gpt-4.5-preview', label: 'gpt-4.5-preview (Next-Gen Preview)', tier: 'Preview' },
  { id: 'o3-mini', label: 'o3-mini (High Reasoning STEM & Code Specialist)', tier: 'Reasoning' },
  { id: 'o1', label: 'o1 (Deepest Multistep Reasoning & Planning)', tier: 'Reasoning' },
  { id: 'o1-mini', label: 'o1-mini (Lightweight Reasoning Model)', tier: 'Reasoning' },
  { id: 'gpt-4-turbo', label: 'gpt-4-turbo (Production Turbo)', tier: 'Standard' },
  { id: 'chatgpt-4o-latest', label: 'chatgpt-4o-latest (Continuous ChatGPT Update)', tier: 'Dynamic' },
  { id: 'gpt-5.5', label: 'gpt-5.5 (Future Flagship Alias)', tier: 'Experimental' },
  { id: 'gpt-5.6', label: 'gpt-5.6 (Future Flagship Alias)', tier: 'Experimental' },
  { id: 'custom', label: 'Custom Model ID (Specify any custom or fine-tuned model)', tier: 'Custom' },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  config,
  onSave,
  onOpenTester,
  onClearHistory,
}) => {
  // Always initialize and sync with latest config
  const [formData, setFormData] = useState<FilterConfig>({ ...config });
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'ai' | 'rules' | 'budget' | 'autobid' | 'filters' | 'profile' | 'backup'>('all');
  
  const [showApiKey, setShowApiKey] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ valid: boolean; message: string } | null>(null);
  
  const [newSkill, setNewSkill] = useState('');
  const [newNegative, setNewNegative] = useState('');
  const [newFreelancerSkill, setNewFreelancerSkill] = useState('');
  const [newPortfolio, setNewPortfolio] = useState('');
  const [newCurrency, setNewCurrency] = useState('');
  
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Keep internal form state synchronized with prop changes (fixes stale config on reload)
  useEffect(() => {
    setFormData({ ...config });
  }, [config]);

  const handleSave = () => {
    onSave(formData);
    setSaveSuccess(true);
    setSaveMessage('All settings, custom markdown rules, and API keys saved successfully!');
    setTimeout(() => {
      setSaveSuccess(false);
      setSaveMessage('');
    }, 3500);
  };

  const handleVerifyApiKey = async () => {
    const keyToTest = formData.openaiApiKey?.trim();
    if (!keyToTest) {
      setKeyStatus({ valid: false, message: 'Please enter an OpenAI API key before testing.' });
      return;
    }
    setVerifyingKey(true);
    setKeyStatus(null);
    try {
      const res = await fetch('/api/validate-openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setKeyStatus({ valid: true, message: 'Verified! Key is active and ready to generate live proposals.' });
      } else {
        setKeyStatus({ valid: false, message: data.error || 'Invalid API key or account without active balance.' });
      }
    } catch (e: any) {
      setKeyStatus({ valid: false, message: 'Connection error while contacting verification service.' });
    } finally {
      setVerifyingKey(false);
    }
  };

  // Add / Remove Mandatory Skills
  const handleAddMandatorySkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkill.trim() && !formData.mandatorySkills.includes(newSkill.trim())) {
      setFormData({
        ...formData,
        mandatorySkills: [...formData.mandatorySkills, newSkill.trim()],
      });
      setNewSkill('');
    }
  };

  const handleRemoveMandatorySkill = (skill: string) => {
    setFormData({
      ...formData,
      mandatorySkills: formData.mandatorySkills.filter((s) => s !== skill),
    });
  };

  // Add / Remove Negative Keywords
  const handleAddNegativeKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNegative.trim() && !formData.negativeKeywords.includes(newNegative.trim())) {
      setFormData({
        ...formData,
        negativeKeywords: [...formData.negativeKeywords, newNegative.trim()],
      });
      setNewNegative('');
    }
  };

  const handleRemoveNegativeKeyword = (kw: string) => {
    setFormData({
      ...formData,
      negativeKeywords: formData.negativeKeywords.filter((k) => k !== kw),
    });
  };

  // Add / Remove Freelancer Skills
  const handleAddFreelancerSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFreelancerSkill.trim() && !formData.freelancerSkills.includes(newFreelancerSkill.trim())) {
      setFormData({
        ...formData,
        freelancerSkills: [...formData.freelancerSkills, newFreelancerSkill.trim()],
      });
      setNewFreelancerSkill('');
    }
  };

  const handleRemoveFreelancerSkill = (s: string) => {
    setFormData({
      ...formData,
      freelancerSkills: formData.freelancerSkills.filter((sk) => sk !== s),
    });
  };

  // Add / Remove Portfolio Links
  const handleAddPortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPortfolio.trim() && !formData.portfolioLinks.includes(newPortfolio.trim())) {
      setFormData({
        ...formData,
        portfolioLinks: [...formData.portfolioLinks, newPortfolio.trim()],
      });
      setNewPortfolio('');
    }
  };

  const handleRemovePortfolio = (link: string) => {
    setFormData({
      ...formData,
      portfolioLinks: formData.portfolioLinks.filter((l) => l !== link),
    });
  };

  // Add / Remove Currencies
  const handleAddCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    const curr = newCurrency.trim().toUpperCase();
    if (curr && !formData.allowedCurrencies.includes(curr)) {
      setFormData({
        ...formData,
        allowedCurrencies: [...formData.allowedCurrencies, curr],
      });
      setNewCurrency('');
    }
  };

  const handleRemoveCurrency = (curr: string) => {
    setFormData({
      ...formData,
      allowedCurrencies: formData.allowedCurrencies.filter((c) => c !== curr),
    });
  };

  // Export JSON backup
  const handleExportBackup = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(formData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `freelancer_autobid_rules_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (imported && typeof imported === 'object') {
            const merged = { ...DEFAULT_CONFIG, ...imported };
            setFormData(merged);
            onSave(merged);
            setSaveSuccess(true);
            setSaveMessage('Backup restored successfully! All custom rules, skills, and keys applied.');
            setTimeout(() => setSaveSuccess(false), 3500);
          }
        } catch (err) {
          alert('Invalid JSON file format.');
        }
      };
    }
  };

  const isCustomModel = !POPULAR_OPENAI_MODELS.some(m => m.id === formData.openaiModel && m.id !== 'custom');

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Header & Sticky Save Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-16 z-30 backdrop-blur-md bg-slate-900/95">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Master System Settings
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-normal">
                Single Unified Hub
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Configure OpenAI API, Markdown proposal rules, hands-free auto-bidding, budgets, and filters in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onOpenTester}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 transition shadow-sm"
          >
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>Test Live Prompt</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-lg shadow-sky-500/25 transition transform active:scale-95"
          >
            {saveSuccess ? (
              <>
                <Check className="h-4 w-4 text-white" />
                <span>Saved &amp; Synced!</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save All Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{saveMessage || 'Settings successfully saved to database & browser storage.'}</span>
        </div>
      )}

      {/* Quick Jump Sub-Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800 scrollbar-none text-xs">
        <button
          onClick={() => setActiveSubTab('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'all'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All Settings
        </button>
        <button
          onClick={() => setActiveSubTab('ai')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'ai'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🔑 OpenAI API Key &amp; Models
        </button>
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'rules'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📝 Markdown Proposal Rules
        </button>
        <button
          onClick={() => setActiveSubTab('budget')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'budget'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          💰 AI Pricing &amp; Budget
        </button>
        <button
          onClick={() => setActiveSubTab('autobid')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'autobid'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🤖 Hands-Free Auto-Bid
        </button>
        <button
          onClick={() => setActiveSubTab('filters')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'filters'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🎯 Skills &amp; Blacklist
        </button>
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'profile'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          👤 Profile &amp; Portfolio
        </button>
        <button
          onClick={() => setActiveSubTab('backup')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            activeSubTab === 'backup'
              ? 'bg-slate-800 text-sky-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          💾 Backup &amp; Restore
        </button>
      </div>

      {/* SECTION 1: OpenAI API Key & Model */}
      {(activeSubTab === 'all' || activeSubTab === 'ai') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-indigo-400" />
                OpenAI API Key &amp; Model Selection
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your OpenAI account to draft personalized, project-specific proposals and analyze project pricing.
              </p>
            </div>
            {formData.openaiApiKey ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-3.5 w-3.5" />
                API Key Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <AlertCircle className="h-3.5 w-3.5" />
                Using Template Fallback
              </span>
            )}
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>OpenAI Secret API Key (<code className="text-sky-400">sk-...</code>)</span>
              <span className="text-[11px] text-slate-500">Stored safely &amp; used exclusively for proposal generation</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.openaiApiKey || ''}
                  onChange={(e) => setFormData({ ...formData, openaiApiKey: e.target.value })}
                  placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  title={showApiKey ? 'Hide API Key' : 'Reveal API Key'}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleVerifyApiKey}
                disabled={verifyingKey}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {verifyingKey ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-sky-400 border-t-transparent rounded-full" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 text-sky-400" />
                    <span>Verify Key</span>
                  </>
                )}
              </button>
            </div>

            {keyStatus && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                keyStatus.valid
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
              }`}>
                {keyStatus.valid ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                <span>{keyStatus.message}</span>
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                OpenAI Model for Proposal &amp; Budget Optimization
              </label>
              <select
                value={formData.openaiModel || 'gpt-4o-mini'}
                onChange={(e) => setFormData({ ...formData, openaiModel: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              >
                {POPULAR_OPENAI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.tier}] {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Custom Model Identifier (Optional Override)
              </label>
              <input
                type="text"
                value={formData.customOpenAiModel || ''}
                onChange={(e) => setFormData({ ...formData, customOpenAiModel: e.target.value })}
                placeholder="e.g. gpt-5.5, gpt-5.6, sol, or custom fine-tune"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                If specified, this model string overrides the dropdown above.
              </span>
            </div>
          </div>

          {/* Token Economy Toggle */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-200 block">On-Demand Token Economy Mode</span>
              <span className="text-[11px] text-slate-400">
                Generate proposal only when clicking <strong className="text-sky-300">1-Click Apply</strong> to prevent consuming API tokens on skipped projects.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.generateOnDemand !== false}
                onChange={(e) => setFormData({ ...formData, generateOnDemand: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>
        </div>
      )}

      {/* SECTION 2: Markdown Proposal Rules */}
      {(activeSubTab === 'all' || activeSubTab === 'rules') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileCode className="h-5 w-5 text-sky-400" />
                Markdown Proposal Rules &amp; Output Format
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact instructions followed by OpenAI to draft winning proposals. Supports Markdown and dynamic variables.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, systemPrompt: DEFAULT_CONFIG.systemPrompt })}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Reset to recommended standard Markdown template"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Default Template</span>
            </button>
          </div>

          {/* Dynamic Tag Pills */}
          <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium">Available Variables:</span>
            <code className="px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60 font-mono">
              &#123;client_name&#125;
            </code>
            <span className="text-[11px] text-slate-500">Client's name or empty</span>
            <code className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-mono">
              &#123;skills&#125;
            </code>
            <span className="text-[11px] text-slate-500">Matched freelancer skills</span>
            <code className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-mono">
              &#123;portfolio_links&#125;
            </code>
            <span className="text-[11px] text-slate-500">Portfolio references</span>
            <code className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">
              &#123;cta_question&#125;
            </code>
            <span className="text-[11px] text-slate-400 font-semibold">
              ⚡ Generated dynamically by OpenAI based on job details
            </span>
          </div>

          {/* Markdown Textarea */}
          <div>
            <textarea
              rows={16}
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500/50 selection:bg-sky-500/30"
              spellCheck={false}
            />
          </div>

          {/* Example Output Preview Box */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Example Output from this Markdown Template
            </span>
            <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 whitespace-pre-line font-sans">
{`Hi Mark,

Your WooCommerce store is loading slowly on mobile and it's hurting sales, and that's something I fix regularly.

Last month I took a similar WordPress store from a 38 to a 91 mobile PageSpeed score by cleaning heavy plugins, optimizing images, and setting up proper caching. I work daily with WordPress, WooCommerce, and PHP.

I'd start with a full speed audit, fix the biggest bottlenecks first, then share before and after reports so you can see the difference.

Are you currently using any caching plugin or CDN on the site?`}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: AI Pricing, Budget & Delivery Days */}
      {(activeSubTab === 'all' || activeSubTab === 'budget') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              Budget Qualification &amp; AI Pricing Strategy
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Control the budget qualification range and enable OpenAI to dynamically recommend competitive pricing and delivery days.
            </p>
          </div>

          {/* AI Pricing Toggle */}
          <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-800/40 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Intelligent AI Pricing &amp; Delivery Days Selection
              </span>
              <span className="text-[11px] text-slate-300 block mt-1">
                OpenAI evaluates project scope against the client's budget (e.g. $30–$250) and recommends the optimal winning bid amount and timeframe.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={formData.useAiPricingAndDays !== false}
                onChange={(e) => setFormData({ ...formData, useAiPricingAndDays: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Budget Range Qualification Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Min Client Budget ($)
              </label>
              <input
                type="number"
                min="5"
                max="50000"
                value={formData.minBudget}
                onChange={(e) => setFormData({ ...formData, minBudget: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              <span className="text-[10px] text-slate-500">Skip projects below this</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Max Client Budget ($)
              </label>
              <input
                type="number"
                min="50"
                max="100000"
                value={formData.maxBudget}
                onChange={(e) => setFormData({ ...formData, maxBudget: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              <span className="text-[10px] text-slate-500">Skip projects above this</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Fallback Bid (% of Max)
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={formData.bidPercentageOfMaxBudget || 85}
                onChange={(e) => setFormData({ ...formData, bidPercentageOfMaxBudget: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              <span className="text-[10px] text-slate-500">Used if AI pricing off (e.g. 85%)</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Default Delivery Days
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={formData.defaultDeliveryDays || 5}
                onChange={(e) => setFormData({ ...formData, defaultDeliveryDays: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              <span className="text-[10px] text-slate-500">Default delivery days</span>
            </div>
          </div>

          {/* Permitted Currencies */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block">
              Permitted Currencies
            </label>
            <div className="flex flex-wrap gap-1.5">
              {formData.allowedCurrencies.map((curr) => (
                <span
                  key={curr}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs border border-slate-700"
                >
                  <span>{curr}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCurrency(curr)}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddCurrency} className="flex gap-2 max-w-xs pt-1">
              <input
                type="text"
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                placeholder="Add currency (e.g. JPY)"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 uppercase placeholder-slate-600 focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 4: Hands-Free Autonomous Auto-Bid */}
      {(activeSubTab === 'all' || activeSubTab === 'autobid') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-400" />
              Autonomous Auto-Bid &amp; Extension Controls
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure hands-free automatic submission on Freelancer.com via the Chrome Extension without human intervention.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hands-Free Toggle */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">🤖 Hands-Free Auto-Bid</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Autonomously clicks Freelancer.com 'Place Bid' submit button
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-2">
                <input
                  type="checkbox"
                  checked={formData.handsFreeAutoSubmit !== false}
                  onChange={(e) => setFormData({ ...formData, handsFreeAutoSubmit: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Auto-Open Qualified */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">⚡ Auto-Open Qualified Projects</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Automatically launches qualified projects in background tabs for instant bidding
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-2">
                <input
                  type="checkbox"
                  checked={formData.autoOpenQualified === true}
                  onChange={(e) => setFormData({ ...formData, autoOpenQualified: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Auto-Submit Delay */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Auto-Submit Review Delay
              </label>
              <select
                value={formData.autoSubmitDelaySeconds ?? 2}
                onChange={(e) => setFormData({ ...formData, autoSubmitDelaySeconds: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value={0}>Instant (0s delay)</option>
                <option value={2}>2s Countdown Delay</option>
                <option value={3}>3s Countdown Delay</option>
                <option value={5}>5s Countdown Delay</option>
              </select>
            </div>

            {/* Dry-Run Mode */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Bidding Mode
              </label>
              <select
                value={formData.dryRunMode ? 'dry' : 'live'}
                onChange={(e) => setFormData({ ...formData, dryRunMode: e.target.value === 'dry' })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value="live">🔴 Live Bidding (Real Submission)</option>
                <option value="dry">🟡 Dry-Run (Simulation Only)</option>
              </select>
            </div>

            {/* Feed Polling Interval */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Feed Polling Frequency
              </label>
              <select
                value={formData.pollIntervalSeconds || 30}
                onChange={(e) => setFormData({ ...formData, pollIntervalSeconds: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value={20}>20 Seconds (High Speed)</option>
                <option value={30}>30 Seconds (Recommended)</option>
                <option value={60}>60 Seconds (1 Minute)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: Skills & Blacklist Qualification */}
      {(activeSubTab === 'all' || activeSubTab === 'filters') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Tag className="h-5 w-5 text-sky-400" />
              Skills Matching &amp; Negative Keyword Blacklist
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Projects must match at least one mandatory skill and must NOT contain any blacklisted negative keywords.
            </p>
          </div>

          {/* Mandatory Skills */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Mandatory Skills (Project must match at least 1)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              {formData.mandatorySkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-medium"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMandatorySkill(skill)}
                    className="hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddMandatorySkill} className="flex gap-2 max-w-sm pt-1">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add skill (e.g. Next.js, Flutter)"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition"
              >
                Add Skill
              </button>
            </form>
          </div>

          {/* Negative Keywords */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-rose-400" />
              Negative Keywords Blacklist (Instantly skips projects containing these)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              {formData.negativeKeywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNegativeKeyword(kw)}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddNegativeKeyword} className="flex gap-2 max-w-sm pt-1">
              <input
                type="text"
                value={newNegative}
                onChange={(e) => setNewNegative(e.target.value)}
                placeholder="Add keyword (e.g. Casino, Adult)"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-medium transition"
              >
                Add Filter
              </button>
            </form>
          </div>

          {/* Client Qualification */}
          <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Require Verified Payment
              </label>
              <select
                value={formData.requirePaymentVerified ? 'yes' : 'no'}
                onChange={(e) => setFormData({ ...formData, requirePaymentVerified: e.target.value === 'yes' })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value="no">No (Accept public feed &amp; newly joined)</option>
                <option value="yes">Yes (Strict: Payment Verified Only)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Minimum Client Rating
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5.0"
                value={formData.minClientRating}
                onChange={(e) => setFormData({ ...formData, minClientRating: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Minimum Reviews Count
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.minClientReviews}
                onChange={(e) => setFormData({ ...formData, minClientReviews: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: Profile & Portfolio */}
      {(activeSubTab === 'all' || activeSubTab === 'profile') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              Freelancer Profile &amp; Proof Assets
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              These details are populated into <code className="text-indigo-300">&#123;skills&#125;</code> and <code className="text-emerald-300">&#123;portfolio_links&#125;</code> in your proposals.
            </p>
          </div>

          {/* Freelancer Skills */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Your Professional Skills (Inserted into Paragraph 2: Proof)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              {formData.freelancerSkills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-medium"
                >
                  <span>{s}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFreelancerSkill(s)}
                    className="hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddFreelancerSkill} className="flex gap-2 max-w-sm pt-1">
              <input
                type="text"
                value={newFreelancerSkill}
                onChange={(e) => setNewFreelancerSkill(e.target.value)}
                placeholder="Add skill (e.g. WooCommerce, TailwindCSS)"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
              >
                Add
              </button>
            </form>
          </div>

          {/* Portfolio Links */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block">
              Portfolio &amp; Work Proof Links
            </label>
            <div className="space-y-1.5">
              {formData.portfolioLinks.map((link) => (
                <div
                  key={link}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300"
                >
                  <span className="truncate">{link}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePortfolio(link)}
                    className="text-slate-400 hover:text-rose-400 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddPortfolio} className="flex gap-2 max-w-md pt-1">
              <input
                type="url"
                value={newPortfolio}
                onChange={(e) => setNewPortfolio(e.target.value)}
                placeholder="https://github.com/my-profile"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none font-mono"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700"
              >
                Add Link
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 7: Backup, Persistence & Restore */}
      {(activeSubTab === 'all' || activeSubTab === 'backup') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Download className="h-5 w-5 text-sky-400" />
              Backup, Persistence &amp; Database State
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Your configuration is mirrored to browser storage so updates on Render and GitHub never wipe your custom skills, rules, or keys.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Download className="h-4 w-4 text-sky-400" />
              <span>Export Backup (.json)</span>
            </button>

            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer">
              <Upload className="h-4 w-4 text-indigo-400" />
              <span>Import Backup (.json)</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onClearHistory}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition ml-auto"
            >
              <Trash2 className="h-4 w-4 text-rose-400" />
              <span>Clear Scanned Projects History</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Save Button Bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-2xl">
        <div className="text-xs text-slate-400">
          Click <strong className="text-white">Save All Settings</strong> to immediately activate changes in both the dashboard and browser extension.
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/30 transition transform active:scale-95 shrink-0"
        >
          {saveSuccess ? (
            <>
              <Check className="h-4 w-4 text-emerald-300" />
              <span>Saved Successfully!</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save All Settings</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
