import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { RecentScanRow } from './RecentScanRow.tsx';
import { DashboardRecentScan } from '../../types.ts';

interface RecentScansCardProps {
  scans?: DashboardRecentScan[];
}

export const RecentScansCard: React.FC<RecentScansCardProps> = ({ scans = [] }) => {
  return (
    <div
      id="recently-scanned-card"
      className="p-5 sm:p-6 rounded-xl bg-slate-50/50 border border-slate-200/90 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
            Recently scanned
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Latest projects the bidder evaluated — including skipped
          </p>
        </div>

        <Link
          to="/scanned-projects"
          id="link-view-all-scans"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          <span>View all</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Scanned List */}
      <div className="space-y-3">
        {scans.length > 0 ? (
          scans.slice(0, 4).map((scan) => <RecentScanRow key={scan.id} scan={scan} />)
        ) : (
          <div className="p-8 text-center rounded-xl bg-white border border-slate-200 text-slate-400">
            <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <div className="text-xs font-semibold text-slate-600">No scanned projects yet</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Projects scanned during background polling will appear here in real time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
