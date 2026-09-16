import React from 'react';
import { 
  Zap, 
  Download, 
  Settings, 
  Play, 
  Pause, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  BookOpen, 
  Code2, 
  Radio,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Rss,
  Key
} from 'lucide-react';
import { FilterConfig } from '../types.ts';

interface HeaderProps {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
  onPollNow: () => void;
  isPolling: boolean;
  activeTab: 'feed' | 'bids' | 'rules' | 'code' | 'guide';
  setActiveTab: (tab: 'feed' | 'bids' | 'rules' | 'code' | 'guide') => void;
  onOpenTester: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  onUpdateConfig,
  onPollNow,
  isPolling,
  activeTab,
  setActiveTab,
  onOpenTester,
  onOpenSettings,
}) => {
  const handleDownloadZip = () => {
    window.location.href = '/api/download-extension-zip';
  };

  const handleToggleNotifications = async () => {
    const nextState = !config.desktopNotifications;
    if (nextState && 'Notification' in window && Notification.permission !== 'granted') {
      try {
        await Notification.requestPermission();
      } catch (e) {
        // Ignore
      }
    }
    onUpdateConfig({ desktopNotifications: nextState });
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-white/20">
              <Zap className="h-5 w-5 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Freelancer<span className="text-sky-400">AutoBid</span></span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">MV3 EXTENSION</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60 flex items-center gap-1">
                  <Rss className="h-2.5 w-2.5" />
                  Public Feed
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Radio className={`h-3 w-3 ${config.autoBidEnabled ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                  {config.autoBidEnabled ? `Polling Every ${config.pollIntervalSeconds || 30}s` : 'Engine Paused'}
                </span>
                <span>•</span>
                <span className={config.dryRunMode ? 'text-amber-400 font-medium' : 'text-emerald-400 font-medium'}>
                  {config.dryRunMode ? 'Dry-Run (Simulated)' : 'Live Bidding Active'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Interval Toggle: 30s vs 60s (1 min) */}
            <div className="hidden lg:flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700 text-xs">
              <button
                onClick={() => onUpdateConfig({ pollIntervalSeconds: 30 })}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  (config.pollIntervalSeconds || 30) <= 30
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Poll Freelancer feed every 30 seconds"
              >
                30s
              </button>
              <button
                onClick={() => onUpdateConfig({ pollIntervalSeconds: 60 })}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  (config.pollIntervalSeconds || 30) > 30
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Poll Freelancer feed every 1 minute"
              >
                1 min
              </button>
            </div>

            {/* Desktop Notification Toggle */}
            <button
              id="header-toggle-notifications-btn"
              onClick={handleToggleNotifications}
              className={`flex items-center gap-1 p-1.5 rounded-lg text-xs font-semibold border transition ${
                config.desktopNotifications
                  ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
              title={config.desktopNotifications ? 'Desktop Notifications Enabled' : 'Desktop Notifications Disabled'}
            >
              {config.desktopNotifications ? <Bell className="h-4 w-4 text-sky-400" /> : <BellOff className="h-4 w-4" />}
            </button>

            {/* Audio Alert Toggle */}
            <button
              id="header-toggle-audio-btn"
              onClick={() => onUpdateConfig({ audioAlerts: !config.audioAlerts })}
              className={`flex items-center gap-1 p-1.5 rounded-lg text-xs font-semibold border transition ${
                config.audioAlerts
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
              title={config.audioAlerts ? 'Sound Chime on New Project: Enabled' : 'Sound Chime: Muted'}
            >
              {config.audioAlerts ? <Volume2 className="h-4 w-4 text-emerald-400" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Auto-Bid Toggle Button */}
            <button
              id="header-toggle-autobid-btn"
              onClick={() => onUpdateConfig({ autoBidEnabled: !config.autoBidEnabled })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                config.autoBidEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
              title={config.autoBidEnabled ? 'Pause background polling' : 'Resume background polling'}
            >
              {config.autoBidEnabled ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Resume</span>
                </>
              )}
            </button>

            {/* Dry-Run / Live Toggle */}
            <button
              id="header-toggle-dryrun-btn"
              onClick={() => onUpdateConfig({ dryRunMode: !config.dryRunMode })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                config.dryRunMode
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
              }`}
              title="Toggle between dry-run simulation and real Freelancer bid posting"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.dryRunMode ? 'Dry-Run' : 'LIVE API'}</span>
            </button>

            {/* Poll Now Button */}
            <button
              id="header-poll-now-btn"
              onClick={onPollNow}
              disabled={isPolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Immediately poll active Freelancer projects"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPolling ? 'animate-spin text-sky-400' : ''}`} />
              <span className="hidden md:inline">Poll Now</span>
            </button>

            {/* OpenAI API Key Quick Button */}
            <button
              id="header-openai-key-btn"
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                config.openaiApiKey
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/60'
                  : 'bg-amber-950/60 text-amber-300 border-amber-700/60 hover:bg-amber-900/60'
              }`}
              title={config.openaiApiKey ? 'OpenAI API Key is configured' : 'Configure OpenAI API Key'}
            >
              <Key className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{config.openaiApiKey ? 'OpenAI Set' : 'OpenAI Key'}</span>
            </button>

            {/* Test AI Proposal Generator */}
            <button
              id="header-test-ai-btn"
              onClick={onOpenTester}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/50 transition"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden md:inline">Test AI Prompt</span>
            </button>

            {/* Rules Modal */}
            <button
              id="header-open-settings-btn"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Filters</span>
            </button>

            {/* Download Extension ZIP */}
            <button
              id="header-download-extension-btn"
              onClick={handleDownloadZip}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/30 transition"
              title="Download unpacked Chrome Extension (.zip)"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Get Extension</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-800/80 py-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
              activeTab === 'feed'
                ? 'bg-slate-800 text-sky-400 font-semibold shadow-inner'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            Live Scanned Feed
          </button>

          <button
            onClick={() => setActiveTab('bids')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
              activeTab === 'bids'
                ? 'bg-slate-800 text-sky-400 font-semibold shadow-inner'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            Bids &amp; Proposals Log
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
              activeTab === 'rules'
                ? 'bg-slate-800 text-sky-400 font-semibold shadow-inner'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Qualification &amp; AI Rules
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
              activeTab === 'code'
                ? 'bg-slate-800 text-sky-400 font-semibold shadow-inner'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Extension Code &amp; Manifest
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
              activeTab === 'guide'
                ? 'bg-slate-800 text-sky-400 font-semibold shadow-inner'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Setup &amp; Deployment Guide
          </button>
        </div>
      </div>
    </header>
  );
};
