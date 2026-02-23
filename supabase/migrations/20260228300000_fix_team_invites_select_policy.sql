-- Fix: team members (owner/admin) can't SELECT team_invites by team_id
-- The existing policies only allow invited_by or invitee email matches.
-- Add a policy so team members can view all invites for their team.

DO $$ BEGIN
  CREATE POLICY "Team members can view team invites"
    ON team_invites FOR SELECT
    USING (public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Also add a name column to track who is being invited
ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS name TEXT;
