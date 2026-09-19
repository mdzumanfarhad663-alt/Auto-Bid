import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';

interface Row {
  key: string;
  bids: number;
  won: number;
  lost: number;
  winRate: number | null;
}

interface OutcomeAnalytics {
  totalBids: number;
  decided: number;
  won: number;
  lost: number;
  winRate: number | null;
  byOutcome: Record<string, number>;
  bySkill: Row[];
  byBudgetBand: Row[];
  byProjectType: Row[];
  byCountry: Row[];
  byHourOfDay: Row[];
  byRelevanceScore: Row[];
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

const Breakdown: React.FC<{ title: string; rows: Row[]; hint?: string }> = ({ title, rows, hint }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5">
    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    {rows.length === 0 ? (
      <p className="text-xs text-slate-400 mt-3">No data yet.</p>
    ) : (
      <table className="w-full mt-3 text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left font-medium pb-1">Segment</th>
            <th className="text-right font-medium pb-1">Bids</th>
            <th className="text-right font-medium pb-1">Won</th>
            <th className="text-right font-medium pb-1">Lost</th>
            <th className="text-right font-medium pb-1">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="py-1.5 text-slate-700">{r.key}</td>
              <td className="py-1.5 text-right text-slate-600">{r.bids}</td>
              <td className="py-1.5 text-right text-emerald-600">{r.won}</td>
              <td className="py-1.5 text-right text-rose-500">{r.lost}</td>
              <td className={`py-1.5 text-right font-semibold ${r.winRate === null ? 'text-slate-400' : r.winRate >= 0.15 ? 'text-emerald-600' : 'text-slate-700'}`}>
                {pct(r.winRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

export const WinRatePanel: React.FC = () => {
  const [data, setData] = useState<OutcomeAnalytics | null>(null);

  useEffect(() => {
    fetch('/api/analytics/outcomes')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const pending = data.byOutcome.pending || 0;
  const closed = data.byOutcome.closed || 0;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-amber-400" />
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">Win rate</div>
            <div className="text-3xl font-bold">{pct(data.winRate)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm flex-1">
          <div><div className="text-slate-400 text-xs">Bids placed</div><div className="font-semibold">{data.totalBids}</div></div>
          <div><div className="text-slate-400 text-xs">Won</div><div className="font-semibold text-emerald-400">{data.won}</div></div>
          <div><div className="text-slate-400 text-xs">Lost</div><div className="font-semibold text-rose-400">{data.lost}</div></div>
          <div><div className="text-slate-400 text-xs">Still open / closed</div><div className="font-semibold">{pending} / {closed}</div></div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Outcomes come from your Freelancer account and are synced by the extension every 10 minutes. Win rate counts only
        bids that were awarded to someone. A project that closed without an award is neither a win nor a loss.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Breakdown title="By skill" rows={data.bySkill} hint="Which skills actually convert. Tune mandatory and never-bid-on skills from this." />
        <Breakdown title="By budget band" rows={data.byBudgetBand} hint="Project maximum in USD." />
        <Breakdown title="By AI relevance score" rows={data.byRelevanceScore} hint="If 60-79 never wins, raise the minimum score." />
        <Breakdown title="By project type" rows={data.byProjectType} />
        <Breakdown title="By client country" rows={data.byCountry} />
        <Breakdown title="By hour bid was placed" rows={data.byHourOfDay} hint="Your local time." />
      </div>
    </div>
  );
};
