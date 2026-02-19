import { useState, useCallback, useEffect } from 'react';
import {
  fetchEmailAnalytics,
  fetchEmailTimeSeries,
  fetchCampaignPerformance,
  fetchWorkflowAnalytics,
  fetchContentAnalytics,
  fetchAIUsageAnalytics,
  fetchTaskAnalytics,
  fetchImportAnalytics,
  type EmailAnalytics,
  type EmailTimeSeriesEntry,
  type CampaignPerformanceEntry,
  type WorkflowAnalytics,
  type ContentAnalytics,
  type AIUsageAnalytics,
  type TaskAnalytics,
  type ImportAnalytics,
} from '../lib/analyticsQueries';

type DateRangePreset = '7d' | '14d' | '30d' | '90d';

export interface AnalyticsData {
  emailAnalytics: EmailAnalytics;
  emailTimeSeries: EmailTimeSeriesEntry[];
  campaignPerformance: CampaignPerformanceEntry[];
  workflowAnalytics: WorkflowAnalytics;
  contentAnalytics: ContentAnalytics;
  aiUsageAnalytics: AIUsageAnalytics;
  taskAnalytics: TaskAnalytics;
  importAnalytics: ImportAnalytics;
  // Previous period (for comparison mode)
  prevEmailAnalytics: EmailAnalytics | null;
  prevWorkflowAnalytics: WorkflowAnalytics | null;
}

export interface TrendDelta {
  value: number;
  label: string;
  up: boolean;
}

function presetToDates(preset: DateRangePreset): { from: string; to: string } {
  const days = parseInt(preset);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function previousPeriodDates(preset: DateRangePreset): { from: string; to: string } {
  const days = parseInt(preset);
  const to = new Date();
  to.setDate(to.getDate() - days);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function computeTrend(current: number, previous: number): TrendDelta {
  if (previous === 0 && current === 0) return { value: 0, label: '0%', up: true };
  if (previous === 0) return { value: 100, label: '+100%', up: true };
  const pct = +((((current - previous) / previous) * 100)).toFixed(1);
  return {
    value: Math.abs(pct),
    label: `${pct >= 0 ? '+' : ''}${pct}%`,
    up: pct >= 0,
  };
}

const EMPTY_EMAIL: EmailAnalytics = {
  totalSent: 0, totalDelivered: 0, totalBounced: 0, totalFailed: 0,
  totalOpens: 0, uniqueOpens: 0, totalClicks: 0, uniqueClicks: 0,
  openRate: 0, clickRate: 0, bounceRate: 0,
};

const EMPTY_WORKFLOW: WorkflowAnalytics = {
  totalExecutions: 0, successRate: 0, failedCount: 0,
  avgDurationMs: 0, totalLeadsProcessed: 0, totalWorkflowRoi: 0,
  workflowBreakdown: [],
};

const EMPTY_DATA: AnalyticsData = {
  emailAnalytics: EMPTY_EMAIL,
  emailTimeSeries: [],
  campaignPerformance: [],
  workflowAnalytics: EMPTY_WORKFLOW,
  contentAnalytics: { totalPosts: 0, published: 0, drafts: 0, pendingReview: 0, postsByWeek: [] },
  aiUsageAnalytics: { totalTokens: 0, requestCount: 0, avgTokensPerRequest: 0, tokensByDay: [] },
  taskAnalytics: { total: 0, completed: 0, overdue: 0, byPriority: [] },
  importAnalytics: { totalImported: 0, totalSkipped: 0, totalFailed: 0 },
  prevEmailAnalytics: null,
  prevWorkflowAnalytics: null,
};

export function useAnalyticsData(
  userId: string | undefined,
  dateRange: DateRangePreset,
  comparisonMode: boolean
) {
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    setLoading(true);
    try {
      const { from, to } = presetToDates(dateRange);

      const [
        emailAnalytics,
        emailTimeSeries,
        campaignPerformance,
        workflowAnalytics,
        contentAnalytics,
        aiUsageAnalytics,
        taskAnalytics,
        importAnalytics,
      ] = await Promise.all([
        fetchEmailAnalytics(userId, from, to),
        fetchEmailTimeSeries(userId, from, to),
        fetchCampaignPerformance(userId, from, to),
        fetchWorkflowAnalytics(userId, from, to),
        fetchContentAnalytics(userId, from, to),
        fetchAIUsageAnalytics(userId, from, to),
        fetchTaskAnalytics(userId),
        fetchImportAnalytics(userId, from, to),
      ]);

      let prevEmailAnalytics: EmailAnalytics | null = null;
      let prevWorkflowAnalytics: WorkflowAnalytics | null = null;

      if (comparisonMode) {
        const prev = previousPeriodDates(dateRange);
        const [prevEmail, prevWorkflow] = await Promise.all([
          fetchEmailAnalytics(userId, prev.from, prev.to),
          fetchWorkflowAnalytics(userId, prev.from, prev.to),
        ]);
        prevEmailAnalytics = prevEmail;
        prevWorkflowAnalytics = prevWorkflow;
      }

      setData({
        emailAnalytics, emailTimeSeries, campaignPerformance,
        workflowAnalytics, contentAnalytics, aiUsageAnalytics,
        taskAnalytics, importAnalytics,
        prevEmailAnalytics, prevWorkflowAnalytics,
      });
    } catch (err) {
      console.error('Analytics data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, dateRange, comparisonMode]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}
