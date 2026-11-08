import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  InvestorStake, 
  ShareholdingGovernance, 
  GovernanceFramework, 
  InvestorTone, 
  LedgerTransaction, 
  LedgerEntryType,
  InvestorType
} from '../types';
import { 
  DEFAULT_GOVERNANCE_CONFIG, 
  FRAMEWORK_DETAILS, 
  INVESTOR_TONE_DETAILS, 
  FINANCIAL_GLOSSARY, 
  INVESTOR_VS_SHAREHOLDER_COMPARISON,
  calculateValuationRecommendations,
  simulateCapitalReinjection,
  calculateDividendDistribution,
  generateGrowthTrajectory,
  solveLiquidationWaterfall,
  formatCurrency
} from '../utils/investmentCalculations';
import { ShareCertificateModal } from './ShareCertificateModal';
import { 
  Landmark, 
  TrendingUp, 
  PieChart as PieIcon, 
  Shield, 
  BookOpen, 
  FileText, 
  DollarSign, 
  Percent, 
  Sliders, 
  Plus, 
  Printer, 
  Download, 
  Share2, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw, 
  HelpCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Scale, 
  Briefcase, 
  Receipt, 
  UserPlus, 
  Eye, 
  Layers, 
  Clock, 
  Building, 
  Search,
  ChevronRight,
  Info
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

export const InvestmentSection: React.FC = () => {
  const { 
    activeWorkspace, 
    vouchers, 
    theme, 
    showToast,
    investors,
    shareholdingGovernance,
    ledgerTransactions,
    shareDisposals,
    updateShareholdingGovernance,
    addInvestor,
    updateInvestor,
    deleteInvestor,
    addLedgerTransaction,
    executeShareDisposal,
    reinjectCapital
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<
    'cap_table' | 'governance' | 'disposals' | 'reinjection' | 'trajectory' | 'liquidation' | 'comparison' | 'ledger' | 'glossary' | 'documents'
  >('cap_table');

  // Modals & Selection states
  const [selectedInvestorForCert, setSelectedInvestorForCert] = useState<InvestorStake | null>(null);
  const [isAddInvestorOpen, setIsAddInvestorOpen] = useState(false);
  const [isRecordTxOpen, setIsRecordTxOpen] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState('');
  const [glossaryCategory, setGlossaryCategory] = useState<string>('All');
  const [trajectoryScenario, setTrajectoryScenario] = useState<'Conservative' | 'Base' | 'Aggressive'>('Base');
  const [liquidationCashInput, setLiquidationCashInput] = useState<number>(65000);
  const [reinjectionAmountInput, setReinjectionAmountInput] = useState<number>(25000);
  const [reinjectionInvestorName, setReinjectionInvestorName] = useState<string>('Dr. Farai Mutasa');

  // Add Investor Form State
  const [newInvestorForm, setNewInvestorForm] = useState({
    name: '',
    email: '',
    cellNumber: '',
    investorType: 'PreferredInvestor' as InvestorType,
    contributionAmount: 15000,
    sharesCount: 6000,
    preferredReturnRate: 8.0,
    notes: '',
    createLoginAccount: true,
    password: 'Investor2026!'
  });

  // Record Ledger Transaction Form State
  const [newTxForm, setNewTxForm] = useState({
    type: 'Opex' as LedgerEntryType,
    description: '',
    amount: 500,
    category: 'Operations',
    referenceDocId: ''
  });

  // Governance settings local state (for editing before committing)
  const [govForm, setGovForm] = useState<ShareholdingGovernance>(() => {
    return shareholdingGovernance || {
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
  });

  // Derived Calculations
  const valuationMetrics = useMemo(() => {
    return calculateValuationRecommendations(vouchers, govForm, ledgerTransactions);
  }, [vouchers, govForm, ledgerTransactions]);

  const currentCashBalance = useMemo(() => {
    if (!ledgerTransactions || ledgerTransactions.length === 0) return 72706;
    return ledgerTransactions[ledgerTransactions.length - 1].balanceAfter;
  }, [ledgerTransactions]);

  const totalCapitalInjected = useMemo(() => {
    return (investors || []).reduce((acc, inv) => acc + (inv.contributionAmount || 0), 0);
  }, [investors]);

  const totalOutstandingShares = useMemo(() => {
    return (investors || []).reduce((acc, inv) => acc + (inv.sharesCount || 0), 0);
  }, [investors]);

  const totalStakeAllocated = useMemo(() => {
    return (investors || []).reduce((acc, inv) => acc + (inv.equityPercentage || 0), 0);
  }, [investors]);

  const dividendWaterfall = useMemo(() => {
    const estimatedMonthlyProfit = Math.max(valuationMetrics.annualizedGMV * 0.35 / 12, 4500);
    return calculateDividendDistribution(estimatedMonthlyProfit, govForm, investors || []);
  }, [valuationMetrics, govForm, investors]);

  const growthTrajectoryData = useMemo(() => {
    const baselineMonthly = Math.max(valuationMetrics.annualizedGMV / 12, 5500);
    return generateGrowthTrajectory(baselineMonthly, govForm.companyValuation, trajectoryScenario);
  }, [valuationMetrics, govForm.companyValuation, trajectoryScenario]);

  const liquidationAnalysis = useMemo(() => {
    return solveLiquidationWaterfall(
      liquidationCashInput,
      25000, // Senior secured debt
      12000, // Operational accounts payable
      60000, // Preferred capital
      govForm.liquidationPreferenceMultiple || 1.0,
      govForm.totalIssuedShares || 100000
    );
  }, [liquidationCashInput, govForm]);

  const reinjectionSimulation = useMemo(() => {
    return simulateCapitalReinjection(
      reinjectionAmountInput,
      govForm.companyValuation,
      govForm.totalIssuedShares || 100000,
      reinjectionInvestorName
    );
  }, [reinjectionAmountInput, govForm, reinjectionInvestorName]);

  // Handlers
  const handleSaveGovernance = async () => {
    try {
      await updateShareholdingGovernance(govForm);
      showToast('Corporate governance settings updated successfully!', 'success');
    } catch (err) {
      showToast('Failed to save governance rules.', 'error');
    }
  };

  const handleFrameworkChange = (fw: GovernanceFramework) => {
    const defaults = DEFAULT_GOVERNANCE_CONFIG[fw];
    setGovForm(prev => ({
      ...prev,
      framework: fw,
      ...defaults
    }));
  };

  const handleAddInvestorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvestorForm.name || !newInvestorForm.email) {
      showToast('Investor name and email are required.', 'error');
      return;
    }

    const currentTotalShares = govForm.totalIssuedShares || 100000;
    const computedStake = Number(((newInvestorForm.sharesCount / currentTotalShares) * 100).toFixed(2));
    const computedFairValue = Number((newInvestorForm.sharesCount * govForm.sharePrice).toFixed(2));

    const res = await addInvestor({
      workspaceId: activeWorkspace?.id || 'ws_vakzim',
      name: newInvestorForm.name,
      email: newInvestorForm.email,
      cellNumber: newInvestorForm.cellNumber,
      investorType: newInvestorForm.investorType,
      contributionAmount: Number(newInvestorForm.contributionAmount),
      sharesCount: Number(newInvestorForm.sharesCount),
      equityPercentage: computedStake,
      valuationAtInvestment: govForm.companyValuation,
      currentMonetaryValue: computedFairValue,
      preferredReturnRate: newInvestorForm.preferredReturnRate,
      dateJoined: new Date().toISOString().split('T')[0],
      notes: newInvestorForm.notes,
      status: 'Active',
      dividendEarnedTotal: 0,
      shareCertificateNumber: `CERT-WV-${Date.now().toString().slice(-4)}`
    }, newInvestorForm.createLoginAccount, newInvestorForm.password);

    if (res.success) {
      showToast(`Investor ${newInvestorForm.name} enrolled with ${computedStake}% stake!`, 'success');
      setIsAddInvestorOpen(false);
      setNewInvestorForm({
        name: '',
        email: '',
        cellNumber: '',
        investorType: 'PreferredInvestor',
        contributionAmount: 15000,
        sharesCount: 6000,
        preferredReturnRate: 8.0,
        notes: '',
        createLoginAccount: true,
        password: 'Investor2026!'
      });
    } else {
      showToast(res.error || 'Failed to add investor', 'error');
    }
  };

  const handleRecordTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTxForm.description || !newTxForm.amount) {
      showToast('Description and amount are required.', 'error');
      return;
    }

    // Inflows are positive, outflows are negative
    const isOutflow = ['Opex', 'Capex', 'AgentCommission', 'DividendPayout', 'TaxProvision'].includes(newTxForm.type);
    const amountVal = isOutflow ? -Math.abs(Number(newTxForm.amount)) : Math.abs(Number(newTxForm.amount));
    const lastBal = ledgerTransactions.length > 0 ? ledgerTransactions[0].balanceAfter : 72706;

    const res = await addLedgerTransaction({
      workspaceId: activeWorkspace?.id || 'ws_vakzim',
      type: newTxForm.type,
      description: newTxForm.description,
      amount: amountVal,
      date: new Date().toISOString(),
      recordedBy: 'Workspace Master',
      category: newTxForm.category,
      referenceDocId: newTxForm.referenceDocId || undefined,
      balanceAfter: lastBal + amountVal
    });

    if (res.success) {
      showToast('Corporate ledger transaction recorded successfully!', 'success');
      setIsRecordTxOpen(false);
      setNewTxForm({
        type: 'Opex',
        description: '',
        amount: 500,
        category: 'Operations',
        referenceDocId: ''
      });
    } else {
      showToast(res.error || 'Failed to record transaction', 'error');
    }
  };

  const handleExecuteReinjection = async () => {
    const targetInvestor = investors.find(i => i.name === reinjectionInvestorName);
    if (!targetInvestor) {
      showToast('Select an existing investor to reinject capital.', 'error');
      return;
    }

    const res = await reinjectCapital(targetInvestor.id, reinjectionAmountInput);
    if (res.success) {
      showToast(`Successfully reinjected ${formatCurrency(reinjectionAmountInput)}! Cap table updated.`, 'success');
    } else {
      showToast(res.error || 'Reinjection failed.', 'error');
    }
  };

  // Filtered glossary
  const filteredGlossary = useMemo(() => {
    return FINANCIAL_GLOSSARY.filter(item => {
      const matchesSearch = item.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
        item.definition.toLowerCase().includes(glossarySearch.toLowerCase());
      const matchesCat = glossaryCategory === 'All' || item.category === glossaryCategory;
      return matchesSearch && matchesCat;
    });
  }, [glossarySearch, glossaryCategory]);

  const glossaryCategories = useMemo(() => {
    const cats = Array.from(new Set(FINANCIAL_GLOSSARY.map(g => g.category)));
    return ['All', ...cats];
  }, []);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden font-sans">
      
      {/* SECTION HEADER: CORPORATE SUITE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                Institutional Cap Table Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                {FRAMEWORK_DETAILS[govForm.framework]?.badge || 'Corporate Standard'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Landmark className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Corporate Investment & Shareholding Directorate
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              Equipped with leading Wall Street and Silicon Valley equity structures. Govern investor contributions, equity stakes, dividend waterfalls, secondary share disposals, and financial forecasts under agreed bylaws.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsAddInvestorOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Issue Shares / Add Investor</span>
            </button>
            <button
              onClick={() => setIsRecordTxOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Record Ledger Entry</span>
            </button>
          </div>
        </div>

        {/* HERO METRICS BANNER */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Building className="w-3 h-3 text-indigo-500" />
              Company Valuation
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(govForm.companyValuation)}
            </div>
            <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 mt-0.5">
              <ArrowUpRight className="w-2.5 h-2.5" />
              <span>{valuationMetrics.arrMultiple}x ARR Multiple</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-500" />
              Capital Injected
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-650 dark:text-emerald-400 mt-1">
              {formatCurrency(totalCapitalInjected)}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Across {(investors || []).length} Recorded Backers
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <PieIcon className="w-3 h-3 text-sky-500" />
              Outstanding Shares
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {totalOutstandingShares.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-sky-600 dark:text-sky-400 mt-0.5">
              {formatCurrency(govForm.sharePrice)} / share
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Receipt className="w-3 h-3 text-purple-500" />
              Cash In Treasury
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-purple-600 dark:text-purple-400 mt-1">
              {formatCurrency(currentCashBalance)}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              ~14.2 Mos Operating Buffer
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Scale className="w-3 h-3 text-amber-500" />
              Dividend Pool
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(dividendWaterfall.distributablePool)}
            </div>
            <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {govForm.dividendPayoutRatio}% Net Distributed
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Shield className="w-3 h-3 text-rose-500" />
              Retained Reserve
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(dividendWaterfall.retainedAmount)}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              {govForm.retainedEarningsRatio}% Working Capital
            </div>
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 sm:gap-2 overflow-x-auto no-scrollbar w-full pb-1">
        {[
          { id: 'cap_table', label: 'Cap Table & Stakes', icon: PieIcon },
          { id: 'governance', label: 'Governance & Rules', icon: Sliders },
          { id: 'disposals', label: 'Share Disposals & Valuation', icon: ArrowUpRight },
          { id: 'reinjection', label: 'Capital Reinjection & Dilution', icon: RefreshCw },
          { id: 'trajectory', label: 'Growth Trajectory', icon: TrendingUp },
          { id: 'liquidation', label: 'Liquidation & Insolvency', icon: Scale },
          { id: 'comparison', label: 'Investors vs Shareholders', icon: Briefcase },
          { id: 'ledger', label: 'Corporate Cash Ledger', icon: Receipt },
          { id: 'glossary', label: 'Financial Glossary', icon: BookOpen },
          { id: 'documents', label: 'Document Center', icon: FileText }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`pb-2.5 px-3 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-150 border-b-2 shrink-0 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: CAP TABLE & STAKES */}
      {activeSubTab === 'cap_table' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Official Capitalization Table (Cap Table)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Full registry of equity units, contribution basis, ownership stakes, and fair market values. Total allocated: <span className="font-bold text-slate-800 dark:text-slate-200">{(totalStakeAllocated || 0).toFixed(1)}%</span>.
                </p>
              </div>

              <button
                onClick={() => setIsAddInvestorOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Stakeholder</span>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Stakeholder / Entity</th>
                    <th className="py-3 px-3">Class & Instrument</th>
                    <th className="py-3 px-3 text-right">Shares Held</th>
                    <th className="py-3 px-3 text-right">Equity Stake</th>
                    <th className="py-3 px-3 text-right">Capital Injected</th>
                    <th className="py-3 px-3 text-right">Current Fair Value</th>
                    <th className="py-3 px-3 text-right">Dividends Paid</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {(investors || []).map((inv) => {
                    const typeBadgeColors = {
                      PreferredInvestor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                      CommonShareholder: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800',
                      ConvertibleDebt: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                      Angel: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    };

                    const isGain = inv.currentMonetaryValue >= inv.contributionAmount;
                    const gainPercent = inv.contributionAmount > 0 
                      ? (((inv.currentMonetaryValue - inv.contributionAmount) / inv.contributionAmount) * 100).toFixed(1)
                      : '0.0';

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="font-sans font-bold text-slate-900 dark:text-white">
                            {inv.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                            <span>{inv.email}</span>
                            {inv.cellNumber && <span>• {inv.cellNumber}</span>}
                          </div>
                          {inv.notes && (
                            <div className="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-xs">
                              {inv.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${typeBadgeColors[inv.investorType] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                            {inv.investorType.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          {inv.preferredReturnRate && (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                              {inv.preferredReturnRate}% Preferred Hurdle
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-800 dark:text-slate-200">
                          {inv.sharesCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm font-black text-emerald-650 dark:text-emerald-400">
                            {(inv.equityPercentage || 0).toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-700 dark:text-slate-300">
                          {formatCurrency(inv.contributionAmount)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {formatCurrency(inv.currentMonetaryValue)}
                          </div>
                          <div className={`text-[10px] flex items-center justify-end gap-0.5 ${isGain ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isGain ? '+' : ''}{gainPercent}% Gain
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-650 dark:text-emerald-400 font-bold">
                          {formatCurrency(inv.dividendEarnedTotal || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedInvestorForCert(inv)}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                            title="Print Official Share Certificate"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Certificate</span>
                          </button>
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

      {/* TAB 2: CORPORATE GOVERNANCE & RULES */}
      {activeSubTab === 'governance' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Corporate Governance Framework & Shareholding Bylaws
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Select and configure the legal and operational framework governing investor rights, profit sharing waterfalls, hurdle rates, and liquidity policies.
              </p>
            </div>

            {/* Framework Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {(Object.keys(FRAMEWORK_DETAILS) as GovernanceFramework[]).map((fwKey) => {
                const details = FRAMEWORK_DETAILS[fwKey];
                const isSelected = govForm.framework === fwKey;

                return (
                  <div
                    key={fwKey}
                    onClick={() => handleFrameworkChange(fwKey)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 dark:border-indigo-400 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {details.badge}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {details.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                        {details.summary}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800 text-[10px] font-mono text-slate-500">
                      <div className="truncate"><span className="text-slate-400">Jurisdiction:</span> {details.jurisdiction}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Framework Detailed Specs */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-3 mb-6">
              <div className="font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Legal Covenants Active Under {FRAMEWORK_DETAILS[govForm.framework]?.name}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-slate-700 dark:text-slate-300">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Voting & Board Structure</span>
                  <p className="text-xs leading-relaxed">{FRAMEWORK_DETAILS[govForm.framework]?.votingRights}</p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Dividend Mechanics</span>
                  <p className="text-xs leading-relaxed">{FRAMEWORK_DETAILS[govForm.framework]?.dividendMechanics}</p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Investor Covenants & ROFR</span>
                  <p className="text-xs leading-relaxed">{FRAMEWORK_DETAILS[govForm.framework]?.investorProtection}</p>
                </div>
              </div>
            </div>

            {/* Config Sliders & Policy Rules */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
              
              {/* Left Column: Profit Sharing Sliders */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Profit Distribution & Reserve Policy
                </h4>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <span className="text-slate-600 dark:text-slate-400">Retained Working Capital Reserve:</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{govForm.retainedEarningsRatio}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="5"
                      value={govForm.retainedEarningsRatio}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setGovForm(prev => ({
                          ...prev,
                          retainedEarningsRatio: val,
                          dividendPayoutRatio: 100 - val
                        }));
                      }}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                      <span>10% Low Buffer</span>
                      <span>50% Balanced</span>
                      <span>90% Maximum Landgrab</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <span className="text-slate-600 dark:text-slate-400">Distributable Dividend Payout:</span>
                      <span className="font-extrabold text-emerald-650 dark:text-emerald-400">{govForm.dividendPayoutRatio}%</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Distributed monthly to eligible preferred and common shareholders pursuant to the priority waterfall.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <span className="text-slate-600 dark:text-slate-400">Preferred Hurdle Rate (% Annual):</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">{govForm.hurdleRate}%</span>
                    </div>
                    <input
                      type="number"
                      step="0.5"
                      value={govForm.hurdleRate}
                      onChange={(e) => setGovForm(prev => ({ ...prev, hurdleRate: Number(e.target.value) }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Minimum rate paid to Preferred investors before common shareholders receive dividends.
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Investor Tone & Liquidity Policy */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-purple-500" />
                  Agreed Investor Tone & Secondary Market Bylaws
                </h4>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div>
                    <label className="text-xs font-mono text-slate-600 dark:text-slate-400 block mb-1.5">
                      Agreed Investor Tone & Risk Stance:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(INVESTOR_TONE_DETAILS) as InvestorTone[]).map((toneKey) => {
                        const isTone = govForm.investorTone === toneKey;
                        return (
                          <button
                            key={toneKey}
                            type="button"
                            onClick={() => setGovForm(prev => ({ ...prev, investorTone: toneKey }))}
                            className={`px-2 py-2 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider border transition cursor-pointer text-center ${
                              isTone
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {toneKey.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed italic">
                      {INVESTOR_TONE_DETAILS[govForm.investorTone]?.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <label className="text-xs font-mono text-slate-600 dark:text-slate-400 block mb-1.5">
                      Secondary Disposals & Lock-up Period:
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                        <input
                          type="checkbox"
                          checked={govForm.allowSecondaryDisposals}
                          onChange={(e) => setGovForm(prev => ({ ...prev, allowSecondaryDisposals: e.target.checked }))}
                          className="rounded text-indigo-600"
                        />
                        <span>Allow Share Disposals / Transfers</span>
                      </label>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500 whitespace-nowrap">Lock-up Days:</span>
                      <input
                        type="number"
                        value={govForm.minShareHoldingDaysBeforeDisposal}
                        onChange={(e) => setGovForm(prev => ({ ...prev, minShareHoldingDaysBeforeDisposal: Number(e.target.value) }))}
                        className="w-24 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                      <span className="text-[10px] text-slate-400">days before shares can be disposed</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Save Button */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={handleSaveGovernance}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Governance Configuration</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SHARE DISPOSALS & VALUATION RECOMMENDATIONS */}
      {activeSubTab === 'disposals' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Valuation Engine Cards */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Secondary Market & Share Disposal Valuation Engine
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Recommends fair market exit and disposal prices for shares using 3 industry-standard corporate finance valuation methodologies.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                
                {/* Method 1: ARR Multiple */}
                <div className={`p-4 rounded-xl border-2 transition ${
                  govForm.disposalValuationMethod === 'ARR_Multiple'
                    ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950'
                }`}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Method A</div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">ARR Multiple (4.5x GMV)</h4>
                  <div className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400 mt-2">
                    {formatCurrency(valuationMetrics.arrValuation)}
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mt-1">
                    {formatCurrency(valuationMetrics.arrSharePrice)} / share
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Based on annualized Wi-Fi voucher sales of {formatCurrency(valuationMetrics.annualizedGMV)}.
                  </p>
                  <button
                    onClick={() => {
                      setGovForm(prev => ({ ...prev, disposalValuationMethod: 'ARR_Multiple' }));
                    }}
                    className="mt-3 w-full py-1 text-[10px] font-mono font-bold uppercase rounded bg-indigo-600 text-white cursor-pointer"
                  >
                    Select As Active
                  </button>
                </div>

                {/* Method 2: Discounted Cash Flow (DCF) */}
                <div className={`p-4 rounded-xl border-2 transition ${
                  govForm.disposalValuationMethod === 'DCF'
                    ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950'
                }`}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Method B</div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">Discounted Cash Flow (DCF)</h4>
                  <div className="text-lg font-black font-mono text-sky-600 dark:text-sky-400 mt-2">
                    {formatCurrency(valuationMetrics.dcfValuation)}
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mt-1">
                    {formatCurrency(valuationMetrics.dcfSharePrice)} / share
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Present value of 3-year projected cash flow at 15% discount rate + terminal multiple.
                  </p>
                  <button
                    onClick={() => {
                      setGovForm(prev => ({ ...prev, disposalValuationMethod: 'DCF' }));
                    }}
                    className="mt-3 w-full py-1 text-[10px] font-mono font-bold uppercase rounded bg-sky-600 text-white cursor-pointer"
                  >
                    Select As Active
                  </button>
                </div>

                {/* Method 3: NAV + Cash Buffer */}
                <div className={`p-4 rounded-xl border-2 transition ${
                  govForm.disposalValuationMethod === 'NAV_Plus_Cash'
                    ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950'
                }`}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Method C</div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">Net Asset Value (NAV Floor)</h4>
                  <div className="text-lg font-black font-mono text-emerald-650 dark:text-emerald-400 mt-2">
                    {formatCurrency(valuationMetrics.navValuation)}
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mt-1">
                    {formatCurrency(valuationMetrics.navSharePrice)} / share
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Tangible equipment, router inventory, and cash buffer in bank account.
                  </p>
                  <button
                    onClick={() => {
                      setGovForm(prev => ({ ...prev, disposalValuationMethod: 'NAV_Plus_Cash' }));
                    }}
                    className="mt-3 w-full py-1 text-[10px] font-mono font-bold uppercase rounded bg-emerald-650 text-white cursor-pointer"
                  >
                    Select As Active
                  </button>
                </div>

              </div>

              {/* Official Disposal Recommendation Statement */}
              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h5 className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                    System Fair Share Price Recommendation: {formatCurrency(valuationMetrics.recommendedSharePrice)} / share
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    When an investor wishes to dispose or sell their shares back to the company or co-investors, the recommended price based on current business metrics is <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(valuationMetrics.recommendedSharePrice)}</span>. This protects existing shareholders from overpaying while honoring the investor’s capital appreciation.
                  </p>
                </div>
              </div>
            </div>

            {/* Pending Secondary Market Disposals Queue */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-amber-500" />
                  Disposal Requests Queue
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {(shareDisposals || []).length} Pending
                </span>
              </div>

              {(shareDisposals || []).length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-mono">
                  No active share disposal requests pending review.
                </div>
              ) : (
                <div className="space-y-3">
                  {(shareDisposals || []).map(disp => (
                    <div key={disp.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{disp.investorName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                          {disp.status}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        Disposing: <span className="font-bold text-slate-900 dark:text-white">{disp.sharesToDispose.toLocaleString()} shares</span> at {formatCurrency(disp.suggestedPricePerShare)}
                      </div>
                      <div className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                        Total Payout: {formatCurrency(disp.totalOfferAmount)}
                      </div>
                      {disp.reason && (
                        <p className="text-[11px] text-slate-500 italic">"{disp.reason}"</p>
                      )}

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={() => executeShareDisposal(disp.id, 'Approve')}
                          className="flex-1 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-mono font-bold cursor-pointer transition"
                        >
                          Execute Buyback
                        </button>
                        <button
                          onClick={() => executeShareDisposal(disp.id, 'Reject')}
                          className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-mono font-bold cursor-pointer transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* TAB 4: CAPITAL REINJECTION & DILUTION SIMULATOR */}
      {activeSubTab === 'reinjection' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Capital Reinjection & Share Dilution Sandbox
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Simulate or commit new capital injections. Calculates pre-money vs post-money valuation, newly minted shares, and exact before-vs-after cap table dilution across all partners.
              </p>
            </div>

            {/* Controls Box */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div>
                <label className="text-[11px] font-mono uppercase text-slate-500 block mb-1">
                  Reinjecting Investor:
                </label>
                <select
                  value={reinjectionInvestorName}
                  onChange={(e) => setReinjectionInvestorName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                >
                  {(investors || []).map(inv => (
                    <option key={inv.id} value={inv.name}>{inv.name} ({inv.investorType})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase text-slate-500 block mb-1">
                  Capital Injection Amount ($):
                </label>
                <input
                  type="number"
                  step="5000"
                  value={reinjectionAmountInput}
                  onChange={(e) => setReinjectionAmountInput(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleExecuteReinjection}
                  className="w-full py-2 px-4 rounded-lg bg-emerald-650 hover:bg-emerald-700 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Commit Capital Reinjection</span>
                </button>
              </div>
            </div>

            {/* Simulation KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Pre-Money Valuation</span>
                <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white mt-1 block">
                  {formatCurrency(reinjectionSimulation.preMoneyValuation)}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Post-Money Valuation</span>
                <span className="text-base font-extrabold font-mono text-indigo-600 dark:text-indigo-400 mt-1 block">
                  {formatCurrency(reinjectionSimulation.postMoneyValuation)}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">New Shares Issued</span>
                <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white mt-1 block">
                  +{reinjectionSimulation.newSharesIssued.toLocaleString()}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Cap Table Dilution Factor</span>
                <span className="text-base font-extrabold font-mono text-rose-500 mt-1 block">
                  {(100 - reinjectionSimulation.dilutionFactor).toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Dilution Cap Table Comparison */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                Before & After Ownership Stake Dilution Matrix
              </div>
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900 text-slate-500 text-[10px] uppercase">
                    <th className="py-2.5 px-4">Stakeholder</th>
                    <th className="py-2.5 px-3 text-right">Pre-Reinjection Stake</th>
                    <th className="py-2.5 px-3 text-right">Post-Reinjection Stake</th>
                    <th className="py-2.5 px-3 text-right">Dilution Impact</th>
                    <th className="py-2.5 px-4 text-right">Pro-Rata Anti-Dilution Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(investors || []).map(inv => {
                    const isReinjectingParty = inv.name === reinjectionInvestorName;
                    const prevStake = inv.equityPercentage;
                    const newShares = isReinjectingParty ? inv.sharesCount + reinjectionSimulation.newSharesIssued : inv.sharesCount;
                    const newStake = Number(((newShares / reinjectionSimulation.newTotalShares) * 100).toFixed(2));
                    const diff = newStake - prevStake;
                    const proRataAmount = (prevStake / 100) * reinjectionAmountInput;

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-sans font-bold text-slate-900 dark:text-white">
                          {inv.name} {isReinjectingParty && <span className="text-emerald-500 text-[10px] font-mono">(Active Funder)</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                          {(prevStake || 0).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-indigo-600 dark:text-indigo-400">
                          {(newStake || 0).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`text-[11px] font-bold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                            {diff > 0 ? `+${(diff || 0).toFixed(2)}%` : `${(diff || 0).toFixed(2)}%`}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500">
                          {isReinjectingParty ? 'Participating' : formatCurrency(proRataAmount)}
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

      {/* TAB 5: BUSINESS GROWTH TRAJECTORY */}
      {activeSubTab === 'trajectory' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  36-Month Business Growth Trajectory & Forecast
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Predicts revenue scaling, net profit expansion, enterprise valuation compounding, and cumulative dividend distributions.
                </p>
              </div>

              {/* Scenario Toggles */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(['Conservative', 'Base', 'Aggressive'] as const).map(scen => (
                  <button
                    key={scen}
                    onClick={() => setTrajectoryScenario(scen)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition cursor-pointer ${
                      trajectoryScenario === scen
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {scen}
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts Trajectory Graph */}
            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthTrajectoryData}>
                  <defs>
                    <linearGradient id="valGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} fontStyle="italic" />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip 
                    formatter={(val: any) => formatCurrency(Number(val))}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="valuation" name="Enterprise Valuation" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#valGradient)" />
                  <Area type="monotone" dataKey="revenue" name="Monthly Voucher GMV" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#revGradient)" />
                  <Area type="monotone" dataKey="netProfit" name="Net Operational Profit" stroke="#0ea5e9" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Trajectory Table Summary */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px]">
                    <th className="py-2.5 px-4">Timeline Milestone</th>
                    <th className="py-2.5 px-3 text-right">Projected Monthly Revenue</th>
                    <th className="py-2.5 px-3 text-right">Net Profit</th>
                    <th className="py-2.5 px-3 text-right">Dividend Pool</th>
                    <th className="py-2.5 px-4 text-right">Implied Enterprise Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {growthTrajectoryData.map(d => (
                    <tr key={d.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200">{d.label}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">{formatCurrency(d.revenue)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-650 dark:text-emerald-400 font-bold">{formatCurrency(d.netProfit)}</td>
                      <td className="py-2.5 px-3 text-right text-sky-600 dark:text-sky-400">{formatCurrency(d.dividendPool)}</td>
                      <td className="py-2.5 px-4 text-right font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(d.valuation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* TAB 6: FAIR LIQUIDATION RULES & INSOLVENCY STACK */}
      {activeSubTab === 'liquidation' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Fair Liquidation Rules & Insolvency Priority Waterfall
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                In compliance with statutory bankruptcy and corporate distress laws (Absolute Priority Rule). Dictates the exact sequence and dollar-for-dollar payout order if assets are liquidated.
              </p>
            </div>

            {/* Stress Test Simulation Slider */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 dark:text-slate-400 font-bold">Simulated Net Cash Realized in Distress:</span>
                <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(liquidationCashInput)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="150000"
                step="5000"
                value={liquidationCashInput}
                onChange={(e) => setLiquidationCashInput(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>$0 Complete Loss</span>
                <span>$75,000 Moderate Recovery</span>
                <span>$150,000 Full Recovery + Common Distribution</span>
              </div>
            </div>

            {/* Waterfall Payout Breakdown */}
            <div className="space-y-4">
              
              {/* Tier 1 */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 font-mono font-bold text-xs flex items-center justify-center">1</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{liquidationAnalysis.tier1.title}</h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    liquidationAnalysis.tier1.isFullySatisfied ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}>
                    {liquidationAnalysis.tier1.isFullySatisfied ? '100% Satisfied' : 'Deficit'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 text-slate-600 dark:text-slate-400">
                  <div>Claim: {formatCurrency(liquidationAnalysis.tier1.claim)}</div>
                  <div>Payout: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(liquidationAnalysis.tier1.payout)}</span></div>
                  <div>Remaining Deficit: <span className="text-rose-500 font-bold">{formatCurrency(liquidationAnalysis.tier1.deficit)}</span></div>
                </div>
              </div>

              {/* Tier 2 */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 font-mono font-bold text-xs flex items-center justify-center">2</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{liquidationAnalysis.tier2.title}</h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    liquidationAnalysis.tier2.isFullySatisfied ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {liquidationAnalysis.tier2.isFullySatisfied ? '100% Satisfied' : 'Partial / Impaired'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 text-slate-600 dark:text-slate-400">
                  <div>Claim: {formatCurrency(liquidationAnalysis.tier2.claim)}</div>
                  <div>Payout: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(liquidationAnalysis.tier2.payout)}</span></div>
                  <div>Remaining Deficit: <span className="text-amber-500 font-bold">{formatCurrency(liquidationAnalysis.tier2.deficit)}</span></div>
                </div>
              </div>

              {/* Tier 3 */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-mono font-bold text-xs flex items-center justify-center">3</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{liquidationAnalysis.tier3.title}</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    {liquidationAnalysis.tier3.recoveryPercent}% Capital Recovery
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 text-slate-600 dark:text-slate-400">
                  <div>Preferred Claim: {formatCurrency(liquidationAnalysis.tier3.claim)}</div>
                  <div>Payout: <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(liquidationAnalysis.tier3.payout)}</span></div>
                  <div>Protection Multiple: <span className="font-bold text-slate-900 dark:text-white">1.0x Liquidation Preference</span></div>
                </div>
              </div>

              {/* Tier 4 */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-600 font-mono font-bold text-xs flex items-center justify-center">4</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{liquidationAnalysis.tier4.title}</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    Residual Equity
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 text-slate-600 dark:text-slate-400">
                  <div>Residual Pool: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(liquidationAnalysis.tier4.payout)}</span></div>
                  <div>Payout / Common Share: <span className="font-bold text-emerald-650 dark:text-emerald-400">${liquidationAnalysis.tier4.payoutPerShare}</span></div>
                  <div>Distribution: Pro-Rata Equity Split</div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* TAB 7: INVESTORS VS SHAREHOLDERS COMPARISON */}
      {activeSubTab === 'comparison' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Structural Distinction: Debt Investors vs. Equity Shareholders
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                A critical legal and financial comparison defining earnings rights, insolvency priority, dilution insulation, and voting authority.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-mono text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 w-1/4">Legal & Financial Dimension</th>
                    <th className="py-3 px-4 w-3/8 text-indigo-900 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30">
                      Debt / Note Investor
                    </th>
                    <th className="py-3 px-4 w-3/8 text-sky-900 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/30">
                      Common Equity Shareholder
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {INVESTOR_VS_SHAREHOLDER_COMPARISON.map((comp, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white font-mono text-xs">
                        {comp.attribute}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 bg-indigo-50/20 dark:bg-indigo-950/10 leading-relaxed text-xs">
                        {comp.debtInvestor}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 bg-sky-50/20 dark:bg-sky-950/10 leading-relaxed text-xs">
                        {comp.equityShareholder}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: CORPORATE GENERAL LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Corporate Cash Book & General Ledger
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Verifiable financial ledger tracking inflows, capital disbursements, operational overhead (OPEX), hardware acquisition (CAPEX), and dividends.
                </p>
              </div>

              <button
                onClick={() => setIsRecordTxOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ledger Entry</span>
              </button>
            </div>

            {/* Running Balance Banner */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between font-mono">
              <div>
                <span className="text-xs text-slate-500 uppercase block">Current Working Capital Balance</span>
                <span className="text-2xl font-black text-emerald-650 dark:text-emerald-400">
                  {formatCurrency(currentCashBalance)}
                </span>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>Total Transactions Recorded: <span className="font-bold text-slate-800 dark:text-slate-200">{(ledgerTransactions || []).length}</span></div>
                <div>Audit Status: <span className="text-emerald-600 font-bold">In Balance</span></div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px]">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-4">Description & Ref</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...(ledgerTransactions || [])].reverse().map(tx => {
                    const isInflow = tx.amount >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-sans font-bold text-slate-900 dark:text-white">{tx.description}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Category: {tx.category} {tx.referenceDocId && `• Ref: ${tx.referenceDocId}`}
                          </div>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-black ${isInflow ? 'text-emerald-650 dark:text-emerald-400' : 'text-rose-500'}`}>
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

      {/* TAB 9: FINANCIAL GLOSSARY */}
      {activeSubTab === 'glossary' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Corporate Financial Dictionary & Key Terms
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Clear institutional definitions of corporate finance, investment mechanics, cap tables, and legal terminology.
              </p>
            </div>

            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search corporate financial terms (e.g., EBITDA, Dilution, Hurdle)..."
                  value={glossarySearch}
                  onChange={(e) => setGlossarySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
                {glossaryCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setGlossaryCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition cursor-pointer ${
                      glossaryCategory === cat
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Glossary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGlossary.map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold font-sans text-slate-900 dark:text-white">
                      {item.term}
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.definition}
                  </p>
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-500 italic">
                    <span className="font-bold text-slate-700 dark:text-slate-300 not-italic">Strategic Value:</span> {item.importance}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* TAB 10: DOCUMENT CENTER */}
      {activeSubTab === 'documents' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Investment Document Center & Regulatory Export
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Generate, download, and print official stock certificates, cap table statements, term sheets, and ledger audits formatted for board review.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Document 1 */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Stock Certificates
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Formal printable equity stock certificates for any investor in the registry.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (investors.length > 0) setSelectedInvestorForCert(investors[0]);
                  }}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Sample Cert</span>
                </button>
              </div>

              {/* Document 2 */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3">
                    <PieIcon className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Cap Table Audit Statement
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Certified capitalization table summary including share counts and ownership percentages.
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Cap Table</span>
                </button>
              </div>

              {/* Document 3 */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Corporate General Ledger
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Full double-entry transaction record covering OPEX, CAPEX, and dividend disbursements.
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="w-full py-2 rounded-lg bg-emerald-650 hover:bg-emerald-700 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Ledger</span>
                </button>
              </div>

              {/* Document 4 */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Governance Term Sheet
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Complete bylaws summary and liquidation preference schedule under {govForm.framework}.
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Term Sheet</span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL: ADD INVESTOR / ISSUE SHARES */}
      {isAddInvestorOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                Issue Shares & Enroll Investor
              </h3>
              <button
                onClick={() => setIsAddInvestorOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddInvestorSubmit} className="p-6 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Investor Full Name / Legal Entity:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Dr. Farai Mutasa or Apex Ventures"
                  value={newInvestorForm.name}
                  onChange={(e) => setNewInvestorForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Email Address:</label>
                  <input
                    type="email"
                    required
                    placeholder="investor@domain.com"
                    value={newInvestorForm.email}
                    onChange={(e) => setNewInvestorForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Cell / WhatsApp:</label>
                  <input
                    type="text"
                    placeholder="+263..."
                    value={newInvestorForm.cellNumber}
                    onChange={(e) => setNewInvestorForm(prev => ({ ...prev, cellNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Instrument / Class:</label>
                  <select
                    value={newInvestorForm.investorType}
                    onChange={(e) => setNewInvestorForm(prev => ({ ...prev, investorType: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="PreferredInvestor">Preferred Stock</option>
                    <option value="CommonShareholder">Common Stock</option>
                    <option value="ConvertibleDebt">Convertible SAFE / Debt</option>
                    <option value="Angel">Angel Equity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Preferred Hurdle (%):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newInvestorForm.preferredReturnRate}
                    onChange={(e) => setNewInvestorForm(prev => ({ ...prev, preferredReturnRate: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Capital Injected ($):</label>
                  <input
                    type="number"
                    required
                    value={newInvestorForm.contributionAmount}
                    onChange={(e) => {
                      const amount = Number(e.target.value);
                      const impliedShares = Math.round(amount / govForm.sharePrice);
                      setNewInvestorForm(prev => ({ 
                        ...prev, 
                        contributionAmount: amount,
                        sharesCount: impliedShares
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Shares Minted / Assigned:</label>
                  <input
                    type="number"
                    required
                    value={newInvestorForm.sharesCount}
                    onChange={(e) => setNewInvestorForm(prev => ({ ...prev, sharesCount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 text-[11px] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-900 dark:text-indigo-300">
                  <input
                    type="checkbox"
                    checked={newInvestorForm.createLoginAccount}
                    onChange={(e) => setNewInvestorForm(prev => ({ ...prev, createLoginAccount: e.target.checked }))}
                    className="rounded text-indigo-600"
                  />
                  <span>Provision Read-Only Investor Dashboard Login</span>
                </label>
                {newInvestorForm.createLoginAccount && (
                  <div>
                    <span className="text-slate-500 block mb-1">Temporary Initial Password:</span>
                    <input
                      type="text"
                      value={newInvestorForm.password}
                      onChange={(e) => setNewInvestorForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddInvestorOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  Confirm & Inscribe on Cap Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD LEDGER TRANSACTION */}
      {isRecordTxOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-500" />
                Record Cash Book Entry
              </h3>
              <button
                onClick={() => setIsRecordTxOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordTxSubmit} className="p-6 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Transaction Classification:</label>
                <select
                  value={newTxForm.type}
                  onChange={(e) => setNewTxForm(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="Opex">Operating Expense (OPEX)</option>
                  <option value="Capex">Hardware / Infrastructure (CAPEX)</option>
                  <option value="Revenue">Direct Wi-Fi Revenue Inflow</option>
                  <option value="AgentCommission">Agent Commission Disbursed</option>
                  <option value="DividendPayout">Shareholder Dividend Distribution</option>
                  <option value="CapitalReinjection">Investor Capital Injection</option>
                  <option value="TaxProvision">Corporate Tax Provision</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Description / Memo:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Q3 Solar Inverter Replacement or ISP Backhaul"
                  value={newTxForm.description}
                  onChange={(e) => setNewTxForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Amount ($):</label>
                  <input
                    type="number"
                    step="10"
                    required
                    value={newTxForm.amount}
                    onChange={(e) => setNewTxForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Category:</label>
                  <input
                    type="text"
                    value={newTxForm.category}
                    onChange={(e) => setNewTxForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Invoice / Receipt Reference ID:</label>
                <input
                  type="text"
                  placeholder="e.g., INV-2026-8801"
                  value={newTxForm.referenceDocId}
                  onChange={(e) => setNewTxForm(prev => ({ ...prev, referenceDocId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordTxOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-650 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Record Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE SHARE CERTIFICATE MODAL */}
      {selectedInvestorForCert && (
        <ShareCertificateModal
          investor={selectedInvestorForCert}
          governance={govForm}
          workspaceName={activeWorkspace?.name || 'WiVoTe Telecom'}
          onClose={() => setSelectedInvestorForCert(null)}
        />
      )}

    </div>
  );
};
