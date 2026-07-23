-- Roadmap 4.1 (BUG-008) — distinguish DEMO social connections from real ones.
-- When META_APP_ID / LINKEDIN_CLIENT_ID isn't configured, the *-oauth-start fns
-- insert a placeholder social_accounts row that the UI showed as "Connected",
-- misleading users into thinking they'd publish to a real account. This flag lets
-- the UI label demo accounts and (optionally) block them from real publishing.
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
