import React, { useState, useMemo } from 'react';
import {
  X,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Ticket,
  HardDrive,
  User,
  Phone,
  DollarSign,
  Search,
  Filter,
  Check,
  ShieldCheck,
  FileText,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TransactionReversalRequest, ReversalTransactionType } from '../types';

interface TransactionReversalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
  initialSearchTerm?: string;
  initialRequestId?: string;
}

export const TransactionReversalsModal: React.FC<TransactionReversalsModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark',
  initialSearchTerm = '',
  initialRequestId = ''
}) => {
  const {
    reversalRequests,
    approveTransactionReversal,
    rejectTransactionReversal,
    activeWorkspace,
    currentUser
  } = useApp();

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [typeFilter, setTypeFilter] = useState<'All' | 'voucher' | 'legacy_device'>('All');

  // Sync initialSearchTerm / initialRequestId when modal opens
  React.useEffect(() => {
    if (isOpen) {
      if (initialSearchTerm) {
        setSearchTerm(initialSearchTerm);
      } else if (initialRequestId) {
        const req = reversalRequests.find(r => r.id === initialRequestId);
        if (req && req.referenceCode) {
          setSearchTerm(req.referenceCode);
        }
      }

      const targetQuery = (initialSearchTerm || '').toLowerCase().trim();
      const matchingReq = reversalRequests.find(r =>
        (initialRequestId && r.id === initialRequestId) ||
        (targetQuery && (
          r.referenceCode?.toLowerCase() === targetQuery ||
          r.referenceCode?.toLowerCase().includes(targetQuery) ||
          r.transactionId === targetQuery ||
          r.id === targetQuery
        ))
      );

      if (matchingReq) {
        if (matchingReq.status === 'Pending') {
          setStatusFilter('Pending');
        } else {
          setStatusFilter('All');
        }
      }
    }
  }, [isOpen, initialSearchTerm, initialRequestId]);

  // Auto-scroll and highlight target token card when filtered
  React.useEffect(() => {
    if (isOpen && (initialSearchTerm || initialRequestId)) {
      const timer = setTimeout(() => {
        const query = (initialSearchTerm || initialRequestId || '').toLowerCase().trim();
        const card = document.querySelector(`[data-reversal-ref*="${query}"]`) || (initialRequestId ? document.getElementById(`reversal-card-${initialRequestId}`) : null);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('ring-4', 'ring-amber-500', 'shadow-2xl', 'scale-[1.01]');
          setTimeout(() => {
            card.classList.remove('ring-4', 'ring-amber-500', 'shadow-2xl', 'scale-[1.01]');
          }, 3500);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialSearchTerm, initialRequestId]);
  
  // Action Dialog States
  const [selectedRequestForAction, setSelectedRequestForAction] = useState<TransactionReversalRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return reversalRequests.filter(req => {
      // Status filter
      if (statusFilter !== 'All' && req.status !== statusFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'All' && req.transactionType !== typeFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const refMatch = req.referenceCode?.toLowerCase().includes(query);
        const planMatch = req.planOrModel?.toLowerCase().includes(query);
        const agentMatch = req.agentName?.toLowerCase().includes(query);
        const custMatch = req.customerName?.toLowerCase().includes(query);
        const cellMatch = req.customerCell?.toLowerCase().includes(query);
        const reasonMatch = req.reason?.toLowerCase().includes(query);
        return refMatch || planMatch || agentMatch || custMatch || cellMatch || reasonMatch;
      }

      return true;
    }).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [reversalRequests, statusFilter, typeFilter, searchTerm]);

  const pendingCount = useMemo(() => {
    return reversalRequests.filter(r => r.status === 'Pending').length;
  }, [reversalRequests]);

  const approvedCount = useMemo(() => {
    return reversalRequests.filter(r => r.status === 'Approved').length;
  }, [reversalRequests]);

  const rejectedCount = useMemo(() => {
    return reversalRequests.filter(r => r.status === 'Rejected').length;
  }, [reversalRequests]);

  if (!isOpen) return null;

  const handleOpenAction = (req: TransactionReversalRequest, type: 'approve' | 'reject') => {
    setSelectedRequestForAction(req);
    setActionType(type);
    setAdminNotes(type === 'approve' ? 'Approved after verification' : 'Declined per policy');
  };

  const handleConfirmAction = async () => {
    if (!selectedRequestForAction || !actionType) return;
    setIsProcessing(true);
    try {
      if (actionType === 'approve') {
        await approveTransactionReversal(selectedRequestForAction.id, adminNotes);
      } else {
        await rejectTransactionReversal(selectedRequestForAction.id, adminNotes);
      }
    } catch (err) {
      console.error('Error confirming reversal action:', err);
    } finally {
      setSelectedRequestForAction(null);
      setActionType(null);
      setAdminNotes('');
      setIsProcessing(false);
    }
  };

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">Transaction Reversal Requests</h2>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                    {pendingCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Review & approve agent sale reversal requests for vouchers and legacy devices
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition ${
              isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className={`p-4 border-b space-y-3 ${
          isLight ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-950/30 border-slate-800/80'
        }`}>
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs">
              <button
                onClick={() => setStatusFilter('Pending')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  statusFilter === 'Pending'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Pending</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  statusFilter === 'Pending' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-700/60 text-slate-300'
                }`}>
                  {pendingCount}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('Approved')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  statusFilter === 'Approved'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Approved</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  statusFilter === 'Approved' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-700/60 text-slate-300'
                }`}>
                  {approvedCount}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('Rejected')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  statusFilter === 'Rejected'
                    ? 'bg-rose-500 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Rejected</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  statusFilter === 'Rejected' ? 'bg-slate-950/20 text-white' : 'bg-slate-700/60 text-slate-300'
                }`}>
                  {rejectedCount}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('All')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  statusFilter === 'All'
                    ? 'bg-sky-500 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({reversalRequests.length})
              </button>
            </div>

            {/* Type selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Type:</span>
              <div className="flex items-center rounded-lg border border-slate-700/50 bg-slate-800/40 p-0.5 text-xs">
                <button
                  onClick={() => setTypeFilter('All')}
                  className={`px-2.5 py-1 rounded-md transition ${typeFilter === 'All' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setTypeFilter('voucher')}
                  className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${typeFilter === 'voucher' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
                >
                  <Ticket className="w-3 h-3" /> Vouchers
                </button>
                <button
                  onClick={() => setTypeFilter('legacy_device')}
                  className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${typeFilter === 'legacy_device' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
                >
                  <HardDrive className="w-3 h-3" /> Terminals
                </button>
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, terminal model, customer, agent, or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border transition focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            />
          </div>
        </div>

        {/* Requests List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-center mx-auto text-slate-500">
                <RotateCcw className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-400">No reversal requests found</p>
              <p className="text-xs text-slate-500 font-mono">
                {statusFilter === 'Pending' 
                  ? 'There are currently no pending sale reversals submitted by field agents.'
                  : 'Try adjusting your search query or status filters.'}
              </p>
            </div>
          ) : (
            filteredRequests.map(req => {
              const isPending = req.status === 'Pending';
              const isApproved = req.status === 'Approved';
              const isRejected = req.status === 'Rejected';
              const isVoucher = req.transactionType === 'voucher';

              return (
                <div
                  key={req.id}
                  id={`reversal-card-${req.id}`}
                  data-reversal-ref={(req.referenceCode || '').toLowerCase()}
                  className={`p-4 rounded-xl border transition ${
                    isPending
                      ? isLight ? 'bg-amber-50/50 border-amber-200 shadow-xs' : 'bg-amber-950/15 border-amber-500/30 shadow-xs'
                      : isApproved
                        ? isLight ? 'bg-emerald-50/40 border-emerald-200' : 'bg-emerald-950/15 border-emerald-500/20'
                        : isLight ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-slate-950/40 border-slate-800 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Item Info Header */}
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isVoucher
                          ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                          : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                      }`}>
                        {isVoucher ? <Ticket className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm">
                            {req.referenceCode}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            isVoucher ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {isVoucher ? `Voucher • ${req.planOrModel}` : `Terminal • ${req.planOrModel}`}
                          </span>
                          {/* Status Badge */}
                          {isPending && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                              <Clock className="w-2.5 h-2.5" /> Pending Approval
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle className="w-2.5 h-2.5" /> Approved
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                              <XCircle className="w-2.5 h-2.5" /> Rejected
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-3 flex-wrap">
                          <span>Agent: <strong className={isLight ? 'text-slate-700' : 'text-slate-200'}>{req.agentName}</strong></span>
                          {req.customerName && (
                            <span>Customer: <strong className={isLight ? 'text-slate-700' : 'text-slate-200'}>{req.customerName}</strong> {req.customerCell ? `(${req.customerCell})` : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        <div className="text-base sm:text-lg font-black font-mono text-emerald-500">
                          ${(req.amount || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(req.requestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {isPending && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => handleOpenAction(req, 'approve')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition flex items-center gap-1 shadow-xs cursor-pointer"
                            title="Approve Reversal"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleOpenAction(req, 'reject')}
                            className="px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold font-mono transition flex items-center gap-1 cursor-pointer"
                            title="Reject Reversal"
                          >
                            <X className="w-3.5 h-3.5" /> Decline
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stated Reason */}
                  <div className={`mt-3 p-2.5 rounded-lg text-xs font-mono flex items-start gap-2 ${
                    isLight ? 'bg-white/80 border border-slate-200 text-slate-700' : 'bg-slate-900/60 border border-slate-800 text-slate-300'
                  }`}>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-500">Agent Stated Reason:</span> {req.reason}
                    </div>
                  </div>

                  {/* Decision Note if resolved */}
                  {!isPending && req.reviewedBy && (
                    <div className={`mt-2 p-2 rounded-lg text-[11px] font-mono flex items-center justify-between gap-2 ${
                      isApproved 
                        ? isLight ? 'bg-emerald-100/60 text-emerald-800' : 'bg-emerald-950/30 text-emerald-300 border border-emerald-900/40'
                        : isLight ? 'bg-rose-100/60 text-rose-800' : 'bg-rose-950/30 text-rose-300 border border-rose-900/40'
                    }`}>
                      <div>
                        <strong>{req.reviewedBy}</strong> on {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : 'N/A'}: {req.adminNotes || 'No notes provided'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t flex items-center justify-between text-xs font-mono text-slate-400 ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
        }`}>
          <div>
            Showing {filteredRequests.length} of {reversalRequests.length} transaction requests
          </div>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg transition font-medium ${
              isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {selectedRequestForAction && actionType && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                actionType === 'approve'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              }`}>
                {actionType === 'approve' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {actionType === 'approve' ? 'Approve Transaction Reversal' : 'Decline Transaction Reversal'}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedRequestForAction.referenceCode} (${(selectedRequestForAction.amount || 0).toFixed(2)})
                </p>
              </div>
            </div>

            <div className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/50 border-slate-800 text-slate-300'
            }`}>
              <div><strong>Agent:</strong> {selectedRequestForAction.agentName}</div>
              <div><strong>Type:</strong> {selectedRequestForAction.transactionType === 'voucher' ? 'WiFi Voucher' : 'Legacy Device Terminal'}</div>
              <div><strong>Stated Reason:</strong> {selectedRequestForAction.reason}</div>
              {actionType === 'approve' && (
                <div className="text-emerald-500 font-bold pt-1 border-t border-slate-700/40">
                  ℹ️ Approving will return the item to available inventory and deduct ${(selectedRequestForAction.amount || 0).toFixed(2)} from sales totals.
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">
                Administrator Notes / Remarks:
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Enter verification notes or reasons for agent..."
                rows={2}
                className={`w-full p-2.5 rounded-xl text-xs border font-mono transition focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedRequestForAction(null);
                  setActionType(null);
                }}
                disabled={isProcessing}
                className={`px-4 py-2 rounded-xl text-xs font-mono transition ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={isProcessing}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 shadow-md ${
                  actionType === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {isProcessing ? 'Processing...' : actionType === 'approve' ? 'Confirm Approval' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
