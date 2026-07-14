-- ============================================================================
-- VOIP incoming calls: presence table so the inbound TwiML webhook knows which
-- browser client(s) are currently online to ring. The IncomingCallProvider
-- upserts a heartbeat row (user_id = the Voice SDK identity) while mounted; the
-- twilio-incoming webhook dials every user_id seen recently. Auto-expires via
-- last_seen (no hardcoded identity needed). Idempotent.
-- ============================================================================

create table if not exists public.voip_inbound_routes (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);

create index if not exists idx_voip_inbound_routes_last_seen
  on public.voip_inbound_routes (last_seen desc);

alter table public.voip_inbound_routes enable row level security;

do $$ begin
  create policy "owner manages own route"
    on public.voip_inbound_routes for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;
