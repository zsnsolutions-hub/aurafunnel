-- Roadmap 5.1 (BUG-035) — indexed phone → lead reverse lookup for inbound calls.
-- Previously twilio-voicemail + IncomingCallProvider each scanned up to 3000 leads
-- and normalized in JS. Add a normalized-phone expression index + an RPC.

-- Normalize to the last 10 digits (national number) so "+1 (555) 123-4567",
-- "+15551234567", "5551234567" all match. IMMUTABLE so it can back an index.
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) $$;

-- Index the primary phone (the common match path).
CREATE INDEX IF NOT EXISTS idx_leads_phone_norm
  ON public.leads (public.normalize_phone(primary_phone))
  WHERE primary_phone IS NOT NULL;

-- Reverse lookup. SECURITY INVOKER so RLS scopes client callers to their own
-- workspace's leads; service-role callers (twilio-voicemail) see all (needed for
-- inbound routing). Matches primary_phone (indexed) or any element of phones[].
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS TABLE (
  id uuid, client_id uuid, first_name text, last_name text, company text,
  primary_phone text, business_id uuid, workspace_id uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT l.id, l.client_id, l.first_name, l.last_name, l.company, l.primary_phone, l.business_id, l.workspace_id
  FROM public.leads l
  WHERE public.normalize_phone(p_phone) <> ''
    AND (
      public.normalize_phone(l.primary_phone) = public.normalize_phone(p_phone)
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(l.phones, '{}')) ph
        WHERE public.normalize_phone(ph) = public.normalize_phone(p_phone)
      )
    )
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_lead_by_phone(text) TO authenticated, service_role;
