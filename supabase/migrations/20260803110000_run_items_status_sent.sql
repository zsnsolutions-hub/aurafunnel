-- ============================================================================
-- The email_sequence_run_items status CHECK allowed only pending/writing/
-- written/failed — there was no 'sent' (or transient 'sending') state, because a
-- send stage never existed. Widen it so process-sequence-sends can claim
-- ('sending') and complete ('sent'). Additive; existing values unaffected.
-- ============================================================================

alter table public.email_sequence_run_items
  drop constraint if exists email_sequence_run_items_status_check;

alter table public.email_sequence_run_items
  add constraint email_sequence_run_items_status_check
  check (status = any (array['pending','writing','written','sending','sent','failed']));
