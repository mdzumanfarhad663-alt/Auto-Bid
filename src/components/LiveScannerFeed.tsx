import React, { useState } from 'react';
import { FreelancerProject, FilterConfig } from '../types.ts';
import { 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  DollarSign, 
  Star, 
  ShieldCheck, 
  ShieldAlert, 
  Copy, 
  Check, 
  Sparkles, 
  Search, 
  Tag, 
  ChevronDown, 
  ChevronUp, 
  Globe,
  Rss,
  Send,
  Loader2,
  Zap,
  CheckCircle,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface LiveScannerFeedProps {
  projects: FreelancerProject[];
  config?: FilterConfig;
  onTestProject: (project: FreelancerProject) => void;
  onClearHistory: () => void;
  onProjectUpdate?: (project: FreelancerProject) => void;
  onRefreshLiveFeed?: () => Promise<void>;
}

export const LiveScannerFeed: React.FC<LiveScannerFeedProps> = ({
  projects,
  config,
  onTestProject,
  onClearHistory,
  onProjectUpdate,
  onRefreshLiveFeed,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'BID_PLACED' | 'SKIPPED'>('ALL');
  const [expandedProposalId, setExpandedProposalId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [appliedId, setAppliedId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper to sanitize Freelancer URL so it NEVER 404s
  const getSafeFreelancerUrl = (project: FreelancerProject): string => {
    let url = (project.url || '').split('#')[0].trim();
    if (!url || url.includes('sample-job') || [38994889, 38920141, 38920142, 38920143, 38920144, 38920145].includes(project.id)) {
      if (project.id && project.id > 40000000) {
        return `https://www.freelancer.com/projects/${project.id}`;
      }
      const query = encodeURIComponent(project.jobs?.[0]?.name || project.title || 'freelancer jobs');
      return `https://www.freelancer.com/search/projects?q=${query}`;
    }
    return url;
  };

  const filteredProjects = projects.filter((p) => {
    if (statusFilter === 'BID_PLACED' && p.status !== 'BID_PLACED') return false;
    if (statusFilter === 'SKIPPED' && p.status !== 'SKIPPED') return false;

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const matchTitle = p.title.toLowerCase().includes(query);
    const matchDesc = p.description.toLowerCase().includes(query);
    const matchJobs = (p.jobs || []).some((j) => j.name.toLowerCase().includes(query));
    return matchTitle || matchDesc || matchJobs;
  });

  const handleCopyProposal = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRefreshFeed = async () => {
    if (!onRefreshLiveFeed) return;
    setIsRefreshing(true);
    try {
      await onRefreshLiveFeed();
      setToastMessage({
        title: 'Live Jobs Synced!',
        desc: 'Retrieved fresh active projects from Freelancer public feed and purged outdated samples.',
      });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      console.error('Refresh feed error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplyOnFreelancer = async (project: FreelancerProject) => {
    let proposal = project.generatedProposal;
    let bidAmount = project.bidAmount || project.budget.minimum;
    let bidPeriod = project.bidPeriodDays || config?.defaultDeliveryDays || 3;

    // If on-demand mode and proposal not yet generated, call OpenAI now!
    if (!proposal || proposal.trim() === '') {
      setGeneratingId(project.id);
      try {
        const res = await fetch(`/api/projects/${project.id}/prepare-bid`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data.success && data.proposal) {
          proposal = data.proposal;
          bidAmount = data.bidAmount || bidAmount;
          bidPeriod = data.bidPeriodDays || bidPeriod;
          onProjectUpdate?.(data.project);
        } else {
          throw new Error(data.error || 'Failed to generate AI proposal');
        }
      } catch (err: any) {
        console.error('Error generating bid on demand:', err);
        setToastMessage({
          title: 'Proposal Notice',
          desc: err.message || 'Could not generate proposal. Opening project page directly.',
        });
        setTimeout(() => setToastMessage(null), 4000);
      } finally {
        setGeneratingId(null);
      }
    }

    if (proposal) {
      navigator.clipboard.writeText(proposal);
    }
    setAppliedId(project.id);
    setTimeout(() => setAppliedId(null), 3000);

    const safeBaseUrl = getSafeFreelancerUrl(project);
    
    // Hash parameters that our Chrome Extension content script detects to autofill description, amount & period
    // Standard URLSearchParams handles encoding cleanly without double %2520 encoding
    const hashParams = new URLSearchParams();
    if (proposal) hashParams.set('autobid_p', proposal);
    if (bidAmount) hashParams.set('amount', String(bidAmount));
    if (bidPeriod) hashParams.set('period', String(bidPeriod));
    hashParams.set('auto_submit', config?.handsFreeAutoSubmit !== false ? '1' : '0');
    hashParams.set('autobid', '1');
    hashParams.set('pid', String(project.id));

    const finalUrl = `${safeBaseUrl}#${hashParams.toString()}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');

    setToastMessage({
      title: 'AutoBid Dispatched & Copied!',
      desc: `Proposal ($${bidAmount} ${project.budget?.currency || 'USD'}, ${bidPeriod} days) copied to clipboard & tab opened. Extension will autofill the bid form!`,
    });
    setTimeout(() => setToastMessage(null), 6000);
  };

  const toggleProposal = (id: number) => {
    setExpandedProposalId(expandedProposalId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* Dynamic Toast Banner */}
      {toastMessage && (
        <div className="bg-emerald-950/90 border border-emerald-500/60 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-emerald-200 shadow-lg shadow-emerald-950/50 transition animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-white">{toastMessage.title}</div>
              <div className="text-emerald-300 mt-0.5">{toastMessage.desc}</div>
            </div>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-400 hover:text-white font-bold text-sm shrink-0"
          >
            &times;
          </button>
        </div>
      )}

      {/* Public Feed Status Notice */}
      <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-indigo-200">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-900/80 border border-indigo-700/60">
            <Rss className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div>
            <span className="font-semibold text-white">Freelancer Public Feed Active:</span>
            <span className="text-slate-300 ml-1">
              Polling public RSS &amp; API feeds every {config?.pollIntervalSeconds || 30}s without OAuth tokens.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-[11px] font-mono border border-indigo-700/50">
            {projects.length} scanned jobs
          </span>
        </div>
      </div>

      {/* Feed Controls Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search scanned projects by keyword, tech, or client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
        </div>

        {/* Filter Buttons & Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg bg-slate-800/80 p-0.5 border border-slate-700/80 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md transition ${
                statusFilter === 'ALL'
                  ? 'bg-sky-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({projects.length})
            </button>
            <button
              onClick={() => setStatusFilter('BID_PLACED')}
              className={`px-3 py-1 rounded-md transition ${
                statusFilter === 'BID_PLACED'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              Bids Ready ({projects.filter((p) => p.status === 'BID_PLACED').length})
            </button>
            <button
              onClick={() => setStatusFilter('SKIPPED')}
              className={`px-3 py-1 rounded-md transition ${
                statusFilter === 'SKIPPED'
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              Skipped ({projects.filter((p) => p.status === 'SKIPPED').length})
            </button>
          </div>

          {onRefreshLiveFeed && (
            <button
              onClick={handleRefreshFeed}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
              title="Immediately poll live Freelancer RSS & API feeds and clear legacy test entries"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : 'text-sky-400'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Live Jobs'}</span>
            </button>
          )}

          <button
            onClick={onClearHistory}
            className="text-xs text-slate-400 hover:text-rose-400 px-2.5 py-1 rounded-md hover:bg-slate-800 transition"
            title="Clear processed projects list"
          >
            Clear Feed
          </button>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center">
          <Clock className="h-10 w-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No scanned projects matching criteria</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            The background poller automatically scans Freelancer's public feed every {config?.pollIntervalSeconds || 30}s. Click "Poll Now" to immediately fetch the latest jobs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects.map((project) => {
            const isBidPlaced = project.status === 'BID_PLACED';
            const isSkipped = project.status === 'SKIPPED';
            const isExpanded = expandedProposalId === project.id || (isBidPlaced && projects.indexOf(project) === 0);

            return (
              <div
                key={project.id}
                className={`bg-slate-900/80 border rounded-xl p-4 transition-all ${
                  isBidPlaced
                    ? 'border-emerald-500/30 hover:border-emerald-500/60'
                    : isSkipped
                    ? 'border-slate-800 hover:border-rose-500/30'
                    : 'border-slate-800 hover:border-sky-500/40'
                }`}
              >
                {/* Top Row: Title, Status Badge, External Link */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[11px] font-mono text-slate-500">#{project.id}</span>
                      {isBidPlaced ? (
                        project.generatedProposal ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3" />
                            PROPOSAL READY (${project.bidAmount} {project.budget.currency})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                            <Sparkles className="h-3 w-3 text-sky-400" />
                            QUALIFIED (${project.bidAmount || Math.round(project.budget.maximum * 0.85)} {project.budget.currency})
                          </span>
                        )
                      ) : isSkipped ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <XCircle className="h-3 w-3" />
                          FILTERED OUT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                          QUALIFIED
                        </span>
                      )}

                      {/* Feed source badge */}
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        {project.feedSource === 'rss' ? 'RSS Feed' : 'Public API'}
                      </span>

                      <span className="text-[11px] text-slate-400">
                        {new Date(project.submitDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-slate-100 hover:text-sky-300 transition">
                      <a
                        href={getSafeFreelancerUrl(project)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5"
                      >
                        {project.title}
                        <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-sky-400" />
                      </a>
                    </h3>
                  </div>

                  {/* Quick Action to Apply or Test Proposal */}
                  <div className="flex items-center gap-2">
                    {isBidPlaced && (
                      <button
                        onClick={() => handleApplyOnFreelancer(project)}
                        disabled={generatingId === project.id}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold shadow-sm transition ${
                          appliedId === project.id
                            ? 'bg-emerald-700 text-white'
                            : generatingId === project.id
                            ? 'bg-indigo-700 text-white cursor-wait animate-pulse'
                            : project.generatedProposal
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-900/30'
                        }`}
                        title="Generate proposal & autofill Freelancer form"
                      >
                        {generatingId === project.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Generating AI...</span>
                          </>
                        ) : appliedId === project.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                            <span>Filled &amp; Opened!</span>
                          </>
                        ) : project.generatedProposal ? (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            <span>1-Click Apply</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 text-amber-300 fill-amber-300" />
                            <span>1-Click Apply</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => onTestProject(project)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition"
                      title="Test OpenAI prompt generation for this job"
                    >
                      <Sparkles className="h-3 w-3 text-indigo-400" />
                      <span className="hidden sm:inline">Test Prompt</span>
                    </button>
                  </div>
                </div>

                {/* Metadata Row: Budget, Client, Verified, Location */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300 mb-3 py-1.5 px-2.5 rounded-lg bg-slate-800/50 border border-slate-800">
                  <span className="flex items-center gap-1 font-semibold text-emerald-400">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    Budget: {project.budget.minimum} - {project.budget.maximum} {project.budget.currency}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="flex items-center gap-1">
                    Client: <strong className="text-slate-200">{project.client.username}</strong>
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                    {project.client.rating.toFixed(1)} ({project.client.reviewsCount} reviews)
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="flex items-center gap-1">
                    {project.client.paymentVerified ? (
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> Payment Verified
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-0.5">
                        <ShieldAlert className="h-3.5 w-3.5" /> Public Feed
                      </span>
                    )}
                  </span>
                  {project.client.country && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <Globe className="h-3 w-3" />
                        {project.client.country}
                      </span>
                    </>
                  )}
                </div>

                {/* Description Snippet */}
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 mb-3">
                  {project.description}
                </p>

                {/* Tags Section */}
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <Tag className="h-3 w-3 text-slate-500" />
                  {project.jobs.map((job) => {
                    const isMatched = project.matchedTags?.includes(job.name);
                    return (
                      <span
                        key={job.id}
                        className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                          isMatched
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                            : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                        }`}
                      >
                        {job.name}
                      </span>
                    );
                  })}
                </div>

                {/* If Disqualified / Skipped: Show reason banner */}
                {isSkipped && project.skipReason && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/40 flex items-start gap-2 text-xs text-rose-300">
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-rose-200">Disqualification Reason: </span>
                      {project.skipReason}
                    </div>
                  </div>
                )}

                {/* If Bid Placed & AI Proposal Ready: Dropdown / Box */}
                {isBidPlaced && project.generatedProposal && (
                  <div className="mt-3 border-t border-emerald-900/50 pt-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => toggleProposal(project.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Proposal Ready (${project.bidAmount} {project.budget.currency} • {project.bidPeriodDays} days)</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>

                        {/* Clear Transparency Indicator: OpenAI vs Template */}
                        {project.proposalSource === 'openai' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <Sparkles className="h-2.5 w-2.5 text-emerald-400" />
                            OpenAI API ({project.modelUsed || config?.openaiModel || 'gpt-4o-mini'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <AlertCircle className="h-2.5 w-2.5 text-amber-400" />
                            Template Fallback (No OpenAI Key Configured)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyProposal(project.id, project.generatedProposal || '')}
                          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                        >
                          {copiedId === project.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleApplyOnFreelancer(project)}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white font-medium transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Open &amp; Autofill</span>
                        </button>
                      </div>
                    </div>

                    {/* AI Pricing Analysis if provided */}
                    {project.pricingReasoning && (
                      <div className="mb-2 text-[11px] text-slate-300 bg-slate-950/60 border border-emerald-800/30 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span className="text-emerald-400 font-semibold">AI Pricing Strategy:</span>
                        <span>{project.pricingReasoning}</span>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="bg-slate-950/80 rounded-lg p-3.5 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line shadow-inner">
                        {project.generatedProposal}
                      </div>
                    )}
                  </div>
                )}

                {/* If Bid Placed but Proposal NOT yet generated (On-Demand Token Economy Mode) */}
                {isBidPlaced && !project.generatedProposal && (
                  <div className="mt-3 border-t border-slate-800/80 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span>
                        Token Saver Active: AI proposal will generate when you click <strong className="text-sky-300">1-Click Apply</strong> (Target: ${project.bidAmount || Math.round(project.budget.maximum * 0.85)} {project.budget.currency}, {project.bidPeriodDays || config?.defaultDeliveryDays || 3} days).
                      </span>
                    </div>
                    <button
                      onClick={() => handleApplyOnFreelancer(project)}
                      disabled={generatingId === project.id}
                      className="self-start sm:self-auto px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium text-[11px] flex items-center gap-1 shrink-0 transition"
                    >
                      {generatingId === project.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          <span>Generate &amp; Apply</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
