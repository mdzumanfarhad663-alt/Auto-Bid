import React, { useState, useRef } from 'react';
import { FilterConfig, DEFAULT_CONFIG } from '../types.ts';
import { 
  X, 
  Plus, 
  Save, 
  RotateCcw, 
  ShieldCheck, 
  DollarSign, 
  Tag, 
  Ban, 
  HelpCircle, 
  Sparkles,
  Key,
  Eye,
  EyeOff,
  Zap,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  Cpu,
  MousePointerClick,
  Clock
} from 'lucide-react';

interface FilterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FilterConfig;
  onSave: (updated: Partial<FilterConfig>) => void;
}

export const FilterSettingsModal: React.FC<FilterSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [formData, setFormData] = useState<FilterConfig>({ ...config });
  const [newMandatoryTag, setNewMandatoryTag] = useState('');
  const [newNegativeWord, setNewNegativeWord] = useState('');
  const [newPortfolioLink, setNewPortfolioLink] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleVerifyApiKey = async () => {
    if (!formData.openaiApiKey || formData.openaiApiKey.trim() === '') {
      setKeyStatus({ valid: false, message: 'Please enter an OpenAI API key first.' });
      return;
    }
    setVerifyingKey(true);
    setKeyStatus(null);
    try {
      const res = await fetch('/api/validate-openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: formData.openaiApiKey }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setKeyStatus({ valid: true, message: 'OpenAI API Key verified successfully!' });
      } else {
        setKeyStatus({ valid: false, message: data.error || 'Invalid API key.' });
      }
    } catch (e: any) {
      setKeyStatus({ valid: false, message: 'Could not connect to verification endpoint.' });
    } finally {
      setVerifyingKey(false);
    }
  };

  const handleAddMandatory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMandatoryTag.trim() && !formData.mandatorySkills.includes(newMandatoryTag.trim())) {
      setFormData({
        ...formData,
        mandatorySkills: [...formData.mandatorySkills, newMandatoryTag.trim()],
      });
      setNewMandatoryTag('');
    }
  };

  const handleRemoveMandatory = (tag: string) => {
    setFormData({
      ...formData,
      mandatorySkills: formData.mandatorySkills.filter((t) => t !== tag),
    });
  };

  const handleAddNegative = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNegativeWord.trim() && !formData.negativeKeywords.includes(newNegativeWord.trim())) {
      setFormData({
        ...formData,
        negativeKeywords: [...formData.negativeKeywords, newNegativeWord.trim()],
      });
      setNewNegativeWord('');
    }
  };

  const handleRemoveNegative = (word: string) => {
    setFormData({
      ...formData,
      negativeKeywords: formData.negativeKeywords.filter((w) => w !== word),
    });
  };

  const handleAddPortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPortfolioLink.trim() && !formData.portfolioLinks.includes(newPortfolioLink.trim())) {
      setFormData({
        ...formData,
        portfolioLinks: [...formData.portfolioLinks, newPortfolioLink.trim()],
      });
      setNewPortfolioLink('');
    }
  };

  const handleRemovePortfolio = (link: string) => {
    setFormData({
      ...formData,
      portfolioLinks: formData.portfolioLinks.filter((l) => l !== link),
    });
  };

  const handleExportConfig = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(formData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "freelancer-autobid-settings.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported && typeof imported === 'object') {
          setFormData({ ...DEFAULT_CONFIG, ...imported });
        }
      } catch (err) {
        alert('Invalid JSON settings file.');
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleResetDefaults = () => {
    setFormData({ ...DEFAULT_CONFIG });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Tag className="h-5 w-5 text-sky-400" />
              Qualification &amp; Filtering Engine Rules
            </h2>
            <p className="text-xs text-slate-400">
              Only projects satisfying every condition will qualify for gpt-4o-mini proposal drafting.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs sm:text-sm">
          {/* Section 0: Feed Source & Polling Frequency (No OAuth Required) */}
          <div className="bg-indigo-950/40 rounded-xl p-4 border border-indigo-800/50">
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-indigo-200 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-sky-400" />
                Feed Source &amp; Polling Frequency (No OAuth Token Needed)
              </label>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-300 border border-indigo-700/60">
                Direct Feed
              </span>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Configure how the background engine polls Freelancer.com without requiring any OAuth tokens.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Feed Mode</label>
                <select
                  value={formData.feedSource || 'auto'}
                  onChange={(e) => setFormData({ ...formData, feedSource: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="auto">Auto (RSS XML + Public API)</option>
                  <option value="rss">Freelancer Public RSS Feed</option>
                  <option value="public_api">Freelancer Public API (Anonymous)</option>
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">Polls directly from public endpoint</span>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Polling Frequency</label>
                <select
                  value={formData.pollIntervalSeconds || 30}
                  onChange={(e) => setFormData({ ...formData, pollIntervalSeconds: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value={30}>Every 30 Seconds (Fastest Real-Time)</option>
                  <option value={60}>Every 1 Minute (Balanced)</option>
                  <option value={120}>Every 2 Minutes (Conservative)</option>
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">Frequency of background scans</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-indigo-900/40">
              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.desktopNotifications !== false}
                  onChange={(e) => setFormData({ ...formData, desktopNotifications: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span className="text-xs text-slate-200">Chrome Desktop Notifications</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.audioAlerts !== false}
                  onChange={(e) => setFormData({ ...formData, audioAlerts: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span className="text-xs text-slate-200">Audio Chime on Qualified Project</span>
              </label>
            </div>
          </div>

          {/* Section 1: Mandatory Tech Tags */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-sky-400" />
                1. Mandatory Platform Tech Tags (Whitelist)
              </label>
              <span className="text-[11px] text-slate-400">Must match at least 1 tag</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Projects lacking ANY of these explicit skills or keywords will be marked as <code className="text-rose-300">Ineligible</code> and skipped.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {formData.mandatorySkills.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-sky-950/80 text-sky-300 border border-sky-800/60 font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveMandatory(tag)}
                    className="hover:text-rose-400 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add tech tag (e.g. Next.js, Python, Vue)..."
                value={newMandatoryTag}
                onChange={(e) => setNewMandatoryTag(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={handleAddMandatory}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Section 2: Negative Keyword Blacklist */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Ban className="h-4 w-4 text-rose-400" />
                2. Negative Keyword Blacklist
              </label>
              <span className="text-[11px] text-slate-400">Discarded immediately on match</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Any project title or description containing these terms is disqualified to prevent wasted bids.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {formData.negativeKeywords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-800/60 font-medium"
                >
                  {word}
                  <button
                    type="button"
                    onClick={() => handleRemoveNegative(word)}
                    className="hover:text-white ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add blacklist keyword (e.g. Casino, Academic, Crypto)..."
                value={newNegativeWord}
                onChange={(e) => setNewNegativeWord(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="button"
                onClick={handleAddNegative}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Section 3: Budget & Client Qualification */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800">
            <label className="font-semibold text-slate-200 flex items-center gap-1.5 mb-3">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              3. Budget &amp; Client Verification Filters
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Minimum Budget ($)</label>
                <input
                  type="number"
                  value={formData.minBudget}
                  onChange={(e) => setFormData({ ...formData, minBudget: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Maximum Budget ($)</label>
                <input
                  type="number"
                  value={formData.maxBudget}
                  onChange={(e) => setFormData({ ...formData, maxBudget: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requirePaymentVerified}
                  onChange={(e) => setFormData({ ...formData, requirePaymentVerified: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span className="text-xs text-slate-200 flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Require Client Payment Verified
                </span>
              </label>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Minimum Client Rating (0 to 5.0)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={formData.minClientRating}
                  onChange={(e) => setFormData({ ...formData, minClientRating: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Smart Bid Pricing & Delivery Days (AI Driven) */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-indigo-900/40">
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                4. Bid Pricing &amp; Timeline (AI &amp; Budget Rules)
              </label>
              <span className="text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                Dynamic Selection
              </span>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.useAiPricingAndDays !== false}
                onChange={(e) => setFormData({ ...formData, useAiPricingAndDays: e.target.checked })}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
              />
              <div>
                <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                  Use OpenAI API to Select Optimal Bid Amount &amp; Days
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  OpenAI reads the client&apos;s budget range (e.g. $30 - $250) and job complexity to pick the most competitive price and delivery days to win the bid.
                </p>
              </div>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fallback Bid Amount (% of Client Max Budget)</label>
                <input
                  type="number"
                  min="20"
                  max="100"
                  value={formData.bidPercentageOfMaxBudget}
                  onChange={(e) => setFormData({ ...formData, bidPercentageOfMaxBudget: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Used if AI pricing is disabled or budget is missing</span>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fallback Delivery Timeline (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.defaultDeliveryDays}
                  onChange={(e) => setFormData({ ...formData, defaultDeliveryDays: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Standard delivery days if AI estimation is bypassed</span>
              </div>
            </div>
          </div>

          {/* Section 5: Hands-Free Autonomous Bidding */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-emerald-900/40">
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <MousePointerClick className="h-4 w-4 text-emerald-400" />
                5. Autonomous Auto-Bid &amp; Extension Execution
              </label>
              <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                Zero Human Touch
              </span>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.handsFreeAutoSubmit !== false}
                  onChange={(e) => setFormData({ ...formData, handsFreeAutoSubmit: e.target.checked })}
                  className="mt-0.5 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <div>
                  <span className="text-xs text-emerald-300 font-semibold flex items-center gap-1">
                    🤖 Autonomous Hands-Free Submit (Auto-Click &apos;Place Bid&apos;)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    When opening a qualified project, the extension autofills the proposal, budget, and days, and clicks the &apos;Place Bid&apos; button automatically without touching human.
                  </p>
                </div>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    Auto-Submit Countdown Delay
                  </label>
                  <select
                    value={formData.autoSubmitDelaySeconds !== undefined ? formData.autoSubmitDelaySeconds : 2}
                    onChange={(e) => setFormData({ ...formData, autoSubmitDelaySeconds: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  >
                    <option value="0">Instant (0 seconds)</option>
                    <option value="2">2 seconds review countdown</option>
                    <option value="3">3 seconds review countdown</option>
                    <option value="5">5 seconds review countdown</option>
                  </select>
                  <span className="text-[11px] text-slate-500 mt-1 block">Provides visual confirmation banner before click</span>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Auto-Open Qualified Projects</label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formData.autoOpenQualified}
                      onChange={(e) => setFormData({ ...formData, autoOpenQualified: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span className="text-xs text-slate-300">
                      Open in background tab automatically as bids qualify
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: OpenAI API Key & Model Selection */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-indigo-900/50">
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Key className="h-4 w-4 text-sky-400" />
                6. OpenAI API Key &amp; Model Selection
              </label>
              <select
                value={formData.openaiModel || 'gpt-4o-mini'}
                onChange={(e) => setFormData({ ...formData, openaiModel: e.target.value })}
                className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2 py-1"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Fast &amp; Cheap - Default)</option>
                <option value="gpt-4o">gpt-4o (Omni Flagship)</option>
                <option value="gpt-4.5-preview">gpt-4.5-preview (Frontier Reasoning)</option>
                <option value="o3-mini">o3-mini (STEM &amp; Coding)</option>
                <option value="o1">o1 (Complex Reasoning)</option>
                <option value="o1-mini">o1-mini (Reasoning Mini)</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
                <option value="chatgpt-4o-latest">chatgpt-4o-latest</option>
                <option value="gpt-5.5">gpt-5.5 (Next-Gen)</option>
                <option value="gpt-5.6">gpt-5.6 (Next-Gen)</option>
                <option value="custom">Custom Model Name...</option>
              </select>
            </div>

            {(formData.openaiModel === 'custom' || formData.customOpenAiModel) && (
              <div className="mb-3">
                <label className="block text-xs text-indigo-300 mb-1 font-mono">
                  Custom OpenAI / ChatGPT Model Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. gpt-5.5, gpt-5.6, sol, or fine-tuned model"
                  value={formData.customOpenAiModel || ''}
                  onChange={(e) => setFormData({ ...formData, customOpenAiModel: e.target.value })}
                  className="w-full bg-slate-900 border border-indigo-600 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-proj-... (or leave blank to use OPENAI_API_KEY env)"
                  value={formData.openaiApiKey || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, openaiApiKey: e.target.value });
                    setKeyStatus(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-white placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleVerifyApiKey}
                disabled={verifyingKey}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shrink-0 flex items-center gap-1"
              >
                <Key className="h-3 w-3" />
                {verifyingKey ? 'Checking...' : 'Verify'}
              </button>
            </div>

            {keyStatus && (
              <div className={`p-2 rounded text-xs mb-3 flex items-center gap-1.5 ${
                keyStatus.valid ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border border-rose-800 text-rose-300'
              }`}>
                {keyStatus.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                <span>{keyStatus.message}</span>
              </div>
            )}

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.generateOnDemand !== false}
                onChange={(e) => setFormData({ ...formData, generateOnDemand: e.target.checked })}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
              />
              <div>
                <span className="text-xs text-sky-300 font-semibold flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Generate Proposal On-Demand (Conserve Tokens)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Proposals are generated ONLY when you click &quot;1-Click Apply&quot;. This prevents consuming API tokens on projects you don&apos;t choose to bid on.
                </p>
              </div>
            </label>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition px-2 py-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>

            <span className="text-slate-700">|</span>

            <button
              type="button"
              onClick={handleExportConfig}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition px-2 py-1.5 rounded bg-indigo-950/40 border border-indigo-800/50"
              title="Download your settings as a JSON file backup"
            >
              <Download className="h-3.5 w-3.5" />
              Export Backup
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportConfig}
              accept=".json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition px-2 py-1.5 rounded bg-emerald-950/40 border border-emerald-800/50"
              title="Restore settings from a saved JSON backup"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Backup
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-sky-600/20 transition"
            >
              <Save className="h-3.5 w-3.5" />
              Save Rules
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
