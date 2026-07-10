-- ============================================================================
-- Phase C · Lead intelligence — lead_scores + lead_research_profiles
-- ============================================================================
-- Both net-new, additive, business-scoped (RLS via is_business_member).
--   lead_scores            — deterministic 0-100 score + sub-score breakdown.
--   lead_research_profiles — on-demand AI research profile (one per lead).
-- Members read + write (scores are computed client-side; research is generated
-- via the AI proxy then upserted). Idempotent.
-- ============================================================================

-- ─── 1. Deterministic lead scores ───────────────────────────────────────────
create table if not exists public.lead_scores (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.leads(id) on delete cascade,
  business_id         uuid not null references public.businesses(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  total_score         integer not null default 0,   -- 0..100
  fit_score           integer not null default 0,   -- /25
  intent_score        integer not null default 0,   -- /20
  engagement_score    integer not null default 0,   -- /20
  data_quality_score  integer not null default 0,   -- /15
  deliverability_score integer not null default 0,  -- /10
  urgency_score       integer not null default 0,   -- /10
  risk_score          integer not null default 0,   -- penalty magnitude 0..20
  confidence          numeric,                       -- 0..1 (input coverage)
  reason_summary      text,
  scoring_inputs      jsonb,
  last_calculated_at  timestamptz not null default now(),
  unique (lead_id)
);
create index if not exists idx_lead_scores_business on public.lead_scores (business_id);

-- ─── 2. AI lead research profiles ───────────────────────────────────────────
create table if not exists public.lead_research_profiles (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references public.leads(id) on delete cascade,
  business_id              uuid not null references public.businesses(id) on delete cascade,
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  knowledge_base_id        uuid,
  company_summary          text,
  industry                 text,
  target_customer          text,
  estimated_company_size   text,
  likely_decision_maker    text,
  possible_needs           text,
  pain_points              text,
  buying_triggers          text,
  objections               text,
  suggested_offer          text,
  suggested_pitch_angle    text,
  recommended_email_angle  text,
  recommended_call_angle   text,
  recommended_social_angle text,
  best_channel             text,
  urgency                  text,
  confidence               numeric,
  sources                  jsonb,
  missing_info             jsonb,          -- what the AI flagged as unknown
  researched_at            timestamptz not null default now(),
  researched_by            uuid references auth.users(id) on delete set null,
  status                   text not null default 'complete' check (status in ('complete','partial','error')),
  unique (lead_id)
);
create index if not exists idx_lead_research_business on public.lead_research_profiles (business_id);

-- ─── 3. RLS — business members read + write both tables ─────────────────────
alter table public.lead_scores enable row level security;
alter table public.lead_research_profiles enable row level security;

do $$ begin
  create policy "members read scores" on public.lead_scores for select
    using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members write scores" on public.lead_scores for all
    using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members read research" on public.lead_research_profiles for select
    using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members write research" on public.lead_research_profiles for all
    using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
