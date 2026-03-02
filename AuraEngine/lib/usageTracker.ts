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

export type UsageEventType = 'email_sent' | 'linkedin_action' | 'ai_credit' | 'warmup_sent';

export interface IncrementUsageParams {
  workspaceId: string;
  eventType: UsageEventType;
  sourceEventId?: string;
  quantity?: number;
  senderAccountId?: string;
  metadata?: Record<string, unknown>;
}

interface IncrementUsageResult {
  duplicate: boolean;
  event_type?: string;
  quantity?: number;
  source_event_id?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

/** Read workspace monthly totals from workspace_usage_counters. */
async function getMonthlyUsage(workspaceId: string): Promise<{
  emails: number;
  linkedin: number;
  ai: number;
  warmup: number;
}> {
  const { data, error } = await supabase.rpc('get_workspace_monthly_usage', {
    p_workspace_id: workspaceId,
    p_month_key: monthKey(),
  });
  if (error) return { emails: 0, linkedin: 0, ai: 0, warmup: 0 };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    emails: Number(row?.total_emails_sent ?? 0),
    linkedin: Number(row?.total_linkedin_actions ?? 0),
    ai: Number(row?.total_ai_credits_used ?? 0),
    warmup: Number(row?.total_warmup_sent ?? 0),
  };
}

/** Read workspace daily totals from workspace_usage_counters. */
async function getDailyUsage(workspaceId: string): Promise<{
  emails: number;
  linkedin: number;
  ai: number;
  warmup: number;
}> {
  const { data, error } = await supabase.rpc('get_workspace_daily_usage', {
    p_workspace_id: workspaceId,
  });
  if (error) return { emails: 0, linkedin: 0, ai: 0, warmup: 0 };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    emails: Number(row?.emails_sent ?? 0),
    linkedin: Number(row?.linkedin_actions ?? 0),
    ai: Number(row?.ai_credits_used ?? 0),
    warmup: Number(row?.warmup_emails_sent ?? 0),
  };
}

/** Get per-sender daily sent count (auto-resets on new day). */
async function getSenderDailySent(senderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_sender_daily_sent', {
    p_sender_id: senderId,
  });
  if (error) return 0;
  return (data as number) ?? 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Idempotent usage increment via the `increment_usage` RPC.
 * Duplicate `sourceEventId` returns `{ duplicate: true }` without incrementing.
 */
export async function incrementUsage(params: IncrementUsageParams): Promise<IncrementUsageResult> {
  const { data, error } = await supabase.rpc('increment_usage', {
    p_workspace_id: params.workspaceId,
    p_event_type: params.eventType,
    p_source_event_id: params.sourceEventId ?? null,
    p_quantity: params.quantity ?? 1,
    p_sender_account_id: params.senderAccountId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) throw new Error(`Usage increment failed: ${error.message}`);

  const result = data as IncrementUsageResult;
  return result ?? { duplicate: false };
}

/**
 * Check whether sending one more email is allowed for this inbox + workspace.
 * Returns null if allowed, or a LimitError if blocked.
 *
 * `inboxId` backward compatibility:
 *  - UUID → enforce per-sender daily limit via `get_sender_daily_sent()`
 *  - Non-UUID (e.g. 'default', email string) → skip per-sender check, monthly cap still enforced
 */
export async function checkEmailAllowed(
  workspaceId: string,
  inboxId: string,
  planName: string,
): Promise<LimitError | null> {
  const limits = getOutboundLimits(planName);

  // Per-sender daily check (only for UUID sender account IDs)
  if (UUID_RE.test(inboxId)) {
    const dailySent = await getSenderDailySent(inboxId);
    if (dailySent >= limits.emailsPerDayPerInbox) {
      return { code: 'LIMIT_REACHED', type: 'DAILY_EMAIL' };
    }
  }

  // Monthly workspace cap
  const monthly = await getMonthlyUsage(workspaceId);
  if (monthly.emails >= limits.emailsPerMonth) {
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

  // Daily LinkedIn check
  const daily = await getDailyUsage(workspaceId);
  if (daily.linkedin >= limits.linkedInPerDay) {
    return { code: 'LIMIT_REACHED', type: 'DAILY_LINKEDIN' };
  }

  // Monthly LinkedIn check
  const monthly = await getMonthlyUsage(workspaceId);
  if (monthly.linkedin >= limits.linkedInPerMonth) {
    return { code: 'LIMIT_REACHED', type: 'MONTHLY_LINKEDIN' };
  }

  return null;
}

/**
 * Increment email counter after a successful send.
 * Calls the idempotent `increment_usage` RPC.
 */
export async function trackEmailSend(
  workspaceId: string,
  inboxId: string,
  sourceEventId?: string,
): Promise<void> {
  await incrementUsage({
    workspaceId,
    eventType: 'email_sent',
    sourceEventId,
    senderAccountId: UUID_RE.test(inboxId) ? inboxId : undefined,
  });
}

/**
 * Increment LinkedIn counter after a successful action.
 * Calls the idempotent `increment_usage` RPC.
 */
export async function trackLinkedInAction(
  workspaceId: string,
  sourceEventId?: string,
): Promise<void> {
  await incrementUsage({
    workspaceId,
    eventType: 'linkedin_action',
    sourceEventId,
  });
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

  const [monthly, daily] = await Promise.all([
    getMonthlyUsage(workspaceId),
    getDailyUsage(workspaceId),
  ]);

  const checks: { type: LimitType; current: number; limit: number }[] = [
    { type: 'MONTHLY_EMAIL', current: monthly.emails, limit: limits.emailsPerMonth },
    { type: 'DAILY_LINKEDIN', current: daily.linkedin, limit: limits.linkedInPerDay },
    { type: 'MONTHLY_LINKEDIN', current: monthly.linkedin, limit: limits.linkedInPerMonth },
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
