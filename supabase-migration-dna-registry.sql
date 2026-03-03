-- ============================================================
-- DNA Registry — Versioned AI Blueprint System
-- ============================================================

-- ── Table: prompt_dna_registry ──────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_dna_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
    'sales_outreach','analytics','email','content','lead_research',
    'blog','social','automation','strategy','support','general'
  )),
  description     TEXT DEFAULT '',
  module          TEXT NOT NULL CHECK (module IN (
    'email','voice','blog','social','support','general'
  )),
  system_prompt   TEXT NOT NULL DEFAULT '',
  prompt_template TEXT NOT NULL DEFAULT '',
  variables       JSONB NOT NULL DEFAULT '[]'::jsonb,
  tone_config     JSONB NOT NULL DEFAULT '{"formality":5,"creativity":5,"verbosity":5,"custom_instructions":""}'::jsonb,
  output_schema   JSONB,
  guardrails      JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_locked       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  active_version  INT NOT NULL DEFAULT 1,

  -- Future-proof columns
  ab_group            TEXT,
  marketplace_status  TEXT CHECK (marketplace_status IS NULL OR marketplace_status IN ('draft','published','approved')),
  fine_tune_model_id  TEXT,

  -- Ownership
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_workspace_slug UNIQUE (workspace_id, slug)
);

-- ── Table: prompt_dna_versions ──────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_dna_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dna_id          UUID NOT NULL REFERENCES prompt_dna_registry(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  system_prompt   TEXT NOT NULL DEFAULT '',
  prompt_template TEXT NOT NULL DEFAULT '',
  variables       JSONB NOT NULL DEFAULT '[]'::jsonb,
  tone_config     JSONB NOT NULL DEFAULT '{"formality":5,"creativity":5,"verbosity":5,"custom_instructions":""}'::jsonb,
  output_schema   JSONB,
  guardrails      JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_note     TEXT DEFAULT '',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_dna_version UNIQUE (dna_id, version_number)
);

-- ── Table: prompt_dna_usage_logs ────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_dna_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dna_id          UUID NOT NULL REFERENCES prompt_dna_registry(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  workspace_id    UUID,
  user_id         UUID REFERENCES auth.users(id),
  module          TEXT NOT NULL,
  context         JSONB DEFAULT '{}'::jsonb,
  variables_used  JSONB DEFAULT '{}'::jsonb,
  tokens_used     INT DEFAULT 0,
  latency_ms      INT DEFAULT 0,
  success         BOOLEAN NOT NULL DEFAULT true,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────

-- Registry
CREATE INDEX IF NOT EXISTS idx_dna_registry_workspace
  ON prompt_dna_registry (workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dna_registry_category
  ON prompt_dna_registry (category);
CREATE INDEX IF NOT EXISTS idx_dna_registry_module
  ON prompt_dna_registry (module);
CREATE INDEX IF NOT EXISTS idx_dna_registry_active
  ON prompt_dna_registry (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_dna_registry_slug
  ON prompt_dna_registry (slug);

-- Versions
CREATE INDEX IF NOT EXISTS idx_dna_versions_dna_id
  ON prompt_dna_versions (dna_id);
CREATE INDEX IF NOT EXISTS idx_dna_versions_dna_version
  ON prompt_dna_versions (dna_id, version_number DESC);

-- Usage logs
CREATE INDEX IF NOT EXISTS idx_dna_usage_dna_id
  ON prompt_dna_usage_logs (dna_id);
CREATE INDEX IF NOT EXISTS idx_dna_usage_user_id
  ON prompt_dna_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_dna_usage_created
  ON prompt_dna_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dna_usage_module_created
  ON prompt_dna_usage_logs (module, created_at DESC);

-- ── Trigger: auto-update updated_at ─────────────────────────

CREATE OR REPLACE FUNCTION update_dna_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dna_updated_at ON prompt_dna_registry;
CREATE TRIGGER trg_dna_updated_at
  BEFORE UPDATE ON prompt_dna_registry
  FOR EACH ROW EXECUTE FUNCTION update_dna_updated_at();

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE prompt_dna_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_dna_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_dna_usage_logs ENABLE ROW LEVEL SECURITY;

-- Registry: SELECT — global DNA readable by all authenticated; workspace DNA by owner
CREATE POLICY dna_registry_select ON prompt_dna_registry
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR created_by = auth.uid()
  );

-- Registry: ALL for admins on global DNA
CREATE POLICY dna_registry_admin_all ON prompt_dna_registry
  FOR ALL TO authenticated
  USING (
    workspace_id IS NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  )
  WITH CHECK (
    workspace_id IS NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Registry: ALL for workspace owners on their own DNA
CREATE POLICY dna_registry_owner_all ON prompt_dna_registry
  FOR ALL TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND created_by = auth.uid()
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND created_by = auth.uid()
  );

-- Versions: SELECT if parent DNA is accessible
CREATE POLICY dna_versions_select ON prompt_dna_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prompt_dna_registry r
      WHERE r.id = dna_id
        AND (r.workspace_id IS NULL OR r.created_by = auth.uid())
    )
  );

-- Versions: INSERT if parent DNA is editable
CREATE POLICY dna_versions_insert ON prompt_dna_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prompt_dna_registry r
      WHERE r.id = dna_id
        AND (
          (r.workspace_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN'))
          OR (r.workspace_id IS NOT NULL AND r.created_by = auth.uid())
        )
    )
  );

-- Usage logs: admins read all, users read own
CREATE POLICY dna_usage_select ON prompt_dna_usage_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Usage logs: all authenticated can insert
CREATE POLICY dna_usage_insert ON prompt_dna_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Service role bypass
ALTER TABLE prompt_dna_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE prompt_dna_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE prompt_dna_usage_logs FORCE ROW LEVEL SECURITY;
