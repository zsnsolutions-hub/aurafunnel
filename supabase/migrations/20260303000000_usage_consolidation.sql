-- ============================================================================
-- Usage Consolidation: Single Authoritative Counter System
--
-- Introduces:
--   1. usage_events — idempotency log for all usage writes
--   2. increment_usage() — single RPC entry point for all usage increments
--   3. get_workspace_daily_usage() — read today's counters
--   4. Deprecation comment on outbound_usage
--
-- workspace_usage_counters becomes the sole source of truth.
-- outbound_usage is deprecated (writes stopped, table kept for 30 days).
-- ============================================================================

-- ── 1. usage_events (idempotency log) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id  text NOT NULL UNIQUE,
  workspace_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type       text NOT NULL CHECK (event_type IN ('email_sent','linkedin_action','ai_credit','warmup_sent')),
  quantity         integer NOT NULL DEFAULT 1,
  sender_account_id uuid REFERENCES sender_accounts(id) ON DELETE SET NULL,
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_workspace_created ON usage_events(workspace_id, created_at);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_events_select ON usage_events
  FOR SELECT USING (workspace_id = auth.uid());

-- ── 2. increment_usage() RPC ────────────────────────────────────────────────
-- Single entry point for all usage writes. Idempotent: duplicate
-- source_event_id returns { duplicate: true } without incrementing.
-- Atomically upserts workspace_usage_counters AND bumps
-- sender_accounts.daily_sent_today for email sends.

CREATE OR REPLACE FUNCTION increment_usage(
  p_workspace_id     uuid,
  p_event_type       text,
  p_source_event_id  text DEFAULT NULL,
  p_quantity         integer DEFAULT 1,
  p_sender_account_id uuid DEFAULT NULL,
  p_metadata         jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date_key  date := CURRENT_DATE;
  v_month_key text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_result    jsonb;
BEGIN
  -- Idempotency check: if source_event_id provided, try to insert
  IF p_source_event_id IS NOT NULL THEN
    BEGIN
      INSERT INTO usage_events (source_event_id, workspace_id, event_type, quantity, sender_account_id, metadata)
      VALUES (p_source_event_id, p_workspace_id, p_event_type, p_quantity, p_sender_account_id, p_metadata);
    EXCEPTION WHEN unique_violation THEN
      -- Duplicate event — return without incrementing
      RETURN jsonb_build_object('duplicate', true, 'source_event_id', p_source_event_id);
    END;
  END IF;

  -- Increment workspace_usage_counters
  INSERT INTO workspace_usage_counters
    (workspace_id, date_key, month_key,
     emails_sent, linkedin_actions, ai_credits_used, warmup_emails_sent)
  VALUES (
    p_workspace_id, v_date_key, v_month_key,
    CASE WHEN p_event_type = 'email_sent'       THEN p_quantity ELSE 0 END,
    CASE WHEN p_event_type = 'linkedin_action'   THEN p_quantity ELSE 0 END,
    CASE WHEN p_event_type = 'ai_credit'         THEN p_quantity ELSE 0 END,
    CASE WHEN p_event_type = 'warmup_sent'       THEN p_quantity ELSE 0 END
  )
  ON CONFLICT (workspace_id, date_key)
  DO UPDATE SET
    emails_sent        = workspace_usage_counters.emails_sent
                         + CASE WHEN p_event_type = 'email_sent'     THEN p_quantity ELSE 0 END,
    linkedin_actions   = workspace_usage_counters.linkedin_actions
                         + CASE WHEN p_event_type = 'linkedin_action' THEN p_quantity ELSE 0 END,
    ai_credits_used    = workspace_usage_counters.ai_credits_used
                         + CASE WHEN p_event_type = 'ai_credit'       THEN p_quantity ELSE 0 END,
    warmup_emails_sent = workspace_usage_counters.warmup_emails_sent
                         + CASE WHEN p_event_type = 'warmup_sent'     THEN p_quantity ELSE 0 END,
    updated_at         = now();

  -- For email sends: also bump sender_accounts.daily_sent_today
  IF p_event_type = 'email_sent' AND p_sender_account_id IS NOT NULL THEN
    UPDATE sender_accounts
    SET
      daily_sent_today = CASE
        WHEN daily_sent_date = CURRENT_DATE THEN daily_sent_today + p_quantity
        ELSE p_quantity
      END,
      daily_sent_date = CURRENT_DATE,
      updated_at = now()
    WHERE id = p_sender_account_id;
  END IF;

  v_result := jsonb_build_object(
    'duplicate', false,
    'event_type', p_event_type,
    'quantity', p_quantity
  );

  RETURN v_result;
END;
$$;

-- ── 3. get_workspace_daily_usage() RPC ──────────────────────────────────────
-- Returns today's row from workspace_usage_counters.

CREATE OR REPLACE FUNCTION get_workspace_daily_usage(
  p_workspace_id uuid
)
RETURNS TABLE (
  emails_sent        integer,
  linkedin_actions   integer,
  ai_credits_used    integer,
  warmup_emails_sent integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(w.emails_sent, 0),
    COALESCE(w.linkedin_actions, 0),
    COALESCE(w.ai_credits_used, 0),
    COALESCE(w.warmup_emails_sent, 0)
  FROM workspace_usage_counters w
  WHERE w.workspace_id = p_workspace_id
    AND w.date_key = CURRENT_DATE
  LIMIT 1;
$$;

-- ── 4. Deprecation comment on outbound_usage ────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outbound_usage') THEN
    EXECUTE $sql$
      COMMENT ON TABLE outbound_usage IS 'DEPRECATED: replaced by workspace_usage_counters + usage_events. Will drop after 2026-04-03.'
    $sql$;
  END IF;
END;
$$;
