import React, { useState } from 'react';
import { Sparkles, Calendar, ArrowRight, X } from 'lucide-react';

interface PromoBannerProps {
  onOpenAuditModal?: () => void;
}

export const PromoBanner: React.FC<PromoBannerProps> = ({ onOpenAuditModal }) => {
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('freelancer_autobid_audit_dismissed') === 'true';
  });

  if (isDismissed) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('freelancer_autobid_audit_dismissed', 'true');
    } catch (e) {}
  };

  const handleBookCall = () => {
    if (onOpenAuditModal) {
      onOpenAuditModal();
    } else {
      window.open('https://cal.com/freelancer-autobid/setup-review', '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      id="promo-audit-banner"
      className="relative mx-4 sm:mx-6 lg:mx-8 mt-4 p-4 sm:p-5 rounded-xl bg-gradient-to-r from-blue-50/90 via-sky-50/60 to-indigo-50/80 border border-blue-100/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div className="flex items-start sm:items-center gap-3.5 flex-1 pr-6">
        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Get a free setup &amp; profile audit
            </h2>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
              1-on-1 Free
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5 max-w-3xl leading-relaxed">
            Book a quick 1:1 call — we&apos;ll review your filters, AI prompts, and Freelancer profile, then fix what&apos;s holding back your bids so you get the most out of FreelancerAutoBid.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
        <button
          id="btn-book-setup-call"
          type="button"
          onClick={handleBookCall}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-xs transition-colors"
        >
          <span>Book your setup call</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          id="btn-dismiss-audit-banner"
          type="button"
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-white/60 transition-colors"
          title="Dismiss notification"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
