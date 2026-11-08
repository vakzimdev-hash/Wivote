import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Database, 
  RotateCcw, 
  Download, 
  Upload, 
  Clock, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  HardDrive, 
  Settings, 
  Sliders, 
  Layers, 
  Users, 
  Ticket, 
  DollarSign, 
  Building, 
  Cpu, 
  X,
  Save,
  Check
} from 'lucide-react';
import { EntireAppBackupItem, AppBackupConfig } from '../types';
import { formatTimeElapsed, getSlotBadge, DEFAULT_BACKUP_CONFIG } from '../utils/intelligentBackupEngine';

export const AppOwnerBackupView: React.FC = () => {
  const {
    workspaces,
    users,
    vouchers,
    entireAppBackups,
    appBackupConfig,
    updateAppBackupConfig,
    restoreEntireAppFromBackup,
    createManualEntireAppBackup,
    exportEntireAppBackup,
    importAndRestoreEntireAppBackup,
    theme,
    showToast
  } = useApp();

  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<EntireAppBackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  // Parameter Configuration Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<AppBackupConfig>(appBackupConfig || DEFAULT_BACKUP_CONFIG);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const backups = entireAppBackups || [];

  const handleCreateManual = async () => {
    setIsCreatingManual(true);
    try {
      await createManualEntireAppBackup(manualNotes || 'Manual App Owner Milestone Snapshot');
      setManualNotes('');
      setShowManualForm(false);
    } finally {
      setIsCreatingManual(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupForRestore) return;
    setIsRestoring(true);
    try {
      const res = await restoreEntireAppFromBackup(selectedBackupForRestore);
      if (res.success) {
        setSelectedBackupForRestore(null);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        await importAndRestoreEntireAppBackup(text);
      } catch (err: any) {
        showToast(`Failed to parse backup file: ${err.message || err}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      await updateAppBackupConfig(localConfig);
      setIsConfigModalOpen(false);
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className={`p-6 rounded-2xl border shadow-sm ${
        theme === 'light' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100' : 'bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border-emerald-900/40'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-inner">
              <Database className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight">System-Wide Database Backups & Disaster Recovery</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {backups.length} / {appBackupConfig?.maxBackupSlots || 5} Intelligent Checkpoints
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Automated continuous backups capture every write across all workspaces, agents, and administrators. The intelligent algorithm guarantees time diversity between slots to maximize restoration fidelity.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setLocalConfig(appBackupConfig || DEFAULT_BACKUP_CONFIG);
                setIsConfigModalOpen(true);
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Settings className="w-4 h-4 text-emerald-400" />
              <span>Backup Parameters & Rules</span>
            </button>

            <button
              type="button"
              onClick={() => setShowManualForm(!showManualForm)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Backup Entire App Now</span>
            </button>

            <label className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer">
              <Upload className="w-4 h-4 text-sky-400" />
              <span>Import Full App (.json)</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* Live System Current Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-emerald-500/10">
          <div className="flex items-center gap-2.5">
            <Building className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400">Total Workspaces:</span>
            <span className="text-sm font-bold text-slate-200">{workspaces.length}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-slate-400">Total Users & Agents:</span>
            <span className="text-sm font-bold text-slate-200">{users.length}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Ticket className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400">Total Vouchers:</span>
            <span className="text-sm font-bold text-slate-200">{vouchers.length}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-400">Auto-Backup Status:</span>
            <span className="text-xs font-bold text-emerald-400">
              {appBackupConfig?.autoBackupOnWrite ? 'Active (Every Write)' : 'Paused'}
            </span>
          </div>
        </div>
      </div>

      {/* Manual snapshot form */}
      {showManualForm && (
        <div className={`p-4 rounded-xl border ${theme === 'light' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-900/40'}`}>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Milestone note (e.g. End-of-week platform snapshot or before migration)..."
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              className={`flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-hidden focus:ring-1 focus:ring-emerald-500 ${
                theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-100'
              }`}
            />
            <button
              type="button"
              onClick={handleCreateManual}
              disabled={isCreatingManual}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition disabled:opacity-50 cursor-pointer"
            >
              {isCreatingManual ? 'Creating Snapshot...' : 'Save Milestone'}
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Backups List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span>Saved Time-Spaced Snapshots ({backups.length} / {appBackupConfig?.maxBackupSlots || 5})</span>
          </h3>
          <span className="text-[11px] text-slate-400">
            Strategy: <strong className="text-slate-300">{appBackupConfig?.retentionStrategy === 'fifo' ? 'FIFO' : 'Intelligent Time-Spacing (Recommended)'}</strong>
          </span>
        </div>

        {backups.length === 0 ? (
          <div className={`p-12 text-center rounded-2xl border ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
            <HardDrive className="w-12 h-12 mx-auto text-slate-500/40 mb-3" />
            <h4 className="text-base font-bold mb-1">No System Snapshots Saved Yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
              Write actions by any App Owner, Administrator, or Agent automatically register snapshots. Click below to generate your initial baseline snapshot now.
            </p>
            <button
              type="button"
              onClick={() => handleCreateManual()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md"
            >
              Create Initial Full App Baseline
            </button>
          </div>
        ) : (
          backups.map((b, idx) => {
            const badge = getSlotBadge(idx, backups.length, b.timestamp);
            const formattedDate = new Date(b.timestamp).toLocaleString();
            return (
              <div
                key={b.id}
                className={`p-5 rounded-2xl border transition ${
                  idx === 0 
                    ? 'border-emerald-500/40 bg-emerald-500/5 shadow-md' 
                    : theme === 'light' 
                    ? 'bg-white border-slate-200 hover:border-slate-300' 
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badge.colorClass}`}>
                      {badge.badge}
                    </span>
                    <span className="text-xs font-bold text-slate-100">
                      {badge.title}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {formattedDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBackupForRestore(b)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      title="Restore entire platform from this snapshot"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Entire Application</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportEntireAppBackup(b)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer border border-slate-700"
                      title="Download JSON snapshot"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Trigger & Operator Details */}
                <div className="mb-4 text-xs flex items-center gap-2 text-slate-300 flex-wrap">
                  <span className="font-semibold text-slate-400">Trigger Event:</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono text-[11px] text-emerald-400">
                    {b.triggerEvent}
                  </span>
                  {b.actor && (
                    <span className="text-[11px] text-slate-400">
                      by <strong className="text-slate-200">{b.actor.name}</strong> ({b.actor.role})
                    </span>
                  )}
                </div>

                {/* Scope breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-xs">
                    <Building className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-400">Workspaces:</span>
                    <span className="font-bold text-slate-200">{b.summary?.workspacesCount ?? b.snapshot?.workspaces?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-slate-400">Total Users:</span>
                    <span className="font-bold text-slate-200">{b.summary?.usersCount ?? b.snapshot?.users?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Ticket className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-slate-400">Total Vouchers:</span>
                    <span className="font-bold text-slate-200">{b.summary?.vouchersCount ?? b.snapshot?.vouchers?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <DollarSign className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-slate-400">Cash Drops:</span>
                    <span className="font-bold text-slate-200">{b.summary?.cashDropsCount ?? b.snapshot?.cashDrops?.length ?? 0}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal for Entire App Restore */}
      {selectedBackupForRestore && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center gap-3 mb-4 text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">Restore Entire Application?</h3>
                <p className="text-xs text-slate-400">Critical platform disaster recovery</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              You are about to restore the <strong>ENTIRE APPLICATION DATABASE</strong> to the state from <strong className="text-emerald-400">{new Date(selectedBackupForRestore.timestamp).toLocaleString()}</strong>.
              This affects all workspaces, users, vouchers, and cash drop records globally.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-400">Trigger:</span>
                <span className="font-mono text-emerald-400">{selectedBackupForRestore.triggerEvent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Workspaces to Restore:</span>
                <span className="font-bold text-slate-100">{selectedBackupForRestore.summary?.workspacesCount ?? selectedBackupForRestore.snapshot?.workspaces?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Users to Restore:</span>
                <span className="font-bold text-sky-400">{selectedBackupForRestore.summary?.usersCount ?? selectedBackupForRestore.snapshot?.users?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Vouchers to Restore:</span>
                <span className="font-bold text-amber-400">{selectedBackupForRestore.summary?.vouchersCount ?? selectedBackupForRestore.snapshot?.vouchers?.length ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedBackupForRestore(null)}
                disabled={isRestoring}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isRestoring ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Restoring Entire App Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Yes, Overwrite & Restore Entire App</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Conditions & Parameters Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-slate-100">Backup Conditions & Parameters</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Auto Backup Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                <div>
                  <span className="font-bold text-slate-100 block">Automatic Backup on Every Write</span>
                  <span className="text-[11px] text-slate-400">Trigger snapshots whenever vouchers, users, or settings change</span>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.autoBackupOnWrite}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, autoBackupOnWrite: e.target.checked }))}
                  className="w-4 h-4 rounded-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {/* Min Spacing Interval */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Minimum Write Spacing (seconds)
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Rapid writes occurring faster than this interval refresh the latest slot in place instead of creating duplicate slots.
                </p>
                <select
                  value={localConfig.minIntervalSeconds}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, minIntervalSeconds: Number(e.target.value) }))}
                  className={`w-full px-3 py-2 rounded-xl border ${
                    theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <option value={15}>15 Seconds (High granularity)</option>
                  <option value={30}>30 Seconds (Recommended default)</option>
                  <option value={60}>60 Seconds (1 minute spacing)</option>
                  <option value={120}>120 Seconds (2 minutes spacing)</option>
                  <option value={300}>300 Seconds (5 minutes spacing)</option>
                </select>
              </div>

              {/* Max Backup Slots */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Maximum Backup Slots to Retain
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Number of point-in-time recovery checkpoints kept simultaneously (default: 5).
                </p>
                <select
                  value={localConfig.maxBackupSlots}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, maxBackupSlots: Number(e.target.value) }))}
                  className={`w-full px-3 py-2 rounded-xl border ${
                    theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <option value={3}>3 Snapshots</option>
                  <option value={5}>5 Snapshots (Standard Recommended)</option>
                  <option value={7}>7 Snapshots</option>
                  <option value={10}>10 Snapshots</option>
                </select>
              </div>

              {/* Retention Strategy */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Retention & Thinning Strategy
                </label>
                <select
                  value={localConfig.retentionStrategy}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, retentionStrategy: e.target.value as any }))}
                  className={`w-full px-3 py-2 rounded-xl border ${
                    theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <option value="intelligent_spacing">Intelligent Time-Spacing (Preserves earliest anchor & distributes checkpoints)</option>
                  <option value="fifo">FIFO (Strictly drop oldest)</option>
                </select>
              </div>

              {/* Triggers */}
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700 space-y-2">
                <span className="font-bold text-slate-300 block">Active Triggers to Capture</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={localConfig.triggers.voucherSales}
                      onChange={(e) => setLocalConfig(prev => ({
                        ...prev,
                        triggers: { ...prev.triggers, voucherSales: e.target.checked }
                      }))}
                      className="rounded-sm text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Voucher Sales</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={localConfig.triggers.voucherAssignments}
                      onChange={(e) => setLocalConfig(prev => ({
                        ...prev,
                        triggers: { ...prev.triggers, voucherAssignments: e.target.checked }
                      }))}
                      className="rounded-sm text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Voucher Allocations</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={localConfig.triggers.userModifications}
                      onChange={(e) => setLocalConfig(prev => ({
                        ...prev,
                        triggers: { ...prev.triggers, userModifications: e.target.checked }
                      }))}
                      className="rounded-sm text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>User & Agent Edits</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={localConfig.triggers.cashDrops}
                      onChange={(e) => setLocalConfig(prev => ({
                        ...prev,
                        triggers: { ...prev.triggers, cashDrops: e.target.checked }
                      }))}
                      className="rounded-sm text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Cash Drops / Close</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingConfig ? 'Saving...' : 'Save Parameters'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
