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

-- ── Set Stripe live price IDs ────────────────────────────────────────────────

-- Starter
UPDATE plans SET
  stripe_price_id = 'price_1T8Z6nLugYH9PHutI2ZVFgW1',
  stripe_price_id_annual = 'price_1T938VLugYH9PHutKGfR0VGP'
WHERE name = 'Starter';

-- Growth
UPDATE plans SET
  stripe_price_id = 'price_1T93BcLugYH9PHut31KENMNc',
  stripe_price_id_annual = 'price_1T93BcLugYH9PHut9zoqhoVZ'
WHERE name = 'Growth';

-- Scale
UPDATE plans SET
  stripe_price_id = 'price_1T97heLugYH9PHutdRXdncm9',
  stripe_price_id_annual = 'price_1T97zgLugYH9PHut35AcQhda'
WHERE name = 'Scale';
