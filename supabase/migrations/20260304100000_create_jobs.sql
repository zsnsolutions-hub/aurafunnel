-- ============================================================
-- Jobs System — Track long-running tasks with progress
-- ============================================================

-- ── Table: jobs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
    'email_sequence', 'bulk_import', 'apollo_import', 'apollo_search',
    'social_publish', 'analytics_refresh', 'lead_enrichment',
    'invoice_send', 'integration_validate'
  )),
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'succeeded', 'failed', 'canceled'
  )),
  progress_current INT NOT NULL DEFAULT 0,
  progress_total   INT NOT NULL DEFAULT 0,
  result          JSONB,
  error           TEXT,
  request_id      UUID,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table: job_events ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  message     TEXT NOT NULL,
  meta        JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table: idempotency_keys ─────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  request_id    UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  action        TEXT NOT NULL,
  response      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jobs_workspace
  ON jobs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace_status
  ON jobs (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_request_id
  ON jobs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_type_status
  ON jobs (type, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created
  ON jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id
  ON job_events (job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_created
  ON job_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_idempotency_workspace
  ON idempotency_keys (workspace_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_created
  ON idempotency_keys (created_at DESC);

-- ── Trigger: auto-update updated_at ─────────────────────────

CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_jobs_updated_at();

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Jobs: workspace members can read their own jobs
CREATE POLICY jobs_select ON jobs
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Jobs: admins can read all
CREATE POLICY jobs_admin_select ON jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Jobs: authenticated users can insert their own jobs
CREATE POLICY jobs_insert ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Jobs: service role can do everything (for workers/edge functions)
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;

-- Job events: readable if parent job is accessible
CREATE POLICY job_events_select ON job_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = job_id
        AND (j.created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN'))
    )
  );

-- Job events: insert by authenticated (for client-side event logging)
CREATE POLICY job_events_insert ON job_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER TABLE job_events FORCE ROW LEVEL SECURITY;

-- Idempotency keys: own workspace only
CREATE POLICY idempotency_select ON idempotency_keys
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY idempotency_insert ON idempotency_keys
  FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

-- ── Auto-cleanup: remove old completed jobs after 30 days ───
-- (Run via pg_cron if desired)
-- SELECT cron.schedule('cleanup-old-jobs', '0 3 * * *',
--   $$DELETE FROM jobs WHERE status IN ('succeeded','failed','canceled') AND created_at < now() - interval '30 days'$$
-- );
