-- ══════════════════════════════════════════════════════════════
-- AI Email Writer Queue: Tables, Indexes, RLS, Helper Functions
-- ══════════════════════════════════════════════════════════════

-- 1. email_sequence_runs — one row per batch run
CREATE TABLE IF NOT EXISTS email_sequence_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    UUID,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  lead_count      INT NOT NULL DEFAULT 0,
  step_count      INT NOT NULL DEFAULT 0,
  items_total     INT NOT NULL DEFAULT 0,
  items_done      INT NOT NULL DEFAULT 0,
  items_failed    INT NOT NULL DEFAULT 0,
  sequence_config JSONB NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_summary   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. email_sequence_run_items — one row per lead×step
CREATE TABLE IF NOT EXISTS email_sequence_run_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES email_sequence_runs(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  step_index       INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','writing','written','failed')),
  lead_email       TEXT NOT NULL,
  lead_name        TEXT,
  lead_company     TEXT,
  lead_context     JSONB DEFAULT '{}',
  template_subject TEXT NOT NULL,
  template_body    TEXT NOT NULL,
  ai_subject       TEXT,
  ai_body_html     TEXT,
  delay_days       INT NOT NULL DEFAULT 0,
  attempt_count    INT NOT NULL DEFAULT 0,
  error_message    TEXT,
  locked_until     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_esr_owner
  ON email_sequence_runs(owner_id);

CREATE INDEX IF NOT EXISTS idx_esr_status
  ON email_sequence_runs(status)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_esri_run
  ON email_sequence_run_items(run_id);

CREATE INDEX IF NOT EXISTS idx_esri_pending
  ON email_sequence_run_items(status, locked_until)
  WHERE status IN ('pending','writing');

CREATE INDEX IF NOT EXISTS idx_esri_run_status
  ON email_sequence_run_items(run_id, status);

-- ── RLS ──

ALTER TABLE email_sequence_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own runs"
  ON email_sequence_runs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own runs"
  ON email_sequence_runs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own runs"
  ON email_sequence_runs FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Service role full access on runs"
  ON email_sequence_runs FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE email_sequence_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own run items"
  ON email_sequence_run_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM email_sequence_runs r
      WHERE r.id = email_sequence_run_items.run_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on run items"
  ON email_sequence_run_items FOR ALL
  USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- Helper Functions
-- ══════════════════════════════════════════════════════════════

-- 3. claim_next_writing_item — atomically claim one pending item
CREATE OR REPLACE FUNCTION claim_next_writing_item(p_run_id UUID DEFAULT NULL)
RETURNS SETOF email_sequence_run_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item email_sequence_run_items%ROWTYPE;
BEGIN
  UPDATE email_sequence_run_items
  SET status = 'writing',
      locked_until = now() + interval '5 minutes',
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE id = (
    SELECT id FROM email_sequence_run_items
    WHERE status = 'pending'
      AND (locked_until IS NULL OR locked_until < now())
      AND (p_run_id IS NULL OR run_id = p_run_id)
    ORDER BY step_index, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_item;

  IF v_item.id IS NOT NULL THEN
    RETURN NEXT v_item;
  END IF;
  RETURN;
END;
$$;

-- 4. reset_stuck_writing_items — watchdog for stuck items
CREATE OR REPLACE FUNCTION reset_stuck_writing_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset items stuck in 'writing' with expired lock and < 3 attempts back to pending
  UPDATE email_sequence_run_items
  SET status = 'pending',
      locked_until = NULL,
      updated_at = now()
  WHERE status = 'writing'
    AND locked_until < now()
    AND attempt_count < 3;

  -- Mark items with >= 3 attempts as failed
  UPDATE email_sequence_run_items
  SET status = 'failed',
      error_message = COALESCE(error_message, '') || ' | Max retries exceeded',
      locked_until = NULL,
      updated_at = now()
  WHERE status = 'writing'
    AND locked_until < now()
    AND attempt_count >= 3;
END;
$$;

-- 5. finalize_email_sequence_run — insert scheduled_emails when all items done
CREATE OR REPLACE FUNCTION finalize_email_sequence_run(p_run_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run       email_sequence_runs%ROWTYPE;
  v_pending   INT;
  v_writing   INT;
  v_failed    INT;
BEGIN
  SELECT * INTO v_run FROM email_sequence_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', p_run_id;
  END IF;

  -- Check no pending/writing items remain
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') ,
    COUNT(*) FILTER (WHERE status = 'writing') ,
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_pending, v_writing, v_failed
  FROM email_sequence_run_items
  WHERE run_id = p_run_id;

  IF v_pending > 0 OR v_writing > 0 THEN
    -- Not ready to finalize yet
    RETURN;
  END IF;

  -- Insert into scheduled_emails from all written items
  INSERT INTO scheduled_emails (
    owner_id, lead_id, to_email, subject, html_body,
    scheduled_at, block_index, sequence_id, status,
    from_email, provider
  )
  SELECT
    v_run.owner_id,
    i.lead_id,
    i.lead_email,
    i.ai_subject,
    i.ai_body_html,
    now() + (i.delay_days || ' days')::interval,
    i.step_index,
    p_run_id::text,
    'pending',
    v_run.sequence_config->>'from_email',
    v_run.sequence_config->>'provider'
  FROM email_sequence_run_items i
  WHERE i.run_id = p_run_id
    AND i.status = 'written';

  -- Update run as completed
  UPDATE email_sequence_runs
  SET status = 'completed',
      completed_at = now(),
      items_failed = v_failed,
      updated_at = now()
  WHERE id = p_run_id;
END;
$$;
