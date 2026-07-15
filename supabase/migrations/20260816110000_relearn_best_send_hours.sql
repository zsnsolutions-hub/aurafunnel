-- Best-time send: RE-LEARN over the life of a run.
--
-- start-email-sequence-run stamps each item's best_send_hour once at launch from
-- the lead's historical opens. Multi-step sequences run for days/weeks, during
-- which a lead's engagement pattern (or their very first opens) can change what
-- their best hour is. This RPC recomputes the modal UTC open-hour for every lead
-- with unsent items in an active best-time run and updates best_send_hour in place.
-- process-sequence-sends then gates on the refreshed value automatically.
--
-- Only touches pending/written items (already-sent are immutable) in runs where
-- sequence_config.sendBestTime is true. Requires >=2 opens in the last 90d, same
-- threshold as the launch-time learner.

create or replace function public.relearn_best_send_hours()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_updated integer;
begin
  with lead_best as (
    select
      em.lead_id,
      mode() within group (order by extract(hour from (e.created_at at time zone 'UTC'))::int) as best_hour
    from public.email_events e
    join public.email_messages em on em.id = e.message_id
    where e.event_type = 'open'
      and e.created_at > now() - interval '90 days'
      and em.lead_id is not null
    group by em.lead_id
    having count(*) >= 2
  )
  update public.email_sequence_run_items it
    set best_send_hour = lb.best_hour,
        updated_at = now()
  from public.email_sequence_runs r,
       lead_best lb
  where it.run_id = r.id
    and r.status = 'processing'
    and coalesce((r.sequence_config->>'sendBestTime')::boolean, false)
    and it.status in ('pending', 'written')
    and it.lead_id = lb.lead_id
    and it.best_send_hour is distinct from lb.best_hour;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- Re-learn every 6 hours (pure SQL — no edge fn / vault secret needed).
do $$ begin
  perform cron.unschedule('relearn-best-send-hours');
exception when others then null;
end $$;

select cron.schedule('relearn-best-send-hours', '23 */6 * * *', 'select public.relearn_best_send_hours();');
