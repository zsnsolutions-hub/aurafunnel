import { supabase } from './supabase';
import {
  getAiPlanConfig,
  tokensToCredits,
  CREDIT_CONVERSION_RATE,
} from './pricing.config';
import { resolvePlanName } from './credits';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiLimitError {
  code: 'AI_LIMIT_REACHED' | 'AI_NOT_AVAILABLE';
  message: string;
  remaining: number;
  limit: number;
}

export interface AiUsageSnapshot {
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  tokensUsed: number;
  percentUsed: number;
}

export interface AiThresholdWarning {
  level: 'info' | 'warning' | 'critical';
  message: string;
  creditsUsed: number;
  creditsLimit: number;
  percent: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // '2026-02'
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Convert token count to AI credits. */
export function calculateCredits(tokens: number): number {
  return tokensToCredits(tokens);
}

/**
 * Check whether AI actions are allowed for this workspace.
 * Returns null if allowed, or an AiLimitError if blocked.
 *
 * Call this BEFORE making a Gemini API call.
 */
export async function checkAiAllowed(
  workspaceId: string,
  planName: string,
): Promise<AiLimitError | null> {
  const resolved = resolvePlanName(planName);
  const config = getAiPlanConfig(resolved);

  // Plan does not include AI
  if (!config.hasAI) {
    return {
      code: 'AI_NOT_AVAILABLE',
      message: 'AI features are not included in your current plan. Upgrade to Growth or Scale to unlock AI.',
      remaining: 0,
      limit: 0,
    };
  }

  // Check remaining credits
  const remaining = await getRemainingCredits(workspaceId, resolved);

  if (remaining <= 0) {
    return {
      code: 'AI_LIMIT_REACHED',
      message: 'You\u2019ve used all your AI credits for this month. Upgrade your plan or wait for the monthly reset.',
      remaining: 0,
      limit: config.aiCredits,
    };
  }

  return null;
}

/**
 * Get the remaining AI credits for a workspace this month.
 */
export async function getRemainingCredits(
  workspaceId: string,
  planName: string,
): Promise<number> {
  const resolved = resolvePlanName(planName);
  const config = getAiPlanConfig(resolved);

  if (!config.hasAI) return 0;

  const { data, error } = await supabase
    .from('workspace_ai_usage')
    .select('credits_used')
    .eq('workspace_id', workspaceId)
    .eq('month_year', monthKey())
    .maybeSingle();

  if (error || !data) return config.aiCredits; // No usage yet = full quota
  return Math.max(config.aiCredits - (data.credits_used ?? 0), 0);
}

/**
 * Get full AI usage snapshot for the workspace.
 */
export async function getAiUsageSnapshot(
  workspaceId: string,
  planName: string,
): Promise<AiUsageSnapshot> {
  const resolved = resolvePlanName(planName);
  const config = getAiPlanConfig(resolved);

  if (!config.hasAI) {
    return { creditsUsed: 0, creditsLimit: 0, creditsRemaining: 0, tokensUsed: 0, percentUsed: 0 };
  }

  const { data } = await supabase
    .from('workspace_ai_usage')
    .select('credits_used, tokens_used')
    .eq('workspace_id', workspaceId)
    .eq('month_year', monthKey())
    .maybeSingle();

  const creditsUsed = data?.credits_used ?? 0;
  const tokensUsed = data?.tokens_used ?? 0;
  const creditsRemaining = Math.max(config.aiCredits - creditsUsed, 0);
  const percentUsed = config.aiCredits > 0
    ? Math.min(Math.round((creditsUsed / config.aiCredits) * 100), 100)
    : 0;

  return { creditsUsed, creditsLimit: config.aiCredits, creditsRemaining, tokensUsed, percentUsed };
}

/**
 * Check threshold warnings (50%, 75%, 90%).
 * Returns null if under 50%, or a warning object.
 */
export async function checkAiThreshold(
  workspaceId: string,
  planName: string,
): Promise<AiThresholdWarning | null> {
  const snapshot = await getAiUsageSnapshot(workspaceId, planName);

  if (snapshot.creditsLimit === 0) return null;

  const remaining = snapshot.creditsRemaining;

  if (snapshot.percentUsed >= 90) {
    return {
      level: 'critical',
      message: `Almost out of AI credits — ${remaining.toLocaleString()} remaining`,
      creditsUsed: snapshot.creditsUsed,
      creditsLimit: snapshot.creditsLimit,
      percent: snapshot.percentUsed,
    };
  }

  if (snapshot.percentUsed >= 75) {
    return {
      level: 'warning',
      message: `${snapshot.percentUsed}% of AI credits used this month`,
      creditsUsed: snapshot.creditsUsed,
      creditsLimit: snapshot.creditsLimit,
      percent: snapshot.percentUsed,
    };
  }

  if (snapshot.percentUsed >= 50) {
    return {
      level: 'info',
      message: `${snapshot.percentUsed}% of AI credits used this month. ${remaining.toLocaleString()} remaining.`,
      creditsUsed: snapshot.creditsUsed,
      creditsLimit: snapshot.creditsLimit,
      percent: snapshot.percentUsed,
    };
  }

  return null;
}

/** Estimate how many AI credits a token count will cost. Useful for pre-launch estimates. */
export function estimateCredits(estimatedTokens: number): number {
  return tokensToCredits(estimatedTokens);
}

/** Credit conversion rate constant, re-exported for UI tooltips. */
export { CREDIT_CONVERSION_RATE };
