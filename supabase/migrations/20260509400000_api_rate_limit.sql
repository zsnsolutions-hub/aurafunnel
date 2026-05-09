-- ============================================================================
-- 20260509400000_api_rate_limit.sql
-- ----------------------------------------------------------------------------
-- Phase 4.2 — Postgres-backed rate limit for the public REST API.
--
-- The Phase 4.1 rate limit lived in-memory inside each edge function
-- worker, so a key could exceed 60/min by hitting different workers.
-- This migration introduces a cluster-wide counter via a fixed-window
-- bucket keyed on (api_key_id, minute_bucket).
--
-- Strategy: one row per (key, UTC minute). Increment on each request via
-- atomic UPSERT. Cleanup of old rows is left to a hourly cron purge.
--
-- Trade-off accepted: fixed-window rather than sliding-window, because
-- it's a single SQL statement per check (no read-then-write race) and
-- the burstiness across boundary minutes is acceptable for a 60/min cap.
-- ============================================================================

create table if not exists public.api_rate_limit_buckets (
  api_key_id    uuid not null references public.api_keys(id) on delete cascade,
  bucket_minute timestamptz not null,                          -- truncated to minute
  count         int not null default 0,
  primary key (api_key_id, bucket_minute)
);

create index if not exists idx_api_rate_limit_purge
  on public.api_rate_limit_buckets (bucket_minute);

-- Purge rows older than 1 hour. Cheap hourly cron to keep the table small.

create or replace function public.purge_api_rate_limit_buckets()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.api_rate_limit_buckets
   where bucket_minute < now() - interval '1 hour';
$$;

revoke all on function public.purge_api_rate_limit_buckets() from public;
grant execute on function public.purge_api_rate_limit_buckets() to service_role;

do $$ begin
  perform cron.unschedule('purge-api-rate-limit-buckets');
exception when others then null;
end $$;

select cron.schedule(
  'purge-api-rate-limit-buckets',
  '7 * * * *',  -- offset from analytics (10m) / campaign (:17) / sender-health (:22) / webhook (1m)
  $$select public.purge_api_rate_limit_buckets();$$
);

-- ── consume_api_rate_limit(key_id, max_per_min) ───────────────────────────
--
-- Atomic UPSERT that increments the current minute's bucket and returns
-- whether the request is allowed. The whole thing is one SQL statement
-- under SECURITY DEFINER, so there's no read-then-write race.
--
-- Returns:
--   allowed       boolean — false means rate-limited
--   current_count int     — count after this attempt (capped at max+1)
--   reset_at      timestamptz — when the current minute bucket resets

create or replace function public.consume_api_rate_limit(
  p_key_id      uuid,
  p_max_per_min int default 60
) returns table (
  allowed       boolean,
  current_count int,
  reset_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_count  int;
begin
  insert into public.api_rate_limit_buckets (api_key_id, bucket_minute, count)
  values (p_key_id, v_bucket, 1)
  on conflict (api_key_id, bucket_minute)
  do update set count = public.api_rate_limit_buckets.count + 1
  returning count into v_count;

  allowed       := v_count <= p_max_per_min;
  current_count := v_count;
  reset_at      := v_bucket + interval '1 minute';
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(uuid, int) from public;
grant execute on function public.consume_api_rate_limit(uuid, int) to service_role;

comment on function public.consume_api_rate_limit is
  'Phase 4.2 — atomic fixed-window rate limit. Edge functions call this on every request; allowed=false means return 429. Buckets purged hourly.';
