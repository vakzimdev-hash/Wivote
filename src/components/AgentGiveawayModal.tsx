import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Gift, 
  Sparkles, 
  Printer, 
  Check, 
  User, 
  Phone, 
  Wifi, 
  Clock, 
  ShieldAlert, 
  Tag,
  Layers,
  ChevronDown,
  ArrowRight,
  Send,
  AlertCircle
} from 'lucide-react';
import { Voucher, Customer } from '../types';
import { useApp, resolveCustomerWorkspaceId, getTargetWorkspaceId, getSoldVouchersRegistry, sanitizeVoucherCode } from '../context/AppContext';
import { CustomerSearchSelect } from './CustomerSearchSelect';
import { isVoucherFree, getVoucherMonetaryValue } from '../utils/giveawayEngine';

interface AgentGiveawayModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher?: Voucher | null;
  assignedFreeVouchers?: Voucher[];
  workspacePoolFreeVouchers?: Voucher[];
  myAssignedVouchers?: Voucher[];
  dailyGiveawayInfo: {
    allowed: boolean;
    remaining: number;
    usedToday: number;
    dailyLimit: number;
    reason?: string;
  };
  onExecuteGiveaway: (
    voucher: Voucher,
    customerName: string,
    customerCell: string,
    action: 'print_and_close' | 'close_no_print' | 'preview'
  ) => Promise<void>;
  onRequestTopup?: (plan: string) => void;
  theme?: 'light' | 'dark';
}

export const AgentGiveawayModal: React.FC<AgentGiveawayModalProps> = ({
  isOpen,
  onClose,
  voucher: initialVoucher,
  assignedFreeVouchers = [],
  workspacePoolFreeVouchers = [],
  myAssignedVouchers = [],
  dailyGiveawayInfo,
  onExecuteGiveaway,
  onRequestTopup,
  theme = 'dark'
}) => {
  const { customers: rawCustomers = [], activeWorkspace, currentUser, giveawaySettings } = useApp();
  const targetWsId = getTargetWorkspaceId(activeWorkspace, currentUser, 'ws_vakzim');
  const customers = useMemo(() => {
    return rawCustomers.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId);
  }, [rawCustomers, targetWsId]);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(initialVoucher || null);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerCell, setCustomerCell] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeSourceTab, setActiveSourceTab] = useState<'my_free' | 'workspace_pool' | 'convert_assigned'>('my_free');
  const [requestedTopup, setRequestedTopup] = useState(false);

  // Available free vouchers in agent's assigned stock
  const myFreeList = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    return assignedFreeVouchers.filter(v => {
      const isSold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt;
      if (isSold) return false;
      const cleanCode = sanitizeVoucherCode(v);
      if (soldReg.has(v.id) || (cleanCode && soldReg.has(cleanCode.toLowerCase().trim()))) return false;
      return v.status === 'Assigned';
    });
  }, [assignedFreeVouchers]);

  // Available free vouchers in workspace pool (unassigned)
  const poolFreeList = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    return workspacePoolFreeVouchers.filter(v => {
      const isSold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt;
      if (isSold) return false;
      const cleanCode = sanitizeVoucherCode(v);
      if (soldReg.has(v.id) || (cleanCode && soldReg.has(cleanCode.toLowerCase().trim()))) return false;
      return (v.status === 'Unused' || (v.status as any) === 'unused') && !v.assignedAgentId;
    });
  }, [workspacePoolFreeVouchers]);

  // Paid vouchers assigned to agent that could be gifted as promotional vouchers
  const assignablePaidList = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    return myAssignedVouchers.filter(v => {
      const isSold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt;
      if (isSold) return false;
      const cleanCode = sanitizeVoucherCode(v);
      if (soldReg.has(v.id) || (cleanCode && soldReg.has(cleanCode.toLowerCase().trim()))) return false;
      return v.status === 'Assigned' && !isVoucherFree(v, giveawaySettings);
    });
  }, [myAssignedVouchers, giveawaySettings]);

  // Determine optimal initial voucher when modal opens
  useEffect(() => {
    if (isOpen) {
      setRequestedTopup(false);
      if (initialVoucher) {
        setSelectedVoucher(initialVoucher);
        if (isVoucherFree(initialVoucher, giveawaySettings)) {
          if (initialVoucher.assignedAgentId) {
            setActiveSourceTab('my_free');
          } else {
            setActiveSourceTab('workspace_pool');
          }
        } else {
          setActiveSourceTab('convert_assigned');
        }
      } else {
        // Automatically choose first available free voucher
        if (myFreeList.length > 0) {
          setSelectedVoucher(myFreeList[0]);
          setActiveSourceTab('my_free');
        } else if (poolFreeList.length > 0) {
          setSelectedVoucher(poolFreeList[0]);
          setActiveSourceTab('workspace_pool');
        } else if (assignablePaidList.length > 0) {
          setSelectedVoucher(assignablePaidList[0]);
          setActiveSourceTab('convert_assigned');
        } else {
          setSelectedVoucher(null);
        }
      }
    }
  }, [isOpen, initialVoucher, myFreeList, poolFreeList, assignablePaidList, giveawaySettings]);

  if (!isOpen) return null;

  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerCell(customer.cellNumber);
    }
  };

  const handleTopupClick = () => {
    if (onRequestTopup) {
      onRequestTopup(giveawaySettings?.freePlanNames?.[0] || '1 Hour Free');
      setRequestedTopup(true);
    }
  };

  const handleSubmit = async (action: 'print_and_close' | 'close_no_print' | 'preview') => {
    if (!selectedVoucher) {
      alert("Please select a voucher to gift to the customer.");
      return;
    }

    if (!dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining <= 0) {
      alert(dailyGiveawayInfo.reason || "Daily giveaway limit reached.");
      return;
    }

    setIsSubmitting(true);
    try {
      const finalName = customerName.trim() || 'Walk-in Client';
      const finalCell = customerCell.trim() || 'N/A';
      await onExecuteGiveaway(selectedVoucher, finalName, finalCell, action);
      onClose();
    } catch (err) {
      console.error("Error executing giveaway:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine current active voucher pool list
  const currentList = activeSourceTab === 'my_free'
    ? myFreeList
    : activeSourceTab === 'workspace_pool'
    ? poolFreeList
    : assignablePaidList;

  const isSelectedFromPool = selectedVoucher && !selectedVoucher.assignedAgentId && selectedVoucher.status === 'Unused';
  const isSelectedCustomConverted = selectedVoucher && !isVoucherFree(selectedVoucher, giveawaySettings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        id="agent-giveaway-modal"
        className={`relative w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden my-8 transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800/80 bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-indigo-500/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display tracking-tight flex items-center gap-2">
                <span>Free Voucher Giveaway</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  $0.00 GIFT
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Authorized customer gifting &bull; Strictly $0.00 &bull; Excluded from sales ledger
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

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Daily Quota Counter Banner */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            dailyGiveawayInfo.allowed 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
              <div className="text-xs font-mono">
                <span className="font-bold">Daily Giveaway Quota: </span>
                <span className="font-extrabold text-white">
                  {dailyGiveawayInfo.usedToday} / {dailyGiveawayInfo.dailyLimit} used today
                </span>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {dailyGiveawayInfo.remaining > 0 
                    ? `You can give away ${dailyGiveawayInfo.remaining} more free promotional voucher(s) today.` 
                    : 'You have reached the daily giveaway limit set by Workspace Master.'}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`px-2.5 py-1 rounded-xl text-[11px] font-mono font-black ${
                dailyGiveawayInfo.remaining > 0 ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
              }`}>
                {dailyGiveawayInfo.remaining} LEFT
              </span>
            </div>
          </div>

          {/* Source Tabs for Accessing Free Vouchers */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold font-mono text-slate-400 flex items-center justify-between">
              <span>Select Free Voucher Source:</span>
              <span className="text-[10px] text-slate-500">
                {myFreeList.length} in stock • {poolFreeList.length} in pool
              </span>
            </label>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono font-bold">
              <button
                type="button"
                id="btn-source-my-free"
                onClick={() => {
                  setActiveSourceTab('my_free');
                  if (myFreeList.length > 0) setSelectedVoucher(myFreeList[0]);
                }}
                className={`py-1.5 px-2 rounded-xl transition cursor-pointer text-center truncate ${
                  activeSourceTab === 'my_free'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                My Stock ({myFreeList.length})
              </button>

              <button
                type="button"
                id="btn-source-workspace-pool"
                onClick={() => {
                  setActiveSourceTab('workspace_pool');
                  if (poolFreeList.length > 0) setSelectedVoucher(poolFreeList[0]);
                }}
                className={`py-1.5 px-2 rounded-xl transition cursor-pointer text-center truncate ${
                  activeSourceTab === 'workspace_pool'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Workspace Pool ({poolFreeList.length})
              </button>

              <button
                type="button"
                id="btn-source-convert"
                onClick={() => {
                  setActiveSourceTab('convert_assigned');
                  if (assignablePaidList.length > 0) setSelectedVoucher(assignablePaidList[0]);
                }}
                className={`py-1.5 px-2 rounded-xl transition cursor-pointer text-center truncate ${
                  activeSourceTab === 'convert_assigned'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Convert an assigned voucher to a customer promotional gift"
              >
                From Inventory ({assignablePaidList.length})
              </button>
            </div>
          </div>

          {/* Voucher Selector Dropdown / Selection List */}
          {currentList.length > 0 ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>Choose Voucher to Issue:</span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  {currentList.length} available
                </span>
              </label>

              <div className="relative">
                <select
                  id="select-giveaway-voucher"
                  value={selectedVoucher?.id || ''}
                  onChange={(e) => {
                    const match = currentList.find(v => v.id === e.target.value);
                    if (match) setSelectedVoucher(match);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono font-bold appearance-none cursor-pointer pr-8 ${
                    theme === 'light'
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-800 text-emerald-300'
                  }`}
                >
                  {currentList.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.code} — {v.plan} ({v.duration || 'Standard'}) &bull; Nominal: ${(v.price || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/10 text-xs font-mono text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <div>
                  <span className="font-bold">No vouchers in this category. </span>
                  {activeSourceTab === 'my_free' && poolFreeList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSourceTab('workspace_pool');
                        setSelectedVoucher(poolFreeList[0]);
                      }}
                      className="underline font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer block mt-1"
                    >
                      &rarr; Use {poolFreeList.length} free voucher(s) available in the Workspace Pool
                    </button>
                  )}
                  {activeSourceTab === 'my_free' && poolFreeList.length === 0 && assignablePaidList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSourceTab('convert_assigned');
                        setSelectedVoucher(assignablePaidList[0]);
                      }}
                      className="underline font-bold text-sky-400 hover:text-sky-300 cursor-pointer block mt-1"
                    >
                      &rarr; Convert one of your {assignablePaidList.length} inventory vouchers into a customer gift
                    </button>
                  )}
                </div>

                {onRequestTopup && (
                  <button
                    type="button"
                    id="btn-request-free-vouchers"
                    onClick={handleTopupClick}
                    disabled={requestedTopup}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{requestedTopup ? '✓ Request Sent to Master' : '⚡ Request Free Gift Vouchers from Admin'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active Voucher Summary Card */}
          {selectedVoucher && (
            <div className={`p-4 rounded-2xl border space-y-2.5 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-mono uppercase text-slate-400 font-bold">Voucher Selected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isSelectedFromPool && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      Pool Auto-Claim
                    </span>
                  )}
                  {isSelectedCustomConverted && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Promotional Conversion
                    </span>
                  )}
                  <span className="font-mono font-black text-sm tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                    {selectedVoucher.code}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-400">Plan: </span>
                  <span className="font-bold text-slate-200">{selectedVoucher.plan}</span>
                </div>
                <div>
                  <span className="text-slate-400">Duration: </span>
                  <span className="font-bold text-slate-200">{selectedVoucher.duration || 'Standard'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Nominal Value: </span>
                  <span className="line-through text-slate-400">${(selectedVoucher.price || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Customer Pays: </span>
                  <span className="font-bold text-emerald-400">$0.00 (FREE)</span>
                </div>
              </div>
            </div>
          )}

          {/* Customer Details Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold font-display flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-500" />
                <span>Recipient Customer Details</span>
              </label>
              <button
                type="button"
                id="btn-giveaway-quick-walkin"
                onClick={() => {
                  setCustomerName('Walk-in Client');
                  setCustomerCell('N/A');
                  setSelectedCustomer(null);
                }}
                className="text-[10px] font-mono text-sky-400 hover:underline cursor-pointer"
              >
                Quick: Walk-in Client
              </button>
            </div>

            {/* Intelligent Customer Registry Lookup & Input */}
            <div>
              <CustomerSearchSelect
                customers={customers}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={handleSelectCustomer}
                customerName={customerName}
                onChangeCustomerName={setCustomerName}
                customerCell={customerCell}
                onChangeCustomerCell={setCustomerCell}
                masterCountryCode={activeWorkspace?.telephoneCode || '+233'}
                theme={theme}
                idPrefix="giveaway-customer"
                labelTitle="Select Existing or Register Recipient Customer"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              id="btn-giveaway-preview"
              onClick={() => handleSubmit('preview')}
              disabled={isSubmitting || !selectedVoucher || (!dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining <= 0)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 transition cursor-pointer disabled:opacity-50"
              title="Preview ticket and share on WhatsApp"
            >
              WhatsApp / Preview
            </button>

            <button
              type="button"
              id="btn-giveaway-done-no-print"
              onClick={() => handleSubmit('close_no_print')}
              disabled={isSubmitting || !selectedVoucher || (!dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining <= 0)}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              Gift Free (No Print)
            </button>

            <button
              type="button"
              id="btn-giveaway-print-and-close"
              onClick={() => handleSubmit('print_and_close')}
              disabled={isSubmitting || !selectedVoucher || (!dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining <= 0)}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Gift & Print Slip ($0.00)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
