-- ============================================================================
-- 20260518120000_cron_auth_hybrid.sql
-- ----------------------------------------------------------------------------
-- Revise the cron auth pattern to try BOTH sources:
--   1. current_setting('app.settings.service_role_key', true) — works on
--      Supabase projects where the platform populates the cron GUC
--   2. vault.decrypted_secrets where name = 'webhook_dispatcher_service_key'
--      — works once the vault secret is set to the current service role key
--
-- Discovered today that on this specific project NEITHER source currently
-- yields a working token:
--   - the vault secret has drifted (all calls 401 with "service-role only")
--   - app.settings.service_role_key is NULL in pg_cron sessions
--
-- This migration's fallback chain ensures whichever the operator fixes
-- first, the crons immediately resume. No more silently 401-ing.
--
-- Manual operator action still required: either
--   A) Update vault: select vault.update_secret('<id>', '<jwt>'...)
--   B) Set GUC:      alter database postgres set app.settings.service_role_key = '<jwt>'
-- where <jwt> is the current service_role key from
-- Supabase Dashboard → Project Settings → API.
-- ============================================================================

-- ── 1. cron_resume_paused_goals ────────────────────────────────────────

create or replace function public.cron_resume_paused_goals()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token  text;
  v_goal   record;
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/goal-executor';
begin
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'cron_resume_paused_goals: no service-role token in GUC or vault — skipping';
    return;
  end if;

  for v_goal in
    select goal_id from public.claim_resumable_goal_step_runs(20)
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := jsonb_build_object(
        'goal_id', v_goal.goal_id,
        'mode',    'live',
        'resume',  true
      ),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$$;

-- ── 2. cron_auto_replan_drifting_goals ─────────────────────────────────

create or replace function public.cron_auto_replan_drifting_goals()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token  text;
  v_goal   record;
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/goal-replanner';
  v_count  int := 0;
begin
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'cron_auto_replan_drifting_goals: no service-role token in GUC or vault — skipping';
    return;
  end if;

  for v_goal in
    select g.id, g.workspace_id
      from public.automation_goals g
     where g.status in ('planned','active','running','paused')
       and exists (
         select 1 from public.workspace_memory wm
          where wm.workspace_id = g.workspace_id
            and wm.kind = 'observation'
            and wm.key = 'goal:' || g.id::text
            and wm.created_at > now() - interval '24 hours'
       )
       and not exists (
         select 1 from public.automation_plans ap
          where ap.goal_id = g.id and ap.created_by_kind = 'replanner'
            and ap.created_at > now() - interval '6 hours'
       )
       and exists (
         select 1 from public.automation_plans ap
          where ap.goal_id = g.id and ap.is_active = true
       )
     order by g.updated_at asc
     limit 20
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := jsonb_build_object('goal_id', v_goal.id),
      timeout_milliseconds := 60000
    );
    v_count := v_count + 1;
  end loop;
exception when others then
  raise warning 'cron_auto_replan_drifting_goals failed: % %', sqlstate, sqlerrm;
end;
$$;

-- ── 3. invoke_webhook_dispatcher ───────────────────────────────────────

create or replace function public.invoke_webhook_dispatcher()
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/webhook-dispatcher';
  v_token  text;
  v_req_id bigint;
begin
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_webhook_dispatcher: no service-role token in GUC or vault — skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) into v_req_id;

  return v_req_id;
end;
$$;
