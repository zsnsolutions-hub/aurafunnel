-- Create image-gen-assets storage bucket and policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'image-gen-assets',
  'image-gen-assets',
  true,
  10485760,  -- 10 MB
  ARRAY['image/png','image/jpeg','image/svg+xml','image/webp']
)
ON CONFLICT (id) DO NOTHING;

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
