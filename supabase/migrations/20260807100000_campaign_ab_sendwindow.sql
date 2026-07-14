-- ============================================================================
-- A/B subject variants + send-time window for campaigns.
--   • sequence_steps.subject_variants — alternate subject lines (the main
--     `subject` is variant A). Rotated across leads at send.
--   • email_sequence_run_items.subject_variant — which variant a row used (0=A).
--   • email_sequences send-window columns — only dispatch within these hours /
--     weekdays in the given timezone (null window = send anytime).
-- ============================================================================

alter table public.sequence_steps
  add column if not exists subject_variants text[] not null default '{}'::text[];

alter table public.email_sequence_run_items
  add column if not exists subject_variant smallint;

alter table public.email_sequences
  add column if not exists send_window_start  smallint,             -- hour 0-23; null = anytime
  add column if not exists send_window_end    smallint,             -- hour 0-23
  add column if not exists send_weekdays_only boolean not null default false,
  add column if not exists send_timezone      text;                 -- IANA tz; null = UTC
