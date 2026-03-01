-- ====================================================
-- Fix: leads table uses client_id, not user_id
-- ====================================================

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
