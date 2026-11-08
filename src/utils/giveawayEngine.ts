import { Voucher, GiveawaySettings } from '../types';

export const DEFAULT_GIVEAWAY_SETTINGS: GiveawaySettings = {
  isEnabled: false,
  dailyLimitPerAgent: 5,
  freePlanNames: [],
  allowCustomGiftVouchers: true,
  notes: 'Free customer promotional giveaway program'
};

/**
 * Normalizes plan strings for robust comparison across formats (e.g. "1 Hour", "1hr_4GB", "1 hour (4gb)")
 */
export function normalizePlanName(plan: string | undefined | null): string {
  if (!plan) return '';
  return plan.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Determines whether a plan name is currently marked or classified as a free giveaway plan.
 * Standard catalog paid plans (23GB, 15GB, 6GB, 32GB, 45GB, 1 Hour, etc.) are NEVER classified as free plans.
 */
export function isPlanMarkedFree(plan: string | undefined | null, settings?: GiveawaySettings | null): boolean {
  if (!plan) return false;

  const targetNorm = normalizePlanName(plan);
  if (!targetNorm) return false;

  // 1. Single Source of Truth: Check explicitly configured freePlanNames in Workspace Admin Giveaway Settings
  if (settings?.isEnabled && Array.isArray(settings.freePlanNames) && settings.freePlanNames.length > 0) {
    const matched = settings.freePlanNames.some(p => {
      const pNorm = normalizePlanName(p);
      return pNorm && pNorm === targetNorm;
    });
    if (matched) return true;
  }

  // 2. Keyword detection ONLY for explicitly labeled gift names
  const lower = plan.toLowerCase().trim();
  if (
    lower === 'free gift' ||
    lower === 'free_gift' ||
    lower === 'gift_voucher' ||
    lower === 'promo_gift' ||
    targetNorm === 'freegift' ||
    targetNorm === 'giftvoucher' ||
    targetNorm === 'freevoucher'
  ) {
    return true;
  }

  return false;
}

/**
 * Standard Catalog Price Map for known WiVoTe voucher plans.
 */
export const STANDARD_PLAN_CATALOG_PRICES: Record<string, number> = {
  'month_23gb': 5.00,
  '23gb': 5.00,
  '2_weeks_15gb': 3.00,
  '15gb': 3.00,
  '2hrs_6gb': 1.00,
  '6gb': 1.00,
  'month_32gb': 7.00,
  '32gb': 7.00,
  'month_45gb': 10.00,
  '45gb': 10.00,
  '1_month': 5.00,
  'monthly': 5.00,
  '30_days': 5.00,
  '2_weeks': 3.00,
  '14_days': 3.00,
  '1_week': 2.00,
  '7_days': 2.00,
  '3_days': 1.50,
  '24_hours': 1.00,
  'daily': 1.00,
  '1_day': 1.00,
  '2_hours': 1.00,
  '2hrs': 1.00,
  '1_hour': 0.50,
  '1hr': 0.50,
  '30m_2gb': 0.25,
  'gold': 35.00,
  'lithium': 75.00
};

/**
 * Resolves the true price of a ticket / voucher.
 * 1. Checks explicit numeric properties in order: price, amount, cost, ticketPrice, planPrice, soldPrice, pricePaid, originalPrice.
 * 2. If null/undefined or <= 0 (and not explicitly a free gift), falls back to standard catalog pricing.
 */
export function resolveTicketPrice(
  voucher: any,
  settings?: GiveawaySettings | null
): number {
  if (!voucher) return 0;

  // 1. Explicit free promotional gift
  if (isVoucherFree(voucher, settings)) return 0;

  // 2. Check explicit properties in order
  const candidates = [
    voucher.price,
    voucher.amount,
    voucher.cost,
    voucher.ticketPrice,
    voucher.planPrice,
    voucher.soldPrice,
    voucher.pricePaid,
    voucher.originalPrice
  ];

  for (const cand of candidates) {
    if (cand !== undefined && cand !== null && cand !== '') {
      const num = Number(cand);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }

  // 3. Fallback to catalog lookup based on plan name / planId / plan
  const rawPlan = voucher.plan || voucher.planId || voucher.planName || voucher.name;
  if (rawPlan) {
    const norm = String(rawPlan).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (STANDARD_PLAN_CATALOG_PRICES[norm] !== undefined) {
      return STANDARD_PLAN_CATALOG_PRICES[norm];
    }
    if (norm.includes('month23gb') || norm.includes('23gb')) return 5.00;
    if (norm.includes('2weeks15gb') || norm.includes('15gb')) return 3.00;
    if (norm.includes('2hrs6gb') || norm.includes('6gb')) return 1.00;
    if (norm.includes('month32gb') || norm.includes('32gb')) return 7.00;
    if (norm.includes('month45gb') || norm.includes('45gb')) return 10.00;
    if (norm.includes('month') || norm.includes('30day')) return 5.00;
    if (norm.includes('2week') || norm.includes('14day')) return 3.00;
    if (norm.includes('1week') || norm.includes('7day')) return 2.00;
    if (norm.includes('24hr') || norm.includes('1day') || norm.includes('daily')) return 1.00;
    if (norm.includes('2hr') || norm.includes('2hours')) return 1.00;
    if (norm.includes('1hr') || norm.includes('1hour')) return 0.50;
    if (norm.includes('30m') || norm.includes('2gb')) return 0.25;
  }

  return 0;
}

/**
 * Checks whether a specific voucher is classified as a free giveaway voucher.
 * A voucher is free if AND ONLY IF:
 * 1. It is explicitly marked `isFree: true` or `isGift: true`
 * 2. It was gifted to a customer (`giftedAt`, `giftedByAgentId`)
 * 3. Its code or notes explicitly indicates a free promotional gift
 * 4. Its plan is explicitly designated as a free gift plan
 *
 * CRITICAL: Any voucher that has a positive price or catalog price (> $0.00) AND was not gifted is DEFINITIVELY NOT FREE!
 */
export function isVoucherFree(voucher: Voucher | undefined | null, settings?: GiveawaySettings | null): boolean {
  if (!voucher) return false;

  // 1. Explicit non-free flag
  if (
    voucher.isFree === false ||
    (voucher as any).isFree === 'false' ||
    (voucher as any).isFree === 0
  ) {
    return false;
  }

  // 2. Check explicit prices on the voucher object.
  // If ANY price candidate is > 0 (soldPrice, price, originalPrice, amount) AND the voucher was NOT gifted,
  // it is DEFINITIVELY A PAID SALE (NEVER FREE)!
  const numSoldPrice = voucher.soldPrice !== undefined && voucher.soldPrice !== null ? Number(voucher.soldPrice) : undefined;
  const numPrice = voucher.price !== undefined && voucher.price !== null ? Number(voucher.price) : undefined;
  const numOrigPrice = voucher.originalPrice !== undefined && voucher.originalPrice !== null ? Number(voucher.originalPrice) : undefined;

  const hasPositivePrice = (numSoldPrice !== undefined && !isNaN(numSoldPrice) && numSoldPrice > 0) ||
                           (numPrice !== undefined && !isNaN(numPrice) && numPrice > 0) ||
                           (numOrigPrice !== undefined && !isNaN(numOrigPrice) && numOrigPrice > 0);

  if (hasPositivePrice && !voucher.giftedAt && !voucher.giftedByAgentId) {
    if (!isPlanMarkedFree(voucher.plan, settings)) {
      return false;
    }
  }

  // 3. Inherent free flag on the voucher
  if (
    voucher.isFree === true ||
    (voucher as any).isFree === 'true' ||
    (voucher as any).isFree === 1 ||
    (voucher as any).isGift === true ||
    (voucher as any).isGift === 'true' ||
    (voucher as any).gift === true ||
    (voucher as any).free === true ||
    (voucher as any).type === 'gift' ||
    (voucher as any).type === 'free' ||
    (voucher as any).category === 'gift' ||
    (voucher as any).category === 'free'
  ) {
    return true;
  }

  // 4. Voucher was gifted
  if (voucher.giftedAt || voucher.giftedByAgentId || (voucher as any).giftedByAgentName) {
    return true;
  }

  // 5. Code explicitly denotes gift / free voucher
  const codeUpper = (voucher.code || '').toUpperCase().trim();
  if (
    codeUpper.startsWith('FREE-') ||
    codeUpper.startsWith('GIFT-') ||
    codeUpper.startsWith('PROMO-') ||
    codeUpper.includes('-FREE-') ||
    codeUpper.includes('-GIFT-')
  ) {
    return true;
  }

  // 6. Notes or loyaltyNotice explicitly indicates gift / free giveaway
  const notice = `${(voucher as any).loyaltyNotice || ''} ${(voucher as any).notes || ''}`.toLowerCase();
  if (
    notice.includes('free giveaway') ||
    notice.includes('gift voucher') ||
    notice.includes('customer gift') ||
    notice.includes('free gift')
  ) {
    return true;
  }

  // 7. Check if plan is explicitly designated as a free plan
  if (isPlanMarkedFree(voucher.plan, settings)) {
    return true;
  }

  return false;
}

/**
 * Counts how many free vouchers a specific agent has given away during today's calendar day.
 */
export function getAgentGiveawaysCountToday(
  agentId: string,
  vouchers: Voucher[],
  settings?: GiveawaySettings | null
): number {
  if (!agentId || !Array.isArray(vouchers)) return 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  return vouchers.filter(v => {
    if (v.status !== 'Sold') return false;
    
    // Check if the voucher was sold/gifted today
    const soldDateMs = v.soldAt ? new Date(v.soldAt).getTime() : 0;
    const giftedDateMs = v.giftedAt ? new Date(v.giftedAt).getTime() : 0;
    const effectiveDateMs = giftedDateMs || soldDateMs;

    if (!effectiveDateMs || effectiveDateMs < startOfTodayMs) return false;

    // Check if attributed to this agent
    const isThisAgent = v.assignedAgentId === agentId || v.giftedByAgentId === agentId || (v as any).soldByAgentId === agentId;
    if (!isThisAgent) return false;

    // Check if it was a free giveaway
    const isFreeSale = v.isFree === true || v.soldPrice === 0 || (v.discountApplied && v.discountApplied >= v.price);
    const wasFreePlan = isPlanMarkedFree(v.plan, settings);

    return isFreeSale || wasFreePlan;
  }).length;
}

/**
 * Evaluates whether an agent can give away another free voucher today.
 */
export function canAgentGiveaway(
  agentId: string,
  vouchers: Voucher[],
  settings?: GiveawaySettings | null
): {
  allowed: boolean;
  remaining: number;
  usedToday: number;
  dailyLimit: number;
  reason?: string;
} {
  const dailyLimit = settings?.dailyLimitPerAgent ?? 5;

  if (!settings || !settings.isEnabled) {
    return {
      allowed: false,
      remaining: 0,
      usedToday: 0,
      dailyLimit,
      reason: 'Free voucher gifting is currently turned OFF by Admin.'
    };
  }

  const usedToday = getAgentGiveawaysCountToday(agentId, vouchers, settings);
  const remaining = Math.max(0, dailyLimit - usedToday);

  if (usedToday >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      usedToday,
      dailyLimit,
      reason: `Daily giveaway limit reached (${usedToday}/${dailyLimit}). Admin allows ${dailyLimit} giveaways per agent per day.`
    };
  }

  return {
    allowed: true,
    remaining,
    usedToday,
    dailyLimit
  };
}

/**
 * Filters vouchers for inventory calculations.
 * Excludes vouchers marked as free or under free plans so they do not count in inventory.
 */
export function filterInventoryVouchers(
  vouchers: Voucher[],
  settings?: GiveawaySettings | null,
  excludeFree: boolean = true
): Voucher[] {
  if (!Array.isArray(vouchers)) return [];
  if (!excludeFree) return vouchers;
  return vouchers.filter(v => !isVoucherFree(v, settings));
}

/**
 * Returns the true monetary revenue / price of a voucher.
 * Free promotional gift vouchers ALWAYS return $0.00.
 * Sold vouchers return their resolved price.
 */
export function getVoucherMonetaryValue(
  voucher: Voucher | undefined | null,
  settings?: GiveawaySettings | null
): number {
  if (!voucher) return 0;
  if (isVoucherFree(voucher, settings)) return 0;
  return resolveTicketPrice(voucher, settings);
}

/**
 * Validates whether a voucher represents a paid sale (not a free giveaway).
 */
export function isPaidVoucherSale(
  voucher: Voucher | undefined | null,
  settings?: GiveawaySettings | null
): boolean {
  if (!voucher || voucher.status !== 'Sold') return false;
  if (isVoucherFree(voucher, settings)) return false;
  return getVoucherMonetaryValue(voucher, settings) > 0;
}

/**
 * Retrieves all available free vouchers for an agent to dispense.
 * Splits into agent's assigned stock and unassigned workspace pool.
 */
export function getAvailableFreeGiftVouchers(
  vouchers: Voucher[],
  agentId?: string,
  settings?: GiveawaySettings | null
): {
  myAssignedFree: Voucher[];
  workspacePoolFree: Voucher[];
  allAvailableFree: Voucher[];
} {
  if (!Array.isArray(vouchers)) {
    return { myAssignedFree: [], workspacePoolFree: [], allAvailableFree: [] };
  }

  const myAssignedFree = vouchers.filter(v => {
    if (v.status !== 'Assigned') return false;
    if (agentId && v.assignedAgentId !== agentId) return false;
    return isVoucherFree(v, settings);
  });

  const workspacePoolFree = vouchers.filter(v => {
    if (v.status !== 'Unused') return false;
    if (v.assignedAgentId) return false;
    return isVoucherFree(v, settings);
  });

  return {
    myAssignedFree,
    workspacePoolFree,
    allAvailableFree: [...myAssignedFree, ...workspacePoolFree]
  };
}
