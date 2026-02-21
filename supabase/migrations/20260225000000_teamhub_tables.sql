-- Team Hub (Trello-like) tables
-- ADDITIVE ONLY: new tables, does not touch any existing tables

-- Boards
CREATE TABLE IF NOT EXISTS teamhub_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teamhub_boards_created_by ON teamhub_boards(created_by);
CREATE INDEX IF NOT EXISTS idx_teamhub_boards_workspace ON teamhub_boards(workspace_id);

-- Lists (columns within a board)
CREATE TABLE IF NOT EXISTS teamhub_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES teamhub_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled List',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teamhub_lists_board ON teamhub_lists(board_id);

-- Cards
CREATE TABLE IF NOT EXISTS teamhub_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES teamhub_boards(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES teamhub_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  due_date DATE,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teamhub_cards_list ON teamhub_cards(list_id);
CREATE INDEX IF NOT EXISTS idx_teamhub_cards_board ON teamhub_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_teamhub_cards_archived ON teamhub_cards(is_archived);

-- Comments on cards
CREATE TABLE IF NOT EXISTS teamhub_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES teamhub_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teamhub_comments_card ON teamhub_comments(card_id);

-- Activity log
CREATE TABLE IF NOT EXISTS teamhub_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES teamhub_boards(id) ON DELETE CASCADE,
  card_id UUID REFERENCES teamhub_cards(id) ON DELETE SET NULL,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teamhub_activity_board ON teamhub_activity(board_id);
CREATE INDEX IF NOT EXISTS idx_teamhub_activity_card ON teamhub_activity(card_id);

-- Card members (optional assignees)
CREATE TABLE IF NOT EXISTS teamhub_card_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES teamhub_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_teamhub_card_members_card ON teamhub_card_members(card_id);

-- Enable RLS on all tables
ALTER TABLE teamhub_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE teamhub_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE teamhub_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE teamhub_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teamhub_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE teamhub_card_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated users can access their own boards and related data
CREATE POLICY "Users can manage own boards" ON teamhub_boards
  FOR ALL USING (auth.uid() = created_by);

CREATE POLICY "Users can access board lists" ON teamhub_lists
  FOR ALL USING (board_id IN (SELECT id FROM teamhub_boards WHERE created_by = auth.uid()));

CREATE POLICY "Users can access board cards" ON teamhub_cards
  FOR ALL USING (board_id IN (SELECT id FROM teamhub_boards WHERE created_by = auth.uid()));

CREATE POLICY "Users can access card comments" ON teamhub_comments
  FOR ALL USING (card_id IN (
    SELECT c.id FROM teamhub_cards c
    JOIN teamhub_boards b ON c.board_id = b.id
    WHERE b.created_by = auth.uid()
  ));

CREATE POLICY "Users can access board activity" ON teamhub_activity
  FOR ALL USING (board_id IN (SELECT id FROM teamhub_boards WHERE created_by = auth.uid()));

CREATE POLICY "Users can access card members" ON teamhub_card_members
  FOR ALL USING (card_id IN (
    SELECT c.id FROM teamhub_cards c
    JOIN teamhub_boards b ON c.board_id = b.id
    WHERE b.created_by = auth.uid()
  ));
