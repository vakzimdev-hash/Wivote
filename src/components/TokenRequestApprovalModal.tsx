import React, { useState, useMemo } from 'react';
import {
  Ticket,
  X,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  Sparkles,
  Layers,
  AlertCircle,
  MapPin,
  Calendar,
  Check,
  User,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { VoucherRequest, Voucher, UserProfile } from '../types';

interface TokenRequestApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: VoucherRequest[];
  vouchers: Voucher[];
  agents: UserProfile[];
  theme: 'light' | 'dark';
  activeRequestId?: string | null;
  onGoToRequest: (request: VoucherRequest) => void;
  onApproveRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
  onDeleteRequest?: (requestId: string) => void;
}

export const TokenRequestApprovalModal: React.FC<TokenRequestApprovalModalProps> = ({
  isOpen,
  onClose,
  requests,
  vouchers,
  agents,
  theme,
  activeRequestId,
  onGoToRequest,
  onApproveRequest,
  onDeclineRequest,
  onDeleteRequest
}) => {
  const [filterStatus, setFilterStatus] = useState<'All' | 'Pending' | 'Fulfilled' | 'Declined'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('All');

  // Calculate live unused inventory tallies by plan
  const unusedByPlan = useMemo(() => {
    const map: Record<string, number> = {};
    vouchers.forEach((v) => {
      if (v.status === 'Unused' && !v.assignedAgentId) {
        const key = v.plan.trim().toLowerCase();
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [vouchers]);

  // Sorted and filtered requests
  const filteredRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter((r) => {
        if (filterStatus !== 'All' && r.status !== filterStatus) return false;
        if (selectedAgentFilter !== 'All' && r.agentId !== selectedAgentFilter && r.agentName !== selectedAgentFilter) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const matchName = r.agentName.toLowerCase().includes(q);
        const matchPlan = r.plan.toLowerCase().includes(q);
        const matchLoc = r.location?.toLowerCase().includes(q);
        return matchName || matchPlan || matchLoc;
      });
  }, [requests, filterStatus, selectedAgentFilter, searchQuery]);

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'Pending').length, [requests]);
  const approvedCount = useMemo(() => requests.filter((r) => r.status === 'Fulfilled').length, [requests]);
  const declinedCount = useMemo(() => requests.filter((r) => r.status === 'Declined').length, [requests]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`border rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl transition-all ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shadow-xs">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-display">Administrator Token Request Approvals</h3>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-white animate-pulse">
                    {pendingCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Review agent top-up requests &bull; Click &ldquo;Go to&rdquo; to preselect unused stock and approve upon assignment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
            {[
              { id: 'All', label: 'All Requests', count: requests.length },
              { id: 'Pending', label: 'Pending', count: pendingCount, highlight: pendingCount > 0 },
              { id: 'Fulfilled', label: 'Approved', count: approvedCount },
              { id: 'Declined', label: 'Declined', count: declinedCount }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                  filterStatus === tab.id
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    filterStatus === tab.id
                      ? 'bg-white/20 text-white'
                      : tab.highlight
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Agent Filter */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agent/plan..."
                className="w-full pl-8 pr-2 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:outline-none"
              />
            </div>

            <select
              value={selectedAgentFilter}
              onChange={(e) => setSelectedAgentFilter(e.target.value)}
              className="px-2 py-1.5 text-xs font-mono rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:outline-none"
            >
              <option value="All">All Agents</option>
              {agents.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Requests List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {filteredRequests.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
              <Ticket className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No token requests found</h4>
              <p className="text-xs text-slate-400 font-mono mt-1">
                {filterStatus === 'Pending'
                  ? 'All agent token top-up requests have been reviewed and approved!'
                  : 'No requests match your current filters.'}
              </p>
            </div>
          ) : (
            filteredRequests.map((r) => {
              const planKey = r.plan.trim().toLowerCase();
              const availableStock = unusedByPlan[planKey] || 0;
              const hasFullStock = availableStock >= r.quantity;
              const hasPartialStock = availableStock > 0 && availableStock < r.quantity;

              return (
                <div
                  key={r.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    r.status === 'Pending'
                      ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10 shadow-xs'
                      : r.status === 'Fulfilled'
                      ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/10 dark:bg-emerald-950/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 opacity-75'
                  }`}
                >
                  {/* Left: Request details */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold font-mono text-xs text-slate-600 dark:text-slate-300 shrink-0 mt-0.5">
                      {r.agentName
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'AG'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {r.agentName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {r.quantity} &times; {r.plan}
                        </span>

                        {/* Status Badge */}
                        {r.status === 'Pending' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending Review
                          </span>
                        ) : r.status === 'Fulfilled' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Approved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 flex items-center gap-1">
                            <X className="w-3 h-3 text-rose-600" />
                            Declined
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {r.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {r.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {new Date(r.timestamp).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>

                        {/* Live Stock Indicator */}
                        <span
                          className={`flex items-center gap-1 font-bold ${
                            hasFullStock
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : hasPartialStock
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-500'
                          }`}
                        >
                          <Layers className="w-3 h-3" />
                          {hasFullStock
                            ? `Stock Available: ${availableStock} unused`
                            : hasPartialStock
                            ? `Partial Stock: ${availableStock} available`
                            : `Out of Stock (0 unused)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800">
                    {r.status === 'Pending' ? (
                      <>
                        {/* THE REQUIRED 'GO TO' BUTTON */}
                        <button
                          type="button"
                          id={`btn-goto-request-${r.id}`}
                          onClick={() => onGoToRequest(r)}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm shadow-indigo-500/25 transition cursor-pointer"
                          title={`Open voucher assignment panel with ${r.quantity} unused ${r.plan} vouchers preselected for ${r.agentName}`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Go to</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Direct Manual Approve */}
                        <button
                          type="button"
                          onClick={() => onApproveRequest(r.id)}
                          className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
                          title="Manually mark this request as approved"
                        >
                          Approve
                        </button>

                        {/* Decline */}
                        <button
                          type="button"
                          onClick={() => onDeclineRequest(r.id)}
                          className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
                          title="Decline this voucher top-up request"
                        >
                          Decline
                        </button>
                      </>
                    ) : r.status === 'Fulfilled' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5 shadow-2xs">
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          Approved
                        </span>
                        {onDeleteRequest && (
                          <button
                            type="button"
                            onClick={() => onDeleteRequest(r.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Delete this approved request record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 flex items-center gap-1.5">
                          <X className="w-3.5 h-3.5 text-rose-600" />
                          Declined
                        </span>
                        {onDeleteRequest && (
                          <button
                            type="button"
                            onClick={() => onDeleteRequest(r.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Delete this declined request record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              Clicking <strong>&ldquo;Go to&rdquo;</strong> preselects matching unused vouchers. Status changes to <strong>Approved</strong> only when vouchers have been assigned.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
