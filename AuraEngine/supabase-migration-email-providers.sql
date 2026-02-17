-- ============================================================
-- Email Provider Configs: per-user provider credentials
-- ============================================================

CREATE TABLE IF NOT EXISTS email_provider_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('sendgrid','mailchimp','smtp','gmail')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  -- SendGrid / Mailchimp
  api_key       TEXT,
  -- SMTP / Gmail
  smtp_host     TEXT,
  smtp_port     INT DEFAULT 587,
  smtp_user     TEXT,
  smtp_pass     TEXT,
  -- Common
  from_email    TEXT,
  from_name     TEXT,
  -- Webhook verification
  webhook_key   TEXT,
  -- Metadata
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One active config per provider per user
  UNIQUE(owner_id, provider)
);

CREATE INDEX idx_email_provider_configs_owner ON email_provider_configs(owner_id);

ALTER TABLE email_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own provider configs"
  ON email_provider_configs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own provider configs"
  ON email_provider_configs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own provider configs"
  ON email_provider_configs FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own provider configs"
  ON email_provider_configs FOR DELETE
  USING (owner_id = auth.uid());
