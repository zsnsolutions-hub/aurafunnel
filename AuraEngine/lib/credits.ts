import type { SupabaseClient } from '@supabase/supabase-js';

// ── Credit costs per AI operation ──────────────────────────────────────────
export const CREDIT_COSTS: Record<string, number> = {
  email_sequence:        3,
  content_generation:    2,
  content_suggestions:   1,
  lead_research:         2,
  lead_scoring:          1,
  command_center:        2,
  dashboard_insights:    1,
  pipeline_strategy:     3,
  blog_content:          3,
  social_caption:        1,
  business_analysis:     2,
  workflow_optimization: 2,
  guest_post_pitch:      2,
  image_generation:      2,
  follow_up_questions:   1,
  batch_generation:      5,
};

// ── Tier limits (single source of truth) ───────────────────────────────────
export const TIER_LIMITS: Record<string, { credits: number; contacts: number; seats: number; emails: number; storage: number }> = {
  Starter:  { credits: 1000,  contacts: 1000,  seats: 1,  emails: 2000,  storage: 1000  },
  Growth:   { credits: 6000,  contacts: 10000, seats: 3,  emails: 15000, storage: 10000 },
  Scale:    { credits: 20000, contacts: 50000, seats: 10, emails: 40000, storage: 50000 },
};

// ── Backward-compat plan name resolver ─────────────────────────────────────
export function resolvePlanName(name: string): string {
  if (name === 'Professional') return 'Growth';
  if (name === 'Enterprise' || name === 'Business') return 'Scale';
  return name;
}

export function getPlanByName(name: string): PlanPackage | undefined {
  return PLANS.find(p => p.name === resolvePlanName(name));
}

export const ANNUAL_DISCOUNT = 0.15;

// ── Plan packages (single source of truth) ───────────────────────────────
export interface PlanPackage {
  name: string;
  price: number;
  annualPrice: number;
  credits: number;
  contacts: number;
  seats: number;
  emails: number;
  storage: number;
  features: string[];
  desc: string;
  popular?: boolean;
  cta: string;
  overage: { credits: number; contacts: number; emails: number };
  maxUsers?: number;
  extraSeatPrice?: number;
  warmup?: string;
}

export const PLANS: PlanPackage[] = [
  {
    name: 'Starter',
    price: 29,
    annualPrice: Math.round(29 * 12 * (1 - ANNUAL_DISCOUNT) / 12),
    ...TIER_LIMITS.Starter,
    desc: 'For solo founders validating outbound.',
    cta: 'Start Free Trial',
    overage: { credits: 0.08, contacts: 0.05, emails: 0.02 },
    features: ['Multi-channel sequences', 'Basic automation', 'Warm-up guidance (manual)', 'Standard support'],
    maxUsers: 3,
    extraSeatPrice: 15,
    warmup: 'Guidance',
  },
  {
    name: 'Growth',
    price: 79,
    annualPrice: Math.round(79 * 12 * (1 - ANNUAL_DISCOUNT) / 12),
    ...TIER_LIMITS.Growth,
    desc: 'For teams building predictable pipeline.',
    popular: true,
    cta: 'Start Growing Today',
    overage: { credits: 0.06, contacts: 0.03, emails: 0.015 },
    features: ['Multi-channel sequences', 'AI content (Gemini)', 'Enrichment', 'Advanced automation', 'Analytics', 'Automated warm-up + ramp-up'],
    maxUsers: 10,
    extraSeatPrice: 12,
    warmup: 'Automated',
  },
  {
    name: 'Scale',
    price: 199,
    annualPrice: Math.round(199 * 12 * (1 - ANNUAL_DISCOUNT) / 12),
    ...TIER_LIMITS.Scale,
    desc: 'For high-volume outbound teams.',
    cta: 'Upgrade to Scale',
    overage: { credits: 0.04, contacts: 0.02, emails: 0.01 },
    features: ['Multi-channel sequences', 'AI content (Gemini)', 'Enrichment', 'Advanced automation', 'Advanced analytics', 'API & Webhooks', 'Advanced warm-up + inbox health'],
    maxUsers: undefined,
    extraSeatPrice: 8,
    warmup: 'Advanced + Health',
  },
];

// ── Helper: consume credits via RPC ────────────────────────────────────────
export async function consumeCredits(
  supabase: SupabaseClient,
  amount: number,
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('consume_credits', { amount });
  if (error) return { success: false, message: error.message };
  return data as { success: boolean; message: string };
}
