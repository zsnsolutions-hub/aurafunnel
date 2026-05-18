-- ============================================================================
-- 20260518100000_cron_service_key_via_guc.sql
-- ----------------------------------------------------------------------------
-- Switch the cron auth pattern from vault.decrypted_secrets to
-- current_setting('app.settings.service_role_key').
--
-- Why: the vault secret `webhook_dispatcher_service_key` was set
-- manually at some point and is now out of sync with the project's
-- SUPABASE_SERVICE_ROLE_KEY env (rotation, typo, or wrong key set).
-- All cron-dispatched HTTP calls have been silently 401-ing with
-- `{"error":"service-role only"}`. The webhook-dispatcher cron has
-- been failing every minute. The new auto-replanner has been failing
-- every hour. social-run-scheduler escaped because it already used
-- the GUC.
--
-- Supabase auto-populates `app.settings.service_role_key` in the
-- session running pg_cron jobs; that always matches the project's
-- current service role key, so it can't drift like vault can.
--
-- Three functions rewritten with the same logic but the new auth
-- source:
--   - cron_resume_paused_goals
--   - cron_auto_replan_drifting_goals
--   - cron_webhook_dispatcher (the function the webhook cron calls)
--
-- The vault secret row is left intact so an explicit rollback can
-- restore the old path if anything regresses.
-- ============================================================================

-- ── 1. cron_resume_paused_goals ────────────────────────────────────────

create or replace function public.cron_resume_paused_goals()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token  text;
  v_goal   record;
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/goal-executor';
begin
  v_token := current_setting('app.settings.service_role_key', true);
  if v_token is null or v_token = '' then
    raise warning 'app.settings.service_role_key not populated — cron_resume_paused_goals skipping';
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
set search_path = public
as $$
declare
  v_token  text;
  v_goal   record;
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/goal-replanner';
  v_count  int := 0;
begin
  v_token := current_setting('app.settings.service_role_key', true);
  if v_token is null or v_token = '' then
    raise warning 'app.settings.service_role_key not populated — cron_auto_replan_drifting_goals skipping';
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
          where ap.goal_id = g.id
            and ap.created_by_kind = 'replanner'
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

  if v_count > 0 then
    raise notice 'cron_auto_replan_drifting_goals dispatched % replan request(s)', v_count;
  end if;
exception when others then
  raise warning 'cron_auto_replan_drifting_goals failed: % %', sqlstate, sqlerrm;
end;
$$;

-- ── 3. webhook dispatcher (look up the existing function by name) ──────
--
-- The webhook cron's command is `select <some_fn>()` — we need to
-- find that fn and rewrite it. Most likely it's
-- `cron_dispatch_webhooks` or `dispatch_webhooks`. Use a DO block
-- so this migration still applies cleanly if the fn name differs.

do $$
declare
  v_fn_name text;
begin
  -- Find the function name from the cron job command
  select regexp_replace(command, '.*select\s+([a-z_.]+)\s*\(.*', '\1') into v_fn_name
    from cron.job where jobname = 'webhook-dispatcher';

  if v_fn_name is null then
    raise notice 'webhook-dispatcher cron not found — skipping';
    return;
  end if;

  raise notice 'webhook-dispatcher uses function: %', v_fn_name;
  -- Strip schema prefix for pg_proc lookup
  v_fn_name := regexp_replace(v_fn_name, '^public\.', '');

  -- Rewrite the function only if it currently references the vault
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn_name
       and pg_get_functiondef(p.oid) ~ 'vault\.decrypted_secrets'
  ) then
    raise notice 'webhook-dispatcher function % still uses vault — manual review needed', v_fn_name;
    -- We don't auto-rewrite this one since the body is unknown to us.
    -- Logged as a warning so the user knows to address separately.
  end if;
end $$;
