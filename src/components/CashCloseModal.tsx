import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowLeft,
  Clock,
  Check,
  ShieldCheck,
  Receipt,
  Sparkles,
  Info,
  Calendar,
  Percent,
  ArrowRight
} from 'lucide-react';
import { CashDrop, WorkspaceCashCloseSettings } from '../types';
import {
  getCurrentCycleMonth,
  getCycleMonthFromDate,
  getCycleMonthLabel,
  getDaysUntilMonthEnd,
  isCashClosePermissible,
  isDropApprovedOrReconciled,
  isDropPending,
  isDropValidForClosedCash
} from '../utils/salesCycleEngine';

interface CashCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  dailySalesTotal: number;
  totalLegacySales: number;
  grandTotalSales: number;
  agentCashDrops: CashDrop[];
  onConfirmCashClose: (
    amount: number,
    notes?: string,
    extra?: {
      cycleMonth: string;
      commissionRate: number;
      matchedCommission: number;
      remainingCashCarriedOver: number;
      remainingCommissionCarriedOver: number;
      attachedPrevCycleUnclosedCash?: number;
      attachedPrevCycleMonth?: string;
      attachedPrevCycleCommission?: number;
      currentCycleCommission?: number;
    }
  ) => Promise<void> | void;
  onFulfillAdminCashDrop: (cashDropId: string, notes?: string) => Promise<void> | void;
  theme: 'light' | 'dark';
  agentName: string;
  agentId?: string;
  commissionRate?: number;
  cashCloseSettings?: WorkspaceCashCloseSettings;
  unclosedCashFromPrevCycle?: number;
  prevCycleMonth?: string;
}

type ModalStep = 'specify' | 'confirm' | 'success';

export const CashCloseModal: React.FC<CashCloseModalProps> = ({
  isOpen,
  onClose,
  dailySalesTotal,
  totalLegacySales,
  grandTotalSales,
  agentCashDrops,
  onConfirmCashClose,
  onFulfillAdminCashDrop,
  theme,
  agentName,
  agentId,
  commissionRate,
  cashCloseSettings,
  unclosedCashFromPrevCycle,
  prevCycleMonth
}) => {
  const [step, setStep] = useState<ModalStep>('specify');
  const [amountStr, setAmountStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [attachPrevCycleCash, setAttachPrevCycleCash] = useState<boolean>(false);
  const [selectedAdminDrop, setSelectedAdminDrop] = useState<CashDrop | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');

  // Calculate pending and already closed drops for this agent in CURRENT sales cycle
  const currentMonthCycle = getCurrentCycleMonth();
  const currentCycleAgentDrops = useMemo(() => {
    return agentCashDrops.filter(cd => {
      const dCycle = cd.cycleMonth || getCycleMonthFromDate(cd.timestamp);
      return dCycle === currentMonthCycle;
    });
  }, [agentCashDrops, currentMonthCycle]);

  const pendingDropsTotal = useMemo(() => {
    return currentCycleAgentDrops
      .filter(isDropPending)
      .reduce((sum, cd) => sum + cd.amount, 0);
  }, [currentCycleAgentDrops]);

  const reconciledDropsTotal = useMemo(() => {
    return currentCycleAgentDrops
      .filter(isDropApprovedOrReconciled)
      .reduce((sum, cd) => sum + cd.amount, 0);
  }, [currentCycleAgentDrops]);

  const historicalClosedDropsTotal = useMemo(() => {
    return agentCashDrops
      .filter((cd) => isDropApprovedOrReconciled(cd) && (cd.cycleMonth || getCycleMonthFromDate(cd.timestamp)) !== currentMonthCycle)
      .reduce((sum, cd) => sum + cd.amount, 0);
  }, [agentCashDrops, currentMonthCycle]);

  const pendingAdminRequests = useMemo(() => {
    return agentCashDrops.filter(cd => isDropPending(cd) && cd.requestedBy === 'WorkspaceMaster');
  }, [agentCashDrops]);

  // Estimated unclosed cash balance
  const estimatedUnclosedCash = useMemo(() => {
    const totalSales = grandTotalSales;
    const closed = pendingDropsTotal + reconciledDropsTotal;
    return Math.max(0, totalSales - closed);
  }, [grandTotalSales, pendingDropsTotal, reconciledDropsTotal]);

  const hasUnclosedFromPrev = (unclosedCashFromPrevCycle || 0) > 0.01;

  // Cycle Closes Count
  const currentCycleClosesCount = useMemo(() => {
    return currentCycleAgentDrops.filter(isDropValidForClosedCash).length;
  }, [currentCycleAgentDrops]);

  // Determine if previous cycle attachment is mandatory (workspace default or agent override)
  const isPrevCycleAttachmentMandatory = useMemo(() => {
    const override = agentId ? cashCloseSettings?.agentOverrides?.[agentId] : undefined;
    if (override?.requirePrevCycleAttachment === 'mandatory') return true;
    if (override?.requirePrevCycleAttachment === 'optional') return false;
    return cashCloseSettings?.prevCycleAttachmentMode === 'mandatory';
  }, [agentId, cashCloseSettings]);

  const maxCloseableCash = useMemo(() => {
    return attachPrevCycleCash
      ? estimatedUnclosedCash + (hasUnclosedFromPrev ? (unclosedCashFromPrevCycle || 0) : 0)
      : estimatedUnclosedCash;
  }, [attachPrevCycleCash, estimatedUnclosedCash, hasUnclosedFromPrev, unclosedCashFromPrevCycle]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('specify');
      setSelectedAdminDrop(null);
      const shouldAutoAttach = isPrevCycleAttachmentMandatory && hasUnclosedFromPrev;
      setAttachPrevCycleCash(shouldAutoAttach);
      // Pre-fill with estimated unclosed cash (+ previous cycle if mandatory) ONLY if > 0
      const base = estimatedUnclosedCash > 0 ? estimatedUnclosedCash : 0;
      const defaultAmount = shouldAutoAttach ? (base + (unclosedCashFromPrevCycle || 0)) : base;
      setAmountStr(defaultAmount > 0 ? (defaultAmount || 0).toFixed(2) : '');
      setNotes('');
      setValidationError(null);
      setIsSubmitting(false);
      setActiveTab('form');
    }
  }, [isOpen, estimatedUnclosedCash, isPrevCycleAttachmentMandatory, hasUnclosedFromPrev, unclosedCashFromPrevCycle]);

  // Commission and Sales Cycle Calculations
  const effectiveCommissionRate = commissionRate !== undefined
    ? commissionRate
    : (cashCloseSettings?.defaultCommissionRate ?? 10);

  const parsedAmount = parseFloat(amountStr) || 0;
  const attachedPrevCycleUnclosed = attachPrevCycleCash ? (unclosedCashFromPrevCycle || 0) : 0;
  const attachedPrevCycleCommission = attachPrevCycleCash ? Number((attachedPrevCycleUnclosed * (effectiveCommissionRate / 100)).toFixed(2)) : 0;

  const currentCyclePortion = attachPrevCycleCash
    ? Math.max(0, parsedAmount - attachedPrevCycleUnclosed)
    : parsedAmount;
  const matchedCommissionClosed = currentCyclePortion * (effectiveCommissionRate / 100);
  const totalCommissionClosed = matchedCommissionClosed + attachedPrevCycleCommission;

  const remainingCash = Math.max(0, estimatedUnclosedCash - currentCyclePortion);
  const remainingCommission = remainingCash * (effectiveCommissionRate / 100);

  const hasAdminDropRequest = pendingAdminRequests.length > 0;
  const permissibleCheck = useMemo(() => {
    return isCashClosePermissible(
      agentId || '',
      cashCloseSettings,
      hasAdminDropRequest,
      new Date(),
      currentCycleClosesCount
    );
  }, [agentId, cashCloseSettings, hasAdminDropRequest, currentCycleClosesCount]);

  const minCashCloseAmount = useMemo(() => {
    const override = agentId ? cashCloseSettings?.agentOverrides?.[agentId] : undefined;
    return override?.minCashCloseAmount ?? cashCloseSettings?.minCashCloseAmount ?? 10;
  }, [agentId, cashCloseSettings]);

  if (!isOpen) return null;

  const handleProceedToConfirm = () => {
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Please enter a valid cash amount greater than $0.00');
      return;
    }
    if (estimatedUnclosedCash <= 0 && (!attachPrevCycleCash || !hasUnclosedFromPrev) && !selectedAdminDrop) {
      setValidationError('All sales collections for this cycle have already been closed ($0.00 unclosed balance). No cash close required.');
      return;
    }
    if (parsedAmount > maxCloseableCash && !selectedAdminDrop) {
      setValidationError(`Amount entered ($${(parsedAmount || 0).toFixed(2)}) exceeds your allowable cash balance ($${(maxCloseableCash || 0).toFixed(2)}). You cannot close more cash than your remaining balance.`);
      return;
    }
    if (parsedAmount < minCashCloseAmount && !selectedAdminDrop && maxCloseableCash >= minCashCloseAmount) {
      setValidationError(`Minimum allowable cash close amount is $${(minCashCloseAmount || 0).toFixed(2)} (as set by Administrator).`);
      return;
    }
    // Mandatory previous cycle attachment verification
    if (isPrevCycleAttachmentMandatory && hasUnclosedFromPrev && !attachPrevCycleCash && !selectedAdminDrop) {
      setValidationError(`Administrator policy mandates attaching your previous cycle unclosed cash ($${(unclosedCashFromPrevCycle || 0).toFixed(2)}) to this cash close.`);
      return;
    }
    if (!permissibleCheck.isPermissible && !selectedAdminDrop) {
      setValidationError(permissibleCheck.reason);
      return;
    }
    setValidationError(null);
    setStep('confirm');
  };

  const handleExecuteConfirm = async () => {
    if (parsedAmount <= 0) return;
    setIsSubmitting(true);
    try {
      if (selectedAdminDrop) {
        await onFulfillAdminCashDrop(selectedAdminDrop.id, notes);
      } else {
        await onConfirmCashClose(parsedAmount, notes, {
          cycleMonth: getCurrentCycleMonth(),
          commissionRate: effectiveCommissionRate,
          matchedCommission: totalCommissionClosed,
          currentCycleCommission: matchedCommissionClosed,
          remainingCashCarriedOver: remainingCash,
          remainingCommissionCarriedOver: remainingCommission,
          attachedPrevCycleUnclosedCash: attachedPrevCycleUnclosed,
          attachedPrevCycleCommission: attachedPrevCycleCommission,
          attachedPrevCycleMonth: attachPrevCycleCash ? prevCycleMonth : undefined
        });
      }
      setAmountStr('');
      setNotes('');
      setSelectedAdminDrop(null);
      setValidationError(null);
      setStep('specify');
      onClose();
    } catch (err) {
      console.error('Error confirming cash close:', err);
      setValidationError('Failed to submit cash close. Please try again.');
      setStep('specify');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setPresetAmount = (val: number) => {
    setAmountStr(val.toFixed(2));
    setValidationError(null);
  };

  const addAmount = (inc: number) => {
    const current = parseFloat(amountStr) || 0;
    const next = Math.max(0, current + inc);
    setAmountStr(next.toFixed(2));
    setValidationError(null);
  };

  return (
    <div
      id="cash-close-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        id="cash-close-modal-card"
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 flex flex-col max-h-[92vh] ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
            theme === 'light' ? 'border-slate-100 bg-slate-50/70' : 'border-slate-800/80 bg-slate-950/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-display">
                  {step === 'confirm' ? 'Confirm Cash Close' : 'Initiate Cash Close'}
                </h2>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                  EOD Reconciliation
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'confirm'
                  ? 'Please review and confirm your cash close details'
                  : 'Specify the cash amount you wish to close and hand over'}
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-cash-close-modal"
            onClick={onClose}
            disabled={isSubmitting}
            className={`p-2 rounded-xl transition cursor-pointer ${
              theme === 'light'
                ? 'hover:bg-slate-200/70 text-slate-400 hover:text-slate-700'
                : 'hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Cancel and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs (Form vs History) */}
        {step === 'specify' && (
          <div
            className={`flex border-b px-4 sm:px-5 gap-2 shrink-0 ${
              theme === 'light' ? 'border-slate-100 bg-slate-50/30' : 'border-slate-800/50 bg-slate-950/20'
            }`}
          >
            <button
              type="button"
              id="tab-cash-close-form"
              onClick={() => setActiveTab('form')}
              className={`py-2.5 px-3 text-xs font-mono font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'form'
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Specify Cash Close
            </button>
            <button
              type="button"
              id="tab-cash-close-history"
              onClick={() => setActiveTab('history')}
              className={`py-2.5 px-3 text-xs font-mono font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'history'
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              My Cash Drops ({agentCashDrops.length})
            </button>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* STEP 1: SPECIFY CASH AMOUNT */}
          {step === 'specify' && activeTab === 'form' && (
            <div className="space-y-4">
              {/* Monthly Sales Cycle Status Banner */}
              <div className={`p-3.5 rounded-xl border space-y-1.5 text-xs font-mono ${
                permissibleCheck.isPermissible
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>Sales Cycle: {getCycleMonthLabel()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {permissibleCheck.maxCloses !== null && permissibleCheck.maxCloses !== undefined ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                        Quota: {currentCycleClosesCount}/{permissibleCheck.maxCloses} used ({permissibleCheck.closesRemaining ?? 0} left)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                        Closes: Flexible / Unlimited
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      permissibleCheck.isPermissible
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}>
                      {permissibleCheck.isPermissible ? 'Cash Close Permitted' : 'Quota / Limit Reached'}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {permissibleCheck.reason} Closed cash reconciles with sales and matches earned commission.
                </p>
              </div>

              {/* Sales Ledger Breakdown Banner */}
              <div
                className={`p-3.5 rounded-xl border grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200/80 text-slate-700'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300'
                }`}
              >
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Today's Vouchers
                  </div>
                  <div className="text-sm font-bold font-mono mt-0.5 text-emerald-600 dark:text-emerald-400">
                    ${(dailySalesTotal || 0).toFixed(2)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Legacy Devices
                  </div>
                  <div className="text-sm font-bold font-mono mt-0.5 text-indigo-600 dark:text-indigo-400">
                    ${(totalLegacySales || 0).toFixed(2)}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Total Sales Ledger
                  </div>
                  <div className="text-sm font-bold font-mono mt-0.5 font-display text-slate-900 dark:text-white">
                    ${(grandTotalSales || 0).toFixed(2)}
                  </div>
                </div>

                {pendingDropsTotal > 0 && (
                  <div className="col-span-2 sm:col-span-3 pt-2 mt-1 border-t border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-amber-600 dark:text-amber-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Pending Admin Verification:
                    </span>
                    <span className="font-bold">${(pendingDropsTotal || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Admin-placed Cash Drop requests */}
              {pendingAdminRequests.length > 0 && (
                <div className="space-y-1.5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
                  <div className="font-bold flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Administrator Cash-Drop Requests</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    The following cash drops were requested directly by the Workspace Master. Fulfilling a request locks the required amount.
                  </p>
                  <div className="space-y-1 mt-1.5">
                    {pendingAdminRequests.map(r => {
                      const isSelected = selectedAdminDrop?.id === r.id;
                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedAdminDrop(null);
                              const defaultAmount = estimatedUnclosedCash > 0 ? estimatedUnclosedCash : grandTotalSales;
                              setAmountStr(defaultAmount > 0 ? (defaultAmount || 0).toFixed(2) : '');
                            } else {
                              setSelectedAdminDrop(r);
                              setAmountStr(r.amount.toFixed(2));
                              if (r.notes) {
                                setNotes(`Fulfilling requested drop: "${r.notes}"`);
                              }
                            }
                          }}
                          className={`p-2 border rounded-lg flex items-center justify-between gap-2 transition cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[11px]">
                              Required Drop Amount: ${(r.amount || 0).toFixed(2)}
                            </div>
                            {r.notes && (
                              <p className={`text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'} truncate`}>
                                Note: "{r.notes}"
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSelected
                                ? 'bg-white text-indigo-600'
                                : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25'
                            }`}
                          >
                            {isSelected ? 'Selected (Locked)' : 'Fulfill'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Previous Sales Cycle Unclosed Cash Attachment */}
              {unclosedCashFromPrevCycle !== undefined && unclosedCashFromPrevCycle > 0 && !selectedAdminDrop && (
                <div className={`p-3.5 rounded-xl border transition-all ${
                  isPrevCycleAttachmentMandatory
                    ? 'border-indigo-500/50 bg-indigo-500/10 dark:bg-indigo-950/30'
                    : attachPrevCycleCash
                    ? 'border-orange-500/50 bg-orange-500/10 dark:bg-orange-950/30'
                    : 'border-orange-500/30 bg-orange-500/5 dark:bg-orange-950/20'
                }`}>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-md ${
                        isPrevCycleAttachmentMandatory
                          ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                          : 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                      }`}>
                        {isPrevCycleAttachmentMandatory ? <ShieldCheck className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`text-xs font-bold ${
                        isPrevCycleAttachmentMandatory
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : 'text-orange-700 dark:text-orange-300'
                      }`}>
                        Unclosed Cash From Previous Cycle
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                        isPrevCycleAttachmentMandatory
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
                          : 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
                      }`}>
                        {isPrevCycleAttachmentMandatory ? '🔒 Mandatory Attachment' : 'Optional Attachment'}
                      </span>
                      <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400">
                        ${(unclosedCashFromPrevCycle || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2.5">
                    {isPrevCycleAttachmentMandatory
                      ? `Administrator policy requires that all unclosed funds from ${prevCycleMonth || 'your previous sales cycle'} ($${(unclosedCashFromPrevCycle || 0).toFixed(2)}) must be attached and remitted with this cash close.`
                      : `You have $${(unclosedCashFromPrevCycle || 0).toFixed(2)} in unclosed cash from your previous sales cycle. Check the box below to attach and deposit it together with this cash close.`}
                  </p>
                  <label className={`flex items-center gap-2.5 pt-2 border-t border-orange-500/20 select-none ${
                    isPrevCycleAttachmentMandatory ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
                  }`}>
                    <input
                      type="checkbox"
                      id="checkbox-attach-prev-cycle-cash"
                      checked={attachPrevCycleCash}
                      disabled={isPrevCycleAttachmentMandatory}
                      onChange={(e) => {
                        if (isPrevCycleAttachmentMandatory) return;
                        const checked = e.target.checked;
                        setAttachPrevCycleCash(checked);
                        const base = estimatedUnclosedCash > 0 ? estimatedUnclosedCash : 0;
                        const newAmt = checked ? (base + unclosedCashFromPrevCycle) : base;
                        setAmountStr(newAmt > 0 ? (newAmt || 0).toFixed(2) : '');
                        setValidationError(null);
                      }}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 dark:border-slate-700 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {isPrevCycleAttachmentMandatory ? 'Locked: ' : ''}Attach previous cycle unclosed cash (+${(unclosedCashFromPrevCycle || 0).toFixed(2)}) &amp; equivalent commission (+${(unclosedCashFromPrevCycle * (effectiveCommissionRate / 100)).toFixed(2)})
                    </span>
                  </label>
                </div>
              )}

              {/* Amount Specification Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="cash-close-amount-input"
                    className="text-xs font-bold font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <span>Cash Amount to Close</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">USD Currency</span>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-lg">
                    $
                  </div>
                  <input
                    id="cash-close-amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    autoFocus
                    placeholder="0.00"
                    disabled={!!selectedAdminDrop}
                    value={amountStr}
                    onChange={(e) => {
                      setAmountStr(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleProceedToConfirm();
                      }
                    }}
                    className={`w-full pl-9 pr-24 py-3 rounded-xl border text-xl font-bold font-mono transition-all outline-none ${
                      selectedAdminDrop
                        ? 'bg-slate-100 dark:bg-slate-900 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 opacity-90'
                        : validationError
                        ? 'border-red-500 bg-red-50/20 text-red-600 focus:ring-2 focus:ring-red-400'
                        : theme === 'light'
                        ? 'border-slate-300 bg-white text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                        : 'border-slate-700 bg-slate-950 text-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20'
                    }`}
                  />
                  <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
                    {amountStr && !selectedAdminDrop && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmountStr('');
                          setValidationError(null);
                        }}
                        className="px-2 py-1 text-[11px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                        title="Clear amount"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {selectedAdminDrop && (
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono mt-1 flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Amount locked for Admin Cash-Drop request. Deselect request to unlock.</span>
                  </div>
                )}

                {validationError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-500 font-mono mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}
              </div>

              {/* All Cash Collections Closed Banner */}
              {estimatedUnclosedCash <= 0 && !selectedAdminDrop && (
                <div className="p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center gap-2.5 text-xs font-mono">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-bold">All Cash Collections Closed: </span>
                    <span>All sales for this cycle have already been closed ($0.00 unclosed balance). There is no outstanding cash to close.</span>
                  </div>
                </div>
              )}

              {/* Quick Preset Chips */}
              {!selectedAdminDrop && estimatedUnclosedCash > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Quick Amount Presets
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      id="btn-preset-unclosed-cash"
                      onClick={() => setPresetAmount(estimatedUnclosedCash)}
                      className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                        Math.abs(parsedAmount - estimatedUnclosedCash) < 0.001
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                          : theme === 'light'
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Net Unclosed (${(estimatedUnclosedCash || 0).toFixed(2)})
                    </button>

                    {[10, 20, 50, 100].filter(val => val <= estimatedUnclosedCash).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => addAmount(val)}
                        className={`text-[11px] font-mono px-2 py-1 rounded-lg border transition cursor-pointer ${
                          theme === 'light'
                            ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                            : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                        }`}
                        title={`Add $${val}`}
                      >
                        +${val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Closed Cash & Commission Matching Breakdown */}
              <div className={`p-3.5 rounded-xl border space-y-2.5 text-xs font-mono ${
                theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800 text-slate-200'
              }`}>
                <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-[11px] flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                    <Percent className="w-3.5 h-3.5" />
                    Commission Match & Balance Rollover ({effectiveCommissionRate}%)
                  </span>
                  <span className="text-[10px] text-slate-400">Min Close: ${(minCashCloseAmount || 0).toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-[9px] text-slate-400 uppercase">Closed Cash (This Drop)</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                      ${(parsedAmount || 0).toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Matches Commission: <strong>${(matchedCommissionClosed || 0).toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="text-[9px] text-slate-400 uppercase">Remaining Cash Carried Over</div>
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                      ${(remainingCash || 0).toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Equivalent Commission: <strong>${(remainingCommission || 0).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Closed cash matches the commission earned by the agent. Remaining cash (${(remainingCash || 0).toFixed(2)}) will remain with equivalent agent commission (${(remainingCommission || 0).toFixed(2)}) and roll over into the new sales cycle.
                </p>
              </div>

              {/* Optional Notes / Shift Reference */}
              <div className="space-y-1.5">
                <label
                  htmlFor="cash-close-notes"
                  className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between"
                >
                  <span>Shift Notes / Handover Reference (Optional)</span>
                  <span className="text-[10px] text-slate-400">e.g. Shift 1 or supervisor envelope</span>
                </label>
                <input
                  id="cash-close-notes"
                  type="text"
                  placeholder="e.g. Morning shift close, left $10 drawer float"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={120}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono transition outline-none ${
                    theme === 'light'
                      ? 'border-slate-200 bg-white text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
                      : 'border-slate-800 bg-slate-950 text-slate-200 focus:border-orange-400 focus:ring-1 focus:ring-orange-400'
                  }`}
                />
              </div>

              {/* Informational Guidance Box */}
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  theme === 'light'
                    ? 'bg-amber-50/60 border-amber-200/70 text-amber-800'
                    : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                }`}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div className="space-y-1 text-[11px] leading-relaxed">
                  <p className="font-semibold">Two-Step Verification Protocol</p>
                  <p className="text-slate-600 dark:text-slate-400">
                    Entering an amount here does not immediately close the drawer. On the next screen, you will be
                    prompted to explicitly <strong>confirm</strong> or <strong>cancel</strong> this cash drop before it is submitted to the Workspace Master.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CONFIRM OR CANCEL ACTION */}
          {step === 'confirm' && (
            <div className="space-y-4 animate-fade-in">
              {/* Prominent Verification Notice Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  theme === 'light'
                    ? 'bg-orange-50 border-orange-200 text-orange-900'
                    : 'bg-orange-950/30 border-orange-800/60 text-orange-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-orange-500/20 text-orange-600 dark:text-orange-400 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-display">Confirm Cash Close Action?</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    Please review the specified cash drop amount below. Would you like to proceed and submit this cash close, or cancel?
                  </p>
                </div>
              </div>

              {/* Review Summary Receipt Card */}
              <div
                className={`p-4 rounded-xl border space-y-3.5 ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950/70 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    Specified Cash Amount
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                    ${(parsedAmount || 0).toFixed(2)}
                  </div>
                </div>

                {attachPrevCycleCash && (unclosedCashFromPrevCycle || 0) > 0 && (
                  <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/25 space-y-1 font-mono text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                      <span>Current Cycle Sales Cash:</span>
                      <span className="font-bold">${Math.max(0, parsedAmount - (unclosedCashFromPrevCycle || 0)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-orange-600 dark:text-orange-400 text-[11px] font-bold">
                      <span>Attached Prev Cycle Unclosed Cash:</span>
                      <span>+${(unclosedCashFromPrevCycle || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-indigo-600 dark:text-indigo-400 text-[11px] font-bold">
                      <span>Attached Equivalent Agent Commission:</span>
                      <span>+${(attachedPrevCycleCommission || 0).toFixed(2)} ({effectiveCommissionRate}%)</span>
                    </div>
                    <div className="flex justify-between border-t border-orange-500/20 pt-1 text-slate-900 dark:text-white font-black text-xs">
                      <span>Total Deposit Close:</span>
                      <span>${(parsedAmount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Agent Name</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{agentName}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Submission Time</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Today
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Total Sales Recorded</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      ${(grandTotalSales || 0).toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Matched Agent Commission</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      ${(totalCommissionClosed || 0).toFixed(2)} ({effectiveCommissionRate}%)
                      {attachPrevCycleCash && attachedPrevCycleCommission > 0 && (
                        <span className="text-[9px] block text-emerald-600 dark:text-emerald-400">
                          (Current: ${(matchedCommissionClosed || 0).toFixed(2)} + Prev: ${(attachedPrevCycleCommission || 0).toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Remaining Cash Carried Over</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      ${(remainingCash || 0).toFixed(2)} (Comm: ${(remainingCommission || 0).toFixed(2)})
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Sales Cycle Month</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {getCycleMonthLabel()}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Status After Submission</span>
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                      <Clock className="w-3 h-3" />
                      Pending Verification
                    </span>
                  </div>

                  {notes && (
                    <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Shift Notes</span>
                      <span className="text-xs italic text-slate-700 dark:text-slate-300 break-words">
                        "{notes}"
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>Submitted directly to the Workspace Master for verification & reconciliation.</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS STATE */}
          {step === 'success' && (
            <div className="py-8 text-center space-y-3 animate-fade-in">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold font-display text-emerald-600 dark:text-emerald-400">
                Cash Close Submitted!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Cash drop of <strong className="text-slate-800 dark:text-slate-200">${(parsedAmount || 0).toFixed(2)}</strong> has been logged and is awaiting Admin reconciliation.
              </p>
            </div>
          )}

          {/* TAB: MY CASH DROPS HISTORY */}
          {step === 'specify' && activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">
                  Showing {agentCashDrops.length} past cash close events
                </span>
              </div>

              {agentCashDrops.length === 0 ? (
                <div className="p-6 text-center text-slate-400 font-mono text-xs border border-dashed rounded-xl">
                  No cash close events recorded yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {agentCashDrops.map((cd) => (
                    <div
                      key={cd.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-mono ${
                        theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            ${(cd.amount || 0).toFixed(2)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              cd.status === 'Reconciled' || (cd.status as any) === 'Approved'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {cd.status === 'Reconciled' || (cd.status as any) === 'Approved' ? 'Approved' : 'Pending Approval'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(cd.timestamp).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {cd.notes ? ` • "${cd.notes}"` : ''}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">{cd.requestedBy}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div
          className={`p-4 sm:p-5 border-t shrink-0 flex flex-col sm:flex-row items-center justify-end gap-2.5 ${
            theme === 'light' ? 'border-slate-100 bg-slate-50/70' : 'border-slate-800/80 bg-slate-950/40'
          }`}
        >
          {step === 'specify' && (
            <>
              <button
                type="button"
                id="btn-cancel-cash-close-specify"
                onClick={onClose}
                disabled={isSubmitting}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-mono font-semibold transition cursor-pointer ${
                  theme === 'light'
                    ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                id="btn-proceed-cash-close"
                onClick={handleProceedToConfirm}
                disabled={isSubmitting || parsedAmount <= 0 || (estimatedUnclosedCash <= 0 && !selectedAdminDrop)}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-mono font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                  estimatedUnclosedCash <= 0 && !selectedAdminDrop
                    ? 'bg-emerald-600 text-white opacity-90 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white'
                }`}
              >
                {estimatedUnclosedCash <= 0 && !selectedAdminDrop ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Cash Close Already Completed</span>
                  </>
                ) : (
                  <span>Review & Confirm (${(parsedAmount || 0).toFixed(2)})</span>
                )}
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              {/* Back to Edit Button */}
              <button
                type="button"
                id="btn-back-cash-close-edit"
                onClick={() => setStep('specify')}
                disabled={isSubmitting}
                className={`w-full sm:w-auto px-3.5 py-2.5 rounded-xl border text-xs font-mono font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  theme === 'light'
                    ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Edit Amount</span>
              </button>

              {/* Explicit Cancel Button */}
              <button
                type="button"
                id="btn-cancel-cash-close-action"
                onClick={onClose}
                disabled={isSubmitting}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-mono font-semibold transition cursor-pointer text-red-500 hover:bg-red-500/10 border-red-500/30`}
              >
                Cancel Action
              </button>

              {/* Explicit Confirm Button */}
              <button
                type="button"
                id="btn-confirm-cash-close-action"
                onClick={handleExecuteConfirm}
                disabled={isSubmitting || parsedAmount <= 0}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Cash Close (${(parsedAmount || 0).toFixed(2)})</span>
                  </>
                )}
              </button>
            </>
          )}

          {step === 'success' && (
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-mono font-bold text-xs"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
