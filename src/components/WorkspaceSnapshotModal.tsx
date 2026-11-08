import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Download, Upload, Database, X, CheckCircle2, AlertCircle, FileJson, Shield, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WorkspaceSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkspaceSnapshotModal: React.FC<WorkspaceSnapshotModalProps> = ({ isOpen, onClose }) => {
  const {
    activeWorkspace,
    currentUser,
    vouchers,
    customers,
    legacyDevices,
    theme,
    isPushingToDb,
    pendingMutationsCount,
    forcePushLocalToGlobalDB,
    downloadWorkspaceSnapshot,
    restoreWorkspaceSnapshot,
    showToast
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [previewMeta, setPreviewMeta] = useState<any>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetWsId = currentUser?.workspaceId || activeWorkspace?.id || 'ws_vakzim';
  const wsVouchers = (vouchers || []).filter(v => v.workspaceId === targetWsId || !v.workspaceId);
  const wsCustomers = (customers || []).filter(c => c.workspaceId === targetWsId || !c.workspaceId);
  const wsLegacy = (legacyDevices || []).filter(l => l.workspaceId === targetWsId || !l.workspaceId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setErrorMsg("Invalid file type. Please select a .json workspace snapshot file.");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setFileContent(text);
        const parsed = JSON.parse(text);
        if (parsed.metadata || parsed.workspace || parsed.vouchers) {
          setPreviewMeta({
            workspaceName: parsed.metadata?.workspaceName || parsed.workspace?.name || 'Workspace',
            exportDate: parsed.metadata?.exportDate ? new Date(parsed.metadata.exportDate).toLocaleString() : 'Unknown date',
            exportedBy: parsed.metadata?.exportedByEmail || parsed.metadata?.exportedByName || 'User',
            vouchersCount: Array.isArray(parsed.vouchers) ? parsed.vouchers.length : 0,
            customersCount: Array.isArray(parsed.customers) ? parsed.customers.length : 0,
            devicesCount: Array.isArray(parsed.legacyDevices) ? parsed.legacyDevices.length : 0,
            usersCount: Array.isArray(parsed.users) ? parsed.users.length : 0
          });
        } else {
          setErrorMsg("File does not appear to be a valid WiVoTe workspace snapshot.");
        }
      } catch (err: any) {
        setErrorMsg("Failed to parse JSON file: " + (err.message || "Invalid JSON formatting"));
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!fileContent) {
      setErrorMsg("Please select a valid .json snapshot file first.");
      return;
    }

    const confirmMsg = `Restoring this snapshot will merge/restore ${previewMeta?.vouchersCount || 0} vouchers, ${previewMeta?.customersCount || 0} customers, and ${previewMeta?.devicesCount || 0} legacy devices into your workspace. Proceed?`;
    if (!window.confirm(confirmMsg)) return;

    setIsRestoring(true);
    setErrorMsg(null);

    try {
      const res = await restoreWorkspaceSnapshot(fileContent);
      if (res.success) {
        showToast("✓ Workspace successfully restored from snapshot!", "success");
        setSelectedFile(null);
        setFileContent('');
        setPreviewMeta(null);
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to restore workspace snapshot.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during restoration.");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className={`w-full max-w-xl border rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden my-8 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4 mb-6 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl border transition duration-300 ${
                isPushingToDb
                  ? 'bg-rose-500/20 text-rose-500 border-rose-500/40 animate-pulse'
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              }`}>
                {isPushingToDb ? (
                  <div className="relative">
                    <Database className="w-6 h-6 animate-spin" />
                    <Upload className="w-3.5 h-3.5 absolute -top-2 -right-2 text-rose-500 animate-bounce" />
                  </div>
                ) : (
                  <Database className="w-6 h-6" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold font-display tracking-tight">Workspace Snapshot & Restoration</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export or restore full workspace state for {activeWorkspace?.name || 'your workspace'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Section 0: Direct Global DB Push */}
            <div className={`p-5 rounded-2xl border transition-all ${
              pendingMutationsCount > 0
                ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30'
                : theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Database className={`w-4 h-4 ${pendingMutationsCount > 0 ? 'text-amber-500 animate-bounce' : 'text-emerald-500'}`} />
                    <span>Push Local Data to Global DB</span>
                    {pendingMutationsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-mono font-bold">
                        {pendingMutationsCount} pending
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Force an immediate sync of all local offline transactions, voucher sales, cash close records, and customer updates to the cloud Firestore DB.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPushingToDb}
                  onClick={() => forcePushLocalToGlobalDB()}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold font-mono transition shadow-sm cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-95 ${
                    isPushingToDb
                      ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse'
                      : pendingMutationsCount > 0
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isPushingToDb ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : pendingMutationsCount > 0 ? (
                    <Upload className="w-4 h-4 animate-bounce" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>
                    {isPushingToDb
                      ? 'Pushing Data...'
                      : pendingMutationsCount > 0
                      ? `Push Local Data to Global DB (${pendingMutationsCount} pending)`
                      : 'Push Local Data to Global DB'}
                  </span>
                </button>
              </div>
            </div>

            {/* Section 1: Download Workspace Snapshot */}
            <div className={`p-5 rounded-2xl border ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Download className="w-4 h-4 text-emerald-500" />
                    <span>Download Current Workspace Snapshot</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Generates an offline <code className="font-mono text-indigo-500 font-bold">.json</code> snapshot containing all vouchers, customers, legacy devices, user profiles, and transaction records for this workspace.
                  </p>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-3">
                    <span>Vouchers: <strong className="text-slate-700 dark:text-slate-200">{wsVouchers.length}</strong></span>
                    <span>&bull;</span>
                    <span>Customers: <strong className="text-slate-700 dark:text-slate-200">{wsCustomers.length}</strong></span>
                    <span>&bull;</span>
                    <span>Terminals: <strong className="text-slate-700 dark:text-slate-200">{wsLegacy.length}</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    downloadWorkspaceSnapshot();
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Section 2: Restore Workspace Snapshot */}
            <div className={`p-5 rounded-2xl border ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <Upload className="w-4 h-4 text-sky-500" />
                <span>Restore Workspace from Snapshot File</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Select a previously saved <code className="font-mono text-indigo-500 font-bold">.json</code> snapshot to restore missing vouchers, customer registers, and devices.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition ${
                  selectedFile
                    ? 'border-sky-500/50 bg-sky-500/5'
                    : 'border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-500'
                }`}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
                    <FileJson className="w-5 h-5 text-sky-500" />
                    <span>{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-xs text-slate-400">
                    <FileJson className="w-6 h-6 text-slate-400 mb-1" />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Click to choose snapshot file (.json)</span>
                    <span className="text-[10px]">Supports all WiVoTe workspace snapshot formats</span>
                  </div>
                )}
              </div>

              {/* Preview details */}
              {previewMeta && (
                <div className="mt-4 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs space-y-1 font-mono">
                  <div className="font-bold text-sky-600 dark:text-sky-400">Snapshot Verified:</div>
                  <div className="text-slate-600 dark:text-slate-300">Workspace: {previewMeta.workspaceName}</div>
                  <div className="text-slate-600 dark:text-slate-300">Exported: {previewMeta.exportDate} ({previewMeta.exportedBy})</div>
                  <div className="text-slate-600 dark:text-slate-300 font-bold pt-1">
                    Payload: {previewMeta.vouchersCount} vouchers &bull; {previewMeta.customersCount} customers &bull; {previewMeta.devicesCount} devices &bull; {previewMeta.usersCount} users
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!fileContent || isRestoring}
                  onClick={handleExecuteRestore}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold font-mono bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition shadow-sm cursor-pointer flex items-center gap-2 disabled:cursor-not-allowed"
                >
                  {isRestoring ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isRestoring ? 'Restoring Snapshot...' : 'Restore Workspace Data'}</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
