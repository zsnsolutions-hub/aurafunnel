-- ============================================================================
-- 20260818110000_email_pipeline_business_id.sql
-- Phase 2 (tenancy) stage 2.2 — additive business_id on the email/campaign
-- tables that lacked it, so those surfaces can be business-scoped. Nullable +
-- ON DELETE SET NULL FK + index, backfilled from the row's workspace default
-- business. No RLS change, no NOT NULL yet, no flag flip — reversible and
-- non-breaking (business scoping stays dormant until the multi_business flag is
-- flipped in a later stage, once all surfaces are wired).
-- ============================================================================

alter table public.email_sequences      add column if not exists business_id uuid references public.businesses(id) on delete set null;
alter table public.sequence_enrollments  add column if not exists business_id uuid references public.businesses(id) on delete set null;
alter table public.inbound_emails         add column if not exists business_id uuid references public.businesses(id) on delete set null;
alter table public.email_messages         add column if not exists business_id uuid references public.businesses(id) on delete set null;

-- Backfill from the (earliest) business of the row's workspace. Uses owner_id as
-- a fallback tenant key where workspace_id may be null (ws == user.id convention).
update public.email_sequences t
  set business_id = (select b.id from public.businesses b where b.workspace_id = t.workspace_id order by b.created_at asc limit 1)
  where t.business_id is null and t.workspace_id is not null;

update public.sequence_enrollments t
  set business_id = (select b.id from public.businesses b where b.workspace_id = t.workspace_id order by b.created_at asc limit 1)
  where t.business_id is null and t.workspace_id is not null;

update public.inbound_emails t
  set business_id = (select b.id from public.businesses b where b.workspace_id = coalesce(t.workspace_id, t.owner_id) order by b.created_at asc limit 1)
  where t.business_id is null;

update public.email_messages t
  set business_id = (select b.id from public.businesses b where b.workspace_id = coalesce(t.workspace_id, t.owner_id) order by b.created_at asc limit 1)
  where t.business_id is null;

create index if not exists idx_email_sequences_business      on public.email_sequences (business_id);
create index if not exists idx_sequence_enrollments_business  on public.sequence_enrollments (business_id);
create index if not exists idx_inbound_emails_business         on public.inbound_emails (business_id);
create index if not exists idx_email_messages_business         on public.email_messages (business_id);
