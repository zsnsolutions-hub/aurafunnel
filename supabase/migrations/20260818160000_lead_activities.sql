-- ============================================================================
-- 20260818160000_lead_activities.sql
-- Phase 4.C — persistent manual activity log (call/email/meeting/note freeform
-- entries logged from the Leads list "Log Activity" modal). Previously UI-only
-- (lost on reload). Feeds the unified lead timeline alongside notes, tasks,
-- calls, meetings and replies. Structured calls/meetings keep their own richer
-- tables (lead_call_logs / lead_meetings); this is the freeform log.
-- ============================================================================

create table if not exists public.lead_activities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  business_id  uuid references public.businesses(id) on delete set null,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  author_id    uuid,
  type         text not null check (type in ('call','email','meeting','note')),
  details      text not null,
  outcome      text,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead     on public.lead_activities (lead_id, occurred_at desc);
create index if not exists idx_lead_activities_workspace on public.lead_activities (workspace_id);
create index if not exists idx_lead_activities_business  on public.lead_activities (business_id);

alter table public.lead_activities enable row level security;

do $$ begin
  create policy "lead_activities_select" on public.lead_activities for select using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "lead_activities_insert" on public.lead_activities for insert with check (public.is_workspace_member(workspace_id) and author_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "lead_activities_delete" on public.lead_activities for delete using (author_id = auth.uid());
exception when duplicate_object then null; end $$;
