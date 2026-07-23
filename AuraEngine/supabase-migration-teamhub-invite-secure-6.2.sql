-- ============================================================================
-- Phase 6.2 — Secure the TeamHub board-invite pipeline (BUG-021 follow-on).
--
-- BEFORE: teamhub_invites had no token and no expiry; "accept" was a client-side
-- read-by-id + client insert into teamhub_flow_members. That path was BOTH
-- forgeable (accept by guessable id, never expires) AND functionally broken:
--   * invite_select RLS lets only existing board members read invites, so the
--     actual invitee could never read their own invite; and
--   * member_insert RLS requires the caller already be owner/admin, so the
--     invitee could never insert their own membership row.
-- There was also no accept UI caller at all and no email was ever sent.
--
-- AFTER: mirror the hardened workspace-invite pipeline —
--   create_teamhub_invite()  : owner/admin-gated, token + 7-day expiry, dedupes.
--   accept_teamhub_invite()  : SECURITY DEFINER, verifies token + invitee email +
--                              pending + not-expired, then joins the board.
--   invite_select_own policy : the invitee can read their OWN pending invite
--                              (by email) so an in-app banner can accept it.
-- Idempotent / additive; safe to re-run.
-- ============================================================================

-- 1) Columns: secret token, expiry, accepted-at ------------------------------
alter table public.teamhub_invites
  add column if not exists token       text,
  add column if not exists expires_at  timestamptz,
  add column if not exists accepted_at timestamptz;

-- Backfill a token for any pre-existing pending rows so nothing is left
-- accept-able by id alone.
update public.teamhub_invites
   set token = encode(extensions.gen_random_bytes(24), 'hex')
 where token is null;

update public.teamhub_invites
   set expires_at = created_at + interval '7 days'
 where expires_at is null;

create unique index if not exists teamhub_invites_token_key
  on public.teamhub_invites (token);

-- 2) Let the invitee read their OWN pending invite (by email) ----------------
-- The existing invite_select policy only lets board members read invites; the
-- invitee is not a member yet, so add a narrow self-read for the accept banner.
drop policy if exists invite_select_own on public.teamhub_invites;
create policy invite_select_own on public.teamhub_invites
  for select
  using (
    status = 'pending'
    and lower(email) = lower(coalesce(public.auth_email(), ''))
  );

-- 3) create_teamhub_invite ---------------------------------------------------
create or replace function public.create_teamhub_invite(
  p_board_id uuid,
  p_email    text,
  p_role     text default 'member'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_token text;
  v_id    uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  -- Caller must be an owner/admin of this board.
  if public.teamhub_user_flow_role(p_board_id) not in ('owner', 'admin') then
    return jsonb_build_object('success', false, 'message', 'Only a board owner/admin can invite');
  end if;

  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('success', false, 'message', 'A valid email is required');
  end if;

  if p_role not in ('admin', 'member', 'viewer') then
    return jsonb_build_object('success', false, 'message', 'Invalid role');
  end if;

  -- Already a member? (match by the profile email of current board members)
  if exists (
    select 1
      from public.teamhub_flow_members m
      join public.profiles p on p.id = m.user_id
     where m.board_id = p_board_id
       and lower(p.email) = lower(p_email)
  ) then
    return jsonb_build_object('success', false, 'message', 'That person is already a member of this board');
  end if;

  -- Supersede any existing pending invite for the same board + email.
  update public.teamhub_invites
     set status = 'revoked'
   where board_id = p_board_id
     and lower(email) = lower(p_email)
     and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.teamhub_invites (board_id, email, role, invited_by, status, token, expires_at)
  values (p_board_id, lower(p_email), p_role, v_uid, 'pending', v_token, now() + interval '7 days')
  returning id into v_id;

  return jsonb_build_object('success', true, 'invite_id', v_id, 'token', v_token);
end $$;

-- 4) accept_teamhub_invite ---------------------------------------------------
create or replace function public.accept_teamhub_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public.auth_email();
  v_inv   public.teamhub_invites%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  select * into v_inv from public.teamhub_invites where token = p_token;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Invite not found');
  end if;
  if lower(v_inv.email) is distinct from lower(coalesce(v_email, '')) then
    return jsonb_build_object('success', false, 'message', 'This invite is not for you');
  end if;
  if v_inv.status is distinct from 'pending' then
    return jsonb_build_object('success', false, 'message', 'Invite is no longer pending');
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    return jsonb_build_object('success', false, 'message', 'Invite has expired');
  end if;

  insert into public.teamhub_flow_members (board_id, user_id, role)
  values (v_inv.board_id, v_uid, v_inv.role)
  on conflict do nothing;

  update public.teamhub_invites
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  return jsonb_build_object('success', true, 'board_id', v_inv.board_id);
end $$;

grant execute on function public.create_teamhub_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_teamhub_invite(text)             to authenticated;
