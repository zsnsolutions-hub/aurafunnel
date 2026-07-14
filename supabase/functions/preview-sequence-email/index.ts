// supabase/functions/preview-sequence-email/index.ts
//
// Generates the AI-personalized email a specific lead would receive for a
// campaign step — using the SAME prompt as process-email-writing-queue, so the
// preview matches the actual send. Lets users preview per-lead content (and see
// how {{company}} etc. get filled) before starting the campaign.
//
// buildBusinessContext + buildPrompt + callGemini are copied from
// process-email-writing-queue and MUST stay in sync with it.
// Deploy: supabase functions deploy preview-sequence-email

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function buildBusinessContext(profile?: Record<string, unknown>): string {
  if (!profile) return "";
  const parts: string[] = [];
  const add = (label: string, v: unknown) => { if (v) parts.push(`${label}: ${v}`); };
  add("Company", profile.companyName); add("Industry", profile.industry); add("Website", profile.companyWebsite);
  add("Products/Services", profile.productsServices); add("Value Proposition", profile.valueProp);
  add("Target Audience", profile.targetAudience); add("Pricing Model", profile.pricingModel);
  add("Sales Approach", profile.salesApproach); add("Business Description", profile.businessDescription);
  add("Competitive Advantage", profile.competitiveAdvantage); add("Brand Tone", profile.contentTone);
  const usps = profile.uniqueSellingPoints as string[] | undefined;
  if (usps?.length) parts.push(`USPs: ${usps.join(", ")}`);
  return parts.length ? `\n\nSENDER'S BUSINESS CONTEXT:\n${parts.join("\n")}` : "";
}

interface Body {
  template_subject: string; template_body: string; step_index?: number;
  lead: { name?: string; company?: string; title?: string; industry?: string; score?: number; insights?: string; knowledgeBase?: unknown; location?: string; website?: string; linkedin?: string; source?: string; company_size?: string; custom_fields?: Record<string, unknown> };
  config: { tone?: string; goal?: string; businessProfile?: Record<string, unknown> };
}

function buildPrompt(b: Body): { systemInstruction: string; userPrompt: string } {
  const { lead, config } = b;
  const systemInstruction =
    `You are an expert B2B email copywriter. Your task is to personalize a cold outreach email template for a specific prospect. ` +
    `Write a compelling, personalized email that feels human-written, not templated. ` +
    `Keep the email body under 200 words. Output valid HTML for the body (use <p>, <br>, <strong>, <em> tags only). ` +
    `Maintain a ${config.tone || "professional"} tone. ` +
    `The goal of this email is: ${config.goal || "book a meeting"}.` +
    buildBusinessContext(config.businessProfile);

  const prospectDetails = [
    `Name: ${lead.name || "Unknown"}`,
    `Company: ${lead.company || "Unknown"}`,
    lead.title ? `Title: ${lead.title}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.company_size ? `Company Size: ${lead.company_size}` : null,
    lead.location ? `Location: ${lead.location}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.linkedin ? `LinkedIn: ${lead.linkedin}` : null,
    lead.source ? `Lead Source: ${lead.source}` : null,
    lead.score != null ? `Lead Score: ${lead.score}/100` : null,
    lead.insights ? `Insights: ${lead.insights}` : null,
    lead.custom_fields && Object.keys(lead.custom_fields).length ? `Custom Fields: ${JSON.stringify(lead.custom_fields).slice(0, 400)}` : null,
    lead.knowledgeBase ? `Additional Context: ${JSON.stringify(lead.knowledgeBase).slice(0, 500)}` : null,
  ].filter(Boolean).join("\n");

  const userPrompt =
    `PROSPECT DETAILS:\n${prospectDetails}\n\n` +
    `TEMPLATE TO PERSONALIZE:\nSubject: ${b.template_subject}\nBody:\n${b.template_body}\n\n` +
    `SEQUENCE POSITION: Step ${(b.step_index ?? 0) + 1}\n\n` +
    `INSTRUCTIONS:\n` +
    `- Personalize the subject line to reference the prospect's company, role, or industry\n` +
    `- Open with a specific, researched observation using the details above (their role, industry, location, company size, website/LinkedIn, or lead source) — not a generic greeting\n` +
    `- Adapt the body to show you've genuinely researched the prospect; weave in 1-2 concrete details naturally (never dump a list)\n` +
    `- Keep the core message and CTA from the template; end with one clear, low-friction call to action\n` +
    `- If this is a follow-up step (step 2+), reference the previous email naturally and add a fresh angle\n` +
    `- Sound human and specific, not templated; avoid filler and clichés\n` +
    `- Return ONLY valid JSON with keys "subject" (string) and "body_html" (string with HTML)`;
  return { systemInstruction, userPrompt };
}

async function callGemini(systemInstruction: string, userPrompt: string): Promise<{ subject: string; body_html: string }> {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { subject: { type: "STRING" }, body_html: { type: "STRING" } }, required: ["subject", "body_html"] },
        temperature: 0.8, topP: 0.9, maxOutputTokens: 1024,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return JSON.parse(text);
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const pre = handleCors(req); if (pre) return pre;
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization" }, 401, cors);
    const { data: { user }, error } = await adminClient().auth.getUser(auth.replace("Bearer ", ""));
    if (error || !user) return json({ error: "Unauthorized" }, 401, cors);
    if (!GEMINI_API_KEY) return json({ error: "AI is not configured." }, 200, cors);

    const body = await req.json() as Body;
    if (!body?.template_body || !body?.lead) return json({ error: "Missing step content or lead." }, 400, cors);

    const { systemInstruction, userPrompt } = buildPrompt(body);
    const result = await callGemini(systemInstruction, userPrompt);
    return json({ subject: result.subject, body_html: result.body_html }, 200, cors);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Preview failed" }, 500, cors);
  }
});
