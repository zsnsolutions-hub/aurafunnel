-- ============================================================================
-- Real "Log Call" — replaces the fake stub on the lead profile. Stores a call
-- record (outcome + notes) per lead so it shows in the Activity tab. Owner-scoped
-- (client_id = the lead owner), matching how the lead profile loads leads.
-- Idempotent.
-- ============================================================================

create table if not exists public.lead_call_logs (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  client_id   uuid not null,                 -- lead owner (auth.uid())
  business_id uuid,
  outcome     text not null,                 -- connected | voicemail | no_answer | busy | wrong_number
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_lead_call_logs_lead
  on public.lead_call_logs (lead_id, created_at desc);

alter table public.lead_call_logs enable row level security;

do $$ begin
  create policy "owner reads call logs"
    on public.lead_call_logs for select
    using (client_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner writes call logs"
    on public.lead_call_logs for insert
    with check (client_id = auth.uid());
exception when duplicate_object then null; end $$;
