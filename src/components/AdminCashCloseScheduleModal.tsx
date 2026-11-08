import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  DollarSign,
  Percent,
  Clock,
  Send,
  AlertTriangle,
  CheckCircle2,
  Users,
  Sliders,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  UserProfile,
  WorkspaceCashCloseSettings,
  AgentCashCloseSchedule,
  DEFAULT_CASH_CLOSE_SETTINGS
} from '../types';
import {
  getWorkspaceSalesCycleAggregate,
  getCycleMonthLabel,
  getCurrentCycleMonth,
  getDaysUntilMonthEnd
} from '../utils/salesCycleEngine';
import { getWorkspaceActiveAgents } from '../utils/rbacPolicy';

interface AdminCashCloseScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
}

export const AdminCashCloseScheduleModal: React.FC<AdminCashCloseScheduleModalProps> = ({
  isOpen,
  onClose,
  theme
}) => {
  const {
    activeWorkspace,
    currentUser,
    users,
    vouchers,
    legacyDevices,
    cashDrops,
    cashCloseSettings,
    updateCashCloseSettings,
    updateAgentCashCloseSchedule,
    requestAgentCashClose,
    showToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'agents' | 'defaults'>('agents');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const adminWsId = (currentUser && currentUser.role !== 'AppOwner')
    ? (currentUser.workspaceId || activeWorkspace?.id)
    : (activeWorkspace?.id || currentUser?.workspaceId);

  // Form state for default settings
  const effectiveSettings = activeWorkspace?.cashCloseSettings || cashCloseSettings || DEFAULT_CASH_CLOSE_SETTINGS;

  const [defaultAllowedDays, setDefaultAllowedDays] = useState<number>(
    effectiveSettings.allowedDaysBeforeMonthEnd ?? 2
  );
  const [defaultMinAmount, setDefaultMinAmount] = useState<number>(
    effectiveSettings.minCashCloseAmount ?? 10
  );
  const [defaultCommissionRate, setDefaultCommissionRate] = useState<number>(
    effectiveSettings.defaultCommissionRate ?? 10
  );
  const [remindFinalDay, setRemindFinalDay] = useState<boolean>(
    effectiveSettings.remindFinalDay ?? true
  );
  const [autoCarryover, setAutoCarryover] = useState<boolean>(
    effectiveSettings.autoCarryover ?? true
  );
  const [maxClosesPerCycle, setMaxClosesPerCycle] = useState<number | null>(
    effectiveSettings.maxClosesPerCycle ?? null
  );
  const [allowAnytimeCloses, setAllowAnytimeCloses] = useState<boolean>(
    effectiveSettings.allowAnytimeCloses ?? true
  );
  const [prevCycleAttachmentMode, setPrevCycleAttachmentMode] = useState<'optional' | 'mandatory'>(
    effectiveSettings.prevCycleAttachmentMode ?? 'optional'
  );

  React.useEffect(() => {
    if (isOpen) {
      setDefaultAllowedDays(effectiveSettings.allowedDaysBeforeMonthEnd ?? 2);
      setDefaultMinAmount(effectiveSettings.minCashCloseAmount ?? 10);
      setDefaultCommissionRate(effectiveSettings.defaultCommissionRate ?? 10);
      setRemindFinalDay(effectiveSettings.remindFinalDay ?? true);
      setAutoCarryover(effectiveSettings.autoCarryover ?? true);
      setMaxClosesPerCycle(effectiveSettings.maxClosesPerCycle ?? null);
      setAllowAnytimeCloses(effectiveSettings.allowAnytimeCloses ?? true);
      setPrevCycleAttachmentMode(effectiveSettings.prevCycleAttachmentMode ?? 'optional');
    }
  }, [isOpen, effectiveSettings]);

  // Request cash close inline modal/state
  const [requestTargetAgent, setRequestTargetAgent] = useState<UserProfile | null>(null);
  const [requestAmountStr, setRequestAmountStr] = useState<string>('');
  const [requestNotes, setRequestNotes] = useState<string>('Monthly sales cycle reconciliation');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);

  // Get active agents strictly for the admin's active workspace
  const agents = useMemo(() => {
    return getWorkspaceActiveAgents(users, activeWorkspace, currentUser);
  }, [users, activeWorkspace, currentUser]);

  // Aggregate metrics strictly scoped to this admin's workspace
  const aggregate = useMemo(() => {
    return getWorkspaceSalesCycleAggregate(
      agents,
      vouchers,
      legacyDevices,
      cashDrops,
      effectiveSettings,
      undefined,
      adminWsId
    );
  }, [agents, vouchers, legacyDevices, cashDrops, effectiveSettings, adminWsId]);

  if (!isOpen) return null;

  const currentCycleLabel = getCycleMonthLabel();
  const daysUntilEnd = getDaysUntilMonthEnd();

  const handleSaveDefaults = async () => {
    try {
      await updateCashCloseSettings({
        allowedDaysBeforeMonthEnd: Number(defaultAllowedDays) || 2,
        minCashCloseAmount: Number(defaultMinAmount) || 10,
        defaultCommissionRate: Number(defaultCommissionRate) || 10,
        remindFinalDay,
        autoCarryover,
        maxClosesPerCycle: maxClosesPerCycle !== null && !isNaN(Number(maxClosesPerCycle)) && Number(maxClosesPerCycle) > 0 ? Number(maxClosesPerCycle) : null,
        allowAnytimeCloses,
        prevCycleAttachmentMode
      });
      showToast('✓ Default cash close schedules and parameters updated successfully.', 'success');
      onClose();
    } catch {
      showToast('Failed to update cash close settings.', 'error');
    }
  };

  const handleUpdateAgentSchedule = async (agentId: string, updates: Partial<AgentCashCloseSchedule>) => {
    try {
      await updateAgentCashCloseSchedule(agentId, updates);
      showToast('✓ Agent cash close parameters updated.', 'success');
    } catch {
      showToast('Failed to update agent schedule.', 'error');
    }
  };

  const handleExecuteCashCloseRequest = async () => {
    if (!requestTargetAgent) return;
    setIsSubmittingRequest(true);
    try {
      const amount = parseFloat(requestAmountStr);
      await requestAgentCashClose(
        requestTargetAgent.uid,
        !isNaN(amount) && amount > 0 ? amount : undefined,
        requestNotes
      );
      setRequestTargetAgent(null);
      setRequestAmountStr('');
      setRequestNotes('Monthly sales cycle reconciliation');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const filteredAgents = aggregate.agentMetrics.filter(m =>
    m.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.agentLocation && m.agentLocation.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div
      id="admin-cash-close-settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
    >
      <div
        className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className={`p-4 sm:p-6 border-b flex items-center justify-between gap-4 ${
          theme === 'light' ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-display tracking-tight">
                  Sales Cycle & Cash Close Management
                </h2>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase">
                  {currentCycleLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Set monthly cash close timings, minimum thresholds, commission matches & agent requests
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aggregate Stats Cards */}
        <div className="p-4 sm:p-6 border-b border-slate-150 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className={`p-3 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Total Cash Collected</span>
            <span className="text-base sm:text-lg font-black font-display text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              ${(aggregate.totalCashCollected || 0).toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Current Month Cycle</span>
          </div>

          <div className={`p-3 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Closed Cash</span>
            <span className="text-base sm:text-lg font-black font-display text-sky-600 dark:text-sky-400 mt-0.5 block">
              ${(aggregate.totalClosedCash || 0).toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Reconciled / Confirmed</span>
          </div>

          <div className={`p-3 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Remaining Cash</span>
            <span className="text-base sm:text-lg font-black font-display text-amber-600 dark:text-amber-400 mt-0.5 block">
              ${(aggregate.totalRemainingCash || 0).toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Carried Over to New Cycle</span>
          </div>

          <div className={`p-3 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Total Commission</span>
            <span className="text-base sm:text-lg font-black font-display text-purple-600 dark:text-purple-400 mt-0.5 block">
              ${(aggregate.totalCommissionEarned || 0).toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Earned by Agents</span>
          </div>

          <div className={`p-3 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Closed Commission</span>
            <span className="text-base sm:text-lg font-black font-display text-indigo-600 dark:text-indigo-400 mt-0.5 block">
              ${(aggregate.totalClosedCommission || 0).toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Matched to Closed Cash</span>
          </div>

          <div className={`p-3 rounded-2xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Remaining Commission</span>
            <span className="text-base sm:text-lg font-black font-display text-rose-600 dark:text-rose-400 mt-0.5 block">
              ${(aggregate.totalRemainingCommission || 0).toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Equivalent Carried Over</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-150 dark:border-slate-800/80 px-4 sm:px-6 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`py-3 text-xs font-bold font-mono transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'agents'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Agent Schedules & Cash Close Requests ({agents.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('defaults')}
            className={`py-3 text-xs font-bold font-mono transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'defaults'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Workspace Default Cycle Settings</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === 'defaults' && (
            <div className="max-w-2xl space-y-5">
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 text-xs space-y-1.5 font-mono">
                <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-300">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Monthly Sales Cycle & Cash Close Rules</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Sales cycles run for one calendar month. Towards the end of the month, agents complete their final cash close so a fresh cycle begins on the new month. Remaining cash and equivalent commission carry over automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">
                    Permissible Window (Days before month end)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={defaultAllowedDays}
                      onChange={(e) => setDefaultAllowedDays(parseInt(e.target.value) || 2)}
                      disabled={allowAnytimeCloses}
                      className={`w-full p-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        allowAnytimeCloses
                          ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800'
                          : theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">days</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    {allowAnytimeCloses ? 'Window disabled because Anytime Closes is enabled below.' : `Agents can close starting ${defaultAllowedDays} days before month-end (${daysUntilEnd} days remaining).`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">
                    Max Permitted Closes per Cycle
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={maxClosesPerCycle === null ? 'unlimited' : String(maxClosesPerCycle)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'unlimited') {
                          setMaxClosesPerCycle(null);
                        } else {
                          setMaxClosesPerCycle(parseInt(val, 10) || 1);
                        }
                      }}
                      className={`w-full p-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    >
                      <option value="unlimited">Unlimited Closes per Cycle</option>
                      <option value="1">1 Close per Cycle (Strict single close)</option>
                      <option value="2">2 Closes per Cycle (Bi-weekly)</option>
                      <option value="3">3 Closes per Cycle</option>
                      <option value="4">4 Closes per Cycle (Weekly)</option>
                      <option value="5">5 Closes per Cycle</option>
                      <option value="10">10 Closes per Cycle</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    Controls how many cash closes an agent can execute within one sales cycle.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">
                    Minimum Cash Close Amount ($ USD)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={defaultMinAmount}
                      onChange={(e) => setDefaultMinAmount(parseFloat(e.target.value) || 0)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">USD</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    Minimum threshold required when an agent submits a cash close.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">
                    Default Agent Commission Rate (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="50"
                      value={defaultCommissionRate}
                      onChange={(e) => setDefaultCommissionRate(parseFloat(e.target.value) || 10)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    Base commission earned on voucher and legacy device sales.
                  </p>
                </div>

                <div className="sm:col-span-2 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                  <div className="text-xs font-bold font-mono uppercase text-slate-400">
                    Cycle Timing & Attachment Rules
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs font-mono p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900/60 transition">
                      <input
                        type="checkbox"
                        checked={allowAnytimeCloses}
                        onChange={(e) => setAllowAnytimeCloses(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0 w-4 h-4 mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">Allow Anytime Cash Closes</span>
                        <span className="text-[10px] text-slate-400 leading-tight block">
                          Removes strict end-of-month restriction so agents can cash close at any time during the cycle.
                        </span>
                      </div>
                    </label>

                    <div>
                      <label className="block text-[11px] font-bold font-mono uppercase text-slate-400 mb-1">
                        Previous Cycle Debt Attachment
                      </label>
                      <select
                        value={prevCycleAttachmentMode}
                        onChange={(e) => setPrevCycleAttachmentMode(e.target.value as 'optional' | 'mandatory')}
                        className={`w-full p-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      >
                        <option value="optional">Optional Attachment (Agent Chooses)</option>
                        <option value="mandatory">Mandatory Attachment (Enforce Debt Remittance)</option>
                      </select>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">
                        {prevCycleAttachmentMode === 'mandatory'
                          ? 'Agents with previous cycle unclosed cash MUST attach it to complete their cash close.'
                          : 'Agents can voluntarily decide whether to include unclosed cash from previous cycle.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={remindFinalDay}
                        onChange={(e) => setRemindFinalDay(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0 w-4 h-4"
                      />
                      <span>Remind agents on final day of cycle</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={autoCarryover}
                        onChange={(e) => setAutoCarryover(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0 w-4 h-4"
                      />
                      <span>Auto-carryover unclosed cash & commission</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  id="btn-save-cash-close-defaults"
                  onClick={handleSaveDefaults}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold font-mono text-xs transition cursor-pointer shadow-xs flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Save Default Cycle Settings</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-4">
              {/* Search & Notice Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Filter agents by name or territory..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full sm:max-w-xs px-3.5 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />

                <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Cycle ends in <strong>{daysUntilEnd} day(s)</strong></span>
                </div>
              </div>

              {/* Agents Table */}
              <div className={`border rounded-2xl overflow-hidden overflow-x-auto ${
                theme === 'light' ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-950/40'
              }`}>
                <table className="w-full text-left border-collapse table-auto text-xs">
                  <thead>
                    <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${
                      theme === 'light' ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}>
                      <th className="py-2.5 px-3">Field Agent</th>
                      <th className="py-2.5 px-3">Cash Collected</th>
                      <th className="py-2.5 px-3">Commission Earned</th>
                      <th className="py-2.5 px-3">Closed Cash & Comm.</th>
                      <th className="py-2.5 px-3">Remaining Carryover</th>
                      <th className="py-2.5 px-3">Custom Schedule</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme === 'light' ? 'divide-slate-100' : 'divide-slate-800/60'}`}>
                    {filteredAgents.map(metric => {
                      const userObj = agents.find(a => a.uid === metric.agentId);
                      const override = effectiveSettings.agentOverrides?.[metric.agentId];

                      return (
                        <tr
                          key={metric.agentId}
                          className={`transition ${
                            theme === 'light' ? 'hover:bg-slate-50/80' : 'hover:bg-slate-900/40'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{metric.agentName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {metric.agentLocation || 'General Territory'}
                            </div>
                            {metric.hasAdminRequest && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded mt-0.5 animate-pulse">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Cash Close Requested</span>
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            <div className="font-bold text-emerald-600 dark:text-emerald-400">
                              ${(metric.cashCollected || 0).toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400">Total Sales</div>
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            <div className="font-bold text-purple-600 dark:text-purple-400">
                              ${(metric.commissionEarned || 0).toFixed(2)}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-slate-400">Rate:</span>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                step="0.5"
                                value={override?.commissionRate ?? metric.commissionRate}
                                onChange={(e) => {
                                  handleUpdateAgentSchedule(metric.agentId, {
                                    commissionRate: parseFloat(e.target.value) || 10
                                  });
                                }}
                                className={`w-12 px-1 py-0.5 rounded border text-[10px] font-mono text-center focus:outline-none ${
                                  theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                                }`}
                                title="Adjust this agent's specific commission percentage"
                              />
                              <span className="text-[10px] text-slate-400">%</span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            <div className="font-bold text-sky-600 dark:text-sky-400">
                              ${(metric.closedCash || 0).toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              Comm: ${(metric.closedCommission || 0).toFixed(2)}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            <div className="font-bold text-amber-600 dark:text-amber-400">
                              ${(metric.remainingCash || 0).toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              Comm: ${(metric.remainingCommission || 0).toFixed(2)}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            <div className="flex flex-col gap-1">
                              <select
                                value={override?.customSchedule || 'end_of_month'}
                                onChange={(e) => {
                                  handleUpdateAgentSchedule(metric.agentId, {
                                    customSchedule: e.target.value as any
                                  });
                                }}
                                className={`text-[10px] rounded px-1.5 py-0.5 border focus:outline-none ${
                                  theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                                }`}
                              >
                                <option value="end_of_month">Flexible / Anytime (Default)</option>
                                <option value="anytime">Anytime Permitted</option>
                                <option value="custom_day">Specific Day of Month</option>
                              </select>

                              <div className="flex items-center gap-1 text-[9px] text-slate-400">
                                <span>Min: $</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="5"
                                  value={override?.minCashCloseAmount ?? metric.minCashCloseAmount}
                                  onChange={(e) => {
                                    handleUpdateAgentSchedule(metric.agentId, {
                                      minCashCloseAmount: parseFloat(e.target.value) || 10
                                    });
                                  }}
                                  className={`w-10 px-1 py-0.5 rounded border text-[9px] font-mono text-center focus:outline-none ${
                                    theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                                  }`}
                                  title="Minimum cash close amount for this agent"
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              id={`btn-request-cash-close-${metric.agentId}`}
                              onClick={() => {
                                if (userObj) {
                                  setRequestTargetAgent(userObj);
                                  setRequestAmountStr(metric.remainingCash > 0 ? (metric.remainingCash || 0).toFixed(2) : '');
                                  setRequestNotes('Monthly sales cycle reconciliation');
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] transition cursor-pointer flex items-center gap-1 ml-auto shadow-xs ${
                                metric.hasAdminRequest
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                              title="Request cash close from this agent"
                            >
                              <Send className="w-3 h-3" />
                              <span>{metric.hasAdminRequest ? 'Requested (Re-Send)' : 'Request Close'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredAgents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-xs text-slate-400 font-mono">
                          No field agents found matching search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between text-xs font-mono ${
          theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/60 border-slate-800 text-slate-400'
        }`}>
          <span>WiVoTe Sales Cycle Engine &bull; Automated Commission Reconciliation</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer font-bold"
          >
            Close
          </button>
        </div>
      </div>

      {/* Inline Request Cash Close Prompt Modal */}
      {requestTargetAgent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-500 font-bold font-display text-sm">
                <Send className="w-4 h-4" />
                <span>Request Cash Close from Agent</span>
              </div>
              <button
                type="button"
                onClick={() => setRequestTargetAgent(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1 font-mono text-xs">
              <div className="font-bold text-slate-900 dark:text-white">{requestTargetAgent.name}</div>
              <div className="text-slate-500 text-[10px]">Email: {requestTargetAgent.email}</div>
              <div className="text-slate-500 text-[10px]">Territory: {requestTargetAgent.location || 'General'}</div>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="block font-bold uppercase text-slate-400 mb-1">
                  Expected Cash Amount ($ USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00 (leave blank for full unclosed balance)"
                  value={requestAmountStr}
                  onChange={(e) => setRequestAmountStr(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-400 mb-1">
                  Admin Instruction / Note
                </label>
                <input
                  type="text"
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g. End of month sales close reconciliation"
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRequestTargetAgent(null)}
                className="px-4 py-2 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-admin-request-cash-close"
                disabled={isSubmittingRequest}
                onClick={handleExecuteCashCloseRequest}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmittingRequest ? 'Dispatching...' : 'Dispatch Request to Agent'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
