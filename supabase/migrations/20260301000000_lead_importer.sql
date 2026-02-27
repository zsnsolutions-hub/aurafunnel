-- ============================================================================
-- Lead Importer: schema additions, import_batches table, dedupe indexes, RPC
-- ============================================================================

-- ── 1. ALTER leads table ────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS primary_email    TEXT,
  ADD COLUMN IF NOT EXISTS emails           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_phone    TEXT,
  ADD COLUMN IF NOT EXISTS phones           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linkedin_url     TEXT,
  ADD COLUMN IF NOT EXISTS location         TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id  UUID,
  ADD COLUMN IF NOT EXISTS imported_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS custom_fields    JSONB DEFAULT '{}';

-- Make name/email nullable (they were NOT NULL; imported rows may lack one)
ALTER TABLE public.leads ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN name  DROP NOT NULL;

-- Ensure updated_at exists (core schema may already have it)
DO $$ BEGIN
  ALTER TABLE public.leads ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;


-- ── 2. Dedupe indexes ──────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_client_email
  ON public.leads (client_id, lower(primary_email))
  WHERE primary_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_client_linkedin
  ON public.leads (client_id, lower(linkedin_url))
  WHERE linkedin_url IS NOT NULL;


-- ── 3. import_batches table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_batches (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL DEFAULT 'csv',
  total_rows      INTEGER NOT NULL DEFAULT 0,
  imported_count  INTEGER NOT NULL DEFAULT 0,
  updated_count   INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  skipped_rows    JSONB DEFAULT '[]',
  column_mapping  JSONB DEFAULT '{}',
  options         JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import batches"
  ON public.import_batches FOR ALL
  USING (auth.uid() = workspace_id);


-- ── 4. import_leads_batch RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.import_leads_batch(
  p_workspace_id  UUID,
  p_file_name     TEXT,
  p_file_type     TEXT,
  p_rows          JSONB,      -- array of {col_name: value, …}
  p_mapping       JSONB,      -- {col_name: field_name, …}
  p_options       JSONB       -- {dedupe_strategy: 'merge'|'overwrite'|'skip', plan_name: '…'}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id       UUID;
  v_plan           TEXT;
  v_contact_limit  INTEGER;
  v_current_count  INTEGER;
  v_remaining      INTEGER;
  v_imported       INTEGER := 0;
  v_updated        INTEGER := 0;
  v_skipped        INTEGER := 0;
  v_skipped_rows   JSONB := '[]'::JSONB;
  v_row            JSONB;
  v_row_idx        INTEGER := 0;
  v_dedupe         TEXT;
  v_mapped         JSONB;
  v_field          TEXT;
  v_col            TEXT;
  v_val            TEXT;
  v_custom         JSONB;

  -- Extracted core fields
  v_full_name      TEXT;
  v_first_name     TEXT;
  v_last_name      TEXT;
  v_email          TEXT;
  v_phone          TEXT;
  v_company        TEXT;
  v_linkedin       TEXT;
  v_title          TEXT;
  v_location       TEXT;
  v_source         TEXT;
  v_industry       TEXT;
  v_company_size   TEXT;
  v_insights       TEXT;

  -- Legacy compat
  v_legacy_name    TEXT;
  v_legacy_email   TEXT;

  -- Dedupe
  v_existing_id    UUID;
  v_skip_reason    TEXT;
BEGIN
  -- ── Resolve plan → contact limit ──
  v_plan := COALESCE(p_options->>'plan_name', 'Starter');
  CASE v_plan
    WHEN 'Scale', 'Enterprise', 'Business' THEN v_contact_limit := 50000;
    WHEN 'Growth', 'Professional'          THEN v_contact_limit := 10000;
    ELSE                                         v_contact_limit := 1000;
  END CASE;

  -- Count current leads
  SELECT count(*) INTO v_current_count
    FROM public.leads
    WHERE client_id = p_workspace_id;

  v_remaining := v_contact_limit - v_current_count;
  v_dedupe := COALESCE(p_options->>'dedupe_strategy', 'merge');

  -- ── Create batch record ──
  INSERT INTO public.import_batches (workspace_id, file_name, file_type, total_rows, column_mapping, options, status)
  VALUES (p_workspace_id, p_file_name, p_file_type, jsonb_array_length(p_rows), p_mapping, p_options, 'processing')
  RETURNING id INTO v_batch_id;

  -- ── Loop rows ──
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_idx := v_row_idx + 1;

    -- Reset per-row vars
    v_full_name := NULL; v_first_name := NULL; v_last_name := NULL;
    v_email := NULL; v_phone := NULL; v_company := NULL;
    v_linkedin := NULL; v_title := NULL; v_location := NULL;
    v_source := NULL; v_industry := NULL; v_company_size := NULL;
    v_insights := NULL; v_custom := '{}'::JSONB;

    -- ── Apply column mapping ──
    FOR v_col, v_field IN SELECT key, value#>>'{}'  FROM jsonb_each(p_mapping)
    LOOP
      v_val := v_row->>v_col;
      IF v_val IS NULL OR trim(v_val) = '' THEN CONTINUE; END IF;
      v_val := trim(v_val);

      CASE v_field
        WHEN 'full_name'     THEN v_full_name    := v_val;
        WHEN 'first_name'    THEN v_first_name   := v_val;
        WHEN 'last_name'     THEN v_last_name    := v_val;
        WHEN 'primary_email' THEN v_email        := lower(v_val);
        WHEN 'primary_phone' THEN v_phone        := regexp_replace(v_val, '[^0-9+\-() ]', '', 'g');
        WHEN 'company'       THEN v_company      := v_val;
        WHEN 'linkedin_url'  THEN
          -- Normalize LinkedIn URL
          v_linkedin := lower(v_val);
          IF v_linkedin NOT LIKE 'http%' THEN
            v_linkedin := 'https://www.linkedin.com/in/' || v_linkedin;
          END IF;
          v_linkedin := regexp_replace(v_linkedin, '/+$', '');
        WHEN 'title'         THEN v_title        := v_val;
        WHEN 'location'      THEN v_location     := v_val;
        WHEN 'source'        THEN v_source       := v_val;
        WHEN 'industry'      THEN v_industry     := v_val;
        WHEN 'company_size'  THEN v_company_size := v_val;
        WHEN 'insights'      THEN v_insights     := v_val;
        ELSE
          -- Custom field (anything not core → goes into custom_fields)
          IF v_field LIKE 'custom:%' THEN
            v_custom := v_custom || jsonb_build_object(substring(v_field FROM 8), v_val);
          END IF;
      END CASE;
    END LOOP;

    -- ── Split full_name → first/last if needed ──
    IF v_full_name IS NOT NULL AND v_first_name IS NULL THEN
      v_first_name := split_part(v_full_name, ' ', 1);
      IF position(' ' IN v_full_name) > 0 THEN
        v_last_name := COALESCE(v_last_name, trim(substring(v_full_name FROM position(' ' IN v_full_name) + 1)));
      END IF;
    END IF;

    -- ── Legacy compat: populate name/email ──
    v_legacy_name := COALESCE(
      NULLIF(trim(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, '')), ''),
      v_full_name,
      v_company,
      'Unknown'
    );
    v_legacy_email := COALESCE(v_email, '');

    -- ── No identifier at all → mark needs_enrichment ──
    IF v_email IS NULL AND v_phone IS NULL AND v_linkedin IS NULL THEN
      v_custom := v_custom || '{"needs_enrichment": true}'::JSONB;
    END IF;

    -- ── Dedupe lookup: email → phone → linkedin ──
    v_existing_id := NULL;
    IF v_email IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.leads
        WHERE client_id = p_workspace_id AND lower(primary_email) = v_email
        LIMIT 1;
    END IF;
    IF v_existing_id IS NULL AND v_linkedin IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.leads
        WHERE client_id = p_workspace_id AND lower(linkedin_url) = v_linkedin
        LIMIT 1;
    END IF;

    -- ── Handle duplicates ──
    IF v_existing_id IS NOT NULL THEN
      IF v_dedupe = 'skip' THEN
        v_skipped := v_skipped + 1;
        v_skipped_rows := v_skipped_rows || jsonb_build_object(
          'row', v_row_idx, 'reason', 'duplicate', 'identifier', COALESCE(v_email, v_linkedin));
        CONTINUE;
      ELSIF v_dedupe = 'merge' THEN
        -- Fill blanks only
        UPDATE public.leads SET
          first_name    = COALESCE(leads.first_name,    v_first_name),
          last_name     = COALESCE(leads.last_name,     v_last_name),
          primary_email = COALESCE(leads.primary_email,  v_email),
          primary_phone = COALESCE(leads.primary_phone,  v_phone),
          company       = COALESCE(leads.company,        v_company),
          linkedin_url  = COALESCE(leads.linkedin_url,   v_linkedin),
          title         = COALESCE(leads.title,          v_title),
          location      = COALESCE(leads.location,       v_location),
          source        = COALESCE(leads.source,         v_source),
          industry      = COALESCE(leads.industry,       v_industry),
          company_size  = COALESCE(leads.company_size,   v_company_size),
          name          = COALESCE(NULLIF(leads.name, ''), v_legacy_name),
          email         = COALESCE(NULLIF(leads.email, ''), v_legacy_email),
          custom_fields = leads.custom_fields || v_custom,
          import_batch_id = v_batch_id,
          updated_at    = now()
        WHERE id = v_existing_id;
        v_updated := v_updated + 1;
        CONTINUE;
      ELSE -- overwrite
        UPDATE public.leads SET
          first_name    = COALESCE(v_first_name,   leads.first_name),
          last_name     = COALESCE(v_last_name,    leads.last_name),
          primary_email = COALESCE(v_email,        leads.primary_email),
          primary_phone = COALESCE(v_phone,        leads.primary_phone),
          company       = COALESCE(v_company,      leads.company),
          linkedin_url  = COALESCE(v_linkedin,     leads.linkedin_url),
          title         = COALESCE(v_title,        leads.title),
          location      = COALESCE(v_location,     leads.location),
          source        = COALESCE(v_source,       leads.source),
          industry      = COALESCE(v_industry,     leads.industry),
          company_size  = COALESCE(v_company_size, leads.company_size),
          name          = v_legacy_name,
          email         = v_legacy_email,
          custom_fields = v_custom || leads.custom_fields,
          import_batch_id = v_batch_id,
          updated_at    = now()
        WHERE id = v_existing_id;
        v_updated := v_updated + 1;
        CONTINUE;
      END IF;
    END IF;

    -- ── Plan limit check ──
    IF v_remaining <= 0 THEN
      v_skipped := v_skipped + 1;
      v_skipped_rows := v_skipped_rows || jsonb_build_object(
        'row', v_row_idx, 'reason', 'plan_limit');
      CONTINUE;
    END IF;

    -- ── Insert new lead ──
    INSERT INTO public.leads (
      client_id, name, email, company, score, status, source, insights,
      first_name, last_name, primary_email, primary_phone,
      linkedin_url, title, location, industry, company_size,
      import_batch_id, imported_at, custom_fields
    ) VALUES (
      p_workspace_id, v_legacy_name, v_legacy_email, v_company,
      0, 'New', COALESCE(v_source, 'File Import'), COALESCE(v_insights, 'Imported from file'),
      v_first_name, v_last_name, v_email, v_phone,
      v_linkedin, v_title, v_location, v_industry, v_company_size,
      v_batch_id, now(), v_custom
    );
    v_imported := v_imported + 1;
    v_remaining := v_remaining - 1;
  END LOOP;

  -- ── Finalize batch ──
  UPDATE public.import_batches SET
    imported_count = v_imported,
    updated_count  = v_updated,
    skipped_count  = v_skipped,
    skipped_rows   = v_skipped_rows,
    status         = 'completed',
    completed_at   = now()
  WHERE id = v_batch_id;

  -- ── Audit log ──
  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (p_workspace_id, 'FILE_IMPORT', format(
    'Imported %s, updated %s, skipped %s from %s',
    v_imported, v_updated, v_skipped, p_file_name
  ));

  RETURN jsonb_build_object(
    'batch_id',        v_batch_id,
    'imported_count',  v_imported,
    'updated_count',   v_updated,
    'skipped_count',   v_skipped,
    'skipped_rows',    v_skipped_rows,
    'plan_limit',      v_contact_limit,
    'contacts_before', v_current_count,
    'contacts_after',  v_current_count + v_imported
  );
END;
$$;
