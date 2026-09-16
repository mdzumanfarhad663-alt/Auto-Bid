/**
 * Freelancer AutoBid & Chrome Extension Hub
 * Main Dashboard Application Component
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header.tsx';
import { StatsOverview } from './components/StatsOverview.tsx';
import { LiveScannerFeed } from './components/LiveScannerFeed.tsx';
import { BidsHistory } from './components/BidsHistory.tsx';
import { FilterSettingsModal } from './components/FilterSettingsModal.tsx';
import { AiPromptEditor } from './components/AiPromptEditor.tsx';
import { CodeExportStudio } from './components/CodeExportStudio.tsx';
import { SetupGuide } from './components/SetupGuide.tsx';
import { ProposalTesterModal } from './components/ProposalTesterModal.tsx';
import { FilterConfig, FreelancerProject, BidLog, SystemStats, DEFAULT_CONFIG } from './types.ts';

export default function App() {
  const [config, setConfig] = useState<FilterConfig>(DEFAULT_CONFIG);
  const [stats, setStats] = useState<SystemStats>({
    totalScanned: 0,
    totalQualified: 0,
    totalBidsPlaced: 0,
    totalSkipped: 0,
    lastPollTimestamp: Date.now(),
    skipBreakdown: {
      missingMandatoryTags: 0,
      blacklistedKeyword: 0,
      budgetOutOfRange: 0,
      unverifiedPayment: 0,
      lowRating: 0,
      alreadyProcessed: 0,
    },
  });
  const [projects, setProjects] = useState<FreelancerProject[]>([]);
  const [bids, setBids] = useState<BidLog[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'bids' | 'rules' | 'code' | 'guide'>('feed');
  const [isPolling, setIsPolling] = useState(false);
  const [pollCountdown, setPollCountdown] = useState<number>(20);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTesterModalOpen, setIsTesterModalOpen] = useState(false);
  const [projectToTest, setProjectToTest] = useState<FreelancerProject | null>(null);

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
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1); // A5

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

  // Fetch initial data
  const prevQualifiedCount = React.useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, statsRes, projectsRes, bidsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/stats'),
        fetch('/api/projects'),
        fetch('/api/bids'),
      ]);

      let currentConfig: FilterConfig | null = null;
      if (configRes.ok) {
        currentConfig = await configRes.json();
        setConfig(currentConfig!);
      }
      if (statsRes.ok) {
        const statsData: SystemStats = await statsRes.json();
        setStats(statsData);

        // If new bids/qualified jobs were found and sound enabled, chime!
        if (statsData.totalBidsPlaced > prevQualifiedCount.current && prevQualifiedCount.current > 0) {
          if (currentConfig?.audioAlerts !== false) {
            playAlertChime();
          }
          if (currentConfig?.desktopNotifications && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('⚡ Freelancer AutoBid: New Project Found!', {
              body: `A newly qualified Freelancer project has been processed with AI proposal ready.`,
              icon: '/favicon.ico',
            });
          }
        }
        prevQualifiedCount.current = statsData.totalBidsPlaced;
      }
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (bidsRes.ok) setBids(await bidsRes.json());
    } catch (e) {
      console.warn('Failed to fetch dashboard data:', e);
    }
  }, [playAlertChime]);

  useEffect(() => {
    fetchData();

    // 1-second countdown ticker for next poll visual feedback
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

  // Manual Poll Now
  const handlePollNow = async () => {
    setIsPolling(true);
    try {
      const res = await fetch('/api/poll-now', { method: 'POST' });
      if (res.ok) {
        await fetchData();
        setPollCountdown(20);
      }
    } catch (e) {
      console.error('Manual poll failed', e);
    } finally {
      setIsPolling(false);
    }
  };

  // Clear Feed
  const handleClearHistory = async () => {
    if (window.confirm('Clear all scanned projects and bids history?')) {
      try {
        await fetch('/api/clear-history', { method: 'POST' });
        await fetchData();
      } catch (e) {
        console.error('Failed to clear history', e);
      }
    }
  };

  const handleOpenTesterForProject = (project: FreelancerProject) => {
    setProjectToTest(project);
    setIsTesterModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500/30">
      {/* Top Application Header */}
      <Header
        config={config}
        onUpdateConfig={handleUpdateConfig}
        onPollNow={handlePollNow}
        isPolling={isPolling}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenTester={() => {
          setProjectToTest(null);
          setIsTesterModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Metric Cards Overview (Always visible on all tabs) */}
        <StatsOverview stats={stats} pollSecondsRemaining={pollCountdown} />

        {/* Dynamic Tab Views with motion transitions */}
        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div
              key="feed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <LiveScannerFeed
                projects={projects}
                config={config}
                onTestProject={handleOpenTesterForProject}
                onClearHistory={handleClearHistory}
              />
            </motion.div>
          )}

          {activeTab === 'bids' && (
            <motion.div
              key="bids"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <BidsHistory bids={bids} />
            </motion.div>
          )}

          {activeTab === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <AiPromptEditor
                config={config}
                onSave={handleUpdateConfig}
                onOpenTester={() => {
                  setProjectToTest(null);
                  setIsTesterModalOpen(true);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'code' && (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <CodeExportStudio />
            </motion.div>
          )}

          {activeTab === 'guide' && (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <SetupGuide />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <FilterSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={config}
        onSave={handleUpdateConfig}
      />

      <ProposalTesterModal
        isOpen={isTesterModalOpen}
        onClose={() => setIsTesterModalOpen(false)}
        initialProject={projectToTest}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>FreelancerAutoBid Architecture • Chrome Manifest V3 &amp; Node.js Express Hub</span>
          <span className="font-mono text-[11px] text-slate-400">gpt-4o-mini Proposal Engine &lt;150w</span>
        </div>
      </footer>
    </div>
  );
}
