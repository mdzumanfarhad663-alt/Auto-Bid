import React, { useEffect, useState } from 'react';
import { Brain, FlaskConical, Save, RotateCcw } from 'lucide-react';
import { FilterConfig, FreelancerProject } from '../types.ts';
import { DEFAULT_RELEVANCE_PROMPT } from '../../extension/relevance.js';

interface Props {
  config: FilterConfig;
  onSave: (updated: Partial<FilterConfig>) => void;
}

interface Verdict {
  projectId: number;
  title: string;
  eligible: boolean;
  score: number;
  reason: string;
  model: string;
  costUSD: number;
}

export const RelevanceGateEditor: React.FC<Props> = ({ config, onSave }) => {
  const [enabled, setEnabled] = useState(config.aiRelevanceEnabled !== false);
  const [prompt, setPrompt] = useState(config.relevancePrompt || '');
  const [minScore, setMinScore] = useState<number>(config.relevanceMinScore ?? 60);
  const [saved, setSaved] = useState(false);

  const [recent, setRecent] = useState<FreelancerProject[]>([]);
  const [testId, setTestId] = useState<number | ''>('');
  const [testing, setTesting] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [testError, setTestError] = useState('');

  useEffect(() => {
    setEnabled(config.aiRelevanceEnabled !== false);
    setPrompt(config.relevancePrompt || '');
    setMinScore(config.relevanceMinScore ?? 60);
  }, [config.aiRelevanceEnabled, config.relevancePrompt, config.relevanceMinScore]);

  useEffect(() => {
    fetch('/api/projects?limit=25')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: FreelancerProject[]) => {
        setRecent(list);
        if (list.length && testId === '') setTestId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const handleSave = () => {
    onSave({ aiRelevanceEnabled: enabled, relevancePrompt: prompt, relevanceMinScore: minScore });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleTest = async () => {
    if (testId === '') return;
    setTesting(true);
    setVerdict(null);
    setTestError('');
    try {
      const res = await fetch('/api/relevance-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: testId, relevancePrompt: prompt, relevanceMinScore: minScore }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVerdict(data);
    } catch (e: any) {
      setTestError(e.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            AI Relevance Gate
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Projects that pass your exact filters are judged by the model against this prompt before any bid.
            Describe your niche and red flags in plain words. Only projects it marks eligible are bid on.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-violet-500"
          />
          Enabled
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300">Project relevance prompt</label>
          <button
            type="button"
            onClick={() => setPrompt('')}
            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Use built-in default
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={DEFAULT_RELEVANCE_PROMPT}
          rows={10}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-violet-500"
        />
        <p className="text-[11px] text-slate-500">
          Empty uses the built-in default shown above. The model always returns a score 0–100 and a one-sentence reason,
          shown on every skipped project.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Minimum score to bid</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500 mt-1">Model verdict and score must both pass.</p>
        </div>
        <div className="sm:col-span-2 text-[11px] text-slate-500 leading-relaxed">
          <span className="text-slate-300 font-semibold">Cost:</span> one gpt-4o-mini call per project that survives your
          filters, roughly 600 input + 60 output tokens ≈ <span className="text-emerald-400">$0.00013</span> each.
          A hundred checks is about a cent. Tight exact filters keep this small.
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 space-y-3">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-sky-400" /> Test this prompt on a scanned project
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={testId}
            onChange={(e) => setTestId(Number(e.target.value))}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
          >
            {recent.length === 0 && <option value="">No scanned projects yet</option>}
            {recent.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title.slice(0, 70)} — {p.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || testId === ''}
            className="px-4 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
          >
            {testing ? 'Judging…' : 'Run check'}
          </button>
        </div>

        {testError && <div className="text-xs text-rose-400">{testError}</div>}

        {verdict && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs ${
              verdict.eligible ? 'border-emerald-700 bg-emerald-950/40' : 'border-rose-800 bg-rose-950/30'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`font-bold ${verdict.eligible ? 'text-emerald-300' : 'text-rose-300'}`}>
                {verdict.eligible ? 'Eligible' : 'Not relevant'} · {verdict.score}/100
              </span>
              <span className="text-slate-500">
                {verdict.model} · ${verdict.costUSD.toFixed(5)}
              </span>
            </div>
            <div className="text-slate-300 mt-1">{verdict.reason}</div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2 bg-violet-700 hover:bg-violet-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition"
        >
          <Save className="h-4 w-4" /> {saved ? 'Saved' : 'Save Relevance Settings'}
        </button>
      </div>
    </div>
  );
};
