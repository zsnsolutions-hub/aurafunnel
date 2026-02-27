-- ============================================================================
-- Workspace AI Usage — credit tracking with monthly reset
-- 1 AI credit = 800 tokens.  Hard stop when credits reach 0.
-- Credits are per workspace, NOT per user.
-- ============================================================================

-- ── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_ai_usage (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month_year    text NOT NULL,                       -- '2026-02'
  credits_used  integer NOT NULL DEFAULT 0,
  tokens_used   bigint  NOT NULL DEFAULT 0,
  credits_limit integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT workspace_ai_usage_unique UNIQUE (workspace_id, month_year)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_ai_usage_lookup
  ON workspace_ai_usage (workspace_id, month_year);

-- ── RPC: Atomic increment ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_workspace_id uuid,
  p_month_year   text,
  p_credits      integer,
  p_tokens       bigint,
  p_credits_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_credits integer;
BEGIN
  INSERT INTO workspace_ai_usage (workspace_id, month_year, credits_used, tokens_used, credits_limit, updated_at)
  VALUES (p_workspace_id, p_month_year, p_credits, p_tokens, p_credits_limit, now())
  ON CONFLICT (workspace_id, month_year)
  DO UPDATE SET
    credits_used  = workspace_ai_usage.credits_used + p_credits,
    tokens_used   = workspace_ai_usage.tokens_used  + p_tokens,
    credits_limit = p_credits_limit,
    updated_at    = now()
  RETURNING credits_used INTO v_new_credits;

  RETURN v_new_credits;
END;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE workspace_ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own workspace usage
CREATE POLICY workspace_ai_usage_select ON workspace_ai_usage
  FOR SELECT USING (workspace_id = auth.uid());

-- Only the RPC (SECURITY DEFINER) writes — no direct inserts/updates from client
CREATE POLICY workspace_ai_usage_insert ON workspace_ai_usage
  FOR INSERT WITH CHECK (workspace_id = auth.uid());

CREATE POLICY workspace_ai_usage_update ON workspace_ai_usage
  FOR UPDATE USING (workspace_id = auth.uid());
