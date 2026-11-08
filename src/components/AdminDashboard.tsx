import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp, sanitizeVoucherCode, getDeletedPlans } from '../context/AppContext';
import { MetricSkeleton } from './MetricSkeleton';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import {
  Database,
  Upload,
  Search,
  Filter,
  Check,
  AlertTriangle,
  UserCheck,
  X,
  CreditCard,
  DollarSign,
  Users,
  Wifi,
  Send,
  Trash2,
  ListFilter,
  Calendar,
  Clock,
  AlertOctagon,
  TrendingUp,
  Cpu,
  Layers,
  ArrowRightLeft,
  CheckSquare,
  RotateCcw,
  LayoutGrid,
  TableProperties,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Lock,
  Unlock,
  Pin,
  Move,
  Star,
  ShieldAlert,
  Printer,
  ScanLine,
  Sparkles,
  RefreshCw,
  CloudUpload,
  MessageSquare,
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  XCircle,
  Download,
  Activity,
  SlidersHorizontal,
  MapPin,
  ExternalLink,
  Copy,
  Edit2,
  Ticket,
  ArrowRight,
  Gift,
  Eye,
  EyeOff,
  Globe,
  Target,
  Megaphone,
  Camera
} from 'lucide-react';
import { Voucher, Role, UserProfile, FeedbackMessage, VoucherRequest, LegacyDevice, SystemNotification, CashDrop } from '../types';
import { canAccessWorkspaceMaster, getWorkspaceActiveAgents, getAuthoritativeAgentLeaderboard, SyncedLeaderboardEntry } from '../utils/rbacPolicy';
import { TokenRequestApprovalModal } from './TokenRequestApprovalModal';
import { AgentTokenExportModal } from './AgentTokenExportModal';
import { VoucherScannerModal } from './VoucherScannerModal';
import { LoyaltyProgramSettingsModal } from './LoyaltyProgramSettingsModal';
import { FreeVoucherGiveawayModal } from './FreeVoucherGiveawayModal';
import { isPlanMarkedFree, isVoucherFree, getVoucherMonetaryValue } from '../utils/giveawayEngine';
import { AgentLocationModal, DEFAULT_TERRITORIES } from './AgentLocationModal';
import { PresetLocationsModal } from './PresetLocationsModal';
import { UnmatchedVouchersModal, UnmatchedVoucherToken } from './UnmatchedVouchersModal';
import { AccessAuditView } from './AccessAuditView';
import { playScanSuccessChime, triggerScanVibrate } from '../utils/textRecognition';
import { fuzzySearchVouchers, VoucherFuzzyResult, HighlightText } from '../utils/fuzzySearch';
import { AdminCashCloseScheduleModal } from './AdminCashCloseScheduleModal';
import { AdminWorkspaceBackupModal } from './AdminWorkspaceBackupModal';
import { WorkspaceSnapshotModal } from './WorkspaceSnapshotModal';
import { EditLegacyLeaseModal } from './EditLegacyLeaseModal';
import { EditPlanNamesModal } from './EditPlanNamesModal';
import { getWorkspaceSalesCycleAggregate, getCycleMonthLabel } from '../utils/salesCycleEngine';
import { resolveCustomerWorkspaceId, getTargetWorkspaceId } from '../context/AppContext';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';
import { TransactionReversalsModal } from './TransactionReversalsModal';
import { CashDropApprovalModal } from './CashDropApprovalModal';
import { CaptivePortalManagerModal } from './CaptivePortalManagerModal';
import { getAgentDisplayName } from '../utils/rbacPolicy';
export { getAgentDisplayName };

export const AdminDashboard: React.FC = () => {
  const {
    vouchers,
    users,
    requests,
    reversalRequests,
    cashDrops,
    legacyDevices,
    notifications,
    readNotificationIds,
    markNotificationAsRead,
    uploadVouchers,
    assignVouchersToAgent,
    revokeVoucherAllocation,
    fulfillVoucherRequest,
    declineVoucherRequest,
    deleteVoucherRequest,
    cancelTransaction,
    reconcileCashDrop,
    declineCashDrop,
    fulfillAdminCashDropRequest,
    submitCashDrop,
    isPushingToDb,
    approveLegacyDevice,
    cancelLegacyDeviceEnrollment,
    declineLegacyDeviceEnrollment,
    deleteLegacyDevice,
    updateLegacyDeviceLeaseExpiry,
    approveLegacyDeviceRenewal,
    declineLegacyDeviceRenewal,
    cancelLegacyDeviceDeletionRequest,
    updateCaptivePortalUrl,
    deleteVoucher,
    updateVoucher,
    renameVoucherPlan,
    bulkDeleteVouchers,
    bulkUpdateVouchers,
    editUserByMaster,
    addNotification,
    updateNotification,
    deleteNotification,
    theme,
    activeWorkspace,
    currentUser,
    showToast,
    loyaltySettings,
    updateLoyaltySettings,
    giveawaySettings,
    updateGiveawaySettings,
    togglePlanFreeStatus,
    markVouchersFreeBulk,
    customers,
    leaderboardSummary,
    addOrUpdateCustomer,
    feedback,
    replyToFeedback,
    auditLogs,
    cashCloseSettings,
    updateCashCloseSettings,
    updateAgentCashCloseSchedule,
    requestAgentCashClose,
    workspaceBackups,
    forcePushLocalToGlobalDB,
    openSnapshotModal,
    isMetricsSyncing,
    isRefetching,
    globalLoading,
    initialized,
    latestDbPushMetricsMirror,
    isAuthoritativeDataReady
  } = useApp();

  // Metrics blurring must be done only when the app has just started and still fetching the most current metrics.
  // Never blur on recurring 30s live sync counter cycles, refetches, or background pushes.
  const isEffectiveMetricsSyncing = Boolean(isMetricsSyncing);

  // --- Workspace Continuous Backups & Snapshot Modal State ---
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);

  // --- Transaction Reversals Modal State ---
  const [isReversalsModalOpen, setIsReversalsModalOpen] = useState(false);
  const [reversalsInitialSearch, setReversalsInitialSearch] = useState('');
  const pendingReversalsCount = useMemo(() => {
    return (reversalRequests || []).filter(r => r.status === 'Pending').length;
  }, [reversalRequests]);

  useEffect(() => {
    const handleOpenReversalAction = (e: CustomEvent) => {
      const { requestId, referenceCode, transactionId } = e.detail || {};
      const searchTerm = referenceCode || requestId || transactionId || '';
      setReversalsInitialSearch(searchTerm);
      setIsReversalsModalOpen(true);
    };

    window.addEventListener('wivote:open-reversal-action', handleOpenReversalAction as EventListener);
    return () => {
      window.removeEventListener('wivote:open-reversal-action', handleOpenReversalAction as EventListener);
    };
  }, []);

  // --- Cash Close & Sales Cycle Modal State ---
  const [isCashCloseScheduleModalOpen, setIsCashCloseScheduleModalOpen] = useState(false);
  const [selectedCashDropForApproval, setSelectedCashDropForApproval] = useState<CashDrop | null>(null);
  const [isCashDropApprovalModalOpen, setIsCashDropApprovalModalOpen] = useState<boolean>(false);

  const handleOpenCashDropApproval = (drop: CashDrop) => {
    setSelectedCashDropForApproval(drop);
    setIsCashDropApprovalModalOpen(true);
  };

  // --- Giveaway / Free Vouchers Modal State ---
  const [isGiveawayModalOpen, setIsGiveawayModalOpen] = useState(false);

  // --- Renaming Voucher Plan ---
  const [isEditPlansModalOpen, setIsEditPlansModalOpen] = useState(false);
  const [renamingPlanName, setRenamingPlanName] = useState<string | null>(null);
  const [newPlanNameInput, setNewPlanNameInput] = useState<string>('');

  // --- Agent Location Modal State ---
  const [selectedAgentForLocation, setSelectedAgentForLocation] = useState<SyncedLeaderboardEntry | UserProfile | null>(null);
  const [isAgentLocationModalOpen, setIsAgentLocationModalOpen] = useState(false);

  // --- Legacy Device Lease Expiry Modal State ---
  const [selectedDeviceForLeaseEdit, setSelectedDeviceForLeaseEdit] = useState<LegacyDevice | null>(null);
  const [isEditLeaseModalOpen, setIsEditLeaseModalOpen] = useState(false);

  const handleOpenEditLease = (device: LegacyDevice) => {
    setSelectedDeviceForLeaseEdit(device);
    setIsEditLeaseModalOpen(true);
  };

  // --- Captive Portal & Quick Copy State ---
  const [isCaptivePortalModalOpen, setIsCaptivePortalModalOpen] = useState(false);
  const [captivePortalInput, setCaptivePortalInput] = useState<string>(activeWorkspace?.captivePortalUrl || 'https://cloud-eu.ruijienetworks.com');

  useEffect(() => {
    if (activeWorkspace?.captivePortalUrl) {
      setCaptivePortalInput(activeWorkspace.captivePortalUrl);
    }
  }, [activeWorkspace?.captivePortalUrl]);

  const handleCopyDeviceText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`✓ Copied ${label} ("${text}") to clipboard!`, 'success');
    } catch {
      showToast(`✓ Copied ${label}!`, 'success');
    }
  };

  // --- Unmatched Multi-code Search Modal State ---
  const [isUnmatchedModalOpen, setIsUnmatchedModalOpen] = useState(false);
  const [hasCopiedQuick, setHasCopiedQuick] = useState(false);

  const [isLoyaltyModalOpen, setIsLoyaltyModalOpen] = useState(false);
  const [loyaltyModalInitialTab, setLoyaltyModalInitialTab] = useState<'settings' | 'customers'>('settings');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // --- Workspace Master requested Cash Drop states ---
  const [isRequestingCashDrop, setIsRequestingCashDrop] = useState(false);
  const [reqCashAgentId, setReqCashAgentId] = useState('');
  const [reqCashAmount, setReqCashAmount] = useState('');
  const [reqCashNotes, setReqCashNotes] = useState('');

  // Admin Quick Toggle for Enforcing Customer Details during Voucher Sales
  const toggleEnforceCustomerDetails = async () => {
    const currentVal = !!(loyaltySettings?.enforceCustomerDetailsOnSale);
    const nextVal = !currentVal;
    try {
      await updateLoyaltySettings({
        ...(loyaltySettings || {
          isEnabled: true,
          minQualifyingPrice: 3.0,
          tierRules: [],
          mixedRule: { minPrice: 3.0, requiredConsecutive: 3, discountAmount: 1.0 },
          countdownTemplate: '{remaining} to go! Next time get it for ${nextPrice}',
          regularRewardText: 'Next voucher $1 OFF!',
          superRewardText: 'Next voucher $2+ OFF!'
        }),
        enforceCustomerDetailsOnSale: nextVal
      });
      showToast(
        nextVal
          ? '🔒 Mandatory: Customer details are now ENFORCED for all agent sales!'
          : '⚡ Optional: Customer details are now OPTIONAL with skip confirmation for agent sales.',
        'info'
      );
    } catch (err) {
      console.error(err);
      showToast('Failed to update customer enforcement setting.', 'error');
    }
  };

  const scrollToLegacyDevices = () => {
    const element = document.getElementById('legacy-devices-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const containerRef = React.useRef<HTMLDivElement>(null);

  // --- Search & Filters ---
  const [searchTerm, setSearchTerm] = useState('');
  const [isVoucherSuggestionsOpen, setIsVoucherSuggestionsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unused' | 'Assigned' | 'Sold' | 'Past3Days'>('Unused');
  const [planFilter, setPlanFilter] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<number | 'all'>('all');
  const [agentFilter, setAgentFilter] = useState<string>('All');
  const [overlayPos, setOverlayPos] = useState({ x: 20, y: 15 });
  const [isPriceSelectorDocked, setIsPriceSelectorDocked] = useState(true);
  const lastTapRef = React.useRef<number>(0);
  const [overlayLocked, setOverlayLocked] = useState(false);
  const [overlayOrientation, setOverlayOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [inventoryLayout, setInventoryLayout] = useState<'tiles' | 'table'>('tiles');

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setOverlayLocked(prev => !prev);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    if (overlayLocked) {
      return;
    }

    const startX = e.clientX - overlayPos.x;
    const startY = e.clientY - overlayPos.y;
    
    el.setPointerCapture(e.pointerId);
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      let newX = moveEvent.clientX - startX;
      let newY = moveEvent.clientY - startY;
      
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const overlayRect = el.getBoundingClientRect();
        newX = Math.max(5, Math.min(newX, rect.width - overlayRect.width - 5));
        newY = Math.max(5, Math.min(newY, rect.height - overlayRect.height - 5));
      }
      
      setOverlayPos({ x: newX, y: newY });
    };
    
    const handlePointerUp = (upEvent: PointerEvent) => {
      el.releasePointerCapture(upEvent.pointerId);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
    };
    
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
  };

  const handleStartDragFromDock = (e: React.PointerEvent<HTMLDivElement>) => {
    if (overlayLocked) return;
    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    let hasDetached = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startPointerX;
      const dy = moveEvent.clientY - startPointerY;
      if (!hasDetached && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasDetached = true;
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const initialX = Math.max(10, Math.min(moveEvent.clientX - rect.left - 40, rect.width - 250));
          const initialY = Math.max(10, Math.min(moveEvent.clientY - rect.top - 20, rect.height - 80));
          setOverlayPos({ x: initialX, y: initialY });
          setIsPriceSelectorDocked(false);
        }
      } else if (hasDetached && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newX = Math.max(5, Math.min(moveEvent.clientX - rect.left - 40, rect.width - 200));
        const newY = Math.max(5, Math.min(moveEvent.clientY - rect.top - 20, rect.height - 60));
        setOverlayPos({ x: newX, y: newY });
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };
  
  // --- Bulk Selection ---
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [isBulkOptionsOpen, setIsBulkOptionsOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'agent' | 'price' | 'plan' | 'location' | 'ssid' | 'unassign' | 'revoke' | 'delete' | 'export'>('agent');
  const [bulkPasteInput, setBulkPasteInput] = useState('');
  const [assignAgentId, setAssignAgentId] = useState('');
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkPriceInput, setBulkPriceInput] = useState('');
  const [bulkPlanInput, setBulkPlanInput] = useState('');
  const [bulkLocationInput, setBulkLocationInput] = useState('');
  const [bulkSsidInput, setBulkSsidInput] = useState('');
  const [bulkAssignAgentId, setBulkAssignAgentId] = useState('');

  // --- Administrator Token Request Approval & Preselection State ---
  const [isTokenRequestApprovalOpen, setIsTokenRequestApprovalOpen] = useState(false);
  const [activeAssignedRequest, setActiveAssignedRequest] = useState<VoucherRequest | null>(null);
  const [topUpQueueFilter, setTopUpQueueFilter] = useState<'Pending' | 'All'>('Pending');

  // Per-plan multiplier state for compact 3-box stepper on voucher plan cards
  const [planMultipliers, setPlanMultipliers] = useState<Record<string, number>>({});
  const MULTIPLIER_STOPS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

  const getPlanMultiplier = (plan: string, unusedCount: number) => {
    if (planMultipliers[plan] !== undefined) {
      return planMultipliers[plan];
    }
    return unusedCount > 0 && unusedCount < 10 ? unusedCount : 10;
  };

  const reducePlanMultiplier = (plan: string, current: number) => {
    const prevStops = MULTIPLIER_STOPS.filter(s => s < current);
    const nextVal = prevStops.length > 0 ? prevStops[prevStops.length - 1] : 1;
    setPlanMultipliers(prev => ({ ...prev, [plan]: nextVal }));
  };

  const increasePlanMultiplier = (plan: string, current: number) => {
    const nextStops = MULTIPLIER_STOPS.filter(s => s > current);
    const nextVal = nextStops.length > 0 ? nextStops[0] : Math.min(500, current + 25);
    setPlanMultipliers(prev => ({ ...prev, [plan]: nextVal }));
  };

  // --- Workspace Master Revoke Allocation State ---
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [vouchersToRevoke, setVouchersToRevoke] = useState<Voucher[]>([]);
  const [revokeReasonInput, setRevokeReasonInput] = useState('');
  const [revokeMode, setRevokeMode] = useState<'pool' | 'delete'>('pool');
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [activeQueryToResolve, setActiveQueryToResolve] = useState<FeedbackMessage | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // --- Bulk Price & Plan Immunization Confirmation State ---
  interface BulkSoldConfirmState {
    type: 'price' | 'plan';
    price?: number;
    plan?: string;
    totalCount: number;
    unsoldIds: string[];
    soldIds: string[];
    soldVouchers: Voucher[];
  }
  const [bulkSoldConfirmModal, setBulkSoldConfirmModal] = useState<BulkSoldConfirmState | null>(null);

  // --- Agent Feedback & Voucher Query Responses ---
  const [queryReplyText, setQueryReplyText] = useState<{ [feedbackId: string]: string }>({});
  const [querySelectedVoucherId, setQuerySelectedVoucherId] = useState<{ [feedbackId: string]: string }>({});

  // --- Agent Token Export & Print Modal States ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalAgentId, setExportModalAgentId] = useState<string | undefined>(undefined);
  const [exportModalVoucherIds, setExportModalVoucherIds] = useState<string[] | undefined>(undefined);

  // --- High-Speed Optical Voucher Code Scanner ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isContinuousBatchScan, setIsContinuousBatchScan] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleToggleBatchScan = () => {
    setIsContinuousBatchScan(prev => !prev);
  };

  const handleOpenOneTimeScan = () => {
    if (isScannerOpen && !isContinuousBatchScan) {
      setIsScannerOpen(false);
    } else {
      setIsContinuousBatchScan(false);
      setIsScannerOpen(true);
    }
  };

  const handleOpenBatchScan = () => {
    if (isScannerOpen && isContinuousBatchScan) {
      setIsScannerOpen(false);
    } else {
      setIsContinuousBatchScan(true);
      setIsScannerOpen(true);
    }
  };

  const handleOpenExportForAgent = (agentUid: string) => {
    setExportModalAgentId(agentUid);
    setExportModalVoucherIds(undefined);
    setIsExportModalOpen(true);
  };

  const handleOpenExportForSelected = () => {
    const selectedList = vouchers.filter(v => selectedVouchers.includes(v.id));
    const assignedAgents = Array.from(new Set(selectedList.map(v => v.assignedAgentId).filter(Boolean)));
    if (assignedAgents.length === 1) {
      setExportModalAgentId(assignedAgents[0] as string);
    } else if (agents.length > 0) {
      setExportModalAgentId(agents[0].uid);
    }
    setExportModalVoucherIds(selectedVouchers);
    setIsExportModalOpen(true);
  };

  // --- CSV Import & Preset Locations ---
  const [csvText, setCsvText] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');
  const [customLocations, setCustomLocations] = useState<string[]>(() => {
    const saved = localStorage.getItem('wivote_custom_locations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return DEFAULT_TERRITORIES;
  });
  const [isLocationPopupOpen, setIsLocationPopupOpen] = useState(false);
  const [isEditLocationPopupOpen, setIsEditLocationPopupOpen] = useState(false);
  const [isPresetLocationsModalOpen, setIsPresetLocationsModalOpen] = useState(false);
  const [editingDropdownLoc, setEditingDropdownLoc] = useState<string | null>(null);
  const [editingDropdownVal, setEditingDropdownVal] = useState('');
  const [newLocationInput, setNewLocationInput] = useState('');

  // Dynamically sync customLocations with any locations found in vouchers
  React.useEffect(() => {
    const voucherLocs = Array.from(new Set(vouchers.map(v => v.location).filter(Boolean)));
    setCustomLocations(prev => {
      const merged = Array.from(new Set([...prev, ...voucherLocs]));
      return merged;
    });
  }, [vouchers]);

  React.useEffect(() => {
    if (!defaultLocation && customLocations.length > 0) {
      setDefaultLocation(customLocations[0]);
    }
  }, [customLocations, defaultLocation]);

  // Persist custom locations
  React.useEffect(() => {
    localStorage.setItem('wivote_custom_locations', JSON.stringify(customLocations));
  }, [customLocations]);

  const [importResult, setImportResult] = useState<{ success: boolean; count: number; duplicatesCount: number; errors: string[] } | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // --- New Notification & Targeting ---
  const [motivationMsg, setMotivationMsg] = useState('');
  const [broadcastTargetAudience, setBroadcastTargetAudience] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [broadcastSelectedAgentIds, setBroadcastSelectedAgentIds] = useState<string[]>([]);
  const [broadcastPublishImmediately, setBroadcastPublishImmediately] = useState<boolean>(true);
  const [editingAudienceNotif, setEditingAudienceNotif] = useState<SystemNotification | null>(null);
  const [editNotifTargetAudience, setEditNotifTargetAudience] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [editNotifSelectedAgentIds, setEditNotifSelectedAgentIds] = useState<string[]>([]);

  // --- Edit Price Modal ---
  const [editVoucher, setEditVoucher] = useState<Voucher | null>(null);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [editLocation, setEditLocation] = useState<string>('');
  const [editPlan, setEditPlan] = useState<string>('');
  const [editNetworkName, setEditNetworkName] = useState<string>('');
  const [uploadNetworkName, setUploadNetworkName] = useState<string>('');

  // --- Legacy Device approval price & lease duration state ---
  const [legacyPrices, setLegacyPrices] = useState<{ [id: string]: number }>({});
  const [legacyLeaseDays, setLegacyLeaseDays] = useState<{ [id: string]: number }>({});
  const [legacyCheckedAdd, setLegacyCheckedAdd] = useState<{ [id: string]: boolean }>({});
  const [legacyCheckedApprove, setLegacyCheckedApprove] = useState<{ [id: string]: boolean }>({});

  // --- Filtered and Processed Lists ---
  const adminWsId = getTargetWorkspaceId(activeWorkspace, currentUser, 'ws_vakzim');

  const workspaceCustomers = useMemo(() => {
    if (!adminWsId || adminWsId === 'ALL' || adminWsId === 'system') return customers;
    return customers.filter(c => resolveCustomerWorkspaceId(c, adminWsId) === adminWsId);
  }, [customers, adminWsId]);

  const agents = useMemo(() => {
    return getWorkspaceActiveAgents(users, activeWorkspace, currentUser);
  }, [users, activeWorkspace, currentUser]);

  // Monthly Sales Cycle & Aggregate Cash / Commission Metrics strictly across this admin's workspace agents
  const salesCycleAggregate = useMemo(() => {
    return getWorkspaceSalesCycleAggregate(
      agents,
      vouchers,
      legacyDevices,
      cashDrops,
      {
        ...(activeWorkspace?.cashCloseSettings || cashCloseSettings),
        giveawaySettings: activeWorkspace?.giveawaySettings || giveawaySettings
      },
      new Date(),
      adminWsId
    );
  }, [agents, vouchers, legacyDevices, cashDrops, activeWorkspace?.cashCloseSettings, cashCloseSettings, adminWsId, giveawaySettings, activeWorkspace?.giveawaySettings]);

  const sortedRequests = useMemo(() => {
    const agentUids = new Set(agents.map(a => a.uid));
    const agentNames = new Set(agents.map(a => (a.name || '').toLowerCase().trim()).filter(Boolean));
    const scoped = requests.filter(r => {
      if ((r as any).workspaceId && adminWsId && adminWsId !== 'ALL' && (r as any).workspaceId !== adminWsId) return false;
      if ((r as any).workspaceId && adminWsId && (r as any).workspaceId === adminWsId) return true;
      if (r.agentId && agentUids.has(r.agentId)) return true;
      if (r.agentName && agentNames.has(r.agentName.toLowerCase().trim())) return true;
      if (!adminWsId || adminWsId === 'ALL') return true;
      return true;
    });
    return [...scoped].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [requests, agents, adminWsId]);

  const workspaceCashDrops = useMemo(() => {
    const agentUids = new Set(agents.map(a => a.uid));
    const agentNames = new Set(agents.map(a => (a.name || '').toLowerCase().trim()).filter(Boolean));
    return cashDrops.filter(cd => {
      if (cd.agentId && agentUids.has(cd.agentId)) return true;
      if (cd.agentName && agentNames.has(cd.agentName.toLowerCase().trim())) return true;
      if ((cd as any).workspaceId && adminWsId && adminWsId !== 'ALL') return (cd as any).workspaceId === adminWsId;
      if (!(cd as any).workspaceId || !adminWsId || adminWsId === 'ALL') return true;
      return true;
    });
  }, [cashDrops, agents, adminWsId]);

  // Dynamic list of locations/plans from inventory for filters
  const locations = useMemo(() => {
    const locs = vouchers.map(v => v.location).filter(Boolean);
    return Array.from(new Set(locs));
  }, [vouchers]);

  const plans = useMemo(() => {
    const delPlans = getDeletedPlans();
    const p = vouchers.map(v => v.plan).filter(planName => Boolean(planName) && !delPlans.has(planName));
    return Array.from(new Set(p));
  }, [vouchers]);

  // Helper to detect if a voucher was sold within the past 3 days (prevent premature exclusion from inventory/logs)
  const isSoldWithinPast3Days = useCallback((v: Voucher) => {
    const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt;
    if (!isSold) return false;
    const timeStr = v.soldAt || v.createdAt || (v as any).timestamp;
    if (!timeStr) return true;
    const diffMs = Date.now() - new Date(timeStr).getTime();
    return diffMs <= 4 * 24 * 60 * 60 * 1000;
  }, []);

  // Filtered Vouchers (including past 3 days sold vouchers so they are never lost from active inventories/logs)
  const activeVouchers = useMemo(() => {
    return vouchers.filter(v => !v.archived || isSoldWithinPast3Days(v));
  }, [vouchers, isSoldWithinPast3Days]);

  const past3DaysSoldVouchers = useMemo(() => {
    return vouchers.filter(isSoldWithinPast3Days);
  }, [vouchers, isSoldWithinPast3Days]);

  const activeVoucherCodes = useMemo(() => {
    return activeVouchers.map(v => v.code);
  }, [activeVouchers]);

  const handleWorkspaceMasterCodeScanned = (scannedCode: string) => {
    const cleanCode = scannedCode.trim();
    const upperClean = cleanCode.toUpperCase();
    const normClean = upperClean.replace(/[^A-Z0-9]/gi, '');

    // 1. Find matching voucher in active inventory (exact or normalized)
    const matched = activeVouchers.find(v => {
      const vCode = v.code.trim();
      const vCodeUpper = vCode.toUpperCase();
      return vCode === cleanCode || vCodeUpper === upperClean || vCodeUpper.replace(/[^A-Z0-9]/gi, '') === normClean;
    });

    if (matched) {
      // Check for double allocation: Flag vouchers that are already allocated or sold
      if (matched.status === 'Assigned' || matched.assignedAgentId) {
        showToast(`⚠️ Already Allocated: Voucher ${matched.code} is already allocated to ${matched.assignedAgentName || 'an agent'}! Attempted double allocation blocked.`, 'error');
        setSearchTerm('');
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
        }
        triggerScanVibrate();
        return;
      }
      if (matched.status === 'Sold') {
        showToast(`⚠️ Already Sold: Voucher ${matched.code} has already been sold and cannot be allocated!`, 'error');
        setSearchTerm('');
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
        }
        triggerScanVibrate();
        return;
      }

      // If one-time scan mode: select the voucher for assignment to an agent and close the scanner
      if (!isContinuousBatchScan) {
        setSelectedVouchers([matched.id]);
        setIsScannerOpen(false);
        setBulkAction('agent');
        showToast(`✓ Matched & Selected: ${matched.code} ($${(matched.price || 0).toFixed(2)}) for agent assignment!`, 'success');
      } else {
        // Continuous batch scan mode: automatically append valid scanned code to assignment queue
        setSelectedVouchers(prev => {
          if (prev.includes(matched.id)) {
            showToast(`Already in assignment queue: ${matched.code} ($${(matched.price || 0).toFixed(2)})`, 'info');
            return prev;
          }
          showToast(`✓ Queued for agent assignment: ${matched.code} ($${(matched.price || 0).toFixed(2)}) — ${prev.length + 1} ready`, 'success');
          return [...prev, matched.id];
        });
        setBulkAction('agent');
      }

      // Immediately clear input field and reset scanner/input focus state
      setSearchTerm('');
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }

      // Haptic and POS chime confirmation
      triggerScanVibrate();
      playScanSuccessChime();
    } else {
      // Even if not found, clear search term so it doesn't leave stale unmatching text
      setSearchTerm('');
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }
      showToast(`Scanned: ${cleanCode} (Not found in active catalog)`, 'error');
    }
  };

  // Quick multiplier parser from search query e.g. "1hr_4GB x20", "1hr x20", "daily x10", "x20"
  const searchMultiplierInfo = useMemo(() => {
    const raw = (searchTerm || '').trim();
    if (!raw) return null;
    const match = raw.match(/^(.*?)(?:^|\s+)(?:x|X|\*)\s*(\d+)$/);
    if (!match) return null;
    const term = match[1].trim();
    const count = parseInt(match[2], 10);
    if (isNaN(count) || count <= 0) return null;
    return { term, count };
  }, [searchTerm]);

  /**
   * Quick Multiplier:
   * Immediately marks up to `count` vouchers from the filtered list (or for a specific plan),
   * prioritizing genuinely unassigned unused stock for bulk assignment.
   * Immediately opens the bulk actions panel and sets action to 'agent'.
   */
  const applyQuickMultiplier = (count: number, specificPlan?: string) => {
    if (count <= 0) return;

    let pool: Voucher[];
    let targetLabel = '';

    if (specificPlan) {
      targetLabel = specificPlan;
      const planQuery = specificPlan.trim().toLowerCase();
      let planVouchers = activeVouchers.filter(v => 
        !v.archived && 
        v.plan.trim().toLowerCase() === planQuery
      );
      if (planVouchers.length === 0) {
        planVouchers = activeVouchers.filter(v => 
          !v.archived && 
          v.plan.trim().toLowerCase().includes(planQuery)
        );
      }
      pool = planVouchers;
    } else {
      targetLabel = 'active inventory';
      pool = filteredVouchers;
    }

    const availableUnassigned = pool.filter(v => 
      (v.status === 'Unused' || (v.status as any) === 'unused') && 
      !v.assignedAgentId && 
      !v.archived
    );

    const candidates = availableUnassigned.length >= count 
      ? availableUnassigned 
      : pool.filter(v => (v.status === 'Unused' || (v.status as any) === 'unused') && !v.archived);

    if (candidates.length === 0) {
      showToast(`⚠️ No available unused vouchers found for "${targetLabel}".`, 'error');
      return;
    }

    const toSelect = candidates.slice(0, count).map(v => v.id);
    setSelectedVouchers(toSelect);
    setIsBulkOptionsOpen(true);
    setBulkAction('agent');

    if (toSelect.length < count) {
      showToast(`✓ Marked all ${toSelect.length} available unused vouchers for "${targetLabel}" (requested ${count})`, 'info');
    } else {
      showToast(`✓ Marked x${toSelect.length} vouchers for "${targetLabel}"! Choose an agent below to assign stock.`, 'success');
    }
  };

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // 1. Quick Multiplier command detection: e.g. "1hr_4GB x20" or "x20"
      if (searchMultiplierInfo && searchMultiplierInfo.count > 0) {
        e.preventDefault();
        applyQuickMultiplier(searchMultiplierInfo.count, searchMultiplierInfo.term || undefined);
        return;
      }

      const raw = searchTerm.trim();
      if (!raw) return;
      const cleanCode = raw;
      const upperClean = cleanCode.toUpperCase();
      const normClean = upperClean.replace(/[^A-Z0-9]/gi, '');
      const matched = activeVouchers.find(v => {
        const vCode = v.code.trim();
        const vCodeUpper = vCode.toUpperCase();
        return vCode === cleanCode || vCodeUpper === upperClean || vCodeUpper.replace(/[^A-Z0-9]/gi, '') === normClean;
      });

      if (matched) {
        e.preventDefault();

        // Check for double allocation: Flag vouchers that are already allocated or sold
        if (matched.status === 'Assigned' || matched.assignedAgentId) {
          showToast(`⚠️ Already Allocated: Voucher ${matched.code} is already allocated to ${matched.assignedAgentName || 'an agent'}! Attempted double allocation blocked.`, 'error');
          setSearchTerm('');
          if (searchInputRef.current) {
            searchInputRef.current.value = '';
            searchInputRef.current.focus();
          }
          triggerScanVibrate();
          return;
        }
        if (matched.status === 'Sold') {
          showToast(`⚠️ Already Sold: Voucher ${matched.code} has already been sold and cannot be allocated!`, 'error');
          setSearchTerm('');
          if (searchInputRef.current) {
            searchInputRef.current.value = '';
            searchInputRef.current.focus();
          }
          triggerScanVibrate();
          return;
        }

        if (!isContinuousBatchScan && selectedVouchers.length === 0) {
          setSelectedVouchers([matched.id]);
          showToast(`✓ Matched & Selected: ${matched.code} ($${(matched.price || 0).toFixed(2)}) for agent assignment!`, 'success');
        } else {
          setSelectedVouchers(prev => {
            if (prev.includes(matched.id)) {
              showToast(`Already in assignment queue: ${matched.code}`, 'info');
              return prev;
            }
            showToast(`✓ Queued for agent assignment: ${matched.code} ($${(matched.price || 0).toFixed(2)}) — ${prev.length + 1} ready`, 'success');
            return [...prev, matched.id];
          });
        }
        setBulkAction('agent');

        // Automatically clear input field and reset focus state
        setSearchTerm('');
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
          searchInputRef.current.focus();
        }
        triggerScanVibrate();
        playScanSuccessChime();
      }
    }
  };

  const effectiveSearchTerm = useMemo(() => {
    if (searchMultiplierInfo) {
      return searchMultiplierInfo.term;
    }
    return searchTerm;
  }, [searchTerm, searchMultiplierInfo]);

  // Tokenize search term into individual voucher codes when separated by single space, multiple spaces, commas, or semicolons
  const rawSearchTokens = useMemo(() => {
    const raw = (effectiveSearchTerm || '').trim();
    if (!raw) return [];
    return raw
      .split(/[\s,;]+/)
      .map(t => t.trim().replace(/^['"[\]()]+|['"[\]()]+$/g, ''))
      .filter(Boolean);
  }, [effectiveSearchTerm]);

  const searchTokens = useMemo(() => {
    return rawSearchTokens.map(t => t.toLowerCase());
  }, [rawSearchTokens]);

  // Fuzzy search for voucher inventory with ranking score and matched character highlights
  const voucherFuzzyResults = useMemo<VoucherFuzzyResult[]>(() => {
    return fuzzySearchVouchers(activeVouchers, effectiveSearchTerm);
  }, [activeVouchers, effectiveSearchTerm]);

  // Real-time suggestions (top 6 results as the user types)
  const voucherRealtimeSuggestions = useMemo(() => {
    if (!effectiveSearchTerm.trim()) return [];
    return voucherFuzzyResults.slice(0, 6);
  }, [voucherFuzzyResults, effectiveSearchTerm]);

  // Map of voucher ID to matched fields indices for character highlighting
  const voucherMatchMap = useMemo(() => {
    return new Map(voucherFuzzyResults.map(r => [r.voucher.id, r.matchedFields]));
  }, [voucherFuzzyResults]);

  const filteredVouchers = useMemo(() => {
    const rawSearch = (effectiveSearchTerm || '').trim();
    const sourceList = rawSearch ? voucherFuzzyResults.map(r => r.voucher) : activeVouchers;

    return sourceList.filter(v => {
      const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold';
      const isAssigned = v.status === 'Assigned' || (v.status as any) === 'assigned' || (v.status as string)?.toLowerCase() === 'assigned';
      const isUnused = (v.status === 'Unused' || (v.status as any) === 'unused' || (v.status as string)?.toLowerCase() === 'unused') && !isAssigned && !isSold;

      let matchStatus = true;
      if (statusFilter === 'All' || rawSearch.length > 0) {
        matchStatus = true;
      } else if (statusFilter === 'Past3Days') {
        matchStatus = isSoldWithinPast3Days(v);
      } else if (statusFilter === 'Sold') {
        matchStatus = isSold;
      } else if (statusFilter === 'Assigned') {
        matchStatus = isAssigned;
      } else if (statusFilter === 'Unused') {
        matchStatus = isUnused;
      }

      const matchPlan = planFilter === 'All' ? true : v.plan === planFilter;
      const matchPrice = priceFilter === 'all' ? true : Math.abs((Number(v.price) || 0) - Number(priceFilter)) < 0.001;
      const matchAgent = agentFilter === 'All' ? true : v.assignedAgentId === agentFilter;
      return matchStatus && matchPlan && matchPrice && matchAgent;
    });
  }, [activeVouchers, voucherFuzzyResults, effectiveSearchTerm, statusFilter, planFilter, priceFilter, agentFilter]);

  // Mobile DOM Optimization: Virtualized/Paginated vouchers and legacy lists to prevent OOM
  const [visibleAdminVouchersLimit, setVisibleAdminVouchersLimit] = useState<number>(30);
  const [visibleAdminLegacyLimit, setVisibleAdminLegacyLimit] = useState<number>(20);

  useEffect(() => {
    setVisibleAdminVouchersLimit(30);
  }, [effectiveSearchTerm, statusFilter, planFilter, priceFilter, agentFilter]);

  const paginatedFilteredVouchers = useMemo(() => {
    return filteredVouchers.slice(0, visibleAdminVouchersLimit);
  }, [filteredVouchers, visibleAdminVouchersLimit]);

  const paginatedAdminLegacyDevices = useMemo(() => {
    return legacyDevices.slice(0, visibleAdminLegacyLimit);
  }, [legacyDevices, visibleAdminLegacyLimit]);



  // Calculate unmatched queried tokens during multi-code search
  const unmatchedTokens = useMemo<UnmatchedVoucherToken[]>(() => {
    if (rawSearchTokens.length <= 1) return [];

    const filteredVoucherMap = new Map<string, Voucher>();
    filteredVouchers.forEach(v => {
      if (v.code) filteredVoucherMap.set(v.code.toLowerCase().trim(), v);
    });

    const seenTokens = new Set<string>();
    const unmatched: UnmatchedVoucherToken[] = [];

    for (const rawToken of rawSearchTokens) {
      const cleanToken = rawToken.toLowerCase().trim();
      if (!cleanToken || seenTokens.has(cleanToken)) continue;
      seenTokens.add(cleanToken);

      // Check if this token matches any voucher in filteredVouchers
      let isMatchedInFiltered = false;

      if (filteredVoucherMap.has(cleanToken)) {
        isMatchedInFiltered = true;
      } else {
        for (const v of filteredVouchers) {
          const vCode = (v.code || '').toLowerCase().trim();
          if (vCode === cleanToken || vCode.includes(cleanToken) || cleanToken.includes(vCode)) {
            isMatchedInFiltered = true;
            break;
          }
          if (
            (v.plan && v.plan.toLowerCase().trim() === cleanToken) ||
            (v.location && v.location.toLowerCase().trim() === cleanToken) ||
            (v.networkName && v.networkName.toLowerCase().trim() === cleanToken)
          ) {
            isMatchedInFiltered = true;
            break;
          }
        }
      }

      if (!isMatchedInFiltered) {
        // Check if it exists in activeVouchers (but got filtered out by active filter)
        let existingInActive: Voucher | undefined;
        for (const v of activeVouchers) {
          const vCode = (v.code || '').toLowerCase().trim();
          if (vCode === cleanToken || vCode.includes(cleanToken) || cleanToken.includes(vCode)) {
            existingInActive = v;
            break;
          }
        }

        if (existingInActive) {
          unmatched.push({
            code: rawToken,
            reason: 'filtered_out',
            reasonText: `Excluded by active filter (Status: ${existingInActive.status}, Plan: ${existingInActive.plan})`,
            existingVoucher: existingInActive
          });
          continue;
        }

        // Check if it exists in archived vouchers
        let existingArchived: Voucher | undefined;
        for (const v of vouchers) {
          if (v.archived) {
            const vCode = (v.code || '').toLowerCase().trim();
            if (vCode === cleanToken || vCode.includes(cleanToken) || cleanToken.includes(vCode)) {
              existingArchived = v;
              break;
            }
          }
        }

        if (existingArchived) {
          unmatched.push({
            code: rawToken,
            reason: 'archived',
            reasonText: `Archived voucher (${existingArchived.plan}, ${existingArchived.location})`,
            existingVoucher: existingArchived
          });
          continue;
        }

        // Completely absent from database inventory
        unmatched.push({
          code: rawToken,
          reason: 'not_found',
          reasonText: 'Not found in database inventory'
        });
      }
    }

    return unmatched;
  }, [rawSearchTokens, filteredVouchers, activeVouchers, vouchers]);

  const handleCopyUnmatchedQuick = async () => {
    if (unmatchedTokens.length === 0) return;
    const codes = unmatchedTokens.map(t => t.code).join(', ');
    try {
      await navigator.clipboard.writeText(codes);
      setHasCopiedQuick(true);
      showToast(`Copied ${unmatchedTokens.length} unmatched voucher code(s) to clipboard!`, 'success');
      setTimeout(() => setHasCopiedQuick(false), 2000);
    } catch {
      setHasCopiedQuick(true);
      showToast(`Copied ${unmatchedTokens.length} unmatched voucher code(s)!`, 'success');
      setTimeout(() => setHasCopiedQuick(false), 2000);
    }
  };

  const handleClearFiltersForUnmatched = () => {
    setStatusFilter('All');
    setPlanFilter('All');
    setPriceFilter('all');
    setAgentFilter('All');
    showToast('Inventory filters cleared to reveal matched vouchers', 'info');
  };

  const uniquePrices = useMemo(() => {
    const prices = activeVouchers.map(v => Number(v.price) || 0);
    return Array.from(new Set(prices)).sort((a: number, b: number) => a - b);
  }, [activeVouchers]);

  // Grouped active categories count & values
  const categoryTallies = useMemo(() => {
    const tallies: { [plan: string]: { unused: number; unusedValue: number; assigned: number; assignedValue: number; sold: number; soldValue: number } } = {};
    activeVouchers.forEach(v => {
      if (!tallies[v.plan]) {
        tallies[v.plan] = { unused: 0, unusedValue: 0, assigned: 0, assignedValue: 0, sold: 0, soldValue: 0 };
      }
      const isFree = isVoucherFree(v, giveawaySettings) || isPlanMarkedFree(v.plan, giveawaySettings);
      if (!isFree) {
        if (v.status === 'Unused' || (v.status as any) === 'unused') {
          tallies[v.plan].unused++;
          tallies[v.plan].unusedValue += Number(v.price) || 0;
        }
        if (v.status === 'Assigned' || (v.status as any) === 'assigned') {
          tallies[v.plan].assigned++;
          tallies[v.plan].assignedValue += Number(v.price) || 0;
        }
        if (v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt) {
          tallies[v.plan].sold++;
          tallies[v.plan].soldValue += getVoucherMonetaryValue(v, giveawaySettings);
        }
      } else {
        // Free gift vouchers: keep track of counts, but monetary value is strictly $0.00
        if (v.status === 'Unused' || (v.status as any) === 'unused') tallies[v.plan].unused++;
        if (v.status === 'Assigned' || (v.status as any) === 'assigned') tallies[v.plan].assigned++;
        if (v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt) tallies[v.plan].sold++;
      }
    });
    return tallies;
  }, [activeVouchers, giveawaySettings]);

  // --- Global Stats ---
  const totalAgents = agents.length;
  const totalProfits = useMemo(() => {
    return vouchers
      .filter(v => (v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt) && v.reversalStatus !== 'Approved' && !isVoucherFree(v, giveawaySettings))
      .reduce((acc, curr) => acc + getVoucherMonetaryValue(curr, giveawaySettings), 0);
  }, [vouchers, giveawaySettings]);

  // --- Redesigned Inventory Summary calculations ---
  const inventorySummary = useMemo(() => {
    const validVouchers = vouchers;
    const unused = validVouchers.filter(v => (v.status === 'Unused' || (v.status as any) === 'unused' || (v.reversalStatus === 'Approved' && !v.assignedAgentId)) && v.status !== 'Sold' && (v.status as any) !== 'sold' && !v.soldAt && !isVoucherFree(v, giveawaySettings));
    const assigned = validVouchers.filter(v => (v.status === 'Assigned' || (v.status as any) === 'assigned' || (v.reversalStatus === 'Approved' && !!v.assignedAgentId)) && v.status !== 'Sold' && (v.status as any) !== 'sold' && !v.soldAt && !isVoucherFree(v, giveawaySettings));
    const sold = validVouchers.filter(v => (v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt) && v.reversalStatus !== 'Approved' && !isVoucherFree(v, giveawaySettings));

    const totalCount = unused.length + assigned.length + sold.length;

    const unusedValue = unused.reduce((sum, v) => sum + (Number(v.price) || 0), 0);
    const assignedValue = assigned.reduce((sum, v) => sum + (Number(v.price) || 0), 0);
    const soldValue = sold.reduce((sum, v) => sum + getVoucherMonetaryValue(v, giveawaySettings), 0);

    const totalValue = unusedValue + assignedValue + soldValue;

    return {
      unused: { count: unused.length, value: unusedValue },
      assigned: { count: assigned.length, value: assignedValue },
      sold: { count: sold.length, value: soldValue },
      total: { count: totalCount, value: totalValue }
    };
  }, [vouchers, giveawaySettings]);

  // --- Latest DB Push Metrics Mirror (Vault of last push standing in place of current metrics during fetch) ---
  const displayInventorySummary = useMemo(() => {
    const mirrored = latestDbPushMetricsMirror?.admin?.inventorySummary;
    if (mirrored && (!isAuthoritativeDataReady || (mirrored.total?.count && vouchers.length < mirrored.total.count))) {
      return mirrored;
    }
    return inventorySummary;
  }, [latestDbPushMetricsMirror, isAuthoritativeDataReady, vouchers.length, inventorySummary]);

  const displayTotalProfits = useMemo(() => {
    const mirroredProfit = latestDbPushMetricsMirror?.admin?.totalProfits;
    const mirroredCount = latestDbPushMetricsMirror?.admin?.inventorySummary?.total?.count || 0;
    if (mirroredProfit !== undefined && (!isAuthoritativeDataReady || (mirroredCount > 0 && vouchers.length < mirroredCount))) {
      return mirroredProfit;
    }
    return totalProfits;
  }, [latestDbPushMetricsMirror, isAuthoritativeDataReady, vouchers.length, totalProfits]);

  const displayTotalAgents = useMemo(() => {
    const mirroredAgents = latestDbPushMetricsMirror?.admin?.totalAgents;
    if (mirroredAgents !== undefined && !isAuthoritativeDataReady && totalAgents === 0) {
      return mirroredAgents;
    }
    return totalAgents;
  }, [latestDbPushMetricsMirror, isAuthoritativeDataReady, totalAgents]);

  const displayCustomerCount = useMemo(() => {
    const mirroredCust = latestDbPushMetricsMirror?.admin?.customerCount;
    if (mirroredCust !== undefined && (!isAuthoritativeDataReady || (mirroredCust > 0 && workspaceCustomers.length < mirroredCust))) {
      return mirroredCust;
    }
    return workspaceCustomers.length;
  }, [latestDbPushMetricsMirror, isAuthoritativeDataReady, workspaceCustomers.length]);

  const displayLegacyDevicesCount = useMemo(() => {
    const mirroredLd = latestDbPushMetricsMirror?.admin?.legacyDevicesCount;
    const liveCount = legacyDevices.filter(ld => ld.isApproved).length;
    if (mirroredLd !== undefined && (!isAuthoritativeDataReady || (mirroredLd > 0 && liveCount < mirroredLd))) {
      return mirroredLd;
    }
    return liveCount;
  }, [latestDbPushMetricsMirror, isAuthoritativeDataReady, legacyDevices]);

  // Visual cues: Determine if metrics on screen are currently from Snapshot Mirror or Live Global DB
  const isUsingSnapshotMirror = useMemo(() => {
    const mirrored = latestDbPushMetricsMirror?.admin?.inventorySummary;
    return Boolean(mirrored && (!isAuthoritativeDataReady || (mirrored.total?.count && vouchers.length < mirrored.total.count)));
  }, [latestDbPushMetricsMirror, isAuthoritativeDataReady, vouchers.length]);

  const snapshotFormattedTime = useMemo(() => {
    if (!latestDbPushMetricsMirror?.timestamp) return null;
    try {
      const d = new Date(latestDbPushMetricsMirror.timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [latestDbPushMetricsMirror?.timestamp]);

  // --- Data Visualization (Daily trends grouped by location) ---
  const chartData = useMemo(() => {
    // Map dates
    const dateLocMap: { [date: string]: { [location: string]: number } } = {};
    vouchers.filter(v => v.status === 'Sold' && v.reversalStatus !== 'Approved' && v.soldAt && !isVoucherFree(v, giveawaySettings)).forEach(v => {
      const dateStr = new Date(v.soldAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dateLocMap[dateStr]) {
        dateLocMap[dateStr] = {};
      }
      if (!dateLocMap[dateStr][v.location]) {
        dateLocMap[dateStr][v.location] = 0;
      }
      dateLocMap[dateStr][v.location] += getVoucherMonetaryValue(v, giveawaySettings);
    });

    // Transform into recharts format
    return Object.keys(dateLocMap).map(date => {
      const entry: { name: string; [key: string]: any } = { name: date };
      locations.forEach(loc => {
        entry[loc] = dateLocMap[date][loc] || 0;
      });
      return entry;
    }).slice(-7); // last 7 days
  }, [vouchers, locations]);

  // --- Performance Leaderboard (Actual monetary values synced across all dashboards) ---
  const agentPerformance = useMemo(() => {
    return getAuthoritativeAgentLeaderboard(users, activeWorkspace, vouchers, legacyDevices, leaderboardSummary, undefined, cashDrops, currentUser);
  }, [users, activeWorkspace, vouchers, legacyDevices, leaderboardSummary, cashDrops, currentUser]);

  // --- Expiry Buzz alerts (30 days expired non-wifi legacy tickets) ---
  const expiredLegacyDevices = useMemo(() => {
    const now = Date.now();
    return legacyDevices.filter(ld => {
      if (ld.status === 'CANCELLED') return false;
      // Devices have a 30-day lease: only expired if the 30-day lease has actually elapsed
      if (ld.expiresAt) {
        return new Date(ld.expiresAt).getTime() <= now;
      }
      const baseDate = ld.soldAt || ld.approvedAt || ld.enrolledAt;
      if (baseDate) {
        return new Date(baseDate).getTime() + 30 * 24 * 60 * 60 * 1000 <= now;
      }
      return ld.status === 'EXPIRED';
    });
  }, [legacyDevices]);

  // Selected vouchers monetary summary
  const selectedSummary = useMemo(() => {
    const list = activeVouchers.filter(v => selectedVouchers.includes(v.id));
    const combinedValue = list.reduce((sum, v) => sum + v.price, 0);
    
    // Absolute total monetary value of ALL vouchers currently assigned to selected agent (excluding free gift vouchers)
    let totalAssignedToSelectedAgent = 0;
    if (assignAgentId) {
      totalAssignedToSelectedAgent = activeVouchers
        .filter(v => v.assignedAgentId === assignAgentId && !isVoucherFree(v, giveawaySettings))
        .reduce((sum, v) => sum + v.price, 0);
    }

    return {
      count: list.length,
      value: combinedValue,
      agentTotal: totalAssignedToSelectedAgent
    };
  }, [selectedVouchers, activeVouchers, assignAgentId]);

  // Live analysis of pasted voucher codes for Bulk Assignment (supports individual codes and multipliers e.g. "1hr_4GB x20")
  const bulkPasteSummary = useMemo(() => {
    if (!bulkPasteInput.trim()) {
      return { totalCodes: 0, unallocated: [] as Voucher[], alreadyAllocated: [] as Voucher[], notFound: [] as string[] };
    }
    const lines = bulkPasteInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const unallocated: Voucher[] = [];
    const alreadyAllocated: Voucher[] = [];
    const notFound: string[] = [];
    const usedVoucherIds = new Set<string>();
    let totalItemsParsed = 0;

    lines.forEach(line => {
      // Check for quick multiplier format: e.g. "1hr_4GB x20", "1hr x20", "daily*10", "x20"
      const multMatch = line.match(/^(.*?)(?:^|\s+)(?:x|X|\*)\s*(\d+)$/);
      if (multMatch) {
        const term = multMatch[1].trim().toLowerCase();
        const count = parseInt(multMatch[2], 10);
        if (count > 0) {
          totalItemsParsed += count;
          // Find unused unallocated vouchers matching this plan/term
          const matchingUnallocated = activeVouchers.filter(v => {
            if (usedVoucherIds.has(v.id)) return false;
            if (v.status !== 'Unused' || v.assignedAgentId || v.archived) return false;
            if (!term) return true;
            const p = v.plan.toLowerCase().trim();
            return p === term || p.includes(term) || term.includes(p);
          });

          const picked = matchingUnallocated.slice(0, count);
          picked.forEach(v => {
            unallocated.push(v);
            usedVoucherIds.add(v.id);
          });

          if (picked.length < count) {
            notFound.push(`${line} (Only ${picked.length} available out of ${count} requested)`);
          }
          return;
        }
      }

      // Otherwise, parse comma/space separated codes in this line
      const lineCodes = line.split(/[\s,]+/).map(c => c.trim()).filter(Boolean);
      lineCodes.forEach(code => {
        totalItemsParsed += 1;
        const cleanPasted = sanitizeVoucherCode(code);
        const match = activeVouchers.find(v => 
          sanitizeVoucherCode(v).toLowerCase() === cleanPasted.toLowerCase() || 
          v.code.toLowerCase() === code.toLowerCase() || 
          v.id === code
        );
        if (!match) {
          notFound.push(code);
        } else if (match.status === 'Assigned' || !!match.assignedAgentId || match.status === 'Sold') {
          alreadyAllocated.push(match);
        } else {
          if (!usedVoucherIds.has(match.id)) {
            unallocated.push(match);
            usedVoucherIds.add(match.id);
          }
        }
      });
    });

    return {
      totalCodes: totalItemsParsed,
      unallocated,
      alreadyAllocated,
      notFound
    };
  }, [bulkPasteInput, activeVouchers]);

  // Computation of selected vouchers on each plan against their total
  const selectedVouchersList = useMemo(() => {
    return activeVouchers.filter(v => selectedVouchers.includes(v.id));
  }, [activeVouchers, selectedVouchers]);

  const selectedPlansBreakdown = useMemo(() => {
    if (!bulkAssignAgentId) return [];
    
    const counts: { [plan: string]: number } = {};
    selectedVouchersList.forEach(v => {
      counts[v.plan] = (counts[v.plan] || 0) + 1;
    });

    return Object.keys(counts).map(plan => {
      const selectedCount = counts[plan];
      const totalUnused = activeVouchers.filter(v => v.plan === plan && v.status === 'Unused').length;
      return {
        plan,
        selected: selectedCount,
        totalUnused,
      };
    });
  }, [selectedVouchersList, activeVouchers, bulkAssignAgentId]);

  const agentInventoryBalanceInfo = useMemo(() => {
    if (!bulkAssignAgentId) return { existing: 0, totalSelectedValue: 0, resultant: 0, agentName: '' };
    
    const agent = users.find(u => u.uid === bulkAssignAgentId);
    const agentName = agent ? agent.name : '';

    const totalSelectedValue = selectedVouchersList.reduce((sum, v) => sum + v.price, 0);
    const enrolledLegacyExisting = legacyDevices
      .filter(ld => ld.fieldAgentId === bulkAssignAgentId && (ld.isApproved || ld.addedToInventory || ld.status === 'APPROVED') && ld.status !== 'SOLD')
      .reduce((sum, ld) => sum + (ld.monthlyPrice || 0), 0);
    const existing = activeVouchers
      .filter(v => v.assignedAgentId === bulkAssignAgentId && v.status === 'Assigned' && !isVoucherFree(v, giveawaySettings))
      .reduce((sum, v) => sum + v.price, 0) + enrolledLegacyExisting;
    const resultant = totalSelectedValue + existing;

    return {
      existing,
      totalSelectedValue,
      resultant,
      agentName
    };
  }, [selectedVouchersList, activeVouchers, bulkAssignAgentId, users, legacyDevices]);

  // --- Dynamic Info Extracted From Pasteboard / Uploaded File ---
  const detectedInfo = useMemo(() => {
    if (!csvText.trim()) return null;
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return null;
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';
    const headers = firstLine.split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
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
    const locationIndex = headers.findIndex(h => /Location\/place/i.test(h) || /location/i.test(h) || /place/i.test(h) || /site/i.test(h));
    const priceIndex = headers.findIndex(h => /Price\/Amount/i.test(h) || /price/i.test(h) || /amount/i.test(h) || /rate/i.test(h));
    const durationIndex = headers.findIndex(h => /Period\/Duration/i.test(h) || /period/i.test(h) || /duration/i.test(h));
    
    const detectedPlans = new Set<string>();
    const detectedLocations = new Set<string>();
    let totalRows = 0;
    const previewRows: Array<{ code: string; plan: string; price: number; duration: string; location: string }> = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse values
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
      
      const code = values[codeIndex]?.replace(/^["']|["']$/g, '').trim();
      if (!code) continue;
      
      totalRows++;
      
      const pVal = planIndex !== -1 && values[planIndex] ? values[planIndex].replace(/^["']|["']$/g, '').trim() : '';
      const plan = pVal || '30Days_Unlimited';
      detectedPlans.add(plan);
      
      const lVal = locationIndex !== -1 && values[locationIndex] ? values[locationIndex].replace(/^["']|["']$/g, '').trim() : '';
      if (lVal) detectedLocations.add(lVal);

      const rawPrice = priceIndex !== -1 ? values[priceIndex] : '';
      const price = rawPrice ? parseFloat(rawPrice.replace(/[^\d.]/g, '')) : NaN;

      const durationVal = durationIndex !== -1 && values[durationIndex] ? values[durationIndex].replace(/^["']|["']$/g, '').trim() : '30 Days';

      if (previewRows.length < 5) {
        previewRows.push({
          code,
          plan,
          price: isNaN(price) ? 0 : price,
          duration: durationVal,
          location: lVal
        });
      }
    }
    
    return {
      plans: Array.from(detectedPlans),
      locations: Array.from(detectedLocations),
      totalRows,
      hasPlansColumn: planIndex !== -1,
      hasLocationsColumn: locationIndex !== -1,
      previewRows
    };
  }, [csvText]);

  // --- Location Management Helpers ---
  const handleAddLocation = (name: string) => {
    const loc = name.trim();
    if (!loc) return;
    if (!customLocations.some(l => l.toLowerCase() === loc.toLowerCase())) {
      setCustomLocations(prev => [...prev, loc]);
    }
    setNewLocationInput('');
  };

  const handleRemoveLocation = (locToRemove: string) => {
    setCustomLocations(prev => {
      const updated = prev.filter(l => l !== locToRemove);
      localStorage.setItem('wivote_custom_locations', JSON.stringify(updated));
      return updated;
    });
    if (defaultLocation === locToRemove) {
      setDefaultLocation(customLocations.find(l => l !== locToRemove) || '');
    }
    if (editLocation === locToRemove) {
      setEditLocation('');
    }
  };

  const handleEditLocation = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCustomLocations(prev => {
      const updated = prev.map(l => l === oldName ? trimmed : l);
      localStorage.setItem('wivote_custom_locations', JSON.stringify(updated));
      return updated;
    });
    if (defaultLocation === oldName) {
      setDefaultLocation(trimmed);
    }
    if (editLocation === oldName) {
      setEditLocation(trimmed);
    }
    // Update vouchers that were tagged with this old preset location
    const matchedVouchers = vouchers.filter(v => (v.location || '').toLowerCase().trim() === oldName.toLowerCase().trim());
    if (matchedVouchers.length > 0) {
      bulkUpdateVouchers(matchedVouchers.map(v => v.id), { location: trimmed });
    }
    showToast(`Preset location "${oldName}" updated to "${trimmed}"`, 'success');
  };

  const handleResetPresetLocations = () => {
    setCustomLocations(DEFAULT_TERRITORIES);
    localStorage.setItem('wivote_custom_locations', JSON.stringify(DEFAULT_TERRITORIES));
    showToast('Preset locations reset to default territories', 'info');
  };

  const handleSaveAgentLocation = async (agentUid: string, newLocation: string, syncVouchers?: boolean) => {
    try {
      await editUserByMaster(agentUid, { location: newLocation });

      if (syncVouchers) {
        const assignedVoucherIds = vouchers
          .filter(v => v.assignedAgentId === agentUid && v.status === 'Assigned')
          .map(v => v.id);
        if (assignedVoucherIds.length > 0) {
          bulkUpdateVouchers(assignedVoucherIds, { location: newLocation });
        }
      }

      if (newLocation && !customLocations.some(l => l.toLowerCase() === newLocation.toLowerCase())) {
        handleAddLocation(newLocation);
      }

      const foundAgent = users.find(u => u.uid === agentUid);
      showToast(`Operating location for ${foundAgent?.name || 'agent'} updated to "${newLocation}"`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update agent location', 'error');
      throw err;
    }
  };

  // --- Handlers ---
  const handleDownloadSampleVouchersCSV = () => {
    const headers = ["Voucher code", "User group/Plan", "Price/Amount", "Period/Duration", "Location/place"];
    const rows = [
      ["VOU-7D-4411", "7Days_Unlimited", "35.00", "7 Days", "WiFi Zone A"],
      ["VOU-30D-9922", "30Days_Unlimited", "75.00", "30 Days", "WiFi Zone B"],
      ["VOU-24H-1100", "24Hours_Unlimited", "10.00", "24 Hours", "Kabwe Central"]
    ];
    const content = [headers.join(","), ...rows.map(r => r.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "wivote_sample_vouchers.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("✓ Sample vouchers CSV downloaded!");
  };

  const handleCSVImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    const res = uploadVouchers(csvText, defaultLocation, uploadNetworkName);
    setImportResult(res);
    if (res.success) {
      setCsvText('');
      setFileName(null);
      setUploadNetworkName('');
      setIsImportOpen(false);
      setImportResult(null);
      showToast(`✓ Successfully imported ${res.count || 0} vouchers into inventory!`, 'success');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = (e) => {
      try {
        if (isXlsx) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const convertedCsv = XLSX.utils.sheet_to_csv(worksheet);
          setCsvText(convertedCsv);
        } else {
          const text = e.target?.result as string;
          setCsvText(text);
        }
      } catch (err) {
        console.error(err);
        alert('Failed to parse file. Please check file format.');
      }
    };

    if (isXlsx) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleBulkPasteAssign = () => {
    if (!assignAgentId) {
      alert('Please select a target field agent.');
      return;
    }
    if (!bulkPasteInput.trim()) {
      alert('Please paste at least one voucher code.');
      return;
    }
    
    const { unallocated, alreadyAllocated } = bulkPasteSummary;

    if (alreadyAllocated.length > 0) {
      const summaryList = alreadyAllocated.map(v => 
        `• ${v.code} (${v.status === 'Sold' ? 'Sold' : `Allocated to ${v.assignedAgentName || 'an agent'}`})`
      ).join('\n');

      if (unallocated.length === 0) {
        alert(`🔒 Allocation Policy Enforced: Reallocation Blocked!\n\nAll ${alreadyAllocated.length} voucher(s) are already allocated or sold:\n\n${summaryList}\n\nVouchers already allocated cannot be reallocated either to the same agent or another agent. Please revoke existing allocations first.`);
        return;
      }

      const proceed = window.confirm(`🔒 Allocation Policy Enforced!\n\nThe following ${alreadyAllocated.length} voucher(s) are already allocated and cannot be reallocated without prior revocation:\n\n${summaryList}\n\nDo you want to proceed with assigning ONLY the ${unallocated.length} unallocated voucher(s)?`);
      if (!proceed) return;
    }

    if (unallocated.length === 0) {
      alert("No matching unallocated vouchers found for the specified codes.");
      return;
    }

    const res = assignVouchersToAgent(unallocated.map(v => v.id), assignAgentId);
    if (res && res.success) {
      if (activeAssignedRequest && (activeAssignedRequest.agentId === assignAgentId || activeAssignedRequest.agentName === agents.find(a => a.uid === assignAgentId)?.name)) {
        fulfillVoucherRequest(activeAssignedRequest.id);
        showToast(`✓ Assigned ${unallocated.length} voucher(s) and approved token request for ${activeAssignedRequest.agentName}!`, 'success');
        setActiveAssignedRequest(null);
      } else {
        const targetAgent = agents.find(a => a.uid === assignAgentId);
        const pendingForAgent = requests.find(r => r.status === 'Pending' && (r.agentId === assignAgentId || r.agentName === targetAgent?.name));
        if (pendingForAgent) {
          fulfillVoucherRequest(pendingForAgent.id);
          showToast(`✓ Assigned ${unallocated.length} voucher(s) and approved pending token request for ${targetAgent?.name || 'agent'}!`, 'success');
        }
      }
      setBulkPasteInput('');
      setIsBulkAssignOpen(false);
    }
  };

  const toggleSelectVoucher = (id: string) => {
    setSelectedVouchers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isAllFilteredSelected = useMemo(() => {
    return filteredVouchers.length > 0 && filteredVouchers.every(v => selectedVouchers.includes(v.id));
  }, [filteredVouchers, selectedVouchers]);

  const toggleAllFiltered = () => {
    if (isAllFilteredSelected) {
      const filteredIds = filteredVouchers.map(v => v.id);
      setSelectedVouchers(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      const filteredIds = filteredVouchers.map(v => v.id);
      setSelectedVouchers(prev => {
        const next = [...prev];
        filteredIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    const filteredIds = filteredVouchers.map(v => v.id);
    setSelectedVouchers(prev => {
      const next = [...prev];
      filteredIds.forEach(id => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });
  };

  const invertSelection = () => {
    const filteredIds = filteredVouchers.map(v => v.id);
    setSelectedVouchers(prev => {
      const nextUnfiltered = prev.filter(id => !filteredIds.includes(id));
      const filteredUnselected = filteredIds.filter(id => !prev.includes(id));
      return [...nextUnfiltered, ...filteredUnselected];
    });
    showToast("✓ Voucher selection inverted", "success");
  };

  const handleBulkDelete = () => {
    if (selectedVouchers.length === 0) return;
    
    // Categorize selected vouchers for a clear breakdown warning
    const selectedList = vouchers.filter(v => selectedVouchers.includes(v.id));
    const unusedCount = selectedList.filter(v => v.status === 'Unused').length;
    const assignedCount = selectedList.filter(v => v.status === 'Assigned').length;
    const soldCount = selectedList.filter(v => v.status === 'Sold').length;

    let warningMessage = `⚠️ CRITICAL WARNING: BULK DELETION ⚠️\n\nYou are about to permanently delete ${selectedVouchers.length} vouchers from your active catalog.\n\n`;
    warningMessage += `Selection Breakdown:\n`;
    warningMessage += `• Unused: ${unusedCount}\n`;
    if (assignedCount > 0) {
      warningMessage += `• Assigned: ${assignedCount} (⚠️ WARNING: Deleting active field assignments will disrupt agent operations!)\n`;
    }
    if (soldCount > 0) {
      warningMessage += `• Sold: ${soldCount} (⚠️ WARNING: Deleting sold vouchers will delete active sales/ledger historical records!)\n`;
    }
    
    warningMessage += `\nThis action is IRREVERSIBLE and will permanently erase these items from the database.`;
    warningMessage += `\n\nTo proceed with deletion, please type the phrase "DELETE ALL" in the box below:`;

    const userInput = window.prompt(warningMessage);
    if (userInput === 'DELETE ALL') {
      bulkDeleteVouchers(selectedVouchers);
      setSelectedVouchers([]);
    } else if (userInput !== null) {
      alert('Bulk deletion cancelled. Confirmation word did not match.');
    }
  };

  const filteredAllocatedVouchers = useMemo(() => {
    return filteredVouchers.filter(v => (v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold');
  }, [filteredVouchers]);

  const areAllAllocatedSelected = useMemo(() => {
    return filteredAllocatedVouchers.length > 0 && filteredAllocatedVouchers.every(v => selectedVouchers.includes(v.id));
  }, [filteredAllocatedVouchers, selectedVouchers]);

  const toggleSelectAllAllocated = () => {
    const allocatedIds = filteredAllocatedVouchers.map(v => v.id);
    if (allocatedIds.length === 0) {
      showToast('No allocated vouchers in current filtered view to select.', 'info');
      return;
    }
    if (areAllAllocatedSelected) {
      setSelectedVouchers(prev => prev.filter(id => !allocatedIds.includes(id)));
    } else {
      setSelectedVouchers(prev => {
        const next = [...prev];
        allocatedIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  const selectedAllocatedVouchers = useMemo(() => {
    return activeVouchers.filter(v => selectedVouchers.includes(v.id) && (v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold');
  }, [activeVouchers, selectedVouchers]);

  const handleMassRevokeOneClick = () => {
    if (selectedAllocatedVouchers.length > 0) {
      openRevokeModal(selectedAllocatedVouchers);
    } else if (filteredAllocatedVouchers.length > 0) {
      openRevokeModal(filteredAllocatedVouchers);
    } else {
      showToast('No allocated vouchers found to revoke.', 'info');
    }
  };

  const openRevokeModal = (vouchersList: Voucher[], queryToResolve?: FeedbackMessage) => {
    const eligible = vouchersList.filter(v => (v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold');
    if (eligible.length === 0) {
      showToast('No active agent allocations found to revoke among the selected vouchers.', 'info');
      return;
    }
    setVouchersToRevoke(eligible);
    setRevokeReasonInput(queryToResolve ? `Agent query resolution: ${queryToResolve.message.slice(0, 50)}` : '');
    setRevokeMode('pool');
    setRevokeAcknowledged(false);
    setActiveQueryToResolve(queryToResolve || null);
    setIsRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (vouchersToRevoke.length === 0) return;
    if (!revokeAcknowledged) {
      showToast('Mandatory explicit acknowledgement required before proceeding with revocation.', 'error');
      return;
    }
    setIsRevoking(true);
    try {
      const res = await revokeVoucherAllocation(
        vouchersToRevoke.map(v => v.id),
        revokeReasonInput.trim() || (activeQueryToResolve ? 'Agent query resolution' : 'Revoked by Workspace Master'),
        revokeMode
      );
      if (res && res.success) {
        setIsRevokeModalOpen(false);
        const revokedIds = vouchersToRevoke.map(v => v.id);
        setSelectedVouchers(prev => prev.filter(id => !revokedIds.includes(id)));

        // If this revocation was initiated from an agent query, resolve and post a reply
        if (activeQueryToResolve) {
          const actionWord = revokeMode === 'delete' ? 'permanently deleted' : 'returned to main inventory pool';
          replyToFeedback(
            activeQueryToResolve.id,
            `Admin Action: Referenced voucher(s) [${vouchersToRevoke.map(v => v.code).join(', ')}] revoked and ${actionWord}. Active agent link severed. Reason: ${revokeReasonInput.trim() || 'Resolved by admin'}`,
            'Resolved'
          );
        }

        setVouchersToRevoke([]);
        setRevokeReasonInput('');
        setRevokeAcknowledged(false);
        setActiveQueryToResolve(null);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to revoke voucher allocation.', 'error');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleBulkRevoke = () => {
    const toRevoke = activeVouchers.filter(v => selectedVouchers.includes(v.id) && (v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold');
    if (toRevoke.length === 0) {
      alert('None of the selected vouchers have an active agent allocation to revoke.');
      return;
    }
    openRevokeModal(toRevoke);
  };

  const handleBulkUnassign = () => {
    handleBulkRevoke();
  };

  const handleBulkChangePrice = () => {
    const price = parseFloat(bulkPriceInput);
    if (isNaN(price) || price < 0) {
      showToast('Please enter a valid price amount.', 'error');
      return;
    }
    if (selectedVouchers.length === 0) {
      showToast('Please select at least one voucher to update.', 'info');
      return;
    }

    const selectedList = vouchers.filter(v => selectedVouchers.includes(v.id));
    const soldList = selectedList.filter(v => v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt);
    const unsoldIds = selectedList.filter(v => !(v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt)).map(v => v.id);

    if (soldList.length > 0) {
      // Sold vouchers detected: prompt admin with immunization confirmation safeguard
      setBulkSoldConfirmModal({
        type: 'price',
        price,
        totalCount: selectedList.length,
        unsoldIds,
        soldIds: soldList.map(v => v.id),
        soldVouchers: soldList
      });
      return;
    }

    bulkUpdateVouchers(selectedVouchers, { price });
    showToast(`✓ Updated price to $${price.toFixed(2)} for ${selectedVouchers.length} unsold vouchers`, 'success');
    setBulkPriceInput('');
    setSelectedVouchers([]);
  };

  const handleBulkChangePlan = () => {
    const newPlan = bulkPlanInput.trim();
    if (!newPlan) {
      showToast('Please enter a plan name.', 'error');
      return;
    }
    if (selectedVouchers.length === 0) {
      showToast('Please select at least one voucher to update.', 'info');
      return;
    }

    const selectedList = vouchers.filter(v => selectedVouchers.includes(v.id));
    const soldList = selectedList.filter(v => v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt);
    const unsoldIds = selectedList.filter(v => !(v.status === 'Sold' || (v.status as any) === 'sold' || !!v.soldAt)).map(v => v.id);

    if (soldList.length > 0) {
      // Sold vouchers detected: prompt admin with immunization confirmation safeguard
      setBulkSoldConfirmModal({
        type: 'plan',
        plan: newPlan,
        totalCount: selectedList.length,
        unsoldIds,
        soldIds: soldList.map(v => v.id),
        soldVouchers: soldList
      });
      return;
    }

    bulkUpdateVouchers(selectedVouchers, { plan: newPlan });
    showToast(`✓ Updated plan to "${newPlan}" for ${selectedVouchers.length} unsold vouchers`, 'success');
    setBulkPlanInput('');
    setSelectedVouchers([]);
  };

  const handleBulkChangeLocation = () => {
    bulkUpdateVouchers(selectedVouchers, { location: bulkLocationInput.trim() });
    setBulkLocationInput('');
    setSelectedVouchers([]);
  };

  const handleBulkChangeSsid = () => {
    bulkUpdateVouchers(selectedVouchers, { networkName: bulkSsidInput.trim() });
    setBulkSsidInput('');
    setSelectedVouchers([]);
  };

  /**
   * Intelligently preselects unused vouchers for the requested plan and agent,
   * opens the voucher assignment panel, and links the pending token request.
   * (Only when vouchers have been assigned will approval status change to approved).
   */
  const handleGoToRequest = (request: VoucherRequest) => {
    const planQuery = (request.plan || '').trim().toLowerCase();

    // 1. Gather all genuinely unused vouchers (not assigned, not sold, not archived)
    const unusedPool = activeVouchers.filter(v => 
      v.status === 'Unused' && 
      !v.assignedAgentId && 
      !v.archived
    );

    // 2. Intelligent plan matching: exact match first
    let candidates = unusedPool.filter(v => v.plan.trim().toLowerCase() === planQuery);

    // Fallback: substring or normalized match
    if (candidates.length === 0) {
      candidates = unusedPool.filter(v => 
        v.plan.toLowerCase().includes(planQuery) || planQuery.includes(v.plan.toLowerCase())
      );
    }

    // Fallback: if still none, fall back to any available unused vouchers
    if (candidates.length === 0) {
      candidates = unusedPool;
    }

    // 3. Slice up to the requested quantity
    const countToTake = Math.min(request.quantity, candidates.length);
    const selectedToAssign = candidates.slice(0, countToTake);
    const selectedIds = selectedToAssign.map(v => v.id);

    // 4. Intelligently map agent: find agent by id or name
    let targetAgentId = request.agentId;
    const targetAgent = agents.find(
      a => a.uid === request.agentId || a.name.toLowerCase() === (request.agentName || '').toLowerCase()
    );
    if (targetAgent) {
      targetAgentId = targetAgent.uid;
    }

    // 5. Populate assignment panel state
    setSelectedVouchers(selectedIds);
    setBulkAssignAgentId(targetAgentId);
    setBulkAction('agent');
    setIsBulkOptionsOpen(true);
    setActiveAssignedRequest(request);

    // 6. Close the approval modal so admin is focused on assignment panel
    setIsTokenRequestApprovalOpen(false);

    // 7. Informative feedback
    if (selectedIds.length === request.quantity) {
      showToast(`✓ Preselected ${selectedIds.length} unused ${request.plan} vouchers for ${request.agentName}. Click 'Assign' to complete assignment and approve request!`, 'info');
    } else if (selectedIds.length > 0) {
      showToast(`⚠️ Preselected all ${selectedIds.length} available unused vouchers for ${request.agentName} (Requested: ${request.quantity}). Click 'Assign' to complete assignment and approve.`, 'info');
    } else {
      showToast(`⚠️ No unused stock found for "${request.plan}". Please generate or upload vouchers before assigning to ${request.agentName}.`, 'error');
    }

    // 8. Smooth scroll into the assignment panel
    setTimeout(() => {
      const panelEl = document.getElementById('panel-voucher-bulk-actions') || 
                      document.getElementById('bar-selected-vouchers-minimal') ||
                      document.getElementById('voucher-inventory-section');
      if (panelEl) {
        panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
  };

  const handleBulkAssignToAgent = () => {
    if (!bulkAssignAgentId) {
      alert('Please select an agent to assign the vouchers to.');
      return;
    }

    const selectedList = activeVouchers.filter(v => selectedVouchers.includes(v.id));
    const alreadyAllocated = selectedList.filter(v => v.status === 'Assigned' || !!v.assignedAgentId || v.status === 'Sold');

    if (alreadyAllocated.length > 0) {
      const details = alreadyAllocated.map(v => 
        `• ${v.code} (${v.status === 'Sold' ? 'Already Sold' : `Allocated to ${v.assignedAgentName || 'an agent'}`})`
      ).join('\n');

      const unallocated = selectedList.filter(v => v.status !== 'Assigned' && !v.assignedAgentId && v.status !== 'Sold');
      if (unallocated.length === 0) {
        alert(`🔒 Allocation Policy Enforced: Reallocation Blocked!\n\nAll ${selectedVouchers.length} selected voucher(s) are already allocated or sold:\n\n${details}\n\nVouchers already allocated cannot be reallocated either to the same agent or another agent. To reassign, the Workspace Master must first revoke the allocation.`);
        return;
      }

      const proceed = window.confirm(`🔒 Allocation Policy Enforced!\n\nThe following ${alreadyAllocated.length} voucher(s) are already allocated and cannot be reallocated without prior revocation:\n\n${details}\n\nDo you want to proceed with assigning ONLY the ${unallocated.length} genuinely unallocated voucher(s)?`);
      if (!proceed) return;

      const partialResult = assignVouchersToAgent(unallocated.map(v => v.id), bulkAssignAgentId);
      if (partialResult && partialResult.success) {
        // (Only when vouchers have been assigned) the approval status immediately changes to approved
        if (activeAssignedRequest) {
          fulfillVoucherRequest(activeAssignedRequest.id);
          showToast(`✓ Assigned ${unallocated.length} voucher(s) to ${activeAssignedRequest.agentName} and immediately APPROVED Token Request!`, 'success');
          setActiveAssignedRequest(null);
        } else {
          const targetAgent = agents.find(a => a.uid === bulkAssignAgentId);
          const pendingForAgent = requests.find(r => r.status === 'Pending' && (r.agentId === bulkAssignAgentId || r.agentName === targetAgent?.name));
          if (pendingForAgent) {
            fulfillVoucherRequest(pendingForAgent.id);
            showToast(`✓ Assigned ${unallocated.length} voucher(s) to ${targetAgent?.name || 'agent'} and approved pending token request!`, 'success');
          }
        }
        setBulkAssignAgentId('');
        setSelectedVouchers([]);
        setIsBulkOptionsOpen(false);
      }
      return;
    }

    const result = assignVouchersToAgent(selectedVouchers, bulkAssignAgentId);
    if (result && result.success) {
      // (Only when vouchers have been assigned) the approval status immediately changes to approved
      if (activeAssignedRequest) {
        fulfillVoucherRequest(activeAssignedRequest.id);
        showToast(`✓ Assigned ${selectedVouchers.length} voucher(s) to ${activeAssignedRequest.agentName} and immediately APPROVED Token Request!`, 'success');
        setActiveAssignedRequest(null);
      } else {
        const targetAgent = agents.find(a => a.uid === bulkAssignAgentId);
        const pendingForAgent = requests.find(r => r.status === 'Pending' && (r.agentId === bulkAssignAgentId || r.agentName === targetAgent?.name));
        if (pendingForAgent) {
          fulfillVoucherRequest(pendingForAgent.id);
          showToast(`✓ Assigned ${selectedVouchers.length} voucher(s) to ${targetAgent?.name || 'agent'} and approved pending token request!`, 'success');
        }
      }
      setBulkAssignAgentId('');
      setSelectedVouchers([]);
      setIsBulkOptionsOpen(false);
    }
  };

  const handleSingleAssign = (voucherId: string, agentId: string) => {
    const v = activeVouchers.find(x => x.id === voucherId);
    if (v && (v.status === 'Assigned' || v.assignedAgentId || v.status === 'Sold')) {
      alert(`🔒 Allocation Policy Enforced: Voucher ${v.code} is already allocated to ${v.assignedAgentName || 'an agent'} (Status: ${v.status}). Vouchers already allocated cannot be reallocated either to the same agent or another agent. Please revoke the existing allocation first if you wish to reassign.`);
      return;
    }
    assignVouchersToAgent([voucherId], agentId);
  };

  const handleVoucherUpdateSubmit = () => {
    if (!editVoucher) return;
    updateVoucher(editVoucher.id, {
      price: newPrice,
      location: editLocation,
      plan: editPlan,
      networkName: editNetworkName
    });
    setEditVoucher(null);
  };

  const handleLegacyApprove = (id: string) => {
    const price = legacyPrices[id];
    if (price === undefined || price <= 0 || isNaN(price)) {
      showToast("Please provide a valid requested monthly price first.", "error");
      return;
    }
    
    const leaseDays = legacyLeaseDays[id] || 30;

    // Automatically set approval gates
    setLegacyCheckedAdd(prev => ({ ...prev, [id]: true }));
    setLegacyCheckedApprove(prev => ({ ...prev, [id]: true }));

    approveLegacyDevice(id, price, leaseDays);
  };

  useEffect(() => {
    const handleJumpToBroadcast = (e: any) => {
      setTimeout(() => {
        const notifId = e.detail?.notifId;
        const targetEl = (notifId ? document.getElementById(`broadcast-notice-${notifId}`) : null) || document.getElementById('admin-notice-board');
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.add('ring-4', 'ring-indigo-500', 'shadow-2xl');
          setTimeout(() => {
            targetEl.classList.remove('ring-4', 'ring-indigo-500', 'shadow-2xl');
          }, 3000);
        }
      }, 150);
    };

    window.addEventListener('wivote:navigate-to-broadcast', handleJumpToBroadcast);
    return () => window.removeEventListener('wivote:navigate-to-broadcast', handleJumpToBroadcast);
  }, []);

  const handlePostNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivationMsg.trim()) return;

    if (broadcastTargetAudience === 'SPECIFIC' && broadcastSelectedAgentIds.length === 0) {
      showToast("⚠️ Please select at least one agent for this targeted notice.", "error");
      return;
    }

    const broadcastTargetNames = agents
      .filter(a => broadcastSelectedAgentIds.includes(a.uid))
      .map(a => a.name);

    addNotification(motivationMsg.trim(), {
      targetAudience: broadcastTargetAudience,
      targetAgentIds: broadcastTargetAudience === 'SPECIFIC' ? broadcastSelectedAgentIds : [],
      targetAgentNames: broadcastTargetAudience === 'SPECIFIC' ? broadcastTargetNames : [],
      isBroadcast: true,
      isActive: broadcastPublishImmediately
    });

    setMotivationMsg('');
    setBroadcastSelectedAgentIds([]);
    showToast(
      broadcastPublishImmediately
        ? (broadcastTargetAudience === 'ALL'
          ? "✓ Notice broadcasted to ALL agents!"
          : `✓ Targeted notice broadcasted to ${broadcastTargetNames.length} selected agent(s)!`)
        : "✓ Notice saved as draft (inactive) — you can publish it anytime!",
      "success"
    );
  };

  const handleDeleteWithPrecaution = (id: string, code: string, status: string) => {
    const isUnused = status === 'Unused';
    const message = isUnused
      ? `Are you sure you want to delete the unused voucher "${code}"? This will permanently remove it from the catalog.`
      : `⚠️ WARNING: Voucher "${code}" is currently marked as [${status}].\n\nDeleting this voucher will permanently erase it and may disrupt active field sales operations.\n\nAre you absolutely sure you want to proceed with deleting this voucher?`;
    
    if (window.confirm(message)) {
      deleteVoucher(id);
    }
  };

  // RBAC Security Policy Guard: Operations management is strictly restricted to Workspace Masters
  if (!canAccessWorkspaceMaster(currentUser)) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 min-h-[50vh]">
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
            Operations management, bulk uploads, stock assignment, and financial reconciliation are strictly reserved for Workspace Masters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 transition-all duration-300 w-full max-w-full min-w-0 overflow-x-hidden`}>
      {/* Workspace Plan Tier Real-Time Live Status Bar */}
      {activeWorkspace && (
        <div className={`p-4 border rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className={`p-2.5 rounded-2xl text-white shadow-md ${
              activeWorkspace?.subscriptionTier === 'Lithium'
                ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                : activeWorkspace?.subscriptionTier === 'Gold'
                ? 'bg-gradient-to-br from-amber-500 to-yellow-600'
                : 'bg-gradient-to-br from-sky-400 to-blue-600'
            }`}>
              <Star className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`text-base font-black font-display tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  {activeWorkspace?.name || 'Workspace Terminal'}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono uppercase tracking-wider border ${
                  activeWorkspace?.subscriptionTier === 'Lithium'
                    ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                    : activeWorkspace?.subscriptionTier === 'Gold'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                    : 'bg-sky-500/10 text-sky-500 border-sky-500/30'
                }`}>
                  {activeWorkspace?.subscriptionTier || 'Starter'} Plan
                </span>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono uppercase border ${
                  activeWorkspace?.isActive !== false
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-500 border-red-500/30'
                }`}>
                  {activeWorkspace?.isActive !== false ? 'Active Lease' : 'Suspended'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Real-time sync active &bull; Agent Quota:{' '}
                {agents.length} / {activeWorkspace?.subscriptionTier === 'Lithium' ? '15' : activeWorkspace?.subscriptionTier === 'Gold' ? '7' : '3'}
                {activeWorkspace?.expiresAt ? ` &bull; Lease Renewal: ${new Date(activeWorkspace.expiresAt).toLocaleDateString()}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
            {/* Global Force Push Local Data Button */}
            <button
              type="button"
              onClick={() => forcePushLocalToGlobalDB?.()}
              className="h-9 px-3.5 rounded-xl text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              title="Push all locally stored sales, customer names, & devices on this device to the central global database"
            >
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
              <span>Push Local Data to Global DB</span>
            </button>

            {/* Workspace Snapshot Download & Restoration Button */}
            <button
              type="button"
              onClick={openSnapshotModal}
              className="h-9 px-3.5 rounded-xl text-xs font-bold font-mono bg-sky-600 hover:bg-sky-700 text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              title="Download or restore snapshot of this workspace (.json)"
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span>Workspace Snapshot</span>
            </button>

            {/* Dedicated Customer List Button in Admin Dashboard */}
            <button
              id="btn-admin-customer-list"
              data-testid="customer-list-button"
              type="button"
              onClick={() => {
                setLoyaltyModalInitialTab('customers');
                setIsLoyaltyModalOpen(true);
              }}
              className="h-9 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 rounded-xl flex items-center justify-center gap-2 shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
              title="Open universal Customer List & Registry: search, add, edit, or delete customer records"
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Customer List</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/25 text-white font-mono font-bold">
                {workspaceCustomers?.length || 0}
              </span>
            </button>

            {/* Sales Cycle & Cash Close Management Button */}
            <button
              id="btn-admin-header-cash-close"
              data-testid="admin-header-cash-close-button"
              type="button"
              onClick={() => setIsCashCloseScheduleModalOpen(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-xs transition cursor-pointer"
              title="Sales Cycle & Cash Close Rules: Set timings, minimum thresholds, commission matching, and request agent cash close"
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Sales Cycle / Cash Close</span>
            </button>

            {/* Captive Portal Gateway URLs Manager Button */}
            <button
              id="btn-admin-header-captive-portal"
              data-testid="admin-header-captive-portal-button"
              type="button"
              onClick={() => setIsCaptivePortalModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-xs transition cursor-pointer shrink-0"
              title="Manage, edit, and delete captive portal URLs and gateway login pages"
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span>Captive Portal URLs</span>
            </button>

            <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Real-Time Sync</span>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Inventory Summary Widget */}
      <div className={`p-6 border rounded-3xl mb-6 shadow-xs relative overflow-hidden transition-all duration-300 ${
        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-150 dark:border-slate-800/80">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-2xl shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className={`text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Inventory Summary
                </h3>
                {/* Visual Cue Badge for Metrics Source */}
                {isUsingSnapshotMirror ? (
                  <div
                    title="Metrics are currently standing in from the latest DB push snapshot (Vault) while live records hydrate."
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 animate-pulse shadow-xs"
                  >
                    <Camera className="w-3 h-3 text-amber-500" />
                    <span>SNAPSHOT MIRROR</span>
                    {snapshotFormattedTime && <span className="opacity-75 font-normal">({snapshotFormattedTime})</span>}
                  </div>
                ) : (
                  <div
                    title="Direct real-time metrics connected to Firestore and Global DB."
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 shadow-xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>LIVE GLOBAL DB</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {isUsingSnapshotMirror
                  ? 'Showing verified metrics from last DB push stand-in vault • Live sync in progress...'
                  : 'Comprehensive state verification & financial ledger validation'}
              </p>
            </div>
          </div>
          
          {/* Parent Metric: Total Inventory */}
          <div className={`px-4 sm:px-6 py-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between sm:justify-start gap-3 sm:gap-8 transition-all duration-300 w-full min-w-0 overflow-hidden box-border ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800/60'
          }`}>
            <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 min-w-0">
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider shrink-0">Total Vouchers</span>
              <MetricSkeleton isLoading={isMetricsSyncing} width="w-16" height="h-7">
                <span className={`text-xl sm:text-2xl font-black font-display font-mono tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  {displayInventorySummary.total.count.toLocaleString()}
                </span>
              </MetricSkeleton>
            </div>
            <div className="hidden sm:block h-6 w-[1px] bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 min-w-0">
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider shrink-0">Total Value</span>
              <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-7">
                <span className={`text-xl sm:text-2xl font-black font-display font-mono tabular-nums text-indigo-600 dark:text-indigo-400 truncate`}>
                  ${(displayInventorySummary.total.value || 0).toFixed(2)}
                </span>
              </MetricSkeleton>
            </div>
          </div>
        </div>

        {/* Child Components: Grid for the three inventory pools */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 pt-6 w-full max-w-full">
          {/* 1. Unused / Unassigned */}
          <div className={`p-4 border rounded-2xl relative overflow-hidden transition-all duration-300 min-w-0 w-full ${
            theme === 'light' ? 'bg-sky-50/20 border-sky-100 hover:border-sky-200' : 'bg-slate-950 border-slate-850 hover:border-sky-950'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="p-2 bg-sky-500/10 text-sky-500 border border-sky-500/20 rounded-xl shrink-0">
                <Wifi className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md shrink-0">
                Unassigned
              </span>
            </div>
            <div className="mt-3.5 sm:mt-4 min-w-0">
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center justify-between gap-1 flex-wrap min-w-0">
                <span className="truncate">Unused Total</span>
                {isUsingSnapshotMirror && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">Snapshot</span>
                )}
              </div>
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-16" height="h-7">
                <div className={`text-xl sm:text-2xl font-black font-display font-mono mt-1 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  {displayInventorySummary.unused.count.toLocaleString()}
                </div>
              </MetricSkeleton>
              <div className="flex items-center justify-between sm:justify-start gap-1.5 mt-2 flex-wrap min-w-0">
                <span className="text-[10px] text-slate-500 font-mono shrink-0">Potential Value:</span>
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-16" height="h-4">
                  <span className="text-xs font-black font-mono font-display text-sky-600 dark:text-sky-400 tabular-nums shrink-0">
                    ${(displayInventorySummary.unused.value || 0).toFixed(2)}
                  </span>
                </MetricSkeleton>
              </div>
            </div>
          </div>

          {/* 2. Assigned to Agents */}
          <div className={`p-4 border rounded-2xl relative overflow-hidden transition-all duration-300 min-w-0 w-full ${
            theme === 'light' ? 'bg-amber-50/20 border-amber-100 hover:border-amber-200' : 'bg-slate-950 border-slate-850 hover:border-amber-950'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="p-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0">
                In Field
              </span>
            </div>
            <div className="mt-3.5 sm:mt-4 min-w-0">
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center justify-between gap-1 flex-wrap min-w-0">
                <span className="truncate">Assigned Total</span>
                {isUsingSnapshotMirror && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">Snapshot</span>
                )}
              </div>
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-16" height="h-7">
                <div className={`text-xl sm:text-2xl font-black font-display font-mono mt-1 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  {displayInventorySummary.assigned.count.toLocaleString()}
                </div>
              </MetricSkeleton>
              <div className="flex items-center justify-between sm:justify-start gap-1.5 mt-2 flex-wrap min-w-0">
                <span className="text-[10px] text-slate-500 font-mono shrink-0">Expected Value:</span>
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-16" height="h-4">
                  <span className="text-xs font-black font-mono font-display text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                    ${(displayInventorySummary.assigned.value || 0).toFixed(2)}
                  </span>
                </MetricSkeleton>
              </div>
            </div>
          </div>

          {/* 3. Sold / Used */}
          <div className={`p-4 border rounded-2xl relative overflow-hidden transition-all duration-300 min-w-0 w-full ${
            theme === 'light' ? 'bg-emerald-50/20 border-emerald-100 hover:border-emerald-200' : 'bg-slate-950 border-slate-850 hover:border-emerald-950'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md shrink-0">
                Sold / Used
              </span>
            </div>
            <div className="mt-3.5 sm:mt-4 min-w-0">
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center justify-between gap-1 flex-wrap min-w-0">
                <span className="truncate">Sold / Used Total</span>
                {isUsingSnapshotMirror && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">Snapshot</span>
                )}
              </div>
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-16" height="h-7">
                <div className={`text-xl sm:text-2xl font-black font-display font-mono mt-1 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  {displayInventorySummary.sold.count.toLocaleString()}
                </div>
              </MetricSkeleton>
              <div className="flex items-center justify-between sm:justify-start gap-1.5 mt-2 flex-wrap min-w-0">
                <span className="text-[10px] text-slate-500 font-mono shrink-0">Realized Profit:</span>
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-16" height="h-4">
                  <span className="text-xs font-black font-mono font-display text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                    ${(displayInventorySummary.sold.value || 0).toFixed(2)}
                  </span>
                </MetricSkeleton>
              </div>
            </div>
          </div>
        </div>
        
        {/* Giveaway settings details helper line if enabled */}
        {vouchers.some(v => isVoucherFree(v, giveawaySettings)) && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-850/50 flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
            <Gift className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span>
              Note: {vouchers.filter(v => isVoucherFree(v, giveawaySettings) && v.status !== 'Sold').length} free/giveaway promo tokens are currently excluded from active inventory potential valuations.
            </span>
          </div>
        )}
      </div>

      {/* Dynamic Global Stats Bento Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-4 border rounded-2xl flex items-center gap-4 shadow-xs relative overflow-hidden transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="p-2.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="truncate">Gross Profits</span>
              {isUsingSnapshotMirror && (
                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">Snapshot</span>
              )}
            </div>
            <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-20" height="h-7">
              <div className={`text-xl font-black font-display mt-0.5 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>${(displayTotalProfits || 0).toFixed(2)}</div>
            </MetricSkeleton>
            <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 truncate">Fully tallying used ledgers</div>
          </div>
        </div>

        <div className={`p-4 border rounded-2xl flex items-center gap-4 shadow-xs transition-all duration-300 min-w-0 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="p-2.5 bg-sky-500/10 text-sky-500 border border-sky-500/20 rounded-xl shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="truncate">Enrolled Agents</span>
              {isUsingSnapshotMirror && (
                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">Snapshot</span>
              )}
            </div>
            <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-12" height="h-7">
              <div className={`text-xl font-black font-display mt-0.5 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>{displayTotalAgents}</div>
            </MetricSkeleton>
            <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">Active field sales agents</div>
          </div>
        </div>

        {/* Dedicated Customer Registry Card in Bento Grid */}
        <div 
          onClick={() => {
            setLoyaltyModalInitialTab('customers');
            setIsLoyaltyModalOpen(true);
          }}
          className={`p-4 border rounded-2xl flex items-center justify-between shadow-xs transition-all duration-300 cursor-pointer hover:border-amber-400 group min-w-0 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800 hover:bg-amber-50/30' : 'bg-slate-900 border-slate-800 text-white hover:bg-slate-850'
          }`}
          title="Click to view and manage complete Customer Registry List"
        >
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="truncate">Customer Registry</span>
                {isUsingSnapshotMirror && (
                  <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">Snapshot</span>
                )}
              </div>
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-12" height="h-7">
                <div className={`text-xl font-black font-display mt-0.5 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  {displayCustomerCount}
                </div>
              </MetricSkeleton>
              <div className="mt-1">
                <button
                  type="button"
                  className="bg-amber-500 hover:bg-amber-600 text-white font-mono font-bold text-[9px] px-2 py-0.5 rounded-lg transition-all duration-200 shadow-xs flex items-center gap-1 cursor-pointer group-hover:translate-x-0.5"
                >
                  <span>Open Customer List</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 border rounded-2xl flex items-center justify-between shadow-xs transition-all duration-300 relative overflow-hidden ${
          theme === 'light' 
            ? ((legacyDevices.some(ld => !ld.isApproved || ld.deletionRequested))
                ? 'bg-orange-50/50 border-orange-300 shadow-[0_0_15px_rgba(249,115,22,0.15)] animate-[pulse_2.5s_infinite_ease-in-out]' 
                : 'bg-white border-slate-200 text-slate-800')
            : ((legacyDevices.some(ld => !ld.isApproved || ld.deletionRequested))
                ? 'bg-orange-950/20 border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.2)] animate-[pulse_2.5s_infinite_ease-in-out]' 
                : 'bg-slate-900 border-slate-800 text-white')
        }`}>
          {/* Subtle glow layer */}
          {(legacyDevices.some(ld => !ld.isApproved || ld.deletionRequested)) && (
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-amber-500/5 pointer-events-none" />
          )}

          <div className="flex items-center gap-4 relative z-10 min-w-0 flex-1">
            <div className={`p-2.5 rounded-xl border shrink-0 transition-all duration-300 ${
              (legacyDevices.some(ld => !ld.isApproved || ld.deletionRequested))
                ? 'bg-orange-500/20 text-orange-500 border-orange-500/30'
                : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
            }`}>
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider truncate">Legacy Devices</div>
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-12" height="h-7">
                <div className={`text-xl font-black font-display mt-0.5 tabular-nums truncate ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  {displayLegacyDevicesCount}
                </div>
              </MetricSkeleton>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {legacyDevices.filter(ld => ld.deletionRequested).length > 0 && (
                  <span className="text-[9px] text-rose-600 dark:text-rose-400 font-mono flex items-center gap-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    {legacyDevices.filter(ld => ld.deletionRequested).length} deletion request(s)
                  </span>
                )}
                {legacyDevices.filter(ld => !ld.isApproved).length > 0 && (
                  <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono flex items-center gap-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {legacyDevices.filter(ld => !ld.isApproved).length} pending enrolment
                  </span>
                )}
                {expiredLegacyDevices.length > 0 ? (
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    {expiredLegacyDevices.length} expired (due for unenrolment)
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-mono">0 Expired</span>
                )}
              </div>
            </div>
          </div>

          {/* Unenroll / Manage Icon Action Trigger */}
          {(legacyDevices.some(ld => !ld.isApproved || ld.deletionRequested) || expiredLegacyDevices.length > 0) && (
            <button
              onClick={scrollToLegacyDevices}
              title="Click to manage pending enrolments, deletion requests, or unenrolments"
              className={`p-2 rounded-xl border transition-all duration-300 relative z-10 cursor-pointer ${
                legacyDevices.some(ld => ld.deletionRequested)
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/50 hover:scale-105 animate-pulse'
                  : expiredLegacyDevices.length > 0
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/40 hover:scale-105'
                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-50/20 hover:border-amber-500/40 hover:scale-105'
              }`}
            >
              {expiredLegacyDevices.length > 0 ? (
                <AlertOctagon className="w-5 h-5 animate-bounce" />
              ) : (
                <UserCheck className="w-5 h-5 animate-pulse" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Workspace Notice Board & Live Notifications (Excluding broadcasts since Admin is the sender) */}
      {notifications.filter(notif => !notif.isBroadcast).length > 0 && (
        <div 
          id="admin-notice-board"
          className={`p-4 border rounded-3xl transition-all duration-300 shadow-md ${
            theme === 'light' ? 'bg-indigo-50/40 border-indigo-200' : 'bg-indigo-950/20 border-indigo-500/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
              </span>
            </span>
            <h3 className={`text-xs font-black tracking-widest font-display uppercase ${theme === 'light' ? 'text-indigo-900' : 'text-indigo-400'}`}>
              Workspace Notice Board & Live Notifications
            </h3>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {notifications.filter(notif => !notif.isBroadcast).map((notif) => {
              const msg = notif.message || '';
              const isLegacy = msg.toLowerCase().includes('legacy') || msg.toLowerCase().includes('expired');
              const isUnread = !readNotificationIds.includes(notif.id);
              return (
                <div 
                  key={notif.id}
                  id={`broadcast-notice-${notif.id}`}
                  onClick={() => {
                    markNotificationAsRead(notif.id);
                    if (isLegacy) {
                      scrollToLegacyDevices();
                    }
                  }}
                  className={`p-3 rounded-2xl border text-xs flex justify-between items-center gap-3 transition-all cursor-pointer ${
                    isLegacy ? 'hover:border-rose-500/50 hover:bg-rose-500/5 hover:scale-[1.005]' : 'hover:scale-[1.005]'
                  } ${
                    isUnread
                      ? theme === 'light'
                        ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-400/30'
                        : 'bg-indigo-950/50 border-indigo-500/40 ring-1 ring-indigo-500/30'
                      : theme === 'light'
                        ? 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-800'
                        : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="flex flex-col gap-1 shrink-0">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold text-center ${
                        isLegacy
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse'
                          : notif.isBroadcast
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/10'
                      }`}>
                        {isLegacy ? 'LEGACY ALERT' : notif.isBroadcast ? 'BROADCAST' : 'SYSTEM'}
                      </span>
                      {notif.targetAudience === 'SPECIFIC' ? (
                        <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold text-center truncate max-w-[100px]" title={`Targeted to: ${notif.targetAgentNames?.join(', ') || 'selected agents'}`}>
                          🎯 {notif.targetAgentNames?.length ? `${notif.targetAgentNames.length} Agents` : 'Targeted'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold text-center">
                          🌐 All
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isUnread && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500 text-white font-black shrink-0">
                            NEW
                          </span>
                        )}
                        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded font-bold shrink-0 ${
                          notif.isActive !== false
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20'
                        }`}>
                          {notif.isActive !== false ? '● Live' : '○ Paused'}
                        </span>
                        {notif.targetAudience === 'SPECIFIC' && notif.targetAgentNames?.length && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-medium truncate">
                            Targeted: {notif.targetAgentNames.join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="font-medium leading-relaxed truncate sm:whitespace-normal mt-0.5">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-mono">
                        <span>By: {notif.senderName}</span>
                        <span>•</span>
                        <span>{new Date(notif.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notice Management Controls */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* 1. Toggle Show to All / Pause */}
                    {notif.isActive !== false ? (
                      <button
                        type="button"
                        title="Click to hide/pause from agent screens"
                        onClick={() => {
                          updateNotification(notif.id, { isActive: false });
                          showToast("Broadcast paused (hidden from agents)", "info");
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
                      >
                        <EyeOff className="w-3 h-3 text-amber-500" />
                        <span className="hidden sm:inline">Pause</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Click to broadcast live to target agents"
                        onClick={() => {
                          updateNotification(notif.id, { isActive: true, isBroadcast: true });
                          showToast("✓ Broadcast notice is now live on agent terminals!", "success");
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition shrink-0 shadow-xs"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Broadcast</span>
                      </button>
                    )}

                    {/* 2. Switch Audience (Show to all vs Target specific) */}
                    {notif.targetAudience === 'SPECIFIC' ? (
                      <button
                        type="button"
                        title="Change audience: Show to ALL agents"
                        onClick={() => {
                          updateNotification(notif.id, {
                            targetAudience: 'ALL',
                            targetAgentIds: [],
                            targetAgentNames: [],
                            isBroadcast: true
                          });
                          showToast("✓ Message updated to show to ALL agents!", "success");
                        }}
                        className="px-2 py-1 rounded-lg border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
                      >
                        <Globe className="w-3 h-3" />
                        <span className="hidden sm:inline">Show All</span>
                      </button>
                    ) : (
                      agents.length > 0 && (
                        <button
                          type="button"
                          title="Change audience: Target specific agents"
                          onClick={() => {
                            setEditingAudienceNotif(notif);
                            setEditNotifTargetAudience('SPECIFIC');
                            setEditNotifSelectedAgentIds(notif.targetAgentIds || []);
                          }}
                          className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
                        >
                          <Target className="w-3 h-3 text-sky-500" />
                          <span className="hidden sm:inline">Target</span>
                        </button>
                      )
                    )}

                    {/* 3. Delete Notice */}
                    <button
                      type="button"
                      title="Permanently delete this notice"
                      onClick={() => {
                        if (window.confirm("Permanently delete this notice from the board?")) {
                          deleteNotification(notif.id);
                          showToast("✓ Notice deleted", "info");
                        }
                      }}
                      className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isLegacy && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollToLegacyDevices();
                      }}
                      className="text-[10px] font-mono font-bold text-sky-500 hover:text-sky-400 underline shrink-0 cursor-pointer"
                    >
                      GO TO LIST →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* Main Grid: Data trends and Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className={`border rounded-3xl p-5 shadow-xl lg:col-span-2 transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 ${theme === 'light' ? 'text-emerald-600' : 'text-emerald-400'}`} />
              <h2 className={`text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Sales Trends by Location</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Last 7 Days</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#f1f5f9' : '#1e293b'} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                    borderColor: theme === 'light' ? '#cbd5e1' : '#334155',
                    borderRadius: '12px',
                    color: theme === 'light' ? '#1e293b' : '#ffffff'
                  }}
                  labelStyle={{ color: theme === 'light' ? '#475569' : '#94a3b8', fontFamily: 'monospace' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                {locations.map((loc, i) => {
                  const colors = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f43f5e'];
                  return (
                    <Bar
                      key={loc}
                      dataKey={loc}
                      stackId="a"
                      fill={colors[i % colors.length]}
                      radius={i === locations.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Scrollable Compact Agent List Leaderboard */}
        <div className={`border rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col max-h-[460px] sm:max-h-[380px] lg:max-h-[350px] transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className={`text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              Agent Leaderboard (Actual Sales)
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold uppercase shrink-0">
              Live
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 sm:pr-2 scrollbar-thin">
            {agentPerformance.map((agent, index) => {
              const hasUnclosed = (agent.unclosedCashFromPrevCycle ?? 0) > 0.01;
              return (
              <div
                key={agent.uid}
                className={`p-3 sm:p-3.5 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition-all duration-200 ease-out hover:scale-[1.01] hover:shadow-xs ${
                  hasUnclosed
                    ? theme === 'light'
                      ? 'bg-amber-50/70 border-orange-400 hover:bg-orange-50/90 hover:border-orange-500 shadow-orange-500/5 ring-1 ring-orange-500/30'
                      : 'bg-orange-950/20 border-orange-500/60 hover:bg-orange-950/40 hover:border-orange-400 ring-1 ring-orange-500/30'
                    : theme === 'light' 
                      ? 'bg-slate-50 border-slate-200/60 hover:bg-slate-100/70 hover:border-slate-300' 
                      : 'bg-slate-950 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                {/* Agent Identity & Mobile Action Header */}
                <div className="flex items-center justify-between gap-2.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`text-xs sm:text-sm font-mono font-black w-6 text-center shrink-0 ${hasUnclosed ? 'text-orange-500' : 'text-slate-400'}`}>
                      #{index + 1}
                    </span>
                    <div className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full overflow-hidden border shrink-0 ${hasUnclosed ? 'border-orange-500 ring-2 ring-orange-500/40' : 'border-slate-800'}`}>
                      <img referrerPolicy="no-referrer" src={agent.profilePic} alt={agent.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className={`text-xs sm:text-sm font-bold truncate ${hasUnclosed ? 'text-orange-600 dark:text-orange-400' : theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="truncate">{agent.cellNumber}</span>
                        <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAgentForLocation(agent);
                            setIsAgentLocationModalOpen(true);
                          }}
                          className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition cursor-pointer max-w-full truncate"
                          title="Click to edit agent operating location"
                        >
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{agent.location || 'Harare Central'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Print / Export Tokens button on mobile */}
                  <button
                    type="button"
                    onClick={() => handleOpenExportForAgent(agent.uid)}
                    className="sm:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition cursor-pointer shrink-0"
                    title={`Export / Print Tokens for ${agent.name}`}
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>

                {/* Mobile-Only Location Row */}
                <div className="flex sm:hidden items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAgentForLocation(agent);
                      setIsAgentLocationModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition cursor-pointer"
                    title="Click to edit agent operating location"
                  >
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{agent.location || 'Harare Central'}</span>
                  </button>
                </div>

                {/* Metrics Row (Bottom bar on mobile, right side on desktop) */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-200/60 dark:border-slate-800/60 sm:border-t-0 shrink-0">
                  {/* Goal % & Unclosed on mobile */}
                  <div className="flex sm:hidden flex-col items-start gap-0.5">
                    <span className="text-[10px] text-slate-500 font-mono uppercase font-semibold">
                      {agent.percentage}% of goal
                    </span>
                    {hasUnclosed && (
                      <span className="text-[9px] text-orange-600 dark:text-orange-400 font-mono font-bold">
                        Unclosed: ${agent.unclosedCashFromPrevCycle?.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Desktop Print Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenExportForAgent(agent.uid)}
                      className="hidden sm:inline-flex p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition cursor-pointer shrink-0"
                      title={`Export / Print Tokens for ${agent.name} (A4 2-Column PDF, CSV, Text, Print)`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1.5 font-mono">
                        <span className={`text-xs sm:text-sm font-bold ${theme === 'light' ? 'text-emerald-600' : 'text-emerald-400'}`}>
                          ${(agent.actualSales || 0).toFixed(2)}
                        </span>
                        {agent.prevMonthActualSales !== undefined && agent.prevMonthActualSales > 0 && (
                          <span className="text-[10px] text-slate-400/70 dark:text-slate-500/70 border-l border-slate-200 dark:border-slate-800 pl-1" title="Previous Month Sales">
                            Prev: ${(agent.prevMonthActualSales || 0).toFixed(0)}
                          </span>
                        )}
                      </div>
                      <div className="hidden sm:block text-[9px] text-slate-500 font-mono uppercase" title={`Current sales cycle goal achievement ($${(agent.actualSales || 0).toFixed(2)} of $${(agent.targetAmount || 0).toFixed(2)}). Strictly excludes previous sales cycle unclosed cash.`}>
                        {agent.percentage}% of goal
                      </div>
                      {hasUnclosed && (
                        <div className="hidden sm:block text-[8px] text-orange-600 dark:text-orange-400 font-mono font-bold mt-0.5">
                          Unclosed: ${agent.unclosedCashFromPrevCycle?.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );})}
          </div>
        </div>
      </div>

      {/* Bulk assignments, pasting input, and category indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-full min-w-0">
        {/* Main Column: Inventory Management */}
        <div className={`border rounded-3xl p-4 sm:p-6 shadow-xl lg:col-span-2 space-y-6 transition-all duration-300 w-full max-w-full min-w-0 overflow-x-hidden ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h2 className={`text-lg font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Voucher Inventory</h2>
                <p className="text-xs text-slate-400 font-mono">Organised by plan categories</p>
              </div>
              <div className={`flex rounded-xl p-0.5 border ml-2 shrink-0 ${
                theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setInventoryLayout('tiles')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    inventoryLayout === 'tiles'
                      ? theme === 'light' ? 'bg-white text-sky-600 shadow-xs' : 'bg-slate-800 text-sky-400 shadow-xs'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                  title="Compact Tile Layout"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setInventoryLayout('table')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    inventoryLayout === 'table'
                      ? theme === 'light' ? 'bg-white text-sky-600 shadow-xs' : 'bg-slate-800 text-sky-400 shadow-xs'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                  title="Table Layout"
                >
                  <TableProperties className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setIsImportOpen(true)}
                className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>Import Vouchers</span>
              </button>
              <button
                onClick={() => setIsBulkAssignOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Bulk Assignment</span>
              </button>
              <button
                id="btn-admin-giveaway-settings"
                type="button"
                onClick={() => setIsGiveawayModalOpen(true)}
                className={`font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer border ${
                  giveawaySettings?.isEnabled
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-emerald-500 shadow-emerald-600/25 ring-1 ring-emerald-400/50'
                    : theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Configure customer voucher giveaways: mark plans as free, exclude from inventory, and set daily agent limits"
              >
                <Gift className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span>Free Giveaways</span>
                {giveawaySettings?.isEnabled && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-emerald-800 font-mono font-black">
                    {giveawaySettings.freePlanNames?.length || 0} PLANS
                  </span>
                )}
              </button>
              <button
                id="btn-admin-token-request-approvals"
                type="button"
                onClick={() => setIsTokenRequestApprovalOpen(true)}
                className="bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer relative"
                title="Review administrator token requests, click 'Go to' to preselect unused vouchers for assignment, and approve upon assignment"
              >
                <Ticket className="w-3.5 h-3.5 shrink-0" />
                <span>Token Approvals</span>
                {sortedRequests.filter(r => r.status === 'Pending').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-mono font-extrabold animate-pulse">
                    {sortedRequests.filter(r => r.status === 'Pending').length}
                  </span>
                )}
              </button>
              <button
                id="btn-admin-cash-close-approvals"
                type="button"
                onClick={() => {
                  const pendingDrop = workspaceCashDrops.find(c => c.status === 'Pending' && !c.approvedAt);
                  if (pendingDrop) {
                    handleOpenCashDropApproval(pendingDrop);
                  } else {
                    setIsCashCloseScheduleModalOpen(true);
                  }
                }}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer relative"
                title="Review and approve pending cash close requests submitted by field agents"
              >
                <DollarSign className="w-3.5 h-3.5 shrink-0" />
                <span>Cash Close Approvals</span>
                {workspaceCashDrops.filter(c => c.status === 'Pending' && !c.approvedAt).length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-mono font-extrabold animate-pulse">
                    {workspaceCashDrops.filter(c => c.status === 'Pending' && !c.approvedAt).length}
                  </span>
                )}
              </button>
              <button
                id="btn-admin-sale-reversals"
                type="button"
                onClick={() => setIsReversalsModalOpen(true)}
                className="bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer relative"
                title="Review and approve agent transaction reversals for vouchers or legacy devices"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Sale Reversals</span>
                {pendingReversalsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-rose-700 font-mono font-extrabold animate-pulse">
                    {pendingReversalsCount}
                  </span>
                )}
              </button>
              <button
                id="btn-inventory-export-print-tokens"
                onClick={() => {
                  setExportModalAgentId(undefined);
                  setExportModalVoucherIds(undefined);
                  setIsExportModalOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
                title="Export or print tokens assigned to an agent (PDF, CSV, Text, Standard Print)"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Export / Print</span>
              </button>
              <button
                id="btn-inventory-scan-vouchers"
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
                title="Scan multiple voucher codes via high-speed text recognition camera"
              >
                <ScanLine className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                <span>Scan Vouchers</span>
              </button>
              <button
                id="btn-admin-customer-registry"
                data-testid="admin-customer-list-button"
                type="button"
                onClick={() => {
                  setLoyaltyModalInitialTab('customers');
                  setIsLoyaltyModalOpen(true);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
                title="Open universal Customer Registry & Customer List: search, add, edit, or delete customer records"
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Customer List</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/20 text-white font-mono font-bold">
                  {workspaceCustomers?.length || 0}
                </span>
              </button>
              <button
                id="btn-admin-cash-close-schedule"
                data-testid="admin-cash-close-schedule-button"
                type="button"
                onClick={() => setIsCashCloseScheduleModalOpen(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
                title="Manage Monthly Sales Cycle, Cash Close timings, minimum thresholds and agent requests"
              >
                <DollarSign className="w-3.5 h-3.5 shrink-0" />
                <span>Sales Cycle / Cash Close</span>
              </button>
              <button
                id="btn-admin-loyalty-rewards"
                type="button"
                onClick={() => {
                  setLoyaltyModalInitialTab('settings');
                  setIsLoyaltyModalOpen(true);
                }}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
                title="Manage Genius Customer Loyalty Program & Rewards Configuration"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Loyalty Rewards</span>
              </button>
              <button
                id="btn-admin-activity-logs"
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer"
                title="View agent actions, customer edits/deletions, and security audit trail"
              >
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>Activity Log</span>
                {auditLogs?.filter(l => l.category === 'customer').length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono font-bold">
                    {auditLogs.filter(l => l.category === 'customer').length}
                  </span>
                )}
              </button>
              <button
                id="btn-admin-workspace-backup"
                data-testid="admin-workspace-backup-button"
                type="button"
                onClick={() => setIsBackupModalOpen(true)}
                className={`font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 whitespace-nowrap cursor-pointer ${
                  isPushingToDb
                    ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse ring-2 ring-rose-400'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title={isPushingToDb ? 'Cloud Database Upload in Progress (Red Active Animation)...' : 'Continuous Workspace Database Backups & Instant Disaster Recovery'}
              >
                {isPushingToDb ? (
                  <Upload className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                ) : (
                  <Database className="w-3.5 h-3.5 shrink-0 text-emerald-100" />
                )}
                <span>{isPushingToDb ? 'Updating DB...' : 'DB Backups'}</span>
                {workspaceBackups && workspaceBackups.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono font-bold">
                    {workspaceBackups.length}
                  </span>
                )}
              </button>
              <button
                id="btn-admin-toggle-enforce-customer"
                type="button"
                onClick={toggleEnforceCustomerDetails}
                className={`font-semibold text-xs px-3 py-1.5 h-8 min-h-[32px] rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 cursor-pointer border whitespace-nowrap ${
                  loyaltySettings?.enforceCustomerDetailsOnSale
                    ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-500'
                    : theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title={
                  loyaltySettings?.enforceCustomerDetailsOnSale
                    ? 'Customer Detail Input: ENFORCED for all agents during sales (Click to make optional)'
                    : 'Customer Detail Input: OPTIONAL with skip confirmation for agents (Click to enforce)'
                }
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">Detail Input: <strong>{loyaltySettings?.enforceCustomerDetailsOnSale ? 'Enforced' : 'Optional'}</strong></span>
              </button>
            </div>
          </div>

          {/* Alert banner if field agents submitted transaction reversal requests */}
          {pendingReversalsCount > 0 && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3 text-xs font-mono shadow-xs animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
                <span>
                  <strong>Action Required:</strong> {pendingReversalsCount} sale reversal request(s) submitted by field agents require your approval. Review vouchers or devices and confirm or decline.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsReversalsModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-[11px] transition shrink-0 cursor-pointer shadow-xs"
              >
                Review Reversals
              </button>
            </div>
          )}

          {/* Search, Filter bar */}
          <div className="flex flex-col gap-3 w-full min-w-0">
            <div className="flex flex-col gap-3 w-full min-w-0">
              <div className="flex flex-col md:flex-row gap-2.5 w-full min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    id="voucher-inventory-search-input"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsVoucherSuggestionsOpen(true);
                    }}
                    onFocus={() => {
                      if (searchTerm.trim()) {
                        setIsVoucherSuggestionsOpen(true);
                      }
                    }}
                    onKeyDown={handleSearchInputKeyDown}
                    placeholder="Fuzzy search code, plan, location, or multiplier e.g. 1hr_4GB x20..."
                    className={`w-full border rounded-lg pl-8 ${searchMultiplierInfo ? 'pr-28' : 'pr-7'} py-1 h-7 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 transition ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                  {searchMultiplierInfo && (
                    <button
                      type="button"
                      id="search-quick-multiplier-btn"
                      onClick={() => applyQuickMultiplier(searchMultiplierInfo.count, searchMultiplierInfo.term || undefined)}
                      className="absolute right-7 top-1 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white font-mono font-bold text-[9px] px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      title={`Immediately mark all ${searchMultiplierInfo.count} vouchers for bulk actions`}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                      <span>Mark x{searchMultiplierInfo.count}</span>
                    </button>
                  )}
                  {searchTerm && (
                    <button
                      type="button"
                      id="clear-voucher-search-btn"
                      onClick={() => {
                        setSearchTerm('');
                        setIsVoucherSuggestionsOpen(false);
                        if (searchInputRef.current) {
                          searchInputRef.current.value = '';
                          searchInputRef.current.focus();
                        }
                      }}
                      title="Clear search"
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Real-time Inventory Suggestions Popover */}
                  <SearchSuggestionsDropdown
                    isOpen={isVoucherSuggestionsOpen && voucherRealtimeSuggestions.length > 0}
                    onClose={() => setIsVoucherSuggestionsOpen(false)}
                    query={searchTerm}
                    items={voucherRealtimeSuggestions}
                    theme={theme}
                    title="Real-Time Inventory Matches"
                    emptyMessage="No vouchers match search query"
                    onSelectItem={(result) => {
                      setSearchTerm(result.voucher.code);
                      setIsVoucherSuggestionsOpen(false);
                      if (!selectedVouchers.includes(result.voucher.id)) {
                        setSelectedVouchers(prev => [...prev, result.voucher.id]);
                      }
                    }}
                    renderItem={(result) => {
                      const v = result.voucher;
                      const agentName = v.soldByAgentName || v.assignedAgentName || (v as any).assignedTo;
                      const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold';
                      return (
                        <div className="flex items-center justify-between gap-2 min-w-0 py-0.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 border ${
                              v.status === 'Unused'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : v.status === 'Assigned'
                                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            }`}>
                              {v.status}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono font-bold text-xs truncate flex items-center gap-2 flex-wrap">
                                <HighlightText text={sanitizeVoucherCode(v)} indices={result.matchedFields.code} query={searchTerm} />
                                {agentName && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30 truncate max-w-[160px]">
                                    {isSold ? '🏷️ Sold By: ' : '🏷️ Allocated: '}
                                    <HighlightText text={agentName} indices={result.matchedFields.assignedAgentName} query={searchTerm} />
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span><HighlightText text={v.plan} indices={result.matchedFields.plan} query={searchTerm} /></span>
                                {v.location && (
                                  <span> • <HighlightText text={v.location} indices={result.matchedFields.location} query={searchTerm} /></span>
                                )}
                                {v.customerName && (
                                  <span className="text-sky-600 dark:text-sky-300 font-bold">
                                    • 👤 Cust: <HighlightText text={v.customerName} indices={result.matchedFields.customerName} query={searchTerm} />
                                    {v.customerCell && ` (${v.customerCell})`}
                                  </span>
                                )}
                                {!agentName && v.status === 'Unused' && (
                                  <span className="text-slate-500 italic">• Master Inventory (Unallocated)</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400 shrink-0">
                            ${(v.price || 0).toFixed(2)}
                          </span>
                        </div>
                      );
                    }}
                  />
                </div>

                {/* Scan Mode Toggle Group (Toggle between Batch Scan and One-Time Scan) */}
                <div className="flex items-center rounded-lg border p-0.5 shrink-0 gap-1 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  {/* One-Time Scan Button */}
                  <button
                    type="button"
                    id="btn-onetime-scan"
                    onClick={handleOpenOneTimeScan}
                    className={`px-2 py-1 h-7 rounded-md text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs ${
                      !isContinuousBatchScan && isScannerOpen
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 ring-1 ring-emerald-400/60 shadow-emerald-500/25'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                    }`}
                    title="One-Time Scan: Scan a single voucher to match and immediately select for agent assignment"
                  >
                    <ScanLine className={`w-3 h-3 ${!isContinuousBatchScan && isScannerOpen ? 'animate-pulse text-white' : 'text-emerald-500'}`} />
                    <span>1-Time Scan</span>
                    {!isContinuousBatchScan && isScannerOpen && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-white/25 text-white">
                        ACT
                      </span>
                    )}
                  </button>

                  <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700" />

                  {/* Batch Scan Button */}
                  <button
                    type="button"
                    id="btn-dedicated-batch-scan"
                    onClick={handleOpenBatchScan}
                    className={`px-2 py-1 h-7 rounded-md text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs ${
                      isContinuousBatchScan && isScannerOpen
                        ? 'bg-purple-600 hover:bg-purple-700 text-white border border-purple-500 ring-1 ring-purple-400/60 shadow-purple-500/25'
                        : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                    }`}
                    title="Continuous Batch Scan: Automatically appends all scanned vouchers to the agent assignment queue"
                  >
                    <Layers className={`w-3 h-3 ${isContinuousBatchScan && isScannerOpen ? 'animate-pulse text-white' : 'text-purple-500'}`} />
                    <span>Batch Scan</span>
                    <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                      isContinuousBatchScan && isScannerOpen
                        ? 'bg-white/25 text-white'
                        : 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                    }`}>
                      {isContinuousBatchScan && isScannerOpen ? 'ACT' : (selectedVouchers.length > 0 ? `${selectedVouchers.length}` : 'SCAN')}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full">
                <select
                  id="voucher-status-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className={`border rounded-lg px-2 py-1 h-7 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 flex-1 sm:flex-initial min-w-[90px] ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <option value="Unused">Unused (Green)</option>
                  <option value="All">All Statuses</option>
                  <option value="Assigned">Assigned (Orange)</option>
                  <option value="Sold">Sold (Red)</option>
                </select>

                {past3DaysSoldVouchers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(prev => prev === 'Past3Days' ? 'All' : 'Past3Days')}
                    className={`px-2 py-1 h-7 rounded-lg text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer border shrink-0 ${
                      statusFilter === 'Past3Days'
                        ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                        : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    }`}
                    title="Quick time shortcut: Sold vouchers from the past 3 days"
                  >
                    <Clock className="w-3 h-3" />
                    <span>Past 3 Days ({past3DaysSoldVouchers.length})</span>
                  </button>
                )}

                <select
                  id="voucher-plan-filter-select"
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className={`border rounded-lg px-2 py-1 h-7 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 flex-1 sm:flex-initial min-w-[80px] ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <option value="All">All Plans</option>
                  {plans.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <select
                  id="voucher-agent-filter-select"
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className={`border rounded-lg px-2 py-1 h-7 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 flex-1 sm:flex-initial min-w-[100px] max-w-[130px] truncate ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                  title="Filter allocated vouchers by field agent"
                >
                  <option value="All">All Agents</option>
                  {agents.map(a => (
                    <option key={a.uid} value={a.uid}>{a.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  id="manage-preset-locations-btn"
                  onClick={() => setIsPresetLocationsModalOpen(true)}
                  className={`border rounded-lg px-2.5 py-1 h-7 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap w-auto shrink-0 shadow-xs ${
                    theme === 'light'
                      ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                  title="Edit and manage preset operating locations & territories"
                >
                  <MapPin className="w-3 h-3 text-sky-500" />
                  <span>Preset Locations ({customLocations.length})</span>
                </button>

                <button
                  id="select-all-filtered-vouchers-btn"
                  onClick={selectAllFiltered}
                  type="button"
                  className={`border rounded-lg px-2 py-1 h-7 text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap w-auto shrink-0 shadow-xs ${
                    theme === 'light'
                      ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                      : 'bg-sky-950/40 hover:bg-sky-950/60 text-sky-300 border-sky-900/60'
                  }`}
                  title={`Select all ${filteredVouchers.length} filtered`}
                >
                  <CheckSquare className="w-3 h-3" />
                  Select Filtered ({filteredVouchers.length})
                </button>



                <button
                  id="invert-filtered-vouchers-btn"
                  onClick={invertSelection}
                  type="button"
                  className={`border rounded-lg px-2 py-1 h-7 text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap w-auto shrink-0 shadow-xs ${
                    theme === 'light'
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-amber-950/40 hover:bg-amber-950/60 text-amber-300 border-amber-900/60'
                  }`}
                  title="Invert current selection of filtered vouchers"
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  Invert Selection
                </button>
              </div>
            </div>

            {/* Quick Multiplier Detected in Search Bar Banner */}
            {searchMultiplierInfo && (
              <div
                id="quick-multiplier-search-detected"
                className="flex flex-wrap items-center justify-between gap-2.5 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-950/50 dark:to-sky-950/50 border border-indigo-200 dark:border-indigo-800/60 px-3.5 py-2 rounded-2xl w-full shadow-xs animate-in fade-in"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                  <span>
                    Quick Multiplier Expression Detected: <strong>x{searchMultiplierInfo.count}</strong>
                    {searchMultiplierInfo.term ? (
                      <> for plan / query <strong>&ldquo;{searchMultiplierInfo.term}&rdquo;</strong> ({filteredVouchers.length} matching)</>
                    ) : (
                      <> for currently filtered vouchers ({filteredVouchers.length} available)</>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-apply-detected-multiplier"
                  onClick={() => applyQuickMultiplier(searchMultiplierInfo.count, searchMultiplierInfo.term || undefined)}
                  className="px-3 py-1 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white font-bold rounded-xl text-[10px] flex items-center gap-1.5 shadow-xs transition cursor-pointer hover:scale-105 active:scale-95"
                >
                  <span>Mark {searchMultiplierInfo.count} Vouchers for Bulk Actions</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {searchTokens.length > 1 && (
              <div
                id="multi-code-search-badge"
                className="flex flex-wrap items-center justify-between gap-2.5 text-[11px] font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 px-3.5 py-2 rounded-2xl w-full"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Layers className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span>
                    Multi-code search active: <strong>{searchTokens.length} codes</strong> queried &bull;{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">{filteredVouchers.length}</strong> matching vouchers found
                    {unmatchedTokens.length > 0 && (
                      <>
                        {' '}&bull;{' '}
                        <strong className="text-amber-600 dark:text-amber-400">
                          {unmatchedTokens.length} unmatched
                        </strong>
                      </>
                    )}
                  </span>
                </div>

                {unmatchedTokens.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      id="copy-unmatched-quick-btn"
                      onClick={handleCopyUnmatchedQuick}
                      className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/60 text-[11px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                      title="Quick-copy all unmatched codes to clipboard (comma-separated)"
                    >
                      {hasCopiedQuick ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-amber-500" />
                          <span>Copy Unmatched ({unmatchedTokens.length})</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      id="show-unmatched-codes-btn"
                      onClick={() => setIsUnmatchedModalOpen(true)}
                      className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm shadow-amber-500/20"
                      title="View list of all unmatched vouchers for copying or further reference"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Show Unmatched List ({unmatchedTokens.length})</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Plan Categories Header with Dedicated Edit Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-bold uppercase tracking-wider ${
                theme === 'light' ? 'text-slate-700' : 'text-slate-300'
              }`}>
                Plan Categories ({plans.length})
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                • Tap card to filter category
              </span>
            </div>

            <button
              type="button"
              id="btn-dedicated-edit-plan-names"
              onClick={() => setIsEditPlansModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Open dedicated editor to rename plan categories"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Plan Names</span>
            </button>
          </div>

          {/* Compact inventory list grouping */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 border rounded-2xl ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800/60'
          }`}>
            {plans.map(plan => {
              const unusedCount = categoryTallies[plan]?.unused || 0;
              const assignedCount = categoryTallies[plan]?.assigned || 0;
              const isPlanFree = isPlanMarkedFree(plan, giveawaySettings) ||
                (activeVouchers.some(v => v.plan === plan) && activeVouchers.filter(v => v.plan === plan).every(v => isVoucherFree(v, giveawaySettings))) ||
                (activeVouchers.some(v => v.plan === plan && isVoucherFree(v, giveawaySettings)) && activeVouchers.filter(v => v.plan === plan && v.status === 'Assigned').every(v => isVoucherFree(v, giveawaySettings)));
              const currentMult = getPlanMultiplier(plan, unusedCount);
              const isFiltered = planFilter === plan;
              return (
                <div 
                  key={plan} 
                  className={`p-2.5 sm:p-3 border rounded-xl flex flex-col justify-between transition-all duration-300 relative ${
                    isFiltered
                      ? theme === 'light'
                        ? 'bg-gradient-to-b from-sky-50 via-white to-sky-50/40 border-sky-500 shadow-xl shadow-sky-500/25 ring-2 ring-sky-500/60 -translate-y-2 scale-[1.03] z-20'
                        : 'bg-gradient-to-b from-sky-950/80 via-slate-900 to-slate-900 border-sky-400 shadow-2xl shadow-sky-500/35 ring-2 ring-sky-400/70 -translate-y-2 scale-[1.03] z-20'
                      : isPlanFree
                      ? 'bg-emerald-500/10 border-emerald-500/40 hover:shadow-sm hover:-translate-y-0.5'
                      : theme === 'light' 
                      ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm hover:-translate-y-0.5' 
                      : 'bg-slate-900 border-slate-800/60 hover:border-slate-700 hover:shadow-sm hover:-translate-y-0.5'
                  }`}
                >
                  {/* Top colour lining when card is active / superimposed */}
                  {isFiltered && (
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 via-cyan-400 to-indigo-600 rounded-t-xl shadow-xs" />
                  )}

                  <div>
                    {/* Full Plan Name Header - Tapping filters category, with Edit Name option */}
                    {renamingPlanName === plan ? (
                      <div className="flex items-center gap-1.5 w-full mb-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={newPlanNameInput}
                          onChange={e => setNewPlanNameInput(e.target.value)}
                          className={`px-2 py-1 text-xs border rounded-xl font-mono w-full focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                            theme === 'light' ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-white border-slate-800'
                          }`}
                          autoFocus
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              await renameVoucherPlan(plan, newPlanNameInput);
                              setRenamingPlanName(null);
                            } else if (e.key === 'Escape') {
                              setRenamingPlanName(null);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await renameVoucherPlan(plan, newPlanNameInput);
                            setRenamingPlanName(null);
                          }}
                          className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition shrink-0"
                          title="Save Name"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingPlanName(null)}
                          className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition shrink-0"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-1.5 w-full">
                        <button
                          type="button"
                          id={`plan-card-btn-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`}
                          onClick={() => {
                            setPlanFilter(planFilter === plan ? 'All' : plan);
                          }}
                          className="flex-1 text-left group flex items-start justify-between gap-1 cursor-pointer select-none transition-transform active:scale-[0.98]"
                          title={isFiltered ? `Selected category "${plan}". Tap to view all categories.` : `Tap to filter category by "${plan}"`}
                        >
                          <div className="flex-1 min-w-0 pr-1">
                            <div className={`text-xs sm:text-sm font-black font-display leading-snug break-words hyphens-auto transition-colors ${
                              isFiltered
                                ? 'text-sky-700 dark:text-sky-300'
                                : theme === 'light' 
                                ? 'text-slate-800 group-hover:text-sky-600' 
                                : 'text-slate-200 group-hover:text-sky-400'
                            }`}>
                              {plan}
                            </div>
                            {isFiltered && (
                              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-mono font-black bg-sky-500 text-white shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                <span>Selected Plan</span>
                              </div>
                            )}
                          </div>

                          {isPlanFree && (
                            <span className="text-[8px] px-1 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                              🎁 FREE
                            </span>
                          )}
                        </button>

                        {/* Only show free gift button on the currently marked free plan card to avoid accidental one-click marking */}
                        {isPlanFree && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await togglePlanFreeStatus(plan, false);
                                showToast(
                                  `Plan "${plan}" returned to standard inventory.`,
                                  'success'
                                );
                              }}
                              className="p-1 rounded-lg transition cursor-pointer bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30"
                              title={`Plan "${plan}" is currently marked Free Gift. Click to return to standard inventory.`}
                            >
                              <Gift className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-1 mt-2 text-[9px] sm:text-[10px] font-mono border-t border-slate-100 dark:border-slate-800/40 pt-1.5 min-w-0">
                      <div className="flex justify-between items-baseline gap-1 flex-wrap">
                        <span className="text-slate-400 shrink-0">Unused:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono text-right tabular-nums truncate">
                          {unusedCount} (${(isPlanFree ? 0 : (categoryTallies[plan]?.unusedValue || 0)).toFixed(2)})
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline gap-1 flex-wrap">
                        <span className="text-slate-400 shrink-0">Assigned:</span>
                        <span className="text-orange-600 dark:text-orange-400 font-bold font-mono text-right tabular-nums truncate">
                          {assignedCount} (${(isPlanFree ? 0 : (categoryTallies[plan]?.assignedValue || 0)).toFixed(2)})
                        </span>
                      </div>
                    </div>
                    {isPlanFree ? (
                      <div className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-1 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        <Gift className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>🎁 Free Gift Plan • $0.00 Excluded from inventory</span>
                      </div>
                    ) : (
                      categoryTallies[plan]?.assigned > 0 && categoryTallies[plan]?.assignedValue === 0 && (
                        <div className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-1 flex items-center gap-1">
                          <Gift className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>🎁 Free Gift Assigned • $0.00</span>
                        </div>
                      )
                    )}
                  </div>

                  {/* Compact Multiplier Control: 3 boxes (x{multiplier}, Arrow Left, Arrow Right) */}
                  <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 font-mono">
                    {/* Box 1: Multiplier Action Box */}
                    <button
                      type="button"
                      id={`btn-plan-mult-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        applyQuickMultiplier(currentMult, plan);
                      }}
                      disabled={unusedCount === 0}
                      className={`flex-1 min-w-0 h-7 px-1 flex items-center justify-center rounded-lg font-black transition cursor-pointer select-none active:scale-95 ${
                        unusedCount >= currentMult
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs border-2 border-indigo-600 hover:border-indigo-700'
                          : unusedCount > 0
                          ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white border-2 border-indigo-300 dark:border-indigo-700 shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed border-2 border-slate-200 dark:border-slate-800/60 opacity-60'
                      }`}
                      title={unusedCount === 0 ? 'No unused vouchers in this plan' : `Quick Multiplier: Mark ${currentMult} "${plan}" vouchers for bulk assignment`}
                    >
                      <span className="text-xs font-black tracking-tight">x{currentMult}</span>
                    </button>

                    {/* Box 2: Arrow Left (Reduce Multiplier) */}
                    <button
                      type="button"
                      id={`btn-plan-mult-prev-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        reducePlanMultiplier(plan, currentMult);
                      }}
                      disabled={currentMult <= 1}
                      className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border-2 transition cursor-pointer select-none active:scale-90 ${
                        currentMult <= 1
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50'
                          : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-xs'
                      }`}
                      title={`Reduce multiplier (current: x${currentMult})`}
                      aria-label="Reduce multiplier"
                    >
                      <ChevronLeft className="w-4 h-4 stroke-[3.5]" />
                    </button>

                    {/* Box 3: Arrow Right (Increase Multiplier) */}
                    <button
                      type="button"
                      id={`btn-plan-mult-next-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        increasePlanMultiplier(plan, currentMult);
                      }}
                      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-xs transition cursor-pointer select-none active:scale-90"
                      title={`Increase multiplier (current: x${currentMult})`}
                      aria-label="Increase multiplier"
                    >
                      <ChevronRight className="w-4 h-4 stroke-[3.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Minimal Floating Selection Bar & Expandable Bulk Actions Popup */}
          {selectedVouchers.length > 0 && (
            !isBulkOptionsOpen ? (
              <div
                id="bar-selected-vouchers-minimal"
                className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-auto rounded-2xl border px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all duration-200 flex items-center gap-2.5 sm:gap-3 border-indigo-200/80 dark:border-indigo-950/80 animate-in fade-in slide-in-from-bottom-2 ${
                  theme === 'light' 
                    ? 'bg-white/95 text-slate-800 shadow-indigo-100/60' 
                    : 'bg-slate-900/95 text-slate-100 shadow-slate-950/90'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white font-mono shadow-xs">
                    {selectedVouchers.length}
                  </span>
                  <span className="text-xs font-bold font-display tracking-tight whitespace-nowrap">
                    {selectedVouchers.length} {selectedVouchers.length === 1 ? 'Voucher' : 'Vouchers'} Marked
                  </span>
                </div>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800"></div>



                {/* Bulk Actions Button - opens the options panel only when clicked */}
                <button
                  id="btn-reveal-bulk-actions"
                  type="button"
                  onClick={() => setIsBulkOptionsOpen(true)}
                  className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition flex items-center gap-1.5 shadow-xs"
                  title="Click to reveal voucher bulk action options (assign to agent, change price, plan, revoke, etc.)"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Bulk Actions</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>

                {/* Quick Export Button */}
                <button
                  type="button"
                  onClick={handleOpenExportForSelected}
                  className="text-xs font-mono font-semibold px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center gap-1 transition shadow-xs"
                  title="Export or print selected vouchers"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>

                {/* Quick Mark Free Button */}
                <button
                  type="button"
                  id="btn-quick-bulk-mark-free"
                  onClick={() => markVouchersFreeBulk(selectedVouchers, true)}
                  className="text-xs font-mono font-semibold px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white cursor-pointer flex items-center gap-1 transition shadow-xs"
                  title="Mark selected vouchers as free promotional giveaways (excluded from inventory)"
                >
                  <Gift className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden sm:inline">Mark Free</span>
                </button>

                {/* Quick Delete Button */}
                <button
                  id="btn-quick-bulk-delete"
                  type="button"
                  onClick={handleBulkDelete}
                  className="text-xs font-mono font-semibold px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer flex items-center gap-1 transition shadow-xs"
                  title="Delete selected vouchers"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800"></div>

                {/* Clear selection */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVouchers([]);
                    setIsBulkOptionsOpen(false);
                  }}
                  className="text-xs font-mono px-2 py-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer flex items-center gap-1 transition"
                  title="Clear selection"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            ) : (
              <div
                id="panel-voucher-bulk-actions"
                className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[96%] sm:w-[94%] max-w-2xl rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 flex flex-col gap-3 border-indigo-150/80 overflow-hidden max-w-[calc(100vw-20px)] animate-in fade-in slide-in-from-bottom-3 ${
                  theme === 'light' 
                    ? 'bg-white/95 text-slate-800 shadow-indigo-100/50' 
                    : 'bg-slate-900/95 text-slate-200 shadow-slate-950/80 border-indigo-950/60'
                }`}
              >
                {/* Header row in full popup */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between w-full gap-2 shrink-0 border-b border-dashed border-slate-200 dark:border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white font-mono animate-pulse">
                      {selectedVouchers.length}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[11px] font-extrabold tracking-tight font-display leading-none block truncate">Voucher Bulk Actions</span>
                      <p className="text-[9px] text-slate-400 font-mono leading-none mt-0.5 truncate">Choose action and apply to selected items</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {/* Quick Export & Print Button */}
                    <button
                      type="button"
                      onClick={handleOpenExportForSelected}
                      className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center gap-1 transition shadow-xs shrink-0"
                      title="Export or print selected vouchers (PDF, CSV, Text, Standard Print)"
                    >
                      <Printer className="w-3 h-3" /> Export
                    </button>

                    {/* Quick One-Click Mass-Revoke Button */}
                    {selectedAllocatedVouchers.length > 0 && (
                      <button
                        type="button"
                        onClick={handleMassRevokeOneClick}
                        className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer flex items-center gap-1 transition shadow-xs shrink-0"
                        title="Mass-revoke all selected allocated vouchers in one click"
                      >
                        <ShieldAlert className="w-3 h-3" /> Mass Revoke ({selectedAllocatedVouchers.length})
                      </button>
                    )}

                    {/* Quick One-Click Bulk Delete Button */}
                    <button
                      id="btn-header-bulk-delete"
                      type="button"
                      onClick={handleBulkDelete}
                      className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer flex items-center gap-1 transition shadow-xs shrink-0"
                      title="Permanently delete selected vouchers"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedVouchers.length})
                    </button>
                    
                    {/* Minimize back to Button */}
                    <button
                      type="button"
                      onClick={() => setIsBulkOptionsOpen(false)}
                      className="text-[10px] font-mono font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer flex items-center gap-1 transition shrink-0"
                      title="Minimize options back to button"
                    >
                      <ChevronDown className="w-3.5 h-3.5" /> Minimize
                    </button>
                    
                    {/* Clear Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVouchers([]);
                        setIsBulkOptionsOpen(false);
                      }}
                      className="text-[10px] font-mono px-1.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/40 cursor-pointer flex items-center gap-1 transition shrink-0"
                      title="Clear selection"
                    >
                      <RotateCcw className="w-3 h-3" /> Clear
                    </button>
                  </div>
                </div>

                {/* Form Controls inside safe Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  {/* Column 1: Action Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Select Action</span>
                    <select
                      value={bulkAction}
                      onChange={(e) => setBulkAction(e.target.value as any)}
                      className={`border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                        theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}
                    >
                      <option value="agent">👤 Assign to Agent</option>
                      <option value="revoke">🛡️ Revoke Allocation</option>
                      <option value="export">🖨️ Export / Print Tokens</option>
                      <option value="price">💵 Change Price</option>
                      <option value="plan">📶 Change Plan</option>
                      <option value="location">📍 Change Location</option>
                      <option value="ssid">📡 Change WiFi SSID</option>
                      <option value="delete">❌ Delete All</option>
                    </select>
                  </div>

                  {/* Column 2: Inputs & Submit Button for the active Action */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Action Details</span>
                    {bulkAction === 'agent' && (
                      <div className="flex flex-col gap-2">
                        {/* Intelligent Token Request Linked Banner */}
                        {activeAssignedRequest && (
                          <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500/15 to-sky-500/15 border border-indigo-500/30 text-[11px] font-mono flex flex-col gap-1 shadow-xs animate-in fade-in duration-150">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-bold text-indigo-700 dark:text-indigo-300">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                <span>Fulfilling Token Request for {activeAssignedRequest.agentName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveAssignedRequest(null)}
                                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                              >
                                Disconnect
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                              <span>Requested: <strong>{activeAssignedRequest.quantity} &times; {activeAssignedRequest.plan}</strong></span>
                              <span>&bull;</span>
                              <span>Preselected: <strong>{selectedVouchers.length} unused</strong></span>
                              <span>&bull;</span>
                              <span className="text-amber-600 dark:text-amber-400 font-bold">
                                Approval status will change to Approved immediately upon Assigning!
                              </span>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const allocatedSelected = activeVouchers.filter(v => selectedVouchers.includes(v.id) && (v.status === 'Assigned' || !!v.assignedAgentId || v.status === 'Sold'));
                          if (allocatedSelected.length === 0) return null;
                          return (
                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-mono flex flex-col gap-1.5">
                              <div className="flex items-start gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>
                                  🔒 Allocation Policy: {allocatedSelected.length} of {selectedVouchers.length} selected voucher(s) are already allocated or sold. Reallocation to any agent is strictly blocked!
                                </span>
                              </div>
                              <div className="flex items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const unallocatedIds = activeVouchers
                                      .filter(v => selectedVouchers.includes(v.id) && v.status === 'Unused' && !v.assignedAgentId)
                                      .map(v => v.id);
                                    setSelectedVouchers(unallocatedIds);
                                  }}
                                  className="text-[9px] underline font-bold hover:text-amber-700 cursor-pointer"
                                >
                                  Deselect Allocated Vouchers
                                </button>
                                <span className="text-slate-400">&bull;</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const toRevoke = activeVouchers.filter(v => selectedVouchers.includes(v.id) && (v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold');
                                    if (toRevoke.length > 0) {
                                      openRevokeModal(toRevoke);
                                    }
                                  }}
                                  className="text-[9px] underline font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer"
                                >
                                  Revoke Allocation
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-1.5">
                          <select
                            value={bulkAssignAgentId}
                            onChange={(e) => setBulkAssignAgentId(e.target.value)}
                            className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none flex-1 ${
                              theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                            }`}
                          >
                            <option value="">Select Agent...</option>
                            {agents.map(a => (
                              <option key={a.uid} value={a.uid}>{a.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={handleBulkAssignToAgent}
                            disabled={!bulkAssignAgentId}
                            className={`font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap ${
                              bulkAssignAgentId 
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {activeAssignedRequest ? 'Assign & Approve Request' : 'Assign'}
                          </button>
                        </div>
                      </div>
                    )}

                    {bulkAction === 'price' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          placeholder="New Price ($)"
                          value={bulkPriceInput}
                          onChange={(e) => setBulkPriceInput(e.target.value)}
                          className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none flex-1 ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                          }`}
                        />
                        <button
                          onClick={handleBulkChangePrice}
                          className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          Set Price
                        </button>
                      </div>
                    )}

                    {bulkAction === 'plan' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="New Plan name"
                          value={bulkPlanInput}
                          onChange={(e) => setBulkPlanInput(e.target.value)}
                          className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none flex-1 ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                          }`}
                        />
                        <button
                          onClick={handleBulkChangePlan}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          Set Plan
                        </button>
                      </div>
                    )}

                    {bulkAction === 'location' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="New Location"
                          value={bulkLocationInput}
                          onChange={(e) => setBulkLocationInput(e.target.value)}
                          className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none flex-1 ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                          }`}
                        />
                        <button
                          onClick={handleBulkChangeLocation}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          Set Loc
                        </button>
                      </div>
                    )}

                    {bulkAction === 'ssid' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="New WiFi SSID"
                          value={bulkSsidInput}
                          onChange={(e) => setBulkSsidInput(e.target.value)}
                          className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none flex-1 ${
                            theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                          }`}
                        />
                        <button
                          onClick={handleBulkChangeSsid}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          Set SSID
                        </button>
                      </div>
                    )}

                    {(bulkAction === 'revoke' || (bulkAction as any) === 'unassign') && (
                      <div className="flex flex-col gap-2 w-full">
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                          {selectedAllocatedVouchers.length} of {selectedVouchers.length} selected vouchers have active agent allocations.
                        </span>
                        <button
                          type="button"
                          onClick={handleBulkRevoke}
                          disabled={selectedAllocatedVouchers.length === 0}
                          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" /> Initiate Revocation ({selectedAllocatedVouchers.length})
                        </button>
                      </div>
                    )}

                    {bulkAction === 'delete' && (
                      <div className="flex items-center gap-1.5 justify-between w-full">
                        <span className="text-[10px] text-rose-500 font-mono font-bold">Warning: Irreversible!</span>
                        <button
                          onClick={handleBulkDelete}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete All
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Simulation & Computations Panel (Only when Assign to Agent action is selected) */}
                {bulkAction === 'agent' && (
                  <div className="mt-2.5 border-t border-dashed border-slate-200 dark:border-slate-800/80 pt-2.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1 bg-indigo-500/10 text-indigo-500 rounded-md shrink-0">
                        <TrendingUp className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        Allocation Simulation Projections
                      </span>
                    </div>

                    {bulkAssignAgentId ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {/* Vouchers selected by plan vs total unused */}
                        <div className="flex flex-wrap gap-1 content-start max-h-[100px] overflow-y-auto">
                          {selectedPlansBreakdown.map(({ plan, selected, totalUnused }) => (
                            <div 
                              key={plan} 
                              className={`px-1.5 py-0.5 rounded text-[8px] font-mono border flex items-center gap-1 ${
                                theme === 'light'
                                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                                  : 'bg-slate-950 border-slate-800 text-slate-300'
                              }`}
                            >
                              <span className="font-bold text-sky-600 dark:text-sky-400">{plan}</span>:
                              <span className="font-black text-slate-950 dark:text-white">{selected}</span>
                              <span className="text-slate-400">/</span>
                              <span className="font-semibold text-slate-500">{totalUnused} Unused</span>
                            </div>
                          ))}
                        </div>

                        {/* Mathematical Computation Table */}
                        <div className={`p-2 rounded-lg border flex flex-col gap-1 text-[9px] font-mono ${
                          theme === 'light' ? 'bg-indigo-50/20 border-indigo-100' : 'bg-indigo-950/10 border-indigo-900/30'
                        }`}>
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                            <span>Selected Vouchers:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {selectedVouchers.length} items (${(agentInventoryBalanceInfo.totalSelectedValue || 0).toFixed(2)})
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                            <span>Existing Agent Balance:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              ${(agentInventoryBalanceInfo.existing || 0).toFixed(2)}
                            </span>
                          </div>
                          <div className={`border-t border-dashed pt-1 mt-1 flex justify-between items-center font-bold ${
                            theme === 'light' ? 'border-indigo-100' : 'border-indigo-900/40'
                          }`}>
                            <span className="text-indigo-600 dark:text-indigo-400">Resultant Total Balance:</span>
                            <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black">
                              ${(agentInventoryBalanceInfo.resultant || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono italic">
                        Select an agent above to view active inventory simulation projection.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* Movable Price Overlay & Compact Scrollable List View */}
          <div ref={containerRef} className="relative w-full max-w-full min-w-0 min-h-[500px] border border-dashed border-slate-200 dark:border-slate-800/80 rounded-3xl p-3 sm:p-4 flex flex-col select-none overflow-hidden">
            
            {/* Default Section / Place for Movable Price Selector (Just above voucher inventory list) */}
            <div className={`w-full rounded-2xl border p-2.5 sm:p-3 mb-3 transition-all ${
              theme === 'light' 
                ? 'bg-slate-50/90 border-slate-200 shadow-xs' 
                : 'bg-slate-900/80 border-slate-800 shadow-xs'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200/70 dark:border-slate-800/70">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Filter className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
                    theme === 'light' ? 'text-slate-800' : 'text-slate-200'
                  }`}>
                    Price Filter Selector
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold flex items-center gap-1 border ${
                    isPriceSelectorDocked
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isPriceSelectorDocked ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                    {isPriceSelectorDocked ? 'Default Section (Docked)' : 'Floating Active'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isPriceSelectorDocked ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOverlayPos({ x: 20, y: 70 });
                        setIsPriceSelectorDocked(false);
                      }}
                      className={`px-2 py-1 text-[10px] font-mono font-semibold rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                        theme === 'light'
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                      title="Pop out selector into movable floating overlay"
                    >
                      <Move className="w-3 h-3 text-sky-500" />
                      <span>Detach & Move</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsPriceSelectorDocked(true)}
                      className="px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg border transition cursor-pointer flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white border-sky-700 shadow-xs"
                      title="Return price selector back to its default section"
                    >
                      <Pin className="w-3 h-3" />
                      <span>Dock to Default Place</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Docked Price Selector or Floating Docking Bay */}
              {isPriceSelectorDocked ? (
                <div
                  className={`rounded-xl p-1.5 flex items-center gap-2 border transition-all ${
                    overlayOrientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col items-start'
                  } ${
                    theme === 'light'
                      ? 'bg-white border-slate-200 text-slate-800'
                      : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <div 
                      onPointerDown={handleStartDragFromDock}
                      className="text-slate-400 hover:text-sky-500 p-1 flex items-center cursor-grab active:cursor-grabbing rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition touch-none"
                      title="Drag to detach and move selector anywhere"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Orientation Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setOverlayOrientation(prev => prev === 'horizontal' ? 'vertical' : 'horizontal')}
                      className={`p-1 rounded-lg transition border-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        theme === 'light' ? 'bg-slate-50 text-slate-500' : 'bg-slate-900 text-slate-400'
                      }`}
                      title={`Switch to ${overlayOrientation === 'horizontal' ? 'Vertical' : 'Horizontal'} view`}
                    >
                      <ArrowRightLeft className={`w-3 h-3 transition-transform duration-200 ${overlayOrientation === 'vertical' ? 'rotate-90' : ''}`} />
                    </button>
                  </div>

                  <div className="h-4 border-l border-slate-200 dark:border-slate-800" />

                  {/* Price filter pill buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPriceFilter('all')}
                      className={`px-3 py-1 text-[11px] font-black font-mono rounded-xl transition cursor-pointer ${
                        priceFilter === 'all'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      ALL ({vouchers.length})
                    </button>
                    {uniquePrices.map((price) => {
                      const count = vouchers.filter(v => Math.abs((Number(v.price) || 0) - price) < 0.001).length;
                      const isSelected = priceFilter !== 'all' && Math.abs(Number(priceFilter) - price) < 0.001;
                      return (
                        <button
                          key={price}
                          type="button"
                          onClick={() => setPriceFilter(price)}
                          className={`px-3 py-1 text-[11px] font-black font-mono rounded-xl transition cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span>${price % 1 === 0 ? price : (price || 0).toFixed(2)}</span>
                          <span className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className={`p-3 rounded-xl border border-dashed flex flex-col sm:flex-row items-center justify-between gap-2.5 transition-all ${
                  theme === 'light' ? 'bg-amber-50/40 border-amber-300/60' : 'bg-amber-950/20 border-amber-800/40'
                }`}>
                  <div className="flex items-center gap-2">
                    <Move className="w-4 h-4 text-amber-500 animate-pulse" />
                    <span className={`text-xs font-mono ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                      Price Selector is currently in <strong>movable floating mode</strong> over the inventory list.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPriceSelectorDocked(true)}
                    className="px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Pin className="w-3.5 h-3.5" />
                    <span>Return to Default Section</span>
                  </button>
                </div>
              )}
            </div>

            {/* Elegant Movable Overlay (Only visible when detached / floating) */}
            {!isPriceSelectorDocked && (
              <div
                style={{ left: overlayPos.x, top: overlayPos.y }}
                onPointerDown={handlePointerDown}
                className={`absolute z-30 shadow-2xl rounded-xl p-1 flex border border-slate-200/80 dark:border-slate-700/80 touch-none transition-all backdrop-blur-md max-w-[calc(100%-16px)] ${
                  overlayLocked ? 'cursor-default ring-2 ring-amber-500/50' : 'cursor-grab active:cursor-grabbing'
                } ${
                  overlayOrientation === 'horizontal' ? 'flex-row items-center gap-1 w-auto' : 'flex-col items-center gap-1 w-[56px]'
                } ${
                  theme === 'light'
                    ? 'bg-white/95 text-slate-800 shadow-slate-300/80'
                    : 'bg-slate-950/95 text-white shadow-black/90'
                }`}
                title="Double tap overlay to Lock/Unlock. Drag to move anywhere."
              >
                <div className={`flex items-center gap-1 ${overlayOrientation === 'horizontal' ? 'flex-row shrink-0' : 'flex-col shrink-0'}`}>
                  <div className="text-slate-400 p-0.5 flex items-center">
                    {overlayLocked ? (
                      <Lock className="w-3 h-3 text-amber-500 animate-pulse" />
                    ) : (
                      <GripVertical className={`w-3 h-3 transition-transform duration-200 ${overlayOrientation === 'vertical' ? 'rotate-90' : ''}`} />
                    )}
                  </div>
                  
                  {/* Orientation Toggle Button */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOverlayOrientation(prev => prev === 'horizontal' ? 'vertical' : 'horizontal');
                    }}
                    className={`p-0.5 rounded-md transition-all border-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      theme === 'light' ? 'bg-slate-50 text-slate-500' : 'bg-slate-900 text-slate-400'
                    }`}
                    title={`Switch to ${overlayOrientation === 'horizontal' ? 'Vertical' : 'Horizontal'} view`}
                  >
                    <ArrowRightLeft className={`w-2.5 h-2.5 transition-transform duration-200 ${overlayOrientation === 'vertical' ? 'rotate-90' : ''}`} />
                  </button>

                  {/* Return to Default Place Button */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPriceSelectorDocked(true);
                    }}
                    className="p-0.5 rounded-md transition-all border-none cursor-pointer bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900 text-sky-600 dark:text-sky-400"
                    title="Dock back to default section above inventory list"
                  >
                    <Pin className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Spacer / Divider */}
                <div className={`transition-all border-slate-200 dark:border-slate-800/60 ${overlayOrientation === 'horizontal' ? 'h-4 border-l' : 'w-4 border-t'}`} />

                <div className={`flex gap-1 scrollbar-none transition-all ${
                  overlayOrientation === 'horizontal'
                    ? 'flex-row items-center overflow-x-auto max-w-[200px] sm:max-w-[320px]'
                    : 'flex-col items-center overflow-y-auto max-h-[240px]'
                }`}>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setPriceFilter('all'); }}
                    className={`px-3 py-1 text-[10px] font-black font-mono rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                      priceFilter === 'all'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    ALL
                  </button>
                  {uniquePrices.map((price) => {
                    const isSelected = priceFilter !== 'all' && Math.abs(Number(priceFilter) - price) < 0.001;
                    return (
                      <button
                        key={price}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPriceFilter(price); }}
                        className={`px-3 py-1 text-[10px] font-black font-mono rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        ${price % 1 === 0 ? price : (price || 0).toFixed(2)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Select All & Bulk Revocation Option Header */}
            {filteredVouchers.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1 text-xs w-full min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="select-all-filtered-vouchers"
                      checked={isAllFilteredSelected}
                      onChange={toggleAllFiltered}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                    />
                    <label htmlFor="select-all-filtered-vouchers" className="font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none text-[11px] sm:text-xs">
                      Select All Filtered ({filteredVouchers.length})
                    </label>
                  </div>



                  <button
                    id="invert-selection-checkbox-side-btn"
                    type="button"
                    onClick={invertSelection}
                    className={`px-2 py-1 h-7 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer border shadow-xs ${
                      theme === 'light'
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Invert current selection of filtered vouchers"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Invert Selection</span>
                  </button>

                  {filteredAllocatedVouchers.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllAllocated}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition cursor-pointer border shadow-xs ${
                        areAllAllocatedSelected
                          ? 'bg-amber-500 text-white border-amber-600'
                          : theme === 'light'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/50'
                      }`}
                      title="Bulk-select only allocated vouchers for revocation or management"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {areAllAllocatedSelected ? 'Deselect Allocated' : `Select All Allocated (${filteredAllocatedVouchers.length})`}
                    </button>
                  )}

                  {selectedAllocatedVouchers.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMassRevokeOneClick}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      title="Perform mass-revocation action in one click"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Mass Revoke ({selectedAllocatedVouchers.length})
                    </button>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-150 dark:border-slate-800/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Movable Price Selector active
                </div>
              </div>
            )}

            {/* Layout switch: Table layout or Compact Tiles layout */}
            {inventoryLayout === 'table' ? (
              <div className="flex-grow max-h-[480px] overflow-y-auto overflow-x-auto border border-slate-200 dark:border-slate-800/80 rounded-2xl w-full max-w-full">
                <table className="w-full text-left border-collapse text-xs min-w-[580px]">
                  <thead className={`sticky top-0 z-10 text-[10px] font-mono uppercase tracking-wider ${
                    theme === 'light' ? 'bg-slate-100 text-slate-700 border-b border-slate-200' : 'bg-slate-950 text-slate-300 border-b border-slate-800'
                  }`}>
                    <tr>
                      <th className="p-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={isAllFilteredSelected}
                          onChange={toggleAllFiltered}
                          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                        />
                      </th>
                      <th className="p-2.5">Code</th>
                      <th className="p-2.5">Plan</th>
                      <th className="p-2.5">Price</th>
                      <th className="p-2.5">Location</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Customer / Agent</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 font-mono">
                    {paginatedFilteredVouchers.map((v) => {
                      const isSelected = selectedVouchers.includes(v.id);
                      return (
                        <tr
                          key={v.id}
                          className={`transition duration-150 ${
                            isSelected
                              ? theme === 'light' ? 'bg-indigo-50/50' : 'bg-indigo-950/40'
                              : theme === 'light' ? 'hover:bg-slate-50' : 'hover:bg-slate-850/40'
                          }`}
                        >
                          <td className="p-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectVoucher(v.id)}
                              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                            />
                          </td>
                          <td
                            onClick={() => toggleSelectVoucher(v.id)}
                            className="p-2.5 font-mono font-black tracking-wider select-all whitespace-nowrap text-xs sm:text-sm text-slate-950 dark:text-white cursor-pointer hover:underline"
                            title={isSelected ? 'Tap voucher code to deselect' : 'Tap voucher code to select'}
                          >
                            <HighlightText text={sanitizeVoucherCode(v)} indices={voucherMatchMap.get(v.id)?.code} query={searchTerm} />
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <HighlightText text={v.plan} indices={voucherMatchMap.get(v.id)?.plan} query={searchTerm} />
                            </div>
                          </td>
                          <td className="p-2.5 font-bold">
                            {isVoucherFree(v, giveawaySettings) ? (
                              <div className="flex flex-col">
                                <span className="line-through text-slate-400 text-[10px]">${(v.price || 0).toFixed(2)}</span>
                                <span className="text-emerald-500 font-extrabold flex items-center gap-0.5 text-xs">
                                  <Gift className="w-2.5 h-2.5" />
                                  $0.00 (Gift)
                                </span>
                              </div>
                            ) : (
                              <span className="text-sky-600 dark:text-sky-400 font-bold">${(v.price || 0).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-400">
                            <HighlightText text={v.location || '-'} indices={voucherMatchMap.get(v.id)?.location} query={searchTerm} />
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                v.status === 'Unused'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15'
                                  : v.status === 'Assigned'
                                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/15'
                                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/15'
                              }`}>
                                {v.status}
                              </span>
                              {isVoucherFree(v, giveawaySettings) && (
                                <span className="px-1 py-0.2 rounded text-[7px] font-black bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                                  🎁 FREE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5">
                            {v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' ? (
                              <div className="flex flex-col min-w-0 space-y-0.5">
                                {(v.soldByAgentName || v.assignedAgentName || (v as any).assignedTo) && (
                                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 truncate max-w-[150px] flex items-center gap-1" title={`Sold by Agent: ${v.soldByAgentName || v.assignedAgentName}`}>
                                    <span className="text-[10px] shrink-0">🏷️</span>
                                    <span>Sold By: </span>
                                    <HighlightText text={v.soldByAgentName || v.assignedAgentName || (v as any).assignedTo} indices={voucherMatchMap.get(v.id)?.assignedAgentName} query={searchTerm} />
                                  </span>
                                )}
                                {v.customerName && (
                                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[150px] flex items-center gap-1 text-[11px]" title={`Customer: ${v.customerName}`}>
                                    <span className="text-[10px] text-sky-500 shrink-0">👤</span>
                                    <HighlightText text={v.customerName} indices={voucherMatchMap.get(v.id)?.customerName} query={searchTerm} />
                                  </span>
                                )}
                                {v.customerCell && (
                                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                                    <HighlightText text={v.customerCell} indices={voucherMatchMap.get(v.id)?.customerCell} query={searchTerm} />
                                  </span>
                                )}
                              </div>
                            ) : v.assignedAgentName ? (
                              <div className="flex flex-col min-w-0">
                                <span className="text-amber-600 dark:text-amber-400 text-[11px] font-bold truncate max-w-[150px] flex items-center gap-1" title={`Allocated to Agent: ${v.assignedAgentName}`}>
                                  <span className="text-[10px] shrink-0">🏷️</span>
                                  <span>Allocated: </span>
                                  <HighlightText text={v.assignedAgentName} indices={voucherMatchMap.get(v.id)?.assignedAgentName} query={searchTerm} />
                                </span>
                                {v.assignedAt && (
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    {new Date(v.assignedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px] italic">Master Stock (Unallocated)</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {(v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || v.soldAt) && (
                                <button
                                  onClick={async () => {
                                    await cancelTransaction(v.id, 'Transaction cancelled by administrator');
                                  }}
                                  className="px-2 py-1 text-[9px] rounded font-bold transition cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap"
                                  title="Cancel transaction and revert voucher back to unused stock"
                                >
                                  Cancel Sale
                                </button>
                              )}
                              {(v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold' && (
                                <button
                                  onClick={() => openRevokeModal([v])}
                                  className="px-2 py-1 text-[9px] rounded font-bold transition cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap"
                                  title="Revoke allocation from agent back to master inventory"
                                >
                                  Revoke
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditVoucher(v);
                                  setNewPrice(v.price);
                                  setEditLocation(v.location || '');
                                  setEditPlan(v.plan);
                                  setEditNetworkName(v.networkName || '');
                                }}
                                className={`px-2 py-1 text-[9px] rounded font-bold transition cursor-pointer ${
                                  theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteWithPrecaution(v.id, v.code, v.status)}
                                className="px-2 py-1 text-[9px] rounded font-bold transition cursor-pointer bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-0.5"
                                title="Permanently delete this voucher from inventory"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Compact Tiles View */
              <div className="flex-grow max-h-[480px] overflow-y-auto pr-1 space-y-2 w-full max-w-full min-w-0">
                {paginatedFilteredVouchers.map((v) => {
                  const isSelected = selectedVouchers.includes(v.id);
                  return (
                    <div
                      key={v.id}
                      className={`p-2.5 sm:p-3 border rounded-2xl sm:rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-xs transition-all duration-200 ease-out hover:shadow-xs w-full max-w-full min-w-0 ${
                        isSelected
                          ? theme === 'light' ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-indigo-950/40 border-indigo-700 ring-1 ring-indigo-700'
                          : theme === 'light' ? 'bg-white border-slate-200 hover:bg-slate-50/90 hover:border-slate-300' : 'bg-slate-900 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
                      }`}
                    >
                      {/* Left/Main Area: Checkbox + Code, Price, Status, Sub-info */}
                      <div className="flex items-start sm:items-center gap-2 sm:gap-2.5 min-w-0 flex-1 w-full">
                        <div className="pt-0.5 sm:pt-0 shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectVoucher(v.id)}
                            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4 shrink-0"
                          />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                          {/* Code, Price, and Status Header */}
                          <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectVoucher(v.id);
                                }}
                                className={`font-mono font-black select-all tracking-wider text-xs sm:text-sm break-all cursor-pointer hover:underline ${
                                  theme === 'light' ? 'text-slate-950' : 'text-white'
                                }`}
                                title={isSelected ? 'Tap voucher code to deselect' : 'Tap voucher code to select'}
                              >
                                <HighlightText text={sanitizeVoucherCode(v)} indices={voucherMatchMap.get(v.id)?.code} query={searchTerm} />
                              </span>
                              {isVoucherFree(v, giveawaySettings) ? (
                                <span className="font-mono text-xs font-black text-emerald-500 px-1.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                                  <span className="line-through text-slate-400 text-[10px] font-normal">${(v.price || 0).toFixed(2)}</span>
                                  <span>$0.00 Gift</span>
                                </span>
                              ) : (
                                <span className="font-mono text-xs font-black text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded-lg bg-sky-500/10 border border-sky-500/20 shrink-0">
                                  ${(v.price || 0).toFixed(2)}
                                </span>
                              )}
                            </div>

                            {/* Status Badge in Header */}
                            <div className="shrink-0 flex items-center gap-1">
                              {isVoucherFree(v, giveawaySettings) && (
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 rounded-md text-[9px] font-black font-mono">
                                  🎁 Free Gift
                                </span>
                              )}
                              {v.status === 'Unused' && (
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 rounded-md text-[9px] font-black font-mono">
                                  Unused
                                </span>
                              )}
                              {v.status === 'Assigned' && (
                                <span className="px-2 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/25 rounded-md text-[9px] font-black font-mono">
                                  Assigned
                                </span>
                              )}
                              {v.status === 'Sold' && (
                                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 rounded-md text-[9px] font-black font-mono">
                                  Sold
                                </span>
                              )}
                              {v.reversalRequested && (
                                <span
                                  onClick={() => setIsReversalsModalOpen(true)}
                                  className="px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-md text-[9px] font-black font-mono flex items-center gap-1 animate-pulse cursor-pointer"
                                  title={`Reversal Requested: ${v.reversalReason || 'Pending'}. Click to review.`}
                                >
                                  <RotateCcw className="w-2.5 h-2.5" /> Reversal Requested
                                </span>
                              )}
                              {v.reversalStatus === 'Approved' && (
                                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-md text-[9px] font-black font-mono flex items-center gap-1">
                                  <RotateCcw className="w-2.5 h-2.5" /> Reversed
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sub-info: Plan, Location, Duration, SSID, Agent or Customer details */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 font-semibold">
                            <span className="text-slate-900 dark:text-slate-100 font-bold flex items-center gap-1.5 flex-wrap">
                              <HighlightText text={v.plan} indices={voucherMatchMap.get(v.id)?.plan} query={searchTerm} />
                            </span>
                            <span className="text-slate-400">•</span>
                            <span>
                              <HighlightText text={v.location || '-'} indices={voucherMatchMap.get(v.id)?.location} query={searchTerm} />
                            </span>
                            <span className="text-slate-400">•</span>
                            <span>{v.duration || '30 Days'}</span>

                            {v.networkName && (
                              <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 rounded text-[9px] font-black font-mono">
                                SSID: {v.networkName}
                              </span>
                            )}

                            {v.status === 'Assigned' && v.assignedAgentName && (
                              <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/25 rounded text-[10px] font-bold font-mono flex items-center gap-1">
                                <span>👤 Agent:</span>
                                <strong className="text-orange-950 dark:text-orange-200">
                                  <HighlightText text={getAgentDisplayName(v.assignedAgentName)} indices={voucherMatchMap.get(v.id)?.assignedAgentName} query={searchTerm} />
                                </strong>
                              </span>
                            )}

                            {v.status === 'Sold' && (
                              <>
                                {(v.soldByAgentName || v.assignedAgentName) && (
                                  <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 rounded text-[10px] font-bold font-mono flex items-center gap-1">
                                    <span>🏷️ Sold By:</span>
                                    <strong className="text-rose-950 dark:text-rose-200">
                                      <HighlightText text={getAgentDisplayName(v.soldByAgentName || v.assignedAgentName)} indices={voucherMatchMap.get(v.id)?.soldByAgentName || voucherMatchMap.get(v.id)?.assignedAgentName} query={searchTerm} />
                                    </strong>
                                  </span>
                                )}
                                {v.customerName && (
                                  <span className="px-1.5 py-0.5 bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/25 rounded text-[10px] font-bold font-mono flex items-center gap-1">
                                    <span>👤 Customer:</span>
                                    <strong>
                                      <HighlightText text={v.customerName} indices={voucherMatchMap.get(v.id)?.customerName} query={searchTerm} />
                                    </strong>
                                  </span>
                                )}
                                {v.soldAt && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {new Date(v.soldAt).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right / Actions Row: Responsive on mobile with touch targets */}
                      <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-150 dark:border-slate-800">
                        {(v.status === 'Assigned' || !!v.assignedAgentId) && v.status !== 'Sold' && (
                          <button
                            onClick={() => openRevokeModal([v])}
                            className="px-2.5 py-1 text-[10px] sm:text-[9px] rounded-lg font-bold transition whitespace-nowrap cursor-pointer bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex-1 sm:flex-initial text-center"
                            title="Revoke allocation back to master inventory"
                          >
                            Revoke
                          </button>
                        )}

                        {v.reversalRequested && (
                          <button
                            type="button"
                            onClick={() => setIsReversalsModalOpen(true)}
                            className="px-2.5 py-1 text-[10px] sm:text-[9px] rounded-lg font-bold font-mono transition whitespace-nowrap cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-1 shadow-xs animate-pulse"
                            title="Review and decide on agent sale reversal request"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Review Reversal</span>
                          </button>
                        )}

                        {(v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || v.soldAt) && (
                          <button
                            onClick={async () => {
                              await cancelTransaction(v.id, 'Transaction cancelled by administrator');
                            }}
                            className="px-2.5 py-1 text-[10px] sm:text-[9px] rounded-lg font-bold transition whitespace-nowrap cursor-pointer bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center gap-1 flex-1 sm:flex-initial text-center"
                            title="Cancel transaction and revert voucher back to unused stock"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Cancel Sale</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setEditVoucher(v);
                            setNewPrice(v.price);
                            setEditLocation(v.location || '');
                            setEditPlan(v.plan);
                            setEditNetworkName(v.networkName || '');
                          }}
                          className={`px-2.5 py-1 text-[10px] sm:text-[9px] rounded-lg font-bold transition whitespace-nowrap cursor-pointer flex-1 sm:flex-initial text-center ${
                            theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                          title="Edit voucher details"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDeleteWithPrecaution(v.id, v.code, v.status)}
                          className="px-2.5 py-1 text-[10px] sm:text-[9px] rounded-lg font-bold transition whitespace-nowrap cursor-pointer bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center justify-center gap-1 flex-1 sm:flex-initial text-center"
                          title="Permanently delete this voucher from inventory"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredVouchers.length > visibleAdminVouchersLimit && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleAdminVouchersLimit(prev => prev + 30)}
                  className={`w-full py-2.5 px-4 rounded-xl font-mono text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 shadow-xs ${
                    theme === 'light'
                      ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                      : 'bg-indigo-950/40 hover:bg-indigo-950/70 text-indigo-300 border-indigo-850'
                  }`}
                >
                  <span>Load More Vouchers ({paginatedFilteredVouchers.length} of {filteredVouchers.length} shown)</span>
                </button>
              </div>
            )}

            {filteredVouchers.length === 0 && (
              <div className="py-12 text-center text-slate-400 font-mono border border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                No matching active vouchers in catalog.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Requests & Reconciliation */}
        <div className="space-y-3 lg:col-span-1 w-full max-w-full min-w-0 overflow-x-hidden">
          {/* Top-up Requests */}
          <div className={`border rounded-2xl p-3 sm:p-3.5 shadow-md transition-all duration-300 w-full max-w-full min-w-0 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <h2 className={`text-xs sm:text-sm font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Top-Up Requests</h2>
                {sortedRequests.filter(r => r.status === 'Pending').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-white animate-pulse">
                    {sortedRequests.filter(r => r.status === 'Pending').length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-mono">
                  <button
                    type="button"
                    onClick={() => setTopUpQueueFilter('Pending')}
                    className={`px-1.5 py-0.5 rounded-md transition cursor-pointer font-bold ${
                      topUpQueueFilter === 'Pending'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Pending ({sortedRequests.filter(r => r.status === 'Pending').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopUpQueueFilter('All')}
                    className={`px-1.5 py-0.5 rounded-md transition cursor-pointer font-bold ${
                      topUpQueueFilter === 'All'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({sortedRequests.length})
                  </button>
                </div>
                <button
                  type="button"
                  id="btn-card-open-approval-modal"
                  onClick={() => setIsTokenRequestApprovalOpen(true)}
                  className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Open Administrator Token Request Approval Modal"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {sortedRequests
                .filter(r => topUpQueueFilter === 'Pending' ? r.status === 'Pending' : true)
                .map(r => (
                <div key={r.id} className={`p-2 border rounded-lg flex items-center justify-between gap-2 transition-all duration-200 ease-out hover:scale-[1.01] hover:shadow-xs min-w-0 ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300' : 'bg-slate-950 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700'
                }`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[11px] font-bold truncate ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                      {getAgentDisplayName(r.agentName)} req {r.quantity} {r.plan}
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">
                      {r.location} | {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {r.status === 'Pending' ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        id={`btn-card-goto-${r.id}`}
                        onClick={() => handleGoToRequest(r)}
                        className="bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-1 transition cursor-pointer shadow-xs"
                        title={`Go to assignment panel with ${r.quantity} unused ${r.plan} vouchers preselected for ${r.agentName}`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                        <span>Go to</span>
                      </button>
                      <button
                        onClick={() => fulfillVoucherRequest(r.id)}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase transition cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => declineVoucherRequest(r.id)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-405 border border-rose-500/20 px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase transition cursor-pointer"
                      >
                        Decline
                      </button>
                    </div>
                  ) : r.status === 'Fulfilled' ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-0.5">
                        ✓ Approved
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteVoucherRequest(r.id)}
                        title="Delete request record"
                        className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer rounded"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-500 border border-rose-500/20 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-0.5">
                        ✗ Declined
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteVoucherRequest(r.id)}
                        title="Delete request record"
                        className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer rounded"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {sortedRequests.filter(r => topUpQueueFilter === 'Pending' ? r.status === 'Pending' : true).length === 0 && (
                <p className="text-[11px] text-slate-400 font-mono text-center py-3">
                  {topUpQueueFilter === 'Pending' ? 'No pending top-up requests in queue.' : 'No requests recorded.'}
                </p>
              )}
            </div>
          </div>

          {/* Monthly Sales Cycle & Agent Cash Close Aggregates Hub */}
          <div className={`border rounded-2xl p-3.5 sm:p-4 shadow-md transition-all duration-300 w-full max-w-full min-w-0 space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-sm sm:text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                      Monthly Sales Cycle & Cash Close Aggregates
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                      {getCycleMonthLabel(salesCycleAggregate.cycleMonth)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Reconciled cash closes match earned commissions &bull; Remaining cash & commission carry over to new cycle
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {salesCycleAggregate.isFinalDay ? (
                  <span className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 animate-pulse">
                    🚨 Final Day of Sales Cycle
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded-lg text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                    Cycle Active ({salesCycleAggregate.daysUntilMonthEnd} days to month-end)
                  </span>
                )}

                <button
                  type="button"
                  id="btn-admin-manage-cash-close-schedules"
                  onClick={() => setIsCashCloseScheduleModalOpen(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-mono font-bold px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="Adjust cash close schedule timings, minimum cash close amounts, and agent rules"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Adjust Schedules & Minimums</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRequestingCashDrop(!isRequestingCashDrop)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-mono font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  {isRequestingCashDrop ? 'Cancel Request' : '+ Request Cash Close'}
                </button>
              </div>
            </div>

            {/* Aggregate Totals for every agent */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className={`p-3 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Total Cash Collected</div>
                <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-6">
                  <div className={`text-base sm:text-lg font-black font-mono mt-0.5 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    ${(salesCycleAggregate.totalCashCollected || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <div className="text-[9px] text-slate-400 mt-0.5 font-mono">All agents current cycle</div>
                {salesCycleAggregate.totalUnclosedPrevCycle !== undefined && salesCycleAggregate.totalUnclosedPrevCycle > 0 && (
                  <div className="text-[9px] text-orange-600 dark:text-orange-400 font-mono font-semibold mt-1 pt-1 border-t border-orange-500/20">
                    + ${(salesCycleAggregate.totalUnclosedPrevCycle || 0).toFixed(2)} unclosed from last cycle
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Total Commission Earned</div>
                <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-6">
                  <div className="text-base sm:text-lg font-black font-mono mt-0.5 text-indigo-600 dark:text-indigo-400">
                    ${(salesCycleAggregate.totalCommissionEarned || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <div className="text-[9px] text-slate-400 mt-0.5 font-mono">Total earned by agents</div>
              </div>

              <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono uppercase">Closed Cash (Reconciled)</div>
                <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-6">
                  <div className="text-base sm:text-lg font-black font-mono mt-0.5">
                    ${(salesCycleAggregate.totalClosedCash || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-mono">
                  Matched Commission: ${(salesCycleAggregate.totalClosedCommission || 0).toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono uppercase">Matched Closed Commission</div>
                <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-6">
                  <div className="text-base sm:text-lg font-black font-mono mt-0.5">
                    ${(salesCycleAggregate.totalClosedCommission || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-mono">Matches closed cash</div>
              </div>

              <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400">
                <div className="text-[10px] text-amber-600 dark:text-amber-500 font-mono uppercase">Remaining Cash (Rollover)</div>
                <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-6">
                  <div className="text-base sm:text-lg font-black font-mono mt-0.5">
                    ${(salesCycleAggregate.totalRemainingCash || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <div className="text-[9px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 font-mono">Carried over to next cycle</div>
              </div>

              <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400">
                <div className="text-[10px] text-amber-600 dark:text-amber-500 font-mono uppercase">Remaining Commission</div>
                <MetricSkeleton isLoading={isMetricsSyncing} width="w-20" height="h-6">
                  <div className="text-base sm:text-lg font-black font-mono mt-0.5">
                    ${(salesCycleAggregate.totalRemainingCommission || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <div className="text-[9px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 font-mono">Carried over with cash</div>
              </div>
            </div>

            {/* Inline Request Cash Drop Form */}
            {isRequestingCashDrop && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsedAmount = parseFloat(reqCashAmount);
                  if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    alert('Please enter a valid cash amount greater than $0.00');
                    return;
                  }
                  if (!reqCashAgentId) {
                    alert('Please select an agent to request cash drop from');
                    return;
                  }
                  const selectedAgent = agents.find(a => a.uid === reqCashAgentId);
                  if (!selectedAgent) return;

                  requestAgentCashClose(selectedAgent.uid, parsedAmount, reqCashNotes);
                  
                  // Reset form
                  setReqCashAmount('');
                  setReqCashNotes('');
                  setReqCashAgentId('');
                  setIsRequestingCashDrop(false);
                }}
                className={`p-3.5 border rounded-xl space-y-2.5 text-xs transition-all ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs">Request Cash Close / Drop from Agent</h3>
                  <span className="text-[10px] text-slate-400 font-mono">Will notify agent & permit cash close immediately</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-0.5">Select Field Agent *</label>
                    <select
                      value={reqCashAgentId}
                      onChange={(e) => setReqCashAgentId(e.target.value)}
                      required
                      className={`w-full border rounded-lg px-2.5 py-1.5 focus:outline-none font-mono text-xs ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    >
                      <option value="">-- Choose Agent --</option>
                      {agents.map(a => (
                        <option key={a.uid} value={a.uid}>{a.name} ({a.location || 'POS'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-0.5">Required Amount ($ USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={reqCashAmount}
                      onChange={(e) => setReqCashAmount(e.target.value)}
                      required
                      className={`w-full border rounded-lg px-2.5 py-1.5 focus:outline-none font-mono text-xs ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 font-mono mb-0.5">Instructional Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. End of month sales cycle reconciliation"
                    value={reqCashNotes}
                    onChange={(e) => setReqCashNotes(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-1.5 focus:outline-none font-mono text-xs ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRequestingCashDrop(false)}
                    className="px-3 py-1 bg-slate-500 hover:bg-slate-600 text-white rounded-lg font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition cursor-pointer"
                  >
                    Send Request to Agent
                  </button>
                </div>
              </form>
            )}

            {/* Per-Agent Sales Cycle Breakdown Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Agent Sales Cycle Performance & Cash Close Status ({salesCycleAggregate.agentMetrics.length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Min Amount Default: ${salesCycleAggregate.agentMetrics[0]?.minCashCloseAmount?.toFixed(2) || '10.00'}
                </span>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className={`border-b text-[10px] uppercase tracking-wider ${
                    theme === 'light' ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}>
                    <tr>
                      <th className="py-2 px-3">Agent</th>
                      <th className="py-2 px-3">Cash Collected</th>
                      <th className="py-2 px-3">Commission Earned</th>
                      <th className="py-2 px-3">Closed Cash</th>
                      <th className="py-2 px-3">Remaining Cash</th>
                      <th className="py-2 px-3">Remaining Commission</th>
                      <th className="py-2 px-3">Cycle Status</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800/80">
                    {salesCycleAggregate.agentMetrics.map((m) => (
                      <tr key={m.agentId} className={`transition-colors ${
                        theme === 'light' ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'
                      }`}>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {getAgentDisplayName(m.agentName)}
                          </div>
                          <div className="text-[9px] text-slate-400">
                            {m.agentLocation || 'POS'} &bull; Min Close: ${(m.minCashCloseAmount || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100">
                          ${(m.cashCollected || 0).toFixed(2)}
                          {m.unclosedCashFromPrevCycle !== undefined && m.unclosedCashFromPrevCycle > 0 && (
                            <div className="text-[9px] text-orange-600 dark:text-orange-400 font-mono font-semibold mt-0.5">
                              + ${(m.unclosedCashFromPrevCycle || 0).toFixed(2)} unclosed from last cycle
                              {m.prevCycleUnclosedAttachedStatus === 'pending' && (
                                <span className="block text-[8px] text-orange-500/80 font-normal italic">
                                  (Attached - Pending Close)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400 font-bold">
                          ${(m.commissionEarned || 0).toFixed(2)}
                          <span className="text-[9px] text-slate-400 font-normal ml-1">({m.commissionRate}%)</span>
                        </td>
                        <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-bold">
                          ${(m.closedCash || 0).toFixed(2)}
                          <div className="text-[9px] text-emerald-500/80 font-normal">
                            Matched: ${(m.closedCommission || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-amber-600 dark:text-amber-400 font-bold">
                          ${(m.remainingCash || 0).toFixed(2)}
                          <div className="text-[9px] text-amber-500/80 font-normal">Carried over</div>
                        </td>
                        <td className="py-2 px-3 text-amber-600 dark:text-amber-400 font-bold">
                          ${(m.remainingCommission || 0).toFixed(2)}
                          <div className="text-[9px] text-amber-500/80 font-normal">Carried over</div>
                        </td>
                        <td className="py-2 px-3">
                          {m.hasAdminRequest ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Close Requested
                            </span>
                          ) : m.isFinalDay ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 animate-pulse">
                              Final Day
                            </span>
                          ) : m.isPermissibleNow ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Cash Close Open
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              Scheduled
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              id={`btn-request-cash-close-${m.agentId}`}
                              onClick={() => {
                                const suggested = m.remainingCash > 0 ? m.remainingCash : undefined;
                                requestAgentCashClose(m.agentId, suggested, 'Sales cycle cash close request from Workspace Master');
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20 transition cursor-pointer"
                              title="Request immediate Cash Close from this agent"
                            >
                              Request Close
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsCashCloseScheduleModalOpen(true)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                              title="Adjust this agent's schedule and minimums"
                            >
                              Schedule
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {salesCycleAggregate.agentMetrics.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-4 text-center text-slate-400">
                          No active agents configured for sales cycle.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Submitted Cash Drops & Reconciliations Ledger */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Recent Cash Drop Reconciliations</span>
                <span className="text-[10px] font-mono font-normal">Pending: {workspaceCashDrops.filter(c => c.status === 'Pending' && !c.approvedAt).length}</span>
              </div>

              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {workspaceCashDrops.map(cd => {
                  const isPendingApproval = cd.status === 'Pending' && !cd.approvedAt;
                  return (
                  <div key={cd.id} className={`p-2 border rounded-lg flex items-center justify-between gap-2 transition-all duration-200 ease-out hover:scale-[1.01] hover:shadow-xs min-w-0 ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300' : 'bg-slate-950 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700'
                  }`}>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] font-bold truncate flex items-center gap-1.5 flex-wrap ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                        <span>{getAgentDisplayName(cd.agentName)} - Cash: ${(cd.amount || 0).toFixed(2)}</span>
                        {cd.attachedPrevCycleUnclosedCash !== undefined && cd.attachedPrevCycleUnclosedCash > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold font-mono uppercase bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                            Incl. Prev Cycle: ${(cd.attachedPrevCycleUnclosedCash || 0).toFixed(2)}
                            {cd.attachedPrevCycleCommission !== undefined && cd.attachedPrevCycleCommission > 0 && ` (+Comm: $${(cd.attachedPrevCycleCommission || 0).toFixed(2)})`}
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">
                        {cd.requestedBy} | {new Date(cd.timestamp).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                        {cd.notes ? ` • "${cd.notes}"` : ''}
                      </p>
                    </div>

                    {isPendingApproval ? (
                      <button
                        type="button"
                        id={`btn-approve-cash-drop-${cd.id}`}
                        onClick={() => handleOpenCashDropApproval(cd)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md text-[10px] font-bold font-mono uppercase transition cursor-pointer shrink-0 shadow-xs flex items-center gap-1 active:scale-95"
                        title="Review and approve Cash Close in approval modal"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenCashDropApproval(cd)}
                        className="px-2 py-0.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-bold font-mono uppercase shrink-0 flex items-center gap-1 cursor-pointer transition"
                        title="View approved cash close details"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Approved</span>
                      </button>
                    )}
                  </div>
                );
                })}

                {workspaceCashDrops.length === 0 && (
                  <p className="text-[11px] text-slate-400 font-mono text-center py-2">No cash close events filed.</p>
                )}
              </div>
            </div>
          </div>

          {/* Agent Voucher Queries & Direct Revocation Action Hub */}
          <div className={`border rounded-2xl p-3 sm:p-3.5 shadow-md transition-all duration-300 w-full max-w-full min-w-0 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0" />
                <h2 className={`text-xs sm:text-sm font-bold font-display truncate ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Agent Voucher Queries
                </h2>
              </div>
              {feedback.filter(f => f.status !== 'Resolved').length > 0 && (
                <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono shrink-0 animate-pulse">
                  {feedback.filter(f => f.status !== 'Resolved').length} Open
                </span>
              )}
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {feedback.map(fb => {
                // Check if a voucher is referenced in this feedback
                const matchedVoucher = fb.voucherId 
                  ? activeVouchers.find(v => v.id === fb.voucherId)
                  : (fb.voucherCode 
                      ? activeVouchers.find(v => v.code.toLowerCase() === fb.voucherCode?.toLowerCase())
                      : activeVouchers.find(v => fb.message.toUpperCase().includes(v.code.toUpperCase())));

                // Also find any vouchers allocated to this agent that are eligible for revocation
                const agentAssignedVouchers = activeVouchers.filter(v => v.assignedAgentId === fb.agentId && v.status !== 'Sold');

                return (
                  <div key={fb.id} className={`p-2.5 border rounded-xl flex flex-col gap-2 transition-all ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800/80'
                  }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                      <div className="font-bold truncate text-indigo-600 dark:text-indigo-400">
                        {fb.agentName}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-400 text-[9px]">
                          {new Date(fb.timestamp).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[8px] ${
                          fb.status === 'Resolved'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        }`}>
                          {fb.status || 'Open'}
                        </span>
                      </div>
                    </div>

                    {/* Query Message */}
                    <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {fb.message}
                    </p>

                    {/* Referenced / Detected Voucher Action Section */}
                    {matchedVoucher ? (
                      <div className={`p-2 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] font-mono ${
                        (matchedVoucher.status === 'Assigned' || !!matchedVoucher.assignedAgentId) && matchedVoucher.status !== 'Sold'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}>
                        <div className="min-w-0">
                          <span className="font-bold tracking-wider">{matchedVoucher.code}</span>
                          <span className="text-slate-400 ml-1.5">({matchedVoucher.plan} • ${(matchedVoucher.price || 0).toFixed(2)})</span>
                          <span className="block text-[9px] text-slate-500 dark:text-slate-400">
                            Status: {matchedVoucher.status} {matchedVoucher.assignedAgentName ? `• ${matchedVoucher.assignedAgentName}` : ''}
                          </span>
                        </div>

                        {(matchedVoucher.status === 'Assigned' || !!matchedVoucher.assignedAgentId) && matchedVoucher.status !== 'Sold' ? (
                          <button
                            type="button"
                            onClick={() => openRevokeModal([matchedVoucher], fb)}
                            className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
                            title="Open Revocation Modal for this referenced voucher"
                          >
                            <ShieldAlert className="w-3 h-3" /> Revoke / Delete
                          </button>
                        ) : (
                          <span className="text-[9px] font-mono font-bold text-slate-400 shrink-0">
                            {matchedVoucher.status === 'Sold' ? 'Voucher Sold' : 'In Pool'}
                          </span>
                        )}
                      </div>
                    ) : (
                      agentAssignedVouchers.length > 0 && (
                        <div className="p-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex flex-col gap-1.5 text-[10px]">
                          <span className="text-[9px] text-slate-400 font-mono">
                            Revoke an allocated voucher for this agent:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={querySelectedVoucherId[fb.id] || ''}
                              onChange={(e) => setQuerySelectedVoucherId(prev => ({ ...prev, [fb.id]: e.target.value }))}
                              className={`flex-1 border rounded px-2 py-1 text-[10px] focus:outline-none ${
                                theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                              }`}
                            >
                              <option value="">Select voucher to revoke...</option>
                              {agentAssignedVouchers.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.code} - {v.plan} (${(v.price || 0).toFixed(2)})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = agentAssignedVouchers.find(v => v.id === querySelectedVoucherId[fb.id]);
                                if (selected) openRevokeModal([selected], fb);
                              }}
                              disabled={!querySelectedVoucherId[fb.id]}
                              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
                            >
                              <ShieldAlert className="w-3 h-3" /> Revoke
                            </button>
                          </div>
                        </div>
                      )
                    )}

                    {/* Previous Admin Reply if exists */}
                    {fb.reply && (
                      <div className="p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/30 text-[10px] leading-relaxed">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono block text-[9px] uppercase">
                          Previous Master Resolution:
                        </span>
                        <p className="mt-0.5 text-slate-700 dark:text-slate-300">{fb.reply}</p>
                      </div>
                    )}

                    {/* Inline Response Form */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={queryReplyText[fb.id] || ''}
                        onChange={(e) => setQueryReplyText(prev => ({ ...prev, [fb.id]: e.target.value }))}
                        placeholder={fb.status === 'Resolved' ? "Add follow-up note..." : "Type reply to agent..."}
                        className={`flex-1 border rounded-lg px-2 py-1 text-[10px] focus:outline-none ${
                          theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const text = (queryReplyText[fb.id] || '').trim();
                          if (!text) return;
                          replyToFeedback(fb.id, text, 'Resolved');
                          setQueryReplyText(prev => ({ ...prev, [fb.id]: '' }));
                          showToast('Reply dispatched and query marked Resolved.', 'success');
                        }}
                        disabled={!(queryReplyText[fb.id] || '').trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer shrink-0"
                      >
                        Reply & Resolve
                      </button>
                    </div>
                  </div>
                );
              })}

              {feedback.length === 0 && (
                <p className="text-[11px] text-slate-400 font-mono text-center py-3">No agent voucher queries in queue.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legacy device enrollments */}
      <div id="legacy-devices-section" className={`border rounded-2xl p-3 sm:p-4 shadow-md transition-all duration-300 ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
          <div>
            <h2 className={`text-xs sm:text-sm font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Legacy Device Enrolments (Non-Wifi)</h2>
            <p className="text-[10px] text-slate-400 font-mono">Requires double-gate approval and custom price entry</p>
          </div>
          {legacyDevices.some(ld => ld.deletionRequested) && (
            <span className="px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[10px] font-mono font-bold animate-pulse flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{legacyDevices.filter(ld => ld.deletionRequested).length} Deletion Request(s) Pending Review</span>
            </span>
          )}
        </div>

        {/* Alert banner if field agents submitted deletion requests */}
        {legacyDevices.some(ld => ld.deletionRequested) && (
          <div className="mb-3 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 animate-bounce" />
              <span>
                <strong>Action Required:</strong> {legacyDevices.filter(ld => ld.deletionRequested).length} legacy terminal(s) have been flagged for deletion by field agents. Review and click "Effect Deletion" to confirm removal.
              </span>
            </div>
          </div>
        )}

        {/* Captive Portal Whitelist URL Configuration Banner */}
        <div className={`mb-3.5 p-3 rounded-xl border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs font-mono shadow-xs w-full max-w-full min-w-0 overflow-hidden box-border ${
          theme === 'light' ? 'bg-indigo-50/70 border-indigo-200 text-slate-800' : 'bg-indigo-950/40 border-indigo-800/60 text-indigo-200'
        }`}>
          <div className="flex flex-col gap-1.5 min-w-0 flex-1 w-full max-w-full">
            <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-100 flex-wrap min-w-0">
              <Globe className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="break-words">Captive Portal Whitelist Portal Link:</span>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full max-w-full min-w-0">
              <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold shrink-0">
                Select Portal Provider:
              </label>
              <select
                id="captive-portal-dropdown-select"
                value={
                  [
                    'https://cloud-eu.ruijienetworks.com',
                    'https://omada.tplinkcloud.com',
                    'http://192.168.88.1',
                    'https://gwn.cloud',
                    'https://unifi.ui.com',
                    'https://imaster.huawei.com',
                    'https://cnmaestro.cambiumnetworks.com',
                    'https://dashboard.meraki.com'
                  ].includes(captivePortalInput)
                    ? captivePortalInput
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'custom') {
                    setCaptivePortalInput(val);
                    updateCaptivePortalUrl(val);
                  }
                }}
                className={`w-full sm:w-auto max-w-full min-w-0 truncate px-2.5 py-1 text-xs border rounded-lg font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                  theme === 'light' ? 'bg-white border-indigo-300 text-indigo-950' : 'bg-slate-900 border-indigo-800 text-indigo-100'
                }`}
              >
                <option value="https://cloud-eu.ruijienetworks.com">Ruijie Cloud (cloud-eu.ruijienetworks.com)</option>
                <option value="https://omada.tplinkcloud.com">TP-Link Omada (omada.tplinkcloud.com)</option>
                <option value="http://192.168.88.1">MikroTik RouterOS / Hotspot (192.168.88.1)</option>
                <option value="https://gwn.cloud">Grandstream GWN Cloud (gwn.cloud)</option>
                <option value="https://unifi.ui.com">Ubiquiti UniFi Portal (unifi.ui.com)</option>
                <option value="https://imaster.huawei.com">Huawei iMaster NCE (imaster.huawei.com)</option>
                <option value="https://cnmaestro.cambiumnetworks.com">Cambium cnMaestro (cnmaestro.cambiumnetworks.com)</option>
                <option value="https://dashboard.meraki.com">Cisco Meraki Dashboard (dashboard.meraki.com)</option>
                <option value="custom">✏️ Custom Gateway / Enterprise URL...</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto min-w-0">
            <input
              type="text"
              id="captive-portal-custom-url-input"
              value={captivePortalInput}
              onChange={(e) => setCaptivePortalInput(e.target.value)}
              placeholder="https://cloud-eu.ruijienetworks.com"
              className={`px-2.5 py-1 text-xs border rounded-lg font-mono w-full sm:w-64 min-w-0 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => updateCaptivePortalUrl(captivePortalInput)}
                className="flex-1 sm:flex-initial justify-center px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs whitespace-nowrap text-center"
              >
                Save Link
              </button>
              <a
                href={activeWorkspace?.captivePortalUrl || captivePortalInput || 'https://cloud-eu.ruijienetworks.com'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial justify-center px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs whitespace-nowrap flex items-center gap-1 text-decoration-none text-center"
                title="Open Captive Portal whitelist website in new tab"
              >
                <span>Open Portal</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>
        </div>

        <div className={`overflow-x-auto no-scrollbar border rounded-xl transition w-full max-w-full ${
          theme === 'light' ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-950/40'
        }`}>
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${
                theme === 'light' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-800 bg-slate-950/40 text-slate-400'
              }`}>
                <th className="py-1.5 px-3">Customer & Device</th>
                <th className="py-1.5 px-3">Mac Address & Quick Copy</th>
                <th className="py-1.5 px-3">Agent Assigned</th>
                <th className="py-1.5 px-3">Price Request</th>
                <th className="py-1.5 px-3">Validation Gates</th>
                <th className="py-1.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${theme === 'light' ? 'divide-slate-100' : 'divide-slate-800/50'}`}>
              {paginatedAdminLegacyDevices.map(ld => {
                const isApproved = ld.isApproved;
                const isExpired = ld.status === 'EXPIRED' || (ld.expiresAt && new Date(ld.expiresAt).getTime() <= Date.now());
                return (
                  <tr key={ld.id} className={`transition-all duration-200 ease-out text-[11px] hover:scale-[1.004] origin-center ${
                    isExpired
                      ? theme === 'light' ? 'bg-slate-100/90 border-slate-200 text-slate-400' : 'bg-slate-900/80 border-slate-800 text-slate-500'
                      : ld.deletionRequested
                      ? theme === 'light' ? 'bg-rose-50/50 border-rose-200 text-slate-700' : 'bg-rose-950/20 border-rose-900/40 text-slate-200'
                      : theme === 'light' ? 'hover:bg-slate-100/80 hover:shadow-xs text-slate-600' : 'hover:bg-slate-800/35 hover:shadow-xs text-slate-300'
                  }`}>
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className={`font-bold ${
                          isExpired 
                            ? 'text-slate-400 dark:text-slate-500 line-through decoration-red-500/50' 
                            : theme === 'light' ? 'text-slate-800' : 'text-white'
                        }`}>
                          {ld.customerName}
                        </div>
                        {isExpired && (
                          <div className="inline-block transform -rotate-12 px-2 py-0.5 border-2 border-red-600 dark:border-red-500 bg-red-100/80 dark:bg-red-950/80 text-red-600 dark:text-red-400 font-black font-mono tracking-widest text-[9px] uppercase rounded shadow-2xs select-none">
                            EXPIRED
                          </div>
                        )}
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                          isExpired 
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700' 
                            : 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30'
                        }`}>
                          Lease #{ld.leaseCount || 1}
                        </span>
                      </div>
                      <div className={`text-[9px] ${isExpired ? 'text-slate-400 dark:text-slate-600' : 'text-slate-400'}`}>{ld.deviceNameModel}</div>
                      {ld.renewalRequested && (
                        <div className="mt-1 flex items-center gap-1 text-[9px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 rounded w-fit animate-pulse">
                          <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                          <span>Lease Renewal Requested ({ld.renewalRequestedDurationDays || 30}d) by {ld.renewalRequestedBy || 'Agent'}{ld.renewalReason ? `: "${ld.renewalReason}"` : ''}</span>
                        </div>
                      )}
                      {ld.deletionRequested && (
                        <div className="mt-1 flex items-center gap-1 text-[9px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded w-fit animate-pulse">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                          <span>Deletion Requested by {ld.deletionRequestedBy || 'Agent'}{ld.deletionReason ? `: "${ld.deletionReason}"` : ''}</span>
                        </div>
                      )}
                      {ld.reversalRequested && (
                        <div
                          onClick={() => setIsReversalsModalOpen(true)}
                          className="mt-1 flex items-center gap-1 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded w-fit animate-pulse cursor-pointer"
                          title="Click to review reversal in modal"
                        >
                          <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                          <span>Sale Reversal Requested{ld.reversalReason ? `: "${ld.reversalReason}"` : ''} • Review</span>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 font-mono font-semibold text-[10px]">
                      <div className="flex flex-col gap-1">
                        <span className={`font-bold ${isExpired ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>{ld.macAddress}</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleCopyDeviceText(ld.macAddress, 'MAC Address')}
                            className="px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500 hover:text-white text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-0.5 border border-slate-200 dark:border-slate-700"
                            title={`Copy MAC address: ${ld.macAddress}`}
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy MAC</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyDeviceText(ld.customerName, 'Customer Name')}
                            className="px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500 hover:text-white text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-0.5 border border-slate-200 dark:border-slate-700"
                            title={`Copy customer name: ${ld.customerName}`}
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy Name</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyDeviceText(`${ld.customerName} - MAC: ${ld.macAddress}`, 'Name & MAC')}
                            className="px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition cursor-pointer flex items-center gap-0.5 border border-indigo-500/20"
                            title={`Copy Name and MAC together`}
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Both</span>
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-mono text-[10px]">
                      {getAgentDisplayName(ld.fieldAgentName)}
                    </td>
                    <td className="py-1.5 px-3 font-mono">
                      {isApproved ? (
                        <div>
                          <span className={`font-bold text-[10px] ${isExpired ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-sky-500 dark:text-sky-400'}`}>
                            ${(ld.monthlyPrice || 0).toFixed(2)}/mo
                          </span>
                          {ld.approvedAt && (
                            <div className="text-[8px] text-slate-400 font-sans">
                              Approved: {new Date(ld.approvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 text-[10px]">$</span>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={legacyPrices[ld.id] || ''}
                              onChange={(e) => setLegacyPrices({ ...legacyPrices, [ld.id]: parseFloat(e.target.value) })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleLegacyApprove(ld.id);
                                }
                              }}
                              className={`border rounded px-1.5 py-0.5 w-16 text-[10px] h-6 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                                theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                              }`}
                              title="Enter monthly lease price and press Enter or click Approve"
                            />
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                            <span>Lease:</span>
                            <select
                              value={legacyLeaseDays[ld.id] ?? 30}
                              onChange={(e) => setLegacyLeaseDays({ ...legacyLeaseDays, [ld.id]: parseInt(e.target.value, 10) || 30 })}
                              className={`border rounded px-1 py-0.5 w-16 text-[9px] h-5 font-mono text-center focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                                theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                              }`}
                              title="Select 14-day or 30-day lease duration"
                            >
                              <option value={14}>14 Days</option>
                              <option value={30}>30 Days</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      {isApproved ? (
                        <div>
                          {isExpired ? (
                            <div className="flex flex-col gap-1 items-start">
                              <div className="inline-block transform -rotate-6 px-2 py-0.5 border-2 border-red-600 dark:border-red-500 bg-red-100/80 dark:bg-red-950/80 text-red-600 dark:text-red-400 font-black font-mono tracking-widest text-[9px] uppercase rounded shadow-2xs select-none">
                                EXPIRED
                              </div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                                Lease ended {ld.expiresAt ? new Date(ld.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono text-[10px]">Gate Approved ✓</span>
                          )}
                          {ld.expiresAt && !isExpired && (
                            <div className="text-[9px] text-amber-500 dark:text-amber-400 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span>Lease: {new Date(ld.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ({ld.leaseDurationDays || 30}d)</span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditLease(ld)}
                                className="px-1 py-0.5 text-[8px] font-bold rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition cursor-pointer inline-flex items-center gap-0.5"
                                title="Edit lease expiry date"
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                                <span>Edit</span>
                              </button>
                            </div>
                          )}
                          {isExpired && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditLease(ld)}
                              className="mt-1 px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer inline-flex items-center gap-1"
                              title="Renew or extend lease expiry date"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Extend / Renew Lease</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-mono font-bold text-sky-600 dark:text-sky-400">
                            Auto-Sold on Approval
                          </span>
                          <span className="text-[8px] text-slate-400 font-mono">
                            {(legacyLeaseDays[ld.id] || ld.leaseDurationDays || 30)}-day lease
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                        {ld.renewalRequested && (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm(`Approve ${ld.renewalRequestedDurationDays || 30}-day lease renewal for "${ld.deviceNameModel}" (${ld.customerName})?`)) {
                                  await approveLegacyDeviceRenewal(ld.id);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-[9px] px-2.5 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1 shadow-xs"
                              title={`Approve ${ld.renewalRequestedDurationDays || 30}-day lease renewal`}
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Approve Renewal ({ld.renewalRequestedDurationDays || 30}d)</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm(`Decline lease renewal request for "${ld.deviceNameModel}"?`)) {
                                  await declineLegacyDeviceRenewal(ld.id);
                                }
                              }}
                              className="border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-mono font-bold text-[9px] px-2 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1"
                              title="Decline lease renewal request"
                            >
                              <X className="w-3 h-3" />
                              <span>Decline Renewal</span>
                            </button>
                          </>
                        )}
                        {isApproved ? (
                          <>
                            {isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-slate-200 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700">
                                EXPIRED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                SOLD
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditLease(ld)}
                              className="border border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 font-mono font-bold text-[9px] px-2 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1 shadow-xs"
                              title="Edit device lease expiry date"
                            >
                              <Calendar className="w-3 h-3" />
                              <span>Edit Lease</span>
                            </button>
                            {ld.reversalRequested && (
                              <button
                                type="button"
                                onClick={() => setIsReversalsModalOpen(true)}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-[9px] px-2 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1 shadow-xs animate-pulse"
                                title="Review and approve/decline agent reversal request"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Review Reversal</span>
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            id={`btn-approve-legacy-${ld.id}`}
                            type="button"
                            onClick={() => handleLegacyApprove(ld.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-[9px] px-2.5 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1 shadow-xs"
                            title="Set price and approve legacy device (immediately marks as SOLD, logs approval day, and starts 30-day lease)"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Approve & Mark Sold</span>
                          </button>
                        )}

                        {/* Admin Decline Enrollment (for pending enrollment devices) */}
                        {!isApproved && !ld.deletionRequested && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Decline and reject enrollment request for "${ld.deviceNameModel}" (${ld.customerName})?`)) {
                                await declineLegacyDeviceEnrollment(ld.id);
                              }
                            }}
                            className="border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-mono font-bold text-[9px] px-2 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1"
                            title="Decline / Reject enrollment request"
                          >
                            <X className="w-3 h-3" />
                            <span>Decline</span>
                          </button>
                        )}

                        {/* Dismiss Deletion Request button if agent requested deletion */}
                        {ld.deletionRequested && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Decline / dismiss the deletion request for "${ld.deviceNameModel}" submitted by ${ld.deletionRequestedBy || 'agent'}? (Device will be retained)`)) {
                                await cancelLegacyDeviceDeletionRequest(ld.id);
                              }
                            }}
                            className="border border-slate-500/30 text-slate-500 hover:bg-slate-500/10 font-mono font-bold text-[9px] px-2 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1"
                            title="Decline agent deletion request (keep device)"
                          >
                            <X className="w-3 h-3" />
                            <span>Dismiss</span>
                          </button>
                        )}

                        {/* Admin Deletion Button (Effects requested deletion or deletes directly) */}
                        <button
                          type="button"
                          onClick={async () => {
                            const reasonText = ld.deletionReason ? `\n\nAgent Request Reason: "${ld.deletionReason}"` : '';
                            const confirmPrompt = ld.deletionRequested
                              ? `Effect Deletion:\nPermanently delete legacy device "${ld.deviceNameModel}" (MAC: ${ld.macAddress}, Customer: ${ld.customerName})?${reasonText}\n\nThis will remove the terminal permanently.`
                              : `Permanently delete legacy device "${ld.deviceNameModel}" (MAC: ${ld.macAddress}, Customer: ${ld.customerName})?\n\nThis will remove the device permanently.`;
                            if (window.confirm(confirmPrompt)) {
                              await deleteLegacyDevice(ld.id);
                            }
                          }}
                          className={`font-mono font-bold text-[9px] px-2.5 py-1 rounded-md transition cursor-pointer h-6 inline-flex items-center justify-center gap-1 shadow-xs ${
                            ld.deletionRequested
                              ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse shadow-rose-500/20'
                              : 'border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/50'
                          }`}
                          title={ld.deletionRequested ? `Effect requested deletion for "${ld.deviceNameModel}"` : "Permanently delete legacy device"}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{ld.deletionRequested ? 'Effect Deletion' : 'Delete'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {legacyDevices.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-400 font-mono text-[11px]">
                    No legacy enrollment records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {legacyDevices.length > visibleAdminLegacyLimit && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setVisibleAdminLegacyLimit(prev => prev + 20)}
              className={`w-full py-2 px-4 rounded-xl font-mono text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 shadow-xs ${
                theme === 'light'
                  ? 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200'
                  : 'bg-orange-950/40 hover:bg-orange-950/70 text-orange-300 border-orange-850'
              }`}
            >
              <span>Load More Devices ({paginatedAdminLegacyDevices.length} of {legacyDevices.length} shown)</span>
            </button>
          </div>
        )}
      </div>

      {/* Motivational message broadcaster & custom targeting actions */}
      <div className={`border rounded-3xl p-4 sm:p-5 shadow-xl max-w-2xl transition-all duration-300 ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Megaphone className="w-4 h-4" />
          </div>
          <div>
            <h2 className={`text-sm sm:text-base font-bold font-display leading-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              Broadcaster Notice Board
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Compose motivational notices, commission bonuses, or alerts. Choose which agents see the message.
            </p>
          </div>
        </div>

        <form onSubmit={handlePostNotification} className="space-y-3.5 mt-3">
          {/* Message input */}
          <div>
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Notice Content
            </label>
            <textarea
              required
              rows={2}
              value={motivationMsg}
              onChange={(e) => setMotivationMsg(e.target.value)}
              placeholder="e.g. Lithium sales bonus: Double commission this weekend in Kabwe Central!"
              className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                theme === 'light' ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400' : 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-600'
              }`}
            />
          </div>

          {/* Target Audience Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Select Broadcast Audience
              </label>
              <span className="text-[10px] font-mono text-slate-400">
                {broadcastTargetAudience === 'ALL'
                  ? `Will show to all ${agents.length} agent(s)`
                  : `${broadcastSelectedAgentIds.length} of ${agents.length} agent(s) selected`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBroadcastTargetAudience('ALL')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  broadcastTargetAudience === 'ALL'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Show to All Agents ({agents.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setBroadcastTargetAudience('SPECIFIC')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  broadcastTargetAudience === 'SPECIFIC'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>Select Specific Agents {broadcastSelectedAgentIds.length > 0 ? `(${broadcastSelectedAgentIds.length})` : ''}</span>
              </button>
            </div>

            {/* Targeted Agent Multi-Select Grid */}
            {broadcastTargetAudience === 'SPECIFIC' && (
              <div className={`p-3 rounded-2xl border space-y-2.5 transition animate-fade-in ${
                theme === 'light' ? 'bg-indigo-50/60 border-indigo-200' : 'bg-indigo-950/40 border-indigo-500/30'
              }`}>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">
                    Choose which field agents will receive this notice:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBroadcastSelectedAgentIds(agents.map(a => a.uid))}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-bold"
                    >
                      Select All
                    </button>
                    <span className="text-slate-400">•</span>
                    <button
                      type="button"
                      onClick={() => setBroadcastSelectedAgentIds([])}
                      className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {agents.map((agent) => {
                    const isSelected = broadcastSelectedAgentIds.includes(agent.uid);
                    return (
                      <label
                        key={agent.uid}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer select-none transition ${
                          isSelected
                            ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-900 dark:text-indigo-200 font-bold shadow-2xs'
                            : theme === 'light' ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBroadcastSelectedAgentIds(prev => [...prev, agent.uid]);
                              } else {
                                setBroadcastSelectedAgentIds(prev => prev.filter(id => id !== agent.uid));
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <div className="truncate">
                            <span className="block truncate">{agent.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono block truncate">
                              {agent.location || 'POS Station'}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1" />
                        )}
                      </label>
                    );
                  })}
                  {agents.length === 0 && (
                    <p className="text-xs text-slate-400 font-mono col-span-2 py-3 text-center">
                      No active field agents enrolled in this workspace.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Visibility status control & submit button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
              <input
                type="checkbox"
                checked={broadcastPublishImmediately}
                onChange={(e) => setBroadcastPublishImmediately(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {broadcastPublishImmediately
                  ? 'Broadcast immediately (Live on agent terminals & notification bar)'
                  : 'Save as Draft / Inactive (Do not broadcast to agents yet)'}
              </span>
            </label>

            <button
              type="submit"
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 ${
                broadcastPublishImmediately
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-slate-700 hover:bg-slate-800 text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {broadcastPublishImmediately
                  ? (broadcastTargetAudience === 'ALL'
                    ? 'Broadcast to All'
                    : `Broadcast to ${broadcastSelectedAgentIds.length} Agent(s)`)
                  : 'Save as Draft'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* MODALS SECTION */}

      {/* 0. Broadcast Notice Target Audience Modal */}
      {editingAudienceNotif && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`border rounded-3xl w-full max-w-lg p-5 sm:p-6 relative shadow-2xl transition-all ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => setEditingAudienceNotif(null)}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display">Target Notice Audience</h3>
                <p className="text-xs text-slate-400 font-mono">Select which agents can view this broadcast notice</p>
              </div>
            </div>

            {/* Notice preview */}
            <div className={`p-3 rounded-2xl border mb-4 text-xs font-medium leading-relaxed ${
              theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}>
              <span className="text-[10px] font-mono text-slate-400 block uppercase mb-1">Message:</span>
              "{editingAudienceNotif.message}"
            </div>

            {/* Audience selection buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3.5">
              <button
                type="button"
                onClick={() => setEditNotifTargetAudience('ALL')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  editNotifTargetAudience === 'ALL'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Show to All ({agents.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setEditNotifTargetAudience('SPECIFIC')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  editNotifTargetAudience === 'SPECIFIC'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>Target Agents ({editNotifSelectedAgentIds.length})</span>
              </button>
            </div>

            {/* Multi-agent checkbox picker */}
            {editNotifTargetAudience === 'SPECIFIC' && (
              <div className={`p-3 rounded-2xl border space-y-2 mb-4 ${
                theme === 'light' ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-950/30 border-indigo-500/30'
              }`}>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">Selected agents:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditNotifSelectedAgentIds(agents.map(a => a.uid))}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setEditNotifSelectedAgentIds([])}
                      className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {agents.map((agent) => {
                    const isNotifAgentSelected = editNotifSelectedAgentIds.includes(agent.uid);
                    return (
                      <label
                        key={agent.uid}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer select-none transition ${
                          isNotifAgentSelected
                            ? 'bg-indigo-600/10 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-bold'
                            : theme === 'light' ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isNotifAgentSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditNotifSelectedAgentIds(prev => [...prev, agent.uid]);
                              } else {
                                setEditNotifSelectedAgentIds(prev => prev.filter(id => id !== agent.uid));
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          <div className="truncate">
                            <span className="block truncate">{agent.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono block truncate">
                              {agent.location || 'POS Station'}
                            </span>
                          </div>
                        </div>
                        {isNotifAgentSelected && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingAudienceNotif(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (editNotifTargetAudience === 'SPECIFIC' && editNotifSelectedAgentIds.length === 0) {
                    showToast("⚠️ Please select at least one agent", "error");
                    return;
                  }
                  const editNotifTargetNames = agents
                    .filter(a => editNotifSelectedAgentIds.includes(a.uid))
                    .map(a => a.name);

                  await updateNotification(editingAudienceNotif.id, {
                    targetAudience: editNotifTargetAudience,
                    targetAgentIds: editNotifTargetAudience === 'SPECIFIC' ? editNotifSelectedAgentIds : [],
                    targetAgentNames: editNotifTargetAudience === 'SPECIFIC' ? editNotifTargetNames : [],
                    isBroadcast: true
                  });
                  showToast("✓ Broadcast target audience updated!", "success");
                  setEditingAudienceNotif(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs"
              >
                Save Audience Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. CSV Intelligent Mapper Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`border rounded-3xl w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 relative shadow-2xl transition-all ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => {
                setIsImportOpen(false);
                setFileName(null);
                setCsvText('');
                setImportResult(null);
              }}
              className={`absolute top-4 right-4 p-2 rounded-full transition ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className={`text-xl font-bold font-display mb-2 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Intelligent Spreadsheet/CSV Voucher Mapper</h3>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0 bg-slate-500/5 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/40">
              <p className="text-[11px] text-slate-400 font-mono leading-relaxed max-w-lg">
                Upload Excel or CSV. We automatically map ONLY columns: <code className="text-sky-500 font-bold">Voucher code</code>, <code className="text-sky-500 font-bold">User group/Plan</code>, <code className="text-sky-500 font-bold">Price/Amount</code>, <code className="text-sky-500 font-bold">Period/Duration</code>, <code className="text-sky-500 font-bold">Location/place</code>.
              </p>
              <button
                type="button"
                onClick={handleDownloadSampleVouchersCSV}
                className="text-[11px] font-mono font-bold text-sky-500 dark:text-sky-400 hover:text-sky-600 hover:underline flex items-center gap-1.5 shrink-0 self-start sm:self-center transition cursor-pointer bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 rounded-xl border border-sky-500/20"
              >
                <Download className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>Sample CSV</span>
              </button>
            </div>

            <form onSubmit={handleCSVImportSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-4">
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload-input')?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-sky-500 bg-sky-500/10 scale-[1.01]'
                    : theme === 'light'
                    ? 'border-slate-300 hover:border-sky-500 hover:bg-slate-50'
                    : 'border-slate-700 hover:border-sky-500 hover:bg-slate-800/40'
                }`}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className={`w-8 h-8 mx-auto mb-2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} />
                <p className={`text-xs font-bold font-display ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>
                  {fileName ? `File Selected: ${fileName}` : 'Drag & drop your CSV or Excel (.xlsx/.xls) file here'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">
                  {fileName ? 'Click here or drag a new file to replace' : 'or click here to browse and select from your computer'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-xs font-mono text-slate-400 mb-1">Default Site Location</label>
                  <button
                    type="button"
                    onClick={() => setIsLocationPopupOpen(!isLocationPopupOpen)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs flex justify-between items-center transition cursor-pointer text-left focus:outline-none ${
                      theme === 'light' 
                        ? 'bg-white border-slate-300 text-slate-900 hover:border-slate-400' 
                        : 'bg-slate-950 border-slate-800 text-white hover:border-slate-700'
                    }`}
                  >
                    <span>{defaultLocation || 'Select Location...'}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                  </button>

                  {isLocationPopupOpen && (
                    <div className={`absolute left-0 mt-1.5 w-64 rounded-2xl p-3 shadow-2xl border z-50 transition-all ${
                      theme === 'light' 
                        ? 'bg-white border-slate-200 text-slate-800' 
                        : 'bg-slate-900 border-slate-800 text-white'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <input
                          type="text"
                          value={newLocationInput}
                          onChange={(e) => setNewLocationInput(e.target.value)}
                          placeholder="Add custom location..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddLocation(newLocationInput);
                            }
                          }}
                          className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                            theme === 'light' 
                              ? 'bg-slate-50 border-slate-200 text-slate-900' 
                              : 'bg-slate-950 border-slate-850 text-white'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddLocation(newLocationInput)}
                          className="p-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition shrink-0"
                          title="Add location"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                        {customLocations.map((loc) => {
                          const isDefaultLocSelected = defaultLocation === loc;
                          const isEditingDefaultLoc = editingDropdownLoc === loc;
                          return (
                            <div
                              key={loc}
                              onClick={() => {
                                if (!isEditingDefaultLoc) {
                                  setDefaultLocation(loc);
                                  setIsLocationPopupOpen(false);
                                }
                              }}
                              className={`flex justify-between items-center px-2.5 py-1.5 rounded-xl text-xs transition ${
                                isDefaultLocSelected
                                  ? theme === 'light' ? 'bg-sky-50 text-sky-700 font-semibold' : 'bg-sky-950/40 text-sky-400 font-semibold'
                                  : theme === 'light' ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-800/50 text-slate-300'
                              } ${isEditingDefaultLoc ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                              {isEditingDefaultLoc ? (
                                <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editingDropdownVal}
                                    onChange={(e) => setEditingDropdownVal(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleEditLocation(loc, editingDropdownVal);
                                        setEditingDropdownLoc(null);
                                      } else if (e.key === 'Escape') {
                                        setEditingDropdownLoc(null);
                                      }
                                    }}
                                    autoFocus
                                    className={`flex-1 border rounded px-1.5 py-0.5 text-xs font-mono font-bold focus:outline-none ${
                                      theme === 'light' ? 'bg-white border-sky-400 text-slate-900' : 'bg-slate-950 border-sky-500 text-white'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleEditLocation(loc, editingDropdownVal);
                                      setEditingDropdownLoc(null);
                                    }}
                                    className="p-1 text-emerald-500 hover:text-emerald-600 rounded"
                                    title="Save location name"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDropdownLoc(null)}
                                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                    title="Cancel"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5 truncate">
                                    {isDefaultLocSelected && <Check className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                                    <span className="truncate">{loc}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 ml-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingDropdownLoc(loc);
                                        setEditingDropdownVal(loc);
                                      }}
                                      className="p-1 text-slate-400 hover:text-sky-500 rounded-md hover:bg-sky-500/10 transition"
                                      title="Edit preset location"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveLocation(loc);
                                      }}
                                      className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-500/10 transition"
                                      title="Remove location"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}

                        {customLocations.length === 0 && (
                          <p className="text-[10px] text-slate-400 text-center py-2">No locations. Add one above.</p>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setIsLocationPopupOpen(false);
                            setIsPresetLocationsModalOpen(true);
                          }}
                          className="w-full text-center py-1 text-[11px] font-mono font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>Manage Preset Locations</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Wi-Fi Network Name</label>
                  <input
                    type="text"
                    value={uploadNetworkName}
                    onChange={(e) => setUploadNetworkName(e.target.value)}
                    placeholder="e.g. VakZim_Free_Wifi"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      theme === 'light' 
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500' 
                        : 'bg-slate-950 border-slate-800 text-white focus:border-sky-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Mapped Plan Names</label>
                  <div className={`w-full border rounded-xl px-3 py-2 text-xs min-h-[36px] flex flex-wrap gap-1.5 items-center transition ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    {detectedInfo && detectedInfo.plans.length > 0 ? (
                      detectedInfo.plans.map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 font-bold text-[10px] font-mono">
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 text-[10px] font-mono">No plan names detected yet</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Intelligent spreadsheet detection feedback panel */}
              {detectedInfo && (
                <div className={`p-4 border rounded-2xl text-xs font-mono transition-all duration-300 ${
                  theme === 'light' 
                    ? 'bg-sky-50/50 border-sky-200 text-slate-800' 
                    : 'bg-sky-950/20 border-sky-900/40 text-sky-300'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="p-1 bg-sky-500/15 rounded-lg shrink-0 text-sky-500">
                      <Layers className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold uppercase tracking-wider text-[10px]">Document Analysis Feedback</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5 leading-relaxed text-[11px]">
                    <div>
                      <span className="text-slate-550 dark:text-slate-400">Parsed Rows Count:</span>{' '}
                      <strong className="text-slate-900 dark:text-slate-100">{detectedInfo.totalRows} Vouchers</strong>
                    </div>
                    <div>
                      <span className="text-slate-550 dark:text-slate-400">Plan Column Detection:</span>{' '}
                      <strong className={detectedInfo.hasPlansColumn ? 'text-emerald-650 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                        {detectedInfo.hasPlansColumn ? '✓ Yes (Auto-mapping active)' : '✗ No (Using default fallback)'}
                      </strong>
                    </div>
                    {detectedInfo.plans.length > 0 && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-550 dark:text-slate-400">Extracted Plan Names from Document:</span>{' '}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {detectedInfo.plans.map(p => (
                            <span key={p} className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-[10px] font-bold">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {detectedInfo.locations.length > 0 && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-550 dark:text-slate-400">Extracted Site Locations from Document:</span>{' '}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {detectedInfo.locations.map(l => (
                            <span key={l} className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                              {l}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {detectedInfo.previewRows && detectedInfo.previewRows.length > 0 && (
                      <div className="sm:col-span-2 border-t border-slate-200/50 dark:border-slate-800/50 pt-3 mt-1.5">
                        <span className="text-slate-550 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-2">Voucher Rows Mapping Preview (First 5 Rows):</span>
                        <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-800 bg-white/50 dark:bg-slate-950/40">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-150 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/40">
                                <th className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-400 font-mono">Code</th>
                                <th className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-400 font-mono">Mapped Plan (Cell Val)</th>
                                <th className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-400 font-mono">Price</th>
                                <th className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-400 font-mono">Duration</th>
                                <th className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-400 font-mono">Site Location</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 dark:divide-slate-800 font-mono text-[10px]">
                              {detectedInfo.previewRows.map((row, idx) => (
                                <tr key={idx} className="transition-all duration-150 ease-out hover:scale-[1.004] origin-center hover:bg-slate-100/70 dark:hover:bg-slate-900/60 hover:shadow-xs">
                                  <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200 select-all">{row.code}</td>
                                  <td className="px-3 py-2">
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-[9px]">
                                      {row.plan}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-sky-600 dark:text-sky-400 font-semibold">${(row.price || 0).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-slate-500 dark:text-slate-300">{row.duration}</td>
                                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{row.location || '(Blank / Admin Set)'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-mono text-slate-400">Data Preview / Manual Paste Pasteboard</label>
                  {fileName && (
                    <button
                      type="button"
                      onClick={() => {
                        setFileName(null);
                        setCsvText('');
                      }}
                      className="text-[10px] font-mono text-rose-500 hover:underline cursor-pointer"
                    >
                      Clear File
                    </button>
                  )}
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Voucher code,User group/Plan,Price/Amount,Period/Duration,Location/place&#10;VOU-GOLD-4411,Gold,35.00,7 Days,WiFi Zone A&#10;VOU-LITH-9922,Lithium,75.00,30 Days,WiFi Zone B"
                  required
                  rows={5}
                  className={`w-full border rounded-xl p-3 text-xs font-mono focus:outline-none ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              {importResult && (
                <div className={`p-4 rounded-xl text-xs font-mono border ${
                  importResult.success 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}>
                  <div className="font-bold">Import Status: {importResult.success ? 'Success!' : 'Voucher Alerts Raised'}</div>
                  <ul className="list-disc pl-4 mt-2 space-y-1">
                    <li>Vouchers Uploaded: {importResult.count}</li>
                    <li>Duplicates Prevented: {importResult.duplicatesCount}</li>
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-150 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportOpen(false);
                    setFileName(null);
                    setCsvText('');
                    setImportResult(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Upload & Mapping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Bulk Codes Paste Assignments Modal */}
      {isBulkAssignOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`border rounded-3xl w-full max-w-md p-6 relative shadow-2xl transition-all ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => setIsBulkAssignOpen(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className={`text-xl font-bold font-display mb-2 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Bulk Voucher Assignment</h3>
            <p className="text-xs text-slate-400 font-mono mb-4">Paste a list/string of voucher codes to assign to an agent in bulk.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Target Field Agent</label>
                <select
                  value={assignAgentId}
                  onChange={(e) => setAssignAgentId(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                >
                  <option value="">Select Field Agent...</option>
                  {agents.map(a => (
                    <option key={a.uid} value={a.uid}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Paste Voucher Codes</label>
                <textarea
                  value={bulkPasteInput}
                  onChange={(e) => setBulkPasteInput(e.target.value)}
                  placeholder="LUS-FAST-9321&#10;LUS-LITH-1243&#10;KIT-STAR-3444"
                  rows={4}
                  className={`w-full border rounded-xl p-3 text-xs font-mono focus:outline-none ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              {bulkPasteSummary.totalCodes > 0 && (
                <div className="space-y-2">
                  <div className={`p-3 border rounded-xl text-xs font-mono space-y-1.5 ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Total Codes Parsed:</span>
                      <strong className="text-slate-700 dark:text-slate-300">{bulkPasteSummary.totalCodes}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Ready to Assign:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {bulkPasteSummary.unallocated.length} (${bulkPasteSummary.unallocated.reduce((s, v) => s + v.price, 0).toFixed(2)})
                      </strong>
                    </div>
                    {bulkPasteSummary.alreadyAllocated.length > 0 && (
                      <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-bold">
                        <span>⚠️ Already Allocated/Sold:</span>
                        <span>{bulkPasteSummary.alreadyAllocated.length}</span>
                      </div>
                    )}
                    {bulkPasteSummary.notFound.length > 0 && (
                      <div className="flex justify-between items-center text-rose-500 font-bold">
                        <span>✗ Not Found in Catalog:</span>
                        <span>{bulkPasteSummary.notFound.length}</span>
                      </div>
                    )}
                  </div>

                  {bulkPasteSummary.alreadyAllocated.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-mono flex flex-col gap-1.5">
                      <div className="flex items-start gap-1.5">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          🔒 Policy: {bulkPasteSummary.alreadyAllocated.length} code(s) are already allocated to agents and cannot be reallocated directly.
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsBulkAssignOpen(false);
                            openRevokeModal(bulkPasteSummary.alreadyAllocated);
                          }}
                          className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] cursor-pointer"
                        >
                          Revoke Their Allocations First
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedSummary.count > 0 && bulkPasteSummary.totalCodes === 0 && (
                <div className={`p-3 border rounded-xl text-xs font-mono space-y-1 ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div>Selected Count: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedSummary.count}</span></div>
                  <div>Combined Value: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${(selectedSummary.value || 0).toFixed(2)}</span></div>
                  {assignAgentId && (
                    <div className={`pt-1.5 border-t ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
                      Total assigned to agent: <span className="text-sky-600 dark:text-sky-400 font-bold">${(selectedSummary.agentTotal || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkAssignOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkPasteAssign}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Execute Bulk Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Voucher Details Editor Modal */}
      {editVoucher && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`border rounded-3xl w-full max-w-sm p-6 relative shadow-2xl transition-all ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => setEditVoucher(null)}
              className={`absolute top-4 right-4 p-2 rounded-full transition ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className={`text-lg font-bold font-display mb-2 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Edit Voucher Details</h3>
            <p className="text-xs text-slate-400 font-mono mb-4">Code: {editVoucher.code}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Pricing Price ($)</label>
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:ring-1 focus:ring-sky-500' : 'bg-slate-950 border-slate-800 text-white focus:ring-1 focus:ring-sky-500'
                  }`}
                />
              </div>

              <div className="relative">
                <label className="block text-xs font-mono text-slate-400 mb-1">Site Location / Place</label>
                <button
                  type="button"
                  onClick={() => setIsEditLocationPopupOpen(!isEditLocationPopupOpen)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm flex justify-between items-center transition cursor-pointer text-left focus:outline-none ${
                    theme === 'light' 
                      ? 'bg-white border-slate-300 text-slate-900 focus:ring-1 focus:ring-sky-500' 
                      : 'bg-slate-950 border-slate-800 text-white focus:ring-1 focus:ring-sky-500'
                  }`}
                >
                  <span>{editLocation || 'Select Location or leave blank...'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                </button>

                {isEditLocationPopupOpen && (
                  <div className={`absolute left-0 mt-1.5 w-full rounded-2xl p-3 shadow-2xl border z-50 transition-all ${
                    theme === 'light' 
                      ? 'bg-white border-slate-200 text-slate-800' 
                      : 'bg-slate-900 border-slate-800 text-white'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <input
                        type="text"
                        value={newLocationInput}
                        onChange={(e) => setNewLocationInput(e.target.value)}
                        placeholder="Add custom location..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddLocation(newLocationInput);
                            setEditLocation(newLocationInput.trim());
                            setIsEditLocationPopupOpen(false);
                          }
                        }}
                        className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                          theme === 'light' 
                            ? 'bg-slate-50 border-slate-200 text-slate-900' 
                            : 'bg-slate-950 border-slate-850 text-white'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          handleAddLocation(newLocationInput);
                          setEditLocation(newLocationInput.trim());
                        }}
                        className="p-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition shrink-0"
                        title="Add location"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                      {customLocations.map((loc) => {
                        const isEditLocSelected = editLocation === loc;
                        const isEditingEditLoc = editingDropdownLoc === `edit_${loc}`;
                        return (
                          <div
                            key={loc}
                            onClick={() => {
                              if (!isEditingEditLoc) {
                                setEditLocation(loc);
                                setIsEditLocationPopupOpen(false);
                              }
                            }}
                            className={`flex justify-between items-center px-2.5 py-1.5 rounded-xl text-xs transition ${
                              isEditLocSelected
                                ? theme === 'light' ? 'bg-sky-50 text-sky-700 font-semibold' : 'bg-sky-950/40 text-sky-400 font-semibold'
                                : theme === 'light' ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-800/50 text-slate-300'
                            } ${isEditingEditLoc ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            {isEditingEditLoc ? (
                              <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingDropdownVal}
                                  onChange={(e) => setEditingDropdownVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleEditLocation(loc, editingDropdownVal);
                                      setEditingDropdownLoc(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingDropdownLoc(null);
                                    }
                                  }}
                                  autoFocus
                                  className={`flex-1 border rounded px-1.5 py-0.5 text-xs font-mono font-bold focus:outline-none ${
                                    theme === 'light' ? 'bg-white border-sky-400 text-slate-900' : 'bg-slate-950 border-sky-500 text-white'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleEditLocation(loc, editingDropdownVal);
                                    setEditingDropdownLoc(null);
                                  }}
                                  className="p-1 text-emerald-500 hover:text-emerald-600 rounded"
                                  title="Save location name"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDropdownLoc(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 truncate">
                                  {isEditLocSelected && <Check className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                                  <span className="truncate">{loc}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 ml-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingDropdownLoc(`edit_${loc}`);
                                      setEditingDropdownVal(loc);
                                    }}
                                    className="p-1 text-slate-400 hover:text-sky-500 rounded-md hover:bg-sky-500/10 transition"
                                    title="Edit preset location"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveLocation(loc);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-500/10 transition shrink-0"
                                    title="Remove location"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}

                      {customLocations.length === 0 && (
                        <p className="text-[10px] text-slate-400 text-center py-2">No locations. Add one above.</p>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditLocationPopupOpen(false);
                          setIsPresetLocationsModalOpen(true);
                        }}
                        className="w-full text-center py-1 text-[11px] font-mono font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>Manage Preset Locations</span>
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">If empty in the document, you can specify it here.</p>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Plan / User Group</label>
                <input
                  type="text"
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  placeholder="e.g. 30Days_Unlimited, 24Hours_Unlimited, 30M_2GB"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:ring-1 focus:ring-sky-500' : 'bg-slate-950 border-slate-800 text-white focus:ring-1 focus:ring-sky-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Wi-Fi Network Name (SSID)</label>
                <input
                  type="text"
                  value={editNetworkName}
                  onChange={(e) => setEditNetworkName(e.target.value)}
                  placeholder="e.g. VakZim_Free_Wifi"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:ring-1 focus:ring-sky-500' : 'bg-slate-950 border-slate-800 text-white focus:ring-1 focus:ring-sky-500'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditVoucher(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleVoucherUpdateSubmit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Confirm Change
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Token Export & Print Modal (PDF, CSV, Text, Standard Print in A4 2-column density) */}
      <AgentTokenExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        vouchers={vouchers}
        agents={agents}
        workspaceName={activeWorkspace?.name || 'WiVoTe Network'}
        theme={theme}
        preselectedAgentId={exportModalAgentId}
        preselectedVoucherIds={exportModalVoucherIds}
        showToast={showToast}
      />

      {/* High-Speed Text Recognition Scanner Modal (Workspace Master Toggleable Mode) */}
      <VoucherScannerModal
        isOpen={isScannerOpen}
        onClose={() => {
          setIsScannerOpen(false);
        }}
        onCodeScanned={handleWorkspaceMasterCodeScanned}
        mode={isContinuousBatchScan ? "multiple" : "single"}
        isBatchScanning={isContinuousBatchScan}
        onToggleBatchMode={handleToggleBatchScan}
        knownCodes={activeVoucherCodes}
        catalogVouchers={vouchers}
        title={isContinuousBatchScan ? "Batch Voucher Scanner" : "One-Time Voucher Scanner"}
        subtitle={
          isContinuousBatchScan
            ? "Continuous batch scanning mode active. Scanned codes are automatically matched and appended to the agent assignment queue."
            : "One-time scanning mode active. Matches and selects voucher for agent assignment, then closes automatically."
        }
        theme={theme}
        alreadySelectedCount={selectedVouchers.length}
      />

      {/* Genius Customer Loyalty Program Settings & Universal Registry Modal */}
      <LoyaltyProgramSettingsModal
        isOpen={isLoyaltyModalOpen}
        onClose={() => setIsLoyaltyModalOpen(false)}
        settings={loyaltySettings}
        onSaveSettings={updateLoyaltySettings}
        customers={workspaceCustomers}
        onAddOrUpdateCustomer={addOrUpdateCustomer}
        theme={theme}
        initialTab={loyaltyModalInitialTab}
      />

      {/* Immunization Safeguard Confirmation Modal for Bulk Updates */}
      {bulkSoldConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`border rounded-3xl w-full max-w-lg p-6 relative shadow-2xl transition-all max-h-[90vh] flex flex-col ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => setBulkSoldConfirmModal(null)}
              className={`absolute top-4 right-4 p-2 rounded-full transition cursor-pointer ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-2xl border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Sold Vouchers Detected in Selection
                </h3>
                <p className="text-xs text-slate-400 font-mono">System Immunization Safeguard • Historical Integrity Protection</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 my-2 text-xs font-mono">
              <div className={`p-3.5 rounded-2xl border ${
                theme === 'light' ? 'bg-amber-50/60 border-amber-200 text-amber-950' : 'bg-amber-950/30 border-amber-800/50 text-amber-200'
              }`}>
                <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400 mb-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Confirmation Required Before Executing</span>
                </div>
                <p className="leading-relaxed">
                  You selected <strong>{bulkSoldConfirmModal.totalCount} vouchers</strong> to update {bulkSoldConfirmModal.type === 'price' ? `to price $${bulkSoldConfirmModal.price?.toFixed(2)}` : `to plan "${bulkSoldConfirmModal.plan}"`}. 
                  Among them are <strong>{bulkSoldConfirmModal.soldIds.length} already sold vouchers</strong> with historical sales receipts.
                </p>
              </div>

              {/* Selection Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className={`p-3 rounded-2xl border ${
                  theme === 'light' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800' : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
                }`}>
                  <div className="text-lg font-black font-display">{bulkSoldConfirmModal.unsoldIds.length}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider">Unsold Inventory</div>
                  <div className="text-[9px] opacity-75">Unused or in Agent Stock</div>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  theme === 'light' ? 'bg-rose-50/50 border-rose-200 text-rose-800' : 'bg-rose-950/20 border-rose-900/40 text-rose-300'
                }`}>
                  <div className="text-lg font-black font-display">{bulkSoldConfirmModal.soldIds.length}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider">Sold Transactions</div>
                  <div className="text-[9px] opacity-75">Completed Historical Sales</div>
                </div>
              </div>

              {/* Sample of Affected Sold Vouchers */}
              <div className={`p-3 rounded-2xl border ${
                theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="text-[11px] font-bold mb-1.5 flex items-center justify-between">
                  <span>Sample of Sold Vouchers in Selection:</span>
                  <span className="text-[10px] text-slate-400 font-normal">Authentic Price</span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {bulkSoldConfirmModal.soldVouchers.slice(0, 5).map(v => (
                    <div key={v.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-900/60 text-[11px]">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {sanitizeVoucherCode(v) || v.code}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {v.assignedAgentName || 'Agent'} &bull; {v.plan}
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${Number(v.soldPrice ?? v.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {bulkSoldConfirmModal.soldVouchers.length > 5 && (
                    <div className="text-[10px] text-center text-slate-400 pt-1">
                      + {bulkSoldConfirmModal.soldVouchers.length - 5} more sold vouchers
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Modifying the price or plan of sold vouchers alters historical transaction records and causes sold vouchers to move into unexpected buttons in the Agent and Admin dashboards.
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 mt-2">
              <button
                type="button"
                onClick={() => {
                  if (bulkSoldConfirmModal.unsoldIds.length > 0) {
                    if (bulkSoldConfirmModal.type === 'price') {
                      bulkUpdateVouchers(bulkSoldConfirmModal.unsoldIds, { price: bulkSoldConfirmModal.price });
                      showToast(`✓ Safely updated price to $${bulkSoldConfirmModal.price?.toFixed(2)} for ${bulkSoldConfirmModal.unsoldIds.length} unsold vouchers (historical sold records protected)`, 'success');
                    } else {
                      bulkUpdateVouchers(bulkSoldConfirmModal.unsoldIds, { plan: bulkSoldConfirmModal.plan });
                      showToast(`✓ Safely updated plan to "${bulkSoldConfirmModal.plan}" for ${bulkSoldConfirmModal.unsoldIds.length} unsold vouchers (historical sold records protected)`, 'success');
                    }
                  } else {
                    showToast('No unsold vouchers were in the selection. Sold records were preserved without change.', 'info');
                  }
                  setBulkSoldConfirmModal(null);
                  setSelectedVouchers([]);
                  setBulkPriceInput('');
                  setBulkPlanInput('');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Update Unsold Inventory Only (Recommended)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (bulkSoldConfirmModal.type === 'price') {
                    bulkUpdateVouchers(selectedVouchers, { price: bulkSoldConfirmModal.price }, { includeSold: true });
                    showToast(`Updated price on all ${selectedVouchers.length} vouchers, including historical records`, 'info');
                  } else {
                    bulkUpdateVouchers(selectedVouchers, { plan: bulkSoldConfirmModal.plan }, { includeSold: true });
                    showToast(`Updated plan on all ${selectedVouchers.length} vouchers, including historical records`, 'info');
                  }
                  setBulkSoldConfirmModal(null);
                  setSelectedVouchers([]);
                  setBulkPriceInput('');
                  setBulkPlanInput('');
                }}
                className="w-full py-2 px-4 rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-medium text-[11px] transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Yes, Force Update All (Including Sold Vouchers)</span>
              </button>

              <button
                type="button"
                onClick={() => setBulkSoldConfirmModal(null)}
                className={`w-full py-2 px-4 rounded-xl transition cursor-pointer text-xs font-semibold ${
                  theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Master Revoke Voucher Allocation Modal */}
      {isRevokeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`border rounded-3xl w-full max-w-lg p-6 relative shadow-2xl transition-all max-h-[90vh] flex flex-col ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              onClick={() => setIsRevokeModalOpen(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition cursor-pointer ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2.5 rounded-2xl border ${
                revokeMode === 'delete'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}>
                {revokeMode === 'delete' ? <Trash2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <h3 className={`text-lg font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Revoke Voucher Allocation
                </h3>
                <p className="text-xs text-slate-400 font-mono">Workspace Master Authority • Reallocation & Removal Control</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 my-2 text-xs font-mono">
              {/* Query Context Banner if opened from Agent Query */}
              {activeQueryToResolve && (
                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 text-indigo-900 dark:text-indigo-200">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1 text-indigo-600 dark:text-indigo-400">
                    <MessageSquare className="w-3.5 h-3.5" /> Initiated from Agent Query
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    <strong>{activeQueryToResolve.agentName}:</strong> &ldquo;{activeQueryToResolve.message}&rdquo;
                  </p>
                  <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1">
                    ✓ Confirming this revocation will automatically resolve the agent&apos;s ticket and post an audit resolution reply.
                  </p>
                </div>
              )}

              {/* Stats Overview */}
              <div className={`p-3.5 rounded-2xl border ${
                theme === 'light' ? 'bg-amber-50/50 border-amber-200 text-amber-900' : 'bg-amber-950/20 border-amber-900/40 text-amber-300'
              }`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-amber-500/20">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Vouchers</span>
                    <strong className="text-base text-amber-600 dark:text-amber-400">{vouchersToRevoke.length}</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-amber-500/20">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Value</span>
                    <strong className="text-base text-emerald-600 dark:text-emerald-400">
                      ${vouchersToRevoke.reduce((sum, v) => sum + v.price, 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-amber-500/20 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Affected Agents</span>
                    <strong className="text-base text-sky-600 dark:text-sky-400">
                      {new Set(vouchersToRevoke.map(v => v.assignedAgentId).filter(Boolean)).size}
                    </strong>
                  </div>
                </div>
              </div>

              {/* List of Vouchers */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Selected Vouchers for Revocation ({vouchersToRevoke.length})
                </span>
                <div className="max-h-36 overflow-y-auto border rounded-xl divide-y border-slate-200 dark:border-slate-800 divide-slate-150 dark:divide-slate-800/60">
                  {vouchersToRevoke.map(v => (
                    <div key={v.id} className="p-2 flex items-center justify-between gap-2 text-[11px]">
                      <div className="min-w-0">
                        <span className="font-bold select-all tracking-wider">{v.code}</span>
                        <span className="text-slate-400 ml-2">({v.plan} • ${(v.price || 0).toFixed(2)})</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/15 text-[9px] font-bold">
                          Assigned: {v.assignedAgentName || 'Agent'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revocation Mode Choice */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Revocation Destination & Disposition
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRevokeMode('pool')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      revokeMode === 'pool'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 mb-0.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> Return to Main Pool
                    </div>
                    <p className="text-[10px] font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                      Sever active agent link and return to unallocated stock for future reassignment.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRevokeMode('delete')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      revokeMode === 'delete'
                        ? 'border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-200 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 mb-0.5">
                      <Trash2 className="w-3.5 h-3.5" /> Permanently Delete
                    </div>
                    <p className="text-[10px] font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                      Sever agent link and permanently erase vouchers from the database catalog.
                    </p>
                  </button>
                </div>
              </div>

              {/* Reason Input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Reason for Revocation (Logged in Audit Trail)
                </label>
                <input
                  type="text"
                  value={revokeReasonInput}
                  onChange={(e) => setRevokeReasonInput(e.target.value)}
                  placeholder="e.g. Agent reassignment, voucher query resolution, returned unissued"
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-950 border-slate-800 text-white focus:border-amber-500'
                  }`}
                />
              </div>

              {/* Agent Notification Preview */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed border border-slate-200 dark:border-slate-700/60">
                <span className="font-bold uppercase tracking-wider block text-slate-500 dark:text-slate-300 mb-0.5">
                  📢 Automated Agent Notification Broadcast
                </span>
                {revokeMode === 'delete' ? (
                  <span>
                    In either case the agent will be notified voucher code revoked by admin when deleted. (e.g. <em>&ldquo;Voucher code {vouchersToRevoke[0]?.code || 'XXXX'} revoked by admin when deleted.&rdquo;</em>)
                  </span>
                ) : (
                  <span>
                    In either case the agent will be notified voucher code revoked by admin. (e.g. <em>&ldquo;Voucher code {vouchersToRevoke[0]?.code || 'XXXX'} allocation revoked by admin and returned to pool.&rdquo;</em>)
                  </span>
                )}
              </div>

              {/* Mandatory Confirmation Modal Acknowledgement */}
              <div className={`p-3.5 rounded-2xl border transition-all ${
                revokeAcknowledged
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
              }`}>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="mandatory-revocation-acknowledgement"
                    checked={revokeAcknowledged}
                    onChange={(e) => setRevokeAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-slate-400 text-amber-600 focus:ring-amber-500 h-4 w-4 shrink-0 cursor-pointer"
                  />
                  <span className="text-[11px] leading-relaxed">
                    <strong>Mandatory Acknowledgment:</strong> I explicitly acknowledge that the {vouchersToRevoke.length} selected voucher(s) will be {revokeMode === 'delete' ? 'permanently deleted from the system' : 'returned to the main unallocated inventory pool'}, that any active agent link will be permanently severed, and that the agent will be notified voucher code revoked by admin when deleted.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsRevokeModalOpen(false)}
                disabled={isRevoking}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                disabled={!revokeAcknowledged || isRevoking}
                className={`disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                  revokeMode === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    {revokeMode === 'delete' ? <Trash2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                    {revokeMode === 'delete' ? 'Confirm Revocation & Deletion' : 'Confirm Revocation & Return to Pool'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Activity & Audit Logs Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-200">
          <div className={`border rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
              theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/50'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-sky-500" />
                </div>
                <div>
                  <h3 className="font-bold text-sm font-display flex items-center gap-2">
                    <span>Administrative Activity & Agent Action Trail</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-500 border border-sky-500/20 font-bold">
                      {auditLogs?.length || 0} Events Recorded
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Real-time tracking of agent customer additions, edits, and deletions (e.g. Agent edited/deleted customer)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar">
              <AccessAuditView />
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Agent Location & Territory Modal */}
      <AgentLocationModal
        isOpen={isAgentLocationModalOpen}
        onClose={() => {
          setIsAgentLocationModalOpen(false);
          setSelectedAgentForLocation(null);
        }}
        agent={selectedAgentForLocation}
        onSaveLocation={handleSaveAgentLocation}
        theme={theme}
        availableLocations={customLocations}
        onAddPresetLocation={handleAddLocation}
        onEditPresetLocation={handleEditLocation}
        onDeletePresetLocation={handleRemoveLocation}
        assignedVouchersCount={
          selectedAgentForLocation
            ? vouchers.filter(v => v.assignedAgentId === selectedAgentForLocation.uid && v.status === 'Assigned' && !isVoucherFree(v, giveawaySettings)).length
            : 0
        }
      />

      {/* Dedicated Preset Locations & Territories Management Modal */}
      <PresetLocationsModal
        isOpen={isPresetLocationsModalOpen}
        onClose={() => setIsPresetLocationsModalOpen(false)}
        presetLocations={customLocations}
        onAddLocation={handleAddLocation}
        onEditLocation={handleEditLocation}
        onDeleteLocation={handleRemoveLocation}
        onResetDefaults={handleResetPresetLocations}
        theme={theme}
      />

      {/* Dedicated Unmatched Voucher Codes Modal */}
      <UnmatchedVouchersModal
        isOpen={isUnmatchedModalOpen}
        onClose={() => setIsUnmatchedModalOpen(false)}
        unmatchedTokens={unmatchedTokens}
        totalQueried={searchTokens.length}
        matchedCount={filteredVouchers.length}
        theme={theme}
        onClearFilters={handleClearFiltersForUnmatched}
      />

      {/* Free Voucher Giveaway & Gifting Configuration Modal */}
      <FreeVoucherGiveawayModal
        isOpen={isGiveawayModalOpen}
        onClose={() => setIsGiveawayModalOpen(false)}
        theme={theme}
      />

      {/* Administrator Token Request Approval Modal */}
      <TokenRequestApprovalModal
        isOpen={isTokenRequestApprovalOpen}
        onClose={() => setIsTokenRequestApprovalOpen(false)}
        requests={sortedRequests}
        vouchers={activeVouchers}
        agents={agents}
        theme={theme}
        activeRequestId={activeAssignedRequest?.id}
        onGoToRequest={handleGoToRequest}
        onApproveRequest={(requestId) => {
          fulfillVoucherRequest(requestId);
          showToast('Token request marked as Approved!', 'success');
        }}
        onDeclineRequest={(requestId) => {
          declineVoucherRequest(requestId);
          showToast('Token request declined.', 'info');
        }}
        onDeleteRequest={(requestId) => {
          deleteVoucherRequest(requestId);
          showToast('Token request record deleted.', 'info');
        }}
      />

      {/* Admin Sales Cycle & Cash Close Parameters Modal */}
      <AdminCashCloseScheduleModal
        isOpen={isCashCloseScheduleModalOpen}
        onClose={() => setIsCashCloseScheduleModalOpen(false)}
        theme={theme}
      />

      {/* Dedicated Voucher Plan Names Editing Modal */}
      <EditPlanNamesModal
        isOpen={isEditPlansModalOpen}
        onClose={() => setIsEditPlansModalOpen(false)}
        plans={plans}
        theme={theme}
        categoryTallies={categoryTallies}
      />

      {/* Dedicated Edit Legacy Device Lease Expiry Modal */}
      <EditLegacyLeaseModal
        isOpen={isEditLeaseModalOpen}
        onClose={() => {
          setIsEditLeaseModalOpen(false);
          setSelectedDeviceForLeaseEdit(null);
        }}
        device={selectedDeviceForLeaseEdit}
        onSave={updateLegacyDeviceLeaseExpiry}
        theme={theme}
      />

      {/* Dedicated Continuous Workspace Database Backups & Instant Restore Modal */}
      <AdminWorkspaceBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />

      {/* Transaction Sale Reversals Modal */}
      <TransactionReversalsModal
        isOpen={isReversalsModalOpen}
        onClose={() => {
          setIsReversalsModalOpen(false);
          setReversalsInitialSearch('');
        }}
        initialSearchTerm={reversalsInitialSearch}
        theme={theme}
      />

      {/* Cash Drop Approval & Reconciliation Modal */}
      <CashDropApprovalModal
        isOpen={isCashDropApprovalModalOpen}
        onClose={() => {
          setIsCashDropApprovalModalOpen(false);
          setSelectedCashDropForApproval(null);
        }}
        cashDrop={selectedCashDropForApproval}
        onApprove={async (cashDropId, notes) => {
          if (notes) {
            fulfillAdminCashDropRequest(cashDropId, notes);
          }
          await reconcileCashDrop(cashDropId);
        }}
        onDecline={async (cashDropId, reason) => {
          await declineCashDrop(cashDropId, reason);
        }}
        vouchers={vouchers}
        legacyDevices={legacyDevices}
        users={users}
        theme={theme}
      />

      {/* Captive Portal Gateway URLs Manager Modal */}
      <CaptivePortalManagerModal
        isOpen={isCaptivePortalModalOpen}
        onClose={() => setIsCaptivePortalModalOpen(false)}
      />
    </div>
  );
};
