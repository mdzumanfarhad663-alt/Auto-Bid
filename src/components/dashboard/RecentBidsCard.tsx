import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { RecentBidRow } from './RecentBidRow.tsx';
import { DashboardRecentBid } from '../../types.ts';

interface RecentBidsCardProps {
  bids?: DashboardRecentBid[];
}

export const RecentBidsCard: React.FC<RecentBidsCardProps> = ({ bids = [] }) => {
  return (
    <div
      id="recent-bids-card"
      className="p-5 sm:p-6 rounded-xl bg-slate-50/50 border border-slate-200/90 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
            Recent bids
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Latest submissions, won bids and NDA/IP-cleared work
          </p>
        </div>

        <Link
          to="/bid-history"
          id="link-view-all-bids"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          <span>View all</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Bids List */}
      <div className="space-y-3">
        {bids.length > 0 ? (
          bids.slice(0, 4).map((bid) => <RecentBidRow key={bid.id} bid={bid} />)
        ) : (
          <div className="p-8 text-center rounded-xl bg-white border border-slate-200 text-slate-400">
            <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <div className="text-xs font-semibold text-slate-600">No bids submitted yet</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Qualified projects matching your skills will appear here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
