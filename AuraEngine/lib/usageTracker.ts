import { supabase } from './supabase';
import { getOutboundLimits } from './planLimits';

// ── Types ────────────────────────────────────────────────────────────────────

export type LimitType =
  | 'DAILY_EMAIL'
  | 'MONTHLY_EMAIL'
  | 'DAILY_LINKEDIN'
  | 'MONTHLY_LINKEDIN';

export interface LimitError {
  code: 'LIMIT_REACHED';
  type: LimitType;
}

export interface ThresholdWarning {
  type: LimitType;
  current: number;
  limit: number;
  percent: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // '2026-02-27'
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // '2026-02'
}

/**
 * Atomically increment a counter row, inserting it if it doesn't exist.
 * Returns the new count after the increment.
 */
async function incrementCounter(
  workspaceId: string,
  channel: 'email' | 'linkedin',
  periodType: 'daily' | 'monthly',
  periodKey: string,
  inboxId: string | null,
): Promise<number> {
  const { data, error } = await supabase
    .from('outbound_usage')
    .upsert(
      {
        workspace_id: workspaceId,
        inbox_id: inboxId,
        channel,
        period_type: periodType,
        period_key: periodKey,
        count: 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,inbox_id,channel,period_type,period_key' },
    )
    .select('count')
    .single();

  if (error) {
    // If upsert returned conflict, fall back to manual increment
    const { data: updated, error: rpcErr } = await supabase.rpc(
      'increment_outbound_usage',
      {
        p_workspace_id: workspaceId,
        p_inbox_id: inboxId,
        p_channel: channel,
        p_period_type: periodType,
        p_period_key: periodKey,
      },
    );
    if (rpcErr) throw new Error(`Usage tracking failed: ${rpcErr.message}`);
    return (updated as number) ?? 0;
  }

  return data?.count ?? 0;
}

/** Read the current counter value (0 if no row exists). */
async function getCount(
  workspaceId: string,
  channel: 'email' | 'linkedin',
  periodType: 'daily' | 'monthly',
  periodKey: string,
  inboxId?: string | null,
): Promise<number> {
  let query = supabase
    .from('outbound_usage')
    .select('count')
    .eq('workspace_id', workspaceId)
    .eq('channel', channel)
    .eq('period_type', periodType)
    .eq('period_key', periodKey);

  if (inboxId) {
    query = query.eq('inbox_id', inboxId);
  } else if (channel === 'email' && periodType === 'monthly') {
    // For monthly email totals, sum across all inboxes
    const { data, error } = await supabase
      .from('outbound_usage')
      .select('count')
      .eq('workspace_id', workspaceId)
      .eq('channel', 'email')
      .eq('period_type', 'monthly')
      .eq('period_key', periodKey);
    if (error) return 0;
    return (data ?? []).reduce((sum, row) => sum + (row.count ?? 0), 0);
  } else {
    query = query.is('inbox_id', null);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return 0;
  return data.count ?? 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether sending one more email is allowed for this inbox + workspace.
 * Returns null if allowed, or a LimitError if blocked.
 */
export async function checkEmailAllowed(
  workspaceId: string,
  inboxId: string,
  planName: string,
): Promise<LimitError | null> {
  const limits = getOutboundLimits(planName);

  // Daily per-inbox check
  const dailyCount = await getCount(workspaceId, 'email', 'daily', todayKey(), inboxId);
  if (dailyCount >= limits.emailsPerDayPerInbox) {
    return { code: 'LIMIT_REACHED', type: 'DAILY_EMAIL' };
  }

  // Monthly total check (sum across all inboxes)
  const monthlyCount = await getCount(workspaceId, 'email', 'monthly', monthKey());
  if (monthlyCount >= limits.emailsPerMonth) {
    return { code: 'LIMIT_REACHED', type: 'MONTHLY_EMAIL' };
  }

  return null;
}

/**
 * Check whether one more LinkedIn action is allowed.
 * Returns null if allowed, or a LimitError if blocked.
 */
export async function checkLinkedInAllowed(
  workspaceId: string,
  planName: string,
): Promise<LimitError | null> {
  const limits = getOutboundLimits(planName);

  const dailyCount = await getCount(workspaceId, 'linkedin', 'daily', todayKey());
  if (dailyCount >= limits.linkedInPerDay) {
    return { code: 'LIMIT_REACHED', type: 'DAILY_LINKEDIN' };
  }

  const monthlyCount = await getCount(workspaceId, 'linkedin', 'monthly', monthKey());
  if (monthlyCount >= limits.linkedInPerMonth) {
    return { code: 'LIMIT_REACHED', type: 'MONTHLY_LINKEDIN' };
  }

  return null;
}

/**
 * Increment email counter after a successful send.
 * Throws if the limit has already been reached (call checkEmailAllowed first).
 */
export async function trackEmailSend(
  workspaceId: string,
  inboxId: string,
): Promise<void> {
  await Promise.all([
    incrementCounter(workspaceId, 'email', 'daily', todayKey(), inboxId),
    incrementCounter(workspaceId, 'email', 'monthly', monthKey(), inboxId),
  ]);
}

/**
 * Increment LinkedIn counter after a successful action.
 * Throws if the limit has already been reached (call checkLinkedInAllowed first).
 */
export async function trackLinkedInAction(
  workspaceId: string,
): Promise<void> {
  await Promise.all([
    incrementCounter(workspaceId, 'linkedin', 'daily', todayKey(), null),
    incrementCounter(workspaceId, 'linkedin', 'monthly', monthKey(), null),
  ]);
}

/**
 * Return threshold warnings (80%+) for the workspace's current usage.
 */
export async function checkThreshold(
  workspaceId: string,
  planName: string,
): Promise<ThresholdWarning[]> {
  const limits = getOutboundLimits(planName);
  const warnings: ThresholdWarning[] = [];

  const [monthlyEmail, dailyLinkedIn, monthlyLinkedIn] = await Promise.all([
    getCount(workspaceId, 'email', 'monthly', monthKey()),
    getCount(workspaceId, 'linkedin', 'daily', todayKey()),
    getCount(workspaceId, 'linkedin', 'monthly', monthKey()),
  ]);

  const checks: { type: LimitType; current: number; limit: number }[] = [
    { type: 'MONTHLY_EMAIL', current: monthlyEmail, limit: limits.emailsPerMonth },
    { type: 'DAILY_LINKEDIN', current: dailyLinkedIn, limit: limits.linkedInPerDay },
    { type: 'MONTHLY_LINKEDIN', current: monthlyLinkedIn, limit: limits.linkedInPerMonth },
  ];

  for (const c of checks) {
    if (c.limit === 0) continue;
    const percent = Math.round((c.current / c.limit) * 100);
    if (percent >= 80) {
      warnings.push({ type: c.type, current: c.current, limit: c.limit, percent });
    }
  }

  return warnings;
}
