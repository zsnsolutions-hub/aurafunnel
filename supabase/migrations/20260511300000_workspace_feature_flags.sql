-- ============================================================================
-- 20260511300000_workspace_feature_flags.sql
-- ----------------------------------------------------------------------------
-- Phase 6.2.b — per-workspace feature flag table.
--
-- Used initially by the goal-executor to gate live-mode execution. The
-- design supports any future feature flag without further schema changes.
--
-- Reads: workspace members can SELECT to know which flags are enabled.
-- Writes: workspace members can INSERT/UPDATE to toggle — we trust the
-- in-workspace identity check from RLS. If a future flag needs stronger
-- gating (e.g. only an Org Admin can toggle), the hasPermission() helper
-- in the client layer handles that.
-- ============================================================================

create table if not exists public.workspace_feature_flags (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  flag_key      text not null,
  enabled       boolean not null default false,
  set_by        uuid references auth.users(id) on delete set null,
  set_at        timestamptz not null default now(),
  metadata      jsonb,
  primary key (workspace_id, flag_key)
);

create index if not exists idx_workspace_feature_flags_enabled
  on public.workspace_feature_flags (workspace_id)
  where enabled = true;

alter table public.workspace_feature_flags enable row level security;

create policy wff_select on public.workspace_feature_flags
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy wff_upsert on public.workspace_feature_flags
  for insert with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy wff_update on public.workspace_feature_flags
  for update using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- ── workspace_has_flag(workspace_id, flag_key) ─────────────────────────────
--
-- SECURITY DEFINER lookup used by edge functions (which run as service_role
-- but want a single source of truth for "is this flag on for this workspace").

create or replace function public.workspace_has_flag(
  p_workspace_id uuid,
  p_flag_key     text
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select enabled
       from public.workspace_feature_flags
      where workspace_id = p_workspace_id
        and flag_key = p_flag_key
      limit 1),
    false
  );
$$;

revoke all on function public.workspace_has_flag(uuid, text) from public;
grant execute on function public.workspace_has_flag(uuid, text) to authenticated, service_role;

comment on table public.workspace_feature_flags is
  'Phase 6.2.b — per-workspace feature flag toggles. Used by goal-executor for goal_executor_live mode; future per-workspace gates plug in here without further schema changes.';
