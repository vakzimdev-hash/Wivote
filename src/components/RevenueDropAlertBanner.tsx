import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRevenueAlerts } from '../hooks/useRevenueAlerts';
import { Voucher } from '../types';
import {
  AlertTriangle,
  AlertCircle,
  TrendingDown,
  CheckCircle2,
  Sliders,
  Bell,
  BellOff,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  ShieldAlert,
  HelpCircle,
  ArrowDownRight
} from 'lucide-react';

interface RevenueDropAlertBannerProps {
  allVouchers: Voucher[];
  selectedWorkspaceId?: string;
  className?: string;
}

export const RevenueDropAlertBanner: React.FC<RevenueDropAlertBannerProps> = ({
  allVouchers,
  selectedWorkspaceId = 'ALL',
  className = ''
}) => {
  const { theme, workspaces, showToast } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const {
    config,
    updateConfig,
    acknowledgeAlert,
    evaluation,
    simulationActive,
    setSimulationActive,
    simulatedRevenue,
    setSimulatedRevenue,
    logAlertToAuditTrail
  } = useRevenueAlerts(allVouchers, workspaces, selectedWorkspaceId);

  const { alert, movingAverage, thresholdAmount, thresholdPercentage, targetDay, scopeName } = evaluation;

  // Handle acknowledge
  const handleAcknowledge = async () => {
    if (alert) {
      await acknowledgeAlert(alert.dateKey);
      showToast(`Revenue deficit alert for ${alert.dayLabel} acknowledged.`, 'info');
    }
  };

  // Handle log to audit
  const handleLogToAudit = async () => {
    setIsLogging(true);
    await logAlertToAuditTrail();
    setIsLogging(false);
    showToast('Alert logged to Firestore audit history.', 'success');
  };

  // Preset thresholds
  const thresholdOptions = [30, 40, 50, 60, 75];

  // If system is disabled
  if (!config.enabled && !showSettings) {
    return (
      <div
        id="banner-revenue-alert-disabled"
        className={`border rounded-2xl p-4 flex items-center justify-between transition ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-200 text-slate-600'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
        } ${className}`}
      >
        <div className="flex items-center gap-2 text-xs font-mono">
          <BellOff className="w-4 h-4 text-slate-400" />
          <span>Revenue drop notification system is currently <strong>Paused</strong>.</span>
        </div>
        <button
          onClick={() => updateConfig({ enabled: true })}
          className="text-xs font-mono font-bold text-emerald-500 hover:text-emerald-400 cursor-pointer underline"
        >
          Enable System
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. ACTIVE UNACKNOWLEDGED ALERT */}
      {alert && !alert.acknowledged && (
        <div
          id="banner-revenue-alert-active"
          className={`border-2 rounded-3xl p-5 md:p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${
            alert.severity === 'critical'
              ? theme === 'light'
                ? 'bg-rose-50/90 border-rose-400 text-rose-950 shadow-rose-100'
                : 'bg-rose-950/40 border-rose-500/80 text-white shadow-rose-950/30'
              : theme === 'light'
                ? 'bg-amber-50/90 border-amber-400 text-amber-950 shadow-amber-100'
                : 'bg-amber-950/40 border-amber-500/80 text-white shadow-amber-950/30'
          }`}
        >
          {/* Subtle Ambient Glow */}
          <div
            className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
              alert.severity === 'critical' ? 'bg-rose-500/10' : 'bg-amber-500/10'
            }`}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            {/* Header & Description */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold uppercase tracking-wider border animate-pulse ${
                    alert.severity === 'critical'
                      ? 'bg-rose-600 text-white border-rose-400'
                      : 'bg-amber-500 text-slate-950 border-amber-300'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {alert.severity === 'critical' ? 'Critical Deficit' : 'Revenue Alert'}
                </span>
                <span className="text-xs font-mono font-bold opacity-80">
                  {scopeName}
                </span>
                <span className="text-xs font-mono opacity-60">
                  • Evaluated: {alert.fullDate}
                </span>
              </div>

              <h3 className="text-base md:text-lg font-bold font-display flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-rose-500 shrink-0" />
                <span>
                  Daily Revenue Dropped{' '}
                  <span className="text-rose-600 dark:text-rose-400 underline decoration-2">
                    {alert.dropPercentage}%
                  </span>{' '}
                  Below 30-Day Moving Average
                </span>
              </h3>

              <p className="text-xs md:text-sm opacity-90 max-w-3xl leading-relaxed">
                On <strong>{alert.dayLabel}</strong>, recorded revenue was{' '}
                <strong className="text-rose-600 dark:text-rose-300 font-mono">${(alert.actualRevenue || 0).toFixed(2)}</strong>, falling significantly below the 30-day moving average of{' '}
                <strong className="font-mono">${(alert.movingAverage || 0).toFixed(2)}/day</strong>. The configured alert threshold is{' '}
                <strong className="font-mono">{alert.thresholdPercentage}% drop</strong> (any day below{' '}
                <span className="font-mono">${(alert.thresholdAmount || 0).toFixed(2)}</span>).
              </p>
            </div>

            {/* Metrics Chips & Quick Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className={`p-2.5 rounded-2xl border font-mono ${
                  theme === 'light' ? 'bg-white/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}>
                  <div className="text-[10px] text-slate-400 uppercase">Actual</div>
                  <div className="text-base font-extrabold text-rose-600 dark:text-rose-400">
                    ${(alert.actualRevenue || 0).toFixed(2)}
                  </div>
                </div>
                <div className={`p-2.5 rounded-2xl border font-mono ${
                  theme === 'light' ? 'bg-white/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}>
                  <div className="text-[10px] text-slate-400 uppercase">30D Avg</div>
                  <div className="text-base font-extrabold text-slate-700 dark:text-slate-200">
                    ${(alert.movingAverage || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  id="btn-acknowledge-revenue-alert"
                  type="button"
                  onClick={handleAcknowledge}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Acknowledge</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSettings(!showSettings)}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono flex items-center justify-center gap-1 transition cursor-pointer w-full ${
                      theme === 'light'
                        ? 'bg-white/80 border-slate-200 text-slate-700 hover:bg-white'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Threshold</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogToAudit}
                    disabled={isLogging}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono flex items-center justify-center gap-1 transition cursor-pointer ${
                      theme === 'light'
                        ? 'bg-white/80 border-slate-200 text-slate-700 hover:bg-white'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                    title="Log to audit history"
                  >
                    <Bell className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACKNOWLEDGED ALERT BANNER */}
      {alert && alert.acknowledged && (
        <div
          id="banner-revenue-alert-acknowledged"
          className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
            theme === 'light'
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-slate-900/80 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                Revenue Deficit Alert Acknowledged
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Drop of -{alert.dropPercentage}% on {alert.dayLabel} (${(alert.actualRevenue || 0).toFixed(2)} vs 30D avg ${(alert.movingAverage || 0).toFixed(2)}) is acknowledged by AppOwner.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => updateConfig({ lastAcknowledgedDateKey: undefined })}
              className="text-[11px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer underline"
            >
              Re-open Alert
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* 3. HEALTHY STATUS (NO ACTIVE ALERT) */}
      {!alert && (
        <div
          id="banner-revenue-alert-healthy"
          className={`border rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
            theme === 'light'
              ? 'bg-emerald-50/40 border-emerald-200/60 text-slate-800'
              : 'bg-emerald-950/20 border-emerald-900/40 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="text-xs font-mono">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                Revenue Alert System Active:
              </span>{' '}
              <span>
                {targetDay ? targetDay.dayLabel : 'Recent'} sales (${(targetDay?.revenue || 0).toFixed(2)}) are stable vs 30D moving average (${(movingAverage || 0).toFixed(2)}/day).
              </span>
              <span className="text-slate-400 hidden md:inline ml-1.5">
                (Alert threshold: -{thresholdPercentage}%)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3 h-3 text-slate-400" />
              <span>Configure Threshold</span>
              {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}

      {/* 4. EXPANDABLE THRESHOLD CONFIGURATION PANEL */}
      {showSettings && (
        <div
          id="panel-revenue-threshold-settings"
          className={`border rounded-3xl p-5 md:p-6 shadow-xl transition-all duration-300 ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-500" />
              <h4 className="text-sm font-bold font-display">Revenue Drop Alert Configuration</h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                AppOwner Master Control
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Setting 1: Threshold Percentage */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 block">
                Deficit Drop Threshold (%)
              </label>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Trigger alert if daily sales revenue drops by this percentage below the 30-day moving average (${(movingAverage || 0).toFixed(2)}).
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {thresholdOptions.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => updateConfig({ dropPercentageThreshold: pct })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                      config.dropPercentageThreshold === pct
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : theme === 'light'
                          ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {pct}% Drop
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-mono text-emerald-500 pt-1">
                Current trigger point: Day revenue &lt; ${(thresholdAmount || 0).toFixed(2)}
              </div>
            </div>

            {/* Setting 2: Evaluation Period */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 block">
                Evaluation Schedule
              </label>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Choose the target timeframe to test against the 30-day moving baseline.
              </p>
              <div className="space-y-1.5 pt-1">
                {[
                  { id: 'yesterday', label: 'Yesterday (Full 24h Completed Cycle)' },
                  { id: 'today', label: 'Today (Intraday Real-Time Velocity)' },
                  { id: 'recent_days', label: 'Recent 3-Day Window (Any severe dip)' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateConfig({ evaluationPeriod: item.id as any })}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono border transition cursor-pointer flex items-center justify-between ${
                      config.evaluationPeriod === item.id
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                        : theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                    {config.evaluationPeriod === item.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 3: Test Simulation & Audit */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 block">
                Live Alert Simulation &amp; Testing
              </label>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Test the notification workflow by simulating an immediate revenue drop to verify banner appearance and alerts.
              </p>
              
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    if (simulationActive) {
                      setSimulationActive(false);
                      showToast('Simulation ended. Restored real Firestore vouchers data.', 'info');
                    } else {
                      setSimulationActive(true);
                      setSimulatedRevenue(12);
                      showToast('Simulated revenue drop ($12.00) activated! Alert triggered.', 'info');
                    }
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    simulationActive
                      ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                      : theme === 'light'
                        ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{simulationActive ? 'Stop Simulation' : 'Simulate $12 Revenue Drop'}</span>
                </button>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                  <span>System Enabled:</span>
                  <button
                    type="button"
                    onClick={() => updateConfig({ enabled: !config.enabled })}
                    className={`font-bold cursor-pointer ${config.enabled ? 'text-emerald-500' : 'text-slate-500'}`}
                  >
                    {config.enabled ? 'YES (Active)' : 'NO (Paused)'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
