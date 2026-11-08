export type EvaluationPeriod = 'yesterday' | 'today' | 'recent_days';

export interface RevenueAlertConfig {
  enabled: boolean;
  dropPercentageThreshold: number; // e.g. 50 for 50%
  evaluationPeriod: EvaluationPeriod;
  scopeWorkspaceId: string; // 'ALL' or specific workspace
  notifyInUI: boolean;
  notifySound: boolean;
  lastAcknowledgedDateKey?: string;
  updatedAt?: string;
}

export interface RevenueDropAlert {
  id: string;
  dateKey: string; // "YYYY-MM-DD"
  dayLabel: string; // "Sep 5"
  fullDate: string; // "Saturday, Sep 5, 2026"
  actualRevenue: number;
  movingAverage: number;
  dropPercentage: number;
  thresholdPercentage: number;
  thresholdAmount: number;
  deficit: number;
  severity: 'warning' | 'critical';
  acknowledged: boolean;
  workspaceName: string;
  triggeredAt: string;
  message: string;
}
