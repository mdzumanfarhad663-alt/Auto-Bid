import React, { useState } from 'react';
import {
  Search,
  Download,
  Clock,
  Menu,
  MessageCircle,
  Sparkles,
  RefreshCw,
  Sliders
} from 'lucide-react';
import { FilterConfig } from '../../types.ts';

interface UtilityHeaderProps {
  onToggleMobileSidebar: () => void;
  config: FilterConfig;
  onUpdateConfig?: (updated: Partial<FilterConfig>) => void;
  onPollNow?: () => void;
  isPolling?: boolean;
  onOpenTester?: () => void;
  userName?: string;
  trialDaysLeft?: number;
  extensionVersion?: string;
}

export const UtilityHeader: React.FC<UtilityHeaderProps> = ({
  onToggleMobileSidebar,
  config,
  onUpdateConfig,
  onPollNow,
  isPolling = false,
  onOpenTester,
  userName = 'Md zuman Farhad',
  trialDaysLeft = 5,
  extensionVersion = 'v1.0.29',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadExtension = async () => {
    setIsDownloading(true);
    try {
      const link = document.createElement('a');
      link.href = '/api/download-extension-zip';
      link.download = 'freelancer-autobid-extension.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to download extension ZIP:', e);
    } finally {
      setTimeout(() => setIsDownloading(false), 800);
    }
  };

  const handleWhatsAppHelp = () => {
    window.open('https://api.whatsapp.com/send?text=Hi!%20I%20need%20assistance%20with%20Freelancer%20AutoBid%20setup.', '_blank', 'noopener,noreferrer');
  };

  return (
    <header
      id="utility-header"
      className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4"
    >
      {/* Left: Mobile Menu Toggle & Global Search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <button
          id="btn-open-sidebar"
          type="button"
          onClick={onToggleMobileSidebar}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search help or ask a question..."
            className="w-full bg-slate-50 border border-slate-200/90 rounded-lg pl-9 pr-14 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs pointer-events-none">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Right Action Items */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Manual Poll Trigger */}
        {onPollNow && (
          <button
            id="btn-header-poll-now"
            type="button"
            onClick={onPollNow}
            disabled={isPolling}
            title="Scan Freelancer Feed Now"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isPolling ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden md:inline">{isPolling ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        )}

        {/* AI Proposal Tester */}
        {onOpenTester && (
          <button
            id="btn-header-open-tester"
            type="button"
            onClick={onOpenTester}
            title="Test AI Proposal Prompt"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden lg:inline">AI Proposal Tester</span>
          </button>
        )}

        {/* WhatsApp Button */}
        <button
          id="btn-whatsapp-support"
          type="button"
          onClick={handleWhatsAppHelp}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-2xs"
        >
          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-semibold">WhatsApp</span>
        </button>

        {/* Download Extension Button */}
        <button
          id="btn-download-extension"
          type="button"
          onClick={handleDownloadExtension}
          disabled={isDownloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-2xs"
        >
          <Download className={`w-3.5 h-3.5 text-blue-600 ${isDownloading ? 'animate-bounce' : ''}`} />
          <span className="font-semibold">Download {extensionVersion}</span>
        </button>

        {/* Trial Days Counter */}
        <div
          id="trial-days-badge"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{trialDaysLeft} days left in trial</span>
        </div>

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-semibold text-xs">
            {userName.charAt(0) || 'U'}
          </div>
          <span className="hidden xl:inline text-xs font-semibold text-slate-800">
            {userName}
          </span>
        </div>
      </div>
    </header>
  );
};
