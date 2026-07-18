-- ============================================================================
-- 20260818150000_tasks.sql
-- Phase 4.B — canonical tasks / follow-ups table. Business-scoped, assignable,
-- with due dates, priority, status, reminders and completion. deal_id is a bare
-- uuid for now (the FK is added when the opportunities/deals table lands in 4.E).
-- ============================================================================

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  business_id  uuid references public.businesses(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete cascade,
  deal_id      uuid,
  assigned_to  uuid,
  created_by   uuid not null,
  title        text not null,
  description  text,
  due_at       timestamptz,
  priority     text not null default 'normal' check (priority in ('low','normal','high')),
  status       text not null default 'open'   check (status in ('open','done','cancelled')),
  reminder_at  timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_tasks_workspace   on public.tasks (workspace_id, status);
create index if not exists idx_tasks_business     on public.tasks (business_id);
create index if not exists idx_tasks_lead         on public.tasks (lead_id);
create index if not exists idx_tasks_assignee_due on public.tasks (assigned_to, status, due_at);

create or replace trigger trg_tasks_updated_at before update on public.tasks
  for each row execute function public.update_updated_at();

alter table public.tasks enable row level security;

-- Workspace members collaborate on tasks; only the creator's own rows on insert.
do $$ begin
  create policy "tasks_select" on public.tasks for select using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tasks_insert" on public.tasks for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tasks_update" on public.tasks for update using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tasks_delete" on public.tasks for delete using (public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
