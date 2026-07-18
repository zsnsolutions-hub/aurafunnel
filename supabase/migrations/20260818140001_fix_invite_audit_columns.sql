-- 20260818140001_fix_invite_audit_columns.sql
-- Corrective: the invite RPCs' audit inserts used resource_type/resource_id;
-- audit_logs actually has entity_type/entity_id. Re-define with correct columns.

create or replace function public.create_workspace_invite(
  p_email text, p_role public.workspace_role default 'member', p_business_id uuid default null, p_name text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
  v_token text;
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'message', 'Not authenticated'); end if;

  -- Caller must be owner/admin of a workspace (the workspace they're inviting to).
  select workspace_id into v_ws from public.workspace_members
   where user_id = v_uid and role in ('owner','admin') order by joined_at asc limit 1;
  if v_ws is null then return jsonb_build_object('success', false, 'message', 'Only a workspace owner/admin can invite'); end if;

  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('success', false, 'message', 'A valid email is required');
  end if;
  if p_role = 'owner' then
    return jsonb_build_object('success', false, 'message', 'Cannot invite as owner');
  end if;

  -- Optional business assignment must belong to this workspace.
  if p_business_id is not null and not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.workspace_id = v_ws
  ) then
    return jsonb_build_object('success', false, 'message', 'Business is not in your workspace');
  end if;

  -- Don't invite someone already a member of the workspace.
  if exists (
    select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
     where m.workspace_id = v_ws and lower(p.email) = lower(p_email)
  ) then
    return jsonb_build_object('success', false, 'message', 'That person is already a member');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  -- Supersede any existing pending invite for the same email+workspace.
  update public.workspace_invites set status = 'revoked'
    where workspace_id = v_ws and lower(email) = lower(p_email) and status = 'pending';

  insert into public.workspace_invites (workspace_id, email, role, business_id, name, invited_by, status, token, expires_at)
  values (v_ws, lower(p_email), p_role, p_business_id, p_name, v_uid, 'pending', v_token, now() + interval '7 days')
  returning id into v_id;

  insert into public.audit_logs (workspace_id, user_id, action, entity_type, entity_id, details)
  values (v_ws, v_uid, 'WORKSPACE_INVITE_CREATED', 'workspace_invite', v_id::text,
          jsonb_build_object('email', lower(p_email), 'role', p_role, 'business_id', p_business_id));

  return jsonb_build_object('success', true, 'invite_id', v_id, 'token', v_token, 'workspace_id', v_ws);
end $$;

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.auth_email();
  v_inv public.workspace_invites%rowtype;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'message', 'Not authenticated'); end if;

  select * into v_inv from public.workspace_invites where token = p_token;
  if not found then return jsonb_build_object('success', false, 'message', 'Invite not found'); end if;
  if lower(v_inv.email) is distinct from lower(coalesce(v_email, '')) then
    return jsonb_build_object('success', false, 'message', 'This invite is not for you');
  end if;
  if v_inv.status is distinct from 'pending' then
    return jsonb_build_object('success', false, 'message', 'Invite is no longer pending');
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    return jsonb_build_object('success', false, 'message', 'Invite has expired');
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_uid, v_inv.role)
  on conflict do nothing;

  if v_inv.business_id is not null then
    insert into public.business_members (business_id, user_id, role)
    values (v_inv.business_id, v_uid, v_inv.role::text)
    on conflict do nothing;
  end if;

  update public.workspace_invites set status = 'accepted', accepted_at = now() where id = v_inv.id;

  insert into public.audit_logs (workspace_id, user_id, action, entity_type, entity_id, details)
  values (v_inv.workspace_id, v_uid, 'WORKSPACE_INVITE_ACCEPTED', 'workspace_invite', v_inv.id::text,
          jsonb_build_object('role', v_inv.role, 'business_id', v_inv.business_id));

  return jsonb_build_object('success', true, 'workspace_id', v_inv.workspace_id, 'business_id', v_inv.business_id);
end $$;

create or replace function public.revoke_workspace_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_inv public.workspace_invites%rowtype;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'message', 'Not authenticated'); end if;
  select * into v_inv from public.workspace_invites where id = p_invite_id;
  if not found then return jsonb_build_object('success', false, 'message', 'Invite not found'); end if;
  if not exists (select 1 from public.workspace_members where workspace_id = v_inv.workspace_id and user_id = v_uid and role in ('owner','admin')) then
    return jsonb_build_object('success', false, 'message', 'Not authorized');
  end if;
  update public.workspace_invites set status = 'revoked' where id = p_invite_id;
  insert into public.audit_logs (workspace_id, user_id, action, entity_type, entity_id)
  values (v_inv.workspace_id, v_uid, 'WORKSPACE_INVITE_REVOKED', 'workspace_invite', p_invite_id::text);
  return jsonb_build_object('success', true);
end $$;
