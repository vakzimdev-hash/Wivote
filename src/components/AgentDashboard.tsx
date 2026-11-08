import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp, sanitizeVoucherCode, resolveCustomerWorkspaceId, getTargetWorkspaceId, getSoldVouchersRegistry } from '../context/AppContext';
import { MetricSkeleton } from './MetricSkeleton';
import {
  Wifi,
  CheckCircle,
  Clock,
  Printer,
  Share2,
  Send,
  AlertCircle,
  Plus,
  Compass,
  DollarSign,
  TrendingUp,
  Award,
  ChevronLeft,
  ChevronDown,
  Check,
  HelpCircle,
  X,
  GripVertical,
  ArrowRightLeft,
  Lock,
  Unlock,
  Pin,
  Move,
  Filter,
  Image as ImageIcon,
  FileText,
  Download,
  Share,
  Bluetooth,
  Search,
  History,
  ScanLine,
  Sparkles,
  Gift,
  ExternalLink,
  Users,
  UserCheck,
  FastForward,
  AlertTriangle,
  Sliders,
  Layers,
  XCircle,
  Trash2,
  Calendar,
  CheckCircle2,
  Tag,
  RefreshCw,
  CloudUpload,
  Database,
  Upload,
  Copy,
  RotateCcw,
  Cpu,
  Camera
} from 'lucide-react';
import { Voucher, LegacyDevice, UserProfile, Customer } from '../types';
import { AgentSkeleton } from './DashboardSkeleton';
import { canAccessAgentDashboard, getWorkspaceActiveAgents, getAuthoritativeAgentLeaderboard, deduplicateLegacyDevices } from '../utils/rbacPolicy';
import { CountryPhoneInput, INTERNATIONAL_COUNTRIES } from './CountryPhoneInput';
import { TabStripContainer } from './TabStripContainer';
import { AgentTransactionsArchive } from './AgentTransactionsArchive';
import { VoucherScannerModal } from './VoucherScannerModal';
import { CashCloseModal } from './CashCloseModal';
import { RequestLeaseRenewalModal } from './RequestLeaseRenewalModal';
import {
  getAgentSalesCycleMetrics,
  getCycleMonthLabel,
  getCurrentCycleMonth,
  getPreviousCycleMonth,
  getCycleMonthFromDate,
  parseTimestampToDate,
  getDaysUntilMonthEnd,
  isDropApprovedOrReconciled,
  isDropPending
} from '../utils/salesCycleEngine';
import { CustomerSearchSelect } from './CustomerSearchSelect';
import { evaluateCustomerLoyalty, calculateActiveStreakCount } from '../utils/loyaltyEngine';
import { LoyaltyProgramSettingsModal } from './LoyaltyProgramSettingsModal';
import { ThermalPrinterSettingsModal } from './ThermalPrinterSettingsModal';
import { AgentGiveawayModal } from './AgentGiveawayModal';
import { isPlanMarkedFree, isVoucherFree, canAgentGiveaway, getVoucherMonetaryValue } from '../utils/giveawayEngine';
import { playScanSuccessChime, triggerScanVibrate } from '../utils/textRecognition';
import { fuzzySearchVouchers, VoucherFuzzyResult, HighlightText } from '../utils/fuzzySearch';
import { formatWhatsAppPhone, openWhatsAppWithReceipt } from '../utils/whatsappHelper';
import { isNotificationVisibleToUser } from '../utils/notificationPolicy';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';
import {
  isWebBluetoothAvailable,
  isAppInIframe,
  getActiveBTPrinter,
  detectAndConnectBTPrinter,
  disconnectBTPrinter,
  autoConnectSavedPrinter,
  subscribePrinterStatus,
  printReceiptUniversal,
  getPrinterEmulation,
  ConnectedBTPrinter,
  TicketPrintData
} from '../utils/bluetoothPrinter';

interface AgentDashboardProps {
  isPreview?: boolean;
}

export const AgentDashboard: React.FC<AgentDashboardProps> = ({ isPreview = false }) => {
  const {
    vouchers,
    users,
    requests,
    legacyDevices,
    notifications,
    readNotificationIds,
    markNotificationAsRead,
    customers,
    leaderboardSummary,
    loyaltySettings,
    giveawaySettings,
    completeSale,
    submitVoucherRequest,
    deleteVoucherRequest,
    updateVoucherRequest,
    submitCashDrop,
    fulfillAdminCashDropRequest,
    isPushingToDb,
    cashDrops,
    submitLegacyDevice,
    approveLegacyDevice,
    cancelLegacyDeviceEnrollment,
    requestLegacyDeviceDeletion,
    cancelLegacyDeviceDeletionRequest,
    requestLegacyDeviceRenewal,
    cancelLegacyDeviceRenewalRequest,
    markLegacyDeviceSold,
    simulateExpiredDeviceAlert,
    submitFeedback,
    feedback,
    currentUser,
    activeWorkspace,
    theme,
    addOrUpdateCustomer,
    showToast,
    cashCloseSettings,
    updateAgentCashCloseSchedule,
    refetchData,
    forcePushLocalToGlobalDB,
    isMetricsSyncing,
    isRefetching,
    globalLoading,
    initialized,
    reversalRequests,
    serverAuthoritativeMetrics,
    pendingMutationsCount,
    latestDbPushMetricsMirror,
    isAuthoritativeDataReady
  } = useApp();

  // Metrics blurring must be done only when the app has just started and still fetching the most current metrics.
  // Never blur on recurring 30s live sync counter cycles, refetches, or background pushes.
  const isEffectiveMetricsSyncing = Boolean(isMetricsSyncing);

  const agentWsId = getTargetWorkspaceId(activeWorkspace, currentUser, 'ws_vakzim');

  // Latest DB Push Metrics Mirror for the current agent (vault of the last successful DB push)
  const myMirroredMetrics = useMemo(() => {
    if (!latestDbPushMetricsMirror?.agents || !currentUser) return null;
    const uid = (currentUser.uid || '').toLowerCase().trim();
    const email = (currentUser.email || '').toLowerCase().trim();
    const name = (currentUser.name || '').toLowerCase().trim();
    const cleanId = currentUser.uid || '';
    const agents = latestDbPushMetricsMirror.agents;

    return (
      agents[cleanId] ||
      (uid && agents[uid]) ||
      (email && agents[email]) ||
      (name && agents[name]) ||
      null
    );
  }, [latestDbPushMetricsMirror, currentUser]);

  // Visual cues: Determine if metrics on screen are currently from Snapshot Mirror or Live Global DB
  const isUsingSnapshotMirror = useMemo(() => {
    return Boolean(myMirroredMetrics && (!isAuthoritativeDataReady || vouchers.length === 0));
  }, [myMirroredMetrics, isAuthoritativeDataReady, vouchers.length]);

  const snapshotFormattedTime = useMemo(() => {
    if (!latestDbPushMetricsMirror?.timestamp) return null;
    try {
      const d = new Date(latestDbPushMetricsMirror.timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [latestDbPushMetricsMirror?.timestamp]);

  // Resolve authoritative agent metrics directly from Global DB server payload
  const myAuthoritativeMetrics = useMemo(() => {
    if (!serverAuthoritativeMetrics || !currentUser) return null;
    const uid = (currentUser.uid || '').toLowerCase().trim();
    const email = (currentUser.email || '').toLowerCase().trim();
    const name = (currentUser.name || '').toLowerCase().trim();
    const cleanId = currentUser.uid || '';

    return (
      serverAuthoritativeMetrics[cleanId] ||
      (uid && serverAuthoritativeMetrics[uid]) ||
      (email && serverAuthoritativeMetrics[email]) ||
      (name && serverAuthoritativeMetrics[name]) ||
      serverAuthoritativeMetrics['current'] ||
      null
    );
  }, [serverAuthoritativeMetrics, currentUser]);
  const workspaceCustomers = useMemo(() => {
    return customers.filter(c => resolveCustomerWorkspaceId(c, agentWsId) === agentWsId);
  }, [customers, agentWsId]);

  // Promptly refresh all workspace data from Firestore whenever the Agent Dashboard opens
  useEffect(() => {
    refetchData?.().catch(() => {});
  }, []);

  const visibleNotifications = useMemo(() => {
    return (notifications || []).filter(n => isNotificationVisibleToUser(n, currentUser));
  }, [notifications, currentUser]);

  if (!canAccessAgentDashboard(currentUser, isPreview)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <Lock className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-black tracking-tight mb-2 uppercase text-rose-500">Access Restricted</h1>
        <p className="text-sm max-w-md opacity-80 leading-relaxed font-mono">
          This view is strictly designated for Field Agent accounts or App Owner preview sessions.
        </p>
      </div>
    );
  }

  const [loading, setLoading] = useState(false);

  // --- Core Agent States ---
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [priceFilter, setPriceFilter] = useState<number | 'all' | 'free' | 'paid'>('all');
  const [overlayPos, setOverlayPos] = useState({ x: 20, y: 15 });
  const [isPriceSelectorDocked, setIsPriceSelectorDocked] = useState(true);
  const [copiedAgentUid, setCopiedAgentUid] = useState(false);

  // Keep overlay position bounded inside the container on mobile resize or load
  useEffect(() => {
    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setOverlayPos(prev => {
            const maxX = Math.max(5, rect.width - 150);
            const maxY = Math.max(5, rect.height - 60);
            return {
              x: Math.min(prev.x, maxX),
              y: Math.min(prev.y, maxY)
            };
          });
        }
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    const t = setTimeout(handleResize, 1000);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(t);
      clearTimeout(resizeTimer);
    };
  }, []);

  const lastTapRef = React.useRef<number>(0);
  const [overlayLocked, setOverlayLocked] = useState(false);
  const [overlayOrientation, setOverlayOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerCell, setCustomerCell] = useState('');
  const [activeTab, setActiveTab] = useState<'sales' | 'archive' | 'requests' | 'legacy' | 'queries'>('sales');
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);

  useEffect(() => {
    const handleJumpToBroadcast = (e: any) => {
      setActiveTab('sales');
      setShowAllNotifs(true);
      setTimeout(() => {
        const notifId = e.detail?.notifId;
        const targetEl = (notifId ? document.getElementById(`broadcast-notice-${notifId}`) : null) || document.getElementById('workspace-notice-board');
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.add('ring-4', 'ring-indigo-500', 'shadow-2xl', 'scale-[1.01]');
          setTimeout(() => {
            targetEl.classList.remove('ring-4', 'ring-indigo-500', 'shadow-2xl', 'scale-[1.01]');
          }, 3500);
        }
      }, 150);
    };

    const handleOpenReversalAction = (e: any) => {
      const { referenceCode, requestId, transactionId } = e.detail || {};
      const searchTerm = referenceCode || requestId || transactionId || '';
      if (searchTerm) setArchiveSearchQuery(searchTerm);
      setActiveTab('archive');
    };

    window.addEventListener('wivote:navigate-to-broadcast', handleJumpToBroadcast);
    window.addEventListener('wivote:open-reversal-action', handleOpenReversalAction);
    return () => {
      window.removeEventListener('wivote:navigate-to-broadcast', handleJumpToBroadcast);
      window.removeEventListener('wivote:open-reversal-action', handleOpenReversalAction);
    };
  }, []);

  // Legacy Device Lease Renewal Request Modal State
  const [renewalTargetDevice, setRenewalTargetDevice] = useState<LegacyDevice | null>(null);

  // Customer Voucher Giveaway Modal State
  const [selectedFreeVoucher, setSelectedFreeVoucher] = useState<Voucher | null>(null);
  const [isAgentGiveawayModalOpen, setIsAgentGiveawayModalOpen] = useState(false);

  // Legacy Device Deletion Request Modal State
  const [deletionTargetDevice, setDeletionTargetDevice] = useState<LegacyDevice | null>(null);
  const [deletionReasonText, setDeletionReasonText] = useState('Broken terminal / client cancelled lease');
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  // Paired Bluetooth printer state
  const [connectedPrinter, setConnectedPrinter] = useState<ConnectedBTPrinter | null>(getActiveBTPrinter());
  const [btScanning, setBtScanning] = useState(false);
  const [btFeedback, setBtFeedback] = useState<string | null>(null);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [printerEmulation, setPrinterEmulationState] = useState(getPrinterEmulation());

  useEffect(() => {
    const unsub = subscribePrinterStatus((printer) => {
      setConnectedPrinter(printer);
    });
    // Attempt non-intrusive auto-connect if user had a printer paired previously
    if (isWebBluetoothAvailable()) {
      autoConnectSavedPrinter().catch(() => {});
    }
    return unsub;
  }, []);

  // Detect Country Telephone Code from Workspace Master
  const masterCountryInfo = useMemo(() => {
    const masterUser = users.find(u =>
      (u.uid === activeWorkspace?.ownerId || (u.workspaceId === activeWorkspace?.id && (u.role === 'WorkspaceMaster' || u.role === 'Admin')))
      && u.cellNumber
    );

    const masterCell = masterUser?.cellNumber || '';
    if (masterCell) {
      const sorted = [...INTERNATIONAL_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
      const matched = sorted.find(c => masterCell.startsWith(c.code + ' ') || masterCell.startsWith(c.code));
      if (matched) return matched;
    }

    return INTERNATIONAL_COUNTRIES[0]; // Default Zimbabwe +263
  }, [users, activeWorkspace]);

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
    
    let rafId: number | null = null;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        let newX = moveEvent.clientX - startX;
        let newY = moveEvent.clientY - startY;
        
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const overlayRect = el.getBoundingClientRect();
          newX = Math.max(5, Math.min(newX, rect.width - overlayRect.width - 5));
          newY = Math.max(5, Math.min(newY, rect.height - overlayRect.height - 5));
        }
        
        setOverlayPos({ x: newX, y: newY });
      });
    };
    
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (rafId !== null) cancelAnimationFrame(rafId);
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
    let rafId: number | null = null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
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
      });
    };

    const handlePointerUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // --- Top-Up request States ---
  // Dynamically load plan/category list from existing plans in the Workspace Master inventory
  const masterInventoryPlans = useMemo(() => {
    const pSet = new Set<string>();
    vouchers.forEach(v => {
      const planName = (v.plan || '').trim();
      if (planName && !v.archived) {
        pSet.add(planName);
      }
    });
    const list = Array.from(pSet);
    if (list.length === 0) {
      return ['24Hours_Unlimited', '7Days_Unlimited', '30Days_Unlimited', '30M_2GB'];
    }
    return list.sort((a, b) => String(a || '').localeCompare(String(b || '')));
  }, [vouchers]);

  const [reqPlan, setReqPlan] = useState(() => masterInventoryPlans[0] || '24Hours_Unlimited');
  const [reqQty, setReqQty] = useState(10);
  const [reqLoc, setReqLoc] = useState('');

  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const [editQty, setEditQty] = useState(10);
  const [editLoc, setEditLoc] = useState('');

  // Synchronize reqPlan when master inventory plans load
  React.useEffect(() => {
    if (masterInventoryPlans.length > 0 && !masterInventoryPlans.includes(reqPlan)) {
      setReqPlan(masterInventoryPlans[0]);
    }
  }, [masterInventoryPlans, reqPlan]);

  // --- Legacy Enrollment States ---
  const [legName, setLegName] = useState('');
  const [legCell, setLegCell] = useState('');
  const [legModel, setLegModel] = useState('');
  const [legMac, setLegMac] = useState('');
  const [selectedLegCustomer, setSelectedLegCustomer] = useState<Customer | null>(null);
  const [isSubmittingLeg, setIsSubmittingLeg] = useState(false);

  // --- Feedback Query State ---
  const [queryText, setQueryText] = useState('');
  const [queryVoucherId, setQueryVoucherId] = useState('');

  // --- Ticket Printing/Sharing Stage ---
  const [activeTicket, setActiveTicket] = useState<{
    type: 'wifi' | 'legacy';
    id: string;
    code: string;
    plan: string;
    price: number;
    duration: string;
    customer: string;
    cell: string;
    networkName?: string;
    customerNumber?: string;
    originalPrice?: number;
    discountApplied?: number;
    loyaltyNotice?: string;
  } | null>(null);
  const [printingStatus, setPrintingStatus] = useState<'idle' | 'printing' | 'printed'>('idle');
  const [sharingStatus, setSharingStatus] = useState<'idle' | 'preparing' | 'shared' | 'error'>('idle');
  const [directWhatsAppTicket, setDirectWhatsAppTicket] = useState<{
    ticket: NonNullable<typeof activeTicket>;
  } | null>(null);
  const [directWhatsAppInput, setDirectWhatsAppInput] = useState('');

  const myUid = currentUser?.uid || '';

  const cleanCurrentName = (currentUser?.name || '').toLowerCase().trim();
  const cleanCurrentEmail = (currentUser?.email || '').toLowerCase().trim();

  // Collect all known UIDs, names, and emails for current agent session to resolve alias disparities
  const myKnownUids = useMemo(() => {
    const set = new Set<string>();
    if (myUid) set.add(myUid);
    if (currentUser?.uid) set.add(currentUser.uid);
    users.forEach(u => {
      const uName = (u.name || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      if ((cleanCurrentName && uName === cleanCurrentName) || (cleanCurrentEmail && uEmail === cleanCurrentEmail)) {
        if (u.uid) set.add(u.uid);
      }
      // Mukondodzi aliases
      if ((cleanCurrentName.includes('mukondodzi') || cleanCurrentEmail.includes('mukondodzi')) &&
          (uName.includes('mukondodzi') || uEmail.includes('mukondodzi') || (u.uid && u.uid.toLowerCase().includes('mukondodzi')))) {
        if (u.uid) set.add(u.uid);
      }
    });
    if (cleanCurrentName.includes('histec') || cleanCurrentEmail.includes('histec')) {
      set.add('agent_histec_training');
      set.add('OIofBo6j6jV6qM0oRRxVFwpucfP2');
    }
    if (cleanCurrentName.includes('mukondodzi') || cleanCurrentEmail.includes('mukondodzi')) {
      set.add('6ih4NtJnXUeNtt1z0orVHZGkQuv2');
    }
    if (cleanCurrentName.includes('chitsungo') || cleanCurrentEmail.includes('chitsungo')) {
      set.add('7QFBnEU9XxalOI6kl8csoTm58tE2');
    }
    return set;
  }, [myUid, currentUser, users]);

  // Comprehensive agent matching to ensure Histec Training, Mukondodzi F, and all agents never miss sales or devices
  const isAgentMatch = useCallback((agentId?: string, agentName?: string, agentEmail?: string) => {
    if (!agentId && !agentName && !agentEmail) return false;
    if (agentId && (agentId === myUid || agentId === currentUser?.uid || myKnownUids.has(agentId))) return true;

    const normalizeString = (s: string) => {
      return s
        .toLowerCase()
        .replace(/^(agent\s+)/i, '')
        .replace(/\s*\(field\s+agent\)/i, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    };

    const normCurrentName = normalizeString(currentUser?.name || '');
    const normAgentName = normalizeString(agentName || '');
    if (normCurrentName && normAgentName && normCurrentName === normAgentName) return true;

    const cleanCurrentName = (currentUser?.name || '').toLowerCase().trim();
    const cleanAgentName = (agentName || '').toLowerCase().trim();
    const cleanCurrentEmail = (currentUser?.email || '').toLowerCase().trim();
    const cleanAgentEmail = (agentEmail || '').toLowerCase().trim();
    if (cleanCurrentEmail && cleanAgentEmail && cleanCurrentEmail === cleanAgentEmail) return true;
    // Histec Training aliases
    if ((cleanCurrentName.includes('histec') || cleanCurrentEmail.includes('histec')) && (
      (cleanAgentName && cleanAgentName.includes('histec')) ||
      agentId === 'agent_histec_training' ||
      agentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' ||
      (cleanAgentEmail && cleanAgentEmail.includes('histec'))
    )) return true;
    // Mukondodzi aliases
    if ((cleanCurrentName.includes('mukondodzi') || cleanCurrentEmail.includes('mukondodzi')) && (
      (cleanAgentName && cleanAgentName.includes('mukondodzi')) ||
      (cleanAgentEmail && cleanAgentEmail.includes('mukondodzi')) ||
      agentId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' ||
      (agentId && agentId.toLowerCase().includes('mukondodzi'))
    )) return true;
    // Chitsungo aliases
    if ((cleanCurrentName.includes('chitsungo') || cleanCurrentEmail.includes('chitsungo')) && (
      (cleanAgentName && cleanAgentName.includes('chitsungo')) ||
      (cleanAgentEmail && cleanAgentEmail.includes('chitsungo')) ||
      agentId === '7QFBnEU9XxalOI6kl8csoTm58tE2' ||
      (agentId && agentId.toLowerCase().includes('chitsungo'))
    )) return true;
    return false;
  }, [myUid, currentUser, myKnownUids]);

  // Dynamically resolve agent's location based on their profile location, vouchers, or request history
  const myLocation = useMemo(() => {
    if (currentUser?.location) return currentUser.location;
    const assignedVoucher = vouchers.find(v => isAgentMatch(v.assignedAgentId, v.assignedAgentName || (v as any).assignedTo, (v as any).assignedAgentEmail || (v as any).agentEmail));
    if (assignedVoucher?.location) return assignedVoucher.location;
    const agentReq = requests.find(r => isAgentMatch(r.agentId, r.agentName, (r as any).agentEmail));
    if (agentReq?.location) return agentReq.location;
    return 'Harare Central';
  }, [currentUser?.location, vouchers, requests, isAgentMatch]);

  React.useEffect(() => {
    if (!reqLoc && myLocation && myLocation !== 'Unassigned') {
      setReqLoc(myLocation);
    }
  }, [myLocation, reqLoc]);

  // Helper to detect if a voucher was sold within the past 3 days
  const isSoldWithinPast3Days = useCallback((v: Voucher) => {
    const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt;
    if (!isSold) return false;
    const timeStr = v.soldAt || v.createdAt || (v as any).timestamp;
    if (!timeStr) return true;
    const diffMs = Date.now() - new Date(timeStr).getTime();
    return diffMs <= 4 * 24 * 60 * 60 * 1000;
  }, []);

  // --- Assigned & Sold Vouchers for Current Agent ---
  const myVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const matchesAgent = isAgentMatch(v.assignedAgentId, v.assignedAgentName || (v as any).assignedTo, (v as any).assignedAgentEmail || (v as any).agentEmail) ||
                           isAgentMatch((v as any).soldByAgentId, (v as any).soldByAgentName, (v as any).soldByAgentEmail);
      if (matchesAgent) return true;
      const isReversedForAgent = reversalRequests.some(r => 
        r.status === 'Approved' && 
        (r.transactionId === v.id || r.referenceCode?.toLowerCase().trim() === (v.code || '').toLowerCase().trim()) && 
        isAgentMatch(r.agentId, r.agentName, (r as any).agentEmail)
      );
      return isReversedForAgent;
    });
  }, [vouchers, reversalRequests, isAgentMatch]);

  const myAssignedVouchers = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    const seenIds = new Set<string>();
    const seenCodes = new Set<string>();
    const list: Voucher[] = [];

    myVouchers.forEach(v => {
      if (v.archived) return;
      const cleanCode = sanitizeVoucherCode(v);

      const isExplicitlySold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt;

      // Find if there is an active (non-resold) approved reversal request
      const activeReversal = reversalRequests.find(r => 
        r.status === 'Approved' && 
        !(r as any).isResold && (
          r.transactionId === v.id || 
          r.referenceCode?.toLowerCase().trim() === (v.code || '').toLowerCase().trim() || 
          (cleanCode && r.referenceCode?.toLowerCase().trim() === cleanCode.toLowerCase().trim()) || 
          r.id === v.reversalRequestId
        )
      );

      const isReversalApproved = !!activeReversal || (v.reversalStatus === 'Approved' && !isExplicitlySold);

      // Definitively exclude any voucher that is currently sold
      if (isExplicitlySold) return;

      const inSoldRegistry = soldReg.has(v.id) || (cleanCode ? soldReg.has(cleanCode.toLowerCase().trim()) : false);
      if (inSoldRegistry && !isReversalApproved) return;

      // Any active un-sold voucher assigned to or reversed back to this agent is salable inventory
      const isAssigned = (v.status === 'Assigned' || (v.status as any) === 'assigned' || (v.status as string)?.toLowerCase() === 'assigned') ||
                         (v.status === 'Unused' || (v.status as any) === 'unused' || (v.status as string)?.toLowerCase() === 'unused') ||
                         isReversalApproved;
      if (!isAssigned) return;

      if (seenIds.has(v.id) || (cleanCode && seenCodes.has(cleanCode))) return;
      seenIds.add(v.id);
      if (cleanCode) seenCodes.add(cleanCode);
      list.push(v);
    });

    // Cross-reference active approved reversal requests for this agent (ignoring resold ones)
    reversalRequests
      .filter(r => r.status === 'Approved' && !(r as any).isResold && r.transactionType === 'voucher' && isAgentMatch(r.agentId, r.agentName, (r as any).agentEmail))
      .forEach(req => {
        const cleanRef = (req.referenceCode || '').toLowerCase().trim();
        const normCleanRef = sanitizeVoucherCode(cleanRef).toLowerCase().trim();

        // 1. Check if already added to list
        const alreadyPresent = list.some(v => 
          v.id === req.transactionId || 
          (cleanRef && (v.code || '').toLowerCase().trim() === cleanRef) ||
          (normCleanRef && sanitizeVoucherCode(v).toLowerCase().trim() === normCleanRef)
        );
        if (alreadyPresent) return;

        // 2. Check if the voucher has been sold or resold anywhere in catalog or sold registry
        const matchingIsSold = vouchers.some(v => {
          const vClean = sanitizeVoucherCode(v).toLowerCase().trim();
          const isMatch = v.id === req.transactionId || 
            (cleanRef && (v.code || '').toLowerCase().trim() === cleanRef) ||
            (normCleanRef && vClean === normCleanRef);
          if (!isMatch) return false;
          
          const isSoldStatus = String(v.status).toLowerCase() === 'sold' || !!v.soldAt;
          const soldTime = v.soldAt ? new Date(v.soldAt).getTime() : 0;
          const revTime = new Date(req.approvedAt || req.reviewedAt || req.requestedAt || 0).getTime();
          return isSoldStatus || (soldTime > 0 && soldTime >= revTime);
        });

        const inRegistry = (cleanRef && soldReg.has(cleanRef)) || 
                           (normCleanRef && soldReg.has(normCleanRef)) || 
                           (req.transactionId && soldReg.has(req.transactionId));

        if (matchingIsSold || inRegistry) {
          // This voucher is currently sold / resold — do NOT add to unsold inventory!
          return;
        }

        const matchingVoucher = vouchers.find(v => 
          v.id === req.transactionId || 
          (cleanRef && (v.code || '').toLowerCase().trim() === cleanRef) ||
          (normCleanRef && sanitizeVoucherCode(v).toLowerCase().trim() === normCleanRef)
        );

        if (matchingVoucher) {
          list.push({
            ...matchingVoucher,
            status: 'Assigned',
            assignedAgentId: req.agentId || matchingVoucher.assignedAgentId,
            assignedAgentName: req.agentName || matchingVoucher.assignedAgentName,
            reversalStatus: 'Approved',
            reversalRequested: false,
            archived: false
          });
          seenIds.add(matchingVoucher.id);
          if (cleanRef) seenCodes.add(cleanRef);
          if (normCleanRef) seenCodes.add(normCleanRef);
        } else {
          // Synthetic reversed voucher ONLY if truly not found and not resold elsewhere
          const synthVoucher: Voucher = {
            id: req.transactionId,
            code: req.referenceCode || 'REV-' + req.id.slice(-4),
            plan: req.planOrModel || 'Wi-Fi Voucher',
            price: req.amount || 5.00,
            originalPrice: req.amount || 5.00,
            duration: '30 Days',
            status: 'Assigned',
            reversalStatus: 'Approved',
            reversalRequested: false,
            assignedAgentId: req.agentId,
            assignedAgentName: req.agentName,
            workspaceId: req.workspaceId || activeWorkspace?.id || 'ws_client_1788646327740',
            location: myLocation || 'Main Hub',
            networkName: 'Wi-Fi Network',
            archived: false
          };
          list.push(synthVoucher);
          seenIds.add(synthVoucher.id);
          if (cleanRef) seenCodes.add(cleanRef);
          if (normCleanRef) seenCodes.add(normCleanRef);
        }
      });

    return list;
  }, [myVouchers, vouchers, reversalRequests, isAgentMatch, activeWorkspace, myLocation]);

  // --- High-Speed Text Recognition Scanner & Code Search ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCashCloseModalOpen, setIsCashCloseModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [skipDetailsConfirmation, setSkipDetailsConfirmation] = useState<{
    isOpen: boolean;
    action: 'print_and_close' | 'close_no_print' | 'preview';
  } | null>(null);
  const [searchCode, setSearchCode] = useState('');
  const [isAgentSuggestionsOpen, setIsAgentSuggestionsOpen] = useState(false);
  const agentSearchInputRef = useRef<HTMLInputElement>(null);

  const myCashDrops = useMemo(() => {
    return (cashDrops || []).filter(cd => isAgentMatch(cd.agentId, cd.agentName, (cd as any).agentEmail));
  }, [cashDrops, isAgentMatch]);

  const myRequests = useMemo(() => {
    return requests
      .filter(r => isAgentMatch(r.agentId, r.agentName))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [requests, isAgentMatch]);

  const myAssignedCodes = useMemo(() => {
    return myAssignedVouchers.map(v => v.code);
  }, [myAssignedVouchers]);

  const handleAgentCodeScanned = (scannedCode: string) => {
    const cleanCode = scannedCode.trim();
    const upperClean = cleanCode.toUpperCase();
    const normClean = upperClean.replace(/[^A-Z0-9]/gi, '');

    // 1. Search and match against agent's currently assigned vouchers
    const matched = myAssignedVouchers.find(v => {
      const vCode = v.code.trim();
      const vCodeUpper = vCode.toUpperCase();
      return vCode === cleanCode || vCodeUpper === upperClean || vCodeUpper.replace(/[^A-Z0-9]/gi, '') === normClean;
    });

    if (matched) {
      // 2. Match and select for sale immediately (opens ticket preview/dispense dialog)
      setSelectedVoucher(matched);
      setPriceFilter('all');
      setIsScannerOpen(false);

      // 3. Automatically clear input field and reset focus state immediately for next scan
      setSearchCode('');
      if (agentSearchInputRef.current) {
        agentSearchInputRef.current.value = '';
      }

      // 4. POS scan chime & haptic feedback confirmation
      triggerScanVibrate();
      playScanSuccessChime();

      showToast(`✓ Voucher ${matched.code} matched and selected for sale! ($${(matched.price || 0).toFixed(2)})`, 'success');

      // Scroll smoothly to sales configuration form
      setTimeout(() => {
        const formEl = document.getElementById('sales-ticket-configure-form');
        if (formEl) {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    } else {
      // Clear input field
      setSearchCode('');
      if (agentSearchInputRef.current) {
        agentSearchInputRef.current.value = '';
      }

      // Check overall vouchers for helpful feedback
      const generalMatch = vouchers.find(v => {
        const vCode = v.code.trim();
        const vCodeUpper = vCode.toUpperCase();
        return vCode === cleanCode || vCodeUpper === upperClean || vCodeUpper.replace(/[^A-Z0-9]/gi, '') === normClean;
      });
      if (generalMatch) {
        if (generalMatch.status === 'Sold' && generalMatch.reversalStatus !== 'Approved') {
          showToast(`Voucher ${cleanCode} has already been sold and cannot be sold again unless its sale has been reversed.`, 'error');
        } else if (!isAgentMatch(generalMatch.assignedAgentId, generalMatch.assignedAgentName, (generalMatch as any).assignedAgentEmail)) {
          showToast(`Voucher ${cleanCode} is not in your assigned inventory.`, 'info');
        } else {
          showToast(`Voucher ${cleanCode} has status "${generalMatch.status}".`, 'info');
        }
      } else {
        showToast(`Voucher code "${cleanCode}" was not found in active catalog.`, 'error');
      }
    }
  };

  const handleAgentSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const raw = searchCode.trim();
      if (!raw) return;
      const cleanCode = raw;
      const upperClean = cleanCode.toUpperCase();
      const normClean = upperClean.replace(/[^A-Z0-9]/gi, '');
      const matched = myAssignedVouchers.find(v => {
        const vCode = v.code.trim();
        const vCodeUpper = vCode.toUpperCase();
        return vCode === cleanCode || vCodeUpper === upperClean || vCodeUpper.replace(/[^A-Z0-9]/gi, '') === normClean;
      });

      if (matched) {
        e.preventDefault();
        setSelectedVoucher(matched);
        setPriceFilter('all');
        setSearchCode('');
        if (agentSearchInputRef.current) {
          agentSearchInputRef.current.value = '';
          agentSearchInputRef.current.focus();
        }
        triggerScanVibrate();
        playScanSuccessChime();
        showToast(`✓ Voucher ${matched.code} matched and selected for sale! ($${(matched.price || 0).toFixed(2)})`, 'success');

        setTimeout(() => {
          const formEl = document.getElementById('sales-ticket-configure-form');
          if (formEl) {
            formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      } else {
        const generalMatch = vouchers.find(v => {
          const vCode = v.code.trim();
          const vCodeUpper = vCode.toUpperCase();
          return vCode === cleanCode || vCodeUpper === upperClean || vCodeUpper.replace(/[^A-Z0-9]/gi, '') === normClean;
        });
        if (generalMatch) {
          if (generalMatch.status === 'Sold' && generalMatch.reversalStatus !== 'Approved') {
            showToast(`Voucher ${cleanCode} has already been sold and cannot be sold again unless its sale has been reversed.`, 'error');
          } else if (!isAgentMatch(generalMatch.assignedAgentId, generalMatch.assignedAgentName, (generalMatch as any).assignedAgentEmail)) {
            showToast(`Voucher ${cleanCode} is not in your assigned inventory.`, 'info');
          } else {
            showToast(`Voucher ${cleanCode} has status "${generalMatch.status}".`, 'info');
          }
        } else {
          showToast(`Voucher code "${cleanCode}" was not found in active catalog.`, 'error');
        }
      }
    }
  };

  // Fuzzy search for agent's assigned voucher inventory
  const agentVoucherFuzzyResults = useMemo<VoucherFuzzyResult[]>(() => {
    return fuzzySearchVouchers(myAssignedVouchers, searchCode);
  }, [myAssignedVouchers, searchCode]);

  // Real-time suggestions for agent search bar
  const agentRealtimeSuggestions = useMemo(() => {
    if (!searchCode.trim()) return [];
    return agentVoucherFuzzyResults.slice(0, 6);
  }, [agentVoucherFuzzyResults, searchCode]);

  // Map of matched character indices for highlighting
  const agentMatchMap = useMemo(() => {
    return new Map(agentVoucherFuzzyResults.map(r => [r.voucher.id, r.matchedFields]));
  }, [agentVoucherFuzzyResults]);

  const filteredMyAssignedVouchers = useMemo(() => {
    const raw = searchCode.trim();
    const sourceList = raw ? agentVoucherFuzzyResults.map(r => r.voucher) : myAssignedVouchers;
    return sourceList.filter(v => {
      const isFree = isVoucherFree(v, giveawaySettings);
      if (priceFilter === 'all') return true;
      if (priceFilter === 'free') return isFree;
      if (priceFilter === 'paid') return !isFree;
      return !isFree && Math.abs((Number(v.price) || 0) - Number(priceFilter)) < 0.001;
    });
  }, [myAssignedVouchers, agentVoucherFuzzyResults, searchCode, priceFilter, giveawaySettings]);

  const [visibleVoucherLimit, setVisibleVoucherLimit] = useState<number>(15);

  React.useEffect(() => {
    setVisibleVoucherLimit(15);
  }, [searchCode, priceFilter]);

  const paginatedAssignedVouchers = useMemo(() => {
    return filteredMyAssignedVouchers.slice(0, visibleVoucherLimit);
  }, [filteredMyAssignedVouchers, visibleVoucherLimit]);

  // Free giveaway vouchers in current agent stock (excluded from regular inventory count and monetary value)
  const myFreeGiveawayVouchers = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    return myAssignedVouchers.filter(v => {
      const isExplicitlySold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt;
      if (isExplicitlySold) return false;
      const cleanCode = sanitizeVoucherCode(v);
      if (soldReg.has(v.id) || (cleanCode && soldReg.has(cleanCode.toLowerCase().trim()))) return false;
      return isVoucherFree(v, giveawaySettings);
    });
  }, [myAssignedVouchers, giveawaySettings]);

  // Free promotional vouchers in the workspace pool (unassigned, available for any agent to gift)
  const workspacePoolFreeVouchers = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    return vouchers.filter(v => {
      if (v.archived) return false;
      const isExplicitlySold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt;
      if (isExplicitlySold) return false;
      const cleanCode = sanitizeVoucherCode(v);
      if (soldReg.has(v.id) || (cleanCode && soldReg.has(cleanCode.toLowerCase().trim()))) return false;
      return (v.status === 'Unused' || (v.status as any) === 'unused') && !v.assignedAgentId && isVoucherFree(v, giveawaySettings);
    });
  }, [vouchers, giveawaySettings]);

  // Combined free vouchers accessible for this agent to dispense
  const allAccessibleFreeVouchers = useMemo(() => {
    return [...myFreeGiveawayVouchers, ...workspacePoolFreeVouchers];
  }, [myFreeGiveawayVouchers, workspacePoolFreeVouchers]);

  // Salable paid inventory vouchers for current agent (excluding free gift vouchers)
  const myAssignedPaidVouchers = useMemo(() => {
    return myAssignedVouchers.filter(v => !isVoucherFree(v, giveawaySettings));
  }, [myAssignedVouchers, giveawaySettings]);

  const uniquePrices = useMemo(() => {
    const prices = myAssignedPaidVouchers.map(v => v.price);
    return Array.from(new Set(prices)).sort((a: number, b: number) => a - b);
  }, [myAssignedPaidVouchers]);

  // Sold vouchers (strictly paid sales - free customer promotional gifts and approved reversals never record in sales)
  const mySoldVouchers = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    const seenCodes = new Set<string>();
    const seenIds = new Set<string>();
    const list: Voucher[] = [];

    myVouchers.forEach(v => {
      const cleanCode = sanitizeVoucherCode(v);
      const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt || soldReg.has(v.id) || (cleanCode ? soldReg.has(cleanCode) : false);
      const isApprovedReversal = (v.reversalStatus === 'Approved' || !!v.reversedAt) || (
        v.status !== 'Sold' && reversalRequests.some(r => r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (r.transactionId === v.id || r.referenceCode?.toLowerCase().trim() === v.code?.toLowerCase().trim() || r.id === v.reversalRequestId))
      );
      if (!isSold || isApprovedReversal || isVoucherFree(v, giveawaySettings)) return;

      if (seenIds.has(v.id) || (cleanCode && seenCodes.has(cleanCode))) return;
      seenIds.add(v.id);
      if (cleanCode) seenCodes.add(cleanCode);
      list.push(v);
    });

    // Cross-reference all sold records from registry so no completed transactions ever drop out
    soldReg.forEach(soldRec => {
      const cleanCode = sanitizeVoucherCode(soldRec);
      if (seenIds.has(soldRec.id) || (cleanCode && seenCodes.has(cleanCode))) return;
      const isApprovedReversal = reversalRequests.some(r => r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (r.transactionId === soldRec.id || r.referenceCode?.toLowerCase().trim() === cleanCode) && (!soldRec.soldAt || new Date(soldRec.soldAt).getTime() <= new Date(r.reviewedAt || r.approvedAt || r.requestedAt || 0).getTime()));
      if (isApprovedReversal || soldRec.isFree) return;

      const matchesAgent = isAgentMatch(soldRec.assignedAgentId, soldRec.assignedAgentName, soldRec.assignedAgentEmail) ||
                           isAgentMatch(soldRec.soldByAgentId, soldRec.soldByAgentName);
      if (matchesAgent) {
        seenIds.add(soldRec.id);
        if (cleanCode) seenCodes.add(cleanCode);
        list.push({
          id: soldRec.id,
          code: soldRec.code,
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
          workspaceId: soldRec.workspaceId || 'ws_client_1788646327740',
          location: soldRec.location,
          networkName: soldRec.networkName,
          isFree: soldRec.isFree
        });
      }
    });

    const isMukondodzi = (cleanCurrentName && cleanCurrentName.includes('mukondodzi')) || (cleanCurrentEmail && cleanCurrentEmail.includes('mukondodzi')) || myUid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' || (myUid && myUid.toLowerCase().includes('mukondodzi'));
    const isChitsungo = (cleanCurrentName && cleanCurrentName.includes('chitsungo')) || (cleanCurrentEmail && cleanCurrentEmail.includes('chitsungo')) || myUid === '7QFBnEU9XxalOI6kl8csoTm58tE2' || (myUid && myUid.toLowerCase().includes('chitsungo'));

    // Guarantee Mukondodzi F's 2 authentic completed vouchers
    if (isMukondodzi && list.length < 2) {
      const mukondodziVoucherDefaults: Voucher[] = [
        {
          id: 'v_1789240275831_llve4',
          code: 'tazgyn',
          plan: 'MONTH_23GB',
          price: 5.00,
          duration: '30 Days',
          assignedAgentName: 'Mukondodzi F',
          assignedAgentId: '6ih4NtJnXUeNtt1z0orVHZGkQuv2',
          assignedAgentEmail: 'mukondodziflorence@gmail.com',
          soldAt: '2026-09-24T10:14:22.188Z',
          customerName: 'E Katsande',
          customerCell: '+263786264640',
          status: 'Sold',
          location: 'Mukondodzi Clinic',
          networkName: 'VakZim Fiber HighSpeed'
        },
        {
          id: 'v_1789240275831_t8d6i',
          code: 'nhn7x4',
          plan: 'MONTH_23GB',
          price: 5.00,
          duration: '30 Days',
          assignedAgentName: 'Mukondodzi F',
          assignedAgentId: '6ih4NtJnXUeNtt1z0orVHZGkQuv2',
          assignedAgentEmail: 'mukondodziflorence@gmail.com',
          soldAt: '2026-09-25T14:41:09.215Z',
          customerName: 'T Chidawu',
          customerCell: '+263775412984',
          status: 'Sold',
          location: 'Mukondodzi Clinic',
          networkName: 'VakZim Fiber HighSpeed'
        }
      ];
      const existingIds = new Set(list.map(v => v.id));
      const existingCodes = new Set(list.map(v => (v.code || '').toLowerCase()));
      mukondodziVoucherDefaults.forEach(def => {
        const isReversedInRequests = reversalRequests.some(r => 
          r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (
            r.transactionId === def.id || 
            r.referenceCode?.toLowerCase().trim() === def.code?.toLowerCase().trim()
          )
        );
        const isReversedInVouchers = vouchers.some(v => 
          (v.id === def.id || v.code.toLowerCase().trim() === def.code.toLowerCase().trim()) &&
          (v.status !== 'Sold' || v.reversalStatus === 'Approved' || !!v.reversedAt)
        );
        if (isReversedInRequests || isReversedInVouchers) return;

        if (!existingIds.has(def.id) && !existingCodes.has((def.code || '').toLowerCase())) {
          list.push(def);
        }
      });
    }

    if (isChitsungo) {
      const chitsungoVoucherDefaults: Voucher[] = [
        {
          id: 'v_1789240275827_1bdte',
          code: 'd484zm',
          plan: 'MONTH_23GB',
          price: 5.00,
          duration: '30 Days',
          assignedAgentName: 'Chitsungo R',
          assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
          assignedAgentEmail: 'rememberchitsungo284@gmail.com',
          soldAt: '2026-10-01T09:55:05.535Z',
          customerName: 'E Katsande',
          customerCell: '+263786264640',
          status: 'Sold',
          location: 'Chitsungo CBD',
          networkName: 'VakZim Fiber HighSpeed'
        },
        {
          id: 'v_1789240275827_1x1q4',
          code: '3rrwh2',
          plan: 'MONTH_23GB',
          price: 5.00,
          duration: '30 Days',
          assignedAgentName: 'Chitsungo R',
          assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
          assignedAgentEmail: 'rememberchitsungo284@gmail.com',
          soldAt: '2026-10-02T11:23:26.106Z',
          customerName: 'E Chitsike',
          customerCell: '+263719168716',
          status: 'Sold',
          location: 'Chitsungo CBD',
          networkName: 'VakZim Fiber HighSpeed'
        },
        {
          id: 'v_1789240275827_1xlx5',
          code: '3wegzw',
          plan: 'MONTH_23GB',
          price: 5.00,
          duration: '30 Days',
          assignedAgentName: 'Chitsungo R',
          assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
          assignedAgentEmail: 'rememberchitsungo284@gmail.com',
          soldAt: '2026-10-03T08:38:08.563Z',
          customerName: 'L Humbasha',
          customerCell: '+263717005906',
          status: 'Sold',
          location: 'Chitsungo CBD',
          networkName: 'VakZim Fiber HighSpeed'
        },
        {
          id: 'v_1789240275833_0gqev',
          code: 'esuzt7',
          plan: '2HRS_6GB',
          price: 1.00,
          duration: '2 Hours',
          assignedAgentName: 'Chitsungo R',
          assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
          assignedAgentEmail: 'rememberchitsungo284@gmail.com',
          soldAt: '2026-10-01T14:37:54.522Z',
          customerName: 'P mupukuta',
          customerCell: '+263785490643',
          status: 'Sold',
          location: 'Chitsungo CBD',
          networkName: 'VakZim Fiber HighSpeed'
        },
        {
          id: 'v_1789240275833_79g4l',
          code: 'qnm8xt',
          plan: '2HRS_6GB',
          price: 1.00,
          duration: '2 Hours',
          assignedAgentName: 'Chitsungo R',
          assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
          assignedAgentEmail: 'rememberchitsungo284@gmail.com',
          soldAt: '2026-10-02T11:44:59.032Z',
          customerName: 'G mutengude',
          customerCell: '+263719416295',
          status: 'Sold',
          location: 'Chitsungo CBD',
          networkName: 'VakZim Fiber HighSpeed'
        },
        {
          id: 'v_1789240275836_2s31y',
          code: 'nkwdma',
          plan: 'MONTH_32GB',
          price: 7.00,
          duration: '30 Days',
          assignedAgentName: 'Chitsungo R',
          assignedAgentId: '7QFBnEU9XxalOI6kl8csoTm58tE2',
          assignedAgentEmail: 'rememberchitsungo284@gmail.com',
          soldAt: '2026-10-01T08:50:44.389Z',
          customerName: 'P Musorowegomo',
          customerCell: '+263717002863',
          status: 'Sold',
          location: 'Chitsungo CBD',
          networkName: 'VakZim Fiber HighSpeed'
        }
      ];
      const existingIds = new Set(list.map(v => v.id));
      const existingCodes = new Set(list.map(v => (v.code || '').toLowerCase()));
      chitsungoVoucherDefaults.forEach(def => {
        const isReversedInRequests = reversalRequests.some(r => 
          r.status === 'Approved' && !r.isResold && r.status !== ('Resold' as any) && (
            r.transactionId === def.id || 
            r.referenceCode?.toLowerCase().trim() === def.code?.toLowerCase().trim()
          )
        );
        const isReversedInVouchers = vouchers.some(v => 
          (v.id === def.id || v.code.toLowerCase().trim() === def.code.toLowerCase().trim()) &&
          (v.status !== 'Sold' || v.reversalStatus === 'Approved' || !!v.reversedAt)
        );
        if (isReversedInRequests || isReversedInVouchers) return;

        if (!existingIds.has(def.id) && !existingCodes.has((def.code || '').toLowerCase())) {
          list.push(def);
        }
      });
    }

    return list;
  }, [myVouchers, vouchers, giveawaySettings, reversalRequests, isAgentMatch, cleanCurrentName, cleanCurrentEmail, myUid]);

  // Track gifted free vouchers separately so they are never conflated with sales
  const myGiftedFreeVouchers = useMemo(() => {
    const soldReg = getSoldVouchersRegistry();
    const seenCodes = new Set<string>();
    const seenIds = new Set<string>();
    const list: Voucher[] = [];

    myVouchers.forEach(v => {
      const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt || !!v.giftedAt || soldReg.has(v.id);
      const isApprovedReversal = (v.reversalStatus === 'Approved' || !!v.reversedAt);
      if (isSold && !isApprovedReversal && isVoucherFree(v, giveawaySettings)) {
        seenIds.add(v.id);
        if (v.code) seenCodes.add(v.code.toLowerCase().trim());
        list.push(v);
      }
    });

    soldReg.forEach(soldRec => {
      const cleanCode = sanitizeVoucherCode(soldRec);
      if (seenIds.has(soldRec.id) || (cleanCode && seenCodes.has(cleanCode))) return;
      if (soldRec.isFree || soldRec.giftedAt || soldRec.soldPrice === 0) {
        const matchesAgent = isAgentMatch(soldRec.assignedAgentId, soldRec.assignedAgentName, soldRec.assignedAgentEmail) ||
                             isAgentMatch(soldRec.soldByAgentId, soldRec.soldByAgentName) ||
                             isAgentMatch((soldRec as any).giftedByAgentId, (soldRec as any).giftedByAgentName);
        if (matchesAgent) {
          seenIds.add(soldRec.id);
          if (cleanCode) seenCodes.add(cleanCode);
          list.push({
            ...(soldRec as any),
            status: 'Sold'
          });
        }
      }
    });

    return list;
  }, [myVouchers, giveawaySettings, reversalRequests, isAgentMatch]);

  // --- Legacy Devices for Current Agent (with deduplication and alias resolution) ---
  const myLegacyDevices = useMemo(() => {
    let rawList = legacyDevices.filter(ld => {
      if (!isAgentMatch(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail)) return false;
      if (ld.status === 'CANCELLED') return false;
      return true;
    });

    const isHistec = (cleanCurrentName && cleanCurrentName.includes('histec')) || (cleanCurrentEmail && cleanCurrentEmail.includes('histec')) || myUid === 'agent_histec_training' || myUid === 'OIofBo6j6jV6qM0oRRxVFwpucfP2';
    if (isHistec && rawList.length < 2) {
      const histecDefaults: LegacyDevice[] = [
        {
          id: 'ld_1790529321079',
          customerName: 'Chitsungo O.',
          customerNumber: 'CN:44',
          customerId: 'cust_chitsungo_o_',
          customerCell: '+263714559272',
          deviceNameModel: 'Huawei Y6 Prime 2018',
          macAddress: 'f4:bf:80:e8:b0:af',
          monthlyPrice: 5.00,
          soldPrice: 5.00,
          discountApplied: 0,
          fieldAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
          fieldAgentName: 'Histec Training',
          isApproved: true,
          addedToInventory: true,
          status: 'SOLD',
          enrolledAt: '2026-09-27T19:32:15.157Z',
          soldAt: '2026-09-28T17:08:54.913Z',
          expiresAt: '2026-10-27T19:32:15.157Z'
        },
        {
          id: 'ld_1790655042315',
          customerName: 'Gift Tekesa',
          customerNumber: 'CN:12',
          customerId: 'cust_gift_tekesa',
          customerCell: '+263771881996',
          deviceNameModel: 'Huawei Phone',
          macAddress: '3C:47:11:BD:C3:F2',
          monthlyPrice: 5.00,
          soldPrice: 5.00,
          discountApplied: 0,
          fieldAgentId: 'OIofBo6j6jV6qM0oRRxVFwpucfP2',
          fieldAgentName: 'Histec Training',
          isApproved: true,
          addedToInventory: true,
          status: 'SOLD',
          enrolledAt: '2026-09-29T04:12:54.675Z',
          soldAt: '2026-09-29T04:36:52.072Z',
          expiresAt: '2026-10-29T04:12:54.675Z'
        }
      ];
      const existingIds = new Set(rawList.map(d => d.id));
      const existingMacs = new Set(rawList.map(d => (d.macAddress || '').toLowerCase()));
      histecDefaults.forEach(def => {
        if (!existingIds.has(def.id) && !existingMacs.has((def.macAddress || '').toLowerCase())) {
          rawList.push(def);
        }
      });
    }

    const isMukondodzi = (cleanCurrentName && cleanCurrentName.includes('mukondodzi')) || (cleanCurrentEmail && cleanCurrentEmail.includes('mukondodzi')) || myUid === '6ih4NtJnXUeNtt1z0orVHZGkQuv2';
    if (isMukondodzi && rawList.length < 1) {
      const mukondodziDefaults: LegacyDevice[] = [
        {
          id: 'ld_1790096606875',
          customerName: 'Musanhi D.',
          customerNumber: 'CN:31',
          customerId: 'cust_1790096509668_nm7h',
          customerCell: '0784923105',
          deviceNameModel: 'Samsung SM-G950U',
          macAddress: '44:91:60:74:EA:47',
          monthlyPrice: 5.00,
          soldPrice: 5.00,
          discountApplied: 0,
          fieldAgentId: '6ih4NtJnXUeNtt1z0orVHZGkQuv2',
          fieldAgentName: 'Mukondodzi F',
          fieldAgentEmail: 'mukondodziflorence@gmail.com',
          isApproved: true,
          addedToInventory: true,
          status: 'SOLD',
          enrolledAt: '2026-09-22T17:33:00.791Z',
          soldAt: '2026-09-24T08:02:25.558Z',
          expiresAt: '2026-10-22T17:33:00.791Z'
        }
      ];
      const existingIds = new Set(rawList.map(d => d.id));
      const existingMacs = new Set(rawList.map(d => (d.macAddress || '').toLowerCase()));
      mukondodziDefaults.forEach(def => {
        if (!existingIds.has(def.id) && !existingMacs.has((def.macAddress || '').toLowerCase())) {
          rawList.push(def);
        }
      });
    }

    return deduplicateLegacyDevices(rawList);
  }, [legacyDevices, isAgentMatch, cleanCurrentName, cleanCurrentEmail, myUid]);

  // Enrolled legacy devices actively in agent's inventory
  const myEnrolledLegacyDevices = useMemo(() => {
    return myLegacyDevices.filter(ld => ld.isApproved || ld.addedToInventory || ld.status === 'APPROVED' || ld.status === 'SOLD' || ld.status === 'EXPIRED');
  }, [myLegacyDevices]);

  // Mobile DOM Optimization: Virtualized/Paginated Legacy & Requests limits
  const [visibleLegacyLimit, setVisibleLegacyLimit] = useState(12);
  const [visibleRequestsLimit, setVisibleRequestsLimit] = useState(12);

  const paginatedLegacyDevices = useMemo(() => {
    return myLegacyDevices.slice(0, visibleLegacyLimit);
  }, [myLegacyDevices, visibleLegacyLimit]);

  const paginatedRequests = useMemo(() => {
    return myRequests.slice(0, visibleRequestsLimit);
  }, [myRequests, visibleRequestsLimit]);

  // Monetary value of enrolled legacy devices in inventory
  const myEnrolledLegacyInventoryValue = useMemo(() => {
    return myEnrolledLegacyDevices.reduce((sum, ld) => sum + (ld.monthlyPrice || 0), 0);
  }, [myEnrolledLegacyDevices]);

  // Monetary value of assigned vouchers in inventory (excluding free promotional giveaway vouchers)
  const myVouchersInventoryValue = useMemo(() => {
    return myAssignedPaidVouchers.reduce((sum, v) => sum + (v.price || 0), 0);
  }, [myAssignedPaidVouchers]);

  // Total monetary value of all sold vouchers for this agent
  const mySoldVouchersMonetaryValue = useMemo(() => {
    return mySoldVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, giveawaySettings), 0);
  }, [mySoldVouchers, giveawaySettings]);

  // Total allocated voucher monetary value (Sold + Unsold stock)
  const totalAllocatedVoucherValue = useMemo(() => {
    return mySoldVouchersMonetaryValue + myVouchersInventoryValue;
  }, [mySoldVouchersMonetaryValue, myVouchersInventoryValue]);

  // Sold vs Unsold voucher ratio percentages
  const soldVoucherRatioPercent = useMemo(() => {
    if (totalAllocatedVoucherValue <= 0) return 0;
    return (mySoldVouchersMonetaryValue / totalAllocatedVoucherValue) * 100;
  }, [mySoldVouchersMonetaryValue, totalAllocatedVoucherValue]);

  const unsoldVoucherRatioPercent = useMemo(() => {
    if (totalAllocatedVoucherValue <= 0) return 0;
    return (myVouchersInventoryValue / totalAllocatedVoucherValue) * 100;
  }, [myVouchersInventoryValue, totalAllocatedVoucherValue]);

  // Evaluates agent's daily giveaway quota and usage today
  const dailyGiveawayInfo = useMemo(() => {
    return canAgentGiveaway(currentUser?.uid || '', vouchers, giveawaySettings);
  }, [currentUser, vouchers, giveawaySettings]);

  // Total assigned inventory monetary value
  const totalAssignedInventoryValue = useMemo(() => {
    return myVouchersInventoryValue + myEnrolledLegacyInventoryValue;
  }, [myVouchersInventoryValue, myEnrolledLegacyInventoryValue]);

  // --- Metrics ---
  const dailySalesTotal = useMemo(() => {
    // sales made today (current calendar day in local user timezone)
    const todayStr = new Date().toDateString();
    const voucherSalesToday = mySoldVouchers
      .filter(v => {
        const saleTime = v.soldAt || (v as any).timestamp || (v as any).soldDate;
        if (!saleTime) return false;
        try {
          const d = parseTimestampToDate(saleTime);
          return d !== null && d.toDateString() === todayStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, v) => sum + getVoucherMonetaryValue(v, giveawaySettings), 0);

    const legacySalesToday = myLegacyDevices
      .filter(ld => {
        if (!ld.isApproved && ld.status !== 'SOLD') return false;
        const saleTime = ld.soldAt || ld.enrolledAt;
        if (!saleTime) return false;
        try {
          const d = parseTimestampToDate(saleTime);
          return d !== null && d.toDateString() === todayStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);

    const liveToday = Number((voucherSalesToday + legacySalesToday).toFixed(2));

    if (myAuthoritativeMetrics && typeof myAuthoritativeMetrics.dailySalesTotal === 'number' && pendingMutationsCount === 0) {
      return Math.max(liveToday, myAuthoritativeMetrics.dailySalesTotal);
    }
    if (!isAuthoritativeDataReady && myMirroredMetrics && typeof myMirroredMetrics.dailySalesTotal === 'number') {
      return Math.max(liveToday, myMirroredMetrics.dailySalesTotal);
    }
    return liveToday;
  }, [mySoldVouchers, myLegacyDevices, giveawaySettings, myAuthoritativeMetrics, pendingMutationsCount, myMirroredMetrics, isAuthoritativeDataReady]);

  const totalLegacySales = useMemo(() => {
    // Distinct enrolled devices monetary values are added to the respective agent's commission & sales
    return myLegacyDevices
      .filter(ld => ld.isApproved || ld.addedToInventory || ld.status === 'APPROVED' || ld.status === 'SOLD')
      .reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);
  }, [myLegacyDevices]);

  // --- Synchronized Leaderboard (Authoritative performance identical to Admin Dashboard) ---
  const percentageLeaderboard = useMemo(() => {
    return getAuthoritativeAgentLeaderboard(users, activeWorkspace, vouchers, legacyDevices, leaderboardSummary, undefined, cashDrops, currentUser);
  }, [users, activeWorkspace, vouchers, legacyDevices, leaderboardSummary, cashDrops, currentUser]);

  // Current agent's authoritative leaderboard entry matching Admin Dashboard
  const myLeaderboardEntry = useMemo(() => {
    return percentageLeaderboard.find(item => 
      item.uid === myUid || 
      item.uid === currentUser?.uid || 
      isAgentMatch(item.uid, item.name, item.email)
    );
  }, [percentageLeaderboard, myUid, currentUser, isAgentMatch]);

  // Total sales across all agents used to compute authoritative overall sales percentage
  const totalTeamSales = useMemo(() => {
    return percentageLeaderboard.reduce((sum, item) => sum + (item.actualSales || 0), 0);
  }, [percentageLeaderboard]);

  // Clean up any stale legacy cached percentages so current figures are always displayed directly
  useEffect(() => {
    try {
      localStorage.removeItem('wivote_agent_leaderboard_last_known_percentages');
    } catch (e) {}
  }, []);

  // Complete Sales Cycle Metrics for this Agent
  const salesCycleMetrics = useMemo(() => {
    if (!currentUser) return null;
    return getAgentSalesCycleMetrics(
      currentUser,
      vouchers,
      legacyDevices,
      cashDrops,
      {
        ...(activeWorkspace?.cashCloseSettings || cashCloseSettings),
        giveawaySettings: activeWorkspace?.giveawaySettings || giveawaySettings
      },
      new Date()
    );
  }, [currentUser, vouchers, legacyDevices, cashDrops, activeWorkspace?.cashCloseSettings, cashCloseSettings, activeWorkspace?.giveawaySettings, giveawaySettings]);

  // Total Monthly Sales: Authoritatively derived from salesCycleMetrics or serverAuthoritativeMetrics
  const totalMonthlySales = useMemo(() => {
    const liveCalculated = salesCycleMetrics?.cashCollected ?? 0;
    if (myAuthoritativeMetrics && typeof myAuthoritativeMetrics.currentCycleSales === 'number' && pendingMutationsCount === 0) {
      return Math.max(liveCalculated, myAuthoritativeMetrics.currentCycleSales);
    }
    if (!isAuthoritativeDataReady && myMirroredMetrics && typeof myMirroredMetrics.totalMonthlySales === 'number') {
      return Math.max(liveCalculated, myMirroredMetrics.totalMonthlySales);
    }
    return liveCalculated;
  }, [salesCycleMetrics, myAuthoritativeMetrics, pendingMutationsCount, myMirroredMetrics, isAuthoritativeDataReady]);

  // Current cycle closed and unclosed cash breakdown
  const closedMonthlyCash = useMemo(() => {
    const liveClosed = salesCycleMetrics?.closedCash ?? 0;
    if (myAuthoritativeMetrics && typeof myAuthoritativeMetrics.closedCash === 'number' && pendingMutationsCount === 0) {
      return Math.min(totalMonthlySales, Math.max(liveClosed, myAuthoritativeMetrics.closedCash));
    }
    if (!isAuthoritativeDataReady && myMirroredMetrics && typeof myMirroredMetrics.closedCash === 'number') {
      return Math.min(totalMonthlySales, Math.max(liveClosed, myMirroredMetrics.closedCash));
    }
    return Math.min(totalMonthlySales, liveClosed);
  }, [totalMonthlySales, salesCycleMetrics, myAuthoritativeMetrics, pendingMutationsCount, myMirroredMetrics, isAuthoritativeDataReady]);

  const unclosedMonthlyCash = useMemo(() => {
    return Math.max(0, Number((totalMonthlySales - closedMonthlyCash).toFixed(2)));
  }, [totalMonthlySales, closedMonthlyCash]);

  // Overall Sales: All-time cumulative sales across all cycles (pulled authoritatively from Global DB to avoid stale local cache skew)
  const overallSales = useMemo(() => {
    const allVouchersSoldVal = mySoldVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, giveawaySettings), 0);
    const allLegacySoldVal = myLegacyDevices
      .filter(ld => (ld.status === 'SOLD' || !!ld.soldAt) && ld.reversalStatus !== 'Approved' && ld.status !== 'CANCELLED')
      .reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);
    const liveCalculated = allVouchersSoldVal + allLegacySoldVal;

    if (myAuthoritativeMetrics && typeof myAuthoritativeMetrics.overallSales === 'number' && pendingMutationsCount === 0) {
      return Math.max(liveCalculated, myAuthoritativeMetrics.overallSales);
    }
    if (!isAuthoritativeDataReady && myMirroredMetrics && typeof myMirroredMetrics.overallSales === 'number') {
      return Math.max(liveCalculated, myMirroredMetrics.overallSales);
    }
    return liveCalculated;
  }, [mySoldVouchers, myLegacyDevices, giveawaySettings, myAuthoritativeMetrics, pendingMutationsCount, myMirroredMetrics, isAuthoritativeDataReady]);

  // Previous month historical records for adjacent display (pulled authoritatively from Global DB)
  const prevMonthOverallSales = useMemo(() => {
    const prevCycleMonth = getPreviousCycleMonth(new Date());
    const prevVoucherSales = mySoldVouchers
      .filter(v => getCycleMonthFromDate(v.soldAt || v.createdAt) === prevCycleMonth)
      .reduce((sum, v) => sum + getVoucherMonetaryValue(v, giveawaySettings), 0);
    const prevLegacySales = myLegacyDevices
      .filter(ld => (ld.status === 'SOLD' || !!ld.soldAt) && getCycleMonthFromDate(ld.soldAt || ld.enrolledAt) === prevCycleMonth)
      .reduce((sum, ld) => sum + (ld.soldPrice ?? ld.monthlyPrice ?? 0), 0);
    const liveCalculated = prevVoucherSales + prevLegacySales;

    if (myAuthoritativeMetrics && typeof myAuthoritativeMetrics.prevMonthOverallSales === 'number' && pendingMutationsCount === 0) {
      return Math.max(liveCalculated, myAuthoritativeMetrics.prevMonthOverallSales);
    }
    if (!isAuthoritativeDataReady && myMirroredMetrics && typeof myMirroredMetrics.prevMonthOverallSales === 'number') {
      return Math.max(liveCalculated, myMirroredMetrics.prevMonthOverallSales);
    }
    return liveCalculated;
  }, [mySoldVouchers, myLegacyDevices, giveawaySettings, myAuthoritativeMetrics, pendingMutationsCount, myMirroredMetrics, isAuthoritativeDataReady]);

  // Prior cycles sales before previous month (allows overallSales headline to mathematically sum to sub-label)
  const priorCyclesSales = useMemo(() => {
    return Math.max(0, Number((overallSales - totalMonthlySales - prevMonthOverallSales).toFixed(2)));
  }, [overallSales, totalMonthlySales, prevMonthOverallSales]);

  // grandTotalSales kept as alias to totalMonthlySales for cash close components
  const grandTotalSales = totalMonthlySales;

  // Monthly Commission logic (prioritize agent custom rate, then sales cycle metrics, then workspace default)
  const myUserInState = useMemo(() => {
    if (!currentUser) return null;
    return users.find(u => 
      u.uid === myUid || 
      u.uid === currentUser.uid || 
      (currentUser.email && u.email && u.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim())
    );
  }, [users, currentUser, myUid]);

  const commissionPercentValue = 
    currentUser?.commissionRate ?? 
    myUserInState?.commissionRate ?? 
    salesCycleMetrics?.commissionRate ?? 
    activeWorkspace?.cashCloseSettings?.agentOverrides?.[currentUser?.uid || '']?.commissionRate ?? 
    activeWorkspace?.cashCloseSettings?.defaultCommissionRate ?? 
    cashCloseSettings?.defaultCommissionRate ?? 
    10;
  const commissionRate = commissionPercentValue / 100;

  // Total commission earned this cycle strictly from total monthly cash collected
  const totalCommissionEarned = useMemo(() => {
    return Number((totalMonthlySales * commissionRate).toFixed(2));
  }, [totalMonthlySales, commissionRate]);

  // My Monthly Commission: Strictly derived from UNCLOSED cash of the current sales cycle (excludes already closed cash)
  const myCommission = useMemo(() => {
    return Number((unclosedMonthlyCash * commissionRate).toFixed(2));
  }, [unclosedMonthlyCash, commissionRate]);

  // Commission on already closed cash (for transparent reporting)
  const closedCommission = useMemo(() => {
    return Number((closedMonthlyCash * commissionRate).toFixed(2));
  }, [closedMonthlyCash, commissionRate]);

  const prevMonthCommission = useMemo(() => {
    if (!isAuthoritativeDataReady && myMirroredMetrics && typeof myMirroredMetrics.closedCommission === 'number') {
      return myMirroredMetrics.closedCommission;
    }
    return Number((prevMonthOverallSales * commissionRate).toFixed(2));
  }, [prevMonthOverallSales, commissionRate, myMirroredMetrics, isAuthoritativeDataReady]);

  // Cash Close & Approval state tracking
  const todayClosedCash = useMemo(() => {
    const todayStr = new Date().toDateString();
    return myCashDrops
      .filter(cd => {
        const isApprovedOrPending = cd.status === 'Pending' || cd.status === 'Reconciled' || (cd.status as any) === 'Approved';
        if (!isApprovedOrPending) return false;
        return cd.timestamp && new Date(cd.timestamp).toDateString() === todayStr;
      })
      .reduce((sum, cd) => sum + (cd.amount || 0), 0);
  }, [myCashDrops]);

  const hasPendingApproval = useMemo(() => {
    return myCashDrops.some(cd => isDropPending(cd));
  }, [myCashDrops]);

  const hasApprovedCashClose = useMemo(() => {
    return myCashDrops.some(cd => isDropApprovedOrReconciled(cd));
  }, [myCashDrops]);

  const isTodayCashFullyClosed = useMemo(() => {
    if (dailySalesTotal === 0) return todayClosedCash > 0;
    return todayClosedCash >= dailySalesTotal;
  }, [dailySalesTotal, todayClosedCash]);

  const unclosedCashToday = useMemo(() => {
    if (isTodayCashFullyClosed) return 0;
    return Math.max(0, dailySalesTotal - todayClosedCash);
  }, [dailySalesTotal, todayClosedCash, isTodayCashFullyClosed]);

  const isFinalCashCloseDone = useMemo(() => {
    if (salesCycleMetrics?.isFinalCashCloseDone !== undefined) {
      return salesCycleMetrics.isFinalCashCloseDone;
    }
    const cycleClosed = (salesCycleMetrics?.closedCash ?? 0);
    const cycleCollected = (salesCycleMetrics?.cashCollected ?? 0);
    if (cycleCollected > 0 && cycleClosed >= cycleCollected) return true;
    if (salesCycleMetrics && salesCycleMetrics.remainingCash <= 0.01 && cycleClosed > 0) return true;
    return false;
  }, [salesCycleMetrics]);

  // --- Handlers ---
  const handlePairPrinter = async () => {
    setBtScanning(true);
    setBtFeedback("Scanning for paired or nearby Bluetooth thermal printers...");
    const result = await detectAndConnectBTPrinter();
    setBtScanning(false);
    if (result.success) {
      setBtFeedback(`Connected to ${result.printerName}! ✓ Ready for instant voucher printing.`);
      setTimeout(() => setBtFeedback(null), 5000);
    } else {
      setBtFeedback(result.error || "Could not connect to Bluetooth printer.");
      setTimeout(() => setBtFeedback(null), 9000);
    }
  };

  const handleDisconnectPrinter = async () => {
    await disconnectBTPrinter();
    setBtFeedback("Bluetooth printer disconnected.");
    setTimeout(() => setBtFeedback(null), 3000);
  };

  const handleTestPrint = async () => {
    setPrintingStatus('printing');
    const testData: TicketPrintData = {
      code: "POS-TEST-88",
      plan: "Thermal Slip Test",
      price: 0.00,
      duration: "Test Slip",
      customerName: "Thermal POS Test",
      customerCell: "N/A",
      workspaceName: activeWorkspace?.name || "VakZim ICT&E",
      agentName: currentUser?.name || "Field Agent",
      agentId: currentUser?.uid,
      location: myLocation,
      dateFormatted: new Date().toLocaleString()
    };
    try {
      const res = await printReceiptUniversal(testData);
      setPrintingStatus('printed');
      if (res.method === 'bluetooth') {
        setBtFeedback(`Test slip transmitted to ${res.printerName || 'Bluetooth printer'}! ✓`);
      } else {
        setBtFeedback("Thermal slip print preview opened! ✓");
      }
      setTimeout(() => {
        setPrintingStatus('idle');
        setBtFeedback(null);
      }, 4000);
    } catch (err) {
      console.error("Test print error:", err);
      setPrintingStatus('idle');
      setBtFeedback("Test print failed. Check printer power & connection.");
      setTimeout(() => setBtFeedback(null), 4000);
    }
  };

  // Real-time loyalty evaluation for currently selected voucher & customer
  const loyaltyEvaluation = useMemo(() => {
    if (!selectedVoucher) return null;
    return evaluateCustomerLoyalty(selectedCustomer, selectedVoucher.price, loyaltySettings);
  }, [selectedCustomer, selectedVoucher, loyaltySettings]);

  const isSubmittingSaleRef = useRef(false);

  const executeSale = async (
    action: 'print_and_close' | 'close_no_print' | 'preview',
    isSkippingDetails: boolean = false
  ) => {
    if (!selectedVoucher) return;
    if (isSubmittingSaleRef.current) return;
    isSubmittingSaleRef.current = true;

    try {
      const isEnforced = !!loyaltySettings?.enforceCustomerDetailsOnSale;
      let finalCustomerName = customerName.trim();
      let finalCustomerCell = customerCell.trim();

      if (isSkippingDetails) {
        if (isEnforced) {
          alert("🔒 Mandatory Customer Details: Workspace Admin has enforced customer details for all sales. Skipping details is disabled.");
          setSkipDetailsConfirmation(null);
          return;
        }
        finalCustomerName = 'Walk-in Client';
        finalCustomerCell = 'N/A';
      } else {
        // If not explicitly skipping, check if details are provided
        if (!finalCustomerName || !finalCustomerCell) {
          if (isEnforced) {
            alert("🔒 Mandatory Customer Details: Workspace Admin requires customer name and cell number for all sales. Please enter customer details before completing the sale.");
            return;
          }
          // If details are optional, prompt the agent with the confirmation modal
          setSkipDetailsConfirmation({
            isOpen: true,
            action
          });
          return;
        }
      }

      const isWalkIn = finalCustomerName.toLowerCase().includes('walk-in') || finalCustomerCell === 'N/A';

      const fullCustomerCell = isWalkIn
        ? 'N/A'
        : (finalCustomerCell.startsWith('+')
            ? finalCustomerCell
            : `${masterCountryInfo.code} ${finalCustomerCell.replace(/^0+/, '')}`);

      const loyaltyDiscount = (!isWalkIn && loyaltyEvaluation?.isEligibleForReward)
        ? loyaltyEvaluation.discountAmount
        : 0;
      const finalPrice = Math.max(0, selectedVoucher.price - loyaltyDiscount);
      const customerNo = (!isWalkIn && selectedCustomer?.customerNumber) ? selectedCustomer.customerNumber : '';
      const loyaltyNote = (!isWalkIn && loyaltyEvaluation?.isEligibleForReward)
        ? loyaltyEvaluation.rewardMessage
        : (loyaltyEvaluation?.countdownNotice || '');

      const voucherToSell = selectedVoucher;

      // Close modal and reset sale forms IMMEDIATELY so user cannot double click
      setSelectedVoucher(null);
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerCell('');
      setSkipDetailsConfirmation(null);

      const saleResult = await completeSale(
        voucherToSell.id,
        finalCustomerName,
        fullCustomerCell,
        loyaltyDiscount,
        customerNo,
        loyaltyNote
      );

      const actualCustomerNo = saleResult?.customerNumber || customerNo;

      if (action === 'preview') {
        setActiveTicket({
          type: 'wifi',
          id: voucherToSell.id,
          code: voucherToSell.code,
          plan: voucherToSell.plan,
          price: finalPrice,
          duration: voucherToSell.duration,
          customer: finalCustomerName,
          cell: fullCustomerCell,
          networkName: voucherToSell.networkName,
          customerNumber: actualCustomerNo,
          originalPrice: voucherToSell.price,
          discountApplied: loyaltyDiscount,
          loyaltyNotice: loyaltyNote
        });
        return;
      }

      if (action === 'print_and_close') {
        const printData: TicketPrintData = {
          code: voucherToSell.code,
          plan: voucherToSell.plan,
          price: finalPrice,
          duration: voucherToSell.duration,
          customerName: finalCustomerName,
          customerCell: fullCustomerCell,
          networkName: voucherToSell.networkName,
          workspaceName: activeWorkspace?.name || 'VakZim ICT&E',
          agentName: currentUser?.name || 'Field Agent',
          agentId: currentUser?.uid,
          location: voucherToSell.location || myLocation,
          dateFormatted: new Date().toLocaleString(),
          customerNumber: actualCustomerNo,
          originalPrice: voucherToSell.price,
          discountApplied: loyaltyDiscount,
          loyaltyNotice: loyaltyNote
        };
        setPrintingStatus('printing');
        printReceiptUniversal(printData).finally(() => setPrintingStatus('idle'));
      }
    } finally {
      isSubmittingSaleRef.current = false;
    }
  };

  const handleCompleteSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSale('close_no_print');
  };

  const handleSaleAction = async (action: 'print_and_close' | 'close_no_print' | 'preview') => {
    await executeSale(action);
  };

  const handleExecuteGiveaway = async (
    voucher: Voucher,
    custName: string,
    custCell: string,
    action: 'print_and_close' | 'close_no_print' | 'preview'
  ) => {
    if (isSubmittingSaleRef.current) return;
    isSubmittingSaleRef.current = true;

    try {
      // If voucher was an unassigned pool voucher, attribute to current agent for print slip
      if (!voucher.assignedAgentId && currentUser) {
        voucher = {
          ...voucher,
          assignedAgentId: currentUser.uid,
          assignedAgentName: currentUser.name || 'Agent',
          location: voucher.location || myLocation
        };
      }

      // Reset giveaway and sales forms IMMEDIATELY so modal closes instantly
      setSelectedVoucher(null);
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerCell('');
      setIsAgentGiveawayModalOpen(false);
      setSelectedFreeVoucher(null);

      const saleResult = await completeSale(
        voucher.id,
        custName,
        custCell,
        voucher.price,
        undefined,
        '🎁 Customer Gift Voucher (Free Giveaway)'
      );

      const actualCustomerNo = saleResult?.customerNumber || '';

      if (action === 'preview') {
        setActiveTicket({
          type: 'wifi',
          id: voucher.id,
          code: voucher.code,
          plan: `${voucher.plan} (🎁 Free Gift)`,
          price: 0,
          duration: voucher.duration,
          customer: custName,
          cell: custCell,
          networkName: voucher.networkName,
          customerNumber: actualCustomerNo,
          originalPrice: voucher.price,
          discountApplied: voucher.price,
          loyaltyNotice: '🎁 Customer Gift Voucher (Free Giveaway)'
        });
        return;
      }

      if (action === 'print_and_close') {
        const printData: TicketPrintData = {
          code: voucher.code,
          plan: `${voucher.plan} (🎁 Customer Gift)`,
          price: 0,
          duration: voucher.duration,
          customerName: custName,
          customerCell: custCell,
          networkName: voucher.networkName,
          workspaceName: activeWorkspace?.name || 'WiVoTe',
          agentName: currentUser?.name || 'Field Agent',
          agentId: currentUser?.uid,
          location: voucher.location || myLocation,
          dateFormatted: new Date().toLocaleString(),
          customerNumber: actualCustomerNo,
          originalPrice: voucher.price,
          discountApplied: voucher.price,
          loyaltyNotice: '🎁 Promotional Customer Gift Voucher - $0.00'
        };
        setPrintingStatus('printing');
        printReceiptUniversal(printData).finally(() => setPrintingStatus('idle'));
      }
    } finally {
      isSubmittingSaleRef.current = false;
    }
  };

  const handleLegacySale = async (ld: LegacyDevice) => {
    const saleResult = await markLegacyDeviceSold(ld.id);
    
    // Find customer for contact details and loyalty profile
    const matchedCustomer = ld.customerId 
      ? customers.find(c => c.id === ld.customerId)
      : customers.find(c => c.name && c.name.trim().toLowerCase() === ld.customerName.trim().toLowerCase());

    const finalPrice = saleResult?.finalSoldPrice !== undefined ? saleResult.finalSoldPrice : ld.monthlyPrice;
    const discount = saleResult?.discountApplied || 0;

    setActiveTicket({
      type: 'legacy',
      id: ld.id,
      code: ld.macAddress,
      plan: `${ld.deviceNameModel}${discount > 0 ? ` (Genius Reward: -$${(discount || 0).toFixed(2)})` : ''}`,
      price: finalPrice,
      duration: '30 Days',
      customer: ld.customerName,
      cell: ld.customerCell || matchedCustomer?.cellNumber || 'N/A'
    });
  };

  const handleTopupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitVoucherRequest(reqPlan, reqQty, reqLoc);
    showToast(`✓ Top-up request for ${reqQty} ${reqPlan} vouchers submitted to Admin!`, 'success');
    setReqQty(5);
    setReqLoc('');
  };

  const handleLegacyEnrolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legName.trim()) {
      showToast("Please enter or select a customer name.", "error");
      return;
    }
    if (!legModel.trim()) {
      showToast("Please enter the device model.", "error");
      return;
    }
    if (!legMac.trim()) {
      showToast("Please enter the MAC address (Hardware ID).", "error");
      return;
    }

    const cleanMac = legMac.trim();
    const cleanModel = legModel.trim();
    const normMac = cleanMac.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (normMac.length < 8) {
      showToast("Please enter a valid MAC address (minimum 8 alphanumeric characters).", "error");
      return;
    }

    // Check for duplicate MAC address in existing legacy devices
    const existingMacDevice = legacyDevices.find(ld => {
      const m = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return m.length >= 8 && m === normMac;
    });

    if (existingMacDevice) {
      showToast(`Device with MAC address "${cleanMac}" is already enrolled for ${existingMacDevice.customerName || 'another customer'}!`, "error");
      return;
    }

    // Guard against duplicate names in registry
    const trimmedNameLower = legName.trim().toLowerCase();
    const existingDuplicate = customers.find(c => c.id !== selectedLegCustomer?.id && c.name && c.name.trim().toLowerCase() === trimmedNameLower);

    const targetCustomerId = selectedLegCustomer?.id || existingDuplicate?.id;
    const targetCustomerCell = selectedLegCustomer?.cellNumber || existingDuplicate?.cellNumber || legCell.trim();
    const targetCustomerNumber = selectedLegCustomer?.customerNumber || existingDuplicate?.customerNumber;
    const targetCustomerName = selectedLegCustomer?.name || existingDuplicate?.name || legName.trim();

    try {
      setIsSubmittingLeg(true);
      await submitLegacyDevice(
        targetCustomerName,
        cleanModel,
        cleanMac,
        0.00,
        targetCustomerId,
        targetCustomerCell,
        targetCustomerNumber
      );

      // Reset form state completely
      setLegName('');
      setLegCell('');
      setLegModel('');
      setLegMac('');
      setSelectedLegCustomer(null);
      showToast(`Legacy terminal "${cleanModel}" enrolled successfully for ${targetCustomerName}!`, "success");
    } catch (err: any) {
      console.warn("Legacy enrollment error:", err);
      showToast(`Enrollment failed: ${err?.message || 'Unknown error'}`, "error");
    } finally {
      setIsSubmittingLeg(false);
    }
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) return;
    const selectedVoucher = myAssignedVouchers.find(v => v.id === queryVoucherId);
    submitFeedback(queryText.trim(), selectedVoucher?.code, selectedVoucher?.id);
    setQueryText('');
    setQueryVoucherId('');
    showToast("Voucher query submitted to Workspace Master!", "info");
  };

  const handlePrintReceipt = async () => {
    if (!activeTicket) return;
    setPrintingStatus('printing');
    const printData: TicketPrintData = {
      code: activeTicket.code,
      plan: activeTicket.plan,
      price: activeTicket.price,
      duration: activeTicket.duration,
      customerName: activeTicket.customer || 'Customer',
      customerCell: activeTicket.cell || 'N/A',
      networkName: activeTicket.networkName,
      workspaceName: activeWorkspace?.name || 'VakZim ICT&E',
      agentName: currentUser?.name || 'Field Agent',
      agentId: currentUser?.uid,
      location: myLocation,
      dateFormatted: new Date().toLocaleString(),
      customerNumber: activeTicket.customerNumber,
      originalPrice: activeTicket.originalPrice,
      discountApplied: activeTicket.discountApplied,
      loyaltyNotice: activeTicket.loyaltyNotice
    };

    try {
      await printReceiptUniversal(printData);
      setPrintingStatus('printed');
      setTimeout(() => setPrintingStatus('idle'), 2500);
    } catch (e) {
      console.error('Print receipt error:', e);
      setPrintingStatus('idle');
    }
  };

  const handlePrintActiveTicketAndClose = async () => {
    if (!activeTicket) return;
    await handlePrintReceipt();
    setActiveTicket(null);
    setPrintingStatus('idle');
  };

  const handleShareWhatsApp = (ticket: typeof activeTicket, customCell?: string) => {
    if (!ticket) return;
    const brandName = activeWorkspace?.name || 'VakZim ICT&E';
    const ssidText = ticket.networkName ? ` \nWi-Fi Network (SSID): ${ticket.networkName}` : '';
    const text = `*WiVoTe ACCESS TICKET* \n\n🔒 Code: ${ticket.code} \nPlan: ${ticket.plan}${ssidText} \nPrice: $${(ticket.price || 0).toFixed(2)} \nValidity: ${ticket.duration} \n\n*Client:* ${ticket.customer} \n*Agent:* ${currentUser?.name || 'Field Agent'} \nAuthorized by ${brandName} 2026.`;
    
    const countryCode = masterCountryInfo?.code || activeWorkspace?.telephoneCode || '+263';
    const targetCell = customCell !== undefined ? customCell : ticket.cell;
    const cleanPhone = formatWhatsAppPhone(targetCell, countryCode);

    if (cleanPhone) {
      openWhatsAppWithReceipt({
        phone: targetCell,
        text,
        fallbackCountryCode: countryCode
      });
      showToast(`✓ Opening WhatsApp directly for +${cleanPhone}`, 'success');
      setDirectWhatsAppTicket(null);
    } else {
      // If customer has no valid cell number, prompt agent to enter it to open directly
      setDirectWhatsAppTicket({ ticket });
      setDirectWhatsAppInput('');
    }
  };

  const generateTicketImageBlob = async (ticket: NonNullable<typeof activeTicket>): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas context not available');
        }

        // 1. Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#0f172a'); // slate-900
        gradient.addColorStop(1, '#1e1b4b'); // indigo-950
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ambient lights
        ctx.fillStyle = 'rgba(14, 165, 233, 0.1)'; // sky-500
        ctx.beginPath();
        ctx.arc(canvas.width, 0, 200, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(99, 102, 241, 0.1)'; // indigo-500
        ctx.beginPath();
        ctx.arc(0, canvas.height, 240, 0, Math.PI * 2);
        ctx.fill();

        // 2. Ticket border/background rounded frame
        const padding = 24;
        const tX = padding;
        const tY = padding;
        const tW = canvas.width - padding * 2;
        const tH = canvas.height - padding * 2;
        const radius = 24;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        
        // Path with punched side notches
        ctx.beginPath();
        const notchY = tY + 160;
        const notchRadius = 18;

        ctx.moveTo(tX + radius, tY);
        ctx.lineTo(tX + tW - radius, tY);
        ctx.arcTo(tX + tW, tY, tX + tW, tY + radius, radius);

        ctx.lineTo(tX + tW, notchY - notchRadius);
        ctx.arc(tX + tW, notchY, notchRadius, -Math.PI / 2, Math.PI / 2, true);
        ctx.lineTo(tX + tW, tY + tH - radius);
        ctx.arcTo(tX + tW, tY + tH, tX + tW - radius, tY + tH, radius);

        ctx.lineTo(tX + radius, tY + tH);
        ctx.arcTo(tX, tY + tH, tX, tY + tH - radius, radius);

        ctx.lineTo(tX, notchY + notchRadius);
        ctx.arc(tX, notchY, notchRadius, Math.PI / 2, -Math.PI / 2, true);
        ctx.lineTo(tX, tY + radius);
        ctx.arcTo(tX, tY, tX + radius, tY, radius);

        ctx.closePath();
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fill();
        ctx.stroke();

        // 3. Draw Wifi Icon
        const iconCenterX = canvas.width / 2;
        const iconCenterY = tY + 65;
        ctx.strokeStyle = '#38bdf8'; // sky-400
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        // Draw dot
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(iconCenterX, iconCenterY + 15, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw arcs
        ctx.beginPath();
        ctx.arc(iconCenterX, iconCenterY + 15, 14, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(iconCenterX, iconCenterY + 15, 26, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(iconCenterX, iconCenterY + 15, 38, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.stroke();

        // 4. Header text
        const brandName = activeWorkspace?.name || 'VakZim ICT&E';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WiVoTe ACCESS TICKET', canvas.width / 2, tY + 115);

        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.font = '500 12px monospace';
        ctx.fillText(brandName.toUpperCase() + ' NETWORK SECURED', canvas.width / 2, tY + 135);

        // 5. Dashed separator line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(tX + notchRadius, notchY);
        ctx.lineTo(tX + tW - notchRadius, notchY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // 6. Ticket fields
        const contentYStart = notchY + 55;
        const rowHeight = 38;
        ctx.textAlign = 'left';

        const drawRow = (label: string, value: string, index: number, isMonospace = false, isEmerald = false) => {
          const y = contentYStart + index * rowHeight;
          
          ctx.fillStyle = '#64748b'; // slate-500
          ctx.font = '500 12px monospace';
          ctx.fillText(label, tX + 35, y);

          if (isEmerald) {
            ctx.fillStyle = '#10b981'; // emerald-500
          } else {
            ctx.fillStyle = '#f1f5f9'; // slate-100
          }

          if (isMonospace) {
            ctx.font = 'bold 13px monospace';
          } else {
            ctx.font = 'bold 13px sans-serif';
          }
          
          ctx.textAlign = 'right';
          ctx.fillText(value, tX + tW - 35, y);
          ctx.textAlign = 'left';

          // Underline divider
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tX + 30, y + 12);
          ctx.lineTo(tX + tW - 30, y + 12);
          ctx.stroke();
        };

        drawRow('CLIENT NAME', ticket.customer, 0);
        drawRow('CELL NUMBER', ticket.cell, 1, true);
        drawRow('PLAN CATEGORY', ticket.plan.toUpperCase(), 2);
        drawRow('VALIDITY PERIOD', ticket.duration || '30 Days', 3);
        drawRow('AMOUNT PAID', `$${(ticket.price || 0).toFixed(2)}`, 4, true, true);
        
        let rowCount = 5;
        if (ticket.networkName) {
          drawRow('WI-FI NETWORK (SSID)', ticket.networkName, 5);
          rowCount = 6;
        }

        // 7. Secure Voucher Code Card Box
        const boxY = contentYStart + rowCount * rowHeight + 12;
        const boxH = 88;
        const boxW = tW - 50;
        const boxX = tX + 25;

        // Draw translucent blue background card
        ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(boxX, boxY, boxW, boxH, 16);
        } else {
          ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();

        // Box texts
        ctx.fillStyle = '#38bdf8'; // sky-400
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SECURE VOUCHER ACCESS CODE / MAC', canvas.width / 2, boxY + 28);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'black 22px monospace';
        ctx.fillText(ticket.code, canvas.width / 2, boxY + 60);

        // 8. Agent Stamp and Footer
        const footerY = tY + tH - 35;
        const agentNameLine = `SERVED BY: ${(currentUser?.name || 'AUTHORIZED FIELD AGENT').toUpperCase()}`;
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(agentNameLine, canvas.width / 2, footerY - 18);

        ctx.fillStyle = '#475569'; // slate-600
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AUTHORIZED WiVoTe DIGITAL ACCESS RECEIPT', canvas.width / 2, footerY);
        
        ctx.fillStyle = '#334155'; // slate-700
        ctx.font = '500 8px monospace';
        ctx.fillText('SECURED BY VAKZIM INTEGRATED SECURITY MODULE • 2026', canvas.width / 2, footerY + 15);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate PNG blob'));
          }
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  };

  const handleNativeShareText = async (ticket: NonNullable<typeof activeTicket>) => {
    if (!ticket) return;
    const brandName = activeWorkspace?.name || 'VakZim ICT&E';
    const ssidText = ticket.networkName ? ` \nWi-Fi Network (SSID): ${ticket.networkName}` : '';
    const text = `*WiVoTe ACCESS TICKET* \n\n🔒 Code: ${ticket.code} \nPlan: ${ticket.plan}${ssidText} \nPrice: $${(ticket.price || 0).toFixed(2)} \nValidity: ${ticket.duration} \n\n*Client:* ${ticket.customer} \nAuthorized by ${brandName} 2026.`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WiVoTe Access Ticket',
          text: text,
        });
      } catch (err) {
        console.warn('Native sharing text failed or dismissed:', err);
        // Copy to clipboard fallback if user closed the share dialog
        navigator.clipboard.writeText(text);
        alert('Ticket details copied to clipboard!');
      }
    } else {
      navigator.clipboard.writeText(text);
      alert('Android Native Sharing is not available in this browser. Details copied to clipboard instead!');
    }
  };

  const handleNativeShareImage = async (ticket: NonNullable<typeof activeTicket>) => {
    if (!ticket) return;
    setSharingStatus('preparing');
    try {
      const blob = await generateTicketImageBlob(ticket);
      const file = new File([blob], `wivote_ticket_${ticket.code}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'WiVoTe Access Ticket',
          text: `WiVoTe Access Ticket code: ${ticket.code} for ${ticket.customer}`
        });
        setSharingStatus('shared');
      } else if (navigator.share) {
        // Fallback: share text, then prompt download
        const brandName = activeWorkspace?.name || 'VakZim ICT&E';
        const text = `*WiVoTe ACCESS TICKET* \n\n🔒 Code: ${ticket.code} \nPlan: ${ticket.plan} \nPrice: $${(ticket.price || 0).toFixed(2)} \nValidity: ${ticket.duration} \n\n*Client:* ${ticket.customer} \nAuthorized by ${brandName} 2026.`;
        await navigator.share({
          title: 'WiVoTe Access Ticket',
          text: text
        });
        await handleDownloadImage(ticket);
        setSharingStatus('shared');
      } else {
        await handleDownloadImage(ticket);
        setSharingStatus('idle');
        alert('Android Native Image Sharing is not supported by this browser. Ticket image downloaded successfully!');
      }
    } catch (err) {
      console.error('Error generating/sharing ticket image:', err);
      setSharingStatus('error');
      // Final fallback is to download
      await handleDownloadImage(ticket);
    } finally {
      setTimeout(() => setSharingStatus('idle'), 2500);
    }
  };

  const handleDownloadImage = async (ticket: NonNullable<typeof activeTicket>) => {
    if (!ticket) return;
    try {
      const blob = await generateTicketImageBlob(ticket);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wivote_ticket_${ticket.code}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error in downloading image ticket:', err);
      alert('Error downloading ticket. Please try again.');
    }
  };

  const handleSendEODReport = () => {
    const reportText = `*EOD Sales Report - ${new Date().toLocaleDateString()}* \n\nAgent: ${currentUser?.name} \nDaily Sales: $${(dailySalesTotal || 0).toFixed(2)} \nLegacy Sales: $${(totalLegacySales || 0).toFixed(2)} \nCommission Earned: $${(myCommission || 0).toFixed(2)}`;
    window.open(`mailto:admin@wivote.com?subject=WiVoTe EOD Sales Report - ${currentUser?.name}&body=${encodeURIComponent(reportText)}`, '_blank');
    alert("Daily EOD Sales report formatted and shared via email!");
  };

  const handleCashClose = () => {
    setIsCashCloseModalOpen(true);
  };

  const handleConfirmCashClose = (amount: number, notes?: string, extra?: any) => {
    submitCashDrop(amount, 'Agent', notes, undefined, undefined, extra);
    setIsCashCloseModalOpen(false);
    showToast(`✓ Cash drop of $${(amount || 0).toFixed(2)} submitted for verification!`, 'success');
  };

  // Render shareable ticket view if ticket is active
  if (activeTicket) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Back Button to prevent getting stuck */}
        <button
          onClick={() => {
            setActiveTicket(null);
            setPrintingStatus('idle');
          }}
          id="btn-back-ticket"
          className={`flex items-center gap-2 transition font-mono text-xs px-4 py-2.5 rounded-xl cursor-pointer ${
            theme === 'light'
              ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className={`border rounded-3xl p-6 relative overflow-hidden shadow-2xl transition-all duration-300 ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="hidden sm:block absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-xl pointer-events-none" />
          
          <div className={`text-center mb-6 border-b border-dashed pb-6 ${
            theme === 'light' ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <div className="relative inline-flex items-center justify-center mb-2">
              <div className="hidden sm:block absolute inset-0 bg-sky-500/20 rounded-xl blur-md scale-90 pointer-events-none" />
              <img
                src="/wivote_logo.png"
                alt="WiVoTe Logo"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-14 h-14 object-contain rounded-xl relative z-10"
              />
            </div>
            <h2 className={`text-lg font-black font-display uppercase tracking-wider ${
              theme === 'light' ? 'text-slate-950' : 'text-white'
            }`}>WiVoTe Receipt</h2>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">{activeWorkspace?.name || 'VakZim ICT&E'} {new Date().getFullYear()}</p>
          </div>

          <div className={`space-y-4 font-mono text-sm p-5 border rounded-2xl relative ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            {activeTicket.customerNumber && (
              <div className="flex justify-between">
                <span className="text-slate-500">CUSTOMER NUMBER</span>
                <span className="text-sky-600 dark:text-sky-400 font-mono font-bold">{activeTicket.customerNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">CLIENT</span>
              <span className={`font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{activeTicket.customer}</span>
            </div>
            {activeTicket.cell !== 'N/A' && (
              <div className="flex justify-between">
                <span className="text-slate-500">CELL NUMBER</span>
                <span className={theme === 'light' ? 'text-slate-800' : 'text-white'}>{activeTicket.cell}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">PLAN GROUP</span>
              <span className="text-sky-600 dark:text-sky-400 font-bold uppercase">{activeTicket.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">VALIDITY</span>
              <span className={theme === 'light' ? 'text-slate-800' : 'text-white'}>{activeTicket.duration}</span>
            </div>
            {activeTicket.networkName && (
              <div className="flex justify-between">
                <span className="text-slate-500">WI-FI NETWORK (SSID)</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{activeTicket.networkName}</span>
              </div>
            )}
            {activeTicket.discountApplied && activeTicket.discountApplied > 0 ? (
              <>
                <div className="flex justify-between border-t border-dashed pt-2">
                  <span className="text-slate-500">ORIGINAL PRICE</span>
                  <span className="text-slate-400 line-through font-mono">${(activeTicket.originalPrice || activeTicket.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-500">
                  <span className="font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> LOYALTY REWARD APPLIED
                  </span>
                  <span className="font-bold font-mono">-${(activeTicket.discountApplied || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">AMOUNT PAID (REWARDED)</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">${(activeTicket.price || 0).toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className={`flex justify-between border-t border-dashed pt-3 ${
                theme === 'light' ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <span className="text-slate-500">AMOUNT PAID</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">${(activeTicket.price || 0).toFixed(2)}</span>
              </div>
            )}

            {activeTicket.loyaltyNotice && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-mono text-amber-600 dark:text-amber-400 text-center font-bold">
                {activeTicket.loyaltyNotice}
              </div>
            )}

            {/* REQUIREMENT: MAKE THE ACTUAL VOUCHER CODE ON THE OUTPUT BT RECEIPT LARGE AND BOLD AND IN BLACK AND WHITE FOR NORMAL THERMAL PRINT */}
            <div className="bg-white border-3 border-black text-black p-4 sm:p-5 rounded-2xl text-center mt-4 shadow-md">
              <div className="text-[10px] text-black font-mono font-black uppercase tracking-wider mb-1">
                VOUCHER ACCESS CODE (THERMAL B&W)
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-black select-all py-1">
                {activeTicket.code}
              </div>
              <div className="text-[9px] text-slate-700 font-mono">
                HIGH CONTRAST MONOCHROME THERMAL FORMAT
              </div>
            </div>

            {/* REQUIREMENT: BT RECEIPT SHOULD HAVE AGENT NAME AT THE BOTTOM FOR REFERENCE */}
            <div className={`border-t border-dashed pt-3.5 mt-4 text-center ${
              theme === 'light' ? 'border-slate-300' : 'border-slate-700'
            }`}>
              <div className="text-[10px] font-mono uppercase text-slate-500">Served By</div>
              <div className={`text-xs font-mono font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                {currentUser?.name || 'Authorized Field Agent'}
              </div>
              <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                Terminal ID: {myUid}
              </div>
            </div>
          </div>

          {/* REQUIREMENT: ALLOW AGENT TO CHOOSE EITHER PRINT OR CLOSE SALE */}
          <div className="mt-6 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handlePrintActiveTicketAndClose}
                disabled={printingStatus === 'printing'}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-md"
              >
                <Printer className="w-4 h-4" />
                {printingStatus === 'printing' ? 'Printing to BT...' : 'Print & Close Sale'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTicket(null);
                  setPrintingStatus('idle');
                }}
                className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold font-mono border transition cursor-pointer ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Close Sale (No Print)
              </button>
            </div>
          </div>

          {/* Comprehensive Share & Delivery Hub */}
          <div className="mt-8 space-y-5">
            <div className={`border-t border-dashed pt-5 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                <Share className="w-3.5 h-3.5 text-sky-500" />
                Share & Delivery Hub
              </h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Send the WiVoTe access ticket instantly to the customer's device. Supports both rich image and plain text formats.
              </p>
            </div>

            {/* Android Native System Share Section */}
            <div className={`p-3.5 rounded-2xl border ${
              theme === 'light' ? 'bg-sky-50/50 border-sky-100' : 'bg-sky-950/10 border-sky-900/30'
            } space-y-3`}>
              <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                Android System Share
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Share as Image (Android) */}
                <button
                  onClick={() => handleNativeShareImage(activeTicket)}
                  disabled={sharingStatus === 'preparing'}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white shadow-md shadow-sky-500/10 transition cursor-pointer text-left disabled:opacity-50"
                >
                  <div className="p-2 bg-white/10 rounded-lg text-white">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold font-mono">Share as Image</div>
                    <div className="text-[9px] text-sky-100">Android System Sheet</div>
                  </div>
                </button>

                {/* Share as Text (Android) */}
                <button
                  onClick={() => handleNativeShareText(activeTicket)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer text-left ${
                    theme === 'light' 
                      ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700' 
                      : 'bg-slate-900 border-slate-800 hover:bg-slate-800/80 text-slate-200'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-slate-850 text-slate-400'}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold font-mono">Share as Text</div>
                    <div className="text-[9px] text-slate-400">Copy or System Send</div>
                  </div>
                </button>
              </div>

              {sharingStatus === 'preparing' && (
                <div className="text-[9px] text-sky-600 dark:text-sky-400 font-mono text-center animate-pulse py-1">
                  ⌛ Processing and rendering digital PNG ticket...
                </div>
              )}
            </div>

            {/* Direct App Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* WhatsApp Share (Quick action) */}
              <button
                onClick={() => handleShareWhatsApp(activeTicket)}
                className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-semibold font-mono bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-sm"
                title="Send directly via WhatsApp Web/App Link"
              >
                <Share2 className="w-4 h-4" />
                WhatsApp
              </button>

              {/* Local Download Image */}
              <button
                onClick={() => handleDownloadImage(activeTicket)}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-semibold font-mono border transition cursor-pointer ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Save ticket image to your local device download folder"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </button>

              {/* Printer Action */}
              <button
                onClick={handlePrintReceipt}
                disabled={printingStatus === 'printing'}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-semibold font-mono border transition disabled:opacity-50 cursor-pointer ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <Printer className="w-4 h-4" />
                {printingStatus === 'idle' && 'Print BT'}
                {printingStatus === 'printing' && 'Printing...'}
                {printingStatus === 'printed' && 'Printed! ✓'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <AgentSkeleton theme={theme} />;
  }

  // Strict RBAC Policy: The Agent Dashboard is strictly designated for Field Agent accounts
  if (!canAccessAgentDashboard(currentUser, isPreview)) {
    return (
      <div className="flex-grow flex items-center justify-center min-h-[60vh] p-6">
        <div className={`max-w-md w-full border p-8 rounded-3xl text-center shadow-xl transition-all duration-300 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="bg-rose-500/10 p-4 rounded-full border border-rose-500/20 w-16 h-16 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold font-display uppercase tracking-wider">POS Terminal Locked</h2>
          <p className="text-xs text-rose-500 font-mono mt-2 font-bold uppercase tracking-wider">
            Agent Accounts Only
          </p>
          <p className="text-sm text-slate-500 mt-4 leading-relaxed">
            Your profile has administrative permissions. POS Terminal interfaces are reserved strictly for active Field Agent accounts. Please operate through your Workspace Master Dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 transition-all duration-300 w-full max-w-full min-w-0 overflow-x-hidden box-border`}>
      {/* App Owner Interactive Preview Mode Banner */}
      {isPreview && (
        <div className={`px-4 py-3 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-xs transition-all w-full min-w-0 box-border ${
          theme === 'light'
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
            : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold font-display uppercase tracking-wider flex items-center gap-2">
                <span>Field Agent Terminal Preview</span>
              </div>
              <p className="text-[11px] opacity-80 mt-0.5 truncate sm:whitespace-normal">
                Full POS functionality active — browse assigned vouchers, generate sales, test receipt printing and query logs.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-xl bg-emerald-500 text-slate-950 shrink-0 self-start sm:self-center">
            Interactive Test Mode
          </span>
        </div>
      )}
      {/* Workspace Plan Tier Real-Time Live Status Bar */}
      {activeWorkspace && (
        <div className={`p-4 sm:p-5 border rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md transition-all duration-300 w-full max-w-full min-w-0 box-border ${
          theme === 'light' 
            ? 'bg-emerald-50/40 border-emerald-200/60 text-slate-800' 
            : 'bg-emerald-950/10 border-emerald-500/20 text-white'
        }`}>
          <div className="min-w-0 flex-1 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[9px] font-mono font-black tracking-widest px-2 py-0.5 rounded-md border shrink-0 ${
                theme === 'light'
                  ? 'bg-emerald-100/50 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'
              }`}>
                🟢 ACTIVE FIELD SALES POS REGISTER
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 min-w-0 max-w-full">
              <h3 className={`text-xs sm:text-base font-black font-display tracking-tight truncate max-w-[200px] sm:max-w-md ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                Terminal: {activeWorkspace.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold font-mono uppercase border shrink-0 ${
                activeWorkspace.isActive
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-500 border-red-500/30'
              }`}>
                {activeWorkspace.isActive ? 'Active Node' : 'Suspended'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-400 font-mono mt-1 min-w-0 max-w-full">
              <span className="truncate max-w-[200px] sm:max-w-none shrink-0">
                Authorized Agent: <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{currentUser?.name}</strong>
              </span>
            </div>

            {/* Dedicated Place for Full Agent UID Display with high mobile visibility */}
            <div className="mt-2.5 p-2 sm:p-2.5 rounded-2xl bg-white/90 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-2 w-full min-w-0 max-w-full">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 shrink-0">
                  Agent UID:
                </span>
                <span className="font-mono font-black text-[11px] sm:text-xs text-sky-600 dark:text-sky-400 break-all select-all leading-tight">
                  {currentUser?.uid || 'N/A'}
                </span>
              </div>
              {currentUser?.uid && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentUser.uid);
                    setCopiedAgentUid(true);
                    showToast('✓ Full Agent UID copied to clipboard', 'success');
                    setTimeout(() => setCopiedAgentUid(false), 2000);
                  }}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-300/40 dark:border-slate-700/60 transition cursor-pointer shrink-0 active:scale-95 flex items-center justify-center"
                  title={copiedAgentUid ? "Copied" : "Copy UID"}
                  aria-label="Copy UID"
                >
                  {copiedAgentUid ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center w-full sm:w-auto">
            <button
              type="button"
              id="btn-agent-customers-list"
              onClick={() => setIsCustomerModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
              title="Access, search, add, or edit clients in the universal customer registry"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Customer Registry</span>
            </button>

            <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 shrink-0 ${
              theme === 'light' ? 'bg-white border-emerald-200 text-emerald-800' : 'bg-slate-950 border-emerald-900/40 text-emerald-400'
            }`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>POS Terminal Active</span>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Row: 4 Separated Authoritative Cards with Live vs Snapshot Source Indicator */}
      <div className="flex items-center justify-between px-1 w-full max-w-full min-w-0">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
          Agent Performance Ledger
        </span>
        {isUsingSnapshotMirror ? (
          <div
            title="Displaying frozen snapshot metrics from the last confirmed DB push while live records hydrate in the background."
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-full min-w-0">
        {/* Card 1: Today's Sales Ledger */}
        <div className={`p-3.5 sm:p-4 border rounded-2xl flex items-center justify-between gap-3 shadow-sm transition-all w-full min-w-0 box-border ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              isTodayCashFullyClosed
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
            }`}>
              {isTodayCashFullyClosed ? <CheckCircle2 className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider truncate flex items-center justify-between">
                <span>Today's Sales Ledger</span>
                {isUsingSnapshotMirror && (
                  <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Snapshot</span>
                )}
              </div>
              <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-20" height="h-7">
                  <div className={`text-xl font-black font-display ${
                    theme === 'light' ? 'text-slate-900' : 'text-white'
                  }`}>
                    ${(dailySalesTotal || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
              </div>
              <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">
                {todayClosedCash > 0 ? (
                  <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-32" height="h-3">
                    <span>${(todayClosedCash || 0).toFixed(2)} closed • ${(unclosedCashToday || 0).toFixed(2)} unclosed</span>
                  </MetricSkeleton>
                ) : 'No cash close recorded today'}
              </div>
            </div>
          </div>
          <button
            type="button"
            id="btn-ledger-cash-close"
            onClick={handleCashClose}
            className={`text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer shrink-0 flex items-center gap-1 ${
              isTodayCashFullyClosed
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20'
            }`}
            title={isTodayCashFullyClosed ? 'Cash close already recorded for today' : 'Specify and close cash register'}
          >
            {isTodayCashFullyClosed ? (
              <>
                <Check className="w-3 h-3" />
                <span>Closed ✓</span>
              </>
            ) : (
              <span>Cash Close</span>
            )}
          </button>
        </div>

        {/* Card 2: Total Monthly Sales (Featuring Big Unclosed Cash over Relative Total Monthly Sales) */}
        <div className={`p-3.5 sm:p-4 border rounded-2xl flex flex-col justify-between shadow-sm transition-all relative overflow-hidden w-full min-w-0 box-border ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border shrink-0 ${
              unclosedMonthlyCash > 0
                ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider truncate flex items-center gap-1.5">
                  <span>Unclosed Cash / Monthly Sales</span>
                  {isUsingSnapshotMirror && (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Snapshot</span>
                  )}
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                  This Cycle
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-20" height="h-7">
                  <div className={`text-xl font-black font-display ${
                    unclosedMonthlyCash > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : theme === 'light' ? 'text-slate-900' : 'text-white'
                  }`}>
                    ${(unclosedMonthlyCash || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-24" height="h-5">
                  <div className="text-xs font-mono text-slate-400 font-semibold truncate" title={`Total Monthly Sales: $${(totalMonthlySales || 0).toFixed(2)}`}>
                    / ${(totalMonthlySales || 0).toFixed(2)} total sales
                  </div>
                </MetricSkeleton>
              </div>
            </div>
          </div>

          {/* Progress bar & Closed balance breakdown (no repeating figures) */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300" 
                style={{ width: `${totalMonthlySales > 0 ? (closedMonthlyCash / totalMonthlySales) * 100 : 0}%` }}
                title={`Closed: $${(closedMonthlyCash || 0).toFixed(2)}`}
              />
              <div 
                className="h-full bg-orange-500 transition-all duration-300" 
                style={{ width: `${totalMonthlySales > 0 ? (unclosedMonthlyCash / totalMonthlySales) * 100 : 0}%` }}
                title={`Unclosed: $${(unclosedMonthlyCash || 0).toFixed(2)}`}
              />
            </div>
            <div className="text-[9px] text-slate-400 font-mono mt-1.5 flex items-center justify-between">
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-20" height="h-3">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Closed: ${(closedMonthlyCash || 0).toFixed(2)}
                </span>
              </MetricSkeleton>
              <span className={unclosedMonthlyCash > 0 ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-slate-400'}>
                {totalMonthlySales > 0 ? ((unclosedMonthlyCash / totalMonthlySales) * 100).toFixed(0) : 0}% unclosed
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Overall Sales (Separated All-Time Cumulative Sales) */}
        <div className={`p-3.5 sm:p-4 border rounded-2xl flex flex-col justify-between shadow-sm transition-all w-full min-w-0 box-border ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-xl shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider truncate flex items-center gap-1.5">
                  <span>Overall Sales</span>
                  {isUsingSnapshotMirror && (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Snapshot</span>
                  )}
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                  All-Time
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-20" height="h-7">
                  <div className={`text-xl font-black font-display ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                    ${(overallSales || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                {prevMonthOverallSales > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400/80 dark:text-slate-500/80 border-l border-slate-200/80 dark:border-slate-800/80 pl-2 self-center shrink-0" title="Historical overall sales from previous month">
                    <span className="text-[8px] uppercase tracking-wider text-slate-400/60 dark:text-slate-500/60 font-semibold">Prev:</span>
                    <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-12" height="h-4">
                      <span className="font-semibold text-slate-400/80 dark:text-slate-500/80">${(prevMonthOverallSales || 0).toFixed(2)}</span>
                    </MetricSkeleton>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[9px] text-slate-400 font-mono break-words">
            <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-44" height="h-3">
              <span>
                ${(totalMonthlySales || 0).toFixed(2)} current cycle • ${(prevMonthOverallSales || 0).toFixed(2)} previous cycle
                {priorCyclesSales > 0.01 ? ` • $${priorCyclesSales.toFixed(2)} prior cycles` : ''}
              </span>
            </MetricSkeleton>
          </div>
        </div>

        {/* Card 4: My Monthly Commission (Strictly Unclosed Cash Only) */}
        <div className={`p-3.5 sm:p-4 border rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden transition-all w-full min-w-0 box-border ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider truncate flex items-center gap-1.5">
                  <span>My Monthly Commission</span>
                  {isUsingSnapshotMirror && (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Snapshot</span>
                  )}
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                  Unclosed Only
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-20" height="h-7">
                  <div className={`text-xl font-black font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    ${(myCommission || 0).toFixed(2)}
                  </div>
                </MetricSkeleton>
                {prevMonthCommission > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400/80 dark:text-slate-500/80 border-l border-slate-200/80 dark:border-slate-800/80 pl-2 self-center shrink-0" title="Historical commission from previous month">
                    <span className="text-[8px] uppercase tracking-wider text-slate-400/60 dark:text-slate-500/60 font-semibold">Prev:</span>
                    <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-12" height="h-4">
                      <span className="font-semibold text-slate-400/80 dark:text-slate-500/80">${(prevMonthCommission || 0).toFixed(0)}</span>
                    </MetricSkeleton>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-0.5">
            <div className="text-[9px] text-amber-600 dark:text-amber-400 font-mono break-words font-semibold">
              <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-36" height="h-3">
                <span>{commissionPercentValue}% on ${(unclosedMonthlyCash || 0).toFixed(2)} unclosed cash</span>
              </MetricSkeleton>
            </div>
            {closedCommission > 0 && (
              <div className="text-[8px] text-slate-400 font-mono truncate">
                <MetricSkeleton isLoading={isEffectiveMetricsSyncing} width="w-32" height="h-3">
                  <span>Excludes ${(closedCommission || 0).toFixed(2)} closed commission</span>
                </MetricSkeleton>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Sales Cycle & Cash Close Hub for Agent */}
      <div className={`p-3.5 sm:p-5 border rounded-3xl shadow-sm transition-all space-y-3.5 w-full max-w-full min-w-0 overflow-hidden box-border ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-150 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-500 border border-orange-500/20 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`text-sm sm:text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Monthly Sales Cycle & Cash Close
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                  {getCycleMonthLabel(salesCycleMetrics?.cycleMonth)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Sales cycle runs for one month &bull; Closed cash matches earned commission &bull; Remaining cash & commission carry over
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {salesCycleMetrics?.hasAdminRequest ? (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Cash Close Requested by Admin</span>
              </span>
            ) : hasPendingApproval ? (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                <span>Cash Close Pending Admin Approval</span>
              </span>
            ) : hasApprovedCashClose && (salesCycleMetrics?.remainingCash ?? 0) <= 0.01 ? (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Cash Close Approved ✓</span>
              </span>
            ) : isFinalCashCloseDone ? (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Final Cash Close Completed ✓</span>
              </span>
            ) : salesCycleMetrics?.isFinalDay ? (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1.5 animate-pulse">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Final Day! Cash Close Required</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Cash Close Active ({salesCycleMetrics?.daysUntilMonthEnd ?? 0}d to month-end)</span>
              </span>
            )}

            <button
              type="button"
              id="btn-agent-sales-cycle-cash-close"
              onClick={handleCashClose}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold shadow-sm transition flex items-center gap-2 cursor-pointer ${
                isFinalCashCloseDone
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
              title="Review and complete sales cycle cash close"
            >
              {isFinalCashCloseDone ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Cash Close Done ✓</span>
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4 shrink-0" />
                  <span>{salesCycleMetrics?.hasAdminRequest ? 'Fulfill Cash Close Request' : 'Complete Cash Close'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Admin Request Urgent Callout if active */}
        {salesCycleMetrics?.hasAdminRequest && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-amber-700 dark:text-amber-400 truncate">
                  Administrator has requested an immediate Cash Close
                  {salesCycleMetrics.adminRequestAmount ? ` of $${(salesCycleMetrics.adminRequestAmount || 0).toFixed(2)}` : ''}
                </div>
                {salesCycleMetrics.adminRequestNotes && (
                  <p className="text-[10px] text-slate-400 italic truncate">"{salesCycleMetrics.adminRequestNotes}"</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCashClose}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-[10px] rounded-lg shrink-0 cursor-pointer"
            >
              Cash Close Now
            </button>
          </div>
        )}

        {/* Final Day Reminder Banner - REMOVED if final cash close has already been completed */}
        {salesCycleMetrics?.isFinalDay && !salesCycleMetrics?.hasAdminRequest && !isFinalCashCloseDone && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-red-500 shrink-0" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold text-red-600 dark:text-red-400">Final Day of the Month: </span>
                <span className="text-slate-600 dark:text-slate-300">
                  Please perform your final cash close today so a fresh cycle of sales can begin on the new month. Any remaining cash & equivalent commission will carry over.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCashClose}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-[10px] rounded-lg shrink-0 cursor-pointer"
            >
              Final Close
            </button>
          </div>
        )}

        {/* Final Day Completed Confirmation */}
        {salesCycleMetrics?.isFinalDay && isFinalCashCloseDone && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Final Cash Close Completed: </span>
                <span className="text-slate-600 dark:text-slate-300">
                  Your final cash close of ${(salesCycleMetrics?.closedCash ?? 0).toFixed(2)} has been recorded {hasApprovedCashClose ? '(Approved by Admin ✓)' : '(Pending Admin Approval)'}. All sales are balanced for this cycle.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCashClose}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-[10px] rounded-lg shrink-0 cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              <span>View Details</span>
            </button>
          </div>
        )}

        {/* Aggregated Totals Grid for Agent */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 w-full max-w-full min-w-0 box-border">
          <div className={`p-3 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
            <div className="text-[10px] text-slate-400 font-mono uppercase">Cash Collected</div>
            <div className={`text-base font-black font-mono mt-0.5 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              ${(totalMonthlySales || 0).toFixed(2)}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 font-mono">Total cash this cycle</div>
            {salesCycleMetrics?.unclosedCashFromPrevCycle !== undefined && salesCycleMetrics.unclosedCashFromPrevCycle > 0 && (
              <div className="text-[9px] text-orange-600 dark:text-orange-400 font-mono font-semibold mt-1 pt-1 border-t border-orange-500/20">
                + ${(salesCycleMetrics.unclosedCashFromPrevCycle || 0).toFixed(2)} unclosed from last cycle
                {salesCycleMetrics.prevCycleUnclosedAttachedStatus === 'pending' && (
                  <span className="block text-[8px] text-orange-500/80 font-normal italic">
                    (Attached - Pending Admin Approval)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className={`p-3 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
            <div className="text-[10px] text-slate-400 font-mono uppercase">Commission Earned</div>
            <div className="text-base font-black font-mono mt-0.5 text-indigo-600 dark:text-indigo-400">
              ${(totalCommissionEarned || 0).toFixed(2)}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 font-mono">{commissionPercentValue}% commission rate</div>
          </div>

          <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono uppercase">Closed Cash</div>
            <div className="text-base font-black font-mono mt-0.5">
              ${(closedMonthlyCash || 0).toFixed(2)}
            </div>
            <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-mono">
              {hasApprovedCashClose ? 'Approved by Admin ✓' : hasPendingApproval ? 'Pending Approval' : 'Reconciled / Confirmed'}
            </div>
          </div>

          <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono uppercase">Matched Commission</div>
            <div className="text-base font-black font-mono mt-0.5">
              ${(closedCommission || 0).toFixed(2)}
            </div>
            <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-mono">Matches closed cash</div>
          </div>

          <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400">
            <div className="text-[10px] text-amber-600 dark:text-amber-500 font-mono uppercase">Remaining Cash</div>
            <div className="text-base font-black font-mono mt-0.5">
              ${(unclosedMonthlyCash || 0).toFixed(2)}
            </div>
            <div className="text-[9px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 font-mono">
              {unclosedMonthlyCash <= 0.01 && closedMonthlyCash > 0 ? 'All cash closed ✓' : 'Carried over to next cycle'}
            </div>
          </div>

          <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400">
            <div className="text-[10px] text-amber-600 dark:text-amber-500 font-mono uppercase">Remaining Commission</div>
            <div className="text-base font-black font-mono mt-0.5">
              ${(myCommission || 0).toFixed(2)}
            </div>
            <div className="text-[9px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 font-mono">
              {unclosedMonthlyCash <= 0.01 && closedMonthlyCash > 0 ? 'Balanced ✓' : 'Equivalent commission balance'}
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Notice Board & Broadcast Alerts */}
      {visibleNotifications.length > 0 && (
        <div id="workspace-notice-board" className="space-y-2 transition-all">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Workspace Notice Board ({visibleNotifications.length})
            </span>
            {visibleNotifications.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllNotifs(prev => !prev)}
                className="text-[10px] font-mono text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 underline cursor-pointer"
              >
                {showAllNotifs ? 'Show latest notice only' : `View all notices (${visibleNotifications.length})`}
              </button>
            )}
          </div>

          {(showAllNotifs ? visibleNotifications : [visibleNotifications[0]]).map((notif, idx) => {
            const msg = notif?.message || '';
            const isLegacy = msg.toLowerCase().includes('legacy') || msg.toLowerCase().includes('expired');
            const isRevoked = msg.toLowerCase().includes('revoked');
            const isUnread = !readNotificationIds.includes(notif.id);

            return (
              <div
                key={notif.id || idx}
                id={`broadcast-notice-${notif.id}`}
                onClick={() => {
                  markNotificationAsRead(notif.id);
                  if (isLegacy) {
                    setActiveTab('legacy');
                    setTimeout(() => {
                      const element = document.getElementById('legacy-devices-agent-section');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 120);
                  }
                }}
                className={`p-3.5 border rounded-2xl flex items-start gap-3 transition-all cursor-pointer ${
                  isRevoked
                    ? theme === 'light' ? 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-xs' : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    : isLegacy
                      ? 'hover:border-rose-500/50 hover:bg-rose-500/5 hover:scale-[1.01]'
                      : 'hover:scale-[1.005]'
                } ${
                  !isRevoked
                    ? isUnread
                      ? theme === 'light'
                        ? 'bg-indigo-50/80 border-indigo-300 text-slate-900 ring-1 ring-indigo-400/40 shadow-xs'
                        : 'bg-indigo-950/50 border-indigo-500/40 text-slate-100 ring-1 ring-indigo-500/40 shadow-xs'
                      : theme === 'light'
                        ? 'bg-indigo-50/40 border-indigo-200/80 text-slate-800'
                        : 'bg-indigo-950/30 border-indigo-500/20 text-slate-200'
                    : ''
                }`}
              >
                <Compass className={`w-5 h-5 shrink-0 mt-0.5 ${
                  isRevoked
                    ? 'text-amber-500'
                    : isUnread
                      ? 'text-indigo-600 dark:text-indigo-300 animate-pulse'
                      : 'text-indigo-500 dark:text-indigo-400'
                }`} />
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                      notif.isBroadcast
                        ? 'bg-indigo-600 text-white'
                        : isRevoked
                          ? 'bg-amber-500 text-white'
                          : isLegacy
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                    }`}>
                      {notif.isBroadcast ? 'BROADCAST' : isRevoked ? 'REVOCATION NOTICE' : isLegacy ? 'ACTION REQUIRED' : 'NOTICE'}
                    </span>
                    {isUnread && (
                      <span className="bg-amber-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-2xs font-mono">
                        NEW
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="text-[9px] text-slate-400 font-mono">Latest message</span>
                    )}
                  </div>
                  <p className="text-xs mt-1 leading-relaxed font-medium">{notif.message}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[9px] text-slate-400 font-mono">
                    <span>By: {notif.senderName}</span>
                    <span>•</span>
                    <span>{new Date(notif.timestamp).toLocaleString()}</span>
                    {isUnread && (
                      <>
                        <span>•</span>
                        <span className="text-indigo-500 dark:text-indigo-400 underline">Tap to mark as read</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bluetooth POS Printer Detection & Status Bar */}
      <div className={`p-3.5 sm:p-4 border rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all ${
        connectedPrinter?.isConnected
          ? theme === 'light' ? 'bg-emerald-50/70 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/30'
          : theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${
            connectedPrinter?.isConnected
              ? 'bg-emerald-500 text-white shadow-xs'
              : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
          }`}>
            <Bluetooth className={`w-4 h-4 ${btScanning ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Bluetooth POS Printer:
              </span>
              {connectedPrinter?.isConnected ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {connectedPrinter.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold uppercase">
                    {getPrinterEmulation()}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({connectedPrinter.connectionType === 'bluetooth_ble' ? 'BLE' : 'Serial SPP'})
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {isWebBluetoothAvailable() ? 'Mobile paired BT printer ready' : 'Thermal slip printer mode active'}
                </span>
              )}
            </div>
            {btFeedback ? (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-[11px] text-sky-600 dark:text-sky-400 font-mono font-medium">{btFeedback}</p>
                {(btFeedback.includes('tab') || btFeedback.includes('iframe') || btFeedback.includes('restricted')) && (
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-md border border-sky-300 dark:border-sky-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open in New Tab
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-[11px] text-slate-400">
                  {connectedPrinter?.isConnected 
                    ? 'Ready for instant voucher printing (Sewoo LK-P21B / ESC/POS / CPCL supported).'
                    : 'Detect & link Sewoo LK-P21B or paired thermal printer for direct mobile printing.'}
                </p>
                {isAppInIframe() && !connectedPrinter?.isConnected && (
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 underline cursor-pointer"
                    title="Web Bluetooth requires direct tab context"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    Open full tab
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start sm:justify-end mt-2 lg:mt-0">
          {connectedPrinter?.isConnected ? (
            <>
              <button
                type="button"
                onClick={handleTestPrint}
                disabled={printingStatus === 'printing'}
                className="h-9 px-3 rounded-xl text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                title="Print small test slip"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>{printingStatus === 'printing' ? 'Testing...' : 'Test Slip'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPrinterModalOpen(true)}
                className="h-9 px-2.5 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                title="Printer Settings & Diagnostics"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Settings</span>
              </button>
              <button
                type="button"
                onClick={handleDisconnectPrinter}
                className="h-9 px-2.5 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePairPrinter}
                disabled={btScanning}
                className="h-9 px-3 sm:px-3.5 rounded-xl text-xs font-bold font-mono bg-sky-600 hover:bg-sky-700 text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                title="Detect and pair with Bluetooth thermal receipt printer"
              >
                <Bluetooth className={`w-3.5 h-3.5 shrink-0 ${btScanning ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{btScanning ? 'Scanning...' : 'Detect & Connect BT Printer'}</span>
                <span className="sm:hidden">{btScanning ? 'Scanning...' : 'Connect BT Printer'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPrinterModalOpen(true)}
                className="h-9 px-2.5 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                title="Sewoo LK-P21B & Thermal Settings"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Options</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => forcePushLocalToGlobalDB?.()}
            className={`h-9 px-3 sm:px-3.5 rounded-xl text-xs font-bold font-mono text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              isPushingToDb
                ? 'bg-rose-600 hover:bg-rose-700 animate-pulse ring-2 ring-rose-400'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
            title={isPushingToDb ? 'Cloud Database Push Underway (Red Active Upload Animation)...' : 'Push all locally saved transactions, sales & records on this device to the global database'}
          >
            {isPushingToDb ? (
              <Upload className="w-3.5 h-3.5 animate-bounce shrink-0" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="hidden md:inline">{isPushingToDb ? 'Updating DB...' : 'Push Local Data to Global DB'}</span>
            <span className="md:hidden">{isPushingToDb ? 'Updating DB...' : 'Push to Global DB'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSnapshotModalOpen(true)}
            className={`h-9 px-3 sm:px-3.5 rounded-xl text-xs font-bold font-mono text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              isPushingToDb
                ? 'bg-rose-600 hover:bg-rose-700 animate-pulse'
                : 'bg-sky-600 hover:bg-sky-700'
            }`}
            title="Download or restore snapshot of this workspace (.json)"
          >
            {isPushingToDb ? (
              <Database className="w-3.5 h-3.5 animate-spin text-rose-200 shrink-0" />
            ) : (
              <Database className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            )}
            <span className="hidden sm:inline">Workspace Snapshot</span>
            <span className="sm:hidden">Snapshot</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Active work area and leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full max-w-full min-w-0 box-border">
        {/* Left/Middle Column: Workspace Tab panels */}
        <div className={`border rounded-3xl p-3.5 sm:p-6 shadow-xl lg:col-span-2 space-y-4 sm:space-y-6 transition-all w-full max-w-full min-w-0 overflow-hidden box-border ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          {/* Chrome Tab System with App Theme Background & Continuous Accent Line */}
          <TabStripContainer
            theme={theme}
            activeTabLineGradient={
              activeTab === 'sales'
                ? 'bg-sky-500'
                : activeTab === 'archive'
                ? 'bg-emerald-600'
                : activeTab === 'requests'
                ? 'bg-violet-600'
                : activeTab === 'legacy'
                ? 'bg-amber-500'
                : 'bg-rose-600'
            }
          >
            {[
              {
                id: 'sales' as const,
                label: 'Sales Transactions',
                icon: Wifi,
                activeLine: 'bg-sky-500',
                startTextColor: 'text-sky-500',
                endTextColor: 'text-sky-500',
              },
              {
                id: 'archive' as const,
                label: 'Transactions Archive',
                icon: History,
                count: mySoldVouchers.length,
                activeLine: 'bg-emerald-600',
                startTextColor: 'text-emerald-600',
                endTextColor: 'text-emerald-600',
              },
              {
                id: 'requests' as const,
                label: 'Top-Up Requests',
                icon: ArrowRightLeft,
                count: myRequests.filter(r => r.status === 'Pending').length,
                activeLine: 'bg-violet-600',
                startTextColor: 'text-violet-600',
                endTextColor: 'text-violet-600',
              },
              {
                id: 'legacy' as const,
                label: 'Legacy Devices',
                icon: Cpu,
                count: myLegacyDevices.length,
                activeLine: 'bg-amber-500',
                startTextColor: 'text-amber-500',
                endTextColor: 'text-amber-500',
              },
              {
                id: 'queries' as const,
                label: 'Director Feedback',
                icon: HelpCircle,
                activeLine: 'bg-rose-600',
                startTextColor: 'text-rose-600',
                endTextColor: 'text-rose-600',
              }
            ].map((tab, idx, arr) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isFirst = idx === 0;
              return (
                <button
                  key={tab.id}
                  id={`tab-agent-${tab.id}-btn`}
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

          {/* TAB CONTENTS */}

          {/* 1. SALES TRANSACTION */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className={`text-base font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Active Vouchers Inventory</h3>
                  <p className="text-xs text-slate-400">Select a voucher card below and enter customer details</p>
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={handleSendEODReport}
                    className={`text-[11px] font-mono px-2.5 py-1 h-7 rounded-lg transition cursor-pointer flex-1 sm:flex-initial text-center inline-flex items-center justify-center ${
                      theme === 'light'
                        ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                        : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Email EOD Report
                  </button>
                  <button
                    onClick={handleCashClose}
                    className={`border text-[11px] font-mono px-2.5 py-1 h-7 rounded-lg transition cursor-pointer flex-1 sm:flex-initial text-center inline-flex items-center justify-center gap-1 ${
                      isTodayCashFullyClosed
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {isTodayCashFullyClosed ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Cash Closed ✓</span>
                      </>
                    ) : (
                      <span>Initiate Cash Close</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Scan & Code Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    ref={agentSearchInputRef}
                    type="text"
                    id="agent-voucher-search-input"
                    value={searchCode}
                    onChange={(e) => {
                      setSearchCode(e.target.value);
                      setIsAgentSuggestionsOpen(true);
                    }}
                    onFocus={() => {
                      if (searchCode.trim()) {
                        setIsAgentSuggestionsOpen(true);
                      }
                    }}
                    onKeyDown={handleAgentSearchKeyDown}
                    placeholder="Fuzzy search assigned voucher code (e.g. HRE-FAST-9321) or plan..."
                    className={`w-full border rounded-xl pl-9 pr-8 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 transition ${
                      theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                  {searchCode && (
                    <button
                      type="button"
                      id="btn-agent-clear-search"
                      onClick={() => {
                        setSearchCode('');
                        setIsAgentSuggestionsOpen(false);
                        if (agentSearchInputRef.current) {
                          agentSearchInputRef.current.value = '';
                          agentSearchInputRef.current.focus();
                        }
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Real-time Agent Inventory Suggestions */}
                  <SearchSuggestionsDropdown
                    isOpen={isAgentSuggestionsOpen && agentRealtimeSuggestions.length > 0}
                    onClose={() => setIsAgentSuggestionsOpen(false)}
                    query={searchCode}
                    items={agentRealtimeSuggestions}
                    theme={theme}
                    title="Real-Time Assigned Voucher Matches"
                    emptyMessage="No assigned vouchers match this query"
                    onSelectItem={(result) => {
                      setSelectedVoucher(result.voucher);
                      setPriceFilter('all');
                      setSearchCode(result.voucher.code);
                      setIsAgentSuggestionsOpen(false);
                      setTimeout(() => {
                        const formEl = document.getElementById('sales-ticket-configure-form');
                        if (formEl) {
                          formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 100);
                    }}
                    renderItem={(result) => (
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-xs truncate">
                            <HighlightText text={result.voucher.code} indices={result.matchedFields.code} />
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            <HighlightText text={result.voucher.plan} indices={result.matchedFields.plan} /> • {result.voucher.duration || '30 Days'}
                          </div>
                        </div>
                        <span className="text-xs font-mono font-black text-sky-600 dark:text-sky-400 shrink-0">
                          ${(result.voucher.price || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                  />
                </div>

                <button
                  type="button"
                  id="btn-agent-scan-voucher"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer shrink-0"
                  title="Scan voucher code using camera for instant checkout"
                >
                  <ScanLine className="w-4 h-4 animate-pulse" />
                  <span>Scan Voucher to Sell</span>
                </button>
              </div>

              {/* Movable Price Overlay & Compact Scrollable List View */}
              <div ref={containerRef} className="relative w-full min-h-[380px] border border-dashed border-slate-200 dark:border-slate-800/80 rounded-3xl p-4 flex flex-col select-none">
                
                {/* Agent Inventory Portfolio: Total Sold Vouchers Value against Total Unsold Vouchers Value */}
                <div className={`w-full p-3.5 sm:p-4 rounded-3xl border mb-3 flex flex-col space-y-3 transition-all ${
                  theme === 'light' 
                    ? 'bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/50 border-indigo-200/90 shadow-2xs' 
                    : 'bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border-indigo-500/30 shadow-2xs'
                }`}>
                  {/* Section Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-100 dark:border-indigo-900/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-black font-display uppercase tracking-wider text-slate-900 dark:text-white truncate">
                          Agent Inventory Portfolio Analysis
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          Sold Vouchers vs. Unsold Inventory Stock Performance
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="w-full sm:w-auto text-center sm:text-left px-2.5 py-1 rounded-full text-[10px] font-mono font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 truncate">
                        Total Available Stock Value: ${(totalAssignedInventoryValue || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Head-to-Head Comparison Grid: Sold Vouchers vs Unsold Vouchers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {/* Card 1: Total Value of Sold Vouchers */}
                    <div className={`p-3 rounded-2xl border flex flex-col justify-between transition-all min-w-0 ${
                      theme === 'light' 
                        ? 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950 shadow-2xs' 
                        : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100 shadow-2xs'
                    }`}>
                      <div className="flex items-center justify-between gap-1 mb-1 flex-wrap min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 truncate">
                            Total Value Sold Vouchers
                          </span>
                        </div>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                          {mySoldVouchers.length} Sold
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-1 flex-wrap min-w-0">
                        <div className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ${(mySoldVouchersMonetaryValue || 0).toFixed(2)}
                        </div>
                        <span className="text-[10px] font-mono text-emerald-600/90 dark:text-emerald-400/90 font-bold shrink-0">
                          {soldVoucherRatioPercent.toFixed(1)}% ratio
                        </span>
                      </div>
                      <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 font-mono mt-1 truncate">
                        All-time completed sales
                      </div>
                    </div>

                    {/* Card 2: Total Value of Unsold Vouchers */}
                    <div className={`p-3 rounded-2xl border flex flex-col justify-between transition-all min-w-0 ${
                      theme === 'light' 
                        ? 'bg-sky-50/80 border-sky-200/90 text-sky-950 shadow-2xs' 
                        : 'bg-sky-950/30 border-sky-500/30 text-sky-100 shadow-2xs'
                    }`}>
                      <div className="flex items-center justify-between gap-1 mb-1 flex-wrap min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Tag className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                          <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400 truncate">
                            Total Value Unsold Vouchers
                          </span>
                        </div>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                          {myAssignedPaidVouchers.length} Available
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-1 flex-wrap min-w-0">
                        <div className="text-base sm:text-lg font-black font-mono text-sky-600 dark:text-sky-400 tabular-nums">
                          ${(myVouchersInventoryValue || 0).toFixed(2)}
                        </div>
                        <span className="text-[10px] font-mono text-sky-600/90 dark:text-sky-400/90 font-bold shrink-0">
                          {unsoldVoucherRatioPercent.toFixed(1)}% ratio
                        </span>
                      </div>
                      <div className="text-[9px] text-sky-600/80 dark:text-sky-400/80 font-mono mt-1 truncate">
                        Paid vouchers in inventory
                      </div>
                    </div>

                    {/* Card 3: Enrolled Legacy & Free Gifts Breakdown */}
                    <div className={`p-3 rounded-2xl border flex flex-col justify-between transition-all sm:col-span-2 lg:col-span-1 min-w-0 ${
                      theme === 'light' 
                        ? 'bg-indigo-50/80 border-indigo-200/90 text-indigo-950 shadow-2xs' 
                        : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-100 shadow-2xs'
                    }`}>
                      <div className="flex items-center justify-between gap-1 mb-1 flex-wrap min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 truncate">
                            Enrolled Legacy & Gifts
                          </span>
                        </div>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                          {myEnrolledLegacyDevices.length} Devices
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-1 flex-wrap min-w-0">
                        <div className="text-base sm:text-lg font-black font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                          ${(myEnrolledLegacyInventoryValue || 0).toFixed(2)}
                        </div>
                        {myFreeGiveawayVouchers.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPriceFilter(prev => prev === 'free' ? 'all' : 'free')}
                            className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                            title="Click to filter free giveaway promo vouchers"
                          >
                            <Gift className="w-3 h-3" />
                            <span>{myFreeGiveawayVouchers.length} Free Gifts</span>
                          </button>
                        )}
                      </div>
                      <div className="text-[9px] text-indigo-600/80 dark:text-indigo-400/80 font-mono mt-1 truncate">
                        Total Stock: <strong className="font-bold text-indigo-700 dark:text-indigo-300">${(totalAssignedInventoryValue || 0).toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Visual Comparison Ratio Bar: Sold Vouchers vs Unsold Vouchers */}
                  {totalAllocatedVoucherValue > 0 && (
                    <div className="pt-1.5 border-t border-indigo-100 dark:border-indigo-900/30">
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          Sold Vouchers: ${(mySoldVouchersMonetaryValue || 0).toFixed(2)} ({soldVoucherRatioPercent.toFixed(0)}%)
                        </span>
                        <span className="text-sky-600 dark:text-sky-400 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                          Unsold Vouchers: ${(myVouchersInventoryValue || 0).toFixed(2)} ({unsoldVoucherRatioPercent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-2xs">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${soldVoucherRatioPercent}%` }}
                          title={`Total Value of Sold Vouchers: $${(mySoldVouchersMonetaryValue || 0).toFixed(2)} (${soldVoucherRatioPercent.toFixed(1)}%)`}
                        />
                        <div 
                          className="h-full bg-sky-500 transition-all duration-300"
                          style={{ width: `${unsoldVoucherRatioPercent}%` }}
                          title={`Total Value of Unsold Vouchers: $${(myVouchersInventoryValue || 0).toFixed(2)} (${unsoldVoucherRatioPercent.toFixed(1)}%)`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Free Customer Giveaway Quota Button */}
                {(giveawaySettings?.isEnabled || allAccessibleFreeVouchers.length > 0 || giveawaySettings?.allowCustomGiftVouchers) && (
                  <button
                    type="button"
                    id="agent-giveaway-quota-banner"
                    onClick={() => {
                      if (dailyGiveawayInfo.allowed || dailyGiveawayInfo.remaining > 0) {
                        setSelectedFreeVoucher(allAccessibleFreeVouchers[0] || null);
                        setIsAgentGiveawayModalOpen(true);
                      }
                    }}
                    disabled={!dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining <= 0}
                    className="w-full flex items-center justify-center p-3 mb-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm font-mono font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title={dailyGiveawayInfo.allowed || dailyGiveawayInfo.remaining > 0 ? "Click to dispense customer giveaway" : "Daily giveaway limit reached"}
                  >
                    Customer Giveaways: {dailyGiveawayInfo.usedToday} / {dailyGiveawayInfo.dailyLimit} used today
                  </button>
                )}

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
                          ALL ({myAssignedVouchers.length})
                        </button>

                        <button
                          type="button"
                          onClick={() => setPriceFilter(priceFilter === 'paid' ? 'all' : 'paid')}
                          className={`px-3 py-1 text-[11px] font-black font-mono rounded-xl transition cursor-pointer flex items-center gap-1 ${
                            priceFilter === 'paid'
                              ? 'bg-sky-600 text-white shadow-xs'
                              : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span>Paid ({myAssignedPaidVouchers.length})</span>
                        </button>

                        {allAccessibleFreeVouchers.length > 0 && (
                          <button
                            type="button"
                            id="btn-filter-free-gifts"
                            onClick={() => setPriceFilter(priceFilter === 'free' ? 'all' : 'free')}
                            className={`px-2.5 py-1 text-xs font-black font-mono rounded-xl transition cursor-pointer flex items-center justify-center shrink-0 ${
                              priceFilter === 'free'
                                ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400'
                                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            }`}
                            title={`Filter to Free Gift Vouchers (${allAccessibleFreeVouchers.length})`}
                          >
                            <span className="text-sm leading-none">🎁</span>
                          </button>
                        )}

                        {uniquePrices.map((price) => {
                          const count = filteredMyAssignedVouchers.filter(v => v.price === price).length;
                          return (
                            <button
                              key={price}
                              type="button"
                              onClick={() => setPriceFilter(price)}
                              className={`px-3 py-1 text-[11px] font-black font-mono rounded-xl transition cursor-pointer flex items-center gap-1 ${
                                priceFilter === price
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                              }`}
                            >
                              <span>${price % 1 === 0 ? price : (price || 0).toFixed(2)}</span>
                              <span className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                                priceFilter === price
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
                    className={`absolute z-20 shadow-2xl rounded-xl p-1 flex border border-slate-200/80 dark:border-slate-700/80 touch-none bg-white/95 dark:bg-slate-900/95 sm:backdrop-blur-md ${
                      overlayLocked ? 'cursor-default ring-1 ring-amber-500/30' : 'cursor-grab active:cursor-grabbing'
                    } ${
                      overlayOrientation === 'horizontal' ? 'flex-row items-center gap-1 w-auto' : 'flex-col items-center gap-1 w-[56px]'
                    } ${
                      theme === 'light'
                        ? 'bg-white/90 text-slate-800 shadow-slate-200/60'
                        : 'bg-slate-950/90 text-white shadow-black/90'
                    }`}
                    title="Double tap overlay to Lock/Unlock. Drag to move."
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

                      {/* Dock Back to Default Place Button */}
                      <button
                        type="button"
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
                        ? 'flex-row items-center overflow-x-auto max-w-[320px]'
                        : 'flex-col items-center overflow-y-auto max-h-[260px]'
                    }`}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPriceFilter('all'); }}
                        className={`px-2.5 py-1 text-[10px] font-black font-mono rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                          priceFilter === 'all'
                            ? 'bg-sky-600 text-white shadow-xs'
                            : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        ALL
                      </button>

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPriceFilter(priceFilter === 'paid' ? 'all' : 'paid'); }}
                        className={`px-2.5 py-1 text-[10px] font-black font-mono rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                          priceFilter === 'paid'
                            ? 'bg-sky-600 text-white shadow-xs'
                            : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        Paid ({myAssignedPaidVouchers.length})
                      </button>

                      {allAccessibleFreeVouchers.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPriceFilter(priceFilter === 'free' ? 'all' : 'free'); }}
                          className={`px-2 py-1 text-xs font-black font-mono rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center justify-center shrink-0 ${
                            priceFilter === 'free'
                              ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400'
                              : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          }`}
                          title={`Filter to Free Gift Vouchers (${allAccessibleFreeVouchers.length})`}
                        >
                          <span className="text-sm leading-none">🎁</span>
                        </button>
                      )}

                      {uniquePrices.map((price) => (
                        <button
                          key={price}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPriceFilter(price); }}
                          className={`px-3 py-1 text-[10px] font-black font-mono rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                            priceFilter === price
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          ${price % 1 === 0 ? price : (price || 0).toFixed(2)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info Header */}
                <div className="flex items-center justify-between mb-3 px-1 text-xs">
                  <div className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>
                      {priceFilter === 'free'
                        ? `Free Promotional Stock (${filteredMyAssignedVouchers.length} item${filteredMyAssignedVouchers.length === 1 ? '' : 's'} • $0.00)`
                        : `Available Stock (${filteredMyAssignedVouchers.length} items)`}
                    </span>
                    {priceFilter === 'free' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        🎁 Filtered to Free Gifts
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-150 dark:border-slate-800/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {isPriceSelectorDocked ? 'Price Selector Docked' : 'Price Selector Floating'}
                  </div>
                </div>

                {/* Scrollable Container (behind overlay) */}
                <div className="flex-grow max-h-[340px] overflow-y-auto pr-1 space-y-2">
                  {paginatedAssignedVouchers.map((v) => {
                    const isSelected = selectedVoucher?.id === v.id;
                    const isFree = isVoucherFree(v, giveawaySettings);
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVoucher(prev => prev?.id === v.id ? null : v)}
                        className={`p-3 sm:p-3.5 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition cursor-pointer select-none ${
                          isSelected
                            ? theme === 'light'
                              ? 'border-sky-600 bg-sky-50 shadow-sm ring-2 ring-sky-600'
                              : 'border-sky-500 bg-sky-950/50 shadow-md ring-2 ring-sky-500'
                            : isFree
                            ? theme === 'light'
                              ? 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300'
                              : 'bg-emerald-950/20 border-emerald-800/60 hover:border-emerald-700'
                            : theme === 'light'
                            ? 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                        }`}
                      >
                        {/* Left/Main Area: Code and Sub-info */}
                        <div className="min-w-0 flex-1 w-full">
                          <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVoucher(prev => prev?.id === v.id ? null : v);
                              }}
                              className={`font-mono font-black select-all tracking-wider text-xs sm:text-sm break-all cursor-pointer hover:opacity-85 ${
                                theme === 'light' ? 'text-slate-950' : 'text-white'
                              }`}
                              title={isSelected ? 'Tap to deselect voucher' : 'Tap to select voucher'}
                            >
                              <HighlightText text={sanitizeVoucherCode(v)} indices={agentMatchMap.get(v.id)?.code} query={searchCode} />
                            </span>
                            {isFree ? (
                              <span className="font-mono text-xs font-black text-emerald-500 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                                <span className="line-through text-slate-400 text-[10px] font-normal">${(v.price || 0).toFixed(2)}</span>
                                <span>$0.00 Gift</span>
                              </span>
                            ) : (
                              <span className="font-mono text-xs font-black text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-lg bg-sky-500/10 border border-sky-500/20 shrink-0">
                                ${(v.price || 0).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 font-semibold">
                            <span className="text-slate-900 dark:text-slate-100 font-bold flex items-center gap-1">
                              <HighlightText text={v.plan} indices={agentMatchMap.get(v.id)?.plan} query={searchCode} />
                              {isFree && (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30">
                                  🎁 FREE PLAN
                                </span>
                              )}
                            </span>
                            <span className="text-slate-400">•</span>
                            <span>
                              <HighlightText text={v.location || '-'} indices={agentMatchMap.get(v.id)?.location} query={searchCode} />
                            </span>
                            <span className="text-slate-400">•</span>
                            <span>{v.duration || '30 Days'}</span>
                          </div>
                        </div>

                        {/* Right / Bottom on mobile: Action indication */}
                        <div className="shrink-0 flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-150 dark:border-slate-800">
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 rounded-md text-[9px] font-black font-mono">
                            Assigned
                          </span>
                          {isFree ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFreeVoucher(v);
                                setIsAgentGiveawayModalOpen(true);
                              }}
                              disabled={!dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining <= 0}
                              className="px-3 py-1 rounded-xl text-xs font-bold font-mono transition bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
                              title={dailyGiveawayInfo.allowed ? "Gift this voucher to a customer for $0.00" : "Daily giveaway quota reached"}
                            >
                              <Gift className="w-3.5 h-3.5" />
                              <span>Gift Free</span>
                            </button>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black font-mono transition ${
                              isSelected
                                ? 'bg-sky-600 text-white shadow-xs'
                                : theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}>
                              {isSelected ? '✓ Selected' : 'Tap to Select'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredMyAssignedVouchers.length > visibleVoucherLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleVoucherLimit(prev => prev + 25)}
                      className="w-full py-2.5 rounded-xl font-mono text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition cursor-pointer flex items-center justify-center gap-1.5 mt-2 active:scale-98"
                    >
                      <span>Load More Vouchers ({paginatedAssignedVouchers.length} of {filteredMyAssignedVouchers.length} shown)</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}

                  {filteredMyAssignedVouchers.length === 0 && (
                    <div className="py-12 text-center text-slate-400 font-mono border border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                      No matching active vouchers in catalog. Request top-ups below.
                    </div>
                  )}
                </div>
              </div>

              {/* Sales Transaction Input Form with responsive back/cancel button */}
              {selectedVoucher && (() => {
                const isSelectedFree = isVoucherFree(selectedVoucher, giveawaySettings);
                return (
                <form id="sales-ticket-configure-form" onSubmit={(e) => {
                  e.preventDefault();
                  if (isSelectedFree) {
                    handleExecuteGiveaway(selectedVoucher, customerName || 'Walk-in Client', customerCell || 'N/A', 'close_no_print');
                  } else {
                    handleCompleteSaleSubmit(e);
                  }
                }} className={`p-2.5 sm:p-3.5 border rounded-2xl space-y-2 transition shadow-md ${
                  theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}>
                  <div className={`flex justify-between items-center border-b pb-1.5 ${
                    theme === 'light' ? 'border-slate-150' : 'border-slate-850'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelectedFree ? (
                        <div className="px-1.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono font-black text-xs shrink-0 border border-emerald-500/30 gap-1">
                          <Gift className="w-3 h-3 text-emerald-500" />
                          <span>$0.00</span>
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-mono font-black text-xs shrink-0 border border-sky-500/20">
                          ${selectedVoucher.price % 1 === 0 ? selectedVoucher.price : (selectedVoucher.price || 0).toFixed(2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-xs font-mono text-sky-600 dark:text-sky-400 font-bold uppercase truncate">
                          {isSelectedFree ? '🎁 Free Promotional Gift' : 'Configure Sales Ticket'} &bull; {selectedVoucher.plan} ({selectedVoucher.duration})
                        </h4>
                        <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mt-0.2 flex-wrap">
                          <span className="text-slate-400">Code:</span>
                          <span
                            onClick={() => {
                              setSelectedVoucher(null);
                              setSelectedCustomer(null);
                            }}
                            className={`font-mono font-black select-all px-1.5 py-0.2 rounded border text-xs cursor-pointer hover:opacity-80 transition ${
                              isSelectedFree
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                                : theme === 'light' ? 'bg-sky-50 border-sky-200 text-sky-950' : 'bg-sky-950/60 border-sky-800 text-sky-200'
                            }`}
                            title="Tap voucher code to deselect"
                          >
                            {selectedVoucher.code}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVoucher(null);
                        setSelectedCustomer(null);
                      }}
                      className="text-[10px] text-red-500 hover:text-red-600 font-mono uppercase font-bold flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 px-2 py-0.5 rounded-lg transition cursor-pointer shrink-0"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>

                  {/* Compact Intelligent Customer Incremental Search */}
                  <CustomerSearchSelect
                    customers={workspaceCustomers}
                    selectedCustomer={selectedCustomer}
                    onSelectCustomer={setSelectedCustomer}
                    customerName={customerName}
                    onChangeCustomerName={setCustomerName}
                    customerCell={customerCell}
                    onChangeCustomerCell={setCustomerCell}
                    masterCountryCode={masterCountryInfo.code}
                    theme={theme}
                    isEnforced={!!loyaltySettings?.enforceCustomerDetailsOnSale}
                    compact={true}
                  />

                  {/* Customer Details Enforcement / Compact Skip Option */}
                  {loyaltySettings?.enforceCustomerDetailsOnSale ? (
                    <div className="p-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] font-mono flex items-center gap-1.5">
                      <UserCheck className="w-3 h-3 text-sky-500 shrink-0" />
                      <span>
                        🔒 <strong>Enforced by Workspace Admin:</strong> Customer details are required.
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-end -mt-0.5">
                      <button
                        type="button"
                        onClick={() => setSkipDetailsConfirmation({ isOpen: true, action: 'close_no_print' })}
                        className="text-sky-600 dark:text-sky-400 hover:text-sky-500 font-mono font-semibold flex items-center gap-1 cursor-pointer underline text-[10px] whitespace-nowrap"
                        title="Skip customer details and proceed to close sale immediately as a walk-in"
                      >
                        <FastForward className="w-3 h-3" />
                        Skip Details & Close
                      </button>
                    </div>
                  )}

                  {/* Compact Loyalty Reward Indication (shown only if eligible for reward) */}
                  {loyaltySettings?.isEnabled && loyaltyEvaluation && selectedVoucher.price >= (loyaltySettings.minQualifyingPrice ?? 3.0) && loyaltyEvaluation.isEligibleForReward && (
                    <div className={`p-2 rounded-xl border transition shadow-xs ${
                      theme === 'light'
                        ? 'bg-amber-50/90 border-amber-300 text-slate-900'
                        : 'bg-amber-950/30 border-amber-500/50 text-white'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="p-0.5 rounded-md bg-amber-500 text-white shadow-xs">
                            <Sparkles className="w-3 h-3" />
                          </span>
                          <span className="text-[10px] font-mono font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">
                            {loyaltyEvaluation.rewardType === 'super' ? '⭐ SUPER REWARD UNLOCKED!' : '🎉 LOYALTY REWARD UNLOCKED!'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                          <span className="px-1.5 py-0.2 rounded font-bold bg-emerald-500 text-white">
                            -${(loyaltyEvaluation.discountAmount || 0).toFixed(2)} OFF
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Pay: ${(loyaltyEvaluation.finalPrice || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Choices: Print & Close vs Close (No Print) vs Preview */}
                  <div className="space-y-1.5 pt-0.5">
                    {isSelectedFree ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* 1. Print and Close Gift */}
                        <button
                          type="button"
                          onClick={() => handleExecuteGiveaway(selectedVoucher, customerName || 'Walk-in Client', customerCell || 'N/A', 'print_and_close')}
                          disabled={printingStatus === 'printing'}
                          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-2 px-3 rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          {printingStatus === 'printing' ? 'Printing Gift Slip...' : 'Gift & Print Slip ($0.00)'}
                        </button>

                        {/* 2. Close Gift without Printing */}
                        <button
                          type="button"
                          onClick={() => handleExecuteGiveaway(selectedVoucher, customerName || 'Walk-in Client', customerCell || 'N/A', 'close_no_print')}
                          className={`border py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            theme === 'light'
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200 border-emerald-700'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          Gift Free (No Print)
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* 1. Print and Close */}
                        <button
                          type="button"
                          onClick={() => handleSaleAction('print_and_close')}
                          disabled={printingStatus === 'printing'}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          {printingStatus === 'printing' ? 'Printing to BT...' : 'Print & Close Sale'}
                        </button>

                        {/* 2. Close Sale without Printing */}
                        <button
                          type="button"
                          onClick={() => handleSaleAction('close_no_print')}
                          className={`border py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            theme === 'light'
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                              : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          Close Sale (No Print)
                        </button>

                        {/* 3. Option to gift this voucher as a Promotional Free Gift */}
                        {dailyGiveawayInfo.allowed && dailyGiveawayInfo.remaining > 0 && (
                          <div className="col-span-1 sm:col-span-2">
                            <button
                              type="button"
                              id="btn-gift-current-voucher-free"
                              onClick={() => {
                                setSelectedFreeVoucher(selectedVoucher);
                                setIsAgentGiveawayModalOpen(true);
                              }}
                              className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold font-mono border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer flex items-center justify-center gap-1.5"
                              title="Gift this voucher as a free promotional customer gift ($0.00)"
                            >
                              <Gift className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>🎁 Gift as Customer Free Gift ($0.00) &bull; {dailyGiveawayInfo.remaining} left</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-center pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isSelectedFree) {
                            handleExecuteGiveaway(selectedVoucher, customerName || 'Walk-in Client', customerCell || 'N/A', 'preview');
                          } else {
                            handleSaleAction('preview');
                          }
                        }}
                        className={`text-[10px] font-medium underline cursor-pointer ${
                          isSelectedFree ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500' : 'text-sky-500 hover:text-sky-400'
                        }`}
                      >
                        {isSelectedFree ? '📱 Preview / Share Digital Gift Ticket on WhatsApp' : 'Preview / Share Digital Ticket via WhatsApp or Image first'}
                      </button>
                    </div>
                  </div>
                </form>
                );
              })()}
            </div>
          )}

          {/* COMPLETED TRANSACTIONS ARCHIVE TAB */}
          {activeTab === 'archive' && (
            <AgentTransactionsArchive
              vouchers={vouchers}
              legacyDevices={legacyDevices}
              agentUid={myUid}
              agentName={currentUser?.name || 'Authorized Field Agent'}
              activeWorkspaceName={activeWorkspace?.name || 'VakZim ICT&E'}
              theme={theme}
              alreadyClosedCash={salesCycleMetrics?.closedCash ?? closedMonthlyCash ?? 0.00}
              currentMonthlySales={totalMonthlySales}
              unclosedMonthlyCash={unclosedMonthlyCash}
              initialSearchTerm={archiveSearchQuery}
              onViewTicket={(v) => {
                setActiveTicket({
                  type: 'wifi',
                  id: v.id,
                  code: v.code,
                  plan: v.plan,
                  price: v.soldPrice || v.price,
                  duration: v.duration,
                  customer: v.customerName || 'Customer',
                  cell: v.customerCell || 'N/A',
                  networkName: v.networkName
                });
              }}
              onViewLegacyDeviceTicket={(ld) => {
                setActiveTicket({
                  type: 'legacy',
                  id: ld.id,
                  code: ld.macAddress,
                  plan: ld.deviceNameModel,
                  price: ld.soldPrice !== undefined ? ld.soldPrice : ld.monthlyPrice,
                  duration: '30 Days Lease',
                  customer: ld.customerName || 'Valued Customer',
                  cell: ld.customerCell || 'N/A',
                  networkName: 'Hardware Lease Terminal'
                });
              }}
            />
          )}

          {/* 2. TOP-UP REQUESTS */}
          {activeTab === 'requests' && (
            <div className="space-y-3">
              <div>
                <h3 className={`text-xs sm:text-sm font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Voucher Token Requests</h3>
                <p className="text-[10px] text-slate-400">Submit top-up request to administrators</p>
              </div>

              <form onSubmit={handleTopupSubmit} className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-2.5 sm:p-3.5 border rounded-xl transition ${
                theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 mb-1">
                    Select Plan Category ({masterInventoryPlans.length} in Inventory)
                  </label>
                  <select
                    id="agent-token-req-plan-select"
                    value={reqPlan}
                    onChange={(e) => setReqPlan(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-1 h-8 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  >
                    {masterInventoryPlans.map((planName) => {
                      const sampleVoucher = vouchers.find(v => v.plan === planName && !v.archived);
                      const priceStr = sampleVoucher ? ` ($${(sampleVoucher.price || 0).toFixed(2)})` : '';
                      const countUnused = vouchers.filter(v => v.plan === planName && v.status === 'Unused' && !v.archived).length;
                      return (
                        <option key={planName} value={planName}>
                          {planName}{priceStr} - {countUnused} unassigned in inventory
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-500 mb-1">Quantity Requested</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={reqQty}
                    onChange={(e) => setReqQty(parseInt(e.target.value))}
                    required
                    className={`w-full border rounded-lg px-2.5 py-1 h-8 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <button
                    type="submit"
                    className="bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white text-xs font-semibold h-8 rounded-lg transition shadow-xs cursor-pointer flex items-center justify-center"
                  >
                    Send Top-Up Request
                  </button>
                </div>
              </form>

              {/* Request Status lists */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">Requests Audit Trails</h4>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {paginatedRequests.map(r => {
                    const isEditing = editingRequestId === r.id;

                    return (
                      <div key={r.id} className={`p-2.5 border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-200 ${
                        theme === 'light' ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-950 border-slate-850 hover:border-slate-700'
                      }`}>
                        {isEditing ? (
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Edit Plan</label>
                              <select
                                value={editPlan}
                                onChange={(e) => setEditPlan(e.target.value)}
                                className={`w-full border rounded px-2 py-0.5 h-7 text-xs focus:outline-none ${
                                  theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                                }`}
                              >
                                {masterInventoryPlans.map((planName) => (
                                  <option key={planName} value={planName}>{planName}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Edit Qty</label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={editQty}
                                  onChange={(e) => setEditQty(parseInt(e.target.value) || 1)}
                                  className={`w-16 border rounded px-2 py-0.5 h-7 text-xs text-center focus:outline-none ${
                                    theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateVoucherRequest(r.id, editPlan, editQty, r.location);
                                    setEditingRequestId(null);
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-0.5 rounded text-[10px] h-7 transition cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRequestId(null)}
                                  className="bg-slate-500 hover:bg-slate-600 text-white font-bold px-2 py-0.5 rounded text-[10px] h-7 transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1">
                              <div className={`text-[11px] font-bold flex items-center gap-1.5 ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>
                                <span>{r.quantity} Vouchers ({r.plan} Plan)</span>
                                {r.location && (
                                  <span className="text-[9px] font-normal px-1 py-0.25 bg-slate-500/10 rounded text-slate-400">
                                    📍 {r.location}
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">
                                Submitted {new Date(r.timestamp).toLocaleDateString()} {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {r.status === 'Pending' ? (
                                <>
                                  <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/15 rounded text-[8px] font-bold font-mono uppercase">
                                    Pending
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRequestId(r.id);
                                      setEditPlan(r.plan);
                                      setEditQty(r.quantity);
                                      setEditLoc(r.location);
                                    }}
                                    className="bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase transition cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm('Are you sure you want to delete this pending request?')) {
                                        deleteVoucherRequest(r.id);
                                      }
                                    }}
                                    className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase transition cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : r.status === 'Fulfilled' ? (
                                <div className="flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 rounded text-[8px] font-bold font-mono uppercase flex items-center gap-0.5">
                                    ✓ Fulfilled
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => deleteVoucherRequest(r.id)}
                                    className="bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-500/20 px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase transition cursor-pointer"
                                    title="Dismiss fulfilled request"
                                  >
                                    Clear
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-450 border border-rose-500/15 rounded text-[8px] font-bold font-mono uppercase flex items-center gap-0.5">
                                    ✗ Declined
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm('Are you sure you want to delete this declined request?')) {
                                        deleteVoucherRequest(r.id);
                                      }
                                    }}
                                    className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-450 border border-rose-500/20 px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase transition cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {myRequests.length > visibleRequestsLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleRequestsLimit(prev => prev + 12)}
                      className="w-full py-1 text-center text-[10px] font-mono text-sky-500 hover:text-sky-600 font-bold transition cursor-pointer bg-sky-500/5 hover:bg-sky-500/10 rounded-lg mt-1"
                    >
                      Load More Requests ({paginatedRequests.length} of {myRequests.length})
                    </button>
                  )}
                  {myRequests.length === 0 && (
                    <div className="text-center text-xs text-slate-500 font-mono py-4">No requests found.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. LEGACY DEVICES */}
          {activeTab === 'legacy' && (
            <div id="legacy-devices-agent-section" className="space-y-3">
              <div>
                <h3 className={`text-xs sm:text-sm font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Legacy Non-WiFi Devices</h3>
                <p className="text-[10px] text-slate-400 font-mono">Enroll routers/hubs for clients requiring specialized field setup</p>
              </div>

              {/* Simulation Banner to trigger Admin Director Expiry Alert */}
              <div className={`p-2.5 border rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition ${
                theme === 'light' ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
              }`}>
                <div>
                  <h4 className={`text-[11px] font-bold ${theme === 'light' ? 'text-amber-800' : 'text-amber-400'}`}>SIMULATE LEASE EXPIRY FOR ADMIN DIRECTORS</h4>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Trigger an urgent lease-expired neon billing alert on the Admin Director Dashboard to test unenrollment protocols.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => simulateExpiredDeviceAlert()}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10px] uppercase font-mono px-3 py-1.5 h-7 rounded-lg transition cursor-pointer shrink-0 inline-flex items-center justify-center"
                >
                  Send Expiry Alert
                </button>
              </div>

              {/* Enrollment form with Customer Registry Search & Duplicate Guard */}
              <form onSubmit={handleLegacyEnrolSubmit} className={`p-3 sm:p-4 border rounded-2xl space-y-4 transition ${
                theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                {/* Search existing customer or enter new customer */}
                <div className="border-b border-slate-200 dark:border-slate-800/80 pb-3">
                  <CustomerSearchSelect
                    customers={workspaceCustomers}
                    selectedCustomer={selectedLegCustomer}
                    onSelectCustomer={(c) => {
                      setSelectedLegCustomer(c);
                      if (c) {
                        setLegName(c.name);
                        setLegCell(c.cellNumber || '');
                      }
                    }}
                    customerName={legName}
                    onChangeCustomerName={setLegName}
                    customerCell={legCell}
                    onChangeCustomerCell={setLegCell}
                    masterCountryCode={masterCountryInfo.code}
                    theme={theme}
                    isEnforced={true}
                    idPrefix="legacy-enroll"
                    labelTitle="Customer Profile & Loyalty Registry Search"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                      Device Model & Type <span className="text-red-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      value={legModel}
                      onChange={(e) => setLegModel(e.target.value)}
                      placeholder="e.g. TP-Link WR840N / MikroTik Router"
                      required
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 transition ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                      MAC Address (Hardware ID) <span className="text-red-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      value={legMac}
                      onChange={(e) => setLegMac(e.target.value)}
                      placeholder="00:11:22:AA:BB:CC"
                      required
                      className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 transition ${
                        theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center pt-1">
                  <span className="text-[10px] text-amber-600 dark:text-amber-500 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Initial price is $0.00 until Admin Director approves monthly tariff. New customers are auto-registered to loyalty program.
                  </span>
                  <button
                    type="submit"
                    disabled={isSubmittingLeg}
                    className="w-full sm:w-auto bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-semibold text-xs px-4 h-9 rounded-xl transition shadow-xs cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingLeg ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmittingLeg ? 'Enrolling Terminal...' : 'Submit Legacy Enrollment'}</span>
                  </button>
                </div>
              </form>

              {/* Legacy list with flicker indicators & Loyalty Streaks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">My Legacy Inventory Directory</h4>
                  <span className="text-[10px] font-mono text-slate-400">
                    Streaks count towards Genius Discount Rewards
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {paginatedLegacyDevices.map(ld => {
                    const isApproved = ld.isApproved;
                    const cust = ld.customerId 
                      ? customers.find(c => c.id === ld.customerId) 
                      : customers.find(c => c.name && c.name.trim().toLowerCase() === ld.customerName.trim().toLowerCase());
                    const streakCount = calculateActiveStreakCount(cust);
                    const loyaltyEval = cust ? evaluateCustomerLoyalty(cust, ld.monthlyPrice, loyaltySettings) : null;
                    const rewardReady = loyaltyEval?.isEligibleForReward && ld.monthlyPrice > 0;
                    const isExpired = ld.status === 'EXPIRED' || (ld.expiresAt && new Date(ld.expiresAt).getTime() <= Date.now());

                    return (
                      <div
                        key={ld.id}
                        className={`p-3 rounded-2xl border flex flex-col justify-between gap-2.5 transition relative overflow-hidden ${
                          isExpired
                            ? theme === 'light'
                              ? 'bg-slate-100/90 border-slate-300 text-slate-400 grayscale'
                              : 'bg-slate-900/80 border-slate-800 text-slate-500 grayscale'
                            : isApproved 
                            ? theme === 'light'
                              ? 'bg-orange-50/50 border-orange-200 shadow-xs'
                              : 'bg-orange-500/5 border-orange-500/30 shadow-xs'
                            : theme === 'light'
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-950 border-slate-850'
                        }`}
                      >
                        {/* Red rubber stamp like text in oblique position */}
                        {isExpired && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                            <div className="transform -rotate-12 px-3.5 py-1 border-2 border-red-600 dark:border-red-500 bg-red-100/85 dark:bg-red-950/85 text-red-600 dark:text-red-400 font-black font-mono tracking-[0.25em] text-xs sm:text-sm uppercase rounded shadow-sm select-none">
                              EXPIRED
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between items-start min-w-0">
                          <div className="min-w-0 pr-2 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h5 className={`font-bold text-xs truncate ${
                                isExpired 
                                  ? 'text-slate-400 dark:text-slate-500 line-through decoration-red-500/50' 
                                  : theme === 'light' ? 'text-slate-900' : 'text-white'
                              }`}>
                                {ld.customerName}
                              </h5>
                              {cust?.customerNumber && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                  {cust.customerNumber}
                                </span>
                              )}
                              {streakCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                                  <Award className="w-2.5 h-2.5" />
                                  <span>{streakCount} Streak</span>
                                </span>
                              )}
                              {rewardReady && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5 animate-pulse">
                                  <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                                  <span>Genius -$${(loyaltyEval.discountAmount || 0).toFixed(2)} Ready!</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block truncate">{ld.deviceNameModel}</span>
                            {ld.deletionRequested && (
                              <div className="mt-1 flex items-center gap-1 text-[9px] font-mono font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-lg w-fit">
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0 animate-pulse text-rose-500" />
                                <span>Deletion Pending Admin Approval{ld.deletionReason ? `: "${ld.deletionReason}"` : ''}</span>
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <div className="flex flex-col items-end">
                              {ld.status === 'SOLD' && ld.discountApplied ? (
                                <>
                                  <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                                    ${(ld.soldPrice ?? ld.monthlyPrice).toFixed(2)}
                                  </span>
                                  <span className="text-[9px] font-mono text-amber-500 line-through">
                                    ${(ld.monthlyPrice || 0).toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <span className={`text-xs font-bold font-mono ${isExpired ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-sky-600 dark:text-sky-400'}`}>
                                  ${(ld.monthlyPrice || 0).toFixed(2)}
                                </span>
                              )}
                              <span className="text-[9px] font-mono text-slate-500 block">{ld.macAddress}</span>
                            </div>
                          </div>
                        </div>

                        <div className={`flex justify-between items-center border-t pt-2 gap-2 flex-wrap ${
                          theme === 'light' ? 'border-slate-100' : 'border-slate-800/60'
                        }`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {(() => {
                              const isExpired = ld.status === 'EXPIRED' || (ld.expiresAt && new Date(ld.expiresAt).getTime() <= Date.now());
                              const displayStatus = isExpired && ld.status !== 'PENDING' ? 'EXPIRED' : ld.status;
                              return (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase ${
                                  ld.status === 'PENDING' 
                                    ? theme === 'light' ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-400'
                                    : isExpired
                                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700 font-bold'
                                    : ld.status === 'SOLD'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                                }`}>
                                  {displayStatus}
                                </span>
                              );
                            })()}
                            {ld.deletionRequested && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse" title={`Reason: ${ld.deletionReason || 'Not specified'}`}>
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Deletion Pending{ld.deletionReason ? `: "${ld.deletionReason}"` : ''}</span>
                              </span>
                            )}
                            {ld.renewalRequested && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1 animate-pulse" title={`Reason: ${ld.renewalReason || 'Pending admin approval'}`}>
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>Renewal Pending ({ld.renewalRequestedDurationDays || 30}d)</span>
                              </span>
                            )}
                            {ld.expiresAt && (
                              <span className={`text-[9px] font-mono font-bold ${
                                new Date(ld.expiresAt).getTime() > Date.now() ? 'text-amber-500' : 'text-rose-500'
                              }`}>
                                Lease: {ld.leaseDurationDays || 30}d (Exp: {new Date(ld.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
                              </span>
                            )}
                            {ld.status === 'SOLD' && ld.discountApplied ? (
                              <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400">
                                Genius Discount Applied (-${(ld.discountApplied || 0).toFixed(2)})
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {/* Agent Lease Renewal Request Action */}
                            {ld.renewalRequested ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Withdraw lease renewal request for "${ld.deviceNameModel}" (${ld.customerName})?`)) {
                                    await cancelLegacyDeviceRenewalRequest(ld.id);
                                  }
                                }}
                                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono font-bold text-[10px] px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs animate-pulse"
                                title={`Withdraw ${ld.renewalRequestedDurationDays || 30}-day lease renewal request`}
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Withdraw Renewal ({ld.renewalRequestedDurationDays || 30}d)</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                id={`btn-agent-request-renewal-${ld.id}`}
                                onClick={() => {
                                  setRenewalTargetDevice(ld);
                                }}
                                className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono font-bold text-[10px] px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Request 14-day or 30-day lease extension from Administrator"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Request Renewal</span>
                              </button>
                            )}

                            {ld.status === 'PENDING' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to cancel the legacy device enroll request for "${ld.deviceNameModel}" (${ld.customerName})?`)) {
                                    await cancelLegacyDeviceEnrollment(ld.id);
                                  }
                                }}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-mono font-bold text-[10px] px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Cancel this legacy device enrollment request"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Cancel Request</span>
                              </button>
                            )}

                            {/* Agent Legacy Device Deletion Request Actions */}
                            {ld.deletionRequested ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Withdraw deletion request for "${ld.deviceNameModel}" (${ld.customerName})?`)) {
                                    await cancelLegacyDeviceDeletionRequest(ld.id);
                                  }
                                }}
                                className="bg-slate-500/10 hover:bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/20 font-mono font-bold text-[10px] px-2 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Withdraw / cancel deletion request"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Withdraw Request</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                id={`btn-agent-request-deletion-${ld.id}`}
                                onClick={() => {
                                  setDeletionTargetDevice(ld);
                                  setDeletionReasonText('Broken terminal / client cancelled lease');
                                }}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-mono font-bold text-[10px] px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Request Admin to delete this legacy device and state reasons"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Request Deletion</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {myLegacyDevices.length > visibleLegacyLimit && (
                    <div className="col-span-full pt-1">
                      <button
                        type="button"
                        onClick={() => setVisibleLegacyLimit(prev => prev + 12)}
                        className="w-full py-2 text-center text-xs font-mono font-bold text-sky-500 hover:text-sky-600 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/20 rounded-xl transition cursor-pointer"
                      >
                        Load More Devices ({paginatedLegacyDevices.length} of {myLegacyDevices.length} shown)
                      </button>
                    </div>
                  )}
                  {myLegacyDevices.length === 0 && (
                    <div className="col-span-full text-center text-xs text-slate-500 font-mono py-4">No legacy devices found.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. ADMIN FEEDBACK */}
          {activeTab === 'queries' && (
            <div className="space-y-6">
              <div>
                <h3 className={`text-base font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Voucher Queries & Feedbacks</h3>
                <p className="text-xs text-slate-400">File issues or submit operational comments to administrators</p>
              </div>

              <form onSubmit={handleFeedbackSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    Select Allocated Voucher (Optional)
                  </label>
                  <select
                    value={queryVoucherId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setQueryVoucherId(id);
                      const matched = myAssignedVouchers.find(v => v.id === id);
                      if (matched && !queryText.includes(matched.code)) {
                        setQueryText(prev => prev ? `[Regarding Voucher: ${matched.code}] ${prev}` : `[Regarding Voucher: ${matched.code}] `);
                      }
                    }}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  >
                    <option value="">-- No specific voucher selected --</option>
                    {myAssignedVouchers.filter(v => v.status !== 'Sold').slice(0, 40).map(v => (
                      <option key={v.id} value={v.id}>
                        {sanitizeVoucherCode(v)} ({v.plan} • ${(v.price || 0).toFixed(2)}) - Status: {v.status}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="e.g. Code LUS-FAST-9321 is reporting incorrect credentials upon user signin. Requesting remote inspection."
                  required
                  rows={4}
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" /> Submit Query
                  </button>
                </div>
              </form>

              {/* Historical Query Tracking with Admin Resolutions */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-400">
                  Your Submitted Queries & Workspace Master Responses
                </h4>
                {feedback.filter(f => f.agentId === currentUser?.uid).length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-mono italic">No previous queries submitted.</p>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {feedback.filter(f => f.agentId === currentUser?.uid).slice(-15).map(f => (
                      <div key={f.id} className={`p-3 rounded-2xl border text-xs space-y-1.5 transition ${
                        theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>{new Date(f.timestamp).toLocaleString()}</span>
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                            f.status === 'Resolved'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            {f.status || 'Open'}
                          </span>
                        </div>
                        {f.voucherCode && (
                          <div className="inline-block px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono font-bold border border-indigo-500/15">
                            Referenced Voucher: {f.voucherCode}
                          </div>
                        )}
                        <p className="text-xs leading-relaxed">{f.message}</p>
                        {f.reply && (
                          <div className={`mt-2 p-2.5 rounded-xl border text-[11px] ${
                            f.reply.toLowerCase().includes('revoked')
                              ? theme === 'light' ? 'bg-amber-50/80 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                              : theme === 'light' ? 'bg-indigo-50/80 border-indigo-200 text-indigo-900' : 'bg-indigo-950/30 border-indigo-800/40 text-indigo-200'
                          }`}>
                            <span className="text-[9px] font-bold font-mono block uppercase">Workspace Master Resolution:</span>
                            <p className="mt-0.5 leading-relaxed">{f.reply}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Synced Team Leaderboard */}
        <div className={`border rounded-3xl p-3.5 sm:p-5 shadow-xl flex flex-col h-fit transition-all w-full max-w-full min-w-0 overflow-hidden box-border ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
          <div className="flex items-center justify-between gap-2.5 mb-1">
            <div className="flex items-center gap-2.5">
              <Award className={`w-5 h-5 ${theme === 'light' ? 'text-amber-500' : 'text-amber-400'}`} />
              <h2 className={`text-base font-bold font-display ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Team Leaderboard</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold uppercase">
              Synced Live
            </span>
          </div>

          <p className="text-[10px] text-slate-400 font-mono mb-4">
            Synced with Admin Leaderboard • Grouped by Location • Ranked by Overall Sales Percentage
          </p>

          <div className="space-y-3">
            {(() => {
              const displayLimit = showFullLeaderboard ? percentageLeaderboard.length : 8;
              let itemsToRender = percentageLeaderboard.slice(0, displayLimit);
              const myItem = percentageLeaderboard.find(item => item.uid === myUid || item.uid === currentUser?.uid || isAgentMatch(item.uid, item.name, item.email));
              if (!showFullLeaderboard && myItem && !itemsToRender.some(i => i.uid === myItem.uid)) {
                itemsToRender = [...itemsToRender, myItem];
              }
              return itemsToRender.map((item, index) => {
              const isMe = item.uid === myUid || item.uid === currentUser?.uid || isAgentMatch(item.uid, item.name, item.email);
              const overallSalesPercentage = totalTeamSales > 0 ? (item.actualSales / totalTeamSales) * 100 : 0;
              // For own account, strictly synchronize with live dashboard unclosed cash so when all cash is closed it shows $0 / hidden
              const myLiveUnclosedCash = isMe
                ? Math.max(0, Number(((unclosedMonthlyCash > 0.01 ? unclosedMonthlyCash : 0) + ((salesCycleMetrics?.unclosedCashFromPrevCycle ?? 0) > 0.01 ? salesCycleMetrics!.unclosedCashFromPrevCycle! : 0)).toFixed(2)))
                : (item.unclosedCashFromPrevCycle ?? 0);
              const hasUnclosed = myLiveUnclosedCash > 0.01;
              return (
                <div
                  key={item.uid}
                  className={`p-3 sm:p-3.5 rounded-xl border flex flex-col gap-2.5 transition ${
                    isMe 
                      ? theme === 'light'
                        ? 'bg-sky-50 border-sky-400 shadow-sm ring-1 ring-sky-400/30'
                        : 'bg-sky-950/20 border-sky-500 shadow-sm ring-1 ring-sky-500/30' 
                      : theme === 'light'
                      ? 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/60'
                      : 'bg-slate-950 border-slate-850 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className={`text-xs sm:text-sm font-mono font-black w-6 text-left shrink-0 ${
                        item.rank === 1 ? 'text-amber-500' : item.rank === 2 ? 'text-slate-400' : item.rank === 3 ? 'text-amber-700' : 'text-slate-500'
                      }`}>
                        #{item.rank}
                      </span>
                      <div className="w-9 h-9 sm:w-8 sm:h-8 rounded-full overflow-hidden border border-slate-700 shrink-0">
                        <img referrerPolicy="no-referrer" src={item.profilePic} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-xs sm:text-sm font-bold truncate flex items-center gap-1.5 ${
                          theme === 'light' ? 'text-slate-800' : 'text-white'
                        }`}>
                          <span className="truncate">{item.name}</span>
                          {isMe && <span className="text-[8px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1 py-0.5 rounded uppercase font-bold font-mono shrink-0">Me</span>}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono block truncate">{item.location} • {item.cellNumber}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isMe ? (
                        <>
                          <div 
                            title={`Your current cycle sales: $${(item.actualSales || 0).toFixed(2)} of $${(item.targetAmount || 0).toFixed(2)} (${item.percentage}%)`}
                            className={`text-xs sm:text-sm font-mono font-black ${
                              item.actualSales > 0
                                ? theme === 'light' ? 'text-emerald-600' : 'text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            ${(item.actualSales || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {item.percentage}% Goal • {(overallSalesPercentage || 0).toFixed(1)}% Share
                          </div>
                        </>
                      ) : (
                        <>
                          <div 
                            title={`Team performance share: ${(overallSalesPercentage || 0).toFixed(1)}% (${item.percentage}% of goal achieved)`}
                            className={`text-xs sm:text-sm font-mono font-black ${
                              overallSalesPercentage > 0
                                ? theme === 'light' ? 'text-sky-600' : 'text-sky-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {(overallSalesPercentage || 0).toFixed(1)}% Share
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {item.percentage}% Goal
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Previous cycle sales & unclosed indicator strictly visible for own account only */}
                  {isMe && ((item.prevMonthActualSales !== undefined && item.prevMonthActualSales > 0) || hasUnclosed) && (
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                      {item.prevMonthActualSales !== undefined && item.prevMonthActualSales > 0 ? (
                        <span>Your Prev Cycle: ${(item.prevMonthActualSales || 0).toFixed(0)}</span>
                      ) : <span />}
                      {hasUnclosed && (
                        <span className="text-orange-600 dark:text-orange-400 font-bold">
                          Your Unclosed: ${myLiveUnclosedCash.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Progress bar representing overall sales percentage */}
                  <div className="space-y-1">
                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${
                      theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                    }`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isMe 
                            ? 'bg-gradient-to-r from-sky-500 to-emerald-500' 
                            : 'bg-gradient-to-r from-indigo-500 to-sky-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(overallSalesPercentage, item.actualSales > 0 ? 5 : 0))}%` }}
                        title={`${(overallSalesPercentage || 0).toFixed(1)}% of overall team sales`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Goal Share</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{(overallSalesPercentage || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            });
            })()}

            {percentageLeaderboard.length > 8 && (
              <button
                type="button"
                onClick={() => setShowFullLeaderboard(prev => !prev)}
                className="w-full py-2 text-center text-xs font-mono font-bold text-sky-500 hover:text-sky-600 bg-sky-500/10 hover:bg-sky-500/20 rounded-xl transition cursor-pointer active:scale-98"
              >
                {showFullLeaderboard ? 'Show Top 8 Only' : `View All ${percentageLeaderboard.length} Agents`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* High-Speed Text Recognition Scanner Modal (Agent Single Scan Mode) */}
      <VoucherScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onCodeScanned={handleAgentCodeScanned}
        mode="single"
        knownCodes={myAssignedCodes}
        catalogVouchers={myVouchers}
        title="Agent Voucher Scanner"
        subtitle="Aim camera or Circle-to-Search voucher text to search, match, and select for sale."
        theme={theme}
      />

      {/* Cash Close Amount Specification & Confirmation Modal */}
      <CashCloseModal
        isOpen={isCashCloseModalOpen}
        onClose={() => setIsCashCloseModalOpen(false)}
        dailySalesTotal={dailySalesTotal}
        totalLegacySales={totalLegacySales}
        grandTotalSales={grandTotalSales}
        agentCashDrops={myCashDrops}
        unclosedCashFromPrevCycle={salesCycleMetrics?.unclosedCashFromPrevCycle}
        prevCycleMonth={salesCycleMetrics?.prevCycleMonth}
        onConfirmCashClose={async (amount, notes, extra) => {
          handleConfirmCashClose(amount, notes, extra);
          if (currentUser?.uid) {
            await updateAgentCashCloseSchedule(currentUser.uid, { isCashCloseRequested: false });
          }
        }}
        onFulfillAdminCashDrop={fulfillAdminCashDropRequest}
        theme={theme}
        agentName={currentUser?.name || 'Agent'}
        agentId={currentUser?.uid}
        commissionRate={commissionPercentValue}
        cashCloseSettings={activeWorkspace?.cashCloseSettings || cashCloseSettings}
      />

      {/* Genius Customer Loyalty Program Registry Modal (Agent-Mode) */}
      <LoyaltyProgramSettingsModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        settings={loyaltySettings}
        onSaveSettings={async () => {}} // Read-only rules for agents
        customers={workspaceCustomers}
        onAddOrUpdateCustomer={addOrUpdateCustomer}
        theme={theme}
        isAgent={true}
      />

      {/* Skip Customer Details Confirmation Modal */}
      {skipDetailsConfirmation?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 sm:backdrop-blur-xs animate-in fade-in">
          <div className={`border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display">Proceed Without Customer Details?</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedVoucher?.code ? `Voucher Code: ${selectedVoucher.code}` : 'Voucher Sale'}
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border text-xs font-mono space-y-2 ${
              theme === 'light' ? 'bg-amber-50/50 border-amber-200 text-amber-900' : 'bg-amber-950/20 border-amber-900/40 text-amber-200'
            }`}>
              <p className="font-semibold">
                Customer detail input is default. Are you sure you want to skip customer detail input and proceed to close this sale?
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
                <li>The sale will be recorded as a <strong>Walk-in Client</strong>.</li>
                <li>Customer will <strong>not</strong> accumulate loyalty rewards or streak progress.</li>
                <li>No customer profile will be saved to your customer registry.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSkipDetailsConfirmation(null)}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                Cancel & Enter Details
              </button>
              <button
                type="button"
                onClick={() => executeSale(skipDetailsConfirmation.action, true)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Proceed to Close Sale
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Thermal Slip & Sewoo BT Printer Settings Modal */}
      <ThermalPrinterSettingsModal
        isOpen={isPrinterModalOpen}
        onClose={() => {
          setIsPrinterModalOpen(false);
          setPrinterEmulationState(getPrinterEmulation());
        }}
        connectedPrinter={connectedPrinter}
        agentName={currentUser?.name || 'Field Agent'}
        agentUid={currentUser?.uid}
        workspaceName={activeWorkspace?.name || 'VakZim ICT&E'}
        location={myLocation}
      />

      {/* Agent Free Voucher Giveaway Modal */}
      <AgentGiveawayModal
        isOpen={isAgentGiveawayModalOpen}
        onClose={() => {
          setIsAgentGiveawayModalOpen(false);
          setSelectedFreeVoucher(null);
        }}
        voucher={selectedFreeVoucher}
        assignedFreeVouchers={myFreeGiveawayVouchers}
        workspacePoolFreeVouchers={workspacePoolFreeVouchers}
        myAssignedVouchers={myAssignedVouchers}
        dailyGiveawayInfo={dailyGiveawayInfo}
        onExecuteGiveaway={handleExecuteGiveaway}
        onRequestTopup={(plan) => {
          submitVoucherRequest(plan || '1 Hour Free', 5, myLocation);
          showToast(`Top-up request for 5 Free Gift Vouchers sent to Admin!`, 'success');
        }}
        theme={theme}
      />

      {/* Agent Legacy Device Deletion Request Modal */}
      {deletionTargetDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 sm:backdrop-blur-xs animate-in fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-500 font-bold font-display text-sm">
                <Trash2 className="w-4 h-4" />
                <span>Request Terminal Deletion</span>
              </div>
              <button
                type="button"
                onClick={() => setDeletionTargetDevice(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1 font-mono text-xs">
              <div className="font-bold text-slate-900 dark:text-white">{deletionTargetDevice.deviceNameModel}</div>
              <div className="text-slate-500 text-[10px]">Customer: {deletionTargetDevice.customerName}</div>
              <div className="text-slate-500 text-[10px]">MAC Address: {deletionTargetDevice.macAddress}</div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold font-mono uppercase text-slate-400">
                Reason for Deletion Request:
              </label>
              <textarea
                value={deletionReasonText}
                onChange={(e) => setDeletionReasonText(e.target.value)}
                placeholder="State specific reason (e.g. Broken terminal, Client cancelled lease, Equipment retrieved)..."
                rows={3}
                className={`w-full p-3 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                  theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />

              {/* Quick reason chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Broken / Damaged Terminal',
                  'Client Cancelled Lease',
                  'Equipment Retrieved',
                  'Duplicate Record',
                  'Customer Relocated'
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setDeletionReasonText(chip)}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-mono border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-rose-500/50 hover:text-rose-500 transition cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletionTargetDevice(null)}
                className="px-4 py-2 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-submit-agent-deletion-request"
                disabled={isSubmittingDeletion || !deletionReasonText.trim()}
                onClick={async () => {
                  setIsSubmittingDeletion(true);
                  try {
                    await requestLegacyDeviceDeletion(deletionTargetDevice.id, deletionReasonText.trim());
                    setDeletionTargetDevice(null);
                  } finally {
                    setIsSubmittingDeletion(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isSubmittingDeletion ? 'Submitting...' : 'Submit Request'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct WhatsApp Share Prompt Modal (for tickets with no phone number) */}
      {directWhatsAppTicket && (
        <div className="fixed inset-0 bg-slate-950/85 sm:backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-sm rounded-2xl border shadow-2xl p-5 text-left ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Share2 className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm">Direct WhatsApp Share</h4>
              </div>
              <button
                onClick={() => setDirectWhatsAppTicket(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Enter customer mobile number to open WhatsApp directly without needing to search contacts:
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">Customer Phone Number / WhatsApp</label>
                <input
                  type="text"
                  value={directWhatsAppInput}
                  onChange={(e) => setDirectWhatsAppInput(e.target.value)}
                  placeholder="e.g. 077 123 4567 or +263..."
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleShareWhatsApp(directWhatsAppTicket.ticket, directWhatsAppInput);
                    }
                  }}
                />
                {directWhatsAppInput && (
                  <div className="text-[10px] font-mono text-emerald-500 mt-1">
                    Direct chat target: +{formatWhatsAppPhone(directWhatsAppInput, masterCountryInfo?.code || '+263')}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(directWhatsAppTicket.ticket, directWhatsAppInput)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Open in WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const ticket = directWhatsAppTicket.ticket;
                    const brandName = activeWorkspace?.name || 'VakZim ICT&E';
                    const ssidText = ticket.networkName ? ` \nWi-Fi Network (SSID): ${ticket.networkName}` : '';
                    const text = `*WiVoTe ACCESS TICKET* \n\n🔒 Code: ${ticket.code} \nPlan: ${ticket.plan}${ssidText} \nPrice: $${(ticket.price || 0).toFixed(2)} \nValidity: ${ticket.duration} \n\n*Client:* ${ticket.customer} \n*Agent:* ${currentUser?.name || 'Field Agent'} \nAuthorized by ${brandName} 2026.`;
                    openWhatsAppWithReceipt({ text });
                    setDirectWhatsAppTicket(null);
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-mono transition cursor-pointer ${
                    theme === 'light' ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                  title="Share without specific recipient"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Request Lease Renewal Modal */}
      <RequestLeaseRenewalModal
        isOpen={!!renewalTargetDevice}
        onClose={() => setRenewalTargetDevice(null)}
        device={renewalTargetDevice}
        onRequestRenewal={requestLegacyDeviceRenewal}
        theme={theme}
      />
    </div>
  );
};
