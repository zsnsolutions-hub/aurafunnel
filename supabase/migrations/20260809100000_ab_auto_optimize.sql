-- Opt-in A/B auto-optimize: once a subject variant is a statistically clear
-- winner, ab-autopause reassigns not-yet-sent items to it.
alter table public.email_sequences
  add column if not exists ab_auto_optimize boolean not null default false;
