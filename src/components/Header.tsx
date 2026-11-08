import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Sun, Moon, User, Wifi, Users, ShieldAlert, Award, Star, LogOut, RefreshCw, ChevronDown, Settings, Mail, Phone, Shield, Bell, Megaphone, ArrowRight, X, CheckCheck, Database, Download, Upload, Copy, Check } from 'lucide-react';
import { Role, SystemNotification } from '../types';
import { isNotificationVisibleToUser } from '../utils/notificationPolicy';
import { motion, AnimatePresence } from 'motion/react';
import { WorkspaceSnapshotModal } from './WorkspaceSnapshotModal';

function formatTimeAgo(timestamp: string): string {
  if (!timestamp) return 'Just now';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (isNaN(diff) || diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface HeaderProps {
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenProfile, onOpenSettings }) => {
  const {
    theme,
    toggleTheme,
    currentUser,
    activeWorkspace,
    isWorkspaceUnlocked,
    isAppOwnerUnlocked,
    logoutUser,
    refetchData,
    isRefetching,
    isPushingToDb,
    pendingMutationsCount,
    notifications,
    readNotificationIds,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    openSnapshotModal
  } = useApp();

  const currentUserName = currentUser?.name || currentUser?.email || 'User';

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifMenuOpen, setIsNotifMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Personal & targeted notifications visible strictly to the concerned user (broadcasts marked for all users show to all)
  const visibleNotifications = useMemo(() => {
    return (notifications || []).filter(n => isNotificationVisibleToUser(n, currentUser));
  }, [notifications, currentUser]);

  // Filter for unread notifications (latest message first)
  const unreadNotifications = useMemo(() => {
    const isHeaderAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'WorkspaceMaster' || currentUser?.role === 'AppOwner';
    return visibleNotifications
      .filter(n => !readNotificationIds?.includes(n.id))
      .filter(n => {
        // Admins don't have their own authored broadcast notices trigger unread bell alerts
        if (isHeaderAdmin && n.isBroadcast && (n.senderId === currentUser?.uid || n.senderName === currentUser?.name)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [visibleNotifications, readNotificationIds, currentUser]);

function extractReferenceCodeFromMessage(message?: string): string | undefined {
  if (!message) return undefined;
  const match = message.match(/(?:Voucher|Device|Terminal|token|code|for)\s*:?\s*([a-zA-Z0-9_-]{4,20})/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

  // Navigate directly to broadcast notice or reversal actioning and mark as read
  const handleNavigateToMessage = (notif: SystemNotification) => {
    markNotificationAsRead(notif.id);
    setIsNotifMenuOpen(false);

    const isReversal =
      notif.notifType === 'reversal_request' ||
      notif.notifType === 'reversal_status' ||
      notif.message?.toLowerCase().includes('reversal') ||
      notif.message?.toLowerCase().includes('reversals');

    if (isReversal) {
      const refCode = notif.referenceCode || extractReferenceCodeFromMessage(notif.message);
      window.dispatchEvent(
        new CustomEvent('wivote:open-reversal-action', {
          detail: {
            requestId: notif.reversalRequestId,
            referenceCode: refCode,
            transactionId: notif.transactionId,
            notification: notif
          }
        })
      );
      return;
    }

    window.dispatchEvent(new CustomEvent('wivote:navigate-to-broadcast', {
      detail: { notifId: notif.id }
    }));

    setTimeout(() => {
      const target = document.getElementById(`broadcast-notice-${notif.id}`) || document.getElementById('workspace-notice-board') || document.getElementById('admin-notice-board');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('ring-4', 'ring-indigo-500', 'shadow-2xl', 'scale-[1.01]');
        setTimeout(() => {
          target.classList.remove('ring-4', 'ring-indigo-500', 'shadow-2xl', 'scale-[1.01]');
        }, 3500);
      }
    }, 120);
  };

  // Monitor scroll position to apply elevated elevation and backdrop contrast
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 8);
          ticking = false;
        });
        ticking = true;
      }
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setIsNotifMenuOpen(false);
      }
    };

    if (isNotifMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isNotifMenuOpen]);

  // Mark all currently visible notifications as read/viewed when notification dropdown is opened
  useEffect(() => {
    if (isNotifMenuOpen && unreadNotifications.length > 0) {
      markAllNotificationsAsRead();
    }
  }, [isNotifMenuOpen, unreadNotifications.length, markAllNotificationsAsRead]);

  const handleLogout = () => {
    setIsProfileMenuOpen(false);
    logoutUser();
  };

  const handleOpenProfileModal = () => {
    setIsProfileMenuOpen(false);
    onOpenProfile();
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 w-full border-b transition-all duration-200 ${
      isScrolled
        ? theme === 'light'
          ? 'bg-white/95 backdrop-blur-md border-slate-200/90 shadow-md shadow-slate-900/5'
          : 'bg-slate-900/95 backdrop-blur-md border-slate-800 shadow-lg shadow-black/35'
        : theme === 'light'
          ? 'bg-white/98 backdrop-blur-xs border-slate-200/80 shadow-2xs'
          : 'bg-slate-900/98 backdrop-blur-xs border-slate-800 shadow-2xs'
    }`}>
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 md:h-20 flex items-center justify-between gap-1.5 sm:gap-4">
        {/* Brand Logo & Twinkle description */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="relative shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-sky-500/20 rounded-xl sm:rounded-2xl blur-md scale-95 pointer-events-none" />
            <img
              src="/wivote_logo.png"
              alt="WiVoTe Logo"
              referrerPolicy="no-referrer"
              className="w-8 h-8 sm:w-11 sm:h-11 md:w-12 md:h-12 object-contain drop-shadow-md rounded-xl relative z-10 transition-transform hover:scale-105 duration-200"
            />
          </div>
          <div>
            <div className={`text-base sm:text-2xl md:text-3xl font-black tracking-wider uppercase font-display leading-none ${
              theme === 'light' ? 'text-slate-900' : 'text-white'
            }`}>
              WiVoTe
            </div>
            <span className={`text-[9px] sm:text-[10px] md:text-[11px] font-mono tracking-widest uppercase hidden sm:block mt-1 ${
              theme === 'light' ? 'text-sky-600' : 'text-sky-400/80'
            }`}>
              wifi voucher terminal
            </span>
          </div>
        </div>

        {/* Workspace identifier */}
        {activeWorkspace && (currentUser?.role !== 'AppOwner' && currentUser?.email?.toLowerCase()?.trim() !== 'karimazondomike049@gmail.com') && (
          <div className={`hidden xl:flex items-center gap-2 px-3.5 py-1.5 border rounded-2xl ${
            theme === 'light'
              ? 'bg-slate-50 border-slate-200/80 text-slate-700'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}>
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span className="text-xs sm:text-sm font-bold font-display truncate max-w-[150px]">{activeWorkspace.name}</span>
            <span className={`text-[10px] sm:text-[11px] border px-1.5 py-0.5 rounded-lg font-mono uppercase font-black ${
              theme === 'light'
                ? 'bg-sky-50 text-sky-700 border-sky-100'
                : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
            }`}>
              {activeWorkspace.subscriptionTier}
            </span>
          </div>
        )}

        {/* Controls: Theme toggle, Settings, Notifications, Profile, Logout */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
          
          {/* High-Contrast Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 border rounded-xl sm:rounded-2xl transition duration-200 cursor-pointer flex items-center justify-center shrink-0 active:scale-95 ${
              theme === 'light'
                ? 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white'
            }`}
            title={`Quick toggle theme (${theme === 'light' ? 'switch to Dark' : 'switch to Light'})`}
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 text-indigo-600" />
            ) : (
              <Sun className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 text-amber-400" />
            )}
          </button>

          {/* General App Settings Gear Trigger */}
          <button
            onClick={onOpenSettings}
            className={`w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 border rounded-xl sm:rounded-2xl transition duration-200 cursor-pointer flex items-center justify-center shrink-0 active:scale-95 ${
              theme === 'light'
                ? 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white'
            }`}
            title="Open General Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 text-sky-500 hover:rotate-45 transition-transform duration-300" />
          </button>

          {/* Workspace Snapshot & Restoration Button / Cloud DB Sync Status */}
          {currentUser && (
            <button
              type="button"
              id="header_db_sync_button"
              onClick={openSnapshotModal}
              className={`w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 border rounded-xl sm:rounded-2xl transition duration-300 cursor-pointer flex items-center justify-center shrink-0 relative active:scale-95 ${
                isPushingToDb
                  ? 'bg-rose-500/20 border-rose-500 text-rose-500 shadow-md shadow-rose-500/30 ring-2 ring-rose-500/40 animate-pulse'
                  : pendingMutationsCount > 0
                  ? 'bg-amber-500/20 border-amber-500 text-amber-500 shadow-md shadow-amber-500/30 ring-2 ring-amber-500/40'
                  : theme === 'light'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 shadow-2xs'
                  : 'bg-emerald-950/50 border-emerald-600/70 text-emerald-400 hover:bg-emerald-900/70 hover:text-emerald-200 shadow-2xs'
              }`}
              title={
                isPushingToDb
                  ? 'Data Push to Cloud DB Underway... (Red Uploading Animation Active)'
                  : pendingMutationsCount > 0
                  ? `Push Local Data to Global DB (${pendingMutationsCount} pending)`
                  : 'All DB Updates Completed & Synced (Static Green)'
              }
            >
              {isPushingToDb ? (
                <div className="relative flex items-center justify-center">
                  <Database className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500 animate-spin" />
                  <Upload className="w-3 h-3 text-rose-500 absolute -top-1.5 -right-1.5 animate-bounce" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center">
                  <Database className={`w-4 h-4 sm:w-5 sm:h-5 ${pendingMutationsCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                  {pendingMutationsCount > 0 ? (
                    <span className="px-1 py-0.2 min-w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold font-mono absolute -top-1.5 -right-1.5 flex items-center justify-center animate-bounce shadow-xs">
                      {pendingMutationsCount}
                    </span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>
              )}
            </button>
          )}

          {/* Notification Bell Trigger & Interactive Dropdown Menu */}
          {currentUser && (
            <div className="relative shrink-0" ref={notifMenuRef}>
              <button
                type="button"
                id="header_notifications_btn"
                onClick={() => setIsNotifMenuOpen(prev => !prev)}
                className={`w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 border rounded-xl sm:rounded-2xl transition duration-200 cursor-pointer flex items-center justify-center shrink-0 relative active:scale-95 ${
                  unreadNotifications.length > 0
                    ? theme === 'light'
                      ? 'bg-amber-50/90 border-amber-300 text-amber-700 hover:bg-amber-100 shadow-xs'
                      : 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/60 shadow-xs'
                    : theme === 'light'
                      ? 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white'
                }`}
                title={`Notifications (${unreadNotifications.length} unread)`}
                aria-expanded={isNotifMenuOpen}
              >
                <Bell className="w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 min-w-3.5 h-3.5 sm:min-w-4 sm:h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold font-mono flex items-center justify-center animate-pulse shadow-xs">
                    {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              <AnimatePresence>
                {isNotifMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className={`fixed inset-x-2.5 top-[68px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.25rem)] sm:max-w-md rounded-2xl border shadow-2xl z-[60] overflow-hidden ${
                      theme === 'light'
                        ? 'bg-white border-slate-200 text-slate-800'
                        : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  >
                    <div className="p-3 border-b flex items-center justify-between dark:border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-bold font-display uppercase tracking-wider">
                          Workspace Notices
                        </span>
                        {unreadNotifications.length > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                            {unreadNotifications.length} new
                          </span>
                        )}
                      </div>
                      {unreadNotifications.length > 0 && (
                        <button
                          type="button"
                          onClick={() => markAllNotificationsAsRead()}
                          className="text-[10px] text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 font-mono font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCheck className="w-3 h-3" />
                          Mark all as read
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y dark:divide-slate-800/60">
                      {visibleNotifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400 font-mono">
                          No notices posted yet
                        </div>
                      ) : (
                        visibleNotifications.map((notif) => {
                          const isUnread = !readNotificationIds.includes(notif.id);
                          return (
                            <div
                              key={notif.id}
                              onClick={() => handleNavigateToMessage(notif)}
                              className={`p-3 text-xs cursor-pointer transition flex items-start gap-2.5 ${
                                isUnread
                                  ? theme === 'light' ? 'bg-indigo-50/70 hover:bg-indigo-100/70' : 'bg-indigo-950/40 hover:bg-indigo-900/50'
                                  : theme === 'light' ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'
                              }`}
                            >
                              <div className="shrink-0 mt-0.5">
                                {isUnread ? (
                                  <span className="w-2 h-2 rounded-full bg-indigo-500 block animate-pulse" />
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-slate-400/40 block" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] font-mono uppercase font-bold text-indigo-600 dark:text-indigo-400">
                                    {notif.isBroadcast ? 'BROADCAST' : 'SYSTEM'}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    {formatTimeAgo(notif.timestamp)}
                                  </span>
                                </div>
                                <p className="text-xs mt-0.5 leading-snug line-clamp-2 font-medium">
                                  {notif.message}
                                </p>
                                <span className="text-[9px] text-slate-400 font-mono block mt-1">
                                  By: {notif.senderName}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* User Profile Avatar Link & Interactive Dropdown Menu */}
          {currentUser && (
            <div className="relative shrink-0" ref={profileMenuRef}>
              <button
                type="button"
                id="header_profile_btn"
                onClick={() => setIsProfileMenuOpen(prev => !prev)}
                className={`h-8 sm:h-10 md:h-11 flex items-center gap-1 sm:gap-2 border p-0.5 sm:p-1.5 sm:pr-2.5 rounded-xl sm:rounded-2xl transition duration-200 cursor-pointer shrink-0 select-none ${
                  isProfileMenuOpen
                    ? theme === 'light'
                      ? 'bg-slate-100 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-slate-800 border-sky-500/50 ring-2 ring-sky-500/20 shadow-xs'
                    : theme === 'light'
                    ? 'bg-slate-50 border-slate-200/90 hover:border-slate-300 hover:bg-slate-100/70 shadow-2xs'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-850 shadow-2xs'
                }`}
                title="Tap profile to reveal options & logout"
                aria-expanded={isProfileMenuOpen}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border shrink-0 ${
                  theme === 'light' ? 'border-slate-200' : 'border-slate-800'
                }`}>
                  {currentUser.profilePic ? (
                    <img referrerPolicy="no-referrer" src={currentUser.profilePic} alt={currentUserName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-[10px] sm:text-xs text-slate-300 font-bold uppercase">
                      {currentUserName.substring(0, 2)}
                    </div>
                  )}
                </div>
                <div className="text-left hidden md:block">
                  <div className={`text-xs sm:text-sm font-extrabold leading-tight ${
                    theme === 'light' ? 'text-slate-950' : 'text-white'
                  }`}>{currentUserName.replace(/^(agent\s+)/i, '').replace(/\s*\(field\s+agent\)/i, '').trim().split(' ')[0]}</div>
                  <div className={`text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider leading-none mt-0.5 ${
                    theme === 'light' ? 'text-indigo-600' : 'text-sky-400'
                  }`}>{currentUser.role}</div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 transition-transform duration-200 hidden sm:block ${isProfileMenuOpen ? 'rotate-180 text-sky-500' : ''}`} />
              </button>

              {/* Profile Dropdown Popover Menu */}
              <AnimatePresence>
                {isProfileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className={`absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border shadow-2xl z-[60] p-4 overflow-hidden backdrop-blur-md ${
                      theme === 'light'
                        ? 'bg-white/98 border-slate-200 text-slate-900 shadow-xl'
                        : 'bg-slate-900/98 border-slate-800 text-white shadow-2xl'
                    }`}
                  >
                    {/* Header profile info */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-200/70 dark:border-slate-800">
                      <div className={`w-11 h-11 rounded-full overflow-hidden border-2 shrink-0 ${
                        theme === 'light' ? 'border-indigo-400' : 'border-sky-500'
                      }`}>
                        {currentUser.profilePic ? (
                          <img referrerPolicy="no-referrer" src={currentUser.profilePic} alt={currentUserName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-slate-800 flex items-center justify-center text-sm text-slate-300 font-bold uppercase">
                            {currentUserName.substring(0, 2)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold truncate font-display ${
                          theme === 'light' ? 'text-slate-950' : 'text-white'
                        }`}>{currentUserName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                            theme === 'light'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                              : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          }`}>
                            {currentUser.role}
                          </span>
                          {activeWorkspace && currentUser.role !== 'AppOwner' && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px] font-mono">
                              • {activeWorkspace.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="py-2.5 space-y-1.5 text-xs text-slate-400 font-mono border-b border-slate-200/70 dark:border-slate-800">
                      {currentUser.email && (
                        <div className="flex items-center gap-2 truncate">
                          <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{currentUser.email}</span>
                        </div>
                      )}
                      {currentUser.cellNumber && (
                        <div className="flex items-center gap-2 truncate">
                          <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{currentUser.cellNumber}</span>
                        </div>
                      )}
                      {currentUser.uid && (
                        <div className="pt-2 mt-1 border-t border-slate-200/50 dark:border-slate-800/80 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                              <Shield className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                              <span>{currentUser.role === 'Agent' ? 'Full Agent UID' : 'Account UID'}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(currentUser.uid);
                                setCopiedUid(true);
                                setTimeout(() => setCopiedUid(false), 2000);
                              }}
                              className="text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-500 font-mono font-bold flex items-center gap-1 cursor-pointer transition"
                              title="Copy full UID"
                            >
                              {copiedUid ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedUid ? 'Copied' : 'Copy UID'}</span>
                            </button>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-[10.5px] font-mono font-extrabold text-sky-600 dark:text-sky-400 select-all break-all leading-tight tracking-tight shadow-2xs">
                            {currentUser.uid}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons: Edit Profile, General Settings & Prominent Logout */}
                    <div className="pt-3 space-y-2">
                      <button
                        type="button"
                        onClick={handleOpenProfileModal}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                          theme === 'light'
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            : 'bg-slate-800 hover:bg-slate-750 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-sky-500" />
                          <span>Edit Profile Settings</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">→</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onOpenSettings();
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                          theme === 'light'
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            : 'bg-slate-800 hover:bg-slate-750 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Settings className="w-4 h-4 text-emerald-500 animate-spin-slow" />
                          <span>General App Settings</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">→</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider bg-rose-500/10 border border-rose-500/25 text-rose-500 hover:bg-rose-500 hover:text-white dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white transition shadow-sm cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Log Out of Terminal</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Direct Logout Button in Header Bar - Always Accessible on Mobile, Tablet & Desktop */}
          {currentUser && (
            <button
              onClick={handleLogout}
              className={`flex h-8 sm:h-10 md:h-11 px-2 sm:px-3 border rounded-xl sm:rounded-2xl transition duration-200 cursor-pointer items-center justify-center gap-1 sm:gap-1.5 text-xs font-bold font-mono uppercase shrink-0 active:scale-95 shadow-xs select-none ${
                theme === 'light'
                  ? 'bg-rose-50/90 border-rose-200/90 text-rose-600 hover:bg-rose-100 hover:border-rose-300 hover:text-rose-700'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 hover:text-white hover:border-rose-500/50'
              }`}
              title="Logout from Workspace"
              aria-label="Logout from Workspace"
              id="header_logout_btn"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-rose-500 shrink-0" />
              <span className="inline text-[10px] sm:text-[11px] font-mono font-black tracking-wider">Logout</span>
            </button>
          )}

      </div>
      </div>
    </header>
  );
};


