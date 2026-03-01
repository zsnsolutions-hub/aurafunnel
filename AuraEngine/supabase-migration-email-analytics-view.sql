-- Materialized view for email analytics summary
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- This pre-aggregates email analytics data to avoid expensive joins at query time.

CREATE MATERIALIZED VIEW IF NOT EXISTS email_analytics_summary AS
SELECT
  em.owner_id,
  DATE(em.created_at) AS analytics_date,
  COUNT(DISTINCT em.id) AS total_sent,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'open' AND ee.is_bot = false THEN ee.message_id END) AS unique_opens,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'click' AND ee.is_bot = false THEN ee.message_id END) AS unique_clicks,
  COUNT(CASE WHEN ee.event_type = 'open' AND ee.is_bot = false THEN 1 END) AS total_open_events,
  COUNT(CASE WHEN ee.event_type = 'click' AND ee.is_bot = false THEN 1 END) AS total_click_events
FROM email_messages em
LEFT JOIN email_events ee ON em.id = ee.message_id
GROUP BY em.owner_id, DATE(em.created_at);

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX ON email_analytics_summary(owner_id, analytics_date);

-- Schedule automatic refresh every 10 minutes via pg_cron
-- Note: pg_cron must be enabled in Supabase (Dashboard → Database → Extensions → pg_cron)
SELECT cron.schedule(
  'refresh-email-analytics',
  '*/10 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary'
);
