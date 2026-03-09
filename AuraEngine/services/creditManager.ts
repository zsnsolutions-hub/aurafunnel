// ── Credit Manager Service ────────────────────────────────────────────────────
//
// Reusable credit check, deduction, and tracking logic.
// All AI feature code should call these functions instead of directly
// manipulating credits or calling Supabase RPCs.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import { getAiCreditLimit } from '../config/creditLimits';
import { getOperationCost, type AiOperation } from '../config/aiCreditCosts';
import { resolvePlanName } from '../lib/credits';
import { incrementUsage } from '../lib/usageTracker';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreditCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  error?: 'AI_CREDITS_EXHAUSTED' | 'AI_NOT_AVAILABLE' | 'INSUFFICIENT_CREDITS';
  upgradePlan?: string;
  purchaseCredits?: boolean;
}

export interface CreditDeductionResult {
  success: boolean;
  creditsDeducted: number;
  creditsRemaining: number;
  error?: string;
}

export interface CreditUsageRecord {
  operation: string;
  creditsUsed: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ── Warning thresholds ──────────────────────────────────────────────────────

export const CREDIT_WARNING_THRESHOLDS = [50, 75, 90] as const;
export type WarningLevel = 'info' | 'warning' | 'critical';

export interface CreditWarning {
  level: WarningLevel;
  percent: number;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  message: string;
  upgradePlan?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

const PLAN_UPGRADE_MAP: Record<string, string> = {
  Free: 'starter',
  Starter: 'growth',
  Growth: 'scale',
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a workspace has enough credits for an AI operation.
 * Call BEFORE executing the operation.
 */
export async function checkCredits(
  workspaceId: string,
  operation: string,
  planName: string,
): Promise<CreditCheckResult> {
  const resolved = resolvePlanName(planName);
  const limit = getAiCreditLimit(resolved);
  const cost = getOperationCost(operation);

  // Free plan with 0 limit means AI is available but limited
  if (limit === 0) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      error: 'AI_NOT_AVAILABLE',
      upgradePlan: PLAN_UPGRADE_MAP[resolved] ?? 'growth',
      purchaseCredits: false,
    };
  }

  const remaining = await getRemainingCredits(workspaceId, resolved);

  if (remaining < cost) {
    return {
      allowed: false,
      remaining,
      limit,
      error: 'INSUFFICIENT_CREDITS',
      upgradePlan: PLAN_UPGRADE_MAP[resolved] ?? undefined,
      purchaseCredits: true,
    };
  }

  return { allowed: true, remaining, limit };
}

/**
 * Deduct credits for an AI operation and log usage.
 * Call AFTER the operation completes successfully.
 */
export async function deductCredits(
  workspaceId: string,
  operation: string,
  planName: string,
  metadata?: Record<string, unknown>,
): Promise<CreditDeductionResult> {
  const resolved = resolvePlanName(planName);
  const limit = getAiCreditLimit(resolved);
  const cost = getOperationCost(operation);
  const month = monthKey();

  // Atomically increment usage
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'increment_ai_usage',
    {
      p_workspace_id: workspaceId,
      p_month_year: month,
      p_credits: cost,
      p_tokens: 0,
      p_credits_limit: limit,
    },
  );

  if (rpcErr) {
    console.error('[creditManager] deductCredits failed:', rpcErr.message);
    return { success: false, creditsDeducted: 0, creditsRemaining: 0, error: rpcErr.message };
  }

  const newUsed = (rpcData as number) ?? cost;

  // Log to ai_credit_usage for analytics
  await supabase.from('ai_credit_usage').insert({
    workspace_id: workspaceId,
    operation,
    credits_used: cost,
    metadata: metadata ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[creditManager] usage log insert failed:', error.message);
  });

  // Sync to workspace_usage_counters for dashboard
  incrementUsage({
    workspaceId,
    eventType: 'ai_credit',
    quantity: cost,
  }).catch(() => {});

  return {
    success: true,
    creditsDeducted: cost,
    creditsRemaining: Math.max(limit - newUsed, 0),
  };
}

/**
 * Get remaining AI credits for a workspace this month.
 */
export async function getRemainingCredits(
  workspaceId: string,
  planName: string,
): Promise<number> {
  const resolved = resolvePlanName(planName);
  const limit = getAiCreditLimit(resolved);

  if (limit === 0) return 0;

  const { data, error } = await supabase
    .from('workspace_ai_usage')
    .select('credits_used')
    .eq('workspace_id', workspaceId)
    .eq('month_year', monthKey())
    .maybeSingle();

  if (error || !data) return limit;
  return Math.max(limit - (data.credits_used ?? 0), 0);
}

/**
 * Check credit warning thresholds (50%, 75%, 90%).
 * Returns null if usage is below 50%.
 */
export async function checkCreditWarning(
  workspaceId: string,
  planName: string,
): Promise<CreditWarning | null> {
  const resolved = resolvePlanName(planName);
  const limit = getAiCreditLimit(resolved);

  if (limit === 0) return null;

  const { data } = await supabase
    .from('workspace_ai_usage')
    .select('credits_used')
    .eq('workspace_id', workspaceId)
    .eq('month_year', monthKey())
    .maybeSingle();

  const creditsUsed = data?.credits_used ?? 0;
  const percent = Math.min(Math.round((creditsUsed / limit) * 100), 100);
  const creditsRemaining = Math.max(limit - creditsUsed, 0);

  let level: WarningLevel;
  let message: string;
  const upgradePlan = PLAN_UPGRADE_MAP[resolved];

  if (percent >= 90) {
    level = 'critical';
    message = `You have used ${percent}% of your AI credits this month. ${creditsRemaining.toLocaleString()} credits remaining.`;
  } else if (percent >= 75) {
    level = 'warning';
    message = `You have used ${percent}% of your AI credits this month.${upgradePlan ? ` Upgrade to ${upgradePlan.charAt(0).toUpperCase() + upgradePlan.slice(1)} for more AI capacity.` : ''}`;
  } else if (percent >= 50) {
    level = 'info';
    message = `${percent}% of AI credits used this month. ${creditsRemaining.toLocaleString()} remaining.`;
  } else {
    return null;
  }

  return {
    level,
    percent,
    creditsUsed,
    creditsLimit: limit,
    creditsRemaining,
    message,
    upgradePlan,
  };
}
