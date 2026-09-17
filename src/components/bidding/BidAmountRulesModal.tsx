import React, { useState } from 'react';
import { X, DollarSign, Plus, Trash2, Sparkles, Check } from 'lucide-react';
import { FilterConfig } from '../../types.ts';

interface BidAmountRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FilterConfig;
  onSave: (updated: Partial<FilterConfig>) => void;
}

export const BidAmountRulesModal: React.FC<BidAmountRulesModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [strategy, setStrategy] = useState<FilterConfig['bidStrategy']>(
    config.bidStrategy || 'percentage_max'
  );
  const [percentage, setPercentage] = useState<number>(config.bidPercentageOfMaxBudget || 85);
  const [fixedAmount, setFixedAmount] = useState<number>(config.fixedBidAmount || 50);
  const [deliveryDays, setDeliveryDays] = useState<number>(config.defaultDeliveryDays || 5);
  const [useAiPricing, setUseAiPricing] = useState<boolean>(config.useAiPricingAndDays !== false);
  const [tiersEnabled, setTiersEnabled] = useState<boolean>(config.budgetTiersEnabled || false);
  const [tiers, setTiers] = useState(
    config.budgetTiers && config.budgetTiers.length > 0
      ? [...config.budgetTiers]
      : [
          { id: 'tier-1', minBudget: 0, maxBudget: 100, bidPercentage: 90, deliveryDays: 2 },
          { id: 'tier-2', minBudget: 100, maxBudget: 500, bidPercentage: 85, deliveryDays: 4 },
          { id: 'tier-3', minBudget: 500, maxBudget: 5000, bidPercentage: 80, deliveryDays: 7 },
        ]
  );

  if (!isOpen) return null;

  const handleAddTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newMin = lastTier ? lastTier.maxBudget : 500;
    const newMax = newMin + 1000;
    setTiers([
      ...tiers,
      {
        id: `tier-${Date.now()}`,
        minBudget: newMin,
        maxBudget: newMax,
        bidPercentage: 80,
        deliveryDays: 5,
      },
    ]);
  };

  const handleRemoveTier = (id: string) => {
    setTiers(tiers.filter((t) => t.id !== id));
  };

  const handleUpdateTier = (id: string, field: string, val: number) => {
    setTiers(
      tiers.map((t) => (t.id === id ? { ...t, [field]: val } : t))
    );
  };

  const handleSave = () => {
    let formulaDescription = 'No formula set — bids use the low end of the budget.';
    if (tiersEnabled) {
      formulaDescription = `Budget tiers active (${tiers.length} tiers configured).`;
    } else {
      switch (strategy) {
        case 'low_end':
          formulaDescription = 'Bid = Minimum budget of the project.';
          break;
        case 'midpoint':
          formulaDescription = 'Bid = Midpoint between minimum and maximum budget.';
          break;
        case 'fixed':
          formulaDescription = `Bid = Fixed amount of $${fixedAmount}.`;
          break;
        case 'percentage_max':
        default:
          formulaDescription = `Bid = ${percentage}% of client maximum budget.`;
          break;
      }
    }

    onSave({
      bidStrategy: strategy,
      bidPercentageOfMaxBudget: percentage,
      fixedBidAmount: fixedAmount,
      defaultDeliveryDays: deliveryDays,
      useAiPricingAndDays: useAiPricing,
      budgetTiersEnabled: tiersEnabled,
      budgetTiers: tiers,
      bidAmountFormula: formulaDescription,
    });
    onClose();
  };

  return (
    <div
      id="bid-amount-rules-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Configure Bid Amount &amp; Duration Rules
              </h2>
              <p className="text-xs text-slate-500">
                Define the pricing formula and delivery timelines applied to bids.
              </p>
            </div>
          </div>
          <button
            id="close-bid-rules-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-700">
          {/* Base Strategy */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              Default Pricing Formula
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: 'percentage_max',
                  title: 'Percentage of Max Budget',
                  desc: 'Calculates bid as a percentage of the client’s maximum budget.',
                },
                {
                  id: 'low_end',
                  title: 'Low End of Budget',
                  desc: 'Submits bids at the client’s minimum project budget.',
                },
                {
                  id: 'midpoint',
                  title: 'Midpoint of Budget',
                  desc: 'Calculates the exact middle between minimum and maximum.',
                },
                {
                  id: 'fixed',
                  title: 'Fixed Amount',
                  desc: 'Always uses a constant specific dollar amount.',
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStrategy(opt.id as any)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    strategy === opt.id
                      ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-xs">{opt.title}</span>
                    {strategy === opt.id && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Percentage / Fixed Config */}
          {strategy === 'percentage_max' && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800 text-xs">
                  Percentage of Maximum Budget
                </span>
                <span className="text-sm font-bold text-blue-600">{percentage}%</span>
              </div>
              <input
                id="bid-percentage-slider"
                type="range"
                min="40"
                max="100"
                step="5"
                value={percentage}
                onChange={(e) => setPercentage(parseInt(e.target.value, 10))}
                className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>40% (Aggressive low)</span>
                <span>85% (Recommended)</span>
                <span>100% (Full budget)</span>
              </div>
            </div>
          )}

          {strategy === 'fixed' && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Fixed Bid Amount (USD)
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  id="fixed-bid-amount-input"
                  type="number"
                  min="5"
                  max="10000"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(Math.max(1, parseInt(e.target.value || '0', 10)))}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Delivery Duration & AI Analysis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                Default Delivery Period
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="default-delivery-days-input"
                  type="number"
                  min="1"
                  max="90"
                  value={deliveryDays}
                  onChange={(e) => setDeliveryDays(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-xs text-slate-600 font-medium">Days</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Applied to the Freelancer delivery days field.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                AI Pricing Intelligence
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer mt-1">
                <input
                  id="use-ai-pricing-toggle"
                  type="checkbox"
                  checked={useAiPricing}
                  onChange={(e) => setUseAiPricing(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Dynamic AI Pricing Adjustment
                  </span>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                    Allows OpenAI to tailor amount &amp; days within budget based on project complexity.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Budget Tiers Section */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Budget Tiers (Multi-Range Rules)
                </span>
                <p className="text-[11px] text-slate-500">
                  Override default formula for specific client budget sizes.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="budget-tiers-enabled-toggle"
                  type="checkbox"
                  checked={tiersEnabled}
                  onChange={(e) => setTiersEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {tiersEnabled && (
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 animate-in fade-in">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-600 uppercase px-1">
                  <div className="col-span-3">Min Budget ($)</div>
                  <div className="col-span-3">Max Budget ($)</div>
                  <div className="col-span-3">Bid % of Max</div>
                  <div className="col-span-2">Days</div>
                  <div className="col-span-1 text-center">Action</div>
                </div>

                {tiers.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-md border border-slate-200">
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={tier.minBudget}
                        onChange={(e) => handleUpdateTier(tier.id, 'minBudget', parseInt(e.target.value || '0', 10))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={tier.maxBudget}
                        onChange={(e) => handleUpdateTier(tier.id, 'maxBudget', parseInt(e.target.value || '0', 10))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        min="20"
                        max="100"
                        value={tier.bidPercentage}
                        onChange={(e) => handleUpdateTier(tier.id, 'bidPercentage', parseInt(e.target.value || '0', 10))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={tier.deliveryDays}
                        onChange={(e) => handleUpdateTier(tier.id, 'deliveryDays', parseInt(e.target.value || '1', 10))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(tier.id)}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddTier}
                  className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-700 pt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Budget Tier
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
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
            id="save-bid-rules-btn"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            Save Formula &amp; Rules
          </button>
        </div>
      </div>
    </div>
  );
};
