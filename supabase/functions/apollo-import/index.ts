import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function computeScore(contact: Record<string, unknown>): number {
  let score = 50;
  if (contact.email) score += 10;
  if (contact.linkedin_url) score += 10;
  if (contact.title) score += 8;
  const org = contact.organization as Record<string, unknown> | undefined;
  if (org?.name) score += 7;
  const phones = contact.phone_numbers as unknown[] | undefined;
  if (phones && phones.length > 0) score += 5;
  return Math.max(55, Math.min(95, score));
}

function buildLocation(contact: Record<string, unknown>): string {
  const parts = [contact.city, contact.state, contact.country].filter(Boolean);
  return parts.join(", ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 10 requests per minute." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { contacts = [], search_log_id = null } = body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ error: "No contacts provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's existing leads for dedup
    const { data: existingLeads } = await supabaseAdmin
      .from("leads")
      .select("id, name, email, company, knowledgeBase")
      .eq("client_id", user.id);

    const emailSet = new Set<string>();
    const linkedinSet = new Set<string>();
    const companyNameSet = new Set<string>();

    for (const lead of existingLeads ?? []) {
      if (lead.email) emailSet.add(lead.email.toLowerCase());
      const kb = lead.knowledgeBase as Record<string, string> | null;
      if (kb?.linkedin) linkedinSet.add(kb.linkedin.toLowerCase());
      if (lead.company && lead.name) {
        companyNameSet.add(`${lead.company.toLowerCase()}::${lead.name.toLowerCase()}`);
      }
    }

    const imported: Record<string, unknown>[] = [];
    const skipped: { name: string; reason: string }[] = [];
    let failed = 0;

    // Also track within-batch dedup
    const batchEmailSet = new Set<string>();
    const batchLinkedinSet = new Set<string>();
    const batchCompanyNameSet = new Set<string>();

    const leadsToInsert: Record<string, unknown>[] = [];

    for (const contact of contacts) {
      const email = (contact.email ?? "").toLowerCase();
      const linkedinUrl = (contact.linkedin_url ?? "").toLowerCase();
      const org = contact.organization as Record<string, unknown> | undefined;
      const company = (org?.name as string) ?? "";
      const name = contact.name ?? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
      const companyNameKey = `${company.toLowerCase()}::${name.toLowerCase()}`;

      // Check existing leads
      if (email && emailSet.has(email)) {
        skipped.push({ name, reason: "Email already exists" });
        continue;
      }
      if (linkedinUrl && linkedinSet.has(linkedinUrl)) {
        skipped.push({ name, reason: "LinkedIn URL already exists" });
        continue;
      }
      if (company && name && companyNameSet.has(companyNameKey)) {
        skipped.push({ name, reason: "Company + name match" });
        continue;
      }

      // Check within-batch dedup
      if (email && batchEmailSet.has(email)) {
        skipped.push({ name, reason: "Duplicate in import batch (email)" });
        continue;
      }
      if (linkedinUrl && batchLinkedinSet.has(linkedinUrl)) {
        skipped.push({ name, reason: "Duplicate in import batch (LinkedIn)" });
        continue;
      }
      if (company && name && batchCompanyNameSet.has(companyNameKey)) {
        skipped.push({ name, reason: "Duplicate in import batch (company+name)" });
        continue;
      }

      // Track batch
      if (email) batchEmailSet.add(email);
      if (linkedinUrl) batchLinkedinSet.add(linkedinUrl);
      if (company && name) batchCompanyNameSet.add(companyNameKey);

      // Build insights
      const insightParts = [
        contact.title ? `Title: ${contact.title}` : null,
        org?.industry ? `Industry: ${org.industry}` : null,
        buildLocation(contact) ? `Location: ${buildLocation(contact)}` : null,
      ].filter(Boolean);

      // Build knowledgeBase with structured fields
      const knowledgeBase: Record<string, unknown> = {};
      if (linkedinUrl) knowledgeBase.linkedin = contact.linkedin_url;
      const phones = contact.phone_numbers as { number: string }[] | undefined;
      const extraNotesParts: string[] = [];
      if (phones && phones.length > 0) extraNotesParts.push(`Phone: ${phones[0].number}`);
      if (contact.headline) extraNotesParts.push(`Headline: ${contact.headline}`);
      if (extraNotesParts.length > 0) knowledgeBase.extraNotes = extraNotesParts.join('\n');
      if (org?.website_url) knowledgeBase.website = org.website_url as string;
      if (contact.title) knowledgeBase.title = contact.title;
      if (org?.industry) knowledgeBase.industry = org.industry as string;
      if (org?.estimated_num_employees) knowledgeBase.employeeCount = String(org.estimated_num_employees);
      const loc = buildLocation(contact);
      if (loc) knowledgeBase.location = loc;

      leadsToInsert.push({
        client_id: user.id,
        name,
        company,
        email: contact.email ?? "",
        score: computeScore(contact),
        status: "New",
        lastActivity: new Date().toISOString(),
        insights: insightParts.join(" | "),
        source: "apollo",
        knowledgeBase,
      });
    }

    // Batch insert
    if (leadsToInsert.length > 0) {
      const { data: insertedData, error: insertError } = await supabaseAdmin
        .from("leads")
        .insert(leadsToInsert)
        .select("id, name, email, company, score");

      if (insertError) {
        // Fallback: retry without knowledgeBase in case column doesn't exist
        console.warn("Insert with knowledgeBase failed, retrying without:", insertError.message);
        const leadsWithoutKB = leadsToInsert.map(({ knowledgeBase: _kb, ...rest }) => rest);
        const { data: fallbackData, error: fallbackError } = await supabaseAdmin
          .from("leads")
          .insert(leadsWithoutKB)
          .select("id, name, email, company, score");

        if (fallbackError) {
          console.error("Fallback insert also failed:", fallbackError.message);
          failed = leadsToInsert.length;
        } else {
          imported.push(...(fallbackData ?? []));
        }
      } else {
        imported.push(...(insertedData ?? []));
      }
    }

    // Log import
    await supabaseAdmin.from("apollo_import_logs").insert({
      user_id: user.id,
      search_log_id: search_log_id,
      total_requested: contacts.length,
      imported_count: imported.length,
      skipped_count: skipped.length,
      failed_count: failed,
      duplicate_details: skipped,
    });

    // Log to audit_logs if table exists
    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      action: "apollo_import",
      details: JSON.stringify({
        imported: imported.length,
        skipped: skipped.length,
        failed,
        search_log_id,
      }),
    }).then(() => {}).catch(() => {});

    return new Response(
      JSON.stringify({
        imported: imported.length,
        skipped: skipped.length,
        failed,
        duplicates: skipped,
        imported_leads: imported,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("apollo-import error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
