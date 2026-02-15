-- =============================================
-- AuraFunnel - Migration v2
-- Adds missing columns, RPC functions
-- Run in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. Add missing columns to ai_usage_logs
-- =============================================
ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_version INTEGER DEFAULT 0;

-- =============================================
-- 2. Add current_period_end to subscriptions
-- =============================================
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- =============================================
-- 3. RPC: consume_credits
-- Decrements credits_used by `amount` for the
-- authenticated user. Returns success/message.
-- =============================================
CREATE OR REPLACE FUNCTION consume_credits(amount INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  profile_record RECORD;
BEGIN
  SELECT credits_total, credits_used
  INTO profile_record
  FROM profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Profile not found.');
  END IF;

  IF (profile_record.credits_used + amount) > profile_record.credits_total THEN
    RETURN json_build_object('success', false, 'message', 'Insufficient credits.');
  END IF;

  UPDATE profiles
  SET credits_used = credits_used + amount,
      updated_at = now()
  WHERE id = auth.uid();

  RETURN json_build_object('success', true, 'message', 'Credits consumed.');
END;
$$;

-- =============================================
-- 4. RPC: get_category_post_counts
-- Returns post count per blog category.
-- =============================================
CREATE OR REPLACE FUNCTION get_category_post_counts()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_object_agg(bc.id::text, COALESCE(cnt, 0))
  INTO result
  FROM blog_categories bc
  LEFT JOIN (
    SELECT category_id, COUNT(*) AS cnt
    FROM blog_posts
    GROUP BY category_id
  ) bp ON bp.category_id = bc.id;

  RETURN COALESCE(result, '{}'::json);
END;
$$;
