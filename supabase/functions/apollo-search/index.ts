import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// In-memory rate limiting: 10 requests/min per user
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return true;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 10 requests per minute." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!APOLLO_API_KEY) {
      return new Response(JSON.stringify({ error: "Apollo API key not configured. Set APOLLO_API_KEY in Supabase secrets." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      person_titles = [],
      q_keywords = "",
      person_locations = [],
      organization_locations = [],
      employee_ranges = [],
      q_organization_domains = [],
      // Advanced filters
      person_seniorities = [],
      person_departments = [],
      contact_email_status = [],
      prospected_by_current_team = [],
      organization_latest_funding_stage_cd = [],
      organization_revenue_min,
      organization_revenue_max,
      page = 1,
      per_page = 25,
    } = body;

    // Build Apollo API request body
    const apolloBody: Record<string, unknown> = {
      page,
      per_page: Math.min(per_page, 100),
    };

    if (person_titles.length > 0) apolloBody.person_titles = person_titles;
    if (q_keywords) apolloBody.q_keywords = q_keywords;
    if (person_locations.length > 0) apolloBody.person_locations = person_locations;
    if (organization_locations.length > 0) apolloBody.organization_locations = organization_locations;
    if (employee_ranges.length > 0) apolloBody.organization_num_employees_ranges = employee_ranges;
    if (q_organization_domains.length > 0) apolloBody.q_organization_domains = q_organization_domains;
    // Advanced filters
    if (person_seniorities.length > 0) apolloBody.person_seniorities = person_seniorities;
    if (person_departments.length > 0) apolloBody.person_departments = person_departments;
    if (contact_email_status.length > 0) apolloBody.contact_email_status = contact_email_status;
    if (prospected_by_current_team.length > 0) apolloBody.prospected_by_current_team = prospected_by_current_team;
    if (organization_latest_funding_stage_cd.length > 0) apolloBody.organization_latest_funding_stage_cd = organization_latest_funding_stage_cd;
    if (organization_revenue_min !== undefined) apolloBody.organization_revenue_min = organization_revenue_min;
    if (organization_revenue_max !== undefined) apolloBody.organization_revenue_max = organization_revenue_max;

    // Call Apollo API
    const apolloRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(apolloBody),
    });

    if (!apolloRes.ok) {
      const errText = await apolloRes.text();
      console.error("Apollo API error:", apolloRes.status, errText);
      return new Response(JSON.stringify({ error: `Apollo API error (${apolloRes.status}): ${errText}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apolloData = await apolloRes.json();

    // Normalize people
    const people = (apolloData.people ?? []).map((p: Record<string, unknown>) => ({
      id: p.id,
      first_name: p.first_name ?? "",
      last_name: p.last_name ?? "",
      name: p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      title: p.title ?? "",
      email: p.email ?? "",
      linkedin_url: p.linkedin_url ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      country: p.country ?? "",
      organization: p.organization ?? {},
      phone_numbers: p.phone_numbers ?? [],
      headline: p.headline ?? "",
    }));

    const pagination = {
      page: apolloData.pagination?.page ?? page,
      per_page: apolloData.pagination?.per_page ?? per_page,
      total_entries: apolloData.pagination?.total_entries ?? 0,
      total_pages: apolloData.pagination?.total_pages ?? 0,
    };

    // Log search
    const { data: logData } = await supabaseAdmin.from("apollo_search_logs").insert({
      user_id: user.id,
      query_params: body,
      results_count: pagination.total_entries,
    }).select("id").single();

    return new Response(
      JSON.stringify({
        people,
        pagination,
        search_log_id: logData?.id ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("apollo-search error:", err);
    return new Response(JSON.stringify({ error: `Internal server error: ${(err as Error).message}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
