/**
 * Freelancer AutoBid & Chrome Extension Hub
 * App Component with URL-based Routing and Permanent Left Sidebar Layout
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ScannedProjectsPage } from './pages/ScannedProjectsPage.tsx';
import { BidHistoryPage } from './pages/BidHistoryPage.tsx';
import { AnalyticsPage } from './pages/AnalyticsPage.tsx';
import { ActivityLogPage } from './pages/ActivityLogPage.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { ProjectFiltersPage } from './pages/ProjectFiltersPage.tsx';
import { BiddingBehaviourPage } from './pages/BiddingBehaviourPage.tsx';
import { AiPromptsPage } from './pages/AiPromptsPage.tsx';
import { BiddingProfilesPage } from './pages/BiddingProfilesPage.tsx';
import { NdaIpSigningPage } from './pages/NdaIpSigningPage.tsx';
import { CodeExportPage } from './pages/CodeExportPage.tsx';
import { SetupGuidePage } from './pages/SetupGuidePage.tsx';
import { FilterConfig, FreelancerProject, DEFAULT_CONFIG } from './types.ts';

export default function App() {
  // Immediately read from localStorage on initial render to prevent flickering to defaults
  const [config, setConfig] = useState<FilterConfig>(() => {
    try {
      const cached = localStorage.getItem('freelancer_autobid_config');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_CONFIG, ...parsed };
        }
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  });

  const [isPolling, setIsPolling] = useState(false);
  const [pollCountdown, setPollCountdown] = useState<number>(30);
  const openedProjectIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);

  // Synthesized Web Audio chime on qualified new project
  const playAlertChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio context might be restricted before user interaction
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, projectsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/projects'),
      ]);

      if (configRes.ok) {
        const currentConfig: FilterConfig = await configRes.json();
        setConfig(currentConfig);
      }

      if (projectsRes.ok) {
        const fetchedProjects: FreelancerProject[] = await projectsRes.json();

        if (isInitialLoadRef.current) {
          fetchedProjects.forEach((p) => openedProjectIdsRef.current.add(p.id));
          isInitialLoadRef.current = false;
        } else if (config?.autoBidEnabled && config?.autoOpenQualified !== false) {
          for (const p of fetchedProjects) {
            if (
              (p.status === 'QUALIFIED' || p.status === 'BID_PLACED') &&
              p.generatedProposal &&
              !openedProjectIdsRef.current.has(p.id)
            ) {
              openedProjectIdsRef.current.add(p.id);

              const safeBaseUrl =
                p.url && !p.url.includes('sample-job') && p.id > 40000000
                  ? `https://www.freelancer.com/projects/${p.id}`
                  : p.url ||
                    `https://www.freelancer.com/search/projects?q=${encodeURIComponent(
                      p.jobs?.[0]?.name || 'web development'
                    )}`;

              const hashParams = new URLSearchParams();
              if (p.generatedProposal) hashParams.set('autobid_p', p.generatedProposal);
              hashParams.set('amount', String(p.bidAmount || p.budget?.minimum || 50));
              hashParams.set('period', String(p.bidPeriodDays || config?.defaultDeliveryDays || 3));
              hashParams.set('auto_submit', config?.handsFreeAutoSubmit !== false ? '1' : '0');
              hashParams.set('autobid', '1');
              hashParams.set('pid', String(p.id));

              const targetUrl = `${safeBaseUrl}#${hashParams.toString()}`;
              try {
                window.open(targetUrl, '_blank', 'noopener,noreferrer');
              } catch (err) {
                console.warn('Popup blocked or failed to open tab:', err);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch initial sync data:', e);
    }
  }, [config?.autoBidEnabled, config?.autoOpenQualified, config?.defaultDeliveryDays, config?.handsFreeAutoSubmit]);

  useEffect(() => {
    fetchData();

    const intervalSecs = config.pollIntervalSeconds || 30;
    setPollCountdown(intervalSecs);

    const ticker = setInterval(() => {
      setPollCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return config.pollIntervalSeconds || 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [fetchData, config.pollIntervalSeconds]);

  // Update configuration handler
  const handleUpdateConfig = async (updated: Partial<FilterConfig>) => {
    try {
      const mergedConfig = { ...config, ...updated };
      try {
        localStorage.setItem('freelancer_autobid_config', JSON.stringify(mergedConfig));
      } catch (err) {}

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        try {
          localStorage.setItem('freelancer_autobid_config', JSON.stringify(data.config));
        } catch (err) {}
      }
    } catch (e) {
      console.error('Failed to update config', e);
    }
  };

  // Manual Poll Now trigger
  const handlePollNow = async () => {
    setIsPolling(true);
    try {
      const res = await fetch('/api/poll-now', { method: 'POST' });
      if (res.ok) {
        await fetchData();
        setPollCountdown(config.pollIntervalSeconds || 30);
      }
    } catch (e) {
      console.error('Manual poll failed', e);
    } finally {
      setIsPolling(false);
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <AppLayout
              config={config}
              onUpdateConfig={handleUpdateConfig}
              onPollNow={handlePollNow}
              isPolling={isPolling}
              pollSecondsRemaining={pollCountdown}
            />
          }
        >
          {/* Default Route redirects to /dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/scanned-projects" element={<ScannedProjectsPage />} />
          <Route path="/bid-history" element={<BidHistoryPage />} />
          <Route path="/activity-log" element={<ActivityLogPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/project-filters" element={<ProjectFiltersPage />} />
          <Route path="/bidding-behaviour" element={<BiddingBehaviourPage />} />
          <Route path="/ai-prompts" element={<AiPromptsPage />} />
          <Route path="/bidding-profiles" element={<BiddingProfilesPage />} />
          <Route path="/nda-ip-signing" element={<NdaIpSigningPage />} />
          <Route path="/code" element={<CodeExportPage />} />
          <Route path="/guide" element={<SetupGuidePage />} />
          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
