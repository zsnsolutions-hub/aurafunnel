import { supabase } from './supabase';
import { resolvePlanName } from './credits';
import { getOutboundLimits, type OutboundLimits } from './planLimits';
import { listOutreachAccounts } from './senderAccounts';
import type { SenderAccount } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

export type SendLimitCode =
  | 'DAILY_EMAIL_PER_INBOX'
  | 'MONTHLY_EMAIL_WORKSPACE'
  | 'NO_AVAILABLE_INBOX'
  | 'INBOX_LIMIT_REACHED';

export interface SendLimitError {
  code: SendLimitCode;
  message: string;
  details?: { senderId?: string; dailySent?: number; dailyMax?: number; monthlySent?: number; monthlyMax?: number };
}

export interface SendResult {
  success: boolean;
  senderAccountId: string;
  error?: SendLimitError;
}

export interface InboxSelection {
  sender: SenderAccount;
  dailySent: number;
  dailyMax: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Get the daily cap per inbox for a plan. */
function getDailyCapPerInbox(limits: OutboundLimits): number {
  return limits.emailsPerDayPerInbox;
}

/** Get the per-sender daily count (auto-resets on new day). */
async function getSenderDailySent(senderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_sender_daily_sent', {
    p_sender_id: senderId,
  });
  if (error) return 0;
  return (data as number) ?? 0;
}

/** Get workspace monthly email total. */
async function getWorkspaceMonthlyEmails(workspaceId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_workspace_monthly_usage', {
    p_workspace_id: workspaceId,
    p_month_key: monthKey(),
  });
  if (error) return 0;
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.total_emails_sent ?? 0);
}

// ── Pre-flight checks ────────────────────────────────────────────────────────

/**
 * Check if the workspace can send one more email.
 * Returns null if allowed, or a SendLimitError if blocked.
 */
export async function checkSendAllowed(
  workspaceId: string,
  planName: string,
  senderAccountId?: string,
): Promise<SendLimitError | null> {
  const resolved = resolvePlanName(planName);
  const limits = getOutboundLimits(resolved);

  // 1. Monthly workspace cap
  const monthlySent = await getWorkspaceMonthlyEmails(workspaceId);
  if (monthlySent >= limits.emailsPerMonth) {
    return {
      code: 'MONTHLY_EMAIL_WORKSPACE',
      message: 'Monthly email limit reached for this workspace.',
      details: { monthlySent, monthlyMax: limits.emailsPerMonth },
    };
  }

  // 2. Per-inbox daily cap (if specific sender given)
  if (senderAccountId) {
    const dailySent = await getSenderDailySent(senderAccountId);
    const dailyMax = getDailyCapPerInbox(limits);
    if (dailySent >= dailyMax) {
      return {
        code: 'DAILY_EMAIL_PER_INBOX',
        message: 'Daily sending limit reached for this inbox.',
        details: { senderId: senderAccountId, dailySent, dailyMax },
      };
    }
  }

  return null;
}

// ── Inbox rotation ───────────────────────────────────────────────────────────

/**
 * Select the best available inbox for sending using round-robin.
 * Skips inboxes that have hit their daily cap.
 * Returns the selected sender or a SendLimitError.
 */
export async function selectInbox(
  workspaceId: string,
  planName: string,
): Promise<{ sender: SenderAccount } | { error: SendLimitError }> {
  const resolved = resolvePlanName(planName);
  const limits = getOutboundLimits(resolved);
  const dailyMax = getDailyCapPerInbox(limits);

  // 1. Check workspace monthly cap first
  const monthlySent = await getWorkspaceMonthlyEmails(workspaceId);
  if (monthlySent >= limits.emailsPerMonth) {
    return {
      error: {
        code: 'MONTHLY_EMAIL_WORKSPACE',
        message: 'Monthly email limit reached. Sending resumes next month.',
        details: { monthlySent, monthlyMax: limits.emailsPerMonth },
      },
    };
  }

  // 2. Get all outreach-enabled, connected accounts
  const accounts = await listOutreachAccounts(workspaceId);
  if (accounts.length === 0) {
    return {
      error: {
        code: 'NO_AVAILABLE_INBOX',
        message: 'No connected sender accounts available. Add a sending account in Settings.',
      },
    };
  }

  // 3. Check each inbox's daily capacity
  const available: InboxSelection[] = [];
  for (const sender of accounts) {
    const dailySent = await getSenderDailySent(sender.id);
    if (dailySent < dailyMax) {
      available.push({ sender, dailySent, dailyMax });
    }
  }

  if (available.length === 0) {
    return {
      error: {
        code: 'DAILY_EMAIL_PER_INBOX',
        message: 'All inboxes have reached their daily sending limit. Sending resumes tomorrow.',
        details: { dailySent: dailyMax, dailyMax },
      },
    };
  }

  // 4. Round-robin: pick the inbox with the lowest daily sent count
  available.sort((a, b) => a.dailySent - b.dailySent);
  return { sender: available[0].sender };
}

// ── Post-send tracking ───────────────────────────────────────────────────────

/**
 * Track a successful email send. Increments:
 * - Per-sender daily counter
 * - Workspace daily + monthly counter
 */
export async function trackEmailSent(
  workspaceId: string,
  senderAccountId: string,
): Promise<void> {
  await Promise.all([
    supabase.rpc('increment_sender_daily_sent', { p_sender_id: senderAccountId }),
    supabase.rpc('increment_workspace_usage', {
      p_workspace_id: workspaceId,
      p_date_key: todayKey(),
      p_month_key: monthKey(),
      p_emails: 1,
      p_linkedin: 0,
      p_ai_credits: 0,
      p_warmup: 0,
    }),
  ]);
}

/**
 * Track a warm-up email send. Does NOT count toward outreach limits.
 */
export async function trackWarmupSent(
  workspaceId: string,
  senderAccountId: string,
): Promise<void> {
  // Increment warmup counter on sender
  await supabase
    .from('sender_accounts')
    .update({
      warmup_daily_sent: supabase.rpc ? undefined : 0, // handled by RPC below
      updated_at: new Date().toISOString(),
    })
    .eq('id', senderAccountId);

  // Increment workspace warmup counter only
  await supabase.rpc('increment_workspace_usage', {
    p_workspace_id: workspaceId,
    p_date_key: todayKey(),
    p_month_key: monthKey(),
    p_emails: 0,
    p_linkedin: 0,
    p_ai_credits: 0,
    p_warmup: 1,
  });
}

// ── Sequence orchestration ───────────────────────────────────────────────────

export interface SequenceSendRequest {
  workspaceId: string;
  planName: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  campaignId?: string;
  sequenceStepId?: string;
  preferredSenderId?: string;
}

/**
 * Send an email as part of a sequence with inbox rotation + enforcement.
 * Returns the result including which sender was used.
 */
export async function sendSequenceEmail(
  req: SequenceSendRequest,
): Promise<SendResult> {
  // 1. Select inbox (or use preferred)
  let senderAccountId: string;

  if (req.preferredSenderId) {
    // Validate the preferred sender is still available
    const err = await checkSendAllowed(req.workspaceId, req.planName, req.preferredSenderId);
    if (err) {
      return { success: false, senderAccountId: req.preferredSenderId, error: err };
    }
    senderAccountId = req.preferredSenderId;
  } else {
    const selection = await selectInbox(req.workspaceId, req.planName);
    if ('error' in selection) {
      return { success: false, senderAccountId: '', error: selection.error };
    }
    senderAccountId = selection.sender.id;
  }

  // 2. Call the send-email edge function
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        senderAccountId,
        to: req.recipientEmail,
        subject: req.subject,
        html: req.htmlBody,
        campaignId: req.campaignId,
        sequenceStepId: req.sequenceStepId,
      },
    });

    if (error) {
      return {
        success: false,
        senderAccountId,
        error: {
          code: 'NO_AVAILABLE_INBOX',
          message: error.message || 'Email send failed.',
        },
      };
    }

    // 3. Track the send
    await trackEmailSent(req.workspaceId, senderAccountId);
    return { success: true, senderAccountId };
  } catch (err) {
    return {
      success: false,
      senderAccountId,
      error: {
        code: 'NO_AVAILABLE_INBOX',
        message: err instanceof Error ? err.message : 'Email send failed.',
      },
    };
  }
}

// ── Pacing / throttling helpers ──────────────────────────────────────────────

/** Random delay between sends (ms) to avoid burst detection. */
export function getRandomDelay(minMs = 3000, maxMs = 12000): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/** Sleep for a given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
