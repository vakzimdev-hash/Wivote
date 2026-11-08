import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { AdminDashboard } from './AdminDashboard';
import { DailyVoucherRevenueWidget } from './DailyVoucherRevenueWidget';
import { LoyaltyAnalyticsView } from './LoyaltyAnalyticsView';
import { InvestmentSection } from './InvestmentSection';
import { RecycleBinManager } from './RecycleBinManager';
import { AccessAuditView } from './AccessAuditView';
import { UserPlus, Shield, Users, Mail, Phone, CreditCard, Star, Settings, LayoutDashboard, Edit2, Power, Trash2, AlertTriangle, X, Check, Database, Download, Upload, RefreshCw, ShieldAlert, Sparkles, Coins, Activity, MapPin } from 'lucide-react';
import { Role, UserProfile } from '../types';
import { WorkspaceMasterSkeleton } from './DashboardSkeleton';
import { SubscriptionSliderSelector } from './SubscriptionSliderSelector';
import { CountryPhoneInput, INTERNATIONAL_COUNTRIES } from './CountryPhoneInput';
import { canAccessWorkspaceMaster, isAppOwnerAccount, getWorkspaceActiveAgents, getWorkspaceUsers } from '../utils/rbacPolicy';
import { AgentLocationModal } from './AgentLocationModal';
import { TabStripContainer } from './TabStripContainer';

export const WorkspaceMasterDashboard: React.FC = () => {
  const { 
    users, 
    activeWorkspace, 
    addUserByMaster, 
    createAgent,
    editUserByMaster, 
    deleteUserByMaster, 
    updateWorkspaceName, 
    theme, 
    currentUser, 
    exportWorkspaceData, 
    importWorkspaceData, 
    pricingPackages,
    onboardWorkspace,
    showToast,
    recycleBin,
    auditLogs
  } = useApp();

  if (!canAccessWorkspaceMaster(currentUser)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-black tracking-tight mb-2 uppercase text-rose-500">Security Access Denied</h1>
        <p className="text-sm max-w-md opacity-80 leading-relaxed font-mono">
          Strict separation of privileges is enforced. Agent accounts are unconditionally barred from administrative access.
        </p>
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const [activeTab, setActiveTab] = useState<'operations' | 'investment' | 'loyalty' | 'personnel' | 'database' | 'recycle_bin' | 'audit'>('operations');
  const lastTapRef = React.useRef<number>(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Agent');
  const [cell, setCell] = useState('');
  const [agentCountry, setAgentCountry] = useState({ code: '+263', name: 'Zimbabwe', flag: '🇿🇼', placeholder: '77112233' });
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdUserPassword, setCreatedUserPassword] = useState('');

  useEffect(() => {
    if (activeWorkspace?.telephoneCode) {
      const match = INTERNATIONAL_COUNTRIES.find(c => c.code === activeWorkspace.telephoneCode);
      if (match) {
        setAgentCountry({
          code: match.code,
          name: match.name,
          flag: match.flag,
          placeholder: match.placeholder
        });
      }
    } else if (currentUser?.cellNumber) {
      const adminCell = currentUser.cellNumber;
      const sortedCountries = [...INTERNATIONAL_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
      const matchedCountry = sortedCountries.find(c => adminCell.startsWith(c.code + ' ') || adminCell.startsWith(c.code));
      if (matchedCountry) {
        setAgentCountry({
          code: matchedCountry.code,
          name: matchedCountry.name,
          flag: matchedCountry.flag,
          placeholder: matchedCountry.placeholder
        });
      }
    }
  }, [activeWorkspace?.telephoneCode, currentUser]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  // Workspace Onboarding / Setup State
  const [onboardName, setOnboardName] = useState('');
  const [onboardTier, setOnboardTier] = useState<'Starter' | 'Gold' | 'Lithium'>('Starter');
  const [onboardTrial, setOnboardTrial] = useState<'trial' | 'payment'>('trial');
  const [onboardMonths, setOnboardMonths] = useState(1);
  const [onboardErr, setOnboardErr] = useState('');
  const [onboardOk, setOnboardOk] = useState(false);

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardName.trim()) {
      setOnboardErr('Workspace name is required.');
      return;
    }
    const res = await onboardWorkspace(onboardName.trim(), onboardTier, onboardTrial, onboardMonths);
    if (res.success) {
      setOnboardOk(true);
      setOnboardErr('');
      // Give a tiny moment for smooth visual feedback before refreshing
      setTimeout(() => {
        setOnboardOk(false);
      }, 2000);
    } else {
      setOnboardErr(res.error || 'Failed to create workspace.');
    }
  };

  const handleStartEdit = () => {
    setEditedName(activeWorkspace?.name || '');
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (activeWorkspace && editedName.trim()) {
      updateWorkspaceName(activeWorkspace.id, editedName.trim());
      setIsEditingName(false);
    }
  };

  // State for registering a user
  const wsDefaultRate = String(activeWorkspace?.cashCloseSettings?.defaultCommissionRate ?? 10);
  const [targetAmount, setTargetAmount] = useState('500');
  const [commissionRate, setCommissionRate] = useState(wsDefaultRate);
  const [agentLocation, setAgentLocation] = useState('Harare Central');

  // State for editing a user
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCell, setEditCell] = useState('');
  const [editRole, setEditRole] = useState<Role>('Agent');
  const [editLocation, setEditLocation] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editProfilePic, setEditProfilePic] = useState('');
  const [editTargetAmount, setEditTargetAmount] = useState('500');
  const [editCommissionRate, setEditCommissionRate] = useState(wsDefaultRate);

  // Agent Location Modal State
  const [selectedAgentForLocation, setSelectedAgentForLocation] = useState<UserProfile | null>(null);
  const [isAgentLocationModalOpen, setIsAgentLocationModalOpen] = useState(false);

  const handleSaveAgentLocation = async (agentUid: string, newLocation: string) => {
    try {
      await editUserByMaster(agentUid, { location: newLocation });
      showToast(`Operating location updated to "${newLocation}"`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update agent location', 'error');
      throw err;
    }
  };

  // State for confirming termination of a user
  const [terminatingUser, setTerminatingUser] = useState<UserProfile | null>(null);

  const handleStartEditUser = (u: UserProfile) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditCell(u.cellNumber);
    setEditRole(u.role);
    setEditLocation(u.location || 'Harare Central');
    setEditPassword(u.password || 'password');
    setEditProfilePic(u.profilePic || '');
    setEditTargetAmount(u.targetAmount !== undefined ? String(u.targetAmount) : '500');
    setEditCommissionRate(u.commissionRate !== undefined ? String(u.commissionRate) : wsDefaultRate);
  };

  const handleSaveUserEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    editUserByMaster(editingUser.uid, {
      name: editName,
      email: editEmail,
      cellNumber: editCell,
      role: editRole,
      location: editLocation.trim() || 'Harare Central',
      password: editPassword,
      profilePic: editProfilePic,
      targetAmount: Number(editTargetAmount) || 500,
      commissionRate: Number(editCommissionRate) || 10,
    });
    setEditingUser(null);
  };

  const handleToggleDeactivate = (u: UserProfile) => {
    if (currentUser && currentUser.uid === u.uid) return;
    editUserByMaster(u.uid, {
      isDeactivated: !u.isDeactivated,
    });
  };

  const [isTerminating, setIsTerminating] = useState(false);

  const handleConfirmTerminate = async () => {
    if (!terminatingUser) return;
    setIsTerminating(true);
    try {
      const res = await deleteUserByMaster(terminatingUser.uid, terminatingUser);
      if (res && res.error) {
        showToast(res.error, 'error');
      } else {
        showToast(`User ${terminatingUser.name} permanently deleted. Email & credentials are now freed for reuse.`, 'success');
      }
      setTerminatingUser(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete user account.', 'error');
    } finally {
      setIsTerminating(false);
    }
  };

  // Filter and deduplicate users belonging ONLY to current workspace for Staff Directory
  const workspaceUsers = React.useMemo(() => {
    return getWorkspaceUsers(users, activeWorkspace, currentUser);
  }, [users, activeWorkspace, currentUser]);

  // Authoritative active agents list for current workspace (harmonized with AdminDashboard)
  const activeAgents = React.useMemo(() => {
    return getWorkspaceActiveAgents(users, activeWorkspace, currentUser);
  }, [users, activeWorkspace, currentUser]);
  const currentAgentsCount = activeAgents.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !cell) return;

    // Check agents allowed per plan in plan settings
    const activeTier = activeWorkspace?.subscriptionTier || 'Starter';
    const currentPlan = pricingPackages.find(p => p.id === activeTier);
    const maxAgents = currentPlan ? currentPlan.maxAgents : (activeTier === 'Lithium' ? 15 : activeTier === 'Gold' ? 7 : 3);

    const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;

    if (!isAppOwner && role === 'Agent' && currentAgentsCount >= maxAgents) {
      setErrorMsg(`Agent limit reached. Your active plan (${activeTier}) only allows a maximum of ${maxAgents} agents.`);
      setTimeout(() => setErrorMsg(''), 5000);
      return;
    }

    const fullCell = `${agentCountry.code} ${cell.trim()}`;

    if (role === 'Agent' && activeWorkspace && currentUser) {
      const res = await createAgent(activeWorkspace.id, currentUser.uid, name, email, fullCell, undefined, Number(targetAmount) || 500, Number(commissionRate) || 10, agentLocation.trim() || 'Harare Central');
      if (res.success && res.tempPassword) {
        setCreatedUserPassword(res.tempPassword);
        setName('');
        setEmail('');
        setCell('');
        setTargetAmount('500');
        setCommissionRate('10');
        setAgentLocation('Harare Central');
        setErrorMsg('');
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setCreatedUserPassword('');
        }, 12000);
      } else {
        setErrorMsg(res.error || 'Failed to create agent.');
      }
    } else {
      const pwd = addUserByMaster(email, name, role, fullCell);
      setCreatedUserPassword(pwd);
      setName('');
      setEmail('');
      setCell('');
      setErrorMsg('');
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setCreatedUserPassword('');
      }, 12000);
    }
  };

  // RBAC Security Policy Guard: Agents are strictly prohibited from viewing or accessing Workspace Master functions
  if (!canAccessWorkspaceMaster(currentUser)) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 min-h-[70vh]">
        <div className={`border-2 p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl relative overflow-hidden transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-rose-500/30 text-slate-900' : 'bg-slate-900 border-rose-500/30 text-white'
        }`}>
          <div className="absolute top-0 inset-x-0 h-1 bg-rose-500" />
          <div className="bg-rose-500/15 p-4 rounded-full border border-rose-500/20 w-16 h-16 flex items-center justify-center mx-auto mb-5">
            <ShieldAlert className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className={`text-2xl font-black font-display uppercase tracking-wide ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
            Access Restricted
          </h2>
          <p className="text-xs text-rose-500 font-mono mt-2 font-bold uppercase tracking-wider">
            RBAC Security Policy Violation
          </p>
          <p className={`text-sm mt-4 leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
            Security policy strictly restricts Field Agent accounts from accessing or viewing Workspace Master administrative functions, user management, and workspace settings.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-rose-500 text-white hover:bg-rose-600 transition shadow-md cursor-pointer"
            >
              Return to Field Agent Terminal
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <WorkspaceMasterSkeleton theme={theme} />;
  }

  if (!activeWorkspace) {
    return (
      <div className={`min-h-[85vh] flex flex-col justify-between items-center px-4 py-12 transition-colors duration-300 ${
        theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'
      }`}>
        <div className="w-full max-w-xl mx-auto my-auto space-y-6">
          {/* Logo / Brand Header */}
          <div className="text-center">
            <div className="inline-flex flex-col items-center gap-2 mb-3">
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-sky-500/25 rounded-2xl blur-lg scale-90 pointer-events-none" />
                <img
                  src="/wivote_logo.png"
                  alt="WiVoTe Logo"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 object-contain drop-shadow-xl rounded-2xl relative z-10 transition-transform hover:scale-105"
                />
              </div>
              <span className="text-2xl font-extrabold font-display tracking-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-sky-300 bg-clip-text text-transparent">
                WiVoTe
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Create Your Workspace</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Set up your WiFi Voucher Terminal system to start managing agents and vouchers.
            </p>
          </div>

          {/* Form Card */}
          <div className={`border rounded-3xl p-6 md:p-8 shadow-xl transition-all duration-300 ${
            theme === 'light'
              ? 'bg-white border-slate-200'
              : 'bg-slate-900 border-slate-800'
          }`}>
            <form onSubmit={handleOnboardSubmit} className="space-y-6">
              {onboardErr && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{onboardErr}</span>
                </div>
              )}

              {onboardOk && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-xs text-center font-medium">
                  Workspace created successfully! Loading your terminal...
                </div>
              )}

              {/* Workspace Name */}
              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-2">
                  Workspace Name / Company Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={onboardName}
                  onChange={(e) => setOnboardName(e.target.value)}
                  placeholder="e.g. VakZim Broadband"
                  className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white'
                      : 'bg-slate-950 border-slate-800 text-white focus:bg-slate-950'
                  }`}
                />
              </div>

              {/* Pricing Plans (Compact Sliding Selector) */}
              <SubscriptionSliderSelector
                selectedTier={onboardTier}
                onChange={(tier) => setOnboardTier(tier)}
                packages={pricingPackages}
                theme={theme}
                label="Select Subscription Tier"
                id="onboard-subscription-slider"
              />

              {/* Billing Mode (Free Trial or Pay) */}
              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-2">
                  SaaS Billing Option
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOnboardTrial('trial')}
                    className={`border rounded-2xl p-3 text-center transition cursor-pointer text-xs font-bold ${
                      onboardTrial === 'trial'
                        ? 'border-sky-500 bg-sky-500/10 text-sky-500'
                        : theme === 'light'
                          ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          : 'border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    7-Day Free Trial
                  </button>
                  <button
                    type="button"
                    disabled
                    className={`border rounded-2xl p-3 text-center transition text-[10px] font-mono uppercase font-bold opacity-50 cursor-not-allowed ${
                      theme === 'light'
                        ? 'border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-850 bg-slate-950 text-slate-500'
                    }`}
                  >
                    Coming Soon (Payment Gateway Deactivated)
                  </button>
                </div>
              </div>

              {/* If Paid subscription chosen, select duration */}
              {onboardTrial === 'payment' && (
                <div className="p-4 rounded-2xl border border-dashed border-slate-200/20 bg-slate-500/5 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-400">Subscription Period:</span>
                    <span className="text-sky-500">{onboardMonths} Month{onboardMonths > 1 ? 's' : ''}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={onboardMonths}
                    onChange={(e) => setOnboardMonths(parseInt(e.target.value))}
                    className="w-full accent-sky-500 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span>1 mo</span>
                    <span>6 mo</span>
                    <span>12 mo</span>
                  </div>
                  
                  {/* Real-time total cost estimation */}
                  <div className="pt-3 border-t border-slate-200/10 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold">Total Payable Amount:</span>
                    <span className="text-sm font-extrabold text-emerald-500">
                      ${(pricingPackages.find(p => p.id === onboardTier)?.price || 29) * onboardMonths}.00
                    </span>
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={onboardOk}
                className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl transition shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                Create and Activate Workspace
              </button>
            </form>
          </div>
        </div>

        {/* Global Attribution bottom footer */}
        <div className="text-center mt-12 text-[11px] font-mono text-slate-400 font-bold uppercase tracking-widest">
          By VakZim ICT&E
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full max-w-full overflow-x-hidden">
      {/* Top Banner with Subscription Stats */}
      <div className={`border rounded-3xl p-5 sm:p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden transition-all duration-300 w-full max-w-full ${
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
          : 'bg-slate-900 border-slate-800 text-white shadow-xl'
      }`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div>
          <span className={`border text-[10px] font-mono uppercase px-3 py-1 rounded-full font-black tracking-widest ${
            theme === 'light'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-sm'
          }`}>
            💼 WORKSPACE OWNER & DIRECTORY EXECUTIVE COCKPIT
          </span>
          {isEditingName ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                maxLength={40}
                className={`text-xl font-extrabold font-display px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-sky-500 max-w-xs ${
                  theme === 'light' 
                    ? 'bg-white border-slate-300 text-slate-900' 
                    : 'bg-slate-950 border-slate-700 text-white'
                }`}
                autoFocus
                placeholder="Enter Company Name"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveName}
                  className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  className={`text-xs font-bold px-3 py-2 rounded-lg transition cursor-pointer ${
                    theme === 'light' 
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col mt-3">
              <h1 
                onDoubleClick={handleStartEdit}
                onTouchStart={(e) => {
                  const now = Date.now();
                  const DOUBLE_TAP_DELAY = 300;
                  if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
                    handleStartEdit();
                    lastTapRef.current = 0;
                  } else {
                    lastTapRef.current = now;
                  }
                }}
                title="Double-click to rename workspace"
                className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tight select-none cursor-pointer transition-all duration-200 hover:opacity-80 active:scale-[0.985] break-words line-clamp-2 max-w-full ${
                  theme === 'light' ? 'text-slate-950' : 'text-white'
                }`}
              >
                {activeWorkspace?.name || 'Company Hub'}
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-1 select-none font-bold">
                (Double-tap / Double-click name to edit workspace)
              </span>
            </div>
          )}
          <p className={`text-sm mt-1 ${
            theme === 'light' ? 'text-slate-500' : 'text-slate-400'
          }`}>
            Register personnel, coordinate agent directories, manage vouchers, and track live wifi metrics.
          </p>
          <div className="flex flex-wrap items-center gap-3.5 mt-3">
            <div className={`px-2.5 py-1 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-sm ${
              theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Real-Time Sync Connected</span>
            </div>
          </div>
        </div>

        {/* Subscription Info Card */}
        <div className={`border p-4 sm:p-5 rounded-2xl flex items-center gap-4 w-full md:w-auto shrink-0 shadow-lg relative overflow-hidden ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-200'
            : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/10 to-sky-500/10 rounded-full blur-lg pointer-events-none" />
          <div className={`p-3 rounded-xl text-white ${
            activeWorkspace?.subscriptionTier === 'Lithium'
              ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
              : activeWorkspace?.subscriptionTier === 'Gold'
              ? 'bg-gradient-to-br from-amber-500 to-yellow-600'
              : 'bg-gradient-to-br from-sky-400 to-blue-600'
          }`}>
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Subscription Tier</div>
            <div className={`text-lg font-bold flex items-center gap-1.5 mt-0.5 ${
              theme === 'light' ? 'text-slate-950' : 'text-white'
            }`}>
              <span className={`px-2 py-0.5 rounded text-sm font-bold font-mono uppercase border ${
                activeWorkspace?.subscriptionTier === 'Lithium' 
                  ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                  : activeWorkspace?.subscriptionTier === 'Gold'
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  : 'bg-sky-500/10 text-sky-500 border-sky-500/30'
              }`}>
                {activeWorkspace?.subscriptionTier || 'Starter'}
              </span>
              <Star className={`w-4 h-4 ${
                activeWorkspace?.subscriptionTier === 'Lithium'
                  ? 'text-purple-500 fill-purple-500'
                  : activeWorkspace?.subscriptionTier === 'Gold'
                  ? 'text-amber-500 fill-amber-500'
                  : 'text-sky-500 fill-sky-500'
              }`} />
            </div>
            <div className="text-[10px] text-emerald-600 font-mono mt-0.5">
              Renewing on: {activeWorkspace?.expiresAt ? new Date(activeWorkspace.expiresAt).toLocaleDateString() : 'Active Lease'}
            </div>
            <div className={`text-[10px] font-mono mt-1 ${
              currentAgentsCount >= (pricingPackages.find(p => p.id === (activeWorkspace?.subscriptionTier || 'Starter'))?.maxAgents || (activeWorkspace?.subscriptionTier === 'Lithium' ? 15 : activeWorkspace?.subscriptionTier === 'Gold' ? 7 : 3))
                ? 'text-rose-500 font-bold'
                : 'text-sky-500'
            }`}>
              Agents Quota: {currentAgentsCount} / {pricingPackages.find(p => p.id === (activeWorkspace?.subscriptionTier || 'Starter'))?.maxAgents || (activeWorkspace?.subscriptionTier === 'Lithium' ? 15 : activeWorkspace?.subscriptionTier === 'Gold' ? 7 : 3)}
            </div>
          </div>
        </div>
      </div>

      {/* Chrome Tab System with App Theme Background & Continuous Accent Line */}
      <TabStripContainer
        theme={theme}
        activeTabLineGradient={
          activeTab === 'operations'
            ? 'bg-sky-500'
            : activeTab === 'investment'
            ? 'bg-indigo-600'
            : activeTab === 'loyalty'
            ? 'bg-amber-500'
            : activeTab === 'personnel'
            ? 'bg-emerald-600'
            : activeTab === 'database'
            ? 'bg-blue-600'
            : activeTab === 'recycle_bin'
            ? 'bg-rose-600'
            : 'bg-violet-600'
        }
      >
        {[
          {
            id: 'operations' as const,
            label: 'Operations Inventory',
            icon: LayoutDashboard,
            activeLine: 'bg-sky-500',
            startTextColor: 'text-sky-500',
            endTextColor: 'text-sky-500',
          },
          {
            id: 'investment' as const,
            label: 'Investments & Shareholding',
            icon: Coins,
            activeLine: 'bg-indigo-600',
            startTextColor: 'text-indigo-600',
            endTextColor: 'text-indigo-600',
          },
          {
            id: 'loyalty' as const,
            label: 'Loyalty',
            icon: Sparkles,
            activeLine: 'bg-amber-500',
            startTextColor: 'text-amber-500',
            endTextColor: 'text-amber-500',
          },
          {
            id: 'personnel' as const,
            label: 'Staff Directory',
            icon: Users,
            activeLine: 'bg-emerald-600',
            startTextColor: 'text-emerald-600',
            endTextColor: 'text-emerald-600',
          },
          {
            id: 'database' as const,
            label: 'Local DB Backup',
            icon: Database,
            activeLine: 'bg-blue-600',
            startTextColor: 'text-blue-600',
            endTextColor: 'text-blue-600',
          },
          {
            id: 'recycle_bin' as const,
            label: 'Recycle Bin & Vault',
            icon: Trash2,
            activeLine: 'bg-rose-600',
            startTextColor: 'text-rose-600',
            endTextColor: 'text-rose-600',
            count: recycleBin.filter(b => !activeWorkspace?.id || b.workspaceId === activeWorkspace.id).length
          },
          {
            id: 'audit' as const,
            label: 'Activity Log',
            icon: Activity,
            activeLine: 'bg-violet-600',
            startTextColor: 'text-violet-600',
            endTextColor: 'text-violet-600',
            count: auditLogs?.filter(l => !activeWorkspace?.id || l.workspaceId === activeWorkspace.id).length
          }
        ].map((tab, idx, arr) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isFirst = idx === 0;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}-btn`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`group relative min-h-[44px] sm:h-11 px-2.5 sm:px-5 py-1.5 sm:py-0 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-t-xl sm:rounded-t-2xl font-display text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wider shrink-0 transition-all select-none cursor-pointer ${
                isActive
                  ? `bg-gradient-to-r ${tab.activeLine} text-white shadow-xl z-20 -mb-[3px] border-0 outline-none ring-0`
                  : theme === 'light'
                    ? `bg-slate-200/90 hover:bg-slate-300 text-slate-800 border-t border-r ${isFirst ? 'border-l' : ''} border-slate-300/90 shadow-xs`
                    : `bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-t border-r ${isFirst ? 'border-l' : ''} border-slate-700/90 shadow-xs`
              }`}
            >
              {/* Outward Curving Bottom Left Wing for Active Tab */}
              {isActive && (
                <svg className={`absolute -left-3.5 sm:-left-4.5 -bottom-[3px] w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 ${tab.startTextColor} fill-current pointer-events-none z-30`} viewBox="0 0 20 20">
                  <path d="M 20 0 C 20 11.05 11.05 20 0 20 L 20 20 Z" />
                </svg>
              )}

              {/* Outward Curving Bottom Right Wing for Active Tab */}
              {isActive && (
                <svg className={`absolute -right-3.5 sm:-right-4.5 -bottom-[3px] w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 ${tab.endTextColor} fill-current pointer-events-none z-30`} viewBox="0 0 20 20">
                  <path d="M 0 0 C 0 11.05 8.95 20 20 20 L 0 20 Z" />
                </svg>
              )}

              <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors ${
                isActive ? 'text-white drop-shadow-xs' : theme === 'light' ? 'text-slate-700' : 'text-slate-400 group-hover:text-white'
              }`} />

              <span className={`whitespace-normal sm:whitespace-nowrap text-center sm:text-left leading-tight max-w-[110px] sm:max-w-none line-clamp-2 sm:line-clamp-none ${
                isActive ? 'text-white font-black drop-shadow-xs' : theme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-300 font-bold group-hover:text-white'
              }`}>
                {tab.label}
              </span>

              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-black shrink-0 ${
                  isActive
                    ? 'bg-white/30 text-white border border-white/40 shadow-xs'
                    : theme === 'light'
                      ? 'bg-slate-300 text-slate-800'
                      : 'bg-slate-800 text-slate-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </TabStripContainer>

      {/* Partitioned Section Content Container */}
      <div className={`border border-slate-200/90 dark:border-slate-800 rounded-b-2xl sm:rounded-b-3xl p-3 sm:p-6 shadow-xs relative transition-colors duration-200 ${
        theme === 'light' ? 'bg-white/95' : 'bg-slate-950/80'
      }`}>
        {/* Subtle accent lining at the top border of the partitioned section */}
        <div className={`h-[1.5px] -mt-3 sm:-mt-6 mb-3 sm:mb-6 rounded-full bg-gradient-to-r ${
          activeTab === 'operations'
            ? 'from-sky-400/80 via-cyan-400/40 to-transparent'
            : activeTab === 'investment'
            ? 'from-indigo-500/80 via-purple-500/40 to-transparent'
            : activeTab === 'loyalty'
            ? 'from-amber-400/80 via-orange-400/40 to-transparent'
            : activeTab === 'personnel'
            ? 'from-emerald-400/80 via-teal-400/40 to-transparent'
            : activeTab === 'database'
            ? 'from-blue-400/80 via-cyan-400/40 to-transparent'
            : activeTab === 'recycle_bin'
            ? 'from-rose-500/80 via-pink-500/40 to-transparent'
            : 'from-violet-500/80 via-purple-500/40 to-transparent'
        }`} />
        {/* Tab Contents */}
      {activeTab === 'operations' ? (
        /* Render full operations/admin controller dashboard */
        <div className="space-y-6 w-full max-w-full overflow-x-hidden">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <Shield className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>Admin Director Mode active: Full read/write access to voucher control, reconciliations, and legacy alerts.</span>
          </div>
          <DailyVoucherRevenueWidget 
            forcedWorkspaceId={activeWorkspace?.id} 
            forcedWorkspaceName={activeWorkspace?.name} 
          />
          <AdminDashboard />
        </div>
      ) : activeTab === 'investment' ? (
        /* Render corporate shareholding management & investment modal/section */
        <div className="w-full max-w-full overflow-x-hidden">
          <InvestmentSection />
        </div>
      ) : activeTab === 'loyalty' ? (
        /* Render Loyalty Analytics view */
        <div className="w-full max-w-full overflow-x-hidden">
          <LoyaltyAnalyticsView />
        </div>
      ) : activeTab === 'personnel' ? (
        /* Render personnel / registration view */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add User Panel */}
          <div className={`border rounded-3xl p-6 shadow-xl h-fit transition-all duration-300 ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-white shadow-xl'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-2.5 rounded-xl border ${
                theme === 'light'
                  ? 'bg-sky-50 border-sky-100 text-sky-600'
                  : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
              }`}>
                <UserPlus className="w-5 h-5" />
              </div>
              <h2 className={`text-lg font-bold font-display ${
                theme === 'light' ? 'text-slate-950' : 'text-white'
              }`}>Register Staff Profile</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs font-mono mb-1 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kondwani Phiri"
                  required
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Email Address</label>
                <div className="relative">
                  <input
                    type="email;text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@wivote.com"
                    required
                    className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none font-mono ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div>
                <CountryPhoneInput
                  id="master-create-agent-phone"
                  label="Cell Number"
                  value={cell}
                  countryCode={agentCountry.code}
                  onChange={(fullNumber, nationalNumber, country) => {
                    setCell(nationalNumber || '');
                    if (country) {
                      setAgentCountry({
                        code: country.code,
                        name: country.name,
                        flag: country.flag,
                        placeholder: country.placeholder
                      });
                    }
                  }}
                  theme={theme}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-mono mb-1 ${
                    theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                  }`}>Target Amount ($)</label>
                  <input
                    type="number"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="500"
                    required
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-mono mb-1 ${
                    theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                  }`}>Commission Rate (%)</label>
                  <input
                    type="number"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="10"
                    required
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Operating Location / Territory</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={agentLocation}
                    onChange={(e) => setAgentLocation(e.target.value)}
                    placeholder="e.g. Harare Central, Bulawayo CBD..."
                    required
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Role Designation</label>
                <select
                  value="Agent"
                  disabled
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed`}
                >
                  <option value="Agent">Field Agent (Agent Only)</option>
                </select>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Workspace masters can only create and manage Field Agents.
                </p>
              </div>

              {success && (
                <div className={`p-3 border rounded-xl text-xs flex flex-col gap-1.5 ${
                  theme === 'light'
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    <span className="font-bold">Personnel registered successfully!</span>
                  </div>
                  {createdUserPassword && (
                    <div className="p-2 bg-black/10 rounded-lg font-mono text-[11px] border border-emerald-500/10">
                      Provisional Password: <span className="font-extrabold select-all tracking-wider text-rose-500">{createdUserPassword}</span>
                      <span className="block text-[9px] text-slate-400 mt-1">* Mandatory 1st login reset flag requirePasswordChange is active.</span>
                    </div>
                  )}
                </div>
              )}

              {errorMsg && (
                <div className={`p-3 border rounded-xl text-xs flex items-center gap-2 ${
                  theme === 'light'
                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                }`}>
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 transition shadow-lg shadow-sky-500/10 cursor-pointer"
              >
                Add User to Workspace
              </button>
            </form>
          </div>

          {/* Directory Panel */}
          <div className={`border rounded-3xl p-6 shadow-xl lg:col-span-2 transition-all duration-300 ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-white shadow-xl'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  theme === 'light'
                    ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                    : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                }`}>
                  <Users className="w-5 h-5" />
                </div>
                <h2 className={`text-lg font-bold font-display ${
                  theme === 'light' ? 'text-slate-950' : 'text-white'
                }`}>Staff Directory</h2>
              </div>
              <span className={`text-xs font-mono ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Total Personnel: <span className="text-indigo-600 font-black">{workspaceUsers.length}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspaceUsers.map((u) => {
                const isSelf = currentUser?.uid === u.uid;
                const isWorkspaceMaster = u.role === 'WorkspaceMaster' || u.role?.toLowerCase()?.trim() === 'workspacemaster' || u.role?.toLowerCase()?.trim() === 'owner';
                const canDelete = !isSelf && (!isWorkspaceMaster || isAppOwnerAccount(currentUser));
                return (
                  <div
                    key={u.uid}
                    className={`p-4 border rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-200 ease-out hover:scale-[1.012] hover:shadow-sm relative overflow-hidden ${
                      u.isDeactivated
                        ? theme === 'light'
                          ? 'bg-slate-100/75 border-slate-200/80 opacity-70'
                          : 'bg-slate-950/60 border-slate-900/80 opacity-60'
                        : theme === 'light'
                          ? 'bg-slate-50 border-slate-150 hover:bg-slate-100/80 hover:border-slate-300'
                          : 'bg-slate-950 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`w-12 h-12 rounded-full overflow-hidden border shrink-0 ${
                        theme === 'light' ? 'border-slate-200' : 'border-slate-800'
                      }`}>
                        {u.profilePic ? (
                          <img referrerPolicy="no-referrer" src={u.profilePic} alt={u.name || 'Staff'} className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center text-base font-bold uppercase ${
                            theme === 'light' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {String(u.name || u.email || 'Staff').substring(0, 2)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className={`font-semibold truncate ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{u.name || u.email || 'Staff User'}</h3>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase border ${
                              u.role === 'WorkspaceMaster'
                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            }`}>
                              {u.role === 'WorkspaceMaster' ? 'Owner' : u.role}
                            </span>
                            {u.isDeactivated && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase border bg-rose-500/10 text-rose-600 border-rose-500/20">
                                Deactivated
                              </span>
                            )}
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase border bg-sky-500/10 text-sky-600 border-sky-500/20">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`text-xs truncate flex items-center gap-1 mt-1.5 ${
                          theme === 'light' ? 'text-slate-600' : 'text-slate-400'
                        }`}>
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="font-mono">{u.email}</span>
                        </div>
                        <div className={`text-xs truncate flex items-center gap-1 mt-0.5 ${
                          theme === 'light' ? 'text-slate-600' : 'text-slate-400'
                        }`}>
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span className="font-mono">{u.cellNumber}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAgentForLocation(u);
                              setIsAgentLocationModalOpen(true);
                            }}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 font-semibold truncate flex items-center gap-1 cursor-pointer transition"
                            title="Click to edit operating territory"
                          >
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span>{u.location || 'Harare Central'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Control Actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800 shrink-0">
                      <button
                        onClick={() => handleStartEditUser(u)}
                        title="Fully Edit User Profile"
                        className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-600 hover:text-sky-600 hover:border-sky-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-sky-400 hover:border-sky-900'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleToggleDeactivate(u)}
                        disabled={isSelf}
                        title={isSelf ? "You cannot deactivate yourself" : u.isDeactivated ? "Reactivate Agent" : "Deactivate Agent"}
                        className={`p-2 rounded-xl border transition flex items-center justify-center ${
                          isSelf
                            ? 'opacity-30 cursor-not-allowed text-slate-500 border-slate-200 dark:border-slate-800'
                            : u.isDeactivated
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white'
                        } cursor-pointer`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setTerminatingUser(u)}
                        disabled={!canDelete}
                        title={
                          isSelf 
                            ? "You cannot terminate yourself" 
                            : isWorkspaceMaster 
                              ? "Workspace Master accounts cannot be deleted" 
                              : "Terminate Profile Permanently"
                        }
                        className={`p-2 rounded-xl border transition flex items-center justify-center ${
                          !canDelete
                            ? 'opacity-30 cursor-not-allowed text-slate-500 border-slate-200 dark:border-slate-800'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white cursor-pointer'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeTab === 'database' ? (
        /* Render Local Database Backup & Restore view! */
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <Database className="w-3.5 h-3.5 text-sky-500" />
            <span>SaaS Tenant Database Portability & Backups. Keep local copies of your entire business operation.</span>
          </div>

          <div className={`border rounded-3xl p-6 md:p-8 shadow-xl transition-all duration-300 ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-white shadow-xl'
          }`}>
            <h2 className="text-xl font-bold font-display flex items-center gap-2">
              <Database className="w-5 h-5 text-sky-500" />
              Tenant DB Backup Utility
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Export your entire tenant workspace including all system user profiles, active and sold voucher catalogs, top-up requests, legacy devices, cash drops, and active feedback history as a single local file. This file can be imported at any time to restore your database, migrates easily, and ensures total data ownership.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              {/* Export Panel */}
              <div className={`p-6 rounded-2xl border ${
                theme === 'light' ? 'bg-slate-50/50 border-slate-150' : 'bg-slate-950/40 border-slate-800/60'
              }`}>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-500" />
                  Export Database File
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Download a secure, complete `.json` backup file of all active data inside <strong className="text-sky-500">{activeWorkspace?.name}</strong>.
                </p>
                <button
                  onClick={async () => {
                    if (!activeWorkspace) return;
                    try {
                      const data = await exportWorkspaceData(activeWorkspace.id);
                      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
                        JSON.stringify(data, null, 2)
                      )}`;
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute('href', jsonString);
                      downloadAnchor.setAttribute(
                        'download',
                        `wivote_${activeWorkspace.name.toLowerCase().replace(/\s+/g, '_')}_backup_${Date.now()}.json`
                      );
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                    } catch (err: any) {
                      alert(`Export failed: ${err.message || err}`);
                    }
                  }}
                  className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/10 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Backup File (.json)
                </button>
              </div>

              {/* Import Panel */}
              <div className={`p-6 rounded-2xl border ${
                theme === 'light' ? 'bg-slate-50/50 border-slate-150' : 'bg-slate-950/40 border-slate-800/60'
              }`}>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-sky-500" />
                  Restore / Import Database File
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Upload a previously exported backup file to restore all active workspace database files.
                </p>
                
                <label className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-500 hover:opacity-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-sky-500/10 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload & Restore Backup
                  <input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !activeWorkspace) return;

                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const parsed = JSON.parse(event.target?.result as string);
                          if (parsed.workspace?.id !== activeWorkspace.id) {
                            if (!confirm(`Warning: The backup file's workspace ID (${parsed.workspace?.id}) does not match your active workspace ID (${activeWorkspace.id}). Restoring may cause serious data mismatch. Proceed?`)) {
                              return;
                            }
                          }
                          
                          const res = await importWorkspaceData(parsed);
                          if (res.success) {
                            alert('Tenant database file restored successfully! Reloading...');
                            window.location.reload();
                          } else {
                            alert(`Restore failed: ${res.error}`);
                          }
                        } catch (err: any) {
                          alert(`Error parsing backup file: ${err.message || err}`);
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = ''; // reset
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'audit' ? (
        /* Render Real-Time Agent Activity & Audit Trail */
        <div className="w-full max-w-full overflow-x-hidden space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <Activity className="w-3.5 h-3.5 text-sky-500" />
            <span>Audit Trail & Activity Log: Real-time tracking of agent actions, customer profile updates, and registry deletions.</span>
          </div>
          <AccessAuditView />
        </div>
      ) : (
        /* Render Recycle Bin and Account DB Vault */
        <RecycleBinManager workspaceId={activeWorkspace?.id} />
      )}
      </div>

      {/* Modern Popups / Modals */}
      
      {/* 1. Fully Edit Staff Member Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 relative flex flex-col max-h-[90vh] ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6 shrink-0">
              <div className="p-2.5 bg-sky-500/10 text-sky-500 rounded-xl">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display">Edit Staff Profile</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">UID: {editingUser.uid}</p>
              </div>
            </div>

            <form onSubmit={handleSaveUserEdit} className="flex flex-col min-h-0 overflow-hidden">
              <div className="space-y-4 overflow-y-auto pr-1.5 mb-4 flex-grow max-h-[55vh] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                <div>
                  <label className="block text-xs font-mono mb-1 text-slate-400">Full Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>

              <div>
                <label className="block text-xs font-mono mb-1 text-slate-400">Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono mb-1 text-slate-400">Cell Number</label>
                <input
                  type="text"
                  value={editCell}
                  onChange={(e) => setEditCell(e.target.value)}
                  required
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono mb-1 text-slate-400">Role Designation</label>
                <select
                  value="Agent"
                  disabled
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed`}
                >
                  <option value="Agent">Field Agent (Agent Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono mb-1 text-slate-400">Operating Location / Territory</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="e.g. Harare Central, Bulawayo CBD..."
                    required
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono mb-1 text-slate-400">Target Amount ($)</label>
                  <input
                    type="number"
                    value={editTargetAmount}
                    onChange={(e) => setEditTargetAmount(e.target.value)}
                    required
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono mb-1 text-slate-400">Commission Rate (%)</label>
                  <input
                    type="number"
                    value={editCommissionRate}
                    onChange={(e) => setEditCommissionRate(e.target.value)}
                    required
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono mb-1 text-slate-400">Set / Reset Workspace Password</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  required
                  placeholder="e.g. 123456"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono mb-1 text-slate-400">Profile Picture URL</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={editProfilePic}
                    onChange={(e) => setEditProfilePic(e.target.value)}
                    placeholder="e.g. https://images.unsplash.com/..."
                    className={`flex-grow border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                  {editProfilePic && (
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-800 shrink-0">
                      <img referrerPolicy="no-referrer" src={editProfilePic} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    theme === 'light'
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-sky-500 to-indigo-500 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 transition shadow-lg shadow-sky-500/10 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Terminate/Delete Staff Member Confirmation Modal */}
      {terminatingUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-sm rounded-3xl border shadow-2xl p-6 text-center ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="bg-rose-500/15 p-4 rounded-full border border-rose-500/20 w-16 h-16 flex items-center justify-center mx-auto mb-4 text-rose-500">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-bold font-display">Confirm Profile Termination</h3>
            <p className="text-xs text-rose-500 font-mono mt-1">Permanently Delete Account</p>
            
            <p className={`text-sm mt-4 leading-relaxed ${
              theme === 'light' ? 'text-slate-600' : 'text-slate-300'
            }`}>
              Are you sure you want to terminate <span className="font-bold text-rose-500">{terminatingUser.name}</span>? 
            </p>
            <div className={`mt-3 p-3 rounded-xl border text-left text-xs leading-relaxed ${
              theme === 'light' 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : 'bg-rose-950/40 border-rose-900/60 text-rose-300'
            }`}>
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Automatic DB File Preservation</span>
              </div>
              A complete database snapshot of their profile, vouchers, sales, and cash drop records will be securely archived into your <span className="font-bold underline">Recycle Bin & Vault</span>. You can restore this account, download the DB file, or email it at any time.
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60">
              <button
                type="button"
                disabled={isTerminating}
                onClick={() => setTerminatingUser(null)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
                  isTerminating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTerminating}
                onClick={handleConfirmTerminate}
                className={`flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-rose-600/10 flex items-center justify-center gap-2 ${
                  isTerminating ? 'opacity-70 cursor-wait' : 'cursor-pointer'
                }`}
              >
                {isTerminating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Purging...</span>
                  </>
                ) : (
                  <span>Terminate</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Agent Operating Location Modal */}
      <AgentLocationModal
        isOpen={isAgentLocationModalOpen}
        onClose={() => {
          setIsAgentLocationModalOpen(false);
          setSelectedAgentForLocation(null);
        }}
        agent={selectedAgentForLocation}
        onSaveLocation={handleSaveAgentLocation}
        theme={theme}
      />
    </div>
  );
};
