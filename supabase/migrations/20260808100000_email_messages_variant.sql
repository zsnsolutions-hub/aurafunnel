-- Stamp the A/B subject variant onto sent messages so opens/clicks (email_events,
-- keyed by message) can be attributed per variant. sequence_id + sequence_step
-- already exist on email_messages.
alter table public.email_messages
  add column if not exists subject_variant smallint;

create index if not exists idx_email_messages_seq
  on public.email_messages (sequence_id, sequence_step) where sequence_id is not null;
