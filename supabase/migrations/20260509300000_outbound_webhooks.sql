-- ============================================================================
-- 20260509300000_outbound_webhooks.sql
-- ----------------------------------------------------------------------------
-- Phase 4.3 — Outbound webhooks. Customers register HTTPS endpoints that
-- Scaliyo POSTs events to (lead.created, sequence.completed, etc.) with
-- HMAC-SHA256-signed payloads. Failed deliveries retry with exponential
-- backoff; the dispatcher edge function processes the queue every minute
-- via pg_cron.
--
-- Two tables:
--   webhook_endpoints  — customer registers a URL + event filter + secret
--   webhook_deliveries — one row per (event × endpoint) with status + retry
-- ============================================================================

-- ── webhook_endpoints ──────────────────────────────────────────────────────

create table if not exists public.webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_by      uuid references auth.users(id) on delete set null,
  url             text not null,
  secret          text not null,                                 -- shared HMAC secret
  description     text,
  event_types     text[] not null default '{}',                   -- empty = all events
  enabled         boolean not null default true,
  failure_count   int not null default 0,
  disabled_at     timestamptz,                                    -- auto-disabled after 24h of failures
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint webhook_endpoints_url_https check (url ~* '^https://')
);

create index if not exists idx_webhook_endpoints_workspace
  on public.webhook_endpoints (workspace_id, enabled);

alter table public.webhook_endpoints enable row level security;

create policy webhook_endpoints_select on public.webhook_endpoints
  for select using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy webhook_endpoints_insert on public.webhook_endpoints
  for insert with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy webhook_endpoints_update on public.webhook_endpoints
  for update using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy webhook_endpoints_delete on public.webhook_endpoints
  for delete using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

comment on table public.webhook_endpoints is
  'Phase 4.3 — customer-registered outbound webhooks. Secret is HMAC-SHA256 key for X-Scaliyo-Signature header.';

-- ── webhook_deliveries ─────────────────────────────────────────────────────

create table if not exists public.webhook_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  endpoint_id         uuid not null references public.webhook_endpoints(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  event_type          text not null,
  payload             jsonb not null,
  status              text not null default 'pending'
                      check (status in ('pending','succeeded','failed','dead')),
  attempt_count       int not null default 0,
  last_status_code    int,
  last_error          text,
  next_attempt_at     timestamptz not null default now(),
  succeeded_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_pending
  on public.webhook_deliveries (next_attempt_at)
  where status = 'pending';
create index if not exists idx_webhook_deliveries_workspace
  on public.webhook_deliveries (workspace_id, created_at desc);
create index if not exists idx_webhook_deliveries_endpoint_status
  on public.webhook_deliveries (endpoint_id, status);

alter table public.webhook_deliveries enable row level security;

create policy webhook_deliveries_select on public.webhook_deliveries
  for select using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
-- Inserts/updates are funneled through queue_webhook_event() and the
-- dispatcher (service-role).

comment on table public.webhook_deliveries is
  'Phase 4.3 — one row per (event × endpoint). Dispatcher processes status=pending where next_attempt_at <= now(). Backoff: 1m, 5m, 30m, 2h, 12h. After 5 failures, status=dead.';

-- ── queue_webhook_event(workspace_id, event_type, payload) ────────────────
--
-- Fan-out helper: takes one event and writes one webhook_deliveries row
-- per matching endpoint (event_types matches OR is empty = all events).
-- Called from app code or other RPCs whenever a new event happens.

create or replace function public.queue_webhook_event(
  p_workspace_id uuid,
  p_event_type   text,
  p_payload      jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.webhook_deliveries
    (endpoint_id, workspace_id, event_type, payload)
  select
    e.id, p_workspace_id, p_event_type, p_payload
  from public.webhook_endpoints e
  where e.workspace_id = p_workspace_id
    and e.enabled
    and (cardinality(e.event_types) = 0 or p_event_type = any(e.event_types));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.queue_webhook_event(uuid, text, jsonb) from public;
grant execute on function public.queue_webhook_event(uuid, text, jsonb) to authenticated, service_role;

comment on function public.queue_webhook_event is
  'Phase 4.3 — fan-out an event to all matching webhook_endpoints. Returns the number of deliveries queued.';

-- ── claim_pending_webhook_deliveries(limit) ───────────────────────────────
--
-- Atomic claim for the dispatcher. Marks status='processing' so concurrent
-- dispatcher invocations don't double-deliver.

create or replace function public.claim_pending_webhook_deliveries(p_limit int default 50)
returns table (
  delivery_id  uuid,
  endpoint_id  uuid,
  workspace_id uuid,
  url          text,
  secret       text,
  event_type   text,
  payload      jsonb,
  attempt_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    update public.webhook_deliveries d
       set status = 'processing',
           attempt_count = d.attempt_count + 1
     where d.id in (
       select wd.id
         from public.webhook_deliveries wd
        where wd.status = 'pending'
          and wd.next_attempt_at <= now()
        order by wd.next_attempt_at asc
        for update skip locked
        limit p_limit
     )
    returning d.id, d.endpoint_id, d.workspace_id, d.event_type, d.payload, d.attempt_count
  )
  select c.id, c.endpoint_id, c.workspace_id, e.url, e.secret, c.event_type, c.payload, c.attempt_count
    from claimed c
    join public.webhook_endpoints e on e.id = c.endpoint_id;
end;
$$;

revoke all on function public.claim_pending_webhook_deliveries(int) from public;
grant execute on function public.claim_pending_webhook_deliveries(int) to service_role;

-- ── mark_webhook_delivery_result(delivery_id, succeeded, status_code, error) ──

create or replace function public.mark_webhook_delivery_result(
  p_delivery_id uuid,
  p_succeeded   boolean,
  p_status_code int default null,
  p_error       text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt int;
  v_ep_id   uuid;
begin
  if p_succeeded then
    update public.webhook_deliveries
       set status = 'succeeded',
           last_status_code = p_status_code,
           last_error = null,
           succeeded_at = now()
     where id = p_delivery_id
     returning endpoint_id into v_ep_id;

    if v_ep_id is not null then
      update public.webhook_endpoints
         set failure_count = 0,
             last_success_at = now(),
             last_attempt_at = now(),
             updated_at = now()
       where id = v_ep_id;
    end if;
  else
    -- Backoff schedule: 1m, 5m, 30m, 2h, 12h. After 5 attempts → dead.
    update public.webhook_deliveries
       set status = case when attempt_count >= 5 then 'dead' else 'pending' end,
           last_status_code = p_status_code,
           last_error = p_error,
           next_attempt_at = case attempt_count
             when 1 then now() + interval '1 minute'
             when 2 then now() + interval '5 minutes'
             when 3 then now() + interval '30 minutes'
             when 4 then now() + interval '2 hours'
             else now() + interval '12 hours'
           end
     where id = p_delivery_id
     returning endpoint_id, attempt_count into v_ep_id, v_attempt;

    if v_ep_id is not null then
      update public.webhook_endpoints
         set failure_count = failure_count + 1,
             last_attempt_at = now(),
             -- Auto-disable after 24h of consecutive failures (rough heuristic
             -- using failure_count; real signal would track time-since-last-success).
             disabled_at = case when failure_count + 1 >= 50 then now() else disabled_at end,
             enabled = case when failure_count + 1 >= 50 then false else enabled end,
             updated_at = now()
       where id = v_ep_id;
    end if;
  end if;
end;
$$;

revoke all on function public.mark_webhook_delivery_result(uuid, boolean, int, text) from public;
grant execute on function public.mark_webhook_delivery_result(uuid, boolean, int, text) to service_role;

-- ── pg_cron: dispatcher runs every minute ──────────────────────────────────
--
-- We schedule a stub here; the actual dispatch logic is in the
-- supabase/functions/webhook-dispatcher edge function. The cron entry
-- does an HTTP POST to invoke it. (Supabase exposes pg_net for this.)
-- For Phase 4.3 we're scheduling a no-op because the cron→edge
-- invocation pattern needs the supabase URL + service role key as
-- vault secrets, which are deployment-specific. The dispatcher can
-- be invoked manually or via an external cron in the meantime.
--
-- The schedule is registered for documentation; the actual SELECT is
-- a no-op until the http call is wired.

do $$ begin
  perform cron.unschedule('webhook-dispatcher');
exception when others then null;
end $$;

select cron.schedule(
  'webhook-dispatcher',
  '* * * * *',  -- every minute
  $$select 1;$$  -- placeholder; flip to net.http_post(...) once vault wiring lands
);

comment on extension pg_cron is
  'pg_cron used by analytics refresh (10m), campaign-memory sweep (hourly), sender-health refresh (hourly), webhook-dispatcher (1m, currently no-op pending pg_net wiring).';
