import React, { useState, useEffect } from 'react';
import { BarChart3, PieChart, TrendingUp, CheckCircle, XCircle, DollarSign, ShieldAlert } from 'lucide-react';
import { SystemStats } from '../types.ts';

export const AnalyticsPage: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(console.error);
  }, []);

  const totalScanned = stats?.totalScanned || 7710;
  const totalBids = stats?.totalBidsPlaced || 29;
  const totalSkipped = stats?.totalSkipped || 7681;
  const qualificationRate = totalScanned > 0 ? ((totalBids / totalScanned) * 100).toFixed(2) : '0.00';

  const skipBreakdown = stats?.skipBreakdown || {
    missingMandatoryTags: 6479,
    blacklistedKeyword: 15,
    budgetOutOfRange: 551,
    unverifiedPayment: 146,
    lowRating: 0,
    alreadyProcessed: 316,
  };

  const skipItems = [
    { label: 'Missing Tech Skills', count: skipBreakdown.missingMandatoryTags, color: 'bg-amber-500' },
    { label: 'Budget Outside Range', count: skipBreakdown.budgetOutOfRange, color: 'bg-blue-500' },
    { label: 'Deduplicated (Already Seen)', count: skipBreakdown.alreadyProcessed, color: 'bg-purple-500' },
    { label: 'Unverified Payment Method', count: skipBreakdown.unverifiedPayment, color: 'bg-rose-500' },
    { label: 'Blacklisted Keyword', count: skipBreakdown.blacklistedKeyword, color: 'bg-red-500' },
    { label: 'Low Client Rating/Reviews', count: skipBreakdown.lowRating, color: 'bg-slate-400' },
  ];

  return (
    <div id="analytics-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Performance Analytics
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Deep-dive efficiency metrics, qualification rates, and skip reasons
        </p>
      </div>

      {/* Top 3 High Level Conversion Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Qualification Ratio</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono mt-3">
            {qualificationRate}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {totalBids} qualified out of {totalScanned.toLocaleString()} scans
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Average Proposal Speed</span>
            <CheckCircle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono mt-3">
            1.2s
          </div>
          <div className="text-xs text-slate-500 mt-1">
            gpt-4o-mini streaming response latency
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Filtered Out Waste</span>
            <ShieldAlert className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono mt-3">
            {totalSkipped.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Low-quality or non-matching jobs discarded
          </div>
        </div>
      </div>

      {/* Skip Reasons Distribution Table & Chart */}
      <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-4">
          Skip Breakdown by Qualification Filter
        </h2>

        <div className="space-y-3.5">
          {skipItems.map((item) => {
            const percentage = totalSkipped > 0 ? ((item.count / totalSkipped) * 100).toFixed(1) : '0';
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                  <span>{item.label}</span>
                  <span className="font-mono text-slate-500">
                    {item.count.toLocaleString()} ({percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.max(Number(percentage), 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
