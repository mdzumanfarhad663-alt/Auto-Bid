import React from 'react';
import { Crosshair, ExternalLink, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { DashboardRecentScan } from '../../types.ts';

interface RecentScanRowProps {
  scan: DashboardRecentScan;
}

export const RecentScanRow: React.FC<RecentScanRowProps> = ({ scan }) => {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(scan.timestamp));

  const visibleSkills = scan.skills.slice(0, 4);
  const extraSkillsCount = Math.max(0, scan.skills.length - 4);

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex flex-col gap-3">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              scan.eligibility === 'Eligible'
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <a
              href={scan.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 inline-flex items-center gap-1 group"
            >
              <span>{scan.title}</span>
              <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0" />
            </a>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-medium text-slate-500">
                {scan.budgetFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Eligibility Pill & Date */}
        <div className="text-right shrink-0">
          {scan.eligibility === 'Eligible' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Eligible
            </span>
          ) : scan.eligibility === 'Excluded by you' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              Excluded by you
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              Ineligible
            </span>
          )}

          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-end gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Warning / Skip Reason Callout Box */}
      {scan.eligibility !== 'Eligible' && (
        <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 flex items-start gap-2 text-xs text-amber-900 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Why skipped: </span>
            <span>{scan.skipReason}</span>
          </div>
        </div>
      )}

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
