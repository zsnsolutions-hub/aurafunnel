-- ============================================================================
-- Add Website as a first-class import field (was only mappable as a custom
-- field, so it never populated leads.website). import_leads_batch now maps the
-- 'website' field → leads.website, lightly normalized (prepend https:// when no
-- scheme). Merge/overwrite handle it like the other scalar fields. Rest of the
-- function is the current definition, verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_leads_batch(p_workspace_id uuid, p_file_name text, p_file_type text, p_rows jsonb, p_mapping jsonb, p_options jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_business_id    uuid;
  v_emails         text[];
  v_email_tok      text;
  v_website        text;
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
  v_business_id := nullif(p_options->>'business_id', '')::uuid;

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
    v_insights := null; v_custom := '{}'::jsonb; v_emails := '{}'::text[]; v_website := null;

    for v_col, v_field in select key, value#>>'{}' from jsonb_each(p_mapping) loop
      v_val := v_row->>v_col;
      if v_val is null or trim(v_val) = '' then continue; end if;
      v_val := trim(v_val);

      case v_field
        when 'full_name'     then v_full_name    := v_val;
        when 'first_name'    then v_first_name   := v_val;
        when 'last_name'     then v_last_name    := v_val;
        when 'primary_email' then
          -- Split the cell (may hold several addresses); first valid one becomes
          -- the primary, all are collected into the emails[] set.
          for v_email_tok in
            select lower(trim(t)) from regexp_split_to_table(v_val, '[\s;,/|]+') t
          loop
            if position('@' in v_email_tok) > 1 and not (v_email_tok = any(v_emails)) then
              v_emails := array_append(v_emails, v_email_tok);
              if v_email is null then v_email := v_email_tok; end if;
            end if;
          end loop;
        when 'additional_emails' then
          for v_email_tok in
            select lower(trim(t)) from regexp_split_to_table(v_val, '[\s;,/|]+') t
          loop
            if position('@' in v_email_tok) > 1 and not (v_email_tok = any(v_emails)) then
              v_emails := array_append(v_emails, v_email_tok);
            end if;
          end loop;
        when 'primary_phone' then v_phone        := regexp_replace(v_val, '[^0-9+\-() ]', '', 'g');
        when 'company'       then v_company      := v_val;
        when 'website'       then v_website      := case when v_val ~* '^https?://' then v_val else 'https://' || v_val end;
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
          business_id     = coalesce(leads.business_id,   v_business_id),
          first_name      = coalesce(leads.first_name,    v_first_name),
          last_name       = coalesce(leads.last_name,     v_last_name),
          primary_email   = coalesce(leads.primary_email,  v_email),
          emails          = (select array_agg(distinct e)
                             from unnest(coalesce(leads.emails, '{}'::text[]) || v_emails) e
                             where e is not null and e <> ''),
          primary_phone   = coalesce(leads.primary_phone,  v_phone),
          company         = coalesce(leads.company,        v_company),
          website         = coalesce(leads.website,        v_website),
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
          business_id     = coalesce(leads.business_id, v_business_id),
          first_name      = coalesce(v_first_name,   leads.first_name),
          last_name       = coalesce(v_last_name,    leads.last_name),
          primary_email   = coalesce(v_email,        leads.primary_email),
          emails          = (select array_agg(distinct e)
                             from unnest(coalesce(leads.emails, '{}'::text[]) || v_emails) e
                             where e is not null and e <> ''),
          primary_phone   = coalesce(v_phone,        leads.primary_phone),
          company         = coalesce(v_company,      leads.company),
          website         = coalesce(v_website,      leads.website),
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
      client_id, workspace_id, business_id, company, website, score, status, source, insights,
      first_name, last_name, primary_email, emails, primary_phone,
      linkedin_url, title, location, industry, company_size,
      import_batch_id, imported_at, custom_fields
    ) values (
      p_workspace_id, p_workspace_id, v_business_id, v_company, v_website,
      0, 'New', coalesce(v_source, 'File Import'), coalesce(v_insights, 'Imported from file'),
      v_first_name, v_last_name, v_email, nullif(v_emails, '{}'::text[]), v_phone,
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

  insert into public.audit_logs (user_id, workspace_id, action, details)
  values (p_workspace_id, p_workspace_id, 'FILE_IMPORT', format(
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
$function$
;
