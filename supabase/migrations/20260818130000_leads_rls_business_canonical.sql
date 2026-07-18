-- ============================================================================
-- 20260818130000_leads_rls_business_canonical.sql
-- Phase 2 stage 2.4 (RLS cutover) — make business membership the canonical read/
-- write path for leads. Drop the redundant legacy per-creator client_id policies
-- for SELECT/UPDATE/DELETE; the "Members ... business leads" (is_business_member)
-- + admin + support policies remain.
--
-- SAFE: verified pre-migration that 0 leads have a client_id owner who is NOT a
-- member of the lead's business, so is_business_member(business_id) grants every
-- owner the same access the client_id policy did. (Re-check with:
--   select count(*) from leads l where l.business_id is not null and not exists (
--     select 1 from business_members m where m.business_id=l.business_id and m.user_id=l.client_id);
-- must be 0.)
--
-- INSERT keeps its legacy "Users can insert own leads" policy on purpose so lead
-- creation never fails if business_id is momentarily unset (client always stamps
-- it via activeBusinessId(); this is a safety valve, not an isolation gap —
-- client_id = auth.uid() only permits inserting leads you own).
--
-- Reversible: recreate the dropped policies to revert.
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own leads"   ON public.leads; -- SELECT (auth.uid()=client_id)
DROP POLICY IF EXISTS "Users can update own leads" ON public.leads; -- UPDATE
DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads; -- DELETE
