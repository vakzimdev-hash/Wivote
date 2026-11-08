import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AccountDbSnapshot, RecycleBinItem, AccountBackupItem, UserProfile } from '../types';
import { 
  Trash2, 
  RotateCcw, 
  Download, 
  Mail, 
  Send, 
  FileJson, 
  UserCheck, 
  HardDrive, 
  Clock, 
  Search, 
  Users, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Settings, 
  Inbox, 
  Check, 
  HelpCircle,
  Database,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  Filter
} from 'lucide-react';

interface RecycleBinManagerProps {
  workspaceId?: string;
  isAppOwnerView?: boolean;
}

export const RecycleBinManager: React.FC<RecycleBinManagerProps> = ({
  workspaceId,
  isAppOwnerView = false
}) => {
  const {
    theme,
    currentUser,
    activeWorkspace,
    workspaces,
    users,
    recycleBin,
    accountBackups,
    configuredBackupEmail,
    setConfiguredBackupEmail,
    restoreAccountFromSnapshot,
    deletePermanentlyFromBin,
    createAccountBackup,
    deleteAccountBackup,
    emailDbFile,
    sendAllBinContentsByEmail,
    showToast,
    fullDatabaseBackups = [],
    backupInterval = 30,
    setBackupInterval,
    createFullDatabaseBackup,
    deleteFullDatabaseBackup,
    restoreFullDatabaseBackup
  } = useApp();

  // Sub-tabs: 'bin' (Deleted Accounts) vs 'live-backups' (Accounts in Use & Saved Snapshots) vs 'full-backups' (Automatic Database Backups)
  const [activeSubTab, setActiveSubTab] = useState<'bin' | 'live-backups' | 'full-backups'>('bin');

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<'all' | 'Agent' | 'WorkspaceMaster' | 'Admin'>('all');

  // Email sending modal state
  const [emailModalItem, setEmailModalItem] = useState<{
    type: 'single-bin' | 'single-backup' | 'all-bin';
    item?: RecycleBinItem | AccountBackupItem;
    snapshot?: AccountDbSnapshot;
    title: string;
  } | null>(null);

  const [recipientEmailInput, setRecipientEmailInput] = useState(configuredBackupEmail || currentUser?.email || '');
  const [emailNotesInput, setEmailNotesInput] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Email configuration input
  const [emailConfigInput, setEmailConfigInput] = useState(configuredBackupEmail || '');
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);

  // Live backup modal state
  const [backupModalUser, setBackupModalUser] = useState<UserProfile | null>(null);
  const [backupReasonInput, setBackupReasonInput] = useState('Routine preventive backup');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Deletion / Restoration confirmation states
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [permanentDeletingItemId, setPermanentDeletingItemId] = useState<string | null>(null);

  // Determine active target workspace id
  const targetWsId = workspaceId || activeWorkspace?.id;

  // Filter recycle bin items
  const filteredBin = recycleBin.filter(item => {
    // If not app owner view or specific workspace requested, filter by workspace
    if (targetWsId && !isAppOwnerView) {
      if (item.workspaceId && item.workspaceId !== targetWsId) return false;
    }
    if (selectedRoleFilter !== 'all' && item.accountRole !== selectedRoleFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.accountName?.toLowerCase().includes(q);
      const matchEmail = item.accountEmail?.toLowerCase().includes(q);
      const matchRole = item.accountRole?.toLowerCase().includes(q);
      const matchWs = item.workspaceName?.toLowerCase().includes(q);
      return matchName || matchEmail || matchRole || matchWs;
    }
    return true;
  });

  // Filter live backups
  const filteredBackups = accountBackups.filter(item => {
    if (targetWsId && !isAppOwnerView) {
      if (item.workspaceId && item.workspaceId !== targetWsId) return false;
    }
    if (selectedRoleFilter !== 'all' && item.accountRole !== selectedRoleFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.accountName?.toLowerCase().includes(q);
      const matchEmail = item.accountEmail?.toLowerCase().includes(q);
      const matchRole = item.accountRole?.toLowerCase().includes(q);
      const matchReason = item.reason?.toLowerCase().includes(q);
      return matchName || matchEmail || matchRole || matchReason;
    }
    return true;
  });

  // Active accounts eligible for backup (accounts in use)
  const activeInUseAccounts = users.filter(u => {
    if (targetWsId && !isAppOwnerView) {
      if (u.workspaceId !== targetWsId) return false;
    }
    if (selectedRoleFilter !== 'all' && u.role !== selectedRoleFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Download DB file as JSON
  const handleDownloadSnapshot = (snapshot: AccountDbSnapshot, accountName: string) => {
    try {
      const filename = `wivote_account_db_${(accountName || 'user').toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.json`;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast(`Database file downloaded for ${accountName}`, 'success');
    } catch (e: any) {
      showToast(`Download failed: ${e?.message || 'Unknown error'}`, 'error');
    }
  };

  // Download full database backup as JSON
  const handleDownloadFullBackup = (backupItem: any) => {
    try {
      const filename = `wivote_full_db_backup_${backupItem.triggerType}_${Date.now()}.json`;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupItem, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast(`✓ Database backup download started!`, 'success');
    } catch (e: any) {
      showToast(`Download failed: ${e?.message || 'Unknown error'}`, 'error');
    }
  };

  // Restore account handler
  const handleRestore = async (snapshot: AccountDbSnapshot, binItemId?: string) => {
    setRestoringItemId(binItemId || snapshot.userProfile?.uid || 'temp');
    try {
      const res = await restoreAccountFromSnapshot(snapshot, binItemId);
      if (res.success) {
        showToast(`Account "${snapshot.userProfile?.name}" successfully restored!`, 'success');
      } else {
        showToast(res.error || 'Failed to restore account', 'error');
      }
    } finally {
      setRestoringItemId(null);
    }
  };

  // Permanent delete handler
  const handlePermanentDelete = async (binItemId: string, accountName: string) => {
    if (!confirm(`Are you sure you want to permanently delete the database file for "${accountName}"? This cannot be undone.`)) {
      return;
    }
    setPermanentDeletingItemId(binItemId);
    try {
      const res = await deletePermanentlyFromBin(binItemId);
      if (res.success) {
        showToast(`DB file for "${accountName}" permanently removed.`, 'info');
      } else {
        showToast(res.error || 'Failed to delete permanently', 'error');
      }
    } finally {
      setPermanentDeletingItemId(null);
    }
  };

  // Create live backup handler
  const handleCreateLiveBackup = async () => {
    if (!backupModalUser) return;
    setIsCreatingBackup(true);
    try {
      const res = await createAccountBackup(backupModalUser.uid, backupReasonInput);
      if (res.success) {
        setBackupModalUser(null);
        setBackupReasonInput('Routine preventive backup');
      } else {
        showToast(res.error || 'Backup creation failed', 'error');
      }
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Email dispatch handler
  const handleDispatchEmail = async () => {
    if (!emailModalItem) return;
    const cleanEmail = recipientEmailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    setIsSendingEmail(true);
    try {
      if (emailModalItem.type === 'all-bin') {
        const res = await sendAllBinContentsByEmail(cleanEmail, targetWsId);
        if (res.success) {
          setEmailModalItem(null);
        }
      } else if (emailModalItem.snapshot) {
        const res = await emailDbFile({
          recipientEmail: cleanEmail,
          snapshot: emailModalItem.snapshot,
          subject: `WiVoTe DB File: ${emailModalItem.snapshot.userProfile?.name || 'Account'} Database Snapshot`,
          notes: emailNotesInput
        });
        if (res.success) {
          setEmailModalItem(null);
          setEmailNotesInput('');
        }
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Save email configuration
  const handleSaveEmailConfig = async () => {
    setIsSavingEmailConfig(true);
    try {
      await setConfiguredBackupEmail(emailConfigInput);
    } finally {
      setIsSavingEmailConfig(false);
    }
  };

  return (
    <div id="recycle-bin-manager" className="space-y-6 w-full max-w-full">
      {/* Header Banner */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xl relative overflow-hidden transition-all duration-300 ${
        theme === 'light' 
          ? 'bg-gradient-to-br from-white via-slate-50 to-sky-50/40 border-slate-200 text-slate-900 shadow-sm'
          : 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-sky-950/30 border-slate-800 text-white shadow-xl'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight flex items-center gap-2">
                Account Recycle Bin & Database Vault
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              When an account is deleted, its complete database snapshot (credentials metadata, assigned vouchers, sales volume, and cash drops) is automatically preserved in this bin. You can restore accounts instantly, download portable DB files, or dispatch them via email.
            </p>
          </div>

          {/* Quick Action: Send All Contents of the Bin */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              id="send-all-bin-contents-btn"
              disabled={filteredBin.length === 0}
              onClick={() => {
                setRecipientEmailInput(configuredBackupEmail || currentUser?.email || '');
                setEmailModalItem({
                  type: 'all-bin',
                  title: `Send All ${filteredBin.length} Recycle Bin DB Files`
                });
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold font-display uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-lg ${
                filteredBin.length === 0
                  ? 'opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-400'
                  : 'bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-600 text-white hover:opacity-95 shadow-rose-500/15'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Email All Bin Contents ({filteredBin.length})</span>
            </button>
          </div>
        </div>

        {/* Email Configuration Box */}
        <div className={`mt-6 pt-5 border-t flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          theme === 'light' ? 'border-slate-200/80 bg-slate-100/50 -mx-6 -mb-6 p-6 rounded-b-3xl' : 'border-slate-800/80 bg-slate-950/40 -mx-6 -mb-6 p-6 rounded-b-3xl'
        }`}>
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-sky-500 shrink-0" />
            <div>
              <p className="text-xs font-bold">Automated / Default Backup Destination Email</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                DB snapshot files and bin bundles will automatically pre-fill to this email.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <input
              id="configured-backup-email-input"
              type="email"
              value={emailConfigInput}
              onChange={(e) => setEmailConfigInput(e.target.value)}
              placeholder="e.g. karimazondomike049@gmail.com"
              className={`text-xs px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500/50 w-full sm:w-72 font-mono ${
                theme === 'light'
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-900 border-slate-700 text-white'
              }`}
            />
            <button
              id="save-backup-email-btn"
              onClick={handleSaveEmailConfig}
              disabled={isSavingEmailConfig}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-sky-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSavingEmailConfig ? 'Saving...' : 'Save Email'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub Tabs Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            id="subtab-bin-btn"
            onClick={() => setActiveSubTab('bin')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'bin'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Recycle Bin ({filteredBin.length})</span>
          </button>

          <button
            id="subtab-live-backups-btn"
            onClick={() => setActiveSubTab('live-backups')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'live-backups'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Accounts In Use & Live Backups ({filteredBackups.length})</span>
          </button>

          <button
            id="subtab-full-backups-btn"
            onClick={() => setActiveSubTab('full-backups')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'full-backups'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Full DB Backups ({fullDatabaseBackups.length})</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className={`pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-sky-500 w-44 sm:w-56 ${
                theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
              }`}
            />
          </div>

          <select
            value={selectedRoleFilter}
            onChange={(e: any) => setSelectedRoleFilter(e.target.value)}
            className={`text-xs px-2.5 py-1.5 rounded-xl border focus:outline-none ${
              theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <option value="all">All Roles</option>
            <option value="Agent">Agents Only</option>
            <option value="Admin">Admins Only</option>
            <option value="WorkspaceMaster">Masters Only</option>
          </select>
        </div>
      </div>

      {/* SUBTAB 1: RECYCLE BIN */}
      {activeSubTab === 'bin' && (
        <div className="space-y-4">
          {/* Quick Restoration Spotlight for Histec Training or Mistakenly Deleted Accounts */}
          {(() => {
            const histecItem = recycleBin.find(b => 
              (b.accountName?.toLowerCase().includes('histec') || b.snapshot?.userProfile?.name?.toLowerCase().includes('histec')) &&
              b.status !== 'purged'
            );
            const isHistecRestored = users.some(u => (u.name || '').toLowerCase().includes('histec'));
            
            if (histecItem && !isHistecRestored) {
              return (
                <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${
                  theme === 'light' 
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-sm' 
                    : 'bg-amber-950/40 border-amber-800/80 text-amber-100 shadow-lg shadow-amber-950/20'
                }`}>
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm shrink-0 mt-0.5">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm sm:text-base">Mistakenly Deleted Account Pending Restoration:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          {histecItem.accountName}
                        </span>
                        <span className="text-xs font-mono opacity-80">({histecItem.accountRole})</span>
                      </div>
                      <p className="text-xs opacity-90 mt-1 leading-relaxed max-w-2xl">
                        The full database snapshot of <strong className="font-bold">{histecItem.accountName}</strong> is safely preserved in this bin. Click below to immediately restore this account, reactivate their credentials, or export their DB file.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      id="quick-restore-histec-btn"
                      onClick={() => handleRestore(histecItem.snapshot, histecItem.id)}
                      disabled={restoringItemId === histecItem.id}
                      className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${restoringItemId === histecItem.id ? 'animate-spin' : ''}`} />
                      <span>{restoringItemId === histecItem.id ? 'Restoring...' : 'Restore Histec Training Now'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadSnapshot(histecItem.snapshot, histecItem.accountName)}
                      className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                        theme === 'light' ? 'bg-white hover:bg-slate-100 border-amber-300' : 'bg-slate-900 hover:bg-slate-800 border-amber-800'
                      }`}
                      title="Download DB File"
                    >
                      <Download className="w-4 h-4 text-sky-500" />
                    </button>
                    <button
                      onClick={() => {
                        setRecipientEmailInput(configuredBackupEmail || currentUser?.email || '');
                        setEmailModalItem({
                          type: 'single-bin',
                          item: histecItem,
                          snapshot: histecItem.snapshot,
                          title: `Email DB File: ${histecItem.accountName}`
                        });
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                        theme === 'light' ? 'bg-white hover:bg-slate-100 border-amber-300' : 'bg-slate-900 hover:bg-slate-800 border-amber-800'
                      }`}
                      title="Email DB File"
                    >
                      <Mail className="w-4 h-4 text-amber-500" />
                    </button>
                  </div>
                </div>
              );
            }
            return null;
          })()}
          {filteredBin.length === 0 ? (
            <div className={`p-12 text-center rounded-3xl border ${
              theme === 'light' ? 'bg-white border-slate-200 text-slate-400' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}>
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30 text-rose-500" />
              <p className="text-base font-bold font-display text-slate-700 dark:text-slate-300">Recycle Bin is Empty</p>
              <p className="text-xs max-w-md mx-auto mt-1">
                No deleted account database files found. When any staff or agent account is deleted by a Workspace Master or App Owner, its complete backup is automatically captured here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredBin.map((item) => (
                <div
                  key={item.id}
                  id={`bin-item-${item.id}`}
                  className={`rounded-2xl border p-5 transition-all duration-200 flex flex-col justify-between ${
                    theme === 'light'
                      ? 'bg-white border-slate-200/90 hover:border-slate-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {item.accountName}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            item.accountRole === 'Agent'
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          }`}>
                            {item.accountRole}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-[220px]">
                          {item.accountEmail || 'No email registered'}
                        </p>
                      </div>

                      <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Metadata Chips */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/50">
                        <span className="text-slate-400 block text-[10px]">Vouchers</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {item.vouchersCount || 0} total ({item.soldCount || 0} sold)
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/50">
                        <span className="text-slate-400 block text-[10px]">Sales Revenue</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ${(item.totalSalesValue || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Deleted: {new Date(item.deletedAt).toLocaleDateString()}</span>
                      <span className="truncate max-w-[140px]">By: {item.deletedBy?.name || 'Master'}</span>
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-4 gap-1.5">
                    {/* Restore Account Button */}
                    <button
                      id={`restore-btn-${item.id}`}
                      disabled={restoringItemId === item.id}
                      onClick={() => handleRestore(item.snapshot, item.id)}
                      title="Restore Account and Associated Data"
                      className="p-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white flex flex-col items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${restoringItemId === item.id ? 'animate-spin' : ''}`} />
                      <span className="text-[9px]">Restore</span>
                    </button>

                    {/* Download DB File */}
                    <button
                      id={`download-db-btn-${item.id}`}
                      onClick={() => handleDownloadSnapshot(item.snapshot, item.accountName)}
                      title="Download Portable DB Snapshot (.json)"
                      className="p-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white flex flex-col items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="text-[9px]">Download</span>
                    </button>

                    {/* Email DB File */}
                    <button
                      id={`email-db-btn-${item.id}`}
                      onClick={() => {
                        setRecipientEmailInput(configuredBackupEmail || currentUser?.email || '');
                        setEmailModalItem({
                          type: 'single-bin',
                          item,
                          snapshot: item.snapshot,
                          title: `Email DB File: ${item.accountName}`
                        });
                      }}
                      title="Email DB File Attachment"
                      className="p-2 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white flex flex-col items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span className="text-[9px]">Email</span>
                    </button>

                    {/* Delete Permanently */}
                    <button
                      id={`perm-delete-btn-${item.id}`}
                      disabled={permanentDeletingItemId === item.id}
                      onClick={() => handlePermanentDelete(item.id, item.accountName)}
                      title="Permanently Delete DB Snapshot"
                      className="p-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white flex flex-col items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[9px]">Purge</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: ACCOUNTS IN USE & LIVE BACKUPS */}
      {activeSubTab === 'live-backups' && (
        <div className="space-y-8">
          {/* Section A: Live Accounts in Use (Instant Backup creation) */}
          <div className={`p-6 rounded-3xl border shadow-sm ${
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h3 className="text-base font-bold font-display flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                  <span>Accounts Currently In Use (Active Staff & Agents)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  You can capture a point-in-time database snapshot for any active account just in case, preserving all their data.
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold self-start">
                {activeInUseAccounts.length} Active Accounts
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeInUseAccounts.map((user) => (
                <div
                  key={user.uid}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="truncate">
                    <p className="font-bold text-xs truncate text-slate-900 dark:text-white">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      {user.email || 'No email'}
                    </p>
                    <span className="inline-block mt-1 text-[9px] uppercase px-1.5 py-0.5 rounded font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {user.role}
                    </span>
                  </div>

                  <button
                    id={`create-backup-btn-${user.uid}`}
                    onClick={() => {
                      setBackupModalUser(user);
                      setBackupReasonInput(`Preventive backup of active account (${new Date().toLocaleDateString()})`);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shrink-0 flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-sky-500/20"
                  >
                    <HardDrive className="w-3 h-3" />
                    <span>Backup Now</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section B: Existing Live Backups Vault */}
          <div className={`p-6 rounded-3xl border shadow-sm ${
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h3 className="text-base font-bold font-display flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-500" />
                  <span>Saved Live Account Snapshots ({filteredBackups.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Point-in-time backups created while accounts were in use. Can be restored at any time to recover state.
                </p>
              </div>
            </div>

            {filteredBackups.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No active snapshots yet. Use the "Backup Now" button above to generate a safety snapshot.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBackups.map((backup) => (
                  <div
                    key={backup.id}
                    id={`backup-item-${backup.id}`}
                    className={`rounded-2xl border p-5 flex flex-col justify-between ${
                      theme === 'light' ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs truncate text-slate-900 dark:text-white">
                          {backup.accountName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(backup.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate">
                        {backup.accountEmail}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/50 dark:border-slate-800">
                        "{backup.reason || 'Safety Backup'}"
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>{backup.vouchersCount || 0} vouchers</span>
                        <span className="font-bold text-emerald-500">${(backup.totalSalesValue || 0).toLocaleString()} sales</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 mt-3 border-t border-slate-200/60 dark:border-slate-800 grid grid-cols-4 gap-1.5">
                      <button
                        onClick={() => handleRestore(backup.snapshot)}
                        title="Restore Account from Snapshot"
                        className="p-1.5 rounded-lg text-xs bg-emerald-500 hover:bg-emerald-600 text-white flex flex-col items-center justify-center gap-0.5 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span className="text-[8px] font-bold">Restore</span>
                      </button>

                      <button
                        onClick={() => handleDownloadSnapshot(backup.snapshot, backup.accountName)}
                        title="Download DB File"
                        className="p-1.5 rounded-lg text-xs bg-sky-500 hover:bg-sky-600 text-white flex flex-col items-center justify-center gap-0.5 transition cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span className="text-[8px] font-bold">Download</span>
                      </button>

                      <button
                        onClick={() => {
                          setRecipientEmailInput(configuredBackupEmail || currentUser?.email || '');
                          setEmailModalItem({
                            type: 'single-backup',
                            item: backup,
                            snapshot: backup.snapshot,
                            title: `Email Live Backup: ${backup.accountName}`
                          });
                        }}
                        title="Email DB File"
                        className="p-1.5 rounded-lg text-xs bg-indigo-500 hover:bg-indigo-600 text-white flex flex-col items-center justify-center gap-0.5 transition cursor-pointer"
                      >
                        <Mail className="w-3 h-3" />
                        <span className="text-[8px] font-bold">Email</span>
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Remove this snapshot for ${backup.accountName}?`)) {
                            deleteAccountBackup(backup.id);
                          }
                        }}
                        title="Delete Backup"
                        className="p-1.5 rounded-lg text-xs bg-rose-500 hover:bg-rose-600 text-white flex flex-col items-center justify-center gap-0.5 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="text-[8px] font-bold">Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: FULL DATABASE AUTOMATED SNAPSHOTS */}
      {activeSubTab === 'full-backups' && (
        <div className="space-y-6">
          {/* Interval Config & Backup Now card */}
          <div className={`p-6 rounded-3xl border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                  <span>Configure Full Database Auto Backup</span>
                </h4>
                <p className="text-xs text-slate-400 max-w-xl">
                  Automate point-in-time state captures of all workspace tables (users, inventory, customer lists, legacy devices, cash drops, and requests) to protect tenant business continuity.
                </p>
              </div>

              {/* Selector */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-slate-400 mb-1">BACKUP INTERVAL</span>
                  <select
                    value={backupInterval}
                    onChange={(e) => setBackupInterval(parseInt(e.target.value, 10))}
                    className={`border rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-sky-500 w-48 ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value={0}>❌ Disabled (Manual Only)</option>
                    <option value={5}>⏱️ Every 5 Minutes (Dev/Test)</option>
                    <option value={15}>⏱️ Every 15 Minutes</option>
                    <option value={30}>⏱️ Every 30 Minutes</option>
                    <option value={60}>⏱️ Every Hour</option>
                    <option value={360}>⏱️ Every 6 Hours</option>
                    <option value={720}>⏱️ Every 12 Hours</option>
                    <option value={1440}>📅 Every 24 Hours (Daily)</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-slate-400 mb-1">TRIGGER SNAPSHOT</span>
                  <button
                    onClick={() => createFullDatabaseBackup('manual')}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Backup Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* List of full backups */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                  Full Database Backups History ({fullDatabaseBackups.length})
                </h4>
                <p className="text-[11px] text-slate-400">
                  Select a snapshot below to restore state or download the full workspace bundle.
                </p>
              </div>
            </div>

            {fullDatabaseBackups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200/50 dark:border-slate-800 rounded-3xl">
                <Database className="w-10 h-10 mx-auto text-slate-400 mb-3 stroke-1" />
                <p className="text-xs font-bold text-slate-400">No Full Database Backups Saved Yet</p>
                <p className="text-[10px] text-slate-400 max-w-sm mx-auto mt-1">
                  Trigger a manual database backup or configure an interval above to capture the system state automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fullDatabaseBackups.map((backup: any) => {
                  const isAuto = backup.triggerType === 'auto';
                  return (
                    <div
                      key={backup.id}
                      className={`p-5 rounded-3xl border flex flex-col justify-between transition-all hover:scale-[1.01] hover:shadow-lg ${
                        theme === 'light'
                          ? 'bg-slate-50/50 border-slate-200 text-slate-800'
                          : 'bg-slate-900/40 border-slate-800 text-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded-full uppercase flex items-center gap-1 border ${
                            isAuto
                              ? 'bg-sky-500/10 border-sky-500/20 text-sky-500'
                              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500'
                          }`}>
                            {isAuto ? '🤖 Auto Interval' : '👤 Manual Capture'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(backup.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="mb-4">
                          <h5 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wide mb-2">
                            Snapshot Data Breakdown
                          </h5>
                          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div className="bg-slate-500/5 p-2 rounded-xl border border-slate-100/5 dark:border-slate-800/40">
                              <span className="text-slate-400 block text-[9px] uppercase">Vouchers</span>
                              <span className="font-bold text-emerald-500">{backup.vouchersCount || 0} items</span>
                            </div>
                            <div className="bg-slate-500/5 p-2 rounded-xl border border-slate-100/5 dark:border-slate-800/40">
                              <span className="text-slate-400 block text-[9px] uppercase">User Accounts</span>
                              <span className="font-bold text-indigo-500">{backup.usersCount || 0} users</span>
                            </div>
                            <div className="bg-slate-500/5 p-2 rounded-xl border border-slate-100/5 dark:border-slate-800/40">
                              <span className="text-slate-400 block text-[9px] uppercase">Customer Registry</span>
                              <span className="font-bold text-sky-500">{backup.customersCount || 0} clients</span>
                            </div>
                            <div className="bg-slate-500/5 p-2 rounded-xl border border-slate-100/5 dark:border-slate-800/40">
                              <span className="text-slate-400 block text-[9px] uppercase">Legacy Devices</span>
                              <span className="font-bold text-amber-500">{backup.legacyDevicesCount || 0} devices</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-3.5 mt-3.5 border-t border-slate-200/50 dark:border-slate-800 grid grid-cols-3 gap-2">
                        <button
                          onClick={() => {
                            if (confirm(`⚠️ CRITICAL: Are you absolutely sure you want to restore the ENTIRE system database from backup snapshot ${backup.id}? This will restore all users, vouchers, customers, legacy devices, and sales records matching this point-in-time snapshot.`)) {
                              restoreFullDatabaseBackup(backup);
                            }
                          }}
                          title="Restore Entire Workspace Database"
                          className="px-2 py-2 rounded-xl text-xs bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center gap-1 transition cursor-pointer font-bold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>

                        <button
                          onClick={() => handleDownloadFullBackup(backup)}
                          title="Download Backup JSON File"
                          className="px-2 py-2 rounded-xl text-xs bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center gap-1 transition cursor-pointer font-bold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`Remove this database snapshot? This action is irreversible.`)) {
                              deleteFullDatabaseBackup(backup.id);
                            }
                          }}
                          title="Delete Backup Snapshot"
                          className="px-2 py-2 rounded-xl text-xs bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center gap-1 transition cursor-pointer font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Email DB File / Batch Bin Dispatch */}
      {emailModalItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display">{emailModalItem.title}</h3>
                <p className="text-xs text-slate-400">Dispatch complete JSON DB snapshot via email</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono mb-1.5 text-slate-400">Recipient Email Address</label>
                <input
                  type="email"
                  value={recipientEmailInput}
                  onChange={(e) => setRecipientEmailInput(e.target.value)}
                  placeholder="e.g. karimazondomike049@gmail.com"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono mb-1.5 text-slate-400">Additional Notes / Reference (Optional)</label>
                <textarea
                  value={emailNotesInput}
                  onChange={(e) => setEmailNotesInput(e.target.value)}
                  rows={3}
                  placeholder="e.g. Account database file for audit or backup archive..."
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSendingEmail}
                  onClick={() => setEmailModalItem(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSendingEmail}
                  onClick={handleDispatchEmail}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-500/20"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
                  <span>{isSendingEmail ? 'Sending...' : 'Dispatch Email'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Live Account Backup */}
      {backupModalUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-sky-500/10 text-sky-500 rounded-2xl border border-sky-500/20">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display">Capture Live Account Snapshot</h3>
                <p className="text-xs text-slate-400">Snapshot for: {backupModalUser.name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono mb-1.5 text-slate-400">Backup Reason / Label</label>
                <input
                  type="text"
                  value={backupReasonInput}
                  onChange={(e) => setBackupReasonInput(e.target.value)}
                  placeholder="e.g. Before quarterly reallocation"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-slate-600 dark:text-slate-300">
                This snapshot will safely freeze profile credentials, assigned vouchers, sales volume, and cash drops as a portable database file.
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isCreatingBackup}
                  onClick={() => setBackupModalUser(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isCreatingBackup}
                  onClick={handleCreateLiveBackup}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-sky-500/20"
                >
                  <HardDrive className={`w-3.5 h-3.5 ${isCreatingBackup ? 'animate-spin' : ''}`} />
                  <span>{isCreatingBackup ? 'Saving...' : 'Save Snapshot'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
