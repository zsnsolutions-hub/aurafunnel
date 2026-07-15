-- A/B analytics: sent / opened / clicked per (step, subject variant) for a
-- campaign. Owner-scoped via auth.uid(). Opens & clicks live in email_events
-- (event_type 'open'/'click'), keyed by email_messages.id.
create or replace function public.campaign_variant_stats(p_campaign_id uuid)
returns table (step int, variant int, sent bigint, opened bigint, clicked bigint)
language sql stable security definer set search_path to 'public' as $$
  select
    coalesce(m.sequence_step, 0)   as step,
    coalesce(m.subject_variant, 0) as variant,
    count(*)                       as sent,
    count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.event_type = 'open'))  as opened,
    count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.event_type = 'click')) as clicked
  from public.email_messages m
  where m.sequence_id = p_campaign_id
    and m.owner_id = auth.uid()
  group by 1, 2
  order by 1, 2;
$$;
