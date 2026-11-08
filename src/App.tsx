import React, { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Splash } from './components/Splash';
import { Header } from './components/Header';
import { UserProfileModal } from './components/UserProfileModal';
import { AppSettingsModal } from './components/AppSettingsModal';
import { WorkspaceSnapshotModal } from './components/WorkspaceSnapshotModal';
import { Authenticator } from './components/Authenticator';
import { LoginScreen } from './components/LoginScreen';
import { PasswordUpdateTerminal } from './components/PasswordUpdateTerminal';
import { InactivityTimer } from './components/InactivityTimer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppUpdateModal } from './components/AppUpdateModal';
import { initAppUpdateWatcher } from './utils/appUpdateManager';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, isFirebasePlaceholder } from './firebase';
import { ShieldAlert, HelpCircle, AlertTriangle, ArrowRight, Crown, Building2, UserCheck, Eye, Coins, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { isAgentAccount, isWorkspaceMasterAccount, isAppOwnerAccount } from './utils/rbacPolicy';
import { lazyWithRetry } from './utils/lazyWithRetry';

const AppOwnerDashboard = lazyWithRetry(() => import('./components/AppOwnerDashboard').then(m => ({ default: m.AppOwnerDashboard })), 'AppOwnerDashboard');
const WorkspaceMasterDashboard = lazyWithRetry(() => import('./components/WorkspaceMasterDashboard').then(m => ({ default: m.WorkspaceMasterDashboard })), 'WorkspaceMasterDashboard');
const AgentDashboard = lazyWithRetry(() => import('./components/AgentDashboard').then(m => ({ default: m.AgentDashboard })), 'AgentDashboard');
const InvestorPortal = lazyWithRetry(() => import('./components/InvestorPortal').then(m => ({ default: m.InvestorPortal })), 'InvestorPortal');

const dashboardTransitionVariants: Variants = {
  initial: {
    opacity: 0,
    y: 18,
    filter: 'blur(4px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'none',
    transition: {
      duration: 0.38,
      ease: [0.16, 1, 0.3, 1] as const,
    },
    transitionEnd: {
      transform: 'none',
      filter: 'none',
    },
  },
  exit: {
    opacity: 0,
    y: -14,
    filter: 'blur(2px)',
    transition: {
      duration: 0.22,
      ease: [0.4, 0, 1, 1] as const,
    },
  },
};

/**
 * Isolated Footer Live Sync Button
 * Maintains its 1-second countdown tick locally so that
 * the rest of the application never re-renders every second.
 * Eliminates all page blinking, bouncing, and layout shifts.
 */
const FooterLiveSyncButton: React.FC = () => {
  const { isLiveRefresh, toggleLiveRefresh, theme, refreshCountdown } = useApp();

  return (
    <button
      type="button"
      onClick={toggleLiveRefresh}
      className={`relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border transition-colors duration-150 cursor-pointer select-none shrink-0 overflow-hidden active:scale-95 ${
        isLiveRefresh
          ? theme === 'light'
            ? 'bg-emerald-50 border-emerald-400 text-emerald-800 ring-1 ring-emerald-500/20'
            : 'bg-emerald-950/70 border-emerald-500/70 text-emerald-300 ring-1 ring-emerald-400/20'
          : theme === 'light'
            ? 'bg-slate-100 border-slate-300 text-slate-500 hover:border-slate-400'
            : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:border-slate-600'
      }`}
      title={`Live Sync: ${isLiveRefresh ? `ACTIVE (${refreshCountdown}s remaining)` : 'PAUSED'}. Tap to toggle.`}
      aria-label={`Live sync toggle (${isLiveRefresh ? `${refreshCountdown}s` : 'OFF'})`}
    >
      <span className="relative z-10 text-[10px] sm:text-[11px] font-mono font-bold tabular-nums tracking-normal leading-none inline-block w-5 text-center select-none">
        {isLiveRefresh ? refreshCountdown : 'OFF'}
      </span>
    </button>
  );
};

const FooterForceRefreshButton: React.FC = () => {
  const { refetchData, isRefetching, theme } = useApp();

  return (
    <button
      type="button"
      onClick={() => refetchData()}
      disabled={isRefetching}
      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border transition-colors duration-150 cursor-pointer flex items-center justify-center shrink-0 active:scale-95 ${
        theme === 'light'
          ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white'
      }`}
      title="Force immediate Firestore re-fetch"
    >
      <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefetching ? 'animate-spin text-sky-500' : ''}`} />
    </button>
  );
};

const GlobalAppFooter: React.FC = () => {
  const { theme } = useApp();

  return (
    <footer className={`fixed bottom-0 left-0 right-0 z-50 w-full border-t transition-colors duration-200 backdrop-blur-md shrink-0 h-11 sm:h-12 overflow-hidden shadow-lg ${
      theme === 'light'
        ? 'bg-white/95 border-slate-200/90 text-slate-600 shadow-slate-900/10'
        : 'bg-slate-900/95 border-slate-800 text-slate-400 shadow-black/40'
    }`}>
      <div className="max-w-[1440px] w-full h-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <FooterLiveSyncButton />
          <FooterForceRefreshButton />
        </div>
        <span className="text-[10px] sm:text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate select-none">
          By VakZim ICT&E {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
};

const WiVoTeApp: React.FC = () => {
  const {
    showSplash,
    setShowSplash,
    theme,
    currentUser,
    activeWorkspace,
    isWorkspaceUnlocked,
    isLoggedIn,
    logoutUser,
    toast,
    loading,
    initialized,
    globalLoading,
    isWorkspaceMetadataLoaded,
    isMetricsSyncing,
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    refetchData,
    showToast,
    addNotification,
    isSnapshotModalOpen,
    setIsSnapshotModalOpen
  } = useApp();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewRole, setPreviewRole] = useState<'AppOwner' | 'WorkspaceMaster' | 'Agent' | 'Investor' | null>(null);

  // Automated System Update Monitoring & Detection
  useEffect(() => {
    initAppUpdateWatcher();

    const handleUpdateDetected = (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      const version = customEvent.detail?.version || 'latest';
      showToast(`⚡ Software update (${version}) detected from server! Updating terminal...`, 'info');
      try {
        addNotification(`⚡ System Update: A new update (v${version}) was detected from the server. Updating terminal session...`, {
          isBroadcast: true,
          targetAudience: 'ALL'
        });
      } catch {}
    };

    window.addEventListener('wivote:system-update-detected', handleUpdateDetected);
    return () => {
      window.removeEventListener('wivote:system-update-detected', handleUpdateDetected);
    };
  }, [showToast, addNotification]);

  // Safety timer ensuring terminal initializing gate never hangs
  const [gateTimedOut, setGateTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoggedIn) {
      setGateTimedOut(false);
      return;
    }
    setGateTimedOut(false);
    const timer = setTimeout(() => {
      setGateTimedOut(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isLoggedIn]);

  // 1. Render splash screen first (snappy 0.75s max or dismissed on tap)
  if (showSplash) {
    return <Splash onComplete={() => setShowSplash(false)} />;
  }

  // 1.2. Streamlined Initializing & Loading Gate:
  // Only applies to authenticated sessions that are synchronizing.
  // Unauthenticated users proceed directly to LoginScreen with 0 delay!
  const isInitializingGateActive = isLoggedIn && !gateTimedOut && (
    !initialized || globalLoading || !currentUser || !isWorkspaceMetadataLoaded || isMetricsSyncing
  );

  if (isInitializingGateActive) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center font-mono text-xs transition-colors duration-300 p-6 ${
        theme === 'light' ? 'bg-slate-50 text-slate-500' : 'bg-slate-950 text-slate-400'
      }`}>
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          {/* Logo integrated for Starting, Hydrating, or Updating state */}
          <div className="relative mb-2 flex items-center justify-center">
            <div className="hidden sm:block absolute inset-0 bg-sky-500/10 rounded-2xl blur-md scale-90 pointer-events-none" />
            <img
              src="/wivote_logo.png"
              alt="WiVoTe Logo"
              decoding="async"
              className="w-16 h-16 object-contain rounded-2xl relative z-10 animate-pulse"
            />
          </div>
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="flex flex-col items-center gap-1">
            <span className="font-bold tracking-widest uppercase text-emerald-500 flex items-center gap-2">
              <span>Synchronizing Metrics...</span>
            </span>
            <span className="text-[10px] opacity-70">
              Fetching up-to-date sales, commissions &amp; reconciliations
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              logoutUser();
              window.location.reload();
            }}
            className="mt-2 text-[11px] font-mono text-slate-500 hover:text-emerald-500 flex items-center gap-1.5 transition underline cursor-pointer"
          >
            <span>Reset session & reload</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // 1.5. Render LoginScreen if unauthenticated or not logged in
  if (!isLoggedIn || !currentUser) {
    return <LoginScreen />;
  }

  // 1.55. Force password update if requirePasswordChange flag is set
  if (currentUser?.requirePasswordChange) {
    return <PasswordUpdateTerminal />;
  }

  // 1.6. Role Evaluation & Strict Policy Enforcement
  const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
  const isAppOwner = isAppOwnerAccount(currentUser) || isDeveloperEmail;
  const isAgent = isAgentAccount(currentUser);
  const isInvestor = currentUser?.role === 'Investor';
  const isWorkspaceMasterOrAdmin = !isAgent && !isInvestor && isWorkspaceMasterAccount(currentUser);

  // Strict Policy: Agent accounts are strictly locked to 'Agent' role. Under no condition can an agent account access or preview any master role.
  const effectiveRole = isAgent
    ? 'Agent'
    : (isAppOwner && previewRole)
      ? previewRole
      : isInvestor
        ? 'Investor'
        : isAppOwner
          ? 'AppOwner'
          : isWorkspaceMasterOrAdmin
            ? 'WorkspaceMaster'
            : 'Unknown';

  const needsWorkspaceOnboarding = isWorkspaceMasterOrAdmin && !activeWorkspace && (!currentUser?.workspaceId || currentUser?.workspaceId === '' || currentUser?.workspaceId === 'system');

  console.log('[WiVoTe App Routing Debug]', {
    uid: currentUser?.uid,
    email: currentUser?.email,
    role: currentUser?.role,
    isAgent,
    isWorkspaceMasterOrAdmin,
    activeWorkspaceId: activeWorkspace?.id,
    workspaceIdOnUser: currentUser?.workspaceId,
    needsWorkspaceOnboarding
  });

  if (needsWorkspaceOnboarding) {
    return (
      <div className={`min-h-screen flex flex-col justify-between transition-colors duration-300 relative ${
        theme === 'light' 
          ? 'bg-slate-50 text-slate-900' 
          : 'bg-slate-950 text-white'
      }`}>
        {/* Logout button top-right */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={logoutUser}
            className={`px-3 py-1.5 border rounded-xl text-xs font-bold font-mono uppercase cursor-pointer transition flex items-center gap-1.5 ${
              theme === 'light'
                ? 'bg-white border-slate-200 text-rose-650 hover:bg-rose-50 hover:border-rose-300'
                : 'bg-slate-950 border-slate-800 text-rose-400 hover:bg-slate-900 hover:border-rose-900'
            }`}
          >
            Sign Out
          </button>
        </div>

        <div className="flex-grow flex flex-col justify-center">
          <React.Suspense fallback={
            <div className="flex-grow flex flex-col items-center justify-center min-h-[50vh] gap-3">
              <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-mono tracking-widest opacity-70">HYDRATING ONBOARDING...</span>
            </div>
          }>
            <WorkspaceMasterDashboard />
          </React.Suspense>
        </div>
        
        <GlobalAppFooter />
      </div>
    );
  }

  // 2. Subscription state blocker (unpaid clients are prevented from running workspaces)
  // AppOwner role is ALWAYS permitted to allow backend management
  const isSubscriptionExpired = !isAppOwner && activeWorkspace && 
    (!activeWorkspace.isActive || (activeWorkspace.expiresAt ? new Date(activeWorkspace.expiresAt) < new Date() : false));
  const isDeactivated = currentUser?.isDeactivated && !isAppOwner;

  return (
    <div className={`min-h-screen flex flex-col max-w-full w-full transition-colors duration-300 ${
      theme === 'light' 
        ? 'bg-slate-50 text-slate-800' 
        : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Header Bar */}
      <Header 
        onOpenProfile={() => setIsProfileOpen(true)} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-grow flex flex-col relative w-full max-w-full pt-16 sm:pt-18 md:pt-20 pb-12 sm:pb-14">
        {!isWorkspaceUnlocked && !isAppOwner && !isAgent ? (
          <Authenticator />
        ) : isDeactivated ? (
          /* Account Deactivated Blocker page */
          <div className="flex-grow flex items-center justify-center p-6">
            <div className={`border-2 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative overflow-hidden transition-all duration-300 ${
              theme === 'light'
                ? 'bg-white border-amber-500/30 text-slate-850'
                : 'bg-slate-900 border-amber-500/30 text-white'
            }`}>
              <div className="absolute top-0 inset-x-0 h-1 bg-amber-500" />
              <div className="bg-amber-500/15 p-4 rounded-full border border-amber-500/20 w-16 h-16 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className={`text-2xl font-black font-display uppercase tracking-wide ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>Account Deactivated</h2>
              <p className="text-xs text-amber-500 font-mono mt-2">
                User UID: {currentUser?.uid}
              </p>
              <p className={`text-sm mt-4 leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                Your agent profile has been deactivated by the Workspace Master. Please contact your manager or system administrator to restore active access.
              </p>
              
              <div className={`mt-6 p-3.5 rounded-xl text-left border flex items-start gap-2.5 ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <HelpCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <span className={`text-[11px] font-mono leading-normal ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Need Help? Contact system engineering directory at billing@wivote.com referencing {activeWorkspace?.name || 'VakZim ICT&E'}.
                </span>
              </div>
            </div>
          </div>
        ) : isSubscriptionExpired ? (
          /* Subscription Unpaid Blocker page */
          <div className="flex-grow flex items-center justify-center p-6">
            <div className={`border-2 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative overflow-hidden transition-all duration-300 ${
              theme === 'light'
                ? 'bg-white border-red-500/30 text-slate-850'
                : 'bg-slate-900 border-red-500/30 text-white'
            }`}>
              <div className="absolute top-0 inset-x-0 h-1 bg-red-500" />
              <div className="bg-red-500/15 p-4 rounded-full border border-red-500/20 w-16 h-16 flex items-center justify-center mx-auto mb-5">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
              <h2 className={`text-2xl font-black font-display uppercase tracking-wide ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>Subscription expired</h2>
              <p className="text-xs text-red-500 font-mono mt-2">
                Workspace ID: {activeWorkspace?.id}
              </p>
              <p className={`text-sm mt-4 leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                Your workspace subscription has expired. Please contact the App Owner or Workspace Master to renew your plan and restore active sales.
              </p>
              
              <div className={`mt-6 p-3.5 rounded-xl text-left border flex items-start gap-2.5 ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <HelpCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <span className={`text-[11px] font-mono leading-normal ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Need Help? Contact system engineering directory at billing@wivote.com referencing {activeWorkspace?.name || 'VakZim ICT&E'}.
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Route to respective role-based dashboard with smooth slide-in fade-in transition */
          <div className="flex-grow flex flex-col w-full max-w-full overflow-x-hidden">
            {/* App Owner Role View Switcher Bar (Strictly forbidden for Agent accounts) */}
            {isAppOwner && !isAgent && (
              <div className={`border-b transition-colors select-none ${
                theme === 'light' 
                  ? 'bg-slate-100/70 border-slate-200/80' 
                  : 'bg-slate-900/50 border-slate-800'
              }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 w-full max-w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Eye className="w-4 h-4 text-sky-500 shrink-0" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                      Live Role View:
                    </span>
                    {previewRole && previewRole !== 'AppOwner' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Previewing {previewRole === 'WorkspaceMaster' ? 'Workspace Master' : 'Field Agent'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                    {/* Active Workspace Selector Dropdown for App Owner context previewing */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 shrink-0">
                        Workspace:
                      </span>
                      <select
                        value={selectedWorkspaceId || (workspaces[0]?.id || '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedWorkspaceId(val || null);
                        }}
                        className={`text-xs font-mono font-black px-2.5 py-1.5 rounded-xl border shadow-sm outline-none transition cursor-pointer flex-1 sm:flex-initial max-w-[200px] truncate ${
                          theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 focus:border-sky-500'
                            : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-900 focus:border-sky-500'
                        }`}
                      >
                        {workspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            {ws.name} ({ws.subscriptionTier})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-950/80 border border-slate-300/40 dark:border-slate-800 shadow-inner overflow-x-auto no-scrollbar w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setPreviewRole('AppOwner')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
                        effectiveRole === 'AppOwner'
                          ? theme === 'light'
                            ? 'bg-white text-sky-700 shadow-sm font-extrabold'
                            : 'bg-sky-500 text-slate-950 shadow-md font-extrabold shadow-sky-500/20'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="Switch to App Owner Dashboard"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      <span>App Owner</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewRole('WorkspaceMaster')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
                        effectiveRole === 'WorkspaceMaster'
                          ? theme === 'light'
                            ? 'bg-white text-indigo-700 shadow-sm font-extrabold'
                            : 'bg-indigo-500 text-white shadow-md font-extrabold shadow-indigo-500/20'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="Switch to Workspace Master Dashboard"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Workspace Master</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewRole('Agent')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
                        effectiveRole === 'Agent'
                          ? theme === 'light'
                            ? 'bg-white text-emerald-700 shadow-sm font-extrabold'
                            : 'bg-emerald-500 text-slate-950 shadow-md font-extrabold shadow-emerald-500/20'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="Switch to Field Agent Terminal"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Field Agent</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewRole('Investor')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
                        effectiveRole === 'Investor'
                          ? theme === 'light'
                            ? 'bg-white text-indigo-700 shadow-sm font-extrabold'
                            : 'bg-indigo-500 text-white shadow-md font-extrabold shadow-indigo-500/20'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="Switch to Investor Executive Portal"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>Investor</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

            <AnimatePresence mode="wait">
              <motion.div
                key={effectiveRole}
                variants={dashboardTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex-grow flex flex-col w-full max-w-full overflow-x-hidden"
              >
                <React.Suspense fallback={
                  <div className="flex-grow flex flex-col items-center justify-center min-h-[50vh] gap-3">
                    {/* Logo integrated for Hydrating state */}
                    <div className="relative mb-1 flex items-center justify-center">
                      <div className="hidden sm:block absolute inset-0 bg-sky-500/10 rounded-2xl blur-md scale-90 pointer-events-none" />
                      <img
                        src="/wivote_logo.png"
                        alt="WiVoTe Logo"
                        decoding="async"
                        className="w-12 h-12 object-contain rounded-2xl relative z-10 animate-pulse"
                      />
                    </div>
                    <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] font-mono tracking-widest opacity-70">HYDRATING VIEW...</span>
                  </div>
                }>
                  {effectiveRole === 'AppOwner' ? (
                    <AppOwnerDashboard />
                  ) : effectiveRole === 'Agent' ? (
                    <AgentDashboard isPreview={isAppOwner && previewRole === 'Agent'} />
                  ) : effectiveRole === 'WorkspaceMaster' ? (
                    <WorkspaceMasterDashboard />
                  ) : effectiveRole === 'Investor' ? (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
                      <InvestorPortal isPreview={isAppOwner && previewRole === 'Investor'} />
                    </div>
                  ) : (
                    <div className="flex-grow flex flex-col items-center justify-center min-h-[50vh] gap-3">
                      {/* Logo integrated for Resolving State */}
                      <div className="relative mb-1 flex items-center justify-center">
                        <div className="hidden sm:block absolute inset-0 bg-sky-500/10 rounded-2xl blur-md scale-90 pointer-events-none" />
                        <img
                          src="/wivote_logo.png"
                          alt="WiVoTe Logo"
                          decoding="async"
                          className="w-12 h-12 object-contain rounded-2xl relative z-10 animate-pulse"
                        />
                      </div>
                      <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px] font-mono tracking-widest opacity-70">RESOLVING ROLE ACCESS...</span>
                    </div>
                  )}
                </React.Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Profile Popup Settings Modal */}
      {isProfileOpen && (
        <UserProfileModal onClose={() => setIsProfileOpen(false)} />
      )}

      {/* General App Settings Modal */}
      <AppSettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Workspace Snapshot & Restoration Modal (Root Layout) */}
      <WorkspaceSnapshotModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
      />

      {/* Beautiful, floating Toast Notification overlay */}
      {toast && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 sm:left-auto sm:right-6 -translate-x-1/2 sm:translate-x-0 z-[100] w-[calc(100vw-2rem)] sm:w-full max-w-[360px] sm:max-w-sm animate-fade-in animate-bounce-subtle">
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-650 dark:bg-emerald-950/90 dark:border-emerald-500/20 dark:text-emerald-400'
              : toast.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-650 dark:bg-rose-950/90 dark:border-rose-500/20 dark:text-rose-400'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-650 dark:bg-blue-950/90 dark:border-blue-500/20 dark:text-blue-400'
          }`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && (
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-xs">✓</div>
              )}
              {toast.type === 'error' && (
                <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 font-bold text-xs">✗</div>
              )}
              {toast.type === 'info' && (
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold text-xs">i</div>
              )}
            </div>
            <div className="flex-grow">
              <h4 className="text-xs font-bold font-mono tracking-wide uppercase">
                {toast.type === 'success' ? 'Operation Success' : toast.type === 'error' ? 'Database Error' : 'System Alert'}
              </h4>
              <p className="text-xs font-sans mt-1 leading-relaxed opacity-90 break-words">{toast.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Auto-Logout Inactivity Monitor */}
      <InactivityTimer />

      {/* On-Screen Automatic Updating Modal & Indication */}
      <AppUpdateModal />

      {/* Mandatory Attribution Footer on all screens - Locked just like the Header */}
      <GlobalAppFooter />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <WiVoTeApp />
      </AppProvider>
    </ErrorBoundary>
  );
}
