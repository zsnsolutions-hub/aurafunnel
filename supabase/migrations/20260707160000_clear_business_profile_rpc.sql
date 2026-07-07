-- ============================================================================
-- Atomic, server-side "Clear & start over" for the business profile
-- ============================================================================
-- "Clear business profile" is the only credit-charged action that is NOT an AI
-- call, so it wasn't covered by the gemini-proxy quota. Today the client does it
-- in two client-side steps: consumeCredits('clear_business_profile') (+2) THEN
-- profiles.update({ businessProfile: null }). Problems:
--   * not atomic — if the wipe fails after the charge, the user paid for nothing
--     (or a modified client can wipe without charging).
--
-- This RPC does both in one transaction, keyed off auth.uid() (a user can only
-- ever clear their OWN profile), charging the same workspace_ai_usage counter
-- the client billing uses. Note: this is a soft product gate — a user owns their
-- profile and could null the column via normal editing — but this makes the
-- feature's charge reliable and all-or-nothing.
--
-- Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_business_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_ws    uuid;
  v_plan  text;
  v_key   text;
  v_limit integer;
  v_cost  integer := 2;   -- mirrors config/aiCreditCosts.ts clear_business_profile
  v_month text;
  v_used  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Resolve workspace like the client (lib/credits.ts): first membership row.
  SELECT workspace_id INTO v_ws
  FROM public.workspace_members
  WHERE user_id = v_uid
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'No workspace found for this account.' USING ERRCODE = 'P0001';
  END IF;

  -- Plan -> monthly credit limit (mirrors config/creditLimits.ts).
  SELECT plan INTO v_plan FROM public.profiles WHERE id = v_uid;
  v_key := lower(coalesce(v_plan, 'free'));
  v_key := CASE v_key
             WHEN 'professional' THEN 'growth'
             WHEN 'enterprise'   THEN 'scale'
             WHEN 'business'     THEN 'scale'
             WHEN 'starter'      THEN 'starter'
             WHEN 'growth'       THEN 'growth'
             WHEN 'scale'        THEN 'scale'
             WHEN 'free'         THEN 'free'
             ELSE 'free'
           END;
  v_limit := CASE v_key
               WHEN 'starter' THEN 2000
               WHEN 'growth'  THEN 10000
               WHEN 'scale'   THEN 40000
               ELSE 200
             END;

  v_month := to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM');

  -- Atomic check-and-charge against the client billing counter.
  INSERT INTO public.workspace_ai_usage (workspace_id, month_year, credits_used, tokens_used, credits_limit, updated_at)
  VALUES (v_ws, v_month, 0, 0, v_limit, now())
  ON CONFLICT (workspace_id, month_year) DO NOTHING;

  SELECT credits_used INTO v_used
  FROM public.workspace_ai_usage
  WHERE workspace_id = v_ws AND month_year = v_month
  FOR UPDATE;

  IF v_used + v_cost > v_limit THEN
    RAISE EXCEPTION 'Insufficient credits (% remaining, % needed).',
      GREATEST(v_limit - v_used, 0), v_cost USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.workspace_ai_usage
  SET credits_used  = credits_used + v_cost,
      credits_limit = v_limit,
      updated_at    = now()
  WHERE workspace_id = v_ws AND month_year = v_month;

  INSERT INTO public.ai_credit_usage (workspace_id, operation, credits_used)
  VALUES (v_ws, 'clear_business_profile', v_cost);

  -- The wipe — atomic with the charge, so both commit or both roll back.
  UPDATE public.profiles SET "businessProfile" = NULL WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'charged', v_cost,
    'remaining', GREATEST(v_limit - (v_used + v_cost), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_business_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_business_profile() TO authenticated;
