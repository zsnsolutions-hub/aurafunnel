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
export const TIER_LIMITS: Record<string, { credits: number; leads: number; tokens: number; emails: number; storage: number }> = {
  Starter:      { credits: 500,    leads: 1000,   tokens: 100000,  emails: 500,   storage: 5000   },
  Professional: { credits: 5000,   leads: 5000,   tokens: 500000,  emails: 2500,  storage: 25000  },
  Enterprise:   { credits: 100000, leads: 100000, tokens: 1000000, emails: 50000, storage: 100000 },
};

// ── Plan packages (single source of truth) ───────────────────────────────
export interface PlanPackage {
  name: string;
  price: number;
  credits: number;
  leads: number;
  emails: number;
  storage: number;
  features: string[];
  desc: string;
}

export const PLANS: PlanPackage[] = [
  {
    name: 'Starter',
    price: 49,
    ...TIER_LIMITS.Starter,
    desc: 'Perfect for solo founders and small sales teams getting started.',
    features: ['Basic AI scoring', 'Email templates', 'Email outreach', 'Basic analytics', '5 integrations', 'Standard support'],
  },
  {
    name: 'Professional',
    price: 149,
    ...TIER_LIMITS.Professional,
    desc: 'For growing teams that need scale, precision, and multi-channel outreach.',
    features: ['Advanced AI models', 'Custom templates', 'Multi-channel outreach', 'Intent detection', 'Advanced analytics', '15 integrations', 'Team collaboration', 'Priority support'],
  },
  {
    name: 'Enterprise',
    price: 499,
    ...TIER_LIMITS.Enterprise,
    desc: 'Dedicated support, custom AI models, and infrastructure for large companies.',
    features: ['Custom AI training', 'White-label', 'Unlimited integrations', 'Dedicated CSM', 'SLA guarantee', 'API access', 'Custom workflows', 'SSO & audit logs'],
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
