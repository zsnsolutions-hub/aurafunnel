-- ── Stripe Billing Columns ────────────────────────────────────────────────────
-- Adds Stripe identifiers needed for real subscription billing and credit purchases.
-- ──────────────────────────────────────────────────────────────────────────────

-- subscriptions: store Stripe subscription identifiers
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;

-- profiles: store Stripe customer ID for quick checkout session creation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- plans: store annual Stripe Price ID separately
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id_annual TEXT;

-- Indexes for webhook lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_plans_stripe_price_id
  ON plans(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_plans_stripe_price_id_annual
  ON plans(stripe_price_id_annual);
