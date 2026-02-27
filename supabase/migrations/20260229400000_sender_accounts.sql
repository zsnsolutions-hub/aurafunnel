-- ============================================================================
-- Sender Accounts System
-- Evolves email_provider_configs → sender_accounts with proper secrets
-- separation, multi-inbox support, and workspace usage counters.
-- ============================================================================

-- ── 1. sender_accounts ─────────────────────────────────────────────────────
-- Public metadata about connected sending providers. NO secrets stored here.

CREATE TABLE IF NOT EXISTS sender_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider             text NOT NULL CHECK (provider IN ('gmail','smtp','sendgrid','mailchimp')),
  display_name         text NOT NULL DEFAULT '',
  from_email           text NOT NULL,
  from_name            text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','needs_reauth','disabled')),
  is_default           boolean NOT NULL DEFAULT false,
  use_for_outreach     boolean NOT NULL DEFAULT true,  -- false for mailchimp (newsletters only)
  metadata             jsonb NOT NULL DEFAULT '{}',     -- provider-specific non-secret info
  daily_sent_today     integer NOT NULL DEFAULT 0,
  daily_sent_date      date NOT NULL DEFAULT CURRENT_DATE,
  warmup_enabled       boolean NOT NULL DEFAULT false,
  warmup_daily_sent    integer NOT NULL DEFAULT 0,
  last_health_check_at timestamptz,
  health_score         integer DEFAULT 100,             -- 0-100
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sender_accounts_workspace ON sender_accounts(workspace_id);
CREATE INDEX idx_sender_accounts_lookup ON sender_accounts(workspace_id, status, use_for_outreach);

-- Ensure only one default per workspace
CREATE UNIQUE INDEX idx_sender_accounts_default
  ON sender_accounts(workspace_id) WHERE is_default = true;

-- ── 2. sender_account_secrets ──────────────────────────────────────────────
-- Server-side only. Client NEVER reads this table. Edge functions use
-- service_role key to access. All credentials stored here.

CREATE TABLE IF NOT EXISTS sender_account_secrets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id uuid NOT NULL REFERENCES sender_accounts(id) ON DELETE CASCADE UNIQUE,
  -- OAuth tokens (Gmail, Mailchimp)
  oauth_access_token  text,
  oauth_refresh_token text,
  oauth_expires_at    timestamptz,
  -- SMTP credentials
  smtp_host           text,
  smtp_port           integer DEFAULT 587,
  smtp_user           text,
  smtp_pass           text,
  -- API keys (SendGrid, Mailchimp fallback)
  api_key             text,
  -- Metadata
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- NO RLS policy that allows client select — only service_role can read.
ALTER TABLE sender_account_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no SELECT/INSERT/UPDATE policies for anon/authenticated roles.
-- Only SECURITY DEFINER functions and service_role key can access this table.

-- ── 3. workspace_usage_counters ────────────────────────────────────────────
-- Consolidated daily + monthly counters per workspace.

CREATE TABLE IF NOT EXISTS workspace_usage_counters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date_key            date NOT NULL,                    -- YYYY-MM-DD
  month_key           text NOT NULL,                    -- 'YYYY-MM'
  emails_sent         integer NOT NULL DEFAULT 0,
  linkedin_actions    integer NOT NULL DEFAULT 0,
  ai_credits_used     integer NOT NULL DEFAULT 0,
  warmup_emails_sent  integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_usage_counters_unique UNIQUE (workspace_id, date_key)
);

CREATE INDEX idx_workspace_usage_workspace_month
  ON workspace_usage_counters(workspace_id, month_key);

-- ── 4. RLS for sender_accounts ─────────────────────────────────────────────

ALTER TABLE sender_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sender_accounts_select ON sender_accounts
  FOR SELECT USING (workspace_id = auth.uid());

CREATE POLICY sender_accounts_insert ON sender_accounts
  FOR INSERT WITH CHECK (workspace_id = auth.uid());

CREATE POLICY sender_accounts_update ON sender_accounts
  FOR UPDATE USING (workspace_id = auth.uid());

CREATE POLICY sender_accounts_delete ON sender_accounts
  FOR DELETE USING (workspace_id = auth.uid());

-- ── 5. RLS for workspace_usage_counters ────────────────────────────────────

ALTER TABLE workspace_usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_usage_select ON workspace_usage_counters
  FOR SELECT USING (workspace_id = auth.uid());

CREATE POLICY workspace_usage_insert ON workspace_usage_counters
  FOR INSERT WITH CHECK (workspace_id = auth.uid());

CREATE POLICY workspace_usage_update ON workspace_usage_counters
  FOR UPDATE USING (workspace_id = auth.uid());

-- ── 6. RPC: Increment per-sender daily count ──────────────────────────────

CREATE OR REPLACE FUNCTION increment_sender_daily_sent(
  p_sender_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE sender_accounts
  SET
    daily_sent_today = CASE
      WHEN daily_sent_date = CURRENT_DATE THEN daily_sent_today + 1
      ELSE 1  -- new day, reset
    END,
    daily_sent_date = CURRENT_DATE,
    updated_at = now()
  WHERE id = p_sender_id
  RETURNING daily_sent_today INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

-- ── 7. RPC: Increment workspace usage counters ────────────────────────────

CREATE OR REPLACE FUNCTION increment_workspace_usage(
  p_workspace_id uuid,
  p_date_key     date,
  p_month_key    text,
  p_emails       integer DEFAULT 0,
  p_linkedin     integer DEFAULT 0,
  p_ai_credits   integer DEFAULT 0,
  p_warmup       integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO workspace_usage_counters
    (workspace_id, date_key, month_key, emails_sent, linkedin_actions, ai_credits_used, warmup_emails_sent)
  VALUES
    (p_workspace_id, p_date_key, p_month_key, p_emails, p_linkedin, p_ai_credits, p_warmup)
  ON CONFLICT (workspace_id, date_key)
  DO UPDATE SET
    emails_sent        = workspace_usage_counters.emails_sent        + p_emails,
    linkedin_actions   = workspace_usage_counters.linkedin_actions   + p_linkedin,
    ai_credits_used    = workspace_usage_counters.ai_credits_used    + p_ai_credits,
    warmup_emails_sent = workspace_usage_counters.warmup_emails_sent + p_warmup,
    updated_at         = now();
END;
$$;

-- ── 8. RPC: Get workspace monthly totals ───────────────────────────────────

CREATE OR REPLACE FUNCTION get_workspace_monthly_usage(
  p_workspace_id uuid,
  p_month_key    text
)
RETURNS TABLE (
  total_emails_sent      bigint,
  total_linkedin_actions bigint,
  total_ai_credits_used  bigint,
  total_warmup_sent      bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(SUM(emails_sent), 0),
    COALESCE(SUM(linkedin_actions), 0),
    COALESCE(SUM(ai_credits_used), 0),
    COALESCE(SUM(warmup_emails_sent), 0)
  FROM workspace_usage_counters
  WHERE workspace_id = p_workspace_id
    AND month_key = p_month_key;
$$;

-- ── 9. RPC: Get sender daily sent (auto-reset if new day) ─────────────────

CREATE OR REPLACE FUNCTION get_sender_daily_sent(
  p_sender_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count integer;
  v_date  date;
BEGIN
  SELECT daily_sent_today, daily_sent_date
  INTO v_count, v_date
  FROM sender_accounts
  WHERE id = p_sender_id;

  IF v_date IS NULL OR v_date < CURRENT_DATE THEN
    RETURN 0;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ── 10. RPC: Connect sender account with secrets (server-side) ─────────────

CREATE OR REPLACE FUNCTION connect_sender_account(
  p_workspace_id    uuid,
  p_provider        text,
  p_display_name    text,
  p_from_email      text,
  p_from_name       text DEFAULT '',
  p_use_for_outreach boolean DEFAULT true,
  p_metadata        jsonb DEFAULT '{}',
  -- Secret fields
  p_oauth_access    text DEFAULT NULL,
  p_oauth_refresh   text DEFAULT NULL,
  p_oauth_expires   timestamptz DEFAULT NULL,
  p_smtp_host       text DEFAULT NULL,
  p_smtp_port       integer DEFAULT 587,
  p_smtp_user       text DEFAULT NULL,
  p_smtp_pass       text DEFAULT NULL,
  p_api_key         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_count      integer;
BEGIN
  -- Return the new account ID
  INSERT INTO sender_accounts
    (workspace_id, provider, display_name, from_email, from_name, use_for_outreach, metadata)
  VALUES
    (p_workspace_id, p_provider, p_display_name, p_from_email, p_from_name, p_use_for_outreach, p_metadata)
  RETURNING id INTO v_account_id;

  -- Store secrets
  INSERT INTO sender_account_secrets
    (sender_account_id, oauth_access_token, oauth_refresh_token, oauth_expires_at,
     smtp_host, smtp_port, smtp_user, smtp_pass, api_key)
  VALUES
    (v_account_id, p_oauth_access, p_oauth_refresh, p_oauth_expires,
     p_smtp_host, p_smtp_port, p_smtp_user, p_smtp_pass, p_api_key);

  -- Set as default if it's the first account
  SELECT COUNT(*) INTO v_count FROM sender_accounts WHERE workspace_id = p_workspace_id;
  IF v_count = 1 THEN
    UPDATE sender_accounts SET is_default = true WHERE id = v_account_id;
  END IF;

  RETURN v_account_id;
END;
$$;
