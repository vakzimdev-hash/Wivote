import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CashDrop, Voucher, LegacyDevice, UserProfile } from '../types';
import { 
  X, 
  CheckCircle2, 
  DollarSign, 
  Calendar, 
  User, 
  Ticket, 
  Cpu, 
  TrendingUp, 
  ShieldCheck, 
  FileText, 
  AlertCircle,
  ArrowRight,
  XCircle,
  Clock,
  Sparkles,
  Copy,
  Check
} from 'lucide-react';
import { getAgentDisplayName } from '../utils/rbacPolicy';

interface CashDropApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashDrop: CashDrop | null;
  onApprove: (cashDropId: string, notes?: string) => Promise<void> | void;
  onDecline?: (cashDropId: string, reason?: string) => Promise<void> | void;
  vouchers: Voucher[];
  legacyDevices: LegacyDevice[];
  users: UserProfile[];
  theme: 'light' | 'dark';
}

export const CashDropApprovalModal: React.FC<CashDropApprovalModalProps> = ({
  isOpen,
  onClose,
  cashDrop,
  onApprove,
  onDecline,
  vouchers,
  legacyDevices,
  users,
  theme
}) => {
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Locate agent details
  const agent = useMemo(() => {
    if (!cashDrop) return null;
    return users.find(u => 
      u.uid === cashDrop.agentId || 
      (u.name && cashDrop.agentName && u.name.toLowerCase().trim() === cashDrop.agentName.toLowerCase().trim())
    );
  }, [cashDrop, users]);

  // Find sold vouchers linked to this agent that will be reconciled/archived
  const relatedSoldVouchers = useMemo(() => {
    if (!cashDrop) return [];
    const agentId = cashDrop.agentId;
    const agentName = cashDrop.agentName;
    return vouchers.filter(v => {
      if (v.status !== 'Sold' || v.archived) return false;
      if (v.assignedAgentId && (v.assignedAgentId === agentId || (agentId && v.assignedAgentId.toLowerCase() === agentId.toLowerCase()))) return true;
      if (v.assignedAgentName && agentName && v.assignedAgentName.toLowerCase().trim() === agentName.toLowerCase().trim()) return true;
      return false;
    });
  }, [cashDrop, vouchers]);

  // Find sold legacy devices linked to this agent
  const relatedSoldLegacyDevices = useMemo(() => {
    if (!cashDrop) return [];
    const agentId = cashDrop.agentId;
    const agentName = cashDrop.agentName;
    return legacyDevices.filter(ld => {
      if (ld.status !== 'SOLD' || ld.cashClosed) return false;
      if (ld.fieldAgentId && (ld.fieldAgentId === agentId || (agentId && ld.fieldAgentId.toLowerCase() === agentId.toLowerCase()))) return true;
      if (ld.fieldAgentName && agentName && ld.fieldAgentName.toLowerCase().trim() === agentName.toLowerCase().trim()) return true;
      return false;
    });
  }, [cashDrop, legacyDevices]);

  // Compute total sales metrics for this cash drop
  const vouchersTotal = useMemo(() => {
    return relatedSoldVouchers.reduce((acc, v) => acc + (v.soldPrice ?? v.price ?? 0), 0);
  }, [relatedSoldVouchers]);

  const legacyTotal = useMemo(() => {
    return relatedSoldLegacyDevices.reduce((acc, ld) => acc + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);
  }, [relatedSoldLegacyDevices]);

  const calculatedTotalCash = vouchersTotal + legacyTotal;
  const { activeWorkspace, declineCashDrop } = useApp();
  const commissionRate = agent?.commissionRate ?? (activeWorkspace as any)?.cashCloseSettings?.defaultCommissionRate ?? (cashDrop as any)?.commissionRate ?? 10;
  const estimatedCommission = (calculatedTotalCash * commissionRate) / 100;
  const netCompanyRemittance = Math.max(0, (cashDrop?.amount || calculatedTotalCash) - estimatedCommission);

  const isAlreadyApproved = useMemo(() => {
    if (!cashDrop) return false;
    return cashDrop.status === 'Approved' || cashDrop.status === 'Reconciled' || !!cashDrop.approvedAt;
  }, [cashDrop]);

  if (!isOpen || !cashDrop) return null;

  const handleConfirmApproval = async () => {
    if (isAlreadyApproved) {
      onClose();
      return;
    }
    try {
      setIsSubmitting(true);
      await onApprove(cashDrop.id, adminNotes);
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      console.error("Cash drop approval error:", err);
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (isAlreadyApproved) return;
    try {
      setIsSubmitting(true);
      if (onDecline) {
        await onDecline(cashDrop.id, adminNotes);
      } else if (declineCashDrop) {
        await declineCashDrop(cashDrop.id, adminNotes);
      }
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      console.error("Cash drop decline error:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`relative w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-400/50' 
            : 'bg-slate-900 border-slate-800 text-white shadow-black/90'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-500/10 via-emerald-600/5 to-teal-500/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg font-display leading-tight">
                  Approve Cash Close & Reconcile
                </h3>
                {isAlreadyApproved ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    Approved
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase">
                    Pending Review
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Verify agent cash close details, sales ledger, and update leaderboard metrics
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          
          {/* Summary Card Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Agent Info */}
            <div className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800/80'
            }`}>
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400 flex items-center gap-1.5 mb-2">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Field Agent</span>
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {getAgentDisplayName(cashDrop.agentName)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate max-w-full">
                  {agent?.email || 'Registered Terminal'}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    Commission: {commissionRate}%
                  </span>
                  {cashDrop.agentId && (
                    <div className="w-full mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/80">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-0.5">
                        <span className="font-bold uppercase tracking-wider">Agent UID:</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(cashDrop.agentId);
                            setCopiedUid(true);
                            setTimeout(() => setCopiedUid(false), 2000);
                          }}
                          className="text-[9px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                          title="Copy full UID"
                        >
                          {copiedUid ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                          <span>{copiedUid ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-[10px] font-mono font-extrabold text-sky-600 dark:text-sky-400 select-all break-all bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 leading-tight">
                        {cashDrop.agentId}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submitted Amount */}
            <div className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
              theme === 'light' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-emerald-950/20 border-emerald-800/40'
            }`}>
              <div className="text-[10px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-2">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Cash Close Amount</span>
              </div>
              <div>
                <div className="font-black text-2xl text-emerald-600 dark:text-emerald-400 font-mono">
                  ${(cashDrop.amount || calculatedTotalCash).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Submitted via {cashDrop.requestedBy === 'Agent' ? 'Agent App' : 'Admin Request'}
                </div>
              </div>
            </div>

            {/* Net Remittance Calculation */}
            <div className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
              theme === 'light' ? 'bg-indigo-50/60 border-indigo-200' : 'bg-indigo-950/20 border-indigo-800/40'
            }`}>
              <div className="text-[10px] font-mono font-bold uppercase text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Net Company Revenue</span>
              </div>
              <div>
                <div className="font-black text-xl text-indigo-600 dark:text-indigo-400 font-mono">
                  ${netCompanyRemittance.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  After ${estimatedCommission.toFixed(2)} agent commission
                </div>
              </div>
            </div>
          </div>

          {/* Previous Cycle Unclosed Cash Warning Notice if Present */}
          {cashDrop.attachedPrevCycleUnclosedCash !== undefined && cashDrop.attachedPrevCycleUnclosedCash > 0 && (
            <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-mono flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-bold block">
                  Includes Previous Sales Cycle Carried-over Cash: ${(cashDrop.attachedPrevCycleUnclosedCash).toFixed(2)}
                </span>
                <span className="text-[11px] opacity-90 block mt-0.5">
                  Approving this cash close will also reconcile the unclosed carried-over cash balance from previous cycle for {cashDrop.agentName}.
                </span>
              </div>
            </div>
          )}

          {/* Agent Notes */}
          {cashDrop.notes && (
            <div className={`p-3 rounded-xl border text-xs ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                Agent / Requester Notes
              </span>
              <p className="text-slate-700 dark:text-slate-300 italic">
                "{cashDrop.notes}"
              </p>
            </div>
          )}

          {/* Related Sales Ledger Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                Active Sales Included in Reconciliation
              </span>
              <span className="text-indigo-600 dark:text-indigo-400">
                {relatedSoldVouchers.length} Vouchers (${vouchersTotal.toFixed(2)}) &bull; {relatedSoldLegacyDevices.length} Terminals (${legacyTotal.toFixed(2)})
              </span>
            </div>

            <div className={`border rounded-2xl p-3 space-y-2 max-h-[180px] overflow-y-auto ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              {/* Vouchers list */}
              {relatedSoldVouchers.map(v => (
                <div key={v.id} className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Ticket className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white truncate">{v.code}</span>
                    <span className="text-[10px] text-slate-400">({v.plan})</span>
                    {v.customerName && (
                      <span className="text-[10px] text-indigo-500 truncate hidden sm:inline">&bull; {v.customerName}</span>
                    )}
                  </div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    ${(v.soldPrice ?? v.price ?? 0).toFixed(2)}
                  </div>
                </div>
              ))}

              {/* Legacy devices list */}
              {relatedSoldLegacyDevices.map(ld => (
                <div key={ld.id} className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Cpu className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white truncate">{ld.deviceNameModel}</span>
                    <span className="text-[10px] text-slate-400">({ld.macAddress})</span>
                    {ld.customerName && (
                      <span className="text-[10px] text-indigo-500 truncate hidden sm:inline">&bull; {ld.customerName}</span>
                    )}
                  </div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    ${(ld.soldPrice ?? ld.monthlyPrice ?? 0).toFixed(2)}
                  </div>
                </div>
              ))}

              {relatedSoldVouchers.length === 0 && relatedSoldLegacyDevices.length === 0 && (
                <p className="text-[11px] text-slate-400 font-mono text-center py-3">
                  No active unarchived sales records attached to this cash close.
                </p>
              )}
            </div>
          </div>

          {/* Admin Notes Input */}
          <div>
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Administrator Approval Notes (Optional)
            </label>
            <input
              type="text"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="e.g. Verified bank deposit / cash received at Harare office"
              className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                theme === 'light' ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400' : 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-600'
              }`}
            />
          </div>

          {/* Notice of Automatic Metrics & Cloud DB Push */}
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-600 dark:text-indigo-300 font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              <strong>Auto-Sync Notice:</strong> Approving will immediately archive sold vouchers, update agent leaderboard scores, sync all dashboard visuals, and automatically push records to the Cloud Database.
            </span>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-bold font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>

          {!isAlreadyApproved && (
            <button
              type="button"
              onClick={handleDecline}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-95 text-xs font-bold font-mono transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 text-rose-500" />
              <span>Decline Cash Close</span>
            </button>
          )}

          {isAlreadyApproved ? (
            <button
              type="button"
              disabled
              className="px-5 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold font-mono cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Already Approved & Reconciled</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmApproval}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold font-mono shadow-md hover:shadow-lg transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Approving & Syncing...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Approve Cash Close</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
