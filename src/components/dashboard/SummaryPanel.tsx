import React from 'react';
import { Trophy, Gavel, Calendar, Search, Activity } from 'lucide-react';

interface SummaryPanelProps {
  bidsAllTime?: number;
  bidsThisMonth?: number;
  scansAllTime?: number;
  scansThisMonth?: number;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  bidsAllTime = 29,
  bidsThisMonth = 29,
  scansAllTime = 7710,
  scansThisMonth = 7710,
}) => {
  return (
    <div
      id="all-time-summary-card"
      className="p-5 sm:p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between"
    >
      {/* Header with Title & Trophy Icon */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          ALL TIME &amp; THIS MONTH
        </h2>
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Trophy className="w-4 h-4" />
        </div>
      </div>

      {/* 2x2 Grid of Stat Tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 flex-1">
        {/* Tile 1: All Time Bids */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 border border-slate-200/70 flex flex-col justify-between hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              ALL TIME
            </span>
            <Gavel className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-slate-900 font-mono leading-none">
              {bidsAllTime.toLocaleString()}
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-1">
              Bids submitted
            </div>
          </div>
        </div>

        {/* Tile 2: This Month Bids */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 border border-slate-200/70 flex flex-col justify-between hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              THIS MONTH
            </span>
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-slate-900 font-mono leading-none">
              {bidsThisMonth.toLocaleString()}
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-1">
              Bids submitted
            </div>
          </div>
        </div>

        {/* Tile 3: All Time Scanned */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 border border-slate-200/70 flex flex-col justify-between hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              ALL TIME
            </span>
            <Search className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-slate-900 font-mono leading-none">
              {scansAllTime.toLocaleString()}
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-1">
              Projects scanned
            </div>
          </div>
        </div>

        {/* Tile 4: This Month Scanned */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 border border-slate-200/70 flex flex-col justify-between hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              THIS MONTH
            </span>
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-slate-900 font-mono leading-none">
              {scansThisMonth.toLocaleString()}
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-1">
              Projects scanned
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
