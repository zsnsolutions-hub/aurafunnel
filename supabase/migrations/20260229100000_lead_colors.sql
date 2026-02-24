-- =============================================
-- Lead Colors — Stage Colors & Per-Lead Overrides
-- =============================================

-- 1. LEAD_STAGE_COLORS — per-user stage → color mapping
CREATE TABLE IF NOT EXISTS lead_stage_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  color_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (owner_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_colors_owner ON lead_stage_colors(owner_id);

ALTER TABLE lead_stage_colors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own stage colors"
    ON lead_stage_colors FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own stage colors"
    ON lead_stage_colors FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own stage colors"
    ON lead_stage_colors FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own stage colors"
    ON lead_stage_colors FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. LEAD_COLOR_OVERRIDES — per-lead color override
CREATE TABLE IF NOT EXISTS lead_color_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  color_token TEXT NOT NULL,
  UNIQUE (owner_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_color_overrides_owner ON lead_color_overrides(owner_id);

ALTER TABLE lead_color_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own color overrides"
    ON lead_color_overrides FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own color overrides"
    ON lead_color_overrides FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own color overrides"
    ON lead_color_overrides FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own color overrides"
    ON lead_color_overrides FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
