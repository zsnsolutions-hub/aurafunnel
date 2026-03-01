-- ====================================================
-- Team Hub v2 Migration 3: Lead Sync Trigger + Constraints
-- ====================================================

-- D. Trigger function: auto-sync lead status when card moves lanes
CREATE OR REPLACE FUNCTION public.teamhub_sync_lead_on_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id UUID;
  v_template_id UUID;
  v_structure JSONB;
  v_lane_name TEXT;
  v_lane_status_map JSONB;
  v_new_status TEXT;
BEGIN
  -- Only fire when list_id actually changes
  IF OLD.list_id = NEW.list_id THEN
    RETURN NEW;
  END IF;

  -- Check if card has an active lead link
  SELECT lead_id INTO v_lead_id
  FROM teamhub_item_leads
  WHERE item_id = NEW.id AND is_active = true;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the new lane name
  SELECT name INTO v_lane_name
  FROM teamhub_lists WHERE id = NEW.list_id;

  IF v_lane_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if board has a template with lead_sync enabled
  SELECT template_id INTO v_template_id
  FROM teamhub_boards WHERE id = NEW.board_id;

  IF v_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT structure_json INTO v_structure
  FROM teamhub_flow_templates WHERE id = v_template_id;

  IF v_structure IS NULL OR (v_structure->>'lead_sync')::boolean IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_lane_status_map := v_structure->'lane_status_map';
  IF v_lane_status_map IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve status from lane_status_map
  v_new_status := v_lane_status_map->>v_lane_name;
  IF v_new_status IS NULL THEN
    -- Try case-insensitive match via lower()
    SELECT val INTO v_new_status
    FROM jsonb_each_text(v_lane_status_map) AS x(key, val)
    WHERE lower(x.key) = lower(v_lane_name)
    LIMIT 1;
  END IF;

  IF v_new_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update the lead status
  UPDATE leads SET
    status = v_new_status,
    "lastActivity" = now(),
    updated_at = now()
  WHERE id = v_lead_id;

  RETURN NEW;
END;
$$;

-- D. Attach trigger
DROP TRIGGER IF EXISTS trg_teamhub_card_lead_sync ON teamhub_cards;
CREATE TRIGGER trg_teamhub_card_lead_sync
  AFTER UPDATE OF list_id ON teamhub_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.teamhub_sync_lead_on_move();

-- E. Cross-user lead link constraint
-- Ensures a card can only link to a lead owned by someone who is a member of the same board
CREATE OR REPLACE FUNCTION public.teamhub_check_lead_link_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_board_id UUID;
  v_lead_owner UUID;
BEGIN
  -- Get the card's board_id
  SELECT board_id INTO v_board_id
  FROM teamhub_cards WHERE id = NEW.item_id;

  -- Get the lead's owner
  SELECT client_id INTO v_lead_owner
  FROM leads WHERE id = NEW.lead_id;

  -- Check that the lead owner is a member of the board
  IF NOT EXISTS (
    SELECT 1 FROM teamhub_flow_members
    WHERE board_id = v_board_id AND user_id = v_lead_owner
  ) THEN
    RAISE EXCEPTION 'Lead owner must be a member of the board';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teamhub_check_lead_scope ON teamhub_item_leads;
CREATE TRIGGER trg_teamhub_check_lead_scope
  BEFORE INSERT OR UPDATE ON teamhub_item_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.teamhub_check_lead_link_scope();
