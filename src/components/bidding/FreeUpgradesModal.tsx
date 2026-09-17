import React, { useState } from 'react';
import { X, Sparkles, ShieldCheck, AlertCircle } from 'lucide-react';
import { FilterConfig } from '../../types.ts';

interface FreeUpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FilterConfig;
  onSave: (updated: Partial<FilterConfig>) => void;
}

export const FreeUpgradesModal: React.FC<FreeUpgradesModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [allowSealed, setAllowSealed] = useState<boolean>(config.allowFreeSealedUpgrade !== false);
  const [allowNda, setAllowNda] = useState<boolean>(config.allowFreeNdaUpgrade !== false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      allowFreeSealedUpgrade: allowSealed,
      allowFreeNdaUpgrade: allowNda,
    });
    onClose();
  };

  return (
    <div
      id="free-upgrades-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Configure Free Bid Upgrades
              </h2>
              <p className="text-xs text-slate-500">
                Select which promotional upgrades to accept when priced at $0.00.
              </p>
            </div>
          </div>
          <button
            id="close-free-upgrades-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-sm text-slate-700">
          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-lg flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <strong>Strict Zero-Cost Guarantee:</strong> The extension inspects Freelancer's live upgrade prices before placing any bid. It will <em>only</em> check the upgrade if the price tag is explicitly displayed as <strong>FREE / $0.00</strong>.
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-white cursor-pointer transition-colors">
              <input
                id="allow-free-sealed-toggle"
                type="checkbox"
                checked={allowSealed}
                onChange={(e) => setAllowSealed(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <div>
                <span className="font-semibold text-slate-900 text-xs block">
                  Sealed Bid Upgrade
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hides your proposal and bid amount from other freelancers when Freelancer offers it for free.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-white cursor-pointer transition-colors">
              <input
                id="allow-free-nda-toggle"
                type="checkbox"
                checked={allowNda}
                onChange={(e) => setAllowNda(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <div>
                <span className="font-semibold text-slate-900 text-xs block">
                  Non-Disclosure Agreement (NDA) Upgrade
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Signs standard client non-disclosure agreement automatically when offered free on NDA projects.
                </p>
              </div>
            </label>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-snug">
              <strong>Highlight</strong> and <strong>Sponsored</strong> upgrades are always locked off and never selected under any circumstances.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            id="save-free-upgrades-btn"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            Save Upgrades
          </button>
        </div>
      </div>
    </div>
  );
};
