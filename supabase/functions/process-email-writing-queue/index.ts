import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const BATCH_SIZE = 5;
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SequenceConfig {
  tone?: string;
  goal?: string;
  from_email?: string;
  from_name?: string;
  provider?: string;
  businessProfile?: Record<string, unknown>;
}

// Build business context string from profile (mirrors lib/gemini.ts pattern)
function buildBusinessContext(profile?: Record<string, unknown>): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.companyName) parts.push(`Company: ${profile.companyName}`);
  if (profile.industry) parts.push(`Industry: ${profile.industry}`);
  if (profile.companyWebsite) parts.push(`Website: ${profile.companyWebsite}`);
  if (profile.productsServices) parts.push(`Products/Services: ${profile.productsServices}`);
  if (profile.valueProp) parts.push(`Value Proposition: ${profile.valueProp}`);
  if (profile.targetAudience) parts.push(`Target Audience: ${profile.targetAudience}`);
  if (profile.pricingModel) parts.push(`Pricing Model: ${profile.pricingModel}`);
  if (profile.salesApproach) parts.push(`Sales Approach: ${profile.salesApproach}`);
  if (profile.businessDescription) parts.push(`Business Description: ${profile.businessDescription}`);
  if (profile.phone) parts.push(`Phone: ${profile.phone}`);
  if (profile.businessEmail) parts.push(`Contact Email: ${profile.businessEmail}`);
  if (profile.competitiveAdvantage) parts.push(`Competitive Advantage: ${profile.competitiveAdvantage}`);
  if (profile.contentTone) parts.push(`Brand Tone: ${profile.contentTone}`);
  const usps = profile.uniqueSellingPoints as string[] | undefined;
  if (usps?.length) parts.push(`USPs: ${usps.join(", ")}`);
  if (parts.length === 0) return "";
  return `\n\nSENDER'S BUSINESS CONTEXT:\n${parts.join("\n")}`;
}

// Build the Gemini prompt for one item
function buildPrompt(
  item: Record<string, unknown>,
  config: SequenceConfig
): { systemInstruction: string; userPrompt: string } {
  const ctx = item.lead_context as Record<string, unknown> | undefined;

  const systemInstruction =
    `You are an expert B2B email copywriter. Your task is to personalize a cold outreach email template for a specific prospect. ` +
    `Write a compelling, personalized email that feels human-written, not templated. ` +
    `Keep the email body under 200 words. Output valid HTML for the body (use <p>, <br>, <strong>, <em> tags only). ` +
    `Maintain a ${config.tone || "professional"} tone. ` +
    `The goal of this email is: ${config.goal || "book a meeting"}.` +
    buildBusinessContext(config.businessProfile);

  const prospectDetails = [
    `Name: ${item.lead_name || "Unknown"}`,
    `Company: ${item.lead_company || "Unknown"}`,
    ctx?.title ? `Title: ${ctx.title}` : null,
    ctx?.industry ? `Industry: ${ctx.industry}` : null,
    ctx?.score != null ? `Lead Score: ${ctx.score}/100` : null,
    ctx?.insights ? `Insights: ${ctx.insights}` : null,
    ctx?.knowledgeBase
      ? `Additional Context: ${JSON.stringify(ctx.knowledgeBase).slice(0, 500)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt =
    `PROSPECT DETAILS:\n${prospectDetails}\n\n` +
    `TEMPLATE TO PERSONALIZE:\nSubject: ${item.template_subject}\nBody:\n${item.template_body}\n\n` +
    `SEQUENCE POSITION: Step ${(item.step_index as number) + 1}\n\n` +
    `INSTRUCTIONS:\n` +
    `- Personalize the subject line to reference the prospect's company, role, or industry\n` +
    `- Adapt the body to show you've researched the prospect\n` +
    `- Keep the core message and CTA from the template\n` +
    `- If this is a follow-up step (step 2+), reference the previous email naturally\n` +
    `- Return ONLY valid JSON with keys "subject" (string) and "body_html" (string with HTML)`;

  return { systemInstruction, userPrompt };
}

// Call Gemini REST API
async function callGemini(
  systemInstruction: string,
  userPrompt: string
): Promise<{ subject: string; body_html: string }> {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            subject: { type: "STRING" },
            body_html: { type: "STRING" },
          },
          required: ["subject", "body_html"],
        },
        temperature: 0.8,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  return JSON.parse(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Optionally receive a run_id to scope the work
    let targetRunId: string | null = null;
    try {
      const body = await req.json();
      targetRunId = body.run_id ?? null;
    } catch {
      // No body is fine — process any pending items
    }

    // Watchdog: reset stuck items
    await supabaseAdmin.rpc("reset_stuck_writing_items");

    // In-memory config cache
    const configCache = new Map<string, SequenceConfig>();

    let processed = 0;
    let remaining = 0;

    for (let i = 0; i < BATCH_SIZE; i++) {
      // Claim next item
      const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
        "claim_next_writing_item",
        { p_run_id: targetRunId }
      );

      if (claimError) {
        console.error("Claim error:", claimError.message);
        break;
      }

      const item = claimed?.[0];
      if (!item) break; // No more pending items

      const runId = item.run_id as string;

      try {
        // Fetch run config (cached)
        if (!configCache.has(runId)) {
          const { data: run } = await supabaseAdmin
            .from("email_sequence_runs")
            .select("sequence_config")
            .eq("id", runId)
            .single();

          configCache.set(runId, (run?.sequence_config ?? {}) as SequenceConfig);
        }

        const config = configCache.get(runId)!;
        const { systemInstruction, userPrompt } = buildPrompt(item, config);

        // Call Gemini
        const result = await callGemini(systemInstruction, userPrompt);

        // Mark as written
        await supabaseAdmin
          .from("email_sequence_run_items")
          .update({
            status: "written",
            ai_subject: result.subject,
            ai_body_html: result.body_html,
            locked_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Increment run's items_done
        const { count: doneCount } = await supabaseAdmin
          .from("email_sequence_run_items")
          .select("id", { count: "exact", head: true })
          .eq("run_id", runId)
          .eq("status", "written");

        await supabaseAdmin
          .from("email_sequence_runs")
          .update({
            items_done: doneCount ?? 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", runId);

        processed++;
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`AI write failed for item ${item.id}:`, errMsg);

        if ((item.attempt_count as number) >= 3) {
          // Max retries — mark as failed
          await supabaseAdmin
            .from("email_sequence_run_items")
            .update({
              status: "failed",
              error_message: errMsg,
              locked_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          // Update run failed count
          const { count: failedCount } = await supabaseAdmin
            .from("email_sequence_run_items")
            .select("id", { count: "exact", head: true })
            .eq("run_id", runId)
            .eq("status", "failed");

          await supabaseAdmin
            .from("email_sequence_runs")
            .update({
              items_failed: failedCount ?? 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", runId);
        } else {
          // Reset to pending for retry
          await supabaseAdmin
            .from("email_sequence_run_items")
            .update({
              status: "pending",
              error_message: errMsg,
              locked_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
        }
      }

      // Check if run is complete (no pending/writing items remain)
      const { count: pendingCount } = await supabaseAdmin
        .from("email_sequence_run_items")
        .select("id", { count: "exact", head: true })
        .eq("run_id", runId)
        .in("status", ["pending", "writing"]);

      if (pendingCount === 0) {
        // Finalize: insert into scheduled_emails + mark run completed
        await supabaseAdmin.rpc("finalize_email_sequence_run", {
          p_run_id: runId,
        });

        // Trigger immediate sending of due emails (step 0 / delay_days=0)
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          });
        } catch (sendErr) {
          console.error("Failed to trigger scheduled email processing:", sendErr);
        }
      }
    }

    // Count remaining items across active runs
    const { count: remainingCount } = await supabaseAdmin
      .from("email_sequence_run_items")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "writing"]);

    remaining = remainingCount ?? 0;

    return new Response(
      JSON.stringify({ processed, remaining }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("process-email-writing-queue error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
