-- ============================================================================
-- Prevent duplicate sender accounts for the same workspace + provider + email.
-- Update connect_sender_account() to upsert instead of failing on duplicates.
-- ============================================================================

-- ── 1. Unique constraint: one sender account per workspace + provider + email ─
CREATE UNIQUE INDEX IF NOT EXISTS idx_sender_accounts_dedup
  ON sender_accounts (workspace_id, provider, from_email);

-- ── 2. Replace connect_sender_account() with upsert logic ───────────────────
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
  -- Upsert sender account: update if same workspace + provider + email exists
  INSERT INTO sender_accounts
    (workspace_id, provider, display_name, from_email, from_name, use_for_outreach, metadata, status, updated_at)
  VALUES
    (p_workspace_id, p_provider, p_display_name, p_from_email, p_from_name, p_use_for_outreach, p_metadata, 'connected', now())
  ON CONFLICT (workspace_id, provider, from_email)
  DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    from_name       = EXCLUDED.from_name,
    use_for_outreach = EXCLUDED.use_for_outreach,
    metadata        = EXCLUDED.metadata,
    status          = 'connected',
    updated_at      = now()
  RETURNING id INTO v_account_id;

  -- Upsert secrets
  INSERT INTO sender_account_secrets
    (sender_account_id, oauth_access_token, oauth_refresh_token, oauth_expires_at,
     smtp_host, smtp_port, smtp_user, smtp_pass, api_key, updated_at)
  VALUES
    (v_account_id, p_oauth_access, p_oauth_refresh, p_oauth_expires,
     p_smtp_host, p_smtp_port, p_smtp_user, p_smtp_pass, p_api_key, now())
  ON CONFLICT (sender_account_id)
  DO UPDATE SET
    oauth_access_token  = EXCLUDED.oauth_access_token,
    oauth_refresh_token = EXCLUDED.oauth_refresh_token,
    oauth_expires_at    = EXCLUDED.oauth_expires_at,
    smtp_host           = EXCLUDED.smtp_host,
    smtp_port           = EXCLUDED.smtp_port,
    smtp_user           = EXCLUDED.smtp_user,
    smtp_pass           = EXCLUDED.smtp_pass,
    api_key             = EXCLUDED.api_key,
    updated_at          = now();

  -- Set as default if it's the first account in the workspace
  SELECT COUNT(*) INTO v_count FROM sender_accounts WHERE workspace_id = p_workspace_id;
  IF v_count = 1 THEN
    UPDATE sender_accounts SET is_default = true WHERE id = v_account_id;
  END IF;

  RETURN v_account_id;
END;
$$;
