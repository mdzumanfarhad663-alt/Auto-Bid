import React from 'react';
import { SetupGuide } from '../components/SetupGuide.tsx';

export const SetupGuidePage: React.FC = () => {
  return (
    <div id="setup-guide-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Extension Installation &amp; Setup Guide
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Step-by-step instructions for installing the Chrome Extension and configuring hands-free bidding
        </p>
      </div>

      <SetupGuide />
    </div>
  );
};
