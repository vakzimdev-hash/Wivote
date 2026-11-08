import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ShieldAlert, 
  RefreshCw, 
  UserX, 
  Search, 
  FileText, 
  Copy, 
  Check, 
  Eye,
  GitMerge,
  Users
} from 'lucide-react';
import { CleanupOrphanedResult, ReconcileShadowResult } from '../utils/adminCleanup';

export const OrphanCleanupView: React.FC = () => {
  const { theme, cleanupOrphanedAccounts, reconcileAndHealAccounts, showToast } = useApp();
  const [targetEmail, setTargetEmail] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupOrphanedResult | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ReconcileShadowResult | null>(null);
  const [activeTab, setActiveTab] = useState<'reconcile' | 'orphan'>('reconcile');
  const [hasCopiedLogs, setHasCopiedLogs] = useState(false);

  const handleExecuteReconcile = async (emailToTarget?: string) => {
    setIsProcessing(true);
    setReconcileResult(null);

    try {
      const email = emailToTarget !== undefined ? emailToTarget : targetEmail;
      const res = await reconcileAndHealAccounts(email || undefined, dryRun);
      setReconcileResult(res);

      if (res.success) {
        showToast(
          res.dryRun
            ? `Simulation finished: ${res.reconciledCount} accounts would be healed, ${res.reassignedVouchersCount} vouchers reassigned, ${res.purgedShadowDocsCount} shadows purged.`
            : `Reconciliation success: Healed ${res.reconciledCount} accounts, reassigned ${res.reassignedVouchersCount} vouchers, purged ${res.purgedShadowDocsCount} shadow records.`,
          'success'
        );
      } else {
        showToast(res.error || 'Failed to reconcile accounts', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error occurred during account reconciliation', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteCleanup = async (emailToTarget?: string) => {
    setIsProcessing(true);
    setCleanupResult(null);

    try {
      const email = emailToTarget !== undefined ? emailToTarget : targetEmail;
      const res = await cleanupOrphanedAccounts(email || undefined, dryRun);
      setCleanupResult(res);

      if (res.success) {
        showToast(
          res.dryRun 
            ? `Simulation finished: ${res.purgedAuthCount} Auth records and ${res.purgedDocCount} Firestore docs would be purged.`
            : `Cleanup complete: Purged ${res.purgedAuthCount} Auth records and ${res.purgedDocCount} Firestore docs.`,
          'success'
        );
      } else {
        showToast(res.error || 'Failed to complete cleanup', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error occurred during cleanup execution', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentLogs = activeTab === 'reconcile' ? reconcileResult?.details : cleanupResult?.details;

  const copyLogsToClipboard = () => {
    if (!currentLogs) return;
    navigator.clipboard.writeText(currentLogs.join('\n'));
    setHasCopiedLogs(true);
    setTimeout(() => setHasCopiedLogs(false), 2000);
    showToast('Execution log copied to clipboard', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Utility Header Banner */}
      <div className={`p-6 rounded-3xl border transition-all ${
        theme === 'light'
          ? 'bg-white border-slate-200 shadow-sm text-slate-900'
          : 'bg-slate-900 border-slate-800 text-white shadow-xl'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`p-3.5 rounded-2xl border shrink-0 ${
              theme === 'light'
                ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
            }`}>
              <GitMerge className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-display tracking-tight">
                  Account Reconciliation & Orphan Purge Engine
                </h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                  theme === 'light'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  Drastic Healing Active
                </span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed max-w-2xl ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                Cures shadow/duplicate accounts with placeholder phones (<code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-slate-100 dark:bg-slate-800 text-rose-500">+263770000000</code>), re-assigns orphaned voucher inventories, merges multiple accounts into canonical profiles, and purges obsolete Firestore & Auth records.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono cursor-pointer select-none transition ${
              dryRun 
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                : theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-slate-600 text-sky-500 focus:ring-sky-500"
              />
              <Eye className="w-3.5 h-3.5" />
              <span>Dry Run Mode (Simulate)</span>
            </label>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('reconcile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 ${
              activeTab === 'reconcile'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : theme === 'light'
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Shadow Account Healing & Deduplication</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orphan')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 ${
              activeTab === 'orphan'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : theme === 'light'
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Orphan Auth & Collisions Purge</span>
          </button>
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Actions */}
        <div className="lg:col-span-6 space-y-6">
          {activeTab === 'reconcile' ? (
            <>
              {/* Targeted Reconcile Box */}
              <div className={`p-6 rounded-2xl border space-y-4 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/90 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono">
                    Targeted Shadow Account Reconcile
                  </h4>
                </div>
                <p className={`text-xs leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Specify an email (e.g. agent or admin) currently logging in as a shadow account with zero transactions. This merges the shadow with the real account, restores their phone number and picture, re-assigns all their vouchers, and purges the duplicate shadow record.
                </p>

                <div className="space-y-2">
                  <label className="block text-[11px] font-mono uppercase text-slate-400">
                    Target User Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      placeholder="e.g. agent@example.com"
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none transition ${
                        theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
                          : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                      }`}
                    />
                    {targetEmail && (
                      <button
                        type="button"
                        onClick={() => setTargetEmail('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 text-xs font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!targetEmail.trim() || isProcessing}
                  onClick={() => handleExecuteReconcile(targetEmail.trim())}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                    !targetEmail.trim() || isProcessing
                      ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-95 shadow-md shadow-indigo-600/20'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Healing & Reconciling...</span>
                    </>
                  ) : (
                    <>
                      <GitMerge className="w-4 h-4" />
                      <span>{dryRun ? 'Simulate Reconcile' : 'Reconcile & Heal Account'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* System-Wide Reconcile Box */}
              <div className={`p-6 rounded-2xl border space-y-4 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/90 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono">
                    System-Wide Deduplication & Shadow Purge
                  </h4>
                </div>
                <p className={`text-xs leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Scans all users across all workspaces. Identifies any email with duplicate or triplicate profiles, consolidates their transaction history and vouchers under their active account, and permanently deletes all shadow documents.
                </p>

                <div className={`p-3 rounded-xl border text-[11px] font-mono flex items-start gap-2.5 ${
                  theme === 'light'
                    ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800'
                    : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                }`}>
                  <ShieldAlert className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                  <span>
                    Zero Data Loss Guarantee: Real profile details, cell numbers, and vouchers are strictly preserved. Only synthetic placeholder records are deleted.
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleExecuteReconcile('')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                    isProcessing
                      ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-95 shadow-md shadow-emerald-600/10'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Scanning & Reconciling All Users...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>{dryRun ? 'Simulate System-Wide Healing' : 'Run System-Wide Healing & Purge'}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Targeted Cleanup Box */}
              <div className={`p-6 rounded-2xl border space-y-4 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/90 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-sky-400" />
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono">
                    Targeted Account Cleanup
                  </h4>
                </div>
                <p className={`text-xs leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Clean up a specific email address that is suffering from an <span className="font-mono text-rose-400">email-already-in-use</span> error when trying to recreate a deleted workspace or agent.
                </p>

                <div className="space-y-2">
                  <label className="block text-[11px] font-mono uppercase text-slate-400">
                    Target Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      placeholder="e.g. user@example.com"
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none transition ${
                        theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-rose-500'
                          : 'bg-slate-950 border-slate-800 text-white focus:border-rose-500'
                      }`}
                    />
                    {targetEmail && (
                      <button
                        type="button"
                        onClick={() => setTargetEmail('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 text-xs font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!targetEmail.trim() || isProcessing}
                  onClick={() => handleExecuteCleanup(targetEmail.trim())}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                    !targetEmail.trim() || isProcessing
                      ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-gradient-to-r from-rose-600 to-orange-600 text-white hover:opacity-95 shadow-md shadow-rose-600/10'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing Cleanup...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>{dryRun ? 'Simulate Targeted Cleanup' : 'Purge Targeted Orphan Account'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* System-Wide Audit Box */}
              <div className={`p-6 rounded-2xl border space-y-4 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/90 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono">
                    System-Wide Scan & Purge
                  </h4>
                </div>
                <p className={`text-xs leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Scans all Firebase Auth users and Firestore root <code className="font-mono text-emerald-400">/users</code> documents against active workspaces. Any orphaned accounts belonging to deleted workspaces or deleted agents are safely cleaned up.
                </p>

                <div className={`p-3 rounded-xl border text-[11px] font-mono flex items-start gap-2.5 ${
                  theme === 'light'
                    ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800'
                    : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                }`}>
                  <ShieldAlert className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                  <span>
                    Protected Safeguard: Primary App Owner (<code className="underline font-bold">karimazondomike049@gmail.com</code>) and active workspace masters/agents are strictly protected and never touched.
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleExecuteCleanup('')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                    isProcessing
                      ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-95 shadow-md shadow-emerald-600/10'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Scanning Database & Auth Records...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>{dryRun ? 'Simulate System-Wide Audit' : 'Run System-Wide Audit & Cleanup'}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Execution Metrics & Detailed Action Log */}
        <div className="lg:col-span-6 space-y-6">
          <div className={`p-6 rounded-2xl border space-y-4 h-full flex flex-col justify-between ${
            theme === 'light'
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono">
                    {activeTab === 'reconcile' ? 'Reconciliation Execution Summary' : 'Orphan Audit Execution Summary'}
                  </h4>
                </div>
                {currentLogs && currentLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={copyLogsToClipboard}
                    className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/80 transition cursor-pointer"
                  >
                    {hasCopiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedLogs ? 'Copied' : 'Copy Log'}</span>
                  </button>
                )}
              </div>

              {activeTab === 'reconcile' && reconcileResult ? (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    reconcileResult.success
                      ? theme === 'light'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                        : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-300'
                      : theme === 'light'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                  }`}>
                    {reconcileResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-bold text-xs font-mono">
                        {reconcileResult.dryRun ? '[SIMULATION]' : '[COMPLETED]'} {reconcileResult.message}
                      </p>
                      {reconcileResult.email && (
                        <p className="text-[11px] font-mono opacity-80">
                          Target Account: {reconcileResult.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Metrics Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`p-3.5 rounded-xl border ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">
                        Accounts Healed
                      </span>
                      <span className="text-xl font-bold font-mono text-indigo-500">
                        {reconcileResult.reconciledCount}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded-xl border ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">
                        Vouchers Reassigned
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-500">
                        {reconcileResult.reassignedVouchersCount}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded-xl border ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">
                        Shadows Purged
                      </span>
                      <span className="text-xl font-bold font-mono text-amber-500">
                        {reconcileResult.purgedShadowDocsCount}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Log Terminal */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Action Log ({reconcileResult.details.length} entries)
                    </span>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-56 overflow-y-auto space-y-1.5 scrollbar-thin">
                      {reconcileResult.details.length > 0 ? (
                        reconcileResult.details.map((line, idx) => (
                          <div key={idx} className="leading-snug text-slate-400 hover:text-slate-200">
                            <span className="text-indigo-400 select-none mr-1.5">&gt;</span>
                            {line}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 italic">No actions were needed — accounts are fully canonical.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeTab === 'orphan' && cleanupResult ? (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    cleanupResult.success
                      ? theme === 'light'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : theme === 'light'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                  }`}>
                    {cleanupResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-bold text-xs font-mono">
                        {cleanupResult.dryRun ? '[SIMULATION]' : '[COMPLETED]'} {cleanupResult.message}
                      </p>
                      {cleanupResult.email && (
                        <p className="text-[11px] font-mono opacity-80">
                          Target Account: {cleanupResult.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Metrics Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3.5 rounded-xl border ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">
                        Auth Records Purged
                      </span>
                      <span className="text-xl font-bold font-mono text-rose-500">
                        {cleanupResult.purgedAuthCount}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded-xl border ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">
                        Firestore Docs Purged
                      </span>
                      <span className="text-xl font-bold font-mono text-amber-500">
                        {cleanupResult.purgedDocCount}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Log Terminal */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Action Log ({cleanupResult.details.length} entries)
                    </span>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-56 overflow-y-auto space-y-1.5 scrollbar-thin">
                      {cleanupResult.details.length > 0 ? (
                        cleanupResult.details.map((line, idx) => (
                          <div key={idx} className="leading-snug text-slate-400 hover:text-slate-200">
                            <span className="text-sky-500 select-none mr-1.5">&gt;</span>
                            {line}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 italic">No actions were needed — all accounts are synchronized.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`p-8 rounded-xl border border-dashed flex flex-col items-center justify-center text-center space-y-2 ${
                  theme === 'light' ? 'border-slate-200 text-slate-400' : 'border-slate-800 text-slate-500'
                }`}>
                  <FileText className="w-8 h-8 stroke-1" />
                  <p className="text-xs font-mono">No operation has been run in this session.</p>
                  <p className="text-[11px] font-mono text-slate-500">
                    {activeTab === 'reconcile' 
                      ? 'Select an option to reconcile shadow accounts and consolidate user histories.' 
                      : 'Use Targeted Cleanup or System-Wide Audit to inspect and clean up orphan records.'}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800/40 text-[11px] font-mono text-slate-500 flex items-center justify-between">
              <span>Shadow Healing Engine v2.5</span>
              <span>Firebase Admin SDK + Firestore</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
