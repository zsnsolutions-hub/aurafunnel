-- Enable pg_cron extension (available on Supabase by default)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule materialized view refresh every 10 minutes
SELECT cron.schedule(
  'refresh-email-analytics',
  '*/10 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary'
);
