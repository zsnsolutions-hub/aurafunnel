-- ============================================================================
-- 20260514120000_profiles_createdAt_generated.sql
-- ----------------------------------------------------------------------------
-- profiles had two timestamp columns: "createdAt" (legacy camelCase)
-- and created_at (canonical snake_case). They've stayed in sync because
-- no UPDATE statement writes either one and both default to now() on
-- insert. The duplicate-column smell was real but the rename path was
-- expensive (8+ consumer files across admin pages, billing, console
-- tabs all bind to user.createdAt / p.createdAt / u.createdAt).
--
-- Resolution: convert "createdAt" to a GENERATED ALWAYS AS (created_at)
-- STORED column. This makes the invariant explicit at the schema level —
-- "createdAt" CANNOT diverge from created_at — while preserving the
-- camelCase API surface that the app code already binds to. Zero app
-- changes. Disk cost is unchanged (same 8 bytes/row as today).
--
-- Pre-migration verification:
--   total_rows = 71, diverged_rows = 0, null counts on both = 0
-- so the drop-and-recreate doesn't lose any data.
--
-- Postgres requires DROP + ADD because you can't ALTER an existing
-- column to become generated — they're created as generated at the
-- moment of column add.
-- ============================================================================

alter table public.profiles
  drop column if exists "createdAt";

alter table public.profiles
  add column "createdAt" timestamptz
  generated always as (created_at) stored;

-- The deprecation comment from 20260513110000 is gone with the column.
-- Re-state intent on the new generated form.
comment on column public.profiles."createdAt" is
  'Generated alias of created_at. STORED so PostgREST exposes it like any other column. Retained for backward compatibility with admin/billing pages that bind to user.createdAt / p.createdAt. New code SHOULD read created_at directly; this column will be removed in a future pass once those bindings are migrated.';

comment on column public.profiles.created_at is
  'Canonical row-creation timestamp. The "createdAt" column is a stored generated mirror of this.';
