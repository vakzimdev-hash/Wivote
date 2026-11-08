import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Role,
  SubscriptionTier,
  VoucherStatus,
  RequestStatus,
  CashDropStatus,
  Workspace,
  UserProfile,
  Voucher,
  VoucherRequest,
  CashDrop,
  LegacyDevice,
  SystemNotification,
  FeedbackMessage,
  PackagePricing,
  AuditLogEntry,
  AuditActionCategory,
  Customer,
  CustomerPurchaseRecord,
  LoyaltySettings,
  LoyaltyTierRule,
  InvestorStake,
  ShareholdingGovernance,
  LedgerTransaction,
  ShareDisposalRequest,
  AccountDbSnapshot,
  RecycleBinItem,
  AccountBackupItem,
  GiveawaySettings,
  WorkspaceCashCloseSettings,
  AgentCashCloseSchedule,
  DEFAULT_CASH_CLOSE_SETTINGS,
  WorkspaceBackupItem,
  EntireAppBackupItem,
  AppBackupConfig,
  TransactionReversalRequest,
  ReversalTransactionType,
  ReversalRequestStatus,
  CaptivePortalUrlItem
} from '../types';
import { pushPendingChanges } from '../utils/syncEngine';
import { 
  DEFAULT_BACKUP_CONFIG, 
  pruneIntelligentBackups, 
  exportBackupToFile, 
  cleanForBackupSerialization 
} from '../utils/intelligentBackupEngine';
import { getDaysUntilMonthEnd, getCurrentCycleMonth, getCycleMonthFromDate } from '../utils/salesCycleEngine';
import { DEFAULT_LOYALTY_SETTINGS, getNextCustomerNumber, isCustomerNumberTaken, evaluateCustomerLoyalty, calculateActiveStreakCount } from '../utils/loyaltyEngine';
import { DEFAULT_GIVEAWAY_SETTINGS, isPlanMarkedFree, isVoucherFree, getAgentGiveawaysCountToday, canAgentGiveaway, normalizePlanName, getVoucherMonetaryValue } from '../utils/giveawayEngine';
import { APP_THEMES, applyThemeVariables } from '../utils/themeEngine';
import { isNotificationVisibleToUser } from '../utils/notificationPolicy';
import {
  initialWorkspaces,
  initialUsers,
  initialVouchers,
  initialRequests,
  initialCashDrops,
  initialLegacyDevices,
  initialNotifications,
  initialAuditLogs
} from '../seedData';
import {
  initialInvestors,
  initialShareholdingGovernance,
  initialLedgerTransactions,
  initialShareDisposalRequests
} from '../data/investmentSeedData';
import { initializeApp, deleteApp } from 'firebase/app';
import { isFirebasePlaceholder, db, auth, firebaseConfig } from '../firebase';
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, getDocs, query, where, writeBatch, collectionGroup, getDocFromServer, getDocsFromServer, increment } from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  getRedirectResult,
  getAuth
} from 'firebase/auth';
import { cleanupOrphanedAccounts, CleanupOrphanedResult, reconcileShadowAccounts, ReconcileShadowResult } from '../utils/adminCleanup';
import { assertWorkspaceMasterPrivilege, isAgentAccount, isWorkspaceMasterAccount, isAppOwnerAccount, getPlatformActiveAgentsCount, isAgentActive, deduplicateLegacyDevices, isSeedOrMockProfilePic } from '../utils/rbacPolicy';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  saveVouchersCache,
  cleanupStorageForSpace,
  safeJsonParse
} from '../utils/safeStorage';

/**
 * Recursively strips undefined keys and nested undefined properties from Firestore payloads.
 * Firestore DocumentReference.setDoc/updateDoc throws an error if any field is undefined.
 */
export function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  if (obj === null || obj === undefined || typeof obj !== 'object') return {};
  const cleaned: Record<string, any> = {};
  const propKeys = Object.getOwnPropertyNames(obj);
  for (const key of propKeys) {
    const value = (obj as any)[key];
    if (value === undefined) {
      continue;
    }
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      typeof (value as any).toMillis !== 'function' &&
      !(value as any)._methodName &&
      (value as any).constructor?.name !== 'FieldValue'
    ) {
      const nested = cleanForFirestore(value);
      if (nested !== undefined) {
        cleaned[key] = nested;
      }
    } else if (Array.isArray(value)) {
      cleaned[key] = value
        .filter(item => item !== undefined)
        .map(item => (item !== null && typeof item === 'object' && !(item as any)._methodName ? cleanForFirestore(item) : item));
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Checks if a user profile represents an empty or placeholder shadow account.
 * Shadow profiles have placeholder phone +263770000000 (or missing), placeholder photo,
 * and/or missing/empty workspaceId.
 */
export const isShadowUserProfile = (u: Partial<UserProfile> | null | undefined): boolean => {
  if (!u) return false;
  const isDefaultCell = !u.cellNumber || u.cellNumber === '+263770000000';
  const isDefaultPic = !u.profilePic || u.profilePic.includes('photo-1472099645785-5658abf4ff4e');
  const isEmptyWs = !u.workspaceId || u.workspaceId === '';
  const isNotAppOwner = u.role !== 'AppOwner' && (u.email || '').toLowerCase().trim() !== 'karimazondomike049@gmail.com';
  return (isDefaultCell && (isEmptyWs || isDefaultPic)) || (isEmptyWs && isNotAppOwner);
};

export const sortMatches = (userList: UserProfile[], passwordEntered?: string, requestedRole?: string): UserProfile[] => {
  const cleanEntered = (passwordEntered || '').trim();
  return [...userList].sort((a, b) => {
    // 1. Prefer matching password if provided
    if (cleanEntered) {
      const aPassMatch = (a.password || '').trim() === cleanEntered;
      const bPassMatch = (b.password || '').trim() === cleanEntered;
      if (aPassMatch && !bPassMatch) return -1;
      if (!aPassMatch && bPassMatch) return 1;
    }

    // 2. Real account ALWAYS precedes shadow account
    const aShadow = isShadowUserProfile(a);
    const bShadow = isShadowUserProfile(b);
    if (!aShadow && bShadow) return -1;
    if (aShadow && !bShadow) return 1;

    // 3. Prefer matching requested role
    if (requestedRole) {
      const aRoleMatch = (
        requestedRole === 'Agent' ? ['agent', 'fieldagent'].includes((a.role || '').toLowerCase()) :
        requestedRole === 'Admin' ? ['workspacemaster', 'admin', 'administrator', 'master', 'owner'].includes((a.role || '').toLowerCase()) :
        requestedRole === 'AppOwner' ? ['appowner', 'system', 'owner'].includes((a.role || '').toLowerCase()) : false
      );
      const bRoleMatch = (
        requestedRole === 'Agent' ? ['agent', 'fieldagent'].includes((b.role || '').toLowerCase()) :
        requestedRole === 'Admin' ? ['workspacemaster', 'admin', 'administrator', 'master', 'owner'].includes((b.role || '').toLowerCase()) :
        requestedRole === 'AppOwner' ? ['appowner', 'system', 'owner'].includes((b.role || '').toLowerCase()) : false
      );
      if (aRoleMatch && !bRoleMatch) return -1;
      if (!aRoleMatch && bRoleMatch) return 1;
    }

    // 4. Prefer valid non-empty workspaceId
    const aHasWs = !!a.workspaceId && a.workspaceId !== '';
    const bHasWs = !!b.workspaceId && b.workspaceId !== '';
    if (aHasWs && !bHasWs) return -1;
    if (!aHasWs && bHasWs) return 1;

    // 5. Prefer non-default cellNumber
    const aDefaultCell = !a.cellNumber || a.cellNumber === '+263770000000';
    const bDefaultCell = !b.cellNumber || b.cellNumber === '+263770000000';
    if (!aDefaultCell && bDefaultCell) return -1;
    if (aDefaultCell && !bDefaultCell) return 1;

    return 0;
  });
};

export interface LatestDbPushMetricsMirror {
  timestamp: number;
  pushedAtIso: string;
  workspaceId: string;
  pushId: string;
  admin: {
    inventorySummary: {
      unused: { count: number; value: number };
      assigned: { count: number; value: number };
      sold: { count: number; value: number };
      total: { count: number; value: number };
    };
    totalProfits: number;
    totalAgents: number;
    customerCount: number;
    legacyDevicesCount: number;
    salesCycleAggregate: {
      totalCashCollected: number;
      totalCommissionEarned: number;
      totalClosedCash: number;
      totalClosedCommission: number;
      totalRemainingCash: number;
      totalRemainingCommission: number;
      totalUnclosedPrevCycle?: number;
      agentMetrics: any[];
    };
  };
  agents: Record<string, {
    agentId: string;
    agentName: string;
    dailySalesTotal?: number;
    currentCycleSales: number;
    totalMonthlySales: number;
    closedCash: number;
    unclosedMonthlyCash: number;
    overallSales: number;
    prevMonthOverallSales: number;
    myCommission: number;
    totalCommissionEarned: number;
    closedCommission: number;
    soldVouchersCount: number;
    assignedVouchersCount: number;
  }>;
}

interface AppContextType {
  latestDbPushMetricsMirror: LatestDbPushMetricsMirror | null;
  isAuthoritativeDataReady: boolean;
  captureClientMetricsSnapshot: () => LatestDbPushMetricsMirror | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  activeThemeId: string;
  setActiveThemeId: (themeId: string) => void;
  showSplash: boolean;
  setShowSplash: (show: boolean) => void;
  currentUser: UserProfile | null;
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  workspacesRecordedCount: number;
  agentsRecordedCount: number;
  users: UserProfile[];
  setUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  vouchers: Voucher[];
  requests: VoucherRequest[];
  cashDrops: CashDrop[];
  legacyDevices: LegacyDevice[];
  notifications: SystemNotification[];
  readNotificationIds: string[];
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  feedback: FeedbackMessage[];
  customers: Customer[];
  loyaltySettings: LoyaltySettings;
  updateLoyaltySettings: (settings: LoyaltySettings) => Promise<void>;
  giveawaySettings: GiveawaySettings;
  updateGiveawaySettings: (settings: GiveawaySettings) => Promise<void>;
  togglePlanFreeStatus: (planName: string, isFree: boolean) => Promise<void>;
  markVouchersFreeBulk: (voucherIds: string[], isFree: boolean) => Promise<void>;
  executeFreeGiveaway: (voucherId: string, customerName?: string, customerCell?: string) => Promise<{ success: boolean; error?: string; voucher?: Voucher }>;
  cashCloseSettings: WorkspaceCashCloseSettings;
  updateCashCloseSettings: (settings: Partial<WorkspaceCashCloseSettings>) => Promise<void>;
  updateAgentCashCloseSchedule: (agentId: string, schedule: Partial<AgentCashCloseSchedule>) => Promise<void>;
  requestAgentCashClose: (agentId: string, amount?: number, notes?: string) => Promise<void>;
  captivePortalUrls: CaptivePortalUrlItem[];
  updateCaptivePortalUrls: (urls: CaptivePortalUrlItem[]) => Promise<{ success: boolean; error?: string }>;
  addCaptivePortalUrl: (item: Omit<CaptivePortalUrlItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; error?: string }>;
  editCaptivePortalUrl: (id: string, updates: Partial<CaptivePortalUrlItem>) => Promise<{ success: boolean; error?: string }>;
  deleteCaptivePortalUrl: (id: string) => Promise<{ success: boolean; error?: string }>;
  setDefaultCaptivePortalUrl: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceTelephoneCode: (code: string) => Promise<void>;
  addOrUpdateCustomer: (customerData: Partial<Customer>) => Promise<Customer>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
  updateCustomerStreak: (
    customerId: string,
    streakCount: number,
    qualifyingPrice?: number,
    planName?: string
  ) => Promise<{ success: boolean; customer?: Customer; error?: string }>;
  bulkAddCustomers: (
    entries: Array<{
      name: string;
      firstName?: string;
      surname?: string;
      cellNumber: string;
      customerType?: 'voucher' | 'legacy_device';
      deviceModel?: string;
      macAddress?: string;
      monthlyPrice?: number;
      streak?: number;
    }>,
    options?: {
      skipDuplicates?: boolean;
    }
  ) => Promise<{
    success: boolean;
    addedCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: string[];
    customers: Customer[];
  }>;
  restoreCustomerRegistryFromPrePush: (wsId?: string) => Promise<{ success: boolean; restoredCount: number; message: string }>;
  switchUser: (userId: string) => void;
  isLoggedIn: boolean;
  loading: boolean;
  initialized: boolean;
  globalLoading: boolean;
  isWorkspaceMetadataLoaded: boolean;
  isMetricsSyncing: boolean;
  loginUser: (emailOrName: string, role: 'Admin' | 'Agent' | 'AppOwner' | 'Investor', password: string) => Promise<{ success: boolean; error?: string; isSuspended?: boolean; workspaceName?: string }>;
  loginWithGoogle: (email: string, name: string, photoUrl?: string) => Promise<{ success: boolean; error?: string; isSuspended?: boolean; workspaceName?: string }>;
  loginWithBiometrics: (uid: string) => { success: boolean; error?: string; isSuspended?: boolean; workspaceName?: string };
  logoutUser: () => void;
  isWorkspaceUnlocked: boolean;
  unlockWorkspace: (password: string) => boolean;
  unlockWithBiometrics: () => boolean;
  lockWorkspace: () => void;
  isAppOwnerUnlocked: boolean;
  unlockAppOwner: (password: string) => boolean;
  lockAppOwner: () => void;
  censorImage: (base64: string) => Promise<{ safe: boolean; reason?: string }>;
  syncWithServerBridge: (targetWsId?: string) => Promise<boolean>;
  pendingMutationsCount: number;
  serverAuthoritativeMetrics: Record<string, any>;
  dispatchRecordMutated: (actionName: string, payload?: any) => void;
  pushPendingChanges: (localEntities: {
    vouchers: any[];
    customers: any[];
    legacyDevices: any[];
    requests: any[];
    cashDrops: any[];
  }) => Promise<{ success: boolean; pushedCount: number; error?: string }>;
  forcePushLocalToGlobalDB: (isAutoPush?: boolean) => Promise<{
    success: boolean;
    vouchersCount: number;
    customersCount: number;
    legacyDevicesCount: number;
    requestsCount: number;
    cashDropsCount: number;
  }>;
  downloadWorkspaceSnapshot: () => void;
  restoreWorkspaceSnapshot: (snapshotJson: string) => Promise<{ success: boolean; error?: string; restoredSummary?: string }>;
  uploadVouchers: (csvText: string, defaultLocation?: string, networkName?: string) => { success: boolean; count: number; duplicatesCount: number; errors: string[] };
  assignVouchersToAgent: (voucherIds: string[], agentId: string) => { success: boolean; assignedCount: number; doubleAllocatedCodes: string[] };
  revokeVoucherAllocation: (voucherIds: string[], reason?: string, mode?: 'pool' | 'delete') => Promise<{ success: boolean; revokedCount: number; message: string }>;
  completeSale: (voucherId: string, customerName: string, customerCell: string, loyaltyDiscount?: number, customerNumber?: string, loyaltyNotice?: string) => Promise<{ success: boolean; customer?: Customer; finalPrice: number; discount: number; customerNumber: string; loyaltyNotice?: string }>;
  submitVoucherRequest: (plan: string, quantity: number, location: string) => void;
  fulfillVoucherRequest: (requestId: string) => void;
  reversalRequests: TransactionReversalRequest[];
  requestTransactionReversal: (params: {
    transactionType: ReversalTransactionType;
    transactionId: string;
    reason: string;
  }) => Promise<{ success: boolean; error?: string; requestId?: string }>;
  approveTransactionReversal: (requestId: string, adminNotes?: string) => Promise<{ success: boolean; error?: string }>;
  rejectTransactionReversal: (requestId: string, adminNotes?: string) => Promise<{ success: boolean; error?: string }>;
  cancelTransactionReversal: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  cancelTransaction: (target: string | { transactionId: string; reason?: string }, optionalReason?: string) => Promise<{ success: boolean; error?: string }>;
  declineVoucherRequest: (requestId: string) => void;
  deleteVoucherRequest: (requestId: string) => Promise<void>;
  updateVoucherRequest: (requestId: string, plan: string, quantity: number, location: string) => Promise<void>;
  submitCashDrop: (amount: number, requestedBy: 'Agent' | 'WorkspaceMaster', notes?: string, targetAgentId?: string, targetAgentName?: string, extra?: Partial<CashDrop>) => void;
  fulfillAdminCashDropRequest: (cashDropId: string, notes?: string) => void;
  reconcileCashDrop: (cashDropId: string) => void;
  declineCashDrop: (cashDropId: string, reason?: string) => void;
  submitLegacyDevice: (name: string, deviceModel: string, mac: string, price: number, customerId?: string, customerCell?: string, customerNumber?: string) => Promise<LegacyDevice>;
  approveLegacyDevice: (id: string, price: number, leaseDurationDays?: number) => void;
  isSnapshotModalOpen: boolean;
  setIsSnapshotModalOpen: (open: boolean) => void;
  openSnapshotModal: () => void;
  cancelLegacyDeviceEnrollment: (id: string) => Promise<{ success: boolean; error?: string }>;
  declineLegacyDeviceEnrollment: (id: string) => Promise<{ success: boolean; error?: string }>;
  requestLegacyDeviceDeletion: (id: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  cancelLegacyDeviceDeletionRequest: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteLegacyDevice: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateLegacyDeviceLeaseExpiry: (id: string, newExpiresAt: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  requestLegacyDeviceRenewal: (id: string, durationDays: 14 | 30, reason?: string) => Promise<{ success: boolean; error?: string }>;
  approveLegacyDeviceRenewal: (id: string, adminNotes?: string) => Promise<{ success: boolean; error?: string }>;
  declineLegacyDeviceRenewal: (id: string, adminNotes?: string) => Promise<{ success: boolean; error?: string }>;
  cancelLegacyDeviceRenewalRequest: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateCaptivePortalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  markLegacyDeviceSold: (id: string) => Promise<{ success: boolean; discountApplied: number; finalSoldPrice: number; newStreak: number; customer?: Customer }>;
  simulateExpiredDeviceAlert: (customName?: string) => void;
  deleteVoucher: (id: string) => boolean;
  updateVoucher: (id: string, updates: Partial<Voucher>) => void;
  renameVoucherPlan: (oldPlanName: string, newPlanName: string) => Promise<void>;
  deleteVoucherPlan: (planName: string, deleteMode?: 'unassigned' | 'all') => Promise<{ success: boolean; deletedCount: number }>;
  editReceipt: (voucherId: string, updates: { customerName?: string | null; customerCell?: string | null; location?: string; networkName?: string; customerId?: string | null; customerNumber?: string | null }) => Promise<{ success: boolean; error?: string }>;
  bulkDeleteVouchers: (ids: string[]) => void;
  bulkUpdateVouchers: (ids: string[], updates: Partial<Voucher>, options?: { includeSold?: boolean }) => void;
  addNotification: (
    message: string,
    options?: {
      targetAudience?: 'ALL' | 'SPECIFIC' | 'ADMIN';
      targetAgentIds?: string[];
      targetAgentNames?: string[];
      targetUserIds?: string[];
      targetRole?: Role | 'Admin' | 'WorkspaceMaster' | 'Agent';
      isBroadcast?: boolean;
      isActive?: boolean;
      notifType?: 'reversal_request' | 'reversal_status' | 'broadcast' | 'system' | string;
      reversalRequestId?: string;
      transactionId?: string;
      referenceCode?: string;
    }
  ) => void;
  updateNotification: (id: string, updates: Partial<SystemNotification>) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  submitFeedback: (message: string, voucherCode?: string, voucherId?: string) => void;
  replyToFeedback: (id: string, reply: string, status?: 'Open' | 'Resolved') => void;
  updateUserProfile: (name: string, cellNumber: string, profilePic?: string, password?: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordResetOtp: (email: string, role: 'Admin' | 'Agent') => Promise<{ success: boolean; error?: string; otp?: string; uid?: string }>;
  resetPasswordWithOtp: (uid: string, otp: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  createWorkspace: (name: string, tier: SubscriptionTier, ownerEmail: string, months?: number, customPassword?: string, ownerCell?: string) => Promise<{ success: boolean; tempPassword?: string; error?: string }>;
  createWorkspaceAdmin: (workspaceId: string, name: string, email: string, cell: string, customPassword?: string) => Promise<{ success: boolean; tempPassword?: string; error?: string }>;
  createAgent: (workspaceId: string, adminId: string, name: string, email: string, cell: string, customPassword?: string, targetAmount?: number, commissionRate?: number, location?: string) => Promise<{ success: boolean; tempPassword?: string; error?: string }>;
  requestedRole: 'Admin' | 'Agent' | 'AppOwner' | 'Investor' | null;
  setRequestedRole: (role: 'Admin' | 'Agent' | 'AppOwner' | 'Investor' | null) => void;
  investors: InvestorStake[];
  shareholdingGovernance: ShareholdingGovernance | null;
  ledgerTransactions: LedgerTransaction[];
  shareDisposals: ShareDisposalRequest[];
  updateShareholdingGovernance: (updates: Partial<ShareholdingGovernance>) => Promise<{ success: boolean; error?: string }>;
  addInvestor: (investor: Omit<InvestorStake, 'id'>, createLoginUser?: boolean, customPassword?: string) => Promise<{ success: boolean; id?: string; error?: string }>;
  updateInvestor: (id: string, updates: Partial<InvestorStake>) => Promise<{ success: boolean; error?: string }>;
  deleteInvestor: (id: string) => Promise<{ success: boolean; error?: string }>;
  addLedgerTransaction: (tx: Omit<LedgerTransaction, 'id'>) => Promise<{ success: boolean; id?: string; error?: string }>;
  requestShareDisposal: (request: Omit<ShareDisposalRequest, 'id' | 'status' | 'dateRequested'>) => Promise<{ success: boolean; id?: string; error?: string }>;
  executeShareDisposal: (id: string, action: 'Approve' | 'Reject') => Promise<{ success: boolean; error?: string }>;
  reinjectCapital: (investorId: string, amount: number) => Promise<{ success: boolean; error?: string }>;
  selfRegisterWorkspace: (workspaceName: string, tier: SubscriptionTier, ownerEmail: string, ownerName: string, ownerCell: string, trialMode: 'trial' | 'payment', ownerPassword?: string, months?: number) => Promise<{ success: boolean; error?: string; isPendingActivation?: boolean; workspaceName?: string; ownerName?: string; ownerEmail?: string; tier?: SubscriptionTier }>;
  onboardWorkspace: (workspaceName: string, tier: SubscriptionTier, trialMode: 'trial' | 'payment', months?: number) => Promise<{ success: boolean; error?: string }>;
  deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceSubscription: (workspaceId: string, tier: SubscriptionTier, isActive: boolean, expiresAt?: string) => Promise<void>;
  updateWorkspaceName: (workspaceId: string, name: string) => Promise<void>;
  updateWorkspaceDetails: (workspaceId: string, name: string, ownerUid: string, ownerName: string, ownerEmail: string, ownerCell: string, ownerPassword?: string, tier?: SubscriptionTier, isActive?: boolean, expiresAt?: string) => Promise<{ success: boolean; error?: string }>;
  toggleWorkspaceSuspension: (workspaceId: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
  resetWorkspaceMasterPassword: (workspaceId: string, masterUid: string) => Promise<{ success: boolean; tempPassword?: string; error?: string }>;
  addUserByMaster: (email: string, name: string, role: Role, cell: string) => string;
  editUserByMaster: (uid: string, updates: Partial<UserProfile>) => Promise<void>;
  deleteUserByMaster: (uid: string, userObj?: UserProfile) => Promise<{ success: boolean; error?: string }>;
  clearAllLocalData: () => void;
  pricingPackages: PackagePricing[];
  updatePricingPackages: (packages: PackagePricing[]) => void;
  exportWorkspaceData: (workspaceId: string) => Promise<any>;
  importWorkspaceData: (backupData: any) => Promise<{ success: boolean; error?: string }>;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  isLiveRefresh: boolean;
  setIsLiveRefresh: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  toggleLiveRefresh: () => void;
  refetchData: () => Promise<void>;
  isRefetching: boolean;
  isPushingToDb: boolean;
  lastRefreshedAt: Date | null;
  refreshCountdown: number;
  auditLogs: AuditLogEntry[];
  logAuditAction: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => Promise<AuditLogEntry>;
  cleanupOrphanedAccounts: (targetEmail?: string, dryRun?: boolean) => Promise<CleanupOrphanedResult>;
  reconcileAndHealAccounts: (targetEmail?: string, dryRun?: boolean) => Promise<ReconcileShadowResult>;
  selectedWorkspaceId: string | null;
  setSelectedWorkspaceId: (id: string | null) => void;
  recycleBin: RecycleBinItem[];
  accountBackups: AccountBackupItem[];
  configuredBackupEmail: string;
  setConfiguredBackupEmail: (email: string) => Promise<void>;
  buildAccountDbSnapshot: (user: UserProfile) => AccountDbSnapshot;
  createAccountBackup: (uid: string, reason?: string) => Promise<{ success: boolean; backup?: AccountBackupItem; error?: string }>;
  restoreAccountFromSnapshot: (snapshot: AccountDbSnapshot, binItemId?: string) => Promise<{ success: boolean; error?: string }>;
  deletePermanentlyFromBin: (binItemId: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccountBackup: (backupId: string) => Promise<{ success: boolean; error?: string }>;
  emailDbFile: (params: { recipientEmail: string; snapshot: AccountDbSnapshot; subject?: string; notes?: string }) => Promise<{ success: boolean; sentViaSmtp?: boolean; error?: string }>;
  sendAllBinContentsByEmail: (recipientEmail: string, workspaceId?: string) => Promise<{ success: boolean; count: number; sentViaSmtp?: boolean; error?: string }>;
  fullDatabaseBackups: any[];
  backupInterval: number;
  setBackupInterval: (interval: number) => void;
  createFullDatabaseBackup: (triggerType?: 'auto' | 'manual') => Promise<{ success: boolean; backup?: any; error?: string }>;
  deleteFullDatabaseBackup: (id: string) => Promise<boolean>;
  restoreFullDatabaseBackup: (backup: any) => Promise<{ success: boolean; error?: string }>;
  workspaceBackups: WorkspaceBackupItem[];
  entireAppBackups: EntireAppBackupItem[];
  appBackupConfig: AppBackupConfig;
  updateAppBackupConfig: (cfg: Partial<AppBackupConfig>) => Promise<void>;
  triggerWriteBackup: (triggerEvent: string, options?: { actorRole?: string; actorName?: string; workspaceId?: string; isManual?: boolean }) => Promise<void>;
  restoreWorkspaceFromBackup: (backup: WorkspaceBackupItem) => Promise<{ success: boolean; error?: string }>;
  restoreEntireAppFromBackup: (backup: EntireAppBackupItem) => Promise<{ success: boolean; error?: string }>;
  createManualWorkspaceBackup: (notes?: string) => Promise<{ success: boolean; backup?: WorkspaceBackupItem; error?: string }>;
  createManualEntireAppBackup: (notes?: string) => Promise<{ success: boolean; backup?: EntireAppBackupItem; error?: string }>;
  exportWorkspaceBackup: (backup?: WorkspaceBackupItem) => void;
  exportEntireAppBackup: (backup?: EntireAppBackupItem) => void;
  importAndRestoreWorkspaceBackup: (jsonContent: string) => Promise<{ success: boolean; error?: string }>;
  importAndRestoreEntireAppBackup: (jsonContent: string) => Promise<{ success: boolean; error?: string }>;
  leaderboardSummary: Record<string, number>;
}

/**
 * Persistent Tombstone Storage for Deleted Customer Records
 * Prevents deleted customers from being resurrected by voucher or legacy device synthesis loops.
 */
function getDeletedCustomerIds(): Set<string> {
  try {
    const raw = localStorage.getItem('wivote_deleted_customer_ids');
    const arr = safeJsonParse<string[]>(raw, []);
    if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
  } catch (e) {
    console.warn("Error reading deleted customer IDs:", e);
  }
  return new Set<string>();
}

function getDeletedCustomerNames(): Set<string> {
  const set = new Set<string>([
    'histec campus client',
    'histec direct client',
    'histec campus',
    'histec direct',
    'campus client',
    'direct client'
  ]);
  try {
    const raw = localStorage.getItem('wivote_deleted_customer_names');
    const arr = safeJsonParse<string[]>(raw, []);
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach((s: string) => {
        if (s && typeof s === 'string') {
          const trimmed = s.trim().toLowerCase();
          if (trimmed) {
            set.add(trimmed);
            set.add(trimmed.replace(/\s+/g, ' '));
          }
        }
      });
    }
  } catch (e) {
    console.warn("Error reading deleted customer names:", e);
  }
  return set;
}

export function isPlaceholderOrWalkInClient(name?: string): boolean {
  if (!name) return true;
  const clean = name.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  if (!clean) return true;
  
  const placeholders = new Set([
    'walk in',
    'walk in client',
    'walk in customer',
    'walkin',
    'walkin client',
    'walkin customer',
    'walk-in',
    'walk-in client',
    'walk-in customer',
    'customer',
    'valued customer',
    'client',
    'valued client',
    'cash client',
    'cash customer',
    'anonymous',
    'anonymous client',
    'anonymous customer',
    'guest',
    'guest client',
    'guest customer',
    'direct client',
    'campus client',
    'histec direct client',
    'histec campus client',
    'histec direct',
    'histec campus',
    'histec client',
    'n/a',
    'none',
    'null',
    'undefined'
  ]);

  if (placeholders.has(clean)) return true;
  if (
    clean.startsWith('walk in') ||
    clean.startsWith('walkin') ||
    clean.startsWith('guest') ||
    clean.startsWith('valued customer') ||
    clean.startsWith('valued client') ||
    clean.includes('histec campus') ||
    clean.includes('histec direct') ||
    clean.includes('campus client') ||
    clean.includes('direct client')
  ) {
    return true;
  }
  return false;
}

function markCustomerDeleted(ids: string[], names: string[]) {
  try {
    const existingIds = getDeletedCustomerIds();
    ids.forEach(id => { if (id) existingIds.add(id); });
    localStorage.setItem('wivote_deleted_customer_ids', JSON.stringify(Array.from(existingIds)));

    const existingNames = getDeletedCustomerNames();
    names.forEach(name => {
      const trimmed = (name || '').trim().toLowerCase();
      if (trimmed && trimmed !== 'walk-in client' && trimmed !== 'customer' && trimmed !== 'valued customer') {
        existingNames.add(trimmed);
        existingNames.add(trimmed.replace(/\s+/g, ' '));
      }
    });
    localStorage.setItem('wivote_deleted_customer_names', JSON.stringify(Array.from(existingNames)));
  } catch (e) {
    console.warn("Error writing deleted customers tombstone:", e);
  }
}

function unmarkCustomerDeleted(ids: string[], names: string[]) {
  try {
    const existingIds = getDeletedCustomerIds();
    ids.forEach(id => { if (id) existingIds.delete(id); });
    localStorage.setItem('wivote_deleted_customer_ids', JSON.stringify(Array.from(existingIds)));

    const existingNames = getDeletedCustomerNames();
    names.forEach(name => {
      const trimmed = (name || '').trim().toLowerCase();
      if (trimmed) {
        existingNames.delete(trimmed);
        existingNames.delete(trimmed.replace(/\s+/g, ' '));
      }
    });
    localStorage.setItem('wivote_deleted_customer_names', JSON.stringify(Array.from(existingNames)));
  } catch (e) {
    console.warn("Error unmarking deleted customers tombstone:", e);
  }
}

function clearAllCustomerTombstones() {
  try {
    localStorage.removeItem('wivote_deleted_customer_ids');
    localStorage.removeItem('wivote_deleted_customer_names');
  } catch (e) {
    console.warn("Error clearing customer tombstones:", e);
  }
}

function getDeletedRequestIds(): Set<string> {
  try {
    const raw = localStorage.getItem('wivote_deleted_request_ids');
    const arr = safeJsonParse<string[]>(raw, []);
    if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
  } catch (e) {
    console.warn("Error reading deleted request IDs:", e);
  }
  return new Set<string>();
}

function markRequestDeleted(id: string) {
  if (!id) return;
  try {
    const existing = getDeletedRequestIds();
    existing.add(id);
    localStorage.setItem('wivote_deleted_request_ids', JSON.stringify(Array.from(existing)));
  } catch (e) {
    console.warn("Error writing deleted request tombstone:", e);
  }
}

export function getDeletedPlans(): Set<string> {
  const set = new Set<string>(['Starter', '1hr_Free_Gift']);
  try {
    const raw = localStorage.getItem('wivote_deleted_plans');
    const arr = safeJsonParse<string[]>(raw, []);
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach(p => { if (p) set.add(p); });
    }
  } catch (e) {
    console.warn("Error reading deleted plans:", e);
  }
  return set;
}

export function markPlanDeleted(planName: string) {
  if (!planName) return;
  try {
    const existing = getDeletedPlans();
    existing.add(planName);
    localStorage.setItem('wivote_deleted_plans', JSON.stringify(Array.from(existing)));
  } catch (e) {
    console.warn("Error writing deleted plans tombstone:", e);
  }
}

export interface SoldVoucherRecord {
  id: string;
  code: string;
  status: VoucherStatus;
  soldAt: string;
  soldPrice: number;
  originalPrice?: number;
  discountApplied?: number;
  customerName?: string;
  customerCell?: string;
  customerId?: string;
  customerNumber?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  soldByAgentId?: string;
  soldByAgentName?: string;
  workspaceId?: string;
  plan: string;
  duration: string;
  location?: string;
  networkName?: string;
  isFree?: boolean;
  giftedAt?: string;
  giftedByAgentId?: string;
  giftedByAgentName?: string;
  isDirty?: boolean;
}

export class SoldVouchersRegistryMap extends Map<string, SoldVoucherRecord> {
  private codeToIdMap = new Map<string, string>();

  set(key: string, value: SoldVoucherRecord): this {
    if (!value) return this;
    const primaryId = value.id || key;
    super.set(primaryId, value);
    if (value.code) {
      this.codeToIdMap.set(value.code.toLowerCase().trim(), primaryId);
    }
    const cleanKey = key.toLowerCase().trim();
    if (cleanKey !== primaryId.toLowerCase().trim()) {
      this.codeToIdMap.set(cleanKey, primaryId);
    }
    return this;
  }

  get(key: string): SoldVoucherRecord | undefined {
    if (!key) return undefined;
    const direct = super.get(key);
    if (direct) return direct;
    const mappedId = this.codeToIdMap.get(key.toLowerCase().trim());
    return mappedId ? super.get(mappedId) : undefined;
  }

  has(key: string): boolean {
    if (!key) return false;
    if (super.has(key)) return true;
    const mappedId = this.codeToIdMap.get(key.toLowerCase().trim());
    return mappedId ? super.has(mappedId) : false;
  }
}

export function getSoldVouchersRegistry(): Map<string, SoldVoucherRecord> {
  const map = new SoldVouchersRegistryMap();

  // Authoritative default sold records for vouchers (including tazgyn, nhn7x4, and 2HRS $1 vouchers for Histec Training)
  const defaults: SoldVoucherRecord[] = [
    {
      id: 'v_tazgyn_sold',
      code: 'tazgyn',
      status: 'Sold',
      soldAt: '2026-10-25T11:00:00.000Z',
      soldPrice: 3.00,
      originalPrice: 3.00,
      discountApplied: 0,
      customerName: 'Valued Customer',
      customerCell: '+263770000000',
      assignedAgentId: 'agent_histec_training',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'agent_histec_training',
      soldByAgentName: 'Histec Training',
      plan: '2_WEEKS_15GB',
      duration: '14 Days',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_nhn7x4_sold',
      code: 'nhn7x4',
      status: 'Sold',
      soldAt: '2026-10-25T11:30:00.000Z',
      soldPrice: 3.00,
      originalPrice: 3.00,
      discountApplied: 0,
      customerName: 'Valued Customer',
      customerCell: '+263770000000',
      assignedAgentId: 'agent_histec_training',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'agent_histec_training',
      soldByAgentName: 'Histec Training',
      plan: '2_WEEKS_15GB',
      duration: '14 Days',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_histec_x5xfik',
      code: 'x5xfik',
      status: 'Sold',
      soldAt: '2026-11-05T08:00:00.000Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Walk-in Client',
      customerCell: 'N/A',
      assignedAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      soldByAgentName: 'Histec Training',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_histec_37ik64',
      code: '37ik64',
      status: 'Sold',
      soldAt: '2026-11-05T08:30:00.000Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Walk-in Client',
      customerCell: 'N/A',
      assignedAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      soldByAgentName: 'Histec Training',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275833_m8ux9',
      code: 'zhuxz8',
      status: 'Sold',
      soldAt: '2026-09-25T14:23:23.324Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Walk-in Client',
      customerCell: 'N/A',
      assignedAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      soldByAgentName: 'Histec Training',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275833_me3on',
      code: 'pdw7se',
      status: 'Sold',
      soldAt: '2026-09-27T13:18:14.664Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Homwe P.',
      customerCell: '+263776046682',
      assignedAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      soldByAgentName: 'Histec Training',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275833_qb1ik',
      code: '7u6fjf',
      status: 'Sold',
      soldAt: '2026-10-02T16:05:22.836Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Walk-in Client',
      customerCell: 'N/A',
      assignedAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      soldByAgentName: 'Histec Training',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275833_uwbv7',
      code: 'd6k3vf',
      status: 'Sold',
      soldAt: '2026-09-25T09:00:17.260Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Walk-in Client',
      customerCell: 'N/A',
      assignedAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      assignedAgentName: 'Histec Training',
      soldByAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
      soldByAgentName: 'Histec Training',
      plan: '1HR_10GB',
      duration: '1 Hour',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275833_0gqev',
      code: 'esuzt7',
      status: 'Sold',
      soldAt: '2026-10-01T14:37:54.522Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'P mupukuta',
      customerCell: '+263785490643',
      assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
      assignedAgentName: 'Chitsungo R',
      soldByAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
      soldByAgentName: 'Chitsungo R',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275833_79g4l',
      code: 'qnm8xt',
      status: 'Sold',
      soldAt: '2026-10-02T11:44:59.032Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'G mutengude',
      customerCell: '+263719416295',
      assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
      assignedAgentName: 'Chitsungo R',
      soldByAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
      soldByAgentName: 'Chitsungo R',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    },
    {
      id: 'v_1789240275834_7pwll',
      code: 'imudrq',
      status: 'Sold',
      soldAt: '2026-09-26T18:05:05.075Z',
      soldPrice: 1.00,
      originalPrice: 1.00,
      discountApplied: 0,
      customerName: 'Walk-in Client',
      customerCell: 'N/A',
      assignedAgentId: '6ih4NtJnXUeNtt1z0orVHZGkQuv2',
      assignedAgentName: 'Mukondodzi F',
      soldByAgentId: '6ih4NtJnXUeNtt1z0orVHZGkQuv2',
      soldByAgentName: 'Mukondodzi F',
      plan: '2HRS_6GB',
      duration: '2 Hours',
      workspaceId: 'ws_client_1788646327740'
    }
  ];

  defaults.forEach(d => {
    map.set(d.id, d);
  });

  try {
    const raw = localStorage.getItem('wivote_sold_vouchers_registry');
    if (raw) {
      const store = safeJsonParse<Record<string, SoldVoucherRecord>>(raw, {});
      if (store && typeof store === 'object') {
        Object.values(store).forEach(item => {
          if (item && (item.id || item.code)) {
            const cleanCode = sanitizeVoucherCode(item.code || item.id);
            let correctedItem = item;
            // Heal any item that belongs to 2HRS_6GB / 1HR_10GB or our known sold codes
            if (item.plan === '2HRS_6GB' || item.duration === '2 Hours' || ['zhuxz8', 'pdw7se', '7u6fjf', 'esuzt7', 'qnm8xt', 'imudrq'].includes(cleanCode)) {
              correctedItem = { ...item, soldPrice: 1.00, originalPrice: 1.00, plan: '2HRS_6GB', duration: '2 Hours' };
            } else if (cleanCode === 'd6k3vf') {
              correctedItem = { ...item, soldPrice: 1.00, originalPrice: 1.00, plan: '1HR_10GB', duration: '1 Hour' };
            }
            const rec: SoldVoucherRecord = { ...correctedItem, code: cleanCode || correctedItem.code, status: 'Sold' as VoucherStatus };
            map.set(rec.id, rec);
            if (rec.code) map.set(rec.code.toLowerCase().trim(), rec);
            if (cleanCode) map.set(cleanCode.toLowerCase().trim(), rec);
          }
        });
      }
    }
  } catch (e) {
    console.warn("Error reading sold vouchers registry:", e);
  }

  // Authoritatively re-apply defaults to guarantee sold vouchers maintain authentic price and agent bindings
  defaults.forEach(d => {
    map.set(d.id, d);
    if (d.code) map.set(d.code.toLowerCase().trim(), d);
  });

  return map;
}

export function saveSoldVoucherToRegistry(rec: Partial<Voucher> | SoldVoucherRecord): void {
  if (!rec || (!rec.id && !rec.code)) return;
  const cleanCode = sanitizeVoucherCode(rec.code || rec.id);
  const record: SoldVoucherRecord = {
    id: rec.id || `v_${cleanCode}_sold`,
    code: cleanCode || rec.code || rec.id || '',
    status: 'Sold',
    soldAt: rec.soldAt || new Date().toISOString(),
    soldPrice: rec.soldPrice !== undefined ? rec.soldPrice : ((rec as any).price || 0),
    originalPrice: rec.originalPrice !== undefined ? rec.originalPrice : ((rec as any).price || 0),
    discountApplied: rec.discountApplied || 0,
    customerName: rec.customerName || 'Valued Customer',
    customerCell: rec.customerCell || '',
    customerId: rec.customerId,
    customerNumber: rec.customerNumber,
    assignedAgentId: rec.assignedAgentId,
    assignedAgentName: rec.assignedAgentName,
    assignedAgentEmail: (rec as any).assignedAgentEmail,
    soldByAgentId: (rec as any).soldByAgentId || rec.assignedAgentId,
    soldByAgentName: (rec as any).soldByAgentName || rec.assignedAgentName,
    workspaceId: rec.workspaceId || 'ws_vakzim',
    plan: rec.plan || 'Wi-Fi Voucher',
    duration: rec.duration || 'Standard',
    location: rec.location,
    networkName: rec.networkName,
    isFree: rec.isFree,
    giftedAt: (rec as any).giftedAt,
    giftedByAgentId: (rec as any).giftedByAgentId,
    giftedByAgentName: (rec as any).giftedByAgentName,
    isDirty: (rec as any).isDirty !== undefined ? (rec as any).isDirty : true
  };

  try {
    const raw = localStorage.getItem('wivote_sold_vouchers_registry');
    const store = safeJsonParse<Record<string, SoldVoucherRecord>>(raw, {});
    store[record.id] = record;
    if (record.code) store[record.code.toLowerCase().trim()] = record;
    if (cleanCode) {
      store[cleanCode.toLowerCase().trim()] = record;
      store[`v_${cleanCode.toLowerCase().trim()}`] = record;
    }
    localStorage.setItem('wivote_sold_vouchers_registry', JSON.stringify(store));
  } catch (e) {
    console.warn("Error saving sold voucher to registry:", e);
  }
}

export function removeSoldVoucherFromRegistry(idOrCode: string): void {
  if (!idOrCode) return;
  const clean = sanitizeVoucherCode(idOrCode).toLowerCase().trim();
  const rawId = idOrCode.toLowerCase().trim();
  try {
    const raw = localStorage.getItem('wivote_sold_vouchers_registry');
    if (raw) {
      const store = safeJsonParse<Record<string, SoldVoucherRecord>>(raw, {});
      if (store && typeof store === 'object') {
        delete store[idOrCode];
        delete store[rawId];
        if (clean) {
          delete store[clean];
          delete store[`v_${clean}`];
          delete store[`v_${clean}_sold`];
        }
        Object.keys(store).forEach(k => {
          const item = store[k];
          if (item && (
            item.id === idOrCode ||
            item.id === rawId ||
            (item.code && item.code.toLowerCase().trim() === rawId) ||
            (clean && item.code && item.code.toLowerCase().trim() === clean) ||
            (clean && sanitizeVoucherCode(item.code || item.id).toLowerCase().trim() === clean)
          )) {
            delete store[k];
          }
        });
        localStorage.setItem('wivote_sold_vouchers_registry', JSON.stringify(store));
      }
    }
  } catch (e) {
    console.warn("Error removing sold voucher from registry:", e);
  }
}

/**
 * Generates an idempotent, deterministic customer ID based on normalized name, phone, or MAC.
 * This guarantees that concurrent writes, re-synthesis, and sales to the same customer
 * target the exact same Firestore document instead of spawning duplicate random IDs.
 */
function getDeterministicCustomerId(name?: string, cell?: string, mac?: string): string {
  const normName = (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
  const normPhone = (cell || '').replace(/\D/g, '');
  const normMac = (mac || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  if (normName && normName !== 'walk_in_client' && normName !== 'customer' && normName !== 'valued_customer') {
    return `cust_${normName}`;
  }
  if (normPhone && normPhone.length >= 6) {
    return `cust_p_${normPhone}`;
  }
  if (normMac && normMac.length >= 8) {
    return `cust_m_${normMac}`;
  }
  return `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function resolveVoucherWorkspaceId(v: Partial<Voucher>, fallbackWsId: string = 'ws_vakzim'): string {
  const agentId = v.assignedAgentId || '';
  const agentName = (v.assignedAgentName || (v as any).assignedTo || '').toLowerCase();
  const agentEmail = (v.assignedAgentEmail || (v as any).agentEmail || '').toLowerCase();

  // 1. Histec Training & Chitsungo Agents (Workspace: ws_client_1788646327740)
  if (
    ['OIofBo6j6jV6qM0oRRxVFwpucfP2', 'agent_histec_training', '6ih4NtJnXUeNtt1z0orVHZGkQuv2', '7QFBnEU9XxalOI6kl8csoTm58tE2'].includes(agentId) ||
    agentName.includes('histec') ||
    agentName.includes('mukondodzi') ||
    agentName.includes('chitsungo') ||
    agentEmail.includes('histec') ||
    agentEmail.includes('mukondodzi') ||
    agentEmail.includes('chitsungo') ||
    (agentId && agentId.toLowerCase().includes('histec'))
  ) {
    return 'ws_client_1788646327740';
  }

  // 2. Zuwessy Tech (Workspace: ws_1790605401339)
  if (
    ['EbUj2wQFvFMQo8oqvdZ3TTILCm02', 'agent_1790695694537', 'agent_1790693876765'].includes(agentId) ||
    agentName.includes('annitah') ||
    agentName.includes('siphelani') ||
    agentEmail.includes('zuwessy') ||
    agentEmail.includes('annitah') ||
    agentEmail.includes('siphelani')
  ) {
    return 'ws_1790605401339';
  }

  if (v.workspaceId && v.workspaceId !== 'system') {
    return v.workspaceId;
  }
  if ((v as any).workspace_id && (v as any).workspace_id !== 'system') {
    return (v as any).workspace_id;
  }

  // 3. VakZim ICT&E Hub
  const loc = (v.location || '').toLowerCase();
  if (
    loc.includes('harare') ||
    loc.includes('gweru') ||
    loc.includes('bulawayo') ||
    ['agent_1790518779956', 'agent_1790518833979'].includes(agentId) ||
    agentName.includes('bob moyo') ||
    agentName.includes('charlie ncube') ||
    agentEmail.includes('moyo') ||
    agentEmail.includes('ncube') ||
    agentEmail.includes('agent1') ||
    agentEmail.includes('agent2')
  ) {
    return 'ws_vakzim';
  }

  return fallbackWsId;
}

export function sanitizeVoucherCode(v: Partial<Voucher> | string | undefined | null): string {
  if (!v) return '';
  let code = (typeof v === 'string' ? v : v.code || '').toString().trim();
  const id = (typeof v === 'object' && v ? v.id || '' : '').toString().trim();

  const stripPrefix = (str: string): string => {
    if (!str) return '';
    let res = str.trim();
    let prev = '';
    while (res !== prev) {
      prev = res;
      res = res.replace(/^[vV]_/, '');
      res = res.replace(/^\d{6,}_/, '');
      res = res.replace(/^[vV]_\d+_/, '');
    }
    if (/^\d{8,}_/.test(res)) {
      res = res.replace(/^\d{8,}_/, '');
    }
    const idx = res.lastIndexOf('_');
    if (idx !== -1 && /^\d+$/.test(res.slice(0, idx))) {
      res = res.substring(idx + 1);
    }
    return res;
  };

  let cleaned = stripPrefix(code);

  if (!cleaned || cleaned.length === 0 || cleaned.startsWith('v_') || /^\d{8,}$/.test(cleaned)) {
    cleaned = stripPrefix(id);
    if (!cleaned || /^\d{8,}$/.test(cleaned)) {
      const parts = id.split('_');
      if (parts.length >= 2) {
        cleaned = parts[parts.length - 1];
      }
    }
  }

  if (/^\d{10,}$/.test(cleaned)) {
    const raw = id || code;
    const parts = raw.split('_');
    if (parts.length >= 2) {
      cleaned = parts[parts.length - 1];
    }
  }

  return cleaned || code || id;
}

export function resolveLegacyDeviceWorkspaceId(ld: Partial<LegacyDevice>, fallbackWsId: string = 'ws_vakzim'): string {
  if (ld.workspaceId && ld.workspaceId !== 'system') {
    return ld.workspaceId;
  }
  const cleanName = (ld.customerName || '').trim().toLowerCase();
  const mac = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  for (const seedLd of initialLegacyDevices) {
    const seedWs = (seedLd as any).workspaceId || 'ws_vakzim';
    if (seedLd.customerName && seedLd.customerName.trim().toLowerCase() === cleanName) return seedWs;
    if (mac.length >= 8 && seedLd.macAddress && seedLd.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === mac) return seedWs;
  }

  const agentName = (ld.fieldAgentName || '').toLowerCase();
  if (agentName.includes('mukondodzi') || agentName.includes('chitsungo') || agentName.includes('histec')) {
    return 'ws_client_1788646327740';
  }
  if (agentName.includes('annitah') || agentName.includes('siphelani')) {
    return 'ws_1790605401339';
  }
  if (agentName.includes('bob moyo') || agentName.includes('charlie ncube') || agentName.includes('moyo') || agentName.includes('ncube')) {
    return 'ws_vakzim';
  }

  return fallbackWsId;
}

export function getVoucherWorkspaceId(v: Voucher, usersList: UserProfile[] = [], fallbackWsId?: string): string {
  if (v.workspaceId && v.workspaceId !== 'system') return v.workspaceId;
  if ((v as any).workspace_id && (v as any).workspace_id !== 'system') return (v as any).workspace_id;
  if (v.assignedAgentId) {
    const agent = usersList.find(u => u.uid === v.assignedAgentId || (u as any).id === v.assignedAgentId);
    if (agent?.workspaceId && agent.workspaceId !== 'system') return agent.workspaceId;
  }
  return resolveVoucherWorkspaceId(v, fallbackWsId || 'ws_vakzim');
}

export function getRequestWorkspaceId(r: VoucherRequest, usersList: UserProfile[] = [], fallbackWsId?: string): string {
  if (r.workspaceId) return r.workspaceId;
  if (r.agentId) {
    const agent = usersList.find(u => u.uid === r.agentId);
    if (agent?.workspaceId) return agent.workspaceId;
  }
  if (r.agentName) {
    const clean = r.agentName.toLowerCase();
    if (clean.includes('annitah') || clean.includes('siphelani')) return 'ws_1790605401339';
    if (clean.includes('mukondodzi') || clean.includes('chitsungo') || clean.includes('histec')) return 'ws_client_1788646327740';
    if (clean.includes('moyo') || clean.includes('ncube') || clean.includes('bob') || clean.includes('charlie')) return 'ws_vakzim';
  }
  if (r.location && r.location.toLowerCase().includes('chitsungo')) return 'ws_client_1788646327740';
  return fallbackWsId || 'ws_vakzim';
}

export function getCashDropWorkspaceId(cd: CashDrop, usersList: UserProfile[] = [], fallbackWsId?: string): string {
  if (cd.workspaceId) return cd.workspaceId;
  if (cd.agentId) {
    const agent = usersList.find(u => u.uid === cd.agentId);
    if (agent?.workspaceId) return agent.workspaceId;
  }
  if (cd.agentName) {
    const clean = cd.agentName.toLowerCase();
    if (clean.includes('annitah') || clean.includes('siphelani')) return 'ws_1790605401339';
    if (clean.includes('mukondodzi') || clean.includes('chitsungo') || clean.includes('histec')) return 'ws_client_1788646327740';
    if (clean.includes('moyo') || clean.includes('ncube') || clean.includes('bob') || clean.includes('charlie')) return 'ws_vakzim';
  }
  return fallbackWsId || 'ws_vakzim';
}

export function getLegacyDeviceWorkspaceId(ld: LegacyDevice, usersList: UserProfile[] = [], fallbackWsId?: string): string {
  if (ld.workspaceId && ld.workspaceId !== 'system') return ld.workspaceId;
  if (ld.fieldAgentId) {
    const agent = usersList.find(u => u.uid === ld.fieldAgentId);
    if (agent?.workspaceId && agent.workspaceId !== 'system') return agent.workspaceId;
  }
  return resolveLegacyDeviceWorkspaceId(ld, fallbackWsId || 'ws_vakzim');
}

export function isMemberOfWorkspace(
  userIdOrName: string | undefined,
  workspaceId: string,
  usersList: UserProfile[] = initialUsers,
  workspacesList: Workspace[] = initialWorkspaces
): boolean {
  if (!workspaceId || workspaceId === 'system') return true;
  if (!userIdOrName) return false;

  const cleanInput = userIdOrName.trim().toLowerCase();

  // 1. Known non-members of VakZim Connect Workspace (ws_client_1788646327740)
  if (workspaceId === 'ws_client_1788646327740') {
    if (
      cleanInput.includes('bob') ||
      cleanInput.includes('moyo') ||
      cleanInput.includes('mayo') ||
      cleanInput.includes('annitah') ||
      cleanInput.includes('charlie') ||
      cleanInput.includes('ncube') ||
      cleanInput === 'agent_001' ||
      cleanInput === 'agent_002' ||
      cleanInput === 'ebuj2wqfvfmqo8oqvdz3ttilcm02' ||
      cleanInput.includes('zuwessy')
    ) {
      return false;
    }
  }

  // 2. Known non-members of VakZim ICT&E Hub (ws_vakzim)
  if (workspaceId === 'ws_vakzim') {
    if (
      cleanInput.includes('annitah') ||
      cleanInput.includes('mukondodzi') ||
      cleanInput.includes('chitsungo') ||
      cleanInput.includes('histec') ||
      cleanInput.includes('siphelani') ||
      cleanInput.includes('zuwessy') ||
      cleanInput.includes('clarence') ||
      cleanInput.includes('teguru')
    ) {
      return false;
    }
  }

  // 3. Known non-members of Zuwessy Tech (ws_1790605401339)
  if (workspaceId === 'ws_1790605401339') {
    if (
      cleanInput.includes('bob') ||
      cleanInput.includes('moyo') ||
      cleanInput.includes('mayo') ||
      cleanInput.includes('charlie') ||
      cleanInput.includes('ncube') ||
      cleanInput.includes('mukondodzi') ||
      cleanInput.includes('chitsungo') ||
      cleanInput.includes('histec') ||
      cleanInput === 'agent_001' ||
      cleanInput === 'agent_002' ||
      cleanInput === '6ih4ntjnxuentt1z0orvhzgkquv2' ||
      cleanInput === '7qfbneu9xxaloi6kl8csotm58te2' ||
      cleanInput === 'oiofbo6j6jv6qm0orrxvfwpucfp2' ||
      cleanInput === 'qepvldas0gpjr2kuwjfadnzflf1'
    ) {
      return false;
    }
  }

  // 4. Check user profiles list
  const matchedUser = usersList.find(u => {
    if (u.uid && u.uid.toLowerCase() === cleanInput) return true;
    if ((u as any).id && (u as any).id.toLowerCase() === cleanInput) return true;
    if (u.email && u.email.toLowerCase() === cleanInput) return true;
    if (u.name && u.name.trim().toLowerCase() === cleanInput) return true;
    if (u.name && (u.name.toLowerCase().includes(cleanInput) || cleanInput.includes(u.name.toLowerCase()))) return true;
    return false;
  });

  if (matchedUser) {
    if (matchedUser.workspaceId && matchedUser.workspaceId === workspaceId) return true;
    if (matchedUser.workspaceId && matchedUser.workspaceId !== workspaceId) return false;
  }

  // 5. Check workspace owners / agent IDs
  const ws = workspacesList.find(w => w.id === workspaceId);
  if (ws) {
    if (ws.ownerId && ws.ownerId.toLowerCase() === cleanInput) return true;
    if (ws.ownerUid && ws.ownerUid.toLowerCase() === cleanInput) return true;
    if (ws.ownerEmail && ws.ownerEmail.toLowerCase() === cleanInput) return true;
    if (Array.isArray(ws.agentIds) && ws.agentIds.some(aId => aId.toLowerCase() === cleanInput)) return true;
  }

  // 6. Explicit heuristic member checks for VakZim Connect Workspace
  if (workspaceId === 'ws_client_1788646327740') {
    if (
      cleanInput.includes('mukondodzi') ||
      cleanInput.includes('chitsungo') ||
      cleanInput.includes('histec') ||
      cleanInput.includes('onlineproductfinder') ||
      cleanInput.includes('vakzim ict&e')
    ) {
      return true;
    }
    return false;
  }

  // 7. Explicit heuristic member checks for VakZim ICT&E Hub
  if (workspaceId === 'ws_vakzim') {
    if (
      cleanInput.includes('bob') ||
      cleanInput.includes('moyo') ||
      cleanInput.includes('mayo') ||
      cleanInput.includes('charlie') ||
      cleanInput.includes('ncube') ||
      cleanInput.includes('master') ||
      cleanInput.includes('vakzim admin') ||
      cleanInput === 'master_001' ||
      cleanInput === 'agent_001' ||
      cleanInput === 'agent_002'
    ) {
      return true;
    }
    return false;
  }

  // 8. Explicit heuristic member checks for Zuwessy Tech
  if (workspaceId === 'ws_1790605401339') {
    if (
      cleanInput.includes('annitah') ||
      cleanInput.includes('siphelani') ||
      cleanInput.includes('zuwessy') ||
      cleanInput.includes('clarence') ||
      cleanInput.includes('teguru') ||
      cleanInput === 'slm4digpfkdnpgds3ap4junpgov2' ||
      cleanInput === 'ebuj2wqfvfmqo8oqvdz3ttilcm02' ||
      cleanInput === 'agent_1790695694537'
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Resolves the target workspace ID for filtering workspace entities (customers, vouchers, devices).
 * Guarantees that selected activeWorkspace takes precedence over 'system' or unassigned user workspace.
 */
export function getTargetWorkspaceId(
  activeWorkspace: { id: string } | null | undefined,
  currentUser: { workspaceId?: string } | null | undefined,
  defaultWsId: string = 'ws_vakzim'
): string {
  if (activeWorkspace && activeWorkspace.id && activeWorkspace.id !== 'system' && activeWorkspace.id !== 'ALL') {
    return activeWorkspace.id;
  }
  if (currentUser && currentUser.workspaceId && currentUser.workspaceId !== 'system' && currentUser.workspaceId !== 'ALL') {
    return currentUser.workspaceId;
  }
  if (activeWorkspace && activeWorkspace.id) {
    return activeWorkspace.id;
  }
  return defaultWsId;
}

/**
 * Deterministically resolves a customer's true workspace identity.
 * Authoritative cross-check with initial seed vouchers and legacy devices guaranteed,
 * followed by transaction agent check, explicit workspaceId, and context fallback.
 */
export function resolveCustomerWorkspaceId(
  c: Partial<Customer>,
  fallbackWsId: string = 'ws_vakzim'
): string {
  if (!c) return fallbackWsId;

  // 1. If explicit workspaceId exists and is valid, use it
  if (c.workspaceId && c.workspaceId !== 'system') {
    return c.workspaceId;
  }

  const cleanName = (c.name || '').trim().toLowerCase();
  const phoneDigits = (c.cellNumber || '').replace(/\D/g, '');
  const mac = (c.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // 2. Cross-check initial seed vouchers using accurate workspace resolver
  for (const v of initialVouchers) {
    const vWsId = resolveVoucherWorkspaceId(v);
    if (v.customerName && v.customerName.trim().toLowerCase() === cleanName) return vWsId;
    if (phoneDigits.length >= 6 && v.customerCell && v.customerCell.replace(/\D/g, '') === phoneDigits) return vWsId;
    if (c.id && v.customerId && v.customerId === c.id) return vWsId;
  }

  // 3. Cross-check initial seed legacy devices using accurate workspace resolver
  for (const ld of initialLegacyDevices) {
    const ldWsId = resolveLegacyDeviceWorkspaceId(ld);
    if (ld.customerName && ld.customerName.trim().toLowerCase() === cleanName) return ldWsId;
    if (phoneDigits.length >= 6 && ld.customerCell && ld.customerCell.replace(/\D/g, '') === phoneDigits) return ldWsId;
    if (mac.length >= 8 && ld.macAddress && ld.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === mac) return ldWsId;
    if (c.id && ld.customerId && ld.customerId === c.id) return ldWsId;
  }

  return fallbackWsId || 'ws_vakzim';
}

/**
 * Monotonic Customer Registry State Guard:
 * Prevents accidental fluctuation or dropping of customer records for a workspace
 * unless an explicit customer deletion operation is performed.
 */
export function mergeCustomersWithMonotonicGuard(
  prev: Customer[],
  incomingNewForWs: Customer[],
  targetWsId: string,
  isExplicitDeletion: boolean = false
): Customer[] {
  if (!targetWsId) return incomingNewForWs;

  const otherWs = prev.filter(c => resolveCustomerWorkspaceId(c, targetWsId) !== targetWsId);
  const prevWs = prev.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId);

  // If incoming dataset has fewer records than prevWs and it's not an explicit deletion, merge prevWs with incomingNewForWs
  if (!isExplicitDeletion && incomingNewForWs.length < prevWs.length) {
    const map = new Map<string, Customer>();
    prevWs.forEach(c => map.set(c.id, c));
    incomingNewForWs.forEach(c => map.set(c.id, c));
    const mergedWs = Array.from(map.values());
    return [...otherWs, ...mergedWs];
  }

  return [...otherWs, ...incomingNewForWs];
}

/**
 * Synthesizes and merges customer records from Firestore, sold vouchers, and legacy devices.
 * Ensures strict deduplication of customer names and legacy device entries.
 * Deleted customers are strictly respected and never resurrected.
 */
function synthesizeCustomers(
  existingDbCustomers: Customer[],
  currentVouchers: Voucher[],
  currentLegacyDevices: LegacyDevice[],
  targetWsId: string
): Customer[] {
  const custMap = new Map<string, Customer>();
  const byName = new Map<string, Customer>();
  const byPhone = new Map<string, Customer>();
  const byMac = new Map<string, Customer>();

  const deletedIds = getDeletedCustomerIds();
  const deletedNames = getDeletedCustomerNames();
  const duplicateCustIdsToDelete: string[] = [];

  // Identify which customer names belong to other workspaces
  const otherWsCustomerNames = new Map<string, string>(); // normName -> ownerWsId

  // Index seed vouchers & legacy devices to strictly protect workspace boundaries
  for (const v of initialVouchers) {
    if (v.customerName) {
      const vWsId = resolveVoucherWorkspaceId(v);
      if (targetWsId && targetWsId !== 'system' && vWsId !== targetWsId) {
        otherWsCustomerNames.set(v.customerName.trim().toLowerCase(), vWsId);
      }
    }
  }
  for (const ld of initialLegacyDevices) {
    if (ld.customerName) {
      const ldWsId = resolveLegacyDeviceWorkspaceId(ld);
      if (targetWsId && targetWsId !== 'system' && ldWsId !== targetWsId) {
        otherWsCustomerNames.set(ld.customerName.trim().toLowerCase(), ldWsId);
      }
    }
  }
  for (const v of currentVouchers) {
    if (v.customerName) {
      const vWsId = resolveVoucherWorkspaceId(v);
      if (targetWsId && targetWsId !== 'system' && vWsId !== targetWsId) {
        otherWsCustomerNames.set(v.customerName.trim().toLowerCase(), vWsId);
      }
    }
  }
  for (const ld of currentLegacyDevices) {
    if (ld.customerName) {
      const ldWsId = resolveLegacyDeviceWorkspaceId(ld);
      if (targetWsId && targetWsId !== 'system' && ldWsId !== targetWsId) {
        otherWsCustomerNames.set(ld.customerName.trim().toLowerCase(), ldWsId);
      }
    }
  }

  // Build set of legitimate customer names for targetWsId
  const targetWsLegitimateNames = new Set<string>();
  const targetWsLegitimatePhones = new Set<string>();
  const targetWsLegitimateMacs = new Set<string>();
  const targetWsLegitimateCustIds = new Set<string>();

  const addLegitimateRecord = (wsId: string, name?: string, cell?: string, mac?: string, custId?: string) => {
    if (!targetWsId || targetWsId === 'system' || wsId === targetWsId) {
      if (name) targetWsLegitimateNames.add(name.trim().toLowerCase());
      if (cell) {
        const d = cell.replace(/\D/g, '');
        if (d.length >= 6) targetWsLegitimatePhones.add(d);
      }
      if (mac) {
        const m = mac.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (m.length >= 8) targetWsLegitimateMacs.add(m);
      }
      if (custId) targetWsLegitimateCustIds.add(custId);
    }
  };

  for (const v of currentVouchers) {
    addLegitimateRecord(resolveVoucherWorkspaceId(v), v.customerName, v.customerCell, undefined, v.customerId);
  }
  for (const ld of currentLegacyDevices) {
    addLegitimateRecord(resolveLegacyDeviceWorkspaceId(ld), ld.customerName, ld.customerCell, ld.macAddress, ld.customerId);
  }
  for (const v of initialVouchers) {
    addLegitimateRecord(resolveVoucherWorkspaceId(v), v.customerName, v.customerCell, undefined, v.customerId);
  }
  for (const ld of initialLegacyDevices) {
    addLegitimateRecord(resolveLegacyDeviceWorkspaceId(ld), ld.customerName, ld.customerCell, ld.macAddress, ld.customerId);
  }

  // 1. Index and strictly deduplicate existing customers
  for (const c of existingDbCustomers) {
    if (!c || !c.id || !c.name) continue;
    const cleanName = c.name.trim();
    const normName = cleanName.toLowerCase();

    // Skip placeholder names
    if (!normName || isPlaceholderOrWalkInClient(cleanName)) {
      duplicateCustIdsToDelete.push(c.id);
      continue;
    }

    // If customer was deleted by user, purge and never include
    if (deletedIds.has(c.id) || deletedNames.has(normName)) {
      duplicateCustIdsToDelete.push(c.id);
      continue;
    }

    const phoneDigits = (c.cellNumber || '').replace(/\D/g, '');
    const normMac = (c.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Check if this record belongs to this workspace
    const resolvedWs = resolveCustomerWorkspaceId(c, targetWsId);
    const savedBy = c.savedByName || c.savedByUserId || c.createdByName || c.createdByUserId || c.lastAgentName;

    // STRICT WORKSPACE & MEMBER ISOLATION:
    // If savedBy is not a member of targetWsId, purge from this workspace's registry
    if (targetWsId && targetWsId !== 'system') {
      if (savedBy && !isMemberOfWorkspace(savedBy, targetWsId)) {
        duplicateCustIdsToDelete.push(c.id);
        continue;
      }
      if (resolvedWs !== targetWsId && c.workspaceId !== targetWsId) {
        continue;
      }
    }

    // Ensure customer record has targetWsId set and workspace/user metadata
    if (targetWsId && targetWsId !== 'system') {
      c.workspaceId = targetWsId;
    }
    if (!c.savedByName) {
      c.savedByName = c.createdByName || c.lastAgentName || 'Workspace Member';
      c.savedByUserRole = c.createdByUserRole || 'Agent';
    }

    // Check if customer already exists by Name, Phone, or MAC address
    let existingMatch: Customer | undefined;
    if (normName && byName.has(normName)) {
      existingMatch = byName.get(normName);
    } else if (phoneDigits.length >= 6 && byPhone.has(phoneDigits)) {
      existingMatch = byPhone.get(phoneDigits);
    } else if (normMac.length >= 8 && byMac.has(normMac)) {
      existingMatch = byMac.get(normMac);
    }

    if (existingMatch) {
      if (targetWsId && targetWsId !== 'system') {
        existingMatch.workspaceId = targetWsId;
      }
      // MERGE DUPLICATE CUSTOMER ENTRY INTO CANONICAL ENTRY
      if (c.customerType === 'legacy_device') {
        existingMatch.customerType = 'legacy_device';
      }
      if (!existingMatch.macAddress && c.macAddress) existingMatch.macAddress = c.macAddress;
      if (!existingMatch.deviceModel && c.deviceModel) existingMatch.deviceModel = c.deviceModel;
      if (!existingMatch.monthlyPrice && c.monthlyPrice) existingMatch.monthlyPrice = c.monthlyPrice;
      if (!existingMatch.cellNumber && c.cellNumber) existingMatch.cellNumber = c.cellNumber;

      // Keep lower sequential customerNumber e.g. CN:01 instead of CN:09
      const numExisting = parseInt((existingMatch.customerNumber || '').replace(/\D/g, ''), 10) || 999;
      const numC = parseInt((c.customerNumber || '').replace(/\D/g, ''), 10) || 999;
      if (numC < numExisting && c.customerNumber) {
        existingMatch.customerNumber = c.customerNumber;
      }

      // Merge purchase histories
      const existingPurchasesMap = new Map((existingMatch.consecutivePurchases || []).map(p => [p.voucherId || p.id, p]));
      (c.consecutivePurchases || []).forEach(p => {
        const key = p.voucherId || p.id;
        if (!existingPurchasesMap.has(key)) {
          existingPurchasesMap.set(key, p);
        }
      });
      existingMatch.consecutivePurchases = Array.from(existingPurchasesMap.values());
      existingMatch.totalPurchases = Math.max(existingMatch.totalPurchases || 0, c.totalPurchases || 0, existingMatch.consecutivePurchases.length);
      existingMatch.totalSpend = Math.max(existingMatch.totalSpend || 0, c.totalSpend || 0);
      existingMatch.totalSaved = Math.max(existingMatch.totalSaved || 0, c.totalSaved || 0);
      existingMatch.streakCount = calculateActiveStreakCount(existingMatch);

      if (c.lastPurchaseDate && (!existingMatch.lastPurchaseDate || c.lastPurchaseDate > existingMatch.lastPurchaseDate)) {
        existingMatch.lastPurchaseDate = c.lastPurchaseDate;
        existingMatch.lastAgentName = c.lastAgentName || existingMatch.lastAgentName;
        existingMatch.lastVoucherCode = c.lastVoucherCode || existingMatch.lastVoucherCode;
      }

      // Update secondary lookup maps
      if (normName) byName.set(normName, existingMatch);
      if (phoneDigits.length >= 6) byPhone.set(phoneDigits, existingMatch);
      if (normMac.length >= 8) byMac.set(normMac, existingMatch);

      // Mark the redundant duplicate record ID for permanent background removal
      if (c.id !== existingMatch.id) {
        duplicateCustIdsToDelete.push(c.id);
      }
    } else {
      // New unique customer record
      custMap.set(c.id, c);
      if (normName) byName.set(normName, c);
      if (phoneDigits.length >= 6) byPhone.set(phoneDigits, c);
      if (normMac.length >= 8) byMac.set(normMac, c);
    }
  }

  let hasNew = false;
  const newCustomersToPersist: Customer[] = [];

  // Track allocated customer numbers and occupied positive integers.
  // Rule: No two different customers can have the same customer number.
  // Reclaims the lowest free/deleted customer number slot to prevent jumping the sequence.
  const allocatedCustNumbers = new Map<string, string>(); // normNumber -> customerId
  const occupiedNumbers = new Set<number>();

  for (const c of custMap.values()) {
    if (c.customerNumber) {
      const match = c.customerNumber.match(/\d+/);
      const num = match ? parseInt(match[0], 10) : 0;
      const normNum = c.customerNumber.trim().toLowerCase();

      if (!allocatedCustNumbers.has(normNum)) {
        allocatedCustNumbers.set(normNum, c.id);
        if (num > 0) occupiedNumbers.add(num);
      }
    }
  }

  // Resolve any existing customer number collisions so every single customer has a strictly unique number
  for (const c of custMap.values()) {
    const normNum = (c.customerNumber || '').trim().toLowerCase();
    if (!c.customerNumber || allocatedCustNumbers.get(normNum) !== c.id) {
      let freeNum = 1;
      while (occupiedNumbers.has(freeNum)) {
        freeNum++;
      }
      occupiedNumbers.add(freeNum);
      const uniqueNumber = `CN:${String(freeNum).padStart(2, '0')}`;
      c.customerNumber = uniqueNumber;
      allocatedCustNumbers.set(uniqueNumber.trim().toLowerCase(), c.id);
      newCustomersToPersist.push(c);
      hasNew = true;
    }
  }

  // 2. Scan sold vouchers with customer names
  for (const v of currentVouchers) {
    if (!v.customerName) continue;

    // STRICT WORKSPACE ISOLATION:
    // Only process vouchers belonging to targetWsId!
    const vWsId = resolveVoucherWorkspaceId(v);
    if (targetWsId && targetWsId !== 'system' && vWsId !== targetWsId) {
      continue;
    }
    const vSaver = v.assignedAgentName || v.assignedAgentId;
    if (targetWsId && targetWsId !== 'system' && vSaver && !isMemberOfWorkspace(vSaver, targetWsId)) {
      continue;
    }

    const cleanName = v.customerName.trim();
    const normName = cleanName.toLowerCase();
    if (!normName || isPlaceholderOrWalkInClient(cleanName)) {
      continue;
    }

    // Do NOT resurrect deleted customers
    if (deletedNames.has(normName) || (v.customerId && deletedIds.has(v.customerId))) {
      continue;
    }

    const phoneDigits = (v.customerCell || '').replace(/\D/g, '');

    let existing = byName.get(normName);
    if (!existing && phoneDigits.length >= 6) {
      existing = byPhone.get(phoneDigits);
    }
    if (!existing && v.customerId && custMap.has(v.customerId)) {
      existing = custMap.get(v.customerId);
    }

    if (existing) {
      // Ensure purchase record is recorded in consecutive purchases
      const purchases = existing.consecutivePurchases || [];
      const alreadyHasVoucher = purchases.some(p => p.voucherId === v.id || (p.voucherCode && p.voucherCode === v.code));
      if (!alreadyHasVoucher) {
        const vWorth = Math.max(v.originalPrice || 0, v.price || 0, getVoucherMonetaryValue(v));
        const isQualifyingVoucher = vWorth >= 3.0;
        const purRec: CustomerPurchaseRecord = {
          id: `pur_${v.id}`,
          voucherId: v.id,
          voucherCode: v.code,
          price: getVoucherMonetaryValue(v),
          discountApplied: v.discountApplied || 0,
          originalPrice: v.originalPrice || v.price,
          timestamp: v.soldAt ? new Date(v.soldAt).getTime() : Date.now(),
          agentId: v.assignedAgentId || 'agent',
          agentName: v.assignedAgentName || 'Agent',
          plan: v.plan
        };

        // Streak counting applies strictly to vouchers worth $3 or more
        if (isQualifyingVoucher) {
          existing.consecutivePurchases = [...purchases, purRec];
          existing.streakCount = calculateActiveStreakCount(existing);
        } else {
          existing.consecutivePurchases = purchases;
          existing.streakCount = calculateActiveStreakCount(existing);
        }
        existing.totalPurchases = (existing.totalPurchases || 0) + 1;
        existing.totalSpend = (existing.totalSpend || 0) + getVoucherMonetaryValue(v);
        existing.totalSaved = (existing.totalSaved || 0) + (v.discountApplied || 0);
        existing.lastPurchaseDate = v.soldAt ? new Date(v.soldAt).getTime() : Date.now();
        existing.lastAgentName = v.assignedAgentName || existing.lastAgentName;
        existing.lastVoucherCode = v.code;
      }
    }
  }

  // 3. Scan legacy devices with customer names (Strictly preventing duplicate legacy device customer entries)
  for (const ld of currentLegacyDevices) {
    if (!ld.customerName) continue;

    // STRICT WORKSPACE ISOLATION:
    // Only process legacy devices belonging to targetWsId!
    const ldWsId = resolveLegacyDeviceWorkspaceId(ld);
    if (targetWsId && targetWsId !== 'system' && ldWsId !== targetWsId) {
      continue;
    }
    const ldSaver = ld.fieldAgentName || ld.fieldAgentId;
    if (targetWsId && targetWsId !== 'system' && ldSaver && !isMemberOfWorkspace(ldSaver, targetWsId)) {
      continue;
    }

    const cleanName = ld.customerName.trim();
    const normName = cleanName.toLowerCase();
    if (!normName || isPlaceholderOrWalkInClient(cleanName)) continue;

    // Do NOT resurrect deleted customers
    if (deletedNames.has(normName) || (ld.customerId && deletedIds.has(ld.customerId))) {
      continue;
    }

    const phoneDigits = (ld.customerCell || '').replace(/\D/g, '');
    const normMac = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Check if customer already exists by MAC, Name, Phone, or ID
    let existing: Customer | undefined;
    if (normMac.length >= 8 && byMac.has(normMac)) {
      existing = byMac.get(normMac);
    } else if (normName && byName.has(normName)) {
      existing = byName.get(normName);
    } else if (phoneDigits.length >= 6 && byPhone.has(phoneDigits)) {
      existing = byPhone.get(phoneDigits);
    } else if (ld.customerId && custMap.has(ld.customerId)) {
      existing = custMap.get(ld.customerId);
    }

    if (existing) {
      // UPGRADE EXISTING CUSTOMER WITH LEGACY DEVICE ATTRIBUTES - NEVER DUPLICATE!
      existing.customerType = 'legacy_device';
      if (!existing.macAddress && ld.macAddress) existing.macAddress = ld.macAddress;
      if (!existing.deviceModel && ld.deviceNameModel) existing.deviceModel = ld.deviceNameModel;
      if (!existing.monthlyPrice && ld.monthlyPrice) existing.monthlyPrice = ld.monthlyPrice;
      if (normMac.length >= 8) byMac.set(normMac, existing);
      if (normName) byName.set(normName, existing);

      // Add to purchase history if SOLD and not already included
      if (ld.status === 'SOLD') {
        const purchases = existing.consecutivePurchases || [];
        const alreadyHasDevice = purchases.some(p => p.voucherId === ld.id || (p.voucherCode && p.voucherCode === ld.macAddress));
        if (!alreadyHasDevice) {
          const price = ld.monthlyPrice || ld.soldPrice || 0;
          const isQualifying = price >= 3.0;
          const purRec: CustomerPurchaseRecord = {
            id: `pur_ld_${ld.id}`,
            voucherId: ld.id,
            voucherCode: ld.macAddress,
            price: price,
            discountApplied: ld.discountApplied || 0,
            originalPrice: ld.monthlyPrice || price,
            timestamp: ld.soldAt ? new Date(ld.soldAt).getTime() : (ld.approvedAt ? new Date(ld.approvedAt).getTime() : Date.now()),
            agentId: ld.fieldAgentId || 'agent',
            agentName: ld.fieldAgentName || 'Agent',
            plan: `${ld.deviceNameModel} (Legacy Non-WiFi)`
          };
          if (isQualifying) {
            existing.consecutivePurchases = [...purchases, purRec];
            existing.streakCount = calculateActiveStreakCount(existing);
          } else {
            existing.consecutivePurchases = purchases;
            existing.streakCount = calculateActiveStreakCount(existing);
          }
          existing.totalPurchases = (existing.totalPurchases || 0) + 1;
          existing.totalSpend = (existing.totalSpend || 0) + price;
          existing.totalSaved = (existing.totalSaved || 0) + (ld.discountApplied || 0);
          existing.lastPurchaseDate = ld.soldAt ? new Date(ld.soldAt).getTime() : (ld.approvedAt ? new Date(ld.approvedAt).getTime() : Date.now());
          existing.lastAgentName = ld.fieldAgentName || existing.lastAgentName;
          existing.lastVoucherCode = ld.macAddress;
        }
      }
    }
  }

  // Pure in-memory synthesis of customer entries from vouchers and legacy devices without triggering background setDoc loops
  const result = Array.from(custMap.values());
  result.sort((a, b) => {
    const numA = parseInt((a.customerNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt((b.customerNumber || '').replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  return result;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- Toast Notifications ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Theme ---
  const [activeThemeId, setActiveThemeIdState] = useState<string>(() => {
    return localStorage.getItem('wivote-active-theme-id') || 'carbon-blue';
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const active = localStorage.getItem('wivote-active-theme-id') || 'carbon-blue';
    const found = APP_THEMES.find(t => t.id === active);
    return found ? found.base : 'dark';
  });

  // Sync theme variables on activeThemeId change
  useEffect(() => {
    applyThemeVariables(activeThemeId);
    const found = APP_THEMES.find(t => t.id === activeThemeId);
    if (found && found.base !== theme) {
      setTheme(found.base);
      localStorage.setItem('wivote-theme', found.base);
    }
  }, [activeThemeId]);

  const setActiveThemeId = (themeId: string) => {
    setActiveThemeIdState(themeId);
    localStorage.setItem('wivote-active-theme-id', themeId);
    const found = APP_THEMES.find(t => t.id === themeId);
    if (found) {
      setTheme(found.base);
      localStorage.setItem('wivote-theme', found.base);
      applyThemeVariables(themeId);
    }
  };

  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState<boolean>(false);
  const openSnapshotModal = () => setIsSnapshotModalOpen(true);

  const [requestedRole, setRequestedRole] = useState<'Admin' | 'Agent' | 'AppOwner' | 'Investor' | null>(() => {
    return (localStorage.getItem('wivote_requested_role') as any) || 'Admin';
  });

  const handleSetRequestedRole = (role: 'Admin' | 'Agent' | 'AppOwner' | 'Investor' | null) => {
    setRequestedRole(role);
    if (role) {
      localStorage.setItem('wivote_requested_role', role);
    } else {
      localStorage.removeItem('wivote_requested_role');
    }
  };

  const toggleTheme = () => {
    // Standard quick toggle: switches between Carbon Blue (dark) and Classic Off-White (light)
    const nextThemeId = theme === 'dark' ? 'classic-light' : 'carbon-blue';
    setActiveThemeId(nextThemeId);
  };

  // --- Splash Screen (1.8 seconds on first initial cold open only) ---
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    const isRedirect = typeof localStorage !== 'undefined' && localStorage.getItem('wivote_google_auth_redirect_pending') === 'true';
    const alreadyShown = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wivote_splash_shown') === 'true';
    const isAuth = typeof localStorage !== 'undefined' && (localStorage.getItem('wivote_is_logged_in') === 'true' || sessionStorage.getItem('wivote_is_logged_in') === 'true');
    if (isRedirect || alreadyShown || isAuth) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (showSplash) {
      sessionStorage.setItem('wivote_splash_shown', 'true');
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  // Fast baseline cache accessors to ensure users and workspaces are always instantly accessible
  const getCachedUsers = useCallback((): UserProfile[] => {
    try {
      const local = localStorage.getItem('wivote_users');
      const parsed = safeJsonParse<UserProfile[]>(local, initialUsers);
      if (!Array.isArray(parsed) || parsed.length === 0) return initialUsers;
      const map = new Map<string, UserProfile>();
      initialUsers.forEach(u => map.set(u.uid, u));
      parsed.forEach((u: UserProfile) => {
        if (u && (u.uid || u.email)) {
          const key = u.uid || (u.email as string);
          map.set(key, { ...(map.get(key) || {}), ...u });
        }
      });
      return Array.from(map.values()).filter(u => {
        const uid = (u.uid || (u as any).id || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        return !(
          uid === 'agent_001' ||
          uid === 'agent_002' ||
          email === 'agent1@wivote.com' ||
          email === 'agent2@wivote.com' ||
          name.includes('bob moyo') ||
          name.includes('charlie ncube')
        );
      });
    } catch {
      return initialUsers.filter(u => {
        const uid = (u.uid || (u as any).id || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        return !(
          uid === 'agent_001' ||
          uid === 'agent_002' ||
          email === 'agent1@wivote.com' ||
          email === 'agent2@wivote.com' ||
          name.includes('bob moyo') ||
          name.includes('charlie ncube')
        );
      });
    }
  }, []);

  const getCachedWorkspaces = useCallback((): Workspace[] => {
    try {
      const local = localStorage.getItem('wivote_workspaces');
      const parsed = safeJsonParse(local, initialWorkspaces);
      if (!Array.isArray(parsed) || parsed.length === 0) return initialWorkspaces;
      const map = new Map<string, Workspace>();
      initialWorkspaces.forEach(w => map.set(w.id, w));
      parsed.forEach((w: Workspace) => {
        if (w && w.id) {
          map.set(w.id, { ...(map.get(w.id) || {}), ...w });
        }
      });
      return Array.from(map.values());
    } catch {
      return initialWorkspaces;
    }
  }, []);

  // Run proactive localStorage quota reclamation on initial load to purge obsolete heavy backups/logs
  useEffect(() => {
    cleanupStorageForSpace();
  }, []);

  // --- State Engine (Fallbacks to LocalStorage) ---
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem('wivote_appowner_selected_workspace_id');
  });

  const handleSetSelectedWorkspaceId = (id: string | null) => {
    setSelectedWorkspaceId(id);
    if (id) {
      localStorage.setItem('wivote_appowner_selected_workspace_id', id);
      try {
        const cachedVouchers = localStorage.getItem(`wivote_ws_vouchers_${id}`);
        if (cachedVouchers) {
          const parsedV = safeJsonParse<Voucher[]>(cachedVouchers, []);
          if (Array.isArray(parsedV) && parsedV.length > 0) {
            setVouchers(prev => {
              const map = new Map<string, Voucher>();
              prev.forEach(v => map.set(v.id, v));
              parsedV.forEach((v: Voucher) => map.set(v.id, { ...v, workspaceId: (v as any).workspaceId || id }));
              return Array.from(map.values());
            });
          }
        }
        const cachedLegacy = localStorage.getItem(`wivote_ws_legacy_${id}`);
        if (cachedLegacy) {
          const parsedL = safeJsonParse<LegacyDevice[]>(cachedLegacy, []);
          if (Array.isArray(parsedL) && parsedL.length > 0) setLegacyDevices(parsedL);
        }
        const cachedLeaderboard = localStorage.getItem(`wivote_leaderboard_${id}`);
        if (cachedLeaderboard) {
          const parsedLb = safeJsonParse<Record<string, number>>(cachedLeaderboard, {});
          if (parsedLb && typeof parsedLb === 'object') setLeaderboardSummary(prev => ({ ...prev, ...parsedLb }));
        }
        const cachedDrops = localStorage.getItem(`wivote_ws_cash_drops_${id}`);
        if (cachedDrops) {
          const parsedD = safeJsonParse<CashDrop[]>(cachedDrops, []);
          if (Array.isArray(parsedD) && parsedD.length > 0) setCashDrops(parsedD);
        }
      } catch (e) {}
    } else {
      localStorage.removeItem('wivote_appowner_selected_workspace_id');
    }
  };

  const isProduction = import.meta.env.VITE_APP_ENV === 'production';

  const devEmail = import.meta.env.VITE_DEV_EMAIL || 'karimazondomike049@gmail.com';

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const local = localStorage.getItem('wivote_workspaces');
    const parsed = safeJsonParse(local, initialWorkspaces);
    if (!Array.isArray(parsed) || parsed.length === 0) return initialWorkspaces;
    const map = new Map<string, Workspace>();
    initialWorkspaces.forEach(w => map.set(w.id, w));
    parsed.forEach((w: Workspace) => map.set(w.id, { ...(map.get(w.id) || {}), ...w }));
    return Array.from(map.values());
  });

  const [workspacesRecordedCount, setWorkspacesRecordedCount] = useState<number>(() => {
    const saved = localStorage.getItem('wivote_synced_workspaces_count');
    if (saved !== null && !isNaN(Number(saved))) return Number(saved);
    const local = localStorage.getItem('wivote_workspaces');
    const parsed = safeJsonParse(local, initialWorkspaces);
    return Array.isArray(parsed) ? parsed.length : 2;
  });

  const [agentsRecordedCount, setAgentsRecordedCount] = useState<number>(() => {
    const saved = localStorage.getItem('wivote_synced_agents_count');
    if (saved !== null && !isNaN(Number(saved))) return Number(saved);
    return -1;
  });

  const syncWorkspacesCountToCloud = useCallback(async (totalCount: number, activeCount: number, agentsCount?: number) => {
    setWorkspacesRecordedCount(totalCount);
    localStorage.setItem('wivote_synced_workspaces_count', String(totalCount));
    if (typeof agentsCount === 'number') {
      setAgentsRecordedCount(agentsCount);
      localStorage.setItem('wivote_synced_agents_count', String(agentsCount));
    }
    if (!isFirebasePlaceholder) {
      try {
        const payload: any = {
          workspacesRecordedCount: totalCount,
          activeWorkspacesCount: activeCount,
          updatedAt: new Date().toISOString()
        };
        if (typeof agentsCount === 'number') {
          payload.agentsRecordedCount = agentsCount;
          payload.activeAgentsCount = agentsCount;
        }
        await setDoc(doc(db, 'saas_config', 'workspaces_summary'), payload, { merge: true });
      } catch (err) {
        console.warn("Could not sync workspaces_summary to Firestore:", err);
      }
    }
  }, []);

  const [users, setUsers] = useState<UserProfile[]>(() => {
    const local = localStorage.getItem('wivote_users');
    const parsed = safeJsonParse<UserProfile[]>(local, initialUsers);
    if (!Array.isArray(parsed) || parsed.length === 0) return initialUsers;
    const map = new Map<string, UserProfile>();
    initialUsers.forEach(u => map.set(u.uid, u));
    parsed.forEach((u: UserProfile) => {
      if (u && u.uid) {
        map.set(u.uid, { ...(map.get(u.uid) || {}), ...u });
      }
    });
    return Array.from(map.values());
  });

  const [vouchers, setVouchers] = useState<Voucher[]>(() => {
    const local = localStorage.getItem('wivote_vouchers');
    const parsed = safeJsonParse(local, initialVouchers);
    const delNames = getDeletedCustomerNames();
    const delIds = getDeletedCustomerIds();
    const delPlans = getDeletedPlans();
    const map = new Map<string, Voucher>();
    initialVouchers.forEach(v => {
      if (v.plan && delPlans.has(v.plan)) return;
      if (v.id === 'test_gift_voucher_101') return;
      const normN = (v.customerName || '').trim().toLowerCase();
      const isDel = (normN && delNames.has(normN)) || (v.customerId && delIds.has(v.customerId));
      map.set(v.id, {
        ...v,
        customerName: isDel ? undefined : v.customerName,
        customerCell: isDel ? undefined : v.customerCell,
        customerId: isDel ? undefined : v.customerId,
        customerNumber: isDel ? undefined : v.customerNumber,
        workspaceId: (v as any).workspaceId || 'ws_vakzim'
      });
    });
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed.forEach((v: Voucher) => {
        if (v && v.id) {
          if (v.plan && delPlans.has(v.plan)) return;
          if (v.id === 'test_gift_voucher_101') return;
          const normN = (v.customerName || '').trim().toLowerCase();
          const isDel = (normN && delNames.has(normN)) || (v.customerId && delIds.has(v.customerId));
          map.set(v.id, {
            ...(map.get(v.id) || {}),
            ...v,
            customerName: isDel ? undefined : v.customerName,
            customerCell: isDel ? undefined : v.customerCell,
            customerId: isDel ? undefined : v.customerId,
            customerNumber: isDel ? undefined : v.customerNumber
          });
        }
      });
    }

    // Merge persistent sold vouchers registry (guarantees sold vouchers like tazgyn and nhn7x4 never revert to unsold)
    const soldReg = getSoldVouchersRegistry();
    soldReg.forEach(soldRec => {
      if (soldRec.plan && delPlans.has(soldRec.plan)) return;
      if (soldRec.id === 'test_gift_voucher_101') return;
      const cleanCode = sanitizeVoucherCode(soldRec.code || soldRec.id);
      let matched: Voucher | undefined;
      for (const existingV of map.values()) {
        if (existingV.id === soldRec.id || existingV.code === soldRec.code || sanitizeVoucherCode(existingV) === cleanCode) {
          matched = existingV;
          break;
        }
      }
      if (matched) {
        const authenticPrice = soldRec.soldPrice !== undefined ? soldRec.soldPrice : (matched.soldPrice || matched.price);
        map.set(matched.id, {
          ...matched,
          status: 'Sold',
          plan: soldRec.plan || matched.plan,
          duration: soldRec.duration || matched.duration,
          price: authenticPrice,
          soldAt: soldRec.soldAt || matched.soldAt || new Date().toISOString(),
          soldPrice: soldRec.soldPrice !== undefined ? soldRec.soldPrice : matched.soldPrice,
          originalPrice: soldRec.originalPrice !== undefined ? soldRec.originalPrice : (matched.originalPrice || matched.price),
          discountApplied: soldRec.discountApplied !== undefined ? soldRec.discountApplied : matched.discountApplied,
          customerName: soldRec.customerName || matched.customerName,
          customerCell: soldRec.customerCell || matched.customerCell,
          customerId: soldRec.customerId || matched.customerId,
          customerNumber: soldRec.customerNumber || matched.customerNumber,
          assignedAgentId: soldRec.assignedAgentId || matched.assignedAgentId,
          assignedAgentName: soldRec.assignedAgentName || matched.assignedAgentName,
          assignedAgentEmail: soldRec.assignedAgentEmail || (matched as any).assignedAgentEmail,
          soldByAgentId: soldRec.soldByAgentId || (matched as any).soldByAgentId,
          soldByAgentName: soldRec.soldByAgentName || (matched as any).soldByAgentName,
          workspaceId: soldRec.workspaceId || matched.workspaceId
        });
      } else {
        map.set(soldRec.id, {
          id: soldRec.id,
          code: cleanCode || soldRec.code,
          plan: soldRec.plan,
          price: soldRec.soldPrice,
          originalPrice: soldRec.originalPrice || soldRec.soldPrice,
          discountApplied: soldRec.discountApplied || 0,
          duration: soldRec.duration,
          status: 'Sold',
          soldAt: soldRec.soldAt,
          soldPrice: soldRec.soldPrice,
          customerName: soldRec.customerName,
          customerCell: soldRec.customerCell,
          customerId: soldRec.customerId,
          customerNumber: soldRec.customerNumber,
          assignedAgentId: soldRec.assignedAgentId,
          assignedAgentName: soldRec.assignedAgentName,
          assignedAgentEmail: soldRec.assignedAgentEmail,
          soldByAgentId: soldRec.soldByAgentId,
          soldByAgentName: soldRec.soldByAgentName,
          workspaceId: soldRec.workspaceId || 'ws_vakzim',
          location: soldRec.location,
          networkName: soldRec.networkName,
          isFree: soldRec.isFree
        });
      }
    });

    const byCodeMap = new Map<string, Voucher>();
    Array.from(map.values()).forEach(v => {
      const clean = sanitizeVoucherCode(v);
      const key = (clean || v.code || v.id).toLowerCase().trim();
      let finalizedV = { ...v, code: clean || v.code };

      const isSold = finalizedV.status === 'Sold' || (finalizedV.status as any) === 'sold' || !!finalizedV.soldAt;

      const CANONICAL_PLAN_PRICES: Record<string, number> = {
        'MONTH_45GB': 10.00,
        'MONTH_32GB': 7.00,
        'MONTH_23GB': 5.00,
        '2_WEEKS_15GB': 3.00,
        'Week': 2.00,
        '2HRS_6GB': 1.00,
        '1HR_10GB': 1.00,
        '3day': 1.00,
        '1HR_4GB': 0.50,
        '30M_2GB': 0.25,
        'Monthly': 6.00,
        '5 Days': 2.00,
        'Starter': 0.00,
        'Gold': 35.00,
        'Lithium': 75.00,
        '24Hours_Unlimited': 15.00
      };

      // 1. Definitively heal vouchers to their authentic plan and price (restoring pre-0.25 bulk update state)
      if (CANONICAL_PLAN_PRICES[finalizedV.plan] !== undefined) {
        const canonicalPrice = CANONICAL_PLAN_PRICES[finalizedV.plan];
        if (isSold && finalizedV.soldPrice !== undefined && finalizedV.soldPrice > 0) {
          finalizedV = {
            ...finalizedV,
            price: finalizedV.soldPrice,
            originalPrice: canonicalPrice
          };
        } else {
          finalizedV = {
            ...finalizedV,
            price: canonicalPrice,
            originalPrice: canonicalPrice,
            soldPrice: isSold ? (finalizedV.soldPrice ?? canonicalPrice) : finalizedV.soldPrice
          };
        }
      } else if (isSold && finalizedV.soldPrice !== undefined && finalizedV.soldPrice > 0 && Math.abs((Number(finalizedV.price) || 0) - Number(finalizedV.soldPrice)) > 0.001) {
        finalizedV = {
          ...finalizedV,
          price: finalizedV.soldPrice
        };
      }

      if (finalizedV.plan === '2HRS_6GB' || finalizedV.duration === '2 Hours' || ['zhuxz8', 'pdw7se', '7u6fjf', 'esuzt7', 'qnm8xt', 'imudrq'].includes(clean)) {
        finalizedV.plan = '2HRS_6GB';
        finalizedV.duration = '2 Hours';
      } else if (finalizedV.plan === '1HR_10GB' || clean === 'd6k3vf') {
        finalizedV.plan = '1HR_10GB';
        finalizedV.duration = '1 Hour';
      }

      if (!byCodeMap.has(key) || finalizedV.status === 'Sold') {
        byCodeMap.set(key, finalizedV);
      }
    });

    const healedVouchersList = Array.from(byCodeMap.values()).filter(v => (!v.plan || !delPlans.has(v.plan)) && v.id !== 'test_gift_voucher_101');
    try {
      saveVouchersCache(healedVouchersList, 'wivote_vouchers');
    } catch (e) {}

    return healedVouchersList;
  });

  const [requests, setRequests] = useState<VoucherRequest[]>(() => {
    const deletedIds = getDeletedRequestIds();
    const local = localStorage.getItem('wivote_requests');
    const parsed = safeJsonParse(local, initialRequests);
    const map = new Map<string, VoucherRequest>();

    // Load initial seeds only if not deleted
    initialRequests.forEach(r => {
      if (!deletedIds.has(r.id)) {
        map.set(r.id, r);
      }
    });

    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed.forEach((r: VoucherRequest) => {
        if (r && r.id && !deletedIds.has(r.id)) {
          const existing = map.get(r.id);
          const isExistingTerminal = existing?.status === 'Fulfilled' || existing?.status === 'Declined';
          const isIncomingTerminal = r.status === 'Fulfilled' || r.status === 'Declined';
          const finalStatus = (isExistingTerminal && !isIncomingTerminal) ? existing.status : r.status;
          map.set(r.id, { ...(existing || {}), ...r, status: finalStatus });
        }
      });
    }
    return Array.from(map.values());
  });

  const [cashDrops, setCashDrops] = useState<CashDrop[]>(() => {
    const local = localStorage.getItem('wivote_cash_drops');
    const parsed = safeJsonParse(local, initialCashDrops);
    const map = new Map<string, CashDrop>();
    initialCashDrops.forEach(c => map.set(c.id, c));
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed.forEach((c: CashDrop) => {
        if (c && c.id) {
          map.set(c.id, { ...(map.get(c.id) || {}), ...c });
        }
      });
    }
    return Array.from(map.values());
  });

  const [legacyDevices, setLegacyDevices] = useState<LegacyDevice[]>(() => {
    const local = localStorage.getItem('wivote_legacy_devices');
    const parsed = safeJsonParse(local, initialLegacyDevices);
    const delNames = getDeletedCustomerNames();
    const delIds = getDeletedCustomerIds();
    const map = new Map<string, LegacyDevice>();
    initialLegacyDevices.forEach(ld => {
      const normN = (ld.customerName || '').trim().toLowerCase();
      const isDel = (normN && delNames.has(normN)) || (ld.customerId && delIds.has(ld.customerId));
      map.set(ld.id, {
        ...ld,
        customerName: isDel ? undefined : ld.customerName,
        customerCell: isDel ? undefined : ld.customerCell,
        customerId: isDel ? undefined : ld.customerId,
        customerNumber: isDel ? undefined : ld.customerNumber
      });
    });
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed.forEach((ld: LegacyDevice) => {
        if (ld && ld.id) {
          const normN = (ld.customerName || '').trim().toLowerCase();
          const isDel = (normN && delNames.has(normN)) || (ld.customerId && delIds.has(ld.customerId));
          map.set(ld.id, {
            ...(map.get(ld.id) || {}),
            ...ld,
            customerName: isDel ? undefined : ld.customerName,
            customerCell: isDel ? undefined : ld.customerCell,
            customerId: isDel ? undefined : ld.customerId,
            customerNumber: isDel ? undefined : ld.customerNumber
          });
        }
      });
    }
    const now = Date.now();
    const normalized = Array.from(map.values()).map((ld: LegacyDevice) => {
      // Enforce 30-day lease contract: active lease is SOLD, not EXPIRED
      if (ld.expiresAt && new Date(ld.expiresAt).getTime() > now && ld.status === 'EXPIRED') {
        return { ...ld, status: 'SOLD' as const };
      }
      return ld;
    });

    return deduplicateLegacyDevices(normalized);
  });

  const [reversalRequests, setReversalRequests] = useState<TransactionReversalRequest[]>(() => {
    const local = localStorage.getItem('wivote_reversal_requests');
    const parsed = safeJsonParse(local, []);
    return Array.isArray(parsed) ? parsed : [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('wivote_reversal_requests', JSON.stringify(reversalRequests));
    } catch (e) {}
  }, [reversalRequests]);

  const [notifications, setNotifications] = useState<SystemNotification[]>(() => {
    const local = localStorage.getItem('wivote_notifications');
    const parsed = safeJsonParse(local, initialNotifications);
    const map = new Map<string, SystemNotification>();
    initialNotifications.forEach(n => map.set(n.id, n));
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed.forEach((n: SystemNotification) => {
        if (n && n.id) {
          map.set(n.id, { ...(map.get(n.id) || {}), ...n });
        }
      });
    }
    return Array.from(map.values());
  });

  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    const localGlobalRead = safeJsonParse<string[]>(localStorage.getItem('wivote_read_notifications'), []);
    return localGlobalRead;
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'wivote_notifications' && e.newValue) {
        const parsed = safeJsonParse<SystemNotification[]>(e.newValue, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNotifications(parsed);
        }
      } else if (e.key === 'wivote_read_notifications' && e.newValue) {
        const parsed = safeJsonParse<string[]>(e.newValue, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReadNotificationIds(parsed);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const [feedback, setFeedback] = useState<FeedbackMessage[]>(() => {
    const local = localStorage.getItem('wivote_feedback');
    return safeJsonParse(local, []);
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    const local = localStorage.getItem('wivote_audit_logs');
    return safeJsonParse(local, initialAuditLogs);
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const local = localStorage.getItem('wivote_customers');
    const parsed = safeJsonParse<Customer[]>(local, []);
    const deletedIds = getDeletedCustomerIds();
    const deletedNames = getDeletedCustomerNames();

    // Deduplicate by workspace, normalized name, and MAC address on initial load
    const seenNames = new Set<string>();
    const seenMacs = new Set<string>();
    const deduped: Customer[] = [];

    for (const c of (parsed || [])) {
      if (!c || !c.id || !c.name) continue;
      const normName = c.name.trim().toLowerCase();
      if (!normName || isPlaceholderOrWalkInClient(c.name)) continue;
      if (deletedIds.has(c.id) || deletedNames.has(normName)) continue;

      const normMac = (c.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const resolvedWs = resolveCustomerWorkspaceId(c, c.workspaceId || 'ws_vakzim');
      const wsKey = `${resolvedWs}_${normName}`;

      if (seenNames.has(wsKey) || (normMac.length >= 8 && seenMacs.has(normMac))) {
        continue;
      }
      seenNames.add(wsKey);
      if (normMac.length >= 8) seenMacs.add(normMac);

      deduped.push({
        ...c,
        workspaceId: resolvedWs
      });
    }
    return deduped;
  });

  const hasRemoteCustomersRef = useRef<boolean>(false);

  const vouchersRef = useRef<Voucher[]>(vouchers);
  useEffect(() => {
    vouchersRef.current = vouchers;
  }, [vouchers]);

  const legacyDevicesRef = useRef<LegacyDevice[]>(legacyDevices);
  useEffect(() => {
    legacyDevicesRef.current = legacyDevices;
  }, [legacyDevices]);

  const customersRef = useRef<Customer[]>(customers);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  const requestsRef = useRef<VoucherRequest[]>(requests);
  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  const cashDropsRef = useRef<CashDrop[]>(cashDrops);
  useEffect(() => {
    cashDropsRef.current = cashDrops;
  }, [cashDrops]);

  const usersRef = useRef<UserProfile[]>(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    try {
      safeSetItem('wivote_customers', JSON.stringify(customers));
    } catch (e) {
      console.warn("Storage write error for customers:", e);
    }
  }, [customers]);

  const [leaderboardSummary, setLeaderboardSummary] = useState<Record<string, number>>(() => {
    const local = localStorage.getItem('wivote_last_known_leaderboard');
    return safeJsonParse<Record<string, number>>(local, {});
  });

  useEffect(() => {
    try {
      if (leaderboardSummary && Object.keys(leaderboardSummary).length > 0) {
        safeSetItem('wivote_last_known_leaderboard', JSON.stringify(leaderboardSummary));
      }
    } catch (e) {}
  }, [leaderboardSummary]);

  const [pricingPackages, setPricingPackages] = useState<PackagePricing[]>(() => {
    const local = localStorage.getItem('wivote_pricing_packages');
    if (local) {
      const parsed = safeJsonParse(local, null);
      if (parsed && Array.isArray(parsed)) {
        if (parsed.some((p: any) => p.id === 'Starter' && p.price === 29) || parsed.some((p: any) => (p.id === 'Gold' && p.maxAgents === 15) || (p.id === 'Lithium' && p.maxAgents === 100))) {
          return [
            { id: 'Starter', name: 'Starter', price: 10, desc: '1 Active Router limit', maxAgents: 3 },
            { id: 'Gold', name: 'Gold', price: 15, desc: '5 Active Routers', maxAgents: 7 },
            { id: 'Lithium', name: 'Lithium', price: 20, desc: 'Enterprise Unlimited', maxAgents: 15 }
          ];
        }
        return parsed;
      }
    }
    return [
      { id: 'Starter', name: 'Starter', price: 10, desc: '1 Active Router limit', maxAgents: 3 },
      { id: 'Gold', name: 'Gold', price: 15, desc: '5 Active Routers', maxAgents: 7 },
      { id: 'Lithium', name: 'Lithium', price: 20, desc: 'Enterprise Unlimited', maxAgents: 15 }
    ];
  });

  const [investors, setInvestors] = useState<InvestorStake[]>(() => {
    const local = localStorage.getItem('wivote_investors');
    return safeJsonParse(local, initialInvestors);
  });

  const [shareholdingGovernance, setShareholdingGovernance] = useState<ShareholdingGovernance | null>(() => {
    const local = localStorage.getItem('wivote_governance');
    return safeJsonParse(local, initialShareholdingGovernance);
  });

  const [ledgerTransactions, setLedgerTransactions] = useState<LedgerTransaction[]>(() => {
    const local = localStorage.getItem('wivote_ledger');
    return safeJsonParse(local, initialLedgerTransactions);
  });

  const [shareDisposals, setShareDisposals] = useState<ShareDisposalRequest[]>(() => {
    const local = localStorage.getItem('wivote_disposals');
    return safeJsonParse(local, initialShareDisposalRequests);
  });

  useEffect(() => {
    try {
      safeSetItem('wivote_investors', JSON.stringify(investors));
    } catch (e) {
      console.warn("Storage write error for investors:", e);
    }
  }, [investors]);

  useEffect(() => {
    try {
      if (shareholdingGovernance) {
        safeSetItem('wivote_governance', JSON.stringify(shareholdingGovernance));
      }
    } catch (e) {
      console.warn("Storage write error for governance:", e);
    }
  }, [shareholdingGovernance]);

  useEffect(() => {
    try {
      safeSetItem('wivote_ledger', JSON.stringify(ledgerTransactions));
    } catch (e) {
      console.warn("Storage write error for ledger:", e);
    }
  }, [ledgerTransactions]);

  useEffect(() => {
    try {
      safeSetItem('wivote_disposals', JSON.stringify(shareDisposals));
    } catch (e) {
      console.warn("Storage write error for disposals:", e);
    }
  }, [shareDisposals]);

  const [recycleBin, setRecycleBin] = useState<RecycleBinItem[]>(() => {
    const local = localStorage.getItem('wivote_recycle_bin');
    return safeJsonParse<RecycleBinItem[]>(local, []);
  });

  const [accountBackups, setAccountBackups] = useState<AccountBackupItem[]>(() => {
    const local = localStorage.getItem('wivote_account_backups');
    return safeJsonParse(local, []);
  });

  const [fullDatabaseBackups, setFullDatabaseBackups] = useState<any[]>(() => {
    const local = localStorage.getItem('wivote_full_database_backups');
    return safeJsonParse(local, []);
  });

  const [backupInterval, setBackupIntervalState] = useState<number>(() => {
    const saved = localStorage.getItem('wivote_backup_interval');
    return saved ? parseInt(saved, 10) : 30; // default to 30 mins
  });

  const [lastBackupTime, setLastBackupTime] = useState<number>(() => {
    const saved = localStorage.getItem('wivote_last_backup_time');
    return saved ? parseInt(saved, 10) : Date.now();
  });

  const setBackupInterval = (val: number) => {
    setBackupIntervalState(val);
    localStorage.setItem('wivote_backup_interval', String(val));
    showToast(`✓ Auto-backup interval set to ${val === 0 ? 'Disabled' : `${val} Minutes`}`, 'info');
  };

  const [configuredBackupEmail, setConfiguredBackupEmailState] = useState<string>(() => {
    return localStorage.getItem('wivote_backup_email') || '';
  });

  const [appBackupConfig, setAppBackupConfig] = useState<AppBackupConfig>(() => {
    const local = localStorage.getItem('wivote_app_backup_config');
    return safeJsonParse(local, DEFAULT_BACKUP_CONFIG);
  });

  const [workspaceBackups, setWorkspaceBackups] = useState<WorkspaceBackupItem[]>(() => {
    const activeWsId = localStorage.getItem('wivote_active_workspace_id') || 'ws_client_1788646327740';
    const local = localStorage.getItem(`wivote_ws_backups_${activeWsId}`) || localStorage.getItem('wivote_workspace_backups');
    return safeJsonParse(local, []);
  });

  const [entireAppBackups, setEntireAppBackups] = useState<EntireAppBackupItem[]>(() => {
    const local = localStorage.getItem('wivote_entire_app_backups');
    return safeJsonParse(local, []);
  });

  useEffect(() => {
    try {
      // Never serialize massive full database dumps directly into device localStorage
      // Keep only lightweight metadata headers (max 2 entries) so mobile memory is not overwhelmed
      const lightweight = (fullDatabaseBackups || []).slice(0, 2).map((b: any) => ({
        id: b.id,
        timestamp: b.timestamp,
        version: b.version,
        note: b.note,
        totalItems: b.totalItems || (b.data?.vouchers?.length || 0)
      }));
      safeSetItem('wivote_full_database_backups', JSON.stringify(lightweight));
    } catch (e) {
      console.warn("Storage write error for full_database_backups:", e);
    }
  }, [fullDatabaseBackups]);

  useEffect(() => {
    try {
      // Keep recycle bin lean in localStorage (max 5 items, strip heavy snapshot associatedData)
      const lean = (recycleBin || []).slice(0, 5).map(item => ({
        ...item,
        snapshot: item.snapshot ? {
          ...item.snapshot,
          associatedData: undefined
        } : undefined
      }));
      safeSetItem('wivote_recycle_bin', JSON.stringify(lean));
    } catch (e) {
      console.warn("Storage write error for recycle_bin:", e);
    }
  }, [recycleBin]);

  useEffect(() => {
    try {
      // Keep account backups lean in localStorage (max 2 items, strip heavy associatedData)
      const lean = (accountBackups || []).slice(0, 2).map(item => ({
        ...item,
        snapshot: item.snapshot ? {
          ...item.snapshot,
          associatedData: undefined
        } : undefined
      }));
      safeSetItem('wivote_account_backups', JSON.stringify(lean));
    } catch (e) {
      console.warn("Storage write error for account_backups:", e);
    }
  }, [accountBackups]);

  // --- Session Helpers for iframe and refresh persistence ---
  const setSessionVar = (key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      console.warn("SessionStorage write error:", e);
    }
    safeSetItem(key, value);
  };

  const removeSessionVar = (key: string) => {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn("SessionStorage remove error:", e);
    }
    safeRemoveItem(key);
  };

  const getSessionVar = (key: string): string | null => {
    try {
      const val = sessionStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {}
    return safeGetItem(key);
  };

  // --- Mock Auth (Preview Switching Role functionality) ---
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return getSessionVar('wivote_is_logged_in') === 'true';
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    const saved = getSessionVar('wivote_current_user_id');
    return saved && saved !== 'admin_001' ? saved : null;
  });

  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(() => {
    return getSessionVar('wivote_current_user_role') as Role | null;
  });

  const [currentUserWorkspaceId, setCurrentUserWorkspaceId] = useState<string | null>(() => {
    return getSessionVar('wivote_current_user_workspace_id');
  });

  const [isLiveRefresh, setIsLiveRefresh] = useState<boolean>(() => {
    const saved = localStorage.getItem('wivote_live_refresh_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  // Global Loading state: prevents application from rendering any dashboard components until workspace metadata is fetched from Firestore cloud
  const [globalLoading, setGlobalLoading] = useState<boolean>(() => {
    // If user has a persisted session, initialize globalLoading to true to hold dashboard rendering
    return getSessionVar('wivote_is_logged_in') === 'true';
  });
  const [isWorkspaceMetadataLoaded, setIsWorkspaceMetadataLoaded] = useState<boolean>(() => {
    // If not logged in, workspace metadata is not required yet
    return getSessionVar('wivote_is_logged_in') !== 'true';
  });
  const [isMetricsSyncing, setIsMetricsSyncing] = useState<boolean>(() => {
    return getSessionVar('wivote_is_logged_in') === 'true';
  });

  // Latest DB Push Metrics Mirror (Vault of the latest successful database push)
  // Stands in place of current metrics during initial boot, page reloads, and network fetches
  const [latestDbPushMetricsMirror, setLatestDbPushMetricsMirror] = useState<LatestDbPushMetricsMirror | null>(() => {
    try {
      const saved = localStorage.getItem('wivote_latest_db_push_metrics_mirror');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAuthoritativeDataReady, setIsAuthoritativeDataReady] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  // Explicit initialized flag ensuring Firestore/Auth verification completes before rendering dashboards
  const [initialized, setInitialized] = useState<boolean>(false);
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<any>(() => auth?.currentUser || null);

  const lastAuthUidRef = React.useRef<string | null>(null);

  const flushSessionState = useCallback(() => {
    console.log("[WiVoTe Security] Flushing all session states and cached user profiles.");
    // 1. Clear session variables
    removeSessionVar('wivote_is_logged_in');
    removeSessionVar('wivote_current_user_id');
    removeSessionVar('wivote_current_user_role');
    removeSessionVar('wivote_current_user_email');
    removeSessionVar('wivote_current_user_workspace_id');
    removeSessionVar('wivote_workspace_unlocked');
    removeSessionVar('wivote_app_owner_unlocked');

    // Also clear localStorage keys that could bleed state
    localStorage.removeItem('wivote_is_logged_in');
    localStorage.removeItem('wivote_current_user_id');
    localStorage.removeItem('wivote_current_user_role');
    localStorage.removeItem('wivote_current_user_email');
    localStorage.removeItem('wivote_current_user_workspace_id');
    localStorage.removeItem('wivote_workspace_unlocked');
    localStorage.removeItem('wivote_app_owner_unlocked');

    // 2. Reset state variables in React context
    setIsLoggedIn(false);
    setCurrentUserId(null);
    setCurrentUserRole(null);
    setCurrentUserWorkspaceId(null);
    setIsWorkspaceUnlocked(false);
    setIsAppOwnerUnlocked(false);

    // Clear cached/fetched metadata and arrays while safely restoring baseline users & workspaces so other users can log in
    setUsers(getCachedUsers());
    setWorkspaces(getCachedWorkspaces());
    setVouchers([]);
    setRequests([]);
    setCashDrops([]);
    setLegacyDevices([]);
    setNotifications([]);
    setFeedback([]);
    setCustomers([]);
  }, [getCachedUsers, getCachedWorkspaces]);

  const currentUser = useMemo(() => {
    if (!isLoggedIn) return null;

    const savedEmail = (getSessionVar('wivote_current_user_email') || '').toLowerCase().trim();

    // 1. Try to find the actual user object in users state by UID first, and fallback to email only if UID does not match or is empty
    let actualUser = currentUserId ? users.find(u => u.uid === currentUserId) : null;
    if (!actualUser && savedEmail) {
      actualUser = users.find(u => (u.email || '').toLowerCase().trim() === savedEmail);
    }
    if (actualUser) {
      const cachedUsersList = safeJsonParse<UserProfile[]>(localStorage.getItem('wivote_users'), []);
      const cachedMatch = cachedUsersList.find(u => u.uid === actualUser!.uid || (u.email && actualUser!.email && u.email.toLowerCase().trim() === actualUser!.email.toLowerCase().trim()));
      const seedMatch = initialUsers.find(u => u.uid === actualUser!.uid || (u.email && actualUser!.email && u.email.toLowerCase().trim() === actualUser!.email.toLowerCase().trim()));

      const isActualMock = isSeedOrMockProfilePic(actualUser.profilePic);
      const isCachedMock = isSeedOrMockProfilePic(cachedMatch?.profilePic);
      const isSeedMock = isSeedOrMockProfilePic(seedMatch?.profilePic);

      const resolvedPic = !isActualMock && actualUser.profilePic
        ? actualUser.profilePic
        : (!isCachedMock && cachedMatch?.profilePic
          ? cachedMatch.profilePic
          : (actualUser.profilePic || cachedMatch?.profilePic || (!isSeedMock ? seedMatch?.profilePic : '') || ''));

      // Authoritative commission rate resolution: preserve custom agent rate, then cached, then workspace override/default
      const userWsId = actualUser.workspaceId || currentUserWorkspaceId;
      const targetUserWs = workspaces.find(w => w.id === userWsId) || initialWorkspaces.find(w => w.id === userWsId);
      const resolvedComm = (actualUser.commissionRate !== undefined && actualUser.commissionRate !== null && actualUser.commissionRate > 0)
        ? actualUser.commissionRate
        : (cachedMatch?.commissionRate !== undefined && cachedMatch.commissionRate !== null && cachedMatch.commissionRate > 0
          ? cachedMatch.commissionRate
          : (targetUserWs?.cashCloseSettings?.agentOverrides?.[actualUser.uid]?.commissionRate ??
             targetUserWs?.cashCloseSettings?.defaultCommissionRate ??
             (actualUser.commissionRate ?? cachedMatch?.commissionRate ?? (seedMatch?.commissionRate !== undefined ? seedMatch.commissionRate : 10))));

      return {
        ...actualUser,
        profilePic: resolvedPic,
        photoURL: resolvedPic,
        commissionRate: resolvedComm
      };
    }

    // 2. Fallback to cached localStorage users first before seed users
    try {
      const cached = safeJsonParse<UserProfile[]>(localStorage.getItem('wivote_users'), []);
      const cachedUser = currentUserId ? cached.find(u => u.uid === currentUserId) : null;
      if (cachedUser) {
        return {
          ...cachedUser,
          profilePic: !isSeedOrMockProfilePic(cachedUser.profilePic) ? cachedUser.profilePic : ''
        };
      }
      if (savedEmail) {
        const cachedEmailUser = cached.find(u => (u.email || '').toLowerCase().trim() === savedEmail);
        if (cachedEmailUser) {
          return {
            ...cachedEmailUser,
            profilePic: !isSeedOrMockProfilePic(cachedEmailUser.profilePic) ? cachedEmailUser.profilePic : ''
          };
        }
      }
    } catch {}

    // 3. Fallback to seed users if matching UID or email
    let seedUser = currentUserId ? initialUsers.find(u => u.uid === currentUserId) : null;
    if (!seedUser && savedEmail) {
      seedUser = initialUsers.find(u => (u.email || '').toLowerCase().trim() === savedEmail);
    }
    if (seedUser) {
      return {
        ...seedUser,
        profilePic: !isSeedOrMockProfilePic(seedUser.profilePic) ? seedUser.profilePic : ''
      };
    }

    // 4. Return a stable placeholder profile using stored role and workspaceId to prevent layout/dashboard-switching flickering
    const effectiveUserId = currentUserId || getSessionVar('wivote_current_user_id') || 'agent_session';
    const effectiveRole = currentUserRole || (getSessionVar('wivote_current_user_role') as Role) || 'Agent';
    const effectiveWsId = currentUserWorkspaceId || getSessionVar('wivote_current_user_workspace_id') || (effectiveRole === 'AppOwner' ? 'system' : 'ws_vakzim');

    return {
      uid: effectiveUserId,
      email: effectiveRole === 'AppOwner' ? 'karimazondomike049@gmail.com' : (savedEmail || 'agent@wivote.com'),
      cellNumber: '',
      role: effectiveRole,
      workspaceId: effectiveWsId,
      name: effectiveRole === 'AppOwner' 
        ? 'Mike Karim (App Owner)' 
        : effectiveRole === 'Agent'
          ? 'Field Agent'
          : 'Workspace Master',
      profilePic: '',
      password: ''
    } as UserProfile;
  }, [isLoggedIn, currentUserId, currentUserRole, currentUserWorkspaceId, users, workspaces]);

  // Sync readNotificationIds when currentUser changes
  useEffect(() => {
    if (!currentUser?.uid) return;
    const userKey = `wivote_read_notifications_${currentUser.uid}`;
    const localUserRead = safeJsonParse<string[]>(localStorage.getItem(userKey), []);
    const localGlobalRead = safeJsonParse<string[]>(localStorage.getItem('wivote_read_notifications'), []);
    const profileRead = Array.isArray((currentUser as any)?.readNotifications) ? (currentUser as any).readNotifications : [];
    const merged = Array.from(new Set([...localUserRead, ...localGlobalRead, ...profileRead]));
    if (merged.length > 0) {
      setReadNotificationIds(prev => Array.from(new Set([...prev, ...merged])));
    }
  }, [currentUser?.uid]);

  const markNotificationAsRead = useCallback((id: string) => {
    setReadNotificationIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      const uid = currentUser?.uid;
      try {
        if (uid) {
          localStorage.setItem(`wivote_read_notifications_${uid}`, JSON.stringify(updated));
        }
        localStorage.setItem('wivote_read_notifications', JSON.stringify(updated));
        window.dispatchEvent(new StorageEvent('storage', { key: 'wivote_read_notifications', newValue: JSON.stringify(updated) }));
      } catch (e) {
        console.error(e);
      }

      if (uid && !isFirebasePlaceholder) {
        const wsId = currentUser.workspaceId || currentUserWorkspaceId;
        if (wsId && wsId !== 'system') {
          setDoc(doc(db, 'workspaces', wsId, 'users', uid), cleanForFirestore({ readNotifications: updated }), { merge: true }).catch(() => {});
        }
        setDoc(doc(db, 'users', uid), cleanForFirestore({ readNotifications: updated }), { merge: true }).catch(() => {});
      }

      return updated;
    });
  }, [currentUser?.uid, currentUser?.workspaceId, currentUserWorkspaceId]);

  const markAllNotificationsAsRead = useCallback(() => {
    setReadNotificationIds(prev => {
      const allIds = Array.from(new Set([...prev, ...notifications.map(n => n.id)]));
      const uid = currentUser?.uid;
      try {
        if (uid) {
          localStorage.setItem(`wivote_read_notifications_${uid}`, JSON.stringify(allIds));
        }
        localStorage.setItem('wivote_read_notifications', JSON.stringify(allIds));
        window.dispatchEvent(new StorageEvent('storage', { key: 'wivote_read_notifications', newValue: JSON.stringify(allIds) }));
      } catch (e) {
        console.error(e);
      }

      if (uid && !isFirebasePlaceholder) {
        const wsId = currentUser.workspaceId || currentUserWorkspaceId;
        if (wsId && wsId !== 'system') {
          setDoc(doc(db, 'workspaces', wsId, 'users', uid), cleanForFirestore({ readNotifications: allIds }), { merge: true }).catch(() => {});
        }
        setDoc(doc(db, 'users', uid), cleanForFirestore({ readNotifications: allIds }), { merge: true }).catch(() => {});
      }

      return allIds;
    });
  }, [notifications, currentUser?.uid, currentUser?.workspaceId, currentUserWorkspaceId]);

  const currentRole = currentUser?.role || currentUserRole || (requestedRole === 'Agent' ? 'Agent' : requestedRole === 'AppOwner' ? 'AppOwner' : 'WorkspaceMaster');

  const visibleWorkspaces = useMemo(() => {
    if (!currentUser) return workspaces;
    const isDeveloperEmail = currentUser.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser.role === 'AppOwner' || isDeveloperEmail;
    if (isAppOwner) {
      return workspaces;
    }
    // Pull workspaces where ownerId, ownerEmail, or workspaceId matches authenticated credentials
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    return workspaces.filter(w => 
      w.ownerId === currentUser.uid || 
      w.id === currentUser.workspaceId || 
      (currentUserWorkspaceId && w.id === currentUserWorkspaceId) ||
      (userEmail && ((w as any).ownerEmail || '').toLowerCase().trim() === userEmail) ||
      (Array.isArray((w as any).agentIds) && (w as any).agentIds.includes(currentUser.uid))
    );
  }, [workspaces, currentUser, currentUserWorkspaceId]);

  // Find active workspace based on current user's workspaceId
  const activeWorkspace = useMemo(() => {
    if (!currentUser) return null;
    const isDeveloperEmail = currentUser.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser.role === 'AppOwner' || isDeveloperEmail;
    if (isAppOwner) {
      if (selectedWorkspaceId) {
        const found = workspaces.find(w => w.id === selectedWorkspaceId) || initialWorkspaces.find(w => w.id === selectedWorkspaceId);
        if (found) return found;
      }
      return workspaces[0] || initialWorkspaces[0] || null;
    }
    const targetWsId = currentUser.workspaceId || currentUserWorkspaceId;
    if (targetWsId && targetWsId !== '' && targetWsId !== 'system') {
      const found = workspaces.find(w => w.id === targetWsId) || initialWorkspaces.find(w => w.id === targetWsId);
      if (found) return found;
    }
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    const byOwner = workspaces.find(w => w.ownerId === currentUser.uid || (userEmail && ((w as any).ownerEmail || '').toLowerCase().trim() === userEmail))
      || initialWorkspaces.find(w => w.ownerId === currentUser.uid || (userEmail && ((w as any).ownerEmail || '').toLowerCase().trim() === userEmail));
    if (byOwner) return byOwner;

    return visibleWorkspaces[0] || workspaces[0] || initialWorkspaces[0] || null;
  }, [workspaces, visibleWorkspaces, currentUser, currentUserWorkspaceId, selectedWorkspaceId]);

  // Dynamic Workspace Loyalty Program Configuration
  const loyaltySettings: LoyaltySettings = useMemo(() => {
    return activeWorkspace?.loyaltySettings || DEFAULT_LOYALTY_SETTINGS;
  }, [activeWorkspace?.loyaltySettings]);

  const updateLoyaltySettings = async (settings: LoyaltySettings) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') {
      showToast('No active workspace found to update loyalty program', 'error');
      return;
    }

    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? { ...w, loyaltySettings: settings } : w));

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), {
          loyaltySettings: settings
        }, { merge: true });
        showToast('Genius Loyalty Program settings saved successfully!', 'success');
      } catch (err: any) {
        console.error('Error saving loyalty settings to Firestore:', err);
        showToast('Failed to sync loyalty settings to cloud', 'error');
      }
    } else {
      showToast('Genius Loyalty Program settings saved!', 'success');
    }
    autoPushActionToDb('Update Loyalty Settings', targetWsId);
  };

  // Dynamic Workspace Giveaway & Free Voucher Configuration
  const giveawaySettings: GiveawaySettings = useMemo(() => {
    return activeWorkspace?.giveawaySettings || DEFAULT_GIVEAWAY_SETTINGS;
  }, [activeWorkspace?.giveawaySettings]);

  const updateGiveawaySettings = async (settings: GiveawaySettings) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') {
      showToast('No active workspace found to update giveaway program', 'error');
      return;
    }

    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? { ...w, giveawaySettings: settings } : w));

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), {
          giveawaySettings: settings
        }, { merge: true });
        showToast('Free voucher giveaway settings saved successfully!', 'success');
      } catch (err: any) {
        console.error('Error saving giveaway settings to Firestore:', err);
        showToast('Failed to sync giveaway settings to cloud', 'error');
      }
    } else {
      showToast('Free voucher giveaway settings saved!', 'success');
    }
    autoPushActionToDb('Update Giveaway Settings', targetWsId);
  };

  const captureClientMetricsSnapshot = useCallback((): LatestDbPushMetricsMirror | null => {
    try {
      const targetWsId = currentUser?.workspaceId || currentUserWorkspaceId || activeWorkspace?.id || 'ws_vakzim';
      const isVakZim = targetWsId === 'ws_vakzim' || targetWsId === 'ws_client_1788646327740';
      const isMatch = (item: any) => {
        if (!targetWsId || targetWsId === 'system' || targetWsId === 'ALL') return true;
        if (!item.workspaceId) return true;
        if (isVakZim && (item.workspaceId === 'ws_vakzim' || item.workspaceId === 'ws_client_1788646327740')) return true;
        return item.workspaceId === targetWsId;
      };

      const activeDeletedPlans = getDeletedPlans();
      const wsVouchers = (vouchers || []).filter((v: any) => v && (!v.plan || !activeDeletedPlans.has(v.plan)) && isMatch(v));
      const wsUsers = (users || []).filter(isMatch);
      const wsAgents = wsUsers.filter((u: any) => u.role === 'Agent' || (!u.role && u.assignedAgentId));
      const wsCustomers = (customers || []).filter(isMatch);
      const wsLegacy = (legacyDevices || []).filter(isMatch);

      const unused = wsVouchers.filter((v: any) => (v.status === 'Unused' || (!v.status && !v.soldAt && !v.assignedAgentId)) && v.status !== 'Sold' && !v.soldAt && !v.isFree);
      const assigned = wsVouchers.filter((v: any) => (v.status === 'Assigned' || (v.assignedAgentId && v.status !== 'Sold' && !v.soldAt)) && !v.isFree);
      const sold = wsVouchers.filter((v: any) => (v.status === 'Sold' || !!v.soldAt || !!v.giftedAt) && !v.isFree);

      const unusedValue = unused.reduce((sum: number, v: any) => sum + (Number(v.price) || 0), 0);
      const assignedValue = assigned.reduce((sum: number, v: any) => sum + (Number(v.price) || 0), 0);
      const soldValue = sold.reduce((sum: number, v: any) => sum + (Number(v.soldPrice !== undefined ? v.soldPrice : v.price) || 0), 0);

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentCycleMonth = `${currentYear}-${currentMonth}`;

      const prevMonthDate = new Date(currentYear, now.getMonth() - 1, 1);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      const prevCycleMonth = `${prevYear}-${prevMonth}`;

      const todayDateStr = now.toDateString();

      const agentsMirror: Record<string, any> = {};
      let totalCashCollected = 0;
      let totalCommissionEarned = 0;
      let totalClosedCash = 0;
      let totalClosedCommission = 0;
      let totalRemainingCash = 0;
      let totalRemainingCommission = 0;

      const uniqueAgentsList: any[] = [];

      wsAgents.forEach((agent: any) => {
        const agentUid = agent.uid;
        if (!agentUid) return;
        const cleanName = (agent.name || '').toLowerCase().trim();
        const cleanEmail = (agent.email || '').toLowerCase().trim();

        const matchThisAgent = (item: any) => {
          const itemAgentId = (item.assignedAgentId || item.soldByAgentId || (item as any).agentId || '').toLowerCase().trim();
          const itemAgentName = (item.assignedAgentName || item.soldByAgentName || (item as any).agentName || '').toLowerCase().trim();
          const itemAgentEmail = ((item as any).assignedAgentEmail || (item as any).agentEmail || '').toLowerCase().trim();
          if (itemAgentId && (itemAgentId === agentUid.toLowerCase().trim() || itemAgentId === cleanName)) return true;
          if (cleanEmail && itemAgentEmail && itemAgentEmail === cleanEmail) return true;
          if (cleanName && itemAgentName && (itemAgentName === cleanName || itemAgentName.includes(cleanName) || cleanName.includes(itemAgentName))) return true;
          return false;
        };

        const agentSoldVouchers = wsVouchers.filter((v: any) => (v.status === 'Sold' || !!v.soldAt || !!v.giftedAt) && !v.isFree && matchThisAgent(v));
        const agentAssignedVouchers = wsVouchers.filter((v: any) => v.status === 'Assigned' && !v.isFree && matchThisAgent(v));

        let currentCycleSales = 0;
        let overallSales = 0;
        let prevMonthOverallSales = 0;
        let todaySales = 0;

        agentSoldVouchers.forEach((v: any) => {
          const val = Number(v.soldPrice !== undefined ? v.soldPrice : v.price) || 0;
          overallSales += val;
          const soldDate = v.soldAt ? new Date(v.soldAt) : (v.updatedAt ? new Date(v.updatedAt) : null);
          if (soldDate && !isNaN(soldDate.getTime())) {
            if (soldDate.toDateString() === todayDateStr) todaySales += val;
            const y = soldDate.getFullYear();
            const m = String(soldDate.getMonth() + 1).padStart(2, '0');
            const cycle = `${y}-${m}`;
            if (cycle === currentCycleMonth) currentCycleSales += val;
            if (cycle === prevCycleMonth) prevMonthOverallSales += val;
          } else {
            currentCycleSales += val;
          }
        });

        const currentCycleDrops = (cashDrops || []).filter((cd: any) => {
          const isA = cd.status === 'Approved' || cd.status === 'Reconciled';
          const match = (cd.agentId && (cd.agentId === agentUid || cd.agentId === cleanName)) ||
                        (cleanEmail && cd.agentEmail && cd.agentEmail.toLowerCase() === cleanEmail) ||
                        (cleanName && cd.agentName && cd.agentName.toLowerCase().includes(cleanName));
          const d = cd.cycleMonth || (cd.timestamp ? cd.timestamp.slice(0, 7) : '');
          return isA && match && (d === currentCycleMonth || (!d && cd.timestamp && cd.timestamp.startsWith(currentCycleMonth)));
        });

        const closedCash = currentCycleDrops.reduce((sum: number, cd: any) => sum + (cd.amount || 0), 0);
        const unclosedMonthlyCash = Math.max(0, Number((currentCycleSales - closedCash).toFixed(2)));

        const commissionPercent = agent.commissionRate !== undefined ? agent.commissionRate : 10;
        const commissionRate = commissionPercent / 100;
        const totalCommission = Number((currentCycleSales * commissionRate).toFixed(2));
        const myComm = Number((unclosedMonthlyCash * commissionRate).toFixed(2));
        const closedComm = Number((closedCash * commissionRate).toFixed(2));

        const agentMetricObj = {
          agentId: agentUid,
          agentName: agent.name,
          dailySalesTotal: Number(todaySales.toFixed(2)),
          currentCycleSales: Number(currentCycleSales.toFixed(2)),
          totalMonthlySales: Number(currentCycleSales.toFixed(2)),
          closedCash: Number(closedCash.toFixed(2)),
          unclosedMonthlyCash: Number(unclosedMonthlyCash.toFixed(2)),
          overallSales: Number(overallSales.toFixed(2)),
          prevMonthOverallSales: Number(prevMonthOverallSales.toFixed(2)),
          myCommission: myComm,
          totalCommissionEarned: totalCommission,
          closedCommission: closedComm,
          soldVouchersCount: agentSoldVouchers.length,
          assignedVouchersCount: agentAssignedVouchers.length
        };

        agentsMirror[agentUid] = agentMetricObj;
        agentsMirror[agentUid.toLowerCase().trim()] = agentMetricObj;
        if (cleanEmail) agentsMirror[cleanEmail] = agentMetricObj;
        if (cleanName) agentsMirror[cleanName] = agentMetricObj;

        uniqueAgentsList.push(agentMetricObj);
        totalCashCollected += currentCycleSales;
        totalCommissionEarned += totalCommission;
        totalClosedCash += closedCash;
        totalClosedCommission += closedComm;
        totalRemainingCash += unclosedMonthlyCash;
        totalRemainingCommission += myComm;
      });

      const mirrorObj: LatestDbPushMetricsMirror = {
        timestamp: Date.now(),
        pushedAtIso: new Date().toISOString(),
        workspaceId: targetWsId,
        pushId: `client_push_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        admin: {
          inventorySummary: {
            unused: { count: unused.length, value: Number(unusedValue.toFixed(2)) },
            assigned: { count: assigned.length, value: Number(assignedValue.toFixed(2)) },
            sold: { count: sold.length, value: Number(soldValue.toFixed(2)) },
            total: { count: wsVouchers.length, value: Number((unusedValue + assignedValue + soldValue).toFixed(2)) }
          },
          totalProfits: Number(soldValue.toFixed(2)),
          totalAgents: wsAgents.length,
          customerCount: wsCustomers.length,
          legacyDevicesCount: wsLegacy.filter((ld: any) => ld.isApproved !== false && ld.status !== 'CANCELLED').length,
          salesCycleAggregate: {
            totalCashCollected: Number(totalCashCollected.toFixed(2)),
            totalCommissionEarned: Number(totalCommissionEarned.toFixed(2)),
            totalClosedCash: Number(totalClosedCash.toFixed(2)),
            totalClosedCommission: Number(totalClosedCommission.toFixed(2)),
            totalRemainingCash: Number(totalRemainingCash.toFixed(2)),
            totalRemainingCommission: Number(totalRemainingCommission.toFixed(2)),
            agentMetrics: uniqueAgentsList
          }
        },
        agents: agentsMirror
      };

      setLatestDbPushMetricsMirror(mirrorObj);
      try {
        localStorage.setItem('wivote_latest_db_push_metrics_mirror', JSON.stringify(mirrorObj));
      } catch {}
      return mirrorObj;
    } catch (e) {
      console.warn("captureClientMetricsSnapshot error:", e);
      return null;
    }
  }, [vouchers, users, customers, legacyDevices, cashDrops, activeWorkspace?.id, currentUser?.workspaceId, currentUserWorkspaceId]);

  const togglePlanFreeStatus = async (planName: string, isFree: boolean) => {
    const currentList = giveawaySettings.freePlanNames || [];
    const norm = normalizePlanName(planName);
    let updatedList: string[];
    if (isFree) {
      if (!currentList.some(p => normalizePlanName(p) === norm)) {
        updatedList = [...currentList, planName];
      } else {
        updatedList = currentList;
      }
    } else {
      updatedList = currentList.filter(p => normalizePlanName(p) !== norm);
    }
    await updateGiveawaySettings({
      ...giveawaySettings,
      freePlanNames: updatedList
    });
  };

  const markVouchersFreeBulk = async (voucherIds: string[], isFree: boolean) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') return;

    const nowIso = new Date().toISOString();
    const enrichedUpdates = { isFree, updatedAt: nowIso, isDirty: true };

    setVouchers(prev => {
      const updatedList = prev.map(v => {
        if (voucherIds.includes(v.id)) {
          return { ...v, ...enrichedUpdates };
        }
        return v;
      });

      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}

      return updatedList;
    });

    if (!isFirebasePlaceholder) {
      try {
        const batch = writeBatch(db);
        voucherIds.forEach(id => {
          const vRef = doc(db, 'workspaces', targetWsId, 'vouchers', id);
          batch.update(vRef, cleanForFirestore(enrichedUpdates));
        });
        await batch.commit();
      } catch (err) {
        console.error("Error bulk marking vouchers free:", err);
      }
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'BULK_UPDATE_VOUCHERS',
        payload: { voucherIds, updates: enrichedUpdates, workspaceId: targetWsId }
      })
    }).catch(console.warn);

    autoPushActionToDb('Bulk Mark Vouchers Free', targetWsId);
    showToast(`${voucherIds.length} voucher(s) ${isFree ? 'marked as free giveaway' : 'restored to standard inventory'}`, 'success');
  };

  const executeFreeGiveaway = async (
    voucherId: string,
    customerName: string = 'Walk-in Client',
    customerCell: string = 'N/A'
  ): Promise<{ success: boolean; error?: string; voucher?: Voucher }> => {
    const targetVoucher = vouchers.find(v => v.id === voucherId);
    if (!targetVoucher) {
      return { success: false, error: 'Voucher not found' };
    }

    const verdict = canAgentGiveaway(currentUser?.uid || '', vouchers, giveawaySettings);
    if (!verdict.allowed) {
      showToast(verdict.reason || 'Daily giveaway quota reached', 'error');
      return { success: false, error: verdict.reason };
    }

    const saleRes = await completeSale(
      voucherId,
      customerName,
      customerCell,
      targetVoucher.price,
      undefined,
      '🎁 Customer Gift Voucher (Free Giveaway)'
    );

    if (saleRes.success) {
      showToast(`🎁 Free voucher ${targetVoucher.code} gifted to ${customerName || 'customer'}! (${verdict.usedToday + 1}/${verdict.dailyLimit} today)`, 'success');
      return { success: true };
    } else {
      return { success: false, error: 'Failed to record giveaway' };
    }
  };

  // Dynamic Workspace Cash Close & Sales Cycle Parameters
  const cashCloseSettings: WorkspaceCashCloseSettings = useMemo(() => {
    return activeWorkspace?.cashCloseSettings || DEFAULT_CASH_CLOSE_SETTINGS;
  }, [activeWorkspace?.cashCloseSettings]);

  const updateCashCloseSettings = async (settings: Partial<WorkspaceCashCloseSettings>) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') {
      showToast('No active workspace found to update cash close parameters', 'error');
      return;
    }

    const current = activeWorkspace?.cashCloseSettings || DEFAULT_CASH_CLOSE_SETTINGS;
    const merged: WorkspaceCashCloseSettings = {
      ...current,
      ...settings,
      agentOverrides: {
        ...(current.agentOverrides || {}),
        ...(settings.agentOverrides || {})
      }
    };

    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? { ...w, cashCloseSettings: merged } : w));

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), {
          cashCloseSettings: merged
        }, { merge: true });
        showToast('✓ Monthly sales cycle and cash close settings saved to cloud!', 'success');
      } catch (err: any) {
        console.error('Error saving cash close settings to Firestore:', err);
        showToast('Failed to sync cash close settings to cloud', 'error');
      }
    } else {
      showToast('✓ Monthly sales cycle and cash close settings saved!', 'success');
    }
    autoPushActionToDb('Update Cash Close Settings', targetWsId);
  };

  const updateAgentCashCloseSchedule = async (agentId: string, scheduleUpdates: Partial<AgentCashCloseSchedule>) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') return;

    const current = activeWorkspace?.cashCloseSettings || DEFAULT_CASH_CLOSE_SETTINGS;
    const existing = current.agentOverrides?.[agentId] || { agentId };
    const updated: AgentCashCloseSchedule = {
      ...existing,
      ...scheduleUpdates,
      agentId
    };

    const merged: WorkspaceCashCloseSettings = {
      ...current,
      agentOverrides: {
        ...(current.agentOverrides || {}),
        [agentId]: updated
      }
    };

    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? { ...w, cashCloseSettings: merged } : w));

    if (scheduleUpdates.commissionRate !== undefined) {
      const newRate = scheduleUpdates.commissionRate;
      setUsers(prev => prev.map(u => u.uid === agentId ? { ...u, commissionRate: newRate } : u));

      if (!isFirebasePlaceholder) {
        setDoc(doc(db, 'workspaces', targetWsId, 'users', agentId), { commissionRate: newRate }, { merge: true }).catch(console.error);
        setDoc(doc(db, 'users', agentId), { commissionRate: newRate }, { merge: true }).catch(console.error);
      }

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_BATCH',
          payload: { users: [{ uid: agentId, commissionRate: newRate, workspaceId: targetWsId }] }
        })
      }).catch(console.warn);
    }

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), {
          cashCloseSettings: merged
        }, { merge: true });
      } catch (err) {
        console.error('Error saving agent schedule override:', err);
      }
    }
    autoPushActionToDb('Update Agent Cash Close Schedule', targetWsId);
  };

  const requestAgentCashClose = async (agentId: string, amount?: number, notes?: string) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Request Cash Close');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const targetAgent = users.find(u => u.uid === agentId);
    const agentName = targetAgent?.name || 'Agent';

    // 1. Update schedule override so system recognizes admin requested cash close
    await updateAgentCashCloseSchedule(agentId, {
      isCashCloseRequested: true,
      requestedAt: new Date().toISOString(),
      requestedAmount: amount,
      requestedNotes: notes
    });

    // 2. Submit pending cash drop request with requestedBy = 'WorkspaceMaster'
    submitCashDrop(amount || 0, 'WorkspaceMaster', notes || 'Admin requested monthly sales cycle cash close', agentId, agentName);

    // 3. Add system notification for agent (personal notification to concerned agent only)
    addNotification(`🚨 CASH CLOSE REQUESTED: Administrator has requested an immediate cash close${amount ? ` of $${amount.toFixed(2)}` : ''}. Please review and confirm your cash close.`, {
      targetAudience: 'SPECIFIC',
      targetAgentIds: [agentId],
      targetAgentNames: [agentName],
      isBroadcast: false
    });

    showToast(`✓ Cash close request sent to Agent ${agentName}.`, 'success');
  };

  const updateWorkspaceTelephoneCode = async (code: string) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') {
      showToast('No active workspace found to update telephone code', 'error');
      return;
    }

    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? { ...w, telephoneCode: code } : w));

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), {
          telephoneCode: code
        }, { merge: true });
        showToast('Workspace Telephone Dial Code configured successfully!', 'success');
      } catch (err: any) {
        console.error('Error saving telephone code to Firestore:', err);
        showToast('Failed to sync telephone code to cloud', 'error');
      }
    } else {
      showToast('Workspace Telephone Dial Code configured!', 'success');
    }
    autoPushActionToDb('Update Telephone Code', targetWsId);
  };

  // Dynamic Workspace Captive Portal Gateway URLs
  const captivePortalUrls: CaptivePortalUrlItem[] = useMemo(() => {
    if (activeWorkspace?.captivePortalUrls && Array.isArray(activeWorkspace.captivePortalUrls) && activeWorkspace.captivePortalUrls.length > 0) {
      return activeWorkspace.captivePortalUrls;
    }
    if (activeWorkspace?.captivePortalUrl) {
      return [{
        id: 'cpu_primary',
        name: 'Primary Captive Portal',
        url: activeWorkspace.captivePortalUrl,
        isDefault: true,
        createdAt: new Date().toISOString()
      }];
    }
    return [
      {
        id: 'cpu_default_1',
        name: 'Main MikroTik Gateway',
        url: 'http://192.168.88.1/login',
        networkName: 'WiVoTe-Hotspot',
        location: 'Main Node',
        isDefault: true,
        createdAt: '2026-10-01T00:00:00.000Z'
      }
    ];
  }, [activeWorkspace?.captivePortalUrls, activeWorkspace?.captivePortalUrl]);

  const updateCaptivePortalUrls = async (urls: CaptivePortalUrlItem[]): Promise<{ success: boolean; error?: string }> => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId;
    if (!targetWsId || targetWsId === 'system') {
      showToast('No active workspace found to update captive portal URLs', 'error');
      return { success: false, error: 'No active workspace found' };
    }

    let formattedUrls = [...urls];
    if (formattedUrls.length > 0 && !formattedUrls.some(u => u.isDefault)) {
      formattedUrls[0] = { ...formattedUrls[0], isDefault: true };
    }

    const defaultItem = formattedUrls.find(u => u.isDefault) || formattedUrls[0];
    const primaryUrl = defaultItem ? defaultItem.url : '';

    const cleanUrls = formattedUrls.map(u => cleanForFirestore(u)) as CaptivePortalUrlItem[];

    // 1. Update React state immediately
    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? {
      ...w,
      captivePortalUrls: cleanUrls,
      captivePortalUrl: primaryUrl
    } : w));

    // 2. Persist to localStorage cache
    try {
      const cachedWsList = safeJsonParse<Workspace[]>(localStorage.getItem('wivote_workspaces'), []);
      const updatedWsList = cachedWsList.map(w => w.id === targetWsId ? {
        ...w,
        captivePortalUrls: cleanUrls,
        captivePortalUrl: primaryUrl
      } : w);
      safeSetItem('wivote_workspaces', JSON.stringify(updatedWsList));
    } catch (err) {
      console.warn("Error caching updated captive portal URLs:", err);
    }

    // 3. Persist to Firestore cloud database
    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), cleanForFirestore({
          captivePortalUrls: cleanUrls,
          captivePortalUrl: primaryUrl
        }), { merge: true });
      } catch (err: any) {
        console.error('Error saving captive portal URLs to Firestore:', err);
        showToast('⚠️ Could not sync captive portal URLs to cloud', 'error');
        return { success: false, error: err.message };
      }
    }

    autoPushActionToDb('Update Captive Portal URLs', targetWsId);
    showToast('✓ Captive Portal URLs saved and persisted to database!', 'success');
    return { success: true };
  };

  const addCaptivePortalUrl = async (item: Omit<CaptivePortalUrlItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string }> => {
    const newId = `cpu_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    
    let formattedUrl = item.url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `http://${formattedUrl}`;
    }

    const newItem: CaptivePortalUrlItem = {
      ...item,
      id: newId,
      url: formattedUrl,
      createdAt: now,
      updatedAt: now
    };

    let updatedUrls = [...captivePortalUrls];
    if (newItem.isDefault) {
      updatedUrls = updatedUrls.map(u => ({ ...u, isDefault: false }));
    }
    updatedUrls.push(newItem);

    return updateCaptivePortalUrls(updatedUrls);
  };

  const editCaptivePortalUrl = async (id: string, updates: Partial<CaptivePortalUrlItem>): Promise<{ success: boolean; error?: string }> => {
    const now = new Date().toISOString();
    let updatedUrls = captivePortalUrls.map(u => {
      if (u.id === id) {
        let urlVal = updates.url !== undefined ? updates.url.trim() : u.url;
        if (urlVal && !/^https?:\/\//i.test(urlVal)) {
          urlVal = `http://${urlVal}`;
        }
        return {
          ...u,
          ...updates,
          url: urlVal,
          updatedAt: now
        };
      }
      return u;
    });

    if (updates.isDefault) {
      updatedUrls = updatedUrls.map(u => u.id === id ? { ...u, isDefault: true } : { ...u, isDefault: false });
    }

    return updateCaptivePortalUrls(updatedUrls);
  };

  const deleteCaptivePortalUrl = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const targetItem = captivePortalUrls.find(u => u.id === id);
    const remaining = captivePortalUrls.filter(u => u.id !== id);
    if (targetItem?.isDefault && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }
    return updateCaptivePortalUrls(remaining);
  };

  const setDefaultCaptivePortalUrl = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const updatedUrls = captivePortalUrls.map(u => ({
      ...u,
      isDefault: u.id === id
    }));
    return updateCaptivePortalUrls(updatedUrls);
  };

  /**
   * Universal Audit Action Logger:
   * Records administrative and agent actions, customer modifications, deletions,
   * credential changes, role modifications, and device enrollments
   * to local memory state and synchronizes with the cloud Firestore /audit_logs collection.
   */
  const logAuditAction = async (
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
  ): Promise<AuditLogEntry> => {
    const logId = entry.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = entry.timestamp || new Date().toISOString();

    const fullEntry: AuditLogEntry = {
      id: logId,
      timestamp,
      category: entry.category,
      action: entry.action,
      title: entry.title,
      description: entry.description,
      actorId: entry.actorId || currentUser?.uid,
      actorName: entry.actorName || currentUser?.name || 'Agent',
      actorEmail: entry.actorEmail || currentUser?.email,
      actorRole: entry.actorRole || currentUser?.role || 'Agent',
      targetId: entry.targetId,
      targetName: entry.targetName,
      targetEmail: entry.targetEmail,
      workspaceId: entry.workspaceId || activeWorkspace?.id || currentUser?.workspaceId,
      workspaceName: entry.workspaceName || activeWorkspace?.name,
      metadata: entry.metadata || {}
    };

    // 1. Optimistic Local State Update
    setAuditLogs(prev => {
      const filtered = prev.filter(l => l.id !== logId);
      const updated = [fullEntry, ...filtered];
      return updated.slice(0, 1000);
    });

    // 2. Cloud Firestore Persistence
    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'audit_logs', logId), cleanForFirestore(fullEntry), { merge: true });
        if (fullEntry.workspaceId && fullEntry.workspaceId !== 'system') {
          await setDoc(doc(db, 'workspaces', fullEntry.workspaceId, 'audit_logs', logId), cleanForFirestore(fullEntry), { merge: true }).catch(() => {});
        }
      } catch (err) {
        console.warn("[WiVoTe Audit] Cloud save non-fatal error:", err);
      }
    }

    return fullEntry;
  };

  const addOrUpdateCustomer = async (customerData: Partial<Customer>): Promise<Customer> => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    const now = Date.now();

    const cleanName = (customerData.name || '').trim();
    if (isPlaceholderOrWalkInClient(cleanName)) {
      throw new Error('Generic walk-in client names are not saved to the customer registry.');
    }
    const cleanNameLower = cleanName.toLowerCase();
    const cleanCell = (customerData.cellNumber || '').trim();
    const cleanCellDigits = cleanCell.replace(/\D/g, '');

    const cleanMacNorm = (customerData.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Guard against entry of duplicate/identical names, numbers, or MACs in the target workspace registry
    const wsCustomers = customers.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId);
    let existing: Customer | undefined;
    if (customerData.id) {
      existing = customers.find(c => c.id === customerData.id);
    }
    if (!existing) {
      existing = wsCustomers.find(c => {
        if (customerData.customerNumber && c.customerNumber && c.customerNumber.toLowerCase() === customerData.customerNumber.toLowerCase()) {
          return true;
        }
        if (cleanNameLower && cleanNameLower !== 'walk-in client' && c.name && c.name.trim().toLowerCase() === cleanNameLower) {
          return true;
        }
        if (cleanCellDigits.length >= 6 && c.cellNumber) {
          const existingDigits = c.cellNumber.replace(/\D/g, '');
          if (existingDigits.length >= 6 && existingDigits === cleanCellDigits) {
            return true;
          }
        }
        if (cleanMacNorm.length >= 8 && c.macAddress) {
          const existingMac = c.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          if (existingMac.length >= 8 && existingMac === cleanMacNorm) {
            return true;
          }
        }
        return false;
      });
    }

    const finalWsId = existing?.workspaceId || targetWsId;

    // Check for any OTHER duplicate customer records that match this name/phone/MAC in this workspace to purge them
    const secondaryDuplicates = wsCustomers.filter(c => {
      if (existing && c.id === existing.id) return false;
      if (customerData.id && c.id === customerData.id) return false;
      if (cleanNameLower && cleanNameLower !== 'walk-in client' && c.name && c.name.trim().toLowerCase() === cleanNameLower) {
        return true;
      }
      if (cleanCellDigits.length >= 6 && c.cellNumber && c.cellNumber.replace(/\D/g, '') === cleanCellDigits) {
        return true;
      }
      if (cleanMacNorm.length >= 8 && c.macAddress && c.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanMacNorm) {
        return true;
      }
      return false;
    });

    const isEdit = !!existing;
    const oldName = existing?.name;
    const oldCell = existing?.cellNumber;
    const custId = existing?.id || customerData.id || getDeterministicCustomerId(cleanName, cleanCell, cleanMacNorm);
    
    // Ensure customerNumber is strictly unique within this workspace and reclaims lowest free slot
    let custNumber = existing?.customerNumber || customerData.customerNumber;
    if (custNumber && isCustomerNumberTaken(custNumber, wsCustomers, custId)) {
      custNumber = getNextCustomerNumber(wsCustomers, custId);
    } else if (!custNumber) {
      custNumber = getNextCustomerNumber(wsCustomers, custId);
    }

    // Merge attributes from existing or any secondary duplicates
    const mergedPurchases = [
      ...(existing?.consecutivePurchases || []),
      ...secondaryDuplicates.flatMap(d => d.consecutivePurchases || [])
    ];
    const uniquePurchases = Array.from(new Map(mergedPurchases.map(p => [p.voucherId || p.id, p])).values());

    const desiredStreak = customerData.streakCount !== undefined 
      ? Math.max(0, Math.min(3, Math.floor(customerData.streakCount)))
      : (existing?.streakCount !== undefined ? existing.streakCount : uniquePurchases.length);

    const actorRole = currentUser?.role || 'Agent';
    const actorDisplayName = currentUser?.name || currentUser?.email || 'Workspace Member';
    const actorUserId = currentUser?.uid || 'system';

    let finalPurchases = customerData.consecutivePurchases || (uniquePurchases.length > 0 ? uniquePurchases : (existing?.consecutivePurchases || []));
    if (customerData.streakCount !== undefined && isEdit && existing) {
      const currentActive = calculateActiveStreakCount(existing);
      if (desiredStreak !== currentActive) {
        const qualifyingPrice = (customerData.customerType || existing.customerType) === 'legacy_device'
          ? (customerData.monthlyPrice || existing.monthlyPrice || 10.0)
          : 3.0;
        const streakPurchases: CustomerPurchaseRecord[] = [];
        for (let i = 0; i < desiredStreak; i++) {
          streakPurchases.push({
            id: `pur_streak_${now}_${i}_${Math.random().toString(36).substring(2, 6)}`,
            voucherId: `adj_strk_${i}`,
            voucherCode: (customerData.customerType || existing.customerType) === 'legacy_device' && (customerData.macAddress || existing.macAddress)
              ? (customerData.macAddress || existing.macAddress)!
              : `STRK-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            price: qualifyingPrice,
            discountApplied: 0,
            originalPrice: qualifyingPrice,
            timestamp: now - (desiredStreak - i) * 60000,
            agentId: currentUser?.uid || 'admin',
            agentName: actorDisplayName,
            plan: `${(customerData.customerType || existing.customerType) === 'legacy_device' ? 'Legacy Terminal' : 'Voucher'} Loyalty Streak`
          });
        }
        finalPurchases = streakPurchases;
      }
    }

    const fullCustomer: Customer = {
      id: custId,
      workspaceId: finalWsId,
      customerNumber: custNumber,
      name: cleanName || existing?.name || 'Valued Customer',
      cellNumber: cleanCell || existing?.cellNumber || secondaryDuplicates.find(d => d.cellNumber)?.cellNumber || '',
      createdAt: existing?.createdAt || customerData.createdAt || now,
      updatedAt: now,
      totalPurchases: customerData.totalPurchases !== undefined 
        ? customerData.totalPurchases 
        : Math.max(existing?.totalPurchases || 0, finalPurchases.length),
      totalSpend: customerData.totalSpend !== undefined 
        ? customerData.totalSpend 
        : Math.max(existing?.totalSpend || 0, ...secondaryDuplicates.map(d => d.totalSpend || 0)),
      totalSaved: customerData.totalSaved !== undefined 
        ? customerData.totalSaved 
        : Math.max(existing?.totalSaved || 0, ...secondaryDuplicates.map(d => d.totalSaved || 0)),
      consecutivePurchases: finalPurchases,
      lastPurchaseDate: customerData.lastPurchaseDate !== undefined ? customerData.lastPurchaseDate : (existing?.lastPurchaseDate || null),
      lastAgentName: customerData.lastAgentName || existing?.lastAgentName || '',
      lastVoucherCode: customerData.lastVoucherCode || existing?.lastVoucherCode || '',
      customerType: customerData.customerType || existing?.customerType || (cleanMacNorm ? 'legacy_device' : 'voucher'),
      deviceModel: customerData.deviceModel !== undefined ? customerData.deviceModel : (existing?.deviceModel || secondaryDuplicates.find(d => d.deviceModel)?.deviceModel || ''),
      macAddress: customerData.macAddress !== undefined ? customerData.macAddress : (existing?.macAddress || secondaryDuplicates.find(d => d.macAddress)?.macAddress || ''),
      monthlyPrice: customerData.monthlyPrice !== undefined ? customerData.monthlyPrice : (existing?.monthlyPrice || secondaryDuplicates.find(d => d.monthlyPrice)?.monthlyPrice || 0),
      streakCount: desiredStreak,
      savedByUserId: actorUserId,
      savedByName: actorDisplayName,
      savedByUserRole: actorRole,
      createdByUserId: existing?.createdByUserId || customerData.createdByUserId || actorUserId,
      createdByName: existing?.createdByName || customerData.createdByName || actorDisplayName,
      createdByUserRole: existing?.createdByUserRole || customerData.createdByUserRole || actorRole
    };

    // Remove any secondary duplicate IDs from state
    const duplicateIdsToPurge = secondaryDuplicates.map(d => d.id);

    setCustomers(prev => {
      const filtered = prev.filter(c => !duplicateIdsToPurge.includes(c.id));
      const idx = filtered.findIndex(c => c.id === custId);
      let updated: Customer[];
      if (idx >= 0) {
        updated = [...filtered];
        updated[idx] = fullCustomer;
      } else {
        updated = [...filtered, fullCustomer];
      }
      try {
        safeSetItem('wivote_customers', JSON.stringify(updated));
        if (finalWsId) {
          safeSetItem(`wivote_ws_customers_${finalWsId}`, JSON.stringify(updated.filter(c => resolveCustomerWorkspaceId(c, finalWsId) === finalWsId)));
        }
      } catch (e) {}
      return updated;
    });

    // Synchronize customer name across sold vouchers and legacy devices immediately
    const nameChanged = oldName && oldName.trim().toLowerCase() !== cleanNameLower;
    if (isEdit && nameChanged) {
      setVouchers(prev => {
        let hasVChange = false;
        const updatedV = prev.map(v => {
          const isMatch = (v.customerId && v.customerId === custId) ||
            (v.customerName && v.customerName.trim().toLowerCase() === oldName.trim().toLowerCase());
          if (isMatch) {
            hasVChange = true;
            return {
              ...v,
              customerName: fullCustomer.name,
              customerId: custId,
              customerCell: cleanCell || v.customerCell,
              customerNumber: custNumber || v.customerNumber
            };
          }
          return v;
        });
        if (hasVChange) {
          try {
            saveVouchersCache(updatedV, 'wivote_vouchers');
            if (finalWsId) {
              saveVouchersCache(updatedV.filter(v => resolveVoucherWorkspaceId(v, finalWsId) === finalWsId), `wivote_ws_vouchers_${finalWsId}`);
            }
          } catch (e) {}
          if (!isFirebasePlaceholder && finalWsId && finalWsId !== 'system') {
            updatedV.filter(v => (v.customerId && v.customerId === custId) || (v.customerName && v.customerName.trim().toLowerCase() === oldName.trim().toLowerCase())).forEach(v => {
              setDoc(doc(db, 'workspaces', finalWsId, 'vouchers', v.id), {
                customerName: fullCustomer.name,
                customerId: custId,
                customerCell: cleanCell || v.customerCell || '',
                customerNumber: custNumber || v.customerNumber || ''
              }, { merge: true }).catch(() => {});
            });
          }
          return updatedV;
        }
        return prev;
      });

      setLegacyDevices(prev => {
        let hasLdChange = false;
        const updatedLd = prev.map(ld => {
          const isMatch = (ld.customerId && ld.customerId === custId) ||
            (ld.customerName && ld.customerName.trim().toLowerCase() === oldName.trim().toLowerCase());
          if (isMatch) {
            hasLdChange = true;
            return {
              ...ld,
              customerName: fullCustomer.name,
              customerId: custId,
              customerCell: cleanCell || ld.customerCell
            };
          }
          return ld;
        });
        if (hasLdChange) {
          try {
            safeSetItem('wivote_legacy_devices', JSON.stringify(updatedLd));
            if (finalWsId) {
              safeSetItem(`wivote_ws_legacy_${finalWsId}`, JSON.stringify(updatedLd.filter(ld => resolveLegacyDeviceWorkspaceId(ld) === finalWsId)));
            }
          } catch (e) {}
          if (!isFirebasePlaceholder && finalWsId && finalWsId !== 'system') {
            updatedLd.filter(ld => (ld.customerId && ld.customerId === custId) || (ld.customerName && ld.customerName.trim().toLowerCase() === oldName.trim().toLowerCase())).forEach(ld => {
              setDoc(doc(db, 'workspaces', finalWsId, 'legacy_devices', ld.id), {
                customerName: fullCustomer.name,
                customerId: custId,
                customerCell: cleanCell || ld.customerCell || ''
              }, { merge: true }).catch(() => {});
            });
          }
          return updatedLd;
        }
        return prev;
      });
    }

    // Delete secondary duplicate records from Firestore
    if (duplicateIdsToPurge.length > 0 && finalWsId && finalWsId !== 'system' && !isFirebasePlaceholder) {
      duplicateIdsToPurge.forEach(dupId => {
        deleteDoc(doc(db, 'workspaces', finalWsId, 'customers', dupId)).catch(() => {});
        deleteDoc(doc(db, 'customers', dupId)).catch(() => {});
      });
    }

    if (!isFirebasePlaceholder && finalWsId && finalWsId !== 'system') {
      const syncToFirestore = async () => {
        try {
          const sanitized = cleanForFirestore(fullCustomer);
          // Save to workspace customers subcollection
          await setDoc(doc(db, 'workspaces', finalWsId, 'customers', custId), sanitized, { merge: true });
          // Save to universal root customers collection so agent changes persist in the universal database
          await setDoc(doc(db, 'customers', custId), sanitized, { merge: true }).catch(err => {
            console.warn("Universal customers registry sync warning:", err);
          });
        } catch (e) {
          console.warn("Error saving customer to universal Firestore database:", e);
        }
      };

      await Promise.race([
        syncToFirestore(),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }

    // Activity Audit Log for Admin to track Agent actions
    if (isEdit) {
      const nameChanged = oldName && oldName.trim() !== fullCustomer.name.trim();
      const cellChanged = oldCell && oldCell.trim() !== fullCustomer.cellNumber.trim();
      
      logAuditAction({
        category: 'customer',
        action: 'customer_edited',
        title: `${actorDisplayName} edited customer ${fullCustomer.customerNumber || fullCustomer.name}`,
        description: nameChanged
          ? `${actorDisplayName} (${actorRole}) edited customer name from "${oldName}" to "${fullCustomer.name}" (${fullCustomer.customerNumber}).`
          : cellChanged
          ? `${actorDisplayName} (${actorRole}) edited phone number for "${fullCustomer.name}" (${fullCustomer.customerNumber}).`
          : `${actorDisplayName} (${actorRole}) edited details for customer "${fullCustomer.name}" (${fullCustomer.customerNumber}).`,
        actorId: currentUser?.uid,
        actorName: actorDisplayName,
        actorEmail: currentUser?.email,
        actorRole: actorRole,
        targetId: fullCustomer.id,
        targetName: fullCustomer.name,
        workspaceId: fullCustomer.workspaceId || targetWsId,
        metadata: {
          previousName: oldName,
          newName: fullCustomer.name,
          previousCell: oldCell,
          newCell: fullCustomer.cellNumber,
          customerNumber: fullCustomer.customerNumber,
          customerType: fullCustomer.customerType,
          editedAt: new Date().toISOString(),
          editedByRole: actorRole,
          editedByAgentId: currentUser?.uid,
          editedByAgentName: actorDisplayName
        }
      }).catch(e => console.warn('Audit log write error:', e));
    } else if (cleanNameLower && cleanNameLower !== 'walk-in client') {
      logAuditAction({
        category: 'customer',
        action: 'customer_created',
        title: `${actorDisplayName} registered customer ${fullCustomer.customerNumber || fullCustomer.name}`,
        description: `${actorDisplayName} (${actorRole}) registered new customer "${fullCustomer.name}" (${fullCustomer.customerNumber}) in the customer registry.`,
        actorId: currentUser?.uid,
        actorName: actorDisplayName,
        actorEmail: currentUser?.email,
        actorRole: actorRole,
        targetId: fullCustomer.id,
        targetName: fullCustomer.name,
        workspaceId: fullCustomer.workspaceId || targetWsId,
        metadata: {
          customerName: fullCustomer.name,
          customerNumber: fullCustomer.customerNumber,
          cellNumber: fullCustomer.cellNumber,
          customerType: fullCustomer.customerType,
          createdAt: new Date().toISOString(),
          createdByRole: actorRole,
          createdByAgentId: currentUser?.uid,
          createdByAgentName: actorDisplayName
        }
      }).catch(e => console.warn('Audit log write error:', e));
    }

    autoPushActionToDb(isEdit ? 'Customer Entry: Customer Edited' : 'Customer Entry: Customer Registered', targetWsId);

    return fullCustomer;
  };

  /**
   * Delete customer from registry:
   * Accessible by Agents, Admins, and Workspace Masters.
   * Completely purges the customer and all duplicates from state, localStorage, and Firestore.
   * Unlinks vouchers and legacy devices and writes a persistent tombstone to prevent resurrection.
   */
  const deleteCustomer = async (customerId: string): Promise<boolean> => {
    // 1. Locate target customer by ID or Name
    let targetCustomer = customers.find(c => c.id === customerId || (c.id && c.id.trim() === customerId.trim()));
    if (!targetCustomer) {
      targetCustomer = customers.find(c => c.name && c.name.trim().toLowerCase() === customerId.trim().toLowerCase());
    }
    // If not in registry list, check if customer name exists in vouchers or legacy devices
    if (!targetCustomer) {
      const trimmedQuery = customerId.trim().toLowerCase();
      const matchV = vouchers.find(v => v.customerName && v.customerName.trim().toLowerCase() === trimmedQuery);
      const matchLd = legacyDevices.find(ld => ld.customerName && ld.customerName.trim().toLowerCase() === trimmedQuery);
      if (matchV || matchLd) {
        targetCustomer = {
          id: (matchV?.customerId || matchLd?.customerId || customerId),
          name: (matchV?.customerName || matchLd?.customerName || customerId).trim(),
          customerNumber: matchV?.customerNumber || matchLd?.customerNumber || 'CN:00',
          cellNumber: (matchV?.customerCell || matchLd?.customerCell || ''),
          customerType: matchLd ? 'legacy_device' : 'voucher',
          totalPurchases: 0,
          totalSpend: 0,
          totalSaved: 0,
          consecutivePurchases: [],
          workspaceId: activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
    }
    if (!targetCustomer) {
      showToast('Customer not found in registry.', 'error');
      return false;
    }

    const cleanName = (targetCustomer.name || '').trim();
    const normName = cleanName.toLowerCase();
    const phoneDigits = (targetCustomer.cellNumber || '').replace(/\D/g, '');
    const normMac = (targetCustomer.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // 2. Identify all duplicate customer records sharing this name, phone, or MAC
    const allMatches = customers.filter(c => {
      if (c.id === customerId || (targetCustomer && c.id === targetCustomer.id)) return true;
      if (normName && normName !== 'walk-in client' && c.name && c.name.trim().toLowerCase() === normName) return true;
      if (phoneDigits.length >= 6 && c.cellNumber && c.cellNumber.replace(/\D/g, '') === phoneDigits) return true;
      if (normMac.length >= 8 && c.macAddress && c.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normMac) return true;
      return false;
    });

    const allMatchingIds = Array.from(new Set([customerId, targetCustomer.id, ...allMatches.map(c => c.id)].filter(Boolean)));
    const allMatchingNames = Array.from(new Set([cleanName, ...allMatches.map(c => c.name).filter(Boolean)]));
    const allMatchingNormNames = new Set(allMatchingNames.flatMap(n => [
      n.trim().toLowerCase(),
      n.trim().toLowerCase().replace(/\s+/g, ' ')
    ]).filter(Boolean));

    // 3. Register persistent tombstone so synthesizeCustomers NEVER resurrects them
    markCustomerDeleted(allMatchingIds, allMatchingNames);

    const targetWsId = targetCustomer.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';

    // Persist deleted customer tombstones to Firestore so other devices/sessions never resurrect them
    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      const existingNames = Array.from(getDeletedCustomerNames());
      const existingIds = Array.from(getDeletedCustomerIds());
      setDoc(doc(db, 'workspaces', targetWsId, 'customers', '__deleted_names__'), {
        names: existingNames,
        ids: existingIds,
        updatedAt: Date.now()
      }, { merge: true }).catch(() => {});
    }

    // 4. Synchronously remove from React state & localStorage
    setCustomers(prev => {
      const updated = prev.filter(c => {
        if (allMatchingIds.includes(c.id)) return false;
        if (!c.name) return true;
        const cNorm = c.name.trim().toLowerCase();
        const cCleanNorm = cNorm.replace(/\s+/g, ' ');
        return !allMatchingNormNames.has(cNorm) && !allMatchingNormNames.has(cCleanNorm);
      });
      try {
        safeSetItem('wivote_customers', JSON.stringify(updated));
      } catch (e) {
        console.warn('Storage write error on delete customer:', e);
      }
      return updated;
    });

    // 5. Unlink customer from vouchers in state, localStorage, and Firestore
    const matchingVoucherIds: string[] = [];
    setVouchers(prev => {
      let changed = false;
      const updated = prev.map(v => {
        const vNorm = (v.customerName || '').trim().toLowerCase();
        const vCleanNorm = vNorm.replace(/\s+/g, ' ');
        const isMatch = (v.customerId && allMatchingIds.includes(v.customerId)) ||
          (v.customerName && (allMatchingNormNames.has(vNorm) || allMatchingNormNames.has(vCleanNorm)));
        if (isMatch) {
          changed = true;
          matchingVoucherIds.push(v.id);
          const copy = { ...v };
          delete copy.customerId;
          delete copy.customerName;
          delete copy.customerCell;
          delete copy.customerNumber;
          return copy;
        }
        return v;
      });
      if (changed) {
        try {
          saveVouchersCache(updated);
        } catch (e) {}
      }
      return updated;
    });

    // Clean up Firestore vouchers in real time
    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system' && matchingVoucherIds.length > 0) {
      matchingVoucherIds.forEach(vId => {
        updateDoc(doc(db, 'workspaces', targetWsId, 'vouchers', vId), {
          customerName: deleteField(),
          customerId: deleteField(),
          customerCell: deleteField(),
          customerNumber: deleteField()
        }).catch(err => console.warn('Unlink voucher customer warning:', err));
      });
    }

    // 6. Unlink customer details from legacy devices in state, localStorage, and Firestore
    const matchingDeviceIds: string[] = [];
    setLegacyDevices(prev => {
      let changed = false;
      const updated = prev.map(ld => {
        const ldNorm = (ld.customerName || '').trim().toLowerCase();
        const ldCleanNorm = ldNorm.replace(/\s+/g, ' ');
        const isMatch = (ld.customerId && allMatchingIds.includes(ld.customerId)) ||
          (ld.customerName && (allMatchingNormNames.has(ldNorm) || allMatchingNormNames.has(ldCleanNorm)));
        if (isMatch) {
          changed = true;
          matchingDeviceIds.push(ld.id);
          const copy = { ...ld };
          delete copy.customerId;
          delete copy.customerName;
          delete copy.customerCell;
          delete copy.customerNumber;
          return copy;
        }
        return ld;
      });
      if (changed) {
        try {
          safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });

    // Clean up Firestore legacy devices in real time
    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system' && matchingDeviceIds.length > 0) {
      matchingDeviceIds.forEach(devId => {
        updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', devId), {
          customerName: deleteField(),
          customerId: deleteField(),
          customerCell: deleteField(),
          customerNumber: deleteField()
        }).catch(err => console.warn('Unlink legacy device customer warning:', err));
      });
    }

    // 7. Cloud Firestore deletion across all matching customer IDs
    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        const firestoreDeleteOps = Promise.all(allMatchingIds.map(async (id) => {
          await deleteDoc(doc(db, 'workspaces', targetWsId, 'customers', id)).catch(err => {
            console.warn("Workspace customer deletion warning:", err);
          });
          await deleteDoc(doc(db, 'customers', id)).catch(err => {
            console.warn("Universal customer deletion warning:", err);
          });
        }));

        await Promise.race([
          firestoreDeleteOps,
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
      } catch (err) {
        console.warn("Error deleting customer from Firestore (handled offline):", err);
      }
    }

    // 8. Administrative Audit Activity Log
    const actorRole = currentUser?.role || 'Agent';
    const actorDisplayName = currentUser?.name || currentUser?.email || 'Agent';

    logAuditAction({
      category: 'customer',
      action: 'customer_deleted',
      title: `${actorDisplayName} permanently deleted customer ${targetCustomer.customerNumber || targetCustomer.name}`,
      description: `${actorDisplayName} (${actorRole}) permanently deleted customer "${targetCustomer.name}" (${targetCustomer.customerNumber || targetCustomer.id}) from the customer registry.`,
      actorId: currentUser?.uid,
      actorName: actorDisplayName,
      actorEmail: currentUser?.email,
      actorRole: actorRole,
      targetId: targetCustomer.id,
      targetName: targetCustomer.name,
      workspaceId: targetWsId,
      metadata: {
        deletedCustomerName: targetCustomer.name,
        customerNumber: targetCustomer.customerNumber,
        cellNumber: targetCustomer.cellNumber,
        customerType: targetCustomer.customerType,
        totalPurchases: targetCustomer.totalPurchases,
        totalSpend: targetCustomer.totalSpend,
        deletedAt: new Date().toISOString(),
        deletedByRole: actorRole,
        deletedByAgentId: currentUser?.uid,
        deletedByAgentName: actorDisplayName
      }
    }).catch(e => console.warn('Audit log write error:', e));

    autoPushActionToDb('Deletion: Customer Deleted', targetWsId);
    showToast(`✓ Customer "${targetCustomer.name}" permanently deleted and saved.`, 'success');
    return true;
  };

  const updateCustomerStreak = async (
    customerId: string,
    streakCount: number,
    qualifyingPrice?: number,
    planName?: string
  ): Promise<{ success: boolean; customer?: Customer; error?: string }> => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
      return { success: false, error: 'Customer not found in registry.' };
    }

    // Role check: Only administrator / workspace master / app owner
    if (currentUser?.role === 'Agent') {
      return { success: false, error: 'Only administrators can adjust customer loyalty streaks.' };
    }

    const price = qualifyingPrice !== undefined && qualifyingPrice > 0
      ? qualifyingPrice
      : (customer.monthlyPrice || (customer.customerType === 'legacy_device' ? 10.0 : 3.0));

    const now = Date.now();
    const newStreakCount = Math.max(0, Math.min(3, Math.floor(streakCount)));

    // Generate qualifying consecutive purchase records
    const newConsecutive: CustomerPurchaseRecord[] = [];
    for (let i = 0; i < newStreakCount; i++) {
      newConsecutive.push({
        id: `pur_streak_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        voucherId: `adj_strk_${i}`,
        voucherCode: customer.customerType === 'legacy_device' && customer.macAddress
          ? customer.macAddress
          : `STRK-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        price: price,
        discountApplied: 0,
        originalPrice: price,
        timestamp: now - (newStreakCount - i) * 60000,
        agentId: currentUser?.uid || 'admin',
        agentName: currentUser?.name || 'Admin Adjustment',
        plan: planName || (customer.customerType === 'legacy_device'
          ? `${customer.deviceModel || 'Legacy Device'} Monthly`
          : `$${(price || 0).toFixed(2)} Voucher Plan`)
      });
    }

    let updatedCustomer: Customer | undefined;
    setCustomers(prev => {
      const current = prev.find(c => c.id === customerId) || customer;
      updatedCustomer = {
        ...current,
        consecutivePurchases: newConsecutive,
        streakCount: newStreakCount,
        updatedAt: now
      };
      const nextList = prev.map(c => c.id === customerId ? updatedCustomer! : c);
      try {
        safeSetItem('wivote_customers', JSON.stringify(nextList));
        if (targetWsId) {
          safeSetItem(`wivote_ws_customers_${targetWsId}`, JSON.stringify(nextList.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId)));
        }
      } catch (e) {}
      return nextList;
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system' && updatedCustomer) {
      const syncStreak = async () => {
        try {
          const sanitized = cleanForFirestore(updatedCustomer!);
          await setDoc(doc(db, 'workspaces', targetWsId, 'customers', customerId), sanitized, { merge: true });
          await setDoc(doc(db, 'customers', customerId), sanitized, { merge: true }).catch(() => {});
        } catch (err) {
          console.warn("Error saving customer streak to Firestore:", err);
        }
      };

      await Promise.race([
        syncStreak(),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }

    logAuditAction({
      category: 'customer',
      action: 'STREAK_ADJUSTED',
      title: 'Customer Loyalty Streak Adjusted',
      description: `Admin ${currentUser?.name || 'Admin'} set loyalty streak for ${customer.name} (${customer.customerNumber}) to ${newStreakCount} (${customer.customerType === 'legacy_device' ? 'Legacy Device' : 'Voucher'} customer, qualifying price: $${(price || 0).toFixed(2)}).`,
      workspaceId: targetWsId,
      targetId: customer.id,
      targetName: customer.name,
      metadata: { streakCount: newStreakCount, qualifyingPrice: price, customerType: customer.customerType }
    }).catch(() => {});

    showToast(`✓ Loyalty streak for ${customer.name} updated to ${newStreakCount} (Tier: $${(price || 0).toFixed(2)})!`, 'success');

    autoPushActionToDb('Update Customer Streak', targetWsId);
    return { success: true, customer: updatedCustomer };
  };

  const bulkAddCustomers = async (
    entries: Array<{
      name: string;
      firstName?: string;
      surname?: string;
      cellNumber: string;
      customerType?: 'voucher' | 'legacy_device';
      deviceModel?: string;
      macAddress?: string;
      monthlyPrice?: number;
      streak?: number;
    }>,
    options?: {
      skipDuplicates?: boolean;
    }
  ): Promise<{
    success: boolean;
    addedCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: string[];
    customers: Customer[];
  }> => {
    if (!entries || entries.length === 0) {
      return { success: false, addedCount: 0, updatedCount: 0, skippedCount: 0, errors: ['No customer entries provided for import.'], customers: [] };
    }

    const skipDuplicates = options?.skipDuplicates ?? true;
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    const now = Date.now();
    const errors: string[] = [];

    const normalizeName = (s?: string): string => {
      if (!s) return '';
      return s.trim().toLowerCase().replace(/\s+/g, ' ');
    };

    // Build lookup maps of existing customers for fast matching
    const existingByPhone = new Map<string, Customer>();
    const existingByName = new Map<string, Customer>();
    const existingByMac = new Map<string, Customer>();

    for (const c of customers) {
      if (c.cellNumber) {
        const normPhone = c.cellNumber.replace(/\D/g, '');
        if (normPhone.length >= 6) {
          existingByPhone.set(normPhone, c);
        }
      }
      if (c.name) {
        const normN = normalizeName(c.name);
        if (normN) existingByName.set(normN, c);
      }
      if (c.macAddress) {
        const normMac = c.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (normMac.length >= 8) {
          existingByMac.set(normMac, c);
        }
      }
    }

    // Also map existing legacy devices by MAC
    for (const ld of legacyDevices) {
      if (ld.macAddress) {
        const normMac = ld.macAddress.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (normMac.length >= 8 && !existingByMac.has(normMac)) {
          existingByMac.set(normMac, {
            id: ld.customerId || ld.id,
            name: ld.customerName,
            customerNumber: ld.customerNumber || 'LD',
            cellNumber: ld.customerCell || '',
            workspaceId: targetWsId,
            createdAt: now,
            updatedAt: now,
            totalPurchases: 0,
            totalSpend: 0,
            totalSaved: 0,
            consecutivePurchases: []
          });
        }
      }
    }

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const allProcessedCustomers: Customer[] = [];
    const updatedStateMap = new Map<string, Customer>();
    const newLegacyDevicesToCreate: LegacyDevice[] = [];

    // Seed state map with current customers
    for (const c of customers) {
      updatedStateMap.set(c.id, c);
    }

    // Intra-batch sets to detect duplicates within the imported file itself
    const batchPhones = new Set<string>();
    const batchNames = new Set<string>();
    const batchMacs = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rawFirst = (entry.firstName || '').trim();
      const rawSurname = (entry.surname || '').trim();
      let fullName = (entry.name || '').trim();

      if (!fullName && (rawFirst || rawSurname)) {
        fullName = `${rawFirst} ${rawSurname}`.trim();
      } else if (rawFirst && rawSurname && !fullName.toLowerCase().includes(rawSurname.toLowerCase())) {
        fullName = `${rawFirst} ${rawSurname}`.trim();
      }

      if (!fullName) {
        errors.push(`Row ${i + 1}: Skipped record with missing name.`);
        continue;
      }

      const normName = normalizeName(fullName);
      const rawCell = (entry.cellNumber || '').trim();
      const normCell = rawCell.replace(/\D/g, '');
      const rawMac = (entry.macAddress || '').trim();
      const normMac = rawMac.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      // Duplicate validation
      let isDuplicate = false;
      let existingCust: Customer | undefined;
      let dupReason = '';

      if (normMac.length >= 8) {
        if (existingByMac.has(normMac)) {
          isDuplicate = true;
          existingCust = existingByMac.get(normMac);
          dupReason = `MAC Address ${rawMac} already registered`;
        } else if (batchMacs.has(normMac)) {
          isDuplicate = true;
          dupReason = `Duplicate MAC Address ${rawMac} in file`;
        }
      }

      if (!isDuplicate && normCell.length >= 6) {
        if (existingByPhone.has(normCell)) {
          isDuplicate = true;
          existingCust = existingByPhone.get(normCell);
          dupReason = `Phone number ${rawCell} already registered`;
        } else if (batchPhones.has(normCell)) {
          isDuplicate = true;
          dupReason = `Duplicate phone number ${rawCell} in file`;
        }
      }

      if (!isDuplicate && normName) {
        if (existingByName.has(normName)) {
          isDuplicate = true;
          existingCust = existingByName.get(normName);
          dupReason = `Customer "${fullName}" already registered`;
        } else if (batchNames.has(normName)) {
          isDuplicate = true;
          dupReason = `Duplicate customer "${fullName}" in file`;
        }
      }

      if (isDuplicate) {
        if (skipDuplicates) {
          skippedCount++;
          errors.push(`Row ${i + 1} (${fullName}): Disallowed duplicate (${dupReason})`);
          continue; // Skip duplicate entry!
        } else if (existingCust) {
          // Update existing customer record
          const updatedCustomer: Customer = {
            ...existingCust,
            name: fullName || existingCust.name,
            cellNumber: rawCell || existingCust.cellNumber,
            customerType: entry.customerType || existingCust.customerType || 'voucher',
            deviceModel: entry.deviceModel || existingCust.deviceModel,
            macAddress: rawMac || existingCust.macAddress,
            monthlyPrice: entry.monthlyPrice !== undefined ? entry.monthlyPrice : existingCust.monthlyPrice,
            updatedAt: now,
            savedByUserId: currentUser?.uid || 'system',
            savedByName: currentUser?.name || currentUser?.email || 'Workspace Member',
            savedByUserRole: currentUser?.role || 'Agent'
          };
          updatedStateMap.set(existingCust.id, updatedCustomer);
          allProcessedCustomers.push(updatedCustomer);
          if (normCell.length >= 6) existingByPhone.set(normCell, updatedCustomer);
          if (normMac.length >= 8) existingByMac.set(normMac, updatedCustomer);
          if (normName) existingByName.set(normName, updatedCustomer);
          updatedCount++;
          continue;
        }
      }

      // Record in intra-batch sets
      if (normCell.length >= 6) batchPhones.add(normCell);
      if (normName) batchNames.add(normName);
      if (normMac.length >= 8) batchMacs.add(normMac);

      // Create brand new customer - reclaims lowest vacant sequence number
      const custNumber = getNextCustomerNumber(Array.from(updatedStateMap.values()));
      const custId = getDeterministicCustomerId(fullName, rawCell, normMac);

      const streakCount = Math.min(12, Math.max(0, entry.streak || 0));
      const price = entry.monthlyPrice || (entry.customerType === 'legacy_device' ? 10.0 : 3.0);
      const initialConsecutive: CustomerPurchaseRecord[] = [];
      for (let s = 0; s < streakCount; s++) {
        initialConsecutive.push({
          id: `pur_init_${Date.now()}_${s}`,
          voucherId: `imp_${s}`,
          voucherCode: rawMac || `STRK-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          price: price,
          discountApplied: 0,
          originalPrice: price,
          timestamp: now - (streakCount - s) * 60000,
          agentId: currentUser?.uid || 'agent',
          agentName: currentUser?.name || 'CSV Import',
          plan: entry.customerType === 'legacy_device'
            ? `${entry.deviceModel || 'Legacy Device'} Monthly`
            : `$${(price || 0).toFixed(2)} Voucher Plan`
        });
      }

      const newCustomer: Customer = {
        id: custId,
        workspaceId: targetWsId,
        customerNumber: custNumber,
        name: fullName,
        cellNumber: rawCell,
        customerType: entry.customerType || 'voucher',
        deviceModel: entry.deviceModel,
        macAddress: rawMac || undefined,
        monthlyPrice: entry.monthlyPrice,
        streakCount: streakCount,
        createdAt: now,
        updatedAt: now,
        totalPurchases: streakCount,
        totalSpend: streakCount * price,
        totalSaved: 0,
        consecutivePurchases: initialConsecutive,
        savedByUserId: currentUser?.uid || 'system',
        savedByName: currentUser?.name || currentUser?.email || 'Workspace Member',
        savedByUserRole: currentUser?.role || 'Agent',
        createdByUserId: currentUser?.uid || 'system',
        createdByName: currentUser?.name || currentUser?.email || 'Workspace Member',
        createdByUserRole: currentUser?.role || 'Agent'
      };

      updatedStateMap.set(custId, newCustomer);
      allProcessedCustomers.push(newCustomer);
      if (normCell.length >= 6) existingByPhone.set(normCell, newCustomer);
      if (normMac.length >= 8) existingByMac.set(normMac, newCustomer);
      existingByName.set(fullName.toLowerCase(), newCustomer);
      addedCount++;

      // If legacy device customer with MAC address, enroll into legacyDevices
      if (entry.customerType === 'legacy_device' && rawMac) {
        newLegacyDevicesToCreate.push({
          id: `ld_imp_${Date.now()}_${i}`,
          customerName: fullName,
          customerId: custId,
          customerNumber: custNumber,
          customerCell: rawCell,
          deviceNameModel: entry.deviceModel || 'Legacy Non-WiFi Device',
          macAddress: rawMac,
          monthlyPrice: price,
          fieldAgentId: currentUser?.uid || 'agent',
          fieldAgentName: currentUser?.name || 'Agent',
          isApproved: true,
          addedToInventory: true,
          status: 'APPROVED',
          enrolledAt: new Date().toISOString()
        });
      }
    }

    // Update React state immediately
    const nextCustomersList = Array.from(updatedStateMap.values());
    setCustomers(nextCustomersList);

    if (newLegacyDevicesToCreate.length > 0) {
      setLegacyDevices(prev => [...prev, ...newLegacyDevicesToCreate]);
    }

    // Persist to Firestore in chunked batches
    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        if (allProcessedCustomers.length > 0) {
          const chunkSize = 200;
          for (let i = 0; i < allProcessedCustomers.length; i += chunkSize) {
            const chunk = allProcessedCustomers.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            for (const cust of chunk) {
              const sanitized = cleanForFirestore(cust);
              const custDocRef = doc(db, 'workspaces', targetWsId, 'customers', cust.id);
              batch.set(custDocRef, sanitized, { merge: true });
              const universalCustRef = doc(db, 'customers', cust.id);
              batch.set(universalCustRef, sanitized, { merge: true });
            }
            await batch.commit();
          }
        }

        if (newLegacyDevicesToCreate.length > 0) {
          const batch = writeBatch(db);
          for (const ld of newLegacyDevicesToCreate) {
            const sanitizedLd = cleanForFirestore(ld);
            const ldDocRef = doc(db, 'workspaces', targetWsId, 'legacy_devices', ld.id);
            batch.set(ldDocRef, sanitizedLd, { merge: true });
          }
          await batch.commit();
        }
      } catch (dbErr: any) {
        console.error("Error bulk saving customers to Firestore:", dbErr);
        errors.push(`Cloud sync warning: ${dbErr?.message || 'Failed to sync to database'}`);
      }
    }

    logAuditAction({
      category: 'customer',
      action: 'BATCH_CUSTOMER_IMPORT',
      title: 'Bulk Customer Registry Import',
      description: `Imported ${addedCount} new customer(s) (${skippedCount} duplicate(s) skipped, ${updatedCount} updated) in workspace.`,
      workspaceId: targetWsId,
      metadata: { addedCount, updatedCount, skippedCount, totalProcessed: allProcessedCustomers.length }
    }).catch(() => {});

    showToast(`🎉 Bulk Import: ${addedCount} added, ${skippedCount} duplicate(s) skipped!`, 'success');

    autoPushActionToDb('Bulk Add Customers', targetWsId);
    return {
      success: true,
      addedCount,
      updatedCount,
      skippedCount,
      errors,
      customers: allProcessedCustomers
    };
  };

  const restoreCustomerRegistryFromPrePush = async (wsId?: string): Promise<{
    success: boolean;
    restoredCount: number;
    message: string;
  }> => {
    try {
      const targetWsId = wsId || activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';

      // 1. Clear customer tombstones so no customer is filtered out
      clearAllCustomerTombstones();

      // Clear remote tombstones in Firestore if present
      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        setDoc(doc(db, 'workspaces', targetWsId, 'customers', '__deleted_names__'), {
          names: [],
          ids: [],
          updatedAt: Date.now()
        }, { merge: true }).catch(() => {});
      }

      // 2. Gather customer candidates from workspace backups & entire app backups
      const candidateCustomersMap = new Map<string, Customer>();

      // Check workspaceBackups
      (workspaceBackups || []).forEach(bkp => {
        if (bkp.snapshot && Array.isArray(bkp.snapshot.customers)) {
          bkp.snapshot.customers.forEach(c => {
            if (c && c.name && resolveCustomerWorkspaceId(c, targetWsId) === targetWsId) {
              candidateCustomersMap.set(c.id || c.name.trim().toLowerCase(), { ...c, workspaceId: targetWsId });
            }
          });
        }
      });

      // Check entireAppBackups
      (entireAppBackups || []).forEach(bkp => {
        if (bkp.snapshot && Array.isArray(bkp.snapshot.customers)) {
          bkp.snapshot.customers.forEach(c => {
            if (c && c.name && resolveCustomerWorkspaceId(c, targetWsId) === targetWsId) {
              candidateCustomersMap.set(c.id || c.name.trim().toLowerCase(), { ...c, workspaceId: targetWsId });
            }
          });
        }
      });

      // Check local storage backups directly as fallback
      try {
        const rawWsBackups = localStorage.getItem(`wivote_ws_backups_${targetWsId}`) || localStorage.getItem('wivote_workspace_backups');
        if (rawWsBackups) {
          const parsed = safeJsonParse<any[]>(rawWsBackups, []);
          if (Array.isArray(parsed)) {
            parsed.forEach(bkp => {
              if (bkp && bkp.snapshot && Array.isArray(bkp.snapshot.customers)) {
                bkp.snapshot.customers.forEach((c: any) => {
                  if (c && c.name && resolveCustomerWorkspaceId(c, targetWsId) === targetWsId) {
                    candidateCustomersMap.set(c.id || c.name.trim().toLowerCase(), { ...c, workspaceId: targetWsId });
                  }
                });
              }
            });
          }
        }
      } catch (e) {}

      // 3. Include current customer list
      (customers || []).forEach(c => {
        if (c && c.name && resolveCustomerWorkspaceId(c, targetWsId) === targetWsId) {
          candidateCustomersMap.set(c.id || c.name.trim().toLowerCase(), { ...c, workspaceId: targetWsId });
        }
      });

      // 4. Synthesize customers from all active vouchers and legacy devices
      const activeVouchers = (vouchers || []).filter(v => resolveVoucherWorkspaceId(v) === targetWsId);
      const activeLegacy = (legacyDevices || []).filter(ld => resolveLegacyDeviceWorkspaceId(ld) === targetWsId);

      const combinedBase = Array.from(candidateCustomersMap.values());
      const synthesized = synthesizeCustomers(combinedBase, activeVouchers, activeLegacy, targetWsId);

      // 5. Update React state and local storage
      setCustomers(prev => {
        const map = new Map<string, Customer>();
        prev.filter(c => resolveCustomerWorkspaceId(c, targetWsId) !== targetWsId).forEach(c => map.set(c.id, c));
        synthesized.forEach(c => map.set(c.id, c));
        const merged = Array.from(map.values());
        safeSetItem('wivote_customers', JSON.stringify(merged));
        safeSetItem(`wivote_ws_customers_${targetWsId}`, JSON.stringify(synthesized));
        return merged;
      });

      // 6. Push restored customer list to Firestore database
      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        for (const c of synthesized) {
          await setDoc(doc(db, 'workspaces', targetWsId, 'customers', c.id), cleanForBackupSerialization(c), { merge: true }).catch(() => {});
          await setDoc(doc(db, 'customers', c.id), cleanForBackupSerialization(c), { merge: true }).catch(() => {});
        }
      }

      // Also trigger a push batch
      forcePushLocalToGlobalDB(true).catch(() => {});

      const msg = `✓ Customer registry successfully restored before last DB push! Restored ${synthesized.length} customer record(s).`;
      showToast(msg, 'success');
      return { success: true, restoredCount: synthesized.length, message: msg };
    } catch (err: any) {
      console.error("Failed to restore customer registry:", err);
      const errMs = err?.message || 'Failed to restore customer registry list.';
      showToast(errMs, 'error');
      return { success: false, restoredCount: 0, message: errMs };
    }
  };

  // Helper to prevent Firestore getDoc/getDocs promises from hanging forever
  const fetchWithTimeout = async <T,>(promise: Promise<T>, timeoutMs = 2500): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Firestore timeout: using cached session')), timeoutMs))
    ]);
  };

  // Dedicated helper to fetch and synchronize workspace metadata from Firestore cloud
  const fetchWorkspaceMetadataForUser = async (user: UserProfile | null): Promise<Workspace | null> => {
    if (!user) {
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);
      return null;
    }

    const email = (user.email || '').toLowerCase().trim();
    const isDeveloperEmail = email === 'karimazondomike049@gmail.com';
    const isAppOwner = user.role === 'AppOwner' || currentUserRole === 'AppOwner' || isDeveloperEmail;

    // 1. Instant local memory / seed resolution (0ms - zero blocking):
    const targetWsId = user.workspaceId || currentUserWorkspaceId;
    let localWs = (targetWsId && targetWsId !== 'system')
      ? (workspaces.find(w => w.id === targetWsId) || initialWorkspaces.find(w => w.id === targetWsId))
      : null;
    if (!localWs && email) {
      localWs = workspaces.find(w => (w as any).ownerEmail === email) || initialWorkspaces.find(w => (w as any).ownerEmail === email);
    }
    if (!localWs && isAppOwner) {
      localWs = workspaces[0] || initialWorkspaces[0];
    }
    if (!localWs) {
      localWs = workspaces[0] || initialWorkspaces[0];
    }

    if (localWs) {
      setWorkspaces(prev => prev.some(w => w.id === localWs!.id) ? prev : [...prev, localWs!]);
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);
    }

    if (isFirebasePlaceholder || !auth.currentUser) {
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);
      return localWs || null;
    }

    // 2. Non-blocking asynchronous background sync from Firestore cloud
    try {
      if (isAppOwner) {
        fetchWithTimeout(getDocs(collection(db, 'workspaces')), 1500).then(snap => {
          if (snap && !snap.empty) {
            const cloudWs: Workspace[] = [];
            snap.forEach(d => cloudWs.push({ id: d.id, ...d.data() } as Workspace));
            setWorkspaces(cloudWs);
          }
        }).catch(() => {});
      } else if (targetWsId && targetWsId !== '' && targetWsId !== 'system') {
        fetchWithTimeout(getDoc(doc(db, 'workspaces', targetWsId)), 1500).then(wsDocSnap => {
          if (wsDocSnap && wsDocSnap.exists()) {
            const cloudWs = { id: wsDocSnap.id, ...wsDocSnap.data() } as Workspace;
            setWorkspaces(prev => prev.map(w => w.id === cloudWs.id ? cloudWs : w));
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[WiVoTe Cloud] Background workspace metadata sync note:", err);
    }

    setIsWorkspaceMetadataLoaded(true);
    setGlobalLoading(false);
    setLoading(false);
    return localWs || null;
  };

  const loginUser = async (emailOrName: string, roleSelected: 'Admin' | 'Agent' | 'AppOwner' | 'Investor', passwordEntered: string): Promise<{ success: boolean; error?: string; isSuspended?: boolean; workspaceName?: string }> => {
    // Flush any leftover state from a previous session before attempting a new login to prevent privilege escalation or data bleed
    flushSessionState();

    const term = emailOrName.toLowerCase().trim();
    const mappedRole = roleSelected === 'Admin' ? 'WorkspaceMaster' : roleSelected === 'Agent' ? 'Agent' : roleSelected === 'Investor' ? 'Investor' : 'AppOwner';
    
    // --- Security Measure: Allow only the actual authorized App Owner emails to enter the App Owner workspace ---
    if (mappedRole === 'AppOwner') {
      const isAuthorizedOwner = term === 'karimazondomike049@gmail.com';
      if (!isAuthorizedOwner) {
        return { 
          success: false, 
          error: 'Security Alert: Access Denied. Your email is not authorized to log into the System/App Owner workspace.' 
        };
      }
    }

    let foundUser: UserProfile | null = null;
    let anyRoleUser: UserProfile | null = null;
    let activeWorkspacesList: Workspace[] = workspaces;

    const isMatchRole = (userRole: string | undefined, selectedRole: string) => {
      const r = (userRole || '').toLowerCase();
      if (selectedRole === 'Admin') {
        return ['workspacemaster', 'admin', 'administrator', 'master', 'owner'].includes(r);
      }
      if (selectedRole === 'Agent') {
        return ['agent', 'fieldagent'].includes(r);
      }
      if (selectedRole === 'Investor') {
        return ['investor', 'preferredinvestor', 'stakeholder'].includes(r);
      }
      if (selectedRole === 'AppOwner') {
        return ['appowner', 'system', 'owner'].includes(r);
      }
      return r === selectedRole.toLowerCase();
    };

    const cleanEntered = (passwordEntered || '').trim();
    const sortMatches = (userList: UserProfile[]) => {
      return [...userList].sort((a, b) => {
        // 1. Prefer matching password
        const aPassMatch = (a.password || '').trim() === cleanEntered;
        const bPassMatch = (b.password || '').trim() === cleanEntered;
        if (aPassMatch && !bPassMatch) return -1;
        if (!aPassMatch && bPassMatch) return 1;

        // 2. Real account ALWAYS precedes shadow account
        const aShadow = isShadowUserProfile(a);
        const bShadow = isShadowUserProfile(b);
        if (!aShadow && bShadow) return -1;
        if (aShadow && !bShadow) return 1;

        // 3. Prefer valid non-empty workspaceId
        const aHasWs = !!a.workspaceId && a.workspaceId !== '';
        const bHasWs = !!b.workspaceId && b.workspaceId !== '';
        if (aHasWs && !bHasWs) return -1;
        if (!aHasWs && bHasWs) return 1;

        // 4. Prefer non-default cellNumber
        const aDefaultCell = !a.cellNumber || a.cellNumber === '+263770000000';
        const bDefaultCell = !b.cellNumber || b.cellNumber === '+263770000000';
        if (!aDefaultCell && bDefaultCell) return -1;
        if (aDefaultCell && !bDefaultCell) return 1;

        // 5. Prefer non-temp UIDs only when data fidelity is identical
        const aIsTemp = a.uid.startsWith('agent_') || a.uid.startsWith('admin_') || a.uid.startsWith('temp_');
        const bIsTemp = b.uid.startsWith('agent_') || b.uid.startsWith('admin_') || b.uid.startsWith('temp_');
        if (aIsTemp && !bIsTemp) return 1;
        if (!aIsTemp && bIsTemp) return -1;

        return 0;
      });
    };

    const rawTerm = emailOrName.trim();

    // 1. Comprehensive Local & Cached Pool for instant (0ms) lookup:
    // Merges current users state, initialUsers, and localStorage cache!
    const candidatePool = [
      ...users,
      ...initialUsers,
      ...getCachedUsers()
    ];
    const poolMap = new Map<string, UserProfile>();
    candidatePool.forEach(u => {
      if (u && (u.uid || u.email)) {
        poolMap.set(u.uid || (u.email as string), u);
      }
    });
    const allKnownUsers = Array.from(poolMap.values());
    const sortedLocal = sortMatches(allKnownUsers);
    for (const u of sortedLocal) {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uName = (u.name || '').toLowerCase().trim();
      const uCell = (u.cellNumber || '').replace(/\s+/g, '');
      const inputCell = rawTerm.replace(/\s+/g, '');
      const isMatch = uEmail === term || uName === term || u.uid === rawTerm || (inputCell.length >= 6 && uCell.includes(inputCell));
      if (isMatch) {
        if (isMatchRole(u.role, roleSelected)) {
          foundUser = u;
          break;
        } else if (!anyRoleUser) {
          anyRoleUser = u;
        }
      }
    }

    const cleanStored = (foundUser?.password || '').trim();
    const isLocalPasswordValid = !!foundUser && (
      (cleanStored && (cleanStored === cleanEntered || foundUser.password === passwordEntered)) ||
      (foundUser.initialPassword && cleanEntered === foundUser.initialPassword.trim()) ||
      cleanEntered === 'password' ||
      (foundUser.role === 'AppOwner' && cleanEntered === '26@Votewix')
    );

    // 2. Query Firestore root, collectionGroup, and workspace subcollections ONLY if not found locally or password mismatch
    if (!isFirebasePlaceholder && (!foundUser || !isLocalPasswordValid)) {
      try {
        activeWorkspacesList = workspaces.length > 0 ? workspaces : initialWorkspaces;

        // A. Direct doc key lookup (if emailOrName is a UID)
        if (!foundUser) {
          const directDocRef = doc(db, 'users', rawTerm);
          const directDocSnap = await fetchWithTimeout(getDoc(directDocRef), 1000).catch(() => null);
          if (directDocSnap && directDocSnap.exists()) {
            const docData = directDocSnap.data() as UserProfile;
            if (isMatchRole(docData.role, roleSelected)) {
              foundUser = { uid: directDocSnap.id, ...docData };
            } else if (!anyRoleUser) {
              anyRoleUser = { uid: directDocSnap.id, ...docData };
            }
          }
        }

        // B. Direct email queries across root /users
        if (!foundUser && term.includes('@')) {
          const qEmail = query(collection(db, 'users'), where('email', '==', term));
          const emailSnap = await fetchWithTimeout(getDocs(qEmail), 1000).catch(() => null);
          if (emailSnap && !emailSnap.empty) {
            const matches = emailSnap.docs.map(d => ({ uid: d.id, ...(d.data() as UserProfile) }));
            for (const docData of sortMatches(matches)) {
              if (isMatchRole(docData.role, roleSelected)) {
                foundUser = docData;
                break;
              } else if (!anyRoleUser) {
                anyRoleUser = docData;
              }
            }
          }
        }
      } catch (err) {
        console.warn("Fast Firestore user lookup warning:", err);
      }
    }

    // 3. Fallback to any matched role if role tab was different, auto-switching to their actual role
    if (!foundUser && anyRoleUser) {
      if (anyRoleUser.role === 'AppOwner' && term !== 'karimazondomike049@gmail.com') {
        return {
          success: false,
          error: 'Security Alert: Access Denied. Your email is not authorized to log into the System/App Owner workspace.'
        };
      }
      foundUser = anyRoleUser;
    }

    if (!foundUser) {
      return { success: false, error: `Account not found for "${emailOrName}". Please verify your email or password.` };
    }

    // Password validation - checks custom password, initial password, demo fallback 'password', or AppOwner pass
    const effectiveStoredPass = (foundUser.password || '').trim();
    const isValidPass = (effectiveStoredPass && (effectiveStoredPass === cleanEntered || foundUser.password === passwordEntered)) ||
      (foundUser.initialPassword && cleanEntered === foundUser.initialPassword.trim()) ||
      cleanEntered === 'password' ||
      (foundUser.role === 'AppOwner' && (cleanEntered === '26@Votewix' || cleanEntered === 'password'));

    if (!isValidPass) {
      return { success: false, error: 'Incorrect password.' };
    }

    // Check if initial temporary password has been deactivated
    if (foundUser.requirePasswordChange === false && foundUser.initialPassword && cleanEntered === foundUser.initialPassword.trim() && cleanEntered !== 'password') {
      return { success: false, error: 'Initial temporary password has been deactivated. Please use your custom password.' };
    }

    const finalUser: UserProfile = { ...foundUser };
    const userRole = finalUser.role;
    const userWorkspaceId = finalUser.workspaceId || '';

    // Check workspace status (suspension check)
    const isOwnerRole = userRole === 'AppOwner' || (finalUser.email && finalUser.email.toLowerCase().trim() === 'karimazondomike049@gmail.com');
    if (!isOwnerRole && userWorkspaceId && userWorkspaceId !== 'system') {
      let targetWs = workspaces.find(w => w.id === userWorkspaceId) || initialWorkspaces.find(w => w.id === userWorkspaceId);
      if (targetWs && targetWs.isActive === false) {
        return {
          success: false,
          isSuspended: true,
          workspaceName: targetWs.name,
          error: `⚠️ Account suspended! Workspace "${targetWs.name}" is currently suspended. Please contact the App Owner for activation.`
        };
      }
    }

    // Sync user into local context and cached state
    setUsers(prev => {
      const filtered = prev.filter(u => u.uid !== finalUser.uid && (u.email || '').toLowerCase() !== (finalUser.email || '').toLowerCase());
      return [...filtered, finalUser];
    });

    // Zero-latency instant terminal entry
    setCurrentUserId(finalUser.uid);
    setSessionVar('wivote_current_user_id', finalUser.uid);
    setIsLoggedIn(true);
    setSessionVar('wivote_is_logged_in', 'true');
    setIsMetricsSyncing(true);
    setCurrentUserRole(userRole);
    setSessionVar('wivote_current_user_role', userRole);
    if (finalUser.email) {
      setSessionVar('wivote_current_user_email', finalUser.email);
    }
    setCurrentUserWorkspaceId(userWorkspaceId);
    setSessionVar('wivote_current_user_workspace_id', userWorkspaceId);
    setIsWorkspaceUnlocked(true);
    setSessionVar('wivote_workspace_unlocked', 'true');
    if (userRole === 'AppOwner') {
      setIsAppOwnerUnlocked(false);
      setSessionVar('wivote_app_owner_unlocked', 'false');
    }
    setGlobalLoading(false);
    setIsWorkspaceMetadataLoaded(true);
    setLoading(false);

    // Register device and update remembered users
    localStorage.setItem('wivote_device_registered', 'true');
    try {
      const remembered = safeJsonParse<any[]>(localStorage.getItem('wivote_remembered_users'), []);
      const userKey = { email: finalUser.email, name: finalUser.name, role: roleSelected };
      if (!remembered.some((r: any) => r.email === finalUser.email)) {
        remembered.push(userKey);
        localStorage.setItem('wivote_remembered_users', JSON.stringify(remembered));
      }
    } catch {}

    // Non-blocking detached background synchronization
    (async () => {
      fetchWorkspaceMetadataForUser(finalUser).catch(() => {});
      if (!isFirebasePlaceholder) {
        try {
          const email = (finalUser.email && finalUser.email.includes('@'))
            ? finalUser.email.trim().toLowerCase()
            : `${(finalUser.name || 'user').replace(/\s+/g, '').toLowerCase()}@wivote.com`;
          let fbPass = cleanEntered.length >= 6 ? cleanEntered : cleanEntered.padEnd(6, '!') + 'A1';

          let authUser: any = null;
          try {
            const cred = await signInWithEmailAndPassword(auth, email, fbPass);
            authUser = cred.user;
          } catch (err: any) {
            if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
              const cred = await createUserWithEmailAndPassword(auth, email, fbPass).catch(() => null);
              authUser = cred?.user;
            }
          }

          if (authUser) {
            try {
              const token = await authUser.getIdToken();
              await fetch('/api/auth/sync-claims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: token, role: finalUser.role, workspaceId: userWorkspaceId })
              });
            } catch {}
          }
        } catch (bgErr) {
          console.warn("[WiVoTe Background Sync]", bgErr);
        }
      }
    })().catch(() => {});

    return { success: true };
  };

  const loginWithGoogle = async (email: string, name: string, photoUrl?: string): Promise<{ success: boolean; error?: string; isSuspended?: boolean; workspaceName?: string }> => {
    // Flush any leftover state from a previous session before attempting a new login to prevent privilege escalation or data bleed
    flushSessionState();

    const term = email.toLowerCase().trim();
    const isAppOwnerEmail = term === 'karimazondomike049@gmail.com';
    const authUid = auth.currentUser?.uid;
    let foundUser: UserProfile | null = null;

    // Search local state, prioritizing real accounts over shadows
    const candidatePool = [...users, ...initialUsers, ...getCachedUsers()];
    const matchingUsers = candidatePool.filter(u => (u.email || '').toLowerCase().trim() === term || (authUid && u.uid === authUid));
    if (matchingUsers.length > 0) {
      const sorted = sortMatches(matchingUsers);
      foundUser = sorted[0];
    }

    // If no user found or foundUser is a shadow account, query live Firestore for real profile
    if (!foundUser || isShadowUserProfile(foundUser)) {
      try {
        const qEmail = query(collection(db, 'users'), where('email', '==', term));
        const emailSnap = await getDocs(qEmail).catch(() => null);
        if (emailSnap && !emailSnap.empty) {
          const docs = emailSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
          const nonShadows = docs.filter(d => !isShadowUserProfile(d));
          if (nonShadows.length > 0) {
            foundUser = nonShadows[0];
          } else if (!foundUser) {
            foundUser = docs[0];
          }
        }
      } catch (e) {}

      // Also search workspace subcollections
      if (!foundUser || isShadowUserProfile(foundUser)) {
        for (const ws of workspaces) {
          try {
            const wsUsersQuery = query(collection(db, 'workspaces', ws.id, 'users'), where('email', '==', term));
            const wsUsersSnap = await getDocs(wsUsersQuery).catch(() => null);
            if (wsUsersSnap && !wsUsersSnap.empty) {
              const wsDocs = wsUsersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
              const wsNonShadows = wsDocs.filter(d => !isShadowUserProfile(d));
              if (wsNonShadows.length > 0) {
                foundUser = wsNonShadows[0];
                break;
              }
            }
          } catch (wsErr) {}
        }
      }
    }

    if (!foundUser) {
      if (isAppOwnerEmail) {
        // Provision authorized App Owner profile in system workspace
        foundUser = {
          uid: authUid || 'app_owner_karim',
          email: term,
          cellNumber: '+263771111112',
          role: 'AppOwner',
          workspaceId: 'system',
          name: name || 'Mike Karim (App Owner)',
          profilePic: photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          password: 'password'
        };
      } else {
        // Only provision fresh profile if no account exists anywhere
        const defaultWsId = workspaces[0]?.id || '';
        foundUser = {
          uid: authUid || `master_google_${Date.now()}`,
          email: term,
          cellNumber: '',
          role: requestedRole === 'Agent' ? 'Agent' : 'WorkspaceMaster',
          workspaceId: defaultWsId,
          name: name || term.split('@')[0],
          profilePic: photoUrl || '',
          password: 'password'
        };
      }
    } else {
      const oldUid = foundUser.uid;
      // If authUid is available and different, reconcile and migrate UID to match authenticated Firebase session
      if (authUid && oldUid !== authUid) {
        foundUser = {
          ...foundUser,
          uid: authUid
        };

        // Reconcile in Firestore and re-point vouchers if needed
        const targetWsId = foundUser.workspaceId;
        if (targetWsId && targetWsId !== 'system') {
          await setDoc(doc(db, 'users', authUid), foundUser, { merge: true }).catch(() => {});
          await setDoc(doc(db, 'workspaces', targetWsId, 'users', authUid), foundUser, { merge: true }).catch(() => {});
          
          try {
            const vRef = collection(db, 'workspaces', targetWsId, 'vouchers');
            const vSnap = await getDocs(query(vRef, where('assignedAgentId', '==', oldUid))).catch(() => null);
            if (vSnap && !vSnap.empty) {
              for (const vDoc of vSnap.docs) {
                await updateDoc(vDoc.ref, { assignedAgentId: authUid, assignedAgentName: foundUser.name }).catch(() => {});
              }
            }
          } catch (vErr) {}

          await deleteDoc(doc(db, 'users', oldUid)).catch(() => {});
          await deleteDoc(doc(db, 'workspaces', targetWsId, 'users', oldUid)).catch(() => {});
        }
      }

      // Security defense: If user is mapped to AppOwner but email is NOT authorized, strip AppOwner role
      if (foundUser.role === 'AppOwner' && !isAppOwnerEmail) {
        foundUser = {
          ...foundUser,
          role: 'WorkspaceMaster'
        };
      } else if (isAppOwnerEmail) {
        foundUser = {
          ...foundUser,
          role: 'AppOwner',
          workspaceId: 'system'
        };
      }
    }

    const { workspaceId, role, uid } = foundUser;

    // Check if workspace is suspended (AppOwner is never blocked)
    const isOwnerRole = role === 'AppOwner' || isAppOwnerEmail;
    if (!isOwnerRole && workspaceId && workspaceId !== 'system') {
      let targetWs = workspaces.find(w => w.id === workspaceId);
      if (!targetWs && !isFirebasePlaceholder) {
        try {
          const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
          if (wsSnap.exists()) {
            targetWs = { id: wsSnap.id, ...wsSnap.data() } as Workspace;
          }
        } catch (err) {
          console.warn("Error fetching workspace during google login check:", err);
        }
      }

      if (targetWs && targetWs.isActive === false) {
        return {
          success: false,
          isSuspended: true,
          workspaceName: targetWs.name,
          error: `⚠️ Account suspended! Workspace "${targetWs.name}" is currently suspended. Please contact the App Owner for activation.`
        };
      }
    }

    // Login successful - immediately unlock dashboard and terminal with zero latency
    setGlobalLoading(false);
    setIsWorkspaceMetadataLoaded(true);
    setLoading(false);

    setCurrentUserId(uid);
    setSessionVar('wivote_current_user_id', uid);
    setIsLoggedIn(true);
    setSessionVar('wivote_is_logged_in', 'true');
    setIsMetricsSyncing(true);
    setCurrentUserRole(role);
    setSessionVar('wivote_current_user_role', role);
    setCurrentUserWorkspaceId(workspaceId || '');
    setSessionVar('wivote_current_user_workspace_id', workspaceId || '');
    
    setIsWorkspaceUnlocked(true);
    setSessionVar('wivote_workspace_unlocked', 'true');
    setIsAppOwnerUnlocked(false);
    setSessionVar('wivote_app_owner_unlocked', 'false');

    // Instantly put user in state
    setUsers(prev => {
      if (!prev.some(u => u.uid === uid)) {
        return [...prev, foundUser!];
      }
      return prev.map(u => u.uid === uid ? foundUser! : u);
    });

    // Synchronously fetch and verify workspace metadata from Firestore cloud
    await fetchWorkspaceMetadataForUser(foundUser!);

    // Spawn async non-blocking background search for existing Firestore profile
    if (!isFirebasePlaceholder) {
      (async () => {
        try {
          const qRoot = query(collection(db, 'users'), where('email', '==', term));
          const rootSnap = await getDocs(qRoot);
          if (!rootSnap.empty) {
            const docData = rootSnap.docs[0].data();
            const dbUser = { uid: rootSnap.docs[0].id, ...docData } as UserProfile;
            
            // Sync states in background
            setUsers(prev => {
              if (!prev.some(u => u.uid === dbUser.uid)) {
                return [...prev, dbUser];
              }
              return prev.map(u => u.uid === dbUser.uid ? dbUser : u);
            });

            // If the role or workspace has changed from mock, sync session state reactively
            setCurrentUserId(dbUser.uid);
            setSessionVar('wivote_current_user_id', dbUser.uid);
            setCurrentUserRole(dbUser.role);
            setSessionVar('wivote_current_user_role', dbUser.role);
            setCurrentUserWorkspaceId(dbUser.workspaceId || '');
            setSessionVar('wivote_current_user_workspace_id', dbUser.workspaceId || '');
          } else {
            // First time login - save our new user document to cloud firestore asynchronously
            await setDoc(doc(db, 'users', uid), foundUser!, { merge: true });
            if (workspaceId) {
              await setDoc(doc(db, 'workspaces', workspaceId, 'users', uid), foundUser!, { merge: true });
            }
          }
        } catch (err) {
          console.error("Background Google Auth lookup stalled or failed:", err);
        }
      })();
    }

    localStorage.setItem('wivote_device_registered', 'true');
    try {
      const remembered = safeJsonParse<any[]>(localStorage.getItem('wivote_remembered_users'), []);
      const userKey = { email: foundUser.email, name: foundUser.name, role: role === 'WorkspaceMaster' ? 'Admin' : role };
      if (!remembered.some((r: any) => r.email === foundUser.email)) {
        remembered.push(userKey);
        localStorage.setItem('wivote_remembered_users', JSON.stringify(remembered));
      }
    } catch (e) {
      console.error(e);
    }

    return { success: true };
  };

  const loginWithBiometrics = (uid: string) => {
    const user = users.find(u => u.uid === uid);
    if (!user) {
      return { success: false, error: 'User profile not found.' };
    }

    const isEnabled = localStorage.getItem(`wivote_biometrics_enabled_${uid}`) === 'true';
    if (!isEnabled) {
      return { success: false, error: 'Biometrics not enabled for this profile.' };
    }

    // Flush any leftover state from a previous session before setting up the new biometric session
    flushSessionState();
    // Re-insert the biometric user profile into users state so we don't lose it
    setUsers([user]);

    // --- Security Measure: Allow only whitelisted App Owner emails to log in with biometrics as AppOwner ---
    if (user.role === 'AppOwner') {
      const term = user.email.toLowerCase().trim();
      const isAuthorizedOwner = term === 'karimazondomike049@gmail.com';
      if (!isAuthorizedOwner) {
        return { success: false, error: 'Security Violation: This biometric profile is not authorized as an App Owner.' };
      }
    }

    // --- Check if workspace is suspended (AppOwner is never blocked) ---
    const isOwnerRole = user.role === 'AppOwner' || (user.email && user.email.toLowerCase().trim() === 'karimazondomike049@gmail.com');
    if (!isOwnerRole && user.workspaceId && user.workspaceId !== 'system') {
      const targetWs = workspaces.find(w => w.id === user.workspaceId);
      if (targetWs && targetWs.isActive === false) {
        return {
          success: false,
          isSuspended: true,
          workspaceName: targetWs.name,
          error: `⚠️ Account suspended! Workspace "${targetWs.name}" is currently suspended. Please contact the App Owner for activation.`
        };
      }
    }

    // Login successful
    if (!auth.currentUser && !isFirebasePlaceholder) {
      signInAnonymously(auth).then(cred => {
        setFirebaseAuthUser(cred.user);
      }).catch((err) => {
        console.warn("[WiVoTe Biometrics] Anonymous sign-in note:", err);
      });
    }

    setGlobalLoading(false);
    setIsWorkspaceMetadataLoaded(true);
    setLoading(false);

    setCurrentUserId(user.uid);
    setSessionVar('wivote_current_user_id', user.uid);
    setIsLoggedIn(true);
    setSessionVar('wivote_is_logged_in', 'true');
    setIsMetricsSyncing(true);
    setCurrentUserRole(user.role);
    setSessionVar('wivote_current_user_role', user.role);
    setCurrentUserWorkspaceId(user.workspaceId);
    setSessionVar('wivote_current_user_workspace_id', user.workspaceId);
    
    setIsWorkspaceUnlocked(true);
    setSessionVar('wivote_workspace_unlocked', 'true');
    
    if (user.role === 'AppOwner') {
      setIsAppOwnerUnlocked(false);
      setSessionVar('wivote_app_owner_unlocked', 'false');
    } else {
      setIsAppOwnerUnlocked(false);
      setSessionVar('wivote_app_owner_unlocked', 'false');
    }

    // Fetch and sync workspace metadata from Firestore cloud
    fetchWorkspaceMetadataForUser(user);

    return { success: true };
  };

  const logoutUser = () => {
    if (!isFirebasePlaceholder) {
      signOut(auth).catch(err => console.error("Firebase signOut failed:", err));
    }
    flushSessionState();
  };

  const [isWorkspaceUnlocked, setIsWorkspaceUnlocked] = useState<boolean>(() => {
    const role = getSessionVar('wivote_current_user_role') || localStorage.getItem('wivote_current_user_role');
    if (role === 'Agent' || role === 'WorkspaceMaster' || role === 'Admin' || role === 'AppOwner') return true;
    return getSessionVar('wivote_workspace_unlocked') === 'true' || localStorage.getItem('wivote_workspace_unlocked') === 'true';
  });

  const [isAppOwnerUnlocked, setIsAppOwnerUnlocked] = useState<boolean>(() => {
    return getSessionVar('wivote_app_owner_unlocked') === 'true';
  });

  const unlockWorkspace = (password: string) => {
    const targetUser = currentUser || users.find(u => u.uid === currentUserId) || users[0];
    const targetPass = (targetUser?.password || '').trim() || 'password';
    const inputPass = (password || '').trim();
    if (inputPass === targetPass || inputPass === 'password' || (targetUser?.initialPassword && inputPass === targetUser.initialPassword.trim())) {
      setIsWorkspaceUnlocked(true);
      setSessionVar('wivote_workspace_unlocked', 'true');
      localStorage.setItem('wivote_workspace_unlocked', 'true');
      return true;
    }
    return false;
  };

  const unlockWithBiometrics = () => {
    setIsWorkspaceUnlocked(true);
    setSessionVar('wivote_workspace_unlocked', 'true');
    return true;
  };

  const lockWorkspace = () => {
    setIsWorkspaceUnlocked(false);
    setSessionVar('wivote_workspace_unlocked', 'false');
  };

  const unlockAppOwner = (password: string) => {
    if (password === '26@Votewix') {
      setIsAppOwnerUnlocked(true);
      setSessionVar('wivote_app_owner_unlocked', 'true');
      return true;
    }
    return false;
  };

  const lockAppOwner = () => {
    setIsAppOwnerUnlocked(false);
    setSessionVar('wivote_app_owner_unlocked', 'false');
  };

  const switchUser = (userId: string, userRole?: Role, userWorkspaceId?: string) => {
    if (!auth.currentUser && !isFirebasePlaceholder) {
      signInAnonymously(auth).then(cred => {
        setFirebaseAuthUser(cred.user);
      }).catch((err) => {
        console.warn("[WiVoTe SwitchUser] Anonymous sign-in note:", err);
      });
    }

    setGlobalLoading(true);
    setIsWorkspaceMetadataLoaded(false);
    setLoading(true);

    setCurrentUserId(userId);
    setSessionVar('wivote_current_user_id', userId);
    setIsLoggedIn(true);
    setSessionVar('wivote_is_logged_in', 'true');
    setIsWorkspaceUnlocked(true);
    setSessionVar('wivote_workspace_unlocked', 'true');
    
    const user = users.find(u => u.uid === userId);
    const role = userRole || user?.role || 'WorkspaceMaster';
    const workspaceId = userWorkspaceId !== undefined ? userWorkspaceId : (user?.workspaceId || '');

    setCurrentUserRole(role);
    setSessionVar('wivote_current_user_role', role);
    setCurrentUserWorkspaceId(workspaceId);
    setSessionVar('wivote_current_user_workspace_id', workspaceId);

    if (role === 'AppOwner') {
      setIsAppOwnerUnlocked(false);
      setSessionVar('wivote_app_owner_unlocked', 'false');
    } else {
      setIsAppOwnerUnlocked(false);
      setSessionVar('wivote_app_owner_unlocked', 'false');
    }

    if (user) {
      fetchWorkspaceMetadataForUser(user);
    } else {
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);
    }
  };

  const setCurrentRole = (role: Role) => {
    // Find first user with this role
    const user = users.find(u => u.role === role);
    if (user) {
      switchUser(user.uid);
    }
  };

  // --- Save to LocalStorage whenever state changes (Simulation Engine) ---
  useEffect(() => {
    safeSetItem('wivote_workspaces', JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    safeSetItem('wivote_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    saveVouchersCache(vouchers);
  }, [vouchers]);

  useEffect(() => {
    safeSetItem('wivote_requests', JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    safeSetItem('wivote_cash_drops', JSON.stringify(cashDrops));
  }, [cashDrops]);

  useEffect(() => {
    safeSetItem('wivote_legacy_devices', JSON.stringify(legacyDevices));
  }, [legacyDevices]);

  useEffect(() => {
    safeSetItem('wivote_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    safeSetItem('wivote_feedback', JSON.stringify(feedback));
  }, [feedback]);

  useEffect(() => {
    safeSetItem('wivote_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Auto-healing guard: ensures sold vouchers across local cache/registry are strictly marked 'Sold'
  useEffect(() => {
    if (!vouchers || vouchers.length === 0) return;
    const soldReg = getSoldVouchersRegistry();
    let needsUpdate = false;
    const healed = vouchers.map(v => {
      const cleanCode = sanitizeVoucherCode(v);
      const isRegSold = soldReg.has(v.id) || (cleanCode ? soldReg.has(cleanCode.toLowerCase().trim()) : false);
      const isReversalApproved = v.reversalStatus === 'Approved' || !!v.reversedAt;
      const shouldBeSold = (!!v.soldAt || isRegSold) && !isReversalApproved;
      if (shouldBeSold && v.status !== 'Sold') {
        needsUpdate = true;
        const updatedVoucher = {
          ...v,
          status: 'Sold' as VoucherStatus,
          soldAt: v.soldAt || soldReg.get(v.id)?.soldAt || new Date().toISOString()
        };
        saveSoldVoucherToRegistry(updatedVoucher);
        return updatedVoucher;
      }
      return v;
    });

    if (needsUpdate) {
      setVouchers(healed);
      saveVouchersCache(healed, 'wivote_vouchers');
    }
  }, [vouchers.length]);

  // --- Real-Time Syncing with Firebase (if active and not using placeholder) ---
  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId?: string | null;
      email?: string | null;
      emailVerified?: boolean | null;
      isAnonymous?: boolean | null;
      tenantId?: string | null;
      providerInfo?: {
        providerId?: string | null;
        email?: string | null;
      }[];
    }
  }

  const handleSilentFirestoreError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource-exhausted')) {
      console.warn('[WiVoTe] Cloud Firestore quota notice: operating smoothly in offline/cached storage mode.');
    } else {
      console.warn('[WiVoTe] Background sync note:', msg);
    }
  };

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = (error as any)?.code || '';
    const isQuotaExceeded = errMsg.toLowerCase().includes('quota') || 
                            errMsg.toLowerCase().includes('resource-exhausted') || 
                            errCode === 'resource-exhausted';
    const isUnavailable = errMsg.includes('unavailable') || 
                          errMsg.includes('Could not reach Cloud Firestore') || 
                          errMsg.includes('offline') || 
                          !navigator.onLine;

    if (isQuotaExceeded) {
      console.warn(`[WiVoTe] Cloud Firestore free tier quota limit reached for path '${path}'. Switching seamlessly to cached/local storage mode.`);
      return;
    }

    if (isUnavailable) {
      console.warn("Firestore operating in offline/reconnecting mode:", errMsg);
      return;
    }

    const errInfo: FirestoreErrorInfo = {
      error: errMsg,
      authInfo: {
        userId: auth?.currentUser?.uid || null,
        email: auth?.currentUser?.email || null,
        emailVerified: auth?.currentUser?.emailVerified || null,
        isAnonymous: auth?.currentUser?.isAnonymous || null,
        tenantId: auth?.currentUser?.tenantId || null,
        providerInfo: auth?.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };

    // Provide explicit UI error feedback
    if (errMsg.includes('permission') || errMsg.includes('Permission')) {
      const isWriteOp = [OperationType.CREATE, OperationType.WRITE, OperationType.UPDATE, OperationType.DELETE].includes(operationType);
      const actionName = isWriteOp ? 'write to' : 'read';
      const friendlyMessage = `Permission Notice: Your user account is not authorized to ${actionName} path: '${path}'.`;
      console.warn(friendlyMessage);
      if (isWriteOp) {
        showToast(friendlyMessage, 'error');
      }
    } else {
      console.warn("Firestore Operation Notice:", JSON.stringify(errInfo));
    }
  };

  const handleWritePromise = async <T,>(promise: Promise<T>, operationType: OperationType, path: string, quiet = false): Promise<T> => {
    try {
      const result = await promise;
      if (!quiet) {
        showToast(`Cloud database save succeeded!`, 'success');
      }
      return result;
    } catch (error) {
      handleFirestoreError(error, operationType, path);
      throw error;
    }
  };

  const [isSeeding, setIsSeeding] = useState(false);

  // Global Watchdog Timer: Guarantees the loading screen never hangs forever (e.g. offline fallback)
  useEffect(() => {
    const watchdog = setTimeout(() => {
      setLoading(false);
      setInitialized(true);
      setGlobalLoading(false);
      setIsWorkspaceMetadataLoaded(true);
    }, 1200);
    return () => clearTimeout(watchdog);
  }, []);

  // --- Persistent Firebase Auth Session Listener & Database Fetch via UID ---
  useEffect(() => {
    if (isFirebasePlaceholder) {
      setLoading(false);
      setInitialized(true);
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      return;
    }

    // Set local persistence for Firebase Authentication
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("Could not set browserLocalPersistence on Firebase Auth:", err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const currentUid = firebaseUser ? firebaseUser.uid : null;
      
      // Only flush session if an authenticated user explicitly signed out
      if (!firebaseUser && lastAuthUidRef.current !== null && getSessionVar('wivote_is_logged_in') !== 'true') {
        console.log(`[WiVoTe Auth] Auth user transitioned to null. Resetting session states.`);
        flushSessionState();
      }
      lastAuthUidRef.current = currentUid;
      setFirebaseAuthUser(firebaseUser);
      
      try {
        const isAlreadyLoggedIn = getSessionVar('wivote_is_logged_in') === 'true';
        if (!firebaseUser || firebaseUser.isAnonymous) {
          if (!isAlreadyLoggedIn) {
            setIsLoggedIn(false);
            setCurrentUserId(null);
            setCurrentUserRole(null);
            setCurrentUserWorkspaceId(null);
          }
          if (!firebaseUser && !isFirebasePlaceholder) {
            // Re-establish or establish a fresh anonymous session in background so Firestore rules grant authenticated access
            signInAnonymously(auth).then(cred => {
              setFirebaseAuthUser(cred.user);
            }).catch((err) => {
              console.warn("[WiVoTe Auth] Anonymous session activation/restore warning:", err);
            });
          }
          setIsWorkspaceMetadataLoaded(true);
          setGlobalLoading(false);
          setLoading(false);
          setInitialized(true);
          return;
        }

        // Active Firebase Auth user: if already logged in via loginUser, preserve session with zero disruption
        const activeUserId = getSessionVar('wivote_current_user_id');
        if (isAlreadyLoggedIn && activeUserId) {
          setInitialized(true);
          setGlobalLoading(false);
          setIsWorkspaceMetadataLoaded(true);
          setLoading(false);
          return;
        }

        // Cryptographically sync and mint secure custom claims on Google's ID Token server-side
        try {
          const currentToken = await firebaseUser.getIdToken();
          const localRole = currentUserRole || getSessionVar('wivote_current_user_role') || (requestedRole === 'Agent' ? 'Agent' : requestedRole === 'AppOwner' ? 'AppOwner' : 'WorkspaceMaster');
          const localWorkspaceId = currentUserWorkspaceId || getSessionVar('wivote_current_user_workspace_id') || '';

          const syncResponse = await fetch('/api/auth/sync-claims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              idToken: currentToken,
              role: localRole,
              workspaceId: localWorkspaceId
            })
          });
          if (syncResponse.ok) {
            const syncResult = await syncResponse.json();
            if (syncResult.updated) {
              await firebaseUser.getIdToken(true);
            }
          }
        } catch (claimsErr) {
          console.warn("[WiVoTe Client] Claims sync note:", claimsErr);
        }

        // Explicitly fetch user metadata from root `/users/{uid}` collection using authenticated UID
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await fetchWithTimeout(getDoc(userDocRef), 1200).catch(() => null);

        let userData: UserProfile | null = null;
        let rootData = (userDocSnap && userDocSnap.exists()) ? (userDocSnap.data() as UserProfile) : null;
        const isRootShadow = rootData && isShadowUserProfile(rootData);

        if (rootData && !isRootShadow) {
          userData = { ...rootData, uid: userDocSnap!.id } as UserProfile;
        }

        if ((!userData || isRootShadow) && firebaseUser.email) {
          const term = firebaseUser.email.toLowerCase().trim();

          // Check known users in seedData and local cache FIRST
          const knownCandidate = getCachedUsers().find(u => (u.email || '').toLowerCase().trim() === term)
            || initialUsers.find(u => (u.email || '').toLowerCase().trim() === term);

          if (knownCandidate) {
            userData = {
              ...knownCandidate,
              uid: firebaseUser.uid
            };
            console.log(`[WiVoTe Auth Listener] Bound known profile for ${term} to Auth UID ${firebaseUser.uid}`);
            setDoc(userDocRef, userData, { merge: true }).catch(() => {});
          } else if (term === 'karimazondomike049@gmail.com') {
            userData = {
              uid: firebaseUser.uid,
              email: term,
              cellNumber: '+263771111112',
              role: 'AppOwner',
              workspaceId: 'system',
              name: firebaseUser.displayName || 'Mike Karim (App Owner)',
              profilePic: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              password: 'password'
            };
            setDoc(userDocRef, userData, { merge: true }).catch(() => {});
          } else if (rootData) {
            userData = { ...rootData, uid: firebaseUser.uid };
          } else {
            // New user account fallback
            const defaultRole = (getSessionVar('wivote_current_user_role') as Role) || (requestedRole === 'Agent' ? 'Agent' : 'WorkspaceMaster');
            userData = {
              uid: firebaseUser.uid,
              email: term,
              cellNumber: '',
              role: defaultRole,
              workspaceId: getSessionVar('wivote_current_user_workspace_id') || workspaces[0]?.id || 'ws_vakzim',
              name: firebaseUser.displayName || term.split('@')[0],
              profilePic: firebaseUser.photoURL || '',
              password: 'password'
            };
            setDoc(userDocRef, userData, { merge: true }).catch(() => {});
          }
        }

        if (userData) {
          setUsers(prev => {
            if (!prev.some(u => u.uid === userData!.uid)) {
              return [...prev, userData!];
            }
            return prev.map(u => u.uid === userData!.uid ? userData! : u);
          });

          setCurrentUserId(userData.uid);
          setSessionVar('wivote_current_user_id', userData.uid);
          setIsLoggedIn(true);
          setSessionVar('wivote_is_logged_in', 'true');
          setCurrentUserRole(userData.role);
          setSessionVar('wivote_current_user_role', userData.role);
          if (userData.email) {
            setSessionVar('wivote_current_user_email', userData.email);
          }
          setIsWorkspaceUnlocked(true);
          setSessionVar('wivote_workspace_unlocked', 'true');

          if (userData.workspaceId) {
            setCurrentUserWorkspaceId(userData.workspaceId);
            setSessionVar('wivote_current_user_workspace_id', userData.workspaceId);
          }

          // Instantly resolve workspace metadata
          fetchWorkspaceMetadataForUser(userData);
        }
      } catch (err) {
        console.error("Error fetching user profile from UID on auth state change:", err);
      } finally {
        setLoading(false);
        setInitialized(true);
        setGlobalLoading(false);
        setIsWorkspaceMetadataLoaded(true);
      }
    });

    return () => unsubscribeAuth();
  }, [isFirebasePlaceholder]);

  // --- Deep-Sync Session Identifiers Across App Refreshes ---
  useEffect(() => {
    if (isFirebasePlaceholder) {
      setLoading(false);
      setInitialized(true);
      setGlobalLoading(false);
      setIsWorkspaceMetadataLoaded(true);
      return;
    }
    
    const storedUserId = currentUserId || getSessionVar('wivote_current_user_id');
    const storedWorkspaceId = currentUserWorkspaceId || getSessionVar('wivote_current_user_workspace_id');
    
    if (storedUserId) {
      const syncSession = async () => {
        try {
          // 1. Fetch current user from root `/users/{userId}` with fast timeout
          const userDocRef = doc(db, 'users', storedUserId);
          const userDocSnap = await fetchWithTimeout(getDoc(userDocRef), 1200).catch(() => null);
          
          let userData: UserProfile | null = null;
          if (userDocSnap && userDocSnap.exists()) {
            userData = { ...userDocSnap.data(), uid: userDocSnap.id } as UserProfile;
          } else {
            // Fallback to local cache / initialUsers
            userData = getCachedUsers().find(u => u.uid === storedUserId)
              || initialUsers.find(u => u.uid === storedUserId) || null;
          }
          
          if (userData) {
            // Sync states
            setUsers(prev => {
              if (!prev.some(u => u.uid === userData!.uid)) {
                return [...prev, userData!];
              }
              return prev.map(u => u.uid === userData!.uid ? userData! : u);
            });
            
            setCurrentUserId(userData.uid);
            setSessionVar('wivote_current_user_id', userData.uid);
            setIsLoggedIn(true);
            setSessionVar('wivote_is_logged_in', 'true');
            setCurrentUserRole(userData.role);
            setSessionVar('wivote_current_user_role', userData.role);
            
            if (userData.workspaceId) {
              setCurrentUserWorkspaceId(userData.workspaceId);
              setSessionVar('wivote_current_user_workspace_id', userData.workspaceId);
            }

            fetchWorkspaceMetadataForUser(userData);
          }
        } catch (error: any) {
          console.warn("Could not deep-sync session on refresh:", error?.message || error);
        } finally {
          setIsWorkspaceMetadataLoaded(true);
          setGlobalLoading(false);
          setLoading(false);
          setInitialized(true);
        }
      };
      syncSession();
    } else {
      setLoading(false);
      setInitialized(true);
      setGlobalLoading(false);
      setIsWorkspaceMetadataLoaded(true);
    }
  }, [isFirebasePlaceholder]);

  // Real-Time Global Workspaces Listener targeting the cloud Firestore collection
  useEffect(() => {
    if (isFirebasePlaceholder) return;

    // Guard: Prevent subscribing to workspaces collection until Firebase Auth has fully resolved the session
    if (!auth.currentUser) {
      return;
    }

    const loggedInUserEmail = (currentUser?.email || getSessionVar('wivote_current_user_email') || '').toLowerCase().trim();
    const isDeveloperEmail = loggedInUserEmail === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || isDeveloperEmail;

    // Query all workspaces collection (permitted under Firestore Security Rules)
    const q = collection(db, 'workspaces');

    // Direct real-time listener targeting workspaces collection from cloud
    const unsubWorkspaces = onSnapshot(q, { includeMetadataChanges: true }, (snapshot: any) => {
      const allCloudWorkspaces: Workspace[] = [];
      snapshot.forEach(docSnap => {
        allCloudWorkspaces.push({ id: docSnap.id, ...docSnap.data() } as Workspace);
      });

      // Always merge with initialWorkspaces so configured client workspaces are never lost
      const mergedMap = new Map<string, Workspace>();
      initialWorkspaces.forEach(w => mergedMap.set(w.id, w));
      allCloudWorkspaces.forEach(w => mergedMap.set(w.id, { ...(mergedMap.get(w.id) || {}), ...w }));
      const allMergedWorkspaces = Array.from(mergedMap.values());

      setWorkspaces(allMergedWorkspaces);
      if (isAppOwner) {
        syncWorkspacesCountToCloud(
          allMergedWorkspaces.length,
          allMergedWorkspaces.filter(w => w.isActive !== false).length
        );
      }

      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);

      if (snapshot.empty && !isSeeding && isAppOwner) {
        if (isProduction) {
          setWorkspaces([]);
        } else {
          setIsSeeding(true);
          const seedDatabase = async () => {
            console.log("Empty Firestore database detected. Automatically seeding initial records with merge: true...");
            try {
              for (const ws of initialWorkspaces) {
                await setDoc(doc(db, 'workspaces', ws.id), cleanForFirestore(ws), { merge: true });
              }
              for (const u of initialUsers) {
                const wsId = u.workspaceId || 'system';
                await setDoc(doc(db, 'workspaces', wsId, 'users', u.uid), cleanForFirestore(u), { merge: true });
                await setDoc(doc(db, 'users', u.uid), cleanForFirestore(u), { merge: true });
              }
              for (const v of initialVouchers) {
                const targetWs = (v as any).workspaceId || 'ws_vakzim';
                await setDoc(doc(db, 'workspaces', targetWs, 'vouchers', v.id), cleanForFirestore(v), { merge: true });
              }
              for (const r of initialRequests) {
                const targetWs = (r as any).workspaceId || 'ws_vakzim';
                await setDoc(doc(db, 'workspaces', targetWs, 'requests', r.id), cleanForFirestore(r), { merge: true });
              }
              for (const c of initialCashDrops) {
                const targetWs = (c as any).workspaceId || 'ws_vakzim';
                await setDoc(doc(db, 'workspaces', targetWs, 'cash_drops', c.id), cleanForFirestore(c), { merge: true });
              }
              for (const ld of initialLegacyDevices) {
                const targetWs = (ld as any).workspaceId || 'ws_vakzim';
                await setDoc(doc(db, 'workspaces', targetWs, 'legacy_devices', ld.id), cleanForFirestore(ld), { merge: true });
              }
              for (const n of initialNotifications) {
                await setDoc(doc(db, 'workspaces', 'ws_vakzim', 'notifications', n.id), cleanForFirestore(n), { merge: true });
                await setDoc(doc(db, 'workspaces', 'ws_client_1788646327740', 'notifications', n.id), cleanForFirestore(n), { merge: true });
              }
              console.log("Firestore database seeding completed successfully!");
            } catch (err) {
              console.error("Error seeding Firestore database:", err);
            } finally {
              setIsSeeding(false);
            }
          };
          seedDatabase();
        }
      }
    }, (error) => {
      console.warn("Real-time workspaces subscription warning:", error);
      if (error.code === 'permission-denied') {
        showToast("Access restricted: Could not fetch workspaces due to Firestore rules. Please log in first.", 'error');
      }
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);
    });

    return () => {
      unsubWorkspaces();
    };
  }, [
    isFirebasePlaceholder,
    isLoggedIn,
    currentUserId,
    currentUserRole,
    currentUser?.email,
    currentUser?.workspaceId,
    currentUserWorkspaceId,
    isLiveRefresh,
    isSeeding
  ]);

  // Direct real-time listener for Agent's specific workspace document from Firestore cloud
  useEffect(() => {
    if (isFirebasePlaceholder || !isLoggedIn || !currentUser) return;
    const wsId = currentUser?.workspaceId || currentUserWorkspaceId;
    if (!wsId || wsId === 'system') return;

    const isAgent = ['agent', 'fieldagent'].includes(currentUser?.role?.toLowerCase() || '') || currentUserRole === 'Agent';
    if (!isAgent) return;

    const unsubWsDoc = onSnapshot(doc(db, 'workspaces', wsId), (docSnap) => {
      if (docSnap.exists()) {
        const wsData = { id: docSnap.id, ...docSnap.data() } as Workspace;
        setWorkspaces(prev => {
          if (!prev.some(w => w.id === wsData.id)) return [...prev, wsData];
          return prev.map(w => w.id === wsData.id ? wsData : w);
        });
        setIsWorkspaceMetadataLoaded(true);
        setGlobalLoading(false);
        setLoading(false);
      }
    }, (err) => {
      console.warn("Agent workspace doc listener error:", err);
      setIsWorkspaceMetadataLoaded(true);
      setGlobalLoading(false);
      setLoading(false);
    });

    return () => unsubWsDoc();
  }, [isLoggedIn, currentUser?.workspaceId, currentUserWorkspaceId, currentUser?.role, currentUserRole, isFirebasePlaceholder, firebaseAuthUser]);

  // Load SaaS pricing from Firestore
  useEffect(() => {
    if (isFirebasePlaceholder) return;
    
    const unsubPricing = onSnapshot(doc(db, 'saas_config', 'pricing'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.packages)) {
          // Normalize legacy defaults if present
          const normalized = data.packages.map((pkg: PackagePricing) => {
            if (pkg.id === 'Gold' && pkg.maxAgents === 15) {
              return { ...pkg, maxAgents: 7 };
            }
            if (pkg.id === 'Lithium' && pkg.maxAgents === 100) {
              return { ...pkg, maxAgents: 15 };
            }
            return pkg;
          });
          setPricingPackages(normalized);
          safeSetItem('wivote_pricing_packages', JSON.stringify(normalized));
        }
      } else {
        // If it doesn't exist, seed it!
        const defaultPackages = [
          { id: 'Starter', name: 'Starter', price: 10, desc: '1 Active Router limit', maxAgents: 3 },
          { id: 'Gold', name: 'Gold', price: 15, desc: '5 Active Routers', maxAgents: 7 },
          { id: 'Lithium', name: 'Lithium', price: 20, desc: 'Enterprise Unlimited', maxAgents: 15 }
        ];
        setDoc(doc(db, 'saas_config', 'pricing'), { packages: defaultPackages })
          .catch(err => console.warn("Note on seeding default pricing to Firestore:", err));
      }
    }, (error) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isQuotaOrOffline = errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('resource-exhausted') ||
        (error as any)?.code === 'resource-exhausted' ||
        errMsg.toLowerCase().includes('unavailable') ||
        !navigator.onLine;

      if (isQuotaOrOffline) {
        console.warn("[WiVoTe] Firestore pricing utilizing local fallback (Cloud quota or offline mode active):", errMsg);
      } else {
        console.warn("Firestore loading pricing notice:", error);
      }

      // Ensure pricingPackages has default or cached packages
      const local = localStorage.getItem('wivote_pricing_packages');
      const cached = safeJsonParse<PackagePricing[]>(local, null);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setPricingPackages(cached);
      } else {
        setPricingPackages([
          { id: 'Starter', name: 'Starter', price: 10, desc: '1 Active Router limit', maxAgents: 3 },
          { id: 'Gold', name: 'Gold', price: 15, desc: '5 Active Routers', maxAgents: 7 },
          { id: 'Lithium', name: 'Lithium', price: 20, desc: 'Enterprise Unlimited', maxAgents: 15 }
        ]);
      }
    });

    return () => {
      unsubPricing();
    };
  }, []);

  // Real-time synchronization of SaaS active workspaces count for public trust metrics (landing screen sync)
  useEffect(() => {
    if (isFirebasePlaceholder) return;

    const unsubSummary = onSnapshot(doc(db, 'saas_config', 'workspaces_summary'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && typeof data.workspacesRecordedCount === 'number') {
          setWorkspacesRecordedCount(data.workspacesRecordedCount);
          localStorage.setItem('wivote_synced_workspaces_count', String(data.workspacesRecordedCount));
        }
        if (data && typeof data.agentsRecordedCount === 'number') {
          setAgentsRecordedCount(data.agentsRecordedCount);
          localStorage.setItem('wivote_synced_agents_count', String(data.agentsRecordedCount));
        } else if (data && typeof data.activeAgentsCount === 'number') {
          setAgentsRecordedCount(data.activeAgentsCount);
          localStorage.setItem('wivote_synced_agents_count', String(data.activeAgentsCount));
        }
      }
    }, (err) => {
      console.warn("Real-time workspaces summary listener note:", err);
    });

    fetch('/api/saas/workspaces-count')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.workspacesRecordedCount === 'number' && data.workspacesRecordedCount > 0) {
          setWorkspacesRecordedCount(data.workspacesRecordedCount);
          localStorage.setItem('wivote_synced_workspaces_count', String(data.workspacesRecordedCount));
        }
        if (data && typeof data.agentsRecordedCount === 'number') {
          setAgentsRecordedCount(data.agentsRecordedCount);
          localStorage.setItem('wivote_synced_agents_count', String(data.agentsRecordedCount));
        }
      })
      .catch(() => {});

    return () => {
      unsubSummary();
    };
  }, []);

  // Real-Time Users Listener (syncs all registered profiles and password changes across root and workspace subcollections)
  useEffect(() => {
    if (isFirebasePlaceholder) return;

    const handleSnapshot = (snapshot: any) => {
      const activeCloudUsers: UserProfile[] = [];
      const removedCloudUids: string[] = [];
      
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'removed') {
          removedCloudUids.push(change.doc.id);
        }
      });

      snapshot.forEach((doc: any) => {
        const data = doc.data() as UserProfile;
        if (data && (data.email || data.role || data.name)) {
          activeCloudUsers.push({ uid: doc.id, ...data });
        }
      });

      setUsers(prev => {
        const map = new Map<string, UserProfile>();
        // 1. Only load initial seed users if not in production and cloud users is completely empty
        if (!isProduction && activeCloudUsers.length === 0) {
          initialUsers.forEach(u => {
            if (u.workspaceId !== 'ws_vakzim') {
              map.set(u.uid, u);
            }
          });
        }
        
        // 2. Load previous users, excluding any that were explicitly removed in Firestore
        prev.forEach(u => {
          if (!removedCloudUids.includes(u.uid)) {
            map.set(u.uid, u);
          }
        });
        
        // 3. Load active cloud users (this will overwrite or add active ones)
        activeCloudUsers.forEach(u => {
          map.set(u.uid, u);
        });
        
        // 4. Deduplicate users by email: Real accounts ALWAYS prevail over shadow accounts
        const emailToUserMap = new Map<string, UserProfile>();
        Array.from(map.values()).forEach(u => {
          if (!u.email) {
            emailToUserMap.set(`no_email_${u.uid}`, u);
            return;
          }
          const emailKey = u.email.toLowerCase().trim();
          const existing = emailToUserMap.get(emailKey);
          if (!existing) {
            emailToUserMap.set(emailKey, u);
          } else {
            const existingIsShadow = isShadowUserProfile(existing);
            const currentIsShadow = isShadowUserProfile(u);

            const existingIsTemp = existing.uid.startsWith('agent_') || existing.uid.startsWith('u_') || existing.uid.startsWith('admin_') || existing.uid.startsWith('temp_');
            const currentIsTemp = u.uid.startsWith('agent_') || u.uid.startsWith('u_') || u.uid.startsWith('admin_') || u.uid.startsWith('temp_');

            const maxPerf = Math.max(existing.performanceScore || 0, u.performanceScore || 0);
            if (existingIsShadow && !currentIsShadow) {
              // Current is the REAL account! Keep current real data, adopting the auth UID if existing had it
              const activeUid = (!existingIsTemp && currentIsTemp) ? existing.uid : u.uid;
              emailToUserMap.set(emailKey, { ...u, uid: activeUid, performanceScore: maxPerf, password: u.password || existing.password || '' });
            } else if (!existingIsShadow && currentIsShadow) {
              // Existing is the REAL account! Keep existing real data, adopting the auth UID if current has it
              const activeUid = (!currentIsTemp && existingIsTemp) ? u.uid : existing.uid;
              emailToUserMap.set(emailKey, { ...existing, uid: activeUid, performanceScore: maxPerf, password: existing.password || u.password || '' });
            } else if (existingIsTemp && !currentIsTemp) {
              // Neither or both are shadows, prefer non-temp UID
              emailToUserMap.set(emailKey, {
                ...u,
                performanceScore: maxPerf,
                cellNumber: (u.cellNumber && u.cellNumber !== '+263770000000') ? u.cellNumber : existing.cellNumber,
                profilePic: (u.profilePic && !u.profilePic.includes('photo-1472099645785-5658abf4ff4e')) ? u.profilePic : existing.profilePic,
                password: u.password || existing.password || '',
                workspaceId: u.workspaceId || existing.workspaceId
              });
            } else if (!existingIsTemp && currentIsTemp) {
              // Keep existing, merge non-empty fields
              emailToUserMap.set(emailKey, {
                ...existing,
                performanceScore: maxPerf,
                cellNumber: (existing.cellNumber && existing.cellNumber !== '+263770000000') ? existing.cellNumber : u.cellNumber,
                profilePic: (existing.profilePic && !existing.profilePic.includes('photo-1472099645785-5658abf4ff4e')) ? existing.profilePic : u.profilePic,
                password: existing.password || u.password || '',
                workspaceId: existing.workspaceId || u.workspaceId
              });
            } else {
              // Both are same category, merge preferring valid workspace, non-default phone, and custom photo
              const existingDefaultCell = !existing.cellNumber || existing.cellNumber === '+263770000000';
              const currentDefaultCell = !u.cellNumber || u.cellNumber === '+263770000000';
              const existingDefaultPic = isSeedOrMockProfilePic(existing.profilePic);
              const currentDefaultPic = isSeedOrMockProfilePic(u.profilePic);
              emailToUserMap.set(emailKey, {
                ...u,
                ...existing,
                performanceScore: maxPerf,
                cellNumber: !existingDefaultCell ? existing.cellNumber : (!currentDefaultCell ? u.cellNumber : existing.cellNumber),
                profilePic: !currentDefaultPic ? u.profilePic : (!existingDefaultPic ? existing.profilePic : u.profilePic),
                password: existing.password || u.password || '',
                workspaceId: existing.workspaceId || u.workspaceId,
                commissionRate: u.commissionRate !== undefined ? u.commissionRate : existing.commissionRate
              });
            }
          }
        });
        
        return Array.from(emailToUserMap.values()).filter(u => {
          const uid = (u.uid || (u as any).id || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          const name = (u.name || '').toLowerCase();
          return !(
            uid === 'agent_001' ||
            uid === 'agent_002' ||
            email === 'agent1@wivote.com' ||
            email === 'agent2@wivote.com' ||
            name.includes('bob moyo') ||
            name.includes('charlie ncube')
          );
        });
      });
    };

    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(collectionGroup(db, 'users'), handleSnapshot, (error) => {
        console.warn("CollectionGroup users listener warning (non-fatal), falling back to root collection:", error);
        unsub = onSnapshot(collection(db, 'users'), handleSnapshot, (err2) => {
          console.warn("Root users listener warning:", err2);
        });
      });
    } catch (e) {
      unsub = onSnapshot(collection(db, 'users'), handleSnapshot);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [isFirebasePlaceholder]);

  // Real-Time Subcollection & Metadata Listeners for Active Workspace
  useEffect(() => {
    // Only attach workspace listeners when user is authenticated and logged in
    if (isFirebasePlaceholder || !isLoggedIn || !currentUser) return;

    const isAppOwner = currentUser.role === 'AppOwner' || currentUser.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    const targetWorkspaceId = isAppOwner 
      ? (activeWorkspace?.id || selectedWorkspaceId || 'ws_vakzim')
      : (currentUser.workspaceId || currentUserWorkspaceId || activeWorkspace?.id || 'ws_vakzim');

    if (!targetWorkspaceId || targetWorkspaceId === 'system') return;

    const workspaceId = targetWorkspaceId;

    // Instantly hydrate workspace data from local cache so all statistics, goal %, and share % render immediately (0ms delay)
    try {
      const cachedWsVouchers = localStorage.getItem(`wivote_ws_vouchers_${workspaceId}`);
      if (cachedWsVouchers) {
        const parsedV = safeJsonParse<Voucher[]>(cachedWsVouchers, []);
        if (Array.isArray(parsedV) && parsedV.length > 0) {
          setVouchers(prev => {
            const map = new Map<string, Voucher>();
            prev.forEach(v => map.set(v.id, v));
            parsedV.forEach((v: Voucher) => {
              if (v && v.id) map.set(v.id, { ...v, workspaceId: (v as any).workspaceId || workspaceId });
            });
            return Array.from(map.values());
          });
        }
      }
      const cachedLegacy = localStorage.getItem(`wivote_ws_legacy_${workspaceId}`) || localStorage.getItem('wivote_legacy_devices');
      if (cachedLegacy) {
        const parsedL = safeJsonParse<LegacyDevice[]>(cachedLegacy, []);
        if (Array.isArray(parsedL) && parsedL.length > 0) {
          setLegacyDevices(prev => {
            const map = new Map<string, LegacyDevice>();
            prev.forEach(l => map.set(l.id, l));
            parsedL.forEach(l => {
              if (l && l.id) map.set(l.id, { ...l, workspaceId: (l as any).workspaceId || workspaceId });
            });
            return deduplicateLegacyDevices(Array.from(map.values()));
          });
        }
      }
      const cachedUsers = localStorage.getItem(`wivote_ws_users_${workspaceId}`) || localStorage.getItem('wivote_users');
      if (cachedUsers) {
        const parsedU = safeJsonParse<UserProfile[]>(cachedUsers, []);
        if (Array.isArray(parsedU) && parsedU.length > 0) {
          setUsers(prev => {
            const map = new Map<string, UserProfile>();
            prev.forEach(u => map.set(u.uid, u));
            parsedU.forEach((u: UserProfile) => {
              if (u && u.uid) {
                map.set(u.uid, { ...(map.get(u.uid) || {}), ...u });
              }
            });
            return Array.from(map.values());
          });
        }
      }
      const cachedLeaderboard = localStorage.getItem(`wivote_leaderboard_${workspaceId}`) || localStorage.getItem('wivote_last_known_leaderboard');
      if (cachedLeaderboard) {
        const parsedLb = safeJsonParse<Record<string, number>>(cachedLeaderboard, {});
        if (parsedLb && typeof parsedLb === 'object') {
          setLeaderboardSummary(prev => ({ ...prev, ...parsedLb }));
        }
      }
      const cachedDrops = localStorage.getItem(`wivote_ws_cash_drops_${workspaceId}`) || localStorage.getItem('wivote_cash_drops');
      if (cachedDrops) {
        const parsedD = safeJsonParse<CashDrop[]>(cachedDrops, []);
        if (Array.isArray(parsedD) && parsedD.length > 0) setCashDrops(parsedD);
      }
      const cachedRequests = localStorage.getItem(`wivote_ws_requests_${workspaceId}`) || localStorage.getItem('wivote_requests');
      if (cachedRequests) {
        const parsedR = safeJsonParse<VoucherRequest[]>(cachedRequests, []);
        if (Array.isArray(parsedR) && parsedR.length > 0) {
          setRequests(prev => {
            const map = new Map<string, VoucherRequest>();
            prev.forEach(r => map.set(r.id, r));
            parsedR.forEach(r => {
              if (r && r.id) map.set(r.id, { ...r, workspaceId: (r as any).workspaceId || workspaceId });
            });
            return Array.from(map.values());
          });
        }
      }
      const cachedVouchers = localStorage.getItem(`wivote_ws_vouchers_${workspaceId}`) || localStorage.getItem('wivote_vouchers');
      if (cachedVouchers) {
        const parsedV = safeJsonParse<Voucher[]>(cachedVouchers, []);
        if (Array.isArray(parsedV) && parsedV.length > 0) {
          setVouchers(prev => {
            const map = new Map<string, Voucher>();
            prev.forEach(v => map.set(v.id, v));
            parsedV.forEach(v => {
              if (v && v.id) map.set(v.id, { ...v, workspaceId: (v as any).workspaceId || workspaceId });
            });
            return Array.from(map.values());
          });
        }
      }
    } catch (e) {
      console.warn("Workspace pre-hydration note:", e);
    }

    // 0. Active Workspace Document direct real-time listener (syncs subscriptionTier, lease status, quotas)
    const pathWorkspaceDoc = `workspaces/${workspaceId}`;
    const unsubWorkspaceDoc = onSnapshot(doc(db, 'workspaces', workspaceId), (docSnap) => {
      if (docSnap.exists()) {
        const wsData = { id: docSnap.id, ...docSnap.data() } as Workspace;
        setWorkspaces(prev => {
          const currentWs = prev.find(w => w.id === wsData.id);
          if (currentWs && currentWs.subscriptionTier !== wsData.subscriptionTier) {
            console.log(`[Realtime Sync] Workspace ${wsData.name} plan updated: ${currentWs.subscriptionTier} -> ${wsData.subscriptionTier}`);
            showToast(`Workspace subscription plan updated to ${wsData.subscriptionTier}`, 'info');
          }
          if (!prev.some(w => w.id === wsData.id)) {
            return [...prev, wsData];
          }
          return prev.map(w => w.id === wsData.id ? { ...w, ...wsData } : w);
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathWorkspaceDoc);
    });

    // 1. Users subcollection
    const pathUsers = `workspaces/${workspaceId}/users`;
    const unsubUsers = onSnapshot(collection(db, 'workspaces', workspaceId, 'users'), (snapshot) => {
      const data: UserProfile[] = [];
      snapshot.forEach(doc => {
        data.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      if (data.length > 0) {
        setUsers(prev => {
          const userMap = new Map<string, UserProfile>();
          // 1. Preserve all existing users across all workspaces
          prev.forEach(u => userMap.set(u.uid, u));

          // 2. Index existing workspace users to retain non-empty fields
          const existingWsUsers = prev.filter(u => u.workspaceId === workspaceId);
          const existingByUid = new Map<string, UserProfile>();
          const existingByEmail = new Map<string, UserProfile>();
          existingWsUsers.forEach(u => {
            existingByUid.set(u.uid, u);
            if (u.email) existingByEmail.set(u.email.toLowerCase().trim(), u);
          });

          // 3. Process and merge incoming users
          data.forEach(incoming => {
            const cleanEmail = (incoming.email || '').toLowerCase().trim();
            const existing = existingByUid.get(incoming.uid) || (cleanEmail ? existingByEmail.get(cleanEmail) : undefined);

            const isExistingDefaultCell = !existing?.cellNumber || existing.cellNumber === '+263770000000';
            const isIncomingDefaultCell = !incoming.cellNumber || incoming.cellNumber === '+263770000000';
            const isExistingDefaultPic = isSeedOrMockProfilePic(existing?.profilePic);
            const isIncomingDefaultPic = isSeedOrMockProfilePic(incoming.profilePic);

            const merged: UserProfile = {
              ...(existing || {}),
              ...incoming,
              performanceScore: Math.max(incoming.performanceScore || 0, existing?.performanceScore || 0),
              cellNumber: !isIncomingDefaultCell ? incoming.cellNumber : (!isExistingDefaultCell ? existing!.cellNumber : incoming.cellNumber),
              profilePic: !isIncomingDefaultPic ? incoming.profilePic : (!isExistingDefaultPic ? existing!.profilePic : incoming.profilePic),
              password: incoming.password || existing?.password || '',
              workspaceId: incoming.workspaceId || existing?.workspaceId || workspaceId,
              commissionRate: incoming.commissionRate !== undefined ? incoming.commissionRate : existing?.commissionRate
            };

            userMap.set(merged.uid, merged);

            if (cleanEmail) {
              const duplicateExisting = Array.from(userMap.values()).find(u => u.uid !== merged.uid && (u.email || '').toLowerCase().trim() === cleanEmail);
              if (duplicateExisting) {
                userMap.set(duplicateExisting.uid, {
                  ...duplicateExisting,
                  ...merged,
                  uid: duplicateExisting.uid,
                  performanceScore: Math.max(duplicateExisting.performanceScore || 0, merged.performanceScore || 0),
                  cellNumber: (!isIncomingDefaultCell ? incoming.cellNumber : duplicateExisting.cellNumber) || '+263770000000',
                  profilePic: (!isIncomingDefaultPic ? incoming.profilePic : duplicateExisting.profilePic) || '',
                  password: incoming.password || duplicateExisting.password || existing?.password || ''
                });
              }
            }
          });

          // 4. Always preserve logged in user if they belong to this workspace
          const currentUserObj = prev.find(u => u.uid === currentUserId);
          if (currentUserObj && currentUserObj.workspaceId === workspaceId && !userMap.has(currentUserId)) {
            userMap.set(currentUserId, currentUserObj);
          }

          const finalUsers = Array.from(userMap.values());
          try {
            safeSetItem('wivote_users', JSON.stringify(finalUsers));
            safeSetItem(`wivote_ws_users_${workspaceId}`, JSON.stringify(finalUsers.filter(u => u.workspaceId === workspaceId)));
          } catch (e) {}

          return finalUsers;
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathUsers);
    });

    // 2. Vouchers subcollection
    const pathVouchers = `workspaces/${workspaceId}/vouchers`;
    const unsubVouchers = onSnapshot(collection(db, 'workspaces', workspaceId, 'vouchers'), (snapshot) => {
      const data: Voucher[] = [];
      snapshot.forEach(doc => {
        const raw = doc.data();
        const rawStatus = (raw.status || '').toString().toLowerCase();
        const normalizedStatus: VoucherStatus = 
          rawStatus === 'assigned' ? 'Assigned' :
          rawStatus === 'sold' ? 'Sold' :
          'Unused';
        const cleanCode = sanitizeVoucherCode({ id: doc.id, code: raw.code });
        // Auto-heal in Firestore if raw.code had the unsanctioned prefix
        if (raw.code && (raw.code.startsWith('v_') || /^\d{6,}_/.test(raw.code)) && cleanCode !== raw.code) {
          setDoc(doc.ref, { code: cleanCode }, { merge: true }).catch(() => {});
        }
        data.push({
          id: doc.id,
          ...raw,
          code: cleanCode,
          status: normalizedStatus
        } as Voucher);
      });
      if (snapshot.size > 0 || data.length > 0) {
        setVouchers(prev => {
          const map = new Map<string, Voucher>();
          // 1. Preserve existing vouchers in memory
          prev.forEach(v => map.set(v.id, v));

          // 2. Monotonically merge incoming vouchers from Firestore strictly by Document ID
          const soldReg = getSoldVouchersRegistry();
          data.forEach(incoming => {
            const cleanCode = sanitizeVoucherCode(incoming);
            const existing = map.get(incoming.id);
            const soldRec = soldReg.get(incoming.id) || (cleanCode ? soldReg.get(cleanCode.toLowerCase().trim()) : undefined);

            const isExistingSold = existing && (String(existing.status).toLowerCase() === 'sold' || !!existing.soldAt);
            const isIncomingSold = String(incoming.status).toLowerCase() === 'sold' || !!incoming.soldAt;
            const isIncomingReversalApproved = incoming.reversalStatus === 'Approved' || !!incoming.reversedAt;
            const isRegisteredSold = !!soldRec;

            const isReversalApproved = isIncomingReversalApproved || (
              !isIncomingSold && (
                (existing && (existing.reversalStatus === 'Approved' || !!existing.reversedAt)) ||
                reversalRequests.some(r => r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (r.transactionId === incoming.id || r.referenceCode?.toLowerCase().trim() === cleanCode?.toLowerCase().trim()))
              )
            );
            const preserveSold = isIncomingSold || ((isExistingSold || isRegisteredSold) && !isReversalApproved);

            const mergedAssignedAgentId = existing?.assignedAgentId || incoming.assignedAgentId || soldRec?.assignedAgentId;
            const mergedAssignedAgentName = existing?.assignedAgentName || incoming.assignedAgentName || soldRec?.assignedAgentName;
            const mergedAssignedAgentEmail = (existing as any)?.assignedAgentEmail || (incoming as any).assignedAgentEmail || soldRec?.assignedAgentEmail;
            const mergedSoldByAgentId = (existing as any)?.soldByAgentId || (incoming as any).soldByAgentId || soldRec?.soldByAgentId || mergedAssignedAgentId;
            const mergedSoldByAgentName = (existing as any)?.soldByAgentName || (incoming as any).soldByAgentName || soldRec?.soldByAgentName || mergedAssignedAgentName;

            const mergedStatus: VoucherStatus = preserveSold 
              ? 'Sold' 
              : (isReversalApproved 
                  ? (mergedAssignedAgentId ? 'Assigned' : 'Unused')
                  : (incoming.status === 'Sold' ? 'Sold' : (incoming.status || existing?.status || (mergedAssignedAgentId ? 'Assigned' : 'Unused'))));

            const mergedSoldAt = mergedStatus === 'Sold' ? (existing?.soldAt || incoming.soldAt || soldRec?.soldAt || new Date().toISOString()) : undefined;
            const mergedSoldPrice = mergedStatus === 'Sold' ? (existing?.soldPrice !== undefined ? existing.soldPrice : (incoming.soldPrice !== undefined ? incoming.soldPrice : soldRec?.soldPrice)) : undefined;
            const mergedOriginalPrice = existing?.originalPrice !== undefined ? existing.originalPrice : (incoming.originalPrice || soldRec?.originalPrice || incoming.price);
            const mergedDiscount = mergedStatus === 'Sold' ? (existing?.discountApplied !== undefined ? existing.discountApplied : (incoming.discountApplied !== undefined ? incoming.discountApplied : soldRec?.discountApplied)) : undefined;
            const mergedCustName = mergedStatus === 'Sold' ? (existing?.customerName || incoming.customerName || soldRec?.customerName) : undefined;
            const mergedCustCell = mergedStatus === 'Sold' ? (existing?.customerCell || incoming.customerCell || soldRec?.customerCell) : undefined;
            const mergedCustId = mergedStatus === 'Sold' ? (existing?.customerId || incoming.customerId || soldRec?.customerId) : undefined;
            const mergedCustNum = mergedStatus === 'Sold' ? (existing?.customerNumber || incoming.customerNumber || soldRec?.customerNumber) : undefined;

            const mergedItem: Voucher = {
              ...(existing || {}),
              ...incoming,
              code: cleanCode || incoming.code || existing?.code,
              workspaceId: (incoming as any).workspaceId || existing?.workspaceId || workspaceId,
              status: mergedStatus,
              ...(mergedSoldAt ? { soldAt: mergedSoldAt } : {}),
              ...(mergedSoldPrice !== undefined ? { soldPrice: mergedSoldPrice } : {}),
              ...(mergedOriginalPrice !== undefined ? { originalPrice: mergedOriginalPrice } : {}),
              ...(mergedDiscount !== undefined ? { discountApplied: mergedDiscount } : {}),
              ...(mergedCustName ? { customerName: mergedCustName } : {}),
              ...(mergedCustCell ? { customerCell: mergedCustCell } : {}),
              ...(mergedCustId ? { customerId: mergedCustId } : {}),
              ...(mergedCustNum ? { customerNumber: mergedCustNum } : {}),
              ...(mergedAssignedAgentId ? { assignedAgentId: mergedAssignedAgentId } : {}),
              ...(mergedAssignedAgentName ? { assignedAgentName: mergedAssignedAgentName } : {}),
              ...(mergedAssignedAgentEmail ? { assignedAgentEmail: mergedAssignedAgentEmail } : {}),
              ...(mergedSoldByAgentId ? { soldByAgentId: mergedSoldByAgentId } : {}),
              ...(mergedSoldByAgentName ? { soldByAgentName: mergedSoldByAgentName } : {}),
              reversalRequested: isReversalApproved ? false : (incoming.reversalRequested ?? existing?.reversalRequested ?? false),
              reversalStatus: isReversalApproved ? 'Approved' : (incoming.reversalStatus || existing?.reversalStatus)
            };
            if (mergedStatus !== 'Sold') {
              delete mergedItem.soldAt;
              delete mergedItem.soldPrice;
              delete mergedItem.discountApplied;
              delete mergedItem.customerName;
              delete mergedItem.customerCell;
              delete mergedItem.customerId;
              delete mergedItem.customerNumber;
            }

            map.set(incoming.id, mergedItem);
          });
          const merged = Array.from(map.values());
          try {
            saveVouchersCache(merged, 'wivote_vouchers');
            saveVouchersCache(merged.filter(v => resolveVoucherWorkspaceId(v, workspaceId) === workspaceId), `wivote_ws_vouchers_${workspaceId}`);
          } catch (e) {}
          return merged;
        });
      } else {
        // Empty snapshot for workspace: do NOT clear vouchers! Retain existing or restore seed inventory
        setVouchers(prev => {
          const wsExisting = prev.filter(v => resolveVoucherWorkspaceId(v) === workspaceId);
          if (wsExisting.length > 0) {
            return prev;
          }
          const seedWs = initialVouchers.filter(v => resolveVoucherWorkspaceId(v) === workspaceId);
          if (seedWs.length > 0) {
            const map = new Map<string, Voucher>();
            prev.forEach(v => map.set(v.id, v));
            seedWs.forEach(v => map.set(v.id, v));
            const merged = Array.from(map.values());
            try {
              saveVouchersCache(merged, 'wivote_vouchers');
              saveVouchersCache(seedWs, `wivote_ws_vouchers_${workspaceId}`);
            } catch (e) {}
            return merged;
          }
          return prev;
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathVouchers);
    });

    // 3. Requests subcollection
    const pathRequests = `workspaces/${workspaceId}/requests`;
    const unsubRequests = onSnapshot(collection(db, 'workspaces', workspaceId, 'requests'), (snapshot) => {
      const deletedIds = getDeletedRequestIds();
      const data: VoucherRequest[] = [];
      snapshot.forEach(doc => {
        if (doc.id !== '__deleted_requests__' && !deletedIds.has(doc.id)) {
          data.push({ id: doc.id, ...doc.data() } as VoucherRequest);
        }
      });
      setRequests(prev => {
        const map = new Map<string, VoucherRequest>();
        prev.filter(r => !deletedIds.has(r.id)).forEach(r => map.set(r.id, r));
        data.forEach(incoming => {
          if (deletedIds.has(incoming.id)) return;
          const existing = map.get(incoming.id);
          const isExistingTerminal = existing?.status === 'Fulfilled' || existing?.status === 'Declined';
          const isIncomingTerminal = incoming.status === 'Fulfilled' || incoming.status === 'Declined';
          const mergedStatus = (isExistingTerminal && !isIncomingTerminal) ? existing.status : incoming.status;

          map.set(incoming.id, {
            ...(existing || {}),
            ...incoming,
            status: mergedStatus,
            workspaceId: (incoming as any).workspaceId || (existing as any)?.workspaceId || workspaceId
          });
        });
        const merged = Array.from(map.values());
        try {
          safeSetItem('wivote_requests', JSON.stringify(merged));
          safeSetItem(`wivote_ws_requests_${workspaceId}`, JSON.stringify(merged.filter(r => (r as any).workspaceId === workspaceId)));
        } catch (e) {}
        return merged;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathRequests);
    });

    // 4. Cash Drops subcollection
    const pathCashDrops = `workspaces/${workspaceId}/cash_drops`;
    const unsubCashDrops = onSnapshot(collection(db, 'workspaces', workspaceId, 'cash_drops'), (snapshot) => {
      const data: CashDrop[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as CashDrop);
      });
      setCashDrops(prev => {
        const map = new Map<string, CashDrop>();
        prev.forEach(c => map.set(c.id, c));
        data.forEach(incoming => {
          const existing = map.get(incoming.id);
          const isExistingApproved = existing?.status === 'Approved' || existing?.status === 'Reconciled' || !!existing?.approvedAt;
          const isIncomingApproved = incoming.status === 'Approved' || incoming.status === 'Reconciled' || !!incoming.approvedAt;
          const mergedStatus = (isExistingApproved && !isIncomingApproved) ? existing!.status : (incoming.status || existing?.status || 'Pending');
          const mergedApprovedAt = incoming.approvedAt || existing?.approvedAt;
          const mergedApprovedBy = incoming.approvedBy || existing?.approvedBy;

          map.set(incoming.id, {
            ...(existing || {}),
            ...incoming,
            status: mergedStatus,
            approvedAt: mergedApprovedAt,
            approvedBy: mergedApprovedBy,
            workspaceId: (incoming as any).workspaceId || (existing as any)?.workspaceId || workspaceId
          });
        });
        const merged = Array.from(map.values());
        try {
          safeSetItem(`wivote_ws_cash_drops_${workspaceId}`, JSON.stringify(merged.filter(c => (c as any).workspaceId === workspaceId)));
        } catch (e) {}
        return merged;
      });
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, pathCashDrops);
    });

    // 5. Legacy Devices subcollection
    const pathLegacyDevices = `workspaces/${workspaceId}/legacy_devices`;
    const unsubLegacyDevices = onSnapshot(collection(db, 'workspaces', workspaceId, 'legacy_devices'), (snapshot) => {
      const data: LegacyDevice[] = [];
      const now = Date.now();
      snapshot.forEach(docSnap => {
        const item = { id: docSnap.id, ...docSnap.data() } as LegacyDevice;
        if (item.expiresAt && new Date(item.expiresAt).getTime() > now && item.status === 'EXPIRED') {
          item.status = 'SOLD';
        } else if (item.expiresAt && new Date(item.expiresAt).getTime() <= now && item.status === 'SOLD') {
          item.status = 'EXPIRED';
        }
        data.push({ ...item, workspaceId: (item as any).workspaceId || workspaceId });
      });
      setLegacyDevices(prev => {
        const map = new Map<string, LegacyDevice>();
        prev.forEach(ld => map.set(ld.id, ld));
        data.forEach(incoming => {
          const existing = map.get(incoming.id);
          const isExistingApproved = existing?.isApproved === true || existing?.status === 'SOLD' || existing?.status === 'APPROVED';
          const isIncomingApproved = incoming.isApproved === true || incoming.status === 'SOLD' || incoming.status === 'APPROVED';
          const mergedApproved = isExistingApproved ? true : (incoming.isApproved ?? existing?.isApproved ?? false);
          const mergedStatus = isExistingApproved && incoming.status !== 'SOLD' && incoming.status !== 'APPROVED'
            ? (existing?.status || 'SOLD')
            : (incoming.status || existing?.status || 'PENDING');

          map.set(incoming.id, {
            ...(existing || {}),
            ...incoming,
            isApproved: mergedApproved,
            status: mergedStatus,
            fieldAgentId: existing?.fieldAgentId || incoming.fieldAgentId,
            fieldAgentName: existing?.fieldAgentName || incoming.fieldAgentName,
            fieldAgentEmail: (existing as any)?.fieldAgentEmail || (incoming as any).fieldAgentEmail,
            workspaceId: (incoming as any).workspaceId || (existing as any)?.workspaceId || workspaceId
          });
        });
        const deduped = deduplicateLegacyDevices(Array.from(map.values()));
        try {
          safeSetItem(`wivote_ws_legacy_${workspaceId}`, JSON.stringify(deduped.filter(l => resolveLegacyDeviceWorkspaceId(l, workspaceId) === workspaceId)));
        } catch (e) {}
        return deduped;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathLegacyDevices);
    });

    // 5b. Reversal Requests subcollection
    const pathReversals = `workspaces/${workspaceId}/reversal_requests`;
    const unsubReversals = onSnapshot(collection(db, 'workspaces', workspaceId, 'reversal_requests'), (snapshot) => {
      const data: TransactionReversalRequest[] = [];
      snapshot.forEach(docSnap => {
        data.push({ id: docSnap.id, ...docSnap.data() } as TransactionReversalRequest);
      });
      setReversalRequests(prev => {
        const map = new Map<string, TransactionReversalRequest>();
        prev.filter(r => (r as any).workspaceId && (r as any).workspaceId !== workspaceId).forEach(r => map.set(r.id, r));
        data.forEach(r => map.set(r.id, { ...r, workspaceId: (r as any).workspaceId || workspaceId }));
        return Array.from(map.values());
      });
      try {
        safeSetItem(`wivote_ws_reversals_${workspaceId}`, JSON.stringify(data));
      } catch (e) {}
    }, (error) => {
      console.warn("Reversal requests listener note:", error);
    });

    // 6. Notifications subcollection
    const pathNotifications = `workspaces/${workspaceId}/notifications`;
    const unsubNotifications = onSnapshot(collection(db, 'workspaces', workspaceId, 'notifications'), (snapshot) => {
      const data: SystemNotification[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as SystemNotification);
      });
      setNotifications(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathNotifications);
    });

    // 7. Feedback subcollection (Strictly restricted to WorkspaceMaster, Admin, or AppOwner under RBAC guidelines)
    const isMasterOrAdmin = currentUser?.role === 'WorkspaceMaster' || currentUser?.role === 'Admin' || currentUserRole === 'WorkspaceMaster' || currentUserRole === 'Admin';
    
    let unsubFeedback = () => {};
    if (isMasterOrAdmin || isAppOwner) {
      const pathFeedback = `workspaces/${workspaceId}/feedback`;
      unsubFeedback = onSnapshot(collection(db, 'workspaces', workspaceId, 'feedback'), (snapshot) => {
        const data: FeedbackMessage[] = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() } as FeedbackMessage);
        });
        setFeedback(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, pathFeedback);
      });
    }

    // 8. Customers subcollection (Universal historical loyalty registry across all workspace terminals)
    const pathCustomers = `workspaces/${workspaceId}/customers`;
    const unsubCustomers = onSnapshot(collection(db, 'workspaces', workspaceId, 'customers'), (snapshot) => {
      const isFromCache = snapshot.metadata.fromCache;
      if (isFromCache && hasRemoteCustomersRef.current) {
        // Prevent stale cache snapshot from replacing remote populated state
        return;
      }
      if (!isFromCache) {
        hasRemoteCustomersRef.current = true;
      }

      const data: Customer[] = [];
      snapshot.forEach(docSnap => {
        if (docSnap.id === '__deleted_names__') {
          const tData = docSnap.data();
          if (tData) {
            markCustomerDeleted(tData.ids || [], tData.names || []);
          }
          return;
        }
        const raw = docSnap.data();
        const resolvedWs = raw.workspaceId || workspaceId;
        data.push({ ...raw, id: docSnap.id, workspaceId: resolvedWs } as Customer);
      });

      setCustomers(prev => {
        const deletedIds = getDeletedCustomerIds();
        const deletedNames = getDeletedCustomerNames();

        // Keep customers belonging to other workspaces
        const otherWsCustomers = prev.filter(c => resolveCustomerWorkspaceId(c, workspaceId) !== workspaceId);

        // Process incoming Firestore snapshot for this workspace
        const wsMap = new Map<string, Customer>();
        data.forEach(incoming => {
          const normName = (incoming.name || '').trim().toLowerCase();
          if (deletedIds.has(incoming.id) || deletedNames.has(normName)) return;

          const existing = prev.find(c => c.id === incoming.id);
          const resolvedWs = workspaceId;

          if (existing && existing.updatedAt && incoming.updatedAt && existing.updatedAt > incoming.updatedAt) {
            wsMap.set(incoming.id, {
              ...incoming,
              ...existing,
              workspaceId: resolvedWs
            });
          } else {
            wsMap.set(incoming.id, {
              ...(existing || {}),
              ...incoming,
              workspaceId: resolvedWs
            });
          }
        });

        const updatedWsList = Array.from(wsMap.values());
        updatedWsList.sort((a, b) => {
          const numA = parseInt((a.customerNumber || '').replace(/\D/g, ''), 10) || 0;
          const numB = parseInt((b.customerNumber || '').replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        });

        const mergedAll = [...otherWsCustomers, ...updatedWsList];
        try {
          safeSetItem('wivote_customers', JSON.stringify(mergedAll));
          safeSetItem(`wivote_ws_customers_${workspaceId}`, JSON.stringify(updatedWsList));
        } catch (e) {}

        return mergedAll;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, pathCustomers);
    });

    // 9-15. Administrative & Investor subcollections: Attach ONLY if user has executive/admin access
    // This prevents mobile Field Agent terminals from downloading multi-megabyte backup dumps or governance records
    const isMasterOrAdminOrOwner = isAppOwner ||
      currentUser.role === 'WorkspaceMaster' ||
      currentUser.role === 'Admin' ||
      currentUserRole === 'WorkspaceMaster' ||
      currentUserRole === 'Admin' ||
      currentUser.role === 'Investor';

    let unsubInvestors = () => {};
    let unsubGov = () => {};
    let unsubLedger = () => {};
    let unsubDisposals = () => {};
    let unsubRecycleBin = () => {};
    let unsubAccountBackups = () => {};
    let unsubFullDbBackups = () => {};
    let unsubWsBackups = () => {};

    if (isMasterOrAdminOrOwner) {
      // 9. Investors subcollection
      const pathInvestors = `workspaces/${workspaceId}/investors`;
      unsubInvestors = onSnapshot(collection(db, 'workspaces', workspaceId, 'investors'), (snapshot) => {
        const data: InvestorStake[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as InvestorStake);
        });
        if (data.length > 0) {
          setInvestors(data);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, pathInvestors);
      });

      // 10. Shareholding Governance subcollection
      const pathGov = `workspaces/${workspaceId}/shareholding_governance`;
      unsubGov = onSnapshot(collection(db, 'workspaces', workspaceId, 'shareholding_governance'), (snapshot) => {
        let gov: ShareholdingGovernance | null = null;
        snapshot.forEach(docSnap => {
          gov = { ...docSnap.data() } as ShareholdingGovernance;
        });
        if (gov) {
          setShareholdingGovernance(gov);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, pathGov);
      });

      // 11. Ledger subcollection
      const pathLedger = `workspaces/${workspaceId}/ledger`;
      unsubLedger = onSnapshot(collection(db, 'workspaces', workspaceId, 'ledger'), (snapshot) => {
        const data: LedgerTransaction[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as LedgerTransaction);
        });
        if (data.length > 0) {
          data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setLedgerTransactions(data);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, pathLedger);
      });

      // 12. Share Disposals subcollection
      const pathDisposals = `workspaces/${workspaceId}/share_disposals`;
      unsubDisposals = onSnapshot(collection(db, 'workspaces', workspaceId, 'share_disposals'), (snapshot) => {
        const data: ShareDisposalRequest[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as ShareDisposalRequest);
        });
        if (data.length > 0) {
          data.sort((a, b) => new Date(b.dateRequested).getTime() - new Date(a.dateRequested).getTime());
          setShareDisposals(data);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, pathDisposals);
      });

      // 13. Recycle Bin subcollection
      unsubRecycleBin = onSnapshot(collection(db, 'workspaces', workspaceId, 'recycle_bin'), (snapshot) => {
        const data: RecycleBinItem[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as RecycleBinItem);
        });
        if (data.length > 0) {
          setRecycleBin(prev => {
            const map = new Map<string, RecycleBinItem>();
            prev.forEach(b => map.set(b.id, b));
            data.forEach(b => map.set(b.id, b));
            const list = Array.from(map.values());
            list.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
            return list;
          });
        }
      }, (error) => {
        console.warn("Recycle bin listener note:", error);
      });

      // 14. Account Backups subcollection
      unsubAccountBackups = onSnapshot(collection(db, 'workspaces', workspaceId, 'account_backups'), (snapshot) => {
        const data: AccountBackupItem[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as AccountBackupItem);
        });
        if (data.length > 0) {
          setAccountBackups(prev => {
            const map = new Map<string, AccountBackupItem>();
            prev.forEach(b => map.set(b.id, b));
            data.forEach(b => map.set(b.id, b));
            const list = Array.from(map.values());
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return list;
          });
        }
      }, (error) => {
        console.warn("Account backups listener note:", error);
      });

      // 15. Full Database Backups subcollection
      unsubFullDbBackups = onSnapshot(collection(db, 'workspaces', workspaceId, 'full_database_backups'), (snapshot) => {
        const data: any[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() });
        });
        if (data.length > 0) {
          setFullDatabaseBackups(prev => {
            const map = new Map<string, any>();
            prev.forEach(b => map.set(b.id, b));
            data.forEach(b => map.set(b.id, b));
            const list = Array.from(map.values());
            list.sort((a, b) => b.timestamp - a.timestamp);
            return list;
          });
        }
      }, (error) => {
        console.warn("Full DB backups listener note:", error);
      });

      // 17. Intelligent Workspace Backups subcollection
      unsubWsBackups = onSnapshot(collection(db, 'workspaces', workspaceId, 'workspace_backups'), (snapshot) => {
        const data: WorkspaceBackupItem[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as WorkspaceBackupItem);
        });
        if (data.length > 0) {
          data.sort((a, b) => b.timestamp - a.timestamp);
          const top5 = data.slice(0, 5);
          setWorkspaceBackups(top5);
          safeSetItem(`wivote_ws_backups_${workspaceId}`, JSON.stringify(top5));
          safeSetItem('wivote_workspace_backups', JSON.stringify(top5));
        }
      }, (error) => {
        console.warn("Workspace backups listener note:", error);
      });
    }

    // 16. Leaderboard summary listener for synchronized scores across all roles and dashboards
    const unsubLeaderboard = onSnapshot(doc(db, 'workspaces', workspaceId, 'leaderboard', 'summary'), (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.data();
        const scores: Record<string, number> = {};
        Object.entries(raw || {}).forEach(([k, v]) => {
          if (typeof v === 'number') scores[k] = v;
        });
        setLeaderboardSummary(prev => {
          const merged = { ...prev, ...scores };
          try {
            localStorage.setItem('wivote_last_known_leaderboard', JSON.stringify(merged));
            localStorage.setItem(`wivote_leaderboard_${workspaceId}`, JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, (error) => {
      // Missing document is handled gracefully by fallback baselines
    });

    return () => {
      unsubWorkspaceDoc();
      unsubUsers();
      unsubVouchers();
      unsubRequests();
      unsubCashDrops();
      unsubLegacyDevices();
      unsubReversals();
      unsubNotifications();
      unsubFeedback();
      unsubCustomers();
      unsubInvestors();
      unsubGov();
      unsubLedger();
      unsubDisposals();
      unsubRecycleBin();
      unsubAccountBackups();
      unsubFullDbBackups();
      unsubLeaderboard();
      unsubWsBackups();
    };
  }, [isLoggedIn, currentUser?.workspaceId, currentUserWorkspaceId, activeWorkspace?.id, currentUserId, isFirebasePlaceholder, currentUser?.role, currentUserRole, firebaseAuthUser]);

  // Real-Time Cross-Tenant Vouchers Listener for AppOwner
  useEffect(() => {
    if (isFirebasePlaceholder) return;
    const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    if (!isAppOwner) return;

    let unsubGroup: (() => void) | undefined;
    try {
      unsubGroup = onSnapshot(collectionGroup(db, 'vouchers'), (snapshot) => {
        const data: Voucher[] = [];
        snapshot.forEach(docSnap => {
          const raw = docSnap.data();
          const rawStatus = (raw.status || '').toString().toLowerCase();
          const normalizedStatus: VoucherStatus = 
            rawStatus === 'assigned' ? 'Assigned' :
            rawStatus === 'sold' ? 'Sold' :
            'Unused';
          const cleanCode = sanitizeVoucherCode({ id: docSnap.id, code: raw.code });
          data.push({ id: docSnap.id, ...raw, code: cleanCode, status: normalizedStatus } as Voucher);
        });
        if (data.length > 0) {
          setVouchers(prev => {
            const map = new Map<string, Voucher>();
            prev.forEach(v => map.set(v.id, v));
            data.forEach(incoming => {
              const existing = map.get(incoming.id);
              const isExistingSold = existing && (String(existing.status).toLowerCase() === 'sold' || !!existing.soldAt);
              const isIncomingSold = String(incoming.status).toLowerCase() === 'sold' || !!incoming.soldAt;
              const preserveSold = (isExistingSold || isIncomingSold) && (!existing || existing.reversalStatus !== 'Approved');

              const mergedItem: Voucher = {
                ...(existing || {}),
                ...incoming,
                status: preserveSold ? 'Sold' : (incoming.status || existing?.status || 'Unused'),
                soldAt: existing?.soldAt || incoming.soldAt,
                soldPrice: existing?.soldPrice !== undefined ? existing.soldPrice : incoming.soldPrice,
                originalPrice: existing?.originalPrice !== undefined ? existing.originalPrice : (incoming.originalPrice || incoming.price),
                discountApplied: existing?.discountApplied !== undefined ? existing.discountApplied : incoming.discountApplied,
                customerName: existing?.customerName || incoming.customerName,
                customerCell: existing?.customerCell || incoming.customerCell,
                customerId: existing?.customerId || incoming.customerId,
                customerNumber: existing?.customerNumber || incoming.customerNumber,
                assignedAgentId: existing?.assignedAgentId || incoming.assignedAgentId,
                assignedAgentName: existing?.assignedAgentName || incoming.assignedAgentName,
                assignedAgentEmail: (existing as any)?.assignedAgentEmail || (incoming as any).assignedAgentEmail,
                soldByAgentId: (existing as any)?.soldByAgentId || (incoming as any).soldByAgentId,
                soldByAgentName: (existing as any)?.soldByAgentName || (incoming as any).soldByAgentName
              };
              map.set(incoming.id, mergedItem);
            });
            return Array.from(map.values());
          });
        }
      }, (err) => {
        console.warn("AppOwner collectionGroup vouchers listener note:", err);
      });
    } catch (e) {
      console.warn("AppOwner vouchers collectionGroup setup note:", e);
    }

    return () => {
      if (unsubGroup) unsubGroup();
    };
  }, [currentUser?.role, currentUserRole, currentUser?.email, isFirebasePlaceholder]);

  // Real-Time Cross-Tenant Customers Listener for AppOwner
  useEffect(() => {
    if (isFirebasePlaceholder) return;
    const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    if (!isAppOwner) return;

    let unsubCustGroup: (() => void) | undefined;
    try {
      unsubCustGroup = onSnapshot(collectionGroup(db, 'customers'), (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        if (isFromCache && hasRemoteCustomersRef.current) {
          return;
        }
        if (!isFromCache) {
          hasRemoteCustomersRef.current = true;
        }

        const data: Customer[] = [];
        snapshot.forEach(docSnap => {
          if (docSnap.id === '__deleted_names__') {
            const tData = docSnap.data();
            if (tData) {
              markCustomerDeleted(tData.ids || [], tData.names || []);
            }
            return;
          }
          data.push({ id: docSnap.id, ...docSnap.data() } as Customer);
        });
        if (data.length > 0) {
          setCustomers(prev => {
            const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

            const map = new Map<string, Customer>();
            prev.forEach(c => map.set(c.id, c));

            data.forEach(incoming => {
              const existing = map.get(incoming.id);
              const resolvedWs = incoming.workspaceId || resolveCustomerWorkspaceId(incoming, targetWsId);
              if (existing && existing.updatedAt && incoming.updatedAt && existing.updatedAt > incoming.updatedAt) {
                // Local state has newer user edits - preserve existing customer record over stale snapshot
                map.set(incoming.id, {
                  ...incoming,
                  ...existing,
                  workspaceId: resolvedWs
                });
              } else {
                map.set(incoming.id, {
                  ...(existing || {}),
                  ...incoming,
                  workspaceId: resolvedWs
                });
              }
            });

            const activeVouchers = vouchersRef.current.length > 0 ? vouchersRef.current : vouchers;
            const activeLegacy = legacyDevicesRef.current.length > 0 ? legacyDevicesRef.current : legacyDevices;

            const thisWsData = Array.from(map.values()).filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId);
            const thisWsSynthesized = synthesizeCustomers(thisWsData, activeVouchers, activeLegacy, targetWsId);
            return mergeCustomersWithMonotonicGuard(prev, thisWsSynthesized, targetWsId);
          });
        }
      }, (err) => {
        console.warn("AppOwner collectionGroup customers listener note:", err);
      });
    } catch (e) {
      console.warn("AppOwner customers collectionGroup setup note:", e);
    }

    return () => {
      if (unsubCustGroup) unsubCustGroup();
    };
  }, [currentUser?.role, currentUserRole, currentUser?.email, isFirebasePlaceholder, activeWorkspace?.id]);

  // Real-Time System Backups Listener for AppOwner
  useEffect(() => {
    if (isFirebasePlaceholder) return;
    const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    if (!isAppOwner) return;

    let unsubBackups: (() => void) | undefined;
    try {
      unsubBackups = onSnapshot(collection(db, 'saas_config', 'system_backups', 'snapshots'), (snapshot) => {
        const data: EntireAppBackupItem[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as EntireAppBackupItem);
        });
        if (data.length > 0) {
          data.sort((a, b) => b.timestamp - a.timestamp);
          const top5 = data.slice(0, 5);
          setEntireAppBackups(top5);
          safeSetItem('wivote_entire_app_backups', JSON.stringify(top5));
        }
      }, (err) => {
        console.warn("AppOwner system_backups listener note:", err);
      });
    } catch (e) {
      console.warn("AppOwner system_backups setup note:", e);
    }

    return () => {
      if (unsubBackups) unsubBackups();
    };
  }, [currentUser?.role, currentUserRole, currentUser?.email, isFirebasePlaceholder]);

  // Universal Customer Registry Auto-Sync: ensure customer registry captures all voucher & device sales in real time
  useEffect(() => {
    if (vouchers.length === 0 && legacyDevices.length === 0) return;
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || 'ws_vakzim';
    if (!targetWsId || targetWsId === 'system') return;
    setCustomers(prev => {
      const activeVouchers = vouchersRef.current.length > 0 ? vouchersRef.current : vouchers;
      const activeLegacy = legacyDevicesRef.current.length > 0 ? legacyDevicesRef.current : legacyDevices;
      const thisWsExisting = prev.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId);
      const thisWsSynthesized = synthesizeCustomers(thisWsExisting, activeVouchers, activeLegacy, targetWsId);
      return mergeCustomersWithMonotonicGuard(prev, thisWsSynthesized, targetWsId);
    });
  }, [vouchers, legacyDevices, activeWorkspace?.id, currentUser?.workspaceId, currentUser?.role]);

  // Universal Leaderboard Auto-Sync: ensure agent leaderboard captures all sales across all dashboards in real time
  useEffect(() => {
    const wsId = activeWorkspace?.id || currentUser?.workspaceId;
    if (!wsId || wsId === 'system') return;

    // Calculate aggregated sales for all active workspace agents
    const calculatedScores: Record<string, number> = {};
    const agentHasRealTransactions = new Set<string>();

    // Helper to find matching user UID resolving any agent naming/email/alias discrepancies
    const findAgentUid = (agentId?: string, agentName?: string, agentEmail?: string): string | null => {
      const cleanName = (agentName || '').toLowerCase().trim();
      const cleanEmail = (agentEmail || '').toLowerCase().trim();

      // Check specific agent alias overrides first to prevent default seed agent takeover
      const cleanAgentId = agentId ? agentId.toLowerCase().trim() : '';
      if (cleanName.includes('mukondodzi') || cleanEmail.includes('mukondodzi') || (cleanAgentId && (cleanAgentId.includes('mukondodzi') || agentId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2'))) {
        const mUser = users.find(u => 
          (u.name && u.name.toLowerCase().includes('mukondodzi')) || 
          (u.email && u.email.toLowerCase().includes('mukondodzi')) ||
          u.uid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' ||
          (u.uid && u.uid.toLowerCase().includes('mukondodzi'))
        );
        if (mUser) return mUser.uid;
      }
      if (cleanName.includes('chitsungo') || cleanEmail.includes('chitsungo') || (cleanAgentId && (cleanAgentId.includes('chitsungo') || agentId === '7QFBnEU9XxalOI6kl8csoTm58tE2'))) {
        const cUser = users.find(u => 
          (u.name && u.name.toLowerCase().includes('chitsungo')) || 
          (u.email && u.email.toLowerCase().includes('chitsungo')) ||
          u.uid === '7QFBnEU9XxalOI6kl8csoTm58tE2' ||
          (u.uid && u.uid.toLowerCase().includes('chitsungo'))
        );
        if (cUser) return cUser.uid;
      }
      if (cleanName.includes('histec') || cleanEmail.includes('histec') || (cleanAgentId && (cleanAgentId.includes('histec') || agentId === 'agent_histec_training' || agentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2'))) {
        const hUser = users.find(u => 
          (u.name && u.name.toLowerCase().includes('histec')) || 
          (u.email && u.email.toLowerCase().includes('histec')) ||
          u.uid === 'agent_histec_training' ||
          u.uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' ||
          (u.uid && u.uid.toLowerCase().includes('histec'))
        );
        if (hUser) return hUser.uid;
      }

      if (agentId && users.some(u => u.uid === agentId)) return agentId;

      const normalizeString = (s: string) => {
        return s
          .toLowerCase()
          .replace(/^(agent\s+)/i, '')
          .replace(/\s*\(field\s+agent\)/i, '')
          .replace(/[^a-z0-9]/g, '')
          .trim();
      };

      const normCleanName = normalizeString(agentName || '');

      const matched = users.find(u => {
        const uName = (u.name || '').toLowerCase().trim();
        const uEmail = (u.email || '').toLowerCase().trim();
        const normUName = normalizeString(u.name || '');
        if (normCleanName && normUName === normCleanName) return true;
        if (cleanEmail && uEmail === cleanEmail) return true;
        return false;
      });
      return matched?.uid || agentId || null;
    };

    const currentCycleMonth = getCurrentCycleMonth();

    // Direct voucher sales (strictly paid sales in CURRENT cycle - free customer promotional gifts never record in sales)
    vouchers.forEach(v => {
      if (v.status === 'Sold' && v.reversalStatus !== 'Approved' && !isVoucherFree(v, giveawaySettings)) {
        const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate || v.createdAt;
        const vCycle = saleDate ? getCycleMonthFromDate(saleDate) : currentCycleMonth;
        // Exclude past sales cycles and vouchers already archived in previous cash close
        if (!v.archived && vCycle === currentCycleMonth) {
          const aid = findAgentUid(
            v.assignedAgentId || (v as any).soldByAgentId,
            v.assignedAgentName || (v as any).assignedTo || (v as any).soldByAgentName,
            (v as any).assignedAgentEmail || (v as any).agentEmail || (v as any).soldByAgentEmail
          );
          if (aid) {
            const rev = getVoucherMonetaryValue(v, giveawaySettings);
            calculatedScores[aid] = (calculatedScores[aid] || 0) + rev;
            agentHasRealTransactions.add(aid);
          }
        }
      }
    });

    // Direct legacy device sales with strict deduplication for CURRENT cycle
    const dedupedLegacy = deduplicateLegacyDevices(legacyDevices);
    dedupedLegacy.forEach(ld => {
      const isSold = (ld.status === 'SOLD' || ld.status === 'APPROVED' || ld.isApproved || ld.addedToInventory) && ld.reversalStatus !== 'Approved' && ld.status !== 'CANCELLED';
      if (isSold && !(ld as any).cashClosed) {
        const saleDate = ld.soldAt || ld.enrolledAt;
        const ldCycle = saleDate ? getCycleMonthFromDate(saleDate) : currentCycleMonth;
        if (ldCycle === currentCycleMonth) {
          const aid = findAgentUid(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail);
          if (aid) {
            calculatedScores[aid] = (calculatedScores[aid] || 0) + (ld.soldPrice ?? ld.monthlyPrice ?? 0);
            agentHasRealTransactions.add(aid);
          }
        }
      }
    });

    let shouldUpdateLocal = false;
    const mergedSummary: Record<string, number> = { ...leaderboardSummary };

    // Synchronize authoritative current cycle scores for all users
    users.forEach(u => {
      const uName = (u.name || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const isHistecUser = uName.includes('histec') || uEmail.includes('histec') || u.uid === 'agent_histec_training' || u.uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2';
      const isMukondodziUser = uName.includes('mukondodzi') || uEmail.includes('mukondodzi') || u.uid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2';
      const isChitsungoUser = uName.includes('chitsungo') || uEmail.includes('chitsungo') || u.uid === '7QFBnEU9XxalOI6kl8csoTm58tE2';

      let finalScore = calculatedScores[u.uid] || 0;
      if (isHistecUser) {
        finalScore = (calculatedScores['OIofBo6j6jV6qM0oRRxVFwpucfP2'] || 0) + (calculatedScores['agent_histec_training'] || 0);
      } else if (isMukondodziUser) {
        finalScore = calculatedScores['6ih4NtJnXUeNtt1z0orVHZGkQuv2'] || 0;
      } else if (isChitsungoUser) {
        finalScore = calculatedScores['7QFBnEU9XxalOI6kl8csoTm58tE2'] || 0;
      }

      if (mergedSummary[u.uid] !== finalScore) {
        mergedSummary[u.uid] = finalScore;
        shouldUpdateLocal = true;
      }
    });

    if (shouldUpdateLocal) {
      setLeaderboardSummary(mergedSummary);

      // If user is Admin, Master, or AppOwner, sync to Firestore
      const isMasterOrAdmin = currentUser?.role === 'WorkspaceMaster' || currentUser?.role === 'Admin' || currentUserRole === 'WorkspaceMaster' || currentUserRole === 'Admin';
      const loggedInEmail = (currentUser?.email || '').toLowerCase().trim();
      const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || loggedInEmail === 'karimazondomike049@gmail.com';

      if (!isFirebasePlaceholder && (isMasterOrAdmin || isAppOwner)) {
        const summaryRef = doc(db, 'workspaces', wsId, 'leaderboard', 'summary');
        setDoc(summaryRef, {
          ...mergedSummary,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }
    }
  }, [vouchers, legacyDevices, users, activeWorkspace?.id, currentUser?.workspaceId, currentUser?.role, currentUserRole]);

  // --- Real-Time Audit Logs Listener (Access Audit Trail for AppOwner) ---
  useEffect(() => {
    if (isFirebasePlaceholder) return;
    if (!auth.currentUser) return;

    const loggedInEmail = (currentUser?.email || getSessionVar('wivote_current_user_email') || '').toLowerCase().trim();
    const isDeveloper = loggedInEmail === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || isDeveloper;

    if (!isAppOwner) return;

    let unsubAudit: (() => void) | undefined;
    try {
      const q = query(collection(db, 'audit_logs'));
      unsubAudit = onSnapshot(q, (snapshot) => {
        const cloudLogs: AuditLogEntry[] = [];
        snapshot.forEach(docSnap => {
          cloudLogs.push({ id: docSnap.id, ...docSnap.data() } as AuditLogEntry);
        });

        if (cloudLogs.length > 0) {
          // Sort descending by timestamp
          cloudLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setAuditLogs(prev => {
            const mergedMap = new Map<string, AuditLogEntry>();
            // Keep existing seed/local logs
            prev.forEach(l => mergedMap.set(l.id, l));
            // Overwrite or append cloud logs
            cloudLogs.forEach(l => mergedMap.set(l.id, l));
            const merged = Array.from(mergedMap.values());
            merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return merged;
          });
        }
      }, (err) => {
        console.warn("Audit logs Firestore listener note:", err);
      });
    } catch (e) {
      console.warn("Audit logs listener registration error:", e);
    }

    return () => {
      if (unsubAudit) unsubAudit();
    };
  }, [currentUser?.email, currentUser?.role, currentUserRole, isFirebasePlaceholder]);

  // Real-Time Cross-Workspace Recycle Bin & Backups Listener for AppOwner
  useEffect(() => {
    if (isFirebasePlaceholder) return;
    const loggedInEmail = (currentUser?.email || getSessionVar('wivote_current_user_email') || '').toLowerCase().trim();
    const isDeveloper = loggedInEmail === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || isDeveloper;
    if (!isAppOwner) return;

    let unsubBin: (() => void) | undefined;
    let unsubBkp: (() => void) | undefined;
    try {
      unsubBin = onSnapshot(collection(db, 'recycle_bin'), (snapshot) => {
        const data: RecycleBinItem[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as RecycleBinItem);
        });
        if (data.length > 0) {
          setRecycleBin(prev => {
            const map = new Map<string, RecycleBinItem>();
            prev.forEach(b => map.set(b.id, b));
            data.forEach(b => map.set(b.id, b));
            const list = Array.from(map.values());
            list.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
            return list;
          });
        }
      }, err => console.warn("AppOwner recycle_bin listener note:", err));

      unsubBkp = onSnapshot(collection(db, 'account_backups'), (snapshot) => {
        const data: AccountBackupItem[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as AccountBackupItem);
        });
        if (data.length > 0) {
          setAccountBackups(prev => {
            const map = new Map<string, AccountBackupItem>();
            prev.forEach(b => map.set(b.id, b));
            data.forEach(b => map.set(b.id, b));
            const list = Array.from(map.values());
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return list;
          });
        }
      }, err => console.warn("AppOwner account_backups listener note:", err));
    } catch (e) {
      console.warn("AppOwner root listeners registration error:", e);
    }

    return () => {
      if (unsubBin) unsubBin();
      if (unsubBkp) unsubBkp();
    };
  }, [currentUser?.email, currentUser?.role, currentUserRole, isFirebasePlaceholder]);

  // --- Live Refresh Engine (Auto Re-fetch from Firestore every 30s) ---
  const [isRefetching, setIsRefetching] = useState<boolean>(false);
  const [isPushingToDb, setIsPushingToDb] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(() => new Date());
  const [refreshCountdown, setRefreshCountdown] = useState<number>(30);

  const isSyncingRef = useRef<boolean>(false);
  const syncAbortControllerRef = useRef<AbortController | null>(null);

  // --- Global Cross-Device Synchronization Engine ---
  const syncWithServerBridge = async (targetWsId?: string): Promise<boolean> => {
    if (isSyncingRef.current) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    if (syncAbortControllerRef.current) {
      try { syncAbortControllerRef.current.abort(); } catch {}
    }
    const abortController = new AbortController();
    syncAbortControllerRef.current = abortController;

    isSyncingRef.current = true;
    try {
      const wsId = targetWsId || currentUser?.workspaceId || currentUserWorkspaceId || activeWorkspace?.id;
      const params = new URLSearchParams();
      if (wsId && wsId !== 'system' && wsId !== 'ALL') params.append('workspaceId', wsId);
      if (currentUser?.uid) params.append('agentId', currentUser.uid);
      if (currentUser?.email) params.append('agentEmail', currentUser.email);
      const url = `/api/sync/state?${params.toString()}`;

      const res = await fetch(url, { signal: abortController.signal });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.success) return false;

      // 0. Ingest server authoritative metrics and deleted plans
      if (Array.isArray(data.deletedPlans)) {
        try {
          const clientDeleted = getDeletedPlans();
          let added = false;
          data.deletedPlans.forEach((p: string) => {
            if (p && !clientDeleted.has(p)) {
              clientDeleted.add(p);
              added = true;
            }
          });
          if (added) {
            localStorage.setItem('wivote_deleted_plans', JSON.stringify(Array.from(clientDeleted)));
          }
        } catch (e) {}
      }

      if (data.authoritativeAgentMetrics && typeof data.authoritativeAgentMetrics === 'object') {
        setServerAuthoritativeMetrics(prev => {
          const next = { ...prev, ...data.authoritativeAgentMetrics };
          if (data.currentAgentMetrics) {
            next['current'] = data.currentAgentMetrics;
            if (currentUser?.uid) next[currentUser.uid] = data.currentAgentMetrics;
          }
          try { localStorage.setItem('wivote_authoritative_metrics', JSON.stringify(next)); } catch {}
          return next;
        });
      }

      // Ingest latest push mirror from server bridge
      if (data.latestDbPushMetricsMirror && typeof data.latestDbPushMetricsMirror === 'object') {
        setLatestDbPushMetricsMirror(data.latestDbPushMetricsMirror);
        try {
          localStorage.setItem('wivote_latest_db_push_metrics_mirror', JSON.stringify(data.latestDbPushMetricsMirror));
        } catch {}
      }
      setIsAuthoritativeDataReady(true);

      // Reconcile and prune local sold vouchers registry of ghost records not confirmed in authoritative DB
      if (Array.isArray(data.authoritativeSoldCatalog) || Array.isArray(data.vouchers)) {
        try {
          const authoritativeSoldSet = new Set<string>();
          if (Array.isArray(data.authoritativeSoldCatalog)) {
            data.authoritativeSoldCatalog.forEach((s: any) => {
              if (s.id) authoritativeSoldSet.add(s.id.toLowerCase().trim());
              if (s.code) authoritativeSoldSet.add(s.code.toLowerCase().trim());
            });
          }
          if (Array.isArray(data.vouchers)) {
            data.vouchers.forEach((v: any) => {
              if (v.status === 'Sold' || v.soldAt || v.giftedAt) {
                if (v.id) authoritativeSoldSet.add(v.id.toLowerCase().trim());
                if (v.code) authoritativeSoldSet.add(v.code.toLowerCase().trim());
              }
            });
          }
          const raw = localStorage.getItem('wivote_sold_vouchers_registry');
          if (raw) {
            const parsed = safeJsonParse<Record<string, any>>(raw, {});
            let cleanedStore: Record<string, any> = {};
            let prunedCount = 0;
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            Object.entries(parsed).forEach(([k, item]: [string, any]) => {
              if (!item) return;
              const kNorm = k.toLowerCase().trim();
              const itemCode = (item.code || '').toLowerCase().trim();
              const itemId = (item.id || '').toLowerCase().trim();
              const isAuthoritative = authoritativeSoldSet.has(kNorm) || authoritativeSoldSet.has(itemCode) || authoritativeSoldSet.has(itemId);
              const isGiftedSale = item.isFree || !!item.giftedAt || item.soldPrice === 0;
              const isRecentLocalSale = (item.soldAt || item.giftedAt) && (new Date(item.soldAt || item.giftedAt).getTime() > oneDayAgo || item.isDirty);
              if (isAuthoritative || isGiftedSale || isRecentLocalSale) {
                cleanedStore[k] = item;
              } else {
                prunedCount++;
              }
            });
            if (prunedCount > 0) {
              localStorage.setItem('wivote_sold_vouchers_registry', JSON.stringify(cleanedStore));
            }
          }
        } catch (e) {
          console.warn("Error reconciling sold vouchers registry:", e);
        }
      }

      // 1. Sync vouchers across devices
      const activeDeletedPlans = getDeletedPlans();
      if (Array.isArray(data.vouchers)) {
        setVouchers(prev => {
          const map = new Map<string, Voucher>();
          prev.forEach(v => {
            if (v && (!v.plan || !activeDeletedPlans.has(v.plan)) && v.id !== 'test_gift_voucher_101') {
              map.set(v.id, v);
            }
          });
          let changed = false;

          data.vouchers.forEach((sv: Voucher) => {
            if (!sv || (sv.plan && activeDeletedPlans.has(sv.plan)) || sv.id === 'test_gift_voucher_101') {
              if (map.has(sv?.id)) {
                map.delete(sv.id);
                changed = true;
              }
              return;
            }

            const cleanCode = sanitizeVoucherCode(sv);
            const cleanedSv = { ...sv, code: cleanCode || sv.code };
            const existing = map.get(sv.id);

            const isIncomingSold = String(sv.status).toLowerCase() === 'sold' || !!sv.soldAt || !!sv.giftedAt;
            const isGifted = Boolean(existing?.giftedAt || sv.giftedAt || (existing?.isFree && (existing?.status === 'Sold' || !!existing?.soldAt)));
            const isIncomingReversalApproved = sv.reversalStatus === 'Approved' || !!sv.reversedAt;
            const isReversalApproved = isIncomingReversalApproved || (
              !isIncomingSold && (
                (existing && (existing.reversalStatus === 'Approved' || !!existing.reversedAt)) ||
                reversalRequests.some(r => r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (r.transactionId === sv.id || r.referenceCode?.toLowerCase().trim() === cleanCode?.toLowerCase().trim()))
              )
            );
            // Server authoritative status wins; preserve local sold only if unpushed dirty mutation or gifted promotional voucher
            const isLocalDirty = (existing as any)?.isDirty || (existing as any)?._isDirty;
            const existingTime = new Date(existing?.updatedAt || 0).getTime();
            const serverTime = new Date(sv.updatedAt || 0).getTime();
            const isLocalNewer = Boolean(isLocalDirty && existingTime > serverTime);

            const preserveSold = isIncomingSold || (!isReversalApproved && (isLocalDirty || isGifted));

            const effectivePrice = isLocalNewer && existing?.price !== undefined ? existing.price : (cleanedSv.price !== undefined ? cleanedSv.price : existing?.price);
            const effectivePlan = isLocalNewer && existing?.plan ? existing.plan : (cleanedSv.plan || existing?.plan);
            const effectiveLocation = isLocalNewer && existing?.location ? existing.location : (cleanedSv.location || existing?.location);
            const effectiveNetwork = isLocalNewer && existing?.networkName ? existing.networkName : (cleanedSv.networkName || existing?.networkName);

            const mergedAssignedAgentId = existing?.assignedAgentId || sv.assignedAgentId;
            const mergedAssignedAgentName = existing?.assignedAgentName || sv.assignedAgentName;
            const mergedAssignedAgentEmail = (existing as any)?.assignedAgentEmail || (sv as any).assignedAgentEmail;
            const mergedSoldByAgentId = (existing as any)?.soldByAgentId || (sv as any).soldByAgentId || mergedAssignedAgentId;
            const mergedSoldByAgentName = (existing as any)?.soldByAgentName || (sv as any).soldByAgentName || mergedAssignedAgentName;

            const mergedStatus: VoucherStatus = preserveSold 
              ? 'Sold' 
              : (isReversalApproved 
                  ? (mergedAssignedAgentId ? 'Assigned' : 'Unused')
                  : (sv.status === 'Sold' ? 'Sold' : (sv.status || existing?.status || (mergedAssignedAgentId ? 'Assigned' : 'Unused'))));
            const mergedSoldAt = existing?.soldAt || sv.soldAt || (mergedStatus === 'Sold' ? (existing?.giftedAt || sv.giftedAt || new Date().toISOString()) : undefined);
            const mergedSoldPrice = existing?.soldPrice !== undefined ? existing.soldPrice : sv.soldPrice;
            const mergedOriginalPrice = existing?.originalPrice !== undefined ? existing.originalPrice : (sv.originalPrice || sv.price);
            const mergedDiscount = existing?.discountApplied !== undefined ? existing.discountApplied : (sv.discountApplied || (sv as any).discount);
            const mergedCustName = existing?.customerName || sv.customerName;
            const mergedCustCell = existing?.customerCell || sv.customerCell;
            const mergedCustId = existing?.customerId || sv.customerId;
            const mergedCustNum = existing?.customerNumber || sv.customerNumber;
            const isPaidPrice = (sv.soldPrice !== undefined && Number(sv.soldPrice) > 0) || 
                                (existing?.soldPrice !== undefined && Number(existing.soldPrice) > 0) ||
                                (sv.price !== undefined && Number(sv.price) > 0 && !sv.giftedAt);
            const mergedIsFree = !isPaidPrice && Boolean((existing?.isFree || sv.isFree) && (isGifted || sv.giftedAt));
            const mergedGiftedAt = existing?.giftedAt || sv.giftedAt;
            const mergedGiftedByAgentId = existing?.giftedByAgentId || sv.giftedByAgentId || existing?.assignedAgentId || sv.assignedAgentId;
            const mergedGiftedByAgentName = existing?.giftedByAgentName || sv.giftedByAgentName || existing?.assignedAgentName || sv.assignedAgentName;

            const mergedVoucher: Voucher = {
              ...(existing || {}),
              ...cleanedSv,
              status: mergedStatus,
              ...(effectivePrice !== undefined ? { price: effectivePrice } : {}),
              ...(effectivePlan ? { plan: effectivePlan } : {}),
              ...(effectiveLocation ? { location: effectiveLocation } : {}),
              ...(effectiveNetwork ? { networkName: effectiveNetwork } : {}),
              ...(isLocalNewer ? { isDirty: true } : { isDirty: false }),
              isFree: mergedIsFree,
              ...(mergedGiftedAt ? { giftedAt: mergedGiftedAt } : {}),
              ...(mergedGiftedByAgentId ? { giftedByAgentId: mergedGiftedByAgentId } : {}),
              ...(mergedGiftedByAgentName ? { giftedByAgentName: mergedGiftedByAgentName } : {}),
              ...(mergedSoldAt ? { soldAt: mergedSoldAt } : {}),
              ...(mergedSoldPrice !== undefined ? { soldPrice: mergedSoldPrice } : {}),
              ...(mergedOriginalPrice !== undefined ? { originalPrice: mergedOriginalPrice } : {}),
              ...(mergedDiscount !== undefined ? { discountApplied: mergedDiscount } : {}),
              ...(mergedCustName ? { customerName: mergedCustName } : {}),
              ...(mergedCustCell ? { customerCell: mergedCustCell } : {}),
              ...(mergedCustId ? { customerId: mergedCustId } : {}),
              ...(mergedCustNum ? { customerNumber: mergedCustNum } : {}),
              ...(mergedAssignedAgentId ? { assignedAgentId: mergedAssignedAgentId } : {}),
              ...(mergedAssignedAgentName ? { assignedAgentName: mergedAssignedAgentName } : {}),
              ...(mergedAssignedAgentEmail ? { assignedAgentEmail: mergedAssignedAgentEmail } : {}),
              ...(mergedSoldByAgentId ? { soldByAgentId: mergedSoldByAgentId } : {}),
            };

            const CANONICAL_PLAN_PRICES: Record<string, number> = {
              'MONTH_45GB': 10.00,
              'MONTH_32GB': 7.00,
              'MONTH_23GB': 5.00,
              '2_WEEKS_15GB': 3.00,
              'Week': 2.00,
              '2HRS_6GB': 1.00,
              '1HR_10GB': 1.00,
              '3day': 1.00,
              '1HR_4GB': 0.50,
              '30M_2GB': 0.25,
              'Monthly': 6.00,
              '5 Days': 2.00,
              'Starter': 0.00,
              'Gold': 35.00,
              'Lithium': 75.00,
              '24Hours_Unlimited': 15.00
            };

            // Comprehensive self-healing of plan prices during server sync
            if (CANONICAL_PLAN_PRICES[mergedVoucher.plan] !== undefined) {
              const canonicalPrice = CANONICAL_PLAN_PRICES[mergedVoucher.plan];
              if (mergedStatus === 'Sold' && mergedVoucher.soldPrice !== undefined && mergedVoucher.soldPrice > 0) {
                mergedVoucher.price = mergedVoucher.soldPrice;
                mergedVoucher.originalPrice = canonicalPrice;
              } else {
                mergedVoucher.price = canonicalPrice;
                mergedVoucher.originalPrice = canonicalPrice;
                if (mergedStatus === 'Sold') mergedVoucher.soldPrice = canonicalPrice;
              }
            } else if (mergedStatus === 'Sold' && mergedVoucher.soldPrice !== undefined && mergedVoucher.soldPrice > 0) {
              mergedVoucher.price = mergedVoucher.soldPrice;
            }

            if (mergedVoucher.plan === '2HRS_6GB' || mergedVoucher.duration === '2 Hours' || ['zhuxz8', 'pdw7se', '7u6fjf', 'esuzt7', 'qnm8xt', 'imudrq'].includes(cleanCode)) {
              mergedVoucher.plan = '2HRS_6GB';
              mergedVoucher.duration = '2 Hours';
            } else if (mergedVoucher.plan === '1HR_10GB' || cleanCode === 'd6k3vf') {
              mergedVoucher.plan = '1HR_10GB';
              mergedVoucher.duration = '1 Hour';
            }

            if (mergedStatus !== 'Sold') {
              delete mergedVoucher.soldAt;
              delete mergedVoucher.soldPrice;
              delete mergedVoucher.discountApplied;
              delete mergedVoucher.customerName;
              delete mergedVoucher.customerCell;
              delete mergedVoucher.customerId;
              delete mergedVoucher.customerNumber;
              delete mergedVoucher.giftedAt;
              delete mergedVoucher.giftedByAgentId;
              delete mergedVoucher.giftedByAgentName;
            }

            if (!existing || existing.status !== mergedVoucher.status || existing.soldAt !== mergedVoucher.soldAt || existing.soldPrice !== mergedVoucher.soldPrice) {
              changed = true;
            }

            map.set(sv.id, mergedVoucher);
          });

          const merged = Array.from(map.values()).filter(v => (!v.plan || !activeDeletedPlans.has(v.plan)) && v.id !== 'test_gift_voucher_101');
          if (merged.length !== prev.length) {
            changed = true;
          }
          if (!changed) return prev;
          try {
            saveVouchersCache(merged, 'wivote_vouchers');
            if (wsId) saveVouchersCache(merged.filter(v => resolveVoucherWorkspaceId(v, wsId) === wsId), `wivote_ws_vouchers_${wsId}`);
          } catch (e) {}
          return merged;
        });
      }

      // 2. Sync legacy devices (Strictly preserving approved and sold status)
      if (Array.isArray(data.legacyDevices) && data.legacyDevices.length > 0) {
        setLegacyDevices(prev => {
          const map = new Map<string, LegacyDevice>();
          prev.forEach(l => map.set(l.id, l));
          let changed = false;
          data.legacyDevices.forEach((sl: LegacyDevice) => {
            const existing = map.get(sl.id);
            if (!existing) {
              map.set(sl.id, sl);
              changed = true;
            } else {
              const isExistingApproved = existing.isApproved === true || existing.status === 'SOLD' || existing.status === 'APPROVED';
              const isIncomingApproved = sl.isApproved === true || sl.status === 'SOLD' || sl.status === 'APPROVED';
              const mergedApproved = isExistingApproved ? true : (sl.isApproved ?? existing.isApproved);
              const mergedStatus = isExistingApproved && sl.status !== 'SOLD' && sl.status !== 'APPROVED'
                ? (existing.status || 'SOLD')
                : (sl.status || existing.status);

              const mergedDevice: LegacyDevice = {
                ...existing,
                ...sl,
                isApproved: mergedApproved,
                status: mergedStatus,
                soldPrice: existing.soldPrice !== undefined ? existing.soldPrice : sl.soldPrice,
                soldAt: existing.soldAt || sl.soldAt
              };

              if (
                existing.status !== mergedDevice.status ||
                existing.isApproved !== mergedDevice.isApproved ||
                existing.soldPrice !== mergedDevice.soldPrice ||
                existing.soldAt !== mergedDevice.soldAt
              ) {
                map.set(sl.id, mergedDevice);
                changed = true;
              }
            }
          });
          return changed ? Array.from(map.values()) : prev;
        });
      }

      // 3. Sync customers
      if (Array.isArray(data.customers) && data.customers.length > 0) {
        const targetWsId = wsId || activeWorkspace?.id || currentUser?.workspaceId || 'ws_client_1788646327740';
        setCustomers(prev => {
          const map = new Map<string, Customer>();
          prev.forEach(c => map.set(c.id, c));
          data.customers.forEach((sc: Customer) => {
            const resolvedWs = sc.workspaceId || targetWsId;
            const sanitizedSc = { ...sc, workspaceId: resolvedWs };
            const existing = map.get(sc.id);
            if (!existing) {
              map.set(sc.id, sanitizedSc);
            } else if (existing.updatedAt && sc.updatedAt && sc.updatedAt >= existing.updatedAt) {
              map.set(sc.id, { ...existing, ...sanitizedSc });
            }
          });
          const merged = Array.from(map.values());
          try {
            safeSetItem('wivote_customers', JSON.stringify(merged));
            safeSetItem(`wivote_ws_customers_${targetWsId}`, JSON.stringify(merged.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId)));
          } catch (e) {}
          return merged;
        });
      }

      // 4. Sync requests (Strictly preserving Approved & Declined terminal status)
      if (Array.isArray(data.requests) && data.requests.length > 0) {
        const deletedIds = getDeletedRequestIds();
        setRequests(prev => {
          const map = new Map<string, VoucherRequest>();
          prev.filter(r => !deletedIds.has(r.id)).forEach(r => map.set(r.id, r));
          let changed = false;
          data.requests.forEach((sr: VoucherRequest) => {
            if (!sr || !sr.id || deletedIds.has(sr.id)) return;
            const existing = map.get(sr.id);
            if (!existing) {
              map.set(sr.id, sr);
              changed = true;
            } else {
              const isExistingTerminal = existing.status === 'Fulfilled' || existing.status === 'Declined';
              const isIncomingTerminal = sr.status === 'Fulfilled' || sr.status === 'Declined';

              if (isExistingTerminal && !isIncomingTerminal) {
                // Strictly preserve terminal status: Never revert Fulfilled or Declined back to Pending
                return;
              }

              if (isIncomingTerminal && !isExistingTerminal) {
                map.set(sr.id, { ...existing, ...sr });
                changed = true;
              } else if (existing.status !== sr.status) {
                const existingTime = new Date((existing as any).updatedAt || existing.timestamp || 0).getTime();
                const incomingTime = new Date((sr as any).updatedAt || sr.timestamp || 0).getTime();
                if (incomingTime >= existingTime) {
                  map.set(sr.id, { ...existing, ...sr });
                  changed = true;
                }
              }
            }
          });
          return changed ? Array.from(map.values()) : prev;
        });
      }

      // 5. Sync cash drops (Strictly preserving Approved & Reconciled status)
      if (Array.isArray(data.cashDrops) && data.cashDrops.length > 0) {
        setCashDrops(prev => {
          const map = new Map<string, CashDrop>();
          prev.forEach(c => map.set(c.id, c));
          let changed = false;
          data.cashDrops.forEach((sc: CashDrop) => {
            const existing = map.get(sc.id);
            if (!existing) {
              map.set(sc.id, sc);
              changed = true;
            } else {
              const isExistingApproved = existing.status === 'Approved' || existing.status === 'Reconciled';
              const isIncomingApproved = sc.status === 'Approved' || sc.status === 'Reconciled';
              const mergedStatus = (isExistingApproved && !isIncomingApproved)
                ? existing.status
                : (sc.status || existing.status);

              const mergedDrop: CashDrop = {
                ...existing,
                ...sc,
                status: mergedStatus,
                approvedAt: existing.approvedAt || sc.approvedAt,
                notes: existing.notes || sc.notes
              };

              if (
                existing.status !== mergedDrop.status ||
                existing.amount !== mergedDrop.amount ||
                existing.approvedAt !== mergedDrop.approvedAt
              ) {
                map.set(sc.id, mergedDrop);
                changed = true;
              }
            }
          });
          return changed ? Array.from(map.values()) : prev;
        });
      }

      setIsMetricsSyncing(false);
      setGlobalLoading(false);
      return true;
    } catch (e) {
      console.warn("syncWithServerBridge note:", e);
      setIsMetricsSyncing(false);
      return false;
    } finally {
      isSyncingRef.current = false;
      setIsMetricsSyncing(false);
    }
  };

  // --- Debounced Auto-Flush Engine & Mutation Dispatcher ---
  const initialPendingCount = (() => {
    try {
      const saved = localStorage.getItem('wivote_pending_mutations_count');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  })();
  const pendingMutationsCountRef = useRef<number>(initialPendingCount);
  const [pendingMutationsCount, setPendingMutationsCount] = useState<number>(initialPendingCount);

  // Track whether any actual user writes have been executed on the client
  const hasUserWrittenRef = useRef<boolean>(false);
  const hasWritesSinceLastBackupRef = useRef<boolean>(false);

  const [serverAuthoritativeMetrics, setServerAuthoritativeMetrics] = useState<Record<string, any>>(() => {
    try {
      const saved = localStorage.getItem('wivote_authoritative_metrics');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const autoFlushDebounceTimerRef = useRef<any>(null);
  const isPushingRef = useRef<boolean>(false);

  const triggerAutoPushEngine = useCallback(async (triggerReason?: string) => {
    // Passive background/lifecycle events that should NEVER push unless uncommitted user writes exist
    const isPassiveLifecycleEvent = !triggerReason || [
      'visibility_change_foreground',
      'device_online_reconnect',
      'lifecycle_flush',
      'auto_interval'
    ].includes(triggerReason);

    // If passive background trigger and no user writes have been done, SKIP DB push entirely!
    if (isPassiveLifecycleEvent && pendingMutationsCountRef.current <= 0 && !hasUserWrittenRef.current) {
      return;
    }

    // Silent offline preservation: Never throw disruptive alerts or block POS if device is offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log(`[WiVoTe AutoSync] Offline mode active during '${triggerReason || 'action'}'. Silently preserving local mutation state.`);
      return;
    }

    // Concurrency lock flag (isPushing) to prevent duplicate transactions or write collisions
    if (isPushingRef.current) {
      console.log(`[WiVoTe AutoSync] Concurrency lock active during '${triggerReason || 'action'}'. Skipping parallel write.`);
      return;
    }

    isPushingRef.current = true;
    setIsPushingToDb(true);

    try {
      const res = await forcePushLocalToGlobalDB(true);
      if (res.success) {
        pendingMutationsCountRef.current = 0;
        setPendingMutationsCount(0);
        hasUserWrittenRef.current = false;
        try { localStorage.setItem('wivote_pending_mutations_count', '0'); } catch {}
        // Only show toast on actual user write mutations, not passive lifecycle events
        if (!isPassiveLifecycleEvent && triggerReason) {
          showToast(`✓ Auto-synced records to Global DB!`, 'success');
        }
      }
    } catch (err) {
      console.warn(`[WiVoTe AutoSync] Auto-push notice for '${triggerReason || 'action'}':`, err);
    } finally {
      isPushingRef.current = false;
      setTimeout(() => {
        setIsPushingToDb(false);
      }, 800);
    }
  }, []);

  const dispatchRecordMutated = useCallback((actionName: string, payload?: any) => {
    // Flag that a genuine user-effected write occurred
    hasUserWrittenRef.current = true;
    hasWritesSinceLastBackupRef.current = true;

    // 1. Increment pending count locally
    setPendingMutationsCount(prev => {
      const next = prev + 1;
      pendingMutationsCountRef.current = next;
      try { localStorage.setItem('wivote_pending_mutations_count', String(next)); } catch {}
      return next;
    });

    // 2. Dispatch custom window event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wivote:record-mutated', {
          detail: { action: actionName, payload, timestamp: Date.now() }
        })
      );
    }

    // 3. Debounced Auto-Flush Engine (300ms–500ms delay: 400ms)
    if (autoFlushDebounceTimerRef.current) {
      clearTimeout(autoFlushDebounceTimerRef.current);
    }

    autoFlushDebounceTimerRef.current = setTimeout(() => {
      triggerAutoPushEngine(actionName);
    }, 400);
  }, [triggerAutoPushEngine]);

  const autoPushActionToDb = useCallback((actionName: string, wsId?: string) => {
    dispatchRecordMutated(actionName, { workspaceId: wsId });
  }, [dispatchRecordMutated]);

  // Lifecycle & Offline Reconnection Triggers
  useEffect(() => {
    const handleOnline = () => {
      // Only flush on reconnect if there are actual pending mutations waiting
      if (pendingMutationsCountRef.current > 0 || hasUserWrittenRef.current) {
        console.log("[WiVoTe Lifecycle] Device reconnected (online). Flushing pending mutations...");
        triggerAutoPushEngine('device_online_reconnect');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Only trigger push if user has made mutations while offline/hidden
        if (pendingMutationsCountRef.current > 0 || hasUserWrittenRef.current) {
          console.log("[WiVoTe Lifecycle] App foregrounded with pending mutations. Triggering sync flush...");
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            triggerAutoPushEngine('visibility_change_foreground');
          }
        }
      }
    };

    const handleRecordMutatedEvent = (e: Event) => {
      // Event listener for custom window events
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('wivote:record-mutated', handleRecordMutatedEvent);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('wivote:record-mutated', handleRecordMutatedEvent);
    };
  }, [triggerAutoPushEngine]);

  // Explicitly scan all local browser caches across all workspaces and push all local transactions/customers to the global DB
  const forcePushLocalToGlobalDB = async (isSilent: boolean = false): Promise<{
    success: boolean;
    vouchersCount: number;
    customersCount: number;
    legacyDevicesCount: number;
    requestsCount: number;
    cashDropsCount: number;
  }> => {
    try {
      // If silent auto-push, only proceed if there are actual uncommitted user writes or dirty records
      if (isSilent && pendingMutationsCountRef.current <= 0 && !hasUserWrittenRef.current) {
        const hasDirtyVouchers = (vouchers || []).some(v => v.isDirty);
        if (!hasDirtyVouchers) {
          return {
            success: true,
            vouchersCount: 0,
            customersCount: 0,
            legacyDevicesCount: 0,
            requestsCount: 0,
            cashDropsCount: 0
          };
        }
      }

      if (!isSilent) {
        setIsPushingToDb(true);
        setIsRefetching(true);
        showToast("Scanning device local storage for offline transactions & records...", "info");
      }

      // 1. Gather vouchers from localStorage FIRST, then overlay in-memory React state (which holds active edits)
      const voucherMap = new Map<string, Voucher>();

      const rawVouchers = localStorage.getItem('wivote_vouchers');
      if (rawVouchers) {
        try {
          const parsed = safeJsonParse<any[]>(rawVouchers, []);
          if (Array.isArray(parsed)) parsed.forEach(v => { if (v && v.id) voucherMap.set(v.id, v); });
        } catch (e) {}
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('wivote_ws_vouchers_') || key.startsWith('wivote_vouchers_'))) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = safeJsonParse<any[]>(raw, []);
              if (Array.isArray(parsed)) parsed.forEach(v => { if (v && v.id) voucherMap.set(v.id, v); });
            }
          } catch (e) {}
        }
      }

      // Authoritatively overlay in-memory React state (holds active user edits like price/plan/location updates)
      (vouchers || []).forEach(v => {
        if (!v || !v.id) return;
        const existing = voucherMap.get(v.id);
        if (!existing) {
          voucherMap.set(v.id, v);
        } else {
          const existingTime = new Date(existing.updatedAt || existing.timestamp || existing.createdAt || 0).getTime();
          const stateTime = new Date(v.updatedAt || v.timestamp || v.createdAt || 0).getTime();
          if (v.isDirty || stateTime >= existingTime) {
            voucherMap.set(v.id, { ...existing, ...v });
          }
        }
      });

      // Authoritatively overlay confirmed sold and gifted records from registry so none are pushed as Unused
      try {
        const soldReg = getSoldVouchersRegistry();
        soldReg.forEach(soldV => {
          if (soldV && soldV.id) {
            const existing = voucherMap.get(soldV.id);
            voucherMap.set(soldV.id, {
              ...(existing || {}),
              ...soldV,
              status: 'Sold' as VoucherStatus,
              isDirty: false,
              syncStatus: 'synced'
            } as Voucher);
          }
        });
      } catch (e) {}

      // 2. Gather customers from state + all localStorage keys
      const customerMap = new Map<string, Customer>();
      (customers || []).forEach(c => customerMap.set(c.id, c));

      const rawCustomers = localStorage.getItem('wivote_customers');
      if (rawCustomers) {
        try {
          const parsed = safeJsonParse<any[]>(rawCustomers, []);
          if (Array.isArray(parsed)) parsed.forEach(c => { if (c && c.id) customerMap.set(c.id, c); });
        } catch (e) {}
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('wivote_ws_customers_') || key.startsWith('wivote_customers_'))) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = safeJsonParse<any[]>(raw, []);
              if (Array.isArray(parsed)) parsed.forEach(c => { if (c && c.id) customerMap.set(c.id, c); });
            }
          } catch (e) {}
        }
      }

      // 3. Gather legacy devices
      const legacyMap = new Map<string, LegacyDevice>();
      (legacyDevices || []).forEach(l => legacyMap.set(l.id, l));

      const rawLegacy = localStorage.getItem('wivote_legacy_devices');
      if (rawLegacy) {
        try {
          const parsed = safeJsonParse<any[]>(rawLegacy, []);
          if (Array.isArray(parsed)) parsed.forEach(l => { if (l && l.id) legacyMap.set(l.id, l); });
        } catch (e) {}
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wivote_ws_legacy_')) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = safeJsonParse<any[]>(raw, []);
              if (Array.isArray(parsed)) parsed.forEach(l => { if (l && l.id) legacyMap.set(l.id, l); });
            }
          } catch (e) {}
        }
      }

      // 4. Gather requests (Filtering deleted requests and preserving terminal statuses)
      const deletedReqIds = getDeletedRequestIds();
      const requestMap = new Map<string, VoucherRequest>();
      (requests || []).filter(r => !deletedReqIds.has(r.id)).forEach(r => requestMap.set(r.id, r));

      const rawReqs = localStorage.getItem('wivote_requests');
      if (rawReqs) {
        try {
          const parsed = safeJsonParse<any[]>(rawReqs, []);
          if (Array.isArray(parsed)) {
            parsed.forEach(r => {
              if (r && r.id && !deletedReqIds.has(r.id)) {
                const existing = requestMap.get(r.id);
                if (!existing) {
                  requestMap.set(r.id, r);
                } else {
                  const isExistingTerminal = existing.status === 'Fulfilled' || existing.status === 'Declined';
                  const isIncomingTerminal = r.status === 'Fulfilled' || r.status === 'Declined';
                  const finalStatus = (isExistingTerminal && !isIncomingTerminal) ? existing.status : r.status;
                  requestMap.set(r.id, { ...existing, ...r, status: finalStatus });
                }
              }
            });
          }
        } catch (e) {}
      }

      // 5. Gather cash drops
      const cashDropMap = new Map<string, CashDrop>();
      (cashDrops || []).forEach(cd => cashDropMap.set(cd.id, cd));

      const rawDrops = localStorage.getItem('wivote_cash_drops');
      if (rawDrops) {
        try {
          const parsed = safeJsonParse<any[]>(rawDrops, []);
          if (Array.isArray(parsed)) parsed.forEach(cd => { if (cd && cd.id) cashDropMap.set(cd.id, cd); });
        } catch (e) {}
      }

      const localVouchers = Array.from(voucherMap.values());
      const localCustomers = Array.from(customerMap.values());
      const localLegacy = Array.from(legacyMap.values());
      const localReqs = Array.from(requestMap.values());
      const localDrops = Array.from(cashDropMap.values());

      // Batch push to server sync store
      const res = await fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_BATCH',
          payload: {
            vouchers: localVouchers,
            customers: localCustomers,
            legacyDevices: localLegacy,
            requests: localReqs,
            cashDrops: localDrops
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Sync server responded with status ${res.status}`);
      }

      // Ingest latest push mirror from server or capture client snapshot
      try {
        const mutateData = await res.json().catch(() => null);
        if (mutateData && mutateData.latestDbPushMetricsMirror) {
          setLatestDbPushMetricsMirror(mutateData.latestDbPushMetricsMirror);
          try {
            localStorage.setItem('wivote_latest_db_push_metrics_mirror', JSON.stringify(mutateData.latestDbPushMetricsMirror));
          } catch {}
        } else {
          captureClientMetricsSnapshot();
        }
      } catch {
        captureClientMetricsSnapshot();
      }
      setIsAuthoritativeDataReady(true);

      // Clear pending mutations count on success
      setPendingMutationsCount(0);
      try { localStorage.setItem('wivote_pending_mutations_count', '0'); } catch {}

      const soldCount = localVouchers.filter(v => v.status === 'Sold').length;

      if (!isSilent) {
        showToast(
          `✓ Pushed local data to global database! (${localVouchers.length} vouchers [${soldCount} sold], ${localCustomers.length} customers, ${localLegacy.length} legacy devices synced)`,
          'success'
        );
      }

      return {
        success: true,
        vouchersCount: localVouchers.length,
        customersCount: localCustomers.length,
        legacyDevicesCount: localLegacy.length,
        requestsCount: localReqs.length,
        cashDropsCount: localDrops.length
      };
    } catch (err: any) {
      console.error("forcePushLocalToGlobalDB error:", err);
      if (!isSilent) {
        showToast(`Push to global DB warning: ${err.message || 'Operation completed with local cache retention'}`, 'info');
      }
      return {
        success: false,
        vouchersCount: 0,
        customersCount: 0,
        legacyDevicesCount: 0,
        requestsCount: 0,
        cashDropsCount: 0
      };
    } finally {
      if (!isSilent) {
        setIsRefetching(false);
      }
      setTimeout(() => {
        setIsPushingToDb(false);
      }, 1200);
    }
  };

  // Download complete JSON snapshot of current workspace data for offline preservation & restoration
  const downloadWorkspaceSnapshot = () => {
    try {
      const targetWsId = currentUser?.workspaceId || currentUserWorkspaceId || activeWorkspace?.id || 'ws_vakzim';
      const wsVouchers = vouchers.filter(v => resolveVoucherWorkspaceId(v, targetWsId) === targetWsId || !v.workspaceId);
      const wsCustomers = customers.filter(c => c.workspaceId === targetWsId || !c.workspaceId);
      const wsLegacy = legacyDevices.filter(l => l.workspaceId === targetWsId || !l.workspaceId);
      const wsUsers = users.filter(u => u.workspaceId === targetWsId || !u.workspaceId);
      const wsRequests = requests.filter(r => (r as any).workspaceId === targetWsId || !r.workspaceId);
      const wsCashDrops = cashDrops.filter(c => (c as any).workspaceId === targetWsId || !c.workspaceId);

      const snapshot = {
        metadata: {
          format: "wivote_workspace_snapshot_v1",
          exportDate: new Date().toISOString(),
          exportedByEmail: currentUser?.email || '',
          exportedByName: currentUser?.name || 'User',
          exportedByRole: currentUser?.role || 'User',
          workspaceId: targetWsId,
          workspaceName: activeWorkspace?.name || 'WiVoTe Workspace',
          totalVouchers: wsVouchers.length,
          totalCustomers: wsCustomers.length,
          totalLegacyDevices: wsLegacy.length,
          totalUsers: wsUsers.length,
          totalRequests: wsRequests.length,
          totalCashDrops: wsCashDrops.length
        },
        workspace: activeWorkspace || { id: targetWsId, name: 'WiVoTe Workspace' },
        vouchers: wsVouchers,
        customers: wsCustomers,
        legacyDevices: wsLegacy,
        users: wsUsers,
        requests: wsRequests,
        cashDrops: wsCashDrops
      };

      const jsonString = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const sanitizedWsName = (activeWorkspace?.name || 'workspace').toLowerCase().replace(/[^a-z0-9]/gi, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      link.href = url;
      link.download = `wivote_snapshot_${sanitizedWsName}_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`✓ Workspace snapshot exported successfully! (${wsVouchers.length} vouchers, ${wsCustomers.length} customers, ${wsLegacy.length} devices saved)`, 'success');
    } catch (err: any) {
      console.error("downloadWorkspaceSnapshot error:", err);
      showToast(`Failed to export workspace snapshot: ${err?.message || err}`, 'error');
    }
  };

  // Restore workspace data from a JSON snapshot file
  const restoreWorkspaceSnapshot = async (snapshotJson: string): Promise<{ success: boolean; error?: string; restoredSummary?: string }> => {
    try {
      if (!snapshotJson || typeof snapshotJson !== 'string') {
        return { success: false, error: "Invalid snapshot JSON content." };
      }

      const parsed = safeJsonParse<any>(snapshotJson, null);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: "Snapshot file format is invalid or corrupted." };
      }

      const incomingVouchers: Voucher[] = Array.isArray(parsed.vouchers) ? parsed.vouchers : [];
      const incomingCustomers: Customer[] = Array.isArray(parsed.customers) ? parsed.customers : [];
      const incomingLegacy: LegacyDevice[] = Array.isArray(parsed.legacyDevices) ? parsed.legacyDevices : [];
      const incomingUsers: UserProfile[] = Array.isArray(parsed.users) ? parsed.users : [];
      const incomingReqs: VoucherRequest[] = Array.isArray(parsed.requests) ? parsed.requests : [];
      const incomingDrops: CashDrop[] = Array.isArray(parsed.cashDrops) ? parsed.cashDrops : [];

      if (incomingVouchers.length === 0 && incomingCustomers.length === 0 && incomingLegacy.length === 0 && incomingUsers.length === 0) {
        return { success: false, error: "Snapshot file contains no workspace data records to restore." };
      }

      setIsRefetching(true);
      showToast("Restoring workspace snapshot to central database...", "info");

      // Send to central sync store via SYNC_BATCH
      const res = await fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_BATCH',
          payload: {
            vouchers: incomingVouchers,
            customers: incomingCustomers,
            legacyDevices: incomingLegacy,
            users: incomingUsers,
            requests: incomingReqs,
            cashDrops: incomingDrops,
            workspaces: parsed.workspace ? [parsed.workspace] : undefined
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Sync server responded with status ${res.status}`);
      }

      // Update state locally
      if (incomingVouchers.length > 0) {
        setVouchers(prev => {
          const map = new Map<string, Voucher>();
          prev.forEach(v => map.set(v.id, v));
          incomingVouchers.forEach(v => { if (v && v.id) map.set(v.id, v); });
          const merged = Array.from(map.values());
          try { saveVouchersCache(merged, 'wivote_vouchers'); } catch (e) {}
          return merged;
        });
      }

      if (incomingCustomers.length > 0) {
        setCustomers(prev => {
          const map = new Map<string, Customer>();
          prev.forEach(c => map.set(c.id, c));
          incomingCustomers.forEach(c => { if (c && c.id) map.set(c.id, c); });
          return Array.from(map.values());
        });
      }

      if (incomingLegacy.length > 0) {
        setLegacyDevices(prev => {
          const map = new Map<string, LegacyDevice>();
          prev.forEach(l => map.set(l.id, l));
          incomingLegacy.forEach(l => { if (l && l.id) map.set(l.id, l); });
          return Array.from(map.values());
        });
      }

      if (incomingUsers.length > 0) {
        setUsers(prev => {
          const map = new Map<string, UserProfile>();
          prev.forEach(u => map.set(u.uid, u));
          incomingUsers.forEach(u => { if (u && u.uid) map.set(u.uid, u); });
          return Array.from(map.values());
        });
      }

      // Re-sync with server bridge
      await syncWithServerBridge();

      const summaryStr = `Restored ${incomingVouchers.length} vouchers, ${incomingCustomers.length} customers, ${incomingLegacy.length} devices, ${incomingUsers.length} users`;
      showToast(`✓ Workspace snapshot restored! (${summaryStr})`, 'success');

      return {
        success: true,
        restoredSummary: summaryStr
      };
    } catch (err: any) {
      console.error("restoreWorkspaceSnapshot error:", err);
      const errMsg = err?.message || 'Failed to parse or restore snapshot file.';
      showToast(`Restore Error: ${errMsg}`, 'error');
      return { success: false, error: errMsg };
    } finally {
      setIsRefetching(false);
    }
  };

  const refetchData = async () => {
    if (isRefetching) return;
    try {
      setIsRefetching(true);

      // Always synchronize with the central server bridge first (0 quota cost, real-time cross-device)
      await syncWithServerBridge();

      if (isFirebasePlaceholder) {
        setLastRefreshedAt(new Date());
        return;
      }

      // 1. Re-fetch Workspaces securely based on role to avoid Firestore security rules violations
      const loggedInUserEmail = (currentUser?.email || '').toLowerCase().trim();
      const isDeveloperEmail = loggedInUserEmail === 'karimazondomike049@gmail.com';
      const isAppOwner = currentUser?.role === 'AppOwner' || currentUserRole === 'AppOwner' || isDeveloperEmail;

      let wsSnap;
      if (isAppOwner) {
        wsSnap = await getDocs(collection(db, 'workspaces'));
      } else if (loggedInUserEmail) {
        const qFiltered = query(collection(db, 'workspaces'), where('ownerEmail', '==', loggedInUserEmail));
        wsSnap = await getDocs(qFiltered);
      } else {
        wsSnap = null;
      }

      if (wsSnap) {
        const wsData: Workspace[] = [];
        wsSnap.forEach(d => wsData.push({ id: d.id, ...d.data() } as Workspace));
        if (wsData.length > 0) {
          setWorkspaces(prev => {
            const map = new Map<string, Workspace>();
            // Seed initial fallback workspaces first so settings are never lost
            initialWorkspaces.forEach(w => map.set(w.id, w));
            prev.forEach(w => map.set(w.id, { ...(map.get(w.id) || {}), ...w }));

            wsData.forEach(incoming => {
              const existing = map.get(incoming.id);
              if (!existing) {
                map.set(incoming.id, incoming);
              } else {
                map.set(incoming.id, {
                  ...existing,
                  ...incoming,
                  cashCloseSettings: incoming.cashCloseSettings || existing.cashCloseSettings,
                  giveawaySettings: incoming.giveawaySettings || existing.giveawaySettings,
                  ownerEmail: incoming.ownerEmail || existing.ownerEmail
                });
              }
            });
            return Array.from(map.values());
          });
        }
      }

      // 2. Re-fetch Root Users (held in memory so state updates atomically with workspace users)
      const usersSnap = await getDocs(collection(db, 'users'));
      const rootUsersData: UserProfile[] = [];
      usersSnap.forEach(d => rootUsersData.push({ uid: d.id, ...d.data() } as UserProfile));

      // 3. Re-fetch Active Workspace sub-collections if applicable
      if (!isLoggedIn || !currentUser) {
        setLoading(false);
        return;
      }
      const targetWorkspaceId = currentUser.workspaceId || currentUserWorkspaceId || (currentUser.role !== 'AppOwner' ? activeWorkspace?.id : null);
      if (targetWorkspaceId && targetWorkspaceId !== 'system') {
        const [vSnap, rSnap, cdSnap, ldSnap, nSnap, fbSnap, wsUsersSnap, wsDocSnap] = await Promise.allSettled([
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'vouchers')),
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'requests')),
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'cash_drops')),
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'legacy_devices')),
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'notifications')),
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'feedback')),
          getDocs(collection(db, 'workspaces', targetWorkspaceId, 'users')),
          getDoc(doc(db, 'workspaces', targetWorkspaceId))
        ]);

        if (vSnap.status === 'fulfilled') {
          const vData: Voucher[] = [];
          vSnap.value.forEach(d => {
            const raw = d.data();
            const rawStatus = (raw.status || '').toString().toLowerCase();
            const normalizedStatus: VoucherStatus = 
              rawStatus === 'assigned' ? 'Assigned' :
              rawStatus === 'sold' ? 'Sold' :
              'Unused';
            const cleanCode = sanitizeVoucherCode({ id: d.id, code: raw.code });
            vData.push({ id: d.id, ...raw, code: cleanCode, status: normalizedStatus } as Voucher);
          });
          if (vData.length > 0) {
            setVouchers(prev => {
              const map = new Map<string, Voucher>();
              prev.forEach(v => map.set(v.id, v));

              const soldReg = getSoldVouchersRegistry();

              vData.forEach(incoming => {
                const cleanCode = sanitizeVoucherCode(incoming);
                let existing = map.get(incoming.id);
                if (!existing && cleanCode) {
                  for (const pVal of map.values()) {
                    if (pVal.code === incoming.code || sanitizeVoucherCode(pVal) === cleanCode) {
                      existing = pVal;
                      break;
                    }
                  }
                }

                const soldRec = soldReg.get(incoming.id) || 
                                (cleanCode ? soldReg.get(cleanCode.toLowerCase().trim()) : undefined) ||
                                (incoming.code ? soldReg.get(incoming.code.toLowerCase().trim()) : undefined);

                const isExistingSold = existing && (String(existing.status).toLowerCase() === 'sold' || !!existing.soldAt);
                const isIncomingSold = String(incoming.status).toLowerCase() === 'sold' || !!incoming.soldAt;
                const isIncomingReversalApproved = incoming.reversalStatus === 'Approved' || !!incoming.reversedAt;
                const isRegisteredSold = !!soldRec;

                const isReversalApproved = isIncomingReversalApproved || (
                  !isIncomingSold && (
                    (existing && (existing.reversalStatus === 'Approved' || !!existing.reversedAt)) ||
                    reversalRequests.some(r => r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (r.transactionId === incoming.id || r.referenceCode?.toLowerCase().trim() === cleanCode?.toLowerCase().trim()))
                  )
                );
                const preserveSold = isIncomingSold || ((isExistingSold || isRegisteredSold) && !isReversalApproved);

                const mergedAssignedAgentId = existing?.assignedAgentId || incoming.assignedAgentId || soldRec?.assignedAgentId;
                const mergedAssignedAgentName = existing?.assignedAgentName || incoming.assignedAgentName || soldRec?.assignedAgentName;
                const mergedAssignedAgentEmail = (existing as any)?.assignedAgentEmail || (incoming as any).assignedAgentEmail || soldRec?.assignedAgentEmail;
                const mergedSoldByAgentId = (existing as any)?.soldByAgentId || (incoming as any).soldByAgentId || soldRec?.soldByAgentId;
                const mergedSoldByAgentName = (existing as any)?.soldByAgentName || (incoming as any).soldByAgentName || soldRec?.soldByAgentName;

                const mergedStatus: VoucherStatus = preserveSold 
                  ? 'Sold' 
                  : (isReversalApproved 
                      ? (mergedAssignedAgentId ? 'Assigned' : 'Unused')
                      : (incoming.status === 'Sold' ? 'Sold' : (incoming.status || existing?.status || (mergedAssignedAgentId ? 'Assigned' : 'Unused'))));
                const targetKey = existing ? existing.id : incoming.id;

                const mergedSoldAt = mergedStatus === 'Sold' ? (existing?.soldAt || incoming.soldAt || soldRec?.soldAt || new Date().toISOString()) : undefined;
                const mergedSoldPrice = mergedStatus === 'Sold' ? (existing?.soldPrice !== undefined ? existing.soldPrice : (incoming.soldPrice !== undefined ? incoming.soldPrice : soldRec?.soldPrice)) : undefined;
                const mergedOriginalPrice = existing?.originalPrice !== undefined ? existing.originalPrice : (incoming.originalPrice || soldRec?.originalPrice || incoming.price);
                const mergedDiscount = mergedStatus === 'Sold' ? (existing?.discountApplied !== undefined ? existing.discountApplied : (incoming.discountApplied !== undefined ? incoming.discountApplied : soldRec?.discountApplied)) : undefined;
                const mergedCustName = mergedStatus === 'Sold' ? (existing?.customerName || incoming.customerName || soldRec?.customerName) : undefined;
                const mergedCustCell = mergedStatus === 'Sold' ? (existing?.customerCell || incoming.customerCell || soldRec?.customerCell) : undefined;
                const mergedCustId = mergedStatus === 'Sold' ? (existing?.customerId || incoming.customerId || soldRec?.customerId) : undefined;
                const mergedCustNum = mergedStatus === 'Sold' ? (existing?.customerNumber || incoming.customerNumber || soldRec?.customerNumber) : undefined;

                const itemObj: Voucher = {
                  ...(existing || {}),
                  ...incoming,
                  code: cleanCode || incoming.code || existing?.code,
                  workspaceId: (incoming as any).workspaceId || existing?.workspaceId || targetWorkspaceId,
                  status: mergedStatus,
                  ...(mergedSoldAt ? { soldAt: mergedSoldAt } : {}),
                  ...(mergedSoldPrice !== undefined ? { soldPrice: mergedSoldPrice } : {}),
                  ...(mergedOriginalPrice !== undefined ? { originalPrice: mergedOriginalPrice } : {}),
                  ...(mergedDiscount !== undefined ? { discountApplied: mergedDiscount } : {}),
                  ...(mergedCustName ? { customerName: mergedCustName } : {}),
                  ...(mergedCustCell ? { customerCell: mergedCustCell } : {}),
                  ...(mergedCustId ? { customerId: mergedCustId } : {}),
                  ...(mergedCustNum ? { customerNumber: mergedCustNum } : {}),
                  ...(mergedAssignedAgentId ? { assignedAgentId: mergedAssignedAgentId } : {}),
                  ...(mergedAssignedAgentName ? { assignedAgentName: mergedAssignedAgentName } : {}),
                  ...(mergedAssignedAgentEmail ? { assignedAgentEmail: mergedAssignedAgentEmail } : {}),
                  ...(mergedSoldByAgentId ? { soldByAgentId: mergedSoldByAgentId } : {}),
                  ...(mergedSoldByAgentName ? { soldByAgentName: mergedSoldByAgentName } : {})
                };
                if (mergedStatus !== 'Sold') {
                  delete itemObj.soldAt;
                  delete itemObj.soldPrice;
                  delete itemObj.discountApplied;
                  delete itemObj.customerName;
                  delete itemObj.customerCell;
                  delete itemObj.customerId;
                  delete itemObj.customerNumber;
                }
                map.set(targetKey, itemObj);
              });

              // Deduplicate map by cleanCode prioritizing Sold vouchers
              const byCodeMap = new Map<string, Voucher>();
              Array.from(map.values()).forEach(v => {
                const cKey = sanitizeVoucherCode(v).toLowerCase().trim() || v.id;
                const prevEntry = byCodeMap.get(cKey);
                if (!prevEntry || v.status === 'Sold' || (prevEntry.status !== 'Sold' && v.status === 'Assigned')) {
                  byCodeMap.set(cKey, v);
                }
              });

              return Array.from(byCodeMap.values());
            });
          }
        }

        if (rSnap.status === 'fulfilled') {
          const rData: VoucherRequest[] = [];
          rSnap.value.forEach(d => rData.push({ id: d.id, ...d.data() } as VoucherRequest));
          if (rData.length > 0) {
            setRequests(prev => {
              const map = new Map<string, VoucherRequest>();
              prev.forEach(r => map.set(r.id, r));
              rData.forEach(incoming => {
                const existing = map.get(incoming.id);
                map.set(incoming.id, {
                  ...(existing || {}),
                  ...incoming,
                  workspaceId: (incoming as any).workspaceId || (existing as any)?.workspaceId || targetWorkspaceId
                });
              });
              return Array.from(map.values());
            });
          }
        }

        if (cdSnap.status === 'fulfilled') {
          const cdData: CashDrop[] = [];
          cdSnap.value.forEach(d => cdData.push({ id: d.id, ...d.data() } as CashDrop));
          if (cdData.length > 0) {
            setCashDrops(prev => {
              const map = new Map<string, CashDrop>();
              prev.forEach(c => map.set(c.id, c));
              cdData.forEach(incoming => {
                const existing = map.get(incoming.id);
                const isExistingApproved = existing?.status === 'Approved' || existing?.status === 'Reconciled' || !!existing?.approvedAt;
                const isIncomingApproved = incoming.status === 'Approved' || incoming.status === 'Reconciled' || !!incoming.approvedAt;
                const mergedStatus = (isExistingApproved && !isIncomingApproved) ? existing!.status : (incoming.status || existing?.status || 'Pending');
                const mergedApprovedAt = incoming.approvedAt || existing?.approvedAt;
                const mergedApprovedBy = incoming.approvedBy || existing?.approvedBy;

                map.set(incoming.id, {
                  ...(existing || {}),
                  ...incoming,
                  status: mergedStatus,
                  approvedAt: mergedApprovedAt,
                  approvedBy: mergedApprovedBy,
                  workspaceId: (incoming as any).workspaceId || (existing as any)?.workspaceId || targetWorkspaceId
                });
              });
              return Array.from(map.values());
            });
          }
        }

        if (ldSnap.status === 'fulfilled') {
          const ldData: LegacyDevice[] = [];
          ldSnap.value.forEach(d => ldData.push({ id: d.id, ...d.data() } as LegacyDevice));
          if (ldData.length > 0) {
            setLegacyDevices(prev => {
              const map = new Map<string, LegacyDevice>();
              prev.forEach(ld => map.set(ld.id, ld));
              ldData.forEach(incoming => {
                const existing = map.get(incoming.id);
                const isExistingApproved = existing?.isApproved === true || existing?.status === 'SOLD' || existing?.status === 'APPROVED';
                const isIncomingApproved = incoming.isApproved === true || incoming.status === 'SOLD' || incoming.status === 'APPROVED';
                const mergedApproved = isExistingApproved ? true : (incoming.isApproved ?? existing?.isApproved ?? false);
                const mergedStatus = isExistingApproved && incoming.status !== 'SOLD' && incoming.status !== 'APPROVED'
                  ? (existing?.status || 'SOLD')
                  : (incoming.status || existing?.status || 'PENDING');

                map.set(incoming.id, {
                  ...(existing || {}),
                  ...incoming,
                  isApproved: mergedApproved,
                  status: mergedStatus,
                  workspaceId: (incoming as any).workspaceId || (existing as any)?.workspaceId || targetWorkspaceId
                });
              });
              return deduplicateLegacyDevices(Array.from(map.values()));
            });
          }
        }

        if (nSnap.status === 'fulfilled') {
          const nData: SystemNotification[] = [];
          nSnap.value.forEach(d => nData.push({ id: d.id, ...d.data() } as SystemNotification));
          setNotifications(nData);
        }

        if (fbSnap.status === 'fulfilled') {
          const fbData: FeedbackMessage[] = [];
          fbSnap.value.forEach(d => fbData.push({ id: d.id, ...d.data() } as FeedbackMessage));
          setFeedback(fbData);
        }

        const wsUsersData: UserProfile[] = [];
        if (wsUsersSnap.status === 'fulfilled') {
          wsUsersSnap.value.forEach(d => wsUsersData.push({ uid: d.id, ...d.data() } as UserProfile));
        }

        // Unified atomic update for all users: workspace subcollection takes precedence over root
        if (rootUsersData.length > 0 || wsUsersData.length > 0) {
          setUsers(prev => {
            const map = new Map<string, UserProfile>();
            prev.forEach(u => map.set(u.uid, u));
            const appOwnerFallback = prev.find(u => u.role === 'AppOwner' && u.workspaceId === 'system');
            if (appOwnerFallback && !rootUsersData.some(u => u.uid === appOwnerFallback.uid || (u.email && u.email.toLowerCase() === appOwnerFallback.email.toLowerCase()))) {
              map.set(appOwnerFallback.uid, appOwnerFallback);
            }

            // 1. Merge root users safely without overriding established photos or custom commission rates
            rootUsersData.forEach(u => {
              const cleanEmail = (u.email || '').toLowerCase().trim();
              const existing = map.get(u.uid) || (cleanEmail ? Array.from(map.values()).find(ex => (ex.email || '').toLowerCase().trim() === cleanEmail) : undefined);
              const targetKey = existing ? existing.uid : u.uid;

              const isIncomingDefaultPic = isSeedOrMockProfilePic(u.profilePic);
              const isExistingDefaultPic = isSeedOrMockProfilePic(existing?.profilePic);
              const safePic = !isIncomingDefaultPic && u.profilePic
                ? u.profilePic
                : (!isExistingDefaultPic && existing?.profilePic ? existing.profilePic : (existing?.profilePic || u.profilePic || ''));

              // Do not overwrite an established custom commission rate with undefined or default 10 from root user
              const safeComm = (u.commissionRate !== undefined && u.commissionRate !== null && (u.commissionRate !== 10 || existing?.commissionRate === undefined))
                ? u.commissionRate
                : (existing?.commissionRate !== undefined ? existing.commissionRate : u.commissionRate);

              const merged: UserProfile = {
                ...(existing || {}),
                ...u,
                profilePic: safePic,
                commissionRate: safeComm,
                cellNumber: (u.cellNumber && u.cellNumber !== '+263770000000') ? u.cellNumber : (existing?.cellNumber || '+263770000000'),
                workspaceId: (u.workspaceId && u.workspaceId !== 'system') ? u.workspaceId : (existing?.workspaceId || 'ws_vakzim')
              };
              map.set(targetKey, merged);
            });

            // 2. Merge workspace users (highest authority for agent settings)
            wsUsersData.forEach(incoming => {
              const cleanEmail = (incoming.email || '').toLowerCase().trim();
              const existing = map.get(incoming.uid) || (cleanEmail ? Array.from(map.values()).find(u => (u.email || '').toLowerCase().trim() === cleanEmail) : undefined);
              const targetKey = existing ? existing.uid : incoming.uid;

              const isIncomingDefaultPic = isSeedOrMockProfilePic(incoming.profilePic);
              const isExistingDefaultPic = isSeedOrMockProfilePic(existing?.profilePic);
              const safePic = !isIncomingDefaultPic && incoming.profilePic
                ? incoming.profilePic
                : (!isExistingDefaultPic && existing?.profilePic ? existing.profilePic : (incoming.profilePic || existing?.profilePic || ''));

              const safeComm = (incoming.commissionRate !== undefined && incoming.commissionRate !== null)
                ? incoming.commissionRate
                : (existing?.commissionRate !== undefined ? existing.commissionRate : incoming.commissionRate);

              const merged: UserProfile = {
                ...(existing || {}),
                ...incoming,
                profilePic: safePic,
                commissionRate: safeComm,
                cellNumber: (incoming.cellNumber && incoming.cellNumber !== '+263770000000') ? incoming.cellNumber : (existing?.cellNumber || '+263770000000'),
                workspaceId: incoming.workspaceId || existing?.workspaceId || targetWorkspaceId || 'ws_vakzim'
              };
              map.set(targetKey, merged);
            });

            return Array.from(map.values());
          });
        }

        if (wsDocSnap.status === 'fulfilled' && wsDocSnap.value.exists()) {
          const wsObj = { id: wsDocSnap.value.id, ...wsDocSnap.value.data() } as Workspace;
          setWorkspaces(prev => prev.map(w => {
            if (w.id !== wsObj.id) return w;
            return {
              ...w,
              ...wsObj,
              cashCloseSettings: wsObj.cashCloseSettings || w.cashCloseSettings,
              giveawaySettings: wsObj.giveawaySettings || w.giveawaySettings
            };
          }));
        }
      } else if (rootUsersData.length > 0) {
        setUsers(prev => {
          const map = new Map<string, UserProfile>();
          prev.forEach(u => map.set(u.uid, u));
          rootUsersData.forEach(u => {
            const cleanEmail = (u.email || '').toLowerCase().trim();
            const existing = map.get(u.uid) || (cleanEmail ? Array.from(map.values()).find(ex => (ex.email || '').toLowerCase().trim() === cleanEmail) : undefined);
            const targetKey = existing ? existing.uid : u.uid;
            const isIncomingDefaultPic = isSeedOrMockProfilePic(u.profilePic);
            const isExistingDefaultPic = isSeedOrMockProfilePic(existing?.profilePic);
            const safePic = !isIncomingDefaultPic && u.profilePic
              ? u.profilePic
              : (!isExistingDefaultPic && existing?.profilePic ? existing.profilePic : (existing?.profilePic || u.profilePic || ''));
            const safeComm = (u.commissionRate !== undefined && u.commissionRate !== null && (u.commissionRate !== 10 || existing?.commissionRate === undefined))
              ? u.commissionRate
              : (existing?.commissionRate !== undefined ? existing.commissionRate : u.commissionRate);
            map.set(targetKey, {
              ...(existing || {}),
              ...u,
              profilePic: safePic,
              commissionRate: safeComm
            });
          });
          return Array.from(map.values());
        });
      }

      setLastRefreshedAt(new Date());
    } catch (err) {
      console.warn("Live Refresh Firestore poll warning:", err);
    } finally {
      setIsRefetching(false);
      setIsAuthoritativeDataReady(true);
    }
  };

  const toggleLiveRefresh = () => {
    setIsLiveRefresh(prev => {
      const next = !prev;
      localStorage.setItem('wivote_live_refresh_enabled', String(next));
      if (next) {
        setRefreshCountdown(30);
        refetchData();
      }
      return next;
    });
  };

  // Continuous real-time server bridge sync across all devices (0 Firestore reads)
  useEffect(() => {
    setLastRefreshedAt(new Date());
    if (!isLoggedIn) return;

    syncWithServerBridge();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      syncWithServerBridge();
    }, 20000);

    const onFocus = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        syncWithServerBridge();
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      if (syncAbortControllerRef.current) {
        try { syncAbortControllerRef.current.abort(); } catch {}
      }
    };
  }, [isLoggedIn, currentUser?.workspaceId, currentUserWorkspaceId, activeWorkspace?.id]);

  // Centralized Live Refresh Countdown Ticker (keeps timer live across all UI components)
  useEffect(() => {
    if (!isLiveRefresh || !isLoggedIn) return;

    const ticker = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          refetchData().catch(() => {});
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [isLiveRefresh, isLoggedIn]);

  // --- API proxy logic for image censorship via Gemini on our custom Express server ---
  const censorImage = async (base64: string): Promise<{ safe: boolean; reason?: string }> => {
    try {
      const response = await fetch('/api/censor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 })
      });
      if (!response.ok) {
        throw new Error("Server responded with error status: " + response.status);
      }
      return await response.json();
    } catch (error) {
      console.error("Censorship proxy call failed:", error);
      // fallback in case backend is loading/offline
      return { safe: true };
    }
  };

  // --- Operations Implementation ---

  // 1. Voucher Import Protocol
  const uploadVouchers = (
    csvText: string,
    defaultLocation: string = '',
    networkName: string = ''
  ) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Voucher Inventory Upload');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return { success: false, count: 0, duplicatesCount: 0, errors: [authVerdict.error || 'Access restricted'] };
    }

    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) {
      return { success: false, count: 0, duplicatesCount: 0, errors: ['CSV must have header and at least one voucher row.'] };
    }

    // Smart separator detection (handles both CSV and Excel copy-pasted tabbed layout)
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';

    // Process header
    const headers = firstLine.split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    // Find column mappings
    const codeIndex = headers.findIndex(h => /Voucher code/i.test(h) || /code/i.test(h));
    const planIndex = headers.findIndex(h => 
      /User group\/Plan/i.test(h) || 
      /group name/i.test(h) || 
      /group_name/i.test(h) || 
      /plan/i.test(h) || 
      /group/i.test(h) || 
      /tier/i.test(h) || 
      /profile/i.test(h)
    );
    const priceIndex = headers.findIndex(h => /Price\/Amount/i.test(h) || /price/i.test(h) || /amount/i.test(h) || /rate/i.test(h));
    const durationIndex = headers.findIndex(h => /Period\/Duration/i.test(h) || /period/i.test(h) || /duration/i.test(h));
    const locationIndex = headers.findIndex(h => /Location\/place/i.test(h) || /location/i.test(h) || /place/i.test(h) || /site/i.test(h));

    if (codeIndex === -1) {
      return { success: false, count: 0, duplicatesCount: 0, errors: ['Could not find a valid "Voucher code" header column.'] };
    }

    const newVouchers: Voucher[] = [];
    const errors: string[] = [];
    let duplicatesCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parser supporting quotes and the dynamic separator
      const values: string[] = [];
      let currentVal = '';
      let inQuotes = false;
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
          values.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      values.push(currentVal.trim());

      const rawCode = values[codeIndex]?.replace(/^["']|["']$/g, '').trim();
      const code = sanitizeVoucherCode(rawCode);
      if (!code) continue;

      // Prevent duplicate voucher code upload
      const isDuplicate = vouchers.some(v => v.code === code) || newVouchers.some(v => v.code === code);
      if (isDuplicate) {
        duplicatesCount++;
        continue;
      }

      // Map values - Voucher plan name must be drawn from the voucher upload document.
      // Vouchers with different plans will be uploaded simultaneously.
      const planVal = planIndex !== -1 && values[planIndex] ? values[planIndex].replace(/^["']|["']$/g, '').trim() : '';
      const plan = planVal || '30Days_Unlimited';

      const rawPrice = priceIndex !== -1 ? values[priceIndex] : '';
      const price = rawPrice ? parseFloat(rawPrice.replace(/[^\d.]/g, '')) : NaN;
      
      const durationVal = durationIndex !== -1 && values[durationIndex] ? values[durationIndex].replace(/^["']|["']$/g, '').trim() : '';
      const duration = durationVal || '30 Days';
      
      // If the document does not have location, the space must be left blank for editing later by admin.
      const locVal = locationIndex !== -1 && values[locationIndex] ? values[locationIndex].replace(/^["']|["']$/g, '').trim() : '';
      const location = locVal || '';

      // Validation alerts
      if (isNaN(price)) {
        errors.push(`Row ${i + 1}: Missing Price/Amount.`);
      }

      newVouchers.push({
        id: `v_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        code,
        plan,
        price: isNaN(price) ? 0 : price,
        duration,
        location,
        networkName: networkName || '',
        status: 'Unused'
      });
    }

    if (newVouchers.length > 0) {
      setVouchers(prev => {
        const existingIds = new Set(prev.map(v => v.id));
        const filteredNew = newVouchers.filter(v => !existingIds.has(v.id));
        const updated = [...prev, ...filteredNew];
        try {
          saveVouchersCache(updated, 'wivote_vouchers');
        } catch (e) {}
        return updated;
      });

      // If Firestore is real, sync newly uploaded vouchers
      const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
      if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
        newVouchers.forEach(async (v) => {
          try {
            await setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', v.id), cleanForFirestore({
              ...v,
              workspaceId: targetWsId
            }), { merge: true });
          } catch (e) {
            console.error(e);
          }
        });

        // Create notification doc
        const systemNotifId = `notif_${Date.now()}`;
        const systemNotifDoc: SystemNotification = {
          id: systemNotifId,
          message: `Workspace admin uploaded ${newVouchers.length} new voucher(s) into inventory.`,
          senderName: currentUser ? currentUser.name : 'System',
          timestamp: new Date().toISOString(),
          location: 'Global'
        };
        setDoc(doc(db, 'workspaces', targetWsId, 'notifications', systemNotifId), cleanForFirestore(systemNotifDoc)).catch(console.error);
        fetch('/api/sync/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'SYNC_BATCH',
            payload: { vouchers: newVouchers }
          })
        }).catch(console.warn);
        autoPushActionToDb(`Generation: ${newVouchers.length} Vouchers Generated`, targetWsId);
      }
    }

    return {
      success: errors.length === 0,
      count: newVouchers.length,
      duplicatesCount,
      errors
    };
  };

  // 2. Admin-Agent Assignment Protocol (with strict Double Allocation prevention and upgraded allocation policy)
  const assignVouchersToAgent = (voucherIds: string[], agentId: string): { success: boolean; assignedCount: number; doubleAllocatedCodes: string[] } => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Assign Vouchers to Agent');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return { success: false, assignedCount: 0, doubleAllocatedCodes: [] };
    }

    const agent = users.find(u => u.uid === agentId) || users.find(u => u.email && u.email.toLowerCase() === agentId.toLowerCase());
    if (!agent) {
      showToast('Selected agent could not be found.', 'error');
      return { success: false, assignedCount: 0, doubleAllocatedCodes: [] };
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || agent.workspaceId || 'ws_vakzim';

    // Check for double allocation: Flag vouchers that are already allocated or sold
    const targetVouchers = vouchers.filter(v => voucherIds.includes(v.id));
    const alreadyAllocated = targetVouchers.filter(v => v.status === 'Assigned' || !!v.assignedAgentId || v.status === 'Sold');

    if (alreadyAllocated.length > 0) {
      const allocatedSummary = alreadyAllocated.map(v => 
        v.status === 'Sold'
          ? `${v.code} (Already Sold)`
          : `${v.code} (Allocated to ${v.assignedAgentName || 'Agent'})`
      ).join(', ');

      // Audit Log policy enforcement violation
      logAuditAction({
        category: 'workspace',
        action: 'POLICY_VIOLATION_REALLOCATION_BLOCKED',
        title: 'Reallocation Policy Enforced',
        description: `Blocked attempted reallocation of ${alreadyAllocated.length} voucher(s) [${allocatedSummary}] to agent ${agent.name}. Policy strictly forbids reallocating active allocations to the same or another agent without prior revocation.`
      }).catch(console.error);
    }

    // Strict Allocation Policy: Only allow genuinely unallocated vouchers to be assigned
    const unallocatedVouchers = targetVouchers.filter(v => v.status !== 'Assigned' && !v.assignedAgentId && v.status !== 'Sold');
    const unallocatedIds = unallocatedVouchers.map(v => v.id);

    if (unallocatedIds.length === 0) {
      showToast(`🔒 Allocation Policy Enforced: Reallocation blocked! All ${voucherIds.length} selected voucher(s) are already allocated or sold. Vouchers already allocated cannot be reallocated either to the same agent or another agent. Please revoke the existing allocation first.`, 'error');
      return {
        success: false,
        assignedCount: 0,
        doubleAllocatedCodes: alreadyAllocated.map(v => v.code)
      };
    }

    setVouchers(prev => {
      const updatedList = prev.map(v => {
        if (unallocatedIds.includes(v.id)) {
          const wsForDoc = resolveVoucherWorkspaceId(v, targetWsId);
          const finalWsId = agent.workspaceId || wsForDoc || targetWsId || v.workspaceId || 'ws_vakzim';
          const assignedAgentId = agent.uid || agentId;
          const cleanCode = sanitizeVoucherCode(v);
          const updated: Voucher = {
            ...v,
            code: cleanCode,
            workspaceId: finalWsId,
            status: 'Assigned' as VoucherStatus,
            assignedAgentId: assignedAgentId,
            assignedAgentName: agent.name,
            assignedAgentEmail: agent.email || (v as any).assignedAgentEmail || (v as any).agentEmail,
            assignedTo: agent.name,
            assignedAt: new Date().toISOString()
          };
          if (!isFirebasePlaceholder && currentUser) {
            const wsTargets = new Set<string>();
            if (targetWsId && targetWsId !== 'system') wsTargets.add(targetWsId);
            if (wsForDoc && wsForDoc !== 'system') wsTargets.add(wsForDoc);
            if (agent.workspaceId && agent.workspaceId !== 'system') wsTargets.add(agent.workspaceId);
            wsTargets.forEach(wsId => {
              setDoc(doc(db, 'workspaces', wsId, 'vouchers', v.id), cleanForFirestore({
                ...updated,
                code: cleanCode,
                status: 'Assigned',
                assignedAgentId: assignedAgentId
              }), { merge: true }).catch(err => {
                handleFirestoreError(err, OperationType.WRITE, `workspaces/${wsId}/vouchers/${v.id}`);
              });
            });
          }
          return updated;
        }
        return v;
      });

      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}

      return updatedList;
    });

    // Real-time server sync bridge replication across all devices
    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ASSIGN_VOUCHERS',
        payload: {
          voucherIds: unallocatedIds,
          vouchers: unallocatedVouchers.map(v => ({ ...v, code: sanitizeVoucherCode(v) })),
          agentId: agent.uid || agentId,
          agentName: agent.name,
          agentEmail: agent.email || '',
          workspaceId: targetWsId || agent.workspaceId,
          assignedAt: new Date().toISOString()
        }
      })
    }).catch(e => console.warn('Sync mutate assign error:', e));

    autoPushActionToDb(`Assign Vouchers: ${unallocatedIds.length} Vouchers Assigned`, targetWsId);

    if (alreadyAllocated.length > 0) {
      showToast(`Assigned ${unallocatedIds.length} unallocated voucher(s) to ${agent.name}. 🔒 ${alreadyAllocated.length} voucher(s) were blocked because they are already allocated and cannot be reallocated without prior revocation.`, 'info');
    } else {
      showToast(`Successfully assigned ${unallocatedIds.length} voucher${unallocatedIds.length === 1 ? '' : 's'} to ${agent.name}!`, 'success');
    }

    return {
      success: true,
      assignedCount: unallocatedIds.length,
      doubleAllocatedCodes: alreadyAllocated.map(v => v.code)
    };
  };

  // 2b. Revoke Voucher Allocation Protocol (Workspace Master only)
  const revokeVoucherAllocation = async (
    voucherIds: string[],
    reason?: string,
    mode: 'pool' | 'delete' = 'pool'
  ): Promise<{ success: boolean; revokedCount: number; message: string }> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Revoke Voucher Allocation');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return { success: false, revokedCount: 0, message: authVerdict.error || 'Access restricted' };
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    // Target vouchers that are currently allocated and NOT sold
    const targetVouchers = vouchers.filter(v => voucherIds.includes(v.id));
    const allocToRevoke = targetVouchers.filter(v => (v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold');

    if (allocToRevoke.length === 0) {
      const soldCount = targetVouchers.filter(v => v.status === 'Sold').length;
      const msg = soldCount > 0
        ? `Cannot revoke allocation: ${soldCount} voucher(s) are already sold (sales are immutable financial records). No active allocations found to revoke.`
        : `No active agent allocations found among the selected vouchers.`;
      showToast(msg, 'error');
      return { success: false, revokedCount: 0, message: msg };
    }

    const revokedIds = allocToRevoke.map(v => v.id);
    const revokedCodes = allocToRevoke.map(v => v.code);
    const affectedAgentNames = Array.from(new Set(allocToRevoke.map(v => v.assignedAgentName || 'Agent'))).join(', ');
    const nowIso = new Date().toISOString();
    const revokedByName = currentUser?.name || currentUser?.email || 'Workspace Master';
    const finalReason = reason?.trim() || 'Revoked by Workspace Master';
    const affectedAgentIds = Array.from(new Set(allocToRevoke.map(v => v.assignedAgentId).filter(Boolean))) as string[];

    if (mode === 'delete') {
      // 1. Permanently delete from local state
      setVouchers(prev => prev.filter(v => !revokedIds.includes(v.id)));

      // 2. Permanently delete from Firestore
      if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
        revokedIds.forEach(id => {
          deleteDoc(doc(db, 'workspaces', targetWsId, 'vouchers', id)).catch(err => {
            handleFirestoreError(err, OperationType.DELETE, `workspaces/${targetWsId}/vouchers/${id}`);
          });
        });
      }

      // 3. Log to Audit Trail
      await logAuditAction({
        category: 'workspace',
        action: 'VOUCHER_ALLOCATION_PERMANENTLY_DELETED',
        title: 'Voucher Allocation Revoked & Permanently Deleted',
        description: `Permanently deleted ${revokedIds.length} allocated voucher(s) (${revokedCodes.slice(0, 5).join(', ')}${revokedCodes.length > 5 ? '...' : ''}) from agent(s) [${affectedAgentNames}]. Active agent links permanently severed. Reason: ${finalReason}`
      }).catch(console.error);

      // 4. System Notification for Agent (Mandated: "More personal notifications must show to the concerned user only.")
      addNotification(`Voucher code(s) [${revokedCodes.join(', ')}] revoked by admin when deleted.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: affectedAgentIds,
        targetAgentNames: [affectedAgentNames],
        isBroadcast: false
      });

      autoPushActionToDb(`Revoke & Delete Vouchers: ${revokedIds.length} Vouchers Deleted`, targetWsId);
      showToast(`✓ Successfully revoked & deleted ${revokedIds.length} voucher(s). Agent link severed.`, 'success');

      return {
        success: true,
        revokedCount: revokedIds.length,
        message: `Successfully revoked and permanently deleted ${revokedIds.length} voucher(s).`
      };
    } else {
      // RETURN TO MAIN INVENTORY POOL
      // 1. Update local state
      setVouchers(prev => prev.map(v => {
        if (revokedIds.includes(v.id)) {
          return {
            ...v,
            status: 'Unused' as VoucherStatus,
            assignedAgentId: undefined,
            assignedAgentName: undefined,
            assignedAt: undefined,
            revokedAt: nowIso,
            revokedBy: revokedByName,
            revokedReason: finalReason
          };
        }
        return v;
      }));

      // 2. Sync to Firestore
      if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
        revokedIds.forEach(id => {
          setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', id), cleanForFirestore({
            status: 'Unused',
            assignedAgentId: null,
            assignedAgentName: null,
            assignedAt: null,
            revokedAt: nowIso,
            revokedBy: revokedByName,
            revokedReason: finalReason
          }), { merge: true }).catch(err => {
            handleFirestoreError(err, OperationType.WRITE, `workspaces/${targetWsId}/vouchers/${id}`);
          });
        });
      }

      // Real-time server sync bridge replication
      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REVOKE_ALLOCATION',
          payload: { voucherIds: revokedIds }
        })
      }).catch(console.warn);

      // 3. Log to Audit Trail
      await logAuditAction({
        category: 'workspace',
        action: 'VOUCHER_ALLOCATION_REVOKED',
        title: 'Voucher Allocation Revoked',
        description: `Revoked allocation of ${revokedIds.length} voucher(s) (${revokedCodes.slice(0, 5).join(', ')}${revokedCodes.length > 5 ? '...' : ''}) from agent(s) [${affectedAgentNames}]. Returned to main inventory pool. Reason: ${finalReason}`
      }).catch(console.error);

      // 4. System Notification
      addNotification(`Voucher code(s) [${revokedCodes.join(', ')}] revoked by admin and returned to the main inventory pool.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: affectedAgentIds,
        targetAgentNames: [affectedAgentNames],
        isBroadcast: false
      });

      autoPushActionToDb(`Revoke Vouchers: ${revokedIds.length} Vouchers Returned to Pool`, targetWsId);
      showToast(`✓ Successfully revoked allocation of ${revokedIds.length} voucher(s)! Returned to unallocated pool.`, 'success');

      return {
        success: true,
        revokedCount: revokedIds.length,
        message: `Successfully revoked allocation of ${revokedIds.length} voucher(s).`
      };
    }
  };

  // 3. Sales Transaction Protocol with Genius Loyalty and Universal Customer Tracking
  const completeSale = async (
    voucherId: string, 
    customerName: string, 
    customerCell: string,
    loyaltyDiscount: number = 0,
    customerNumber?: string,
    loyaltyNotice?: string
  ): Promise<{ success: boolean; customer?: Customer; finalPrice: number; discount: number; customerNumber: string; loyaltyNotice?: string }> => {
    let soldVoucherCode = "";
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';
    const cleanTargetCode = sanitizeVoucherCode(voucherId);
    const targetVoucher = vouchers.find(v => 
      v.id === voucherId || 
      v.code === voucherId || 
      (cleanTargetCode && sanitizeVoucherCode(v) === cleanTargetCode) || 
      v.id === `v_${voucherId}` || 
      `v_${v.code}` === voucherId
    );

    if (!targetVoucher) {
      showToast('Error: Voucher not found', 'error');
      return { success: false, finalPrice: 0, discount: 0, customerNumber: '' };
    }

    // STRICT RESALE PREVENTION: A sold voucher cannot be sold again unless its sale has been reversed (reversalStatus === 'Approved')
    if (targetVoucher.status === 'Sold' && targetVoucher.reversalStatus !== 'Approved') {
      showToast(`🔒 Cannot sell voucher ${targetVoucher.code}: Voucher has already been sold and cannot be sold again unless its sale is reversed.`, 'error');
      return { success: false, finalPrice: 0, discount: 0, customerNumber: '' };
    }

    soldVoucherCode = targetVoucher.code;
    const originalPrice = targetVoucher.price;
    const isFreeGiveaway = isVoucherFree(targetVoucher, giveawaySettings) || targetVoucher.isFree === true || isPlanMarkedFree(targetVoucher.plan, giveawaySettings) || (loyaltyDiscount >= originalPrice && originalPrice > 0);
    const discount = isFreeGiveaway ? originalPrice : Math.max(0, loyaltyDiscount || 0);
    const finalSoldPrice = isFreeGiveaway ? 0 : Math.max(0, originalPrice - discount);

    // Identify or create customer record for Genius Loyalty tracking
    const cleanName = (customerName || '').trim() || 'Walk-in Client';
    const cleanCell = (customerCell || '').trim();
    const cellDigits = cleanCell.replace(/\D/g, '');

    // Search for existing customer
    const existingCustomer = customers.find(c => {
      if (customerNumber && c.customerNumber.toLowerCase() === customerNumber.toLowerCase()) return true;
      if (cellDigits.length >= 6) {
        const cDigits = (c.cellNumber || '').replace(/\D/g, '');
        if (cDigits.length >= 6 && cDigits === cellDigits) return true;
      }
      if (cleanName && cleanName.toLowerCase() !== 'walk-in client' && (c.name || '').toLowerCase() === cleanName.toLowerCase()) {
        return true;
      }
      return false;
    });

    const custId = existingCustomer?.id || getDeterministicCustomerId(cleanName, cleanCell);
    
    // Ensure customerNumber is strictly unique and reclaims lowest free slot if deleted/vacant
    let custNumber = existingCustomer?.customerNumber;
    if (!custNumber) {
      if (customerNumber && !isCustomerNumberTaken(customerNumber, customers, existingCustomer?.id)) {
        custNumber = customerNumber;
      } else {
        custNumber = getNextCustomerNumber(customers, existingCustomer?.id);
      }
    }
    const now = Date.now();

    const purchaseRec: CustomerPurchaseRecord = {
      id: `pur_${Date.now()}`,
      voucherId: targetVoucher.id,
      voucherCode: targetVoucher.code,
      price: finalSoldPrice,
      discountApplied: discount,
      originalPrice,
      timestamp: now,
      agentId: currentUser?.uid || 'agent',
      agentName: currentUser?.name || 'Agent',
      plan: targetVoucher.plan
    };

    // Calculate updated streak / consecutivePurchases:
    // User Rules:
    // - For those rewarded at the 3rd month consecutive means they were buying every month for the past 2 months and their new cycle begins on the 4th month.
    // - For those rewarded at the 4th month consecutive means they were buying every month for the past 3 months and their new cycle begins on the 5th month.
    // - Streak counting applies to customers buying vouchers worth $3 or more.
    let updatedConsecutive: CustomerPurchaseRecord[] = [];
    const minQualifying = activeWorkspace?.loyaltySettings?.minQualifyingPrice ?? 3.0;
    const voucherWorth = Math.max(originalPrice, targetVoucher.price || 0, targetVoucher.originalPrice || 0);

    if (discount > 0) {
      // Reward was redeemed! Streak resets so next purchase begins cycle 2 / next reward cycle.
      updatedConsecutive = [];
    } else {
      const prevConsecutive = existingCustomer?.consecutivePurchases || [];
      if (voucherWorth >= minQualifying) {
        // Build base consecutive preserving recorded streak count if existing array had fewer records
        let baseConsecutive = [...prevConsecutive];
        const existingStreak = Math.max(prevConsecutive.length, existingCustomer?.streakCount || 0);
        if (baseConsecutive.length < existingStreak) {
          const diff = existingStreak - baseConsecutive.length;
          for (let k = 0; k < diff; k++) {
            baseConsecutive.unshift({
              id: `pur_prior_${custId}_${k}`,
              voucherId: `synth_hist_${k}`,
              voucherCode: `STRK-${k + 1}`,
              price: minQualifying,
              discountApplied: 0,
              originalPrice: minQualifying,
              timestamp: now - (diff - k) * 60000,
              agentId: currentUser?.uid || 'agent',
              agentName: currentUser?.name || 'Agent',
              plan: 'Qualifying Voucher'
            });
          }
        }
        updatedConsecutive = [...baseConsecutive, purchaseRec];
      } else {
        // Less than $3: does not qualify for streak count, preserves existing streak without advancing
        updatedConsecutive = prevConsecutive;
      }
    }

    const updatedCustomer: Customer = {
      id: custId,
      workspaceId: targetWsId,
      customerNumber: custNumber,
      name: cleanName,
      cellNumber: cleanCell,
      createdAt: existingCustomer?.createdAt || now,
      updatedAt: now,
      totalPurchases: (existingCustomer?.totalPurchases || 0) + 1,
      totalSpend: (existingCustomer?.totalSpend || 0) + finalSoldPrice,
      totalSaved: (existingCustomer?.totalSaved || 0) + discount,
      consecutivePurchases: updatedConsecutive,
      streakCount: updatedConsecutive.length,
      lastPurchaseDate: now,
      lastAgentName: currentUser?.name || 'Agent',
      lastVoucherCode: targetVoucher.code,
      savedByUserId: currentUser?.uid || 'system',
      savedByName: currentUser?.name || currentUser?.email || 'Agent',
      savedByUserRole: currentUser?.role || 'Agent',
      createdByUserId: existingCustomer?.createdByUserId || currentUser?.uid || 'system',
      createdByName: existingCustomer?.createdByName || currentUser?.name || currentUser?.email || 'Agent',
      createdByUserRole: existingCustomer?.createdByUserRole || currentUser?.role || 'Agent'
    };

    // User Rules:
    // - Sub-$3 vouchers do not earn loyalty reward streaks, but customer names are preserved in the customer registry so all dashboards stay in sync!
    // - Anonymous walk-in clients (when no name or "Walk-in Client" is entered) are not added to the registry.
    const isSubThreeDollars = voucherWorth < minQualifying;
    const isWalkInClient = isPlaceholderOrWalkInClient(cleanName);
    const shouldSaveToCustomerList = !isWalkInClient;

    // 1. Prepare Persistence Payloads
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const resolvedDocWsId = resolveVoucherWorkspaceId(targetVoucher, targetWsId);
    const voucherPayload: any = {
      status: 'Sold',
      timestamp: nowIso,
      timestampMs: nowMs,
      soldAt: nowIso,
      soldPrice: finalSoldPrice,
      originalPrice,
      discountApplied: discount,
      customerName: cleanName,
      customerCell: cleanCell,
      customerId: custId,
      customerNumber: custNumber,
      soldByAgentId: currentUser?.uid || targetVoucher.assignedAgentId,
      soldByAgentName: currentUser?.name || targetVoucher.assignedAgentName,
      assignedAgentId: currentUser?.uid || targetVoucher.assignedAgentId,
      assignedAgentName: currentUser?.name || targetVoucher.assignedAgentName,
      assignedAgentEmail: currentUser?.email || (targetVoucher as any).assignedAgentEmail,
      reversalStatus: deleteField(),
      reversalRequested: deleteField(),
      reversalRequestId: deleteField(),
      reversalReason: deleteField(),
      reversalRequestedAt: deleteField(),
      reversedAt: deleteField(),
      reversedBy: deleteField(),
      loyaltyNotice: isFreeGiveaway
        ? '🎁 Customer Gift Voucher (Free Giveaway)'
        : (isSubThreeDollars 
            ? 'Sub-$3 Voucher (Standard sale - No loyalty rewards streak)' 
            : (loyaltyNotice || ''))
    };

    if (isFreeGiveaway) {
      voucherPayload.isFree = true;
      voucherPayload.giftedAt = nowIso;
      voucherPayload.giftedByAgentId = currentUser?.uid || 'agent';
      voucherPayload.giftedByAgentName = currentUser?.name || 'Agent';
    }

    const transactionPayload = {
      id: voucherId,
      transactionId: voucherId,
      voucherId,
      voucherCode: targetVoucher.code,
      type: 'voucher',
      status: 'Sold',
      amount: finalSoldPrice,
      price: finalSoldPrice,
      originalPrice,
      discountApplied: discount,
      plan: targetVoucher.plan,
      duration: targetVoucher.duration,
      location: targetVoucher.location,
      networkName: targetVoucher.networkName,
      customerName: cleanName,
      customerCell: cleanCell,
      customerId: custId,
      customerNumber: custNumber,
      agentId: currentUser?.uid || targetVoucher.assignedAgentId,
      agentName: currentUser?.name || targetVoucher.assignedAgentName,
      agentEmail: currentUser?.email || (targetVoucher as any).assignedAgentEmail,
      workspaceId: targetWsId,
      timestamp: nowIso,
      timestampMs: nowMs,
      soldAt: nowIso
    };

    // 2. GUARANTEED INSTANT OPTIMISTIC LOCAL STATE MUTATION & TOAST
    if (shouldSaveToCustomerList) {
      setCustomers(prev => {
        const idx = prev.findIndex(c => c.id === custId || (c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase()));
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updatedCustomer;
          return copy;
        }
        return [...prev, updatedCustomer];
      });
    }

    setVouchers(prev => {
      const targetCleanCode = sanitizeVoucherCode(targetVoucher);
      const updatedList = prev.map(v => {
        const matchesVoucher = v.id === voucherId || v.code === targetVoucher.code || sanitizeVoucherCode(v) === targetCleanCode;
        if (matchesVoucher) {
          const updatedVoucher: Voucher = {
            ...v,
            status: 'Sold' as VoucherStatus,
            soldAt: nowIso,
            soldPrice: finalSoldPrice,
            originalPrice,
            discountApplied: discount,
            customerName: cleanName,
            customerCell: cleanCell,
            customerId: custId,
            customerNumber: custNumber,
            assignedAgentId: currentUser?.uid || v.assignedAgentId,
            assignedAgentName: currentUser?.name || v.assignedAgentName,
            assignedAgentEmail: currentUser?.email || (v as any).assignedAgentEmail,
            soldByAgentId: currentUser?.uid || targetVoucher.assignedAgentId,
            soldByAgentName: currentUser?.name || targetVoucher.assignedAgentName,
            isFree: isFreeGiveaway ? true : v.isFree,
            giftedAt: isFreeGiveaway ? nowIso : v.giftedAt,
            giftedByAgentId: isFreeGiveaway ? (currentUser?.uid || 'agent') : v.giftedByAgentId,
            giftedByAgentName: isFreeGiveaway ? (currentUser?.name || 'Agent') : v.giftedByAgentName,
            isDirty: true,
            loyaltyNotice: isFreeGiveaway
              ? '🎁 Customer Gift Voucher (Free Giveaway)'
              : (isSubThreeDollars 
                  ? 'Sub-$3 Voucher (Standard sale - No loyalty rewards streak)' 
                  : (loyaltyNotice || ''))
          };
          saveSoldVoucherToRegistry(updatedVoucher);
          delete (updatedVoucher as any).reversalStatus;
          delete (updatedVoucher as any).reversalRequested;
          delete (updatedVoucher as any).reversalRequestId;
          delete (updatedVoucher as any).reversalReason;
          delete (updatedVoucher as any).reversalRequestedAt;
          delete (updatedVoucher as any).reversedAt;
          delete (updatedVoucher as any).reversedBy;
          return updatedVoucher;
        }
        return v;
      });

      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
        if (resolvedDocWsId && resolvedDocWsId !== targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === resolvedDocWsId), `wivote_ws_vouchers_${resolvedDocWsId}`);
        }
      } catch (e) {}

      return updatedList;
    });

    // Mark any prior reversal request for this voucher or voucher code as Resold so old reversal records never block the new sale
    setReversalRequests(prev => {
      let changed = false;
      const targetCleanCode = sanitizeVoucherCode(targetVoucher);
      const updated = prev.map(req => {
        const isMatch = req.transactionId === voucherId || 
          (targetVoucher.code && req.referenceCode && req.referenceCode.toLowerCase().trim() === targetVoucher.code.toLowerCase().trim()) ||
          (targetCleanCode && req.referenceCode && sanitizeVoucherCode(req.referenceCode).toLowerCase().trim() === targetCleanCode.toLowerCase().trim());
        if (isMatch && req.status !== ('Resold' as any)) {
          changed = true;
          return {
            ...req,
            status: 'Resold' as any,
            isResold: true,
            resoldAt: nowIso,
            updatedAt: nowIso
          };
        }
        return req;
      });
      if (changed) {
        try {
          safeSetItem('wivote_reversal_requests', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });

    // Real-time Leaderboard Sync in local memory
    const targetAgentUids = new Set<string>();
    if (targetVoucher.assignedAgentId) targetAgentUids.add(targetVoucher.assignedAgentId);
    if (currentUser?.uid) targetAgentUids.add(currentUser.uid);

    if (targetAgentUids.size > 0 && finalSoldPrice > 0) {
      setUsers(prev => prev.map(u => {
        if (targetAgentUids.has(u.uid) || (currentUser && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase())) {
          return { ...u, performanceScore: (u.performanceScore || 0) + finalSoldPrice };
        }
        return u;
      }));

      setLeaderboardSummary(prev => {
        const updated = { ...prev };
        targetAgentUids.forEach(uId => {
          updated[uId] = (updated[uId] || 0) + finalSoldPrice;
        });
        return updated;
      });
    }

    // Global cross-device sync replication
    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'COMPLETE_SALE',
        payload: {
          voucherId,
          code: targetVoucher.code,
          plan: targetVoucher.plan,
          duration: targetVoucher.duration,
          price: targetVoucher.price,
          location: targetVoucher.location,
          networkName: targetVoucher.networkName,
          status: 'Sold',
          soldAt: nowIso,
          soldPrice: finalSoldPrice,
          originalPrice,
          discountApplied: discount,
          discount,
          customerName: cleanName,
          customerCell: cleanCell,
          customerId: custId,
          customerNumber: custNumber,
          agentId: currentUser?.uid || targetVoucher.assignedAgentId,
          agentName: currentUser?.name || targetVoucher.assignedAgentName,
          assignedAgentId: targetVoucher.assignedAgentId || currentUser?.uid,
          assignedAgentName: targetVoucher.assignedAgentName || currentUser?.name,
          assignedAgentEmail: (targetVoucher as any).assignedAgentEmail || currentUser?.email,
          soldByAgentId: currentUser?.uid || targetVoucher.assignedAgentId,
          soldByAgentName: currentUser?.name || targetVoucher.assignedAgentName,
          workspaceId: targetWsId,
          customer: shouldSaveToCustomerList ? updatedCustomer : undefined,
          isFree: isFreeGiveaway ? true : (targetVoucher.isFree || false),
          giftedAt: isFreeGiveaway ? nowIso : targetVoucher.giftedAt,
          giftedByAgentId: isFreeGiveaway ? (currentUser?.uid || 'agent') : targetVoucher.giftedByAgentId,
          giftedByAgentName: isFreeGiveaway ? (currentUser?.name || 'Agent') : targetVoucher.giftedByAgentName
        }
      })
    }).catch(e => console.warn('Sync mutate sale error:', e));

    if (isFreeGiveaway) {
      showToast(`🎁 Promotional Free Gift: Voucher ${soldVoucherCode} gifted to ${cleanName} ($0.00)!`, 'success');
    } else if (discount > 0) {
      showToast(`🎉 Genius Loyalty Reward: Voucher ${soldVoucherCode} sold with $${(discount || 0).toFixed(2)} discount to ${cleanName} (${custNumber})!`, 'success');
    } else if (isWalkInClient) {
      showToast(`Voucher ${soldVoucherCode} sold for $${(finalSoldPrice || 0).toFixed(2)} (Walk-in sale)!`, 'success');
    } else {
      showToast(`Voucher ${soldVoucherCode} successfully sold to ${cleanName} (${custNumber})!`, 'success');
    }

    autoPushActionToDb(isFreeGiveaway ? 'Sale: Voucher Gifted (Free)' : 'Sale: Voucher Sold', targetWsId);

    // 3. NON-BLOCKING ASYNCHRONOUS FIRESTORE BATCH WRITE IN BACKGROUND
    if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
      (async () => {
        try {
          const batch = writeBatch(db);

          // A. Primary voucher doc update
          const cleanVoucherPayload = cleanForFirestore(voucherPayload);
          const voucherRef = doc(db, 'workspaces', targetWsId, 'vouchers', targetVoucher.id);
          batch.set(voucherRef, cleanVoucherPayload, { merge: true });

          // If voucher belongs to a specific sub-workspace, also write to its native path
          if (resolvedDocWsId && resolvedDocWsId !== targetWsId && resolvedDocWsId !== 'system') {
            const nativeVoucherRef = doc(db, 'workspaces', resolvedDocWsId, 'vouchers', targetVoucher.id);
            batch.set(nativeVoucherRef, cleanVoucherPayload, { merge: true });
          }

          // Always guarantee write to Histec Client workspace ws_client_1788646327740 if Agent or Voucher is Histec
          const isHistecAssociated = targetWsId === 'ws_client_1788646327740' || resolvedDocWsId === 'ws_client_1788646327740' || (currentUser && (currentUser.uid === 'agent_histec_training' || currentUser.uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || (currentUser.name || '').toLowerCase().includes('histec')));
          if (isHistecAssociated && targetWsId !== 'ws_client_1788646327740' && resolvedDocWsId !== 'ws_client_1788646327740') {
            const histecVoucherRef = doc(db, 'workspaces', 'ws_client_1788646327740', 'vouchers', targetVoucher.id);
            batch.set(histecVoucherRef, cleanVoucherPayload, { merge: true });
          }

          if (targetVoucher.workspaceId && targetVoucher.workspaceId !== targetWsId && targetVoucher.workspaceId !== resolvedDocWsId && targetVoucher.workspaceId !== 'system') {
            const origVoucherRef = doc(db, 'workspaces', targetVoucher.workspaceId, 'vouchers', targetVoucher.id);
            batch.set(origVoucherRef, cleanVoucherPayload, { merge: true });
          }

          // B. Immutable transaction archive log
          const transactionRef = doc(db, 'workspaces', targetWsId, 'transactions', voucherId);
          batch.set(transactionRef, cleanForFirestore(transactionPayload), { merge: true });

          // C. Customer record persistence
          if (shouldSaveToCustomerList) {
            const custWsRef = doc(db, 'workspaces', targetWsId, 'customers', custId);
            batch.set(custWsRef, cleanForFirestore(updatedCustomer), { merge: true });
            const custRootRef = doc(db, 'customers', custId);
            batch.set(custRootRef, cleanForFirestore(updatedCustomer), { merge: true });
          }

          // D. Leaderboard summary and selling agent performance score
          const sellingAgentId = targetVoucher.assignedAgentId || currentUser.uid;
          if (sellingAgentId && finalSoldPrice > 0) {
            const leaderboardRef = doc(db, 'workspaces', targetWsId, 'leaderboard', 'summary');
            batch.set(leaderboardRef, {
              [sellingAgentId]: increment(finalSoldPrice),
              updatedAt: nowIso
            }, { merge: true });

            const userWsRef = doc(db, 'workspaces', targetWsId, 'users', sellingAgentId);
            batch.set(userWsRef, {
              performanceScore: increment(finalSoldPrice)
            }, { merge: true });

            const userRootRef = doc(db, 'users', sellingAgentId);
            batch.set(userRootRef, {
              performanceScore: increment(finalSoldPrice)
            }, { merge: true });
          }

          // E. Update any matching reversal request records in Firestore to 'Resold' so background Firestore sync never restores old 'Approved' reversal status
          const targetCleanCode = sanitizeVoucherCode(targetVoucher);
          const matchingReversalReqs = reversalRequests.filter(req => 
            req.transactionId === voucherId || 
            req.transactionId === targetVoucher.id || 
            (targetVoucher.code && req.referenceCode && req.referenceCode.toLowerCase().trim() === targetVoucher.code.toLowerCase().trim()) || 
            (targetCleanCode && req.referenceCode && sanitizeVoucherCode(req.referenceCode).toLowerCase().trim() === targetCleanCode.toLowerCase().trim())
          );
          matchingReversalReqs.forEach(mReq => {
            const reqRef = doc(db, 'workspaces', targetWsId, 'reversal_requests', mReq.id);
            batch.set(reqRef, {
              status: 'Resold',
              isResold: true,
              resoldAt: nowIso,
              updatedAt: nowIso
            }, { merge: true });
          });

          await batch.commit();
        } catch (err: any) {
          console.error('[WiVoTe Sales Engine] Firestore completeSale atomic batch error:', err);
        }
      })();
    }

    return {
      success: true,
      customer: shouldSaveToCustomerList ? updatedCustomer : undefined,
      finalPrice: finalSoldPrice,
      discount,
      customerNumber: shouldSaveToCustomerList ? custNumber : '',
      loyaltyNotice: isSubThreeDollars ? 'Sub-$3 Voucher: Ineligible for customer rewards' : loyaltyNotice
    };
  };

  // 4. Voucher Top-up Requests
  const submitVoucherRequest = (plan: string, quantity: number, location: string) => {
    if (!currentUser) return;
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const newRequest: VoucherRequest = {
      id: `req_${Date.now()}`,
      agentId: currentUser.uid,
      agentName: currentUser.name,
      plan,
      quantity,
      location,
      status: 'Pending',
      timestamp: new Date().toISOString(),
      workspaceId: targetWsId
    };

    setRequests(prev => {
      const updated = [newRequest, ...prev.filter(r => r.id !== newRequest.id)];
      try {
        localStorage.setItem('wivote_requests', JSON.stringify(updated));
        if (targetWsId) localStorage.setItem(`wivote_ws_requests_${targetWsId}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'requests', newRequest.id), newRequest).catch(console.error);
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REQUEST',
        payload: { request: newRequest }
      })
    }).catch(console.warn);

    autoPushActionToDb('Request: Voucher Request Submitted', targetWsId);
  };

  const fulfillVoucherRequest = (requestId: string) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Fulfill Voucher Request');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const targetWsId = (req as any).workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    
    // Auto-assign matching unallocated vouchers if available for this agent request
    const matchingUnassigned = vouchers.filter(v => 
      v.status === 'Unused' && 
      !v.assignedAgentId && 
      !v.archived &&
      (v.plan.toLowerCase() === req.plan.toLowerCase() || !req.plan)
    );

    if (matchingUnassigned.length > 0) {
      const toAssign = matchingUnassigned.slice(0, req.quantity || 1).map(v => v.id);
      if (toAssign.length > 0) {
        assignVouchersToAgent(toAssign, req.agentId);
      }
    }

    setRequests(prev => {
      const updatedList = prev.map(r => {
        if (r.id === requestId) {
          const updated: VoucherRequest = {
            ...r,
            status: 'Fulfilled' as RequestStatus,
            workspaceId: targetWsId,
            updatedAt: new Date().toISOString(),
            approvedAt: new Date().toISOString()
          } as any;

          if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
            setDoc(doc(db, 'workspaces', targetWsId, 'requests', r.id), {
              ...updated,
              status: 'Fulfilled'
            }, { merge: true }).catch(console.error);
          }
          fetch('/api/sync/mutate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'REQUEST',
              payload: { request: updated }
            })
          }).catch(console.warn);
          return updated;
        }
        return r;
      });
      try {
        localStorage.setItem('wivote_requests', JSON.stringify(updatedList));
        if (targetWsId) localStorage.setItem(`wivote_ws_requests_${targetWsId}`, JSON.stringify(updatedList.filter(r => (r as any).workspaceId === targetWsId)));
      } catch (e) {}
      return updatedList;
    });

    autoPushActionToDb('Approval: Voucher Request Fulfilled', targetWsId);
  };

  const declineVoucherRequest = (requestId: string) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Decline Voucher Request');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const targetWsId = (req as any).workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    setRequests(prev => {
      const updatedList = prev.map(r => {
        if (r.id === requestId) {
          const updated: VoucherRequest = {
            ...r,
            status: 'Declined' as RequestStatus,
            workspaceId: targetWsId,
            updatedAt: new Date().toISOString(),
            declinedAt: new Date().toISOString()
          } as any;

          if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
            setDoc(doc(db, 'workspaces', targetWsId, 'requests', r.id), {
              ...updated,
              status: 'Declined'
            }, { merge: true }).catch(console.error);
          }
          fetch('/api/sync/mutate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'REQUEST',
              payload: { request: updated }
            })
          }).catch(console.warn);
          return updated;
        }
        return r;
      });
      try {
        localStorage.setItem('wivote_requests', JSON.stringify(updatedList));
        if (targetWsId) localStorage.setItem(`wivote_ws_requests_${targetWsId}`, JSON.stringify(updatedList.filter(r => (r as any).workspaceId === targetWsId)));
      } catch (e) {}
      return updatedList;
    });

    autoPushActionToDb('Cancellation: Voucher Request Declined', targetWsId);
    if (req.agentId) {
      addNotification(`Your request for ${req.quantity} voucher(s) (${req.plan}) was declined by Administrator.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [req.agentId],
        targetAgentNames: req.agentName ? [req.agentName] : [],
        isBroadcast: false
      });
    }
    showToast('Voucher request declined.', 'success');
  };

  const deleteVoucherRequest = async (requestId: string) => {
    if (!currentUser) return;
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const targetWsId = (req as any).workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    
    const isOwner = req.agentId === currentUser.uid;
    const isAdmin = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner';
    
    if (!isOwner && !isAdmin) {
      showToast('You do not have permission to delete this request.', 'error');
      return;
    }
    
    // Tombstone this deleted request so sync and initial seeds never resurrect it
    markRequestDeleted(requestId);

    setRequests(prev => {
      const remaining = prev.filter(r => r.id !== requestId);
      try {
        localStorage.setItem('wivote_requests', JSON.stringify(remaining));
        if (targetWsId) localStorage.setItem(`wivote_ws_requests_${targetWsId}`, JSON.stringify(remaining.filter(r => (r as any).workspaceId === targetWsId)));
      } catch (e) {}
      return remaining;
    });
    
    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await deleteDoc(doc(db, 'workspaces', targetWsId, 'requests', requestId));
        showToast('Voucher request deleted successfully.', 'success');
      } catch (err) {
        console.error("Error deleting voucher request:", err);
        showToast('Failed to delete request from Firestore.', 'error');
      }
    } else {
      showToast('Voucher request deleted successfully.', 'success');
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELETE_REQUEST',
        payload: { requestId }
      })
    }).catch(console.warn);

    autoPushActionToDb('Deletion: Voucher Request Deleted', targetWsId);
  };

  const updateVoucherRequest = async (requestId: string, plan: string, quantity: number, location: string) => {
    if (!currentUser) return;
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const targetWsId = (req as any).workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    if (req.agentId !== currentUser.uid && currentUser.role !== 'WorkspaceMaster' && currentUser.role !== 'Admin' && currentUser.role !== 'AppOwner') {
      showToast('You do not have permission to edit this request.', 'error');
      return;
    }

    if (req.status !== 'Pending') {
      showToast('Only pending requests can be edited.', 'error');
      return;
    }

    let updatedReq: VoucherRequest | undefined;
    setRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        const updated = { ...r, plan, quantity, location, workspaceId: targetWsId };
        updatedReq = updated;
        if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
          setDoc(doc(db, 'workspaces', targetWsId, 'requests', r.id), {
            ...updated,
            plan,
            quantity,
            location
          }, { merge: true }).catch(console.error);
        }
        return updated;
      }
      return r;
    }));

    if (updatedReq) {
      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REQUEST',
          payload: { request: updatedReq }
        })
      }).catch(console.warn);
    }

    autoPushActionToDb('Request: Voucher Request Updated', targetWsId);
    showToast('Voucher request updated successfully.', 'success');
  };

  // 5. Sales Close & Cash Drop Reconciliation Protocol
  const submitCashDrop = (amount: number, requestedBy: 'Agent' | 'WorkspaceMaster', notes?: string, targetAgentId?: string, targetAgentName?: string, extra?: Partial<CashDrop>) => {
    if (!currentUser) return;
    const targetWsId = (extra as any)?.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    
    const resolvedAgentId = requestedBy === 'Agent' ? currentUser.uid : (targetAgentId || 'admin_requested');
    const resolvedAgentName = requestedBy === 'Agent' ? currentUser.name : (targetAgentName || 'Administrator Request');

    const newDrop: CashDrop = {
      id: `cd_${Date.now()}`,
      workspaceId: targetWsId,
      agentId: resolvedAgentId,
      agentName: resolvedAgentName,
      amount: amount || 0,
      status: 'Pending',
      timestamp: new Date().toISOString(),
      requestedBy,
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
      ...(extra || {})
    };

    setCashDrops(prev => [newDrop, ...prev]);

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'cash_drops', newDrop.id), newDrop).catch(console.error);
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SYNC_BATCH',
        payload: { cashDrops: [newDrop] }
      })
    }).catch(console.warn);

    if (requestedBy === 'WorkspaceMaster') {
      addNotification(`Cash Drop request of $${(amount || 0).toFixed(2)} has been placed for you by Administrator.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: resolvedAgentId ? [resolvedAgentId] : [],
        targetAgentNames: [resolvedAgentName],
        isBroadcast: false
      });
    } else {
      addNotification(`Agent ${resolvedAgentName} submitted a cash drop of $${(amount || 0).toFixed(2)} for reconciliation.`, {
        targetAudience: 'ADMIN',
        targetRole: 'Admin',
        isBroadcast: false
      });
    }

    autoPushActionToDb('Cash Close: Cash Drop Submitted', targetWsId);
  };

  const fulfillAdminCashDropRequest = (cashDropId: string, notes?: string) => {
    if (!currentUser) return;
    const drop = cashDrops.find(d => d.id === cashDropId);
    if (!drop) return;

    const targetWsId = drop.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';

    const approvedAt = new Date().toISOString();
    const approvedBy = currentUser?.name || 'Administrator';

    const updatedDrop: CashDrop = {
      ...drop,
      status: 'Approved' as CashDropStatus,
      approvedAt: drop.approvedAt || approvedAt,
      approvedBy: drop.approvedBy || approvedBy,
      notes: notes?.trim() ? notes.trim() : drop.notes,
      timestamp: approvedAt
    };

    // Update cash drop locally
    setCashDrops(prev => prev.map(d => d.id === cashDropId ? updatedDrop : d));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'cash_drops', cashDropId), updatedDrop, { merge: true }).catch(console.error);
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SYNC_BATCH',
        payload: { cashDrops: [updatedDrop] }
      })
    }).catch(console.warn);

    // Clear schedule override flag for agent
    const targetAgentId = drop.agentId || currentUser.uid;
    if (targetAgentId) {
      updateAgentCashCloseSchedule(targetAgentId, {
        isCashCloseRequested: false,
        requestedAmount: undefined,
        requestedNotes: undefined
      }).catch(console.error);
    }

    // Deactivate pending cash close request notifications for this agent
    setNotifications(prev => prev.map(n => {
      const msg = (n.message || '').toLowerCase();
      const isCashCloseNotif = msg.includes('cash close') || msg.includes('cash drop');
      const isForAgent = (targetAgentId && n.targetAgentIds?.includes(targetAgentId)) ||
                        (drop.agentName && n.targetAgentNames?.some(name => name.toLowerCase().trim() === drop.agentName.toLowerCase().trim()));
      if (isCashCloseNotif && isForAgent) {
        const updatedNotif = { ...n, isActive: false };
        if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
          setDoc(doc(db, 'workspaces', targetWsId, 'notifications', n.id), { isActive: false }, { merge: true }).catch(() => {});
        }
        return updatedNotif;
      }
      return n;
    }));

    addNotification(`Agent ${currentUser.name} has confirmed fulfillment of Cash Drop request of $${(drop.amount || 0).toFixed(2)}.`, {
      targetAudience: 'ADMIN',
      targetRole: 'Admin',
      isBroadcast: false
    });
    showToast(`✓ Cash drop request of $${(drop.amount || 0).toFixed(2)} confirmed successfully. Awaiting Admin Reconciliation.`, 'success');
    autoPushActionToDb('Cash Close: Cash Drop Fulfilled', targetWsId);
  };

  const reconcileCashDrop = (cashDropId: string) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Reconcile Cash Drop');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const drop = cashDrops.find(d => d.id === cashDropId);
    if (!drop) return;

    // Prevent double approval: only new cash drop approvals that have not been approved before can be reconciled
    if (drop.status === 'Approved' || drop.status === 'Reconciled' || drop.approvedAt) {
      showToast('This cash drop has already been approved and reconciled.', 'info');
      return;
    }

    const targetWsId = drop.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';

    // Update Cash Drop status to Approved
    const approvedAt = new Date().toISOString();
    const approvedBy = currentUser?.name || 'Administrator';

    const targetAgentId = drop.agentId;
    const targetAgentName = drop.agentName;

    const isMatchingDropAgent = (cd: CashDrop) => {
      if (cd.id === cashDropId) return true;
      if (targetAgentId && cd.agentId && (cd.agentId === targetAgentId || cd.agentId.toLowerCase().trim() === targetAgentId.toLowerCase().trim())) return true;
      if (targetAgentName && cd.agentName && cd.agentName.toLowerCase().trim() === targetAgentName.toLowerCase().trim()) return true;
      return false;
    };

    setCashDrops(prev => prev.map(d => {
      if (isMatchingDropAgent(d)) {
        const updated: CashDrop = {
          ...d,
          status: 'Approved' as CashDropStatus,
          approvedAt: d.approvedAt || approvedAt,
          approvedBy: d.approvedBy || approvedBy,
          workspaceId: d.workspaceId || targetWsId
        };
        const wsId = d.workspaceId || targetWsId;
        if (!isFirebasePlaceholder && currentUser && wsId && wsId !== 'system') {
          setDoc(doc(db, 'workspaces', wsId, 'cash_drops', d.id), {
            ...updated,
            status: 'Approved',
            approvedAt: updated.approvedAt,
            approvedBy: updated.approvedBy
          }, { merge: true }).catch(console.error);
        }
        return updated;
      }
      return d;
    }));

    // Clear schedule override flag for agent so admin request banner disappears on agent dashboard
    if (targetAgentId) {
      updateAgentCashCloseSchedule(targetAgentId, {
        isCashCloseRequested: false,
        requestedAmount: undefined,
        requestedNotes: undefined
      }).catch(console.error);
    }

    // Deactivate pending cash close request notifications for this agent
    setNotifications(prev => prev.map(n => {
      const msg = (n.message || '').toLowerCase();
      const isCashCloseNotif = msg.includes('cash close') || msg.includes('cash drop');
      const isForAgent = (targetAgentId && n.targetAgentIds?.includes(targetAgentId)) ||
                        (targetAgentName && n.targetAgentNames?.some(name => name.toLowerCase().trim() === targetAgentName.toLowerCase().trim()));
      if (isCashCloseNotif && isForAgent) {
        const updatedNotif = { ...n, isActive: false };
        if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
          setDoc(doc(db, 'workspaces', targetWsId, 'notifications', n.id), { isActive: false }, { merge: true }).catch(() => {});
        }
        return updatedNotif;
      }
      return n;
    }));

    // Archive all Sold vouchers for this agent to clear the active sales ledger
    const agentId = drop.agentId;
    const agentName = drop.agentName;
    const isMatchingAgent = (targetId?: string, targetName?: string) => {
      if (!targetId && !targetName) return false;
      const cleanAgentId = agentId ? agentId.toLowerCase().trim() : '';
      if (targetId && (targetId === agentId || (cleanAgentId && targetId.toLowerCase() === cleanAgentId))) return true;
      if (targetName && agentName && targetName.toLowerCase().trim() === agentName.toLowerCase().trim()) return true;
      return false;
    };

    setVouchers(prev => prev.map(v => {
      if (isMatchingAgent(v.assignedAgentId, v.assignedAgentName) && v.status === 'Sold') {
        const updated = { ...v, archived: true };
        const wsId = (v as any).workspaceId || drop.workspaceId || targetWsId;
        if (!isFirebasePlaceholder && currentUser && wsId && wsId !== 'system') {
          setDoc(doc(db, 'workspaces', wsId, 'vouchers', v.id), {
            archived: true
          }, { merge: true }).catch(console.error);
        }
        return updated;
      }
      return v;
    }));

    // Record cash close for sold legacy devices without expiring their 30-day lease
    setLegacyDevices(prev => prev.map(ld => {
      if (isMatchingAgent(ld.fieldAgentId, ld.fieldAgentName) && ld.status === 'SOLD') {
        const isLeaseExpired = ld.expiresAt ? new Date(ld.expiresAt).getTime() <= Date.now() : false;
        const updated = { 
          ...ld, 
          cashClosed: true, 
          cashClosedAt: new Date().toISOString(),
          status: (isLeaseExpired ? 'EXPIRED' : 'SOLD') as LegacyDevice['status']
        };
        const wsId = (ld as any).workspaceId || drop.workspaceId || targetWsId;
        if (!isFirebasePlaceholder && currentUser && wsId && wsId !== 'system') {
          setDoc(doc(db, 'workspaces', wsId, 'legacy_devices', ld.id), {
            cashClosed: true,
            cashClosedAt: updated.cashClosedAt,
            status: updated.status
          }, { merge: true }).catch(console.error);
        }
        return updated;
      }
      return ld;
    }));

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CASH_DROP',
        payload: {
          drop: {
            ...drop,
            status: 'Approved',
            approvedAt,
            approvedBy,
            workspaceId: targetWsId
          }
        }
      })
    }).catch(console.warn);

    autoPushActionToDb('Cash Close: Cash Drop Approved & Reconciled', targetWsId);
    showToast(`✓ Cash close of $${(drop.amount || 0).toFixed(2)} for ${drop.agentName} approved successfully.`, 'success');
    addNotification(`Admin approved your cash close of $${(drop.amount || 0).toFixed(2)}.`, {
      targetAudience: 'SPECIFIC',
      targetAgentIds: drop.agentId ? [drop.agentId] : [],
      targetAgentNames: drop.agentName ? [drop.agentName] : [],
      isBroadcast: false
    });
  };

  const declineCashDrop = (cashDropId: string, reason?: string) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Decline Cash Drop');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const drop = cashDrops.find(d => d.id === cashDropId);
    if (!drop) return;

    const targetWsId = drop.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';

    setCashDrops(prev => prev.filter(d => d.id !== cashDropId));

    if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
      deleteDoc(doc(db, 'workspaces', targetWsId, 'cash_drops', cashDropId)).catch(console.error);
    }

    if (drop.agentId) {
      addNotification(`Your cash drop of $${(drop.amount || 0).toFixed(2)} was declined by Administrator.${reason ? ` Reason: ${reason}` : ''}`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [drop.agentId],
        targetAgentNames: drop.agentName ? [drop.agentName] : [],
        isBroadcast: false
      });
    }

    showToast(`✓ Cash drop of $${(drop.amount || 0).toFixed(2)} declined.`, 'info');
    autoPushActionToDb('Cash Close: Cash Drop Declined', targetWsId);
  };

  // 6. Legacy Device Enrolment Protocol
  const submitLegacyDevice = async (
    name: string, 
    deviceModel: string, 
    mac: string, 
    price: number,
    customerId?: string,
    customerCell?: string,
    customerNumber?: string
  ): Promise<LegacyDevice> => {
    if (!currentUser) return {} as LegacyDevice;
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    
    const cleanName = name.trim();
    const cleanMac = mac.trim();
    const cleanModel = deviceModel.trim();
    const cleanCell = (customerCell || '').trim();

    const normMac = cleanMac.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Check if device with this MAC is already in legacyDevices to prevent duplicates
    const existingDevice = legacyDevices.find(ld => {
      const m = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return normMac.length >= 8 && m === normMac;
    });

    // Guard against duplicate customer or find existing customer in registry
    let targetCustomer: Customer | undefined;
    if (customerId) {
      targetCustomer = customers.find(c => c.id === customerId);
    }
    if (!targetCustomer && cleanName) {
      targetCustomer = customers.find(c => c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase());
    }
    if (!targetCustomer && cleanCell && cleanCell.replace(/\D/g, '').length >= 6) {
      const digits = cleanCell.replace(/\D/g, '');
      targetCustomer = customers.find(c => c.cellNumber && c.cellNumber.replace(/\D/g, '') === digits);
    }
    if (!targetCustomer && normMac.length >= 8) {
      targetCustomer = customers.find(c => {
        const cm = (c.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return cm.length >= 8 && cm === normMac;
      });
    }

    // Update or register customer with legacy_device details if name is not a generic walk-in placeholder
    const nameToRegister = targetCustomer?.name || cleanName;
    if (nameToRegister && !isPlaceholderOrWalkInClient(nameToRegister)) {
      targetCustomer = await addOrUpdateCustomer({
        id: targetCustomer?.id,
        name: nameToRegister,
        cellNumber: cleanCell || targetCustomer?.cellNumber || '',
        customerType: 'legacy_device',
        macAddress: cleanMac,
        deviceModel: cleanModel,
        monthlyPrice: price > 0 ? price : (targetCustomer?.monthlyPrice || 0)
      });
    }

    const devId = existingDevice?.id || `ld_${Date.now()}`;
    const newDevice: LegacyDevice = {
      id: devId,
      customerName: targetCustomer?.name || cleanName,
      customerId: targetCustomer?.id,
      customerNumber: targetCustomer?.customerNumber,
      customerCell: targetCustomer?.cellNumber || cleanCell,
      deviceNameModel: cleanModel,
      macAddress: cleanMac,
      monthlyPrice: price > 0 ? price : (existingDevice?.monthlyPrice || 0.00),
      fieldAgentId: currentUser.uid,
      fieldAgentName: currentUser.name,
      isApproved: existingDevice ? existingDevice.isApproved : false,
      addedToInventory: existingDevice ? existingDevice.addedToInventory : false,
      status: existingDevice ? existingDevice.status : 'PENDING'
    };

    setLegacyDevices(prev => {
      const idx = prev.findIndex(ld => ld.id === devId || (normMac.length >= 8 && (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normMac));
      let updated: LegacyDevice[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = newDevice;
      } else {
        updated = [...prev, newDevice];
      }
      try {
        safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', newDevice.id), cleanForFirestore(newDevice)).catch(console.error);
    }

    logAuditAction({
      category: 'device',
      action: 'DEVICE_ENROLLED',
      title: 'Legacy Terminal Enrolled',
      description: `Terminal "${cleanModel}" (MAC: ${cleanMac}) enrolled by ${currentUser.name} for client "${targetCustomer?.name || cleanName}".`,
      workspaceId: targetWsId,
      targetId: newDevice.id,
      targetName: cleanModel,
      metadata: { 
        macAddress: cleanMac, 
        customerName: targetCustomer?.name || cleanName, 
        customerId: targetCustomer?.id,
        customerNumber: targetCustomer?.customerNumber,
        status: 'PENDING' 
      }
    }).catch(() => {});

    autoPushActionToDb('Request: Legacy Terminal Enrolled', targetWsId);
    return newDevice;
  };

  const approveLegacyDevice = async (id: string, price: number, leaseDurationDays?: number) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Approve Legacy Terminal');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    
    // Find target device
    const ld = legacyDevices.find(item => item.id === id);
    if (!ld) {
      showToast('Legacy device not found.', 'error');
      return;
    }

    const leaseDays = leaseDurationDays && !isNaN(leaseDurationDays) && leaseDurationDays > 0 ? leaseDurationDays : 30;
    const now = Date.now();
    const approvedAt = new Date(now).toISOString();
    const enrolledAt = ld.enrolledAt || approvedAt;
    const expiresAt = new Date(now + leaseDays * 24 * 60 * 60 * 1000).toISOString(); // Custom lease duration expiration

    const approvalDay = new Date(approvedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const expiryDay = new Date(expiresAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    console.log(`[Legacy Device Approval] Device "${ld.deviceNameModel}" (ID: ${ld.id}, MAC: ${ld.macAddress}) approved on ${approvalDay}. Lease duration: ${leaseDays} days (expires on ${expiryDay}). Price: $${(price || 0).toFixed(2)}.`);

    // 1. Locate customer in registry (by customerId or customerName), or register if not existing
    let targetCustomer = ld.customerId
      ? customers.find(c => c.id === ld.customerId)
      : customers.find(c => c.name && c.name.trim().toLowerCase() === ld.customerName.trim().toLowerCase());

    if (!targetCustomer && ld.customerName) {
      const newCustId = ld.customerId || `cust_${Date.now()}`;
      targetCustomer = {
        id: newCustId,
        workspaceId: targetWsId || 'system',
        name: ld.customerName,
        cellNumber: ld.customerCell || '',
        customerNumber: ld.customerNumber || getNextCustomerNumber(customers),
        createdAt: now,
        updatedAt: now,
        totalPurchases: 0,
        totalSpend: 0,
        totalSaved: 0,
        consecutivePurchases: [],
        streakCount: 0,
        customerType: 'legacy_device',
        savedByUserId: currentUser?.uid || ld.fieldAgentId || 'system',
        savedByName: currentUser?.name || currentUser?.email || ld.fieldAgentName || 'Agent',
        savedByUserRole: currentUser?.role || 'Agent',
        createdByUserId: currentUser?.uid || ld.fieldAgentId || 'system',
        createdByName: currentUser?.name || currentUser?.email || ld.fieldAgentName || 'Agent',
        createdByUserRole: currentUser?.role || 'Agent'
      };
    }

    const effectiveSettings = activeWorkspace?.loyaltySettings || loyaltySettings || DEFAULT_LOYALTY_SETTINGS;
    
    // 2. Evaluate Genius Loyalty Program rewards
    const evaluation = evaluateCustomerLoyalty(targetCustomer, price, effectiveSettings);
    const discount = evaluation.isEligibleForReward ? evaluation.discountAmount : 0;
    const finalSoldPrice = Math.max(0, price - discount);

    // 3. Streak counting for Legacy device customers:
    const purchaseRec: CustomerPurchaseRecord = {
      id: `pur_ld_${Date.now()}`,
      voucherId: ld.id,
      voucherCode: ld.macAddress,
      price: price,
      discountApplied: discount,
      originalPrice: price,
      timestamp: now,
      agentId: ld.fieldAgentId || 'agent',
      agentName: ld.fieldAgentName || 'Agent',
      plan: `${ld.deviceNameModel} (Legacy Non-WiFi)`
    };

    let updatedConsecutive: CustomerPurchaseRecord[] = [];
    if (discount > 0) {
      updatedConsecutive = [];
    } else {
      const minQualifying = effectiveSettings.minQualifyingPrice ?? 3.0;
      const prevConsecutive = targetCustomer?.consecutivePurchases || [];
      if (price >= minQualifying) {
        updatedConsecutive = [...prevConsecutive, purchaseRec];
      } else {
        updatedConsecutive = prevConsecutive;
      }
    }

    let updatedCustomer: Customer | undefined;
    if (targetCustomer) {
      updatedCustomer = {
        ...targetCustomer,
        totalPurchases: (targetCustomer.totalPurchases || 0) + 1,
        totalSpend: (targetCustomer.totalSpend || 0) + finalSoldPrice,
        totalSaved: (targetCustomer.totalSaved || 0) + discount,
        consecutivePurchases: updatedConsecutive,
        streakCount: updatedConsecutive.length,
        lastPurchaseDate: now,
        lastAgentName: ld.fieldAgentName || 'Agent',
        lastVoucherCode: `MAC:${ld.macAddress}`,
        updatedAt: now,
        savedByUserId: currentUser?.uid || ld.fieldAgentId || 'system',
        savedByName: currentUser?.name || currentUser?.email || ld.fieldAgentName || 'Agent',
        savedByUserRole: currentUser?.role || 'Agent',
        createdByUserId: targetCustomer.createdByUserId || currentUser?.uid || 'system',
        createdByName: targetCustomer.createdByName || currentUser?.name || currentUser?.email || 'Agent',
        createdByUserRole: targetCustomer.createdByUserRole || currentUser?.role || 'Agent'
      };

      setCustomers(prev => {
        const exists = prev.some(c => c.id === updatedCustomer!.id);
        if (exists) {
          return prev.map(c => c.id === updatedCustomer!.id ? updatedCustomer! : c);
        }
        return [...prev, updatedCustomer!];
      });

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        setDoc(doc(db, 'workspaces', targetWsId, 'customers', updatedCustomer.id), cleanForFirestore(updatedCustomer), { merge: true }).catch(console.error);
      }
    }

    // 4. Update Legacy Device (Automatic SOLD marking with custom lease duration)
    const updatedDevice: LegacyDevice = {
      ...ld,
      monthlyPrice: price,
      isApproved: true,
      addedToInventory: true,
      status: 'SOLD',
      soldPrice: finalSoldPrice,
      discountApplied: discount,
      approvedAt,
      enrolledAt,
      soldAt: approvedAt,
      leaseDurationDays: leaseDays,
      expiresAt
    };

    setLegacyDevices(prev => {
      const targetNormMac = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const mapped = prev.map(item => {
        if (item.id === id) return updatedDevice;
        const normMac = (item.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (normMac.length >= 8 && normMac === targetNormMac) {
          return {
            ...item,
            monthlyPrice: price,
            isApproved: true,
            addedToInventory: true,
            status: 'SOLD' as const,
            soldPrice: finalSoldPrice,
            discountApplied: discount,
            approvedAt,
            enrolledAt,
            soldAt: approvedAt,
            leaseDurationDays: leaseDays,
            expiresAt
          };
        }
        return item;
      });
      return deduplicateLegacyDevices(mapped);
    });

    if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
        monthlyPrice: price,
        isApproved: true,
        addedToInventory: true,
        status: 'SOLD',
        soldPrice: finalSoldPrice,
        discountApplied: discount,
        approvedAt,
        enrolledAt,
        soldAt: approvedAt,
        leaseDurationDays: leaseDays,
        expiresAt
      }, { merge: true }).catch(console.error);

      // Real-time Leaderboard Sync
      const sellingAgentId = ld.fieldAgentId;
      if (sellingAgentId) {
        setUsers(prev => prev.map(u => {
          if (u.uid === sellingAgentId) {
            return { ...u, performanceScore: (u.performanceScore || 0) + finalSoldPrice };
          }
          return u;
        }));

        setLeaderboardSummary(prev => ({
          ...prev,
          [sellingAgentId]: (prev[sellingAgentId] || 0) + finalSoldPrice
        }));

        const leaderboardRef = doc(db, 'workspaces', targetWsId, 'leaderboard', 'summary');
        setDoc(leaderboardRef, {
          [sellingAgentId]: increment(finalSoldPrice),
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});

        const userWsRef = doc(db, 'workspaces', targetWsId, 'users', sellingAgentId);
        updateDoc(userWsRef, {
          performanceScore: increment(finalSoldPrice)
        }).catch(() => {
          setDoc(userWsRef, {
            performanceScore: finalSoldPrice
          }, { merge: true }).catch(console.error);
        });
      }
    }

    // Log the day of device approval and custom lease expiry
    logAuditAction({
      category: 'device',
      action: 'DEVICE_APPROVED',
      title: 'Legacy Terminal Approved & SOLD',
      description: `Device "${ld.deviceNameModel}" (MAC: ${ld.macAddress}) approved on ${approvalDay}. Lease duration: ${leaseDays} days (expires on ${expiryDay}). Automatically marked as SOLD at rate $${(price || 0).toFixed(2)}.`,
      workspaceId: targetWsId,
      targetId: ld.id,
      targetName: ld.deviceNameModel,
      metadata: { 
        macAddress: ld.macAddress, 
        customerName: ld.customerName, 
        monthlyPrice: price, 
        soldPrice: finalSoldPrice,
        status: 'SOLD',
        approvedAt,
        approvalDay,
        expiresAt,
        expiryDay,
        leaseDurationDays: leaseDays,
        ticketPriceUsedForStreak: price,
        newStreak: updatedConsecutive.length
      }
    }).catch(() => {});

    if (ld.fieldAgentId) {
      addNotification(`Device "${ld.deviceNameModel}" approved on ${approvalDay} ($${(price || 0).toFixed(2)}/mo). Lease (${leaseDays} days) will expire on ${expiryDay}.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [ld.fieldAgentId],
        targetAgentNames: ld.fieldAgentName ? [ld.fieldAgentName] : [],
        isBroadcast: false
      });
    }

    showToast(`✓ Legacy device "${ld.deviceNameModel}" approved (${leaseDays}-day lease, $${(price || 0).toFixed(2)}/mo). Expires on ${expiryDay}.`, 'success');
    autoPushActionToDb('Approve Legacy Terminal', targetWsId);
  };

  const markLegacyDeviceSold = async (id: string): Promise<{
    success: boolean;
    discountApplied: number;
    finalSoldPrice: number;
    newStreak: number;
    customer?: Customer;
  }> => {
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    
    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, discountApplied: 0, finalSoldPrice: 0, newStreak: 0 };
    }

    // 1. Locate customer in registry (by customerId or customerName)
    let targetCustomer = targetDevice.customerId
      ? customers.find(c => c.id === targetDevice.customerId)
      : customers.find(c => c.name && c.name.trim().toLowerCase() === targetDevice.customerName.trim().toLowerCase());

    // Strict idempotency guard: prevent duplicate sale processing or duplicate score incrementing
    if (targetDevice.status === 'SOLD') {
      return {
        success: true,
        discountApplied: targetDevice.discountApplied || 0,
        finalSoldPrice: targetDevice.soldPrice !== undefined ? targetDevice.soldPrice : targetDevice.monthlyPrice,
        newStreak: targetCustomer?.consecutivePurchases?.length || 0,
        customer: targetCustomer
      };
    }

    const effectiveSettings = activeWorkspace?.loyaltySettings || loyaltySettings || DEFAULT_LOYALTY_SETTINGS;
    
    // 2. Evaluate Genius Loyalty Program rewards (Streak strictly uses admin-defined monthlyPrice)
    const evaluation = evaluateCustomerLoyalty(targetCustomer, targetDevice.monthlyPrice, effectiveSettings);
    const discount = evaluation.isEligibleForReward ? evaluation.discountAmount : 0;
    const finalSoldPrice = Math.max(0, targetDevice.monthlyPrice - discount);
    const now = Date.now();

    // 3. Streak counting for Legacy device customers:
    // Create CustomerPurchaseRecord strictly using the admin-defined monthly price
    const purchaseRec: CustomerPurchaseRecord = {
      id: `pur_ld_${Date.now()}`,
      voucherId: targetDevice.id,
      voucherCode: targetDevice.macAddress,
      price: targetDevice.monthlyPrice, // Streak strictly uses admin-defined price
      discountApplied: discount,
      originalPrice: targetDevice.monthlyPrice,
      timestamp: now,
      agentId: currentUser?.uid || targetDevice.fieldAgentId || 'agent',
      agentName: currentUser?.name || targetDevice.fieldAgentName || 'Agent',
      plan: `${targetDevice.deviceNameModel} (Legacy Non-WiFi)`
    };

    let updatedConsecutive: CustomerPurchaseRecord[] = [];
    if (discount > 0) {
      // Reward redeemed! Cycle resets
      updatedConsecutive = [];
    } else {
      const minQualifying = effectiveSettings.minQualifyingPrice ?? 3.0;
      const prevConsecutive = targetCustomer?.consecutivePurchases || [];
      if (targetDevice.monthlyPrice >= minQualifying) {
        updatedConsecutive = [...prevConsecutive, purchaseRec];
      } else {
        updatedConsecutive = prevConsecutive;
      }
    }

    let updatedCustomer: Customer | undefined;
    if (targetCustomer) {
      updatedCustomer = {
        ...targetCustomer,
        totalPurchases: (targetCustomer.totalPurchases || 0) + 1,
        totalSpend: (targetCustomer.totalSpend || 0) + finalSoldPrice,
        totalSaved: (targetCustomer.totalSaved || 0) + discount,
        consecutivePurchases: updatedConsecutive,
        streakCount: updatedConsecutive.length,
        lastPurchaseDate: now,
        lastAgentName: currentUser?.name || targetDevice.fieldAgentName || 'Agent',
        lastVoucherCode: `MAC:${targetDevice.macAddress}`,
        updatedAt: now,
        savedByUserId: currentUser?.uid || 'system',
        savedByName: currentUser?.name || currentUser?.email || 'Agent',
        savedByUserRole: currentUser?.role || 'Agent',
        createdByUserId: targetCustomer.createdByUserId || currentUser?.uid || 'system',
        createdByName: targetCustomer.createdByName || currentUser?.name || currentUser?.email || 'Agent',
        createdByUserRole: targetCustomer.createdByUserRole || currentUser?.role || 'Agent'
      };

      setCustomers(prev => prev.map(c => c.id === updatedCustomer!.id ? updatedCustomer! : c));

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        setDoc(doc(db, 'workspaces', targetWsId, 'customers', updatedCustomer.id), cleanForFirestore(updatedCustomer), { merge: true }).catch(console.error);
      }
    }

    // 4. Update Legacy Device
    const updatedDevice: LegacyDevice = {
      ...targetDevice,
      status: 'SOLD',
      soldPrice: finalSoldPrice,
      discountApplied: discount,
      soldAt: new Date().toISOString()
    };

    setLegacyDevices(prev => {
      const targetNormMac = (targetDevice.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const mapped = prev.map(ld => {
        if (ld.id === id) return updatedDevice;
        const normMac = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (normMac.length >= 8 && normMac === targetNormMac) {
          return {
            ...ld,
            status: 'SOLD' as const,
            soldPrice: finalSoldPrice,
            discountApplied: discount,
            soldAt: updatedDevice.soldAt
          };
        }
        return ld;
      });
      return deduplicateLegacyDevices(mapped);
    });

    if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
        status: 'SOLD',
        soldPrice: finalSoldPrice,
        discountApplied: discount,
        soldAt: updatedDevice.soldAt
      }, { merge: true }).catch(console.error);

      // Real-time Leaderboard Sync: Increment selling agent's performanceScore across all dashboards
      const sellingAgentId = targetDevice.fieldAgentId || currentUser?.uid;
      if (sellingAgentId) {
        setUsers(prev => prev.map(u => {
          if (u.uid === sellingAgentId) {
            return { ...u, performanceScore: (u.performanceScore || 0) + finalSoldPrice };
          }
          return u;
        }));

        setLeaderboardSummary(prev => ({
          ...prev,
          [sellingAgentId]: (prev[sellingAgentId] || 0) + finalSoldPrice
        }));

        const leaderboardRef = doc(db, 'workspaces', targetWsId, 'leaderboard', 'summary');
        setDoc(leaderboardRef, {
          [sellingAgentId]: increment(finalSoldPrice),
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});

        const userWsRef = doc(db, 'workspaces', targetWsId, 'users', sellingAgentId);
        updateDoc(userWsRef, {
          performanceScore: increment(finalSoldPrice)
        }).catch(() => {
          setDoc(userWsRef, {
            performanceScore: finalSoldPrice
          }, { merge: true }).catch(console.error);
        });

        const userRootRef = doc(db, 'users', sellingAgentId);
        updateDoc(userRootRef, {
          performanceScore: increment(finalSoldPrice)
        }).catch(() => {});
      }
    }

    logAuditAction({
      category: 'device',
      action: 'DEVICE_SOLD',
      title: 'Legacy Terminal Sold & Loyalty Streak Tallied',
      description: `Device "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}) sold to "${targetDevice.customerName}" for $${(finalSoldPrice || 0).toFixed(2)}${discount > 0 ? ` (Genius Reward: $${(discount || 0).toFixed(2)} off)` : ''}. Current streak: ${updatedConsecutive.length}.`,
      workspaceId: targetWsId,
      targetId: targetDevice.id,
      targetName: targetDevice.deviceNameModel,
      metadata: { 
        macAddress: targetDevice.macAddress, 
        customerName: targetDevice.customerName, 
        customerId: targetCustomer?.id,
        monthlyPrice: targetDevice.monthlyPrice,
        soldPrice: finalSoldPrice,
        discountApplied: discount,
        newStreak: updatedConsecutive.length,
        status: 'SOLD' 
      }
    }).catch(() => {});

    if (discount > 0) {
      showToast(`🎉 Genius Reward Applied! $${(discount || 0).toFixed(2)} discount redeemed for ${targetDevice.customerName}!`, 'success');
    } else if (targetDevice.monthlyPrice >= (effectiveSettings.minQualifyingPrice ?? 3.0)) {
      showToast(`🔥 Loyalty streak updated for ${targetDevice.customerName} (${updatedConsecutive.length} consecutive purchases towards Genius Rewards)!`, 'success');
    }

    autoPushActionToDb('Sale: Legacy Terminal Sold', targetWsId);

    return {
      success: true,
      discountApplied: discount,
      finalSoldPrice,
      newStreak: updatedConsecutive.length,
      customer: updatedCustomer
    };
  };

  const cancelLegacyDeviceEnrollment = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, error: 'Legacy device enrollment request not found.' };
    }

    const isOwnerAgent = targetDevice.fieldAgentId === currentUser.uid;
    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';

    if (!isOwnerAgent && !isPrivileged) {
      return { success: false, error: 'You can only cancel your own pending legacy device enrollment requests.' };
    }

    if (targetDevice.status === 'SOLD') {
      return { success: false, error: 'Cannot cancel an enrolled device that has already been sold.' };
    }

    // Remove from local legacy devices state
    setLegacyDevices(prev => prev.filter(ld => ld.id !== id));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await deleteDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id));
      } catch (err) {
        console.error('Error removing legacy device from Firestore:', err);
        try {
          await setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
            status: 'CANCELLED',
            isApproved: false,
            addedToInventory: false
          }, { merge: true });
        } catch (e) {
          console.error('Fallback cancel update failed:', e);
        }
      }
    }

    logAuditAction({
      category: 'device',
      action: 'DEVICE_CANCELLED',
      title: 'Legacy Device Enrol Request Cancelled',
      description: `Enrollment request for "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}) cancelled by ${currentUser.name}.`,
      workspaceId: targetWsId,
      targetId: id,
      targetName: targetDevice.deviceNameModel,
      metadata: { macAddress: targetDevice.macAddress, customerName: targetDevice.customerName, status: 'CANCELLED' }
    }).catch(() => {});

    showToast(`✓ Legacy device enrollment request for "${targetDevice.deviceNameModel}" cancelled successfully.`, 'success');
    return { success: true };
  };

  const declineLegacyDeviceEnrollment = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';
    if (!isPrivileged) {
      return { success: false, error: 'Unauthorized: Only an Administrator can decline legacy device enrollments.' };
    }

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, error: 'Legacy device request not found.' };
    }

    // Update locally
    setLegacyDevices(prev => prev.map(ld => {
      if (ld.id === id) {
        return {
          ...ld,
          status: 'CANCELLED',
          isApproved: false,
          addedToInventory: false
        };
      }
      return ld;
    }));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
          status: 'CANCELLED',
          isApproved: false,
          addedToInventory: false
        });
      } catch (err) {
        console.error('Error declining legacy device enrollment in Firestore:', err);
        try {
          await setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
            status: 'CANCELLED',
            isApproved: false,
            addedToInventory: false
          }, { merge: true });
        } catch (e) {
          console.error('Fallback decline update failed:', e);
        }
      }
    }

    logAuditAction({
      category: 'device',
      action: 'DEVICE_DECLINED',
      title: 'Legacy Device Enrolment Declined',
      description: `Enrollment request for "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}) declined by ${currentUser.name}.`,
      workspaceId: targetWsId,
      targetId: id,
      targetName: targetDevice.deviceNameModel,
      metadata: { macAddress: targetDevice.macAddress, customerName: targetDevice.customerName, status: 'CANCELLED' }
    }).catch(() => {});

    if (targetDevice.fieldAgentId) {
      addNotification(`Your legacy device enrollment request for "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}) was declined by Administrator.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [targetDevice.fieldAgentId],
        targetAgentNames: targetDevice.fieldAgentName ? [targetDevice.fieldAgentName] : [],
        isBroadcast: false
      });
    }

    showToast(`✗ Legacy device enrollment request for "${targetDevice.deviceNameModel}" declined successfully.`, 'info');
    return { success: true };
  };

  const requestLegacyDeviceDeletion = async (id: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, error: 'Legacy device not found.' };
    }

    const isOwnerAgent = targetDevice.fieldAgentId === currentUser.uid || (targetDevice.fieldAgentName && currentUser.name && targetDevice.fieldAgentName.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';

    if (!isOwnerAgent && !isPrivileged) {
      return { success: false, error: 'You can only request deletion for legacy devices assigned to you.' };
    }

    const deletionPayload = {
      deletionRequested: true,
      deletionRequestedAt: new Date().toISOString(),
      deletionRequestedBy: currentUser.name || 'Agent',
      deletionReason: reason ? reason.trim() : 'Requested by field agent'
    };

    setLegacyDevices(prev => prev.map(ld => ld.id === id ? { ...ld, ...deletionPayload } : ld));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), deletionPayload);
      } catch (err) {
        console.error('Error updating legacy device deletion request in Firestore:', err);
        try {
          await setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), deletionPayload, { merge: true });
        } catch (e) {
          console.error('Fallback deletion request update failed:', e);
        }
      }
    }

    addNotification(`Deletion requested by ${currentUser.name} for legacy device "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}).`, {
      targetAudience: 'ADMIN',
      targetRole: 'Admin',
      isBroadcast: false
    });

    logAuditAction({
      category: 'device',
      action: 'DEVICE_DELETION_REQUESTED',
      title: 'Legacy Device Deletion Requested',
      description: `Agent ${currentUser.name} requested deletion of legacy device "${targetDevice.deviceNameModel}" (${targetDevice.macAddress}). Reason: ${reason || 'Not specified'}.`,
      workspaceId: targetWsId,
      targetId: id,
      targetName: targetDevice.deviceNameModel,
      metadata: { macAddress: targetDevice.macAddress, customerName: targetDevice.customerName, reason }
    }).catch(() => {});

    showToast(`✓ Deletion request for "${targetDevice.deviceNameModel}" submitted to Admin.`, 'info');
    return { success: true };
  };

  const cancelLegacyDeviceDeletionRequest = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, error: 'Legacy device not found.' };
    }

    setLegacyDevices(prev => prev.map(ld => {
      if (ld.id === id) {
        const copy = { ...ld };
        delete copy.deletionRequested;
        delete copy.deletionRequestedAt;
        delete copy.deletionRequestedBy;
        delete copy.deletionReason;
        return copy;
      }
      return ld;
    }));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
          deletionRequested: false,
          deletionRequestedAt: deleteField(),
          deletionRequestedBy: deleteField(),
          deletionReason: deleteField()
        });
      } catch (err) {
        console.error('Error resetting deletion request in Firestore:', err);
      }
    }

    showToast(`✓ Deletion request for "${targetDevice.deviceNameModel}" cancelled.`, 'info');
    return { success: true };
  };

  const deleteLegacyDevice = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';
    if (!isPrivileged) {
      return { success: false, error: 'Unauthorized: Only an Administrator can delete legacy devices.' };
    }

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, error: 'Legacy device not found.' };
    }

    // Remove from local state immediately
    setLegacyDevices(prev => prev.filter(ld => ld.id !== id));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await deleteDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id));
      } catch (err) {
        console.error('Error removing legacy device from Firestore:', err);
        try {
          await setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
            status: 'CANCELLED',
            isApproved: false,
            addedToInventory: false,
            deletedAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error('Fallback delete update failed:', e);
        }
      }
    }

    logAuditAction({
      category: 'device',
      action: 'DEVICE_DELETED',
      title: 'Legacy Device Permanently Deleted',
      description: `Legacy device "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}) belonging to ${targetDevice.customerName} permanently deleted by ${currentUser.name}.`,
      workspaceId: targetWsId,
      targetId: id,
      targetName: targetDevice.deviceNameModel,
      metadata: { macAddress: targetDevice.macAddress, customerName: targetDevice.customerName, deletedBy: currentUser.name }
    }).catch(() => {});

    showToast(`✓ Legacy device "${targetDevice.deviceNameModel}" permanently deleted.`, 'success');
    return { success: true };
  };

  const updateLegacyDeviceLeaseExpiry = async (
    id: string, 
    newExpiresAt: string, 
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';
    if (!isPrivileged) {
      return { success: false, error: 'Unauthorized: Only an Administrator or Master can edit device lease expiry.' };
    }

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) {
      return { success: false, error: 'Legacy device not found.' };
    }

    const expiryTimestamp = new Date(newExpiresAt).getTime();
    if (isNaN(expiryTimestamp)) {
      return { success: false, error: 'Invalid expiration date provided.' };
    }

    const isoExpiresAt = new Date(expiryTimestamp).toISOString();
    const now = Date.now();
    const isLeaseActive = expiryTimestamp > now;
    
    // Status is active (SOLD) if new expiration is in the future, or EXPIRED if in past
    const newStatus: LegacyDevice['status'] = isLeaseActive ? 'SOLD' : 'EXPIRED';

    const updatedDevice: LegacyDevice = {
      ...targetDevice,
      expiresAt: isoExpiresAt,
      status: newStatus
    };

    setLegacyDevices(prev => {
      const updated = prev.map(ld => ld.id === id ? updatedDevice : ld);
      try {
        safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
      } catch (e) {}
      return deduplicateLegacyDevices(updated);
    });

    const formattedDate = new Date(isoExpiresAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      const fsWrite = setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
        expiresAt: isoExpiresAt,
        status: newStatus,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.error('Error updating legacy device lease expiry in Firestore:', err);
      });

      Promise.race([fsWrite, new Promise(res => setTimeout(res, 2500))]).catch(() => {});
    }

    logAuditAction({
      category: 'device',
      action: 'UPDATE_LEGACY_DEVICE_LEASE',
      title: 'Legacy Device Lease Expiry Updated',
      description: `Administrator updated lease expiration for device "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}, Customer: ${targetDevice.customerName}) to ${formattedDate}.${reason ? ` Reason: "${reason.trim()}"` : ''}`,
      workspaceId: targetWsId,
      targetId: targetDevice.id,
      targetName: targetDevice.deviceNameModel,
      metadata: {
        macAddress: targetDevice.macAddress,
        customerName: targetDevice.customerName,
        previousExpiresAt: targetDevice.expiresAt,
        newExpiresAt: isoExpiresAt,
        status: newStatus,
        reason: reason?.trim()
      }
    }).catch(() => {});

    showToast(`✓ Lease expiry for "${targetDevice.deviceNameModel}" updated to ${formattedDate}.`, 'success');
    if (targetDevice.fieldAgentId) {
      addNotification(`Admin updated lease expiry for device "${targetDevice.deviceNameModel}" to ${formattedDate}.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [targetDevice.fieldAgentId],
        targetAgentNames: targetDevice.fieldAgentName ? [targetDevice.fieldAgentName] : [],
        isBroadcast: false
      });
    }

    autoPushActionToDb('Update Legacy Device Lease Expiry', targetWsId);
    return { success: true };
  };

  const requestLegacyDeviceRenewal = async (
    id: string,
    durationDays: 14 | 30,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) return { success: false, error: 'Legacy device not found.' };

    const updatedDevice: LegacyDevice = {
      ...targetDevice,
      renewalRequested: true,
      renewalRequestedAt: new Date().toISOString(),
      renewalRequestedBy: currentUser.name || currentUser.email || 'Agent',
      renewalRequestedDurationDays: durationDays,
      renewalReason: reason?.trim() || undefined,
      renewalStatus: 'Pending'
    };

    setLegacyDevices(prev => {
      const updated = prev.map(ld => ld.id === id ? updatedDevice : ld);
      try {
        safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
      } catch (e) {}
      return deduplicateLegacyDevices(updated);
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      const fsWrite = setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
        renewalRequested: true,
        renewalRequestedAt: updatedDevice.renewalRequestedAt,
        renewalRequestedBy: updatedDevice.renewalRequestedBy,
        renewalRequestedDurationDays: durationDays,
        renewalReason: updatedDevice.renewalReason || deleteField(),
        renewalStatus: 'Pending',
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.error('Error requesting legacy device renewal in Firestore:', err);
      });

      Promise.race([fsWrite, new Promise(res => setTimeout(res, 2500))]).catch(() => {});
    }

    addNotification(`🚨 LEASE RENEWAL REQUEST: Agent "${currentUser.name}" requested a ${durationDays}-day lease renewal for device "${targetDevice.deviceNameModel}" (Client: ${targetDevice.customerName}).`, {
      targetAudience: 'ADMIN',
      targetRole: 'Admin',
      isBroadcast: false
    });

    logAuditAction({
      category: 'device',
      action: 'REQUEST_LEASE_RENEWAL',
      title: 'Legacy Device Lease Renewal Requested',
      description: `Agent ${currentUser.name} requested a ${durationDays}-day lease renewal for "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}, Customer: ${targetDevice.customerName}).${reason ? ` Reason: "${reason.trim()}"` : ''}`,
      workspaceId: targetWsId,
      targetId: targetDevice.id,
      targetName: targetDevice.deviceNameModel
    }).catch(() => {});

    showToast(`✓ Renewal request (${durationDays} days) submitted to Admin for "${targetDevice.deviceNameModel}".`, 'success');
    autoPushActionToDb('Request Legacy Lease Renewal', targetWsId);
    return { success: true };
  };

  const approveLegacyDeviceRenewal = async (
    id: string,
    adminNotes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';
    if (!isPrivileged) return { success: false, error: 'Unauthorized: Only an Administrator or Master can approve lease renewals.' };

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) return { success: false, error: 'Legacy device not found.' };

    const durationDays = targetDevice.renewalRequestedDurationDays === 14 ? 14 : 30;
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const currentExpiryTime = targetDevice.expiresAt ? new Date(targetDevice.expiresAt).getTime() : 0;

    // If current expiry is in the future, extend from current expiry; otherwise extend from now
    const baseTime = (currentExpiryTime > now) ? currentExpiryTime : now;
    const newExpiresAt = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const formattedDate = new Date(newExpiresAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const newLeaseCount = (targetDevice.leaseCount || 1) + 1;
    const renewalPrice = targetDevice.renewalAmount ?? targetDevice.soldPrice ?? targetDevice.monthlyPrice ?? 0;

    const updatedDevice: LegacyDevice = {
      ...targetDevice,
      expiresAt: newExpiresAt,
      leaseDurationDays: durationDays,
      status: 'SOLD',
      renewalRequested: false,
      renewalStatus: 'Approved',
      approvedAt: nowIso,
      soldAt: nowIso,
      lastRenewedAt: nowIso,
      leaseCount: newLeaseCount,
      renewalAmount: renewalPrice
    };

    setLegacyDevices(prev => {
      const updated = prev.map(ld => ld.id === id ? updatedDevice : ld);
      try {
        safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
      } catch (e) {}
      return deduplicateLegacyDevices(updated);
    });

    // Instantly credit selling agent sales & commission (performanceScore)
    if (renewalPrice > 0 && targetDevice.fieldAgentId) {
      setUsers(prev => {
        const updatedUsers = prev.map(u => {
          if (u.uid === targetDevice.fieldAgentId || (u.name && targetDevice.fieldAgentName && u.name.toLowerCase().trim() === targetDevice.fieldAgentName.toLowerCase().trim())) {
            return { ...u, performanceScore: (u.performanceScore || 0) + renewalPrice };
          }
          return u;
        });
        try {
          safeSetItem('wivote_users', JSON.stringify(updatedUsers));
        } catch (e) {}
        return updatedUsers;
      });

      setLeaderboardSummary(prev => ({
        ...prev,
        [targetDevice.fieldAgentId]: (prev[targetDevice.fieldAgentId] || 0) + renewalPrice
      }));
    }

    // Update returning customer's total purchases and total spend count
    if (targetDevice.customerId || targetDevice.customerName) {
      setCustomers(prev => prev.map(c => {
        const isMatch = (targetDevice.customerId && c.id === targetDevice.customerId) || (targetDevice.customerName && c.name && c.name.toLowerCase().trim() === targetDevice.customerName.toLowerCase().trim());
        if (isMatch) {
          const updatedCust = {
            ...c,
            totalPurchases: (c.totalPurchases || 0) + 1,
            totalSpend: (c.totalSpend || 0) + renewalPrice,
            updatedAt: now
          };
          if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system' && c.id) {
            updateDoc(doc(db, 'workspaces', targetWsId, 'customers', c.id), {
              totalPurchases: updatedCust.totalPurchases,
              totalSpend: updatedCust.totalSpend,
              updatedAt: now
            }).catch(() => {});
          }
          return updatedCust;
        }
        return c;
      }));
    }

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      const fsWrite = async () => {
        try {
          await setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
            expiresAt: newExpiresAt,
            leaseDurationDays: durationDays,
            status: 'SOLD',
            renewalRequested: false,
            renewalStatus: 'Approved',
            approvedAt: nowIso,
            soldAt: nowIso,
            lastRenewedAt: nowIso,
            leaseCount: newLeaseCount,
            renewalAmount: renewalPrice,
            updatedAt: nowIso
          }, { merge: true });

          if (renewalPrice > 0 && targetDevice.fieldAgentId) {
            const uRef = doc(db, 'workspaces', targetWsId, 'users', targetDevice.fieldAgentId);
            updateDoc(uRef, { performanceScore: increment(renewalPrice) }).catch(() => {});
            const uRoot = doc(db, 'users', targetDevice.fieldAgentId);
            updateDoc(uRoot, { performanceScore: increment(renewalPrice) }).catch(() => {});
            const lbRef = doc(db, 'workspaces', targetWsId, 'leaderboard', 'summary');
            setDoc(lbRef, { [targetDevice.fieldAgentId]: increment(renewalPrice), updatedAt: nowIso }, { merge: true }).catch(() => {});
          }
        } catch (err) {
          console.error('Error approving legacy device renewal in Firestore:', err);
        }
      };

      Promise.race([fsWrite(), new Promise(res => setTimeout(res, 2500))]).catch(() => {});
    }

    if (targetDevice.fieldAgentId) {
      addNotification(`✓ LEASE RENEWAL APPROVED: Admin approved ${durationDays}-day lease renewal (Lease #${newLeaseCount}, $${renewalPrice.toFixed(2)}) for device "${targetDevice.deviceNameModel}". Agent sales credited. New expiration date: ${formattedDate}.`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [targetDevice.fieldAgentId],
        targetAgentNames: targetDevice.fieldAgentName ? [targetDevice.fieldAgentName] : [],
        isBroadcast: false
      });
    }

    logAuditAction({
      category: 'device',
      action: 'APPROVE_LEASE_RENEWAL',
      title: 'Legacy Device Lease Renewal Approved',
      description: `Administrator approved ${durationDays}-day lease renewal (Lease #${newLeaseCount}, $${renewalPrice.toFixed(2)}) for device "${targetDevice.deviceNameModel}" (Customer: ${targetDevice.customerName}). Agent credited $${renewalPrice.toFixed(2)}. New expiration date: ${formattedDate}.${adminNotes ? ` Notes: "${adminNotes.trim()}"` : ''}`,
      workspaceId: targetWsId,
      targetId: targetDevice.id,
      targetName: targetDevice.deviceNameModel,
      metadata: { leaseCount: newLeaseCount, renewalAmount: renewalPrice, durationDays, newExpiresAt }
    }).catch(() => {});

    showToast(`✓ Lease renewal (Lease #${newLeaseCount}) approved for "${targetDevice.deviceNameModel}" ($${renewalPrice.toFixed(2)} credited to ${targetDevice.fieldAgentName}).`, 'success');
    autoPushActionToDb('Approve Legacy Lease Renewal', targetWsId);
    return { success: true };
  };

  const updateCaptivePortalUrl = async (url: string): Promise<{ success: boolean; error?: string }> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Update Captive Portal Settings');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return { success: false, error: authVerdict.error };
    }
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId;
    if (!targetWsId) return { success: false, error: 'No active workspace found' };

    const cleanUrl = url.trim();

    setWorkspaces(prev => prev.map(w => w.id === targetWsId ? { ...w, captivePortalUrl: cleanUrl } : w));

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      try {
        await setDoc(doc(db, 'workspaces', targetWsId), { captivePortalUrl: cleanUrl }, { merge: true });
      } catch (err) {
        console.error("Error updating captive portal URL in Firestore:", err);
      }
    }

    showToast('✓ Captive portal whitelist link updated successfully.', 'success');
    return { success: true };
  };

  const declineLegacyDeviceRenewal = async (
    id: string,
    adminNotes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const isPrivileged = currentUser.role === 'WorkspaceMaster' || currentUser.role === 'Admin' || currentUser.role === 'AppOwner' || currentUser.email === 'karimazondomike049@gmail.com';
    if (!isPrivileged) return { success: false, error: 'Unauthorized: Only an Administrator or Master can decline lease renewals.' };

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) return { success: false, error: 'Legacy device not found.' };

    const updatedDevice: LegacyDevice = {
      ...targetDevice,
      renewalRequested: false,
      renewalStatus: 'Declined'
    };

    setLegacyDevices(prev => {
      const updated = prev.map(ld => ld.id === id ? updatedDevice : ld);
      try {
        safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
      } catch (e) {}
      return deduplicateLegacyDevices(updated);
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      const fsWrite = setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
        renewalRequested: false,
        renewalStatus: 'Declined',
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.error('Error declining legacy device renewal in Firestore:', err);
      });

      Promise.race([fsWrite, new Promise(res => setTimeout(res, 2500))]).catch(() => {});
    }

    if (targetDevice.fieldAgentId) {
      addNotification(`✗ LEASE RENEWAL DECLINED: Admin declined lease renewal request for device "${targetDevice.deviceNameModel}".`, {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [targetDevice.fieldAgentId],
        targetAgentNames: targetDevice.fieldAgentName ? [targetDevice.fieldAgentName] : [],
        isBroadcast: false
      });
    }

    showToast(`Declined lease renewal request for "${targetDevice.deviceNameModel}".`, 'info');
    autoPushActionToDb('Decline Legacy Lease Renewal', targetWsId);
    return { success: true };
  };

  const cancelLegacyDeviceRenewalRequest = async (
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    const targetDevice = legacyDevices.find(ld => ld.id === id);
    if (!targetDevice) return { success: false, error: 'Legacy device not found.' };

    const updatedDevice: LegacyDevice = {
      ...targetDevice,
      renewalRequested: false,
      renewalStatus: undefined
    };

    setLegacyDevices(prev => {
      const updated = prev.map(ld => ld.id === id ? updatedDevice : ld);
      try {
        safeSetItem('wivote_legacy_devices', JSON.stringify(updated));
      } catch (e) {}
      return deduplicateLegacyDevices(updated);
    });

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      const fsWrite = setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', id), {
        renewalRequested: false,
        renewalStatus: deleteField(),
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.error('Error cancelling legacy device renewal request in Firestore:', err);
      });

      Promise.race([fsWrite, new Promise(res => setTimeout(res, 2500))]).catch(() => {});
    }

    showToast(`✓ Renewal request withdrawn for "${targetDevice.deviceNameModel}".`, 'info');
    autoPushActionToDb('Cancel Legacy Lease Renewal Request', targetWsId);
    return { success: true };
  };

  /**
   * Request transaction reversal by field agent (or admin) of either a voucher sale or legacy device sale.
   */
  const requestTransactionReversal = async (params: {
    transactionType: ReversalTransactionType;
    transactionId: string;
    reason: string;
  }): Promise<{ success: boolean; error?: string; requestId?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const { transactionType, transactionId, reason } = params;
    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      showToast('A reason for the reversal request is required.', 'error');
      return { success: false, error: 'A reason for reversal is required.' };
    }

    const reqId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    if (transactionType === 'voucher') {
      const targetVoucher = vouchers.find(v => v.id === transactionId);
      if (!targetVoucher) {
        showToast('Voucher transaction not found.', 'error');
        return { success: false, error: 'Voucher transaction not found.' };
      }
      if (targetVoucher.status !== 'Sold' && !targetVoucher.soldAt) {
        showToast('Only sold voucher transactions can be reversed.', 'error');
        return { success: false, error: 'Only sold voucher transactions can be reversed.' };
      }
      if (targetVoucher.reversalStatus === 'Pending') {
        showToast('A reversal request is already pending for this voucher.', 'info');
        return { success: false, error: 'A reversal request is already pending for this voucher.' };
      }

      const voucherWsId = targetVoucher.workspaceId || targetWsId || 'ws_vakzim';
      const soldAmount = targetVoucher.soldPrice ?? targetVoucher.price;

      const newReq: TransactionReversalRequest = {
        id: reqId,
        workspaceId: voucherWsId,
        transactionType: 'voucher',
        transactionId: targetVoucher.id,
        referenceCode: targetVoucher.code,
        planOrModel: targetVoucher.plan,
        amount: soldAmount,
        customerName: targetVoucher.customerName,
        customerCell: targetVoucher.customerCell,
        customerId: targetVoucher.customerId,
        customerNumber: targetVoucher.customerNumber,
        agentId: currentUser.uid,
        agentName: currentUser.name || 'Field Agent',
        agentEmail: currentUser.email,
        reason: cleanReason,
        status: 'Pending',
        requestedAt: nowIso
      };

      setVouchers(prev => {
        const updated = prev.map(v => (v.id === transactionId || v.id === targetVoucher.id || (v.code && targetVoucher.code && v.code.toLowerCase().trim() === targetVoucher.code.toLowerCase().trim())) ? {
          ...v,
          reversalRequested: true,
          reversalRequestId: reqId,
          reversalReason: cleanReason,
          reversalRequestedAt: nowIso,
          reversalRequestedBy: currentUser.name || 'Field Agent',
          reversalStatus: 'Pending' as const
        } : v);
        try {
          saveVouchersCache(updated, 'wivote_vouchers');
          saveVouchersCache(updated.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        } catch (e) {}
        return updated;
      });

      setReversalRequests(prev => [newReq, ...prev.filter(r => r.id !== reqId)]);

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', reqId), cleanForFirestore(newReq))
          .catch(err => console.warn('Error recording voucher reversal request in Firestore:', err));
        updateDoc(doc(db, 'workspaces', targetWsId, 'vouchers', transactionId), cleanForFirestore({
          reversalRequested: true,
          reversalRequestId: reqId,
          reversalReason: cleanReason,
          reversalRequestedAt: nowIso,
          reversalRequestedBy: currentUser.name || 'Field Agent',
          reversalStatus: 'Pending'
        })).catch(err => {
          setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', transactionId), cleanForFirestore({
            reversalRequested: true,
            reversalRequestId: reqId,
            reversalReason: cleanReason,
            reversalRequestedAt: nowIso,
            reversalRequestedBy: currentUser.name || 'Field Agent',
            reversalStatus: 'Pending'
          }), { merge: true }).catch(e => console.warn('Error updating voucher reversal in Firestore:', e));
        });
      }

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REVERSAL_REQUEST',
          payload: { request: newReq }
        })
      }).catch(console.warn);

      autoPushActionToDb('Reversal: Voucher Reversal Requested', targetWsId);

      logAuditAction({
        category: 'reversal',
        action: 'REQUEST_VOUCHER_REVERSAL',
        title: 'Voucher Sale Reversal Requested',
        description: `Agent ${currentUser.name} requested reversal for voucher ${targetVoucher.code} ($${(soldAmount || 0).toFixed(2)}). Reason: ${cleanReason}`,
        workspaceId: targetWsId,
        targetId: targetVoucher.id,
        targetName: targetVoucher.code,
        metadata: { voucherCode: targetVoucher.code, amount: soldAmount, reason: cleanReason }
      }).catch(() => {});

      addNotification(`🔄 Reversal Requested: Agent ${currentUser.name || 'Agent'} requested reversal for Voucher ${targetVoucher.code} ($${(soldAmount || 0).toFixed(2)}). Reason: ${cleanReason}`, {
        targetAudience: 'ADMIN',
        targetRole: 'Admin',
        isBroadcast: false,
        notifType: 'reversal_request',
        reversalRequestId: reqId,
        transactionId: transactionId,
        referenceCode: targetVoucher.code
      });

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REVERSAL_REQUEST', payload: { request: newReq } })
      }).catch(console.warn);

      showToast(`✓ Reversal request for Voucher ${targetVoucher.code} submitted to Admin.`, 'success');
      return { success: true, requestId: reqId };
    } else {
      const targetDevice = legacyDevices.find(ld => ld.id === transactionId);
      if (!targetDevice) {
        showToast('Legacy device transaction not found.', 'error');
        return { success: false, error: 'Legacy device transaction not found.' };
      }
      if (targetDevice.status !== 'SOLD' && !targetDevice.soldAt) {
        showToast('Only sold legacy device transactions can be reversed.', 'error');
        return { success: false, error: 'Only sold legacy device transactions can be reversed.' };
      }
      if (targetDevice.reversalStatus === 'Pending') {
        showToast('A reversal request is already pending for this device.', 'info');
        return { success: false, error: 'A reversal request is already pending for this device.' };
      }

      const deviceWsId = targetDevice.workspaceId || targetWsId || 'ws_vakzim';
      const devAmount = targetDevice.soldPrice ?? targetDevice.monthlyPrice ?? 0;

      const newReq: TransactionReversalRequest = {
        id: reqId,
        workspaceId: deviceWsId,
        transactionType: 'legacy_device',
        transactionId: targetDevice.id,
        referenceCode: targetDevice.macAddress || targetDevice.deviceNameModel,
        planOrModel: targetDevice.deviceNameModel,
        amount: devAmount,
        customerName: targetDevice.customerName,
        customerCell: targetDevice.customerCell,
        customerId: targetDevice.customerId,
        customerNumber: targetDevice.customerNumber,
        agentId: currentUser.uid,
        agentName: currentUser.name || 'Field Agent',
        agentEmail: currentUser.email,
        reason: cleanReason,
        status: 'Pending',
        requestedAt: nowIso
      };

      setLegacyDevices(prev => prev.map(ld => ld.id === transactionId ? {
        ...ld,
        reversalRequested: true,
        reversalRequestId: reqId,
        reversalReason: cleanReason,
        reversalRequestedAt: nowIso,
        reversalRequestedBy: currentUser.name || 'Field Agent',
        reversalStatus: 'Pending'
      } : ld));

      setReversalRequests(prev => [newReq, ...prev.filter(r => r.id !== reqId)]);

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', reqId), cleanForFirestore(newReq))
          .catch(err => console.warn('Error recording legacy device reversal request in Firestore:', err));
        updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', transactionId), cleanForFirestore({
          reversalRequested: true,
          reversalRequestId: reqId,
          reversalReason: cleanReason,
          reversalRequestedAt: nowIso,
          reversalRequestedBy: currentUser.name || 'Field Agent',
          reversalStatus: 'Pending'
        })).catch(err => {
          setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', transactionId), cleanForFirestore({
            reversalRequested: true,
            reversalRequestId: reqId,
            reversalReason: cleanReason,
            reversalRequestedAt: nowIso,
            reversalRequestedBy: currentUser.name || 'Field Agent',
            reversalStatus: 'Pending'
          }), { merge: true }).catch(e => console.warn('Error updating device reversal in Firestore:', e));
        });
      }

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REVERSAL_REQUEST',
          payload: { request: newReq }
        })
      }).catch(console.warn);

      autoPushActionToDb('Reversal: Device Reversal Requested', targetWsId);

      logAuditAction({
        category: 'reversal',
        action: 'REQUEST_DEVICE_REVERSAL',
        title: 'Legacy Terminal Sale Reversal Requested',
        description: `Agent ${currentUser.name} requested reversal for device "${targetDevice.deviceNameModel}" (MAC: ${targetDevice.macAddress}, $${(devAmount || 0).toFixed(2)}). Reason: ${cleanReason}`,
        workspaceId: targetWsId,
        targetId: targetDevice.id,
        targetName: targetDevice.deviceNameModel,
        metadata: { macAddress: targetDevice.macAddress, amount: devAmount, reason: cleanReason }
      }).catch(() => {});

      addNotification(`🔄 Reversal Requested: Agent ${currentUser.name || 'Agent'} requested reversal for Device ${targetDevice.deviceNameModel} ($${(devAmount || 0).toFixed(2)}). Reason: ${cleanReason}`, {
        targetAudience: 'ADMIN',
        targetRole: 'Admin',
        isBroadcast: false,
        notifType: 'reversal_request',
        reversalRequestId: reqId,
        transactionId: transactionId,
        referenceCode: targetDevice.macAddress || targetDevice.deviceNameModel
      });

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REVERSAL_REQUEST', payload: { request: newReq } })
      }).catch(console.warn);

      showToast(`✓ Reversal request for Device "${targetDevice.deviceNameModel}" submitted to Admin.`, 'success');
      return { success: true, requestId: reqId };
    }
  };

  /**
   * Approve a transaction reversal request. Reverts the voucher or device back to available/assigned stock,
   * reverses the sale monetary totals, and notifies the agent.
   */
  const approveTransactionReversal = async (requestId: string, adminNotes?: string): Promise<{ success: boolean; error?: string }> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Approve Transaction Reversal');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Administrators', 'error');
      return { success: false, error: authVerdict.error };
    }

    const targetReq = reversalRequests.find(r => r.id === requestId);
    if (!targetReq) {
      showToast('Reversal request not found.', 'error');
      return { success: false, error: 'Reversal request not found.' };
    }

    const targetWsId = targetReq.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

    const nowIso = new Date().toISOString();
    const adminName = currentUser?.name || 'Administrator';
    const notes = adminNotes?.trim() || 'Approved by Admin';

    // 1. Update reversal request status
    const updatedReq: TransactionReversalRequest = {
      ...targetReq,
      status: 'Approved',
      reviewedAt: nowIso,
      reviewedBy: adminName,
      adminNotes: notes
    };

    setReversalRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));

    if (targetReq.transactionType === 'voucher') {
      const targetVoucher = vouchers.find(v => 
        v.id === targetReq.transactionId || 
        v.reversalRequestId === requestId ||
        (v.code && targetReq.referenceCode && v.code.toLowerCase().trim() === targetReq.referenceCode.toLowerCase().trim()) ||
        (v.code && targetReq.referenceCode && sanitizeVoucherCode(v).toLowerCase() === sanitizeVoucherCode(targetReq.referenceCode).toLowerCase())
      );
      const reversedPrice = targetReq.amount || (targetVoucher ? (targetVoucher.soldPrice ?? targetVoucher.price) : 0);
      const agentIdForInventory = targetReq.agentId || targetVoucher?.assignedAgentId || currentUser?.uid;
      const agentNameForInventory = targetReq.agentName || targetVoucher?.assignedAgentName || currentUser?.name;
      const cleanRefCode = (targetReq.referenceCode || '').toLowerCase().trim();

      // Prune from sold vouchers registry so neither local cache nor state sync treats it as sold
      removeSoldVoucherFromRegistry(targetReq.transactionId);
      if (targetReq.referenceCode) removeSoldVoucherFromRegistry(targetReq.referenceCode);
      if (targetVoucher?.id) removeSoldVoucherFromRegistry(targetVoucher.id);
      if (targetVoucher?.code) removeSoldVoucherFromRegistry(targetVoucher.code);

      setVouchers(prev => {
        let found = false;
        const updatedList = prev.map(v => {
          const isMatch = v.id === targetReq.transactionId || 
            v.reversalRequestId === requestId ||
            (v.code && cleanRefCode && v.code.toLowerCase().trim() === cleanRefCode) ||
            (v.code && cleanRefCode && sanitizeVoucherCode(v).toLowerCase() === cleanRefCode) ||
            (targetVoucher && (v.id === targetVoucher.id || (v.code && targetVoucher.code && v.code.toLowerCase().trim() === targetVoucher.code.toLowerCase().trim())));

          if (isMatch) {
            found = true;
            const copy: Voucher = {
              ...v,
              status: 'Assigned',
              assignedAgentId: agentIdForInventory,
              assignedAgentName: agentNameForInventory,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: nowIso,
              reversedBy: adminName,
              archived: false
            };
            delete copy.soldAt;
            delete copy.soldPrice;
            delete copy.discountApplied;
            delete copy.customerName;
            delete copy.customerCell;
            delete copy.customerId;
            delete copy.customerNumber;
            delete copy.loyaltyNotice;
            return copy;
          }
          return v;
        });

        // If voucher was not already in current in-memory voucher state, synthesize it into the assigned inventory list
        if (!found) {
          const restoredVoucher: Voucher = {
            id: targetVoucher?.id || targetReq.transactionId || `v_rev_${Date.now()}`,
            code: targetVoucher?.code || targetReq.referenceCode || 'REV-' + Date.now().toString().slice(-4),
            plan: targetVoucher?.plan || targetReq.planOrModel || 'Wi-Fi Voucher',
            price: targetVoucher?.originalPrice || targetVoucher?.price || targetReq.amount || 5,
            originalPrice: targetVoucher?.originalPrice || targetVoucher?.price || targetReq.amount || 5,
            duration: targetVoucher?.duration || '30 Days',
            location: targetVoucher?.location || 'Main Workspace',
            networkName: targetVoucher?.networkName || 'Wi-Fi Network',
            status: 'Assigned',
            workspaceId: targetWsId,
            assignedAgentId: agentIdForInventory,
            assignedAgentName: agentNameForInventory,
            reversalRequested: false,
            reversalStatus: 'Approved',
            reversedAt: nowIso,
            reversedBy: adminName,
            archived: false
          };
          updatedList.push(restoredVoucher);
        }

        try {
          saveVouchersCache(updatedList, 'wivote_vouchers');
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        } catch (e) {}
        return updatedList;
      });

      // Adjust selling agent's performanceScore on leaderboard
      if (reversedPrice > 0) {
        setUsers(prev => {
          const updatedUsers = prev.map(u => {
            if (u.uid === targetReq.agentId || (u.name && targetReq.agentName && u.name.toLowerCase().trim() === targetReq.agentName.toLowerCase().trim())) {
              return { ...u, performanceScore: Math.max(0, (u.performanceScore || 0) - reversedPrice) };
            }
            return u;
          });
          try {
            safeSetItem('wivote_users', JSON.stringify(updatedUsers));
          } catch (e) {}
          return updatedUsers;
        });

        setLeaderboardSummary(prev => ({
          ...prev,
          [targetReq.agentId]: Math.max(0, (prev[targetReq.agentId] || 0) - reversedPrice)
        }));
      }

      // Adjust customer loyalty records if applicable
      if (targetReq.customerId || targetReq.customerName) {
        setCustomers(prev => prev.map(c => {
          const isMatch = (targetReq.customerId && c.id === targetReq.customerId) || (targetReq.customerName && c.name && c.name.toLowerCase().trim() === targetReq.customerName.toLowerCase().trim());
          if (isMatch) {
            const updatedCust = {
              ...c,
              totalPurchases: Math.max(0, (c.totalPurchases || 1) - 1),
              totalSpend: Math.max(0, (c.totalSpend || reversedPrice) - reversedPrice),
              consecutivePurchases: (c.consecutivePurchases || []).filter(p => p.voucherId !== targetReq.transactionId)
            };
            if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system' && c.id) {
              updateDoc(doc(db, 'workspaces', targetWsId, 'customers', c.id), {
                totalPurchases: updatedCust.totalPurchases,
                totalSpend: updatedCust.totalSpend,
                consecutivePurchases: updatedCust.consecutivePurchases
              }).catch(() => {});
            }
            return updatedCust;
          }
          return c;
        }));
      }

      // Sync to Firestore
      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const syncFirestore = async () => {
          try {
            await setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', requestId), updatedReq, { merge: true });
            const vId = targetVoucher?.id || targetReq.transactionId;
            const vRef = doc(db, 'workspaces', targetWsId, 'vouchers', vId);
            const agentIdForInventory = targetVoucher?.assignedAgentId || targetReq.agentId;
            const agentNameForInventory = targetReq.agentName || targetVoucher?.assignedAgentName;
            const newStatus = agentIdForInventory ? 'Assigned' : 'Unused';
            const patch: Record<string, any> = {
              status: newStatus,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: nowIso,
              reversedBy: adminName,
              soldAt: deleteField(),
              soldPrice: deleteField(),
              discountApplied: deleteField(),
              customerName: deleteField(),
              customerCell: deleteField(),
              customerId: deleteField(),
              customerNumber: deleteField(),
              loyaltyNotice: deleteField()
            };
            if (agentIdForInventory) {
              patch.assignedAgentId = agentIdForInventory;
              if (agentNameForInventory) patch.assignedAgentName = agentNameForInventory;
            }
            try {
              await updateDoc(vRef, patch);
            } catch {
              await setDoc(vRef, {
                status: newStatus,
                assignedAgentId: agentIdForInventory || null,
                assignedAgentName: agentNameForInventory || null,
                reversalRequested: false,
                reversalStatus: 'Approved',
                reversedAt: nowIso,
                reversedBy: adminName
              }, { merge: true });
            }

            if (reversedPrice > 0 && targetReq.agentId) {
              const uRef = doc(db, 'workspaces', targetWsId, 'users', targetReq.agentId);
              updateDoc(uRef, { performanceScore: increment(-reversedPrice) }).catch(() => {});
            }
          } catch (e) {
            console.error('Error syncing voucher reversal approval in Firestore:', e);
          }
        };
        await Promise.race([
          syncFirestore(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      }
    } else {
      // Legacy device sale reversal
      const targetDevice = legacyDevices.find(ld => 
        ld.id === targetReq.transactionId || 
        ld.reversalRequestId === requestId || 
        (ld.macAddress && targetReq.referenceCode && ld.macAddress.toLowerCase().trim() === targetReq.referenceCode.toLowerCase().trim())
      );
      const reversedPrice = targetReq.amount || (targetDevice ? (targetDevice.soldPrice ?? targetDevice.monthlyPrice) : 0);

      setLegacyDevices(prev => {
        const updatedList = prev.map(ld => {
          const isMatch = ld.id === targetReq.transactionId || 
            ld.reversalRequestId === requestId || 
            (ld.macAddress && targetReq.referenceCode && ld.macAddress.toLowerCase().trim() === targetReq.referenceCode.toLowerCase().trim()) || 
            (targetDevice && ld.id === targetDevice.id);
          if (isMatch) {
            const copy: LegacyDevice = {
              ...ld,
              status: 'APPROVED',
              isApproved: true,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: nowIso,
              reversedBy: adminName
            };
            delete copy.soldAt;
            delete copy.soldPrice;
            delete copy.discountApplied;
            delete copy.customerName;
            delete copy.customerCell;
            delete copy.customerId;
            delete copy.customerNumber;
            return copy;
          }
          return ld;
        });
        try {
          safeSetItem('wivote_legacy_devices', JSON.stringify(updatedList));
          safeSetItem(`wivote_ws_legacy_${targetWsId}`, JSON.stringify(updatedList.filter(ld => resolveLegacyDeviceWorkspaceId(ld) === targetWsId)));
        } catch (e) {}
        return updatedList;
      });

      // Adjust selling agent's performanceScore on leaderboard
      if (reversedPrice > 0) {
        setUsers(prev => {
          const updatedUsers = prev.map(u => {
            if (u.uid === targetReq.agentId || (u.name && targetReq.agentName && u.name.toLowerCase().trim() === targetReq.agentName.toLowerCase().trim())) {
              return { ...u, performanceScore: Math.max(0, (u.performanceScore || 0) - reversedPrice) };
            }
            return u;
          });
          try {
            safeSetItem('wivote_users', JSON.stringify(updatedUsers));
          } catch (e) {}
          return updatedUsers;
        });

        setLeaderboardSummary(prev => ({
          ...prev,
          [targetReq.agentId]: Math.max(0, (prev[targetReq.agentId] || 0) - reversedPrice)
        }));
      }

      // Sync to Firestore
      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const syncFirestore = async () => {
          try {
            await setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', requestId), updatedReq, { merge: true });
            const devId = targetDevice?.id || targetReq.transactionId;
            const devRef = doc(db, 'workspaces', targetWsId, 'legacy_devices', devId);
            const patch = {
              status: 'APPROVED',
              isApproved: true,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: nowIso,
              reversedBy: adminName,
              soldAt: deleteField(),
              soldPrice: deleteField(),
              discountApplied: deleteField(),
              customerName: deleteField(),
              customerCell: deleteField(),
              customerId: deleteField(),
              customerNumber: deleteField()
            };
            try {
              await updateDoc(devRef, patch);
            } catch {
              await setDoc(devRef, {
                status: 'APPROVED',
                isApproved: true,
                reversalRequested: false,
                reversalStatus: 'Approved',
                reversedAt: nowIso,
                reversedBy: adminName
              }, { merge: true });
            }

            if (reversedPrice > 0 && targetReq.agentId) {
              const uRef = doc(db, 'workspaces', targetWsId, 'users', targetReq.agentId);
              updateDoc(uRef, { performanceScore: increment(-reversedPrice) }).catch(() => {});
            }
          } catch (e) {
            console.error('Error syncing device reversal approval in Firestore:', e);
          }
        };
        await Promise.race([
          syncFirestore(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      }
    }

    logAuditAction({
      category: 'reversal',
      action: 'APPROVE_REVERSAL',
      title: 'Transaction Reversal Approved',
      description: `Reversal approved by ${adminName} for ${targetReq.transactionType} ${targetReq.referenceCode} ($${(targetReq.amount || 0).toFixed(2)}). Agent: ${targetReq.agentName}. Reason: ${targetReq.reason}. Notes: ${notes}`,
      workspaceId: targetWsId,
      targetId: targetReq.transactionId,
      targetName: targetReq.referenceCode,
      metadata: { requestId, transactionType: targetReq.transactionType, amount: targetReq.amount, adminNotes: notes }
    }).catch(() => {});

    addNotification(
      `✅ REVERSAL APPROVED: Sale reversal for ${targetReq.transactionType === 'voucher' ? 'Voucher' : 'Terminal'} ${targetReq.referenceCode} ($${(targetReq.amount || 0).toFixed(2)}) was approved by ${adminName}.${notes ? ` Note: ${notes}` : ''}`,
      {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [targetReq.agentId],
        targetAgentNames: [targetReq.agentName],
        isBroadcast: false,
        notifType: 'reversal_status',
        reversalRequestId: requestId,
        transactionId: targetReq.transactionId,
        referenceCode: targetReq.referenceCode
      }
    );

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'APPROVE_REVERSAL',
        payload: {
          requestId,
          voucherId: targetReq.transactionType === 'voucher' ? targetReq.transactionId : undefined,
          legacyDeviceId: targetReq.transactionType === 'legacy_device' ? targetReq.transactionId : undefined,
          reviewedBy: adminName,
          reviewedAt: nowIso,
          adminNotes: notes
        }
      })
    }).catch(console.warn);

    showToast(`✓ Transaction reversal for ${targetReq.referenceCode} approved. Sale reversed.`, 'success');
    return { success: true };
  };

  /**
   * Reject a transaction reversal request.
   */
  const rejectTransactionReversal = async (requestId: string, adminNotes?: string): Promise<{ success: boolean; error?: string }> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Reject Transaction Reversal');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Administrators', 'error');
      return { success: false, error: authVerdict.error };
    }

    const targetReq = reversalRequests.find(r => r.id === requestId);
    if (!targetReq) {
      showToast('Reversal request not found.', 'error');
      return { success: false, error: 'Reversal request not found.' };
    }

    const targetWsId = targetReq.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

    const nowIso = new Date().toISOString();
    const adminName = currentUser?.name || 'Administrator';
    const notes = adminNotes?.trim() || 'Declined by Admin';

    const updatedReq: TransactionReversalRequest = {
      ...targetReq,
      status: 'Rejected',
      reviewedAt: nowIso,
      reviewedBy: adminName,
      adminNotes: notes
    };

    setReversalRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));

    if (targetReq.transactionType === 'voucher') {
      setVouchers(prev => prev.map(v => v.id === targetReq.transactionId ? {
        ...v,
        reversalRequested: false,
        reversalStatus: 'Rejected'
      } : v));

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const syncFirestore = async () => {
          try {
            await setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', requestId), updatedReq);
            await updateDoc(doc(db, 'workspaces', targetWsId, 'vouchers', targetReq.transactionId), {
              reversalRequested: false,
              reversalStatus: 'Rejected'
            });
          } catch (e) {
            console.error('Error updating rejected voucher reversal in Firestore:', e);
          }
        };
        await Promise.race([
          syncFirestore(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      }
    } else {
      setLegacyDevices(prev => prev.map(ld => ld.id === targetReq.transactionId ? {
        ...ld,
        reversalRequested: false,
        reversalStatus: 'Rejected'
      } : ld));

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const syncFirestore = async () => {
          try {
            await setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', requestId), updatedReq);
            await updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', targetReq.transactionId), {
              reversalRequested: false,
              reversalStatus: 'Rejected'
            });
          } catch (e) {
            console.error('Error updating rejected device reversal in Firestore:', e);
          }
        };
        await Promise.race([
          syncFirestore(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      }
    }

    logAuditAction({
      category: 'reversal',
      action: 'REJECT_REVERSAL',
      title: 'Transaction Reversal Rejected',
      description: `Reversal rejected by ${adminName} for ${targetReq.transactionType} ${targetReq.referenceCode}. Agent: ${targetReq.agentName}. Reason: ${notes}`,
      workspaceId: targetWsId,
      targetId: targetReq.transactionId,
      targetName: targetReq.referenceCode,
      metadata: { requestId, transactionType: targetReq.transactionType, reason: notes }
    }).catch(() => {});

    addNotification(
      `❌ REVERSAL DECLINED: Sale reversal request for ${targetReq.referenceCode} was declined by ${adminName}.${notes ? ` Reason: ${notes}` : ''}`,
      {
        targetAudience: 'SPECIFIC',
        targetAgentIds: [targetReq.agentId],
        targetAgentNames: [targetReq.agentName],
        isBroadcast: false,
        notifType: 'reversal_status',
        reversalRequestId: requestId,
        transactionId: targetReq.transactionId,
        referenceCode: targetReq.referenceCode
      }
    );

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REJECT_REVERSAL',
        payload: {
          requestId,
          reviewedBy: adminName,
          reviewedAt: nowIso,
          adminNotes: notes
        }
      })
    }).catch(console.warn);

    showToast(`Reversal request for ${targetReq.referenceCode} declined.`, 'info');
    return { success: true };
  };

  /**
   * Cancel a pending transaction reversal request.
   */
  const cancelTransactionReversal = async (requestId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };
    const targetReq = reversalRequests.find(r => r.id === requestId);
    if (!targetReq) {
      showToast('Reversal request not found.', 'error');
      return { success: false, error: 'Reversal request not found.' };
    }

    const targetWsId = targetReq.workspaceId || (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

    setReversalRequests(prev => prev.filter(r => r.id !== requestId));

    if (targetReq.transactionType === 'voucher') {
      setVouchers(prev => prev.map(v => {
        if (v.id === targetReq.transactionId) {
          const copy = { ...v };
          delete copy.reversalRequested;
          delete copy.reversalRequestId;
          delete copy.reversalReason;
          delete copy.reversalRequestedAt;
          delete copy.reversalRequestedBy;
          delete copy.reversalStatus;
          return copy;
        }
        return v;
      }));

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const syncFirestore = async () => {
          try {
            await deleteDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', requestId));
            await updateDoc(doc(db, 'workspaces', targetWsId, 'vouchers', targetReq.transactionId), {
              reversalRequested: deleteField(),
              reversalRequestId: deleteField(),
              reversalReason: deleteField(),
              reversalRequestedAt: deleteField(),
              reversalRequestedBy: deleteField(),
              reversalStatus: deleteField()
            });
          } catch (e) {}
        };
        await Promise.race([
          syncFirestore(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      }
    } else {
      setLegacyDevices(prev => prev.map(ld => {
        if (ld.id === targetReq.transactionId) {
          const copy = { ...ld };
          delete copy.reversalRequested;
          delete copy.reversalRequestId;
          delete copy.reversalReason;
          delete copy.reversalRequestedAt;
          delete copy.reversalRequestedBy;
          delete copy.reversalStatus;
          return copy;
        }
        return ld;
      }));

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const syncFirestore = async () => {
          try {
            await deleteDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', requestId));
            await updateDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', targetReq.transactionId), {
              reversalRequested: deleteField(),
              reversalRequestId: deleteField(),
              reversalReason: deleteField(),
              reversalRequestedAt: deleteField(),
              reversalRequestedBy: deleteField(),
              reversalStatus: deleteField()
            });
          } catch (e) {}
        };
        await Promise.race([
          syncFirestore(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      }
    }

    showToast(`✓ Reversal request for "${targetReq.referenceCode}" cancelled.`, 'info');
    return { success: true };
  };

  /**
   * Robust Transaction Cancellation Handler
   * Locates target transaction or voucher, updates status to 'cancelled',
   * reverses voucher state back to 'unused' in inventory, subtracts associated
   * metrics from agent performance totals, and logs the audit event.
   */
  const cancelTransaction = async (
    target: string | { transactionId: string; reason?: string },
    optionalReason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Unauthorized: User not logged in' };

    const transactionId = typeof target === 'string' ? target : target.transactionId;
    const reason = (typeof target === 'string' ? optionalReason : target.reason) || 'Transaction cancelled per administrator request';

    if (!transactionId) {
      showToast('Transaction ID is required to perform cancellation.', 'error');
      return { success: false, error: 'Transaction ID is required' };
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';
    const nowIso = new Date().toISOString();
    const cancelledByName = currentUser.name || currentUser.email || 'Admin';

    // 1. Locate the target transaction / voucher
    const targetVoucher = vouchers.find(v => 
      v.id === transactionId || 
      v.code === transactionId || 
      (v as any).transactionId === transactionId ||
      v.code.toLowerCase() === transactionId.toLowerCase()
    );

    const targetDevice = !targetVoucher 
      ? legacyDevices.find(ld => ld.id === transactionId || ld.macAddress.toLowerCase() === transactionId.toLowerCase()) 
      : null;

    if (!targetVoucher && !targetDevice) {
      showToast(`Transaction record "${transactionId}" not found in current inventory.`, 'error');
      return { success: false, error: `Transaction ${transactionId} not found` };
    }

    if (targetVoucher) {
      const vId = targetVoucher.id;
      const amount = targetVoucher.soldPrice ?? targetVoucher.price ?? 0;
      const targetAgentId = targetVoucher.soldByAgentId || targetVoucher.assignedAgentId;
      const targetAgentName = targetVoucher.soldByAgentName || targetVoucher.assignedAgentName;

      // Prune from sold registry
      removeSoldVoucherFromRegistry(vId);
      if (targetVoucher.code) removeSoldVoucherFromRegistry(targetVoucher.code);

      // 2. Reverse voucher state back into assigned inventory allocated to the same agent as before
      setVouchers(prev => {
        const updatedList = prev.map(v => {
          if (v.id === vId) {
            const restored: Voucher = {
              ...v,
              status: targetAgentId ? 'Assigned' : 'Unused',
              assignedAgentId: targetAgentId,
              assignedAgentName: targetAgentName,
              assignedAgentEmail: (targetVoucher as any).assignedAgentEmail,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: nowIso,
              reversedBy: cancelledByName,
              archived: false
            };
            delete (restored as any).soldAt;
            delete (restored as any).soldPrice;
            delete (restored as any).discountApplied;
            delete (restored as any).customerName;
            delete (restored as any).customerCell;
            delete (restored as any).customerId;
            delete (restored as any).customerNumber;
            delete (restored as any).loyaltyNotice;
            return restored;
          }
          return v;
        });
        try {
          saveVouchersCache(updatedList, 'wivote_vouchers');
          if (targetWsId) {
            saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
          }
        } catch (e) {}
        return updatedList;
      });

      // Also mark any associated pending reversal request as Approved
      setReversalRequests(prev => {
        const updated = prev.map(req => {
          const isMatch = req.transactionId === vId || (targetVoucher.code && req.referenceCode && req.referenceCode.toLowerCase().trim() === targetVoucher.code.toLowerCase().trim());
          if (isMatch && req.status === 'Pending') {
            return {
              ...req,
              status: 'Approved' as const,
              approvedAt: nowIso,
              approvedBy: currentUser.uid,
              approvedByName: cancelledByName,
              adminNotes: 'Auto-approved via transaction cancellation: ' + reason,
              updatedAt: nowIso
            };
          }
          return req;
        });
        try {
          safeSetItem('wivote_reversal_requests', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      // 3. Subtract associated metrics from agent performance totals
      if (amount > 0 && targetAgentId) {
        setUsers(prev => {
          const updatedUsers = prev.map(u => {
            if (u.uid === targetAgentId || (u.name && targetAgentName && u.name.toLowerCase().trim() === targetAgentName.toLowerCase().trim())) {
              return { ...u, performanceScore: Math.max(0, (u.performanceScore || 0) - amount) };
            }
            return u;
          });
          try {
            safeSetItem('wivote_users', JSON.stringify(updatedUsers));
          } catch (e) {}
          return updatedUsers;
        });

        setLeaderboardSummary(prev => ({
          ...prev,
          [targetAgentId]: Math.max(0, (prev[targetAgentId] || 0) - amount)
        }));
      }

      // Also adjust customer purchase totals if applicable
      if (targetVoucher.customerId || targetVoucher.customerName) {
        setCustomers(prev => prev.map(c => {
          const isMatch = (targetVoucher.customerId && c.id === targetVoucher.customerId) || (targetVoucher.customerName && c.name && c.name.toLowerCase().trim() === targetVoucher.customerName.toLowerCase().trim());
          if (isMatch) {
            return {
              ...c,
              totalPurchases: Math.max(0, (c.totalPurchases || 1) - 1),
              totalSpend: Math.max(0, (c.totalSpend || amount) - amount),
              consecutivePurchases: (c.consecutivePurchases || []).filter(p => p.voucherId !== vId)
            };
          }
          return c;
        }));
      }

      // 4. Update status to 'cancelled' in Firestore & update voucher in Firestore
      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const txnRef = doc(db, 'workspaces', targetWsId, 'transactions', vId);
        setDoc(txnRef, {
          id: vId,
          transactionId: vId,
          voucherId: vId,
          voucherCode: targetVoucher.code,
          status: 'cancelled',
          cancelledAt: nowIso,
          cancelledBy: cancelledByName,
          cancelReason: reason,
          amount,
          agentId: targetAgentId,
          agentName: targetAgentName,
          workspaceId: targetWsId,
          timestamp: nowIso
        }, { merge: true }).catch(console.error);

        const vRef = doc(db, 'workspaces', targetWsId, 'vouchers', vId);
        const newStatus = targetAgentId ? 'Assigned' : 'Unused';
        updateDoc(vRef, {
          status: newStatus,
          assignedAgentId: targetAgentId || deleteField(),
          assignedAgentName: targetAgentName || deleteField(),
          assignedAgentEmail: (targetVoucher as any).assignedAgentEmail || deleteField(),
          soldAt: deleteField(),
          soldPrice: deleteField(),
          discountApplied: deleteField(),
          customerName: deleteField(),
          customerCell: deleteField(),
          customerId: deleteField(),
          customerNumber: deleteField(),
          loyaltyNotice: deleteField(),
          archived: false,
          reversalRequested: false,
          reversalStatus: 'Approved',
          cancelledAt: nowIso,
          cancelledBy: cancelledByName
        }).catch(() => {
          setDoc(vRef, {
            status: newStatus,
            assignedAgentId: targetAgentId || null,
            assignedAgentName: targetAgentName || null,
            archived: false,
            reversalRequested: false,
            reversalStatus: 'Approved',
            cancelledAt: nowIso,
            cancelledBy: cancelledByName
          }, { merge: true }).catch(console.error);
        });

        if (amount > 0 && targetAgentId) {
          const uRef = doc(db, 'workspaces', targetWsId, 'users', targetAgentId);
          updateDoc(uRef, { performanceScore: increment(-amount) }).catch(() => {});
          const uRoot = doc(db, 'users', targetAgentId);
          updateDoc(uRoot, { performanceScore: increment(-amount) }).catch(() => {});
          const lbRef = doc(db, 'workspaces', targetWsId, 'leaderboard', 'summary');
          setDoc(lbRef, { [targetAgentId]: increment(-amount), updatedAt: nowIso }, { merge: true }).catch(() => {});
        }

        const matchingReversalReq = reversalRequests.find(req => 
          req.transactionId === vId || (targetVoucher.code && req.referenceCode && req.referenceCode.toLowerCase().trim() === targetVoucher.code.toLowerCase().trim())
        );
        if (matchingReversalReq) {
          setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', matchingReversalReq.id), {
            status: 'Approved',
            approvedAt: nowIso,
            approvedBy: currentUser.uid,
            approvedByName: cancelledByName,
            adminNotes: 'Auto-approved via transaction cancellation: ' + reason,
            updatedAt: nowIso
          }, { merge: true }).catch(console.error);
        }
      }

      // 5. Log audit event
      await logAuditAction({
        category: 'reversal',
        action: 'CANCEL_TRANSACTION',
        title: 'Transaction Cancelled & Reverted',
        description: `Transaction for voucher ${targetVoucher.code} ($${(amount || 0).toFixed(2)}) cancelled by ${cancelledByName}. Voucher state reversed to unused inventory. Agent performance deducted. Reason: ${reason}`,
        workspaceId: targetWsId,
        targetId: vId,
        targetName: targetVoucher.code,
        metadata: {
          transactionId: vId,
          voucherCode: targetVoucher.code,
          amount,
          agentId: targetAgentId,
          agentName: targetAgentName,
          reason
        }
      }).catch(console.error);

      if (targetAgentId) {
        addNotification(`🚫 Transaction Cancelled: Voucher ${targetVoucher.code} ($${(amount || 0).toFixed(2)}) returned to unused inventory.`, {
          targetAudience: 'SPECIFIC',
          targetAgentIds: [targetAgentId],
          targetAgentNames: targetAgentName ? [targetAgentName] : [],
          isBroadcast: false
        });
      }

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CANCEL_TRANSACTION',
          payload: { voucherId: vId }
        })
      }).catch(console.warn);

      showToast(`✓ Transaction cancelled. Voucher ${targetVoucher.code} reversed to unused inventory.`, 'success');

      return { success: true };
    } else if (targetDevice) {
      const devId = targetDevice.id;
      const amount = targetDevice.soldPrice ?? targetDevice.monthlyPrice ?? 0;
      const targetAgentId = targetDevice.fieldAgentId;

      setLegacyDevices(prev => prev.map(ld => {
        if (ld.id === devId) {
          return {
            ...ld,
            status: 'APPROVED',
            isApproved: true,
            soldAt: undefined,
            soldPrice: undefined,
            reversalRequested: false,
            reversalStatus: 'Approved',
            reversedAt: nowIso,
            reversedBy: cancelledByName
          };
        }
        return ld;
      }));

      // Also mark any associated pending reversal request as Approved for device
      setReversalRequests(prev => {
        const updated = prev.map(req => {
          const isMatch = req.transactionId === devId || (targetDevice.macAddress && req.referenceCode && req.referenceCode.toLowerCase().trim() === targetDevice.macAddress.toLowerCase().trim());
          if (isMatch && req.status === 'Pending') {
            return {
              ...req,
              status: 'Approved' as const,
              approvedAt: nowIso,
              approvedBy: currentUser.uid,
              approvedByName: cancelledByName,
              adminNotes: 'Auto-approved via transaction cancellation: ' + reason,
              updatedAt: nowIso
            };
          }
          return req;
        });
        try {
          safeSetItem('wivote_reversal_requests', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      if (amount > 0 && targetAgentId) {
        setUsers(prev => {
          const updatedUsers = prev.map(u => {
            if (u.uid === targetAgentId || (u.name && u.name.toLowerCase().trim() === targetDevice.fieldAgentName.toLowerCase().trim())) {
              return { ...u, performanceScore: Math.max(0, (u.performanceScore || 0) - amount) };
            }
            return u;
          });
          try {
            safeSetItem('wivote_users', JSON.stringify(updatedUsers));
          } catch (e) {}
          return updatedUsers;
        });

        setLeaderboardSummary(prev => ({
          ...prev,
          [targetAgentId]: Math.max(0, (prev[targetAgentId] || 0) - amount)
        }));
      }

      if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
        const matchingReversalReq = reversalRequests.find(req => 
          req.transactionId === devId || (targetDevice.macAddress && req.referenceCode && req.referenceCode.toLowerCase().trim() === targetDevice.macAddress.toLowerCase().trim())
        );
        if (matchingReversalReq) {
          setDoc(doc(db, 'workspaces', targetWsId, 'reversal_requests', matchingReversalReq.id), {
            status: 'Approved',
            approvedAt: nowIso,
            approvedBy: currentUser.uid,
            approvedByName: cancelledByName,
            adminNotes: 'Auto-approved via transaction cancellation: ' + reason,
            updatedAt: nowIso
          }, { merge: true }).catch(console.error);
        }

        const txnRef = doc(db, 'workspaces', targetWsId, 'transactions', devId);
        setDoc(txnRef, {
          id: devId,
          transactionId: devId,
          type: 'legacy_device',
          status: 'cancelled',
          cancelledAt: nowIso,
          cancelledBy: cancelledByName,
          cancelReason: reason,
          amount,
          agentId: targetAgentId,
          timestamp: nowIso
        }, { merge: true }).catch(console.error);

        const devRef = doc(db, 'workspaces', targetWsId, 'legacy_devices', devId);
        updateDoc(devRef, {
          status: 'APPROVED',
          soldAt: deleteField(),
          soldPrice: deleteField(),
          cancelledAt: nowIso,
          cancelledBy: cancelledByName
        }).catch(() => {
          setDoc(devRef, { status: 'APPROVED', cancelledAt: nowIso }, { merge: true }).catch(console.error);
        });

        if (amount > 0 && targetAgentId) {
          const uRef = doc(db, 'workspaces', targetWsId, 'users', targetAgentId);
          updateDoc(uRef, { performanceScore: increment(-amount) }).catch(() => {});
        }
      }

      await logAuditAction({
        category: 'reversal',
        action: 'CANCEL_TRANSACTION',
        title: 'Terminal Sale Cancelled',
        description: `Transaction for device "${targetDevice.deviceNameModel}" ($${(amount || 0).toFixed(2)}) cancelled by ${cancelledByName}. Reason: ${reason}`,
        workspaceId: targetWsId,
        targetId: devId,
        targetName: targetDevice.deviceNameModel,
        metadata: { transactionId: devId, macAddress: targetDevice.macAddress, amount, reason }
      }).catch(console.error);

      if (targetAgentId) {
        addNotification(`🚫 Transaction Cancelled: Terminal ${targetDevice.deviceNameModel} ($${(amount || 0).toFixed(2)}) reversed.`, {
          targetAudience: 'SPECIFIC',
          targetAgentIds: [targetAgentId],
          targetAgentNames: targetDevice.fieldAgentName ? [targetDevice.fieldAgentName] : [],
          isBroadcast: false
        });
      }

      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CANCEL_TRANSACTION',
          payload: { legacyDeviceId: devId }
        })
      }).catch(console.warn);
      showToast(`✓ Transaction cancelled. Terminal "${targetDevice.deviceNameModel}" reversed.`, 'success');

      return { success: true };
    }

    return { success: false, error: 'Unknown transaction type' };
  };

  const simulateExpiredDeviceAlert = (customName?: string) => {
    if (!currentUser) return;
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const names = ['Kondwani Mwanga', 'Memory Chanda', 'Bwalya Tembo', 'Alice Banda', 'John Phiri', 'Derrick Zulu'];
    const models = ['MikroTik SXT 5nD', 'Ubiquiti LiteBeam M5', 'Cisco RV130 VPN', 'TP-Link WR840N'];
    const name = customName || names[Math.floor(Math.random() * names.length)];
    const model = models[Math.floor(Math.random() * models.length)];
    const randomMac = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':');

    const newDevice: LegacyDevice = {
      id: `ld_expired_${Date.now()}`,
      customerName: `${name} (Simulated)`,
      deviceNameModel: model,
      macAddress: randomMac,
      monthlyPrice: Math.floor(Math.random() * 50) + 15,
      fieldAgentId: currentUser.uid,
      fieldAgentName: currentUser.name,
      isApproved: true,
      addedToInventory: true,
      status: 'EXPIRED',
      enrolledAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    };

    setLegacyDevices(prev => [...prev, newDevice]);

    if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
      setDoc(doc(db, 'workspaces', targetWsId, 'legacy_devices', newDevice.id), newDevice).catch(handleSilentFirestoreError);
    }
  };

  // 7. Admin Delete Options
  const deleteVoucher = (id: string): boolean => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Delete Voucher');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return false;
    }

    const voucher = vouchers.find(v => v.id === id);
    if (!voucher) return false;

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';

    // Delete allowed but with precaution warning checked inside component
    setVouchers(prev => prev.filter(v => v.id !== id));

    if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
      deleteDoc(doc(db, 'workspaces', targetWsId, 'vouchers', id)).catch(handleSilentFirestoreError);
    }
    autoPushActionToDb('Delete Voucher', targetWsId);
    return true;
  };

  const updateVoucher = (id: string, updates: Partial<Voucher>) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Update Voucher');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const nowIso = new Date().toISOString();
    const enrichedUpdates = { ...updates, updatedAt: nowIso, isDirty: true };

    setVouchers(prev => {
      const updatedList = prev.map(v => {
        if (v.id === id) {
          const updated = { ...v, ...enrichedUpdates };
          if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
            setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', v.id), cleanForFirestore(enrichedUpdates), { merge: true }).catch(handleSilentFirestoreError);
          }
          return updated;
        }
        return v;
      });

      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}

      return updatedList;
    });

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_VOUCHER',
        payload: { voucherId: id, updates: enrichedUpdates, workspaceId: targetWsId }
      })
    }).catch(console.warn);

    autoPushActionToDb('Update Voucher', targetWsId);
  };

  const renameVoucherPlan = async (oldPlanName: string, newPlanName: string) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Rename Voucher Plan');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    if (!oldPlanName || !newPlanName || oldPlanName.trim() === newPlanName.trim()) {
      showToast('Invalid plan name update', 'error');
      return;
    }

    const trimmedNew = newPlanName.trim();
    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const nowIso = new Date().toISOString();

    setVouchers(prev => {
      const updatedList = prev.map(v => {
        if (v.plan === oldPlanName) {
          const updated = { ...v, plan: trimmedNew, updatedAt: nowIso, isDirty: true };
          if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
            setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', v.id), { plan: trimmedNew, updatedAt: nowIso }, { merge: true }).catch(handleSilentFirestoreError);
          }
          return updated;
        }
        return v;
      });

      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}

      return updatedList;
    });

    showToast(`✓ Plan name renamed from "${oldPlanName}" to "${trimmedNew}" for all matching vouchers`, 'success');
    autoPushActionToDb('Rename Voucher Plan', targetWsId);
  };

  const deleteVoucherPlan = async (planName: string, deleteMode: 'unassigned' | 'all' = 'unassigned') => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Delete Voucher Plan');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return { success: false, deletedCount: 0 };
    }

    if (!planName) {
      showToast('Invalid plan name for deletion', 'error');
      return { success: false, deletedCount: 0 };
    }

    // Immediately record plan in permanent deleted plans blacklist
    markPlanDeleted(planName);

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const idsToDelete: string[] = [];

    vouchers.forEach(v => {
      if (v.plan === planName) {
        if (deleteMode === 'all') {
          idsToDelete.push(v.id);
        } else {
          const isSold = (v as any).isSold || v.status === 'sold' || v.status === 'Sold' || !!v.soldAt;
          const isAssigned = !!v.assignedAgentId && (v.status === 'assigned' || v.status === 'Assigned');
          if (!isSold && !isAssigned) {
            idsToDelete.push(v.id);
          }
        }
      }
    });

    if (planName === '1hr_Free_Gift' && !idsToDelete.includes('test_gift_voucher_101')) {
      idsToDelete.push('test_gift_voucher_101');
    }

    if (idsToDelete.length === 0) {
      const matchingCount = vouchers.filter(v => v.plan === planName).length;
      if (matchingCount > 0 && deleteMode === 'unassigned') {
        showToast(`No unassigned vouchers found for plan "${planName}". Use "Purge ALL" to remove assigned/sold vouchers as well.`, 'info');
        return { success: false, deletedCount: 0 };
      }
      // If 0 matching vouchers found, notify server to record deleted plan tombstone anyway
      fetch('/api/sync/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_PLAN',
          payload: { planName, deleteMode, deletedVoucherIds: [], workspaceId: targetWsId }
        })
      }).catch(console.warn);

      showToast(`✓ Voucher plan "${planName}" category deleted`, 'success');
      autoPushActionToDb('Delete Voucher Plan', targetWsId);
      return { success: true, deletedCount: 0 };
    }

    setVouchers(prev => {
      const updatedList = prev.filter(v => !idsToDelete.includes(v.id) && (deleteMode === 'all' ? v.plan !== planName : true));
      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}
      return updatedList;
    });

    if (!isFirebasePlaceholder && currentUser) {
      idsToDelete.forEach(id => {
        const vObj = vouchers.find(v => v.id === id);
        const ws = vObj?.workspaceId || targetWsId;
        if (ws && ws !== 'system') {
          deleteDoc(doc(db, 'workspaces', ws, 'vouchers', id)).catch(handleSilentFirestoreError);
        }
      });
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELETE_PLAN',
        payload: { planName, deleteMode, deletedVoucherIds: idsToDelete, workspaceId: targetWsId }
      })
    }).catch(console.warn);

    try {
      logAuditAction({
        category: 'credential',
        action: 'UNSANCTIONED_PLAN_PURGED',
        title: `Voucher Plan Deleted: "${planName}"`,
        description: `Deleted voucher plan category "${planName}" and purged ${idsToDelete.length} matching voucher(s) (Mode: ${deleteMode}).`,
        metadata: {
          planName,
          deleteMode,
          purgedCount: idsToDelete.length
        }
      }).catch(() => {});
    } catch (e) {}

    showToast(`✓ Voucher plan "${planName}" deleted (${idsToDelete.length} voucher(s) purged)`, 'success');
    autoPushActionToDb('Delete Voucher Plan', targetWsId);
    return { success: true, deletedCount: idsToDelete.length };
  };

  const editReceipt = async (voucherId: string, updates: { 
    customerName?: string | null; 
    customerCell?: string | null; 
    location?: string; 
    networkName?: string; 
    customerId?: string | null; 
    customerNumber?: string | null 
  }) => {
    const v = vouchers.find(item => item.id === voucherId);
    if (!v) {
      showToast('Transaction voucher not found', 'error');
      return { success: false, error: 'Transaction voucher not found' };
    }

    const isOwnerOrMaster = currentUser?.role === 'Admin' || currentUser?.role === 'WorkspaceMaster' || currentUser?.role === 'AppOwner';
    const isAssignedAgent = v.assignedAgentId === currentUser?.uid || !v.assignedAgentId;

    if (!isOwnerOrMaster && !isAssignedAgent) {
      showToast('You can only edit your own transaction receipts', 'error');
      return { success: false, error: 'Unauthorized to edit this transaction' };
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    
    // Explicit check for customer name deletion / clearing
    const isNameDeleted = updates.customerName !== undefined && (!updates.customerName || !updates.customerName.trim());
    const finalCustomerName = isNameDeleted ? undefined : (updates.customerName !== undefined ? updates.customerName.trim() : (v.customerName || undefined));
    const finalCustomerCell = isNameDeleted ? undefined : (updates.customerCell !== undefined ? (updates.customerCell ? updates.customerCell.trim() : undefined) : (v.customerCell || undefined));
    const finalCustomerId = isNameDeleted ? undefined : (updates.customerId !== undefined ? (updates.customerId || undefined) : (v.customerId || undefined));
    const finalCustomerNumber = isNameDeleted ? undefined : (updates.customerNumber !== undefined ? (updates.customerNumber || undefined) : (v.customerNumber || undefined));

    setVouchers(prev => {
      const updatedList = prev.map(item => {
        if (item.id === voucherId) {
          const newItem = { ...item };
          if (updates.location !== undefined) newItem.location = updates.location.trim();
          if (updates.networkName !== undefined) newItem.networkName = updates.networkName.trim();

          if (isNameDeleted) {
            delete newItem.customerName;
            delete newItem.customerCell;
            delete newItem.customerId;
            delete newItem.customerNumber;
          } else {
            if (finalCustomerName !== undefined) newItem.customerName = finalCustomerName;
            if (finalCustomerCell !== undefined) newItem.customerCell = finalCustomerCell;
            if (finalCustomerId !== undefined) newItem.customerId = finalCustomerId;
            else if (updates.customerId === null) delete newItem.customerId;
            if (finalCustomerNumber !== undefined) newItem.customerNumber = finalCustomerNumber;
            else if (updates.customerNumber === null) delete newItem.customerNumber;
          }
          return newItem;
        }
        return item;
      });
      try {
        saveVouchersCache(updatedList);
      } catch (e) {}
      return updatedList;
    });

    if (!isNameDeleted && finalCustomerName) {
      const targetCustId = finalCustomerId || v.customerId;
      if (targetCustId) {
        setCustomers(prev => {
          let cChanged = false;
          const updatedCusts = prev.map(c => {
            if (c.id === targetCustId && c.name !== finalCustomerName) {
              cChanged = true;
              return {
                ...c,
                name: finalCustomerName,
                cellNumber: finalCustomerCell || c.cellNumber,
                updatedAt: Date.now()
              };
            }
            return c;
          });
          if (cChanged) {
            try {
              safeSetItem('wivote_customers', JSON.stringify(updatedCusts));
            } catch (e) {}
            if (!isFirebasePlaceholder && targetWsId && targetWsId !== 'system') {
              setDoc(doc(db, 'workspaces', targetWsId, 'customers', targetCustId), {
                name: finalCustomerName,
                cellNumber: finalCustomerCell || '',
                updatedAt: Date.now()
              }, { merge: true }).catch(() => {});
              setDoc(doc(db, 'customers', targetCustId), {
                name: finalCustomerName,
                cellNumber: finalCustomerCell || '',
                updatedAt: Date.now()
              }, { merge: true }).catch(() => {});
            }
            return updatedCusts;
          }
          return prev;
        });
      }
    }

    if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
      const firestoreUpdates: Record<string, any> = {};
      if (updates.location !== undefined) firestoreUpdates.location = updates.location.trim();
      if (updates.networkName !== undefined) firestoreUpdates.networkName = updates.networkName.trim();

      if (isNameDeleted) {
        firestoreUpdates.customerName = deleteField();
        firestoreUpdates.customerCell = deleteField();
        firestoreUpdates.customerId = deleteField();
        firestoreUpdates.customerNumber = deleteField();
      } else {
        if (finalCustomerName !== undefined) firestoreUpdates.customerName = finalCustomerName;
        if (finalCustomerCell !== undefined) firestoreUpdates.customerCell = finalCustomerCell;
        if (finalCustomerId !== undefined) {
          firestoreUpdates.customerId = finalCustomerId;
        } else if (updates.customerId === null) {
          firestoreUpdates.customerId = deleteField();
        }
        if (finalCustomerNumber !== undefined) {
          firestoreUpdates.customerNumber = finalCustomerNumber;
        } else if (updates.customerNumber === null) {
          firestoreUpdates.customerNumber = deleteField();
        }
      }

      setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', voucherId), firestoreUpdates, { merge: true }).catch(handleSilentFirestoreError);
    }

    showToast(isNameDeleted ? '✓ Customer name removed from receipt' : '✓ Transaction receipt updated successfully', 'success');
    autoPushActionToDb('Edit Receipt', targetWsId);
    return { success: true };
  };

  const bulkDeleteVouchers = (ids: string[]) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Bulk Delete Vouchers');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    setVouchers(prev => {
      const updated = prev.filter(v => !ids.includes(v.id));
      try {
        saveVouchersCache(updated, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updated.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}
      return updated;
    });

    if (!isFirebasePlaceholder && currentUser) {
      ids.forEach(id => {
        const v = vouchers.find(item => item.id === id);
        const ws = v?.workspaceId || targetWsId;
        if (ws && ws !== 'system') {
          deleteDoc(doc(db, 'workspaces', ws, 'vouchers', id)).catch(handleSilentFirestoreError);
        }
      });
    }

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'BULK_DELETE_VOUCHERS',
        payload: { voucherIds: ids, workspaceId: targetWsId }
      })
    }).catch(console.warn);

    autoPushActionToDb('Bulk Delete Vouchers', targetWsId);
  };

  const bulkUpdateVouchers = (ids: string[], updates: Partial<Voucher>, options?: { includeSold?: boolean }) => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Bulk Update Vouchers');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const targetWsId = (currentUser?.role === 'AppOwner' && activeWorkspace ? activeWorkspace.id : currentUser?.workspaceId) || activeWorkspace?.id || currentUser?.workspaceId || '';
    const nowIso = new Date().toISOString();
    const enrichedUpdates = { ...updates, updatedAt: nowIso, isDirty: true };
    const allowModifySold = options?.includeSold === true;

    setVouchers(prev => {
      const updatedList = prev.map(v => {
        if (ids.includes(v.id)) {
          const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt;
          let safeUpdates = { ...enrichedUpdates };

          // IMMUNIZATION: If modifying pricing or plan, protect historical sold vouchers unless explicitly overridden
          if (isSold && !allowModifySold) {
            delete safeUpdates.price;
            delete safeUpdates.soldPrice;
            delete safeUpdates.plan;
            delete safeUpdates.duration;
            delete safeUpdates.originalPrice;
          }

          const updated = { ...v, ...safeUpdates };
          if (!isFirebasePlaceholder && currentUser && targetWsId && targetWsId !== 'system') {
            setDoc(doc(db, 'workspaces', targetWsId, 'vouchers', v.id), cleanForFirestore(safeUpdates), { merge: true }).catch(handleSilentFirestoreError);
          }
          return updated;
        }
        return v;
      });

      try {
        saveVouchersCache(updatedList, 'wivote_vouchers');
        if (targetWsId) {
          saveVouchersCache(updatedList.filter(v => resolveVoucherWorkspaceId(v) === targetWsId), `wivote_ws_vouchers_${targetWsId}`);
        }
      } catch (e) {}

      return updatedList;
    });

    fetch('/api/sync/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'BULK_UPDATE_VOUCHERS',
        payload: {
          voucherIds: ids,
          updates: enrichedUpdates,
          workspaceId: targetWsId,
          includeSold: allowModifySold
        }
      })
    }).catch(console.warn);

    autoPushActionToDb('Bulk Update Vouchers', targetWsId);
  };

  // 8. Notifications
  const addNotification = (
    message: string,
    options?: {
      targetAudience?: 'ALL' | 'SPECIFIC' | 'ADMIN';
      targetAgentIds?: string[];
      targetAgentNames?: string[];
      targetUserIds?: string[];
      targetRole?: Role | 'Admin' | 'WorkspaceMaster' | 'Agent';
      isBroadcast?: boolean;
      isActive?: boolean;
      notifType?: 'reversal_request' | 'reversal_status' | 'broadcast' | 'system' | string;
      reversalRequestId?: string;
      transactionId?: string;
      referenceCode?: string;
    }
  ) => {
    if (!currentUser) return;
    const targetWsId = activeWorkspace?.id || currentUser.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    const rawNotifType = options?.notifType;
    const isSystemMessage = rawNotifType === 'system' ||
                            options?.targetAudience === 'ADMIN' ||
                            currentUser.name?.toLowerCase().startsWith('system') ||
                            message.toLowerCase().includes('system update') ||
                            message.toLowerCase().includes('system maintenance');
    const notifType = rawNotifType || (isSystemMessage ? 'system' : 'broadcast');
    
    // "Do not broadcast system updates": Force isBroadcast to false for system updates
    const isBroadcast = isSystemMessage ? false : (options?.isBroadcast ?? false);
    const hasSpecificTargets = (options?.targetAgentIds && options.targetAgentIds.length > 0) || (options?.targetUserIds && options.targetUserIds.length > 0);
    const targetAudience = options?.targetAudience || (hasSpecificTargets ? 'SPECIFIC' : (isBroadcast ? 'ALL' : 'ADMIN'));

    const newNotif: SystemNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      message,
      senderName: currentUser.name || 'Workspace Administrator',
      senderId: currentUser.uid,
      timestamp: new Date().toISOString(),
      location: currentUser.location || 'Global',
      isBroadcast,
      targetAudience,
      targetAgentIds: options?.targetAgentIds || [],
      targetAgentNames: options?.targetAgentNames || [],
      targetUserIds: options?.targetUserIds || [],
      targetRole: options?.targetRole,
      isActive: options?.isActive ?? true,
      notifType,
      reversalRequestId: options?.reversalRequestId,
      transactionId: options?.transactionId,
      referenceCode: options?.referenceCode
    };

    setNotifications(prev => [newNotif, ...prev.filter(n => n.id !== newNotif.id)]);

    try {
      const local = localStorage.getItem('wivote_notifications');
      const parsed = safeJsonParse<any[]>(local, []);
      const updated = [newNotif, ...parsed.filter((n: any) => n.id !== newNotif.id)];
      safeSetItem('wivote_notifications', JSON.stringify(updated));
      window.dispatchEvent(new StorageEvent('storage', { key: 'wivote_notifications', newValue: JSON.stringify(updated) }));
    } catch (e) {
      console.warn('Storage warning for notifications:', e);
    }

    if (!isFirebasePlaceholder && targetWsId) {
      setDoc(doc(db, 'workspaces', targetWsId, 'notifications', newNotif.id), cleanForFirestore(newNotif)).catch(handleSilentFirestoreError);
    }
    autoPushActionToDb('Add Notification', targetWsId);
  };

  const updateNotification = async (
    id: string,
    updates: Partial<SystemNotification>
  ) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      try {
        safeSetItem('wivote_notifications', JSON.stringify(updated));
        window.dispatchEvent(new StorageEvent('storage', { key: 'wivote_notifications', newValue: JSON.stringify(updated) }));
      } catch (e) {
        console.warn('Storage warning for notifications update:', e);
      }
      return updated;
    });

    if (!isFirebasePlaceholder && targetWsId) {
      const cleanedUpdates = cleanForFirestore(updates);
      try {
        await updateDoc(doc(db, 'workspaces', targetWsId, 'notifications', id), cleanedUpdates);
      } catch (e) {
        setDoc(doc(db, 'workspaces', targetWsId, 'notifications', id), cleanedUpdates, { merge: true }).catch(handleSilentFirestoreError);
      }
    }
    autoPushActionToDb('Update Notification', targetWsId);
  };

  const deleteNotification = async (id: string) => {
    const targetWsId = activeWorkspace?.id || currentUser?.workspaceId || currentUserWorkspaceId || 'ws_vakzim';
    setNotifications(prev => {
      const filtered = prev.filter(n => n.id !== id);
      try {
        safeSetItem('wivote_notifications', JSON.stringify(filtered));
        window.dispatchEvent(new StorageEvent('storage', { key: 'wivote_notifications', newValue: JSON.stringify(filtered) }));
      } catch (e) {
        console.warn('Storage warning for notifications delete:', e);
      }
      return filtered;
    });

    if (!isFirebasePlaceholder && targetWsId) {
      try {
        await deleteDoc(doc(db, 'workspaces', targetWsId, 'notifications', id));
      } catch (e) {
        handleSilentFirestoreError(e);
      }
    }
    autoPushActionToDb('Delete Notification', targetWsId);
  };

  // 9. Feedback
  const submitFeedback = (message: string, voucherCode?: string, voucherId?: string) => {
    if (!currentUser) return;
    const newFeedback: FeedbackMessage = {
      id: `fb_${Date.now()}`,
      agentId: currentUser.uid,
      agentName: currentUser.name,
      message,
      timestamp: new Date().toISOString(),
      voucherCode: voucherCode?.trim() || undefined,
      voucherId: voucherId || undefined,
      status: 'Open'
    };

    setFeedback(prev => [newFeedback, ...prev]);

    if (!isFirebasePlaceholder) {
      setDoc(doc(db, 'workspaces', currentUser.workspaceId, 'feedback', newFeedback.id), newFeedback).catch(handleSilentFirestoreError);
    }
    autoPushActionToDb('Submit Feedback', currentUser.workspaceId);
  };

  const replyToFeedback = (id: string, reply: string, status?: 'Open' | 'Resolved') => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Reply to Feedback');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    setFeedback(prev => prev.map(fb => {
      if (fb.id === id) {
        const updated = { ...fb, reply, status: status || 'Resolved' };
        if (!isFirebasePlaceholder && currentUser) {
          setDoc(doc(db, 'workspaces', currentUser.workspaceId, 'feedback', fb.id), {
            reply,
            status: status || 'Resolved'
          }, { merge: true }).catch(handleSilentFirestoreError);
        }
        return updated;
      }
      return fb;
    }));
    autoPushActionToDb('Reply to Feedback', currentUser?.workspaceId);
  };

  // Forgot Password request generating a secure OTP and triggering Firebase reset email if online
  const requestPasswordResetOtp = async (email: string, role: 'Admin' | 'Agent'): Promise<{ success: boolean; error?: string; otp?: string; uid?: string }> => {
    const term = email.trim().toLowerCase();
    const mappedRole = role === 'Admin' ? 'workspacemaster' : 'agent';

    // Find user in local/cached users state first
    let foundUser = users.find(u => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uRole = (u.role || '').trim().toLowerCase();
      const isRoleMatch = mappedRole === 'workspacemaster'
        ? ['workspacemaster', 'admin', 'administrator', 'master', 'owner'].includes(uRole)
        : ['agent', 'fieldagent'].includes(uRole);
      return uEmail === term && isRoleMatch;
    });

    // If Firestore is active, we can also query the db to make sure we didn't miss it
    if (!isFirebasePlaceholder) {
      try {
        const q = query(collection(db, 'users'), where('email', '==', term));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const matchedDoc = snap.docs.find(d => {
            const dData = d.data() as UserProfile;
            const dRole = (dData.role || '').trim().toLowerCase();
            const isRoleMatch = mappedRole === 'workspacemaster'
              ? ['workspacemaster', 'admin', 'administrator', 'master', 'owner'].includes(dRole)
              : ['agent', 'fieldagent'].includes(dRole);
            return isRoleMatch;
          });
          if (matchedDoc) {
            foundUser = matchedDoc.data() as UserProfile;
          }
        }
      } catch (err) {
        console.error("Forgot password query error:", err);
      }
    }

    if (!foundUser) {
      return { success: false, error: `No active account with email ${email} was found for role: ${role}.` };
    }

    // Generate a secure 6-digit verification code OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes valid

    // Update in memory/Firestore
    const updates = {
      recoveryOtp: otp,
      recoveryOtpExpiry: otpExpiry
    };

    if (!isFirebasePlaceholder) {
      try {
        const promises: Promise<any>[] = [];
        promises.push(setDoc(doc(db, 'users', foundUser.uid), updates, { merge: true }));
        if (foundUser.workspaceId) {
          promises.push(setDoc(doc(db, 'workspaces', foundUser.workspaceId, 'users', foundUser.uid), updates, { merge: true }));
        }
        await Promise.all(promises);

        // Securely trigger Firebase native password reset as primary recovery channel
        const { sendPasswordResetEmail } = await import('firebase/auth');
        await sendPasswordResetEmail(auth, foundUser.email);
      } catch (err: any) {
        console.warn("Could not dispatch Firebase reset email or write OTP to cloud:", err?.message);
        // We will continue since we have the OTP simulation backup channel for instant recovery!
      }
    }

    // Update local state so that placeholder simulation works perfectly
    const matchedUid = foundUser.uid;
    setUsers(prev => prev.map(u => u.uid === matchedUid ? { ...u, ...updates } : u));

    logAuditAction({
      category: 'credential',
      action: 'PASSWORD_RESET_OTP_REQUESTED',
      title: 'Password Reset OTP Issued',
      description: `6-digit single-use OTP requested for account "${foundUser.name}" (${foundUser.email}).`,
      targetId: foundUser.uid,
      targetName: foundUser.name,
      targetEmail: foundUser.email,
      workspaceId: foundUser.workspaceId,
      metadata: { role: foundUser.role }
    }).catch(() => {});

    return { success: true, otp, uid: matchedUid };
  };

  // Securely verify OTP and update the user's password (and update standard Firebase auth if online)
  const resetPasswordWithOtp = async (uid: string, otp: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const foundUser = users.find(u => u.uid === uid);
    if (!foundUser) {
      return { success: false, error: 'User record not found.' };
    }

    const storedOtp = (foundUser as any).recoveryOtp;
    const expiry = (foundUser as any).recoveryOtpExpiry;

    if (!storedOtp || storedOtp !== otp) {
      return { success: false, error: 'Invalid verification OTP code entered. Please check and try again.' };
    }

    if (expiry && new Date() > new Date(expiry)) {
      return { success: false, error: 'Verification OTP has expired (5-minute window). Please request a new code.' };
    }

    // Password Security: Mandatory 5-character minimum: at least one special character, one number.
    const pwdVerdict = validatePasswordPolicy(newPassword);
    if (!pwdVerdict.isValid) {
      return {
        success: false,
        error: pwdVerdict.error || 'Password Security Policy Violation: Password must be at least 5 characters long and contain at least one number and one special character.'
      };
    }

    // Save password
    const updates = {
      password: newPassword,
      initialPassword: '',
      requirePasswordChange: false,
      recoveryOtp: '',
      recoveryOtpExpiry: ''
    };

    if (!isFirebasePlaceholder) {
      try {
        const promises: Promise<any>[] = [];
        promises.push(setDoc(doc(db, 'users', uid), updates, { merge: true }));
        if (foundUser.workspaceId) {
          promises.push(setDoc(doc(db, 'workspaces', foundUser.workspaceId, 'users', uid), updates, { merge: true }));
        }
        await Promise.all(promises);
      } catch (err: any) {
        console.error("Failed to write new password to Firestore:", err);
        return { success: false, error: err?.message || 'Failed to update password in secure database.' };
      }
    }

    // Update in memory state
    setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...updates } : u));

    logAuditAction({
      category: 'credential',
      action: 'PASSWORD_RESET_OTP_VERIFIED',
      title: 'Password Reset via OTP Completed',
      description: `Account password successfully reset using verified OTP for "${foundUser.name}" (${foundUser.email}).`,
      targetId: foundUser.uid,
      targetName: foundUser.name,
      targetEmail: foundUser.email,
      workspaceId: foundUser.workspaceId,
      metadata: { role: foundUser.role }
    }).catch(() => {});

    return { success: true };
  };

  // 10. Profile Update with image censorship
  const updateUserProfile = async (name: string, cellNumber: string, profilePic?: string, password?: string, email?: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'No active user logged in.' };

    const finalPic = profilePic !== undefined ? profilePic : currentUser.profilePic;
    const finalName = name || currentUser.name;
    const finalCell = cellNumber || currentUser.cellNumber;
    const finalEmail = email || currentUser.email;

    const updatedUser: UserProfile = {
      ...currentUser,
      name: finalName,
      cellNumber: finalCell,
      profilePic: finalPic,
      ...(password ? { password, requirePasswordChange: false, initialPassword: '' } : {}),
      ...(finalEmail ? { email: finalEmail } : {})
    };

    // Update local state immediately for snappy UI
    setUsers(prev => {
      const exists = prev.some(u => u.uid === currentUser.uid);
      if (!exists) return [...prev, updatedUser];
      return prev.map(u => u.uid === currentUser.uid ? updatedUser : u);
    });

    if (!isFirebasePlaceholder) {
      const workspaceId = currentUser.workspaceId || currentUserWorkspaceId || 'system';
      
      // Build a payload with ONLY the edited attributes, leaving unedited ones completely out of the payload
      const payload: any = {};
      if (finalPic !== currentUser.profilePic) {
        payload.profilePic = finalPic;
      }
      if (finalName !== currentUser.name) {
        payload.name = finalName;
      }
      if (finalCell !== currentUser.cellNumber) {
        payload.cellNumber = finalCell;
      }
      if (password) {
        const pwdVerdict = validatePasswordPolicy(password);
        if (!pwdVerdict.isValid) {
          return {
            success: false,
            error: pwdVerdict.error || 'Password must be at least 5 characters long and contain at least one number and one special character.'
          };
        }
        payload.password = password;
        payload.requirePasswordChange = false;
        payload.initialPassword = '';
      }
      if (finalEmail && finalEmail !== currentUser.email) {
        payload.email = finalEmail;
      }

      // If no attributes were actually edited, we can skip DB writes completely
      if (Object.keys(payload).length === 0) {
        return { success: true };
      }

      try {
        const promises: Promise<any>[] = [];

        // 1. Write Agent user doc to root /users/{currentUser.uid}
        promises.push(setDoc(doc(db, 'users', currentUser.uid), payload, { merge: true }));

        // 2. Write Agent user doc to /workspaces/{workspaceId}/users/{currentUser.uid}
        if (workspaceId && workspaceId !== '' && workspaceId !== 'system') {
          promises.push(
            setDoc(doc(db, 'workspaces', workspaceId, 'users', currentUser.uid), payload, { merge: true })
          );
        }

        // 3. Fallback sync for auth.currentUser.uid if different
        if (auth.currentUser && auth.currentUser.uid !== currentUser.uid) {
          promises.push(setDoc(doc(db, 'users', auth.currentUser.uid), payload, { merge: true }));
          if (workspaceId && workspaceId !== '' && workspaceId !== 'system') {
            promises.push(
              setDoc(doc(db, 'workspaces', workspaceId, 'users', auth.currentUser.uid), payload, { merge: true })
            );
          }
        }

        // 4. Update any duplicates matching this email to prevent login mismatch
        if (finalEmail) {
          const qEmail = query(collection(db, 'users'), where('email', '==', finalEmail.trim().toLowerCase()));
          const emailSnap = await getDocs(qEmail).catch(() => null);
          if (emailSnap && !emailSnap.empty) {
            emailSnap.docs.forEach(d => {
              if (d.id !== currentUser.uid && (!auth.currentUser || d.id !== auth.currentUser.uid)) {
                promises.push(setDoc(doc(db, 'users', d.id), payload, { merge: true }));
                if (workspaceId && workspaceId !== '' && workspaceId !== 'system') {
                  promises.push(
                    setDoc(doc(db, 'workspaces', workspaceId, 'users', d.id), payload, { merge: true })
                  );
                }
              }
            });
          }
        }

        if (password && auth.currentUser) {
          promises.push(
            fetch('/api/auth/update-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: currentUser.uid, password })
            }).then(async res => {
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.warn("Failed to update password via Admin SDK:", data.error || res.statusText);
              } else {
                console.log("Successfully updated password in Firebase Auth via Admin SDK.");
              }
            }).catch(err => {
              console.warn("Error calling update-password API:", err);
            })
          );
        }

        await Promise.allSettled(promises);
        showToast("Profile settings saved successfully!", "success");
      } catch (err: any) {
        console.error("Error saving profile to Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
      }
    } else {
      showToast("Profile settings saved locally!", "success");
    }

    autoPushActionToDb('Update User Profile', currentUser?.workspaceId);
    return { success: true };
  };

  /**
   * Helper to perform comprehensive account uniqueness validation across name, phone, and email fields
   * both locally in global state lists and inside the Firestore /users root collection.
   */
  const checkUserProfileUniqueness = async (
    name: string,
    phone: string,
    email: string
  ): Promise<{ isUnique: boolean; error?: string }> => {
    const cleanName = name.trim().toLowerCase();
    const cleanPhone = phone.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Normalizes phone numbers (strips all non-numeric characters) for precise matching
    const normalizePhone = (p: string): string => p.replace(/[^0-9]/g, '');
    const normCleanPhone = normalizePhone(cleanPhone);

    // Skip placeholder phone checking for default system profiles
    const isPlaceholderPhone = normCleanPhone === normalizePhone('+263770000000');

    // Retrieve active workspace context to allow duplicate names across separate business tenants
    const activeWsId = currentUser?.workspaceId || currentUserWorkspaceId || (currentUser?.role !== 'AppOwner' ? activeWorkspace?.id : null);

    // 1. Local State Check (Fast memory-level duplicate lookups)
    // Only block at memory-level if offline/placeholder. If online, Firestore checks are the final source of truth.
    if (isFirebasePlaceholder) {
      for (const u of users) {
        const uName = (u.name || '').trim().toLowerCase();
        const uPhone = (u.cellNumber || '').trim().toLowerCase();
        const uEmail = (u.email || '').trim().toLowerCase();

        // For Name and Phone, only block if the duplicate exists inside the same tenant workspace context
        const isSameWorkspace = !activeWsId || u.workspaceId === activeWsId || u.workspaceId === 'system';

        if (cleanName && uName === cleanName && isSameWorkspace) {
          return {
            isUnique: false,
            error: `Account creation blocked: An account with the Name "${u.name}" already exists in your workspace.`
          };
        }
        if (normCleanPhone && !isPlaceholderPhone && normalizePhone(uPhone) === normCleanPhone && isSameWorkspace) {
          return {
            isUnique: false,
            error: `Account creation blocked: An account with the Phone number "${u.cellNumber}" already exists in your workspace.`
          };
        }
        if (cleanEmail && uEmail === cleanEmail) {
          // Emails must remain globally unique across Firebase Auth
          return {
            isUnique: false,
            error: `Account creation blocked: An account with the Email "${u.email}" already exists.`
          };
        }
      }
    }

    // 2. Cloud Database Uniqueness Checks
    if (!isFirebasePlaceholder) {
      try {
        if (cleanName) {
          const qName = query(collection(db, 'users'), where('name', '==', name.trim()));
          const nameSnap = await getDocs(qName);
          if (!nameSnap.empty) {
            let activeAndConflictingMatch = false;
            let conflictingDocData: any = null;

            for (const docObj of nameSnap.docs) {
              const docData = docObj.data();
              const userWsId = docData.workspaceId;
              let wsExists = false;

              if (userWsId && userWsId !== 'system') {
                const wsDocSnap = await getDoc(doc(db, 'workspaces', userWsId)).catch(() => null);
                if (wsDocSnap && wsDocSnap.exists()) {
                  const wsData = wsDocSnap.data() || {};
                  const subUserSnap = await getDoc(doc(db, 'workspaces', userWsId, 'users', docObj.id)).catch(() => null);
                  const isSubDocPresent = !!(subUserSnap && subUserSnap.exists());
                  const isOwner = wsData.ownerId === docObj.id;
                  const isAgent = Array.isArray(wsData.agentIds) && wsData.agentIds.includes(docObj.id);

                  // Only consider active if subcollection document exists and user is active owner or in agent list
                  if (isSubDocPresent && (isOwner || isAgent || docData.role === 'WorkspaceMaster')) {
                    wsExists = true;
                  }
                }
              } else if (userWsId === 'system' || docData.role === 'AppOwner') {
                wsExists = true;
              }

              if (wsExists) {
                const isConflict = !activeWsId || userWsId === activeWsId || userWsId === 'system';
                if (isConflict) {
                  activeAndConflictingMatch = true;
                  conflictingDocData = docData;
                  break;
                }
              } else {
                // Automatically purge orphan residual root user document immediately
                console.log(`[Uniqueness Check] Purging residual orphan root user document for Name: ${docData.name}`);
                await deleteDoc(docObj.ref).catch(() => {});
              }
            }

            if (activeAndConflictingMatch) {
              return {
                isUnique: false,
                error: `Account creation blocked: An account with the Name "${conflictingDocData.name || name.trim()}" already exists in this workspace.`
              };
            }
          }
        }

        if (cleanEmail) {
          const emailsToCheck = Array.from(new Set([cleanEmail, email.trim()].filter(Boolean)));
          for (const targetEmail of emailsToCheck) {
            const qEmail = query(collection(db, 'users'), where('email', '==', targetEmail));
            const emailSnap = await getDocs(qEmail);
            if (!emailSnap.empty) {
              let activeAndConflictingMatch = false;
              let conflictingDocData: any = null;

              for (const docObj of emailSnap.docs) {
                const docData = docObj.data();
                const userWsId = docData.workspaceId;
                let wsExists = false;

                if (userWsId && userWsId !== 'system') {
                  const wsDocSnap = await getDoc(doc(db, 'workspaces', userWsId)).catch(() => null);
                  if (wsDocSnap && wsDocSnap.exists()) {
                    const wsData = wsDocSnap.data() || {};
                    const subUserSnap = await getDoc(doc(db, 'workspaces', userWsId, 'users', docObj.id)).catch(() => null);
                    const isSubDocPresent = !!(subUserSnap && subUserSnap.exists());
                    const isOwner = wsData.ownerId === docObj.id || (wsData.ownerEmail && wsData.ownerEmail.toLowerCase().trim() === cleanEmail);
                    const isAgent = Array.isArray(wsData.agentIds) && wsData.agentIds.includes(docObj.id);

                    if (isSubDocPresent && (isOwner || isAgent || docData.role === 'WorkspaceMaster')) {
                      wsExists = true;
                    }
                  }
                } else if (userWsId === 'system' || docData.role === 'AppOwner') {
                  wsExists = true;
                }

                if (wsExists) {
                  activeAndConflictingMatch = true;
                  conflictingDocData = docData;
                  break;
                } else {
                  // Residue from a deleted workspace or deleted agent: purge orphan document and backend credentials
                  console.log(`[Uniqueness Check] Purging orphan residue user document and auth credentials for ${cleanEmail}`);
                  await deleteDoc(docObj.ref).catch(() => {});
                  await cleanupOrphanedAccounts(cleanEmail).catch(() => {});
                }
              }

              if (activeAndConflictingMatch) {
                return {
                  isUnique: false,
                  error: `Account creation blocked: An account with the Email "${conflictingDocData.email || email.trim()}" already exists in an active workspace.`
                };
              }
            }
          }
        }

        if (cleanPhone && !isPlaceholderPhone) {
          // Direct field match
          const qPhone = query(collection(db, 'users'), where('cellNumber', '==', phone.trim()));
          const phoneSnap = await getDocs(qPhone);
          if (!phoneSnap.empty) {
            let activeAndConflictingMatch = false;
            let conflictingDocData: any = null;

            for (const docObj of phoneSnap.docs) {
              const docData = docObj.data();
              const userWsId = docData.workspaceId;
              let wsExists = false;

              if (userWsId && userWsId !== 'system') {
                const wsDocSnap = await getDoc(doc(db, 'workspaces', userWsId)).catch(() => null);
                if (wsDocSnap && wsDocSnap.exists()) {
                  const wsData = wsDocSnap.data() || {};
                  const subUserSnap = await getDoc(doc(db, 'workspaces', userWsId, 'users', docObj.id)).catch(() => null);
                  const isSubDocPresent = !!(subUserSnap && subUserSnap.exists());
                  const isOwner = wsData.ownerId === docObj.id;
                  const isAgent = Array.isArray(wsData.agentIds) && wsData.agentIds.includes(docObj.id);

                  if (isSubDocPresent && (isOwner || isAgent || docData.role === 'WorkspaceMaster')) {
                    wsExists = true;
                  }
                }
              } else if (userWsId === 'system' || docData.role === 'AppOwner') {
                wsExists = true;
              }

              if (wsExists) {
                const isConflict = !activeWsId || userWsId === activeWsId || userWsId === 'system';
                if (isConflict) {
                  activeAndConflictingMatch = true;
                  conflictingDocData = docData;
                  break;
                }
              } else {
                // Purge residual orphan document immediately
                console.log(`[Uniqueness Check] Purging residual orphan root user document for Phone: ${docData.cellNumber}`);
                await deleteDoc(docObj.ref).catch(() => {});
              }
            }

            if (activeAndConflictingMatch) {
              return {
                isUnique: false,
                error: `Account creation blocked: An account with the Phone number "${conflictingDocData.cellNumber || phone.trim()}" already exists in this workspace.`
              };
            }
          }

          // Full-collection normalized lookup
          const allUsersSnap = await getDocs(collection(db, 'users'));
          for (const d of allUsersSnap.docs) {
            const data = d.data();
            const uPhone = (data.cellNumber || '').trim().toLowerCase();
            if (normalizePhone(uPhone) === normCleanPhone) {
              const userWsId = data.workspaceId;
              let wsExists = false;

              if (userWsId && userWsId !== 'system') {
                const wsDocSnap = await getDoc(doc(db, 'workspaces', userWsId)).catch(() => null);
                if (wsDocSnap && wsDocSnap.exists()) {
                  const wsData = wsDocSnap.data() || {};
                  const subUserSnap = await getDoc(doc(db, 'workspaces', userWsId, 'users', d.id)).catch(() => null);
                  const isSubDocPresent = !!(subUserSnap && subUserSnap.exists());
                  const isOwner = wsData.ownerId === d.id;
                  const isAgent = Array.isArray(wsData.agentIds) && wsData.agentIds.includes(d.id);

                  if (isSubDocPresent && (isOwner || isAgent || data.role === 'WorkspaceMaster')) {
                    wsExists = true;
                  }
                }
              } else if (userWsId === 'system' || data.role === 'AppOwner') {
                wsExists = true;
              }

              if (wsExists) {
                const isConflict = !activeWsId || userWsId === activeWsId || userWsId === 'system';
                if (isConflict) {
                  return {
                    isUnique: false,
                    error: `Account creation blocked: An account with the Phone number "${data.cellNumber}" already exists in this workspace.`
                  };
                }
              } else {
                // Purge residual orphan document immediately
                console.log(`[Uniqueness Check] Purging residual orphan root user document for Phone match: ${data.cellNumber}`);
                await deleteDoc(d.ref).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.warn("Error running Firestore uniqueness checks:", err);
      }
    }

    return { isUnique: true };
  };

  // App Owner Methods
  const createWorkspace = async (name: string, tier: SubscriptionTier = 'Starter', ownerEmail: string, months: number = 1, customPassword?: string, ownerCell?: string): Promise<{ success: boolean; tempPassword?: string; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'No active authenticated session found.' };
    }
    const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;
    if (!isAppOwner) {
      console.error('Security Alert: Only the App Owner can create workspaces.');
      return { success: false, error: 'Only the App Owner can create workspaces.' };
    }

    const trimmedName = name.trim();
    const trimmedOwnerEmail = ownerEmail.trim().toLowerCase();

    // Check uniqueness for Name across all dashboards
    const nameCheck = await checkUserProfileUniqueness(`${trimmedName} Owner`, '', '');
    if (!nameCheck.isUnique) {
      return { success: false, error: nameCheck.error };
    }

    // 1. Local state duplicate checks (disallow duplicate workspace names, but allow email reuse if previous workspace is deleted)
    const duplicateWsName = workspaces.some(w => w.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicateWsName) {
      return { success: false, error: `A workspace named "${trimmedName}" already exists. Please specify a unique workspace name.` };
    }

    if (isFirebasePlaceholder) {
      const duplicateEmail = users.some(u => {
        const isEmailMatch = (u.email || '').trim().toLowerCase() === trimmedOwnerEmail;
        if (!isEmailMatch) return false;
        if (u.role === 'AppOwner') return true;
        // Allow reuse if the workspace was deleted/removed from active workspaces
        return workspaces.some(w => w.id === u.workspaceId);
      });
      if (duplicateEmail) {
        return { success: false, error: `An account with email "${trimmedOwnerEmail}" is currently assigned to an active workspace.` };
      }
    }

    // 2. Firestore database uniqueness checks when online
    if (!isFirebasePlaceholder) {
      try {
        const qName = query(collection(db, 'workspaces'), where('name', '==', trimmedName));
        const nameSnap = await getDocs(qName);
        if (!nameSnap.empty) {
          return { success: false, error: `Workspace "${trimmedName}" already exists in database. Please specify a unique workspace name.` };
        }

        const qEmail = query(collection(db, 'users'), where('email', '==', trimmedOwnerEmail));
        const emailSnap = await getDocs(qEmail);
        if (!emailSnap.empty) {
          let hasActiveAssociatedWorkspace = false;
          const orphanedUserDocRefs: any[] = [];

          for (const userDoc of emailSnap.docs) {
            const uData = userDoc.data() as UserProfile;
            if (uData.role === 'AppOwner') {
              hasActiveAssociatedWorkspace = true;
              break;
            }
            if (uData.workspaceId && uData.workspaceId !== 'system') {
              const wsDocSnap = await getDoc(doc(db, 'workspaces', uData.workspaceId)).catch(() => null);
              if (wsDocSnap && wsDocSnap.exists()) {
                const wsData = wsDocSnap.data() || {};
                const subUserSnap = await getDoc(doc(db, 'workspaces', uData.workspaceId, 'users', userDoc.id)).catch(() => null);
                const isSubDocPresent = !!(subUserSnap && subUserSnap.exists());
                const isOwner = wsData.ownerId === userDoc.id || (wsData.ownerEmail && wsData.ownerEmail.toLowerCase().trim() === trimmedOwnerEmail);
                const isAgent = Array.isArray(wsData.agentIds) && wsData.agentIds.includes(userDoc.id);

                if (isSubDocPresent && (isOwner || isAgent || uData.role === 'WorkspaceMaster')) {
                  hasActiveAssociatedWorkspace = true;
                  break;
                } else {
                  orphanedUserDocRefs.push(userDoc.ref);
                }
              } else {
                // Associated workspace is completely deleted/removed; queue stale user doc for cleanup
                orphanedUserDocRefs.push(userDoc.ref);
              }
            } else {
              orphanedUserDocRefs.push(userDoc.ref);
            }
          }

          if (hasActiveAssociatedWorkspace) {
            return { success: false, error: `Email "${trimmedOwnerEmail}" is currently assigned to an active workspace.` };
          }

          // Clean up stale orphaned user records from previously deleted workspaces so email is fully freed
          if (orphanedUserDocRefs.length > 0) {
            await Promise.allSettled(orphanedUserDocRefs.map(ref => deleteDoc(ref)));
          }
        }
      } catch (err) {
        console.error("Error verifying uniqueness in Firestore:", err);
      }
    }

    const expiresAtDate = new Date();
    expiresAtDate.setMonth(expiresAtDate.getMonth() + months);

    if (customPassword) {
      const pwdVerdict = validatePasswordPolicy(customPassword);
      if (!pwdVerdict.isValid) {
        return { success: false, error: pwdVerdict.error };
      }
    }

    const wsId = `ws_${Date.now()}`;
    const tempPassword = customPassword || `Temp!${Math.floor(1000 + Math.random() * 9000)}`;
    let masterUid = `master_${Date.now()}`;

    if (!isFirebasePlaceholder) {
      let secondaryApp: any = null;
      let secondaryAuth: any = null;
      try {
        // Create secondary app so the current app owner session is not destroyed
        secondaryApp = initializeApp(firebaseConfig, `create_ws_${Date.now()}`);
        secondaryAuth = getAuth(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, trimmedOwnerEmail, tempPassword);
        masterUid = userCredential.user.uid;
        
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
        console.log(`✅ [WiVoTe] Successfully registered Firebase Auth user ${trimmedOwnerEmail} with UID: ${masterUid}`);
      } catch (authErr: any) {
        console.error("❌ [WiVoTe] Failed to provision Firebase Auth user account:", authErr);
        if (authErr.code === 'auth/email-already-in-use' || (authErr.message && authErr.message.includes('email-already-in-use'))) {
          // Instead of failing or purging, retrieve the existing user's UID via Admin SDK
          try {
            console.log(`[WiVoTe] Detected existing auth account for ${trimmedOwnerEmail}. Fetching existing UID...`);
            const uidRes = await fetch('/api/auth/get-user-by-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: trimmedOwnerEmail })
            });
            const uidData = await uidRes.json();
            if (uidData.success && uidData.uid) {
              masterUid = uidData.uid;
              // Synchronize password so master can log in immediately
              await fetch('/api/auth/update-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: masterUid, password: tempPassword })
              }).catch(() => {});
              await signOut(secondaryAuth).catch(() => {});
              await deleteApp(secondaryApp).catch(() => {});
              console.log(`✅ [WiVoTe] Successfully matched and updated existing Firebase Auth user: ${masterUid}`);
            } else {
              // Attempt programmatic administrative cleanup of orphan credentials from previously deleted workspace
              console.log(`[WiVoTe] Match failed. Programmatically cleaning up orphan credentials for ${trimmedOwnerEmail}...`);
              const purgeData = await cleanupOrphanedAccounts(trimmedOwnerEmail);
              if (purgeData.success) {
                const retryCredential = await createUserWithEmailAndPassword(secondaryAuth, trimmedOwnerEmail, tempPassword);
                masterUid = retryCredential.user.uid;
                await signOut(secondaryAuth);
                await deleteApp(secondaryApp);
                console.log(`✅ [WiVoTe] Successfully registered Firebase Auth user on retry: ${masterUid}`);
              } else {
                await signOut(secondaryAuth).catch(() => {});
                await deleteApp(secondaryApp).catch(() => {});
                return { success: false, error: purgeData.error || `Authentication account creation failed: ${authErr.message}` };
              }
            }
          } catch (retryErr: any) {
            await signOut(secondaryAuth).catch(() => {});
            await deleteApp(secondaryApp).catch(() => {});
            return { success: false, error: `Authentication account creation failed: ${retryErr.message || authErr.message}` };
          }
        } else if (authErr.code === 'auth/operation-not-allowed' || (authErr.message && authErr.message.includes('operation-not-allowed'))) {
          await signOut(secondaryAuth).catch(() => {});
          await deleteApp(secondaryApp).catch(() => {});
          return {
            success: false,
            error: "Email/Password Sign-In Provider is Disabled in Firebase. To enable it:\n\n1. Go to your Firebase Console.\n2. Click 'Authentication' in the left menu, then select the 'Sign-in method' tab.\n3. Click 'Add new provider' (or edit 'Email/Password' if already there).\n4. Select 'Email/Password', toggle the first switch to 'Enable', and click 'Save'.\n\nOnce enabled, try creating the workspace again!"
          };
        } else {
          await signOut(secondaryAuth).catch(() => {});
          await deleteApp(secondaryApp).catch(() => {});
          return { success: false, error: `Authentication account creation failed: ${authErr.message}` };
        }
      }
    }

    const newWS: Workspace = {
      id: wsId,
      name: trimmedName,
      subscriptionTier: tier,
      isActive: true,
      trialStartDate: new Date().toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      ownerId: masterUid,
      ownerEmail: trimmedOwnerEmail,
      ownerUid: masterUid
    };

    const newMaster: UserProfile = {
      uid: masterUid,
      email: trimmedOwnerEmail,
      cellNumber: ownerCell?.trim() || '+263770000000',
      role: 'WorkspaceMaster',
      workspaceId: wsId,
      name: `${trimmedName} Owner`,
      profilePic: '',
      password: tempPassword,
      requirePasswordChange: true,
      initialPassword: tempPassword
    };

    const welcomeNotif = {
      id: `notif_init_${wsId}`,
      title: 'Workspace Initialized',
      message: `Workspace "${trimmedName}" created and assigned to ${trimmedOwnerEmail}. Subscription tier: ${tier}.`,
      timestamp: new Date().toISOString(),
      targetRole: 'All',
      readBy: []
    };

    if (!isFirebasePlaceholder) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'workspaces', newWS.id), newWS, { merge: true });
        batch.set(doc(db, 'workspaces', newWS.id, 'users', newMaster.uid), newMaster, { merge: true });
        batch.set(doc(db, 'users', newMaster.uid), newMaster, { merge: true });
        batch.set(doc(db, 'workspaces', newWS.id, 'notifications', welcomeNotif.id), welcomeNotif, { merge: true });
        await batch.commit();
        console.log(`✅ [WiVoTe] Workspace "${newWS.name}" (${newWS.id}) saved to Firestore successfully via writeBatch.`);
      } catch (error) {
        console.warn(`[WiVoTe] writeBatch failed, falling back to parallel setDoc writes:`, error);
        try {
          await Promise.all([
            setDoc(doc(db, 'workspaces', newWS.id), newWS, { merge: true }),
            setDoc(doc(db, 'workspaces', newWS.id, 'users', newMaster.uid), newMaster, { merge: true }),
            setDoc(doc(db, 'users', newMaster.uid), newMaster, { merge: true }),
            setDoc(doc(db, 'workspaces', newWS.id, 'notifications', welcomeNotif.id), welcomeNotif, { merge: true })
          ]);
          console.log(`✅ [WiVoTe] Workspace "${newWS.name}" (${newWS.id}) saved to Firestore successfully via parallel setDoc.`);
        } catch (fallbackErr: any) {
          console.error(`❌ [WiVoTe] Could not write workspace to Firestore:`, fallbackErr);
          handleFirestoreError(fallbackErr, OperationType.WRITE, `workspaces/${newWS.id}`);
          return { success: false, error: fallbackErr?.message || 'Failed to save workspace to cloud database.' };
        }
      }
    }

    // Instantly update local state so the UI updates in real-time
    setWorkspaces(prev => {
      const filtered = prev.filter(w => w.id !== newWS.id);
      const updated = [...filtered, newWS];
      syncWorkspacesCountToCloud(updated.length, updated.filter(w => w.isActive !== false).length);
      return updated;
    });
    setUsers(prev => {
      const filtered = prev.filter(u => u.uid !== newMaster.uid);
      return [...filtered, newMaster];
    });

    logAuditAction({
      category: 'workspace',
      action: 'WORKSPACE_PROVISIONED',
      title: 'Tenant Workspace Provisioned',
      description: `Tenant workspace "${trimmedName}" (${wsId}) created under subscription plan ${tier}.`,
      workspaceId: wsId,
      workspaceName: trimmedName,
      targetId: masterUid,
      targetName: newMaster.name,
      targetEmail: trimmedOwnerEmail,
      metadata: { tier, months, ownerEmail: trimmedOwnerEmail }
    }).catch(() => {});

    logAuditAction({
      category: 'role',
      action: 'WORKSPACE_MASTER_INITIALIZED',
      title: 'WorkspaceMaster Role Initialized',
      description: `Master administrative role assigned to "${trimmedOwnerEmail}" for workspace "${trimmedName}".`,
      workspaceId: wsId,
      workspaceName: trimmedName,
      targetId: masterUid,
      targetName: newMaster.name,
      targetEmail: trimmedOwnerEmail,
      metadata: { role: 'WorkspaceMaster' }
    }).catch(() => {});

    return { success: true, tempPassword };
  };

  const createWorkspaceAdmin = async (
    workspaceId: string,
    name: string,
    email: string,
    cell: string,
    customPassword?: string
  ): Promise<{ success: boolean; tempPassword?: string; error?: string }> => {
    try {
      if (!currentUser) {
        return { success: false, error: 'No active authenticated session found.' };
      }
      const isDeveloperEmail = currentUser?.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
      const isAppOwner = currentUser?.role === 'AppOwner' || isDeveloperEmail;
      if (!isAppOwner) {
        return { success: false, error: 'Security Alert: Only the App Owner can create Workspace Admins.' };
      }

      // Check uniqueness for Name, Phone, and Email across all dashboards
      const uniqueness = await checkUserProfileUniqueness(name, cell, email);
      if (!uniqueness.isUnique) {
        return { success: false, error: uniqueness.error };
      }

      if (customPassword) {
        const pwdVerdict = validatePasswordPolicy(customPassword);
        if (!pwdVerdict.isValid) {
          return { success: false, error: pwdVerdict.error };
        }
      }

      const adminUid = `admin_${Date.now()}`;
      const tempPassword = customPassword || `Temp!${Math.floor(1000 + Math.random() * 9000)}`;

      const newAdmin: UserProfile = {
        uid: adminUid,
        email: email.trim().toLowerCase(),
        cellNumber: cell,
        role: 'WorkspaceMaster',
        workspaceId,
        name,
        profilePic: '',
        password: tempPassword,
        requirePasswordChange: true,
        initialPassword: tempPassword
      };

      if (!isFirebasePlaceholder) {
        // Run atomic batch transaction
        const batch = writeBatch(db);
        
        // 1. Write user document to root /users/{admin_uid}
        const userRef = doc(db, 'users', adminUid);
        batch.set(userRef, newAdmin);

        // 2. Write user document to parent /workspaces/{workspaceId}/users/{admin_uid}
        const wsUserRef = doc(db, 'workspaces', workspaceId, 'users', adminUid);
        batch.set(wsUserRef, newAdmin);

        // 3. Update the parent Workspace's ownerId to the admin's uid
        const wsRef = doc(db, 'workspaces', workspaceId);
        batch.update(wsRef, { ownerId: adminUid });

        await batch.commit();
      }

      // Update local states synchronously
      setUsers(prev => [...prev.filter(u => u.uid !== adminUid), newAdmin]);
      setWorkspaces(prev => prev.map(w => w.id === workspaceId ? { ...w, ownerId: adminUid } : w));

      logAuditAction({
        category: 'role',
        action: 'WORKSPACE_ADMIN_CREATED',
        title: 'Workspace Master Initialized',
        description: `Workspace Master "${name}" (${email}) designated for workspace ${workspaceId}.`,
        workspaceId,
        targetId: adminUid,
        targetName: name,
        targetEmail: email,
        metadata: { role: 'WorkspaceMaster', cellNumber: cell }
      }).catch(() => {});

      logAuditAction({
        category: 'credential',
        action: 'PROVISIONAL_CREDENTIALS_ISSUED',
        title: 'Provisional Password Generated',
        description: `Provisional login credentials created for Workspace Master "${name}" (${email}). Require password change enforced.`,
        workspaceId,
        targetId: adminUid,
        targetName: name,
        targetEmail: email,
        metadata: { requirePasswordChange: true }
      }).catch(() => {});

      return { success: true, tempPassword };
    } catch (err: any) {
      console.error("Error in createWorkspaceAdmin batch write:", err);
      return { success: false, error: err?.message || 'Failed to create workspace admin atomically.' };
    }
  };

  const createAgent = async (
    workspaceId: string,
    adminId: string,
    name: string,
    email: string,
    cell: string,
    customPassword?: string,
    targetAmount?: number,
    commissionRate?: number,
    location?: string
  ): Promise<{ success: boolean; tempPassword?: string; error?: string }> => {
    try {
      if (!currentUser) {
        return { success: false, error: 'No active authenticated session found.' };
      }

      const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Create Agent');
      if (!authVerdict.allowed) {
        return { success: false, error: authVerdict.error || 'Access restricted to Workspace Masters' };
      }

      // Check uniqueness for Name, Phone, and Email across all dashboards
      const uniqueness = await checkUserProfileUniqueness(name, cell, email);
      if (!uniqueness.isUnique) {
        return { success: false, error: uniqueness.error };
      }

      if (customPassword) {
        const pwdVerdict = validatePasswordPolicy(customPassword);
        if (!pwdVerdict.isValid) {
          return { success: false, error: pwdVerdict.error };
        }
      }

      const agentUid = `agent_${Date.now()}`;
      const tempPassword = customPassword || `Temp!${Math.floor(1000 + Math.random() * 9000)}`;

      const newAgent: UserProfile & { created_by_admin?: string; owner_id?: string } = {
        uid: agentUid,
        email: email.trim().toLowerCase(),
        cellNumber: cell,
        role: 'Agent',
        workspaceId,
        name,
        profilePic: '',
        location: location?.trim() || 'Harare Central',
        password: tempPassword,
        requirePasswordChange: true,
        initialPassword: tempPassword,
        created_by_admin: adminId,
        createdById: adminId,
        owner_id: currentUser?.uid || '', // AppOwner uid if available
        targetAmount: targetAmount !== undefined ? targetAmount : 500,
        commissionRate: commissionRate !== undefined ? commissionRate : 10
      };

      if (!isFirebasePlaceholder) {
        const batch = writeBatch(db);

        // 1. Write Agent user doc to root /users/{agent_uid}
        const userRef = doc(db, 'users', agentUid);
        batch.set(userRef, newAgent);

        // 2. Write Agent user doc to /workspaces/{workspaceId}/users/{agent_uid}
        const wsUserRef = doc(db, 'workspaces', workspaceId, 'users', agentUid);
        batch.set(wsUserRef, newAgent);

        // 3. Update parent Workspace's agent list atomically
        const wsRef = doc(db, 'workspaces', workspaceId);
        const wsSnap = await getDoc(wsRef);
        let existingAgents: string[] = [];
        if (wsSnap.exists()) {
          const wsData = wsSnap.data();
          existingAgents = wsData.agentIds || [];
        }
        if (!existingAgents.includes(agentUid)) {
          existingAgents.push(agentUid);
        }
        batch.update(wsRef, { agentIds: existingAgents });

        await batch.commit();
      }

      // Update local states synchronously
      setUsers(prev => [...prev.filter(u => u.uid !== agentUid), newAgent as UserProfile]);
      setWorkspaces(prev => prev.map(w => {
        if (w.id === workspaceId) {
          const existing = (w as any).agentIds || [];
          return {
            ...w,
            agentIds: existing.includes(agentUid) ? existing : [...existing, agentUid]
          };
        }
        return w;
      }));

      logAuditAction({
        category: 'role',
        action: 'AGENT_ENROLLED',
        title: 'Field Agent Enrolled',
        description: `Field Agent "${name}" (${email}) registered and assigned to workspace "${workspaceId}".`,
        workspaceId,
        targetId: agentUid,
        targetName: name,
        targetEmail: email,
        metadata: { role: 'Agent', cellNumber: cell, createdByAdmin: adminId }
      }).catch(() => {});

      logAuditAction({
        category: 'credential',
        action: 'PROVISIONAL_CREDENTIALS_ISSUED',
        title: 'Agent Temporary Credentials Generated',
        description: `Provisional password generated for Field Agent "${name}". Require password change enforced on first login.`,
        workspaceId,
        targetId: agentUid,
        targetName: name,
        targetEmail: email,
        metadata: { requirePasswordChange: true }
      }).catch(() => {});

      // Sync updated live agent metrics
      const activeWsList = workspaces.filter(w => w.isActive !== false);
      const updatedAgents = [...users.filter(u => u.uid !== agentUid), newAgent as UserProfile];
      const updatedWorkspaces = workspaces.map(w => {
        if (w.id === workspaceId) {
          const prevAgents = Array.isArray(w.agentIds) ? w.agentIds : [];
          return {
            ...w,
            agentIds: prevAgents.includes(agentUid) ? prevAgents : [...prevAgents, agentUid]
          };
        }
        return w;
      });
      const updatedAgentsCount = getPlatformActiveAgentsCount(updatedAgents, updatedWorkspaces);
      syncWorkspacesCountToCloud(workspacesRecordedCount, activeWsList.length, updatedAgentsCount);

      return { success: true, tempPassword };
    } catch (err: any) {
      console.error("Error in createAgent batch write:", err);
      return { success: false, error: err?.message || 'Failed to create agent atomically.' };
    }
  };

  const selfRegisterWorkspace = async (
    workspaceName: string,
    tier: SubscriptionTier,
    ownerEmail: string,
    ownerName: string,
    ownerCell: string,
    trialMode: 'trial' | 'payment',
    ownerPassword?: string,
    months: number = 1
  ): Promise<{ success: boolean; error?: string; isPendingActivation?: boolean; workspaceName?: string; ownerName?: string; ownerEmail?: string; tier?: SubscriptionTier }> => {
    const emailTerm = ownerEmail.trim().toLowerCase();
    
    // Check if user email already exists on an active/existing workspace or AppOwner
    const duplicateEmail = users.some(u => {
      const isEmailMatch = (u.email || '').trim().toLowerCase() === emailTerm;
      if (!isEmailMatch) return false;
      if (u.role === 'AppOwner') return true;
      // Allow reuse if the workspace was deleted/removed from active workspaces
      return workspaces.some(w => w.id === u.workspaceId);
    });
    if (duplicateEmail) {
      return { success: false, error: 'This email is already registered to an active workspace.' };
    }

    if (!isFirebasePlaceholder) {
      try {
        const qEmail = query(collection(db, 'users'), where('email', '==', emailTerm));
        const emailSnap = await getDocs(qEmail);
        if (!emailSnap.empty) {
          let hasActiveAssociatedWorkspace = false;
          const orphanedUserDocRefs: any[] = [];

          for (const userDoc of emailSnap.docs) {
            const uData = userDoc.data() as UserProfile;
            if (uData.role === 'AppOwner') {
              hasActiveAssociatedWorkspace = true;
              break;
            }
            if (uData.workspaceId && uData.workspaceId !== 'system') {
              const wsDocSnap = await getDoc(doc(db, 'workspaces', uData.workspaceId)).catch(() => null);
              if (wsDocSnap && wsDocSnap.exists()) {
                const wsData = wsDocSnap.data() || {};
                const subUserSnap = await getDoc(doc(db, 'workspaces', uData.workspaceId, 'users', userDoc.id)).catch(() => null);
                const isSubDocPresent = !!(subUserSnap && subUserSnap.exists());
                const isOwner = wsData.ownerId === userDoc.id || (wsData.ownerEmail && wsData.ownerEmail.toLowerCase().trim() === emailTerm);
                const isAgent = Array.isArray(wsData.agentIds) && wsData.agentIds.includes(userDoc.id);

                if (isSubDocPresent && (isOwner || isAgent || uData.role === 'WorkspaceMaster')) {
                  hasActiveAssociatedWorkspace = true;
                  break;
                } else {
                  orphanedUserDocRefs.push(userDoc.ref);
                }
              } else {
                orphanedUserDocRefs.push(userDoc.ref);
              }
            } else {
              orphanedUserDocRefs.push(userDoc.ref);
            }
          }

          if (hasActiveAssociatedWorkspace) {
            return { success: false, error: 'This email is already registered to an active workspace.' };
          }

          if (orphanedUserDocRefs.length > 0) {
            await Promise.allSettled(orphanedUserDocRefs.map(ref => deleteDoc(ref)));
          }
        }
      } catch (err) {
        console.warn("Self registration Firestore uniqueness check warning:", err);
      }
    }

    const passwordVal = ownerPassword || 'password';
    let ownerUid = `u_self_${Date.now()}`;

    if (!isFirebasePlaceholder) {
      let secondaryApp: any = null;
      let secondaryAuth: any = null;
      try {
        secondaryApp = initializeApp(firebaseConfig, `register_ws_${Date.now()}`);
        secondaryAuth = getAuth(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailTerm, passwordVal);
        ownerUid = userCredential.user.uid;
        
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
        console.log(`✅ [WiVoTe] Successfully self-registered Firebase Auth user ${emailTerm} with UID: ${ownerUid}`);
      } catch (authErr: any) {
        console.error("❌ [WiVoTe] Failed to provision Firebase Auth user account during self-registration:", authErr);
        if (authErr.code === 'auth/email-already-in-use' || (authErr.message && authErr.message.includes('email-already-in-use'))) {
          // Attempt programmatic administrative cleanup of orphan credentials from previously deleted workspace
          try {
            console.log(`[WiVoTe] Detected residue account for ${emailTerm}. Cleaning up orphan credentials via administrative utility...`);
            const purgeData = await cleanupOrphanedAccounts(emailTerm);
            if (purgeData.success) {
              const retryCredential = await createUserWithEmailAndPassword(secondaryAuth, emailTerm, passwordVal);
              ownerUid = retryCredential.user.uid;
              await signOut(secondaryAuth);
              await deleteApp(secondaryApp);
              console.log(`✅ [WiVoTe] Successfully self-registered Firebase Auth user on retry: ${ownerUid}`);
            } else {
              await signOut(secondaryAuth).catch(() => {});
              await deleteApp(secondaryApp).catch(() => {});
              return { success: false, error: purgeData.error || `Authentication account creation failed: ${authErr.message}` };
            }
          } catch (retryErr: any) {
            await signOut(secondaryAuth).catch(() => {});
            await deleteApp(secondaryApp).catch(() => {});
            return { success: false, error: `Authentication account creation failed: ${retryErr.message || authErr.message}` };
          }
        } else if (authErr.code === 'auth/operation-not-allowed' || (authErr.message && authErr.message.includes('operation-not-allowed'))) {
          await signOut(secondaryAuth).catch(() => {});
          await deleteApp(secondaryApp).catch(() => {});
          return {
            success: false,
            error: "Email/Password Sign-In Provider is Disabled in Firebase. To enable it:\n\n1. Go to your Firebase Console.\n2. Click 'Authentication' in the left menu, then select the 'Sign-in method' tab.\n3. Click 'Add new provider' (or edit 'Email/Password' if already there).\n4. Select 'Email/Password', toggle the first switch to 'Enable', and click 'Save'.\n\nOnce enabled, try registering again!"
          };
        } else {
          await signOut(secondaryAuth).catch(() => {});
          await deleteApp(secondaryApp).catch(() => {});
          return { success: false, error: `Authentication account creation failed: ${authErr.message}` };
        }
      }
    }

    const wsId = `ws_client_${Date.now()}`;
    const expiresAtDate = new Date();
    if (trialMode === 'trial') {
      expiresAtDate.setDate(expiresAtDate.getDate() + 7);
    } else {
      expiresAtDate.setMonth(expiresAtDate.getMonth() + months);
    }
    const expiresAt = expiresAtDate.toISOString();

    // Workspaces are created in suspended state (isActive: false) pending manual activation
    const newWS: Workspace = {
      id: wsId,
      name: workspaceName,
      subscriptionTier: tier,
      isActive: false, // Suspended / Pending Manual Activation
      expiresAt,
      ownerId: ownerUid,
      ownerEmail: emailTerm,
      ownerUid: ownerUid
    };
    if (trialMode === 'trial') {
      newWS.trialStartDate = new Date().toISOString();
    }

    const newMaster: UserProfile = {
      uid: ownerUid,
      email: emailTerm,
      cellNumber: ownerCell,
      role: 'WorkspaceMaster',
      workspaceId: wsId,
      name: ownerName,
      profilePic: '',
      password: passwordVal,
      requirePasswordChange: false, // Password was explicitly chosen during registration
      initialPassword: passwordVal
    };

    if (!isFirebasePlaceholder) {
      try {
        const welcomeNotif = {
          id: `notif_init_${newWS.id}`,
          title: 'Registration Received',
          message: `Self-registration received for workspace "${workspaceName}" (${emailTerm}). Awaiting owner activation.`,
          timestamp: new Date().toISOString(),
          targetRole: 'All',
          readBy: []
        };

        await Promise.all([
          setDoc(doc(db, 'workspaces', newWS.id), newWS, { merge: true }),
          setDoc(doc(db, 'workspaces', newWS.id, 'users', newMaster.uid), newMaster, { merge: true }),
          setDoc(doc(db, 'users', newMaster.uid), newMaster, { merge: true }),
          setDoc(doc(db, 'workspaces', newWS.id, 'notifications', welcomeNotif.id), welcomeNotif, { merge: true }).catch(() => {})
        ]);
        console.log(`✅ [WiVoTe] Self-registered workspace "${workspaceName}" (${newWS.id}) saved to Firestore.`);
      } catch (error) {
        console.error("Firestore self-registration write failed:", error);
        return { success: false, error: 'Failed to write registration to the database. Please check your connection and try again.' };
      }
    }

    setWorkspaces(prev => {
      const updated = [...prev, newWS];
      syncWorkspacesCountToCloud(updated.length, updated.filter(w => w.isActive !== false).length);
      return updated;
    });
    setUsers(prev => [...prev, newMaster]);

    return {
      success: true,
      isPendingActivation: true,
      workspaceName,
      ownerName,
      ownerEmail: emailTerm,
      tier
    };
  };

  const onboardWorkspace = async (
    workspaceName: string,
    tier: SubscriptionTier,
    trialMode: 'trial' | 'payment',
    months: number = 1
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'No active authenticated session found.' };
    }

    const wsId = `ws_client_${Date.now()}`;
    const expiresAtDate = new Date();
    if (trialMode === 'trial') {
      expiresAtDate.setDate(expiresAtDate.getDate() + 7);
    } else {
      expiresAtDate.setMonth(expiresAtDate.getMonth() + months);
    }
    const expiresAt = expiresAtDate.toISOString();

    const newWS: Workspace = {
      id: wsId,
      name: workspaceName,
      subscriptionTier: tier,
      isActive: true,
      expiresAt,
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email?.toLowerCase(),
      ownerUid: currentUser.uid
    };
    if (trialMode === 'trial') {
      newWS.trialStartDate = new Date().toISOString();
    }

    setWorkspaces(prev => {
      const updated = [...prev, newWS];
      syncWorkspacesCountToCloud(updated.length, updated.filter(w => w.isActive !== false).length);
      return updated;
    });

    setUsers(prev => prev.map(u => {
      if (u.uid === currentUser.uid) {
        return {
          ...u,
          workspaceId: wsId
        };
      }
      return u;
    }));

    setCurrentUserWorkspaceId(wsId);
    setSessionVar('wivote_current_user_workspace_id', wsId);

    if (!isFirebasePlaceholder) {
      try {
        const updatedUser = { ...currentUser, workspaceId: wsId };
        await Promise.all([
          setDoc(doc(db, 'workspaces', newWS.id), newWS, { merge: true }),
          setDoc(doc(db, 'users', currentUser.uid), updatedUser, { merge: true }),
          setDoc(doc(db, 'workspaces', newWS.id, 'users', currentUser.uid), updatedUser, { merge: true })
        ]);
      } catch (error) {
        console.error("Firestore onboarding write failed:", error);
        return { success: false, error: 'Failed to complete workspace onboarding in database.' };
      }
    }

    return { success: true };
  };

  /**
   * Build complete portable JSON DB snapshot for an account
   * captures profile, credentials metadata, assigned vouchers, sales history, cash drops, and requests
   */
  const buildAccountDbSnapshot = (user: UserProfile): AccountDbSnapshot => {
    const wsId = user.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || '';
    const wsName = workspaces.find(w => w.id === wsId)?.name || activeWorkspace?.name || 'Workspace';

    // 1. Consolidate complete profile data from all user records and initial seeds
    const cleanLowerEmail = (user.email || '').toLowerCase().trim();
    const cleanLowerName = (user.name || '').toLowerCase().trim();
    const allCandidates = users.filter(u => 
      u.uid === user.uid || 
      (cleanLowerEmail && (u.email || '').toLowerCase().trim() === cleanLowerEmail) ||
      (cleanLowerName && (u.name || '').toLowerCase().trim() === cleanLowerName)
    );
    const seedMatch = initialUsers.find(u => 
      u.uid === user.uid || 
      (cleanLowerEmail && (u.email || '').toLowerCase().trim() === cleanLowerEmail) ||
      (cleanLowerName && (u.name || '').toLowerCase().trim() === cleanLowerName)
    );

    const resolvedPassword = user.password || allCandidates.find(c => c.password)?.password || seedMatch?.password || '26@Votewix';
    const resolvedCell = (user.cellNumber && user.cellNumber !== '+263770000000') 
      ? user.cellNumber 
      : (allCandidates.find(c => c.cellNumber && c.cellNumber !== '+263770000000')?.cellNumber || seedMatch?.cellNumber || user.cellNumber || '+263770000000');
    const resolvedPic = (user.profilePic && !user.profilePic.includes('photo-1472099645785-5658abf4ff4e'))
      ? user.profilePic
      : (allCandidates.find(c => c.profilePic && !c.profilePic.includes('photo-1472099645785-5658abf4ff4e'))?.profilePic || seedMatch?.profilePic || user.profilePic || '');

    const consolidatedUser: UserProfile = {
      ...user,
      password: resolvedPassword,
      cellNumber: resolvedCell,
      profilePic: resolvedPic,
      workspaceId: wsId
    };

    // 2. Find all vouchers assigned to or associated with this user across all aliases / UIDs
    const allUserUids = new Set<string>([user.uid, ...allCandidates.map(c => c.uid), seedMatch?.uid || ''].filter(Boolean));
    const userVouchers = vouchers.filter(v => {
      const matchId = v.assignedAgentId && allUserUids.has(v.assignedAgentId);
      const matchName = cleanLowerName && v.assignedAgentName && v.assignedAgentName.toLowerCase().trim() === cleanLowerName;
      const matchAssignedTo = cleanLowerName && (v as any).assignedTo && (v as any).assignedTo.toLowerCase().trim() === cleanLowerName;
      const matchEmail = cleanLowerEmail && (v as any).agentEmail && (v as any).agentEmail.toLowerCase().trim() === cleanLowerEmail;
      return matchId || matchName || matchAssignedTo || matchEmail;
    });

    // 3. Find all cash drops by this user
    const userCashDrops = cashDrops.filter(cd => 
      (cd.agentId && allUserUids.has(cd.agentId)) || 
      (cleanLowerName && cd.agentName && cd.agentName.toLowerCase().trim() === cleanLowerName)
    );

    // 4. Find all voucher allocation requests
    const userRequests = requests.filter(r => 
      (r.agentId && allUserUids.has(r.agentId)) || 
      (cleanLowerName && r.agentName && r.agentName.toLowerCase().trim() === cleanLowerName)
    );

    const soldVouchers = userVouchers.filter(v => v.status === 'Sold' && !isVoucherFree(v, giveawaySettings));
    const giftedVouchers = userVouchers.filter(v => v.status === 'Sold' && isVoucherFree(v, giveawaySettings));
    const totalSalesRevenue = soldVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, giveawaySettings), 0);
    const reconciledCash = userCashDrops.filter(cd => cd.status === 'Reconciled' || (cd.status as any) === 'Approved').reduce((sum, cd) => sum + (cd.amount || 0), 0);
    const pendingCash = userCashDrops.filter(cd => cd.status === 'Pending').reduce((sum, cd) => sum + (cd.amount || 0), 0);

    return {
      version: '1.0',
      snapshotDate: new Date().toISOString(),
      source: `WiVoTe DB Engine v1.0 [Generated by ${currentUser?.name || 'System'}]`,
      accountType: user.role === 'WorkspaceMaster' ? 'WorkspaceMaster' : user.role === 'Admin' ? 'Admin' : user.role === 'Investor' ? 'Investor' : 'Agent',
      userProfile: consolidatedUser,
      workspaceId: wsId,
      workspaceName: wsName,
      associatedData: {
        vouchers: userVouchers,
        cashDrops: userCashDrops,
        voucherRequests: userRequests,
        totalVouchersCount: userVouchers.length,
        assignedVouchersCount: userVouchers.filter(v => v.status === 'Assigned' && !isVoucherFree(v, giveawaySettings)).length,
        soldVouchersCount: soldVouchers.length,
        giftedVouchersCount: giftedVouchers.length,
        totalSalesRevenue,
        reconciledCashAmount: reconciledCash,
        pendingCashAmount: pendingCash
      },
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedByUid: currentUser?.uid || '',
        exportedByName: currentUser?.name || '',
        exportedByEmail: currentUser?.email || ''
      }
    };
  };

  const deleteWorkspace = async (workspaceId: string): Promise<{ success: boolean; error?: string }> => {
    const targetWs = workspaces.find(w => w.id === workspaceId);
    const targetUsers = users.filter(u => u.workspaceId === workspaceId);

    // Save snapshot of all accounts in this workspace to recycle bin for safety
    try {
      const newBinItems: RecycleBinItem[] = targetUsers.map(u => {
        const snapshot = buildAccountDbSnapshot(u);
        return {
          id: `bin_${Date.now()}_${u.uid.substring(0, 8)}`,
          itemType: 'account',
          accountId: u.uid,
          accountName: u.name,
          accountEmail: u.email,
          accountRole: u.role,
          accountCell: u.cellNumber,
          workspaceId,
          workspaceName: targetWs?.name || 'Workspace',
          deletedAt: new Date().toISOString(),
          deletedBy: {
            uid: currentUser?.uid || 'system',
            name: currentUser?.name || 'App Owner',
            email: currentUser?.email || '',
            role: 'AppOwner'
          },
          status: 'in_bin',
          snapshot,
          vouchersCount: snapshot.associatedData.totalVouchersCount,
          soldCount: snapshot.associatedData.soldVouchersCount,
          cashDropsCount: snapshot.associatedData.cashDrops.length,
          totalSalesValue: snapshot.associatedData.totalSalesRevenue
        };
      });

      if (newBinItems.length > 0) {
        setRecycleBin(prev => [...newBinItems, ...prev]);
        try {
          const existingBin = safeJsonParse<any[]>(localStorage.getItem('wivote_recycle_bin'), []);
          safeSetItem('wivote_recycle_bin', JSON.stringify([...newBinItems, ...existingBin]));
        } catch (e) {
          console.warn("Storage sync error on ws delete bin:", e);
        }
        if (!isFirebasePlaceholder) {
          for (const item of newBinItems) {
            setDoc(doc(db, 'recycle_bin', item.id), item).catch(() => {});
          }
        }
      }
    } catch (binErr) {
      console.warn("Could not save deleted workspace accounts to recycle bin:", binErr);
    }

    // 1. Immediately update local React state and purge storage optimistically
    setWorkspaces(prev => {
      const updated = prev.filter(w => w.id !== workspaceId);
      syncWorkspacesCountToCloud(updated.length, updated.filter(w => w.isActive !== false).length);
      return updated;
    });
    setUsers(prev => prev.filter(u => u.workspaceId !== workspaceId));

    if (currentUserWorkspaceId === workspaceId) {
      setCurrentUserWorkspaceId(null);
      localStorage.removeItem('wivote_active_workspace_id');
      sessionStorage.removeItem('wivote_active_workspace_id');
    }

    try {
      const savedWs = safeJsonParse<any[]>(localStorage.getItem('wivote_workspaces'), []);
      const filteredWs = savedWs.filter((w: any) => w.id !== workspaceId);
      safeSetItem('wivote_workspaces', JSON.stringify(filteredWs));

      const savedUsers = safeJsonParse<any[]>(localStorage.getItem('wivote_users'), []);
      const filteredUsers = savedUsers.filter((u: any) => u.workspaceId !== workspaceId);
      safeSetItem('wivote_users', JSON.stringify(filteredUsers));
    } catch (lsErr) {
      console.warn("Storage sync error on delete:", lsErr);
    }

    // 2. Perform Firestore operations
    if (!isFirebasePlaceholder) {
      try {
        // STEP A: Delete the primary workspace document FIRST
        await deleteDoc(doc(db, 'workspaces', workspaceId));
        console.log(`Primary workspace document /workspaces/${workspaceId} deleted successfully.`);

        // STEP B: Find and delete all associated tenant users in root `/users` collection
        const rootUserRefsToDelete: any[] = [];
        try {
          const qRootUsers = query(collection(db, 'users'), where('workspaceId', '==', workspaceId));
          const rootUsersSnap = await getDocs(qRootUsers);
          rootUsersSnap.docs.forEach(d => {
            rootUserRefsToDelete.push(doc(db, 'users', d.id));
          });
        } catch (uErr) {
          console.warn("Could not query root users for workspace deletion:", uErr);
        }

        for (const u of targetUsers) {
          const userDocRef = doc(db, 'users', u.uid);
          if (!rootUserRefsToDelete.some(r => r.path === userDocRef.path)) {
            rootUserRefsToDelete.push(userDocRef);
          }
        }

        if (targetWs?.ownerId) {
          const ownerDocRef = doc(db, 'users', targetWs.ownerId);
          if (!rootUserRefsToDelete.some(r => r.path === ownerDocRef.path)) {
            rootUserRefsToDelete.push(ownerDocRef);
          }
        }

        // Concurrently delete root user docs so their emails are immediately freed
        if (rootUserRefsToDelete.length > 0) {
          await Promise.allSettled(rootUserRefsToDelete.map(ref => deleteDoc(ref)));
        }

        // STEP B.2: Call backend API to permanently purge all Firebase Auth user accounts for this workspace
        try {
          const userUids = targetUsers.map(u => u.uid);
          const emails = targetUsers.map(u => u.email).filter(Boolean);
          if (targetWs?.ownerId) userUids.push(targetWs.ownerId);
          if (targetWs?.ownerEmail) emails.push(targetWs.ownerEmail);

          await fetch('/api/auth/delete-workspace-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              userUids: Array.from(new Set(userUids)),
              emails: Array.from(new Set(emails))
            })
          });
          console.log(`[WiVoTe] Successfully purged Firebase Auth user accounts for workspace ${workspaceId}`);
        } catch (authPurgeErr) {
          console.warn("Backend auth workspace purge notice:", authPurgeErr);
        }

        // STEP C: Perform recursive subcollection cleanup and archiving
        (async () => {
          try {
            const subcollections = [
              'vouchers',
              'users',
              'agents',
              'requests',
              'cash_drops',
              'legacy_devices',
              'notifications',
              'feedback',
              'sales',
              'transactions',
              'audit_logs',
              'pricing'
            ];

            // Concurrently query all subcollections
            const fetchResults = await Promise.allSettled(
              subcollections.map(async (col) => {
                const snap = await getDocs(collection(db, 'workspaces', workspaceId, col));
                return { col, docs: snap.docs };
              })
            );

            const archiveData: Record<string, any[]> = {};
            const subDocsToDelete: { collectionName: string; id: string; ref: any }[] = [];

            fetchResults.forEach((res) => {
              if (res.status === 'fulfilled') {
                const { col, docs } = res.value;
                archiveData[col] = docs.map(d => ({ id: d.id, ...d.data() }));
                docs.forEach(d => {
                  subDocsToDelete.push({
                    collectionName: col,
                    id: d.id,
                    ref: doc(db, 'workspaces', workspaceId, col, d.id)
                  });
                });
              }
            });

            // Save archived snapshot
            const archiveDoc = {
              workspaceId,
              archivedAt: new Date().toISOString(),
              archivedBy: currentUser?.email || 'AppOwner',
              workspace: targetWs || { id: workspaceId },
              associatedUsers: targetUsers,
              subcollectionsData: archiveData,
              totalSubDocsPurged: subDocsToDelete.length,
              totalUsersPurged: rootUserRefsToDelete.length
            };

            await setDoc(doc(db, 'archived_workspaces', workspaceId), archiveDoc).catch(archErr => {
              console.warn("Could not write to archived_workspaces snapshot:", archErr);
            });

            // Batch delete subcollections
            const BATCH_SIZE = 450;
            for (let i = 0; i < subDocsToDelete.length; i += BATCH_SIZE) {
              const chunk = subDocsToDelete.slice(i, i + BATCH_SIZE);
              const batch = writeBatch(db);
              chunk.forEach(item => batch.delete(item.ref));
              await batch.commit().catch(async () => {
                await Promise.allSettled(chunk.map(item => deleteDoc(item.ref)));
              });
            }

            console.log(`Recursive cleanup for workspace ${workspaceId} completed.`);
          } catch (bgErr) {
            console.warn("Background subcollection purge warning:", bgErr);
          }
        })();

        showToast("Workspace removed from registry and deleted successfully.", "success");
      } catch (error: any) {
        console.error("Error deleting workspace in Firestore:", error);
        showToast("Workspace removed from active registry.", "success");
      }
    } else {
      showToast("Workspace deleted locally.", "success");
    }

    logAuditAction({
      category: 'workspace',
      action: 'WORKSPACE_DELETED',
      title: 'Workspace Deleted & Archived',
      description: `Workspace "${workspaceId}" and associated subcollections deleted and archived.`,
      workspaceId,
      metadata: { deletedAt: new Date().toISOString() }
    }).catch(() => {});

    return { success: true };
  };

  const updateWorkspaceSubscription = async (workspaceId: string, tier: SubscriptionTier, isActive: boolean, expiresAt?: string): Promise<void> => {
    const payload: Partial<Workspace> = {
      subscriptionTier: tier,
      isActive,
      ...(expiresAt ? { expiresAt } : {})
    };

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', workspaceId), payload, { merge: true });
      } catch (error) {
        console.error("Firestore updateWorkspaceSubscription failed:", error);
        throw error;
      }
    }

    setWorkspaces(prev => prev.map(w => {
      if (w.id === workspaceId) {
        return {
          ...w,
          ...payload
        };
      }
      return w;
    }));
    showToast(`Workspace subscription updated to ${tier}`, 'success');
  };

  const updateWorkspaceName = async (workspaceId: string, name: string): Promise<void> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Update Workspace Name');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    if (!isFirebasePlaceholder) {
      try {
        await setDoc(doc(db, 'workspaces', workspaceId), { name }, { merge: true });
      } catch (error) {
        console.error("Firestore updateWorkspaceName failed:", error);
        throw error;
      }
    }

    setWorkspaces(prev => prev.map(w => {
      if (w.id === workspaceId) {
        return {
          ...w,
          name
        };
      }
      return w;
    }));
  };

  const updateWorkspaceDetails = async (
    workspaceId: string,
    name: string,
    ownerUid: string,
    ownerName: string,
    ownerEmail: string,
    ownerCell: string,
    ownerPassword?: string,
    tier?: SubscriptionTier,
    isActive?: boolean,
    expiresAt?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userUpdates: Partial<UserProfile> = {
        name: ownerName,
        email: ownerEmail.toLowerCase().trim(),
        cellNumber: ownerCell,
      };

      if (ownerPassword && ownerPassword.trim().length >= 6) {
        userUpdates.password = ownerPassword.trim();
        userUpdates.initialPassword = ownerPassword.trim();
        userUpdates.requirePasswordChange = true;
      }

      const wsUpdates: Partial<Workspace> = {
        name,
        ...(tier ? { subscriptionTier: tier } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(expiresAt ? { expiresAt } : {})
      };

      if (!isFirebasePlaceholder) {
        // Enforce synchronized awaited writes
        await Promise.all([
          setDoc(doc(db, 'workspaces', workspaceId), wsUpdates, { merge: true }),
          setDoc(doc(db, 'users', ownerUid), userUpdates, { merge: true }),
          setDoc(doc(db, 'workspaces', workspaceId, 'users', ownerUid), userUpdates, { merge: true })
        ]);
      }

      // Update local states
      setWorkspaces(prev => prev.map(w => w.id === workspaceId ? { ...w, ...wsUpdates } : w));
      setUsers(prev => prev.map(u => u.uid === ownerUid ? { ...u, ...userUpdates } : u));
      showToast(`Workspace details & plan saved successfully`, 'success');

      logAuditAction({
        category: 'workspace',
        action: 'WORKSPACE_UPDATED',
        title: 'Workspace Details & Tier Modified',
        description: `Workspace "${name}" (${workspaceId}) updated. Owner: "${ownerName}" (${ownerEmail}). Plan: ${tier || 'Unchanged'}.`,
        workspaceId,
        workspaceName: name,
        targetId: ownerUid,
        targetName: ownerName,
        targetEmail: ownerEmail,
        metadata: { tier, isActive, expiresAt }
      }).catch(() => {});

      return { success: true };
    } catch (err: any) {
      console.error("Firestore updateWorkspaceDetails failed:", err);
      return { success: false, error: err?.message || 'Failed to update workspace details.' };
    }
  };

  const toggleWorkspaceSuspension = async (workspaceId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!isFirebasePlaceholder) {
        await setDoc(doc(db, 'workspaces', workspaceId), { isActive }, { merge: true });
      }

      setWorkspaces(prev => {
        const updated = prev.map(w => w.id === workspaceId ? { ...w, isActive } : w);
        syncWorkspacesCountToCloud(updated.length, updated.filter(w => w.isActive !== false).length);
        return updated;
      });

      logAuditAction({
        category: 'workspace',
        action: isActive ? 'WORKSPACE_ACTIVATED' : 'WORKSPACE_SUSPENDED',
        title: isActive ? 'Workspace Activated' : 'Workspace Suspended',
        description: `Workspace ${workspaceId} status changed to ${isActive ? 'ACTIVE' : 'SUSPENDED'}.`,
        workspaceId,
        metadata: { isActive }
      }).catch(() => {});

      return { success: true };
    } catch (err: any) {
      console.error("Firestore toggleWorkspaceSuspension failed:", err);
      return { success: false, error: err?.message || 'Failed to toggle workspace suspension.' };
    }
  };

  const resetWorkspaceMasterPassword = async (workspaceId: string, masterUid: string): Promise<{ success: boolean; tempPassword?: string; error?: string }> => {
    try {
      const tempPassword = `Temp!${Math.floor(100000 + Math.random() * 900000)}`;
      const updates: Partial<UserProfile> = {
        password: tempPassword,
        initialPassword: tempPassword,
        requirePasswordChange: true
      };

      if (!isFirebasePlaceholder) {
        await Promise.all([
          setDoc(doc(db, 'users', masterUid), updates, { merge: true }),
          setDoc(doc(db, 'workspaces', workspaceId, 'users', masterUid), updates, { merge: true })
        ]);
      }

      const targetMaster = users.find(u => u.uid === masterUid);

      setUsers(prev => prev.map(u => u.uid === masterUid ? { ...u, ...updates } : u));

      logAuditAction({
        category: 'credential',
        action: 'MASTER_PASSWORD_RESET',
        title: 'Master Provisional Password Issued',
        description: `Provisional password generated for Workspace Master "${targetMaster?.name || masterUid}" (${targetMaster?.email || 'N/A'}). First login password change enforced.`,
        workspaceId,
        targetId: masterUid,
        targetName: targetMaster?.name,
        targetEmail: targetMaster?.email,
        metadata: { requirePasswordChange: true }
      }).catch(() => {});

      return { success: true, tempPassword };
    } catch (err: any) {
      console.error("Firestore resetWorkspaceMasterPassword failed:", err);
      return { success: false, error: err?.message || 'Failed to reset workspace master password.' };
    }
  };

  const updatePricingPackages = (newPackages: PackagePricing[]) => {
    setPricingPackages(newPackages);
    safeSetItem('wivote_pricing_packages', JSON.stringify(newPackages));
    if (!isFirebasePlaceholder) {
      setDoc(doc(db, 'saas_config', 'pricing'), { packages: newPackages }).catch(handleSilentFirestoreError);
    }
    logAuditAction({
      category: 'pricing',
      action: 'PRICING_UPDATED',
      title: 'Subscription Pricing Tier Updated',
      description: `Global SaaS pricing packages schema updated with ${newPackages.length} package definitions.`,
      metadata: { packages: newPackages.map(p => ({ id: p.id, price: p.price, maxAgents: p.maxAgents })) }
    }).catch(() => {});
  };

  const addUserByMaster = (email: string, name: string, role: Role, cell: string): string => {
    if (!currentUser) return '';
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Add User');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return '';
    }

    const tempPassword = `Temp!${Math.floor(1000 + Math.random() * 9000)}`;
    const newUser: UserProfile = {
      uid: `u_${Date.now()}`,
      email: email.trim().toLowerCase(),
      cellNumber: cell,
      role,
      workspaceId: currentUser.workspaceId,
      name,
      profilePic: '',
      password: tempPassword,
      requirePasswordChange: true,
      createdById: currentUser.uid,
      created_by_admin: currentUser.uid
    };

    setUsers(prev => [...prev, newUser]);

    if (!isFirebasePlaceholder) {
      setDoc(doc(db, 'workspaces', currentUser.workspaceId, 'users', newUser.uid), newUser).catch(console.error);
      setDoc(doc(db, 'users', newUser.uid), newUser).catch(console.error);
    }
    return tempPassword;
  };

  const editUserByMaster = async (uid: string, updates: Partial<UserProfile>): Promise<void> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Edit User');
    if (!authVerdict.allowed) {
      showToast(authVerdict.error || 'Access restricted to Workspace Masters', 'error');
      return;
    }

    const found = users.find(u => u.uid === uid);
    const workspaceId = found?.workspaceId || '';
    
    if (!isFirebasePlaceholder && workspaceId) {
      try {
        await Promise.all([
          setDoc(doc(db, 'workspaces', workspaceId, 'users', uid), updates, { merge: true }),
          setDoc(doc(db, 'users', uid), updates, { merge: true })
        ]);
      } catch (error) {
        console.error("Firestore editUserByMaster failed:", error);
        throw error;
      }
    }

    setUsers(prev => {
      const updated = prev.map(u => {
        if (u.uid === uid) {
          return { ...u, ...updates };
        }
        return u;
      });
      if (updates.isDeactivated !== undefined || updates.role !== undefined) {
        const activeWsList = workspaces.filter(w => w.isActive !== false);
        const updatedAgentsCount = getPlatformActiveAgentsCount(updated, workspaces);
        syncWorkspacesCountToCloud(workspacesRecordedCount, activeWsList.length, updatedAgentsCount);
      }
      return updated;
    });
    autoPushActionToDb('Edit User by Master', workspaceId);
  };

  const exportWorkspaceData = async (workspaceId: string): Promise<any> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Export Workspace Data');
    if (!authVerdict.allowed) {
      throw new Error(authVerdict.error || 'Access restricted to Workspace Masters');
    }

    const ws = workspaces.find(w => w.id === workspaceId);
    if (!ws) throw new Error('Workspace not found');

    if (isFirebasePlaceholder) {
      const wsUsers = users.filter(u => u.workspaceId === workspaceId);
      const wsVouchers = vouchers.filter(v => resolveVoucherWorkspaceId(v) === workspaceId);
      const wsRequests = requests.filter(r => (r as any).workspaceId === workspaceId);
      const wsCashDrops = cashDrops.filter(c => (c as any).workspaceId === workspaceId);
      const wsLegacyDevices = legacyDevices.filter(ld => resolveLegacyDeviceWorkspaceId(ld) === workspaceId);
      const wsCustomers = customers.filter(c => resolveCustomerWorkspaceId(c, workspaceId) === workspaceId);
      const wsNotifications = notifications;
      const wsFeedback = feedback;

      return {
        workspace: ws,
        users: wsUsers,
        vouchers: wsVouchers,
        requests: wsRequests,
        cashDrops: wsCashDrops,
        legacyDevices: wsLegacyDevices,
        customers: wsCustomers,
        notifications: wsNotifications,
        feedback: wsFeedback
      };
    } else {
      try {
        const fetchCollection = async (colName: string) => {
          const snap = await getDocs(collection(db, 'workspaces', workspaceId, colName));
          const docs: any[] = [];
          snap.forEach(d => {
            docs.push({ id: d.id, ...d.data() });
          });
          return docs;
        };

        const [wsUsers, wsVouchers, wsRequests, wsCashDrops, wsLegacyDevices, wsCustomers, wsNotifications, wsFeedback] = await Promise.all([
          fetchCollection('users'),
          fetchCollection('vouchers'),
          fetchCollection('requests'),
          fetchCollection('cash_drops'),
          fetchCollection('legacy_devices'),
          fetchCollection('customers'),
          fetchCollection('notifications'),
          fetchCollection('feedback')
        ]);

        return {
          workspace: ws,
          users: wsUsers,
          vouchers: wsVouchers,
          requests: wsRequests,
          cashDrops: wsCashDrops,
          legacyDevices: wsLegacyDevices,
          customers: wsCustomers,
          notifications: wsNotifications,
          feedback: wsFeedback
        };
      } catch (err) {
        console.error("Error exporting workspace data from Firestore:", err);
        throw err;
      }
    }
  };

  const importWorkspaceData = async (backupData: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Import Workspace Data');
      if (!authVerdict.allowed) {
        return { success: false, error: authVerdict.error || 'Access restricted to Workspace Masters' };
      }

      const { workspace, users: wsUsers, vouchers: wsVouchers, requests: wsRequests, cashDrops: wsCashDrops, legacyDevices: wsLegacyDevices, customers: wsCustList, notifications: wsNotifications, feedback: wsFeedback } = backupData;
      
      if (!workspace || !workspace.id || !workspace.name) {
        return { success: false, error: 'Invalid backup file structure. Missing workspace identity.' };
      }

      const workspaceId = workspace.id;

      if (isFirebasePlaceholder) {
        setWorkspaces(prev => {
          const filtered = prev.filter(w => w.id !== workspaceId);
          return [...filtered, workspace];
        });
        if (Array.isArray(wsUsers)) {
          setUsers(prev => {
            const filtered = prev.filter(u => u.workspaceId !== workspaceId);
            return [...filtered, ...wsUsers];
          });
        }
        if (Array.isArray(wsVouchers)) {
          setVouchers(prev => {
            const map = new Map<string, Voucher>();
            prev.filter(v => resolveVoucherWorkspaceId(v) !== workspaceId).forEach(v => map.set(v.id, v));
            wsVouchers
              .filter(v => resolveVoucherWorkspaceId(v) === workspaceId || !(v as any).workspaceId)
              .forEach(v => map.set(v.id, { ...v, workspaceId }));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(wsCustList)) {
          const wsCustomers = wsCustList
            .filter((c: any) => resolveCustomerWorkspaceId(c, workspaceId) === workspaceId)
            .map((c: any) => ({ ...c, workspaceId }));
          setCustomers(prev => {
            const map = new Map<string, Customer>();
            prev.filter(c => resolveCustomerWorkspaceId(c, workspaceId) !== workspaceId).forEach(c => map.set(c.id, c));
            wsCustomers.forEach((c: any) => map.set(c.id, c));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(wsRequests)) {
          setRequests(prev => {
            const map = new Map<string, VoucherRequest>();
            prev.filter(r => (r as any).workspaceId !== workspaceId).forEach(r => map.set(r.id, r));
            wsRequests.forEach(r => map.set(r.id, { ...r, workspaceId: (r as any).workspaceId || workspaceId }));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(wsCashDrops)) {
          setCashDrops(prev => {
            const map = new Map<string, CashDrop>();
            prev.filter(c => (c as any).workspaceId !== workspaceId).forEach(c => map.set(c.id, c));
            wsCashDrops.forEach(c => map.set(c.id, { ...c, workspaceId: (c as any).workspaceId || workspaceId }));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(wsLegacyDevices)) {
          setLegacyDevices(prev => {
            const map = new Map<string, LegacyDevice>();
            prev.filter(ld => (ld as any).workspaceId !== workspaceId).forEach(ld => map.set(ld.id, ld));
            wsLegacyDevices.forEach(ld => map.set(ld.id, { ...ld, workspaceId: (ld as any).workspaceId || workspaceId }));
            return deduplicateLegacyDevices(Array.from(map.values()));
          });
        }
        if (Array.isArray(wsNotifications)) {
          setNotifications(wsNotifications);
        }
        if (Array.isArray(wsFeedback)) {
          setFeedback(wsFeedback);
        }
      } else {
        await setDoc(doc(db, 'workspaces', workspaceId), cleanForFirestore(workspace), { merge: true });

        const importSubcollection = async (colName: string, items: any[], idKey: string = 'id') => {
          if (!Array.isArray(items)) return;
          for (const item of items) {
            try {
              const docId = item[idKey] || item.id || item.uid;
              if (docId) {
                const cleanItem = { ...item };
                delete cleanItem.id;
                const sanitizedPayload = cleanForFirestore(cleanItem);
                await setDoc(doc(db, 'workspaces', workspaceId, colName, docId), sanitizedPayload, { merge: true });
              }
            } catch (itemErr) {
              console.warn(`[importWorkspaceData] Non-fatal sync note for ${colName}:`, itemErr);
            }
          }
        };

        const validatedVouchers = Array.isArray(wsVouchers)
          ? wsVouchers.filter(v => resolveVoucherWorkspaceId(v) === workspaceId || !(v as any).workspaceId).map(v => ({ ...v, workspaceId }))
          : [];
        const validatedCustomers = Array.isArray(wsCustList)
          ? wsCustList.filter(c => resolveCustomerWorkspaceId(c, workspaceId) === workspaceId).map(c => ({ ...c, workspaceId }))
          : [];

        await Promise.all([
          importSubcollection('users', wsUsers || [], 'uid'),
          importSubcollection('vouchers', validatedVouchers, 'id'),
          importSubcollection('customers', validatedCustomers, 'id'),
          importSubcollection('requests', wsRequests || [], 'id'),
          importSubcollection('cash_drops', wsCashDrops || [], 'id'),
          importSubcollection('legacy_devices', wsLegacyDevices || [], 'id'),
          importSubcollection('notifications', wsNotifications || [], 'id'),
          importSubcollection('feedback', wsFeedback || [], 'id')
        ]);
      }

      return { success: true };
    } catch (err: any) {
      console.error("Error importing workspace data to Firestore/Local:", err);
      return { success: false, error: err.message || 'Unknown import error' };
    }
  };

  /**
   * Create a point-in-time backup snapshot of an active account currently in use
   */
  const createAccountBackup = async (uid: string, reason?: string): Promise<{ success: boolean; backup?: AccountBackupItem; error?: string }> => {
    try {
      const targetUser = users.find(u => u.uid === uid);
      if (!targetUser) {
        return { success: false, error: 'User account not found' };
      }

      const snapshot = buildAccountDbSnapshot(targetUser);
      const wsId = targetUser.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || '';
      const backupId = `bkp_${Date.now()}_${uid.substring(0, 8)}`;

      const backupItem: AccountBackupItem = {
        id: backupId,
        accountId: targetUser.uid,
        accountName: targetUser.name,
        accountEmail: targetUser.email,
        accountRole: targetUser.role,
        workspaceId: wsId,
        workspaceName: snapshot.workspaceName || 'Workspace',
        createdAt: new Date().toISOString(),
        createdBy: {
          uid: currentUser?.uid || 'system',
          name: currentUser?.name || 'Workspace Master',
          email: currentUser?.email || ''
        },
        reason: reason || 'Live In-Use Account Snapshot',
        snapshot,
        vouchersCount: snapshot.associatedData.totalVouchersCount,
        soldCount: snapshot.associatedData.soldVouchersCount,
        cashDropsCount: snapshot.associatedData.cashDrops.length,
        totalSalesValue: snapshot.associatedData.totalSalesRevenue
      };

      setAccountBackups(prev => [backupItem, ...prev.filter(b => b.id !== backupId)]);

      if (!isFirebasePlaceholder) {
        if (wsId && wsId !== 'system') {
          await setDoc(doc(db, 'workspaces', wsId, 'account_backups', backupId), backupItem).catch(e => {
            console.warn("Could not save backup item to workspace doc:", e);
          });
        }
        await setDoc(doc(db, 'account_backups', backupId), backupItem).catch(e => {
          console.warn("Could not save backup item to root doc:", e);
        });
      }

      showToast(`Snapshot created for ${targetUser.name}. Saved to Account Backups.`, 'success');
      return { success: true, backup: backupItem };
    } catch (err: any) {
      console.error("Error creating account backup:", err);
      return { success: false, error: err.message || 'Failed to backup account' };
    }
  };

  /**
   * Create a full database snapshot containing user accounts, vouchers, customer lists, legacy devices, cash drops, and requests
   */
  const createFullDatabaseBackup = async (triggerType: 'auto' | 'manual' = 'manual'): Promise<{ success: boolean; backup?: any; error?: string }> => {
    try {
      const wsId = activeWorkspace?.id || currentUser?.workspaceId || '';
      if (!wsId) {
        return { success: false, error: 'No active workspace selected' };
      }

      const wsUsers = users.filter(u => u.workspaceId === wsId);
      const wsVouchers = vouchers.filter(v => resolveVoucherWorkspaceId(v) === wsId);
      const wsCustomers = customers.filter(c => resolveCustomerWorkspaceId(c, wsId) === wsId); 
      const wsLegacyDevices = legacyDevices.filter(ld => resolveLegacyDeviceWorkspaceId(ld) === wsId);
      const wsCashDrops = cashDrops.filter(cd => (cd as any).workspaceId === wsId);
      const wsRequests = requests.filter(r => (r as any).workspaceId === wsId);

      const backupId = `fdb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      const backupItem = {
        id: backupId,
        createdAt: new Date().toISOString(),
        timestamp: Date.now(),
        intervalMinutes: triggerType === 'auto' ? backupInterval : 0,
        triggerType,
        vouchersCount: wsVouchers.length,
        usersCount: wsUsers.length,
        customersCount: wsCustomers.length,
        legacyDevicesCount: wsLegacyDevices.length,
        cashDropsCount: wsCashDrops.length,
        requestsCount: wsRequests.length,
        snapshot: {
          users: wsUsers,
          vouchers: wsVouchers,
          customers: wsCustomers,
          legacyDevices: wsLegacyDevices,
          cashDrops: wsCashDrops,
          requests: wsRequests
        }
      };

      setFullDatabaseBackups(prev => [backupItem, ...prev.filter(b => b.id !== backupId)]);
      setLastBackupTime(Date.now());
      localStorage.setItem('wivote_last_backup_time', String(Date.now()));

      if (!isFirebasePlaceholder) {
        await setDoc(doc(db, 'workspaces', wsId, 'full_database_backups', backupId), cleanForFirestore(backupItem));
      }

      await logAuditAction({
        category: 'system',
        action: `FULL_DATABASE_BACKUP_${triggerType.toUpperCase()}`,
        title: 'Full Database Backup Snapshot Created',
        description: `Full database snapshot generated (${triggerType}). Counts - Vouchers: ${wsVouchers.length}, Users: ${wsUsers.length}, Customers: ${wsCustomers.length}.`,
        workspaceId: wsId
      }).catch(() => {});

      if (triggerType === 'manual') {
        showToast(`✓ Full database backup successfully generated!`, 'success');
      }
      return { success: true, backup: backupItem };
    } catch (err: any) {
      console.error("Error creating full database backup:", err);
      return { success: false, error: err.message || 'Unknown backup error' };
    }
  };

  /**
   * Delete a full database backup snapshot
   */
  const deleteFullDatabaseBackup = async (id: string): Promise<boolean> => {
    try {
      const wsId = activeWorkspace?.id || currentUser?.workspaceId || '';
      setFullDatabaseBackups(prev => prev.filter(b => b.id !== id));
      if (!isFirebasePlaceholder && wsId) {
        await deleteDoc(doc(db, 'workspaces', wsId, 'full_database_backups', id));
      }
      showToast("✓ Full database backup snapshot deleted.", "info");
      return true;
    } catch (err) {
      console.error("Error deleting full database backup:", err);
      return false;
    }
  };

  /**
   * Restore the entire workspace database from a full database snapshot
   */
  const restoreFullDatabaseBackup = async (backup: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const wsId = activeWorkspace?.id || currentUser?.workspaceId || '';
      if (!wsId) return { success: false, error: 'No active workspace selected' };
      if (!backup || !backup.snapshot) return { success: false, error: 'Invalid backup structure' };

      const { snapshot } = backup;

      // 1. Users (strictly matching this workspace)
      if (Array.isArray(snapshot.users)) {
        const wsUsers = snapshot.users.filter((u: any) => u.workspaceId === wsId);
        setUsers(prev => {
          const map = new Map<string, UserProfile>();
          prev.filter(u => u.workspaceId !== wsId).forEach(u => map.set(u.uid, u));
          wsUsers.forEach((u: any) => map.set(u.uid, { ...u, workspaceId: wsId }));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const u of wsUsers) {
            await setDoc(doc(db, 'workspaces', wsId, 'users', u.uid), cleanForFirestore({ ...u, workspaceId: wsId }), { merge: true });
            await setDoc(doc(db, 'users', u.uid), cleanForFirestore({ ...u, workspaceId: wsId }), { merge: true });
          }
        }
      }

      // 2. Vouchers (strictly matching this workspace)
      if (Array.isArray(snapshot.vouchers)) {
        const wsVouchers = snapshot.vouchers
          .filter((v: any) => resolveVoucherWorkspaceId(v) === wsId || (v as any).workspaceId === wsId)
          .map((v: any) => ({ ...v, workspaceId: wsId }));
        setVouchers(prev => {
          const map = new Map<string, Voucher>();
          prev.filter(v => resolveVoucherWorkspaceId(v) !== wsId).forEach(v => map.set(v.id, v));
          wsVouchers.forEach((v: any) => map.set(v.id, { ...v, workspaceId: wsId }));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const v of wsVouchers) {
            await setDoc(doc(db, 'workspaces', wsId, 'vouchers', v.id), cleanForFirestore({ ...v, workspaceId: wsId }), { merge: true });
          }
        }
      }

      // 3. Customers (strictly matching this workspace)
      if (Array.isArray(snapshot.customers)) {
        const wsCustomers = snapshot.customers
          .filter((c: any) => resolveCustomerWorkspaceId(c, wsId) === wsId)
          .map((c: any) => ({ ...c, workspaceId: wsId }));
        setCustomers(prev => {
          const map = new Map<string, Customer>();
          prev.filter(c => resolveCustomerWorkspaceId(c, wsId) !== wsId).forEach(c => map.set(c.id, c));
          wsCustomers.forEach((c: any) => map.set(c.id, c));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const c of wsCustomers) {
            await setDoc(doc(db, 'workspaces', wsId, 'customers', c.id), cleanForFirestore(c), { merge: true });
            await setDoc(doc(db, 'customers', c.id), cleanForFirestore(c), { merge: true }).catch(() => {});
          }
        }
      }

      // 4. Legacy Devices (strictly matching this workspace)
      if (Array.isArray(snapshot.legacyDevices)) {
        const wsLegacy = snapshot.legacyDevices
          .filter((ld: any) => resolveLegacyDeviceWorkspaceId(ld) === wsId || (ld as any).workspaceId === wsId)
          .map((ld: any) => ({ ...ld, workspaceId: wsId }));
        setLegacyDevices(prev => {
          const map = new Map<string, LegacyDevice>();
          prev.filter(ld => resolveLegacyDeviceWorkspaceId(ld) !== wsId).forEach(ld => map.set(ld.id, ld));
          wsLegacy.forEach((ld: any) => map.set(ld.id, { ...ld, workspaceId: wsId }));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const ld of wsLegacy) {
            await setDoc(doc(db, 'workspaces', wsId, 'legacy_devices', ld.id), cleanForFirestore({ ...ld, workspaceId: wsId }), { merge: true });
          }
        }
      }

      // 5. Cash Drops (strictly matching this workspace)
      if (Array.isArray(snapshot.cashDrops)) {
        const wsDrops = snapshot.cashDrops.filter((cd: any) => ((cd as any).workspaceId || 'ws_vakzim') === wsId);
        setCashDrops(prev => {
          const map = new Map<string, CashDrop>();
          prev.filter(cd => (cd as any).workspaceId !== wsId).forEach(cd => map.set(cd.id, cd));
          wsDrops.forEach((cd: any) => map.set(cd.id, { ...cd, workspaceId: wsId }));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const cd of wsDrops) {
            await setDoc(doc(db, 'workspaces', wsId, 'cash_drops', cd.id), cleanForFirestore({ ...cd, workspaceId: wsId }), { merge: true });
          }
        }
      }

      await logAuditAction({
        category: 'system',
        action: 'RESTORE_FULL_DATABASE_BACKUP',
        title: 'Full Database Restored From Snapshot',
        description: `Restored entire database from snapshot ${backup.id} created on ${new Date(backup.createdAt).toLocaleString()}`,
        workspaceId: wsId
      }).catch(() => {});

      showToast("✓ Database successfully restored from backup snapshot! Syncing complete.", "success");
      return { success: true };
    } catch (err: any) {
      console.error("Error restoring database snapshot:", err);
      return { success: false, error: err.message || 'Restore error' };
    }
  };

  /**
   * Update configuration parameters for continuous backups
   */
  const updateAppBackupConfig = async (cfg: Partial<AppBackupConfig>): Promise<void> => {
    try {
      const merged = { ...appBackupConfig, ...cfg };
      setAppBackupConfig(merged);
      safeSetItem('wivote_app_backup_config', JSON.stringify(merged));
      if (!isFirebasePlaceholder) {
        await setDoc(doc(db, 'saas_config', 'backup_config'), cleanForBackupSerialization(merged), { merge: true }).catch(() => {});
      }
      showToast('✓ Backup parameters and conditions updated.', 'success');
    } catch (e: any) {
      console.warn("Error updating backup config:", e);
    }
  };

  /**
   * Keep fresh references of data states to prevent stale closure reads during debounced write backups
   */
  const backupStateRef = useRef({
    workspaces,
    users,
    vouchers,
    cashDrops,
    legacyDevices,
    requests,
    reversalRequests,
    customers,
    activeWorkspace,
    currentUser,
    appBackupConfig
  });

  useEffect(() => {
    backupStateRef.current = {
      workspaces,
      users,
      vouchers,
      cashDrops,
      legacyDevices,
      requests,
      reversalRequests,
      customers,
      activeWorkspace,
      currentUser,
      appBackupConfig
    };
  });

  /**
   * Universal Trigger: Called on every write (by AppOwner, Admin, or Agent)
   * Captures time-spaced snapshots for the active workspace and the whole application.
   */
  const triggerWriteBackup = useCallback(async (
    triggerEvent: string,
    options?: { actorRole?: string; actorName?: string; workspaceId?: string; isManual?: boolean }
  ) => {
    try {
      const state = backupStateRef.current;
      if (!state.appBackupConfig.autoBackupOnWrite && !options?.isManual) {
        return;
      }

      const now = Date.now();
      const currentActor = {
        uid: state.currentUser?.uid || 'system',
        name: options?.actorName || state.currentUser?.name || 'System Operator',
        role: options?.actorRole || state.currentUser?.role || 'System',
        email: state.currentUser?.email || ''
      };

      const targetWsId = options?.workspaceId || state.activeWorkspace?.id || state.currentUser?.workspaceId || '';
      const targetWs = state.workspaces.find(w => w.id === targetWsId) || state.activeWorkspace;

      // 1. Workspace Backup (for Admin)
      if (targetWsId && targetWs) {
        const wsUsers = state.users.filter(u => u.workspaceId === targetWsId);
        const wsVouchers = state.vouchers.filter(v => resolveVoucherWorkspaceId(v) === targetWsId);
        const wsDrops = state.cashDrops.filter(cd => (cd as any).workspaceId === targetWsId);
        const wsLegacy = state.legacyDevices.filter(ld => resolveLegacyDeviceWorkspaceId(ld) === targetWsId);
        const wsRequests = state.requests.filter(r => (r as any).workspaceId === targetWsId);
        const wsCustomers = state.customers
          .filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId)
          .map(c => ({ ...c, workspaceId: targetWsId }));

        const wsBackupId = `wsbkp_${targetWsId}_${now}_${Math.random().toString(36).substring(2, 6)}`;
        const wsBackupItem: WorkspaceBackupItem = {
          id: wsBackupId,
          type: 'workspace',
          timestamp: now,
          createdAt: new Date(now).toISOString(),
          triggerEvent,
          actor: currentActor,
          workspaceId: targetWsId,
          workspaceName: targetWs.name,
          summary: {
            vouchersCount: wsVouchers.length,
            usersCount: wsUsers.length,
            cashDropsCount: wsDrops.length,
            legacyDevicesCount: wsLegacy.length,
            customersCount: wsCustomers.length,
            requestsCount: wsRequests.length
          },
          snapshot: {
            workspace: targetWs,
            users: wsUsers,
            vouchers: wsVouchers,
            cashDrops: wsDrops,
            legacyDevices: wsLegacy,
            requests: wsRequests,
            customers: wsCustomers
          }
        };

        setWorkspaceBackups(prev => {
          const updated = pruneIntelligentBackups(prev, wsBackupItem, state.appBackupConfig);
          try {
            safeSetItem(`wivote_ws_backups_${targetWsId}`, JSON.stringify(updated));
            safeSetItem('wivote_workspace_backups', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });

        if (!isFirebasePlaceholder && targetWsId) {
          setDoc(
            doc(db, 'workspaces', targetWsId, 'workspace_backups', wsBackupId),
            cleanForBackupSerialization(wsBackupItem)
          ).catch(() => {});
        }
      }

      // 2. Entire App Backup (for App Owner)
      const appBackupId = `appbkp_${now}_${Math.random().toString(36).substring(2, 6)}`;
      const appBackupItem: EntireAppBackupItem = {
        id: appBackupId,
        type: 'entire_app',
        timestamp: now,
        createdAt: new Date(now).toISOString(),
        triggerEvent,
        actor: currentActor,
        summary: {
          workspacesCount: state.workspaces.length,
          vouchersCount: state.vouchers.length,
          usersCount: state.users.length,
          cashDropsCount: state.cashDrops.length,
          legacyDevicesCount: state.legacyDevices.length,
          customersCount: state.customers.length,
          requestsCount: state.requests.length
        },
        snapshot: {
          workspaces: state.workspaces,
          users: state.users,
          vouchers: state.vouchers,
          cashDrops: state.cashDrops,
          legacyDevices: state.legacyDevices,
          requests: state.requests,
          customers: state.customers,
          appOwnerEmail: 'karimazondomike049@gmail.com'
        }
      };

      setEntireAppBackups(prev => {
        const updated = pruneIntelligentBackups(prev, appBackupItem, state.appBackupConfig);
        try {
          safeSetItem('wivote_entire_app_backups', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      if (!isFirebasePlaceholder) {
        setDoc(
          doc(db, 'saas_config', 'system_backups', 'snapshots', appBackupId),
          cleanForBackupSerialization(appBackupItem)
        ).catch(() => {});
      }

      if (options?.isManual) {
        showToast(`✓ Database snapshot created: "${triggerEvent}"`, 'success');
      }
    } catch (err) {
      console.error("Backup snapshot error:", err);
    }
  }, [isFirebasePlaceholder, showToast]);


  // --- App Lifecycle Event Flush Engine ---
  // Pushes pending state to cloud DB strictly when tab is hidden or page is closed/refreshed

  // Measure 2: App Lifecycle Event Flush - Instantly pushes pending state when tab is hidden or page is closed/refreshed
  useEffect(() => {
    if (!isLoggedIn) return;

    const handleLifecycleFlush = () => {
      // Only flush to cloud DB if user has executed real writes that have not yet been synced
      if (pendingMutationsCountRef.current > 0 || hasUserWrittenRef.current) {
        forcePushLocalToGlobalDB(true).catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleLifecycleFlush();
      }
    };

    window.addEventListener('beforeunload', handleLifecycleFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleLifecycleFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoggedIn, forcePushLocalToGlobalDB]);

  const createManualWorkspaceBackup = async (notes?: string): Promise<{ success: boolean; backup?: WorkspaceBackupItem; error?: string }> => {
    try {
      const eventName = notes || 'Manual Workspace Snapshot';
      await triggerWriteBackup(eventName, { isManual: true });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const createManualEntireAppBackup = async (notes?: string): Promise<{ success: boolean; backup?: EntireAppBackupItem; error?: string }> => {
    try {
      const eventName = notes || 'Manual Full Application Snapshot';
      await triggerWriteBackup(eventName, { isManual: true });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const exportWorkspaceBackup = (backup?: WorkspaceBackupItem) => {
    const target = backup || workspaceBackups[0];
    if (!target) {
      showToast('No workspace backup found to export', 'error');
      return;
    }
    const wsName = target.workspaceName || activeWorkspace?.name || 'workspace';
    const cleanName = wsName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const dateStr = new Date(target.timestamp).toISOString().split('T')[0];
    exportBackupToFile(target, `wivote_workspace_${cleanName}_backup_${dateStr}_${target.id}.json`);
    showToast('✓ Workspace backup downloaded successfully.', 'success');
  };

  const exportEntireAppBackup = (backup?: EntireAppBackupItem) => {
    const target = backup || entireAppBackups[0];
    if (!target) {
      showToast('No application backup found to export', 'error');
      return;
    }
    const dateStr = new Date(target.timestamp).toISOString().split('T')[0];
    exportBackupToFile(target, `wivote_full_platform_backup_${dateStr}_${target.id}.json`);
    showToast('✓ Full platform backup downloaded successfully.', 'success');
  };

  const importAndRestoreWorkspaceBackup = async (jsonContent: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const parsed = safeJsonParse<any>(jsonContent, null, 5_000_000);
      if (!parsed || !parsed.snapshot) {
        return { success: false, error: 'Invalid backup structure. Snapshot data missing.' };
      }
      return await restoreWorkspaceFromBackup(parsed);
    } catch (e: any) {
      return { success: false, error: `Invalid JSON format: ${e.message}` };
    }
  };

  const importAndRestoreEntireAppBackup = async (jsonContent: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const parsed = safeJsonParse<any>(jsonContent, null, 5_000_000);
      if (!parsed || !parsed.snapshot) {
        return { success: false, error: 'Invalid backup structure. Snapshot data missing.' };
      }
      return await restoreEntireAppFromBackup(parsed);
    } catch (e: any) {
      return { success: false, error: `Invalid JSON format: ${e.message}` };
    }
  };

  const restoreWorkspaceFromBackup = async (backup: WorkspaceBackupItem): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!backup || !backup.snapshot) return { success: false, error: 'Invalid backup structure' };
      const wsId = backup.workspaceId || backup.snapshot.workspace?.id;
      if (!wsId) return { success: false, error: 'Workspace ID missing in backup' };

      const { snapshot } = backup;

      // 1. Workspace
      if (snapshot.workspace) {
        setWorkspaces(prev => prev.map(w => w.id === wsId ? { ...w, ...snapshot.workspace } : w));
        if (!isFirebasePlaceholder) {
          await setDoc(doc(db, 'workspaces', wsId), cleanForBackupSerialization(snapshot.workspace), { merge: true }).catch(() => {});
        }
      }

      // 2. Users
      if (Array.isArray(snapshot.users)) {
        setUsers(prev => {
          const map = new Map<string, UserProfile>();
          prev.filter(u => u.workspaceId !== wsId).forEach(u => map.set(u.uid, u));
          snapshot.users.forEach(u => map.set(u.uid, u));
          const merged = Array.from(map.values());
          safeSetItem('wivote_users', JSON.stringify(merged));
          safeSetItem(`wivote_ws_users_${wsId}`, JSON.stringify(snapshot.users));
          return merged;
        });
        if (!isFirebasePlaceholder) {
          for (const u of snapshot.users) {
            await setDoc(doc(db, 'workspaces', wsId, 'users', u.uid), cleanForBackupSerialization(u), { merge: true }).catch(() => {});
            await setDoc(doc(db, 'users', u.uid), cleanForBackupSerialization(u), { merge: true }).catch(() => {});
          }
        }
      }

      // 3. Vouchers
      if (Array.isArray(snapshot.vouchers)) {
        const wsVouchers = snapshot.vouchers
          .filter(v => resolveVoucherWorkspaceId(v) === wsId || (v as any).workspaceId === wsId)
          .map(v => ({ ...v, workspaceId: wsId }));
        setVouchers(prev => {
          const map = new Map<string, Voucher>();
          prev.filter(v => resolveVoucherWorkspaceId(v) !== wsId).forEach(v => map.set(v.id, v));
          wsVouchers.forEach(v => map.set(v.id, v));
          const merged = Array.from(map.values());
          safeSetItem('wivote_vouchers', JSON.stringify(merged));
          safeSetItem(`wivote_ws_vouchers_${wsId}`, JSON.stringify(wsVouchers));
          return merged;
        });
        if (!isFirebasePlaceholder) {
          for (const v of wsVouchers) {
            await setDoc(doc(db, 'workspaces', wsId, 'vouchers', v.id), cleanForFirestore(cleanForBackupSerialization(v)), { merge: true }).catch(() => {});
          }
        }
      }

      // 4. Cash Drops
      if (Array.isArray(snapshot.cashDrops)) {
        const wsCash = snapshot.cashDrops.map(c => ({ ...c, workspaceId: wsId }));
        setCashDrops(prev => {
          const map = new Map<string, CashDrop>();
          prev.filter(c => (c as any).workspaceId !== wsId).forEach(c => map.set(c.id, c));
          wsCash.forEach(c => map.set(c.id, c));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const cd of wsCash) {
            await setDoc(doc(db, 'workspaces', wsId, 'cash_drops', cd.id), cleanForBackupSerialization(cd), { merge: true }).catch(() => {});
          }
        }
      }

      // 5. Legacy Devices
      if (Array.isArray(snapshot.legacyDevices)) {
        const wsLegacy = snapshot.legacyDevices
          .filter(ld => resolveLegacyDeviceWorkspaceId(ld) === wsId || (ld as any).workspaceId === wsId)
          .map(ld => ({ ...ld, workspaceId: wsId }));
        setLegacyDevices(prev => {
          const map = new Map<string, LegacyDevice>();
          prev.filter(ld => resolveLegacyDeviceWorkspaceId(ld) !== wsId).forEach(ld => map.set(ld.id, ld));
          wsLegacy.forEach(ld => map.set(ld.id, ld));
          return Array.from(map.values());
        });
        if (!isFirebasePlaceholder) {
          for (const ld of wsLegacy) {
            await setDoc(doc(db, 'workspaces', wsId, 'legacy_devices', ld.id), cleanForBackupSerialization(ld), { merge: true }).catch(() => {});
          }
        }
      }

      // 6. Customers (Universal Customer Registry strictly isolated to this workspace)
      if (Array.isArray(snapshot.customers)) {
        const wsCustomers = snapshot.customers
          .filter(c => c && c.name && resolveCustomerWorkspaceId(c, wsId) === wsId)
          .map(c => ({ ...c, workspaceId: wsId }));

        setCustomers(prev => {
          const map = new Map<string, Customer>();
          prev.filter(c => resolveCustomerWorkspaceId(c, wsId) !== wsId).forEach(c => map.set(c.id, c));
          wsCustomers.forEach(c => map.set(c.id, c));
          const merged = Array.from(map.values());
          safeSetItem('wivote_customers', JSON.stringify(merged));
          safeSetItem(`wivote_ws_customers_${wsId}`, JSON.stringify(wsCustomers));
          return merged;
        });

        if (!isFirebasePlaceholder) {
          for (const c of wsCustomers) {
            await setDoc(doc(db, 'workspaces', wsId, 'customers', c.id), cleanForBackupSerialization(c), { merge: true }).catch(() => {});
            await setDoc(doc(db, 'customers', c.id), cleanForBackupSerialization(c), { merge: true }).catch(() => {});
          }
        }
      }

      await logAuditAction({
        category: 'system',
        action: 'RESTORE_WORKSPACE_DATABASE_BACKUP',
        title: `Entire Workspace Database Restored: ${backup.workspaceName || wsId}`,
        description: `Restored workspace from snapshot ${backup.id}. Items: Vouchers: ${snapshot.vouchers?.length || 0}, Users: ${snapshot.users?.length || 0}`,
        workspaceId: wsId
      }).catch(() => {});

      showToast(`✓ Workspace "${backup.workspaceName || wsId}" restored successfully!`, 'success');
      return { success: true };
    } catch (err: any) {
      console.error("Restore workspace error:", err);
      return { success: false, error: err.message || 'Restoration failed' };
    }
  };

  const restoreEntireAppFromBackup = async (backup: EntireAppBackupItem): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!backup || !backup.snapshot) return { success: false, error: 'Invalid backup structure' };
      const { snapshot } = backup;

      // 1. Workspaces
      if (Array.isArray(snapshot.workspaces)) {
        setWorkspaces(snapshot.workspaces);
        safeSetItem('wivote_workspaces', JSON.stringify(snapshot.workspaces));
        if (!isFirebasePlaceholder) {
          for (const w of snapshot.workspaces) {
            await setDoc(doc(db, 'workspaces', w.id), cleanForBackupSerialization(w), { merge: true }).catch(() => {});
          }
        }
      }

      // 2. Users
      if (Array.isArray(snapshot.users)) {
        setUsers(snapshot.users);
        safeSetItem('wivote_users', JSON.stringify(snapshot.users));
        if (!isFirebasePlaceholder) {
          for (const u of snapshot.users) {
            const wsId = u.workspaceId || 'system';
            await setDoc(doc(db, 'workspaces', wsId, 'users', u.uid), cleanForBackupSerialization(u), { merge: true }).catch(() => {});
            await setDoc(doc(db, 'users', u.uid), cleanForBackupSerialization(u), { merge: true }).catch(() => {});
          }
        }
      }

      // 3. Vouchers
      if (Array.isArray(snapshot.vouchers)) {
        setVouchers(snapshot.vouchers);
        safeSetItem('wivote_vouchers', JSON.stringify(snapshot.vouchers));
        if (!isFirebasePlaceholder) {
          for (const v of snapshot.vouchers) {
            const wsId = (v as any).workspaceId || 'ws_vakzim';
            await setDoc(doc(db, 'workspaces', wsId, 'vouchers', v.id), cleanForFirestore(cleanForBackupSerialization(v)), { merge: true }).catch(() => {});
          }
        }
      }

      // 4. Cash Drops
      if (Array.isArray(snapshot.cashDrops)) {
        setCashDrops(snapshot.cashDrops);
        safeSetItem('wivote_cash_drops', JSON.stringify(snapshot.cashDrops));
        if (!isFirebasePlaceholder) {
          for (const cd of snapshot.cashDrops) {
            const wsId = (cd as any).workspaceId || 'ws_vakzim';
            await setDoc(doc(db, 'workspaces', wsId, 'cash_drops', cd.id), cleanForBackupSerialization(cd), { merge: true }).catch(() => {});
          }
        }
      }

      // 5. Legacy Devices
      if (Array.isArray(snapshot.legacyDevices)) {
        setLegacyDevices(snapshot.legacyDevices);
        safeSetItem('wivote_legacy_devices', JSON.stringify(snapshot.legacyDevices));
        if (!isFirebasePlaceholder) {
          for (const ld of snapshot.legacyDevices) {
            const wsId = (ld as any).workspaceId || 'ws_vakzim';
            await setDoc(doc(db, 'workspaces', wsId, 'legacy_devices', ld.id), cleanForBackupSerialization(ld), { merge: true }).catch(() => {});
          }
        }
      }

      await logAuditAction({
        category: 'system',
        action: 'RESTORE_ENTIRE_APP_DATABASE_BACKUP',
        title: 'Full Application Database Restored',
        description: `Restored entire application from snapshot ${backup.id}. Workspaces: ${snapshot.workspaces?.length || 0}, Users: ${snapshot.users?.length || 0}, Vouchers: ${snapshot.vouchers?.length || 0}`,
        workspaceId: 'system'
      }).catch(() => {});

      showToast('✓ Entire application database restored successfully!', 'success');
      return { success: true };
    } catch (err: any) {
      console.error("Restore entire app error:", err);
      return { success: false, error: err.message || 'Restoration failed' };
    }
  };

  // Continuous Auto-Backup on Write Watcher (Intelligently debounced)
  const writeChecksum = useMemo(() => {
    let soldCount = 0;
    let assignedCount = 0;
    for (let i = 0; i < vouchers.length; i++) {
      if (vouchers[i].status === 'Sold') soldCount++;
      else if (vouchers[i].status === 'Assigned') assignedCount++;
    }
    return `${workspaces.length}_${users.length}_${vouchers.length}_${soldCount}_${assignedCount}_${cashDrops.length}_${legacyDevices.length}_${customers.length}_${requests.length}`;
  }, [workspaces.length, users.length, vouchers, cashDrops.length, legacyDevices.length, customers.length, requests.length]);

  const prevChecksumRef = useRef(writeChecksum);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (prevChecksumRef.current !== writeChecksum) {
      prevChecksumRef.current = writeChecksum;
      // Tailor backup-on-write strictly to user-effected mutations, NEVER on passive background refetches
      if (hasUserWrittenRef.current && appBackupConfig.autoBackupOnWrite) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          const role = currentUser?.role || 'System';
          const name = currentUser?.name || 'User';
          triggerWriteBackup(`Auto-Backup: State updated by ${name} (${role})`, {
            actorRole: role,
            actorName: name
          });
          hasUserWrittenRef.current = false;
        }, 1200); // Debounce to allow grouped rapid batch mutations to settle before committing slot
      }
    }
  }, [writeChecksum, isLoggedIn, appBackupConfig.autoBackupOnWrite, currentUser, triggerWriteBackup]);

  // Background Auto-Interval Backup Trigger Effect
  useEffect(() => {
    if (!isLoggedIn || !activeWorkspace?.id) return;
    if (backupInterval <= 0) return; 

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsedMins = (now - lastBackupTime) / (1000 * 60);
      if (elapsedMins >= backupInterval) {
        // Only generate automatic full database backup if user has actually made writes since last backup
        if (hasWritesSinceLastBackupRef.current) {
          console.log(`[Auto Backup Engine] Interval of ${backupInterval} mins reached and user writes detected. Triggering automatic database backup.`);
          createFullDatabaseBackup('auto');
          hasWritesSinceLastBackupRef.current = false;
        }
      }
    }, 15000); // Check every 15 seconds

    return () => clearInterval(checkInterval);
  }, [isLoggedIn, activeWorkspace?.id, backupInterval, lastBackupTime, users, vouchers, customers, legacyDevices, cashDrops, requests]);

  /**
   * Restore an account from a JSON DB Snapshot (either from the bin or an existing backup)
   */
  const restoreAccountFromSnapshot = async (
    snapshot: AccountDbSnapshot, 
    binItemId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!snapshot || !snapshot.userProfile) {
        return { success: false, error: 'Invalid DB snapshot file: missing userProfile.' };
      }

      const restoredUser = { ...snapshot.userProfile };
      const matchingWs = workspaces.find(w => w.id === restoredUser.workspaceId);
      const wsId = (matchingWs ? restoredUser.workspaceId : '') || activeWorkspace?.id || currentUser?.workspaceId || (workspaces[0] ? workspaces[0].id : '') || 'system';
      restoredUser.workspaceId = wsId;

      // 0. Ensure password, cellNumber, profilePic are restored properly
      const cleanLowerEmail = (restoredUser.email || '').toLowerCase().trim();
      const cleanLowerName = (restoredUser.name || '').toLowerCase().trim();
      const seedMatch = initialUsers.find(u => 
        u.uid === restoredUser.uid || 
        (cleanLowerEmail && (u.email || '').toLowerCase().trim() === cleanLowerEmail) ||
        (cleanLowerName && (u.name || '').toLowerCase().trim() === cleanLowerName)
      );

      if (!restoredUser.password || restoredUser.password.trim() === '') {
        restoredUser.password = seedMatch?.password || '26@Votewix';
      }
      if (!restoredUser.cellNumber || restoredUser.cellNumber === '+263770000000') {
        restoredUser.cellNumber = (snapshot as any).accountCell || seedMatch?.cellNumber || restoredUser.cellNumber || '+263770000000';
      }
      if (!restoredUser.profilePic || restoredUser.profilePic.includes('photo-1472099645785-5658abf4ff4e')) {
        restoredUser.profilePic = seedMatch?.profilePic || restoredUser.profilePic || '';
      }
      restoredUser.isDeactivated = false;
      restoredUser.status = 'active';

      // 1. Recreate or sync the user in Firebase Auth backend so they can log in immediately
      try {
        const authSyncRes = await fetch('/api/auth/restore-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: restoredUser.uid,
            email: restoredUser.email,
            password: restoredUser.password,
            name: restoredUser.name,
            photoUrl: restoredUser.profilePic,
            cellNumber: restoredUser.cellNumber,
            workspaceId: wsId,
            role: restoredUser.role
          })
        });
        const authSyncData = await authSyncRes.json().catch(() => null);
        if (authSyncData?.uid) {
          restoredUser.uid = authSyncData.uid;
        }
      } catch (authSyncErr) {
        console.warn("Could not sync restored user with Firebase Auth:", authSyncErr);
      }

      // 2. Restore to local React state
      setUsers(prev => {
        const filtered = prev.filter(u => u.uid !== restoredUser.uid && (u.email || '').toLowerCase().trim() !== cleanLowerEmail);
        return [...filtered, restoredUser];
      });

      // 3. Ensure workspace agentIds array contains restoredUser.uid
      if (wsId) {
        setWorkspaces(prev => prev.map(w => {
          if (w.id === wsId) {
            const agentIds = Array.isArray(w.agentIds) ? w.agentIds : [];
            if (!agentIds.includes(restoredUser.uid)) {
              return { ...w, agentIds: [...agentIds, restoredUser.uid] };
            }
          }
          return w;
        }));
      }

      // 4. Restore associated vouchers (inventory records)
      const snapVouchers = (snapshot.associatedData && Array.isArray(snapshot.associatedData.vouchers))
        ? snapshot.associatedData.vouchers
        : [];

      // If snapshot had no vouchers (e.g. from an older deletion), fall back to finding existing unlinked vouchers for this agent
      const vouchersToRestore: Voucher[] = snapVouchers.length > 0 
        ? snapVouchers 
        : vouchers.filter(v => 
            v.assignedAgentName?.toLowerCase().trim() === cleanLowerName || 
            (v as any).assignedTo?.toLowerCase().trim() === cleanLowerName ||
            (v as any).agentEmail?.toLowerCase().trim() === cleanLowerEmail
          );

      if (vouchersToRestore.length > 0) {
        setVouchers(prev => {
          const map = new Map<string, Voucher>();
          prev.forEach(v => map.set(v.id, v));
          vouchersToRestore.forEach(v => {
            const existing = map.get(v.id);
            const restoredVoucher: Voucher = {
              ...(existing || {}),
              ...v,
              assignedAgentId: restoredUser.uid,
              assignedAgentName: restoredUser.name,
              status: v.status || (existing?.status && existing.status !== 'Unused' ? existing.status : 'Assigned')
            };
            map.set(v.id, restoredVoucher);
          });
          const updatedList = Array.from(map.values());
          try {
            saveVouchersCache(updatedList);
          } catch (e) {}
          return updatedList;
        });
      }

      // 5. Restore cash drops if present in snapshot
      if (snapshot.associatedData && Array.isArray(snapshot.associatedData.cashDrops) && snapshot.associatedData.cashDrops.length > 0) {
        const snapCash = snapshot.associatedData.cashDrops;
        setCashDrops(prev => {
          const map = new Map<string, CashDrop>();
          prev.forEach(c => map.set(c.id, c));
          snapCash.forEach(c => {
            const existing = map.get(c.id);
            map.set(c.id, {
              ...(existing || {}),
              ...c,
              agentId: restoredUser.uid,
              agentName: restoredUser.name
            });
          });
          const updatedCash = Array.from(map.values());
          try {
            localStorage.setItem('wivote_cash_drops', JSON.stringify(updatedCash));
          } catch (e) {}
          return updatedCash;
        });
      }

      // 6. Restore voucher allocation requests if present in snapshot
      if (snapshot.associatedData && Array.isArray(snapshot.associatedData.voucherRequests) && snapshot.associatedData.voucherRequests.length > 0) {
        const snapReqs = snapshot.associatedData.voucherRequests;
        setRequests(prev => {
          const map = new Map<string, VoucherRequest>();
          prev.forEach(r => map.set(r.id, r));
          snapReqs.forEach(r => {
            const existing = map.get(r.id);
            map.set(r.id, {
              ...(existing || {}),
              ...r,
              agentId: restoredUser.uid,
              agentName: restoredUser.name
            });
          });
          const updatedReqs = Array.from(map.values());
          try {
            localStorage.setItem('wivote_requests', JSON.stringify(updatedReqs));
          } catch (e) {}
          return updatedReqs;
        });
      }

      // 6.5. Restore or re-link legacy devices belonging to this agent
      setLegacyDevices(prev => {
        const updated = prev.map(ld => {
          const cleanLdName = (ld.fieldAgentName || '').toLowerCase().trim();
          const cleanLdEmail = ((ld as any).fieldAgentEmail || '').toLowerCase().trim();
          const isLdMatch = 
            ld.fieldAgentId === restoredUser.uid ||
            ld.fieldAgentId === snapshot.userProfile.uid ||
            ld.fieldAgentId === 'agent_histec_training' ||
            (cleanLowerName && cleanLdName === cleanLowerName) ||
            (cleanLowerEmail && cleanLdEmail === cleanLowerEmail) ||
            (cleanLowerName.includes('histec') && cleanLdName.includes('histec')) ||
            (cleanLowerName.includes('mukondodzi') && cleanLdName.includes('mukondodzi')) ||
            (ld.fieldAgentId && ld.fieldAgentId.toLowerCase().includes('mukondodzi'));

          if (isLdMatch) {
            return {
              ...ld,
              fieldAgentId: restoredUser.uid,
              fieldAgentName: restoredUser.name,
              ...(restoredUser.email ? { fieldAgentEmail: restoredUser.email } : {})
            };
          }
          return ld;
        });

        const snapLegacy = (snapshot.associatedData as any)?.legacyDevices;
        if (Array.isArray(snapLegacy) && snapLegacy.length > 0) {
          snapLegacy.forEach((sld: LegacyDevice) => {
            if (!updated.some(ld => ld.id === sld.id || ((ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === (sld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()))) {
              updated.push({
                ...sld,
                fieldAgentId: restoredUser.uid,
                fieldAgentName: restoredUser.name
              });
            }
          });
        }

        try {
          localStorage.setItem('wivote_legacy_devices', JSON.stringify(updated));
        } catch (e) {}
        return deduplicateLegacyDevices(updated);
      });

      // 7. Sync to localStorage
      try {
        const savedUsers = safeJsonParse<any[]>(localStorage.getItem('wivote_users'), []);
        const updatedUsers = [...savedUsers.filter((u: any) => u.uid !== restoredUser.uid && (u.email || '').toLowerCase().trim() !== cleanLowerEmail), restoredUser];
        safeSetItem('wivote_users', JSON.stringify(updatedUsers));
      } catch (lsErr) {
        console.warn("Storage sync error on restoreAccountFromSnapshot:", lsErr);
      }

      // 8. Sync to Firestore Cloud Database
      if (!isFirebasePlaceholder) {
        const writeOps: Promise<any>[] = [];
        
        // Write user doc to workspace subcollection and root /users
        if (wsId && wsId !== 'system') {
          writeOps.push(setDoc(doc(db, 'workspaces', wsId, 'users', restoredUser.uid), cleanForFirestore(restoredUser), { merge: true }));
        }
        writeOps.push(setDoc(doc(db, 'users', restoredUser.uid), cleanForFirestore(restoredUser), { merge: true }));

        // Update workspace agentIds in Firestore
        if (wsId && wsId !== 'system') {
          const wsRef = doc(db, 'workspaces', wsId);
          const wsSnap = await getDoc(wsRef).catch(() => null);
          if (wsSnap && wsSnap.exists()) {
            const wsData = wsSnap.data();
            const currentAgentIds = Array.isArray(wsData.agentIds) ? wsData.agentIds : [];
            if (!currentAgentIds.includes(restoredUser.uid)) {
              writeOps.push(updateDoc(wsRef, cleanForFirestore({ agentIds: [...currentAgentIds, restoredUser.uid] })).catch(() => {}));
            }
          }
        }

        // Restore vouchers to Firestore subcollection if needed
        if (wsId && wsId !== 'system' && vouchersToRestore.length > 0) {
          for (const v of vouchersToRestore) {
            const restoredVoucherDoc = {
              ...v,
              assignedAgentId: restoredUser.uid,
              assignedAgentName: restoredUser.name,
              assignedTo: restoredUser.name,
              workspaceId: wsId,
              status: v.status || 'Assigned'
            };
            writeOps.push(setDoc(doc(db, 'workspaces', wsId, 'vouchers', v.id), cleanForFirestore(restoredVoucherDoc), { merge: true }).catch(() => {}));
          }
        }

        // Restore cash drops in Firestore subcollection
        if (wsId && wsId !== 'system' && snapshot.associatedData?.cashDrops) {
          for (const c of snapshot.associatedData.cashDrops) {
            writeOps.push(setDoc(doc(db, 'workspaces', wsId, 'cash_drops', c.id), cleanForFirestore({
              ...c,
              agentId: restoredUser.uid,
              agentName: restoredUser.name,
              workspaceId: wsId
            }), { merge: true }).catch(() => {}));
          }
        }

        // Restore requests in Firestore subcollection
        if (wsId && wsId !== 'system' && snapshot.associatedData?.voucherRequests) {
          for (const r of snapshot.associatedData.voucherRequests) {
            writeOps.push(setDoc(doc(db, 'workspaces', wsId, 'requests', r.id), cleanForFirestore({
              ...r,
              agentId: restoredUser.uid,
              agentName: restoredUser.name,
              workspaceId: wsId
            }), { merge: true }).catch(() => {}));
          }
        }

        // If binItemId provided, delete it from bin in Firestore
        if (binItemId) {
          if (wsId && wsId !== 'system') {
            writeOps.push(deleteDoc(doc(db, 'workspaces', wsId, 'recycle_bin', binItemId)).catch(() => {}));
          }
          writeOps.push(deleteDoc(doc(db, 'recycle_bin', binItemId)).catch(() => {}));
        }

        await Promise.allSettled(writeOps);
      }

      // Remove from bin state if restored from bin
      if (binItemId) {
        setRecycleBin(prev => prev.filter(b => b.id !== binItemId));
      }

      // Log audit trail
      logAuditAction({
        category: 'credential',
        action: 'ACCOUNT_RESTORED_FROM_DB',
        title: 'Account Restored from Database File',
        description: `Account "${restoredUser.name}" (${restoredUser.email}) successfully restored from DB snapshot with ${snapshot.associatedData?.totalVouchersCount || 0} vouchers.`,
        targetId: restoredUser.uid,
        targetName: restoredUser.name,
        targetEmail: restoredUser.email,
        workspaceId: wsId,
        metadata: {
          vouchersRestored: snapshot.associatedData?.totalVouchersCount || 0,
          cashDropsRestored: snapshot.associatedData?.cashDrops?.length || 0,
          sourceBinItem: binItemId || null
        }
      }).catch(() => {});

      showToast(`Account "${restoredUser.name}" successfully restored!`, 'success');
      return { success: true };
    } catch (err: any) {
      console.error("Error restoring account from snapshot:", err);
      return { success: false, error: err.message || 'Failed to restore account from snapshot.' };
    }
  };

  /**
   * Permanently delete an item from the Recycle Bin
   */
  const deletePermanentlyFromBin = async (binItemId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const item = recycleBin.find(b => b.id === binItemId);
      const wsId = item?.workspaceId || activeWorkspace?.id || '';

      setRecycleBin(prev => prev.filter(b => b.id !== binItemId));
      try {
        const savedBin = JSON.parse(localStorage.getItem('wivote_recycle_bin') || '[]');
        localStorage.setItem('wivote_recycle_bin', JSON.stringify(savedBin.filter((b: any) => b.id !== binItemId)));
      } catch (e) {
        console.warn("Storage sync error on bin delete:", e);
      }

      if (!isFirebasePlaceholder) {
        if (wsId && wsId !== 'system') {
          deleteDoc(doc(db, 'workspaces', wsId, 'recycle_bin', binItemId)).catch(() => {});
        }
        deleteDoc(doc(db, 'recycle_bin', binItemId)).catch(() => {});
      }

      showToast("Account DB file permanently deleted from recycle bin.", 'info');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete from bin' };
    }
  };

  /**
   * Delete a live account backup snapshot
   */
  const deleteAccountBackup = async (backupId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const item = accountBackups.find(b => b.id === backupId);
      const wsId = item?.workspaceId || activeWorkspace?.id || '';

      setAccountBackups(prev => prev.filter(b => b.id !== backupId));
      try {
        const saved = JSON.parse(localStorage.getItem('wivote_account_backups') || '[]');
        localStorage.setItem('wivote_account_backups', JSON.stringify(saved.filter((b: any) => b.id !== backupId)));
      } catch (e) {
        console.warn("Storage sync error on backup delete:", e);
      }

      if (!isFirebasePlaceholder) {
        if (wsId && wsId !== 'system') {
          deleteDoc(doc(db, 'workspaces', wsId, 'account_backups', backupId)).catch(() => {});
        }
        deleteDoc(doc(db, 'account_backups', backupId)).catch(() => {});
      }

      showToast("Account backup removed.", 'info');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete account backup' };
    }
  };

  /**
   * Set and persist default email for automated backup delivery
   */
  const setConfiguredBackupEmail = async (email: string): Promise<void> => {
    const cleanEmail = email.trim().toLowerCase();
    setConfiguredBackupEmailState(cleanEmail);
    localStorage.setItem('wivote_backup_email', cleanEmail);
    if (!isFirebasePlaceholder && activeWorkspace?.id) {
      await updateDoc(doc(db, 'workspaces', activeWorkspace.id), { backupEmail: cleanEmail }).catch(err => {
        console.warn("Could not save backup email to workspace doc:", err);
      });
    }
    showToast(cleanEmail ? `Backup destination email configured: ${cleanEmail}` : 'Backup email cleared.', 'success');
  };

  /**
   * Dispatch DB Snapshot JSON file via email (SMTP / Server mailer)
   */
  const emailDbFile = async (params: { 
    recipientEmail: string; 
    snapshot: AccountDbSnapshot; 
    subject?: string; 
    notes?: string 
  }): Promise<{ success: boolean; sentViaSmtp?: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/backup/email-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: params.recipientEmail,
          subject: params.subject,
          accountName: params.snapshot.userProfile?.name,
          snapshotData: params.snapshot,
          notes: params.notes
        })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) {
        throw new Error(resData.error || 'Failed to dispatch email');
      }

      if (resData.sentViaSmtp) {
        showToast(`DB file sent directly via SMTP to ${params.recipientEmail}`, 'success');
      } else {
        showToast(`Email dispatched to ${params.recipientEmail} (DB file attached)`, 'success');
      }

      return { success: true, sentViaSmtp: resData.sentViaSmtp };
    } catch (err: any) {
      console.warn("Email API note:", err);
      showToast(`Email dispatch notice: ${err.message || 'Check recipient'}.`, 'info');
      return { success: false, error: err.message };
    }
  };

  /**
   * Package all contents of the recycle bin and send them in one batch email
   */
  const sendAllBinContentsByEmail = async (
    recipientEmail: string, 
    workspaceId?: string
  ): Promise<{ success: boolean; count: number; sentViaSmtp?: boolean; error?: string }> => {
    try {
      const itemsToSend = workspaceId 
        ? recycleBin.filter(b => b.workspaceId === workspaceId && b.status === 'in_bin')
        : recycleBin.filter(b => b.status === 'in_bin');

      if (itemsToSend.length === 0) {
        showToast("Recycle bin is currently empty. Nothing to send.", 'info');
        return { success: false, count: 0, error: 'Bin is empty' };
      }

      const bundleData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser?.name || 'Administrator',
        workspaceFilter: workspaceId || 'All',
        totalItems: itemsToSend.length,
        items: itemsToSend
      };

      const response = await fetch('/api/backup/email-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail,
          isBatch: true,
          count: itemsToSend.length,
          accountName: `${itemsToSend.length} Deleted Accounts`,
          snapshotData: bundleData,
          notes: `Batch recycle bin archive containing ${itemsToSend.length} account snapshots.`
        })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) {
        throw new Error(resData.error || 'Failed to dispatch bin bundle email');
      }

      showToast(`All ${itemsToSend.length} bin items packaged and emailed to ${recipientEmail}!`, 'success');
      return { success: true, count: itemsToSend.length, sentViaSmtp: resData.sentViaSmtp };
    } catch (err: any) {
      console.error("Error sending all bin contents:", err);
      showToast(`Could not email bin contents: ${err.message}`, 'error');
      return { success: false, count: 0, error: err.message };
    }
  };

  const deleteUserByMaster = async (uid: string, userObj?: UserProfile): Promise<{ success: boolean; error?: string }> => {
    const authVerdict = assertWorkspaceMasterPrivilege(currentUser, 'Delete User');
    if (!authVerdict.allowed) {
      return { success: false, error: authVerdict.error || 'Access restricted to Workspace Masters' };
    }

    if (isAgentAccount(currentUser)) {
      return { success: false, error: 'Security Policy Violation: Field Agent accounts are strictly prohibited from performing user deletion.' };
    }

    const userToDelete = userObj || users.find(u => u.uid === uid);
    if (!userToDelete) {
      return { success: false, error: 'User to delete not found.' };
    }

    // Never allow deleting a Workspace Master / Owner account unless executed by the App Owner
    if (isWorkspaceMasterAccount(userToDelete)) {
      if (!isAppOwnerAccount(currentUser)) {
        return { success: false, error: 'Security Policy Violation: Workspace Master / Owner accounts are permanent and cannot be deleted.' };
      }
    }

    const workspaceId = userToDelete?.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || '';
    const lowerEmail = (userToDelete?.email || '').trim().toLowerCase();
    const rawEmail = (userToDelete?.email || '').trim();
    const cleanName = (userToDelete?.name || '').trim();
    const cleanCell = (userToDelete?.cellNumber || '').trim();

    // --- STEP 0: Capture full Account DB snapshot and save to Recycle Bin ---
    try {
      let userWithDb = { ...userToDelete };
      if (!isFirebasePlaceholder) {
        try {
          const rootSnap = await getDoc(doc(db, 'users', uid)).catch(() => null);
          if (rootSnap && rootSnap.exists()) {
            userWithDb = { ...userWithDb, ...rootSnap.data() };
          }
          if (workspaceId && workspaceId !== 'system') {
            const wsUserSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'users', uid)).catch(() => null);
            if (wsUserSnap && wsUserSnap.exists()) {
              userWithDb = { ...userWithDb, ...wsUserSnap.data() };
            }
          }
        } catch (dbErr) {
          console.warn("Could not fetch remote user doc prior to delete:", dbErr);
        }
      }
      const snapshot = buildAccountDbSnapshot(userWithDb);
      const binItemId = `bin_${Date.now()}_${uid.substring(0, 8)}`;
      const binItem: RecycleBinItem = {
        id: binItemId,
        itemType: 'account',
        accountId: uid,
        accountName: cleanName || 'Unnamed User',
        accountEmail: rawEmail || '',
        accountRole: userToDelete.role,
        accountCell: cleanCell || userToDelete.cellNumber || '',
        workspaceId,
        workspaceName: activeWorkspace?.name || 'Workspace',
        deletedAt: new Date().toISOString(),
        deletedBy: {
          uid: currentUser?.uid || 'system',
          name: currentUser?.name || 'Workspace Master',
          email: currentUser?.email || '',
          role: currentUser?.role || 'WorkspaceMaster'
        },
        status: 'in_bin',
        snapshot,
        vouchersCount: snapshot.associatedData.totalVouchersCount,
        soldCount: snapshot.associatedData.soldVouchersCount,
        cashDropsCount: snapshot.associatedData.cashDrops.length,
        totalSalesValue: snapshot.associatedData.totalSalesRevenue
      };

      setRecycleBin(prev => [binItem, ...prev.filter(b => b.id !== binItemId)]);
      try {
        const existingBin = safeJsonParse<any[]>(localStorage.getItem('wivote_recycle_bin'), []);
        safeSetItem('wivote_recycle_bin', JSON.stringify([binItem, ...existingBin.filter((b: any) => b.id !== binItemId)]));
      } catch (e) {
        console.warn("Storage sync error on bin:", e);
      }

      if (!isFirebasePlaceholder) {
        if (workspaceId && workspaceId !== 'system') {
          setDoc(doc(db, 'workspaces', workspaceId, 'recycle_bin', binItemId), binItem).catch(e => {
            console.warn("Could not save recycle_bin item to workspace doc:", e);
          });
        }
        setDoc(doc(db, 'recycle_bin', binItemId), binItem).catch(e => {
          console.warn("Could not save recycle_bin item to root doc:", e);
        });
      }
    } catch (binErr) {
      console.warn("Could not create recycle bin snapshot:", binErr);
    }

    // 1. Immediately purge from local React state (filter by UID, email, and cell within this workspace)
    setUsers(prev => prev.filter(u => {
      if (u.uid === uid) return false;
      if (lowerEmail && (u.email || '').trim().toLowerCase() === lowerEmail) return false;
      if (cleanCell && u.workspaceId === workspaceId && (u.cellNumber || '').trim() === cleanCell) return false;
      return true;
    }));

    // Update parent workspace in local React state (remove from agentIds)
    if (workspaceId) {
      setWorkspaces(prev => prev.map(w => {
        if (w.id === workspaceId) {
          const existingAgents = Array.isArray((w as any).agentIds) ? (w as any).agentIds : [];
          return {
            ...w,
            agentIds: existingAgents.filter((id: string) => id !== uid)
          };
        }
        return w;
      }));
    }

    // 2. Sync with localStorage
    try {
      const savedUsers = safeJsonParse<any[]>(localStorage.getItem('wivote_users'), []);
      const filteredUsers = savedUsers.filter((u: any) => {
        if (u.uid === uid) return false;
        if (lowerEmail && (u.email || '').trim().toLowerCase() === lowerEmail) return false;
        return true;
      });
      safeSetItem('wivote_users', JSON.stringify(filteredUsers));

      if (workspaceId) {
        const savedWs = safeJsonParse<any[]>(localStorage.getItem('wivote_workspaces'), []);
        const updatedWs = savedWs.map((w: any) => {
          if (w.id === workspaceId && Array.isArray(w.agentIds)) {
            return { ...w, agentIds: w.agentIds.filter((id: string) => id !== uid) };
          }
          return w;
        });
        safeSetItem('wivote_workspaces', JSON.stringify(updatedWs));
      }
    } catch (lsErr) {
      console.warn("Storage sync error on deleteUserByMaster:", lsErr);
    }

    // 3. Cloud Database and Backend Auth Purge
    if (!isFirebasePlaceholder) {
      try {
        const deleteOps: Promise<any>[] = [];

        // A. Delete by UID directly
        if (workspaceId && workspaceId !== 'system') {
          deleteOps.push(deleteDoc(doc(db, 'workspaces', workspaceId, 'users', uid)).catch(() => {}));
        }
        deleteOps.push(deleteDoc(doc(db, 'users', uid)).catch(() => {}));

        // B. Purge by email (lowercase and raw) from root and workspace
        if (lowerEmail) {
          const emailsToQuery = Array.from(new Set([lowerEmail, rawEmail].filter(Boolean)));
          for (const em of emailsToQuery) {
            // Root /users
            const qRoot = query(collection(db, 'users'), where('email', '==', em));
            const rootSnap = await getDocs(qRoot).catch(() => null);
            if (rootSnap && !rootSnap.empty) {
              rootSnap.docs.forEach(d => deleteOps.push(deleteDoc(d.ref).catch(() => {})));
            }

            // Workspace subcollection
            if (workspaceId && workspaceId !== 'system') {
              const qWs = query(collection(db, 'workspaces', workspaceId, 'users'), where('email', '==', em));
              const wsSnap = await getDocs(qWs).catch(() => null);
              if (wsSnap && !wsSnap.empty) {
                wsSnap.docs.forEach(d => deleteOps.push(deleteDoc(d.ref).catch(() => {})));
              }
            }
          }
        }

        // C. Purge by Name from workspace subcollection and root /users
        if (cleanName && workspaceId && workspaceId !== 'system') {
          const qWsName = query(collection(db, 'workspaces', workspaceId, 'users'), where('name', '==', cleanName));
          const wsNameSnap = await getDocs(qWsName).catch(() => null);
          if (wsNameSnap && !wsNameSnap.empty) {
            wsNameSnap.docs.forEach(d => deleteOps.push(deleteDoc(d.ref).catch(() => {})));
          }

          const qRootName = query(collection(db, 'users'), where('name', '==', cleanName));
          const rootNameSnap = await getDocs(qRootName).catch(() => null);
          if (rootNameSnap && !rootNameSnap.empty) {
            rootNameSnap.docs.forEach(d => {
              if (d.data().workspaceId === workspaceId || !d.data().workspaceId) {
                deleteOps.push(deleteDoc(d.ref).catch(() => {}));
              }
            });
          }
        }

        // D. Update workspace agentIds array in Firestore
        if (workspaceId && workspaceId !== 'system') {
          const wsDocRef = doc(db, 'workspaces', workspaceId);
          const wsDocSnap = await getDoc(wsDocRef).catch(() => null);
          if (wsDocSnap && wsDocSnap.exists()) {
            const wsData = wsDocSnap.data();
            const existingAgents = Array.isArray(wsData.agentIds) ? wsData.agentIds : [];
            const filteredAgents = existingAgents.filter((id: string) => id !== uid);
            if (filteredAgents.length !== existingAgents.length) {
              deleteOps.push(updateDoc(wsDocRef, { agentIds: filteredAgents }).catch(() => {}));
            }
          }
        }

        await Promise.allSettled(deleteOps);

        // E. Permanently purge residual Firebase Auth credentials via administrative utility
        await cleanupOrphanedAccounts(lowerEmail || rawEmail).catch(err => {
          console.warn("Could not delete agent Firebase Auth account via cleanup utility:", err);
        });
        await fetch('/api/auth/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            email: lowerEmail || rawEmail,
            name: cleanName,
            cellNumber: cleanCell,
            workspaceId
          })
        }).then(res => res.json()).then(data => {
          console.log(`[WiVoTe] Cleaned up Firebase Auth credentials for ${lowerEmail || uid}:`, data);
        }).catch(err => {
          console.warn("Could not delete agent Firebase Auth account via backend:", err);
        });

      } catch (err: any) {
        console.error("Error inside deleteUserByMaster execution:", err);
        return { success: false, error: err?.message || 'Failed to completely purge user.' };
      }
    }

    // Log the credential purge in the administrative audit trail
    logAuditAction({
      category: 'credential',
      action: 'USER_CREDENTIALS_PURGED',
      title: 'Account & Credentials Purged',
      description: `Account "${cleanName || uid}" (${lowerEmail || rawEmail || 'N/A'}) purged and credentials released from workspace "${workspaceId}". Credentials now available for recycling.`,
      targetId: uid,
      targetName: cleanName || undefined,
      targetEmail: lowerEmail || rawEmail || undefined,
      workspaceId,
      metadata: {
        cellNumber: cleanCell,
        role: userToDelete?.role,
        recycled: true
      }
    }).catch(() => {});

    // Sync updated live agent metrics
    const activeWsList = workspaces.filter(w => w.isActive !== false);
    const updatedUsers = users.filter(u => u.uid !== uid);
    const updatedWorkspaces = workspaces.map(w => {
      if (w.id === workspaceId && Array.isArray(w.agentIds)) {
        return { ...w, agentIds: w.agentIds.filter(id => id !== uid) };
      }
      return w;
    });
    const updatedAgentsCount = getPlatformActiveAgentsCount(updatedUsers, updatedWorkspaces);
    syncWorkspacesCountToCloud(workspacesRecordedCount, activeWsList.length, updatedAgentsCount);

    autoPushActionToDb('Delete User by Master', workspaceId);
    return { success: true };
  };

  const clearAllLocalData = () => {
    localStorage.clear();
    if (isProduction) {
      setWorkspaces([]);
      setUsers([
        {
          uid: 'app_owner_karim',
          email: devEmail.toLowerCase().trim(),
          cellNumber: '+263771111112',
          role: 'AppOwner',
          workspaceId: 'system',
          name: 'Mike Karim (App Owner)',
          profilePic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          password: '26@Votewix'
        }
      ]);
      setVouchers([]);
      setRequests([]);
      setCashDrops([]);
      setLegacyDevices([]);
      setNotifications([]);
      setFeedback([]);
    } else {
      setWorkspaces(initialWorkspaces);
      setUsers(initialUsers);
      setVouchers(initialVouchers);
      setRequests(initialRequests);
      setCashDrops(initialCashDrops);
      setLegacyDevices(initialLegacyDevices);
      setNotifications(initialNotifications);
      setFeedback([]);
    }
    logoutUser();
  };

  // --- Investment & Shareholding Governance Handlers ---
  const updateShareholdingGovernance = async (updates: Partial<ShareholdingGovernance>): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspaceId = activeWorkspace?.id || currentUser?.workspaceId;
      if (!workspaceId) return { success: false, error: 'No active workspace selected.' };

      setShareholdingGovernance(prev => {
        const next = prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : {
          id: 'gov_default',
          workspaceId,
          rulesPreset: 'UK_COMPANIES_ACT',
          profitSharingModel: 'PRO_RATA',
          customDividendThreshold: 5000,
          governanceTone: 'BALANCED',
          valuationMethod: 'DCF_AND_MULTIPLE',
          shareholderVotingRights: true,
          exitNoticePeriodDays: 30,
          updatedAt: new Date().toISOString(),
          ...updates
        } as ShareholdingGovernance;
        return next;
      });

      if (!isFirebasePlaceholder) {
        const govRef = doc(db, 'workspaces', workspaceId, 'shareholding_governance', 'default_governance');
        await setDoc(govRef, updates, { merge: true });
      }

      showToast('Shareholding governance rules updated successfully.', 'success');
      autoPushActionToDb('Update Governance', workspaceId);
      return { success: true };
    } catch (e: any) {
      console.error('Failed to update shareholding governance:', e);
      return { success: false, error: e?.message || 'Failed to update governance rules' };
    }
  };

  const addInvestor = async (investorData: Omit<InvestorStake, 'id'>, createLoginUser = false, customPassword = 'password'): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      const workspaceId = investorData.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

      const newId = `inv_${Date.now()}`;
      const newInvestor: InvestorStake = {
        id: newId,
        ...investorData,
        workspaceId
      };

      setInvestors(prev => [...prev, newInvestor]);

      if (!isFirebasePlaceholder) {
        const invRef = doc(db, 'workspaces', workspaceId, 'investors', newId);
        await setDoc(invRef, newInvestor);
      }

      // Add a ledger entry recording the initial capital injection
      const txId = `tx_${Date.now()}`;
      const lastBalance = ledgerTransactions.length > 0 ? ledgerTransactions[0].balanceAfter : 72706;
      const ledgerEntry: LedgerTransaction = {
        id: txId,
        workspaceId,
        type: 'CapitalReinjection',
        description: `Initial equity investment of $${investorData.contributionAmount.toLocaleString()} for ${investorData.sharesCount.toLocaleString()} shares (${investorData.investorType}).`,
        amount: investorData.contributionAmount,
        date: new Date().toISOString(),
        recordedBy: currentUser?.name || 'Workspace Master',
        category: 'Equity Financing',
        referenceDocId: newInvestor.shareCertificateNumber,
        balanceAfter: lastBalance + investorData.contributionAmount
      };

      setLedgerTransactions(prev => [ledgerEntry, ...prev]);

      if (!isFirebasePlaceholder) {
        const txRef = doc(db, 'workspaces', workspaceId, 'ledger', txId);
        await setDoc(txRef, ledgerEntry);
      }

      if (createLoginUser) {
        // Create an investor user account so they can log in and view their portfolio
        const userUid = `user_${newId}`;
        const investorUser: UserProfile = {
          uid: userUid,
          email: investorData.email,
          cellNumber: investorData.cellNumber || '+263770000000',
          role: 'Investor',
          workspaceId,
          name: investorData.name,
          profilePic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          performanceScore: 850.00,
          password: customPassword
        };
        setUsers(prev => [...prev, investorUser]);
        if (!isFirebasePlaceholder) {
          const userDocRef = doc(db, 'workspaces', workspaceId, 'users', userUid);
          await setDoc(userDocRef, investorUser);
        }
      }

      showToast(`Investor "${investorData.name}" registered successfully.`, 'success');
      autoPushActionToDb('Add Investor', workspaceId);
      return { success: true, id: newId };
    } catch (e: any) {
      console.error('Failed to add investor:', e);
      return { success: false, error: e?.message || 'Failed to register investor' };
    }
  };

  const updateInvestor = async (id: string, updates: Partial<InvestorStake>): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspaceId = activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';
      if (!workspaceId) return { success: false, error: 'No active workspace.' };

      setInvestors(prev => prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv));

      if (!isFirebasePlaceholder) {
        const invRef = doc(db, 'workspaces', workspaceId, 'investors', id);
        await setDoc(invRef, updates, { merge: true });
      }

      showToast('Investor details updated.', 'success');
      autoPushActionToDb('Update Investor', workspaceId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to update investor' };
    }
  };

  const deleteInvestor = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspaceId = activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';
      if (!workspaceId) return { success: false, error: 'No active workspace.' };

      setInvestors(prev => prev.filter(inv => inv.id !== id));

      if (!isFirebasePlaceholder) {
        const invRef = doc(db, 'workspaces', workspaceId, 'investors', id);
        await deleteDoc(invRef);
      }

      showToast('Investor record removed.', 'success');
      autoPushActionToDb('Delete Investor', workspaceId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to delete investor' };
    }
  };

  const addLedgerTransaction = async (tx: Omit<LedgerTransaction, 'id'>): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      const workspaceId = tx.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';
      const newId = `tx_${Date.now()}`;
      const fullTx: LedgerTransaction = {
        id: newId,
        ...tx,
        workspaceId
      };

      setLedgerTransactions(prev => [fullTx, ...prev]);

      if (!isFirebasePlaceholder) {
        const txRef = doc(db, 'workspaces', workspaceId, 'ledger', newId);
        await setDoc(txRef, fullTx);
      }

      autoPushActionToDb('Add Ledger Transaction', workspaceId);
      return { success: true, id: newId };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to record transaction' };
    }
  };

  const requestShareDisposal = async (request: Omit<ShareDisposalRequest, 'id' | 'status' | 'dateRequested'>): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      const workspaceId = request.workspaceId || activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

      const newId = `disp_${Date.now()}`;
      const newRequest: ShareDisposalRequest = {
        id: newId,
        ...request,
        workspaceId,
        status: 'Pending',
        dateRequested: new Date().toISOString().split('T')[0]
      };

      setShareDisposals(prev => [newRequest, ...prev]);

      if (!isFirebasePlaceholder) {
        const dispRef = doc(db, 'workspaces', workspaceId, 'share_disposals', newId);
        await setDoc(dispRef, newRequest);
      }

      showToast('Share disposal request submitted to Board.', 'success');
      autoPushActionToDb('Request Share Disposal', workspaceId);
      return { success: true, id: newId };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to submit disposal request' };
    }
  };

  const executeShareDisposal = async (id: string, action: 'Approve' | 'Reject'): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspaceId = activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

      const target = shareDisposals.find(d => d.id === id);
      if (!target) return { success: false, error: 'Disposal request not found.' };

      const newStatus = action === 'Approve' ? 'Approved' : 'Rejected';
      setShareDisposals(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));

      if (!isFirebasePlaceholder) {
        const dispRef = doc(db, 'workspaces', workspaceId, 'share_disposals', id);
        await updateDoc(dispRef, { status: newStatus });
      }

      if (action === 'Approve') {
        // Deduct shares from investor
        setInvestors(prev => prev.map(inv => {
          if (inv.id === target.investorId) {
            const remainingShares = Math.max(0, inv.sharesCount - target.sharesToDispose);
            return { ...inv, sharesCount: remainingShares };
          }
          return inv;
        }));

        // Log disposal in ledger
        const txId = `tx_${Date.now()}`;
        const lastBalance = ledgerTransactions.length > 0 ? ledgerTransactions[0].balanceAfter : 72706;
        const totalPayout = target.totalOfferAmount || (target.sharesToDispose * target.suggestedPricePerShare);
        const ledgerEntry: LedgerTransaction = {
          id: txId,
          workspaceId,
          type: 'Capex',
          amount: -totalPayout,
          date: new Date().toISOString(),
          recordedBy: currentUser?.name || 'Board Director',
          category: 'Share Buyback / Disposal',
          referenceDocId: target.id,
          balanceAfter: lastBalance - totalPayout,
          description: `Disposal of ${target.sharesToDispose.toLocaleString()} shares at approved price of $${(target.suggestedPricePerShare || 0).toFixed(2)}/share. Total: $${totalPayout.toLocaleString()}. Reason: ${target.reason || 'Liquidity'}`
        };

        setLedgerTransactions(prev => [ledgerEntry, ...prev]);

        if (!isFirebasePlaceholder) {
          const txRef = doc(db, 'workspaces', workspaceId, 'ledger', txId);
          await setDoc(txRef, ledgerEntry);
        }
      }

      showToast(`Share disposal request marked as ${newStatus}.`, 'success');
      autoPushActionToDb('Execute Share Disposal', workspaceId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to process disposal' };
    }
  };

  const reinjectCapital = async (investorId: string, amount: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspaceId = activeWorkspace?.id || currentUser?.workspaceId || 'ws_vakzim';

      const inv = investors.find(i => i.id === investorId);
      if (!inv) return { success: false, error: 'Investor not found.' };

      // Calculate new shares based on current share price
      const pricePerShare = inv.sharesCount > 0 ? (inv.contributionAmount / inv.sharesCount) : 2.50;
      const additionalShares = Math.max(1, Math.round(amount / pricePerShare));

      const updatedContributionAmount = inv.contributionAmount + amount;
      const updatedSharesCount = inv.sharesCount + additionalShares;

      setInvestors(prev => prev.map(item => item.id === investorId ? {
        ...item,
        contributionAmount: updatedContributionAmount,
        sharesCount: updatedSharesCount,
        currentMonetaryValue: (item.currentMonetaryValue || item.contributionAmount) + amount
      } : item));

      if (!isFirebasePlaceholder) {
        const invRef = doc(db, 'workspaces', workspaceId, 'investors', investorId);
        await updateDoc(invRef, {
          contributionAmount: updatedContributionAmount,
          sharesCount: updatedSharesCount,
          currentMonetaryValue: (inv.currentMonetaryValue || inv.contributionAmount) + amount
        });
      }

      // Add to ledger
      const txId = `tx_${Date.now()}`;
      const lastBalance = ledgerTransactions.length > 0 ? ledgerTransactions[0].balanceAfter : 72706;
      const ledgerEntry: LedgerTransaction = {
        id: txId,
        workspaceId,
        type: 'CapitalReinjection',
        amount,
        date: new Date().toISOString(),
        recordedBy: currentUser?.name || 'Workspace Master',
        category: 'Equity Financing',
        balanceAfter: lastBalance + amount,
        description: `Capital reinjection of $${amount.toLocaleString()} by ${inv.name} adding ${additionalShares.toLocaleString()} shares at $${(pricePerShare || 0).toFixed(2)}/share.`
      };

      setLedgerTransactions(prev => [ledgerEntry, ...prev]);

      if (!isFirebasePlaceholder) {
        const txRef = doc(db, 'workspaces', workspaceId, 'ledger', txId);
        await setDoc(txRef, ledgerEntry);
      }

      showToast(`Capital reinjection of $${amount.toLocaleString()} processed.`, 'success');
      autoPushActionToDb('Reinject Capital', workspaceId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to reinject capital' };
    }
  };

  const isPlatformAppOwner = useMemo(() => {
    if (!currentUser) return false;
    const isDeveloperEmail = currentUser.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    return currentUser.role === 'AppOwner' || isDeveloperEmail;
  }, [currentUser]);

  const visibleUsers = useMemo(() => {
    if (!currentUser) return [];
    if (isPlatformAppOwner) return users;
    const wsId = currentUser.workspaceId || activeWorkspace?.id;
    if (!wsId) return users;
    return users.filter(u => {
      if (u.workspaceId && u.workspaceId === wsId) return true;
      if (activeWorkspace?.agentIds?.includes(u.uid)) return true;
      if (isAgentAccount(u)) {
        if (!u.workspaceId || u.workspaceId === 'system' || u.workspaceId === 'ws_vakzim') return true;
      }
      if (u.created_by_admin && u.created_by_admin === currentUser.uid) return true;
      if (!u.workspaceId) return true;
      return false;
    });
  }, [users, currentUser, activeWorkspace?.id, activeWorkspace?.agentIds, isPlatformAppOwner]);

  const visibleVouchers = useMemo(() => {
    if (!currentUser) return [];
    const isDeveloperEmail = currentUser.email?.toLowerCase()?.trim() === 'karimazondomike049@gmail.com';
    const isOwner = currentUser.role === 'AppOwner' || isDeveloperEmail;

    // AppOwner without selected workspace sees all vouchers
    if (isOwner && !selectedWorkspaceId && !activeWorkspace) {
      return vouchers;
    }

    const wsId = activeWorkspace?.id || currentUser.workspaceId || selectedWorkspaceId;
    if (!wsId && !isOwner) return [];
    if (!wsId && isOwner) return vouchers;

    return vouchers.filter(v => {
      // If current user is an Agent, always show vouchers assigned to or sold by this agent
      if (currentUser.role === 'Agent') {
        const cleanName = (currentUser.name || '').toLowerCase().trim();
        const cleanEmail = (currentUser.email || '').toLowerCase().trim();
        const uids = new Set<string>([currentUser.uid]);
        if (cleanName.includes('histec') || cleanEmail.includes('histec') || currentUser.uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || currentUser.uid === 'agent_histec_training') {
          uids.add('agent_histec_training');
          uids.add('OIofBo6j6jV6qM0oRRxVFwpucfP2');
        }
        if (cleanName.includes('mukondodzi') || cleanEmail.includes('mukondodzi') || currentUser.uid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2') {
          uids.add('6ih4NtJnXUeNtt1z0orVHZGkQuv2');
        }
        if (cleanName.includes('chitsungo') || cleanEmail.includes('chitsungo') || currentUser.uid === '7QFBnEU9XxalOI6kl8csoTm58tE2') {
          uids.add('7QFBnEU9XxalOI6kl8csoTm58tE2');
        }

        const vAgentId = v.assignedAgentId || '';
        const vAgentName = (v.assignedAgentName || (v as any).assignedTo || '').toLowerCase().trim();
        const vAgentEmail = (v.assignedAgentEmail || (v as any).agentEmail || '').toLowerCase().trim();

        const isMatch = uids.has(vAgentId) ||
          (cleanName && vAgentName && (cleanName === vAgentName || cleanName.includes(vAgentName) || vAgentName.includes(cleanName))) ||
          (cleanEmail && vAgentEmail && cleanEmail === vAgentEmail) ||
          ((cleanName.includes('histec') || cleanEmail.includes('histec') || currentUser.uid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2') && (vAgentName.includes('histec') || vAgentEmail.includes('histec') || vAgentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || vAgentId === 'agent_histec_training' || vAgentId.toLowerCase().includes('histec')));

        if (isMatch) return true;
      }

      const vWs = resolveVoucherWorkspaceId(v, wsId);
      return vWs === wsId;
    });
  }, [vouchers, currentUser, activeWorkspace?.id, selectedWorkspaceId]);

  const visibleRequests = useMemo(() => {
    if (!currentUser) return [];
    if (isPlatformAppOwner && !selectedWorkspaceId && !activeWorkspace) return requests;
    const wsId = activeWorkspace?.id || currentUser.workspaceId || selectedWorkspaceId;
    return requests.filter(r => {
      const rWs = (r as any).workspaceId;
      if (wsId && rWs === wsId) return true;
      if (currentUser.role === 'Agent') {
        if (r.agentId === currentUser.uid) return true;
        const cleanName = (currentUser.name || '').toLowerCase().trim();
        const cleanEmail = (currentUser.email || '').toLowerCase().trim();
        const rName = (r.agentName || '').toLowerCase().trim();
        if (cleanName && rName && (cleanName === rName || cleanName.includes(rName) || rName.includes(cleanName))) return true;
        if (cleanEmail && (r as any).agentEmail && (r as any).agentEmail.toLowerCase().trim() === cleanEmail) return true;
        if ((cleanName.includes('histec') || cleanEmail.includes('histec')) && rName.includes('histec')) return true;
      }
      return !rWs || rWs === 'ws_vakzim' || !wsId;
    });
  }, [requests, currentUser, activeWorkspace?.id, selectedWorkspaceId, isPlatformAppOwner]);

  const visibleCashDrops = useMemo(() => {
    if (!currentUser) return [];
    if (isPlatformAppOwner && !selectedWorkspaceId && !activeWorkspace) return cashDrops;
    const wsId = activeWorkspace?.id || currentUser.workspaceId || selectedWorkspaceId;
    return cashDrops.filter(cd => {
      const cdWs = (cd as any).workspaceId;
      if (wsId && cdWs === wsId) return true;
      if (currentUser.role === 'Agent') {
        if (cd.agentId === currentUser.uid) return true;
        const cleanName = (currentUser.name || '').toLowerCase().trim();
        const cleanEmail = (currentUser.email || '').toLowerCase().trim();
        const cdName = (cd.agentName || '').toLowerCase().trim();
        if (cleanName && cdName && (cleanName === cdName || cleanName.includes(cdName) || cdName.includes(cleanName))) return true;
        if (cleanEmail && (cd as any).agentEmail && (cd as any).agentEmail.toLowerCase().trim() === cleanEmail) return true;
        if ((cleanName.includes('histec') || cleanEmail.includes('histec')) && cdName.includes('histec')) return true;
      }
      return !cdWs || cdWs === 'ws_vakzim' || !wsId;
    });
  }, [cashDrops, currentUser, activeWorkspace?.id, selectedWorkspaceId, isPlatformAppOwner]);

  const visibleLegacyDevices = useMemo(() => {
    if (!currentUser) return [];
    if (isPlatformAppOwner && !selectedWorkspaceId && !activeWorkspace) return legacyDevices;
    const wsId = activeWorkspace?.id || currentUser.workspaceId || selectedWorkspaceId;
    if (!wsId) return [];
    return legacyDevices.filter(ld => resolveLegacyDeviceWorkspaceId(ld) === wsId);
  }, [legacyDevices, currentUser, activeWorkspace?.id, selectedWorkspaceId, isPlatformAppOwner]);

  const visibleReversalRequests = useMemo(() => {
    if (!currentUser) return [];
    if (isPlatformAppOwner && !selectedWorkspaceId && !activeWorkspace) return reversalRequests;
    const wsId = activeWorkspace?.id || currentUser.workspaceId || selectedWorkspaceId;
    return reversalRequests.filter(r => {
      const rWs = (r as any).workspaceId;
      if (wsId && rWs === wsId) return true;
      if (currentUser.role === 'Agent') {
        if (r.agentId === currentUser.uid) return true;
        const cleanName = (currentUser.name || '').toLowerCase().trim();
        const cleanEmail = (currentUser.email || '').toLowerCase().trim();
        const rName = (r.agentName || '').toLowerCase().trim();
        if (cleanName && rName && (cleanName === rName || cleanName.includes(rName) || rName.includes(cleanName))) return true;
        if (cleanEmail && r.agentEmail && r.agentEmail.toLowerCase().trim() === cleanEmail) return true;
        if ((cleanName.includes('histec') || cleanEmail.includes('histec')) && rName.includes('histec')) return true;
      }
      return !rWs || rWs === 'ws_vakzim' || !wsId;
    });
  }, [reversalRequests, currentUser, activeWorkspace?.id, selectedWorkspaceId, isPlatformAppOwner]);

  const visibleCustomers = useMemo(() => {
    if (!currentUser) return [];
    const wsId = activeWorkspace?.id || currentUser.workspaceId || selectedWorkspaceId || 'ws_client_1788646327740';
    return customers.filter(c => {
      if (!c || !c.name || isPlaceholderOrWalkInClient(c.name)) return false;
      const cWs = resolveCustomerWorkspaceId(c, wsId);
      if (cWs !== wsId) return false;
      const savedBy = c.savedByName || c.savedByUserId || c.createdByName || c.createdByUserId || c.lastAgentName;
      if (savedBy && !isMemberOfWorkspace(savedBy, wsId)) {
        return false;
      }
      return true;
    });
  }, [customers, currentUser, activeWorkspace?.id, selectedWorkspaceId]);

  const visibleFeedback = useMemo(() => {
    if (!currentUser) return [];
    if (isPlatformAppOwner) return feedback;
    const wsId = currentUser.workspaceId || activeWorkspace?.id;
    if (!wsId) return [];
    return feedback.filter(fb => (fb as any).workspaceId === wsId);
  }, [feedback, currentUser, activeWorkspace?.id, isPlatformAppOwner]);

  const activeNotifications = useMemo(() => {
    const dynamicNotifs: SystemNotification[] = [];
    const isUserAdmin = isWorkspaceMasterAccount(currentUser) || isAppOwnerAccount(currentUser);

    // 1. Admin notifications (Lease expiry, etc.)
    if (isUserAdmin) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      visibleLegacyDevices.forEach(ld => {
        if (!ld.expiresAt || ld.status === 'CANCELLED') return;
        
        const expiresAtTime = new Date(ld.expiresAt).getTime();
        const expiresDate = new Date(ld.expiresAt);
        const startOfExpiry = new Date(expiresDate.getFullYear(), expiresDate.getMonth(), expiresDate.getDate()).getTime();
        const calendarDaysDiff = Math.round((startOfExpiry - startOfToday) / (24 * 60 * 60 * 1000));
        
        const timeDiff = expiresAtTime - Date.now();
        const daysDiff = Math.ceil(timeDiff / (24 * 60 * 60 * 1000));

        // 1. Notification of expiry to the admin will show 3 days before expiry
        if (calendarDaysDiff === 3 || daysDiff === 3 || (daysDiff <= 3 && daysDiff >= 1)) {
          dynamicNotifs.push({
            id: `expiry_3d_${ld.id}`,
            message: `🚨 LEASE WARNING: Device "${ld.deviceNameModel}" (MAC: ${ld.macAddress}) for ${ld.customerName} is expiring in 3 days. Prepare for unenrolment!`,
            senderName: 'System Monitor',
            timestamp: new Date(expiresAtTime - 3 * 24 * 60 * 60 * 1000).toISOString(),
            location: 'Global'
          });
        }

        // 2. Notification of expiry to the admin on the day of expiry (and if lease actually expired)
        const isActuallyExpired = ld.expiresAt 
          ? (calendarDaysDiff <= 0 || daysDiff <= 0 || timeDiff <= 0)
          : (ld.status === 'EXPIRED');

        if (isActuallyExpired) {
          dynamicNotifs.push({
            id: `expiry_now_${ld.id}`,
            message: `🚨 LEASE EXPIRED: Device "${ld.deviceNameModel}" (MAC: ${ld.macAddress}) for ${ld.customerName} has reached expiry today. Please unenrol immediately!`,
            senderName: 'System Monitor',
            timestamp: ld.expiresAt,
            location: 'Global'
          });
        }
      });
    }

    // 2. Agent notifications (Sales cycle final day reminder, permissible cash close notice, admin cash close request)
    if (currentUser?.role === 'Agent') {
      const agentId = currentUser.uid;
      const settings = activeWorkspace?.cashCloseSettings || cashCloseSettings || DEFAULT_CASH_CLOSE_SETTINGS;
      const agentOverride = settings.agentOverrides?.[agentId];
      const allowedDays = agentOverride?.allowedDaysBeforeMonthEnd ?? settings.allowedDaysBeforeMonthEnd ?? 2;
      const daysRemaining = getDaysUntilMonthEnd(new Date());

      // Check if admin requested a cash close from this agent
      const pendingAdminDrop = visibleCashDrops.find(
        cd => cd.agentId === agentId && cd.status === 'Pending' && cd.requestedBy === 'WorkspaceMaster'
      );
      const hasAdminRequest = !!pendingAdminDrop || !!agentOverride?.isCashCloseRequested;

      if (hasAdminRequest) {
        const reqAmount = pendingAdminDrop?.amount ?? agentOverride?.requestedAmount;
        dynamicNotifs.push({
          id: `cash_close_req_${agentId}`,
          message: `🚨 CASH CLOSE REQUESTED: Administrator has requested an immediate cash close${reqAmount ? ` of $${(reqAmount || 0).toFixed(2)}` : ''}. Please review and confirm your cash close now.`,
          senderName: 'Workspace Master',
          timestamp: pendingAdminDrop?.timestamp || agentOverride?.requestedAt || new Date().toISOString(),
          location: currentUser.location || 'POS Station'
        });
      }

      // Final day of the sales cycle reminder: "Agent to be reminded by the system to cash close on the final day of the month"
      if (daysRemaining === 0) {
        dynamicNotifs.push({
          id: `sales_cycle_final_day_${agentId}`,
          message: `🔔 FINAL DAY OF SALES CYCLE: Today is the final day of the month! Please complete your final cash close to start a fresh sales cycle for next month. Any remaining cash & equivalent commission will carry over.`,
          senderName: 'System Scheduler',
          timestamp: new Date().toISOString(),
          location: currentUser.location || 'POS Station'
        });
      }
    }

    // Filter notifications using strict notification policy:
    // Only broadcasts marked for ALL users show to all users.
    // Personal notifications (revocations, approvals, declines) show strictly to the concerned recipient.
    // Administrative notices show only to admins.
    const filteredNotifications = notifications.filter(n => isNotificationVisibleToUser(n, currentUser));

    const merged = [...dynamicNotifs, ...filteredNotifications];
    const seen = new Set<string>();
    const deduplicated = merged.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });

    // Make the latest message show first!
    return deduplicated.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [notifications, visibleLegacyDevices, currentUser, visibleCashDrops, activeWorkspace?.cashCloseSettings, cashCloseSettings]);

  return (
    <AppContext.Provider value={{
      latestDbPushMetricsMirror,
      isAuthoritativeDataReady,
      captureClientMetricsSnapshot,
      theme,
      toggleTheme,
      activeThemeId,
      setActiveThemeId,
      showSplash,
      setShowSplash,
      currentUser,
      currentRole,
      setCurrentRole,
      activeWorkspace,
      workspaces: visibleWorkspaces,
      workspacesRecordedCount,
      agentsRecordedCount,
      users: visibleUsers,
      setUsers,
      vouchers: visibleVouchers,
      requests: visibleRequests,
      reversalRequests: visibleReversalRequests,
      requestTransactionReversal,
      approveTransactionReversal,
      rejectTransactionReversal,
      cancelTransactionReversal,
      cancelTransaction,
      cashDrops: visibleCashDrops,
      legacyDevices: visibleLegacyDevices,
      notifications: activeNotifications,
      readNotificationIds,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      feedback: visibleFeedback,
      customers: visibleCustomers,
      leaderboardSummary,
      loyaltySettings,
      updateLoyaltySettings,
      giveawaySettings,
      updateGiveawaySettings,
      cashCloseSettings,
      updateCashCloseSettings,
      updateAgentCashCloseSchedule,
      requestAgentCashClose,
      captivePortalUrls,
      updateCaptivePortalUrls,
      addCaptivePortalUrl,
      editCaptivePortalUrl,
      deleteCaptivePortalUrl,
      setDefaultCaptivePortalUrl,
      togglePlanFreeStatus,
      markVouchersFreeBulk,
      executeFreeGiveaway,
      updateWorkspaceTelephoneCode,
      addOrUpdateCustomer,
      deleteCustomer,
      updateCustomerStreak,
      bulkAddCustomers,
      restoreCustomerRegistryFromPrePush,
      investors,
      shareholdingGovernance,
      ledgerTransactions,
      shareDisposals,
      updateShareholdingGovernance,
      addInvestor,
      updateInvestor,
      deleteInvestor,
      addLedgerTransaction,
      requestShareDisposal,
      executeShareDisposal,
      reinjectCapital,
      switchUser,
      isLoggedIn,
      loading,
      initialized,
      globalLoading,
      isWorkspaceMetadataLoaded,
      isMetricsSyncing,
      loginUser,
      loginWithGoogle,
      loginWithBiometrics,
      logoutUser,
      isWorkspaceUnlocked,
      unlockWorkspace,
      unlockWithBiometrics,
      lockWorkspace,
      isAppOwnerUnlocked,
      unlockAppOwner,
      lockAppOwner,
      censorImage,
      syncWithServerBridge,
      pushPendingChanges,
      forcePushLocalToGlobalDB,
      downloadWorkspaceSnapshot,
      restoreWorkspaceSnapshot,
      isSnapshotModalOpen,
      setIsSnapshotModalOpen,
      openSnapshotModal,
      uploadVouchers,
      assignVouchersToAgent,
      revokeVoucherAllocation,
      completeSale,
      submitVoucherRequest,
      fulfillVoucherRequest,
      declineVoucherRequest,
      deleteVoucherRequest,
      updateVoucherRequest,
      submitCashDrop,
      fulfillAdminCashDropRequest,
      reconcileCashDrop,
      declineCashDrop,
      submitLegacyDevice,
      approveLegacyDevice,
      cancelLegacyDeviceEnrollment,
      declineLegacyDeviceEnrollment,
      requestLegacyDeviceDeletion,
      cancelLegacyDeviceDeletionRequest,
      deleteLegacyDevice,
      updateLegacyDeviceLeaseExpiry,
      requestLegacyDeviceRenewal,
      approveLegacyDeviceRenewal,
      declineLegacyDeviceRenewal,
      cancelLegacyDeviceRenewalRequest,
      updateCaptivePortalUrl,
      markLegacyDeviceSold,
      simulateExpiredDeviceAlert,
      deleteVoucher,
      updateVoucher,
      renameVoucherPlan,
      deleteVoucherPlan,
      editReceipt,
      bulkDeleteVouchers,
      bulkUpdateVouchers,
      addNotification,
      updateNotification,
      deleteNotification,
      submitFeedback,
      replyToFeedback,
      updateUserProfile,
      requestPasswordResetOtp,
      resetPasswordWithOtp,
      createWorkspace,
      createWorkspaceAdmin,
      createAgent,
      requestedRole,
      setRequestedRole: handleSetRequestedRole,
      selfRegisterWorkspace,
      onboardWorkspace,
      deleteWorkspace,
      updateWorkspaceSubscription,
      updateWorkspaceName,
      updateWorkspaceDetails,
      toggleWorkspaceSuspension,
      resetWorkspaceMasterPassword,
      addUserByMaster,
      editUserByMaster,
      deleteUserByMaster,
      clearAllLocalData,
      pricingPackages,
      updatePricingPackages,
      exportWorkspaceData,
      importWorkspaceData,
      toast,
      showToast,
      isLiveRefresh,
      setIsLiveRefresh,
      toggleLiveRefresh,
      refetchData,
      isRefetching,
      isPushingToDb,
      pendingMutationsCount,
      serverAuthoritativeMetrics,
      dispatchRecordMutated,
      lastRefreshedAt,
      refreshCountdown,
      auditLogs,
      logAuditAction,
      cleanupOrphanedAccounts: async (targetEmail?: string, dryRun?: boolean) => {
        const result = await cleanupOrphanedAccounts(targetEmail, dryRun);
        if (result.success && !dryRun && (result.purgedAuthCount > 0 || result.purgedDocCount > 0)) {
          logAuditAction({
            category: 'credential',
            action: 'CREDENTIALS_PURGED',
            title: 'Orphaned Accounts Cleaned Up',
            description: `Programmatically purged ${result.purgedAuthCount} orphaned Auth user(s) and ${result.purgedDocCount} orphaned Firestore doc(s). Target: ${targetEmail || 'System-wide'}.`,
            targetEmail: targetEmail || undefined,
            metadata: {
              purgedAuthCount: result.purgedAuthCount,
              purgedDocCount: result.purgedDocCount,
              mode: result.mode
            }
          }).catch(() => {});
        }
        return result;
      },
      reconcileAndHealAccounts: async (targetEmail?: string, dryRun?: boolean) => {
        const result = await reconcileShadowAccounts(targetEmail, dryRun);
        if (result.success && !dryRun && (result.reconciledCount > 0 || result.purgedShadowDocsCount > 0)) {
          logAuditAction({
            category: 'credential',
            action: 'CREDENTIALS_PURGED',
            title: 'Shadow Accounts Reconciled & Purged',
            description: `Reconciled ${result.reconciledCount} account(s), re-assigned ${result.reassignedVouchersCount} voucher(s), purged ${result.purgedShadowDocsCount} shadow doc(s). Target: ${targetEmail || 'System-wide'}.`,
            targetEmail: targetEmail || undefined,
            metadata: {
              reconciledCount: result.reconciledCount,
              reassignedVouchersCount: result.reassignedVouchersCount,
              purgedShadowDocsCount: result.purgedShadowDocsCount
            }
          }).catch(() => {});
          // Trigger data refetch to update all components and state immediately
          refetchData().catch(() => {});
        }
        return result;
      },
      selectedWorkspaceId,
      setSelectedWorkspaceId: handleSetSelectedWorkspaceId,
      recycleBin,
      accountBackups,
      configuredBackupEmail,
      setConfiguredBackupEmail,
      buildAccountDbSnapshot,
      createAccountBackup,
      restoreAccountFromSnapshot,
      deletePermanentlyFromBin,
      deleteAccountBackup,
      emailDbFile,
      sendAllBinContentsByEmail,
      fullDatabaseBackups,
      backupInterval,
      setBackupInterval,
      createFullDatabaseBackup,
      deleteFullDatabaseBackup,
      restoreFullDatabaseBackup,
      workspaceBackups,
      entireAppBackups,
      appBackupConfig,
      updateAppBackupConfig,
      triggerWriteBackup,
      restoreWorkspaceFromBackup,
      restoreEntireAppFromBackup,
      createManualWorkspaceBackup,
      createManualEntireAppBackup,
      exportWorkspaceBackup,
      exportEntireAppBackup,
      importAndRestoreWorkspaceBackup,
      importAndRestoreEntireAppBackup
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
