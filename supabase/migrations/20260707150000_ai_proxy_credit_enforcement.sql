-- ============================================================================
-- Server-side AI credit enforcement + usage tracking for gemini-proxy
-- ============================================================================
-- Problem: AI credits were only ever counted client-side (lib/credits.ts ->
-- consumeCredits -> increment_ai_usage). The gemini-proxy edge function checked
-- auth + a rate limit but NOT credits, so a modified client could call the proxy
-- directly and get unlimited free AI on our Gemini bill.
--
-- Why we don't just charge in the proxy: the product's credit model is
-- ACTION-based, not per-Gemini-call. Some paid actions (e.g. clearing the
-- business profile) charge credits with no AI call; batch actions charge one
-- flat cost while making their own AI call underneath. Charging per-Gemini-call
-- in the proxy would double-charge batches and stop charging non-AI actions.
--
-- Design: keep the client's action-based billing (workspace_ai_usage) as the
-- system of record, and add an INDEPENDENT server-side monthly quota that the
-- proxy enforces. Because the client always charges BEFORE it calls the proxy,
-- an honest user's client counter is always >= this server counter, so honest
-- users are blocked in-app first and never hit this ceiling — it only stops a
-- bypassing/modified client. The ai_proxy_usage table also gives us a reliable,
-- server-verified record of actual AI consumption per workspace for tracking.
--
-- Idempotent.
-- ============================================================================

-- ─── 1. Server-verified monthly AI usage ledger ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_proxy_usage (
  workspace_id uuid    NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  month_year   text    NOT NULL,                       -- 'YYYY-MM' (UTC)
  credits_used integer NOT NULL DEFAULT 0,             -- sum of per-call costs
  call_count   integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, month_year)
);

ALTER TABLE public.ai_proxy_usage ENABLE ROW LEVEL SECURITY;

-- Owners/members can read their own workspace's server-side usage (for tracking
-- UIs). Writes happen only via the SECURITY DEFINER RPC below (service role).
DO $$ BEGIN
  CREATE POLICY "Members read own proxy usage"
    ON public.ai_proxy_usage FOR SELECT
    USING (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Atomic check-and-consume, callable ONLY by the proxy (service role) ──
-- Takes an explicit p_user_id: the proxy has already verified the caller's JWT
-- and passes the authenticated user id. EXECUTE is restricted to service_role
-- so end users cannot call it to charge someone else / themselves arbitrarily.
CREATE OR REPLACE FUNCTION public.enforce_ai_proxy_quota(
  p_user_id   uuid,
  p_operation text,
  p_kind      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws    uuid;
  v_plan  text;
  v_key   text;
  v_limit integer;
  v_cost  integer;
  v_month text;
  v_used  integer;
BEGIN
  -- Resolve workspace the SAME way the client does (lib/credits.ts:
  -- first workspace_members row for the user, ordered by joined_at).
  SELECT workspace_id INTO v_ws
  FROM public.workspace_members
  WHERE user_id = p_user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_ws IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_workspace', 'cost', 0);
  END IF;

  -- Resolve plan -> monthly AI credit limit (mirrors config/creditLimits.ts).
  SELECT plan INTO v_plan FROM public.profiles WHERE id = p_user_id;
  v_key := lower(coalesce(v_plan, 'free'));
  v_key := CASE v_key
             WHEN 'professional'            THEN 'growth'
             WHEN 'enterprise'              THEN 'scale'
             WHEN 'business'                THEN 'scale'
             WHEN 'starter'                 THEN 'starter'
             WHEN 'growth'                  THEN 'growth'
             WHEN 'scale'                   THEN 'scale'
             WHEN 'free'                    THEN 'free'
             ELSE 'free'
           END;
  v_limit := CASE v_key
               WHEN 'starter' THEN 2000
               WHEN 'growth'  THEN 10000
               WHEN 'scale'   THEN 40000
               ELSE 200                       -- free
             END;

  -- Per-operation cost (mirrors config/aiCreditCosts.ts). Unknown/absent
  -- operation falls back to a per-kind default so a client that sends no
  -- operation label is still charged (never free).
  v_cost := CASE p_operation
              WHEN 'email_generation'         THEN 2
              WHEN 'email_sequence'           THEN 3
              WHEN 'content_generation'       THEN 2
              WHEN 'content_suggestions'      THEN 1
              WHEN 'blog_generation'          THEN 5
              WHEN 'blog_content'             THEN 5
              WHEN 'social_caption'           THEN 1
              WHEN 'guest_post_pitch'         THEN 2
              WHEN 'image_generation'         THEN 3
              WHEN 'lead_research'            THEN 2
              WHEN 'lead_scoring'             THEN 1
              WHEN 'business_analysis'        THEN 5
              WHEN 'profile_field_generation' THEN 1
              WHEN 'pipeline_strategy'        THEN 3
              WHEN 'workflow_optimization'    THEN 2
              WHEN 'command_center'           THEN 2
              WHEN 'dashboard_insights'       THEN 1
              WHEN 'batch_generation'         THEN 5
              WHEN 'follow_up_questions'      THEN 1
              ELSE CASE WHEN p_kind = 'images' THEN 3 ELSE 2 END
            END;

  v_month := to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM');

  -- Ensure the row exists, then lock it for an atomic check-and-increment.
  INSERT INTO public.ai_proxy_usage (workspace_id, month_year)
  VALUES (v_ws, v_month)
  ON CONFLICT (workspace_id, month_year) DO NOTHING;

  SELECT credits_used INTO v_used
  FROM public.ai_proxy_usage
  WHERE workspace_id = v_ws AND month_year = v_month
  FOR UPDATE;

  IF v_used + v_cost > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_credits',
      'cost', v_cost, 'limit', v_limit, 'used', v_used,
      'remaining', GREATEST(v_limit - v_used, 0)
    );
  END IF;

  UPDATE public.ai_proxy_usage
  SET credits_used = credits_used + v_cost,
      call_count   = call_count + 1,
      last_used_at = now(),
      updated_at   = now()
  WHERE workspace_id = v_ws AND month_year = v_month;

  RETURN jsonb_build_object(
    'allowed', true, 'cost', v_cost, 'limit', v_limit,
    'used', v_used + v_cost,
    'remaining', GREATEST(v_limit - (v_used + v_cost), 0)
  );
END;
$$;

-- Only the proxy (service role) may invoke this — never end users directly.
REVOKE ALL ON FUNCTION public.enforce_ai_proxy_quota(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_ai_proxy_quota(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_ai_proxy_quota(uuid, text, text) TO service_role;
