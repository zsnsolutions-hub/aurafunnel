-- ============================================================================
-- 20260509100000_cleanup_pass.sql
-- ----------------------------------------------------------------------------
-- Schema cleanup pass following the pre-flight code-search sweep
-- (recorded in roadmap as the "smaller items" cleanup).
--
-- DROPPED tables (verified zero app references):
--   strategy_tasks, strategy_notes
--     - Product decision: feature gone, no plans to revive (2026-05-09).
--   ai_prompts
--     - Only AIOperations.tsx referenced it; that page reads into state
--       but never renders or invokes any mutation. Dead code path being
--       removed in the same commit.
--
-- DROPPED columns (verified zero SQL or app reads):
--   leads.name, leads.email, leads."lastActivity"
--     - The only SQL writer was import_leads_batch which is being
--       redefined below to omit those writes.
--     - App-side reads go via lib/queries.ts:normalizeLeads which
--       computes the aliases at the JS boundary from first_name +
--       last_name / primary_email / last_activity. No actual DB read of
--       the legacy columns.
--
-- KEPT (correction to earlier deprecation comment):
--   ai_usage_logs
--     - Phase 3.5 marked this DEPRECATED. The sweep found 8+ active
--       references including INSERTs in ClientDashboard.tsx, ContentGen.tsx,
--       and count queries in admin dashboards. NOT actually deprecated by
--       usage. Comment corrected to reflect reality.
-- ============================================================================

-- ── 1. Drop strategy_tasks + strategy_notes (CASCADE for any FKs) ──────────

drop table if exists public.strategy_notes cascade;
drop table if exists public.strategy_tasks cascade;

-- ── 2. Drop ai_prompts (only AIOperations.tsx dead code referenced it) ─────

drop table if exists public.ai_prompts cascade;

-- ── 3. Correct ai_usage_logs deprecation comment ───────────────────────────

comment on table public.ai_usage_logs is
  'ACTIVELY USED — earlier deprecation comment was inaccurate. Tracks per-user token / action / cost across the platform; written from ClientDashboard, ContentGen, and read by AdminDashboard, AnalyticsPage, MobileHome, and analyticsQueries. ai_credit_usage tracks workspace-scoped credit consumption (different concern). Both coexist; do not drop without migrating writers AND readers.';

-- ── 4. Redefine import_leads_batch to omit writes to leads.name/email ──────
--
-- Same signature, same behaviour, just minus the legacy column writes
-- (and the now-unused v_legacy_name / v_legacy_email locals).

create or replace function public.import_leads_batch(
  p_workspace_id  uuid,
  p_file_name     text,
  p_file_type     text,
  p_rows          jsonb,
  p_mapping       jsonb,
  p_options       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id       uuid;
  v_plan           text;
  v_contact_limit  integer;
  v_current_count  integer;
  v_remaining      integer;
  v_imported       integer := 0;
  v_updated        integer := 0;
  v_skipped        integer := 0;
  v_skipped_rows   jsonb := '[]'::jsonb;
  v_row            jsonb;
  v_row_idx        integer := 0;
  v_dedupe         text;
  v_field          text;
  v_col            text;
  v_val            text;
  v_custom         jsonb;

  v_full_name      text;
  v_first_name     text;
  v_last_name      text;
  v_email          text;
  v_phone          text;
  v_company        text;
  v_linkedin       text;
  v_title          text;
  v_location       text;
  v_source         text;
  v_industry       text;
  v_company_size   text;
  v_insights       text;

  v_existing_id    uuid;
begin
  v_plan := coalesce(p_options->>'plan_name', 'Starter');
  case v_plan
    when 'Scale','Enterprise','Business' then v_contact_limit := 50000;
    when 'Growth','Professional'         then v_contact_limit := 10000;
    else                                       v_contact_limit := 1000;
  end case;

  select count(*) into v_current_count
    from public.leads where client_id = p_workspace_id;

  v_remaining := v_contact_limit - v_current_count;
  v_dedupe    := coalesce(p_options->>'dedupe_strategy', 'merge');

  insert into public.import_batches
    (workspace_id, file_name, file_type, total_rows, column_mapping, options, status)
  values
    (p_workspace_id, p_file_name, p_file_type, jsonb_array_length(p_rows), p_mapping, p_options, 'processing')
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_row_idx := v_row_idx + 1;

    v_full_name := null; v_first_name := null; v_last_name := null;
    v_email := null; v_phone := null; v_company := null;
    v_linkedin := null; v_title := null; v_location := null;
    v_source := null; v_industry := null; v_company_size := null;
    v_insights := null; v_custom := '{}'::jsonb;

    for v_col, v_field in select key, value#>>'{}' from jsonb_each(p_mapping) loop
      v_val := v_row->>v_col;
      if v_val is null or trim(v_val) = '' then continue; end if;
      v_val := trim(v_val);

      case v_field
        when 'full_name'     then v_full_name    := v_val;
        when 'first_name'    then v_first_name   := v_val;
        when 'last_name'     then v_last_name    := v_val;
        when 'primary_email' then v_email        := lower(v_val);
        when 'primary_phone' then v_phone        := regexp_replace(v_val, '[^0-9+\-() ]', '', 'g');
        when 'company'       then v_company      := v_val;
        when 'linkedin_url'  then
          v_linkedin := lower(v_val);
          if v_linkedin not like 'http%' then
            v_linkedin := 'https://www.linkedin.com/in/' || v_linkedin;
          end if;
          v_linkedin := regexp_replace(v_linkedin, '/+$', '');
        when 'title'         then v_title        := v_val;
        when 'location'      then v_location     := v_val;
        when 'source'        then v_source       := v_val;
        when 'industry'      then v_industry     := v_val;
        when 'company_size'  then v_company_size := v_val;
        when 'insights'      then v_insights     := v_val;
        else
          if v_field like 'custom:%' then
            v_custom := v_custom || jsonb_build_object(substring(v_field from 8), v_val);
          end if;
      end case;
    end loop;

    if v_full_name is not null and v_first_name is null then
      v_first_name := split_part(v_full_name, ' ', 1);
      if position(' ' in v_full_name) > 0 then
        v_last_name := coalesce(v_last_name, trim(substring(v_full_name from position(' ' in v_full_name) + 1)));
      end if;
    end if;

    if v_email is null and v_phone is null and v_linkedin is null then
      v_custom := v_custom || '{"needs_enrichment": true}'::jsonb;
    end if;

    v_existing_id := null;
    if v_email is not null then
      select id into v_existing_id from public.leads
        where client_id = p_workspace_id and lower(primary_email) = v_email
        limit 1;
    end if;
    if v_existing_id is null and v_linkedin is not null then
      select id into v_existing_id from public.leads
        where client_id = p_workspace_id and lower(linkedin_url) = v_linkedin
        limit 1;
    end if;

    if v_existing_id is not null then
      if v_dedupe = 'skip' then
        v_skipped := v_skipped + 1;
        v_skipped_rows := v_skipped_rows || jsonb_build_object(
          'row', v_row_idx, 'reason', 'duplicate', 'identifier', coalesce(v_email, v_linkedin));
        continue;
      elsif v_dedupe = 'merge' then
        update public.leads set
          first_name      = coalesce(leads.first_name,    v_first_name),
          last_name       = coalesce(leads.last_name,     v_last_name),
          primary_email   = coalesce(leads.primary_email,  v_email),
          primary_phone   = coalesce(leads.primary_phone,  v_phone),
          company         = coalesce(leads.company,        v_company),
          linkedin_url    = coalesce(leads.linkedin_url,   v_linkedin),
          title           = coalesce(leads.title,          v_title),
          location        = coalesce(leads.location,       v_location),
          source          = coalesce(leads.source,         v_source),
          industry        = coalesce(leads.industry,       v_industry),
          company_size    = coalesce(leads.company_size,   v_company_size),
          custom_fields   = leads.custom_fields || v_custom,
          import_batch_id = v_batch_id,
          updated_at      = now()
        where id = v_existing_id;
        v_updated := v_updated + 1;
        continue;
      else
        update public.leads set
          first_name      = coalesce(v_first_name,   leads.first_name),
          last_name       = coalesce(v_last_name,    leads.last_name),
          primary_email   = coalesce(v_email,        leads.primary_email),
          primary_phone   = coalesce(v_phone,        leads.primary_phone),
          company         = coalesce(v_company,      leads.company),
          linkedin_url    = coalesce(v_linkedin,     leads.linkedin_url),
          title           = coalesce(v_title,        leads.title),
          location        = coalesce(v_location,     leads.location),
          source          = coalesce(v_source,       leads.source),
          industry        = coalesce(v_industry,     leads.industry),
          company_size    = coalesce(v_company_size, leads.company_size),
          custom_fields   = v_custom || leads.custom_fields,
          import_batch_id = v_batch_id,
          updated_at      = now()
        where id = v_existing_id;
        v_updated := v_updated + 1;
        continue;
      end if;
    end if;

    if v_remaining <= 0 then
      v_skipped := v_skipped + 1;
      v_skipped_rows := v_skipped_rows || jsonb_build_object(
        'row', v_row_idx, 'reason', 'plan_limit');
      continue;
    end if;

    insert into public.leads (
      client_id, company, score, status, source, insights,
      first_name, last_name, primary_email, primary_phone,
      linkedin_url, title, location, industry, company_size,
      import_batch_id, imported_at, custom_fields
    ) values (
      p_workspace_id, v_company,
      0, 'New', coalesce(v_source, 'File Import'), coalesce(v_insights, 'Imported from file'),
      v_first_name, v_last_name, v_email, v_phone,
      v_linkedin, v_title, v_location, v_industry, v_company_size,
      v_batch_id, now(), v_custom
    );
    v_imported := v_imported + 1;
    v_remaining := v_remaining - 1;
  end loop;

  update public.import_batches set
    imported_count = v_imported,
    updated_count  = v_updated,
    skipped_count  = v_skipped,
    skipped_rows   = v_skipped_rows,
    status         = 'completed',
    completed_at   = now()
  where id = v_batch_id;

  insert into public.audit_logs (user_id, action, details)
  values (p_workspace_id, 'FILE_IMPORT', format(
    'Imported %s, updated %s, skipped %s from %s',
    v_imported, v_updated, v_skipped, p_file_name
  ));

  return jsonb_build_object(
    'batch_id',        v_batch_id,
    'imported_count',  v_imported,
    'updated_count',   v_updated,
    'skipped_count',   v_skipped,
    'skipped_rows',    v_skipped_rows,
    'plan_limit',      v_contact_limit,
    'contacts_before', v_current_count,
    'contacts_after',  v_current_count + v_imported
  );
end;
$$;

-- ── 5. Drop legacy leads columns ───────────────────────────────────────────

alter table public.leads
  drop column if exists "lastActivity",
  drop column if exists email,
  drop column if exists name;
