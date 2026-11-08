import { Customer, CustomerPurchaseRecord, LoyaltySettings, LoyaltyTierRule } from '../types';
import { fuzzySearchCustomers } from './fuzzySearch';

/**
 * System-Wide Genius Loyalty Program Calculation & State Engine
 * Enforces strict multi-agent workspace synchronization, automated CN:01+ generation,
 * tiered consecutive discounts, mixed voucher progression, and celebratory countdowns.
 */

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  isEnabled: true,
  minQualifyingPrice: 3.0, // Vouchers lower than $3 do not qualify for reward
  enforceCustomerDetailsOnSale: false, // Default: detail input is default, but skippable with confirmation
  tierRules: [
    { price: 3, requiredConsecutive: 2, discountedPrice: 2 }, // Buy $3 x2 -> 3rd at $2 ($1 reward)
    { price: 5, requiredConsecutive: 2, discountedPrice: 4 }, // Buy $5 x2 -> 3rd at $4 ($1 reward)
    { price: 7, requiredConsecutive: 2, discountedPrice: 5 }, // Buy $7 x2 -> 3rd at $5 ($2 super reward)
    { price: 10, requiredConsecutive: 2, discountedPrice: 8 }, // Buy $10 x2 -> 3rd at $8 ($2 super reward)
  ],
  mixedRule: {
    minPrice: 3.0,
    requiredConsecutive: 3, // Buy 3 mixed from $3+ -> 4th at $1 discount
    discountAmount: 1.0,
  },
  countdownTemplate: '{remaining} to go! Next time get it for ${nextPrice}',
  regularRewardText: '🎉 Genius Customer Reward: $1.00 Off',
  superRewardText: '🌟 Super Genius Loyalty Reward: $2.00 Off!',
};

export interface NextPurchaseEstimate {
  willBeRewarded: boolean;
  estimatedDiscount: number;
  estimatedPrice: number;
  message: string;
}

export interface LoyaltyEvaluation {
  isEligibleForReward: boolean;
  discountAmount: number;
  finalPrice: number;
  originalPrice: number;
  rewardType: 'none' | 'regular' | 'super';
  rewardMessage: string;
  countdownNotice: string;
  remainingUntilReward: number;
  currentStreakCount: number;
  isMixedStreak: boolean;
  nextPurchaseEstimate: NextPurchaseEstimate;
  tierRuleMatched?: LoyaltyTierRule;
}

/**
 * Auto-generates the next sequential Customer Number (e.g. "CN:01", "CN:02", ...)
 * Reclaims the lowest free/deleted customer number slot to prevent sequence jumping.
 * Guarantees that no two different customers share the same customer number.
 */
export function getNextCustomerNumber(existingCustomers: Customer[], excludeCustomerId?: string): string {
  if (!existingCustomers || existingCustomers.length === 0) {
    return 'CN:01';
  }

  const occupiedNumbers = new Set<number>();
  for (const c of existingCustomers) {
    if (excludeCustomerId && c.id === excludeCustomerId) continue;
    if (!c.customerNumber) continue;
    const match = c.customerNumber.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > 0) {
        occupiedNumbers.add(num);
      }
    }
  }

  // Find the lowest positive integer not currently occupied
  let freeNum = 1;
  while (occupiedNumbers.has(freeNum)) {
    freeNum++;
  }

  return `CN:${String(freeNum).padStart(2, '0')}`;
}

/**
 * Checks if a given customer number is already occupied by a different customer.
 */
export function isCustomerNumberTaken(
  customerNumber: string,
  existingCustomers: Customer[],
  excludeCustomerId?: string
): boolean {
  if (!customerNumber || !existingCustomers) return false;
  const cleanTarget = customerNumber.trim().toLowerCase();
  if (!cleanTarget) return false;

  return existingCustomers.some(c => {
    if (excludeCustomerId && c.id === excludeCustomerId) return false;
    return (c.customerNumber || '').trim().toLowerCase() === cleanTarget;
  });
}

/**
 * Extracts only the active cycle qualifying purchases since the last redeemed reward.
 * Resets whenever a reward was redeemed (discountApplied > 0).
 */
export function getActiveCycleConsecutivePurchases(
  purchases: CustomerPurchaseRecord[] = [],
  minQualifyingPrice: number = 3.0
): CustomerPurchaseRecord[] {
  if (!Array.isArray(purchases) || purchases.length === 0) return [];
  // Sort chronologically
  const sorted = [...purchases].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Find index of most recent rewarded purchase (where discount was applied)
  let lastRewardIndex = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((sorted[i].discountApplied || 0) > 0) {
      lastRewardIndex = i;
      break;
    }
  }

  // Purchases strictly after the most recent rewarded purchase
  const activeCycle = lastRewardIndex >= 0 ? sorted.slice(lastRewardIndex + 1) : sorted;
  return activeCycle.filter(p => Math.max(p.originalPrice || 0, p.price || 0) >= minQualifyingPrice);
}

/**
 * Calculates a valid, normalized streak count for a customer (never exceeding reward cycle threshold).
 */
export function calculateActiveStreakCount(
  customer: Partial<Customer> | null | undefined,
  minQualifyingPrice: number = 3.0,
  maxCycleStreak: number = 3
): number {
  if (!customer) return 0;
  const active = getActiveCycleConsecutivePurchases(customer.consecutivePurchases, minQualifyingPrice);
  if (active.length > 0) {
    return Math.min(active.length, maxCycleStreak);
  }
  const rawStreak = customer.streakCount || 0;
  // If raw streak is inflated (e.g. 14), normalize to max cycle progress
  if (rawStreak > maxCycleStreak) {
    // If multiple cycles passed without recorded discount, modulo or cap
    const normalized = rawStreak % (maxCycleStreak + 1);
    return Math.min(normalized, maxCycleStreak);
  }
  return Math.max(0, rawStreak);
}

/**
 * Evaluates the loyalty status of a customer against a prospective voucher sale
 */
export function evaluateCustomerLoyalty(
  customer: Customer | null | undefined,
  currentPrice: number,
  settings: LoyaltySettings = DEFAULT_LOYALTY_SETTINGS
): LoyaltyEvaluation {
  const originalPrice = currentPrice;

  // 1. If loyalty program is turned off or price is lower than qualifying threshold ($3)
  if (!settings.isEnabled || currentPrice < settings.minQualifyingPrice) {
    const isUnderThreshold = currentPrice < settings.minQualifyingPrice;
    const currentCustomerStreak = calculateActiveStreakCount(customer, settings.minQualifyingPrice, settings.mixedRule.requiredConsecutive);
    return {
      isEligibleForReward: false,
      discountAmount: 0,
      finalPrice: currentPrice,
      originalPrice,
      rewardType: 'none',
      rewardMessage: '',
      countdownNotice: isUnderThreshold
        ? `Vouchers under $${settings.minQualifyingPrice.toFixed(2)} do not qualify for loyalty rewards`
        : 'Loyalty program is disabled',
      remainingUntilReward: 0,
      currentStreakCount: currentCustomerStreak,
      isMixedStreak: false,
      nextPurchaseEstimate: {
        willBeRewarded: false,
        estimatedDiscount: 0,
        estimatedPrice: currentPrice,
        message: 'No discount eligible',
      },
    };
  }

  // Active cycle consecutive purchases strictly since last reward and >= min qualifying price
  const activePurchases = getActiveCycleConsecutivePurchases(
    customer?.consecutivePurchases,
    settings.minQualifyingPrice
  );
  let consecutive = [...activePurchases];

  // If customer has a recorded streak count within valid limits, honor it
  const maxAllowableStreak = Math.max(
    settings.mixedRule.requiredConsecutive,
    ...settings.tierRules.map(r => r.requiredConsecutive)
  );
  const normalizedRecordedStreak = calculateActiveStreakCount(customer, settings.minQualifyingPrice, maxAllowableStreak);
  if (consecutive.length < normalizedRecordedStreak) {
    const missing = normalizedRecordedStreak - consecutive.length;
    const synthRecords: CustomerPurchaseRecord[] = Array.from({ length: missing }, (_, i) => ({
      id: `synth_strk_${i}`,
      voucherId: `synth_v_${i}`,
      voucherCode: `STRK-${i + 1}`,
      price: currentPrice >= settings.minQualifyingPrice ? currentPrice : settings.minQualifyingPrice,
      discountApplied: 0,
      originalPrice: currentPrice >= settings.minQualifyingPrice ? currentPrice : settings.minQualifyingPrice,
      timestamp: Date.now() - (missing - i) * 60000,
      agentId: 'system',
      agentName: 'System',
      plan: 'Qualifying Voucher Plan'
    }));
    consecutive = [...synthRecords, ...consecutive];
  }

  // 2. Check Similar Voucher Tier Rules (e.g. $3, $5, $7, $10)
  const matchedRule = settings.tierRules.find(
    (r) => Math.abs(r.price - currentPrice) < 0.01
  );

  if (matchedRule) {
    // Count how many trailing consecutive purchases in the current cycle match this exact price
    let samePriceCount = 0;
    for (let i = consecutive.length - 1; i >= 0; i--) {
      if (Math.abs(consecutive[i].price - currentPrice) < 0.01) {
        samePriceCount++;
      } else {
        break; // Streak broken for identical price
      }
    }

    // Is reward unlocked for this purchase?
    // e.g. Customer buys $10 for 2 consecutive times -> 3rd purchase unlocks discounted price ($8)
    if (samePriceCount >= matchedRule.requiredConsecutive) {
      const discount = Math.max(0, currentPrice - matchedRule.discountedPrice);
      const isSuperReward = discount >= 2.0; // $1 discount is reward, $2 is super reward
      const rewardType: 'regular' | 'super' = isSuperReward ? 'super' : 'regular';
      const rewardMessage = isSuperReward ? settings.superRewardText : settings.regularRewardText;

      return {
        isEligibleForReward: true,
        discountAmount: discount,
        finalPrice: matchedRule.discountedPrice,
        originalPrice,
        rewardType,
        rewardMessage,
        countdownNotice: `0 to go • ${rewardMessage}`,
        remainingUntilReward: 0,
        currentStreakCount: samePriceCount,
        isMixedStreak: false,
        tierRuleMatched: matchedRule,
        nextPurchaseEstimate: {
          willBeRewarded: false,
          estimatedDiscount: 0,
          estimatedPrice: currentPrice,
          message: 'Cycle resets after this rewarded voucher. Next purchase starts fresh cycle.',
        },
      };
    }

    // Not yet rewarded on this purchase: calculate countdown & next purchase indication
    // After buying this token, how many will they have?
    const afterThisPurchaseCount = samePriceCount + 1;
    const remainingAfterThis = Math.max(0, matchedRule.requiredConsecutive - afterThisPurchaseCount);

    let tierCountdownNotice = '';
    let tierNextEstimate: NextPurchaseEstimate;

    if (afterThisPurchaseCount >= matchedRule.requiredConsecutive) {
      // This purchase is the LAST token before their discount!
      // "On the last token before their discount. Indicate the amount they will pay next time they buy. E.g next time get it for $8."
      tierCountdownNotice = `1 to go! Next time get it for $${matchedRule.discountedPrice.toFixed(2)}!`;
      tierNextEstimate = {
        willBeRewarded: true,
        estimatedDiscount: currentPrice - matchedRule.discountedPrice,
        estimatedPrice: matchedRule.discountedPrice,
        message: `Next time get it for $${matchedRule.discountedPrice.toFixed(2)}! (0 to go then Reward)`,
      };
    } else {
      const remainingNow = Math.max(0, matchedRule.requiredConsecutive - samePriceCount);
      tierCountdownNotice = `${remainingNow} to go! Buy ${matchedRule.requiredConsecutive} consecutive times to unlock $${matchedRule.discountedPrice.toFixed(2)} price`;
      tierNextEstimate = {
        willBeRewarded: false,
        estimatedDiscount: 0,
        estimatedPrice: currentPrice,
        message: `${remainingAfterThis} more to go before $${matchedRule.discountedPrice.toFixed(2)} reward`,
      };
    }

    return {
      isEligibleForReward: false,
      discountAmount: 0,
      finalPrice: currentPrice,
      originalPrice,
      rewardType: 'none',
      rewardMessage: '',
      countdownNotice: tierCountdownNotice,
      remainingUntilReward: Math.max(0, matchedRule.requiredConsecutive - samePriceCount),
      currentStreakCount: samePriceCount,
      isMixedStreak: false,
      tierRuleMatched: matchedRule,
      nextPurchaseEstimate: tierNextEstimate,
    };
  }

  // 3. Mixed / Non-Similar Vouchers Rule (from $3 upwards)
  // "Buy mixed/non-similar vouchers consecutively from $3 upwards for 3 times and get a $1 discount the 4th time."
  const mixedStreakCount = consecutive.length;

  if (mixedStreakCount >= settings.mixedRule.requiredConsecutive) {
    // 4th purchase: Reward unlocked!
    const discount = Math.min(settings.mixedRule.discountAmount, currentPrice);
    const finalPrice = Math.max(0, currentPrice - discount);
    const rewardMessage = settings.regularRewardText;

    return {
      isEligibleForReward: true,
      discountAmount: discount,
      finalPrice,
      originalPrice,
      rewardType: 'regular',
      rewardMessage,
      countdownNotice: `0 to go • ${rewardMessage}`,
      remainingUntilReward: 0,
      currentStreakCount: mixedStreakCount,
      isMixedStreak: true,
      nextPurchaseEstimate: {
        willBeRewarded: false,
        estimatedDiscount: 0,
        estimatedPrice: currentPrice,
        message: 'Cycle resets after this rewarded voucher. 5th month / purchase begins new cycle.',
      },
    };
  }

  // Still progressing towards mixed reward (e.g. 1st, 2nd, or 3rd purchase)
  const afterThisMixed = mixedStreakCount + 1;
  const remainingAfter = Math.max(0, settings.mixedRule.requiredConsecutive - afterThisMixed);
  const mixedRemainingNow = Math.max(0, settings.mixedRule.requiredConsecutive - mixedStreakCount);

  let mixedCountdownNotice = '';
  let mixedNextEstimate: NextPurchaseEstimate;

  if (afterThisMixed >= settings.mixedRule.requiredConsecutive) {
    // Token right before discount: indicate discount for next time
    const nextDiscPrice = Math.max(0, currentPrice - settings.mixedRule.discountAmount);
    mixedCountdownNotice = `1 to go! Next time get $${settings.mixedRule.discountAmount.toFixed(2)} discount!`;
    mixedNextEstimate = {
      willBeRewarded: true,
      estimatedDiscount: settings.mixedRule.discountAmount,
      estimatedPrice: nextDiscPrice,
      message: `Next time get $${settings.mixedRule.discountAmount.toFixed(2)} discount!`,
    };
  } else {
    mixedCountdownNotice = `${mixedRemainingNow} to go (Mixed Vouchers: 3 consecutive for $1 off)`;
    mixedNextEstimate = {
      willBeRewarded: false,
      estimatedDiscount: 0,
      estimatedPrice: currentPrice,
      message: `${remainingAfter} more to go before $1 discount`,
    };
  }

  return {
    isEligibleForReward: false,
    discountAmount: 0,
    finalPrice: currentPrice,
    originalPrice,
    rewardType: 'none',
    rewardMessage: '',
    countdownNotice: mixedCountdownNotice,
    remainingUntilReward: mixedRemainingNow,
    currentStreakCount: mixedStreakCount,
    isMixedStreak: true,
    nextPurchaseEstimate: mixedNextEstimate,
  };
}

/**
 * Filter customers incrementally by customer number (CN), name, cell number, MAC, or device model
 * Powered by fuzzy search algorithm with score ranking and typo tolerance
 */
export function searchCustomers(customers: Customer[], query: string): Customer[] {
  if (!query || !query.trim()) {
    return customers || [];
  }

  const fuzzyResults = fuzzySearchCustomers(customers, query);
  return fuzzyResults.map(r => r.customer);
}
