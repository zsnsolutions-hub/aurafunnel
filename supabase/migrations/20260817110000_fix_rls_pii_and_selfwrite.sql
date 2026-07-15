-- ============================================================================
-- 20260817110000_fix_rls_pii_and_selfwrite.sql
-- Security fixes (audit 2026-07-16):
--   P0  profiles: a legacy `Public Profiles View USING (true)` policy let ANY
--       authenticated user read every user's email/businessProfile/
--       stripe_customer_id. Replace with own + tenant-co-member + admin reads.
--       Anonymous reads (marketing blog author names) are preserved but stay
--       limited to the safe columns already granted to `anon`
--       (id, name, avatar_url, role) by migration 20260512230000.
--   P1  subscriptions: a public `INSERT WITH CHECK (true)` + an unbounded owner
--       UPDATE let users self-grant plan/credits. Remove all user write policies;
--       writes happen via the signup trigger (SECURITY DEFINER) and
--       billing-webhook (service_role), both of which bypass RLS.
--   P1  audit_logs: a `SELECT USING (auth.uid() IS NOT NULL)` policy let any
--       authenticated user read every tenant's audit rows. Remove it; own/team/
--       admin read policies remain.
-- ============================================================================

-- Does the caller share any business / workspace / team with p_other?
-- SECURITY DEFINER so the membership lookups bypass RLS (no recursion) — mirrors
-- the existing is_business_member/is_workspace_member helpers.
CREATE OR REPLACE FUNCTION public.shares_tenant_with(p_other uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (SELECT 1 FROM business_members a JOIN business_members b ON a.business_id = b.business_id
             WHERE a.user_id = auth.uid() AND b.user_id = p_other)
 OR EXISTS (SELECT 1 FROM workspace_members a JOIN workspace_members b ON a.workspace_id = b.workspace_id
             WHERE a.user_id = auth.uid() AND b.user_id = p_other)
 OR EXISTS (SELECT 1 FROM team_members a JOIN team_members b ON a.team_id = b.team_id
             WHERE a.user_id = auth.uid() AND b.user_id = p_other);
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public Profiles View" ON public.profiles;

-- Authenticated users may read profiles of people they share a tenant with
-- (member lists, assignee names). Own + admin policies already exist.
DROP POLICY IF EXISTS "Tenant co-members can view profiles" ON public.profiles;
CREATE POLICY "Tenant co-members can view profiles" ON public.profiles
  FOR SELECT USING (public.shares_tenant_with(id));

-- Preserve anonymous reads (blog author name/avatar). Column privileges granted
-- to `anon` restrict this to (id, name, avatar_url, role) — no PII.
DROP POLICY IF EXISTS "Anon can view public profile fields" ON public.profiles;
CREATE POLICY "Anon can view public profile fields" ON public.profiles
  FOR SELECT TO anon USING (true);

-- ── subscriptions ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service can insert subscriptions" ON public.subscriptions; -- was WITH CHECK (true)
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
-- Reads (own/admin/support-session) and admin update remain. Writes are
-- service_role (billing-webhook) or the SECURITY DEFINER signup trigger.

-- ── audit_logs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view audit logs" ON public.audit_logs; -- was USING (auth.uid() IS NOT NULL)
-- "View Own Audit" (auth.uid()=user_id), "Team members can view team audit logs",
-- and "Admin View All Audit" remain. Client INSERT policies are untouched.
