-- ============================================================================
-- 20260818170000_deals.sql
-- Phase 4.E — opportunities / deals. Gives the pipeline real value & forecast
-- instead of just a lead status. A deal belongs to a business + (optionally) a
-- lead, carries an amount, stage, probability and expected close, and records
-- won/lost outcomes. Also back-fills the FK from tasks.deal_id (added bare in
-- 20260818150000) now that the target table exists.
-- ============================================================================

create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null,
  business_id         uuid references public.businesses(id) on delete set null,
  lead_id             uuid references public.leads(id) on delete set null,
  created_by          uuid not null,
  assigned_to         uuid,
  title               text not null,
  value_amount        numeric(14,2) not null default 0,
  currency            text not null default 'USD',
  stage               text not null default 'discovery'
                        check (stage in ('discovery','qualified','proposal','negotiation','won','lost')),
  probability         int  not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  won_at              timestamptz,
  lost_at             timestamptz,
  lost_reason         text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_deals_workspace on public.deals (workspace_id, stage);
create index if not exists idx_deals_business   on public.deals (business_id);
create index if not exists idx_deals_lead       on public.deals (lead_id);
create index if not exists idx_deals_assignee   on public.deals (assigned_to);

create or replace trigger trg_deals_updated_at before update on public.deals
  for each row execute function public.update_updated_at();

alter table public.deals enable row level security;

do $$ begin
  create policy "deals_select" on public.deals for select using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "deals_insert" on public.deals for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "deals_update" on public.deals for update using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "deals_delete" on public.deals for delete using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;

-- Now that deals exists, promote tasks.deal_id to a real FK (was a bare uuid).
do $$ begin
  alter table public.tasks
    add constraint fk_tasks_deal foreign key (deal_id) references public.deals(id) on delete set null;
exception when duplicate_object then null; end $$;
