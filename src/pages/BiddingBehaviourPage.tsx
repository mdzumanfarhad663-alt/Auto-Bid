import React, { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  DollarSign,
  Gauge,
  Clock,
  HelpCircle,
  Sparkles,
  RotateCcw,
  Pencil,
  ChevronRight,
  Info,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Sliders,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { FilterConfig, FreelancerProject, DEFAULT_CONFIG } from '../types.ts';
import { BidAmountRulesModal } from '../components/bidding/BidAmountRulesModal.tsx';
import { FreeUpgradesModal } from '../components/bidding/FreeUpgradesModal.tsx';
import { ResetConfirmationModal } from '../components/bidding/ResetConfirmationModal.tsx';

interface OutletContextType {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
  onOpenTester: (project?: FreelancerProject) => void;
}

export const BiddingBehaviourPage: React.FC = () => {
  const { config, onUpdateConfig } = useOutletContext<OutletContextType>();

  const [isBidRulesOpen, setIsBidRulesOpen] = useState(false);
  const [isUpgradesOpen, setIsUpgradesOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [showSavedNotification, setShowSavedNotification] = useState(false);

  const notifySaved = () => {
    setShowSavedNotification(true);
    setTimeout(() => setShowSavedNotification(false), 2400);
  };

  const handleUpdate = (updated: Partial<FilterConfig>) => {
    onUpdateConfig(updated);
    notifySaved();
  };

  const handleResetDefaults = () => {
    onUpdateConfig({
      bidStrategy: DEFAULT_CONFIG.bidStrategy,
      bidPercentageOfMaxBudget: DEFAULT_CONFIG.bidPercentageOfMaxBudget,
      fixedBidAmount: DEFAULT_CONFIG.fixedBidAmount,
      defaultDeliveryDays: DEFAULT_CONFIG.defaultDeliveryDays,
      useAiPricingAndDays: DEFAULT_CONFIG.useAiPricingAndDays,
      budgetTiersEnabled: DEFAULT_CONFIG.budgetTiersEnabled,
      budgetTiers: DEFAULT_CONFIG.budgetTiers,
      bidAmountFormula: DEFAULT_CONFIG.bidAmountFormula,
      delayBetweenBidsSeconds: DEFAULT_CONFIG.delayBetweenBidsSeconds,
      maxBidsPerDay: DEFAULT_CONFIG.maxBidsPerDay,
      activeHoursFrom: DEFAULT_CONFIG.activeHoursFrom,
      activeHoursTo: DEFAULT_CONFIG.activeHoursTo,
      autoPostClarification: DEFAULT_CONFIG.autoPostClarification,
      allowFreeSealedUpgrade: DEFAULT_CONFIG.allowFreeSealedUpgrade,
      allowFreeNdaUpgrade: DEFAULT_CONFIG.allowFreeNdaUpgrade,
      handsFreeAutoSubmit: DEFAULT_CONFIG.handsFreeAutoSubmit,
      autoSubmitDelaySeconds: DEFAULT_CONFIG.autoSubmitDelaySeconds,
      autoOpenQualified: DEFAULT_CONFIG.autoOpenQualified,
      autoCloseTabOnSuccess: DEFAULT_CONFIG.autoCloseTabOnSuccess,
      autoCloseDelaySeconds: DEFAULT_CONFIG.autoCloseDelaySeconds,
    });
    notifySaved();
  };

  // Helper for active hours format
  const formatHour = (h: number) => {
    if (h === 0 || h === 24) return `${h} (12:00 AM)`;
    if (h === 12) return `${h} (12:00 PM)`;
    if (h < 12) return `${h} (${h}:00 AM)`;
    return `${h} (${h - 12}:00 PM)`;
  };

  // Current hour check
  const currentHour = new Date().getHours();
  const fromHour = config.activeHoursFrom ?? 0;
  const toHour = config.activeHoursTo ?? 24;
  const isCurrentlyActive =
    (fromHour === 0 && toHour === 24) ||
    (fromHour < toHour && currentHour >= fromHour && currentHour < toHour) ||
    (fromHour > toHour && (currentHour >= fromHour || currentHour < toHour));

  // Delay pill display
  const formatDelay = (sec: number) => {
    if (sec === 0) return '0s';
    if (sec < 60) return `${sec}s`;
    return `${Math.round(sec / 60)}m`;
  };

  // Formula description
  const getFormulaDisplay = () => {
    if (config.budgetTiersEnabled && config.budgetTiers && config.budgetTiers.length > 0) {
      return `Custom Budget Tiers (${config.budgetTiers.length} active tiers)`;
    }
    if (config.bidAmountFormula) {
      return config.bidAmountFormula;
    }
    switch (config.bidStrategy) {
      case 'low_end':
        return 'No formula set — bids use the low end of the budget.';
      case 'midpoint':
        return 'Bid = Midpoint between minimum and maximum budget.';
      case 'fixed':
        return `Bid = Fixed amount ($${config.fixedBidAmount || 50}).`;
      case 'percentage_max':
      default:
        return `Bid = ${config.bidPercentageOfMaxBudget || 85}% of Maximum Budget.`;
    }
  };

  return (
    <div id="bidding-behaviour-page" className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Toast Notification */}
      {showSavedNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4" />
          Bidding settings saved successfully!
        </div>
      )}

      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <Link to="/overview" className="hover:text-blue-600 transition-colors">
          Overview
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-semibold">Bidding Behaviour</span>
      </nav>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Bidding Behaviour
        </h1>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <span>Once a project qualifies, these rules decide when and how the bot bids.</span>
          <button
            onClick={() => setIsBidRulesOpen(true)}
            className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-0.5"
          >
            <Info className="w-3 h-3" />
            Learn about bidding rules
          </button>
        </p>
      </div>

      {/* Card 1: Bid Amount and Duration Rules (Full Width Top) */}
      <div
        id="card-bid-amount-rules"
        className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 relative overflow-hidden transition-all hover:border-slate-300"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Bid Amount and Duration Rules
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                What the extension puts on every bid — how much you charge, and how many days you need.
              </p>
            </div>
          </div>
          <button
            id="edit-bid-amount-rules-btn"
            onClick={() => setIsBidRulesOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/60 rounded-lg transition-colors shrink-0 self-start sm:self-auto"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>

        <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="font-semibold text-slate-800 shrink-0">Formula:</span>
              <span className="text-slate-600">{getFormulaDisplay()}</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              {config.budgetTiersEnabled
                ? 'Applies according to matched budget tier ranges.'
                : 'Applies to every qualified project.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="font-semibold text-slate-800 shrink-0">Budget tiers:</span>
              <span className="text-slate-600">
                {config.budgetTiersEnabled && config.budgetTiers && config.budgetTiers.length > 0
                  ? `On — ${config.budgetTiers.length} tiers active`
                  : 'Off — every project uses the formula above.'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>Delivery duration:</span>
              <strong className="text-slate-700">{config.defaultDeliveryDays || 5} days</strong>
              <span className="text-slate-300">•</span>
              <span>AI Dynamic Pricing:</span>
              <strong className={config.useAiPricingAndDays !== false ? 'text-emerald-600' : 'text-slate-500'}>
                {config.useAiPricingAndDays !== false ? 'Active' : 'Disabled'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Speed and Bids per Day (Left) & Active Hours (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 2: Speed and Bids per Day */}
        <div
          id="card-speed-and-daily-limits"
          className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-slate-300 transition-all"
        >
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Speed and Bids per Day
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  How aggressively the bot bids.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Delay between bids */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-800">
                    Delay between bids
                  </label>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                    {formatDelay(config.delayBetweenBidsSeconds || 0)}
                  </span>
                </div>
                <input
                  id="delay-between-bids-slider"
                  type="range"
                  min="0"
                  max="120"
                  step="5"
                  value={config.delayBetweenBidsSeconds || 0}
                  onChange={(e) =>
                    handleUpdate({ delayBetweenBidsSeconds: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-emerald-600 h-2 bg-slate-100 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                  <span>0s (Instant)</span>
                  <span>30s</span>
                  <span>1m</span>
                  <span>2m</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Minimum delay between consecutive auto-bids.
                </p>
              </div>

              {/* Number of bids per day */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Number of bids per day
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="max-bids-per-day-input"
                    type="number"
                    min="1"
                    max="200"
                    value={config.maxBidsPerDay || 40}
                    onChange={(e) =>
                      handleUpdate({
                        maxBidsPerDay: Math.max(1, parseInt(e.target.value || '1', 10)),
                      })
                    }
                    className="w-28 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-xs text-slate-500">Bids / 24 hours</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Protects your Freelancer bid quota from exhausting too fast.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Active Hours */}
        <div
          id="card-active-hours"
          className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-slate-300 transition-all"
        >
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Active hours
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pause bidding outside this window — your local time.
                  </p>
                </div>
              </div>

              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  isCurrentlyActive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {isCurrentlyActive ? '● Active Now' : '⏸ Paused Window'}
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Active From */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Active From
                  </label>
                  <select
                    id="active-hours-from-select"
                    value={config.activeHoursFrom ?? 0}
                    onChange={(e) =>
                      handleUpdate({ activeHoursFrom: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {formatHour(i)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Active To */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Active To
                  </label>
                  <select
                    id="active-hours-to-select"
                    value={config.activeHoursTo ?? 24}
                    onChange={(e) =>
                      handleUpdate({ activeHoursTo: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {formatHour(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  The window runs from "Active From" through the hour before "Active To" (exclusive). Set From to midnight and To to end of day for full coverage.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Clarification Board (Left) & Free Bid Upgrades (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 4: Clarification Board */}
        <div
          id="card-clarification-board"
          className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-slate-300 transition-all"
        >
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Clarification Board
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ask the client a question before submitting on ambiguous briefs.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-900 block">
                    Auto post question on clarification board
                  </span>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Automatically post AI-generated clarification questions before submitting each bid.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    id="auto-post-clarification-toggle"
                    type="checkbox"
                    checked={config.autoPostClarification || false}
                    onChange={(e) => handleUpdate({ autoPostClarification: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-purple-800 bg-purple-50/60 p-2.5 rounded-md border border-purple-200/60">
                <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  Uses Freelancer's public project Clarification Board only. Strictly never sends through private message/chat inbox.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Free Bid Upgrades */}
        <div
          id="card-free-bid-upgrades"
          className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-slate-300 transition-all"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Free Bid Upgrades
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Take the upgrades Freelancer is giving away on a project.
                  </p>
                </div>
              </div>
              <button
                id="edit-free-upgrades-btn"
                onClick={() => setIsUpgradesOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/60 rounded-lg transition-colors shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-800">Sealed</span>
                <span className="text-slate-600 font-medium">
                  {config.allowFreeSealedUpgrade !== false ? 'taken when free' : 'disabled'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-800">NDA</span>
                <span className="text-slate-600 font-medium">
                  {config.allowFreeNdaUpgrade !== false ? 'taken when free' : 'disabled'}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 pt-1">
                Highlight and Sponsored are never selected, free or not.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Card 6: Hands-Free Auto-Submission & Safety Automation */}
      <div
        id="card-hands-free-automation"
        className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 hover:border-slate-300 transition-all space-y-5"
      >
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Autonomous In-Browser Execution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Direct Chrome extension automation settings for live project tab submission.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Hands-Free Auto Submit */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-900 block">
                Hands-Free Auto-Submit
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Auto-clicks "Place Bid" button without manual intervention.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                id="hands-free-submit-toggle"
                type="checkbox"
                checked={config.handsFreeAutoSubmit !== false}
                onChange={(e) => handleUpdate({ handsFreeAutoSubmit: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>

          {/* Auto-Open Qualified */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-900 block">
                Auto-Open Qualified Tabs
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Opens newly qualified projects in background tabs immediately.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                id="auto-open-qualified-toggle"
                type="checkbox"
                checked={config.autoOpenQualified !== false}
                onChange={(e) => handleUpdate({ autoOpenQualified: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>

          {/* Auto-Close Tab on Success */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-900 block">
                Auto-Close on Success
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Closes completed tab after successful bid placement ({config.autoCloseDelaySeconds || 3}s).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                id="auto-close-tab-toggle"
                type="checkbox"
                checked={config.autoCloseTabOnSuccess !== false}
                onChange={(e) => handleUpdate({ autoCloseTabOnSuccess: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Footer Reset Action */}
      <div className="pt-2 flex items-center justify-between border-t border-slate-200">
        <button
          type="button"
          id="reset-bidding-defaults-btn"
          onClick={() => setIsResetOpen(true)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-red-600 px-3.5 py-2 rounded-lg hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Defaults
        </button>

        <div className="text-[11px] text-slate-400">
          All changes apply automatically across your background engine and Chrome extension.
        </div>
      </div>

      {/* Modals */}
      <BidAmountRulesModal
        isOpen={isBidRulesOpen}
        onClose={() => setIsBidRulesOpen(false)}
        config={config}
        onSave={handleUpdate}
      />

      <FreeUpgradesModal
        isOpen={isUpgradesOpen}
        onClose={() => setIsUpgradesOpen(false)}
        config={config}
        onSave={handleUpdate}
      />

      <ResetConfirmationModal
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        onConfirm={handleResetDefaults}
      />
    </div>
  );
};
