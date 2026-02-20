-- ============================================================
-- Lead Stage Colors: per-user stage-to-color mappings
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_stage_colors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  color_token TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, stage)
);

CREATE INDEX idx_lead_stage_colors_owner ON lead_stage_colors(owner_id);

ALTER TABLE lead_stage_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stage colors"
  ON lead_stage_colors FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own stage colors"
  ON lead_stage_colors FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own stage colors"
  ON lead_stage_colors FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own stage colors"
  ON lead_stage_colors FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================
-- Lead Color Overrides: per-lead color overrides
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_color_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  color_token TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, lead_id)
);

CREATE INDEX idx_lead_color_overrides_owner ON lead_color_overrides(owner_id);
CREATE INDEX idx_lead_color_overrides_lead ON lead_color_overrides(lead_id);

ALTER TABLE lead_color_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own color overrides"
  ON lead_color_overrides FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own color overrides"
  ON lead_color_overrides FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own color overrides"
  ON lead_color_overrides FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own color overrides"
  ON lead_color_overrides FOR DELETE
  USING (owner_id = auth.uid());
