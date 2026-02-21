-- Team Hub RBAC: Per-Flow Role-Based Access Control
-- Adds flow membership, invites, helper function, and replaces old RLS policies

-- =============================================
-- 1. NEW TABLES
-- =============================================

-- Flow members (role per user per flow)
CREATE TABLE IF NOT EXISTS teamhub_flow_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES teamhub_boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','member','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_teamhub_flow_members_flow ON teamhub_flow_members(flow_id);
CREATE INDEX IF NOT EXISTS idx_teamhub_flow_members_user ON teamhub_flow_members(user_id);

-- Flow invites (pending invitations by email)
CREATE TABLE IF NOT EXISTS teamhub_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES teamhub_boards(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, email)
);

CREATE INDEX IF NOT EXISTS idx_teamhub_invites_flow ON teamhub_invites(flow_id);

-- =============================================
-- 2. SEED: backfill existing board creators as owners
-- =============================================

INSERT INTO teamhub_flow_members (flow_id, user_id, role)
SELECT id, created_by, 'owner' FROM teamhub_boards
ON CONFLICT (flow_id, user_id) DO NOTHING;

-- =============================================
-- 3. HELPER FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION public.teamhub_user_flow_role(p_flow_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM teamhub_flow_members
  WHERE flow_id = p_flow_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- =============================================
-- 4. DROP OLD SINGLE-USER RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can manage own boards" ON teamhub_boards;
DROP POLICY IF EXISTS "Users can access board lists" ON teamhub_lists;
DROP POLICY IF EXISTS "Users can access board cards" ON teamhub_cards;
DROP POLICY IF EXISTS "Users can access card comments" ON teamhub_comments;
DROP POLICY IF EXISTS "Users can access board activity" ON teamhub_activity;
DROP POLICY IF EXISTS "Users can access card members" ON teamhub_card_members;

-- =============================================
-- 5. ENABLE RLS ON NEW TABLES
-- =============================================

ALTER TABLE teamhub_flow_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teamhub_invites ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. NEW GRANULAR RLS POLICIES
-- =============================================

-- ─── teamhub_boards (flows) ───

CREATE POLICY "flow_select" ON teamhub_boards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_boards.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "flow_insert" ON teamhub_boards
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "flow_update" ON teamhub_boards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_boards.id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "flow_delete" ON teamhub_boards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_boards.id AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- ─── teamhub_lists (lanes) ───

CREATE POLICY "lane_select" ON teamhub_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_lists.board_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "lane_insert" ON teamhub_lists
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_lists.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "lane_update" ON teamhub_lists
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_lists.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "lane_delete" ON teamhub_lists
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_lists.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

-- ─── teamhub_cards (items) ───

CREATE POLICY "item_select" ON teamhub_cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_cards.board_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "item_insert" ON teamhub_cards
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_cards.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin','member')
    )
  );

CREATE POLICY "item_update" ON teamhub_cards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_cards.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin','member')
    )
  );

CREATE POLICY "item_delete" ON teamhub_cards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_cards.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin','member')
    )
  );

-- ─── teamhub_comments ───

CREATE POLICY "comment_select" ON teamhub_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members fm
      JOIN teamhub_cards c ON c.board_id = fm.flow_id
      WHERE c.id = teamhub_comments.card_id AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "comment_insert" ON teamhub_comments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members fm
      JOIN teamhub_cards c ON c.board_id = fm.flow_id
      WHERE c.id = teamhub_comments.card_id AND fm.user_id = auth.uid()
        AND fm.role IN ('owner','admin','member')
    )
  );

-- ─── teamhub_activity ───

CREATE POLICY "activity_select" ON teamhub_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_activity.board_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "activity_insert" ON teamhub_activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_activity.board_id AND user_id = auth.uid()
        AND role IN ('owner','admin','member')
    )
  );

-- ─── teamhub_card_members ───

CREATE POLICY "card_member_select" ON teamhub_card_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members fm
      JOIN teamhub_cards c ON c.board_id = fm.flow_id
      WHERE c.id = teamhub_card_members.card_id AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "card_member_insert" ON teamhub_card_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members fm
      JOIN teamhub_cards c ON c.board_id = fm.flow_id
      WHERE c.id = teamhub_card_members.card_id AND fm.user_id = auth.uid()
        AND fm.role IN ('owner','admin','member')
    )
  );

CREATE POLICY "card_member_delete" ON teamhub_card_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members fm
      JOIN teamhub_cards c ON c.board_id = fm.flow_id
      WHERE c.id = teamhub_card_members.card_id AND fm.user_id = auth.uid()
        AND fm.role IN ('owner','admin','member')
    )
  );

-- ─── teamhub_flow_members ───

CREATE POLICY "member_select" ON teamhub_flow_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members AS self
      WHERE self.flow_id = teamhub_flow_members.flow_id AND self.user_id = auth.uid()
    )
  );

CREATE POLICY "member_insert" ON teamhub_flow_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members AS self
      WHERE self.flow_id = teamhub_flow_members.flow_id AND self.user_id = auth.uid()
        AND self.role IN ('owner','admin')
    )
  );

CREATE POLICY "member_update" ON teamhub_flow_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members AS self
      WHERE self.flow_id = teamhub_flow_members.flow_id AND self.user_id = auth.uid()
        AND self.role IN ('owner','admin')
    )
  );

CREATE POLICY "member_delete" ON teamhub_flow_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members AS self
      WHERE self.flow_id = teamhub_flow_members.flow_id AND self.user_id = auth.uid()
        AND self.role IN ('owner','admin')
    )
  );

-- ─── teamhub_invites ───

CREATE POLICY "invite_select" ON teamhub_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_invites.flow_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "invite_insert" ON teamhub_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_invites.flow_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "invite_delete" ON teamhub_invites
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teamhub_flow_members
      WHERE flow_id = teamhub_invites.flow_id AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

-- ─── profiles: additive policy for co-member name resolution ───

DO $$ BEGIN
  CREATE POLICY "Co-members can view profiles" ON profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM teamhub_flow_members a
        JOIN teamhub_flow_members b ON a.flow_id = b.flow_id
        WHERE a.user_id = auth.uid() AND b.user_id = profiles.id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
