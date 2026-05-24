-- ============================================================================
-- 20260524120000_create_my_workspace_rpc.sql
-- ----------------------------------------------------------------------------
-- Self-service workspace recovery for the auth'd user.
--
-- Background: workspaces auto-create via the handle_new_user_workspace
-- trigger on auth.users (added 2026-03-05). Accounts created before that
-- date, or any account whose trigger silently failed, end up with no
-- workspace_members row. resolveWorkspaceForUser() then returns null and
-- the portal renders dead-end empty states like "No workspace found".
--
-- This RPC lets the affected user fix themselves without an operator
-- running SQL. Idempotent: re-running is a no-op once the workspace
-- exists. SECURITY DEFINER because RLS on workspaces/workspace_members
-- requires the row to exist before the policy lets the user write it.
-- ============================================================================

create or replace function public.create_my_workspace()
returns table (
  workspace_id uuid,
  created      boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_email    text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Already a member of a workspace? Return that and bail.
  select wm.workspace_id into v_existing
    from public.workspace_members wm
   where wm.user_id = v_user_id
   order by wm.joined_at asc
   limit 1;

  if v_existing is not null then
    workspace_id := v_existing;
    created      := false;
    return next;
    return;
  end if;

  -- Mirror handle_new_user_workspace: workspace.id = user.id, owner = user,
  -- name = full_name from auth metadata if present else 'My Workspace'.
  select coalesce(u.raw_user_meta_data->>'full_name', 'My Workspace')
    into v_email
    from auth.users u
   where u.id = v_user_id;

  insert into public.workspaces (id, name, owner_id)
  values (v_user_id, coalesce(v_email, 'My Workspace'), v_user_id)
  on conflict (id) do nothing;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_user_id, v_user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  workspace_id := v_user_id;
  created      := true;
  return next;
end;
$$;

revoke all on function public.create_my_workspace() from public;
grant execute on function public.create_my_workspace() to authenticated;

comment on function public.create_my_workspace is
  'Self-service recovery: idempotently creates a workspace + owner membership for auth.uid(). Used by Quick Launch and other portal surfaces that surface "No workspace found" empty states.';
