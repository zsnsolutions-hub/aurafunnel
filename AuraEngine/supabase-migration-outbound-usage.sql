-- Outbound usage tracking for hard limit enforcement
-- Run this in the Supabase SQL Editor

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outbound_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inbox_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin')),
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')),
  period_key TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, inbox_id, channel, period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_outbound_usage_lookup
  ON public.outbound_usage(workspace_id, channel, period_type, period_key);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.outbound_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON public.outbound_usage FOR SELECT
  USING (workspace_id = auth.uid());

CREATE POLICY "Users can insert own usage"
  ON public.outbound_usage FOR INSERT
  WITH CHECK (workspace_id = auth.uid());

CREATE POLICY "Users can update own usage"
  ON public.outbound_usage FOR UPDATE
  USING (workspace_id = auth.uid());

-- ── Atomic increment RPC ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_outbound_usage(
  p_workspace_id UUID,
  p_inbox_id TEXT,
  p_channel TEXT,
  p_period_type TEXT,
  p_period_key TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO public.outbound_usage (workspace_id, inbox_id, channel, period_type, period_key, count, updated_at)
  VALUES (p_workspace_id, p_inbox_id, p_channel, p_period_type, p_period_key, 1, now())
  ON CONFLICT (workspace_id, inbox_id, channel, period_type, period_key)
  DO UPDATE SET count = outbound_usage.count + 1, updated_at = now()
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;
