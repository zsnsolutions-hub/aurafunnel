// ── AI Credit Pricing Configuration ──────────────────────────────────────────
//
// Single source of truth for AI credit allocations per plan.
// 1 AI credit = 800 tokens (Gemini).  Hard stop when credits reach 0.
// Credits are per workspace, NOT per user — seats do not multiply credits.
// ─────────────────────────────────────────────────────────────────────────────

export const CREDIT_CONVERSION_RATE = 800; // tokens per 1 AI credit

export interface AiPlanConfig {
  name: string;
  hasAI: boolean;
  aiCreditsMonthly: number;
  hardStopAI: boolean;
  aiFeatures: string[];
}

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

/** Resolve a plan name and return its AI config (defaults to Starter). */
export function getAiPlanConfig(planName: string): AiPlanConfig {
  // Handle backward-compat names
  if (planName === 'Professional') return AI_PLAN_CONFIG.Growth;
  if (planName === 'Enterprise' || planName === 'Business') return AI_PLAN_CONFIG.Scale;
  return AI_PLAN_CONFIG[planName] ?? AI_PLAN_CONFIG.Starter;
}

/** Convert raw token count into AI credits (ceiling). */
export function tokensToCredits(tokens: number): number {
  return Math.ceil(tokens / CREDIT_CONVERSION_RATE);
}
