import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { InvestorStake, ShareDisposalRequest } from '../types';
import { 
  formatCurrency, 
  FRAMEWORK_DETAILS, 
  INVESTOR_TONE_DETAILS, 
  FINANCIAL_GLOSSARY,
  generateGrowthTrajectory,
  calculateValuationRecommendations
} from '../utils/investmentCalculations';
import { isVoucherFree, getVoucherMonetaryValue } from '../utils/giveawayEngine';
import { ShareCertificateModal } from './ShareCertificateModal';
import { 
  Landmark, 
  TrendingUp, 
  PieChart as PieIcon, 
  ShieldCheck, 
  DollarSign, 
  Percent, 
  Printer, 
  ArrowUpRight, 
  Receipt, 
  Eye, 
  Award, 
  Clock, 
  Building, 
  Search, 
  CheckCircle2,
  RefreshCw,
  Sliders,
  HelpCircle,
  FileText
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';

interface InvestorPortalProps {
  isPreview?: boolean;
}

export const InvestorPortal: React.FC<InvestorPortalProps> = ({ isPreview }) => {
  const { 
    currentUser, 
    activeWorkspace, 
    investors, 
    shareholdingGovernance, 
    ledgerTransactions, 
    vouchers,
    requestShareDisposal,
    showToast 
  } = useApp();

  const [activePortalTab, setActivePortalTab] = useState<'metrics' | 'stake' | 'trajectory' | 'ledger' | 'glossary'>('metrics');
  const [selectedCert, setSelectedCert] = useState<InvestorStake | null>(null);
  const [isDisposalModalOpen, setIsDisposalModalOpen] = useState(false);
  const [isReinjectModalOpen, setIsReinjectModalOpen] = useState(false);
  const [disposalSharesInput, setDisposalSharesInput] = useState<number>(1000);
  const [disposalReasonInput, setDisposalReasonInput] = useState<string>('');
  const [reinjectAmountInput, setReinjectAmountInput] = useState<number>(10000);
  const [glossarySearch, setGlossarySearch] = useState('');

  // Identify current investor profile
  const currentInvestor: InvestorStake = useMemo(() => {
    if (investors && investors.length > 0) {
      // Find matching investor by userId or email
      const matched = investors.find(i => 
        (currentUser?.email && i.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser?.uid && i.userId === currentUser.uid)
      );
      if (matched) return matched;
      return investors[0]; // fallback to first investor for preview mode
    }
    return {
      id: 'inv_default',
      workspaceId: activeWorkspace?.id || 'ws_vakzim',
      name: currentUser?.name || 'Dr. Farai Mutasa',
      email: currentUser?.email || 'investor@wivote.com',
      cellNumber: currentUser?.cellNumber || '+263773123456',
      investorType: 'PreferredInvestor',
      contributionAmount: 50000,
      sharesCount: 20000,
      equityPercentage: 20.0,
      valuationAtInvestment: 250000,
      currentMonetaryValue: 50000,
      preferredReturnRate: 8.0,
      dateJoined: '2026-01-15',
      status: 'Active',
      dividendEarnedTotal: 3450,
      shareCertificateNumber: 'CERT-WV-2026-001'
    };
  }, [investors, currentUser, activeWorkspace]);

  // Derived calculations
  const gov = shareholdingGovernance || {
    workspaceId: activeWorkspace?.id || 'ws_vakzim',
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

  const valuationMetrics = useMemo(() => {
    return calculateValuationRecommendations(vouchers || [], gov, ledgerTransactions || []);
  }, [vouchers, gov, ledgerTransactions]);

  const trajectoryData = useMemo(() => {
    const baseline = Math.max(valuationMetrics.annualizedGMV / 12, 5500);
    return generateGrowthTrajectory(baseline, gov.companyValuation, 'Base');
  }, [valuationMetrics, gov]);

  // Performance numbers (strictly paid sales - free customer promotional gifts and approved reversals never record in sales)
  const soldVouchers = (vouchers || []).filter(v => v.status === 'Sold' && v.reversalStatus !== 'Approved' && !isVoucherFree(v));
  const totalRevenue = soldVouchers.reduce((acc, v) => acc + getVoucherMonetaryValue(v), 0);
  const gainPercentage = currentInvestor.contributionAmount > 0 
    ? (((currentInvestor.currentMonetaryValue - currentInvestor.contributionAmount) / currentInvestor.contributionAmount) * 100).toFixed(1)
    : '0.0';

  const handleDisposalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const suggestedPrice = valuationMetrics.recommendedSharePrice;
    const totalOffer = Number((disposalSharesInput * suggestedPrice).toFixed(2));

    const res = await requestShareDisposal({
      workspaceId: activeWorkspace?.id || 'ws_vakzim',
      investorId: currentInvestor.id,
      investorName: currentInvestor.name,
      sharesToDispose: disposalSharesInput,
      suggestedPricePerShare: suggestedPrice,
      totalOfferAmount: totalOffer,
      reason: disposalReasonInput || 'Investor liquidity request',
      buyerType: 'Company_Buyback'
    });

    if (res.success) {
      showToast(`Share disposal request for ${disposalSharesInput.toLocaleString()} shares filed successfully!`, 'success');
      setIsDisposalModalOpen(false);
      setDisposalReasonInput('');
    } else {
      showToast(res.error || 'Failed to file disposal request', 'error');
    }
  };

  const handleReinjectRequest = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Capital reinjection proposal for ${formatCurrency(reinjectAmountInput)} sent to Workspace Master for review!`, 'success');
    setIsReinjectModalOpen(false);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden font-sans pb-12">
      
      {/* PREVIEW BANNER (IF IN PREVIEW MODE) */}
      {isPreview && (
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Investor Read-Only Mode Preview: You are viewing the executive portal as stakeholder <strong>{currentInvestor.name}</strong>.</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px] uppercase">
            Executive View
          </span>
        </div>
      )}

      {/* INVESTOR HERO HEADER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Verified Corporate Stakeholder
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {currentInvestor.investorType.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Landmark className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              {currentInvestor.name} • Executive Investment Portal
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              Real-time read-only visibility into corporate performance, equity valuation, profit distributions, and growth trajectory under {FRAMEWORK_DETAILS[gov.framework]?.name}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSelectedCert(currentInvestor)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span>View Stock Certificate</span>
            </button>
            <button
              onClick={() => setIsDisposalModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer border border-indigo-200 dark:border-indigo-800"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Dispose Shares</span>
            </button>
            <button
              onClick={() => setIsReinjectModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reinject Capital</span>
            </button>
          </div>
        </div>

        {/* PERSONAL STAKE SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Your Equity Stake
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              {(currentInvestor.equityPercentage || 0).toFixed(2)}%
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              {currentInvestor.sharesCount.toLocaleString()} Units
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Capital Contributed
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(currentInvestor.contributionAmount)}
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              Principal Inscribed
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Current Fair Value
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-650 dark:text-emerald-400 mt-1">
              {formatCurrency(currentInvestor.currentMonetaryValue)}
            </div>
            <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
              +{gainPercentage}% Appreciation
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Dividends Received
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(currentInvestor.dividendEarnedTotal || 0)}
            </div>
            <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
              Disbursed to date
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Current Share Price
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(gov.sharePrice)}
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              Per Equity Unit
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Enterprise Valuation
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-purple-600 dark:text-purple-400 mt-1">
              {formatCurrency(gov.companyValuation)}
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              Board Ratified
            </div>
          </div>
        </div>
      </div>

      {/* PORTAL NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'metrics', label: 'Business Performance', icon: TrendingUp },
          { id: 'stake', label: 'Cap Table & Governance', icon: PieIcon },
          { id: 'trajectory', label: 'Growth Forecast', icon: AreaChart },
          { id: 'ledger', label: 'Audited Cash Book', icon: Receipt },
          { id: 'glossary', label: 'Financial Glossary', icon: HelpCircle }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activePortalTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActivePortalTab(t.id as any)}
              className={`pb-3 px-4 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-150 border-b-2 shrink-0 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: BUSINESS PERFORMANCE (VISUALS & NUMERICS) */}
      {activePortalTab === 'metrics' && (
        <div className="space-y-6">
          
          {/* Key Operations Numerics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Annualized Run Rate (GMV)</span>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
                {formatCurrency(valuationMetrics.annualizedGMV)}
              </div>
              <span className="text-[10px] font-mono text-emerald-600 font-bold mt-1 block">
                +14.8% Month-over-Month
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Wi-Fi Vouchers Sold</span>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
                {soldVouchers.length.toLocaleString()} Units
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                Across Field Agent Network
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Net Profit Margin</span>
              <div className="text-xl font-black font-mono text-emerald-650 dark:text-emerald-400 mt-1">
                38.4%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                After ISP & Agent Commissions
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Treasury Cash Reserves</span>
              <div className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(valuationMetrics.currentCashBalance)}
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                ~14 Months Operating Runway
              </span>
            </div>
          </div>

          {/* Performance Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                  Monthly Revenue & Profit Trajectory
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audited sales velocity and operational profit margins across past and projected milestones.
                </p>
              </div>
            </div>

            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trajectoryData.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip 
                    formatter={(val: any) => formatCurrency(Number(val))}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Voucher Sales Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netProfit" name="Net Distributable Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="retainedCash" name="Retained Capital Buffer" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: CAP TABLE & GOVERNANCE */}
      {activePortalTab === 'stake' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                Shareholding Cap Table & Bylaws
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Current capitalization structure and corporate governance rules active in this workspace.
              </p>
            </div>

            {/* Bylaws Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Corporate Bylaw System</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {FRAMEWORK_DETAILS[gov.framework]?.name}
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {FRAMEWORK_DETAILS[gov.framework]?.summary}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Dividend & Reserve Waterfall</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {gov.dividendPayoutRatio}% Distributed / {gov.retainedEarningsRatio}% Retained
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Preferred investors receive priority hurdle payout before common equity profit split.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Agreed Tone & Stance</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {INVESTOR_TONE_DETAILS[gov.investorTone]?.name}
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {INVESTOR_TONE_DETAILS[gov.investorTone]?.description}
                </p>
              </div>
            </div>

            {/* Cap Table Breakdown */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase">
                    <th className="py-3 px-4">Stakeholder</th>
                    <th className="py-3 px-3">Class</th>
                    <th className="py-3 px-3 text-right">Shares</th>
                    <th className="py-3 px-3 text-right">Stake %</th>
                    <th className="py-3 px-4 text-right">Fair Market Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(investors || []).map(inv => {
                    const isSelf = inv.id === currentInvestor.id;
                    return (
                      <tr key={inv.id} className={isSelf ? 'bg-indigo-50/60 dark:bg-indigo-950/40 font-bold' : ''}>
                        <td className="py-3 px-4">
                          <span className="font-sans text-slate-900 dark:text-white">
                            {inv.name}
                          </span>
                          {isSelf && <span className="ml-2 px-2 py-0.5 rounded bg-indigo-600 text-white text-[9px] uppercase font-bold">You</span>}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          {inv.investorType.replace(/([A-Z])/g, ' $1').trim()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {inv.sharesCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right text-indigo-600 dark:text-indigo-400 font-extrabold">
                          {(inv.equityPercentage || 0).toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-right text-slate-900 dark:text-white font-bold">
                          {formatCurrency(inv.currentMonetaryValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* TAB 3: GROWTH TRAJECTORY FORECAST */}
      {activePortalTab === 'trajectory' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                Multi-Year Enterprise Growth Trajectory
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Forecasted business expansion, valuation scaling, and projected dividend payout yields.
              </p>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trajectoryData}>
                  <defs>
                    <linearGradient id="invValGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip 
                    formatter={(val: any) => formatCurrency(Number(val))}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="valuation" name="Implied Enterprise Valuation" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#invValGrad)" />
                  <Area type="monotone" dataKey="revenue" name="Monthly Gross Revenue" stroke="#10b981" strokeWidth={2} fill="transparent" />
                  <Area type="monotone" dataKey="dividendPool" name="Total Dividend Pool" stroke="#f59e0b" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDITED CASH BOOK / LEDGER */}
      {activePortalTab === 'ledger' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                Corporate Cash Book Audit Trail
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verifiable read-only log of operational expenditures, equipment investments, and distributions.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 text-[10px] uppercase">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...(ledgerTransactions || [])].reverse().map(tx => {
                    const isInflow = tx.amount >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 text-slate-500">
                          {new Date(tx.date).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-sans text-slate-900 dark:text-white">
                          {tx.description}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${isInflow ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {isInflow ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-800 dark:text-slate-200">
                          {formatCurrency(tx.balanceAfter)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FINANCIAL GLOSSARY */}
      {activePortalTab === 'glossary' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                Financial Jargon Reference & Glossary
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Understand key corporate finance concepts: Dilution, Pre/Post-Money, Hurdle Rates, and Liquidation Waterfall.
              </p>
            </div>

            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search financial terms..."
                value={glossarySearch}
                onChange={(e) => setGlossarySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FINANCIAL_GLOSSARY.filter(item => 
                item.term.toLowerCase().includes(glossarySearch.toLowerCase()) || 
                item.definition.toLowerCase().includes(glossarySearch.toLowerCase())
              ).map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.term}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.definition}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SHARE DISPOSAL REQUEST */}
      {isDisposalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                Submit Share Disposal Request
              </h3>
              <button
                onClick={() => setIsDisposalModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDisposalRequest} className="p-6 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Shares to Dispose / Sell:</label>
                <input
                  type="number"
                  required
                  min="100"
                  max={currentInvestor.sharesCount}
                  value={disposalSharesInput}
                  onChange={(e) => setDisposalSharesInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  You hold {currentInvestor.sharesCount.toLocaleString()} total units.
                </span>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-1">
                <div className="text-[10px] uppercase text-indigo-700 dark:text-indigo-300 font-bold">
                  Recommended Fair Valuation:
                </div>
                <div className="text-base font-black text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(valuationMetrics.recommendedSharePrice)} / share
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Total Estimated Liquidity: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(disposalSharesInput * valuationMetrics.recommendedSharePrice)}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Reason for Liquidity:</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Portfolio rebalancing, liquidity realization..."
                  value={disposalReasonInput}
                  onChange={(e) => setDisposalReasonInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-sans"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDisposalModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  Submit for Board Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CAPITAL REINJECTION PROPOSAL */}
      {isReinjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white">
                Reinject Capital / Purchase Additional Shares
              </h3>
              <button
                onClick={() => setIsReinjectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReinjectRequest} className="p-6 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Proposed Capital Injection ($):</label>
                <input
                  type="number"
                  step="5000"
                  required
                  value={reinjectAmountInput}
                  onChange={(e) => setReinjectAmountInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
                <div className="text-[10px] uppercase text-emerald-800 dark:text-emerald-300 font-bold">
                  Estimated New Shares Minted:
                </div>
                <div className="text-base font-black text-emerald-650 dark:text-emerald-400">
                  +{Math.round(reinjectAmountInput / gov.sharePrice).toLocaleString()} Shares
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  At par share price of {formatCurrency(gov.sharePrice)}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReinjectModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-650 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Send Proposal to Workspace Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE CERTIFICATE MODAL */}
      {selectedCert && (
        <ShareCertificateModal
          investor={selectedCert}
          governance={gov}
          workspaceName={activeWorkspace?.name || 'WiVoTe Telecom'}
          onClose={() => setSelectedCert(null)}
        />
      )}

    </div>
  );
};
