-- Materialized view for email analytics summary
-- Pre-aggregates email analytics to avoid expensive joins at query time.

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

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX ON email_analytics_summary(owner_id, analytics_date);

-- Grant read access via PostgREST
GRANT SELECT ON email_analytics_summary TO anon, authenticated, service_role;
