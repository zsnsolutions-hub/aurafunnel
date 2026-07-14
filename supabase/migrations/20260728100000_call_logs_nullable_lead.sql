-- ============================================================================
-- Allow call logs not tied to a lead — so inbound calls from unknown numbers
-- (no matching lead) can still be recorded. RLS on lead_call_logs is scoped by
-- client_id (= auth.uid()), not lead_id, so null-lead rows stay owner-private.
-- The lead_id FK already allows NULL once the NOT NULL is dropped. Idempotent.
-- ============================================================================

alter table public.lead_call_logs alter column lead_id drop not null;
