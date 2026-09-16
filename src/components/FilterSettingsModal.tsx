import React, { useState } from 'react';
import { FilterConfig } from '../types.ts';
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
  Sparkles 
} from 'lucide-react';
import { DEFAULT_CONFIG } from '../services/store.ts';

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

  if (!isOpen) return null;

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

          {/* Section 4: Smart Bid Calculation */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800">
            <label className="font-semibold text-slate-200 flex items-center gap-1.5 mb-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              4. Bid Pricing &amp; Timeline Calculation
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bid Amount (% of Client Max Budget)</label>
                <input
                  type="number"
                  min="20"
                  max="100"
                  value={formData.bidPercentageOfMaxBudget}
                  onChange={(e) => setFormData({ ...formData, bidPercentageOfMaxBudget: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">e.g. 85% on a $500 job sets bid to $425</span>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Default Delivery Timeline (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.defaultDeliveryDays}
                  onChange={(e) => setFormData({ ...formData, defaultDeliveryDays: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>

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
