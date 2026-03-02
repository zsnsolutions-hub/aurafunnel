-- 1. Add lead_id column with FK
ALTER TABLE strategy_notes
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- 2. Backfill lead_id from lead_name (unique matches only)
-- For each note with a non-null lead_name, find leads owned by the same user
-- where the display name matches. Only set lead_id when exactly one lead matches.
WITH matches AS (
  SELECT
    sn.id AS note_id,
    sn.lead_name,
    sn.user_id,
    l.id AS matched_lead_id,
    COUNT(*) OVER (PARTITION BY sn.id) AS match_count
  FROM strategy_notes sn
  JOIN leads l
    ON l.client_id = sn.user_id
    AND lower(trim(
      COALESCE(l.first_name, '') ||
      CASE WHEN COALESCE(l.last_name, '') != '' THEN ' ' || l.last_name ELSE '' END
    )) = lower(trim(sn.lead_name))
  WHERE sn.lead_name IS NOT NULL
    AND sn.lead_id IS NULL
)
UPDATE strategy_notes sn
SET lead_id = m.matched_lead_id
FROM matches m
WHERE sn.id = m.note_id
  AND m.match_count = 1;

-- 3. Log ambiguous matches (match_count > 1) for manual review
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      sn.id AS note_id,
      sn.lead_name,
      sn.user_id,
      COUNT(l.id) AS match_count
    FROM strategy_notes sn
    JOIN leads l
      ON l.client_id = sn.user_id
      AND lower(trim(
        COALESCE(l.first_name, '') ||
        CASE WHEN COALESCE(l.last_name, '') != '' THEN ' ' || l.last_name ELSE '' END
      )) = lower(trim(sn.lead_name))
    WHERE sn.lead_name IS NOT NULL
      AND sn.lead_id IS NULL
    GROUP BY sn.id, sn.lead_name, sn.user_id
    HAVING COUNT(l.id) > 1
  LOOP
    RAISE NOTICE 'AMBIGUOUS: note_id=%, lead_name=%, user_id=%, matches=%',
      rec.note_id, rec.lead_name, rec.user_id, rec.match_count;
  END LOOP;
END $$;

-- 4. Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_strategy_notes_lead_id_created
  ON strategy_notes (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
