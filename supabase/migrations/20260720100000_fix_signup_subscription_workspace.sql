-- ============================================================================
-- Fix broken signup: subscriptions.workspace_id is NOT NULL (FK -> workspaces),
-- but handle_new_user created the subscription WITHOUT workspace_id, and BEFORE
-- handle_new_user_workspace created the workspace. So every signup failed with
-- "null value in column workspace_id of relation subscriptions".
--
-- Fix: handle_new_user only creates the profile; the subscription moves into
-- handle_new_user_workspace, AFTER the workspace (id = user id) is created, with
-- workspace_id set. Idempotent (CREATE OR REPLACE).
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'CLIENT');
  return new;
end;
$function$;

create or replace function public.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into workspaces (id, name, owner_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'My Workspace'), new.id);

  insert into workspace_members (workspace_id, user_id, role)
  values (new.id, new.id, 'owner');

  insert into public.subscriptions (user_id, workspace_id, plan, status, expires_at)
  values (new.id, new.id, 'Starter', 'active', now() + interval '30 days');

  return new;
end;
$function$;
