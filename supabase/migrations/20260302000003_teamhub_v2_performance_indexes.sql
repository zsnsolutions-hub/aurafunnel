-- ====================================================
-- Team Hub v2 Migration 4: Performance Indexes
-- ====================================================

-- Main board view: active cards ordered by position within each list
CREATE INDEX IF NOT EXISTS idx_teamhub_cards_board_active_pos
  ON teamhub_cards(board_id, is_archived, position)
  WHERE is_archived = false;

-- Activity feed: newest first per board
CREATE INDEX IF NOT EXISTS idx_teamhub_activity_board_time
  ON teamhub_activity(board_id, created_at DESC);

-- Membership lookup: user → boards (hot path: every RLS check)
CREATE INDEX IF NOT EXISTS idx_teamhub_flow_members_user_board
  ON teamhub_flow_members(user_id, board_id);

-- Comments: card + time for pagination
CREATE INDEX IF NOT EXISTS idx_teamhub_comments_card_time
  ON teamhub_comments(card_id, created_at DESC);

-- Audit logs: time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);
