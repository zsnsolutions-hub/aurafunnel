-- Fix: invitees cannot see the team they've been invited to.
-- The teams table only has SELECT policies for team members and the owner,
-- so the `teams(name)` join in the invite query fails silently.
-- Add a policy allowing invitees to read teams they have a pending invite for.

DO $$ BEGIN
  CREATE POLICY "Invitees can view teams they are invited to"
    ON teams FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM team_invites
        WHERE team_invites.team_id = teams.id
          AND team_invites.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          AND team_invites.status = 'pending'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
