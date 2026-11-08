import { 
  InvestorStake, 
  ShareholdingGovernance, 
  GovernanceFramework, 
  InvestorTone, 
  LedgerTransaction, 
  CapitalReinjectionSimulation,
  Voucher 
} from '../types';
import { isVoucherFree, getVoucherMonetaryValue } from './giveawayEngine';

export const DEFAULT_GOVERNANCE_CONFIG: Record<GovernanceFramework, Partial<ShareholdingGovernance>> = {
  Delaware_CCorp: {
    framework: 'Delaware_CCorp',
    investorTone: 'Balanced_Growth',
    companyValuation: 250000,
    totalIssuedShares: 100000,
    sharePrice: 2.50,
    retainedEarningsRatio: 40,
    dividendPayoutRatio: 60,
    hurdleRate: 8.0,
    liquidationPreferenceMultiple: 1.0,
    allowSecondaryDisposals: true,
    minShareHoldingDaysBeforeDisposal: 180,
    disposalValuationMethod: 'ARR_Multiple',
    customValuationMultiple: 4.5
  },
  Silicon_Valley_SAFE: {
    framework: 'Silicon_Valley_SAFE',
    investorTone: 'Aggressive_Landgrab',
    companyValuation: 350000,
    totalIssuedShares: 100000,
    sharePrice: 3.50,
    retainedEarningsRatio: 70,
    dividendPayoutRatio: 30,
    hurdleRate: 6.0,
    liquidationPreferenceMultiple: 1.0,
    allowSecondaryDisposals: false,
    minShareHoldingDaysBeforeDisposal: 365,
    disposalValuationMethod: 'DCF',
    customValuationMultiple: 6.0
  },
  Profit_Share_Partnership: {
    framework: 'Profit_Share_Partnership',
    investorTone: 'Conservative',
    companyValuation: 180000,
    totalIssuedShares: 10000,
    sharePrice: 18.00,
    retainedEarningsRatio: 30,
    dividendPayoutRatio: 70,
    hurdleRate: 10.0,
    liquidationPreferenceMultiple: 1.0,
    allowSecondaryDisposals: true,
    minShareHoldingDaysBeforeDisposal: 90,
    disposalValuationMethod: 'NAV_Plus_Cash',
    customValuationMultiple: 3.0
  },
  Hybrid_Mezzanine: {
    framework: 'Hybrid_Mezzanine',
    investorTone: 'Balanced_Growth',
    companyValuation: 220000,
    totalIssuedShares: 50000,
    sharePrice: 4.40,
    retainedEarningsRatio: 45,
    dividendPayoutRatio: 55,
    hurdleRate: 12.0,
    liquidationPreferenceMultiple: 1.5,
    allowSecondaryDisposals: true,
    minShareHoldingDaysBeforeDisposal: 180,
    disposalValuationMethod: 'ARR_Multiple',
    customValuationMultiple: 4.0
  }
};

export const FRAMEWORK_DETAILS: Record<GovernanceFramework, {
  name: string;
  badge: string;
  jurisdiction: string;
  summary: string;
  votingRights: string;
  dividendMechanics: string;
  investorProtection: string;
}> = {
  Delaware_CCorp: {
    name: 'Delaware C-Corporation Standard',
    badge: 'Enterprise Institutional',
    jurisdiction: 'Delaware Corporate Code / Standard Common Law',
    summary: 'Gold standard for high-growth tech ventures. Establishes a fiduciary Board of Directors, clear segregation between Common & Preferred Stock, and statutory annual shareholder conventions.',
    votingRights: '1 vote per common share. Preferred shares hold protective provisions and major transaction veto powers.',
    dividendMechanics: 'Board declared discretionary dividends from net unreserved retained earnings.',
    investorProtection: 'Right of First Refusal (ROFR), tag-along rights, and audited corporate books review.'
  },
  Silicon_Valley_SAFE: {
    name: 'Silicon Valley Post-Money SAFE & Preferred',
    badge: 'Venture & High Growth',
    jurisdiction: 'Y-Combinator Standardized Venture Framework',
    summary: 'Engineered for rapid growth and reinvestment. Most earnings are retained for territory landgrab and infrastructure scaling rather than immediate dividend extraction.',
    votingRights: 'Non-voting convertible positions until priced Series A conversion; operational freedom for founders.',
    dividendMechanics: 'High capital retention (60-80% reinvestment). Dividends are subordinate to capital growth.',
    investorProtection: 'Valuation cap enforcement, MFN (Most Favored Nation) clauses, 1x non-participating liquidation preference.'
  },
  Profit_Share_Partnership: {
    name: 'Cooperative Profit-Share Partnership',
    badge: 'Cash-Flow & Dividends',
    jurisdiction: 'Commercial Partnership & LLC Operating Model',
    summary: 'Optimized for cash distributions and transparency. Net monthly earnings after essential reserves are distributed directly to partners and equity holders pro-rata.',
    votingRights: 'Consensus-driven or pro-rata capital weighted on major balance sheet decisions.',
    dividendMechanics: 'Scheduled monthly or quarterly mandatory profit distributions based on net operational surplus.',
    investorProtection: 'Open general ledger inspection, capital contribution return priority, strict lockups.'
  },
  Hybrid_Mezzanine: {
    name: 'Hybrid Debt-Equity Mezzanine Syndicate',
    badge: 'Yield & Capital Shield',
    jurisdiction: 'Structured Finance & Subordinated Debt Model',
    summary: 'Combines fixed preferred yield (debt coupon) with equity upside participation. Protects downside through priority claims while sharing growth profits.',
    votingRights: 'Observer board status, covenant-triggered management step-in rights upon default.',
    dividendMechanics: 'Contractual preferred return (hurdle rate) paid before any common shareholder distributions.',
    investorProtection: '1.5x liquidation preference, negative covenants on debt incurrence, priority repayment.'
  }
};

export const INVESTOR_TONE_DETAILS: Record<InvestorTone, {
  name: string;
  description: string;
  riskTolerance: string;
  reinvestmentBias: string;
  color: string;
}> = {
  Conservative: {
    name: 'Capital Preservation & Security',
    description: 'Prioritizes immediate cash flow stability, low leverage, strict expense audits, and robust working capital reserves.',
    riskTolerance: 'Low / Defensive',
    reinvestmentBias: 'Maintain 6-12 months operating buffer; payout consistent dividends.',
    color: 'emerald'
  },
  Balanced_Growth: {
    name: 'Sustainable Compounding',
    description: 'Strikes an optical balance between cash distributions to investors and reinvesting profits into agent expansion and hardware.',
    riskTolerance: 'Moderate / Pragmatic',
    reinvestmentBias: '40-50% retained earnings reinvestment for steady network growth.',
    color: 'sky'
  },
  Aggressive_Landgrab: {
    name: 'High-Velocity Territory Dominance',
    description: 'Channels maximum revenue into voucher deployment, router infrastructure, and customer acquisition to maximize enterprise valuation.',
    riskTolerance: 'High / Expansionist',
    reinvestmentBias: 'Up to 75% retained capital plowed back into market expansion.',
    color: 'purple'
  }
};

/**
 * Key Financial Glossary Terms
 */
export const FINANCIAL_GLOSSARY = [
  {
    term: 'Cap Table (Capitalization Table)',
    category: 'Equity Structure',
    definition: 'A formal legal spreadsheet and ledger outlining a company’s percentages of ownership, equity dilution, and value of equity in each round of investment by founders, investors, and stakeholders.',
    importance: 'Ensures everyone knows who owns what, what shares are worth, and how voting rights are allocated.'
  },
  {
    term: 'Pre-Money vs. Post-Money Valuation',
    category: 'Valuation & Pricing',
    definition: 'Pre-Money Valuation is the estimated value of the company before new capital is injected. Post-Money Valuation is the value immediately after the investment is received (Post-Money = Pre-Money + Injected Capital).',
    importance: 'Governs the exact ownership percentage a new investor receives: Stake % = Injected Capital / Post-Money Valuation.'
  },
  {
    term: 'Dilution & Anti-Dilution',
    category: 'Equity Structure',
    definition: 'Dilution occurs when new shares are issued, decreasing existing shareholders’ percentage of the total company. Anti-dilution clauses protect investors from sharp ownership drops during down-rounds.',
    importance: 'Prevents initial investors from having their stakes unfairly minimized when more capital is raised.'
  },
  {
    term: 'Liquidation Preference & Waterfall',
    category: 'Legal & Insolvency',
    definition: 'Determines the legal order of who gets paid first and how much if the business is sold, merged, liquidated, or declares bankruptcy. Typically, senior secured debt is paid first, followed by preferred investors (e.g. 1x money back), and finally common shareholders split the remainder.',
    importance: 'Guarantees that investors who take early financial risk recover their principal before equity dividends.'
  },
  {
    term: 'Pro-Rata Rights (Preemptive Rights)',
    category: 'Investor Rights',
    definition: 'The contractual right (but not obligation) of an existing investor to participate in future financing rounds to maintain their exact percentage ownership without being diluted.',
    importance: 'Allows high-conviction backers to protect their original ownership proportion as the company scales.'
  },
  {
    term: 'EBITDA',
    category: 'Accounting & Performance',
    definition: 'Earnings Before Interest, Taxes, Depreciation, and Amortization. It strips out non-operating distortions to measure the raw operational cash profitability of the voucher and Wi-Fi business.',
    importance: 'Widely used benchmark for valuation multiples and operational viability.'
  },
  {
    term: 'Hurdle Rate / Preferred Return',
    category: 'Dividends & Yield',
    definition: 'The minimum annual return (e.g., 8% or 10%) that preferred investors must receive on their invested capital before any profits or dividends can be distributed to common shareholders or founders.',
    importance: 'Aligns incentives and assures investors of a baseline priority yield on invested funds.'
  },
  {
    term: 'Net Asset Value (NAV)',
    category: 'Valuation & Pricing',
    definition: 'The net tangible value of an entity, calculated as total assets (bank balances, accounts receivable, hardware, router inventory) minus total liabilities (outstanding agent balances, debts, unpaid operating costs).',
    importance: 'Provides a conservative liquidation floor for pricing shares.'
  },
  {
    term: 'Right of First Refusal (ROFR)',
    category: 'Governance & Secondary',
    definition: 'A contractual covenant giving existing shareholders or the company itself the first opportunity to purchase shares from a departing investor before they can sell to an outside third party.',
    importance: 'Keeps cap table control internal and prevents hostile or unvetted parties from acquiring business equity.'
  },
  {
    term: 'Retained Earnings Reserve',
    category: 'Cash Flow & Treasury',
    definition: 'The percentage of net business profits kept in the company bank account rather than paid out as dividends, building a financial war chest and emergency working capital runway.',
    importance: 'Prevents insolvency during seasonal demand drops or sudden capital expenditures.'
  }
];

/**
 * Differences between Debt/Note Investors vs Equity Shareholders
 */
export const INVESTOR_VS_SHAREHOLDER_COMPARISON = [
  {
    attribute: 'Primary Nature of Relationship',
    debtInvestor: 'Creditor / Lender holding promissory notes or convertible instruments.',
    equityShareholder: 'Co-owner of the corporate entity holding common or preferred shares.'
  },
  {
    attribute: 'Capital Recovery & Insolvency Priority',
    debtInvestor: 'Highest Priority. Paid back before any equity holder receives a single cent in bankruptcy or liquidation.',
    equityShareholder: 'Subordinate / Residual. Only receives capital after all debts, lenders, and preferred obligations are cleared.'
  },
  {
    attribute: 'Earnings & Returns Mechanism',
    debtInvestor: 'Fixed interest rate (coupon), contractual preferred return, or debt repayment schedule regardless of profit.',
    equityShareholder: 'Variable dividends derived from net operational profit after retained reserves, plus long-term share price appreciation.'
  },
  {
    attribute: 'Dilution Exposure',
    debtInvestor: 'Zero dilution risk. Their debt principal does not shrink when new shareholders enter the business.',
    equityShareholder: 'Directly diluted whenever new shares are minted, reducing their percentage ownership unless pro-rata is exercised.'
  },
  {
    attribute: 'Corporate Governance & Voting',
    debtInvestor: 'Generally non-voting, but holds restrictive debt covenants and default acceleration remedies.',
    equityShareholder: 'Holds voting rights to elect management, approve major acquisitions, and ratify annual budgets.'
  },
  {
    attribute: 'Upside Potential',
    debtInvestor: 'Capped at principal plus agreed interest (unless structured with convertible equity warrants).',
    equityShareholder: 'Uncapped. As voucher volume, revenue, and enterprise valuation multiply 10x, their stake multiplies in lockstep.'
  }
];

/**
 * Calculates current valuation recommendations based on voucher performance
 */
export function calculateValuationRecommendations(
  vouchers: Voucher[],
  governance: ShareholdingGovernance,
  ledgerTransactions: LedgerTransaction[] = []
) {
  // 1. Calculate annualized voucher GMV (Gross Merchandise Value - strictly paid sales)
  const soldVouchers = vouchers.filter(v => v.status === 'Sold' && !isVoucherFree(v));
  const soldTotal = soldVouchers.reduce((acc, v) => acc + getVoucherMonetaryValue(v), 0);
  
  // Estimate annualized run rate: if recent vouchers represent ~1 month sample or baseline
  const estimatedMonthlySales = Math.max(soldTotal, 4500); // Baseline monthly GMV
  const annualizedGMV = estimatedMonthlySales * 12;

  // Calculate current cash buffer from ledger
  const currentCashBalance = ledgerTransactions.length > 0 
    ? ledgerTransactions[ledgerTransactions.length - 1].balanceAfter 
    : 18500;

  // Method 1: ARR / GMV Multiple
  const arrMultiple = governance.customValuationMultiple || 4.0;
  const arrValuation = Math.round(annualizedGMV * arrMultiple);
  const arrSharePrice = Number((arrValuation / governance.totalIssuedShares).toFixed(2));

  // Method 2: Discounted Cash Flow (DCF) with 15% discount rate & 3-year horizon
  const estimatedAnnualNetCash = annualizedGMV * 0.35; // 35% net margin
  const discountRate = 0.15;
  const terminalMultiple = 5.0;
  const pvYear1 = estimatedAnnualNetCash / (1 + discountRate);
  const pvYear2 = (estimatedAnnualNetCash * 1.25) / Math.pow(1 + discountRate, 2);
  const pvYear3 = (estimatedAnnualNetCash * 1.55) / Math.pow(1 + discountRate, 3);
  const terminalValue = ((estimatedAnnualNetCash * 1.55) * terminalMultiple) / Math.pow(1 + discountRate, 3);
  const dcfValuation = Math.round(pvYear1 + pvYear2 + pvYear3 + terminalValue + currentCashBalance);
  const dcfSharePrice = Number((dcfValuation / governance.totalIssuedShares).toFixed(2));

  // Method 3: Net Asset Value (NAV) + Cash Buffer
  const estimatedHardwareAssets = 14500; // Routers, PoE switches, antennas, servers
  const inventoryValue = vouchers.filter(v => v.status !== 'Sold').length * 2.5;
  const navValuation = Math.round(currentCashBalance + estimatedHardwareAssets + inventoryValue + (annualizedGMV * 1.2));
  const navSharePrice = Number((navValuation / governance.totalIssuedShares).toFixed(2));

  // Selected recommended price
  let recommendedValuation = arrValuation;
  let recommendedSharePrice = arrSharePrice;
  if (governance.disposalValuationMethod === 'DCF') {
    recommendedValuation = dcfValuation;
    recommendedSharePrice = dcfSharePrice;
  } else if (governance.disposalValuationMethod === 'NAV_Plus_Cash') {
    recommendedValuation = navValuation;
    recommendedSharePrice = navSharePrice;
  }

  return {
    annualizedGMV,
    currentCashBalance,
    arrMultiple,
    arrValuation,
    arrSharePrice,
    dcfValuation,
    dcfSharePrice,
    navValuation,
    navSharePrice,
    recommendedValuation,
    recommendedSharePrice
  };
}

/**
 * Simulates capital reinjection and calculates resulting cap table dilution
 */
export function simulateCapitalReinjection(
  injectionAmount: number,
  preMoneyValuation: number,
  currentTotalShares: number,
  investorName: string = 'Reinjecting Investor'
): CapitalReinjectionSimulation {
  const postMoneyValuation = preMoneyValuation + injectionAmount;
  const currentSharePrice = preMoneyValuation / currentTotalShares;
  const newSharesIssued = Math.round(injectionAmount / currentSharePrice);
  const newTotalShares = currentTotalShares + newSharesIssued;
  const resultingEquityPercentage = Number(((newSharesIssued / newTotalShares) * 100).toFixed(2));
  const dilutionFactor = Number(((currentTotalShares / newTotalShares) * 100).toFixed(2));

  return {
    investorName,
    injectionAmount,
    preMoneyValuation,
    postMoneyValuation,
    newSharesIssued,
    newTotalShares,
    resultingEquityPercentage,
    dilutionFactor
  };
}

/**
 * Calculates profit distribution waterfall
 */
export function calculateDividendDistribution(
  netProfit: number,
  governance: ShareholdingGovernance,
  investors: InvestorStake[]
) {
  const retainedAmount = Number(((netProfit * governance.retainedEarningsRatio) / 100).toFixed(2));
  const distributablePool = Number(((netProfit * governance.dividendPayoutRatio) / 100).toFixed(2));

  // 1. Preferred Return Hurdle Check
  const preferredInvestors = investors.filter(i => i.investorType === 'PreferredInvestor' || i.investorType === 'Hybrid_Mezzanine' as any);
  let totalPreferredObligation = 0;
  
  preferredInvestors.forEach(p => {
    const rate = (p.preferredReturnRate || governance.hurdleRate) / 100;
    // Monthly hurdle portion (rate / 12)
    const monthlyHurdle = (p.contributionAmount * rate) / 12;
    totalPreferredObligation += monthlyHurdle;
  });

  const preferredPayout = Math.min(distributablePool, totalPreferredObligation);
  const commonDistributionPool = Math.max(0, distributablePool - preferredPayout);

  // Common equity total shares
  const activeInvestors = investors.filter(i => i.status === 'Active');
  const totalActiveShares = activeInvestors.reduce((acc, i) => acc + i.sharesCount, 0);

  const breakdown = activeInvestors.map(inv => {
    let payout = 0;
    if (inv.investorType === 'PreferredInvestor') {
      const rate = (inv.preferredReturnRate || governance.hurdleRate) / 100;
      const hurdleShare = (inv.contributionAmount * rate) / 12;
      payout = totalPreferredObligation > 0 ? (hurdleShare / totalPreferredObligation) * preferredPayout : 0;
    } else {
      // Common pro-rata
      payout = totalActiveShares > 0 ? (inv.sharesCount / totalActiveShares) * commonDistributionPool : 0;
    }
    const yieldPercentage = inv.contributionAmount > 0 
      ? Number(((payout * 12 / inv.contributionAmount) * 100).toFixed(2)) 
      : 0;

    return {
      investorId: inv.id,
      name: inv.name,
      investorType: inv.investorType,
      sharesCount: inv.sharesCount,
      equityPercentage: inv.equityPercentage,
      monthlyDividendPayout: Number(payout.toFixed(2)),
      projectedAnnualYield: yieldPercentage
    };
  });

  return {
    netProfit,
    retainedAmount,
    distributablePool,
    preferredPayout: Number(preferredPayout.toFixed(2)),
    commonDistributionPool: Number(commonDistributionPool.toFixed(2)),
    dividendPerShare: totalActiveShares > 0 ? Number((distributablePool / totalActiveShares).toFixed(4)) : 0,
    breakdown
  };
}

/**
 * Predicts multi-year business growth trajectory
 */
export function generateGrowthTrajectory(
  baselineMonthlyRevenue: number = 5500,
  initialValuation: number = 250000,
  scenario: 'Conservative' | 'Base' | 'Aggressive' = 'Base'
) {
  const rates = {
    Conservative: { momGrowth: 0.04, margin: 0.30, valuationMultiple: 3.5 },
    Base: { momGrowth: 0.075, margin: 0.38, valuationMultiple: 4.8 },
    Aggressive: { momGrowth: 0.12, margin: 0.44, valuationMultiple: 6.2 }
  };

  const config = rates[scenario];
  const months = [
    'Month 1', 'Month 3', 'Month 6', 'Month 9', 'Month 12', 
    'Month 18', 'Month 24', 'Month 30', 'Month 36'
  ];
  const monthIndices = [1, 3, 6, 9, 12, 18, 24, 30, 36];

  return monthIndices.map((m, idx) => {
    const projectedRevenue = Math.round(baselineMonthlyRevenue * Math.pow(1 + config.momGrowth, m));
    const projectedNetProfit = Math.round(projectedRevenue * config.margin);
    const annualizedRunRate = projectedRevenue * 12;
    const enterpriseValuation = Math.round(annualizedRunRate * config.valuationMultiple);
    const dividendPool = Math.round(projectedNetProfit * 0.60); // 60% distributed
    const retainedCash = Math.round(projectedNetProfit * 0.40); // 40% retained

    return {
      label: months[idx],
      month: m,
      revenue: projectedRevenue,
      netProfit: projectedNetProfit,
      valuation: enterpriseValuation,
      dividendPool,
      retainedCash
    };
  });
}

/**
 * Solves fair liquidation waterfall for distress scenarios
 */
export function solveLiquidationWaterfall(
  availableLiquidationCash: number,
  securedDebtAmount: number = 25000,
  unsecuredOperationalDebt: number = 12000,
  preferredCapitalInvested: number = 60000,
  preferredLiquidationMultiple: number = 1.0,
  commonSharesCount: number = 80000
) {
  let remaining = availableLiquidationCash;

  // Tier 1: Senior Secured Creditors & Wages
  const tier1Payout = Math.min(remaining, securedDebtAmount);
  remaining -= tier1Payout;
  const tier1Deficit = Math.max(0, securedDebtAmount - tier1Payout);

  // Tier 2: General Unsecured Creditors & Operational Liabilities
  const tier2Payout = Math.min(remaining, unsecuredOperationalDebt);
  remaining -= tier2Payout;
  const tier2Deficit = Math.max(0, unsecuredOperationalDebt - tier2Payout);

  // Tier 3: Preferred Investors (Liquidation Preference)
  const totalPreferredClaim = preferredCapitalInvested * preferredLiquidationMultiple;
  const tier3Payout = Math.min(remaining, totalPreferredClaim);
  remaining -= tier3Payout;
  const tier3RecoveryPercent = totalPreferredClaim > 0 ? Number(((tier3Payout / totalPreferredClaim) * 100).toFixed(1)) : 100;

  // Tier 4: Common Shareholders (Residual Cash)
  const tier4Payout = remaining;
  const payoutPerCommonShare = commonSharesCount > 0 ? Number((tier4Payout / commonSharesCount).toFixed(4)) : 0;

  return {
    totalLiquidAssets: availableLiquidationCash,
    tier1: {
      title: 'Tier 1: Senior Secured Debt & Employee Wages',
      claim: securedDebtAmount,
      payout: tier1Payout,
      deficit: tier1Deficit,
      isFullySatisfied: tier1Deficit === 0
    },
    tier2: {
      title: 'Tier 2: Operational AP & Unsecured Liabilities',
      claim: unsecuredOperationalDebt,
      payout: tier2Payout,
      deficit: tier2Deficit,
      isFullySatisfied: tier2Deficit === 0
    },
    tier3: {
      title: 'Tier 3: Preferred Investors (1x Liquidation Preference)',
      claim: totalPreferredClaim,
      payout: tier3Payout,
      recoveryPercent: tier3RecoveryPercent,
      isFullySatisfied: tier3Payout >= totalPreferredClaim
    },
    tier4: {
      title: 'Tier 4: Common Equity Shareholders',
      claim: 'Residual Equity',
      payout: tier4Payout,
      payoutPerShare: payoutPerCommonShare,
      isFullySatisfied: tier4Payout > 0
    }
  };
}

/**
 * Formats currency values cleanly
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
