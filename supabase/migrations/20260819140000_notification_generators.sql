-- ============================================================================
-- 20260819140000_notification_generators.sql
-- BUG-043 follow-through — "notifications are not a real system".
--
-- Most of that finding has since been built: the table exists with owner-scoped
-- RLS (select + update only; no user INSERT, writes are service_role), the bell
-- has a real unread count, and DailyBriefing renders real rows. What was still
-- true is that almost NOTHING generated them — `deliver-task-reminders` was the
-- only writer, so the table sat at zero rows and the bell never lit up.
--
-- This adds the one-line writer that generators call, so wiring a new event is
-- a single RPC rather than a hand-rolled insert with its own workspace lookup.
-- Callers are service_role edge functions (sequence sends, lead enrichment,
-- domain verification).
-- ============================================================================

create or replace function public.notify_user(
  p_user_id      uuid,
  p_type         text,
  p_title        text,
  p_message      text default null,
  p_link         text default null,
  p_workspace_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ws uuid;
  v_id uuid;
begin
  if p_user_id is null or coalesce(p_title, '') = '' then
    return null;   -- nothing useful to show; never abort the caller's real work
  end if;

  -- workspace_id is NOT NULL on the table. Prefer the caller's value, else the
  -- user's first workspace, else fall back to the legacy workspace_id == user.id
  -- convention (see the tenancy notes — auto-created workspaces share the uuid).
  v_ws := p_workspace_id;
  if v_ws is null then
    select workspace_id into v_ws
      from public.workspace_members
     where user_id = p_user_id
     order by joined_at asc
     limit 1;
  end if;
  v_ws := coalesce(v_ws, p_user_id);

  insert into public.notifications (workspace_id, user_id, type, title, message, link, is_read)
  values (v_ws, p_user_id,
          case when p_type in ('info','success','warning','error','task_reminder')
               then p_type else 'info' end,
          p_title, p_message, p_link, false)
  returning id into v_id;

  return v_id;
end $$;

-- service_role only. The browser must never mint its own notifications — the
-- table has no user INSERT policy precisely so the bell can't be spoofed.
revoke execute on function public.notify_user(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant  execute on function public.notify_user(uuid, text, text, text, text, uuid)
  to service_role;

comment on function public.notify_user(uuid, text, text, text, text, uuid) is
  'Server-side notification writer. service_role only — callers are edge '
  'functions reacting to real events. Returns null instead of raising when the '
  'input is unusable, so a notification failure never fails the work that '
  'triggered it.';
