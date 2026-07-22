-- Roadmap 1.5 / BUG-028 — server-side lead search.
--
-- useLeads() now filters leads server-side with case-insensitive INFIX matches:
--   first_name ILIKE '%term%' OR last_name ILIKE '%term%'
--   OR primary_email ILIKE '%term%' OR company ILIKE '%term%'
--
-- The pre-existing idx_leads_*_search indexes use text_pattern_ops, which only
-- accelerate PREFIX ('term%') matches — useless for the infix search above. Trigram
-- (pg_trgm) GIN indexes accelerate arbitrary ILIKE/%…% on the raw columns.
--
-- Idempotent; safe to re-run. Search works without these (sequential scan) — they
-- are purely a performance measure for large workspaces. Uses CONCURRENTLY so it
-- won't lock the leads table on a live DB; run each statement outside a txn block.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_first_name_trgm
  ON public.leads USING gin (first_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_last_name_trgm
  ON public.leads USING gin (last_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_company_trgm
  ON public.leads USING gin (company gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_primary_email_trgm
  ON public.leads USING gin (primary_email gin_trgm_ops);
