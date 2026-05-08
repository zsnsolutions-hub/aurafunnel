-- ============================================================================
-- 20260508200000_campaign_memory_sequence_outcome.sql
-- ----------------------------------------------------------------------------
-- Phase 2.2 — second feedback writer for the AI memory layer.
--
-- When an email sequence run has completed sending and enough time has
-- passed for opens/clicks/replies to land, write a `campaign_memory` row
-- summarising the outcome. The AI's `generateEmailSequence` can then
-- recall what worked (and what didn't) when authoring future sequences.
--
-- Two pieces:
--   1. log_campaign_memory_sequence_outcome(p_run_id)
--      Aggregates events for emails belonging to a run, computes rates,
--      inserts one campaign_memory row.
--   2. pg_cron job
--      Hourly sweep: pick up runs completed 48h+ ago that don't yet have
--      an outcome row, call the writer for each.
--
-- Why a 48h delay: opens drift in over hours; replies sometimes over days.
-- Writing the row immediately at finalize would record near-zero metrics.
-- 48h gives a representative window without being so slow the AI never
-- gets the signal.
--
-- Errors are swallowed (RAISE WARNING). A failed memory write must never
-- block the sending pipeline or the cron job.
-- ============================================================================

-- ── 1. Outcome writer ─────────────────────────────────────────────────────

create or replace function public.log_campaign_memory_sequence_outcome(
  p_run_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run            email_sequence_runs%rowtype;
  v_workspace_id   uuid;
  v_message_ids    uuid[];
  v_sent           int;
  v_unique_opens   int;
  v_unique_clicks  int;
  v_replies        int;
  v_bounces        int;
  v_open_rate      numeric(5,4);
  v_click_rate     numeric(5,4);
  v_reply_rate     numeric(5,4);
  v_bounce_rate    numeric(5,4);
  v_already        int;
begin
  -- Idempotency: skip if an outcome row already exists for this run.
  select count(*) into v_already
  from public.campaign_memory
  where campaign_kind = 'email_sequence'
    and campaign_id = p_run_id::text
    and kind = 'outcome';
  if v_already > 0 then return; end if;

  -- Pull the run.
  select * into v_run from public.email_sequence_runs where id = p_run_id;
  if v_run.id is null or v_run.status <> 'completed' then return; end if;

  -- Resolve workspace_id. Prefer the run's own column; fall back to leads.
  v_workspace_id := v_run.workspace_id;
  if v_workspace_id is null then
    select l.workspace_id
      into v_workspace_id
      from public.email_sequence_run_items i
      join public.leads l on l.id = i.lead_id
      where i.run_id = p_run_id
      limit 1;
  end if;
  if v_workspace_id is null then return; end if;

  -- Collect all email_messages.id for emails sent as part of this run.
  -- finalize_email_sequence_run sets scheduled_emails.sequence_id = run_id::text,
  -- and send-email carries that into email_messages.sequence_id.
  select coalesce(array_agg(em.id), '{}')
    into v_message_ids
    from public.email_messages em
    where em.sequence_id = p_run_id::text;

  v_sent := coalesce(array_length(v_message_ids, 1), 0);
  if v_sent = 0 then
    -- No messages tied back to this run yet — likely too early; bail.
    return;
  end if;

  -- Aggregate events. UNIQUE per message for opens/clicks (one human, many opens).
  select
    count(distinct case when ee.event_type = 'open'    and not ee.is_bot and not ee.is_apple_privacy then ee.message_id end),
    count(distinct case when ee.event_type = 'click'   and not ee.is_bot then ee.message_id end),
    count(*) filter (where ee.event_type = 'replied'),
    count(*) filter (where ee.event_type = 'bounced')
    into v_unique_opens, v_unique_clicks, v_replies, v_bounces
    from public.email_events ee
    where ee.message_id = any (v_message_ids);

  v_open_rate   := round(v_unique_opens::numeric / v_sent, 4);
  v_click_rate  := round(v_unique_clicks::numeric / v_sent, 4);
  v_reply_rate  := round(v_replies::numeric       / v_sent, 4);
  v_bounce_rate := round(v_bounces::numeric       / v_sent, 4);

  insert into public.campaign_memory (
    workspace_id, campaign_kind, campaign_id, kind, value,
    metric_value, source, confidence, tags
  ) values (
    v_workspace_id,
    'email_sequence',
    p_run_id::text,
    'outcome',
    jsonb_build_object(
      'sent',          v_sent,
      'unique_opens',  v_unique_opens,
      'unique_clicks', v_unique_clicks,
      'replies',       v_replies,
      'bounces',       v_bounces,
      'open_rate',     v_open_rate,
      'click_rate',    v_click_rate,
      'reply_rate',    v_reply_rate,
      'bounce_rate',   v_bounce_rate,
      'lead_count',    v_run.lead_count,
      'step_count',    v_run.step_count,
      'tone',          v_run.sequence_config->>'tone',
      'goal',          v_run.sequence_config->>'goal',
      'cadence',       v_run.sequence_config->>'cadence',
      'started_at',    v_run.started_at,
      'completed_at',  v_run.completed_at
    ),
    -- Headline metric: reply_rate when present (strongest signal),
    -- otherwise open_rate.
    case when v_replies > 0 then v_reply_rate else v_open_rate end,
    'sequence_completion',
    -- Higher confidence when audience was bigger (smaller samples are noisier).
    case
      when v_sent >= 100 then 0.90
      when v_sent >=  30 then 0.75
      when v_sent >=  10 then 0.60
      else                    0.45
    end,
    array['email_sequence', 'outcome',
          (v_run.sequence_config->>'tone'),
          (v_run.sequence_config->>'goal')]
      || case when v_replies > 0 then array['has_replies'] else array[]::text[] end
  );
exception when others then
  raise warning 'log_campaign_memory_sequence_outcome failed for %: % %', p_run_id, sqlstate, sqlerrm;
end;
$$;

revoke all on function public.log_campaign_memory_sequence_outcome(uuid) from public;
grant execute on function public.log_campaign_memory_sequence_outcome(uuid) to service_role;

comment on function public.log_campaign_memory_sequence_outcome is
  'Phase 2.2 memory writer. Aggregates email_events for a completed email_sequence_runs row and inserts a campaign_memory(kind=outcome) row with the resulting open/click/reply/bounce rates. Idempotent. Errors warned, not raised.';

-- ── 2. Cron sweep ─────────────────────────────────────────────────────────
--
-- Every hour, pick up to 50 runs that are:
--   - status = completed
--   - completed_at between 48h and 60d ago (window: long enough for events
--     to land, short enough that we don't keep reprocessing ancient runs)
--   - have no campaign_memory(outcome) row yet
-- and call the writer for each.

create or replace function public.cron_sweep_campaign_outcomes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  for v_run_id in
    select r.id
      from public.email_sequence_runs r
      where r.status = 'completed'
        and r.completed_at < now() - interval '48 hours'
        and r.completed_at > now() - interval '60 days'
        and not exists (
          select 1 from public.campaign_memory cm
          where cm.campaign_kind = 'email_sequence'
            and cm.campaign_id   = r.id::text
            and cm.kind          = 'outcome'
        )
      order by r.completed_at desc
      limit 50
  loop
    perform public.log_campaign_memory_sequence_outcome(v_run_id);
  end loop;
end;
$$;

revoke all on function public.cron_sweep_campaign_outcomes() from public;
grant execute on function public.cron_sweep_campaign_outcomes() to service_role;

comment on function public.cron_sweep_campaign_outcomes is
  'Hourly pg_cron worker that finds completed sequence runs without a memory outcome row and calls log_campaign_memory_sequence_outcome for each. Capped at 50 per tick.';

-- Schedule the sweep. unschedule first so this migration is safely re-runnable.
do $$
begin
  perform cron.unschedule('campaign-memory-outcome-sweep');
exception when others then null;
end $$;

select cron.schedule(
  'campaign-memory-outcome-sweep',
  '17 * * * *',  -- offset from the analytics refresh (which runs every 10 min)
  $$select public.cron_sweep_campaign_outcomes();$$
);
