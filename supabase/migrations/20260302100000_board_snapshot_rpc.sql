-- Board snapshot RPC: returns full board state in a single call
-- Replaces 7 separate client queries with one server-side join

CREATE OR REPLACE FUNCTION get_board_snapshot(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
BEGIN
  -- RLS: only board members can access
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teamhub_flow_members
    WHERE board_id = p_board_id AND user_id = v_user_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'board', (
      SELECT to_jsonb(b.*)
      FROM teamhub_boards b
      WHERE b.id = p_board_id
    ),
    'lists', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l.*) ORDER BY l.position
      )
      FROM teamhub_lists l
      WHERE l.board_id = p_board_id
    ), '[]'::jsonb),
    'cards', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(c.*) || jsonb_build_object(
          'comment_count', COALESCE(cc.cnt, 0),
          'latest_comment', cc.latest_body,
          'assigned_members', COALESCE(cm.members, '[]'::jsonb),
          'lead_link', ll.link
        )
      )
      FROM teamhub_cards c
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int AS cnt,
          (SELECT body FROM teamhub_comments
           WHERE card_id = c.id ORDER BY created_at DESC LIMIT 1) AS latest_body
        FROM teamhub_comments
        WHERE card_id = c.id
      ) cc ON TRUE
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', tcm.user_id,
            'user_name', COALESCE(p.name, ''),
            'user_email', COALESCE(p.email, '')
          )
        ) AS members
        FROM teamhub_card_members tcm
        LEFT JOIN profiles p ON p.id = tcm.user_id
        WHERE tcm.card_id = c.id
      ) cm ON TRUE
      LEFT JOIN LATERAL (
        SELECT CASE WHEN til.id IS NOT NULL THEN
          jsonb_build_object(
            'id', til.id,
            'item_id', til.item_id,
            'lead_id', til.lead_id,
            'lead_name', COALESCE(ld.name, ''),
            'lead_email', COALESCE(ld.email, ''),
            'lead_status', COALESCE(ld.status, ''),
            'is_active', til.is_active
          )
        ELSE NULL END AS link
        FROM teamhub_item_leads til
        LEFT JOIN leads ld ON ld.id = til.lead_id
        WHERE til.item_id = c.id AND til.is_active = true
        LIMIT 1
      ) ll ON TRUE
      WHERE c.board_id = p_board_id AND c.is_archived = false
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (RLS is handled inside the function)
GRANT EXECUTE ON FUNCTION get_board_snapshot(UUID) TO authenticated;
