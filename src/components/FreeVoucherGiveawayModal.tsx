import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Gift, 
  Sparkles, 
  Check, 
  AlertCircle, 
  ShieldCheck, 
  Layers, 
  Clock, 
  DollarSign, 
  CheckSquare, 
  Square, 
  TrendingDown,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GiveawaySettings, Voucher } from '../types';
import { DEFAULT_GIVEAWAY_SETTINGS, isPlanMarkedFree, normalizePlanName } from '../utils/giveawayEngine';

interface FreeVoucherGiveawayModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

export const FreeVoucherGiveawayModal: React.FC<FreeVoucherGiveawayModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark'
}) => {
  const { 
    activeWorkspace, 
    giveawaySettings, 
    updateGiveawaySettings, 
    vouchers = [],
    showToast 
  } = useApp();

  const [isEnabled, setIsEnabled] = useState<boolean>(giveawaySettings?.isEnabled ?? false);
  const [dailyLimit, setDailyLimit] = useState<number>(giveawaySettings?.dailyLimitPerAgent ?? 5);
  const [freePlanNames, setFreePlanNames] = useState<string[]>(giveawaySettings?.freePlanNames ?? []);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Sync with current settings when opened
  useEffect(() => {
    if (isOpen) {
      setIsEnabled(giveawaySettings?.isEnabled ?? false);
      setDailyLimit(giveawaySettings?.dailyLimitPerAgent ?? 5);
      setFreePlanNames(giveawaySettings?.freePlanNames ?? []);
      setSearchTerm('');
    }
  }, [isOpen, giveawaySettings]);

  // Extract all unique plans and their details from vouchers
  const planStats = useMemo(() => {
    const stats: { 
      [plan: string]: { 
        name: string; 
        total: number; 
        unused: number; 
        assigned: number; 
        sold: number; 
        price: number; 
        duration: string 
      } 
    } = {};

    vouchers.forEach((v: Voucher) => {
      if (!v.plan) return;
      if (!stats[v.plan]) {
        stats[v.plan] = {
          name: v.plan,
          total: 0,
          unused: 0,
          assigned: 0,
          sold: 0,
          price: v.price || 0,
          duration: v.duration || 'N/A'
        };
      }
      stats[v.plan].total++;
      if (v.status === 'Unused') stats[v.plan].unused++;
      if (v.status === 'Assigned') stats[v.plan].assigned++;
      if (v.status === 'Sold') stats[v.plan].sold++;
    });

    return Object.values(stats).sort((a, b) => a.price - b.price);
  }, [vouchers]);

  // Filter plans based on search
  const filteredPlans = useMemo(() => {
    if (!searchTerm.trim()) return planStats;
    const q = searchTerm.toLowerCase().trim();
    return planStats.filter(p => p.name.toLowerCase().includes(q));
  }, [planStats, searchTerm]);

  // Calculate live impact stats
  const impactStats = useMemo(() => {
    const tempSettings: GiveawaySettings = {
      isEnabled,
      dailyLimitPerAgent: dailyLimit,
      freePlanNames,
      allowCustomGiftVouchers: true
    };

    let totalFreeVouchers = 0;
    let unusedFreeVouchers = 0;
    let assignedFreeVouchers = 0;
    let excludedValue = 0;

    vouchers.forEach(v => {
      const isFree = isPlanMarkedFree(v.plan, tempSettings) || v.isFree;
      if (isFree) {
        totalFreeVouchers++;
        if (v.status === 'Unused') {
          unusedFreeVouchers++;
          excludedValue += v.price;
        } else if (v.status === 'Assigned') {
          assignedFreeVouchers++;
          excludedValue += v.price;
        }
      }
    });

    return {
      totalFreeVouchers,
      unusedFreeVouchers,
      assignedFreeVouchers,
      excludedValue
    };
  }, [vouchers, isEnabled, dailyLimit, freePlanNames]);

  if (!isOpen) return null;

  const togglePlan = (planName: string) => {
    const norm = normalizePlanName(planName);
    setFreePlanNames(prev => {
      const exists = prev.some(p => normalizePlanName(p) === norm);
      if (exists) {
        return prev.filter(p => normalizePlanName(p) !== norm);
      } else {
        return [...prev, planName];
      }
    });
  };

  const handleSelectAllPlans = () => {
    setFreePlanNames(planStats.map(p => p.name));
  };

  const handleClearAllPlans = () => {
    setFreePlanNames([]);
  };

  const handleSelectSmallPlans = () => {
    // Select plans with price <= $2.00 or duration <= 2 hours
    const smalls = planStats.filter(p => p.price <= 2.0 || p.name.toLowerCase().includes('hour') || p.name.toLowerCase().includes('min'));
    const names = smalls.map(p => p.name);
    setFreePlanNames(names.length > 0 ? names : planStats.slice(0, 2).map(p => p.name));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated: GiveawaySettings = {
        isEnabled,
        dailyLimitPerAgent: Math.max(1, Number(dailyLimit) || 1),
        freePlanNames,
        allowCustomGiftVouchers: true,
        notes: `Free voucher giveaway rules saved by admin at ${new Date().toLocaleTimeString()}`
      };

      await updateGiveawaySettings(updated);
      showToast(
        isEnabled 
          ? `Gifting enabled! ${freePlanNames.length} plan(s) marked free & excluded from inventory.` 
          : 'Free voucher gifting has been turned OFF.',
        'success'
      );
      onClose();
    } catch (err: any) {
      console.error('Error saving giveaway settings:', err);
      showToast('Failed to save giveaway settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        id="free-voucher-giveaway-modal"
        className={`relative w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden my-8 transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800/80 bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-indigo-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display tracking-tight flex items-center gap-2">
                <span>Free Voucher Giveaways & Gifting</span>
                {isEnabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    ACTIVE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/30">
                    PAUSED
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Mark plans as free &bull; Exclude from sales inventory &bull; Cap daily agent giveaways
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Master Enable / Disable Toggle */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isEnabled 
              ? 'bg-emerald-500/5 border-emerald-500/30 shadow-xs' 
              : theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className={`w-4 h-4 ${isEnabled ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <h3 className="text-sm font-bold font-display">
                    Customer Voucher Gifting Protocol
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  When enabled, agents are authorized to distribute vouchers under marked free plans to customers without payment. Vouchers are excluded from inventory sales tallies.
                </p>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                id="btn-toggle-giveaway-master"
                onClick={() => setIsEnabled(!isEnabled)}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                title={isEnabled ? 'Click to turn OFF gifting' : 'Click to turn ON gifting'}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Section 2: Daily Limit Per Agent */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-display flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-500" />
                  <span>Daily Giveaways Limit Per Agent</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Maximum number of free voucher codes each field agent can gift per day.
                </p>
              </div>

              {/* Number Input & Controls */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setDailyLimit(prev => Math.max(1, prev - 1))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition font-bold cursor-pointer"
                  title="Decrease limit"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  id="input-giveaway-daily-limit"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 text-center text-xs font-mono font-bold bg-transparent focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setDailyLimit(prev => prev + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition font-bold cursor-pointer"
                  title="Increase limit"
                >
                  +
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-mono text-slate-400 mr-1">Presets:</span>
              {[1, 3, 5, 10, 20, 50].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDailyLimit(val)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer ${
                    dailyLimit === val
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-200 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {val} / day
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Select Voucher Code Plans Marked as Free */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold font-display flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span>Select Voucher Code Plans to Mark as Free</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vouchers in marked plans will be <strong>excluded from inventory count</strong> and giftable by agents.
                </p>
              </div>

              {/* Action Buttons for quick marking */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectSmallPlans}
                  className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer"
                  title="Select lower-cost or short-duration plans (e.g. 1hr, 30m)"
                >
                  Quick: Small Plans
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllPlans}
                  className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllPlans}
                  className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Plans List */}
            {planStats.length === 0 ? (
              <div className="p-8 text-center border rounded-2xl border-dashed border-slate-700 text-slate-400 text-xs font-mono">
                No voucher plans found in this workspace. Import or add vouchers first to configure giveaway plans.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {filteredPlans.map(plan => {
                  const isPlanFree = freePlanNames.some(p => normalizePlanName(p) === normalizePlanName(plan.name));

                  return (
                    <div
                      key={plan.name}
                      onClick={() => togglePlan(plan.name)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isPlanFree
                          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-xs'
                          : theme === 'light'
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1 rounded-lg transition-colors ${
                          isPlanFree ? 'text-emerald-500' : 'text-slate-500'
                        }`}>
                          {isPlanFree ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs font-display truncate">
                              {plan.name}
                            </span>
                            {isPlanFree && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                                🎁 FREE / GIFT
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                            <span>Standard Price: ${(plan.price || 0).toFixed(2)}</span>
                            <span>&bull;</span>
                            <span>Duration: {plan.duration}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-bold">
                          <span className="text-emerald-500">{plan.unused} unused</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-slate-400">{plan.total} total</span>
                        </div>
                        <div className="text-[9px] font-mono mt-0.5">
                          {isPlanFree ? (
                            <span className="text-amber-500 font-bold flex items-center gap-1 justify-end">
                              <TrendingDown className="w-3 h-3" />
                              Excluded from Inventory
                            </span>
                          ) : (
                            <span className="text-slate-400">Standard Inventory</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Live Inventory Exclusion Impact Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className={`p-3 rounded-2xl border text-center ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="text-[10px] text-slate-400 font-mono uppercase">Free Plans</div>
              <div className="text-base font-mono font-bold text-emerald-500 mt-0.5">
                {freePlanNames.length}
              </div>
            </div>

            <div className={`p-3 rounded-2xl border text-center ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="text-[10px] text-slate-400 font-mono uppercase">Giveaway Pool</div>
              <div className="text-base font-mono font-bold text-sky-400 mt-0.5">
                {impactStats.totalFreeVouchers} tokens
              </div>
            </div>

            <div className={`p-3 rounded-2xl border text-center ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="text-[10px] text-slate-400 font-mono uppercase">Excluded Unused</div>
              <div className="text-base font-mono font-bold text-indigo-400 mt-0.5">
                {impactStats.unusedFreeVouchers}
              </div>
            </div>

            <div className={`p-3 rounded-2xl border text-center ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="text-[10px] text-slate-400 font-mono uppercase">Daily Agent Cap</div>
              <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
                {dailyLimit} / day
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
            <p className="leading-relaxed">
              <strong>Inventory Protection Rule:</strong> Marking a plan as free automatically excludes all of its voucher tokens from standard paid sales inventory counts, protecting ledger accuracy and sales targets.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            id="btn-save-giveaway-settings"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <span>Saving Configuration...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Giveaway Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
