-- ============================================================================
-- Lead KB enrichment — server-side background jobs
-- ============================================================================
-- Tracks the async AI research that runs after a Knowledge Base save. The work
-- executes in the enrich-lead edge function (EdgeRuntime.waitUntil), so it
-- completes even if the browser navigates away or closes. The client polls this
-- table to show a live timer that survives reloads.
-- Owner (leads.client_id = auth.uid()) reads; writes happen via the edge
-- function (service role, bypasses RLS). Idempotent.
-- ============================================================================

create table if not exists public.lead_enrichment_jobs (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  client_id    uuid not null,                 -- lead owner (auth.uid())
  label        text,
  status       text not null default 'processing' check (status in ('processing','done','error')),
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_lead_enrichment_jobs_owner
  on public.lead_enrichment_jobs (client_id, status, started_at desc);
create index if not exists idx_lead_enrichment_jobs_lead
  on public.lead_enrichment_jobs (lead_id);

alter table public.lead_enrichment_jobs enable row level security;

-- Owner can read their own jobs; writes are service-role only (edge function).
do $$ begin
  create policy "owner reads enrichment jobs"
    on public.lead_enrichment_jobs for select
    using (client_id = auth.uid());
exception when duplicate_object then null; end $$;
