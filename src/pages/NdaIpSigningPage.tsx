import React, { useState } from 'react';
import { FileSignature, ShieldCheck, CheckCircle2, Lock, FileText, AlertCircle } from 'lucide-react';

export const NdaIpSigningPage: React.FC = () => {
  const [autoSignNda, setAutoSignNda] = useState(true);
  const [autoSignIp, setAutoSignIp] = useState(true);
  const [allowPublicPortfolioReference, setAllowPublicPortfolioReference] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div id="nda-ip-signing-page" className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            NDA / IP Signing &amp; Compliance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automatic agreement preferences for projects requiring Non-Disclosure Agreements and Intellectual Property Transfer
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
        >
          {saved ? <CheckCircle2 className="w-4 h-4 text-white" /> : <ShieldCheck className="w-4 h-4" />}
          <span>{saved ? 'Saved!' : 'Save Preferences'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Standard Freelancer NDA</h2>
              <p className="text-xs text-slate-500">Non-Disclosure Agreement terms</p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSignNda}
              onChange={(e) => setAutoSignNda(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800">Auto-Agree to Standard NDA</span>
              <p className="text-slate-500 mt-0.5">
                Automatically checks the &quot;I agree to NDA&quot; checkbox during autonomous bid placement for protected listings.
              </p>
            </div>
          </label>
        </div>

        <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">IP Transfer Agreement</h2>
              <p className="text-xs text-slate-500">Intellectual property assignment</p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSignIp}
              onChange={(e) => setAutoSignIp(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800">Auto-Agree to IP Transfer</span>
              <p className="text-slate-500 mt-0.5">
                Automatically confirms full transfer of deliverables and source code ownership to the client upon milestone release.
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
