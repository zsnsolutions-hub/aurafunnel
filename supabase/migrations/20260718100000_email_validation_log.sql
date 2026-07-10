-- ============================================================================
-- Phase B · Mails.so email validation — append-only history log
-- ============================================================================
-- email_validations holds one CURRENT record per (business_id, email). This log
-- captures EVERY fresh validation as its own row, so the lead Activity tab can
-- show a full history of validation checks (status + reason over time) instead
-- of just the latest. Written only by the mails-validation-worker edge function
-- (service role, bypasses RLS); business members read via membership.
-- Idempotent.
-- ============================================================================

create table if not exists public.email_validation_log (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,
  email          text not null,
  status         text not null check (status in ('valid','invalid','risky','unknown')),
  deliverability text,                          -- provider's raw result string
  reason         text,
  is_disposable  boolean not null default false,
  is_role        boolean not null default false,
  is_free        boolean not null default false,
  score          numeric,
  provider       text not null default 'mails.so',
  validated_by   uuid references auth.users(id) on delete set null,
  validated_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Newest-first lookups for a given email within a business.
create index if not exists idx_email_validation_log_lookup
  on public.email_validation_log (business_id, lower(email), validated_at desc);

alter table public.email_validation_log enable row level security;

-- Business members can read the history; writes happen via the edge function
-- (service role, which bypasses RLS). Append-only: no client insert/update/delete.
do $$ begin
  create policy "members read validation log"
    on public.email_validation_log for select
    using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

-- Seed the log with the current validation for each already-validated email so
-- the Activity tab isn't empty for leads validated before this table existed.
-- Guarded so re-running the migration doesn't duplicate the seed rows.
insert into public.email_validation_log
  (workspace_id, business_id, email, status, deliverability, reason,
   is_disposable, is_role, is_free, score, provider, validated_by, validated_at, created_at)
select ev.workspace_id, ev.business_id, ev.email, ev.status, ev.deliverability, ev.reason,
       ev.is_disposable, ev.is_role, ev.is_free, ev.score, ev.provider, ev.validated_by,
       ev.validated_at, ev.created_at
from public.email_validations ev
where not exists (
  select 1 from public.email_validation_log l
  where l.business_id = ev.business_id
    and l.email = ev.email
    and l.validated_at = ev.validated_at
);
