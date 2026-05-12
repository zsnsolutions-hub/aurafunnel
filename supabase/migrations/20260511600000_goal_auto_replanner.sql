-- ============================================================================
-- 20260511600000_goal_auto_replanner.sql
-- ----------------------------------------------------------------------------
-- Phase 6.3.b — Auto-replanner cron.
--
-- Closes the observer → replanner loop.
--
-- Every hour (offset :47 to avoid the observer's :37 slot), scans for
-- goals that have at least one fresh observation but no recently-created
-- replanner plan version. For each such goal, fires a pg_net POST at the
-- goal-replanner edge function (same vault-stored service-role token
-- the other crons reuse). The edge function performs the LLM call and
-- persists a new plan version atomically.
--
-- Guards (also enforced inside the edge fn — defence in depth):
--   - 6h cooldown: don't replan a goal twice in 6h.
--   - status filter: skip completed / cancelled / failed goals (terminal).
--   - per-tick limit: at most 20 goals per sweep, so a noisy day doesn't
--     spike Gemini spend.
-- ============================================================================

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
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'webhook_dispatcher_service_key'
  limit 1;

  if v_token is null then
    raise warning 'webhook_dispatcher_service_key vault secret missing — cron_auto_replan_drifting_goals skipping';
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
         -- there must be an active plan to revise
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

revoke all on function public.cron_auto_replan_drifting_goals() from public;
grant execute on function public.cron_auto_replan_drifting_goals() to service_role;

do $$ begin
  perform cron.unschedule('auto-replan-drifting-goals');
exception when others then null;
end $$;

select cron.schedule(
  'auto-replan-drifting-goals',
  '47 * * * *',  -- hourly, 10min after the observer at :37 so observations are visible
  $$select public.cron_auto_replan_drifting_goals();$$
);

comment on function public.cron_auto_replan_drifting_goals is
  'Phase 6.3.b — hourly. For each goal with a fresh observation and no recent replan, POSTs to the goal-replanner edge function so an LLM produces a revised plan version.';

-- ── Helper used by the UI to badge goals with pending drift ─────────────
--
-- Returns a per-goal count of observation rows in the last 24h. Avoids
-- shipping every observation row to the client just to render a chip.

create or replace function public.recent_goal_observation_counts(p_workspace_id uuid)
returns table (goal_id uuid, observation_count int, latest_kind text, latest_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    (wm.value->>'goal_id')::uuid as goal_id,
    count(*)::int                as observation_count,
    (array_agg(wm.value->>'kind' order by wm.created_at desc))[1] as latest_kind,
    max(wm.created_at)           as latest_at
  from public.workspace_memory wm
  where wm.workspace_id = p_workspace_id
    and wm.kind = 'observation'
    and wm.key like 'goal:%'
    and wm.created_at > now() - interval '24 hours'
    and exists (
      select 1 from public.workspace_members m
       where m.workspace_id = p_workspace_id
         and m.user_id = auth.uid()
    )
  group by 1;
$$;

revoke all on function public.recent_goal_observation_counts(uuid) from public;
grant execute on function public.recent_goal_observation_counts(uuid) to authenticated, service_role;

comment on function public.recent_goal_observation_counts is
  'Phase 6.3.b UI helper — per-goal aggregate of observation rows in the last 24h. Used by /portal/goals to render drift chips without fetching every observation value.';
