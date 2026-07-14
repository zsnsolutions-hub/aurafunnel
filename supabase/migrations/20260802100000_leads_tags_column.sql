-- ============================================================================
-- Lead manual tags. The bulk "tag" action wrote leads.tags, but the column never
-- existed — so every tag update silently errored (the client didn't check the
-- error and showed a false success). Add the column so tags actually persist.
-- text[] to match the client's string-array writes. Idempotent.
-- ============================================================================

alter table public.leads
  add column if not exists tags text[] not null default '{}'::text[];
