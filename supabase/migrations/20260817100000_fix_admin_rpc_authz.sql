-- ============================================================================
-- 20260817100000_fix_admin_rpc_authz.sql
-- SECURITY P0 fix: admin_* RPCs authorized on a caller-supplied p_admin_id and
-- were EXECUTE-granted to PUBLIC/anon, so any anonymous/authenticated actor could
-- grant credits, change plans, override entitlements, or flip global feature
-- flags by passing a (publicly-readable) admin UUID.
--
-- Fix: authorize on auth.uid() (the JWT caller) instead of the p_admin_id
-- parameter; attribute audit rows to auth.uid(); keep p_admin_id in the signature
-- for client compatibility but ignore it; and REVOKE EXECUTE from PUBLIC/anon
-- (admins invoke these as the 'authenticated' role and are gated inside each fn).
-- Function bodies are otherwise verbatim from pg_get_functiondef.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_adjust_credits_used(p_workspace_id uuid, p_delta integer, p_admin_id uuid, p_reason text DEFAULT 'Admin adjustment'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_used INTEGER;
  v_new_used INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT credits_used INTO v_old_used FROM profiles WHERE id = p_workspace_id;
  IF v_old_used IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Workspace not found');
  END IF;

  v_new_used := GREATEST(v_old_used + p_delta, 0);
  UPDATE profiles SET credits_used = v_new_used WHERE id = p_workspace_id;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(), 'ADMIN_CREDITS_ADJUSTED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_used', v_old_used, 'delta', p_delta, 'new_used', v_new_used, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', format('Adjusted credits used by %s. New used: %s', p_delta, v_new_used),
    'old_used', v_old_used, 'new_used', v_new_used);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_change_user_plan(p_target_user_id uuid, p_new_plan_name text, p_admin_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_plan TEXT;
  v_sub_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
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
  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(),
    'admin_change_plan',
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'old_plan', COALESCE(v_old_plan, 'none'),
      'new_plan', p_new_plan_name,
      'reason', COALESCE(p_reason, 'Admin override'),
      'target_user_id', p_target_user_id::text
    ));

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan changed from %s to %s', COALESCE(v_old_plan, 'none'), p_new_plan_name),
    'old_plan', COALESCE(v_old_plan, 'none'),
    'new_plan', p_new_plan_name
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_clone_plan(p_source_plan_id uuid, p_new_name text, p_new_key text, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id UUID;
  v_source RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'ADMIN' OR is_super_admin = true)
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

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(), 'ADMIN_PLAN_CLONED', 'plan', v_new_id::text,
    jsonb_build_object('source_plan_id', p_source_plan_id, 'source_name', v_source.name, 'new_name', p_new_name, 'new_key', p_new_key));

  RETURN jsonb_build_object('success', true, 'message', format('Plan "%s" cloned as "%s"', v_source.name, p_new_name), 'new_plan_id', v_new_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_credits(p_workspace_id uuid, p_amount integer, p_admin_id uuid, p_reason text DEFAULT 'Admin grant'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_total INTEGER;
  v_new_total INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT credits_total INTO v_old_total FROM profiles WHERE id = p_workspace_id;
  IF v_old_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Workspace not found');
  END IF;

  v_new_total := v_old_total + p_amount;
  UPDATE profiles SET credits_total = v_new_total WHERE id = p_workspace_id;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(), 'ADMIN_CREDITS_GRANTED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_total', v_old_total, 'granted', p_amount, 'new_total', v_new_total, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', format('Granted %s credits. New total: %s', p_amount, v_new_total),
    'old_total', v_old_total, 'new_total', v_new_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_monthly_usage(p_workspace_id uuid, p_admin_id uuid, p_reason text DEFAULT 'Admin reset'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
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

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(), 'ADMIN_USAGE_RESET', 'workspace', p_workspace_id::text,
    jsonb_build_object('month', v_month, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', format('Monthly usage reset for %s', v_month));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_entitlements(p_workspace_id uuid, p_overrides jsonb, p_admin_id uuid, p_reason text DEFAULT 'Admin override'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id UUID;
  v_plan_limits JSONB;
  v_effective JSONB;
  v_old_overrides JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'ADMIN' OR is_super_admin = true)
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

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(), 'ADMIN_ENTITLEMENTS_UPDATED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_overrides', COALESCE(v_old_overrides, '{}'::jsonb), 'new_overrides', p_overrides, 'effective', v_effective, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', 'Entitlements updated',
    'effective_limits', v_effective);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_feature_flag(p_key text, p_enabled boolean, p_rules jsonb DEFAULT NULL::jsonb, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT enabled INTO v_old_enabled FROM feature_flags WHERE key = p_key;

  UPDATE feature_flags SET
    enabled = p_enabled,
    rules = COALESCE(p_rules, rules),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE key = p_key;

  IF NOT FOUND THEN
    INSERT INTO feature_flags (key, enabled, rules, updated_by)
    VALUES (p_key, p_enabled, COALESCE(p_rules, '{}'), auth.uid());
    v_old_enabled := NULL;
  END IF;

  IF true THEN
    insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(), 'ADMIN_FEATURE_FLAG_UPDATED', 'feature_flag', p_key,
      jsonb_build_object('old_enabled', v_old_enabled, 'new_enabled', p_enabled, 'rules', COALESCE(p_rules, '{}')));
  END IF;

  RETURN jsonb_build_object('success', true, 'message', format('Flag "%s" set to %s', p_key, p_enabled));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_plan(p_plan_id uuid, p_admin_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_name TEXT;
  v_old_data JSONB;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
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
  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (auth.uid(), auth.uid(),
    'admin_update_plan',
    'plan',
    p_plan_id::text,
    jsonb_build_object(
      'plan_name', v_plan_name,
      'updates', p_updates,
      'previous', v_old_data
    ));

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan "%s" updated successfully', v_plan_name)
  );
END;
$function$;


-- Lock down execution: remove PUBLIC/anon, keep authenticated + service_role.
REVOKE ALL ON FUNCTION public.admin_adjust_credits_used(p_workspace_id uuid, p_delta integer, p_admin_id uuid, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_adjust_credits_used(p_workspace_id uuid, p_delta integer, p_admin_id uuid, p_reason text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits_used(p_workspace_id uuid, p_delta integer, p_admin_id uuid, p_reason text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_change_user_plan(p_target_user_id uuid, p_new_plan_name text, p_admin_id uuid, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_change_user_plan(p_target_user_id uuid, p_new_plan_name text, p_admin_id uuid, p_reason text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_change_user_plan(p_target_user_id uuid, p_new_plan_name text, p_admin_id uuid, p_reason text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_clone_plan(p_source_plan_id uuid, p_new_name text, p_new_key text, p_admin_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clone_plan(p_source_plan_id uuid, p_new_name text, p_new_key text, p_admin_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_clone_plan(p_source_plan_id uuid, p_new_name text, p_new_key text, p_admin_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_grant_credits(p_workspace_id uuid, p_amount integer, p_admin_id uuid, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_credits(p_workspace_id uuid, p_amount integer, p_admin_id uuid, p_reason text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(p_workspace_id uuid, p_amount integer, p_admin_id uuid, p_reason text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_reset_monthly_usage(p_workspace_id uuid, p_admin_id uuid, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_monthly_usage(p_workspace_id uuid, p_admin_id uuid, p_reason text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_monthly_usage(p_workspace_id uuid, p_admin_id uuid, p_reason text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_entitlements(p_workspace_id uuid, p_overrides jsonb, p_admin_id uuid, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_entitlements(p_workspace_id uuid, p_overrides jsonb, p_admin_id uuid, p_reason text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_entitlements(p_workspace_id uuid, p_overrides jsonb, p_admin_id uuid, p_reason text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_feature_flag(p_key text, p_enabled boolean, p_rules jsonb, p_admin_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_feature_flag(p_key text, p_enabled boolean, p_rules jsonb, p_admin_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_feature_flag(p_key text, p_enabled boolean, p_rules jsonb, p_admin_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_plan(p_plan_id uuid, p_admin_id uuid, p_updates jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_plan(p_plan_id uuid, p_admin_id uuid, p_updates jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_plan(p_plan_id uuid, p_admin_id uuid, p_updates jsonb) TO authenticated, service_role;
