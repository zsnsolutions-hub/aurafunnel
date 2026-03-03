-- Migration: Enable Supabase Realtime on job/email tables.
-- Phase C-0: Required before Realtime subscriptions work.

-- REPLICA IDENTITY FULL is required so Realtime sends the full row on UPDATE/DELETE.
-- Without it, only the primary key columns are included in change events.

ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER TABLE jobs REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE email_sequence_runs;
ALTER TABLE email_sequence_runs REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE email_sequence_run_items;
ALTER TABLE email_sequence_run_items REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE job_events;
ALTER TABLE job_events REPLICA IDENTITY FULL;
