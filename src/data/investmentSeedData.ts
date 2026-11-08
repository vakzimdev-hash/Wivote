import { 
  InvestorStake, 
  ShareholdingGovernance, 
  LedgerTransaction, 
  ShareDisposalRequest 
} from '../types';

export const initialShareholdingGovernance: ShareholdingGovernance = {
  workspaceId: 'ws_vakzim',
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
  lastValuationDate: '2026-09-01',
  disposalValuationMethod: 'ARR_Multiple',
  customValuationMultiple: 4.5
};

export const initialInvestors: InvestorStake[] = [
  {
    id: 'inv_001',
    workspaceId: 'ws_vakzim',
    userId: 'user_investor_farai',
    name: 'Dr. Farai Mutasa',
    email: 'investor@wivote.com',
    cellNumber: '+263773123456',
    investorType: 'PreferredInvestor',
    contributionAmount: 50000,
    sharesCount: 20000,
    equityPercentage: 20.0,
    valuationAtInvestment: 250000,
    currentMonetaryValue: 50000,
    preferredReturnRate: 8.0,
    dateJoined: '2026-01-15',
    notes: 'Lead angel investor. Series Seed preferred round with 1x liquidation preference and quarterly dividend rights.',
    status: 'Active',
    dividendEarnedTotal: 3450.00,
    shareCertificateNumber: 'CERT-WV-2026-001'
  },
  {
    id: 'inv_002',
    workspaceId: 'ws_vakzim',
    userId: 'user_investor_elena',
    name: 'Elena Vance (Vance Capital)',
    email: 'elena.invest@wivote.com',
    cellNumber: '+14155552678',
    investorType: 'ConvertibleDebt',
    contributionAmount: 30000,
    sharesCount: 12000,
    equityPercentage: 12.0,
    valuationAtInvestment: 250000,
    currentMonetaryValue: 30000,
    preferredReturnRate: 6.5,
    dateJoined: '2026-03-10',
    notes: 'Silicon Valley Post-Money SAFE note converted into Preferred Stock upon Phase 2 Wi-Fi hardware rollout.',
    status: 'Active',
    dividendEarnedTotal: 1820.00,
    shareCertificateNumber: 'CERT-WV-2026-002'
  },
  {
    id: 'inv_003',
    workspaceId: 'ws_vakzim',
    name: 'Tariro Chisamba (Co-Founder)',
    email: 'tariro@wivote.com',
    cellNumber: '+263774889900',
    investorType: 'CommonShareholder',
    contributionAmount: 65000,
    sharesCount: 38000,
    equityPercentage: 38.0,
    valuationAtInvestment: 200000,
    currentMonetaryValue: 95000,
    dateJoined: '2025-11-01',
    notes: 'Founding equity partner. Technical architecture and telecom distribution lead.',
    status: 'Active',
    dividendEarnedTotal: 5200.00,
    shareCertificateNumber: 'CERT-WV-2025-001'
  },
  {
    id: 'inv_004',
    workspaceId: 'ws_vakzim',
    name: 'WiVoTe Employee & Treasury Reserve',
    email: 'treasury@wivote.com',
    cellNumber: '+263771111112',
    investorType: 'CommonShareholder',
    contributionAmount: 40000,
    sharesCount: 30000,
    equityPercentage: 30.0,
    valuationAtInvestment: 250000,
    currentMonetaryValue: 75000,
    dateJoined: '2025-11-01',
    notes: 'Unallocated corporate treasury stock and key field agent incentive pool.',
    status: 'Active',
    dividendEarnedTotal: 4100.00,
    shareCertificateNumber: 'CERT-WV-TREASURY-01'
  }
];

export const initialLedgerTransactions: LedgerTransaction[] = [
  {
    id: 'tx_001',
    workspaceId: 'ws_vakzim',
    type: 'CapitalReinjection',
    description: 'Initial Seed Capital Injection - Dr. Farai Mutasa',
    amount: 50000.00,
    date: '2026-01-15T09:00:00Z',
    recordedBy: 'System Auto-Audit',
    category: 'Equity Inflow',
    balanceAfter: 50000.00
  },
  {
    id: 'tx_002',
    workspaceId: 'ws_vakzim',
    type: 'Capex',
    description: 'Procurement of 25 High-Gain Wi-Fi 6 Routers and Solar PoE Injectors',
    amount: -8450.00,
    date: '2026-01-22T14:30:00Z',
    recordedBy: 'Workspace Master',
    category: 'Network Infrastructure',
    referenceDocId: 'INV-HW-8891',
    balanceAfter: 41550.00
  },
  {
    id: 'tx_003',
    workspaceId: 'ws_vakzim',
    type: 'CapitalReinjection',
    description: 'SAFE Convertible Seed Tranche - Elena Vance',
    amount: 30000.00,
    date: '2026-03-10T11:00:00Z',
    recordedBy: 'System Auto-Audit',
    category: 'Equity Inflow',
    balanceAfter: 71550.00
  },
  {
    id: 'tx_004',
    workspaceId: 'ws_vakzim',
    type: 'Opex',
    description: 'Fiber-Optic Dedicated Backhaul & Cloud Proxy Bandwidth (Q1)',
    amount: -3200.00,
    date: '2026-03-31T16:00:00Z',
    recordedBy: 'Workspace Master',
    category: 'Telecom & ISP',
    referenceDocId: 'TEL-ISP-2026-Q1',
    balanceAfter: 68350.00
  },
  {
    id: 'tx_005',
    workspaceId: 'ws_vakzim',
    type: 'VoucherGrossSales',
    description: 'Aggregated Monthly Voucher Direct Revenue (Batch sales through field agents)',
    amount: 9840.00,
    date: '2026-07-31T18:00:00Z',
    recordedBy: 'POS Reconciliation',
    category: 'Operating Inflow',
    balanceAfter: 78190.00
  },
  {
    id: 'tx_006',
    workspaceId: 'ws_vakzim',
    type: 'AgentCommission',
    description: 'Field Agent Commissions Disbursed (8% to 10% milestone payouts)',
    amount: -984.00,
    date: '2026-08-05T10:00:00Z',
    recordedBy: 'Agent Management Engine',
    category: 'Field Operations',
    balanceAfter: 77206.00
  },
  {
    id: 'tx_007',
    workspaceId: 'ws_vakzim',
    type: 'DividendPayout',
    description: 'Q2 Discretionary Dividend Distribution to Preferred and Common Stockholders',
    amount: -4500.00,
    date: '2026-08-15T12:00:00Z',
    recordedBy: 'Board Resolution',
    category: 'Shareholder Return',
    referenceDocId: 'DIV-RES-2026-Q2',
    balanceAfter: 72706.00
  }
];

export const initialShareDisposalRequests: ShareDisposalRequest[] = [
  {
    id: 'disp_001',
    workspaceId: 'ws_vakzim',
    investorId: 'inv_002',
    investorName: 'Elena Vance (Vance Capital)',
    sharesToDispose: 2000,
    suggestedPricePerShare: 2.50,
    totalOfferAmount: 5000.00,
    reason: 'Portfolio rebalancing and partial liquidity realization.',
    dateRequested: '2026-09-10',
    status: 'Pending',
    buyerType: 'Company_Buyback'
  }
];
