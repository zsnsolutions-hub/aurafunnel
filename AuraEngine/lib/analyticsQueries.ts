import { supabase } from './supabase';

// ── Types ──

export interface DateRange {
  from: string; // ISO date string
  to: string;   // ISO date string
}

export interface EmailAnalytics {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalFailed: number;
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface EmailTimeSeriesEntry {
  day: string;
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
}

export interface CampaignPerformanceEntry {
  sequenceId: string;
  name: string;
  sent: number;
  openRate: number;
  clickRate: number;
  convRate: number;
}

export interface WorkflowAnalytics {
  totalExecutions: number;
  successRate: number;
  failedCount: number;
  avgDurationMs: number;
  totalLeadsProcessed: number;
  totalWorkflowRoi: number;
  workflowBreakdown: {
    workflowId: string;
    name: string;
    executions: number;
    successCount: number;
    failedCount: number;
  }[];
}

export interface ContentAnalytics {
  totalPosts: number;
  published: number;
  drafts: number;
  pendingReview: number;
  postsByWeek: { week: string; count: number }[];
}

export interface AIUsageAnalytics {
  totalTokens: number;
  requestCount: number;
  avgTokensPerRequest: number;
  tokensByDay: { day: string; tokens: number; requests: number }[];
}

export interface TaskAnalytics {
  total: number;
  completed: number;
  overdue: number;
  byPriority: { priority: string; count: number }[];
}

export interface ImportAnalytics {
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
}

// ── Helpers ──

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function toDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `W${weekNum}`;
}

// ── Query Functions ──

export async function fetchEmailAnalytics(
  userId: string,
  from: string,
  to: string
): Promise<EmailAnalytics> {
  const empty: EmailAnalytics = {
    totalSent: 0, totalDelivered: 0, totalBounced: 0, totalFailed: 0,
    totalOpens: 0, uniqueOpens: 0, totalClicks: 0, uniqueClicks: 0,
    openRate: 0, clickRate: 0, bounceRate: 0,
  };

  const { data: messages, error: msgErr } = await supabase
    .from('email_messages')
    .select('id, status')
    .eq('owner_id', userId)
    .gte('created_at', from)
    .lte('created_at', to);

  if (msgErr || !messages || messages.length === 0) return empty;

  const totalSent = messages.length;
  const totalDelivered = messages.filter(m => m.status === 'delivered' || m.status === 'sent').length;
  const totalBounced = messages.filter(m => m.status === 'bounced').length;
  const totalFailed = messages.filter(m => m.status === 'failed').length;

  const messageIds = messages.map(m => m.id);

  const { data: events, error: evtErr } = await supabase
    .from('email_events')
    .select('message_id, event_type')
    .in('message_id', messageIds)
    .eq('is_bot', false);

  if (evtErr) return { ...empty, totalSent, totalDelivered, totalBounced, totalFailed };

  const allEvents = events ?? [];
  const opens = allEvents.filter(e => e.event_type === 'open');
  const clicks = allEvents.filter(e => e.event_type === 'click');
  const uniqueOpenMsgs = new Set(opens.map(e => e.message_id));
  const uniqueClickMsgs = new Set(clicks.map(e => e.message_id));

  const openRate = totalSent > 0 ? +((uniqueOpenMsgs.size / totalSent) * 100).toFixed(1) : 0;
  const clickRate = totalSent > 0 ? +((uniqueClickMsgs.size / totalSent) * 100).toFixed(1) : 0;
  const bounceRate = totalSent > 0 ? +((totalBounced / totalSent) * 100).toFixed(1) : 0;

  return {
    totalSent, totalDelivered, totalBounced, totalFailed,
    totalOpens: opens.length, uniqueOpens: uniqueOpenMsgs.size,
    totalClicks: clicks.length, uniqueClicks: uniqueClickMsgs.size,
    openRate, clickRate, bounceRate,
  };
}

export async function fetchEmailTimeSeries(
  userId: string,
  from: string,
  to: string
): Promise<EmailTimeSeriesEntry[]> {
  const days = daysBetween(from, to);
  const dayMap = new Map<string, EmailTimeSeriesEntry>();
  for (const d of days) {
    dayMap.set(d, { day: toDateLabel(d), sent: 0, opens: 0, clicks: 0, bounces: 0 });
  }

  const { data: messages } = await supabase
    .from('email_messages')
    .select('id, status, created_at')
    .eq('owner_id', userId)
    .gte('created_at', from)
    .lte('created_at', to);

  if (!messages || messages.length === 0) return Array.from(dayMap.values());

  const messageIds = messages.map(m => m.id);
  const msgDayMap = new Map<string, string>(); // messageId -> day

  for (const m of messages) {
    const dayKey = m.created_at.split('T')[0];
    const entry = dayMap.get(dayKey);
    if (entry) {
      entry.sent++;
      if (m.status === 'bounced') entry.bounces++;
    }
    msgDayMap.set(m.id, dayKey);
  }

  const { data: events } = await supabase
    .from('email_events')
    .select('message_id, event_type, created_at')
    .in('message_id', messageIds)
    .eq('is_bot', false)
    .in('event_type', ['open', 'click']);

  if (events) {
    for (const ev of events) {
      const dayKey = ev.created_at.split('T')[0];
      const entry = dayMap.get(dayKey);
      if (entry) {
        if (ev.event_type === 'open') entry.opens++;
        if (ev.event_type === 'click') entry.clicks++;
      }
    }
  }

  return Array.from(dayMap.values());
}

export async function fetchCampaignPerformance(
  userId: string,
  from: string,
  to: string
): Promise<CampaignPerformanceEntry[]> {
  const { data: scheduled, error } = await supabase
    .from('scheduled_emails')
    .select('sequence_id, subject, status, lead_id')
    .eq('owner_id', userId)
    .not('sequence_id', 'is', null)
    .gte('created_at', from)
    .lte('created_at', to);

  if (error || !scheduled || scheduled.length === 0) return [];

  // Group by sequence_id
  const groups = new Map<string, { name: string; sent: number; leadIds: Set<string> }>();
  for (const row of scheduled) {
    const key = row.sequence_id!;
    if (!groups.has(key)) {
      groups.set(key, { name: row.subject ?? '(no subject)', sent: 0, leadIds: new Set() });
    }
    const g = groups.get(key)!;
    if (row.status === 'sent') g.sent++;
    if (row.lead_id) g.leadIds.add(row.lead_id);
  }

  // Get email messages for this user in range to cross-reference events
  const { data: messages } = await supabase
    .from('email_messages')
    .select('id, status')
    .eq('owner_id', userId)
    .gte('created_at', from)
    .lte('created_at', to);

  let eventMap = new Map<string, { opens: number; clicks: number }>();
  if (messages && messages.length > 0) {
    const messageIds = messages.map(m => m.id);
    const { data: events } = await supabase
      .from('email_events')
      .select('message_id, event_type')
      .in('message_id', messageIds)
      .eq('is_bot', false)
      .in('event_type', ['open', 'click']);

    if (events) {
      for (const ev of events) {
        const existing = eventMap.get(ev.message_id) ?? { opens: 0, clicks: 0 };
        if (ev.event_type === 'open') existing.opens++;
        if (ev.event_type === 'click') existing.clicks++;
        eventMap.set(ev.message_id, existing);
      }
    }
  }

  // Aggregate per-user event totals for rough rate calculation
  const totalMsgs = messages?.length ?? 0;
  const totalOpens = Array.from(eventMap.values()).reduce((s, e) => s + (e.opens > 0 ? 1 : 0), 0);
  const totalClicks = Array.from(eventMap.values()).reduce((s, e) => s + (e.clicks > 0 ? 1 : 0), 0);
  const avgOpenRate = totalMsgs > 0 ? +((totalOpens / totalMsgs) * 100).toFixed(1) : 0;
  const avgClickRate = totalMsgs > 0 ? +((totalClicks / totalMsgs) * 100).toFixed(1) : 0;

  const result: CampaignPerformanceEntry[] = [];
  for (const [seqId, g] of groups) {
    result.push({
      sequenceId: seqId,
      name: g.name,
      sent: g.sent,
      openRate: avgOpenRate,
      clickRate: avgClickRate,
      convRate: g.leadIds.size > 0 && g.sent > 0 ? +((g.leadIds.size / g.sent) * 100).toFixed(1) : 0,
    });
  }

  return result.sort((a, b) => b.sent - a.sent);
}

export async function fetchWorkflowAnalytics(
  userId: string,
  from: string,
  to: string
): Promise<WorkflowAnalytics> {
  const empty: WorkflowAnalytics = {
    totalExecutions: 0, successRate: 0, failedCount: 0,
    avgDurationMs: 0, totalLeadsProcessed: 0, totalWorkflowRoi: 0,
    workflowBreakdown: [],
  };

  // Get user's workflows
  const { data: workflows, error: wfErr } = await supabase
    .from('workflows')
    .select('id, name, stats')
    .eq('user_id', userId);

  if (wfErr || !workflows || workflows.length === 0) return empty;

  const workflowIds = workflows.map(w => w.id);
  const workflowNames = new Map(workflows.map(w => [w.id, w.name]));

  // Sum ROI from workflow stats
  let totalRoi = 0;
  for (const w of workflows) {
    const stats = w.stats as { roi?: number; leadsProcessed?: number } | null;
    if (stats?.roi) totalRoi += stats.roi;
  }

  // Get executions in date range
  const { data: executions, error: exErr } = await supabase
    .from('workflow_executions')
    .select('id, workflow_id, status, lead_id, started_at, completed_at')
    .in('workflow_id', workflowIds)
    .gte('started_at', from)
    .lte('started_at', to);

  if (exErr || !executions || executions.length === 0) {
    return { ...empty, totalWorkflowRoi: totalRoi, workflowBreakdown: workflows.map(w => ({
      workflowId: w.id, name: w.name, executions: 0, successCount: 0, failedCount: 0,
    })) };
  }

  const totalExecutions = executions.length;
  const successCount = executions.filter(e => e.status === 'success').length;
  const failedCount = executions.filter(e => e.status === 'failed').length;
  const successRate = totalExecutions > 0 ? +((successCount / totalExecutions) * 100).toFixed(1) : 0;
  const leadIds = new Set(executions.filter(e => e.lead_id).map(e => e.lead_id));

  // Calculate avg duration for completed executions
  let totalDurationMs = 0;
  let completedCount = 0;
  for (const ex of executions) {
    if (ex.completed_at && ex.started_at) {
      const dur = new Date(ex.completed_at).getTime() - new Date(ex.started_at).getTime();
      if (dur > 0) { totalDurationMs += dur; completedCount++; }
    }
  }
  const avgDurationMs = completedCount > 0 ? Math.round(totalDurationMs / completedCount) : 0;

  // Breakdown per workflow
  const breakdownMap = new Map<string, { successCount: number; failedCount: number; total: number }>();
  for (const ex of executions) {
    const existing = breakdownMap.get(ex.workflow_id) ?? { successCount: 0, failedCount: 0, total: 0 };
    existing.total++;
    if (ex.status === 'success') existing.successCount++;
    if (ex.status === 'failed') existing.failedCount++;
    breakdownMap.set(ex.workflow_id, existing);
  }

  const workflowBreakdown = Array.from(breakdownMap.entries()).map(([wfId, stats]) => ({
    workflowId: wfId,
    name: workflowNames.get(wfId) ?? 'Unknown',
    executions: stats.total,
    successCount: stats.successCount,
    failedCount: stats.failedCount,
  })).sort((a, b) => b.executions - a.executions);

  return {
    totalExecutions, successRate, failedCount, avgDurationMs,
    totalLeadsProcessed: leadIds.size, totalWorkflowRoi: totalRoi,
    workflowBreakdown,
  };
}

export async function fetchContentAnalytics(
  userId: string,
  from: string,
  to: string
): Promise<ContentAnalytics> {
  const empty: ContentAnalytics = { totalPosts: 0, published: 0, drafts: 0, pendingReview: 0, postsByWeek: [] };

  try {
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('id, status, created_at')
      .eq('author_id', userId)
      .gte('created_at', from)
      .lte('created_at', to);

    if (error || !posts || posts.length === 0) return empty;

    const published = posts.filter(p => p.status === 'published').length;
    const drafts = posts.filter(p => p.status === 'draft').length;
    const pendingReview = posts.filter(p => p.status === 'pending_review').length;

    // Group by week
    const weekMap = new Map<string, number>();
    for (const p of posts) {
      const w = weekLabel(p.created_at);
      weekMap.set(w, (weekMap.get(w) ?? 0) + 1);
    }

    const postsByWeek = Array.from(weekMap.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return { totalPosts: posts.length, published, drafts, pendingReview, postsByWeek };
  } catch {
    return empty;
  }
}

export async function fetchAIUsageAnalytics(
  userId: string,
  from: string,
  to: string
): Promise<AIUsageAnalytics> {
  const empty: AIUsageAnalytics = { totalTokens: 0, requestCount: 0, avgTokensPerRequest: 0, tokensByDay: [] };

  try {
    const { data: logs, error } = await supabase
      .from('ai_usage_logs')
      .select('tokens_used, created_at')
      .eq('user_id', userId)
      .gte('created_at', from)
      .lte('created_at', to);

    if (error || !logs || logs.length === 0) return empty;

    const totalTokens = logs.reduce((s, l) => s + (l.tokens_used ?? 0), 0);
    const requestCount = logs.length;
    const avgTokensPerRequest = requestCount > 0 ? Math.round(totalTokens / requestCount) : 0;

    // Group by day
    const dayMap = new Map<string, { tokens: number; requests: number }>();
    const days = daysBetween(from, to);
    for (const d of days) {
      dayMap.set(d, { tokens: 0, requests: 0 });
    }

    for (const log of logs) {
      const dayKey = log.created_at.split('T')[0];
      const entry = dayMap.get(dayKey);
      if (entry) {
        entry.tokens += log.tokens_used ?? 0;
        entry.requests++;
      }
    }

    const tokensByDay = Array.from(dayMap.entries()).map(([d, v]) => ({
      day: toDateLabel(d),
      tokens: v.tokens,
      requests: v.requests,
    }));

    return { totalTokens, requestCount, avgTokensPerRequest, tokensByDay };
  } catch {
    return empty;
  }
}

export async function fetchTaskAnalytics(
  _userId: string
): Promise<TaskAnalytics> {
  // TODO: Enable when strategy_tasks table is created via supabase-migration-v3.sql
  return { total: 0, completed: 0, overdue: 0, byPriority: [] };
}

export async function fetchImportAnalytics(
  userId: string,
  from: string,
  to: string
): Promise<ImportAnalytics> {
  const empty: ImportAnalytics = { totalImported: 0, totalSkipped: 0, totalFailed: 0 };

  try {
    const { data: logs, error } = await supabase
      .from('apollo_import_logs')
      .select('imported_count, skipped_count, failed_count')
      .eq('user_id', userId)
      .gte('created_at', from)
      .lte('created_at', to);

    if (error || !logs || logs.length === 0) return empty;

    return {
      totalImported: logs.reduce((s, l) => s + (l.imported_count ?? 0), 0),
      totalSkipped: logs.reduce((s, l) => s + (l.skipped_count ?? 0), 0),
      totalFailed: logs.reduce((s, l) => s + (l.failed_count ?? 0), 0),
    };
  } catch {
    return empty;
  }
}
