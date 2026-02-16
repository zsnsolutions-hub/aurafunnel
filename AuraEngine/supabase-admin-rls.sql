-- =============================================
-- AuraFunnel - Admin RLS Policies
-- Grants ADMIN role full access to platform tables
-- Run in Supabase SQL Editor
-- =============================================

-- ── HELPER FUNCTION ───────────────────────────
-- SECURITY DEFINER bypasses RLS, avoiding infinite recursion
-- when admin policies on the profiles table query profiles itself.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$;

-- ── LEADS ─────────────────────────────────────
-- Admins can view all leads (for admin dashboard, lead analytics)
DO $$ BEGIN
  CREATE POLICY "Admins can view all leads"
    ON leads FOR SELECT
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can update any lead (status changes, scoring, etc.)
DO $$ BEGIN
  CREATE POLICY "Admins can update all leads"
    ON leads FOR UPDATE
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can delete any lead
DO $$ BEGIN
  CREATE POLICY "Admins can delete all leads"
    ON leads FOR DELETE
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can insert leads on behalf of any client
DO $$ BEGIN
  CREATE POLICY "Admins can insert leads"
    ON leads FOR INSERT
    WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── PROFILES ──────────────────────────────────
-- Uses is_admin() to avoid infinite recursion (policy on profiles querying profiles)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DO $$ BEGIN
  CREATE POLICY "Admins can update all profiles"
    ON profiles FOR UPDATE
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── SUBSCRIPTIONS ─────────────────────────────
-- Admins can view all subscriptions (revenue analytics, plan stats)
DO $$ BEGIN
  CREATE POLICY "Admins can view all subscriptions"
    ON subscriptions FOR SELECT
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can update subscriptions (plan changes, cancellations)
DO $$ BEGIN
  CREATE POLICY "Admins can update all subscriptions"
    ON subscriptions FOR UPDATE
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── AI_USAGE_LOGS ─────────────────────────────
-- Admins can view all AI usage logs (content stats, usage monitoring)
DO $$ BEGIN
  CREATE POLICY "Admins can view all ai_usage_logs"
    ON ai_usage_logs FOR SELECT
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── BLOG_POSTS ────────────────────────────────
-- Admins can manage all blog posts (not just their own)
DO $$ BEGIN
  CREATE POLICY "Admins can manage all blog posts"
    ON blog_posts FOR ALL
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
