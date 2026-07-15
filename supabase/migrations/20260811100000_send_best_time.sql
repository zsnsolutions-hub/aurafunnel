-- Per-recipient send-time optimization. best_send_hour (UTC) is learned from each
-- lead's historical open events at launch; the sender holds the email until that
-- hour. No per-lead timezone needed — opens already encode local active time.
alter table public.email_sequences
  add column if not exists send_best_time boolean not null default false;
alter table public.email_sequence_run_items
  add column if not exists best_send_hour smallint;
