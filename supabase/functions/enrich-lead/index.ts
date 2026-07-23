// supabase/functions/enrich-lead/index.ts
//
// Server-side background job for AI Knowledge-Base enrichment. The client saves
// the KB, builds the research prompt (prepareOnly), and POSTs it here. This
// function verifies ownership, enforces the AI ceiling, records a job row, and
// returns immediately (202) — then runs the (slow) grounded Gemini generation +
// parse + write in EdgeRuntime.waitUntil, so it completes even if the browser
// navigates away or closes. The client polls lead_enrichment_jobs for status.
//
// Deploy: supabase functions deploy enrich-lead

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.0.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { AI_MODELS } from "../_shared/aiModels.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = AI_MODELS.text;
const AI_RESEARCH_HEADER = "--- AI Research Brief ---";

type KB = Record<string, unknown>;

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function stripPreviousAIResearch(notes: string | undefined): string {
  if (!notes) return "";
  const idx = notes.indexOf(AI_RESEARCH_HEADER);
  return idx === -1 ? notes : notes.substring(0, idx).trim();
}

// Ported from lib/gemini.ts parseLeadResearchResponse — maps the web-intelligence
// JSON schema to KnowledgeBase fields. Kept in sync intentionally.
function parseLeadResearchResponse(text: string): KB {
  const result: KB = {};
  let data: Record<string, any> | null = null;
  try { data = JSON.parse(text); } catch {
    const stripped = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    try { data = JSON.parse(stripped); } catch {
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) { try { data = JSON.parse(match[0]); } catch { /* ignore */ } }
    }
  }
  if (data) {
    if (data.identity) {
      if (data.identity.company_type) result.title = data.identity.company_type;
      if (data.identity.long_description || data.identity.short_description) {
        result.companyOverview = data.identity.long_description || data.identity.short_description;
      }
    }
    if (data.industry?.primary_industry) result.industry = data.industry.primary_industry;
    if (data.locations?.headquarters) {
      const hq = data.locations.headquarters;
      const parts = [hq.city, hq.state_region, hq.country].filter(Boolean);
      if (parts.length > 0) result.location = parts.join(", ");
    }
    if (data.lead_context) {
      if (data.lead_context.title) result.title = data.lead_context.title;
      if (data.lead_context.talking_points?.length) result.talkingPoints = data.lead_context.talking_points;
      if (data.lead_context.outreach_angle) result.outreachAngle = data.lead_context.outreach_angle;
      if (data.lead_context.risk_factors?.length) result.riskFactors = data.lead_context.risk_factors;
      if (data.lead_context.mentioned_on_website && String(data.lead_context.mentioned_on_website).toLowerCase() !== "not found") {
        result.mentionedOnWebsite = data.lead_context.mentioned_on_website;
      }
    }
    const briefParts: string[] = [];
    if (data.identity?.business_name) briefParts.push(`${data.identity.business_name}${data.identity.tagline ? " — " + data.identity.tagline : ""}`);
    if (data.identity?.long_description) briefParts.push(data.identity.long_description);
    if (data.industry?.primary_industry) briefParts.push(`Industry: ${data.industry.primary_industry}${data.industry.secondary_industries?.length ? " (" + data.industry.secondary_industries.join(", ") + ")" : ""}`);
    if (data.offerings?.services?.length) briefParts.push(`Services: ${data.offerings.services.map((s: any) => s.name).join(", ")}`);
    if (data.offerings?.products?.length) briefParts.push(`Products: ${data.offerings.products.map((p: any) => p.name).join(", ")}`);
    if (data.pricing?.pricing_model) briefParts.push(`Pricing: ${data.pricing.pricing_model}${data.pricing.plans?.length ? " — " + data.pricing.plans.map((p: any) => `${p.plan_name}: ${p.price}`).join(", ") : ""}`);
    if (data.contact?.primary_email) briefParts.push(`Contact: ${data.contact.primary_email}`);
    if (data.meta?.confidence_overall != null) briefParts.push(`Overall confidence: ${(data.meta.confidence_overall * 100).toFixed(0)}%`);
    if (briefParts.length > 0) result.aiResearchBrief = briefParts.join("\n\n");
  }
  result.aiResearchedAt = new Date().toISOString();
  return result;
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const cors = getCorsHeaders(req);

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not configured" }, 500, cors);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401, cors);

  const admin = adminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401, cors);

  let body: {
    lead_id?: string; prompt?: string; systemInstruction?: string;
    temperature?: number; topP?: number; currentKb?: KB; label?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }

  const leadId = body.lead_id;
  const prompt = body.prompt;
  if (!leadId || !prompt) return json({ error: "lead_id and prompt are required" }, 400, cors);

  // Ownership check
  const { data: lead } = await admin.from("leads")
    .select("id, client_id").eq("id", leadId).eq("client_id", user.id).maybeSingle();
  if (!lead) return json({ error: "Lead not found for this account" }, 403, cors);

  // AI ceiling (parity with gemini-proxy — anti-bypass, fails closed).
  try {
    const { data: quota, error: qErr } = await admin.rpc("enforce_ai_proxy_quota", {
      p_user_id: user.id, p_operation: "lead_research", p_kind: "content",
    });
    if (qErr) return json({ error: "AI credit check failed. Please try again." }, 503, cors);
    const q = quota as { allowed?: boolean; reason?: string; remaining?: number } | null;
    if (!q?.allowed) return json({ error: "Insufficient AI credits.", reason: q?.reason, remaining: q?.remaining }, 402, cors);
  } catch {
    return json({ error: "AI credit check failed. Please try again." }, 503, cors);
  }

  // Create the job row and respond immediately.
  const { data: job, error: jobErr } = await admin.from("lead_enrichment_jobs")
    .insert({ lead_id: leadId, client_id: user.id, label: body.label ?? "Enriching lead…", status: "processing" })
    .select("id").single();
  if (jobErr || !job) return json({ error: "Could not start job" }, 500, cors);
  const jobId = (job as { id: string }).id;

  const currentKb: KB = body.currentKb ?? {};
  const systemInstruction = body.systemInstruction ?? "";
  const temperature = body.temperature;
  const topP = body.topP;

  const work = (async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      let response: { text?: string } | null = null;
      try {
        response = await ai.models.generateContent({
          model: GEMINI_MODEL, contents: prompt,
          config: { systemInstruction, temperature, topP, tools: [{ googleSearch: {} }, { urlContext: {} }] } as never,
        });
      } catch { response = null; }
      if (!response?.text) {
        response = await ai.models.generateContent({
          model: GEMINI_MODEL, contents: prompt,
          config: { systemInstruction, temperature, topP } as never,
        });
      }
      const text = response?.text ?? "";
      if (!text) throw new Error("Empty research response");

      const structured = parseLeadResearchResponse(text);
      const briefText = (structured.aiResearchBrief as string) || text;
      const userNotes = stripPreviousAIResearch(currentKb.extraNotes as string | undefined);
      const merged = userNotes ? `${userNotes}\n\n${AI_RESEARCH_HEADER}\n${briefText}` : `${AI_RESEARCH_HEADER}\n${briefText}`;

      const updatedKb: KB = {
        ...currentKb,
        extraNotes: merged,
        title: structured.title || currentKb.title,
        industry: structured.industry || currentKb.industry,
        employeeCount: structured.employeeCount || currentKb.employeeCount,
        location: structured.location || currentKb.location,
        companyOverview: structured.companyOverview || currentKb.companyOverview,
        talkingPoints: structured.talkingPoints || currentKb.talkingPoints,
        outreachAngle: structured.outreachAngle || currentKb.outreachAngle,
        riskFactors: structured.riskFactors || currentKb.riskFactors,
        aiResearchBrief: briefText,
        aiResearchedAt: structured.aiResearchedAt,
        mentionedOnWebsite: structured.mentionedOnWebsite || currentKb.mentionedOnWebsite,
      };
      const newInsights = briefText.substring(0, 200);

      await admin.from("leads").update({ knowledgeBase: updatedKb, insights: newInsights })
        .eq("id", leadId).eq("client_id", user.id);
      await admin.from("lead_enrichment_jobs")
        .update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await admin.from("lead_enrichment_jobs")
        .update({ status: "error", error: msg, finished_at: new Date().toISOString() }).eq("id", jobId);
    }
  })();

  // Keep the instance alive until the background work finishes.
  const edge = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(work); else await work;

  return json({ job_id: jobId }, 202, cors);
});
