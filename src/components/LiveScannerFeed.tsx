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
  Send
} from 'lucide-react';

interface LiveScannerFeedProps {
  projects: FreelancerProject[];
  config?: FilterConfig;
  onTestProject: (project: FreelancerProject) => void;
  onClearHistory: () => void;
}

export const LiveScannerFeed: React.FC<LiveScannerFeedProps> = ({
  projects,
  config,
  onTestProject,
  onClearHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'BID_PLACED' | 'SKIPPED'>('ALL');
  const [expandedProposalId, setExpandedProposalId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [appliedId, setAppliedId] = useState<number | null>(null);

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

  const handleApplyOnFreelancer = (project: FreelancerProject) => {
    if (project.generatedProposal) {
      navigator.clipboard.writeText(project.generatedProposal);
      setAppliedId(project.id);
      setTimeout(() => setAppliedId(null), 3000);
    }
    const url = project.url || `https://www.freelancer.com/projects/${project.id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleProposal = (id: number) => {
    setExpandedProposalId(expandedProposalId === id ? null : id);
  };

  return (
    <div className="space-y-4">
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
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" />
                          PROPOSAL READY (${project.bidAmount} {project.budget.currency})
                        </span>
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
                        href={project.url || `https://www.freelancer.com/projects/${project.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5"
                      >
                        {project.title}
                        <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-sky-400" />
                      </a>
                    </h3>
                  </div>

                  {/* Quick Action to Test Proposal on this Job or Apply */}
                  <div className="flex items-center gap-2">
                    {isBidPlaced && project.generatedProposal && (
                      <button
                        onClick={() => handleApplyOnFreelancer(project)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm transition"
                        title="Copy proposal to clipboard and open Freelancer project in new tab"
                      >
                        <Send className="h-3 w-3" />
                        <span className="hidden sm:inline">
                          {appliedId === project.id ? 'Copied & Opened!' : '1-Click Apply'}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={() => onTestProject(project)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition"
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

                {/* If Bid Placed: AI Proposal Dropdown / Box */}
                {isBidPlaced && project.generatedProposal && (
                  <div className="mt-3 border-t border-emerald-900/50 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => toggleProposal(project.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                        <span>AI Proposal Ready (${project.bidAmount} {project.budget.currency} • {project.bidPeriodDays} days)</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>

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
                          <span>Open &amp; Apply</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-slate-950/80 rounded-lg p-3 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line shadow-inner">
                        {project.generatedProposal}
                      </div>
                    )}
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
