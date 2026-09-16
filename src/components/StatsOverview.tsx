import React from 'react';
import { SystemStats } from '../types.ts';
import { 
  Scan, 
  CheckCircle2, 
  Send, 
  XCircle, 
  Clock, 
  TrendingUp, 
  AlertTriangle 
} from 'lucide-react';

interface StatsOverviewProps {
  stats: SystemStats;
  pollSecondsRemaining: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, pollSecondsRemaining }) => {
  const qualificationRate = stats.totalScanned > 0
    ? Math.round((stats.totalQualified / stats.totalScanned) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      {/* Total Scanned Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Scanned</span>
          <div className="p-1.5 rounded-lg bg-slate-800 text-sky-400">
            <Scan className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.totalScanned}</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <Clock className="h-3 w-3 text-sky-400" />
            <span>Next in <strong className="text-sky-300">{pollSecondsRemaining}s</strong></span>
          </div>
        </div>
      </div>

      {/* Qualified Projects */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-sky-500/40 transition">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">Qualified</span>
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-bold text-sky-400 tracking-tight">{stats.totalQualified}</div>
          <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
            <TrendingUp className="h-3 w-3 text-sky-400" />
            <span><strong className="text-slate-200">{qualificationRate}%</strong> qualification rate</span>
          </div>
        </div>
      </div>

      {/* Bids Placed */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 transition">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Bids Placed</span>
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Send className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">{stats.totalBidsPlaced}</div>
          <div className="text-xs text-slate-400 mt-1">
            AI proposals &lt; 150 words
          </div>
        </div>
      </div>

      {/* Skipped Projects */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-rose-500/40 transition">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">Filtered Out</span>
          <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
            <XCircle className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-bold text-rose-400 tracking-tight">{stats.totalSkipped}</div>
          <div className="text-xs text-slate-400 mt-1">
            Disqualified by rules
          </div>
        </div>
      </div>

      {/* Disqualification Reasons Breakdown */}
      <div className="col-span-2 lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            Disqualification Log
          </span>
        </div>
        <div className="space-y-1 text-[11px] text-slate-400">
          <div className="flex justify-between items-center">
            <span className="truncate">Missing Tech Tags:</span>
            <span className="font-mono font-semibold text-slate-200">{stats.skipBreakdown.missingMandatoryTags}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="truncate">Blacklisted Word:</span>
            <span className="font-mono font-semibold text-rose-300">{stats.skipBreakdown.blacklistedKeyword}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="truncate">Budget / Currency:</span>
            <span className="font-mono font-semibold text-slate-200">{stats.skipBreakdown.budgetOutOfRange}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="truncate">Unverified Client:</span>
            <span className="font-mono font-semibold text-amber-300">{stats.skipBreakdown.unverifiedPayment}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
