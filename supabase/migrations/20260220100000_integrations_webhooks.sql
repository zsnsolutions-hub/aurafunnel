-- ============================================================
-- Integrations table: per-user non-email integration credentials
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  category    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','error')),
  credentials JSONB NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, provider)
);

CREATE INDEX idx_integrations_owner ON integrations(owner_id);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own integrations"
  ON integrations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own integrations"
  ON integrations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own integrations"
  ON integrations FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================
-- Webhooks table: per-user webhook configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  secret        TEXT,
  last_fired    TIMESTAMPTZ,
  success_rate  REAL DEFAULT 100.0,
  fire_count    INTEGER DEFAULT 0,
  fail_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhooks_owner ON webhooks(owner_id);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhooks"
  ON webhooks FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own webhooks"
  ON webhooks FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own webhooks"
  ON webhooks FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own webhooks"
  ON webhooks FOR DELETE
  USING (owner_id = auth.uid());
