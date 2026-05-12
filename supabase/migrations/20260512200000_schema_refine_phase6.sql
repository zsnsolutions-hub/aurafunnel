-- ============================================================================
-- 20260512200000_schema_refine_phase6.sql
-- ----------------------------------------------------------------------------
-- Schema refinement pass after Phase 6.x and 4.x.
--
-- Four targeted changes:
--
--   1. workspace_memory index: extend (workspace_id, kind) → (workspace_id,
--      kind, key). The goal observer + auto-replanner both filter by all
--      three columns, plus a created_at recency window. Without the third
--      column in the index, every dedup check scans the whole bucket
--      for that (workspace_id, kind) — bloat grows with goal count.
--
--   2. workspace_feature_flags.created_at: only set_at exists today, so
--      we lose the original-creation timestamp on every toggle. Add
--      created_at default now(), backfill from set_at for existing rows.
--
--   3. Two FK indexes that were never created:
--        automation_goals.created_by  → FK to auth.users
--        workspace_feature_flags.set_by → FK to auth.users
--      Neither is hot today, but joins on user_id will scan otherwise.
--
-- No data deletions. No RLS or policy changes. No cron changes.
-- ============================================================================

-- ── 1. workspace_memory index ───────────────────────────────────────────
--
-- The new index is a strict superset of the old: leftmost-prefix matching
-- means any prior query on (workspace_id, kind) still hits the new index.

drop index if exists public.idx_workspace_memory_workspace_kind;

create index if not exists idx_workspace_memory_workspace_kind_key
  on public.workspace_memory (workspace_id, kind, key);

-- ── 2. workspace_feature_flags.created_at ───────────────────────────────

alter table public.workspace_feature_flags
  add column if not exists created_at timestamptz not null default now();

-- Backfill existing rows: their effective creation time is their first
-- (and so far only) set_at value. After this column-add the column has
-- already been populated from default now(), so we rewrite to set_at
-- to preserve audit truth. Coalesce so any rows that somehow have a
-- null set_at fall back to the default.
update public.workspace_feature_flags
   set created_at = coalesce(set_at, created_at)
 where set_at is not null
   and created_at >= now() - interval '5 minutes';   -- only just-added rows

-- ── 3. FK indexes ───────────────────────────────────────────────────────

create index if not exists idx_automation_goals_created_by
  on public.automation_goals (created_by)
  where created_by is not null;

create index if not exists idx_workspace_feature_flags_set_by
  on public.workspace_feature_flags (set_by)
  where set_by is not null;

-- ── Notes (not changes) ─────────────────────────────────────────────────
--
--   automation_step_runs.attempt_count is intentionally always 1 today.
--   The (plan_id, step_id, attempt_count) unique enforces single-row-per-
--   step under the current "mutate in place" design. The column is
--   forward-reserved for retry support; leaving the constraint as-is.
--
--   apollo_search_logs / apollo_import_logs are dormant (Apollo
--   integration hidden in commit f00f6a3) but explicitly retained at
--   user request — easy to flip Apollo back on later without losing
--   audit history.
