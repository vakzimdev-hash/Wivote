import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, isFirebasePlaceholder } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { Voucher, Workspace } from '../types';
import { RevenueAlertConfig, RevenueDropAlert } from '../types/revenueAlert';
import { isVoucherFree, getVoucherMonetaryValue } from '../utils/giveawayEngine';

const DEFAULT_CONFIG: RevenueAlertConfig = {
  enabled: true,
  dropPercentageThreshold: 50, // 50% drop
  evaluationPeriod: 'yesterday',
  scopeWorkspaceId: 'ALL',
  notifyInUI: true,
  notifySound: false
};

const STORAGE_KEY = 'wivote_revenue_alert_config';

export function useRevenueAlerts(
  allVouchers: Voucher[],
  workspaces: Workspace[],
  selectedWorkspaceId: string = 'ALL'
) {
  // Local state for configuration
  const [config, setConfig] = useState<RevenueAlertConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_CONFIG;
  });

  // Simulated drop state for testing
  const [simulationActive, setSimulationActive] = useState<boolean>(false);
  const [simulatedRevenue, setSimulatedRevenue] = useState<number>(10);

  // Sync config from Firestore saas_config/revenue_alert_settings
  useEffect(() => {
    if (isFirebasePlaceholder) return;

    const unsub = onSnapshot(doc(db, 'saas_config', 'revenue_alert_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const cloudConfig = docSnap.data() as RevenueAlertConfig;
        setConfig((prev) => ({ ...prev, ...cloudConfig }));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudConfig));
        } catch {
          // ignore
        }
      }
    }, (err) => {
      console.warn("Firestore revenue alert config listener note:", err);
    });

    return () => unsub();
  }, []);

  // Save config changes to Firestore & local storage
  const updateConfig = useCallback(async (updates: Partial<RevenueAlertConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...updates, updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }

      if (!isFirebasePlaceholder) {
        setDoc(doc(db, 'saas_config', 'revenue_alert_settings'), next, { merge: true }).catch((err) => {
          console.warn("Failed to persist revenue alert config to Firestore:", err);
        });
      }

      return next;
    });
  }, []);

  // Acknowledge current alert
  const acknowledgeAlert = useCallback(async (dateKey: string) => {
    await updateConfig({ lastAcknowledgedDateKey: dateKey });
  }, [updateConfig]);

  // Evaluate 30-Day moving average and check for threshold drop
  const evaluation = useMemo(() => {
    const now = new Date();
    const days: { dateKey: string; dayLabel: string; fullDate: string; revenue: number }[] = [];
    const dateMap: { [key: string]: number } = {};

    // 30 consecutive calendar days (index 0 = 29 days ago, index 29 = today)
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
      dateMap[dateKey] = 0;
      days.push({ dateKey, dayLabel, fullDate, revenue: 0 });
    }

    // Filter sold vouchers by scope (strictly paid sales - free customer promotional gifts never record in sales)
    const targetVouchers = allVouchers.filter((v) => {
      if (v.status !== 'Sold') return false;
      if (isVoucherFree(v)) return false; // Free gift vouchers given away never record in sales
      if (selectedWorkspaceId !== 'ALL') {
        const vWs = (v as any).workspaceId;
        if (vWs && vWs !== selectedWorkspaceId) return false;
      }
      return true;
    });

    // Sum revenue per day
    targetVouchers.forEach((v) => {
      const dateStr = v.soldAt || v.assignedAt;
      if (!dateStr) return;
      const vDate = new Date(dateStr);
      if (isNaN(vDate.getTime())) return;
      const dateKey = vDate.toISOString().slice(0, 10);
      if (dateMap[dateKey] !== undefined) {
        const rev = getVoucherMonetaryValue(v);
        dateMap[dateKey] += rev;
      }
    });

    // Assign revenue into days array
    days.forEach((day) => {
      day.revenue = Number((dateMap[day.dateKey] || 0).toFixed(2));
    });

    // If simulation is active, override yesterday's revenue to simulate a drop
    if (simulationActive && days.length >= 2) {
      days[days.length - 2].revenue = simulatedRevenue;
    }

    // 30-Day moving average
    const total30DayRevenue = days.reduce((sum, d) => sum + d.revenue, 0);
    const movingAverage = Number((total30DayRevenue / 30).toFixed(2));

    // Threshold calculation
    const thresholdPercentage = config.dropPercentageThreshold; // e.g. 50
    const thresholdAmount = Number((movingAverage * (1 - thresholdPercentage / 100)).toFixed(2));

    // Determine target day for evaluation
    let targetDay = days[days.length - 2]; // default: yesterday (day 28)
    if (config.evaluationPeriod === 'today') {
      targetDay = days[days.length - 1]; // today
    } else if (config.evaluationPeriod === 'recent_days') {
      // pick lowest revenue day among last 3 days
      const last3 = days.slice(-3);
      targetDay = last3.reduce((min, d) => (d.revenue < min.revenue ? d : min), last3[0]);
    }

    // Target workspace name
    const scopeName = selectedWorkspaceId === 'ALL'
      ? 'All Workspaces (Global)'
      : (workspaces.find(w => w.id === selectedWorkspaceId)?.name || 'Selected Workspace');

    // Evaluate drop condition
    let alert: RevenueDropAlert | null = null;

    if (config.enabled && movingAverage > 0 && targetDay) {
      const isBelowThreshold = targetDay.revenue < thresholdAmount;

      if (isBelowThreshold) {
        const dropRatio = (movingAverage - targetDay.revenue) / movingAverage;
        const dropPercentage = Number((dropRatio * 100).toFixed(1));
        const deficit = Number((movingAverage - targetDay.revenue).toFixed(2));
        const severity: 'warning' | 'critical' = dropPercentage >= 75 || targetDay.revenue === 0 ? 'critical' : 'warning';
        const isAcknowledged = config.lastAcknowledgedDateKey === targetDay.dateKey;

        const message = `Daily voucher revenue on ${targetDay.fullDate} ($${(targetDay.revenue || 0).toFixed(2)}) plunged ${dropPercentage}% below the 30-day moving average of $${(movingAverage || 0).toFixed(2)}. Alert threshold is ${thresholdPercentage}% drop.`;

        alert = {
          id: `alert_${targetDay.dateKey}_${targetDay.revenue}`,
          dateKey: targetDay.dateKey,
          dayLabel: targetDay.dayLabel,
          fullDate: targetDay.fullDate,
          actualRevenue: targetDay.revenue,
          movingAverage,
          dropPercentage,
          thresholdPercentage,
          thresholdAmount,
          deficit,
          severity,
          acknowledged: isAcknowledged,
          workspaceName: scopeName,
          triggeredAt: new Date().toISOString(),
          message
        };
      }
    }

    return {
      days,
      total30DayRevenue: Number(total30DayRevenue.toFixed(2)),
      movingAverage,
      thresholdAmount,
      thresholdPercentage,
      targetDay,
      alert,
      scopeName
    };
  }, [
    allVouchers,
    selectedWorkspaceId,
    config.enabled,
    config.dropPercentageThreshold,
    config.evaluationPeriod,
    config.lastAcknowledgedDateKey,
    simulationActive,
    simulatedRevenue,
    workspaces
  ]);

  // Dispatch alert to notifications collection if new
  const logAlertToAuditTrail = useCallback(async () => {
    if (!evaluation.alert || isFirebasePlaceholder) return;
    try {
      await addDoc(collection(db, 'saas_config', 'revenue_alerts', 'history'), {
        ...evaluation.alert,
        loggedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn("Could not log alert to Firestore audit trail:", err);
    }
  }, [evaluation.alert]);

  return {
    config,
    updateConfig,
    acknowledgeAlert,
    evaluation,
    simulationActive,
    setSimulationActive,
    simulatedRevenue,
    setSimulatedRevenue,
    logAlertToAuditTrail
  };
}
