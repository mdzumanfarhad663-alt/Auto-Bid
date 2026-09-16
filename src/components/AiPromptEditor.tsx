import React, { useState } from 'react';
import { FilterConfig, DEFAULT_CONFIG } from '../types.ts';
import { 
  Sparkles, 
  Save, 
  RotateCcw, 
  Code2, 
  Link, 
  HelpCircle, 
  Cpu, 
  Check, 
  Plus,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Zap
} from 'lucide-react';

interface AiPromptEditorProps {
  config: FilterConfig;
  onSave: (updated: Partial<FilterConfig>) => void;
  onOpenTester: () => void;
}

export const AiPromptEditor: React.FC<AiPromptEditorProps> = ({
  config,
  onSave,
  onOpenTester,
}) => {
  const [formData, setFormData] = useState<FilterConfig>({ ...config });
  const [newSkill, setNewSkill] = useState('');
  const [newPortfolio, setNewPortfolio] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ valid: boolean; message: string } | null>(null);

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
        setKeyStatus({ valid: true, message: 'Verified! Key is active and ready for live proposals.' });
      } else {
        setKeyStatus({ valid: false, message: data.error || 'Invalid API key.' });
      }
    } catch (e: any) {
      setKeyStatus({ valid: false, message: 'Failed to connect to verification service.' });
    } finally {
      setVerifyingKey(false);
    }
  };

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkill.trim() && !formData.freelancerSkills.includes(newSkill.trim())) {
      setFormData({
        ...formData,
        freelancerSkills: [...formData.freelancerSkills, newSkill.trim()],
      });
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setFormData({
      ...formData,
      freelancerSkills: formData.freelancerSkills.filter((s) => s !== skill),
    });
  };

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

  const handleSave = () => {
    onSave(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            Proposal Prompt Engineering &amp; AI Setup
          </h2>
          <p className="text-xs text-slate-400">
            Configure how OpenAI <code className="text-indigo-300">gpt-4o-mini</code> writes personalized proposals strictly under 150 words.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenTester}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Launch Live Tester
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition"
          >
            {saveSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Save Prompt</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: OpenAI API Key, System Prompt & Model */}
        <div className="lg:col-span-2 space-y-4">
          {/* OpenAI API Key & Token Saving Configuration Box */}
          <div className="bg-slate-900/90 border border-indigo-900/60 rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Key className="h-4 w-4 text-sky-400" />
                OpenAI API Key Setting
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Model:</span>
                <select
                  value={formData.openaiModel}
                  onChange={(e) => setFormData({ ...formData, openaiModel: e.target.value })}
                  className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Recommended, Fast &amp; Cheap)</option>
                  <option value="gpt-4o">gpt-4o (Max Reasoning)</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-proj-..."
                  value={formData.openaiApiKey || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, openaiApiKey: e.target.value });
                    setKeyStatus(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                  title={showApiKey ? 'Hide Key' : 'Show Key'}
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleVerifyApiKey}
                disabled={verifyingKey}
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shrink-0 transition flex items-center gap-1.5"
              >
                {verifyingKey ? (
                  <span>Checking...</span>
                ) : (
                  <>
                    <Key className="h-3.5 w-3.5" />
                    <span>Verify Key</span>
                  </>
                )}
              </button>
            </div>

            {keyStatus && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                keyStatus.valid 
                  ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800/60 text-rose-300'
              }`}>
                {keyStatus.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                )}
                <span>{keyStatus.message}</span>
              </div>
            )}

            {/* Token-Saving Mode Toggle */}
            <div className="pt-2 border-t border-slate-800 flex items-start justify-between gap-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.generateOnDemand !== false}
                  onChange={(e) => setFormData({ ...formData, generateOnDemand: e.target.checked })}
                  className="mt-0.5 rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-semibold text-sky-300 flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    Token-Saving Mode (Generate On-Demand)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    OpenAI API is called ONLY when you click &quot;1-Click Apply&quot; on a project. Saves 100% of tokens on projects you don&apos;t apply to!
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Code2 className="h-4 w-4 text-indigo-400" />
                System Prompt Template
              </label>
            </div>

            <p className="text-xs text-slate-400">
              Supported dynamic variables: <code className="text-sky-300 font-mono">{'{skills}'}</code>, <code className="text-sky-300 font-mono">{'{portfolio_links}'}</code>, <code className="text-sky-300 font-mono">{'{cta_question}'}</code>.
            </p>

            <textarea
              rows={9}
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition leading-relaxed resize-y"
            />

            {/* CTA Question */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                Technical Call-to-Action Closing Question
              </label>
              <input
                type="text"
                value={formData.ctaQuestion}
                onChange={(e) => setFormData({ ...formData, ctaQuestion: e.target.value })}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="e.g. When are you available for a brief 5-minute technical review call?"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Ending with a sharp technical question dramatically increases client reply rate.
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Your Profile, Skills & Portfolio Links */}
        <div className="space-y-4">
          {/* Your Skills */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Your Technical Proficiencies</h3>
            <p className="text-xs text-slate-400">
              Only skills matching the client's job will be referenced in proposals.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {formData.freelancerSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 border border-slate-700"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="hover:text-rose-400 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddSkill} className="flex gap-2">
              <input
                type="text"
                placeholder="Add skill..."
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>

          {/* Portfolio Links */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Link className="h-4 w-4 text-sky-400" />
              Portfolio Proof Links
            </h3>
            <p className="text-xs text-slate-400">
              Included directly inside the proposal for social proof.
            </p>

            <div className="space-y-1.5">
              {formData.portfolioLinks.map((link) => (
                <div
                  key={link}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700"
                >
                  <span className="truncate max-w-[200px]">{link}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePortfolio(link)}
                    className="hover:text-rose-400 ml-2"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddPortfolio} className="flex gap-2">
              <input
                type="text"
                placeholder="https://github.com/..."
                value={newPortfolio}
                onChange={(e) => setNewPortfolio(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
