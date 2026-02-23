-- Team Invite Improvements
-- 1. check_email_exists() — SECURITY DEFINER RPC to check if an email is registered
-- 2. Tighten team_members INSERT policy so users can only add themselves

-- =============================================
-- 1. check_email_exists function
-- =============================================
-- Safe: only returns true/false, no profile data leaked
CREATE OR REPLACE FUNCTION public.check_email_exists(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = lower(check_email)
  );
$$;

-- =============================================
-- 2. Tighten team_members INSERT policy
-- =============================================
-- Old policy allowed any authenticated user to insert any row.
-- New policy: users can only insert rows where user_id = their own uid.
-- This is what accept-invite does (inserts a row for yourself).

DROP POLICY IF EXISTS "Authenticated users can insert team members" ON team_members;

CREATE POLICY "Users can add themselves as team members"
  ON team_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);
