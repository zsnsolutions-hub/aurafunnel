-- ====================================================
-- Team Hub v2 Migration 1: Workspace + Column Rename
-- ====================================================

-- A. Backfill workspace_id with created_by (owner = workspace)
UPDATE teamhub_boards SET workspace_id = created_by WHERE workspace_id IS NULL;

-- A. Add NOT NULL constraint
ALTER TABLE teamhub_boards ALTER COLUMN workspace_id SET NOT NULL;

-- B. Rename flow_id → board_id in teamhub_flow_members
ALTER TABLE teamhub_flow_members RENAME COLUMN flow_id TO board_id;

-- B. Rename flow_id → board_id in teamhub_invites
ALTER TABLE teamhub_invites RENAME COLUMN flow_id TO board_id;

-- B. Drop old indexes and recreate with new column name
DROP INDEX IF EXISTS idx_teamhub_flow_members_flow;
CREATE INDEX IF NOT EXISTS idx_teamhub_flow_members_board ON teamhub_flow_members(board_id);

DROP INDEX IF EXISTS idx_teamhub_invites_flow;
CREATE INDEX IF NOT EXISTS idx_teamhub_invites_board ON teamhub_invites(board_id);

-- B. Drop ALL policies that depend on teamhub_user_flow_role() BEFORE dropping the function
DROP POLICY IF EXISTS "member_select" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_insert" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_update" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_delete" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_bootstrap_insert" ON teamhub_flow_members;
DROP POLICY IF EXISTS "Co-members can view profiles" ON profiles;

-- B. Now safe to drop + recreate function with renamed parameter
DROP FUNCTION IF EXISTS public.teamhub_user_flow_role(UUID);
CREATE FUNCTION public.teamhub_user_flow_role(p_board_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM teamhub_flow_members
  WHERE board_id = p_board_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- B. Recreate teamhub_flow_members policies with board_id
CREATE POLICY "member_select" ON teamhub_flow_members
  FOR SELECT USING (
    public.teamhub_user_flow_role(board_id) IS NOT NULL
  );

CREATE POLICY "member_insert" ON teamhub_flow_members
  FOR INSERT WITH CHECK (
    public.teamhub_user_flow_role(board_id) IN ('owner','admin')
  );

CREATE POLICY "member_update" ON teamhub_flow_members
  FOR UPDATE USING (
    public.teamhub_user_flow_role(board_id) IN ('owner','admin')
  );

CREATE POLICY "member_delete" ON teamhub_flow_members
  FOR DELETE USING (
    public.teamhub_user_flow_role(board_id) IN ('owner','admin')
  );

-- Bootstrap policy: creator can add first member
DO $$ BEGIN
  CREATE POLICY "member_bootstrap_insert" ON teamhub_flow_members
    FOR INSERT WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM teamhub_boards
        WHERE id = teamhub_flow_members.board_id
          AND created_by = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1 FROM teamhub_flow_members AS existing
        WHERE existing.board_id = teamhub_flow_members.board_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── teamhub_invites policies ───
DROP POLICY IF EXISTS "invite_select" ON teamhub_invites;
DROP POLICY IF EXISTS "invite_insert" ON teamhub_invites;
DROP POLICY IF EXISTS "invite_delete" ON teamhub_invites;

CREATE POLICY "invite_select" ON teamhub_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE board_id = teamhub_invites.board_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "invite_insert" ON teamhub_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE board_id = teamhub_invites.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "invite_delete" ON teamhub_invites
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE board_id = teamhub_invites.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

-- ─── Unique constraint rename ───
-- Drop old unique constraints referencing flow_id and recreate
ALTER TABLE teamhub_flow_members DROP CONSTRAINT IF EXISTS teamhub_flow_members_flow_id_user_id_key;
DO $$ BEGIN
  ALTER TABLE teamhub_flow_members ADD CONSTRAINT teamhub_flow_members_board_id_user_id_key UNIQUE(board_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE teamhub_invites DROP CONSTRAINT IF EXISTS teamhub_invites_flow_id_email_key;
DO $$ BEGIN
  ALTER TABLE teamhub_invites ADD CONSTRAINT teamhub_invites_board_id_email_key UNIQUE(board_id, email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Co-members profile policy (uses renamed column) ───
DO $$ BEGIN
  CREATE POLICY "Co-members can view profiles" ON profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM teamhub_flow_members a
        WHERE a.user_id = auth.uid()
          AND public.teamhub_user_flow_role(a.board_id) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM teamhub_flow_members b
            WHERE b.board_id = a.board_id AND b.user_id = profiles.id
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
