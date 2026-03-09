import { supabase } from './supabase';

// ── Stripe Checkout & Portal — Client-side API ──────────────────────────────
//
// All Stripe API calls go through the billing-checkout edge function.
// The frontend only redirects to Stripe-hosted pages — no card data handled.
// ──────────────────────────────────────────────────────────────────────────────

/** Fetch publishable key from config_settings (fallback to env). */
export async function getStripePublishableKey(): Promise<string> {
  const envKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (envKey) return envKey;

  const { data } = await supabase
    .from('config_settings')
    .select('value')
    .eq('key', 'stripe_api_key')
    .maybeSingle();

  return data?.value || '';
}

/** Create a Stripe Checkout Session for a plan subscription. Redirects user to Stripe. */
export async function createSubscriptionCheckout(params: {
  planName: string;
  stripePriceId: string;
  billingInterval: 'monthly' | 'annual';
}): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke('billing-checkout', {
    body: {
      action: 'create_checkout_session',
      plan_name: params.planName,
      stripe_price_id: params.stripePriceId,
      billing_interval: params.billingInterval,
    },
  });

  if (error) throw new Error(error.message || 'Failed to create checkout session');
  if (!data?.url) throw new Error('No checkout URL returned');
  return { url: data.url };
}

/** Create a Stripe Checkout Session for a one-time credit package purchase. */
export async function createCreditCheckout(params: {
  credits: number;
  priceCents: number;
  label: string;
}): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke('billing-checkout', {
    body: {
      action: 'create_credit_checkout',
      credits: params.credits,
      price_cents: params.priceCents,
      label: params.label,
    },
  });

  if (error) throw new Error(error.message || 'Failed to create credit checkout');
  if (!data?.url) throw new Error('No checkout URL returned');
  return { url: data.url };
}

/** Open the Stripe Customer Portal for subscription management. */
export async function openCustomerPortal(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke('billing-checkout', {
    body: { action: 'create_portal_session' },
  });

  if (error) throw new Error(error.message || 'Failed to open billing portal');
  if (!data?.url) throw new Error('No portal URL returned');
  return { url: data.url };
}

// ── Legacy compat ────────────────────────────────────────────────────────────

/** @deprecated Use getStripePublishableKey instead */
export const getStripeConfig = getStripePublishableKey;
