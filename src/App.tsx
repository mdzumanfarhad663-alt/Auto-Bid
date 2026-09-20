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
import { AdminPage } from './pages/AdminPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { AccountSettingsPage } from './pages/AccountSettingsPage.tsx';
import { FilterConfig, FreelancerProject, DEFAULT_CONFIG, PublicUser } from './types.ts';

export default function App() {
  const [config, setConfig] = useState<FilterConfig>(DEFAULT_CONFIG);

  const [isPolling, setIsPolling] = useState(false);
  const [pollCountdown, setPollCountdown] = useState<number>(30);

  // null = checking, undefined-user = show login/register, PublicUser = signed in
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        setAuthed(!!d.authenticated);
        setCurrentUser(d.user || null);
        setGoogleEnabled(!!d.googleEnabled);
      })
      .catch(() => setAuthed(false));
  }, []);

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

  // The server (one SQLite row per user) is the sole source of truth for config now that
  // every account is isolated. A shared localStorage key here would leak one account's
  // settings into another's on the same browser, so nothing is cached or written back.
  const fetchData = useCallback(async () => {
    try {
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const serverConfig: FilterConfig = await configRes.json();
        setConfig({ ...DEFAULT_CONFIG, ...serverConfig });
      }
      // Opening project tabs belongs to the extension alone. It owns chrome.tabs, so it is
      // the only side that can run a one-at-a-time queue and close a tab when the bid ends.
    } catch (e) {
      console.warn('Failed to fetch initial sync data:', e);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
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
  }, [authed, fetchData, config.pollIntervalSeconds]);

  // Update configuration handler
  const handleUpdateConfig = async (updated: Partial<FilterConfig>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
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

  if (authed === null) {
    return <div className="min-h-screen bg-slate-950" />;
  }
  if (!authed || !currentUser) {
    return authScreen === 'register' ? (
      <RegisterPage
        googleEnabled={googleEnabled}
        onSwitchToLogin={() => setAuthScreen('login')}
        onAuthenticated={(u) => { setCurrentUser(u); setAuthed(true); }}
      />
    ) : (
      <LoginPage
        googleEnabled={googleEnabled}
        onSwitchToRegister={() => setAuthScreen('register')}
        onAuthenticated={(u) => { setCurrentUser(u); setAuthed(true); }}
      />
    );
  }

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
              currentUser={currentUser}
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
          <Route path="/account" element={<AccountSettingsPage user={currentUser} onUserUpdated={setCurrentUser} />} />
          {currentUser.role === 'admin' && <Route path="/admin" element={<AdminPage currentUserId={currentUser.id} />} />}
          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
