-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Command Center Tables & RPCs
-- Adds workspace_entitlements, feature_flags tables, and admin RPCs for
-- credits/usage management, entitlements overrides, plan cloning.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. workspace_entitlements ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_entitlements (
  workspace_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id       UUID REFERENCES plans(id),
  overrides     JSONB NOT NULL DEFAULT '{}',
  effective_limits JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entitlements_admin_all" ON workspace_entitlements FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.role = 'ADMIN' OR profiles.is_super_admin = true)
  )
);

CREATE POLICY "entitlements_owner_read" ON workspace_entitlements FOR SELECT USING (
  workspace_id = auth.uid()
);

-- ── 2. feature_flags ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  rules       JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_read" ON feature_flags FOR SELECT USING (true);

CREATE POLICY "feature_flags_admin_write" ON feature_flags FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.role = 'ADMIN' OR profiles.is_super_admin = true)
  )
);

-- Seed default flags
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('ai_features', true, 'Enable AI-powered features globally'),
  ('social_scheduler', true, 'Enable social media scheduler'),
  ('voice_agent', true, 'Enable voice agent on marketing site'),
  ('email_warmup', true, 'Enable email warmup system'),
  ('apollo_search', true, 'Enable Apollo contact search'),
  ('bulk_import', true, 'Enable bulk lead imports'),
  ('advanced_analytics', false, 'Enable advanced analytics dashboard'),
  ('webhook_system', true, 'Enable webhook integrations')
ON CONFLICT (key) DO NOTHING;

-- ── 3. admin_grant_credits RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_workspace_id UUID,
  p_amount       INTEGER,
  p_admin_id     UUID,
  p_reason       TEXT DEFAULT 'Admin grant'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_total INTEGER;
  v_new_total INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT credits_total INTO v_old_total FROM profiles WHERE id = p_workspace_id;
  IF v_old_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Workspace not found');
  END IF;

  v_new_total := v_old_total + p_amount;
  UPDATE profiles SET credits_total = v_new_total WHERE id = p_workspace_id;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (p_admin_id, 'ADMIN_CREDITS_GRANTED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_total', v_old_total, 'granted', p_amount, 'new_total', v_new_total, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'message', format('Granted %s credits. New total: %s', p_amount, v_new_total),
    'old_total', v_old_total, 'new_total', v_new_total);
END;
$$;

-- ── 4. admin_adjust_credits_used RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_adjust_credits_used(
  p_workspace_id UUID,
  p_delta        INTEGER,
  p_admin_id     UUID,
  p_reason       TEXT DEFAULT 'Admin adjustment'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_used INTEGER;
  v_new_used INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT credits_used INTO v_old_used FROM profiles WHERE id = p_workspace_id;
  IF v_old_used IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Workspace not found');
  END IF;

  v_new_used := GREATEST(v_old_used + p_delta, 0);
  UPDATE profiles SET credits_used = v_new_used WHERE id = p_workspace_id;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (p_admin_id, 'ADMIN_CREDITS_ADJUSTED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_used', v_old_used, 'delta', p_delta, 'new_used', v_new_used, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'message', format('Adjusted credits used by %s. New used: %s', p_delta, v_new_used),
    'old_used', v_old_used, 'new_used', v_new_used);
END;
$$;

-- ── 5. admin_reset_monthly_usage RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_reset_monthly_usage(
  p_workspace_id UUID,
  p_admin_id     UUID,
  p_reason       TEXT DEFAULT 'Admin reset'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: super-admin required');
  END IF;

  v_month := to_char(now(), 'YYYY-MM');

  -- Reset workspace_usage_counters for current month
  UPDATE workspace_usage_counters
  SET emails_sent = 0, linkedin_actions = 0, ai_credits_used = 0, warmup_emails_sent = 0
  WHERE workspace_id = p_workspace_id AND month_key = v_month;

  -- Reset workspace_ai_usage for current month
  UPDATE workspace_ai_usage
  SET credits_used = 0, tokens_used = 0
  WHERE workspace_id = p_workspace_id AND month_year = v_month;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (p_admin_id, 'ADMIN_USAGE_RESET', 'workspace', p_workspace_id::text,
    jsonb_build_object('month', v_month, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'message', format('Monthly usage reset for %s', v_month));
END;
$$;

-- ── 6. admin_update_entitlements RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_update_entitlements(
  p_workspace_id UUID,
  p_overrides    JSONB,
  p_admin_id     UUID,
  p_reason       TEXT DEFAULT 'Admin override'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_plan_limits JSONB;
  v_effective JSONB;
  v_old_overrides JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  -- Get the user's current plan
  SELECT p.id, p.limits INTO v_plan_id, v_plan_limits
  FROM profiles pr
  JOIN plans p ON p.name = pr.plan
  WHERE pr.id = p_workspace_id
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    -- Try without join
    v_plan_limits := '{}'::jsonb;
  END IF;

  -- Merge plan limits with overrides (overrides win)
  v_effective := COALESCE(v_plan_limits, '{}'::jsonb) || p_overrides;

  -- Get old overrides for audit
  SELECT overrides INTO v_old_overrides FROM workspace_entitlements WHERE workspace_id = p_workspace_id;

  -- Upsert
  INSERT INTO workspace_entitlements (workspace_id, plan_id, overrides, effective_limits, updated_at)
  VALUES (p_workspace_id, v_plan_id, p_overrides, v_effective, now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id = COALESCE(v_plan_id, workspace_entitlements.plan_id),
    overrides = p_overrides,
    effective_limits = v_effective,
    updated_at = now();

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (p_admin_id, 'ADMIN_ENTITLEMENTS_UPDATED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_overrides', COALESCE(v_old_overrides, '{}'::jsonb), 'new_overrides', p_overrides, 'effective', v_effective, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Entitlements updated',
    'effective_limits', v_effective);
END;
$$;

-- ── 7. admin_clone_plan RPC ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_clone_plan(
  p_source_plan_id UUID,
  p_new_name       TEXT,
  p_new_key        TEXT,
  p_admin_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_source RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT * INTO v_source FROM plans WHERE id = p_source_plan_id;
  IF v_source IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Source plan not found');
  END IF;

  INSERT INTO plans (name, key, price, price_monthly_cents, currency, stripe_price_id, credits, description, features, is_active, limits, sort_order)
  VALUES (p_new_name, p_new_key, v_source.price, v_source.price_monthly_cents, v_source.currency, NULL,
    v_source.credits, v_source.description, v_source.features, false, v_source.limits,
    COALESCE(v_source.sort_order, 0) + 1)
  RETURNING id INTO v_new_id;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (p_admin_id, 'ADMIN_PLAN_CLONED', 'plan', v_new_id::text,
    jsonb_build_object('source_plan_id', p_source_plan_id, 'source_name', v_source.name, 'new_name', p_new_name, 'new_key', p_new_key)
  );

  RETURN jsonb_build_object('success', true, 'message', format('Plan "%s" cloned as "%s"', v_source.name, p_new_name), 'new_plan_id', v_new_id);
END;
$$;

-- ── 8. admin_update_feature_flag RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_update_feature_flag(
  p_key       TEXT,
  p_enabled   BOOLEAN,
  p_rules     JSONB DEFAULT NULL,
  p_admin_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_enabled BOOLEAN;
BEGIN
  IF p_admin_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT enabled INTO v_old_enabled FROM feature_flags WHERE key = p_key;

  UPDATE feature_flags SET
    enabled = p_enabled,
    rules = COALESCE(p_rules, rules),
    updated_at = now(),
    updated_by = p_admin_id
  WHERE key = p_key;

  IF NOT FOUND THEN
    INSERT INTO feature_flags (key, enabled, rules, updated_by)
    VALUES (p_key, p_enabled, COALESCE(p_rules, '{}'), p_admin_id);
    v_old_enabled := NULL;
  END IF;

  IF p_admin_id IS NOT NULL THEN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (p_admin_id, 'ADMIN_FEATURE_FLAG_UPDATED', 'feature_flag', p_key,
      jsonb_build_object('old_enabled', v_old_enabled, 'new_enabled', p_enabled, 'rules', COALESCE(p_rules, '{}'))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', format('Flag "%s" set to %s', p_key, p_enabled));
END;
$$;

-- ── 9. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_entitlements_plan ON workspace_entitlements(plan_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);
