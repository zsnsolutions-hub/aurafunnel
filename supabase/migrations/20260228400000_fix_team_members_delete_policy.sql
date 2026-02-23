-- Fix: replace overly permissive team_members DELETE policy
-- Only team owner/admin should be able to remove members.
-- Also allow members to remove themselves (leave team).

DROP POLICY IF EXISTS "Authenticated users can delete team members" ON team_members;

CREATE POLICY "Owner/admin can remove members or self-leave"
  ON team_members FOR DELETE USING (
    -- Allow removing yourself (leave team)
    auth.uid() = user_id
    OR
    -- Allow owner/admin to remove others
    EXISTS (
      SELECT 1 FROM team_members AS self
      WHERE self.team_id = team_members.team_id
        AND self.user_id = auth.uid()
        AND self.role IN ('owner', 'admin')
    )
  );

-- Also ensure team_invites has a DELETE policy for cancelling invites
DO $$ BEGIN
  CREATE POLICY "Team owner/admin can delete invites"
    ON team_invites FOR DELETE
    USING (public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure team_members has an UPDATE policy for role changes
DO $$ BEGIN
  CREATE POLICY "Owner can update member roles"
    ON team_members FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM team_members AS self
        WHERE self.team_id = team_members.team_id
          AND self.user_id = auth.uid()
          AND self.role = 'owner'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
