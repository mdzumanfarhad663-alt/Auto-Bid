import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Copy, 
  Check, 
  DollarSign, 
  Tag, 
  AlertCircle 
} from 'lucide-react';
import { FreelancerProject } from '../types.ts';

interface ProposalTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProject?: FreelancerProject | null;
}

export const ProposalTesterModal: React.FC<ProposalTesterModalProps> = ({
  isOpen,
  onClose,
  initialProject,
}) => {
  const [title, setTitle] = useState(
    initialProject?.title || 'Fix critical WooCommerce checkout loading speed and Stripe webhook error'
  );
  const [description, setDescription] = useState(
    initialProject?.description ||
      'We run a WooCommerce shop and after updating plugins our checkout page has severe latency issues. We also get occasional 500 errors on Stripe payment confirmation webhooks. Looking for a senior WordPress / PHP engineer to optimize database queries and fix webhook handler.'
  );
  const [skills, setSkills] = useState(
    initialProject?.jobs.map((j) => j.name).join(', ') || 'WordPress, PHP, WooCommerce, Stripe, MySQL'
  );
  const [minBudget, setMinBudget] = useState(initialProject?.budget.minimum || 150);
  const [maxBudget, setMaxBudget] = useState(initialProject?.budget.maximum || 400);
  const [currency, setCurrency] = useState(initialProject?.budget.currency || 'USD');

  const [isLoading, setIsLoading] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{
    proposal: string;
    wordCount: number;
    modelUsed: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    const mockProject: FreelancerProject = {
      id: Math.floor(Math.random() * 900000) + 100000,
      title,
      description,
      submitDate: Date.now(),
      budget: { minimum: Number(minBudget), maximum: Number(maxBudget), currency },
      jobs: skills.split(',').map((s, i) => ({ id: i + 1, name: s.trim() })).filter((j) => j.name),
      client: {
        id: 9999,
        username: 'test_client',
        rating: 4.9,
        reviewsCount: 15,
        paymentVerified: true,
        identityVerified: true,
        country: 'United States',
      },
      status: 'PENDING',
    };

    try {
      const res = await fetch('/api/generate-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: mockProject }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      setGeneratedResult({
        proposal: data.proposal,
        wordCount: data.wordCount || data.proposal.split(/\s+/).filter(Boolean).length,
        modelUsed: data.modelUsed || 'gpt-4o-mini',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to generate proposal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (generatedResult?.proposal) {
      navigator.clipboard.writeText(generatedResult.proposal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Interactive AI Proposal Tester</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Job Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Tag className="h-3 w-3 text-sky-400" />
                Required Skills (Comma separated)
              </label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-emerald-400" />
                Budget Range &amp; Currency
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={minBudget}
                  onChange={(e) => setMinBudget(Number(e.target.value))}
                  placeholder="Min"
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  type="number"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(Number(e.target.value))}
                  placeholder="Max"
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition"
          >
            <Sparkles className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Generating with gpt-4o-mini...' : 'Generate Test Proposal (<150 words)'}
          </button>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {generatedResult && (
            <div className="space-y-2 bg-slate-950 border border-indigo-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-400">
                    {generatedResult.wordCount} words
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Target: &lt;150w • {generatedResult.modelUsed}
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Proposal</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-xs text-slate-200 whitespace-pre-line leading-relaxed font-sans pt-2 border-t border-slate-800">
                {generatedResult.proposal}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
