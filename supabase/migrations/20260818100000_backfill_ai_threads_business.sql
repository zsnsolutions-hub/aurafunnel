-- ============================================================================
-- 20260818100000_backfill_ai_threads_business.sql
-- Phase 2 (tenancy), stage 1 — additive/reversible data backfill.
-- A small number of ai_threads predate the business_id column and are NULL.
-- Backfill each to the default (earliest) business of the thread's workspace.
-- Data-only; leaves rows whose workspace has no business untouched (none today).
-- No schema change; safe to re-run (only touches NULL rows).
-- ============================================================================
update public.ai_threads t
set business_id = (
  select b.id from public.businesses b
  where b.workspace_id = t.workspace_id
  order by b.created_at asc
  limit 1
)
where t.business_id is null
  and t.workspace_id is not null;
