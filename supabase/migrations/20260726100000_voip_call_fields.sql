-- ============================================================================
-- VOIP (Twilio browser calling): extend lead_call_logs so an in-app call
-- auto-logs its transport details alongside the existing manual outcome/notes.
--
-- A call row is created client-side when dialing (status='dialing'), updated on
-- disconnect with the client-measured duration + outcome, and enriched by the
-- twilio-call-status webhook with the recording URL + final Twilio status.
-- Idempotent.
-- ============================================================================

alter table public.lead_call_logs
  add column if not exists call_sid         text,           -- Twilio CallSid (links webhook → row)
  add column if not exists direction        text not null default 'outbound',
  add column if not exists phone_number     text,           -- number dialed
  add column if not exists duration_seconds integer,        -- talk time
  add column if not exists recording_url    text,           -- set by twilio-call-status
  add column if not exists status           text;           -- dialing | in-progress | completed | no-answer | busy | failed | canceled

-- Webhook looks rows up by CallSid; keep it fast + skip nulls (manual logs).
create index if not exists idx_lead_call_logs_call_sid
  on public.lead_call_logs (call_sid) where call_sid is not null;

-- `outcome` was NOT NULL for manual logs. VOIP rows start before an outcome is
-- known, so allow it to be filled in later (derived from the Twilio status).
alter table public.lead_call_logs alter column outcome drop not null;
