-- Fix: RLS policies that reference auth.users fail with
-- "permission denied for table users" because the authenticated role
-- cannot SELECT from auth.users directly.
-- Solution: create a SECURITY DEFINER helper that runs as postgres.

CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Rebuild team_invites SELECT policy for invitees
DROP POLICY IF EXISTS "Invitees can view invites to their email" ON team_invites;
CREATE POLICY "Invitees can view invites to their email"
  ON team_invites FOR SELECT
  USING (email = public.auth_email());

-- Rebuild team_invites UPDATE policy for invitees
DROP POLICY IF EXISTS "Invitees can update invite status" ON team_invites;
CREATE POLICY "Invitees can update invite status"
  ON team_invites FOR UPDATE
  USING (email = public.auth_email());

-- Rebuild teams SELECT policy for invitees
DROP POLICY IF EXISTS "Invitees can view teams they are invited to" ON teams;
CREATE POLICY "Invitees can view teams they are invited to"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_invites
      WHERE team_invites.team_id = teams.id
        AND team_invites.email = public.auth_email()
        AND team_invites.status = 'pending'
    )
  );
