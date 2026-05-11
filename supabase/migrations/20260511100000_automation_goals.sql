-- ============================================================================
-- 20260511100000_automation_goals.sql
-- ----------------------------------------------------------------------------
-- Phase 6.1 — Goal-based AI automation: storage layer.
--
-- Two tables:
--
--   automation_goals
--     One row per customer-stated goal. e.g.
--       statement = "Book 10 SaaS demos by July"
--       target_metric = 'meetings_booked'
--       target_value = 10
--       due_at = '2026-07-31'
--
--   automation_plans
--     Versioned plan snapshots per goal. The LLM-generated plan is stored
--     as JSONB. When the Observer (Phase 6.3) detects drift, it generates
--     a new version of the plan; the prior version stays for history.
--
-- Phase 6.1 only writes goals + plans. Phase 6.2 will add an executor
-- that reads plans and runs the steps via existing automation
-- primitives. Phase 6.3 will add the observer + replanner. Phase 6.4
-- will close the memory-feedback loop (winning_pattern / avoid).
-- ============================================================================

create table if not exists public.automation_goals (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_by      uuid references auth.users(id) on delete set null,
  statement       text not null,
  -- Canonical metric this goal optimises for. Free-text for forward
  -- compatibility; the planner uses it to choose primitive sequences
  -- and the observer uses it to score progress.
  target_metric   text not null,
  target_value    numeric not null,
  progress_value  numeric not null default 0,
  due_at          timestamptz,
  status          text not null default 'draft'
                  check (status in ('draft','planning','planned','active','paused','completed','cancelled','failed')),
  -- Plain-language constraints / preferences from the user that the
  -- planner should respect. e.g. "Only US-based prospects" or
  -- "Don't email anyone we already contacted in Q1".
  guardrails      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_automation_goals_workspace_status
  on public.automation_goals (workspace_id, status, created_at desc);

alter table public.automation_goals enable row level security;

create policy automation_goals_select on public.automation_goals
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );
create policy automation_goals_insert on public.automation_goals
  for insert with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );
create policy automation_goals_update on public.automation_goals
  for update using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );
create policy automation_goals_delete on public.automation_goals
  for delete using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create or replace function public.touch_automation_goals()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_automation_goals_touch on public.automation_goals;
create trigger trg_automation_goals_touch
  before update on public.automation_goals
  for each row execute function public.touch_automation_goals();

comment on table public.automation_goals is
  'Phase 6.1 — customer-stated goals. The Planner consumes statement + target_metric/value + guardrails + workspace_memory and emits an automation_plans row. Phase 6.2 will add an executor.';

-- ── automation_plans ──────────────────────────────────────────────────────

create table if not exists public.automation_plans (
  id               uuid primary key default gen_random_uuid(),
  goal_id          uuid not null references public.automation_goals(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  version          int not null,
  -- 'planner' = initial plan from generateGoalPlan
  -- 'replanner' = mid-flight revision after observer detects drift
  -- 'manual' = user-edited plan
  created_by_kind  text not null default 'planner'
                   check (created_by_kind in ('planner','replanner','manual')),
  -- Compact step list. Schema is enforced by the TypeScript layer
  -- (see lib/goals.ts AutomationPlan type). Storing as JSONB lets the
  -- planner evolve the step kinds without migrations.
  plan             jsonb not null,
  -- LLM's reasoning blob. Useful for the UI ("why this plan?") and
  -- for the Observer when deciding whether to replan.
  rationale        text,
  -- Telemetry — which model + how many tokens cost this plan.
  model_used       text,
  tokens_used      int,
  created_at       timestamptz not null default now(),
  -- Active version flag. Only one plan per goal is active at a time;
  -- replans clear is_active on the prior row and set it on the new one.
  is_active        boolean not null default true,
  -- If is_active=false, why was it superseded?
  superseded_reason text,
  unique (goal_id, version)
);

create index if not exists idx_automation_plans_goal_active
  on public.automation_plans (goal_id, is_active)
  where is_active = true;
create index if not exists idx_automation_plans_workspace
  on public.automation_plans (workspace_id, created_at desc);

alter table public.automation_plans enable row level security;

create policy automation_plans_select on public.automation_plans
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );
-- INSERT / UPDATE go through a SECURITY DEFINER helper below so we can
-- atomically deactivate the prior version + bump version + insert.

comment on table public.automation_plans is
  'Phase 6.1 — versioned plan snapshots. Plan body is JSONB; schema enforced at the TS layer (lib/goals.ts AutomationPlan). One row per (goal_id, version). is_active=true on at most one row per goal at any time.';

-- ── store_plan_version(goal_id, plan, rationale, created_by_kind, model, tokens) ───
--
-- Atomic transaction:
--   1. Mark any existing is_active=true plan rows for this goal as
--      is_active=false with the supplied superseded_reason.
--   2. Insert the new row with version = max+1 and is_active=true.
--   3. Update automation_goals.status to 'planned' (from 'draft' or
--      'planning'); leaves 'active' / other statuses alone.

create or replace function public.store_plan_version(
  p_goal_id           uuid,
  p_plan              jsonb,
  p_rationale         text default null,
  p_created_by_kind   text default 'planner',
  p_model_used        text default null,
  p_tokens_used       int default null,
  p_superseded_reason text default 'newer plan'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws        uuid;
  v_caller_in_ws boolean;
  v_next_ver  int;
  v_new_id    uuid;
begin
  select workspace_id into v_ws from public.automation_goals where id = p_goal_id;
  if v_ws is null then raise exception 'goal not found: %', p_goal_id; end if;

  select exists (
    select 1 from public.workspace_members
    where workspace_id = v_ws and user_id = auth.uid()
  ) into v_caller_in_ws;
  if not v_caller_in_ws then raise exception 'forbidden: caller not in workspace %', v_ws; end if;

  -- Deactivate prior active plan(s).
  update public.automation_plans
     set is_active = false,
         superseded_reason = p_superseded_reason
   where goal_id = p_goal_id and is_active = true;

  -- Next version.
  select coalesce(max(version), 0) + 1 into v_next_ver
    from public.automation_plans where goal_id = p_goal_id;

  insert into public.automation_plans
    (goal_id, workspace_id, version, created_by_kind, plan, rationale, model_used, tokens_used)
  values
    (p_goal_id, v_ws, v_next_ver, p_created_by_kind, p_plan, p_rationale, p_model_used, p_tokens_used)
  returning id into v_new_id;

  -- Advance goal status only if still in pre-planned state.
  update public.automation_goals
     set status = 'planned'
   where id = p_goal_id and status in ('draft','planning');

  return v_new_id;
end;
$$;

revoke all on function public.store_plan_version(uuid, jsonb, text, text, text, int, text) from public;
grant execute on function public.store_plan_version(uuid, jsonb, text, text, text, int, text) to authenticated;

comment on function public.store_plan_version is
  'Phase 6.1 — atomic plan-version insert. Deactivates prior active plan + bumps version + inserts new active row + advances goal status from draft/planning → planned.';
