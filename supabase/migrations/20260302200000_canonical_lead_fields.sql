-- ====================================================
-- Canonical Lead Fields Migration
-- Backfill canonical fields from legacy, add indexes,
-- update teamhub trigger to use canonical field names.
-- ====================================================

-- 0. Add last_activity column if it doesn't exist yet
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity timestamptz DEFAULT now();

-- 1a. Backfill primary_email from email (dedupe-safe: one winner per client+email)
WITH candidates AS (
  SELECT DISTINCT ON (client_id, lower(trim(email)))
    id, lower(trim(email)) AS norm_email
  FROM leads
  WHERE primary_email IS NULL AND email IS NOT NULL AND trim(email) != ''
  ORDER BY client_id, lower(trim(email)), updated_at DESC NULLS LAST, created_at DESC NULLS LAST
)
UPDATE leads SET primary_email = c.norm_email
FROM candidates c
WHERE leads.id = c.id
  AND NOT EXISTS (
    SELECT 1 FROM leads ex
    WHERE ex.client_id = leads.client_id
      AND lower(trim(ex.primary_email)) = c.norm_email
  );

-- 1b. Backfill first_name / last_name from name
UPDATE leads SET
  first_name = COALESCE(first_name, split_part(COALESCE(name, ''), ' ', 1)),
  last_name = COALESCE(last_name,
    CASE WHEN COALESCE(name, '') LIKE '% %'
      THEN substring(name FROM position(' ' IN name) + 1)
      ELSE '' END)
WHERE first_name IS NULL AND name IS NOT NULL AND trim(name) != '';

-- 1c. Backfill last_activity from lastActivity (TEXT) or fallback to timestamps
UPDATE leads SET last_activity = COALESCE(
  last_activity,
  CASE WHEN "lastActivity" ~ '^\d{4}-\d{2}-\d{2}' THEN "lastActivity"::timestamptz ELSE NULL END,
  updated_at,
  created_at,
  now()
)
WHERE last_activity IS NULL;

-- 2. Search/filter indexes
CREATE INDEX IF NOT EXISTS idx_leads_primary_email_search
  ON leads USING btree (lower(primary_email) text_pattern_ops)
  WHERE primary_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_first_name_search
  ON leads USING btree (lower(first_name) text_pattern_ops)
  WHERE first_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_activity
  ON leads (last_activity DESC NULLS LAST);

-- 3. Update teamhub trigger to use canonical last_activity field
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

  -- Update the lead status (canonical fields)
  UPDATE leads SET
    status = v_new_status,
    last_activity = now(),
    updated_at = now()
  WHERE id = v_lead_id;

  RETURN NEW;
END;
$$;
