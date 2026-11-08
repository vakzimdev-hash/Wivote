import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp, getSoldVouchersRegistry, sanitizeVoucherCode } from '../context/AppContext';
import { db, isFirebasePlaceholder } from '../firebase';
import { collection, collectionGroup, onSnapshot, getDocs } from 'firebase/firestore';
import { Voucher } from '../types';
import { canAccessWorkspaceMaster } from '../utils/rbacPolicy';
import { isVoucherFree, getVoucherMonetaryValue } from '../utils/giveawayEngine';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  Calendar,
  DollarSign,
  RefreshCw,
  Building2,
  BarChart3,
  LineChart,
  Layers,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Sliders
} from 'lucide-react';

interface DailyRevenuePoint {
  dateKey: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Aug 15"
  fullDate: string; // e.g. "Friday, Aug 15, 2026"
  revenue: number;
  count: number;
  avgTicket: number;
  starterRevenue: number;
  goldRevenue: number;
  lithiumRevenue: number;
  otherRevenue: number;
}

interface DailyVoucherRevenueWidgetProps {
  forcedWorkspaceId?: string;
  forcedWorkspaceName?: string;
  className?: string;
  compact?: boolean;
}

export const DailyVoucherRevenueWidget: React.FC<DailyVoucherRevenueWidgetProps> = ({
  forcedWorkspaceId,
  forcedWorkspaceName,
  className = '',
  compact = false
}) => {
  const {
    vouchers: contextVouchers,
    workspaces,
    activeWorkspace,
    currentUser,
    currentRole,
    theme,
    refetchData
  } = useApp();
  const currency = '$';

  const isAppOwner = currentRole === 'AppOwner' || currentUser?.role === 'AppOwner';
  const effectiveRole = isAppOwner ? 'AppOwner' : 'WorkspaceMaster';

  // Selected workspace filter (primarily for AppOwner)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => {
    if (forcedWorkspaceId) return forcedWorkspaceId;
    if (effectiveRole === 'WorkspaceMaster') return activeWorkspace?.id || '';
    return 'ALL';
  });

  // Chart mode: 'area' (gradient curve) or 'bar' (daily volumes)
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  // Plan filter: 'ALL' | 'Starter' | 'Gold' | 'Lithium'
  const [selectedPlan, setSelectedPlan] = useState<string>('ALL');

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  // Manual refresh handler to trigger synchronized refetch
  const handleManualRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      if (refetchData) {
        await refetchData();
      }
      setLastSyncTime(new Date());
    } catch (err) {
      console.warn("Manual voucher revenue refresh warning:", err);
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  }, [refetchData]);

  // Unified list of vouchers: powered directly by synchronized context vouchers
  const allVouchers = useMemo(() => {
    return contextVouchers || [];
  }, [contextVouchers]);

  const availablePlans = useMemo(() => {
    const set = new Set<string>();
    allVouchers.forEach(v => {
      const p = (v.plan || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allVouchers]);

  // Compute 30-Day daily revenue timeline
  const { chartData, metrics, dateRangeLabel } = useMemo(() => {
    const now = new Date();
    const daysArray: DailyRevenuePoint[] = [];
    const dateMap: { [key: string]: DailyRevenuePoint } = {};

    // Generate consecutive 30 days (from 29 days ago up to today)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const fullDate = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const point: DailyRevenuePoint = {
        dateKey,
        dayLabel,
        fullDate,
        revenue: 0,
        count: 0,
        avgTicket: 0,
        starterRevenue: 0,
        goldRevenue: 0,
        lithiumRevenue: 0,
        otherRevenue: 0
      };

      dateMap[dateKey] = point;
      daysArray.push(point);
    }

    // Filter relevant vouchers: status === 'Sold' (strictly paid sales - free customer gifts & approved reversals excluded)
    const soldReg = getSoldVouchersRegistry();
    const soldVouchers = allVouchers.filter((v) => {
      const cleanCode = sanitizeVoucherCode(v);
      const isSold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt || soldReg.has(v.id) || (cleanCode ? soldReg.has(cleanCode.toLowerCase().trim()) : false);
      if (!isSold || v.reversalStatus === 'Approved') return false;
      if (isVoucherFree(v)) return false; // Exclude free promotional gifts from revenue
      if (selectedPlan !== 'ALL') {
        const planNorm = (v.plan || '').toLowerCase();
        if (!planNorm.includes(selectedPlan.toLowerCase())) return false;
      }
      return true;
    });

    let totalRevenue = 0;
    let totalCount = 0;
    let maxRevenueDay = { date: '', amount: 0 };

    soldVouchers.forEach((v) => {
      const dateStr = v.soldAt || v.assignedAt;
      if (!dateStr) return;

      const vDate = new Date(dateStr);
      if (isNaN(vDate.getTime())) return;

      const dateKey = vDate.toISOString().slice(0, 10);
      const targetPoint = dateMap[dateKey];

      if (targetPoint) {
        const rev = getVoucherMonetaryValue(v);
        targetPoint.revenue += rev;
        targetPoint.count += 1;

        const planNorm = (v.plan || '').toLowerCase();
        if (planNorm.includes('starter')) {
          targetPoint.starterRevenue += rev;
        } else if (planNorm.includes('gold')) {
          targetPoint.goldRevenue += rev;
        } else if (planNorm.includes('lithium')) {
          targetPoint.lithiumRevenue += rev;
        } else {
          targetPoint.otherRevenue += rev;
        }

        totalRevenue += rev;
        totalCount += 1;
      }
    });

    // Compute average ticket and find max day
    daysArray.forEach((point) => {
      point.avgTicket = point.count > 0 ? Number((point.revenue / point.count).toFixed(2)) : 0;
      point.revenue = Number(point.revenue.toFixed(2));
      point.starterRevenue = Number(point.starterRevenue.toFixed(2));
      point.goldRevenue = Number(point.goldRevenue.toFixed(2));
      point.lithiumRevenue = Number(point.lithiumRevenue.toFixed(2));
      point.otherRevenue = Number(point.otherRevenue.toFixed(2));

      if (point.revenue > maxRevenueDay.amount) {
        maxRevenueDay = { date: point.dayLabel, amount: point.revenue };
      }
    });

    const activeDaysCount = daysArray.filter((d) => d.revenue > 0).length;
    const avgDailyRevenue = totalRevenue / 30;

    const startDate = daysArray[0]?.dayLabel || '';
    const endDate = daysArray[daysArray.length - 1]?.dayLabel || '';

    return {
      chartData: daysArray,
      metrics: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCount,
        avgDailyRevenue: Number(avgDailyRevenue.toFixed(2)),
        maxRevenueDay,
        activeDaysCount
      },
      dateRangeLabel: `${startDate} – ${endDate}, ${now.getFullYear()}`
    };
  }, [allVouchers, selectedPlan]);

  // Current scope label
  const scopeLabel = useMemo(() => {
    if (forcedWorkspaceName) return forcedWorkspaceName;
    if (effectiveRole === 'WorkspaceMaster') return activeWorkspace?.name || 'My Workspace';
    if (selectedWorkspaceId === 'ALL') return 'Global Tenant Aggregate (All Workspaces)';
    const found = workspaces.find((w) => w.id === selectedWorkspaceId);
    return found ? found.name : 'Selected Workspace';
  }, [forcedWorkspaceName, effectiveRole, activeWorkspace, selectedWorkspaceId, workspaces]);

  // Threshold Reference Lines (Alert drop indicator)
  const [showThresholdLines, setShowThresholdLines] = useState<boolean>(true);
  const movingAverage = metrics.avgDailyRevenue;
  const thresholdPercentage = 50; // 50% drop below moving average
  const thresholdAmount = Number((movingAverage * (1 - thresholdPercentage / 100)).toFixed(2));

  // RBAC Policy Guard: Restrict financial revenue charts from agent accounts
  if (!canAccessWorkspaceMaster(currentUser)) {
    return null;
  }

  return (
    <div
      id="widget-daily-voucher-revenue"
      className={`border rounded-3xl p-4 sm:p-5 md:p-6 shadow-xl transition-all duration-300 relative overflow-hidden w-full max-w-full min-w-0 ${
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
          : 'bg-slate-900 border-slate-800 text-white shadow-xl'
      } ${className}`}
    >
      {/* Subtle Background Glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Controls Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/70 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div
              className={`p-2 rounded-xl border ${
                theme === 'light'
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  className={`text-base md:text-lg font-bold font-display ${
                    theme === 'light' ? 'text-slate-950' : 'text-white'
                  }`}
                >
                  Daily Voucher Sales Revenue
                </h2>
                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Past 30 Days
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {dateRangeLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>Scope:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {scopeLabel}
                </strong>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Synced {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Workspace Filter Dropdown (AppOwner only) */}
          {isAppOwner && !forcedWorkspaceId && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                id="select-revenue-workspace"
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className={`text-xs font-mono rounded-xl px-2.5 py-1.5 border focus:outline-none cursor-pointer transition ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-900'
                }`}
              >
                <option value="ALL">All Workspaces (Aggregated)</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.subscriptionTier})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Plan Filter */}
          <div className="flex items-center gap-1">
            <select
              id="select-revenue-plan"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className={`text-xs font-mono rounded-xl px-2.5 py-1.5 border focus:outline-none cursor-pointer transition ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-900'
              }`}
            >
              <option value="ALL">All Plans</option>
              {availablePlans.map(planName => (
                <option key={planName} value={planName}>{planName}</option>
              ))}
            </select>
          </div>

          {/* Chart Type Toggle: Area vs Bar */}
          <div
            className={`flex items-center rounded-xl p-0.5 border ${
              theme === 'light'
                ? 'bg-slate-100 border-slate-200'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <button
              id="btn-chart-type-area"
              type="button"
              onClick={() => setChartType('area')}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1 font-mono ${
                chartType === 'area'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Area Trend Curve"
            >
              <LineChart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px]">Trend</span>
            </button>
            <button
              id="btn-chart-type-bar"
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1 font-mono ${
                chartType === 'bar'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Daily Volume Bars"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px]">Bars</span>
            </button>
          </div>

          {/* Threshold Lines Toggle */}
          <button
            id="btn-toggle-threshold-lines"
            type="button"
            onClick={() => setShowThresholdLines(!showThresholdLines)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
              showThresholdLines
                ? 'bg-amber-500/10 border-amber-500/80 text-amber-600 dark:text-amber-400 font-bold'
                : theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
            title="Toggle 30-Day Moving Average & Alert Threshold (-50%) Reference Lines"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline text-[10px]">
              {showThresholdLines ? 'Threshold Lines ON' : 'Threshold Lines OFF'}
            </span>
          </button>

          {/* Real-Time Sync / Refresh Button */}
          <button
            id="btn-refresh-revenue-widget"
            type="button"
            onClick={handleManualRefresh}
            disabled={isSyncing}
            className={`p-2 rounded-xl border text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
              theme === 'light'
                ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            } disabled:opacity-50`}
            title="Refresh 'vouchers' collection data from Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-500' : ''}`} />
            <span className="hidden md:inline text-[11px]">{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        {/* Metric 1: 30-Day Revenue */}
        <div
          className={`p-3.5 rounded-2xl border transition ${
            theme === 'light'
              ? 'bg-emerald-50/50 border-emerald-200/70 text-emerald-950'
              : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
              30-Day Revenue
            </span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl md:text-2xl font-extrabold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
            {currency}{metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Past 30 rolling days
          </div>
        </div>

        {/* Metric 2: Total Sold Vouchers */}
        <div
          className={`p-3.5 rounded-2xl border transition ${
            theme === 'light'
              ? 'bg-sky-50/50 border-sky-200/70 text-sky-950'
              : 'bg-sky-950/20 border-sky-900/40 text-sky-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-sky-600 dark:text-sky-400">
              Vouchers Sold
            </span>
            <Layers className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <div className="text-xl md:text-2xl font-extrabold font-mono mt-1 text-sky-600 dark:text-sky-400">
            {metrics.totalCount}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            {metrics.activeDaysCount} active selling days
          </div>
        </div>

        {/* Metric 3: Daily Average */}
        <div
          className={`p-3.5 rounded-2xl border transition ${
            theme === 'light'
              ? 'bg-indigo-50/50 border-indigo-200/70 text-indigo-950'
              : 'bg-indigo-950/20 border-indigo-900/40 text-indigo-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-indigo-600 dark:text-indigo-400">
              Daily Average
            </span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl md:text-2xl font-extrabold font-mono mt-1 text-indigo-600 dark:text-indigo-400">
            {currency}{(metrics.avgDailyRevenue || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Velocity / calendar day
          </div>
        </div>

        {/* Metric 4: Peak Revenue Day */}
        <div
          className={`p-3.5 rounded-2xl border transition ${
            theme === 'light'
              ? 'bg-purple-50/50 border-purple-200/70 text-purple-950'
              : 'bg-purple-950/20 border-purple-900/40 text-purple-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-purple-600 dark:text-purple-400">
              Peak Day
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-xl md:text-2xl font-extrabold font-mono mt-1 text-purple-600 dark:text-purple-400">
            {currency}{(metrics.maxRevenueDay.amount || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            {metrics.maxRevenueDay.date || 'No sales yet'}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className={`${compact ? 'h-60' : 'h-72'} w-full mt-2`}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={chartData} margin={{ top: 15, right: 12, left: -18, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={theme === 'light' ? 0.35 : 0.45} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme === 'light' ? '#f1f5f9' : '#1e293b'}
                vertical={false}
              />
              <XAxis
                dataKey="dayLabel"
                stroke={theme === 'light' ? '#94a3b8' : '#64748b'}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                stroke={theme === 'light' ? '#94a3b8' : '#64748b'}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${currency}${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                  borderColor: theme === 'light' ? '#e2e8f0' : '#334155',
                  borderRadius: '16px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                  padding: '12px 16px',
                  color: theme === 'light' ? '#0f172a' : '#f8fafc'
                }}
                labelStyle={{
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  marginBottom: '4px',
                  color: theme === 'light' ? '#475569' : '#94a3b8'
                }}
                formatter={(value: any, name: any, item: any) => {
                  const pt = item.payload as DailyRevenuePoint;
                  const numVal = Number(value) || 0;
                  const isBelowThreshold = showThresholdLines && movingAverage > 0 && numVal < thresholdAmount;
                  return [
                    <div key="custom-tooltip-body" className="space-y-1">
                      <div className="text-base font-extrabold text-emerald-500 font-mono">
                        {currency}{(numVal || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                        <span>{pt.count} voucher{pt.count === 1 ? '' : 's'} sold</span>
                        {pt.count > 0 && <span>• {currency}{(pt.avgTicket || 0).toFixed(2)} avg</span>}
                      </div>
                      {isBelowThreshold && (
                        <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md mt-1">
                          <span>⚠️ Below Alert Threshold (-{thresholdPercentage}%)</span>
                        </div>
                      )}
                      {pt.count > 0 && (
                        <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono border-t border-slate-700/30">
                          {pt.lithiumRevenue > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                              Lithium: {currency}{pt.lithiumRevenue}
                            </span>
                          )}
                          {pt.goldRevenue > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                              Gold: {currency}{pt.goldRevenue}
                            </span>
                          )}
                          {pt.starterRevenue > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">
                              Starter: {currency}{pt.starterRevenue}
                            </span>
                          )}
                        </div>
                      )}
                    </div>,
                    'Daily Revenue'
                  ];
                }}
              />
              {showThresholdLines && movingAverage > 0 && (
                <ReferenceLine
                  y={movingAverage}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `30D Avg: ${currency}${(movingAverage || 0).toFixed(0)}`,
                    fill: '#f59e0b',
                    fontSize: 10,
                    position: 'insideTopRight'
                  }}
                />
              )}
              {showThresholdLines && movingAverage > 0 && (
                <ReferenceLine
                  y={thresholdAmount}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Alert Threshold (-${thresholdPercentage}%): ${currency}${(thresholdAmount || 0).toFixed(0)}`,
                    fill: '#ef4444',
                    fontSize: 10,
                    position: 'insideBottomRight'
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#revenueAreaGradient)"
                activeDot={{
                  r: 6,
                  fill: '#10b981',
                  stroke: theme === 'light' ? '#ffffff' : '#0f172a',
                  strokeWidth: 2
                }}
              />
            </AreaChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 15, right: 12, left: -18, bottom: 5 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme === 'light' ? '#f1f5f9' : '#1e293b'}
                vertical={false}
              />
              <XAxis
                dataKey="dayLabel"
                stroke={theme === 'light' ? '#94a3b8' : '#64748b'}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                stroke={theme === 'light' ? '#94a3b8' : '#64748b'}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${currency}${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                  borderColor: theme === 'light' ? '#e2e8f0' : '#334155',
                  borderRadius: '16px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                  padding: '12px 16px',
                  color: theme === 'light' ? '#0f172a' : '#f8fafc'
                }}
                labelStyle={{
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  marginBottom: '4px',
                  color: theme === 'light' ? '#475569' : '#94a3b8'
                }}
                formatter={(value: any, name: any, item: any) => {
                  const pt = item.payload as DailyRevenuePoint;
                  const numVal = Number(value) || 0;
                  const isBelowThreshold = showThresholdLines && movingAverage > 0 && numVal < thresholdAmount;
                  return [
                    <div key="custom-tooltip-bar" className="space-y-1">
                      <div className="text-base font-extrabold text-emerald-500 font-mono">
                        {currency}{(numVal || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {pt.count} voucher{pt.count === 1 ? '' : 's'} sold
                      </div>
                      {isBelowThreshold && (
                        <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md mt-1">
                          <span>⚠️ Below Alert Threshold (-{thresholdPercentage}%)</span>
                        </div>
                      )}
                    </div>,
                    'Daily Revenue'
                  ];
                }}
              />
              {showThresholdLines && movingAverage > 0 && (
                <ReferenceLine
                  y={movingAverage}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `30D Avg: ${currency}${(movingAverage || 0).toFixed(0)}`,
                    fill: '#f59e0b',
                    fontSize: 10,
                    position: 'insideTopRight'
                  }}
                />
              )}
              {showThresholdLines && movingAverage > 0 && (
                <ReferenceLine
                  y={thresholdAmount}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Alert Threshold (-${thresholdPercentage}%): ${currency}${(thresholdAmount || 0).toFixed(0)}`,
                    fill: '#ef4444',
                    fontSize: 10,
                    position: 'insideBottomRight'
                  }}
                />
              )}
              <Bar
                dataKey="revenue"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Footer Meta */}
      <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-slate-400 gap-2">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Real-time aggregation from Firestore <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-500 font-bold">vouchers</code> subcollections</span>
        </div>
        <div>
          <span>Showing {metrics.totalCount} sales transactions recorded over 30 days</span>
        </div>
      </div>
    </div>
  );
};
