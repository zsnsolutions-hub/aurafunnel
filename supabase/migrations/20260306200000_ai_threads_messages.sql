-- ════════════════════════════════════════════════════════════════════════════
-- Migration: AI Chat Threads & Messages
-- Persists AI Command Center conversations for recovery and history.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. ai_threads ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL DEFAULT 'analyst',
  title         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_owner_all" ON ai_threads FOR ALL USING (
  workspace_id = auth.uid()
);

CREATE INDEX idx_ai_threads_workspace ON ai_threads(workspace_id, updated_at DESC);

-- ── 2. ai_messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'ai', 'system')),
  content       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'streaming', 'complete', 'error', 'aborted')),
  mode          TEXT NOT NULL DEFAULT 'analyst',
  tokens_used   INTEGER DEFAULT 0,
  latency_ms    INTEGER DEFAULT 0,
  confidence    INTEGER DEFAULT 0,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_owner_all" ON ai_messages FOR ALL USING (
  workspace_id = auth.uid()
);

CREATE INDEX idx_ai_messages_thread ON ai_messages(thread_id, created_at ASC);
CREATE INDEX idx_ai_messages_workspace ON ai_messages(workspace_id, created_at DESC);
CREATE INDEX idx_ai_messages_streaming ON ai_messages(status) WHERE status = 'streaming';
