import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

// ── Lead discovery via People Data Labs (PDL) Person Search ──────────────────
// Roadmap 1.4. Holds the PDL_API_KEY server-side and turns a small set of form
// filters into a PDL Elasticsearch query. Returns normalized prospects; the
// client imports the selected ones workspace-correctly via the import_leads_batch
// RPC. Gated: with no key set it returns a clear "not configured" message (200)
// so the UI can show a setup state instead of a hard error.

const PDL_API_KEY = Deno.env.get("PDL_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// In-memory rate limiting: 10 requests/min per user (best-effort per instance).
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (rateLimitMap.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return true;
}

const json = (body: unknown, cors: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface DiscoveryParams {
  titles?: string[];
  keywords?: string;
  industries?: string[];
  locations?: string[];
  company_sizes?: string[];
  require_email?: boolean;
  size?: number;
}

/** Build a PDL Elasticsearch bool query from the form filters. Each provided
 *  filter is a required clause; PDL controlled-vocab fields (industry, size) use
 *  term matches, free-text fields use match. */
function buildPdlQuery(p: DiscoveryParams): { query: Record<string, unknown>; clauseCount: number } {
  const must: Record<string, unknown>[] = [];
  const should: Record<string, unknown>[] = [];

  for (const t of p.titles ?? []) if (t.trim()) should.push({ match: { job_title: t.trim() } });
  if (should.length) must.push({ bool: { should, minimum_should_match: 1 } });

  if (p.keywords?.trim()) must.push({ match: { job_title: p.keywords.trim() } });

  const inds = (p.industries ?? []).map((i) => i.trim().toLowerCase()).filter(Boolean);
  if (inds.length) must.push({ terms: { industry: inds } });

  const locShould = (p.locations ?? []).map((l) => l.trim()).filter(Boolean).map((l) => ({ match: { location_name: l } }));
  if (locShould.length) must.push({ bool: { should: locShould, minimum_should_match: 1 } });

  const sizes = (p.company_sizes ?? []).map((s) => s.trim()).filter(Boolean);
  if (sizes.length) must.push({ terms: { job_company_size: sizes } });

  if (p.require_email) must.push({ exists: { field: "work_email" } });

  return { query: { bool: { must } }, clauseCount: must.length };
}

/** Normalize one PDL person record to the app's discovered-prospect shape. */
function normalizePerson(r: Record<string, unknown>) {
  const emails = Array.isArray(r.emails) ? (r.emails as { address?: string }[]) : [];
  const email = (r.work_email as string) || (r.recommended_personal_email as string) || emails[0]?.address || "";
  const phones = Array.isArray(r.phone_numbers) ? (r.phone_numbers as string[]) : [];
  return {
    pdl_id: (r.id as string) ?? "",
    first_name: (r.first_name as string) ?? "",
    last_name: (r.last_name as string) ?? "",
    full_name: (r.full_name as string) ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    title: (r.job_title as string) ?? "",
    company: (r.job_company_name as string) ?? "",
    website: (r.job_company_website as string) ?? "",
    email,
    linkedin_url: (r.linkedin_url as string) ? `https://${r.linkedin_url}` : "",
    location: (r.location_name as string) ?? "",
    industry: (r.industry as string) ?? "",
    company_size: (r.job_company_size as string) ?? "",
    phone: (r.mobile_phone as string) || phones[0] || "",
  };
}

serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, cors);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Invalid token" }, cors);

    if (!checkRateLimit(user.id)) return json({ error: "Rate limit exceeded. Max 10 searches per minute." }, cors);

    if (!PDL_API_KEY) {
      return json({ error: "Lead discovery isn't set up yet — PDL_API_KEY is not configured. Add it in Supabase secrets.", not_configured: true }, cors);
    }

    const params = (await req.json()) as DiscoveryParams;
    const { query, clauseCount } = buildPdlQuery(params);
    if (clauseCount === 0) {
      return json({ error: "Add at least one filter (title, industry, location, company size, or keywords)." }, cors);
    }

    const size = Math.min(Math.max(params.size ?? 25, 1), 100);
    const pdlRes = await fetch("https://api.peopledatalabs.com/v5/person/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": PDL_API_KEY },
      body: JSON.stringify({ query, size }),
    });

    const pdlData = await pdlRes.json().catch(() => ({}));
    if (!pdlRes.ok) {
      // PDL returns 404 with an empty data set when nothing matches — treat as no results.
      if (pdlRes.status === 404) return json({ people: [], total: 0 }, cors);
      const msg = (pdlData?.error?.message as string) || `PDL API error (${pdlRes.status})`;
      console.error("pdl-search error:", pdlRes.status, msg);
      return json({ error: msg }, cors);
    }

    const records = Array.isArray(pdlData.data) ? (pdlData.data as Record<string, unknown>[]) : [];
    const people = records.map(normalizePerson);
    return json({ people, total: (pdlData.total as number) ?? people.length }, cors);
  } catch (err) {
    console.error("pdl-search fatal:", err);
    return json({ error: `Internal server error: ${(err as Error).message}` }, cors);
  }
});
