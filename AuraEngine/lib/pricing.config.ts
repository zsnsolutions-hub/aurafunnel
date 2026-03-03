// ── AI Credit Pricing Configuration ──────────────────────────────────────────
//
// Single source of truth for AI credit allocations per plan.
// 1 AI credit = 800 tokens (Gemini).  Hard stop when credits reach 0.
// Credits are per workspace, NOT per user — seats do not multiply credits.
//
// DB-driven: reads from `plans.limits` via lib/plans.ts.
// Hardcoded fallbacks are kept for resilience when DB is unreachable.
// ─────────────────────────────────────────────────────────────────────────────

import { getPlanByName, getPlanLimitsSync } from './plans';

export const CREDIT_CONVERSION_RATE = 800; // tokens per 1 AI credit

export interface AiPlanConfig {
  name: string;
  hasAI: boolean;
  aiCreditsMonthly: number;
  hardStopAI: boolean;
  aiFeatures: string[];
}

// ── Hardcoded fallback (used only when DB is unreachable) ───────────────────

export const AI_PLAN_CONFIG: Record<string, AiPlanConfig> = {
  Starter: {
    name: 'Starter',
    hasAI: false,
    aiCreditsMonthly: 0,
    hardStopAI: true,
    aiFeatures: [],
  },
  Growth: {
    name: 'Growth',
    hasAI: true,
    aiCreditsMonthly: 2_000,
    hardStopAI: true,
    aiFeatures: ['AI draft generation', 'AI rewrite', 'AI personalization'],
  },
  Scale: {
    name: 'Scale',
    hasAI: true,
    aiCreditsMonthly: 8_000,
    hardStopAI: true,
    aiFeatures: ['AI draft generation', 'AI rewrite', 'Advanced AI personalization'],
  },
};

/** Synchronous: resolve a plan name and return its AI config (hardcoded fallback). */
export function getAiPlanConfig(planName: string): AiPlanConfig {
  // Handle backward-compat names
  if (planName === 'Professional') return getAiPlanConfig('Growth');
  if (planName === 'Enterprise' || planName === 'Business') return getAiPlanConfig('Scale');

  // Use sync fallback from plans.ts defaults
  const limits = getPlanLimitsSync(planName);
  const hardcoded = AI_PLAN_CONFIG[planName] ?? AI_PLAN_CONFIG.Starter;

  return {
    name: planName,
    hasAI: limits.hasAI,
    aiCreditsMonthly: limits.aiCreditsMonthly,
    hardStopAI: true,
    aiFeatures: hardcoded.aiFeatures,
  };
}

/**
 * Async DB-driven: fetch AI config from DB plans table.
 * Falls back to hardcoded if DB fetch fails.
 */
export async function getAiPlanConfigAsync(planName: string): Promise<AiPlanConfig> {
  let resolved = planName;
  if (resolved === 'Professional') resolved = 'Growth';
  if (resolved === 'Enterprise' || resolved === 'Business') resolved = 'Scale';

  try {
    const plan = await getPlanByName(resolved);
    if (plan) {
      const hardcoded = AI_PLAN_CONFIG[resolved] ?? AI_PLAN_CONFIG.Starter;
      return {
        name: plan.name,
        hasAI: plan.limits.hasAI,
        aiCreditsMonthly: plan.limits.aiCreditsMonthly,
        hardStopAI: true,
        aiFeatures: hardcoded.aiFeatures,
      };
    }
  } catch {
    // Fall through to hardcoded
  }
  return getAiPlanConfig(resolved);
}

/** Convert raw token count into AI credits (ceiling). */
export function tokensToCredits(tokens: number): number {
  return Math.ceil(tokens / CREDIT_CONVERSION_RATE);
}
