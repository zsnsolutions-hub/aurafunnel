-- ── AI Credit System Refactor Migration ──────────────────────────────────────
-- Creates tables for granular credit usage tracking and credit purchases.
-- Updates plan limits to new unified credit values.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. AI Credit Usage Log (per-operation analytics)
CREATE TABLE IF NOT EXISTS ai_credit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  credits_used INTEGER NOT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_usage_workspace
  ON ai_credit_usage(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_credit_usage_operation
  ON ai_credit_usage(operation);

-- RLS
ALTER TABLE ai_credit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit usage"
  ON ai_credit_usage FOR SELECT
  USING (workspace_id = auth.uid());

CREATE POLICY "System can insert credit usage"
  ON ai_credit_usage FOR INSERT
  WITH CHECK (workspace_id = auth.uid());


-- 2. Credit Purchases (add-on credit packages)
CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credits_added INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_workspace
  ON credit_purchases(workspace_id, created_at DESC);

-- RLS
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON credit_purchases FOR SELECT
  USING (user_id = auth.uid());


-- 3. Update workspace_ai_usage credits_limit for existing rows
-- to reflect new unified credit values
UPDATE workspace_ai_usage
SET credits_limit = CASE
  WHEN credits_limit = 0 THEN 200       -- Free: was 0, now 200
  WHEN credits_limit = 2000 THEN 10000  -- Growth: was 2000, now 10000
  WHEN credits_limit = 8000 THEN 40000  -- Scale: was 8000, now 40000
  ELSE credits_limit
END
WHERE credits_limit IN (0, 2000, 8000);


-- 4. Update plans table limits JSONB to reflect new credit values
UPDATE plans
SET limits = jsonb_set(
  jsonb_set(
    limits,
    '{aiCredits}',
    CASE key
      WHEN 'free' THEN '200'::jsonb
      WHEN 'starter' THEN '2000'::jsonb
      WHEN 'growth' THEN '10000'::jsonb
      WHEN 'scale' THEN '40000'::jsonb
      ELSE limits->'aiCreditsMonthly'
    END
  ),
  '{aiCreditsMonthly}',
  CASE key
    WHEN 'free' THEN '200'::jsonb
    WHEN 'starter' THEN '2000'::jsonb
    WHEN 'growth' THEN '10000'::jsonb
    WHEN 'scale' THEN '40000'::jsonb
    ELSE limits->'aiCreditsMonthly'
  END
),
credits = CASE key
  WHEN 'free' THEN 200
  WHEN 'starter' THEN 2000
  WHEN 'growth' THEN 10000
  WHEN 'scale' THEN 40000
  ELSE credits
END
WHERE key IN ('free', 'starter', 'growth', 'scale');

-- Also set hasAI = true for all plans (all plans now have AI)
UPDATE plans
SET limits = jsonb_set(limits, '{hasAI}', 'true'::jsonb)
WHERE key IN ('free', 'starter', 'growth', 'scale');
