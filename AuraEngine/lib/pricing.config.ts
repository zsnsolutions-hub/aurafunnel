// ── AI Credit Pricing Configuration ──────────────────────────────────────────
//
// AI credit allocations are defined in config/creditLimits.ts (single source of truth).
// Each AI operation has a fixed credit cost (see config/aiCreditCosts.ts).
// Credits are per workspace, NOT per user — seats do not multiply credits.
//
// DB-driven: reads from `plans.limits` via lib/plans.ts.
// Hardcoded fallbacks are kept for resilience when DB is unreachable.
// ─────────────────────────────────────────────────────────────────────────────

import { getPlanLimitsSync } from './plans';
import { CREDIT_LIMITS } from '../config/creditLimits';

export interface AiPlanConfig {
  name: string;
  hasAI: boolean;
  aiCredits: number;
  hardStopAI: boolean;
  aiFeatures: string[];
}

// ── Hardcoded fallback (used only when DB is unreachable) ───────────────────

export const AI_PLAN_CONFIG: Record<string, AiPlanConfig> = {
  Free: {
    name: 'Free',
    hasAI: true,
    aiCredits: CREDIT_LIMITS.free,
    hardStopAI: true,
    aiFeatures: [],
  },
  Starter: {
    name: 'Starter',
    hasAI: true,
    aiCredits: CREDIT_LIMITS.starter,
    hardStopAI: true,
    aiFeatures: ['AI draft generation', 'AI rewrite'],
  },
  Growth: {
    name: 'Growth',
    hasAI: true,
    aiCredits: CREDIT_LIMITS.growth,
    hardStopAI: true,
    aiFeatures: ['AI draft generation', 'AI rewrite', 'AI personalization'],
  },
  Scale: {
    name: 'Scale',
    hasAI: true,
    aiCredits: CREDIT_LIMITS.scale,
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
  const hardcoded = AI_PLAN_CONFIG[planName] ?? AI_PLAN_CONFIG.Free;

  return {
    name: planName,
    hasAI: limits.hasAI,
    aiCredits: limits.aiCredits,
    hardStopAI: true,
    aiFeatures: hardcoded.aiFeatures,
  };
}

