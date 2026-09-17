import React from 'react';
import { Send, CheckCircle2, Clock } from 'lucide-react';
import { DashboardRecentBid } from '../../types.ts';

interface RecentBidRowProps {
  bid: DashboardRecentBid;
}

export const RecentBidRow: React.FC<RecentBidRowProps> = ({ bid }) => {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(bid.timestamp));

  const visibleSkills = bid.skills.slice(0, 4);
  const extraSkillsCount = Math.max(0, bid.skills.length - 4);

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex flex-col gap-3">
      {/* Top Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <Send className="w-3.5 h-3.5 -rotate-12" />
          </div>
          <div className="min-w-0 flex-1">
            <a
              href={bid.projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 group"
            >
              {bid.projectTitle}
            </a>

            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                {bid.projectType}
              </span>

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Reason: {bid.reasonBadge}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Amount & Date */}
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-slate-900 font-mono">
            {bid.currency} {bid.bidAmount.toLocaleString()}
            {bid.deliveryDays ? (
              <span className="text-xs font-normal text-slate-500 font-sans ml-1">
                in {bid.deliveryDays} days
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-end gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Skills Row */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
          SKILLS
        </span>
        {visibleSkills.map((skill, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100/80 text-slate-700 hover:bg-slate-200/70 transition-colors"
          >
            {skill}
          </span>
        ))}
        {extraSkillsCount > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 bg-slate-100">
            +{extraSkillsCount} more
          </span>
        )}
      </div>
    </div>
  );
};
