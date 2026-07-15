import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { getMonthlyEmailLimit, resolvePlanName } from "../_shared/plans.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

interface LeadInput {
  id: string;
  email: string;
  name: string;
  company: string;
  score?: number;
  status?: string;
  insights?: string;
  knowledgeBase?: Record<string, unknown>;
  industry?: string;
  title?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  source?: string;
  company_size?: string;
  phone?: string;
  custom_fields?: Record<string, unknown>;
}

interface StepInput {
  stepIndex: number;
  delayDays: number;
  subject: string;
  subjectVariants?: string[];
  bodyVariants?: string[];
  body: string;
}

// Mail-merge: substitute {{field}} tokens from the lead. Known tokens get sensible
// fallbacks; unknown tokens are left untouched.
function mergeFields(tpl: string, lead: LeadInput, fromName: string): string {
  const first = (lead.name || "").trim().split(/\s+/)[0] || "there";
  const map: Record<string, string> = {
    first_name: first,
    last_name: (lead.name || "").trim().split(/\s+/).slice(1).join(" "),
    name: lead.name || "there",
    full_name: lead.name || "there",
    company: lead.company || "your company",
    title: lead.title || "",
    industry: lead.industry || "",
    location: lead.location || "",
    website: lead.website || "",
    linkedin: lead.linkedin || "",
    source: lead.source || "",
    company_size: lead.company_size || "",
    email: lead.email || "",
    phone: lead.phone || "",
    your_name: fromName,
  };
  return (tpl || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, k) => {
    const key = String(k).toLowerCase();
    if (key.startsWith("custom.")) {
      const v = lead.custom_fields?.[key.slice(7)];
      return v == null ? "" : String(v);
    }
    return key in map ? map[key] : m;
  });
}

// Convert plain-text bodies to HTML (leave already-HTML bodies as-is).
function nl2brHtml(s: string): string {
  return /<(p|br|div|ul|ol|table|a|strong|em|span|h[1-6])\b/i.test(s || "") ? (s || "") : (s || "").replace(/\n/g, "<br>");
}

interface ConfigInput {
  tone: string;
  goal: string;
  cadence?: string;
  templateCategory?: string;
  fromEmail?: string;
  fromName?: string;
  provider?: string;
  businessProfile?: Record<string, unknown>;
  sendMode?: string;
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Authenticate the user via JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const leads: LeadInput[] = body.leads;
    const steps: StepInput[] = body.steps;
    const config: ConfigInput = body.config;

    if (!leads?.length || !steps?.length) {
      return new Response(
        JSON.stringify({ error: "leads and steps are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const totalItems = leads.length * steps.length;

    // Pre-flight: check monthly usage limit via workspace_usage_counters
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const { data: usageData } = await supabaseAdmin.rpc(
      "get_workspace_monthly_usage",
      {
        p_workspace_id: user.id,
        p_month_key: monthKey,
      }
    );
    const currentUsage = Number(
      (Array.isArray(usageData) ? usageData[0] : usageData)
        ?.total_emails_sent ?? 0
    );

    // Fetch user's plan and resolve limits
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const resolvedPlan = resolvePlanName(profile?.plan);
    const limit = getMonthlyEmailLimit(resolvedPlan);

    if (currentUsage + totalItems > limit) {
      return new Response(
        JSON.stringify({
          error: `Monthly email limit would be exceeded. Current: ${currentUsage}, Requested: ${totalItems}, Limit: ${limit}`,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert run
    const { data: run, error: runError } = await supabaseAdmin
      .from("email_sequence_runs")
      .insert({
        owner_id: user.id,
        workspace_id: user.id, // NOT NULL; mirrors owner id (legacy convention)
        status: "processing",
        lead_count: leads.length,
        step_count: steps.length,
        items_total: totalItems,
        items_done: 0,
        items_failed: 0,
        sequence_config: {
          tone: config.tone,
          goal: config.goal,
          cadence: config.cadence,
          templateCategory: config.templateCategory,
          from_email: config.fromEmail,
          from_name: config.fromName,
          provider: config.provider,
          businessProfile: config.businessProfile,
          sendMode: config.sendMode,
          campaignId: (config as { campaignId?: string }).campaignId,
          sendWindow: (config as { sendWindow?: unknown }).sendWindow,
          sendBestTime: (config as { sendBestTime?: boolean }).sendBestTime,
        },
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runError || !run) {
      throw new Error(`Failed to create run: ${runError?.message}`);
    }

    // Verbatim / mail-merge mode: send the template as-is with {{fields}}
    // substituted, no AI rewrite. Items are created already "written" so they
    // skip the AI writing queue and go straight to the sender.
    const aiPersonalize = (config as { aiPersonalize?: boolean }).aiPersonalize !== false;
    const fromName = (config as { fromName?: string }).fromName || "";

    // Send-time optimization: learn each lead's most-engaged hour (UTC) from
    // their historical opens. Opens already reflect local active time, so no
    // per-lead timezone is needed. Requires >=2 opens; else null (sender defaults).
    const bestHourByLead: Record<string, number> = {};
    if ((config as { sendBestTime?: boolean }).sendBestTime && leads.length) {
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { data: opens } = await supabaseAdmin
        .from("email_events")
        .select("created_at, email_messages!inner(lead_id)")
        .eq("event_type", "open")
        .gte("created_at", since)
        .in("email_messages.lead_id", leads.map((l) => l.id))
        .limit(10000);
      const hist: Record<string, number[]> = {};
      for (const o of (opens ?? []) as { created_at: string; email_messages: { lead_id: string } | { lead_id: string }[] }[]) {
        const em = Array.isArray(o.email_messages) ? o.email_messages[0] : o.email_messages;
        const lid = em?.lead_id; if (!lid) continue;
        (hist[lid] ??= new Array(24).fill(0))[new Date(o.created_at).getUTCHours()]++;
      }
      for (const [lid, counts] of Object.entries(hist)) {
        if (counts.reduce((a, b) => a + b, 0) < 2) continue;
        let best = 0, bestC = -1;
        for (let h = 0; h < 24; h++) if (counts[h] > bestC) { bestC = counts[h]; best = h; }
        bestHourByLead[lid] = best;
      }
    }

    // Batch-insert all items (lead × step). Subject variants (A/B) rotate across
    // leads so each variant gets an even share.
    const items = [];
    let leadIndex = 0;
    for (const lead of leads) {
      for (const step of steps) {
        // A "variant" selects both a subject and a body (independent counts;
        // missing lane falls back to variant A).
        const subjExtras = (step.subjectVariants ?? []).filter(v => (v ?? "").trim());
        const bodyExtras = (step.bodyVariants ?? []).filter(v => (v ?? "").trim());
        const variantCount = Math.max(subjExtras.length, bodyExtras.length) + 1;
        const vIdx = variantCount > 1 ? leadIndex % variantCount : 0;
        const chosenSubject = vIdx === 0 ? step.subject : (subjExtras[vIdx - 1] ?? step.subject);
        const chosenBody = vIdx === 0 ? step.body : (bodyExtras[vIdx - 1] ?? step.body);
        const base = {
          run_id: run.id,
          lead_id: lead.id,
          step_index: step.stepIndex,
          lead_email: lead.email,
          lead_name: lead.name || "",
          lead_company: lead.company || "",
          lead_context: {
            score: lead.score,
            status: lead.status,
            insights: lead.insights,
            knowledgeBase: lead.knowledgeBase,
            industry: lead.industry,
            title: lead.title,
            location: lead.location,
            website: lead.website,
            linkedin: lead.linkedin,
            source: lead.source,
            company_size: lead.company_size,
            custom_fields: lead.custom_fields,
          },
          template_subject: chosenSubject,
          template_body: chosenBody,
          delay_days: step.delayDays,
          attempt_count: 0,
          subject_variant: vIdx,
          best_send_hour: bestHourByLead[lead.id] ?? null,
        };
        if (aiPersonalize) {
          items.push({ ...base, status: "pending" });
        } else {
          items.push({
            ...base,
            status: "written",
            ai_subject: mergeFields(chosenSubject, lead, fromName),
            ai_body_html: nl2brHtml(mergeFields(chosenBody, lead, fromName)),
          });
        }
      }
      leadIndex++;
    }

    // Insert in chunks of 500 to avoid payload limits
    const chunkSize = 500;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const { error: insertError } = await supabaseAdmin
        .from("email_sequence_run_items")
        .insert(chunk);

      if (insertError) {
        // Clean up the run on failure
        await supabaseAdmin
          .from("email_sequence_runs")
          .update({ status: "failed", error_summary: insertError.message })
          .eq("id", run.id);
        throw new Error(`Failed to insert items: ${insertError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ run_id: run.id, items_total: totalItems }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("start-email-sequence-run error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
