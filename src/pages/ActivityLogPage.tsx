import React, { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { BidLog } from '../types.ts';

export const ActivityLogPage: React.FC = () => {
  const [bids, setBids] = useState<BidLog[]>([]);

  useEffect(() => {
    fetch('/api/bids')
      .then((res) => (res.ok ? res.json() : []))
      .then(setBids)
      .catch(console.error);
  }, []);

  return (
    <div id="activity-log-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Activity Log
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Chronological timeline of system events, background poll cycles, and proposal dispatches
        </p>
      </div>

      <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
        <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
          {bids.slice(0, 15).map((bid, idx) => (
            <div key={bid.id || idx} className="relative flex items-start gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 border-2 border-white flex items-center justify-center shrink-0 z-10">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex-1 bg-slate-50 p-3.5 rounded-lg border border-slate-200/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Bid Placed for {bid.projectTitle}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(bid.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Placed {bid.currency} {bid.bidAmount} in {bid.deliveryDays} days for client @{bid.clientUsername}
                </p>
              </div>
            </div>
          ))}

          {bids.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">
              No activity logs recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
