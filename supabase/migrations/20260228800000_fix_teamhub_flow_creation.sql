-- Fix: flow creation fails because .insert().select() on teamhub_boards
-- requires the new row to pass the SELECT RLS policy, but flow_select
-- only checks teamhub_flow_members which hasn't been populated yet.
--
-- Also: the member_insert policy requires an existing owner/admin membership,
-- but the very first membership row (the creator) can't satisfy that check.

-- 1. Allow the board creator to SELECT their own board row immediately after insert
DO $$ BEGIN
  CREATE POLICY "flow_creator_select" ON teamhub_boards
    FOR SELECT USING (auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Allow the board creator to bootstrap their own owner membership row
--    (the first member_insert for a flow they created)
DO $$ BEGIN
  CREATE POLICY "member_bootstrap_insert" ON teamhub_flow_members
    FOR INSERT WITH CHECK (
      -- The inserting user is adding themselves
      auth.uid() = user_id
      -- And they are the creator of the flow
      AND EXISTS (
        SELECT 1 FROM teamhub_boards
        WHERE id = teamhub_flow_members.flow_id
          AND created_by = auth.uid()
      )
      -- And no members exist yet for this flow (bootstrap only)
      AND NOT EXISTS (
        SELECT 1 FROM teamhub_flow_members AS existing
        WHERE existing.flow_id = teamhub_flow_members.flow_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
