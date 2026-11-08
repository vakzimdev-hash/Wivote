import React, { useState, useMemo } from 'react';
import { useApp, resolveCustomerWorkspaceId, getTargetWorkspaceId } from '../context/AppContext';
import { Customer, Voucher, LoyaltySettings } from '../types';
import { calculateActiveStreakCount } from '../utils/loyaltyEngine';
import {
  Sparkles,
  Award,
  TrendingUp,
  Users,
  DollarSign,
  Repeat,
  Flame,
  ArrowUpRight,
  Search,
  Filter,
  Download,
  Upload,
  FileSpreadsheet,
  Calendar,
  Layers,
  ChevronRight,
  Gift,
  CheckCircle2,
  Clock,
  Settings,
  HelpCircle,
  Trash2,
  Edit2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import { LoyaltyProgramSettingsModal } from './LoyaltyProgramSettingsModal';
import { BulkCustomerImportModal } from './BulkCustomerImportModal';
import { fuzzySearchCustomers, CustomerFuzzyResult, HighlightText } from '../utils/fuzzySearch';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';

interface LoyaltyAnalyticsViewProps {
  onOpenSettings?: () => void;
}

export const LoyaltyAnalyticsView: React.FC<LoyaltyAnalyticsViewProps> = ({ onOpenSettings }) => {
  const {
    customers: rawCustomers,
    vouchers,
    loyaltySettings,
    updateLoyaltySettings,
    addOrUpdateCustomer,
    deleteCustomer,
    bulkAddCustomers,
    updateCustomerStreak,
    currentUser,
    theme,
    activeWorkspace,
    showToast
  } = useApp();

  const targetWsId = getTargetWorkspaceId(activeWorkspace, currentUser, 'ws_vakzim');
  const customers = useMemo(() => {
    if (!targetWsId || targetWsId === 'ALL' || targetWsId === 'system') return rawCustomers;
    return rawCustomers.filter(c => resolveCustomerWorkspaceId(c, targetWsId) === targetWsId);
  }, [rawCustomers, targetWsId]);

  const [timeFilter, setTimeFilter] = useState<'all' | '30d' | '7d'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCustomerSuggestionsOpen, setIsCustomerSuggestionsOpen] = useState(false);
  const [streakFilter, setStreakFilter] = useState<'all' | 'active' | 'ready' | 'none'>('all');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  // Admin Streak editing state
  const [editingCustomerStreak, setEditingCustomerStreak] = useState<Customer | null>(null);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<Customer | null>(null);
  const [editStreakCount, setEditStreakCount] = useState<number>(0);
  const [editQualifyingPrice, setEditQualifyingPrice] = useState<number>(3.0);
  const [isSavingStreak, setIsSavingStreak] = useState<boolean>(false);

  const minQualifyingPrice = loyaltySettings?.minQualifyingPrice ?? 3.0;

  // Filter sold vouchers for this workspace
  const soldVouchers = useMemo(() => {
    return vouchers.filter(v => v.status === 'Sold');
  }, [vouchers]);

  // Vouchers that were part of customer repeat purchases
  const {
    totalRewardsGranted,
    totalRepeatRevenue,
    customersOnStreak,
    rewardReadyCustomers,
    voucherValueBreakdown,
    streakDistribution,
    retentionRate,
    roiMultiple
  } = useMemo(() => {
    // 1. Calculate Total Rewards Granted across all customers / vouchers
    const customerSavedTotal = customers.reduce((sum, c) => sum + (c.totalSaved || 0), 0);
    const voucherDiscountTotal = soldVouchers.reduce((sum, v) => sum + (v.discountApplied || 0), 0);
    const totalRewards = Math.max(customerSavedTotal, voucherDiscountTotal);

    // 2. Customers on an active streak (consecutive purchases >= 1)
    const onStreak = customers.filter(c => (c.consecutivePurchases?.length || 0) > 0);

    // 3. Customers who are Reward Ready (qualify for discount on their next purchase)
    const ready = customers.filter(c => {
      const consecutive = c.consecutivePurchases || [];
      if (consecutive.length === 0) return false;
      // If customer has 2 or more identical purchases at a tier, or 3+ mixed purchases
      const lastPrice = consecutive[consecutive.length - 1]?.price;
      const matchedTier = loyaltySettings?.tierRules?.find(r => Math.abs(r.price - lastPrice) < 0.01);
      if (matchedTier && consecutive.filter(p => Math.abs(p.price - lastPrice) < 0.01).length >= matchedTier.requiredConsecutive) {
        return true;
      }
      if (consecutive.filter(p => p.price >= minQualifyingPrice).length >= (loyaltySettings?.mixedRule?.requiredConsecutive ?? 3)) {
        return true;
      }
      return false;
    });

    // 4. Repeat purchase revenue (from customers with >= 2 lifetime purchases)
    const repeatCustomers = customers.filter(c => (c.totalPurchases || 0) >= 2);
    const repeatRevenue = repeatCustomers.reduce((sum, c) => sum + (c.totalSpend || 0), 0);

    // 5. Breakdown of voucher values driving repeat purchases
    // Map of denomination -> count of repeat purchases, repeat spend, and discount applied
    const denomMap: Record<number, { denomination: number; label: string; repeatCount: number; repeatRevenue: number; rewardsCount: number; discountTotal: number }> = {};

    customers.forEach(cust => {
      // If customer has made 2 or more purchases, analyze their purchase history
      if ((cust.consecutivePurchases?.length || 0) > 0 || (cust.totalPurchases || 0) >= 2) {
        (cust.consecutivePurchases || []).forEach(record => {
          const price = record.price;
          if (!denomMap[price]) {
            denomMap[price] = {
              denomination: price,
              label: `$${price % 1 === 0 ? price : (price || 0).toFixed(2)}`,
              repeatCount: 0,
              repeatRevenue: 0,
              rewardsCount: 0,
              discountTotal: 0
            };
          }
          denomMap[price].repeatCount += 1;
          denomMap[price].repeatRevenue += price;
          if (record.discountApplied > 0) {
            denomMap[price].rewardsCount += 1;
            denomMap[price].discountTotal += record.discountApplied;
          }
        });
      }
    });

    // Also enrich from sold vouchers with customer IDs or discounts
    soldVouchers.forEach(v => {
      if ((v.customerId || v.customerNumber || (v.discountApplied && v.discountApplied > 0)) && v.price) {
        const price = v.price;
        if (!denomMap[price]) {
          denomMap[price] = {
            denomination: price,
            label: `$${price % 1 === 0 ? price : (price || 0).toFixed(2)}`,
            repeatCount: 0,
            repeatRevenue: 0,
            rewardsCount: 0,
            discountTotal: 0
          };
        }
        // Avoid duplicate counting if already tallied via consecutivePurchases
      }
    });

    // Ensure common tiers exist in breakdown if configured
    (loyaltySettings?.tierRules || []).forEach(rule => {
      if (!denomMap[rule.price]) {
        denomMap[rule.price] = {
          denomination: rule.price,
          label: `$${rule.price}`,
          repeatCount: 0,
          repeatRevenue: 0,
          rewardsCount: 0,
          discountTotal: 0
        };
      }
    });

    const breakdownList = Object.values(denomMap).sort((a, b) => a.denomination - b.denomination);

    // 6. Streak Distribution (1 purchase, 2 purchases, 3 purchases, 4+ purchases)
    const streakDist = [
      { name: '1 Purchase (Building)', count: customers.filter(c => (c.consecutivePurchases?.length || 0) === 1).length, color: '#38bdf8' },
      { name: '2 Purchases (Near Goal)', count: customers.filter(c => (c.consecutivePurchases?.length || 0) === 2).length, color: '#818cf8' },
      { name: '3+ Streak (Reward Ready)', count: customers.filter(c => (c.consecutivePurchases?.length || 0) >= 3).length, color: '#f59e0b' },
      { name: 'Inactive / Reset', count: customers.filter(c => (c.consecutivePurchases?.length || 0) === 0).length, color: '#94a3b8' }
    ];

    // 7. Retention Rate (% of customers with 2+ purchases)
    const retention = customers.length > 0 ? (repeatCustomers.length / customers.length) * 100 : 0;

    // 8. ROI Multiple (Repeat Revenue generated per $1 of rewards given)
    const roi = totalRewards > 0 ? (repeatRevenue / totalRewards) : (repeatRevenue > 0 ? 10.0 : 0);

    return {
      totalRewardsGranted: totalRewards,
      totalRepeatRevenue: repeatRevenue,
      customersOnStreak: onStreak.length,
      rewardReadyCustomers: ready.length,
      voucherValueBreakdown: breakdownList,
      streakDistribution: streakDist,
      retentionRate: retention,
      roiMultiple: roi
    };
  }, [customers, soldVouchers, loyaltySettings, minQualifyingPrice]);

  // Unique deduplicated customers by name and MAC
  const dedupedCustomers = useMemo(() => {
    const seenNames = new Set<string>();
    const seenMacs = new Set<string>();
    const unique: Customer[] = [];

    for (const c of customers) {
      if (!c || !c.name) continue;
      const normName = c.name.trim().toLowerCase();
      if (!normName || normName === 'walk-in client' || normName === 'customer' || normName === 'valued customer') continue;

      const normMac = (c.macAddress || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (seenNames.has(normName) || (normMac.length >= 8 && seenMacs.has(normMac))) {
        continue;
      }
      seenNames.add(normName);
      if (normMac.length >= 8) seenMacs.add(normMac);
      unique.push(c);
    }
    return unique;
  }, [customers]);

  // Fuzzy search for customer registry
  const customerFuzzyResults = useMemo<CustomerFuzzyResult[]>(() => {
    return fuzzySearchCustomers(dedupedCustomers, searchTerm);
  }, [dedupedCustomers, searchTerm]);

  // Real-time suggestions for customer search bar
  const customerRealtimeSuggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return customerFuzzyResults.slice(0, 6);
  }, [customerFuzzyResults, searchTerm]);

  // Map of matched character indices for highlighting
  const customerMatchMap = useMemo(() => {
    return new Map(customerFuzzyResults.map(r => [r.customer.id, r.matchedFields]));
  }, [customerFuzzyResults]);

  // Filtered customer list for the interactive table
  const filteredCustomers = useMemo(() => {
    const rawSearch = searchTerm.trim();
    const sourceList = rawSearch ? customerFuzzyResults.map(r => r.customer) : dedupedCustomers;

    return sourceList.filter(cust => {
      // Streak status filter
      const streakLength = cust.consecutivePurchases?.length || 0;
      if (streakFilter === 'active' && streakLength === 0) return false;
      if (streakFilter === 'none' && streakLength > 0) return false;
      if (streakFilter === 'ready') {
        const isReady = streakLength >= 2;
        if (!isReady) return false;
      }

      return true;
    }).sort((a, b) => {
      if (rawSearch) return 0; // maintain fuzzy relevance ranking
      // Sort by active streak descending, then by total saved
      const streakA = a.consecutivePurchases?.length || 0;
      const streakB = b.consecutivePurchases?.length || 0;
      if (streakB !== streakA) return streakB - streakA;
      return (b.totalSaved || 0) - (a.totalSaved || 0);
    });
  }, [dedupedCustomers, customerFuzzyResults, searchTerm, streakFilter]);

  // Export CSV of Loyalty Performance
  const handleExportCSV = () => {
    if (customers.length === 0) {
      showToast('No customer data available to export', 'error');
      return;
    }

    const headers = ['Customer Number', 'Name', 'Phone', 'Total Purchases', 'Total Spend ($)', 'Total Saved ($)', 'Active Streak', 'Last Purchase'];
    const rows = customers.map(c => [
      c.customerNumber,
      `"${c.name.replace(/"/g, '""')}"`,
      c.cellNumber,
      c.totalPurchases || 0,
      (c.totalSpend || 0).toFixed(2),
      (c.totalSaved || 0).toFixed(2),
      c.consecutivePurchases?.length || 0,
      c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toLocaleDateString() : 'N/A'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `WiVoTe_Loyalty_Analytics_${activeWorkspace?.name || 'Workspace'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ Loyalty analytics CSV exported successfully');
  };

  const COLORS = ['#38bdf8', '#818cf8', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header Banner */}
      <div className={`p-4 sm:p-6 rounded-3xl border relative overflow-hidden transition-all shadow-sm w-full max-w-full ${
        theme === 'light'
          ? 'bg-gradient-to-br from-amber-50 via-white to-sky-50 border-amber-200/80 text-slate-900'
          : 'bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/30 border-slate-800 text-white'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold font-display tracking-tight">
                Genius Loyalty Program Analytics
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                loyaltySettings?.isEnabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
              }`}>
                {loyaltySettings?.isEnabled ? 'Active & Enforcing' : 'Program Paused'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              Track real-time reward redemptions, consecutive purchase streaks across all terminals, and identify which voucher denominations are generating the highest repeat revenue.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleExportCSV}
              type="button"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              type="button"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-xs transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              Manage Rules
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Rewards Granted */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Total Rewards Earned</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Gift className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-amber-600 dark:text-amber-400">
            ${(totalRewardsGranted || 0).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Customer savings across {customers.length} registered accounts</span>
          </div>
        </div>

        {/* KPI 2: Active Customers on a Streak */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Customers On Streak</span>
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-sky-600 dark:text-sky-400">
            {customersOnStreak}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-amber-600 dark:text-amber-400 font-bold">
            <Award className="w-3.5 h-3.5 shrink-0" />
            <span>{rewardReadyCustomers} customers eligible for reward now</span>
          </div>
        </div>

        {/* KPI 3: Repeat Customer Revenue */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Repeat Purchase Spend</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
            ${(totalRepeatRevenue || 0).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            <span>Retention rate: <strong>{(retentionRate || 0).toFixed(1)}%</strong> repeat buyers</span>
          </div>
        </div>

        {/* KPI 4: Loyalty Program ROI */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Program Return on Investment</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-indigo-600 dark:text-indigo-400">
            {roiMultiple > 0 ? `${(roiMultiple || 0).toFixed(1)}x` : 'N/A'}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-2">
            {totalRewardsGranted > 0 
              ? `$${(totalRepeatRevenue / Math.max(1, totalRewardsGranted)).toFixed(2)} generated per $1 discount`
              : 'Discounts drive consecutive sales'}
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Breakdown of Voucher Values Driving Repeat Purchases (2 cols) */}
        <div className={`lg:col-span-2 p-6 rounded-3xl border transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-sky-500" />
                Voucher Values Driving Repeat Purchases
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Repeat purchase volume and total revenue generated grouped by voucher denomination.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
              <span>Threshold: &ge;${(minQualifyingPrice || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="h-72 w-full">
            {voucherValueBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={voucherValueBreakdown} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#f1f5f9' : '#1e293b'} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={theme === 'light' ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                    fontFamily="monospace"
                  />
                  <YAxis
                    yAxisId="left"
                    stroke={theme === 'light' ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                    fontFamily="monospace"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    fontFamily="monospace"
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                      borderColor: theme === 'light' ? '#e2e8f0' : '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}
                    formatter={(val: any, name: string) => {
                      if (name === 'Repeat Revenue ($)') return [`$${Number(val).toFixed(2)}`, name];
                      if (name === 'Repeat Purchases') return [`${val} vouchers`, name];
                      return [val, name];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '10px' }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="repeatCount"
                    name="Repeat Purchases"
                    fill="#38bdf8"
                    radius={[6, 6, 0, 0]}
                    barSize={28}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="repeatRevenue"
                    name="Repeat Revenue ($)"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#f59e0b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs font-mono">
                <Repeat className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 animate-pulse" />
                <span>No repeat purchase data recorded yet</span>
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Customer Streak Distribution (1 col) */}
        <div className={`p-6 rounded-3xl border transition-all ${
          theme === 'light'
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="mb-4">
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              Streak Funnel Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Active customer journey through the loyalty streak stages.
            </p>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={streakDistribution}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                >
                  {streakDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                    borderColor: theme === 'light' ? '#e2e8f0' : '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    fontFamily: 'monospace'
                  }}
                  formatter={(val: any, name: string) => [`${val} customers`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend Checklist */}
          <div className="space-y-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 font-mono text-xs">
            {streakDistribution.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Registry & Leaderboard Table */}
      <div className={`p-6 rounded-3xl border transition-all ${
        theme === 'light'
          ? 'bg-white border-slate-200 shadow-xs'
          : 'bg-slate-900/80 border-slate-800'
      }`}>
        {/* Table Header & Controls (Sticky on scroll) */}
        <div className={`sticky top-0 z-20 -mx-6 px-6 pt-1 pb-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b backdrop-blur-md transition-all ${
          theme === 'light' ? 'bg-white/95 border-slate-100 shadow-xs' : 'bg-slate-900/95 border-slate-800/80 shadow-xs'
        }`}>
          <div>
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Customer Loyalty Registry & Streaks
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Showing {filteredCustomers.length} of {customers.length} registered customers across the active workspace.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsCustomerSuggestionsOpen(true);
                }}
                onFocus={() => {
                  if (searchTerm.trim()) {
                    setIsCustomerSuggestionsOpen(true);
                  }
                }}
                placeholder="Fuzzy search CN:XX, name, phone, MAC..."
                className={`pl-8.5 pr-8 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono transition ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setIsCustomerSuggestionsOpen(false);
                  }}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <Search className="w-0 h-0 hidden" />
                  <span className="text-xs font-bold leading-none">✕</span>
                </button>
              )}

              {/* Customer Real-time Search Suggestions Popover */}
              <SearchSuggestionsDropdown
                isOpen={isCustomerSuggestionsOpen && customerRealtimeSuggestions.length > 0}
                onClose={() => setIsCustomerSuggestionsOpen(false)}
                query={searchTerm}
                items={customerRealtimeSuggestions}
                theme={theme}
                title="Customer Registry Matches"
                emptyMessage="No customers match search query"
                onSelectItem={(result) => {
                  setSearchTerm(result.customer.customerNumber || result.customer.name);
                  setIsCustomerSuggestionsOpen(false);
                }}
                renderItem={(result) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                        <HighlightText text={result.customer.customerNumber} indices={result.matchedFields.customerNumber} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">
                          <HighlightText text={result.customer.name} indices={result.matchedFields.name} />
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          <HighlightText text={result.customer.cellNumber || 'No phone'} indices={result.matchedFields.cellNumber} />
                          {result.customer.macAddress && (
                            <span> • <HighlightText text={result.customer.macAddress} indices={result.matchedFields.macAddress} /></span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {result.customer.totalPurchases || 0} orders
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                        ${(result.customer.totalSpend || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStreakFilter('all')}
                className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg transition cursor-pointer ${
                  streakFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStreakFilter('active')}
                className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg transition cursor-pointer ${
                  streakFilter === 'active'
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                On Streak
              </button>
              <button
                type="button"
                onClick={() => setStreakFilter('ready')}
                className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg transition cursor-pointer ${
                  streakFilter === 'ready'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Reward Ready
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
              title="Batch import customers via Excel spreadsheet or clipboard paste"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Customers</span>
            </button>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto no-scrollbar w-full max-w-full">
          <table className="w-full text-left text-xs min-w-[620px]">
            <thead>
              <tr className={`border-b font-mono uppercase text-[10px] tracking-wider text-slate-400 ${
                theme === 'light' ? 'border-slate-100 bg-slate-50/50' : 'border-slate-800/80 bg-slate-950/40'
              }`}>
                <th className="py-3 px-4 font-bold">Customer ID</th>
                <th className="py-3 px-4 font-bold">Client Name & Phone</th>
                <th className="py-3 px-4 font-bold">Streak Status</th>
                <th className="py-3 px-4 font-bold text-center">Total Vouchers</th>
                <th className="py-3 px-4 font-bold text-right">Total Spent</th>
                <th className="py-3 px-4 font-bold text-right">Rewards Saved</th>
                <th className="py-3 px-4 font-bold text-right">Last Purchase</th>
                <th className="py-3 px-4 font-bold text-center">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => {
                  const streakLen = calculateActiveStreakCount(customer);
                  const isReady = streakLen >= 2;
                  const isLegacy = customer.customerType === 'legacy_device';

                  return (
                    <tr
                      key={customer.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                        isReady ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      {/* Customer ID Badge */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-black text-[11px] border ${
                          isLegacy
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400 border-slate-200 dark:border-slate-700'
                        }`}>
                          <HighlightText text={customer.customerNumber} indices={customerMatchMap.get(customer.id)?.customerNumber} query={searchTerm} />
                        </span>
                      </td>

                      {/* Name & Phone */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                          <span>
                            <HighlightText text={customer.name} indices={customerMatchMap.get(customer.id)?.name} query={searchTerm} />
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                            isLegacy
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            {isLegacy ? 'Legacy Terminal' : 'Voucher'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          <HighlightText text={customer.cellNumber || 'No phone'} indices={customerMatchMap.get(customer.id)?.cellNumber} query={searchTerm} />
                          {isLegacy && customer.macAddress && (
                            <span className="text-emerald-500 ml-1 font-mono">
                              (<HighlightText text={customer.macAddress} indices={customerMatchMap.get(customer.id)?.macAddress} query={searchTerm} />)
                            </span>
                          )}
                          <span className="text-amber-500/90 ml-1.5 font-mono font-semibold">
                            &bull; WS: {customer.workspaceId || 'ws_vakzim'}
                          </span>
                          <span className="text-sky-400 ml-1.5 font-mono font-semibold">
                            &bull; Saved by: {customer.savedByName || customer.createdByName || customer.lastAgentName || 'Workspace Member'}
                          </span>
                        </div>
                      </td>

                      {/* Streak Status */}
                      <td className="py-3 px-4">
                        {streakLen > 0 ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span>{streakLen} consecutive</span>
                            {isReady && (
                              <span className="ml-1 px-1 rounded bg-amber-500 text-white text-[9px]">
                                READY
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">No active streak</span>
                        )}
                      </td>

                      {/* Total Purchases */}
                      <td className="py-3 px-4 text-center font-bold">
                        {customer.totalPurchases || 0}
                      </td>

                      {/* Total Spent */}
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        ${(customer.totalSpend || 0).toFixed(2)}
                      </td>

                      {/* Rewards Saved */}
                      <td className="py-3 px-4 text-right font-bold text-amber-600 dark:text-amber-400">
                        ${(customer.totalSaved || 0).toFixed(2)}
                      </td>

                      {/* Last Purchase */}
                      <td className="py-3 px-4 text-right text-[10px] text-slate-400">
                        {customer.lastPurchaseDate ? (
                          <>
                            <div>{new Date(customer.lastPurchaseDate).toLocaleDateString()}</div>
                            {customer.lastVoucherCode && (
                              <div className="font-bold text-slate-500">{customer.lastVoucherCode}</div>
                            )}
                          </>
                        ) : (
                          'Never'
                        )}
                      </td>

                      {/* Admin Actions: Edit Streak, Edit Customer, Delete */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCustomerStreak(customer);
                              setEditStreakCount(calculateActiveStreakCount(customer));
                              setEditQualifyingPrice(customer.customerType === 'legacy_device' ? (customer.monthlyPrice || 10.0) : 3.0);
                            }}
                            className="px-2 py-1 text-[11px] font-mono font-bold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            title="Admin: Edit consecutive loyalty streak to facilitate reward"
                          >
                            <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span>Streak</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerForEdit(customer);
                              setIsSettingsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition cursor-pointer"
                            title="Open Customer Registry to edit profile"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerToDelete(customer)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                            title={`Delete customer ${customer.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No customers found matching the search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Streak Adjustment Modal */}
      {editingCustomerStreak && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className={`border rounded-3xl p-4 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                  <Flame className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold font-display">
                    Adjust Customer Loyalty Streak
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
                    Directly modify consecutive purchases to grant or adjust rewards
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomerStreak(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            {/* Target Customer Info Card */}
            <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {editingCustomerStreak.name}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                    {editingCustomerStreak.customerNumber}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">
                  {editingCustomerStreak.cellNumber || 'No Cell Number'}
                  {editingCustomerStreak.customerType === 'legacy_device' && (
                    <span className="text-emerald-500 ml-1">&bull; Legacy Terminal ({editingCustomerStreak.macAddress || 'No MAC'})</span>
                  )}
                </div>
              </div>

              <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-200 dark:border-slate-800 shrink-0">
                <span className="text-[10px] font-mono uppercase text-slate-400">Current Streak</span>
                <div className="text-base font-bold font-mono text-amber-500">
                  {calculateActiveStreakCount(editingCustomerStreak)}
                </div>
              </div>
            </div>

            {/* Stepper and Number Input */}
            <div className="space-y-3">
              <label className="block text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                Set Consecutive Streak Count (0 - 12):
              </label>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditStreakCount(Math.max(0, editStreakCount - 1))}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={editStreakCount}
                    onChange={(e) => setEditStreakCount(Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)))}
                    className="w-16 h-10 text-center text-lg font-bold font-mono rounded-xl border"
                  />
                  <button
                    type="button"
                    onClick={() => setEditStreakCount(Math.min(12, editStreakCount + 1))}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    +
                  </button>
                </div>

                {/* Preset shortcuts */}
                <div className="flex flex-wrap gap-1.5 flex-1">
                  <button
                    type="button"
                    onClick={() => setEditStreakCount(0)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer ${
                      editStreakCount === 0
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-400'
                        : 'border-slate-300 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    0 (Reset)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStreakCount(1)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer ${
                      editStreakCount === 1
                        ? 'bg-sky-500 text-white border-sky-500 shadow-xs'
                        : 'border-slate-300 dark:border-slate-700 text-sky-500'
                    }`}
                  >
                    1 (Initial)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStreakCount(2)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer ${
                      editStreakCount === 2
                        ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                        : 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10'
                    }`}
                  >
                    2 (🎉 $1.00 Reward)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStreakCount(3)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer ${
                      editStreakCount >= 3
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'border-purple-500/40 text-purple-500 hover:bg-purple-500/10'
                    }`}
                  >
                    3 (🌟 $2.00 Reward)
                  </button>
                </div>
              </div>

              {/* Qualifying Price Selection */}
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">
                  Qualifying Tier Price (Used for synthetic purchase tier):
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-500">$</span>
                  <input
                    type="number"
                    step="0.50"
                    min={1}
                    value={editQualifyingPrice}
                    onChange={(e) => setEditQualifyingPrice(parseFloat(e.target.value) || 3.0)}
                    className="w-24 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold"
                  />
                  <span className="text-xs font-mono text-slate-400">USD</span>
                </div>
              </div>

              {/* Status Outcome Banner */}
              <div className={`p-3 rounded-xl border text-xs font-mono ${
                editStreakCount >= 3
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400'
                  : editStreakCount === 2
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500'
              }`}>
                {editStreakCount >= 3 ? (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span><strong>Super Reward Activated:</strong> On next purchase or voucher print, this customer receives a $2.00 super discount!</span>
                  </div>
                ) : editStreakCount === 2 ? (
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 shrink-0" />
                    <span><strong>Reward Ready:</strong> On next purchase or voucher print, this customer receives a $1.00 loyalty discount!</span>
                  </div>
                ) : editStreakCount === 1 ? (
                  <span>Customer will need 1 more qualifying purchase to unlock their $1.00 loyalty reward.</span>
                ) : (
                  <span>Customer streak will be reset to 0. No reward discount pending.</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingCustomerStreak(null)}
                className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 rounded-xl text-xs font-mono font-bold text-slate-400 hover:text-slate-200 text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingStreak}
                onClick={async () => {
                  if (!editingCustomerStreak) return;
                  setIsSavingStreak(true);
                  try {
                    await updateCustomerStreak(
                      editingCustomerStreak.id,
                      editStreakCount,
                      editQualifyingPrice
                    );
                    setEditingCustomerStreak(null);
                  } catch (err: any) {
                    showToast(err?.message || 'Failed to update streak', 'error');
                  } finally {
                    setIsSavingStreak(false);
                  }
                }}
                className="flex-1 sm:flex-none px-5 py-2.5 sm:py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-mono font-bold shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 fill-white" />
                <span>{isSavingStreak ? 'Updating...' : 'Save Streak'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 ${
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h4 className="font-bold text-sm font-display">Delete Customer Profile</h4>
                <p className="text-[11px] text-slate-400 font-mono">Registry Removal & Audit Trail</p>
              </div>
            </div>

            <div className="text-xs space-y-2 font-mono">
              <p className={theme === 'light' ? 'text-slate-700' : 'text-slate-300'}>
                Are you sure you want to delete customer <strong className={theme === 'light' ? 'text-slate-900' : 'text-white'}>{customerToDelete.name}</strong> ({customerToDelete.customerNumber})?
              </p>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Administrative Activity Log</span>
                </div>
                <p>
                  This deletion will be permanently logged in the Admin Activity Trail: <strong>{currentUser?.name || currentUser?.email || 'Admin'} deleted customer {customerToDelete.customerNumber || customerToDelete.name}</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                disabled={isDeletingCustomer}
                className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!customerToDelete) return;
                  setIsDeletingCustomer(true);
                  try {
                    await deleteCustomer(customerToDelete.id);
                    const deletedName = customerToDelete.name;
                    setCustomerToDelete(null);
                    setSelectedCustomerForEdit(null);
                    showToast(`✓ Customer record ${deletedName} deleted from registry.`, 'success');
                  } catch (err: any) {
                    console.warn("Error deleting customer:", err);
                    showToast(`Failed to delete customer: ${err?.message || 'Unknown error'}`, 'error');
                  } finally {
                    setIsDeletingCustomer(false);
                  }
                }}
                disabled={isDeletingCustomer}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-mono font-bold shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingCustomer ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirm Deletion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal Shortcut */}
      <LoyaltyProgramSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => {
          setIsSettingsModalOpen(false);
          setSelectedCustomerForEdit(null);
        }}
        settings={loyaltySettings}
        onSaveSettings={updateLoyaltySettings}
        customers={customers}
        onAddOrUpdateCustomer={addOrUpdateCustomer}
        theme={theme}
        initialEditingCustomer={selectedCustomerForEdit}
      />

      {/* Batch Customer Import Modal */}
      <BulkCustomerImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        existingCustomers={customers}
        onImportCustomers={bulkAddCustomers}
        theme={theme}
      />
    </div>
  );
};
