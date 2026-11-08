import React, { useState, useEffect } from 'react';
import { Edit2, Check, X, Layers, AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface EditPlanNamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: string[];
  theme?: string;
  categoryTallies?: Record<string, { unused?: number; assigned?: number; total?: number; unusedValue?: number; assignedValue?: number; sold?: number; soldValue?: number }>;
}

export const EditPlanNamesModal: React.FC<EditPlanNamesModalProps> = ({
  isOpen,
  onClose,
  plans,
  theme = 'dark',
  categoryTallies = {}
}) => {
  const { renameVoucherPlan, deleteVoucherPlan, showToast } = useApp();
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [savedSuccessPlan, setSavedSuccessPlan] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Plan Deletion State
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<'unassigned' | 'all'>('unassigned');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      plans.forEach(p => {
        initial[p] = p;
      });
      setEditedNames(initial);
      setSavingPlan(null);
      setSavedSuccessPlan(null);
      setSearchFilter('');
      setPlanToDelete(null);
      setDeleteMode('unassigned');
      setIsDeleting(false);
    }
  }, [isOpen, plans]);

  if (!isOpen) return null;

  const filteredPlans = plans.filter(p =>
    p.toLowerCase().includes(searchFilter.toLowerCase().trim())
  );

  const handleSaveName = async (originalPlan: string) => {
    const newName = (editedNames[originalPlan] || '').trim();
    if (!newName) {
      showToast('Plan name cannot be empty.', 'error');
      return;
    }
    if (newName === originalPlan) {
      showToast('Plan name is unchanged.', 'info');
      return;
    }

    try {
      setSavingPlan(originalPlan);
      await renameVoucherPlan(originalPlan, newName);
      setSavedSuccessPlan(newName);
      showToast(`Plan "${originalPlan}" successfully renamed to "${newName}"!`, 'success');
      setTimeout(() => {
        setSavedSuccessPlan(null);
      }, 3000);
    } catch (err: any) {
      showToast(err?.message || 'Failed to rename plan.', 'error');
    } finally {
      setSavingPlan(null);
    }
  };

  const handleConfirmDeletePlan = async () => {
    if (!planToDelete) return;
    try {
      setIsDeleting(true);
      const res = await deleteVoucherPlan(planToDelete, deleteMode);
      if (res.success) {
        setPlanToDelete(null);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete plan.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const activeDeleteTallies = planToDelete ? categoryTallies[planToDelete] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all animate-in zoom-in-95 duration-200 relative ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
          theme === 'light' ? 'border-slate-100 bg-slate-50/60' : 'border-slate-800/80 bg-slate-950/40'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
              <Edit2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-base font-bold font-display truncate ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}>
                Manage Voucher Plans
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Rename plan categories or delete unsanctioned voucher plans
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer shrink-0 ${
              theme === 'light'
                ? 'border-slate-200 hover:bg-slate-100 text-slate-500'
                : 'border-slate-800 hover:bg-slate-800 text-slate-400'
            }`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Delete Confirmation Overlay Modal */}
        {planToDelete && (
          <div className="absolute inset-0 z-20 p-4 bg-slate-950/90 backdrop-blur-md flex flex-col justify-center animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-5 rounded-2xl border shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
              theme === 'light' ? 'bg-white border-red-200 text-slate-800' : 'bg-slate-900 border-red-900/50 text-white'
            }`}>
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-red-500/15 text-red-500 border border-red-500/20 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-red-500">
                    Delete Voucher Plan
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Are you sure you want to delete the plan category <strong className="text-amber-400">"{planToDelete}"</strong>?
                  </p>
                </div>
              </div>

              {activeDeleteTallies && (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs font-mono space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span>Unused Inventory:</span>
                    <span className="font-bold text-amber-400">{activeDeleteTallies.unused ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Assigned Agent Stock:</span>
                    <span className="font-bold text-cyan-400">{activeDeleteTallies.assigned ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sold Transactions:</span>
                    <span className="font-bold text-emerald-400">{activeDeleteTallies.sold ?? 0}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800 font-bold text-white">
                    <span>Total Plan Vouchers:</span>
                    <span>{activeDeleteTallies.total ?? ((activeDeleteTallies.unused ?? 0) + (activeDeleteTallies.assigned ?? 0) + (activeDeleteTallies.sold ?? 0))}</span>
                  </div>
                </div>
              )}

              {activeDeleteTallies && (activeDeleteTallies.unused ?? 0) === 0 && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono leading-relaxed">
                  ⚠️ This plan category has <strong>0 unassigned vouchers</strong> (all vouchers are assigned or sold). <strong>"Purge ALL"</strong> will permanently delete this plan and purge all its matching records from the server and local database.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-slate-300 block">
                  Select Deletion Scope:
                </label>

                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      if ((activeDeleteTallies?.unused ?? 0) > 0) {
                        setDeleteMode('unassigned');
                      }
                    }}
                    disabled={(activeDeleteTallies?.unused ?? 0) === 0}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                      (activeDeleteTallies?.unused ?? 0) === 0
                        ? 'opacity-40 border-slate-800 bg-slate-950/20 text-slate-500 cursor-not-allowed'
                        : deleteMode === 'unassigned'
                        ? 'border-amber-500 bg-amber-500/10 text-white cursor-pointer'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={deleteMode === 'unassigned'}
                      disabled={(activeDeleteTallies?.unused ?? 0) === 0}
                      onChange={() => setDeleteMode('unassigned')}
                      className="mt-0.5 accent-amber-500"
                    />
                    <div>
                      <div className="font-bold text-amber-400">
                        Delete Unassigned Stock Only {(activeDeleteTallies?.unused ?? 0) === 0 ? '(0 Available)' : '(Recommended)'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {(activeDeleteTallies?.unused ?? 0) === 0
                          ? 'No unassigned stock exists for this plan. Select Purge ALL below to delete.'
                          : 'Purges unassigned/unused vouchers of this plan while preserving assigned agent inventory and transaction history.'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteMode('all')}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      deleteMode === 'all'
                        ? 'border-red-500 bg-red-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={deleteMode === 'all'}
                      onChange={() => setDeleteMode('all')}
                      className="mt-0.5 accent-red-500"
                    />
                    <div>
                      <div className="font-bold text-red-400">Purge ALL Vouchers of this Plan</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Completely removes all vouchers under this unsanctioned plan name from global database, server sync, and local memory.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl font-mono text-xs font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete-plan"
                  onClick={handleConfirmDeletePlan}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl font-mono text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {isDeleting ? (
                    <span>Deleting Plan...</span>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Permanently Delete Plan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search filter if more than 4 plans */}
        {plans.length > 4 && (
          <div className="p-3 border-b border-slate-100 dark:border-slate-800/60">
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search plan categories..."
              className={`w-full px-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>
        )}

        {/* Plans List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
          {filteredPlans.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-slate-400">
              No matching plans found.
            </div>
          ) : (
            filteredPlans.map(plan => {
              const currentInput = editedNames[plan] ?? plan;
              const hasChanged = currentInput.trim() !== plan && currentInput.trim().length > 0;
              const isSaving = savingPlan === plan;
              const isSaved = savedSuccessPlan === plan;
              const tallies = categoryTallies[plan];
              const totalVouchers = tallies?.total ?? ((tallies?.unused ?? 0) + (tallies?.assigned ?? 0));

              return (
                <div
                  key={plan}
                  className={`p-3 rounded-2xl border transition-all ${
                    hasChanged
                      ? 'border-amber-400 bg-amber-500/5'
                      : theme === 'light'
                      ? 'border-slate-200 bg-slate-50/70'
                      : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-slate-400" />
                      <span>Original Plan: <strong>{plan}</strong></span>
                    </span>
                    <div className="flex items-center gap-2">
                      {totalVouchers !== undefined && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {totalVouchers} vouchers
                        </span>
                      )}
                      <button
                        type="button"
                        id={`btn-delete-plan-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`}
                        onClick={() => {
                          setPlanToDelete(plan);
                          const t = categoryTallies[plan];
                          const unusedCount = t?.unused ?? 0;
                          setDeleteMode(unusedCount === 0 ? 'all' : 'unassigned');
                        }}
                        className="p-1 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition cursor-pointer"
                        title={`Delete plan "${plan}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentInput}
                      onChange={e => {
                        const val = e.target.value;
                        setEditedNames(prev => ({ ...prev, [plan]: val }));
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && hasChanged) {
                          handleSaveName(plan);
                        }
                      }}
                      placeholder="Enter new plan name..."
                      className={`flex-1 px-3 py-2 text-xs font-mono font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                        theme === 'light'
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />

                    <button
                      type="button"
                      id={`btn-save-plan-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      onClick={() => handleSaveName(plan)}
                      disabled={!hasChanged || isSaving}
                      className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 select-none ${
                        isSaved
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : hasChanged
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/20 active:scale-95'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                      }`}
                      title={hasChanged ? `Save new name "${currentInput}"` : 'Name unchanged'}
                    >
                      {isSaving ? (
                        <span>Saving...</span>
                      ) : isSaved ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Saved ✓</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between gap-3 ${
          theme === 'light' ? 'border-slate-100 bg-slate-50/60' : 'border-slate-800/80 bg-slate-950/40'
        }`}>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Changes update matching inventory across all devices.</span>
          </div>

          <button
            type="button"
            id="btn-close-edit-plans-modal"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl font-mono font-bold text-xs border transition cursor-pointer ${
              theme === 'light'
                ? 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
