-- ============================================================================
-- 20260512220000_profiles_pii_anon_lockdown.sql
-- ----------------------------------------------------------------------------
-- Lock down the anon role's column access on public.profiles.
--
-- Today: anon has broad SELECT on profiles + a `Public Profiles View`
-- RLS policy with `using (true)`. That means anonymous visitors to
-- scaliyo.com can read every profile row's email, stripe_customer_id,
-- and businessProfile JSONB. The only legitimate anon read of profiles
-- is the marketing blog's author-display join — which only ever uses
-- `name` and `avatar_url`.
--
-- Fix: replace the broad anon SELECT with a column-scoped grant that
-- exposes ONLY the three columns the public blog needs. RLS policies
-- stay unchanged — column-level grants compose correctly with row-level
-- policies (Postgres requires BOTH the column grant AND a permissive
-- policy for the read to succeed).
--
-- After this:
--   anon SELECT profiles.id          → allowed
--   anon SELECT profiles.name        → allowed
--   anon SELECT profiles.avatar_url  → allowed
--   anon SELECT profiles.email       → DENIED (was: every row leaked)
--   anon SELECT profiles.stripe_customer_id → DENIED
--   anon SELECT profiles.businessProfile    → DENIED
--   anon SELECT profiles.*           → DENIED (lacks column on first
--                                              restricted column)
--
-- The `authenticated` role's grants are untouched — they still SELECT
-- the full row, gated by the existing (own / co-members / admins)
-- policies.
-- ============================================================================

-- Drop the table-level grant first.
revoke select on public.profiles from anon;

-- Re-grant the public-safe columns only.
--   id, name, avatar_url  — used by the marketing blog's author display
--   role                  — referenced by admin-check policies on other
--                           tables (blog_posts, leads, audit_logs) via
--                           `exists (select 1 from profiles where ...
--                            and role = 'ADMIN')`. Without role access
--                           anon, those policies fail ACL evaluation
--                           with `permission denied for table profiles`
--                           before RLS can even return rows. role is
--                           an enum of {ADMIN, CLIENT, GUEST} — not PII.
grant select (id, name, avatar_url, role) on public.profiles to anon;

-- Document the intent so future maintainers don't restore the broad grant.
comment on policy "Public Profiles View" on public.profiles is
  'Permissive row-visibility policy. Anon access is column-scoped via GRANT SELECT (id, name, avatar_url) TO anon — NOT via this policy. Authenticated reads are scoped by the own / co-members / admins policies on this table. Do not broaden the column grant without a security review.';
