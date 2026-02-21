-- Guest Post Outreach & Contributors tables
-- Tracks opportunities to write on external blogs and manages external writers

-- ── guest_post_outreach ─────────────────────────────────────────────────────
CREATE TABLE guest_post_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_name TEXT NOT NULL,
  blog_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  domain_authority INTEGER CHECK (domain_authority >= 0 AND domain_authority <= 100),
  monthly_traffic TEXT,
  status TEXT DEFAULT 'researching'
    CHECK (status IN ('researching','pitched','accepted','writing','published','rejected')),
  pitch_subject TEXT,
  pitch_body TEXT,
  notes TEXT,
  target_publish_date DATE,
  published_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_guest_post_outreach_user ON guest_post_outreach(user_id);
CREATE INDEX idx_guest_post_outreach_status ON guest_post_outreach(user_id, status);

ALTER TABLE guest_post_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own outreach"
  ON guest_post_outreach FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── guest_contributors ──────────────────────────────────────────────────────
CREATE TABLE guest_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  bio TEXT,
  website TEXT,
  status TEXT DEFAULT 'invited' CHECK (status IN ('invited','active','inactive')),
  posts_submitted INTEGER DEFAULT 0,
  posts_published INTEGER DEFAULT 0,
  invited_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_guest_contributors_user ON guest_contributors(user_id);
CREATE INDEX idx_guest_contributors_status ON guest_contributors(user_id, status);

ALTER TABLE guest_contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contributors"
  ON guest_contributors FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Link blog_posts to contributors ────────────────────────────────────────
ALTER TABLE blog_posts ADD COLUMN contributor_id UUID REFERENCES guest_contributors(id) ON DELETE SET NULL;

CREATE INDEX idx_blog_posts_contributor ON blog_posts(contributor_id);
