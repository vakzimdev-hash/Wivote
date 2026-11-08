import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Database, 
  X, 
  RotateCcw, 
  Download, 
  Upload, 
  Clock, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  HardDrive, 
  FileText,
  User,
  Ticket,
  DollarSign,
  Layers,
  ArrowRight
} from 'lucide-react';
import { WorkspaceBackupItem } from '../types';
import { formatTimeElapsed, getSlotBadge } from '../utils/intelligentBackupEngine';

interface AdminWorkspaceBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminWorkspaceBackupModal: React.FC<AdminWorkspaceBackupModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    activeWorkspace,
    workspaceBackups,
    restoreWorkspaceFromBackup,
    createManualWorkspaceBackup,
    exportWorkspaceBackup,
    importAndRestoreWorkspaceBackup,
    theme,
    showToast
  } = useApp();

  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<WorkspaceBackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  if (!isOpen) return null;

  const backups = workspaceBackups || [];

  const handleCreateManual = async () => {
    setIsCreatingManual(true);
    try {
      await createManualWorkspaceBackup(manualNotes || 'Manual Admin Milestone Snapshot');
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
      const res = await restoreWorkspaceFromBackup(selectedBackupForRestore);
      if (res.success) {
        setSelectedBackupForRestore(null);
        onClose();
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
        await importAndRestoreWorkspaceBackup(text);
        onClose();
      } catch (err: any) {
        showToast(`Failed to parse backup file: ${err.message || err}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className={`relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${
        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Workspace Database Backups</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {backups.length} / 5 Time-Spaced Snapshots
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Auto-saved on every write by Admin or Agents for <strong className="text-slate-200">{activeWorkspace?.name || 'Current Workspace'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
          theme === 'light' ? 'bg-white border-slate-100' : 'bg-slate-900/50 border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManualForm(!showManualForm)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Snapshot Workspace Now</span>
            </button>

            <label className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-slate-600">
              <Upload className="w-3.5 h-3.5" />
              <span>Import & Restore (.json)</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Intelligent algorithm spaces 5 checkpoints across recent & historical changes</span>
          </div>
        </div>

        {/* Manual form dropdown */}
        {showManualForm && (
          <div className={`px-6 py-3 border-b ${theme === 'light' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-emerald-950/20 border-emerald-900/40'}`}>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Optional snapshot note (e.g. Before bulk sales or monthly close)..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg border focus:outline-hidden focus:ring-1 focus:ring-emerald-500 ${
                  theme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-100'
                }`}
              />
              <button
                type="button"
                onClick={handleCreateManual}
                disabled={isCreatingManual}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                {isCreatingManual ? 'Saving...' : 'Save Snapshot'}
              </button>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Backups List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {backups.length === 0 ? (
            <div className="text-center py-12">
              <HardDrive className="w-12 h-12 mx-auto text-slate-500/40 mb-3" />
              <h3 className="text-sm font-semibold mb-1">No Workspace Backups Recorded Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                The automatic engine creates a backup on every write (vouchers sold, created, cash drops, user modifications). You can also create an instant manual snapshot.
              </p>
              <button
                type="button"
                onClick={() => handleCreateManual()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Create Initial Baseline Backup
              </button>
            </div>
          ) : (
            backups.map((b, idx) => {
              const badge = getSlotBadge(idx, backups.length, b.timestamp);
              const formattedDate = new Date(b.timestamp).toLocaleString();
              return (
                <div
                  key={b.id}
                  className={`p-4 rounded-xl border transition ${
                    idx === 0 
                      ? 'border-emerald-500/40 bg-emerald-500/5 shadow-xs' 
                      : theme === 'light' 
                      ? 'bg-slate-50 border-slate-200 hover:border-slate-300' 
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badge.colorClass}`}>
                        {badge.badge}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {badge.title}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {formattedDate}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBackupForRestore(b)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        title="Restore entire workspace from this snapshot"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore Entire Workspace</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportWorkspaceBackup(b)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-xl transition cursor-pointer"
                        title="Download JSON file for this snapshot"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Trigger & Actor */}
                  <div className="mb-3 text-xs flex items-center gap-2 text-slate-300">
                    <span className="font-semibold text-slate-400">Trigger Event:</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono text-[11px]">
                      {b.triggerEvent}
                    </span>
                    {b.actor && (
                      <span className="text-[11px] text-slate-400">
                        by <strong className="text-slate-300">{b.actor.name}</strong> ({b.actor.role})
                      </span>
                    )}
                  </div>

                  {/* Metrics summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center gap-2 text-xs">
                      <Ticket className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-400">Vouchers:</span>
                      <span className="font-bold text-slate-200">{b.summary?.vouchersCount ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <User className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-slate-400">Agents & Users:</span>
                      <span className="font-bold text-slate-200">{b.summary?.usersCount ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-slate-400">Cash Drops:</span>
                      <span className="font-bold text-slate-200">{b.summary?.cashDropsCount ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-slate-400">Legacy Devices:</span>
                      <span className="font-bold text-slate-200">{b.summary?.legacyDevicesCount ?? 0}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-between text-xs text-slate-400 ${
          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
        }`}>
          <div>
            Retaining up to <strong>5 time-spaced snapshots</strong>. Oldest acts as stable baseline anchor.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {selectedBackupForRestore && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center gap-3 mb-4 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">Restore Entire Workspace?</h3>
                <p className="text-xs text-slate-400">Point-in-time recovery confirmation</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              This will overwrite the current live database for <strong className="text-white">{activeWorkspace?.name}</strong> with the snapshot from <strong className="text-emerald-400">{new Date(selectedBackupForRestore.timestamp).toLocaleString()}</strong>.
            </p>

            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs space-y-1.5 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-400">Trigger:</span>
                <span className="font-mono text-slate-200">{selectedBackupForRestore.triggerEvent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vouchers to Restore:</span>
                <span className="font-bold text-amber-400">{selectedBackupForRestore.summary?.vouchersCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Users/Agents to Restore:</span>
                <span className="font-bold text-sky-400">{selectedBackupForRestore.summary?.usersCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cash Drops to Restore:</span>
                <span className="font-bold text-emerald-400">{selectedBackupForRestore.summary?.cashDropsCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Customers to Restore:</span>
                <span className="font-bold text-teal-400">{selectedBackupForRestore.summary?.customersCount ?? selectedBackupForRestore.snapshot?.customers?.length ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedBackupForRestore(null)}
                disabled={isRestoring}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isRestoring ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring Workspace...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Restore Workspace</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
