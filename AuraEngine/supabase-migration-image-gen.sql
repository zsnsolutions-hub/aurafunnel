-- ============================================================
-- Image Generation Module — Additive Migration
-- Run AFTER all existing migrations.
-- Does NOT alter any existing table.
-- ============================================================

-- 0. Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'image-gen-assets',
  'image-gen-assets',
  true,
  10485760,  -- 10 MB
  ARRAY['image/png','image/jpeg','image/svg+xml','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone can view, authenticated users manage their own files
DO $$ BEGIN
  CREATE POLICY "Anyone can view image-gen assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'image-gen-assets');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload image-gen assets"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'image-gen-assets'
      AND auth.role() = 'authenticated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own image-gen assets"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'image-gen-assets'
      AND auth.uid()::text = (storage.foldername(name))[2]
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own image-gen assets"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'image-gen-assets'
      AND auth.uid()::text = (storage.foldername(name))[2]
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Brand Assets (logos)
CREATE TABLE IF NOT EXISTS image_gen_brand_assets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'logo' CHECK (type IN ('logo')),
  file_url    TEXT NOT NULL,
  file_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE image_gen_brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own brand assets"
  ON image_gen_brand_assets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_brand_assets_user
  ON image_gen_brand_assets(user_id);

-- 2. Generated Images
CREATE TABLE IF NOT EXISTS image_gen_generated_images (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_type     TEXT NOT NULL CHECK (module_type IN ('newsletter','pricing','products','services')),
  module_id       TEXT,
  prompt          TEXT NOT NULL,
  aspect_ratio    TEXT NOT NULL DEFAULT '1:1',
  provider        TEXT NOT NULL DEFAULT 'stub',
  base_image_url  TEXT NOT NULL,
  final_image_url TEXT,
  brand_settings  JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE image_gen_generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own generated images"
  ON image_gen_generated_images FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gen_images_user
  ON image_gen_generated_images(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gen_images_module
  ON image_gen_generated_images(user_id, module_type);

-- 3. Module Attachments (link generated image → content record)
CREATE TABLE IF NOT EXISTS image_gen_module_attachments (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_image_id  UUID NOT NULL REFERENCES image_gen_generated_images(id) ON DELETE CASCADE,
  module_type         TEXT NOT NULL,
  module_id           TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE image_gen_module_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own module attachments"
  ON image_gen_module_attachments FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_module_attach_lookup
  ON image_gen_module_attachments(module_type, module_id);
