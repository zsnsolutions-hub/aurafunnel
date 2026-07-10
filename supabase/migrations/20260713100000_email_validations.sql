-- ============================================================================
-- Phase B · Mails.so email validation — data model
-- ============================================================================
-- Net-new, additive, business-scoped. Stores one current validation per
-- (business_id, email) so results cache and re-validate on demand. Written only
-- by the mails-validation-worker edge function (service role, bypasses RLS);
-- clients read via business membership.
-- Idempotent.
-- ============================================================================

create table if not exists public.email_validations (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,
  email          text not null,
  -- normalized status the app gates on:
  status         text not null check (status in ('valid','invalid','risky','unknown')),
  deliverability text,                          -- provider's raw result string
  reason         text,
  is_disposable  boolean not null default false,
  is_role        boolean not null default false,
  is_free        boolean not null default false,
  score          numeric,
  provider       text not null default 'mails.so',
  raw_response   jsonb,                          -- full provider payload (fidelity)
  validated_by   uuid references auth.users(id) on delete set null,
  validated_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (business_id, email)
);

create index if not exists idx_email_validations_lookup
  on public.email_validations (business_id, lower(email));

alter table public.email_validations enable row level security;

-- Business members can read validations; writes happen via the edge function
-- (service role, which bypasses RLS). No client insert/update policy on purpose.
do $$ begin
  create policy "members read validations"
    on public.email_validations for select
    using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
