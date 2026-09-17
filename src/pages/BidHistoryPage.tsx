import React, { useState, useEffect } from 'react';
import { BidsHistory } from '../components/BidsHistory.tsx';
import { BidLog } from '../types.ts';

export const BidHistoryPage: React.FC = () => {
  const [bids, setBids] = useState<BidLog[]>([]);

  const fetchBids = async () => {
    try {
      const res = await fetch('/api/bids');
      if (res.ok) {
        setBids(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch bids:', e);
    }
  };

  useEffect(() => {
    fetchBids();
    const interval = setInterval(fetchBids, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="bid-history-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Bid History
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Audited log of all proposals placed automatically or through 1-Click Apply
        </p>
      </div>

      <BidsHistory bids={bids} />
    </div>
  );
};
