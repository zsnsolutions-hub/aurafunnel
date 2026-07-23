-- Roadmap 6.1 — seat enforcement on the canonical invite + workspace member
-- role-change / removal RPCs (owner/admin-gated, last-owner-protected).
-- workspace_members had NO role-change path, and create_workspace_invite did no
-- seat check (the real overage hole). All SECURITY DEFINER, workspace-scoped.

-- ── 1. Seat enforcement inside the canonical invite ─────────────────────────
-- workspace.id == the owner's auth.uid(), so the owner's plan is profiles.plan
-- for v_ws. Free/Starter=1, Growth=3, Scale=10, everything else = unlimited (so a
-- plan-string mismatch never wrongly blocks a paid/enterprise account).
CREATE OR REPLACE FUNCTION public.create_workspace_invite(p_email text, p_role workspace_role DEFAULT 'member'::workspace_role, p_business_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
  v_token text;
  v_id uuid;
  v_plan text;
  v_seat_limit int;
  v_used int;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'message', 'Not authenticated'); end if;

  select workspace_id into v_ws from public.workspace_members
   where user_id = v_uid and role in ('owner','admin') order by joined_at asc limit 1;
  if v_ws is null then return jsonb_build_object('success', false, 'message', 'Only a workspace owner/admin can invite'); end if;

  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('success', false, 'message', 'A valid email is required');
  end if;
  if p_role = 'owner' then
    return jsonb_build_object('success', false, 'message', 'Cannot invite as owner');
  end if;

  if p_business_id is not null and not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.workspace_id = v_ws
  ) then
    return jsonb_build_object('success', false, 'message', 'Business is not in your workspace');
  end if;

  if exists (
    select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
     where m.workspace_id = v_ws and lower(p.email) = lower(p_email)
  ) then
    return jsonb_build_object('success', false, 'message', 'That person is already a member');
  end if;

  -- Seat check (members + other pending invites; the same-email pending is superseded below).
  select plan into v_plan from public.profiles where id = v_ws;
  v_seat_limit := case
    when v_plan is null or v_plan ilike '%free%'    then 1
    when v_plan ilike '%starter%'                   then 1
    when v_plan ilike '%growth%'                    then 3
    when v_plan ilike '%scale%'                     then 10
    else 999999
  end;
  select
    (select count(*) from public.workspace_members where workspace_id = v_ws)
    + (select count(*) from public.workspace_invites where workspace_id = v_ws and status = 'pending' and lower(email) <> lower(p_email))
    into v_used;
  if v_used >= v_seat_limit then
    return jsonb_build_object('success', false, 'message',
      format('Your plan includes %s seat(s). Upgrade to invite more teammates.', v_seat_limit));
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.workspace_invites set status = 'revoked'
    where workspace_id = v_ws and lower(email) = lower(p_email) and status = 'pending';

  insert into public.workspace_invites (workspace_id, email, role, business_id, name, invited_by, status, token, expires_at)
  values (v_ws, lower(p_email), p_role, p_business_id, p_name, v_uid, 'pending', v_token, now() + interval '7 days')
  returning id into v_id;

  insert into public.audit_logs (workspace_id, user_id, action, entity_type, entity_id, details)
  values (v_ws, v_uid, 'WORKSPACE_INVITE_CREATED', 'workspace_invite', v_id,
          jsonb_build_object('email', lower(p_email), 'role', p_role, 'business_id', p_business_id));

  return jsonb_build_object('success', true, 'invite_id', v_id, 'token', v_token, 'workspace_id', v_ws);
end $function$;

-- ── 2. Change a member's role ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_workspace_member_role(p_user_id uuid, p_role workspace_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_target_role workspace_role;
  v_owner_count int;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'message', 'Not authenticated'); end if;

  select workspace_id into v_ws from public.workspace_members
   where user_id = v_uid and role in ('owner','admin') order by joined_at asc limit 1;
  if v_ws is null then return jsonb_build_object('success', false, 'message', 'Only an owner/admin can change roles'); end if;

  select role into v_target_role from public.workspace_members where workspace_id = v_ws and user_id = p_user_id;
  if v_target_role is null then return jsonb_build_object('success', false, 'message', 'That person is not a member'); end if;

  -- Protect the last owner (can't demote the only owner).
  if v_target_role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count from public.workspace_members where workspace_id = v_ws and role = 'owner';
    if v_owner_count <= 1 then return jsonb_build_object('success', false, 'message', 'A workspace must keep at least one owner'); end if;
  end if;

  update public.workspace_members set role = p_role where workspace_id = v_ws and user_id = p_user_id;

  insert into public.audit_logs (workspace_id, user_id, action, entity_type, entity_id, details)
  values (v_ws, v_uid, 'WORKSPACE_MEMBER_ROLE_CHANGED', 'workspace_member', p_user_id,
          jsonb_build_object('from', v_target_role, 'to', p_role));

  return jsonb_build_object('success', true);
end $function$;

-- ── 3. Remove a member (owner/admin, or self-leave) ─────────────────────────
CREATE OR REPLACE FUNCTION public.remove_workspace_member(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_is_admin boolean;
  v_target_role workspace_role;
  v_owner_count int;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'message', 'Not authenticated'); end if;

  select workspace_id into v_ws from public.workspace_members
   where user_id = v_uid and role in ('owner','admin') order by joined_at asc limit 1;
  -- Self-leave is allowed even for non-admins; otherwise must be owner/admin.
  if v_ws is null then
    select workspace_id into v_ws from public.workspace_members where user_id = v_uid limit 1;
    if v_ws is null or p_user_id <> v_uid then
      return jsonb_build_object('success', false, 'message', 'Only an owner/admin can remove members');
    end if;
  end if;

  select role into v_target_role from public.workspace_members where workspace_id = v_ws and user_id = p_user_id;
  if v_target_role is null then return jsonb_build_object('success', false, 'message', 'That person is not a member'); end if;

  if v_target_role = 'owner' then
    select count(*) into v_owner_count from public.workspace_members where workspace_id = v_ws and role = 'owner';
    if v_owner_count <= 1 then return jsonb_build_object('success', false, 'message', 'A workspace must keep at least one owner'); end if;
  end if;

  delete from public.workspace_members where workspace_id = v_ws and user_id = p_user_id;

  insert into public.audit_logs (workspace_id, user_id, action, entity_type, entity_id, details)
  values (v_ws, v_uid, 'WORKSPACE_MEMBER_REMOVED', 'workspace_member', p_user_id,
          jsonb_build_object('role', v_target_role, 'self', p_user_id = v_uid));

  return jsonb_build_object('success', true);
end $function$;

GRANT EXECUTE ON FUNCTION public.update_workspace_member_role(uuid, workspace_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid) TO authenticated;
