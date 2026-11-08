import {
  Voucher,
  LegacyDevice,
  CashDrop,
  UserProfile,
  WorkspaceCashCloseSettings,
  AgentSalesCycleMetrics,
  WorkspaceSalesCycleAggregate,
  DEFAULT_CASH_CLOSE_SETTINGS
} from '../types';
import { isVoucherFree, getVoucherMonetaryValue } from './giveawayEngine';

/**
 * Deduplicates enrolled legacy devices by MAC address and ID, keeping highest priority / SOLD status.
 */
export const deduplicateLegacyDevices = (devices: LegacyDevice[]): LegacyDevice[] => {
  const byMac = new Map<string, LegacyDevice>();
  const byId = new Map<string, LegacyDevice>();
  const deduped: LegacyDevice[] = [];

  for (const ld of (devices || [])) {
    if (!ld || !ld.id) continue;
    const normMac = (ld.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const existing = (normMac.length >= 8 ? byMac.get(normMac) : undefined) || byId.get(ld.id);
    if (existing) {
      // Merge duplicate records: SOLD takes precedence (excluding approved reversals)
      const isSold = ld.status === 'SOLD' && ld.reversalStatus !== 'Approved' && !ld.reversedAt;
      const existingIsSold = existing.status === 'SOLD' && existing.reversalStatus !== 'Approved' && !existing.reversedAt;

      if (isSold && !existingIsSold) {
        existing.status = 'SOLD';
        existing.soldPrice = ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || existing.monthlyPrice);
        existing.soldAt = ld.soldAt || new Date().toISOString();
        existing.discountApplied = ld.discountApplied || existing.discountApplied;
      } else if (existingIsSold && !isSold) {
        // Keep existing as SOLD, but absorb any newly populated fields
        if (!existing.fieldAgentId && ld.fieldAgentId) existing.fieldAgentId = ld.fieldAgentId;
        if (!existing.fieldAgentName && ld.fieldAgentName) existing.fieldAgentName = ld.fieldAgentName;
        if (!existing.monthlyPrice && ld.monthlyPrice) existing.monthlyPrice = ld.monthlyPrice;
      } else {
        // Same status: keep higher price / most detailed fields
        if (ld.soldPrice !== undefined && (existing.soldPrice === undefined || ld.soldPrice > existing.soldPrice)) {
          existing.soldPrice = ld.soldPrice;
        }
        if (ld.monthlyPrice !== undefined && (existing.monthlyPrice === undefined || ld.monthlyPrice > existing.monthlyPrice)) {
          existing.monthlyPrice = ld.monthlyPrice;
        }
      }
      continue;
    }

    byId.set(ld.id, ld);
    if (normMac.length >= 8) byMac.set(normMac, ld);
    deduped.push(ld);
  }
  return deduped;
};

/**
 * Safely parses any date or timestamp representation into a valid JavaScript Date object.
 * Supports:
 * - Firestore Timestamp instances or raw objects ({ seconds, nanoseconds }, { _seconds, _nanoseconds }, { toDate })
 * - Date instances
 * - Numeric timestamps in seconds or milliseconds (e.g. 1789240275831 or 1789240275)
 * - ISO / date strings or stringified numbers
 */
export function parseTimestampToDate(d: any): Date | null {
  if (d === null || d === undefined || d === '') return null;
  try {
    if (d instanceof Date) {
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof d === 'object') {
      if (typeof d.toDate === 'function') {
        const res = d.toDate();
        return res && !isNaN(res.getTime()) ? res : null;
      }
      if (typeof d.seconds === 'number') {
        return new Date(d.seconds * 1000);
      }
      if (typeof d._seconds === 'number') {
        return new Date(d._seconds * 1000);
      }
    }
    if (typeof d === 'number') {
      const ms = d < 1e11 ? d * 1000 : d;
      const res = new Date(ms);
      return isNaN(res.getTime()) ? null : res;
    }
    if (typeof d === 'string') {
      const trimmed = d.trim();
      if (!trimmed) return null;
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        const ms = num < 1e11 ? num * 1000 : num;
        const res = new Date(ms);
        return isNaN(res.getTime()) ? null : res;
      }
      const parsed = new Date(trimmed);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Returns formatted cycle identifier, e.g. "2026-09"
 */
export function getCurrentCycleMonth(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Returns formatted previous cycle identifier, e.g. "2026-09"
 */
export function getPreviousCycleMonth(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Extracts "YYYY-MM" from a Date, Firestore Timestamp, ISO string, or numeric timestamp
 */
export function getCycleMonthFromDate(d: any): string | null {
  const dateObj = parseTimestampToDate(d);
  if (!dateObj) return null;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Returns user-friendly month name & year, e.g. "September 2026"
 */
export function getCycleMonthLabel(cycleMonth: string = getCurrentCycleMonth()): string {
  const [yearStr, monthStr] = cycleMonth.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Returns number of days remaining until the end of the month.
 * If today is the last day of the month, returns 0.
 * If 1 day before last day, returns 1.
 * If 2 days before last day, returns 2.
 */
export function getDaysUntilMonthEnd(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = date.getDate();
  return Math.max(0, lastDayOfMonth - currentDay);
}

/**
 * Returns the calendar date when the permissible cash close window opens for the month.
 * E.g. For a 30-day month with allowedDaysBeforeMonthEnd = 2, opens on day 28 (30 - 2).
 */
export function getPermissibleWindowOpensDate(
  allowedDaysBeforeMonthEnd: number = 2,
  date: Date = new Date()
): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const openDay = Math.max(1, lastDayOfMonth - allowedDaysBeforeMonthEnd);
  const openDate = new Date(year, month, openDay);
  return openDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Checks whether an agent is currently permitted to perform a cash close.
 * Criteria:
 * 1. Admin explicitly requested a cash close for this agent (overrides limits & schedule).
 * 2. Checks number of cash closes permitted in a sales cycle (maxClosesPerCycle).
 * 3. Removes strict end-of-month only restriction: permits cash closes anytime in the cycle
 *    unless explicitly configured otherwise by administrator.
 */
export function isCashClosePermissible(
  agentId: string,
  settings: WorkspaceCashCloseSettings = DEFAULT_CASH_CLOSE_SETTINGS,
  hasPendingAdminRequest: boolean = false,
  date: Date = new Date(),
  currentCycleClosesCount: number = 0
): {
  isPermissible: boolean;
  reason: string;
  daysRemaining: number;
  maxCloses?: number | null;
  currentCycleClosesCount?: number;
  closesRemaining?: number | null;
} {
  const agentOverride = settings.agentOverrides?.[agentId];
  const maxCloses = agentOverride?.maxClosesPerCycle !== undefined
    ? agentOverride.maxClosesPerCycle
    : (settings.maxClosesPerCycle !== undefined ? settings.maxClosesPerCycle : null);

  const daysRemaining = getDaysUntilMonthEnd(date);
  const closesRemaining = (maxCloses !== null && maxCloses !== undefined && maxCloses > 0)
    ? Math.max(0, maxCloses - currentCycleClosesCount)
    : null;

  // 1. Admin request overrides all schedule and quota restrictions
  if (hasPendingAdminRequest) {
    return {
      isPermissible: true,
      reason: 'Administrator has requested an immediate Cash Close.',
      daysRemaining: 0,
      maxCloses,
      currentCycleClosesCount,
      closesRemaining
    };
  }

  // 2. Check cycle quota limit (number of cash closes permitted in sales cycle)
  if (maxCloses !== null && maxCloses !== undefined && maxCloses > 0) {
    if (currentCycleClosesCount >= maxCloses) {
      return {
        isPermissible: false,
        reason: `Maximum permitted cash closes reached for this sales cycle (${currentCycleClosesCount} of ${maxCloses} used). Contact your Administrator to adjust quota or place a request.`,
        daysRemaining,
        maxCloses,
        currentCycleClosesCount,
        closesRemaining: 0
      };
    }
  }

  // 3. Flexible Timing / Custom Schedule check:
  // Mandatory 28-day wait is removed. Cash close is permissible by default
  // unless the Administrator sets a specific custom day schedule for the agent.
  const customSchedule = agentOverride?.customSchedule;

  if (customSchedule === 'custom_day' && agentOverride?.customCloseDay) {
    const currentDay = date.getDate();
    if (currentDay >= agentOverride.customCloseDay) {
      return {
        isPermissible: true,
        reason: `Cash close window active (Custom scheduled for day ${agentOverride.customCloseDay} of the month).`,
        daysRemaining,
        maxCloses,
        currentCycleClosesCount,
        closesRemaining
      };
    } else {
      return {
        isPermissible: false,
        reason: `Cash close scheduled for day ${agentOverride.customCloseDay} of the month.`,
        daysRemaining: agentOverride.customCloseDay - currentDay,
        maxCloses,
        currentCycleClosesCount,
        closesRemaining
      };
    }
  }

  // Default: Flexible cash close open at all times (no 28-day wait)
  const quotaMsg = maxCloses
    ? ` (${closesRemaining} close(s) remaining of ${maxCloses} permitted this cycle)`
    : '';
  return {
    isPermissible: true,
    reason: `Cash close is permissible anytime during the active sales cycle${quotaMsg}.`,
    daysRemaining,
    maxCloses,
    currentCycleClosesCount,
    closesRemaining
  };
}

export function isDropApprovedOrReconciled(cd: CashDrop): boolean {
  if (!cd) return false;
  if (cd.approvedAt || cd.approvedBy) return true;
  const s = (cd.status || '').toString().trim().toLowerCase();
  return s === 'approved' || s === 'reconciled' || s === 'fulfilled';
}

export function isDropPending(cd: CashDrop): boolean {
  if (!cd) return false;
  if (isDropApprovedOrReconciled(cd)) return false;
  const s = (cd.status || '').toString().trim().toLowerCase();
  return s === 'pending' || s === 'requested' || s === 'submitted' || s === 'unapproved';
}

export function isDropValidForClosedCash(cd: CashDrop): boolean {
  if (!cd) return false;
  const s = (cd.status || '').toString().trim().toLowerCase();
  if (s === 'declined' || s === 'rejected' || s === 'cancelled') return false;
  return isDropApprovedOrReconciled(cd) || isDropPending(cd);
}

/**
 * Calculates complete sales cycle and cash close metrics for a specific field agent.
 */
export function getAgentSalesCycleMetrics(
  agent: UserProfile,
  vouchers: Voucher[],
  legacyDevices: LegacyDevice[],
  cashDrops: CashDrop[],
  settings: WorkspaceCashCloseSettings = DEFAULT_CASH_CLOSE_SETTINGS,
  date: Date = new Date()
): AgentSalesCycleMetrics {
  const safeAgent: UserProfile = (agent && typeof agent === 'object' ? agent : { uid: typeof agent === 'string' ? agent : '', name: '', email: '', role: 'Agent' } as UserProfile);
  const agentId = safeAgent.uid || '';
  const cycleMonth = getCurrentCycleMonth(date);
  const prevCycleMonth = getPreviousCycleMonth(date);
  const todayDay = date.getDate();
  const prevMonthDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthIndex = prevMonthDate.getMonth();
  const agentOverride = settings?.agentOverrides?.[agentId];
  const cleanAgentName = (safeAgent.name || '').toLowerCase().trim();
  const cleanAgentEmail = (safeAgent.email || '').toLowerCase().trim();
  const cleanAgentId = agentId.toLowerCase().trim();
  const isHistecAgent = cleanAgentName.includes('histec') || cleanAgentEmail.includes('histec') || agentId === 'agent_histec_training' || agentId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || (cleanAgentId ? cleanAgentId.includes('histec') : false);
  const isMukondodziAgent = cleanAgentName.includes('mukondodzi') || cleanAgentEmail.includes('mukondodzi') || agentId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' || (cleanAgentId ? cleanAgentId.includes('mukondodzi') : false);
  const isChitsungoAgent = cleanAgentName.includes('chitsungo') || cleanAgentEmail.includes('chitsungo') || agentId === '7QFBnEU9XxalOI6kl8csoTm58tE2' || (cleanAgentId ? cleanAgentId.includes('chitsungo') : false);

  // Helper to match agent by uid, name, or clean alias
  const matchesAgent = (targetId?: string, targetName?: string, targetEmail?: string) => {
    if (!targetId && !targetName && !targetEmail) return false;
    const cleanTId = (targetId || '').trim().toLowerCase();
    const cleanTName = (targetName || '').trim().toLowerCase();
    const cleanTEmail = (targetEmail || '').trim().toLowerCase();

    if (cleanTId && cleanAgentId && (cleanTId === cleanAgentId || cleanTId.includes(cleanAgentId) || cleanAgentId.includes(cleanTId))) return true;
    if (cleanTEmail && cleanAgentEmail && (cleanTEmail === cleanAgentEmail || cleanTEmail.includes(cleanAgentEmail) || cleanAgentEmail.includes(cleanTEmail))) return true;
    if (cleanTName && cleanAgentName) {
      if (cleanTName === cleanAgentName) return true;
      const normTarget = cleanTName.replace(/[^a-z0-9]/g, '');
      const normAgent = cleanAgentName.replace(/[^a-z0-9]/g, '');
      if (normTarget && normAgent && (normTarget.includes(normAgent) || normAgent.includes(normTarget))) return true;
      const firstTarget = normTarget.slice(0, 5);
      const firstAgent = normAgent.slice(0, 5);
      if (firstTarget.length >= 4 && firstAgent.length >= 4 && firstTarget === firstAgent) return true;
    }

    if (isHistecAgent && (
      (targetId && (targetId === 'agent_histec_training' || targetId === 'OIofBo6j6jV6qM0oRRxVFwpucfP2' || targetId.toLowerCase().includes('histec'))) ||
      (targetName && targetName.toLowerCase().includes('histec')) ||
      (targetEmail && targetEmail.toLowerCase().includes('histec'))
    )) return true;

    if (isMukondodziAgent && (
      (targetId && (targetId === '6ih4NtJnXUeNtt1z0orVHZGkQuv2' || targetId.toLowerCase().includes('mukondodzi'))) ||
      (targetName && targetName.toLowerCase().includes('mukondodzi')) ||
      (targetEmail && targetEmail.toLowerCase().includes('mukondodzi'))
    )) return true;

    if (isChitsungoAgent && (
      (targetId && (targetId === '7QFBnEU9XxalOI6kl8csoTm58tE2' || targetId.toLowerCase().includes('chitsungo'))) ||
      (targetName && targetName.toLowerCase().includes('chitsungo')) ||
      (targetEmail && targetEmail.toLowerCase().includes('chitsungo'))
    )) return true;

    return false;
  };

  // 1. Calculate active voucher sales for this agent
  // Current cycle vouchers (strictly paid sales in current month)
  const currentCycleVouchers = vouchers.filter(v => {
    const isAgent = matchesAgent(v.assignedAgentId, v.assignedAgentName || (v as any).assignedTo, (v as any).assignedAgentEmail || (v as any).agentEmail) ||
                    matchesAgent((v as any).soldByAgentId, (v as any).soldByAgentName, (v as any).soldByAgentEmail);
    const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt;
    if (!isAgent || !isSold || v.reversalStatus === 'Approved' || !!v.reversedAt || isVoucherFree(v, (settings as any)?.giveawaySettings)) return false;
    const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate || v.createdAt;
    const vCycle = saleDate ? getCycleMonthFromDate(saleDate) : cycleMonth;
    return vCycle === cycleMonth;
  });
  const voucherSales = currentCycleVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, (settings as any)?.giveawaySettings), 0);

  // Previous cycle vouchers (historical record)
  const prevCycleVouchers = vouchers.filter(v => {
    const isAgent = matchesAgent(v.assignedAgentId, v.assignedAgentName || (v as any).assignedTo, (v as any).assignedAgentEmail || (v as any).agentEmail) ||
                    matchesAgent((v as any).soldByAgentId, (v as any).soldByAgentName, (v as any).soldByAgentEmail);
    const isSold = v.status === 'Sold' || (v.status as any) === 'sold' || (v.status as string)?.toLowerCase() === 'sold' || !!v.soldAt;
    if (!isAgent || !isSold || v.reversalStatus === 'Approved' || !!v.reversedAt || isVoucherFree(v, (settings as any)?.giveawaySettings)) return false;
    const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate || v.createdAt;
    const vCycle = saleDate ? getCycleMonthFromDate(saleDate) : null;
    return vCycle === prevCycleMonth;
  });
  const prevMonthVoucherSales = prevCycleVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, (settings as any)?.giveawaySettings), 0);

  // Previous month same-day sales (or daily average)
  const prevMonthTodayVouchers = prevCycleVouchers.filter(v => {
    const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate || v.createdAt;
    if (!saleDate) return false;
    const d = new Date(saleDate);
    return !isNaN(d.getTime()) && d.getDate() === todayDay;
  });
  let prevMonthTodaySales = prevMonthTodayVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, (settings as any)?.giveawaySettings), 0);

  // 2. Calculate active legacy device sales for this agent
  const isLdSold = (ld: LegacyDevice) => ld.status === 'SOLD' && ld.reversalStatus !== 'Approved' && !ld.reversedAt;
  const dedupedLegacy = deduplicateLegacyDevices(legacyDevices);
  const currentLegacy = dedupedLegacy.filter(ld => {
    if (!matchesAgent(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail) || !isLdSold(ld)) return false;
    const saleTime = ld.soldAt || ld.enrolledAt;
    const ldCycle = saleTime ? getCycleMonthFromDate(saleTime) : cycleMonth;
    return ldCycle === cycleMonth;
  });
  const legacySales = currentLegacy.reduce((sum, ld) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);

  const prevLegacy = dedupedLegacy.filter(ld => {
    if (!matchesAgent(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail) || !isLdSold(ld)) return false;
    const saleTime = ld.soldAt || ld.enrolledAt;
    const ldCycle = saleTime ? getCycleMonthFromDate(saleTime) : null;
    return ldCycle === prevCycleMonth;
  });
  const prevMonthLegacySales = prevLegacy.reduce((sum, ld) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);

  // Total cash collected by agent in CURRENT cycle (authoritatively tallies in real-time)
  let cashCollected = voucherSales + legacySales;

  // Today sales ledger calculation (current calendar day)
  const todayDateStr = date.toDateString();
  const todayIsoStr = date.toISOString().slice(0, 10);
  const todayVouchers = currentCycleVouchers.filter(v => {
    const saleDate = v.soldAt || (v as any).timestamp || (v as any).soldDate;
    if (!saleDate) return false;
    try {
      const d = new Date(saleDate);
      return !isNaN(d.getTime()) && (d.toDateString() === todayDateStr || saleDate.startsWith(todayIsoStr));
    } catch {
      return false;
    }
  });
  const todayVoucherSales = todayVouchers.reduce((sum, v) => sum + getVoucherMonetaryValue(v, (settings as any)?.giveawaySettings), 0);
  const todayLegacy = currentLegacy.filter(ld => {
    const saleDate = ld.soldAt || ld.enrolledAt;
    if (!saleDate) return false;
    try {
      const d = new Date(saleDate);
      return !isNaN(d.getTime()) && (d.toDateString() === todayDateStr || saleDate.startsWith(todayIsoStr));
    } catch {
      return false;
    }
  });
  const todayLegacySales = todayLegacy.reduce((sum, ld) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);
  const todaySalesTotal = todayVoucherSales + todayLegacySales;

  // Previous month overall sales (historical record)
  let prevMonthOverallSales = prevMonthVoucherSales + prevMonthLegacySales;

  if (prevMonthTodaySales === 0 && prevMonthOverallSales > 0) {
    const daysInPrevMonth = new Date(prevYear, prevMonthIndex + 1, 0).getDate();
    prevMonthTodaySales = Number((prevMonthOverallSales / daysInPrevMonth).toFixed(2));
  }

  // Commission rate (percentage)
  const commissionRate = agentOverride?.commissionRate !== undefined
    ? agentOverride.commissionRate
    : safeAgent.commissionRate !== undefined
    ? safeAgent.commissionRate
    : settings.defaultCommissionRate ?? 10;

  // Total commission earned this cycle strictly calculated from cash collected
  const commissionEarned = Number((cashCollected * (commissionRate / 100)).toFixed(2));
  const prevMonthCommission = Number((prevMonthOverallSales * (commissionRate / 100)).toFixed(2));

  // 3. Closed cash (sum of all approved, reconciled and pending cash drops for this agent)
  const agentDrops = cashDrops.filter(cd => matchesAgent(cd.agentId, cd.agentName, (cd as any).agentEmail));
  const currentCycleDrops = agentDrops.filter(cd => {
    const dCycle = cd.cycleMonth || getCycleMonthFromDate(cd.timestamp);
    return dCycle === cycleMonth;
  });
  const prevCycleDrops = agentDrops.filter(cd => {
    const dCycle = cd.cycleMonth || getCycleMonthFromDate(cd.timestamp);
    return dCycle !== cycleMonth;
  });

  // Calculate closed cash strictly from valid drops submitted or approved for this agent in the CURRENT cycle
  const currentCycleClosedSum = currentCycleDrops
    .filter(isDropValidForClosedCash)
    .reduce((sum, cd) => sum + (cd.amount || 0), 0);

  const allAgentClosedSum = agentDrops
    .filter(isDropValidForClosedCash)
    .reduce((sum, cd) => sum + (cd.amount || 0), 0);

  let rawClosedCash = currentCycleClosedSum;

  let lifetimeClosedCash = agentDrops
    .filter(isDropValidForClosedCash)
    .reduce((sum, cd) => sum + (cd.amount || 0), 0);

  // All closed cash including pending drops across all time for authoritative reconciliation
  const allClosedCashWithPending = agentDrops
    .filter(isDropValidForClosedCash)
    .reduce((sum, cd) => sum + (cd.amount || 0), 0);

  // All-time sales across all cycles
  const allTimeVouchersSales = vouchers.filter(v => {
    const isAgent = matchesAgent(v.assignedAgentId, v.assignedAgentName || (v as any).assignedTo, (v as any).assignedAgentEmail || (v as any).agentEmail) ||
                    matchesAgent((v as any).soldByAgentId, (v as any).soldByAgentName, (v as any).soldByAgentEmail);
    const isSold = String(v.status).toLowerCase() === 'sold';
    return isAgent && isSold && v.reversalStatus !== 'Approved' && !v.reversedAt && !isVoucherFree(v, (settings as any)?.giveawaySettings);
  }).reduce((sum, v) => sum + getVoucherMonetaryValue(v, (settings as any)?.giveawaySettings), 0);
  const allTimeLegacySales = dedupedLegacy.filter(ld => {
    return matchesAgent(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail) && isLdSold(ld);
  }).reduce((sum, ld) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);
  const totalLifetimeSales = allTimeVouchersSales + allTimeLegacySales;
  const totalNetUnclosed = Math.max(0, Number((totalLifetimeSales - allClosedCashWithPending).toFixed(2)));

  let prevMonthClosedCash = prevCycleDrops
    .filter(cd => {
      const dCycle = cd.cycleMonth || getCycleMonthFromDate(cd.timestamp);
      return dCycle === prevCycleMonth && isDropValidForClosedCash(cd);
    })
    .reduce((sum, cd) => sum + (cd.amount || 0), 0);

  // Unclosed cash from previous sales cycle
  let rawPrevUnclosed = Math.max(0, prevMonthOverallSales - prevMonthClosedCash);

  // Check drops where unclosed cash from previous cycle was attached
  const dropsWithAttachedPrev = agentDrops.filter(cd => (cd.attachedPrevCycleUnclosedCash || 0) > 0);
  const attachedAndApproved = dropsWithAttachedPrev
    .filter(isDropApprovedOrReconciled)
    .reduce((sum, cd) => sum + (cd.attachedPrevCycleUnclosedCash || 0), 0);
  const attachedPending = dropsWithAttachedPrev
    .filter(isDropPending)
    .reduce((sum, cd) => sum + (cd.attachedPrevCycleUnclosedCash || 0), 0);

  // Current cycle cash drops in excess of current cycle sales also offset previous cycle unclosed cash
  const currentCycleTotalClosed = currentCycleDrops
    .filter(isDropValidForClosedCash)
    .reduce((sum, cd) => sum + (cd.amount || 0), 0);
  const excessCurrentCycleClosed = Math.max(0, currentCycleTotalClosed - cashCollected);

  // Net unclosed cash from previous cycle remaining to be closed (strictly 0 if total lifetime net unclosed is 0)
  let unclosedCashFromPrevCycle = 0;
  if (totalNetUnclosed > 0.01) {
    const rawNetPrev = Math.max(0, rawPrevUnclosed - attachedAndApproved - attachedPending - excessCurrentCycleClosed);
    unclosedCashFromPrevCycle = Math.min(totalNetUnclosed, Math.max(0, Number(rawNetPrev.toFixed(2))));
  }
  const hasUnclosedCashFromPrevCycle = unclosedCashFromPrevCycle > 0.01;
  const unclosedCommissionFromPrevCycle = Number((unclosedCashFromPrevCycle * (commissionRate / 100)).toFixed(2));

  // Attached previous cycle commission
  const attachedPrevCommissionApproved = dropsWithAttachedPrev
    .filter(isDropApprovedOrReconciled)
    .reduce((sum, cd) => cd.attachedPrevCycleCommission || ((cd.attachedPrevCycleUnclosedCash || 0) * (commissionRate / 100)), 0);

  let prevCycleUnclosedAttachedStatus: 'none' | 'pending' | 'closed' = 'none';
  if (rawPrevUnclosed > 0) {
    if (unclosedCashFromPrevCycle <= 0.01) {
      prevCycleUnclosedAttachedStatus = 'closed';
    } else if (attachedPending > 0) {
      prevCycleUnclosedAttachedStatus = 'pending';
    }
  }

  // Cap closed cash so duplicate/unintended submissions never double-up beyond total cash collected (if sales exist)
  const closedCash = cashCollected > 0 ? Math.min(cashCollected, rawClosedCash) : rawClosedCash;

  // Closed commission matching the closed cash
  const closedCommission = Number((closedCash * (commissionRate / 100)).toFixed(2));

  // Remaining cash carried over (must strictly match cashCollected - closedCash with 0 discrepancy)
  const remainingCash = Math.max(0, Number((cashCollected - closedCash).toFixed(2)));

  // Remaining equivalent agent commission
  const remainingCommission = Number((remainingCash * (commissionRate / 100)).toFixed(2));

  // Approval status breakdown
  const approvedDrops = currentCycleDrops.filter(isDropApprovedOrReconciled);
  const pendingDrops = currentCycleDrops.filter(isDropPending);
  const approvedCash = approvedDrops.reduce((sum, cd) => sum + (cd.amount || 0), 0);
  const pendingCash = pendingDrops.reduce((sum, cd) => sum + (cd.amount || 0), 0);
  const hasPendingApproval = pendingDrops.length > 0;
  const hasApprovedDrop = approvedDrops.length > 0;

  // 4. Check admin pending requests
  const pendingAdminDrop = currentCycleDrops.find(
    cd => isDropPending(cd) && cd.requestedBy === 'WorkspaceMaster'
  );
  const hasAdminRequest = !!pendingAdminDrop || !!agentOverride?.isCashCloseRequested;

  // 5. Permissibility checks & cycle closes quota
  const currentCycleClosesCount = currentCycleDrops.filter(isDropValidForClosedCash).length;

  const agentMaxCloses = agentOverride?.maxClosesPerCycle !== undefined
    ? agentOverride.maxClosesPerCycle
    : (settings.maxClosesPerCycle !== undefined ? settings.maxClosesPerCycle : null);

  const effectivePrevAttachmentMode: 'optional' | 'mandatory' = agentOverride?.requirePrevCycleAttachment === 'mandatory'
    ? 'mandatory'
    : agentOverride?.requirePrevCycleAttachment === 'optional'
    ? 'optional'
    : (settings.prevCycleAttachmentMode || 'optional');

  const daysUntilMonthEnd = getDaysUntilMonthEnd(date);
  const allowedDays = agentOverride?.allowedDaysBeforeMonthEnd ?? settings.allowedDaysBeforeMonthEnd ?? 2;
  const permissibleCheck = isCashClosePermissible(agentId, settings, hasAdminRequest, date, currentCycleClosesCount);

  // Final cash close is complete if remaining unclosed cash is 0 and at least one close drop exists or cashCollected is matched
  // In a fresh sales cycle (beginning of month), if no sales yet, final cash close is not active
  const isFinalCashCloseDone = (cashCollected > 0 && closedCash >= cashCollected) || 
    (daysUntilMonthEnd === 0 && (closedCash > 0 || currentCycleDrops.length > 0) && remainingCash <= 0.01) ||
    (currentCycleDrops.some(isDropApprovedOrReconciled) && remainingCash <= 0.01);

  return {
    agentId,
    agentName: safeAgent.name,
    agentLocation: safeAgent.location,
    cycleMonth,
    cashCollected,
    commissionRate,
    commissionEarned,
    closedCash,
    closedCommission,
    remainingCash,
    remainingCommission,
    minCashCloseAmount: agentOverride?.minCashCloseAmount ?? settings.minCashCloseAmount ?? 10,
    allowedDaysBeforeMonthEnd: allowedDays,
    daysUntilMonthEnd,
    isPermissibleNow: permissibleCheck.isPermissible,
    isFinalDay: daysUntilMonthEnd === 0,
    permissibleOpensDate: getPermissibleWindowOpensDate(allowedDays, date),
    hasAdminRequest,
    adminRequestAmount: pendingAdminDrop?.amount ?? agentOverride?.requestedAmount,
    adminRequestNotes: pendingAdminDrop?.notes ?? agentOverride?.requestedNotes,
    isFinalCashCloseDone,
    hasPendingApproval,
    hasApprovedDrop,
    approvedCash,
    pendingCash,
    prevCycleMonth,
    prevMonthOverallSales,
    prevMonthCommission,
    prevMonthClosedCash,
    prevMonthTodaySales,
    unclosedCashFromPrevCycle,
    hasUnclosedCashFromPrevCycle,
    prevCycleUnclosedAttachedStatus,
    unclosedCommissionFromPrevCycle,
    attachedPrevCycleCommission: attachedPrevCommissionApproved,
    lifetimeClosedCash,
    currentCycleClosesCount,
    maxClosesPerCycle: agentMaxCloses,
    closesRemaining: permissibleCheck.closesRemaining,
    dailySalesTotal: todaySalesTotal,
    overallSales: totalLifetimeSales,
    prevCycleAttachmentMode: effectivePrevAttachmentMode
  };
}

/**
 * Aggregates cash and commission across all active workspace agents.
 */
export function getWorkspaceSalesCycleAggregate(
  agents: UserProfile[],
  vouchers: Voucher[],
  legacyDevices: LegacyDevice[],
  cashDrops: CashDrop[],
  settings: WorkspaceCashCloseSettings = DEFAULT_CASH_CLOSE_SETTINGS,
  date: Date = new Date(),
  targetWorkspaceId?: string
): WorkspaceSalesCycleAggregate {
  const cycleMonth = getCurrentCycleMonth(date);
  const daysUntilMonthEnd = getDaysUntilMonthEnd(date);

  const wsId = targetWorkspaceId || agents[0]?.workspaceId;
  const scopedAgents = wsId && wsId !== 'ALL'
    ? (agents || []).filter(a => !a.workspaceId || a.workspaceId === wsId)
    : (agents || []);

  const agentUids = new Set(scopedAgents.map(a => a.uid).filter(Boolean));
  const agentNames = new Set(scopedAgents.map(a => (a.name || '').toLowerCase().trim()).filter(Boolean));
  const agentEmails = new Set(scopedAgents.map(a => (a.email || '').toLowerCase().trim()).filter(Boolean));

  const isAgentInWorkspace = (agentId?: string, agentName?: string, agentEmail?: string) => {
    if (!agentId && !agentName && !agentEmail) return false;
    const cleanId = (agentId || '').trim();
    const cleanN = (agentName || '').trim().toLowerCase();
    const cleanE = (agentEmail || '').trim().toLowerCase();
    if (cleanId && agentUids.has(cleanId)) return true;
    if (cleanN && agentNames.has(cleanN)) return true;
    if (cleanE && agentEmails.has(cleanE)) return true;
    if (cleanN) {
      if (cleanN.includes('histec') && Array.from(agentNames).some(n => n.includes('histec'))) return true;
      if (cleanN.includes('mukondodzi') && Array.from(agentNames).some(n => n.includes('mukondodzi'))) return true;
      if (cleanN.includes('chitsungo') && Array.from(agentNames).some(n => n.includes('chitsungo'))) return true;
    }
    return false;
  };

  const scopedVouchers = wsId && wsId !== 'ALL'
    ? (vouchers || []).filter(v => {
        const vWs = (v as any).workspaceId || (v as any).workspace_id;
        if (vWs && vWs !== 'system') {
          if (vWs === wsId) return true;
        }
        if (isAgentInWorkspace(v.assignedAgentId, v.assignedAgentName || (v as any).assignedTo, (v as any).assignedAgentEmail || (v as any).agentEmail)) return true;
        if (isAgentInWorkspace((v as any).soldByAgentId, (v as any).soldByAgentName, (v as any).soldByAgentEmail)) return true;
        return !vWs;
      })
    : (vouchers || []);

  const scopedLegacy = wsId && wsId !== 'ALL'
    ? (legacyDevices || []).filter(ld => {
        const ldWs = ld.workspaceId;
        if (ldWs && ldWs !== 'system') {
          if (ldWs === wsId) return true;
        }
        if (isAgentInWorkspace(ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail)) return true;
        return !ldWs;
      })
    : (legacyDevices || []);

  const scopedDrops = wsId && wsId !== 'ALL'
    ? (cashDrops || []).filter(cd => {
        const cdWs = cd.workspaceId;
        if (cdWs && cdWs !== 'system') {
          if (cdWs === wsId) return true;
        }
        if (isAgentInWorkspace(cd.agentId, cd.agentName, (cd as any).agentEmail)) return true;
        return !cdWs;
      })
    : (cashDrops || []);

  const agentMetrics = scopedAgents.map(agent =>
    getAgentSalesCycleMetrics(agent, scopedVouchers, scopedLegacy, scopedDrops, settings, date)
  );

  const totalCashCollected = agentMetrics.reduce((sum, m) => sum + m.cashCollected, 0);
  const totalClosedCash = agentMetrics.reduce((sum, m) => sum + m.closedCash, 0);
  const totalRemainingCash = agentMetrics.reduce((sum, m) => sum + m.remainingCash, 0);
  const totalCommissionEarned = agentMetrics.reduce((sum, m) => sum + m.commissionEarned, 0);
  const totalClosedCommission = agentMetrics.reduce((sum, m) => sum + m.closedCommission, 0);
  const totalRemainingCommission = agentMetrics.reduce((sum, m) => sum + m.remainingCommission, 0);
  const totalUnclosedPrevCycle = agentMetrics.reduce((sum, m) => sum + (m.unclosedCashFromPrevCycle || 0), 0);

  return {
    cycleMonth,
    totalCashCollected,
    totalClosedCash,
    totalRemainingCash,
    totalCommissionEarned,
    totalClosedCommission,
    totalRemainingCommission,
    totalUnclosedPrevCycle,
    agentMetrics,
    daysUntilMonthEnd,
    isFinalDay: daysUntilMonthEnd === 0,
    allowedDaysBeforeMonthEnd: settings.allowedDaysBeforeMonthEnd ?? 2
  };
}
