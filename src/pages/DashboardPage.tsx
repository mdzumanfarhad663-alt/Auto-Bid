import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Gavel, Radar, Calendar, Search } from 'lucide-react';
import { StatCard } from '../components/dashboard/StatCard.tsx';
import { ActivityChart } from '../components/dashboard/ActivityChart.tsx';
import { SummaryPanel } from '../components/dashboard/SummaryPanel.tsx';
import { RecentBidsCard } from '../components/dashboard/RecentBidsCard.tsx';
import { RecentScansCard } from '../components/dashboard/RecentScansCard.tsx';
import { DashboardData, FilterConfig } from '../types.ts';

interface OutletContextType {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
  onPollNow: () => void;
  isPolling: boolean;
  pollSecondsRemaining: number;
}

export const DashboardPage: React.FC = () => {
  const { config, pollSecondsRemaining } = useOutletContext<OutletContextType>();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(() => {
    try {
      const cached = localStorage.getItem('freelancer_autobid_dashboard_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  });

  const [isLoading, setIsLoading] = useState(!dashboardData);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data: DashboardData = await res.json();
        setDashboardData(data);
        try {
          localStorage.setItem('freelancer_autobid_dashboard_cache', JSON.stringify(data));
        } catch (e) {}
      }
    } catch (e) {
      console.warn('Failed to fetch dashboard data:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Extract values with safe defaults
  const user = dashboardData?.user || {
    name: 'Md zuman Farhad',
    email: 'mdzumanfarhad663@gmail.com',
    trialDaysLeft: 5,
    extensionVersion: 'v1.0.29',
    extensionStatus: 'idle',
  };

  const stats = dashboardData?.stats || {
    bidsToday: 0,
    scansToday: 0,
    bidsThisWeek: 4,
    scansThisWeek: 35,
    bidsThisMonth: 29,
    scansThisMonth: 7710,
    bidsAllTime: 29,
    scansAllTime: 7710,
  };

  const activity24h = dashboardData?.activity24h || {
    points: [
      { label: '-24h', scans: 5, bids: 0 },
      { label: '-18h', scans: 12, bids: 1 },
      { label: '-12h', scans: 8, bids: 1 },
      { label: '-6h', scans: 15, bids: 2 },
      { label: 'Now', scans: 4, bids: 0 },
    ],
    totalBids24h: 4,
    totalScans24h: 35,
  };

  const recentBids = dashboardData?.recentBids || [];
  const recentScans = dashboardData?.recentScans || [];

  const shortFirstName = user.name ? user.name.split(' ')[0] : 'Md';

  return (
    <div id="dashboard-page" className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Overview
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Good to see you, {shortFirstName}.{' '}
            <span className="font-semibold text-slate-700 font-mono">{stats.bidsToday} bids</span> and{' '}
            <span className="font-semibold text-slate-700 font-mono">{stats.scansToday} scans</span> today so far.
          </p>
        </div>

        {pollSecondsRemaining !== undefined && (
          <div className="text-[11px] font-medium text-slate-400 self-start sm:self-auto flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Next background sync in {pollSecondsRemaining}s</span>
          </div>
        )}
      </div>

      {/* 4 Top Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: BIDS TODAY */}
        <StatCard
          id="stat-card-bids-today"
          title="BIDS"
          period="TODAY"
          value={stats.bidsToday}
          variant="blue"
          icon={Gavel}
          trendText={stats.bidsToday > 0 ? `+${stats.bidsToday} today` : 'No data yet'}
          hasData={stats.bidsToday > 0}
          sparkline={[0, 1, 0, 2, 1, stats.bidsToday, stats.bidsToday]}
        />

        {/* Card 2: PROJECTS SCANNED TODAY */}
        <StatCard
          id="stat-card-scans-today"
          title="PROJECTS SCANNED"
          period="TODAY"
          value={stats.scansToday}
          variant="purple"
          icon={Radar}
          trendText={stats.scansToday > 0 ? `+${stats.scansToday} today` : 'No data yet'}
          hasData={stats.scansToday > 0}
          sparkline={[0, 2, 1, 3, 2, stats.scansToday, stats.scansToday]}
        />

        {/* Card 3: BIDS THIS WEEK */}
        <StatCard
          id="stat-card-bids-week"
          title="BIDS"
          period="THIS WEEK"
          value={stats.bidsThisWeek}
          variant="amber"
          icon={Calendar}
          trendText={`~ +${stats.bidsThisWeek} vs last`}
          hasData={true}
          sparkline={[1, 2, 2, 3, 4, 3, stats.bidsThisWeek || 4]}
        />

        {/* Card 4: PROJECTS SCANNED THIS WEEK */}
        <StatCard
          id="stat-card-scans-week"
          title="PROJECTS SCANNED"
          period="THIS WEEK"
          value={stats.scansThisWeek}
          variant="emerald"
          icon={Search}
          trendText={`~ +${stats.scansThisWeek} vs last`}
          hasData={true}
          sparkline={[5, 12, 18, 22, 28, 30, stats.scansThisWeek || 35]}
        />
      </div>

      {/* 24H Activity & All-Time / Monthly Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 2/3 Width on Large Screens: Activity Area Chart */}
        <div className="lg:col-span-2">
          <ActivityChart
            points={activity24h.points}
            totalScans={activity24h.totalScans24h}
            totalBids={activity24h.totalBids24h}
          />
        </div>

        {/* 1/3 Width on Large Screens: All Time & This Month Summary */}
        <div className="lg:col-span-1">
          <SummaryPanel
            bidsAllTime={stats.bidsAllTime}
            bidsThisMonth={stats.bidsThisMonth}
            scansAllTime={stats.scansAllTime}
            scansThisMonth={stats.scansThisMonth}
          />
        </div>
      </div>

      {/* Bottom Section: Recent Bids & Recently Scanned Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Recent Bids List */}
        <RecentBidsCard bids={recentBids} />

        {/* Right: Recently Scanned List */}
        <RecentScansCard scans={recentScans} />
      </div>
    </div>
  );
};
