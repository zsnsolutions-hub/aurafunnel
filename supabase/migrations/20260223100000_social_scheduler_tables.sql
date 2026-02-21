-- Social Scheduler: multi-platform social media publishing & scheduling
-- Tables: social_accounts, social_posts, social_post_targets, social_post_events,
--         tracking_links, tracking_events
-- Storage bucket: social_media

-- ── social_accounts ─────────────────────────────────────────────────────────
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta','linkedin')),
  meta_page_id TEXT,
  meta_page_name TEXT,
  meta_page_access_token_encrypted TEXT,
  meta_ig_user_id TEXT,
  meta_ig_username TEXT,
  linkedin_member_urn TEXT,
  linkedin_org_urn TEXT,
  linkedin_org_name TEXT,
  linkedin_access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_accounts_user ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_provider ON social_accounts(user_id, provider);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own social accounts"
  ON social_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── social_posts ────────────────────────────────────────────────────────────
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL,
  link_url TEXT,
  media_paths JSONB,
  scheduled_at TIMESTAMPTZ,
  timezone TEXT DEFAULT 'Asia/Karachi',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','processing','completed','failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_posts_user ON social_posts(user_id);
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_social_posts_scheduled ON social_posts(status, scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own social posts"
  ON social_posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── social_post_targets ─────────────────────────────────────────────────────
CREATE TABLE social_post_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('facebook_page','instagram','linkedin_member','linkedin_org')),
  target_id TEXT NOT NULL,
  target_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scheduled','processing','published','failed')),
  remote_post_id TEXT,
  error_code TEXT,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_post_targets_post ON social_post_targets(post_id);
CREATE INDEX idx_social_post_targets_user ON social_post_targets(user_id);
CREATE INDEX idx_social_post_targets_status ON social_post_targets(status);

ALTER TABLE social_post_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own post targets"
  ON social_post_targets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── social_post_events (audit log) ──────────────────────────────────────────
CREATE TABLE social_post_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  target_id UUID REFERENCES social_post_targets(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('scheduled','started','published','failed','retry')),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_post_events_post ON social_post_events(post_id);
CREATE INDEX idx_social_post_events_user ON social_post_events(user_id);

ALTER TABLE social_post_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own post events"
  ON social_post_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── tracking_links ──────────────────────────────────────────────────────────
CREATE TABLE tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  channel TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracking_links_slug ON tracking_links(slug);
CREATE INDEX idx_tracking_links_user ON tracking_links(user_id);
CREATE INDEX idx_tracking_links_post ON tracking_links(post_id);

ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tracking links"
  ON tracking_links FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── tracking_events ─────────────────────────────────────────────────────────
CREATE TABLE tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracking_events_link ON tracking_events(link_id);
CREATE INDEX idx_tracking_events_user ON tracking_events(user_id);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tracking events"
  ON tracking_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Supabase Storage bucket ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('social_media', 'social_media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own social media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'social_media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own social media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'social_media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own social media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'social_media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── pg_cron: schedule the social-run-scheduler every minute ─────────────────
-- This calls the Edge Function via pg_net http extension.
-- Ensure pg_cron and pg_net extensions are enabled in Supabase dashboard.
-- The cron job uses the service role key to invoke the Edge Function.

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule: every minute, call the social-run-scheduler edge function
SELECT cron.schedule(
  'social-run-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/social-run-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);
