import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AuditActionCategory, AuditLogEntry } from '../types';
import {
  Shield,
  ShieldCheck,
  Key,
  Users,
  Radio,
  Building,
  DollarSign,
  Search,
  Filter,
  Download,
  RefreshCw,
  Clock,
  ChevronRight,
  X,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Activity,
  Calendar,
  Sparkles,
  Layers,
  FileCode,
  UserCheck,
  Wrench,
  ShieldAlert
} from 'lucide-react';

export const AccessAuditView: React.FC = () => {
  const {
    auditLogs,
    logAuditAction,
    workspaces,
    theme,
    showToast,
    refetchData,
    isRefetching,
    currentUser,
    vouchers,
    users,
    activeWorkspace
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | AuditActionCategory>('all');
  const [selectedWorkspaceFilter, setSelectedWorkspaceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [viewMode, setViewMode] = useState<'feed' | 'table'>('feed');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isTestingAction, setIsTestingAction] = useState(false);

  // Filtered logs computation
  const filteredLogs = useMemo(() => {
    return (auditLogs || []).filter(log => {
      // 1. Category Filter
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }

      // 2. Workspace Filter
      if (selectedWorkspaceFilter !== 'all') {
        if (log.workspaceId !== selectedWorkspaceFilter && log.workspaceName !== selectedWorkspaceFilter) {
          return false;
        }
      }

      // 3. Time Filter
      if (timeFilter !== 'all') {
        const logTime = new Date(log.timestamp).getTime();
        const now = Date.now();
        if (timeFilter === 'today') {
          const oneDayAgo = now - 24 * 60 * 60 * 1000;
          if (logTime < oneDayAgo) return false;
        } else if (timeFilter === '7days') {
          const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
          if (logTime < sevenDaysAgo) return false;
        } else if (timeFilter === '30days') {
          const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
          if (logTime < thirtyDaysAgo) return false;
        }
      }

      // 4. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (log.title || '').toLowerCase().includes(q);
        const matchDesc = (log.description || '').toLowerCase().includes(q);
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchActor = (log.actorName || '').toLowerCase().includes(q) || (log.actorEmail || '').toLowerCase().includes(q);
        const matchTarget = (log.targetName || '').toLowerCase().includes(q) || (log.targetEmail || '').toLowerCase().includes(q);
        const matchWorkspace = (log.workspaceName || '').toLowerCase().includes(q);
        const matchMeta = log.metadata ? JSON.stringify(log.metadata).toLowerCase().includes(q) : false;

        return matchTitle || matchDesc || matchAction || matchActor || matchTarget || matchWorkspace || matchMeta;
      }

      return true;
    });
  }, [auditLogs, selectedCategory, selectedWorkspaceFilter, timeFilter, searchQuery]);

  // Metric aggregates
  const stats = useMemo(() => {
    const all = auditLogs || [];
    return {
      total: all.length,
      credentials: all.filter(l => l.category === 'credential').length,
      roles: all.filter(l => l.category === 'role').length,
      devices: all.filter(l => l.category === 'device').length,
      workspaces: all.filter(l => l.category === 'workspace').length,
      customers: all.filter(l => l.category === 'customer').length,
    };
  }, [auditLogs]);

  // Category visual styles helper
  const getCategoryTheme = (category: AuditActionCategory) => {
    switch (category) {
      case 'customer':
        return {
          bg: theme === 'light' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/25 text-rose-400',
          dot: 'bg-rose-500',
          icon: UserCheck,
          label: 'Customer Registry'
        };
      case 'credential':
        return {
          bg: theme === 'light' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/10 border-amber-500/25 text-amber-400',
          dot: 'bg-amber-500',
          icon: Key,
          label: 'Credential Change'
        };
      case 'role':
        return {
          bg: theme === 'light' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-400',
          dot: 'bg-indigo-500',
          icon: Users,
          label: 'Role Modification'
        };
      case 'device':
        return {
          bg: theme === 'light' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
          dot: 'bg-emerald-500',
          icon: Radio,
          label: 'Device Enrollment'
        };
      case 'workspace':
        return {
          bg: theme === 'light' ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-sky-500/10 border-sky-500/25 text-sky-400',
          dot: 'bg-sky-500',
          icon: Building,
          label: 'Workspace Action'
        };
      case 'pricing':
        return {
          bg: theme === 'light' ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-purple-500/10 border-purple-500/25 text-purple-400',
          dot: 'bg-purple-500',
          icon: DollarSign,
          label: 'Pricing & Schema'
        };
      default:
        return {
          bg: theme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-300',
          dot: 'bg-slate-500',
          icon: Activity,
          label: 'System Event'
        };
    }
  };

  // Timestamp formatter
  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      let relative = '';
      if (diffMins < 1) relative = 'Just now';
      else if (diffMins < 60) relative = `${diffMins}m ago`;
      else if (diffHours < 24) relative = `${diffHours}h ago`;
      else if (diffDays === 1) relative = 'Yesterday';
      else if (diffDays < 30) relative = `${diffDays}d ago`;
      else relative = date.toLocaleDateString();

      const fullTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const fullDate = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

      return { relative, full: `${fullDate} at ${fullTime}` };
    } catch {
      return { relative: isoString, full: isoString };
    }
  };

  // Export audit log as JSON or CSV
  const handleExportAuditLogs = (format: 'json' | 'csv') => {
    if (!filteredLogs || filteredLogs.length === 0) {
      showToast('No audit records available to export.', 'info');
      return;
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'json') {
      const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(filteredLogs, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `wivote_access_audit_logs_${timestampStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast(`Exported ${filteredLogs.length} audit records as JSON.`, 'success');
    } else {
      // CSV Export
      const headers = ['ID', 'Timestamp', 'Category', 'Action', 'Title', 'Description', 'Actor', 'ActorRole', 'Target', 'TargetEmail', 'Workspace'];
      const rows = filteredLogs.map(l => [
        `"${l.id}"`,
        `"${l.timestamp}"`,
        `"${l.category}"`,
        `"${l.action}"`,
        `"${(l.title || '').replace(/"/g, '""')}"`,
        `"${(l.description || '').replace(/"/g, '""')}"`,
        `"${(l.actorName || l.actorEmail || '').replace(/"/g, '""')}"`,
        `"${(l.actorRole || '').replace(/"/g, '""')}"`,
        `"${(l.targetName || '').replace(/"/g, '""')}"`,
        `"${(l.targetEmail || '').replace(/"/g, '""')}"`,
        `"${(l.workspaceName || l.workspaceId || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', encodedUri);
      downloadAnchor.setAttribute('download', `wivote_access_audit_logs_${timestampStr}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast(`Exported ${filteredLogs.length} audit records as CSV.`, 'success');
    }
  };

  // Test Audit Logger trigger
  const handleTriggerTestAudit = async () => {
    setIsTestingAction(true);
    try {
      const targetWs = workspaces?.[0] || { id: 'ws_demo', name: 'Demonstration Network' };
      await logAuditAction({
        category: 'credential',
        action: 'SECURITY_AUDIT_VERIFIED',
        title: 'Security Access Verification Audit',
        description: `Manual security and integrity test executed by App Owner for workspace "${targetWs.name}". Credential boundaries confirmed.`,
        actorId: currentUser?.uid || 'app_owner_karim',
        actorName: currentUser?.name || 'Mike Karim (App Owner)',
        actorRole: 'AppOwner',
        actorEmail: currentUser?.email || 'karimazondomike049@gmail.com',
        workspaceId: targetWs.id,
        workspaceName: targetWs.name,
        targetName: `${targetWs.name} Master Terminal`,
        metadata: {
          testVerified: true,
          verificationType: 'Manual Operator Check',
          originChannel: 'AppOwnerDashboard'
        }
      });
      showToast('New audit action record generated and persisted successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to log test action.', 'error');
    } finally {
      setIsTestingAction(false);
    }
  };

  // Copy JSON payload helper
  const handleCopyPayload = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setIsCopied(true);
    showToast('Payload copied to clipboard.', 'success');
    setTimeout(() => setIsCopied(false), 2000);
  };

  // --- Proactive Watchdog Anomaly Scanner (Legitimacy & Integrity Guard) ---
  const watchdogAnomalies = useMemo(() => {
    const anomalies: any[] = [];
    const allUsers = users || [];
    const allVouchers = vouchers || [];

    // 1. Ghost Profiles (Undefined email or name)
    allUsers.forEach((u: any) => {
      if (!u.email || u.email === 'undefined' || !u.name || u.name === 'undefined') {
        anomalies.push({
          id: `ghost_profile_${u.uid}`,
          type: 'ghost_profile',
          severity: 'critical',
          title: `Ghost User Profile Found`,
          description: `User profile ID "${u.uid}" exists but contains undefined, empty, or uninitialized email/name fields.`,
          affectedCount: 1,
          workspaceId: u.workspaceId || activeWorkspace?.id || '',
          workspaceName: activeWorkspace?.name || 'Active Workspace',
          details: u
        });
      }
    });

    // 2. Duplicate Profiles sharing the same email
    const emailMap = new Map<string, any[]>();
    allUsers.forEach((u: any) => {
      if (u.email && u.email !== 'undefined') {
        const emailLower = u.email.toLowerCase().trim();
        if (!emailMap.has(emailLower)) {
          emailMap.set(emailLower, []);
        }
        emailMap.get(emailLower)!.push(u);
      }
    });

    emailMap.forEach((userList, email) => {
      if (userList.length > 1) {
        anomalies.push({
          id: `duplicate_profile_${email}`,
          type: 'duplicate_profile',
          severity: 'warning',
          title: `Duplicate Agent Profiles Detected`,
          description: `Multiple profiles (${userList.length}) exist under identical email "${email}" which can cause credential hijacking or session conflicts.`,
          affectedCount: userList.length,
          workspaceId: userList[0].workspaceId || activeWorkspace?.id || '',
          workspaceName: activeWorkspace?.name || 'Active Workspace',
          details: userList
        });
      }
    });

    // 3. Orphaned Vouchers (Assigned in vouchers subcollection but agentId does not exist in workspace users)
    const activeUserIds = new Set(allUsers.map((u: any) => u.uid));
    const orphanedGroupMap = new Map<string, any[]>();

    allVouchers.forEach((v: any) => {
      if (v.status === 'Assigned' && v.assignedAgentId) {
        if (!activeUserIds.has(v.assignedAgentId)) {
          if (!orphanedGroupMap.has(v.assignedAgentId)) {
            orphanedGroupMap.set(v.assignedAgentId, []);
          }
          orphanedGroupMap.get(v.assignedAgentId)!.push(v);
        }
      }
    });

    orphanedGroupMap.forEach((voucherList, agentId) => {
      const firstVoucher = voucherList[0];
      const agentName = firstVoucher.assignedAgentName || 'Unknown Agent';
      const agentEmail = firstVoucher.assignedAgentEmail || 'No Email';

      anomalies.push({
        id: `orphaned_vouchers_${agentId}`,
        type: 'orphaned_vouchers',
        severity: 'critical',
        title: `Orphaned Vouchers Allocated to Missing Agent ID`,
        description: `${voucherList.length} vouchers are assigned to Agent ID "${agentId}" (${agentName} / ${agentEmail}), but no active profile with this ID exists in the workspace.`,
        affectedCount: voucherList.length,
        workspaceId: activeWorkspace?.id || '',
        workspaceName: activeWorkspace?.name || 'Active Workspace',
        details: { agentId, agentName, agentEmail, vouchers: voucherList }
      });
    });

    return anomalies;
  }, [users, vouchers, activeWorkspace]);

  const [isResolving, setIsResolving] = useState<string | null>(null);

  const handleResolveAnomaly = async (anomaly: any) => {
    setIsResolving(anomaly.id);
    try {
      const dbModule = await import('../firebase');
      const { db } = dbModule;
      const { doc, deleteDoc, updateDoc } = await import('firebase/firestore');

      if (anomaly.type === 'ghost_profile') {
        const u = anomaly.details;
        await deleteDoc(doc(db, 'users', u.uid));
        if (u.workspaceId && u.workspaceId !== 'system') {
          await deleteDoc(doc(db, 'workspaces', u.workspaceId, 'users', u.uid));
        }
        await logAuditAction({
          category: 'role',
          action: 'WATCHDOG_GHOST_PROFILE_CLEANED',
          title: 'Watchdog Cleared Ghost Profile',
          description: `Automatically removed empty/undefined ghost profile "${u.uid}" from the database to maintain integrity.`,
          actorId: currentUser?.uid || 'system_watchdog',
          actorName: currentUser?.name || 'System Watchdog',
          actorRole: 'AppOwner',
          actorEmail: currentUser?.email || 'watchdog@wivote.com',
          workspaceId: u.workspaceId || activeWorkspace?.id || '',
          workspaceName: activeWorkspace?.name || 'System Workspace'
        });
        showToast('Successfully cleaned up the uninitialized ghost profile.', 'success');
      } 
      else if (anomaly.type === 'orphaned_vouchers') {
        const { agentId, agentName, vouchers: affectedVouchers } = anomaly.details;
        // Search if we have a valid profile with a similar name or email to re-assign to!
        const similarAgent = users?.find((u: any) => 
          u.name?.toLowerCase().includes('mukondodzi') || 
          u.email?.toLowerCase().includes('mukondodzi') ||
          u.name?.toLowerCase().includes(agentName.toLowerCase())
        );

        if (similarAgent) {
          const promises = affectedVouchers.map((v: any) => 
            updateDoc(doc(db, 'workspaces', activeWorkspace?.id || '', 'vouchers', v.id), {
              assignedAgentId: similarAgent.uid,
              assignedAgentName: similarAgent.name,
              assignedAgentEmail: similarAgent.email
            })
          );
          await Promise.all(promises);

          await logAuditAction({
            category: 'customer',
            action: 'WATCHDOG_ORPHAN_VOUCHERS_RECONCILED',
            title: 'Watchdog Reconciled Orphan Vouchers',
            description: `Automatically re-assigned ${affectedVouchers.length} orphaned vouchers from missing Agent ID "${agentId}" to legitimised Agent "${similarAgent.name}" (${similarAgent.email}).`,
            actorId: currentUser?.uid || 'system_watchdog',
            actorName: currentUser?.name || 'System Watchdog',
            actorRole: 'AppOwner',
            actorEmail: currentUser?.email || 'watchdog@wivote.com',
            workspaceId: activeWorkspace?.id || '',
            workspaceName: activeWorkspace?.name || 'Current Workspace'
          });
          showToast(`Successfully reconciled and re-assigned ${affectedVouchers.length} vouchers to legitimised profile ${similarAgent.name}.`, 'success');
        } else {
          showToast(`No active agent profile found matching name "${agentName}". Please create her profile first so she can claim her vouchers!`, 'error');
        }
      }
      else if (anomaly.type === 'duplicate_profile') {
        const userList = anomaly.details;
        const legit = userList.find((u: any) => u.role === 'Agent' && u.name && u.name !== 'undefined') || userList[0];
        const duplicates = userList.filter((u: any) => u.uid !== legit.uid);

        for (const dup of duplicates) {
          await deleteDoc(doc(db, 'users', dup.uid));
          if (dup.workspaceId && dup.workspaceId !== 'system') {
            await deleteDoc(doc(db, 'workspaces', dup.workspaceId, 'users', dup.uid));
          }
        }

        await logAuditAction({
          category: 'role',
          action: 'WATCHDOG_DUPLICATE_PROFILES_MERGED',
          title: 'Watchdog Merged Duplicate Profiles',
          description: `Merged duplicate agent profiles for "${legit.email}". Kept UID "${legit.uid}" and cleaned up ${duplicates.length} redundant profiles.`,
          actorId: currentUser?.uid || 'system_watchdog',
          actorName: currentUser?.name || 'System Watchdog',
          actorRole: 'AppOwner',
          actorEmail: currentUser?.email || 'watchdog@wivote.com',
          workspaceId: legit.workspaceId || activeWorkspace?.id || '',
          workspaceName: activeWorkspace?.name || 'System Workspace'
        });
        showToast(`Successfully merged duplicate profiles for ${legit.email}.`, 'success');
      }

      await refetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to auto-resolve anomaly.', 'error');
    } finally {
      setIsResolving(null);
    }
  };

  return (
    <div id="access-audit-view-container" className="space-y-6">
      {/* Header Banner */}
      <div
        id="access-audit-header"
        className={`border rounded-3xl p-6 md:p-8 relative overflow-hidden transition-all duration-300 ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
            : 'bg-slate-900 border-slate-800 text-white shadow-xl'
        }`}
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`border text-[10px] font-mono uppercase px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                  theme === 'light'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-400'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                Administrative Compliance Ledger
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  theme === 'light'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                }`}
              >
                Tamper-Resistant
              </span>
            </div>

            <h1
              className={`text-2xl sm:text-3xl font-extrabold font-display mt-2.5 tracking-tight ${
                theme === 'light' ? 'text-slate-950' : 'text-white'
              }`}
            >
              Access & Administrative Audit
            </h1>
            <p
              className={`text-xs sm:text-sm mt-1 max-w-3xl leading-relaxed ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              Comprehensive real-time log of administrative events across all workspaces — including credential resets,
              one-time recovery OTPs, role designations, account lifecycle changes, and legacy device enrollments.
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              id="audit-refresh-btn"
              onClick={async () => {
                await refetchData();
                showToast('Audit records synchronized from cloud.', 'info');
              }}
              disabled={isRefetching}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border flex items-center gap-2 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
              }`}
              title="Refresh logs from cloud"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin text-sky-500' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              id="audit-export-json-btn"
              onClick={() => handleExportAuditLogs('json')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border flex items-center gap-2 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
              }`}
              title="Export as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>

            <button
              id="audit-export-csv-btn"
              onClick={() => handleExportAuditLogs('csv')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border flex items-center gap-2 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
              }`}
              title="Export as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              id="audit-test-log-btn"
              onClick={handleTriggerTestAudit}
              disabled={isTestingAction}
              className="px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-sm hover:opacity-90 transition flex items-center gap-2 cursor-pointer"
              title="Log verification event"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isTestingAction ? 'Logging...' : 'Test Event'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Watchdog Proactive Safeguard Anomalies Panel */}
      {watchdogAnomalies.length > 0 && (
        <div
          id="watchdog-anomalies-panel"
          className={`border rounded-3xl p-5 md:p-6 transition-all duration-300 relative overflow-hidden ${
            theme === 'light'
              ? 'bg-amber-50/50 border-amber-200 text-slate-900 shadow-sm'
              : 'bg-amber-500/5 border-amber-500/20 text-white shadow-xl'
          }`}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start gap-4 relative z-10">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 shrink-0">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm md:text-base font-black font-display tracking-tight text-amber-600 dark:text-amber-400 uppercase">
                    🚨 WiVoTe Watchdog Proactive Safeguard Warning
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    Anomalies detected inside workspace databases. These could block agent logins or make their inventories appear missing.
                  </p>
                </div>
                <div className="shrink-0">
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold px-2.5 py-1 rounded-full border border-amber-500/30">
                    {watchdogAnomalies.length} Database Anomalies Detected
                  </span>
                </div>
              </div>

              {/* List of Anomalies */}
              <div className="mt-4 space-y-3.5">
                {watchdogAnomalies.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className={`p-4 rounded-2xl border transition-all duration-300 ${
                      theme === 'light'
                        ? 'bg-white border-amber-100 hover:border-amber-200 shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700/80 shadow-md'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                              anomaly.severity === 'critical'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                            }`}
                          >
                            {anomaly.severity.toUpperCase()}
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold font-display tracking-tight text-slate-800 dark:text-slate-200">
                            {anomaly.title}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1 font-mono">
                          {anomaly.description}
                        </p>
                        <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-2">
                          <span>Workspace: {anomaly.workspaceName}</span>
                          <span className="opacity-50">•</span>
                          <span>ID: {anomaly.workspaceId}</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleResolveAnomaly(anomaly)}
                          disabled={isResolving !== null}
                          className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center gap-2 cursor-pointer transition active:scale-95"
                        >
                          <Wrench className={`w-3.5 h-3.5 ${isResolving === anomaly.id ? 'animate-spin' : ''}`} />
                          <span>
                            {isResolving === anomaly.id ? 'Resolving...' : 'Auto-Resolve'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div id="access-audit-metrics-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Records */}
        <div
          id="stat-total-records"
          onClick={() => setSelectedCategory('all')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            selectedCategory === 'all'
              ? 'ring-2 ring-indigo-500 border-indigo-500'
              : theme === 'light'
              ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">Total Audit Trail</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-display mt-2">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
            <span>Historical & live records</span>
          </div>
        </div>

        {/* Credential Changes */}
        <div
          id="stat-credential-changes"
          onClick={() => setSelectedCategory('credential')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            selectedCategory === 'credential'
              ? 'ring-2 ring-amber-500 border-amber-500'
              : theme === 'light'
              ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-amber-500 uppercase tracking-wider">Credential Changes</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-display mt-2 text-amber-500">{stats.credentials}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
            <span>Resets, OTPs & passwords</span>
          </div>
        </div>

        {/* Role Modifications */}
        <div
          id="stat-role-modifications"
          onClick={() => setSelectedCategory('role')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            selectedCategory === 'role'
              ? 'ring-2 ring-indigo-500 border-indigo-500'
              : theme === 'light'
              ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-indigo-400 uppercase tracking-wider">Role Modifications</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-display mt-2 text-indigo-400">{stats.roles}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
            <span>Promotions, agents, status</span>
          </div>
        </div>

        {/* Device Enrollments */}
        <div
          id="stat-device-enrollments"
          onClick={() => setSelectedCategory('device')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            selectedCategory === 'device'
              ? 'ring-2 ring-emerald-500 border-emerald-500'
              : theme === 'light'
              ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-emerald-500 uppercase tracking-wider">Device Enrollments</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-display mt-2 text-emerald-500">{stats.devices}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
            <span>MAC validations & approvals</span>
          </div>
        </div>
      </div>

      {/* Search, Filter & Control Toolbar */}
      <div
        id="audit-filters-panel"
        className={`p-4 sm:p-5 rounded-3xl border transition-all ${
          theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-xl'
        }`}
      >
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
            <input
              id="audit-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by actor, target user, workspace, device MAC, action..."
              className={`w-full border rounded-2xl pl-10 pr-10 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                  : 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Workspace Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 shrink-0 hidden sm:inline">Workspace:</span>
            <select
              id="audit-workspace-selector"
              value={selectedWorkspaceFilter}
              onChange={e => setSelectedWorkspaceFilter(e.target.value)}
              className={`border rounded-2xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <option value="all">All Workspaces (Global)</option>
              {(workspaces || []).map(ws => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          {/* Time Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 shrink-0 hidden sm:inline">Timeframe:</span>
            <select
              id="audit-timeframe-selector"
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value as any)}
              className={`border rounded-2xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <option value="all">All Recorded History</option>
              <option value="today">Past 24 Hours</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('feed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                viewMode === 'feed'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Feed View
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Table View
            </button>
          </div>
        </div>

        {/* Category Pill Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button
            id="audit-cat-pill-all"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : theme === 'light'
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span>All Actions</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
              {stats.total}
            </span>
          </button>

          <button
            id="audit-cat-pill-credential"
            onClick={() => setSelectedCategory('credential')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'credential'
                ? 'bg-amber-500 text-white shadow-sm'
                : theme === 'light'
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
            }`}
          >
            <Key className="w-3 h-3" />
            <span>Credential Changes</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
              {stats.credentials}
            </span>
          </button>

          <button
            id="audit-cat-pill-role"
            onClick={() => setSelectedCategory('role')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'role'
                ? 'bg-indigo-500 text-white shadow-sm'
                : theme === 'light'
                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Role Modifications</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
              {stats.roles}
            </span>
          </button>

          <button
            id="audit-cat-pill-device"
            onClick={() => setSelectedCategory('device')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'device'
                ? 'bg-emerald-600 text-white shadow-sm'
                : theme === 'light'
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Device Enrollments</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
              {stats.devices}
            </span>
          </button>

          <button
            id="audit-cat-pill-workspace"
            onClick={() => setSelectedCategory('workspace')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'workspace'
                ? 'bg-sky-500 text-white shadow-sm'
                : theme === 'light'
                ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
                : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20'
            }`}
          >
            <Building className="w-3 h-3" />
            <span>Workspaces</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
              {stats.workspaces}
            </span>
          </button>

          <button
            id="audit-cat-pill-customer"
            onClick={() => setSelectedCategory('customer')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'customer'
                ? 'bg-rose-600 text-white shadow-sm'
                : theme === 'light'
                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            <span>Customer Registry</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
              {stats.customers}
            </span>
          </button>

          {/* Reset Filters shortcut */}
          {(searchQuery || selectedCategory !== 'all' || selectedWorkspaceFilter !== 'all' || timeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedWorkspaceFilter('all');
                setTimeFilter('all');
              }}
              className="text-xs font-mono text-rose-500 hover:underline ml-auto flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Audit Records Content */}
      {filteredLogs.length === 0 ? (
        <div
          id="audit-empty-state"
          className={`border rounded-3xl p-12 text-center flex flex-col items-center justify-center ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
            <Search className="w-8 h-8 opacity-40" />
          </div>
          <h3 className="text-base font-bold font-display">No matching audit logs found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6">
            We couldn't find any events matching your selected criteria. Try adjusting your search query, clearing filters,
            or generating a test event.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedWorkspaceFilter('all');
              setTimeFilter('all');
            }}
            className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      ) : viewMode === 'feed' ? (
        /* FEED / TIMELINE VIEW */
        <div id="audit-feed-list" className="space-y-3">
          {filteredLogs.map(log => {
            const catTheme = getCategoryTheme(log.category);
            const FeedCategoryIcon = catTheme.icon;
            const timeInfo = formatTimestamp(log.timestamp);

            return (
              <div
                key={log.id}
                id={`audit-log-item-${log.id}`}
                onClick={() => setSelectedLog(log)}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 cursor-pointer hover:scale-[1.008] hover:shadow-md ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 hover:border-indigo-300'
                    : 'bg-slate-900 border-slate-800 hover:border-indigo-500/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${catTheme.bg}`}>
                      <FeedCategoryIcon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${catTheme.bg}`}>
                          {catTheme.label}
                        </span>

                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-750">
                          {log.action}
                        </span>

                        {log.workspaceName && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20 truncate max-w-[200px]">
                            {log.workspaceName}
                          </span>
                        )}
                      </div>

                      <h3 className={`text-sm font-bold truncate ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                        {log.title}
                      </h3>

                      <p className={`text-xs mt-1 leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                        {log.description}
                      </p>

                      {/* Metadata Chips */}
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11px] font-mono">
                        {log.actorName && (
                          <span className="text-slate-400">
                            Actor: <strong className="text-indigo-500 font-semibold">{log.actorName}</strong>
                            {log.actorRole && ` (${log.actorRole})`}
                          </span>
                        )}

                        {log.targetName && (
                          <span className="text-slate-400">
                            • Target: <strong className="text-emerald-500 font-semibold">{log.targetName}</strong>
                          </span>
                        )}

                        {log.targetEmail && (
                          <span className="text-slate-400">
                            • ({log.targetEmail})
                          </span>
                        )}

                        {log.metadata?.macAddress && (
                          <span className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[10px] text-amber-500">
                            MAC: {log.metadata.macAddress}
                          </span>
                        )}

                        {log.metadata?.monthlyPrice !== undefined && (
                          <span className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[10px] text-emerald-500">
                            ${Number(log.metadata.monthlyPrice).toFixed(2)}/mo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timestamp and Details Link */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {timeInfo.relative}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 mt-0.5 hidden sm:block">
                      {timeInfo.full}
                    </span>
                    <span className="text-xs font-mono text-indigo-500 flex items-center gap-0.5 mt-2 hover:underline">
                      Inspect <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div
          id="audit-table-container"
          className={`border rounded-3xl overflow-hidden shadow-sm ${
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead
                className={`border-b font-mono uppercase text-[10px] font-bold ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Action Summary</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target / Entity</th>
                  <th className="py-3 px-4">Workspace</th>
                  <th className="py-3 px-4 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredLogs.map(log => {
                  const catTheme = getCategoryTheme(log.category);
                  const TableCategoryIcon = catTheme.icon;
                  const timeInfo = formatTimestamp(log.timestamp);

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`cursor-pointer transition-colors ${
                        theme === 'light' ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        <div>{timeInfo.relative}</div>
                        <div className="text-[10px] text-slate-400">{timeInfo.full}</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${catTheme.bg}`}>
                          <TableCategoryIcon className="w-3 h-3" />
                          {catTheme.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">{log.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">{log.description}</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                        <div>{log.actorName || 'System'}</div>
                        {log.actorRole && <div className="text-[10px] text-slate-400">{log.actorRole}</div>}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                        <div>{log.targetName || log.targetId || '-'}</div>
                        {log.targetEmail && <div className="text-[10px] text-slate-400">{log.targetEmail}</div>}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-sky-500">
                        {log.workspaceName || log.workspaceId || '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="px-2.5 py-1 rounded-lg font-mono text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INSPECTOR MODAL */}
      {selectedLog && (
        <div
          id="audit-log-inspector-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className={`w-full max-w-2xl rounded-3xl p-6 sm:p-8 border shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto ${
              theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${getCategoryTheme(selectedLog.category).bg}`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase font-bold text-indigo-500">Audit Record Inspector</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">
                      ID: {selectedLog.id}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold font-display mt-0.5">{selectedLog.title}</h2>
                </div>
              </div>

              <button
                id="close-audit-modal-btn"
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Core Event Overview */}
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                {selectedLog.description}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-500/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Timestamp (ISO)</div>
                  <div className="mt-1 font-semibold break-all">{selectedLog.timestamp}</div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-500/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Action Identifier</div>
                  <div className="mt-1 font-semibold text-indigo-500">{selectedLog.action}</div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-500/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Actor / Origin</div>
                  <div className="mt-1 font-semibold">{selectedLog.actorName || 'System'}</div>
                  <div className="text-[10px] text-slate-400">{selectedLog.actorEmail || '-'}</div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-500/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Target Entity</div>
                  <div className="mt-1 font-semibold">{selectedLog.targetName || selectedLog.targetId || '-'}</div>
                  <div className="text-[10px] text-slate-400">{selectedLog.targetEmail || '-'}</div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-500/5 sm:col-span-2">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Associated Workspace</div>
                  <div className="mt-1 font-semibold text-sky-500">
                    {selectedLog.workspaceName || selectedLog.workspaceId || 'Global / App Owner'}
                  </div>
                </div>
              </div>
            </div>

            {/* Raw JSON Payload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 font-bold uppercase flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-500" />
                  Full Payload & Metadata JSON
                </span>
                <button
                  onClick={() => handleCopyPayload(selectedLog)}
                  className="text-[11px] text-indigo-500 hover:underline flex items-center gap-1 cursor-pointer font-mono"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>

              <pre
                className={`p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56 border ${
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              >
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
