-- ══════════════════════════════════════════════════════════════
-- Scheduled Emails Queue
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  html_body     TEXT NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  block_index   INT NOT NULL DEFAULT 0,
  sequence_id   TEXT,
  error_message TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_owner
  ON scheduled_emails (owner_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status
  ON scheduled_emails (status);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending
  ON scheduled_emails (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_sequence
  ON scheduled_emails (sequence_id)
  WHERE sequence_id IS NOT NULL;

-- RLS
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scheduled emails"
  ON scheduled_emails FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own scheduled emails"
  ON scheduled_emails FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own scheduled emails"
  ON scheduled_emails FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own scheduled emails"
  ON scheduled_emails FOR DELETE
  USING (auth.uid() = owner_id);

-- Service role bypass for the edge function
CREATE POLICY "Service role full access"
  ON scheduled_emails FOR ALL
  USING (auth.role() = 'service_role');
