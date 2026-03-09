// ── AI Credit Limits — Single Source of Truth ─────────────────────────────────
//
// Every credit reference in the system MUST read from this file.
// Credits are per workspace per month. Hard stop when credits reach 0.
// ──────────────────────────────────────────────────────────────────────────────

export const CREDIT_LIMITS = {
  free: 200,
  starter: 2_000,
  growth: 10_000,
  scale: 40_000,
} as const;

export type PlanKey = keyof typeof CREDIT_LIMITS;

/** Resolve a display plan name to a CREDIT_LIMITS key. */
export function planNameToKey(name: string): PlanKey {
  const n = name.toLowerCase();
  if (n === 'professional') return 'growth';
  if (n === 'enterprise' || n === 'business') return 'scale';
  if (n in CREDIT_LIMITS) return n as PlanKey;
  return 'free';
}

/** Get the AI credit limit for a plan by display name. */
export function getAiCreditLimit(planName: string): number {
  return CREDIT_LIMITS[planNameToKey(planName)];
}

// ── Credit Add-on Packages ──────────────────────────────────────────────────

export interface CreditPackage {
  credits: number;
  priceCents: number;
  label: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { credits: 1_000,  priceCents: 1_000,  label: '1,000 credits' },
  { credits: 5_000,  priceCents: 4_000,  label: '5,000 credits' },
  { credits: 20_000, priceCents: 12_000, label: '20,000 credits' },
];
