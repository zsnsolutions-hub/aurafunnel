-- ============================================================================
-- 20260818120000_analytics_mv_business_scope.sql
-- Phase 2 (tenancy) — make email analytics business-scopeable. The MV was
-- already built on email_messages (which now carries business_id), so we add
-- business_id to the projection + GROUP BY and a matching unique index. The
-- refresh cron (REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary,
-- every 10 min) keeps working since the view name is unchanged.
-- Reversible: re-run the previous definition to revert.
-- ============================================================================

drop materialized view if exists public.email_analytics_summary;

create materialized view public.email_analytics_summary as
  select
    em.owner_id,
    em.business_id,
    date(em.created_at) as analytics_date,
    count(distinct em.id) as total_sent,
    count(distinct case when ee.event_type = 'open'  and ee.is_bot = false then ee.message_id end) as unique_opens,
    count(distinct case when ee.event_type = 'click' and ee.is_bot = false then ee.message_id end) as unique_clicks,
    count(case when ee.event_type = 'open'  and ee.is_bot = false then 1 end) as total_open_events,
    count(case when ee.event_type = 'click' and ee.is_bot = false then 1 end) as total_click_events
  from public.email_messages em
  left join public.email_events ee on em.id = ee.message_id
  group by em.owner_id, em.business_id, date(em.created_at);

-- Unique index required for REFRESH ... CONCURRENTLY. GROUP BY guarantees each
-- (owner_id, business_id, analytics_date) tuple is unique (incl. a single
-- null-business tuple per owner/day), so the index holds.
create unique index email_analytics_summary_owner_biz_date_idx
  on public.email_analytics_summary (owner_id, business_id, analytics_date);
