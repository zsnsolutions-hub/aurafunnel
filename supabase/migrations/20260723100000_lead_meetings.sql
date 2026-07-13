-- ============================================================================
-- Real "Schedule Meeting" — replaces the fake stub on the lead profile. Stores a
-- scheduled meeting (title, when, notes) per lead so it shows in the Activity
-- tab. Owner-scoped (client_id = the lead owner). Idempotent.
-- ============================================================================

create table if not exists public.lead_meetings (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  client_id    uuid not null,                 -- lead owner (auth.uid())
  business_id  uuid,
  title        text not null,
  scheduled_at timestamptz not null,
  notes        text,
  status       text not null default 'scheduled',  -- scheduled | done | cancelled
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_lead_meetings_lead
  on public.lead_meetings (lead_id, scheduled_at desc);

alter table public.lead_meetings enable row level security;

do $$ begin
  create policy "owner reads meetings"
    on public.lead_meetings for select
    using (client_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner writes meetings"
    on public.lead_meetings for insert
    with check (client_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner updates meetings"
    on public.lead_meetings for update
    using (client_id = auth.uid());
exception when duplicate_object then null; end $$;
