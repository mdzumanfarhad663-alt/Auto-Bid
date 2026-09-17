import React from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Layers, ShieldCheck, Zap, Sliders, ArrowRight, Bot, Cpu } from 'lucide-react';
import { FilterConfig } from '../types.ts';

interface OutletContextType {
  config: FilterConfig;
}

export const OverviewPage: React.FC = () => {
  const { config } = useOutletContext<OutletContextType>();

  return (
    <div id="overview-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          System Overview &amp; Health
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          High-level operational health and active automation status
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Bidding State</h2>
              <p className="text-xs text-slate-500">Autonomous bidding execution pipeline</p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/70 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Auto-Bidding:</span>
              <span className={`font-bold ${config.autoBidEnabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                {config.autoBidEnabled ? 'ENABLED' : 'PAUSED'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Mode:</span>
              <span className="font-bold text-slate-700">
                {config.dryRunMode ? 'Simulation (Dry-Run)' : 'Live Freelancer.com'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Scan Interval:</span>
              <span className="font-mono text-slate-700">{config.pollIntervalSeconds}s</span>
            </div>
          </div>

          <Link
            to="/bidding-behaviour"
            className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <span>Adjust bidding behaviour</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Active Filters</h2>
              <p className="text-xs text-slate-500">Mandatory criteria &amp; blacklists</p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/70 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Mandatory Skills:</span>
              <span className="font-bold text-slate-700">{config.mandatorySkills.length} configured</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Negative Keywords:</span>
              <span className="font-bold text-slate-700">{config.negativeKeywords.length} blacklisted</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Budget Range:</span>
              <span className="font-mono text-slate-700">${config.minBudget} - ${config.maxBudget} USD</span>
            </div>
          </div>

          <Link
            to="/project-filters"
            className="inline-flex items-center gap-2 text-xs font-semibold text-purple-600 hover:text-purple-700"
          >
            <span>Configure project filters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
