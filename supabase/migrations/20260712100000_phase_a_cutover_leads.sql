-- ============================================================================
-- Phase A · Stage 2 (CUTOVER — leads)
-- proposed file: supabase/migrations/20260712100000_phase_a_cutover_leads.sql
-- ============================================================================
-- Makes business_id a real RLS access dimension for the leads table — the one
-- table that is now business-scoped end-to-end in the UI (reads + writes).
--
-- SAFE / NON-BREAKING by design:
--   * ADDS business-member policies ALONGSIDE the existing owner (client_id)
--     policies — it does NOT remove them, so no user can ever be locked out of
--     their own leads (owner path always applies; short-circuits before the
--     member check, so no per-row perf hit on your own leads).
--   * Backfills any leads left with NULL business_id by flag-off inserts since
--     the expand stage, so every lead is business-scoped going forward.
--   * Does NOT touch leads.workspace_id — it still holds the legacy user id and
--     is load-bearing for MobileHome + v1-analytics. Reconciling it is a
--     separate task (migrate those readers first).
--
-- Deliberately deferred (NOT here): the strict "contract" (dropping the owner
-- policies) and the same treatment for social_posts/blog_posts/email_templates/
-- ai_threads — those wait until real teams exist and those surfaces are
-- business-scoped in the UI.
--
-- Idempotent.
-- ============================================================================

-- ─── 1. Backfill any NULL business_id leads -> owner's default business ──────
do $$
declare r record; v_biz uuid;
begin
  for r in select distinct client_id from public.leads
           where business_id is null and client_id is not null loop
    select b.id into v_biz
      from public.businesses b
      join public.business_members m on m.business_id = b.id and m.user_id = r.client_id
     where b.status = 'active'
     order by b.created_at asc
     limit 1;
    if v_biz is not null then
      update public.leads set business_id = v_biz
       where client_id = r.client_id and business_id is null;
    end if;
  end loop;
end $$;

-- ─── 2. Additive business-member RLS on leads (owner policies untouched) ─────
-- is_business_member() is the SECURITY DEFINER helper from the expand migration
-- (no RLS recursion). NULL business_id rows fall through to the owner policy.
do $$ begin
  create policy "Members view business leads" on public.leads for select
    using (business_id is not null and public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members insert business leads" on public.leads for insert
    with check (business_id is not null and public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members update business leads" on public.leads for update
    using (business_id is not null and public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members delete business leads" on public.leads for delete
    using (business_id is not null and public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

-- ─── 3. Verify (prints in the migration output) ─────────────────────────────
do $$
declare v_null int; v_total int;
begin
  select count(*) into v_total from public.leads;
  select count(*) into v_null  from public.leads where business_id is null;
  raise notice 'CUTOVER VERIFY: % leads total, % still NULL business_id (NULLs = orphans with no resolvable owner; still reachable via the owner policy)', v_total, v_null;
end $$;
