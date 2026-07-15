-- A/B analytics, now reply-aware. Replies are the strongest conversion signal,
-- so the winner metric can prefer reply rate over clicks/opens. A reply is an
-- inbound_emails row whose reply_to_message_id points at the outbound message
-- (threaded via In-Reply-To → email_messages.provider_message_id by inbound-email).
-- Return-type changes require DROP before CREATE.
drop function if exists public.campaign_variant_stats(uuid);

create function public.campaign_variant_stats(p_campaign_id uuid)
returns table (step int, variant int, sent bigint, opened bigint, clicked bigint, replied bigint)
language sql stable security definer set search_path to 'public' as $$
  select
    coalesce(m.sequence_step, 0)   as step,
    coalesce(m.subject_variant, 0) as variant,
    count(*)                       as sent,
    count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.event_type = 'open'))  as opened,
    count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.event_type = 'click')) as clicked,
    count(*) filter (where exists (select 1 from public.inbound_emails ib where ib.reply_to_message_id = m.id))                as replied
  from public.email_messages m
  where m.sequence_id = p_campaign_id
    and m.owner_id = auth.uid()
  group by 1, 2
  order by 1, 2;
$$;
