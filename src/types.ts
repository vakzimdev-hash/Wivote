export type Role = 'AppOwner' | 'WorkspaceMaster' | 'Agent' | 'Admin' | 'Investor';
export type SubscriptionTier = 'Starter' | 'Gold' | 'Lithium';
export type VoucherStatus = 'Unused' | 'Assigned' | 'Sold' | 'unused' | 'assigned' | 'sold';
export type RequestStatus = 'Pending' | 'Fulfilled' | 'Declined';
export type CashDropStatus = 'Pending' | 'Reconciled' | 'Approved';

export interface CaptivePortalUrlItem {
  id: string;
  name: string;
  url: string;
  networkName?: string;
  location?: string;
  notes?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workspace {
  id: string;
  name: string;
  subscriptionTier: SubscriptionTier;
  isActive: boolean;
  trialStartDate?: string;
  expiresAt?: string;
  ownerId: string; // WorkspaceMaster user ID
  ownerEmail?: string;
  ownerUid?: string;
  loyaltySettings?: LoyaltySettings;
  giveawaySettings?: GiveawaySettings;
  enforceCustomerDetailsOnSale?: boolean;
  agentIds?: string[];
  investmentSettings?: ShareholdingGovernance;
  telephoneCode?: string;
  cashCloseSettings?: WorkspaceCashCloseSettings;
  captivePortalUrl?: string;
  captivePortalUrls?: CaptivePortalUrlItem[];
}

export interface AgentCashCloseSchedule {
  agentId: string;
  allowedDaysBeforeMonthEnd?: number; // e.g. 2 days before month end
  minCashCloseAmount?: number; // minimum amount that can be cash closed
  commissionRate?: number; // percentage, e.g. 10
  customSchedule?: 'end_of_month' | 'biweekly' | 'custom_day' | 'anytime';
  customCloseDay?: number; // day of month, e.g. 28
  isCashCloseRequested?: boolean;
  requestedAt?: string;
  requestedNotes?: string;
  requestedAmount?: number;
  maxClosesPerCycle?: number | null; // e.g. 1, 2, 3... or null/undefined for workspace default
  requirePrevCycleAttachment?: 'default' | 'mandatory' | 'optional'; // per-agent override
}

export interface WorkspaceCashCloseSettings {
  allowedDaysBeforeMonthEnd: number; // default: 2 (permissible to cash close 2 days before the end of the month)
  minCashCloseAmount: number; // default: 10
  defaultCommissionRate: number; // default: 10
  remindFinalDay: boolean; // default: true (agent reminded on final day of month)
  autoCarryover: boolean; // default: true (remaining cash & commission carried over to new cycle)
  agentOverrides: Record<string, AgentCashCloseSchedule>;
  giveawaySettings?: GiveawaySettings;
  maxClosesPerCycle?: number | null; // null/undefined or 0 for unlimited, or e.g. 1, 2, 3, 4, 5
  allowAnytimeCloses?: boolean; // default true: removes strict end of month only restriction
  prevCycleAttachmentMode?: 'optional' | 'mandatory'; // default 'optional'
}

export interface AgentSalesCycleMetrics {
  agentId: string;
  agentName: string;
  agentLocation?: string;
  cycleMonth: string; // e.g. "2026-09"
  cashCollected: number; // total cash collected this cycle
  commissionRate: number; // percentage (e.g. 10)
  commissionEarned: number; // cashCollected * (rate / 100)
  closedCash: number; // reconciled / confirmed cash closed
  closedCommission: number; // commission matching closed cash
  remainingCash: number; // remaining cash (carried over to new cycle)
  remainingCommission: number; // equivalent remaining commission (carried over)
  minCashCloseAmount: number;
  allowedDaysBeforeMonthEnd: number;
  daysUntilMonthEnd: number;
  isPermissibleNow: boolean;
  isFinalDay: boolean;
  permissibleOpensDate: string;
  hasAdminRequest: boolean;
  adminRequestAmount?: number;
  adminRequestNotes?: string;
  isFinalCashCloseDone?: boolean;
  hasPendingApproval?: boolean;
  hasApprovedDrop?: boolean;
  approvedCash?: number;
  pendingCash?: number;
  prevCycleMonth?: string;
  prevMonthOverallSales?: number;
  prevMonthCommission?: number;
  prevMonthClosedCash?: number;
  prevMonthTodaySales?: number;
  unclosedCashFromPrevCycle?: number; // unclosed cash from last sales cycle
  hasUnclosedCashFromPrevCycle?: boolean; // true if agent has unclosed cash from last cycle
  prevCycleUnclosedAttachedStatus?: 'none' | 'pending' | 'closed';
  unclosedCommissionFromPrevCycle?: number; // equivalent agent commission for unclosed cash from previous cycle
  attachedPrevCycleCommission?: number; // equivalent agent commission attached to cash close
  lifetimeClosedCash?: number; // all-time reconciled closed cash for agent
  currentCycleClosesCount?: number; // count of cash closes initiated/completed in current cycle
  maxClosesPerCycle?: number | null; // max permitted closes in cycle
  closesRemaining?: number | null; // remaining permitted closes in this cycle
  dailySalesTotal?: number; // sales made today (current calendar day)
  overallSales?: number; // all-time cumulative sales across all cycles
  prevCycleAttachmentMode?: 'optional' | 'mandatory'; // effective attachment policy
}

export interface WorkspaceSalesCycleAggregate {
  cycleMonth: string;
  totalCashCollected: number;
  totalClosedCash: number;
  totalRemainingCash: number;
  totalCommissionEarned: number;
  totalClosedCommission: number;
  totalRemainingCommission: number;
  totalUnclosedPrevCycle?: number;
  agentMetrics: AgentSalesCycleMetrics[];
  daysUntilMonthEnd: number;
  isFinalDay: boolean;
  allowedDaysBeforeMonthEnd: number;
}

export const DEFAULT_CASH_CLOSE_SETTINGS: WorkspaceCashCloseSettings = {
  allowedDaysBeforeMonthEnd: 2,
  minCashCloseAmount: 10,
  defaultCommissionRate: 10,
  remindFinalDay: true,
  autoCarryover: true,
  agentOverrides: {},
  maxClosesPerCycle: null,
  allowAnytimeCloses: true,
  prevCycleAttachmentMode: 'optional'
};

export interface GiveawaySettings {
  isEnabled: boolean; // Master toggle to turn gifting / free vouchers on or off
  dailyLimitPerAgent: number; // Max giveaways allowed per agent per day (e.g. 5)
  freePlanNames: string[]; // List of plan names marked as free giveaway plans
  allowCustomGiftVouchers?: boolean; // Whether individual vouchers can be marked free
  notes?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  cellNumber: string;
  role: Role;
  workspaceId: string;
  name: string;
  profilePic?: string; // Data URL or base64
  location?: string; // Designated operating territory / geographic location
  performanceScore?: number; // accumulated sales amount for actual leader board
  isDeactivated?: boolean;
  status?: string;
  isActive?: boolean;
  password?: string;
  requirePasswordChange?: boolean;
  initialPassword?: string;
  createdById?: string;
  created_by_admin?: string;
  targetAmount?: number;
  commissionRate?: number; // percentage (e.g. 10 for 10%)
  investorStakeId?: string;
}

export interface Voucher {
  id: string;
  code: string;
  plan: string; // e.g. "1 Hour", "Daily", "Monthly"
  price: number;
  duration: string;
  location: string;
  status: VoucherStatus;
  workspaceId?: string;
  networkName?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  assignedTo?: string;
  assignedAt?: string;
  soldAt?: string;
  soldByAgentId?: string;
  soldByAgentName?: string;
  createdAt?: string;
  soldPrice?: number;
  customerName?: string;
  customerCell?: string;
  customerId?: string;
  customerNumber?: string;
  discountApplied?: number;
  originalPrice?: number;
  loyaltyNotice?: string;
  archived?: boolean;
  archivedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
  isFree?: boolean;
  giftedAt?: string;
  giftedByAgentId?: string;
  giftedByAgentName?: string;
  isDirty?: boolean;
  syncStatus?: 'pending' | 'synced' | 'failed';
  updatedAt?: string;
  timestamp?: string;
  reversalRequested?: boolean;
  reversalRequestId?: string;
  reversalReason?: string;
  reversalRequestedAt?: string;
  reversalRequestedBy?: string;
  reversalStatus?: ReversalRequestStatus;
  reversedAt?: string;
  reversedBy?: string;
}

export type ReversalTransactionType = 'voucher' | 'legacy_device';
export type ReversalRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Resold';

export interface TransactionReversalRequest {
  id: string;
  workspaceId: string;
  transactionType: ReversalTransactionType;
  transactionId: string; // voucher id or legacy device id
  referenceCode: string; // voucher code or MAC address / model
  planOrModel: string;
  amount: number;
  customerName?: string;
  customerCell?: string;
  customerId?: string;
  customerNumber?: string;
  agentId: string;
  agentName: string;
  agentEmail?: string;
  reason: string;
  status: ReversalRequestStatus | 'Resold';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  approvedAt?: string;
  adminNotes?: string;
  isResold?: boolean;
  resoldAt?: string;
}

export interface VoucherRequest {
  id: string;
  agentId: string;
  agentName: string;
  plan: string;
  quantity: number;
  location: string;
  status: RequestStatus;
  timestamp: string;
  workspaceId?: string;
}

export interface CashDrop {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail?: string;
  amount: number;
  status: CashDropStatus;
  timestamp: string;
  requestedBy: 'Agent' | 'WorkspaceMaster';
  workspaceId?: string;
  notes?: string;
  cycleMonth?: string;
  commissionRate?: number;
  matchedCommission?: number;
  remainingCashCarriedOver?: number;
  remainingCommissionCarriedOver?: number;
  approvedAt?: string;
  approvedBy?: string;
  attachedPrevCycleUnclosedCash?: number;
  attachedPrevCycleMonth?: string;
  attachedPrevCycleCommission?: number; // Equivalent agent commission amount for attached unclosed cash
  currentCycleCommission?: number;
}

export interface LegacyDevice {
  id: string;
  customerName: string;
  customerId?: string;
  customerNumber?: string;
  customerCell?: string;
  deviceNameModel: string;
  macAddress: string;
  monthlyPrice: number;
  discountApplied?: number;
  soldPrice?: number;
  fieldAgentId: string;
  fieldAgentName: string;
  fieldAgentEmail?: string;
  workspaceId?: string;
  isApproved: boolean;
  addedToInventory: boolean;
  status: 'PENDING' | 'APPROVED' | 'SOLD' | 'EXPIRED' | 'CANCELLED';
  enrolledAt?: string;
  approvedAt?: string;
  leaseDurationDays?: number;
  expiresAt?: string;
  soldAt?: string;
  deletionRequested?: boolean;
  deletionRequestedAt?: string;
  deletionRequestedBy?: string;
  deletionReason?: string;
  reversalRequested?: boolean;
  reversalRequestId?: string;
  reversalReason?: string;
  reversalRequestedAt?: string;
  reversalRequestedBy?: string;
  reversalStatus?: ReversalRequestStatus;
  reversedAt?: string;
  reversedBy?: string;
  cashClosed?: boolean;
  cashClosedAt?: string;
  renewalRequested?: boolean;
  renewalRequestedAt?: string;
  renewalRequestedBy?: string;
  renewalRequestedDurationDays?: number;
  renewalReason?: string;
  renewalStatus?: 'Pending' | 'Approved' | 'Declined';
  leaseCount?: number;
  renewalAmount?: number;
  lastRenewedAt?: string;
}

export interface SystemNotification {
  id: string;
  message: string;
  senderName: string;
  senderId?: string;
  timestamp: string;
  location?: string;
  isBroadcast?: boolean;
  targetAudience?: 'ALL' | 'SPECIFIC' | 'ADMIN';
  targetAgentIds?: string[];
  targetAgentNames?: string[];
  targetUserIds?: string[];
  targetRole?: Role | 'Admin' | 'WorkspaceMaster' | 'Agent';
  isActive?: boolean;
  notifType?: 'reversal_request' | 'reversal_status' | 'broadcast' | 'system' | string;
  reversalRequestId?: string;
  transactionId?: string;
  referenceCode?: string;
}

export interface FeedbackMessage {
  id: string;
  agentId: string;
  agentName: string;
  message: string;
  timestamp: string;
  reply?: string;
  voucherCode?: string;
  voucherId?: string;
  status?: 'Open' | 'Resolved';
}

export interface PackagePricing {
  id: SubscriptionTier;
  name: string;
  price: number;
  desc: string;
  maxAgents: number;
}

export type AuditActionCategory = 'credential' | 'role' | 'device' | 'workspace' | 'pricing' | 'system' | 'customer' | 'reversal';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: AuditActionCategory;
  action: string;
  title: string;
  description: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: Role | string;
  targetId?: string;
  targetName?: string;
  targetEmail?: string;
  workspaceId?: string;
  workspaceName?: string;
  metadata?: Record<string, any>;
}

export interface LoyaltyTierRule {
  price: number; // e.g., 3, 5, 7, 10
  requiredConsecutive: number; // e.g., 2
  discountedPrice: number; // e.g. 2 for $3 ($1 off), 4 for $5 ($1 off), 5 for $7 ($2 off), 8 for $10 ($2 off)
}

export interface LoyaltySettings {
  isEnabled: boolean;
  minQualifyingPrice: number; // Vouchers lower than this do not qualify (default: $3.00)
  enforceCustomerDetailsOnSale?: boolean; // When true, workspace admin enforces customer details on sale; agents cannot skip
  tierRules: LoyaltyTierRule[];
  mixedRule: {
    minPrice: number; // $3.00
    requiredConsecutive: number; // 3
    discountAmount: number; // $1.00
  };
  countdownTemplate: string; // e.g., "{remaining} to go! Next time get it for ${nextPrice}"
  regularRewardText: string; // Default: "🎉 Genius Customer Reward: $1.00 Off"
  superRewardText: string; // Default: "🌟 Super Genius Loyalty Reward: $2.00 Off!"
}

export interface CustomerPurchaseRecord {
  id: string;
  voucherId: string;
  voucherCode: string;
  price: number;
  discountApplied: number;
  originalPrice: number;
  timestamp: number;
  agentId: string;
  agentName: string;
  plan: string;
}

export interface Customer {
  id: string;
  workspaceId: string;
  customerNumber: string; // "CN:01", "CN:02", etc.
  name: string;
  cellNumber: string;
  createdAt: number;
  updatedAt: number;
  totalPurchases: number;
  totalSpend: number;
  totalSaved: number;
  consecutivePurchases: CustomerPurchaseRecord[];
  lastPurchaseDate?: number;
  lastAgentName?: string;
  lastVoucherCode?: string;
  customerType?: 'voucher' | 'legacy_device';
  deviceModel?: string;
  macAddress?: string;
  monthlyPrice?: number;
  streakCount?: number;
  savedByUserId?: string;
  savedByName?: string;
  savedByUserRole?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdByUserRole?: string;
}

export type InvestorType = 'CommonShareholder' | 'PreferredInvestor' | 'ConvertibleDebt' | 'Angel';

export interface InvestorStake {
  id: string;
  workspaceId: string;
  userId?: string; // Links to UserProfile uid if investor has an active login account
  name: string;
  email: string;
  cellNumber: string;
  investorType: InvestorType;
  contributionAmount: number; // Monetary amount invested ($)
  sharesCount: number; // Number of equity units
  equityPercentage: number; // Stake in % (e.g. 15.5 for 15.5%)
  valuationAtInvestment: number; // Valuation when invested ($)
  currentMonetaryValue: number; // Current fair market value ($)
  preferredReturnRate?: number; // e.g., 8% annual preferred return
  dateJoined: string; // ISO date string
  notes?: string;
  status: 'Active' | 'Disposed' | 'Diluted';
  dividendEarnedTotal?: number;
  shareCertificateNumber?: string;
}

export type GovernanceFramework = 
  | 'Delaware_CCorp' 
  | 'Silicon_Valley_SAFE' 
  | 'Profit_Share_Partnership' 
  | 'Hybrid_Mezzanine';

export type InvestorTone = 
  | 'Conservative' 
  | 'Balanced_Growth' 
  | 'Aggressive_Landgrab';

export interface ShareholdingGovernance {
  workspaceId: string;
  framework: GovernanceFramework;
  investorTone: InvestorTone;
  companyValuation: number; // Current business valuation ($)
  totalIssuedShares: number; // Total outstanding equity units (e.g. 100,000)
  sharePrice: number; // Current valuation per share ($)
  retainedEarningsRatio: number; // % retained for operations/working capital buffer (e.g. 40)
  dividendPayoutRatio: number; // % distributed to eligible shareholders (e.g. 60)
  hurdleRate: number; // % minimum annual return before common profit split (e.g. 8.0)
  liquidationPreferenceMultiple: number; // e.g. 1.0 (1x)
  allowSecondaryDisposals: boolean;
  minShareHoldingDaysBeforeDisposal: number;
  lastValuationDate: string;
  disposalValuationMethod: 'ARR_Multiple' | 'DCF' | 'NAV_Plus_Cash';
  customValuationMultiple?: number;
}

export type LedgerEntryType = 
  | 'Revenue' 
  | 'VoucherGrossSales' 
  | 'AgentCommission' 
  | 'Opex' 
  | 'Capex' 
  | 'TaxProvision' 
  | 'DividendPayout' 
  | 'CapitalReinjection';

export interface LedgerTransaction {
  id: string;
  workspaceId: string;
  type: LedgerEntryType;
  description: string;
  amount: number; // Positive for inflow, negative for outflow
  date: string;
  recordedBy: string;
  category: string;
  referenceDocId?: string;
  balanceAfter: number;
}

export interface ShareDisposalRequest {
  id: string;
  workspaceId: string;
  investorId: string;
  investorName: string;
  sharesToDispose: number;
  suggestedPricePerShare: number;
  totalOfferAmount: number;
  reason?: string;
  dateRequested: string;
  status: 'Pending' | 'Approved' | 'Executed' | 'Rejected';
  buyerType?: 'Company_Buyback' | 'Co_Investor' | 'External';
}

export interface CapitalReinjectionSimulation {
  investorId?: string;
  investorName: string;
  injectionAmount: number;
  preMoneyValuation: number;
  postMoneyValuation: number;
  newSharesIssued: number;
  newTotalShares: number;
  resultingEquityPercentage: number;
  dilutionFactor: number;
}

export interface AccountDbSnapshot {
  version: '1.0';
  snapshotDate: string;
  source: string;
  accountType: 'Agent' | 'WorkspaceMaster' | 'Admin' | 'Investor' | 'User';
  userProfile: UserProfile;
  workspaceId: string;
  workspaceName?: string;
  associatedData: {
    vouchers: Voucher[];
    cashDrops: CashDrop[];
    voucherRequests?: VoucherRequest[];
    totalVouchersCount: number;
    assignedVouchersCount: number;
    soldVouchersCount: number;
    giftedVouchersCount?: number;
    totalSalesRevenue: number;
    reconciledCashAmount: number;
    pendingCashAmount: number;
  };
  metadata?: Record<string, any>;
}

export interface RecycleBinItem {
  id: string; // e.g. bin_user_...
  itemType: 'account' | 'workspace';
  accountId: string;
  accountName: string;
  accountEmail: string;
  accountRole: Role;
  accountCell?: string;
  workspaceId: string;
  workspaceName: string;
  deletedAt: string;
  deletedBy: {
    uid: string;
    name: string;
    email: string;
    role: string;
  };
  status: 'in_bin' | 'restored' | 'purged';
  snapshot: AccountDbSnapshot;
  vouchersCount: number;
  soldCount: number;
  cashDropsCount: number;
  totalSalesValue: number;
}

export interface AccountBackupItem {
  id: string; // e.g. bkp_user_...
  accountId: string;
  accountName: string;
  accountEmail: string;
  accountRole: Role;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  createdBy: {
    uid: string;
    name: string;
    email: string;
  };
  reason?: string;
  snapshot: AccountDbSnapshot;
  vouchersCount: number;
  soldCount: number;
  cashDropsCount: number;
  totalSalesValue: number;
}

export interface BackupSlotMetadata {
  id: string;
  timestamp: number;
  createdAt: string;
  slotLabel?: string;
  triggerEvent: string;
  actor: {
    uid: string;
    name: string;
    role: string;
    email?: string;
  };
  workspaceId?: string;
  workspaceName?: string;
  summary: {
    vouchersCount: number;
    usersCount: number;
    cashDropsCount: number;
    legacyDevicesCount?: number;
    workspacesCount?: number;
    customersCount?: number;
    requestsCount?: number;
  };
}

export interface WorkspaceBackupItem extends BackupSlotMetadata {
  type: 'workspace';
  snapshot: {
    workspace: Workspace;
    users: UserProfile[];
    vouchers: Voucher[];
    cashDrops: CashDrop[];
    legacyDevices: LegacyDevice[];
    requests?: VoucherRequest[];
    customers?: Customer[];
    reversalRequests?: TransactionReversalRequest[];
  };
}

export interface EntireAppBackupItem extends BackupSlotMetadata {
  type: 'entire_app';
  snapshot: {
    workspaces: Workspace[];
    users: UserProfile[];
    vouchers: Voucher[];
    cashDrops: CashDrop[];
    legacyDevices: LegacyDevice[];
    requests?: VoucherRequest[];
    customers?: Customer[];
    reversalRequests?: TransactionReversalRequest[];
    saasConfig?: any;
    appOwnerEmail: string;
  };
}

export interface AppBackupConfig {
  autoBackupOnWrite: boolean;
  minIntervalSeconds: number; // e.g. 15, 30, 60, 120
  maxBackupSlots: number; // default 5 (3 to 10)
  retentionStrategy: 'intelligent_spacing' | 'fifo';
  notifyOnAutoBackup: boolean;
  triggers: {
    voucherSales: boolean;
    voucherAssignments: boolean;
    userModifications: boolean;
    cashDrops: boolean;
    settingsChanges: boolean;
  };
}

