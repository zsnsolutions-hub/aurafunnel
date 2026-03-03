-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Plans Admin Tooling
-- Adds columns to `plans` for DB-driven limits, pricing metadata, and
-- creates the `admin_change_user_plan` SECURITY DEFINER RPC for atomic
-- plan changes from the admin panel.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add new columns to plans ─────────────────────────────────────────────

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS key            TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency        TEXT NOT NULL DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS limits          JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── 2. Seed default limits for existing plans ───────────────────────────────

UPDATE plans SET
  key = 'starter',
  price_monthly_cents = 2900,
  sort_order = 1,
  limits = jsonb_build_object(
    'credits', 1000,
    'contacts', 1000,
    'seats', 1,
    'emails', 2000,
    'storage', 1000,
    'maxInboxes', 1,
    'emailsPerDayPerInbox', 40,
    'emailsPerMonth', 1000,
    'linkedInPerDay', 20,
    'linkedInPerMonth', 600,
    'aiCreditsMonthly', 0,
    'hasAI', false
  )
WHERE lower(name) = 'starter' AND (key IS NULL OR key = 'starter');

UPDATE plans SET
  key = 'growth',
  price_monthly_cents = 7900,
  sort_order = 2,
  limits = jsonb_build_object(
    'credits', 6000,
    'contacts', 10000,
    'seats', 3,
    'emails', 15000,
    'storage', 10000,
    'maxInboxes', 5,
    'emailsPerDayPerInbox', 60,
    'emailsPerMonth', 10000,
    'linkedInPerDay', 40,
    'linkedInPerMonth', 1200,
    'aiCreditsMonthly', 2000,
    'hasAI', true
  )
WHERE lower(name) = 'growth' AND (key IS NULL OR key = 'growth');

UPDATE plans SET
  key = 'scale',
  price_monthly_cents = 19900,
  sort_order = 3,
  limits = jsonb_build_object(
    'credits', 20000,
    'contacts', 50000,
    'seats', 10,
    'emails', 40000,
    'storage', 50000,
    'maxInboxes', 15,
    'emailsPerDayPerInbox', 80,
    'emailsPerMonth', 50000,
    'linkedInPerDay', 100,
    'linkedInPerMonth', 3000,
    'aiCreditsMonthly', 8000,
    'hasAI', true
  )
WHERE lower(name) = 'scale' AND (key IS NULL OR key = 'scale');

-- ── 3. RLS for plans (public read, admin write) ────────────────────────────

-- Drop existing policies if any to avoid conflicts
DO $$ BEGIN
  DROP POLICY IF EXISTS "plans_read" ON plans;
  DROP POLICY IF EXISTS "plans_admin_write" ON plans;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_read" ON plans FOR SELECT USING (true);

CREATE POLICY "plans_admin_write" ON plans FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.role = 'ADMIN' OR profiles.is_super_admin = true)
  )
);

-- ── 4. admin_change_user_plan RPC ───────────────────────────────────────────
-- Atomically updates both subscriptions and profiles for a user.
-- Writes to audit_logs. Caller must be admin.

CREATE OR REPLACE FUNCTION admin_change_user_plan(
  p_target_user_id UUID,
  p_new_plan_name  TEXT,
  p_admin_id       UUID,
  p_reason         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_plan TEXT;
  v_sub_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_admin_id
      AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: admin role required');
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  -- Verify new plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE name = p_new_plan_name AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Plan not found or inactive');
  END IF;

  -- Get current plan from profiles
  SELECT plan INTO v_old_plan FROM profiles WHERE id = p_target_user_id;

  -- Update profiles.plan
  UPDATE profiles
  SET plan = p_new_plan_name
  WHERE id = p_target_user_id;

  -- Upsert subscription row
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE user_id = p_target_user_id
  LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET plan = p_new_plan_name,
        plan_name = p_new_plan_name
    WHERE id = v_sub_id;
  ELSE
    INSERT INTO subscriptions (user_id, plan, plan_name, status, current_period_end)
    VALUES (
      p_target_user_id,
      p_new_plan_name,
      p_new_plan_name,
      'active',
      (now() + interval '30 days')::text
    );
  END IF;

  -- Write audit log
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (
    p_admin_id,
    'admin_change_plan',
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'old_plan', COALESCE(v_old_plan, 'none'),
      'new_plan', p_new_plan_name,
      'reason', COALESCE(p_reason, 'Admin override'),
      'target_user_id', p_target_user_id::text
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan changed from %s to %s', COALESCE(v_old_plan, 'none'), p_new_plan_name),
    'old_plan', COALESCE(v_old_plan, 'none'),
    'new_plan', p_new_plan_name
  );
END;
$$;

-- ── 5. admin_update_plan RPC ────────────────────────────────────────────────
-- Updates a plan's fields atomically. Writes to audit_logs.

CREATE OR REPLACE FUNCTION admin_update_plan(
  p_plan_id        UUID,
  p_admin_id       UUID,
  p_updates        JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_name TEXT;
  v_old_data JSONB;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_admin_id
      AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: admin role required');
  END IF;

  -- Get current plan state for audit
  SELECT name, to_jsonb(plans.*) INTO v_plan_name, v_old_data
  FROM plans WHERE id = p_plan_id;

  IF v_plan_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Plan not found');
  END IF;

  -- Apply updates dynamically
  UPDATE plans SET
    name               = COALESCE((p_updates->>'name')::text, name),
    price              = COALESCE((p_updates->>'price')::text, price),
    price_monthly_cents = COALESCE((p_updates->>'price_monthly_cents')::integer, price_monthly_cents),
    credits            = COALESCE((p_updates->>'credits')::integer, credits),
    description        = COALESCE((p_updates->>'description')::text, description),
    features           = COALESCE((p_updates->'features')::text[], features),
    limits             = COALESCE((p_updates->'limits')::jsonb, limits),
    is_active          = COALESCE((p_updates->>'is_active')::boolean, is_active),
    stripe_price_id    = COALESCE((p_updates->>'stripe_price_id')::text, stripe_price_id),
    sort_order         = COALESCE((p_updates->>'sort_order')::integer, sort_order),
    updated_at         = now()
  WHERE id = p_plan_id;

  -- Audit log
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (
    p_admin_id,
    'admin_update_plan',
    'plan',
    p_plan_id::text,
    jsonb_build_object(
      'plan_name', v_plan_name,
      'updates', p_updates,
      'previous', v_old_data
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan "%s" updated successfully', v_plan_name)
  );
END;
$$;

-- ── 6. Index for plan lookups ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_plans_key ON plans (key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans (is_active, sort_order);
