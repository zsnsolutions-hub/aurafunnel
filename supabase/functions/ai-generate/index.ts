// supabase/functions/ai-generate/index.ts
//
// Generic single-shot text generation over SSE — a faithful copy of the WORKING
// ai-chat-stream structure (which streams reliably from the Edge), but generic:
// takes { prompt, systemInstruction }, streams the text back. Created because
// gemini-proxy's non-grounded generation hangs from the Edge runtime for reasons
// we couldn't pin down, while ai-chat-stream's exact pattern works. Used by the
// business-profile analyzer and per-field "Write with AI".
//
// Deploy: supabase functions deploy ai-generate

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.0.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL_NAME = "gemini-2.5-flash";
const RATE_LIMIT_PER_MIN = 30;

async function checkRateLimit(
  admin: ReturnType<typeof adminClient>,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("consume_ai_rate_limit", {
      p_user_id: userId,
      p_max_per_min: RATE_LIMIT_PER_MIN,
    });
    if (error) return true; // fail open
    const row = Array.isArray(data) ? data[0] : data;
    return row?.allowed !== false;
  } catch { return true; }
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s: number) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const admin = adminClient();
  const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  if (!(await checkRateLimit(admin, user.id))) {
    return json({ error: "Rate limit exceeded. Please wait a moment." }, 429);
  }

  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not configured" }, 500);

  let body: { prompt?: string; systemInstruction?: string; temperature?: number; topP?: number; operation?: string; responseMimeType?: string; responseSchema?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") return json({ error: "prompt is required" }, 400);
  if (prompt.length > 200_000) return json({ error: "prompt too long" }, 400);

  // AI ceiling enforcement (fast; same RPC gemini-proxy uses).
  try {
    const { data: quota, error: qErr } = await admin.rpc("enforce_ai_proxy_quota", {
      p_user_id: user.id, p_operation: body.operation ?? null, p_kind: "content",
    });
    if (qErr) return json({ error: "AI credit check failed. Please try again." }, 503);
    const q = quota as { allowed?: boolean; reason?: string; remaining?: number } | null;
    if (!q?.allowed) return json({ error: "Insufficient AI credits.", reason: q?.reason, remaining: q?.remaining }, 402);
  } catch {
    return json({ error: "AI credit check failed. Please try again." }, 503);
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const config: Record<string, unknown> = {
    temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
    topP: typeof body.topP === "number" ? body.topP : 0.9,
  };
  if (body.systemInstruction) config.systemInstruction = body.systemInstruction;
  // Structured-output passthrough (Roadmap 2.2). responseMimeType:'application/json'
  // puts Gemini in JSON mode so callers like the business analyzer get valid JSON
  // instead of prose to best-effort-parse. Optional responseSchema constrains shape.
  if (body.responseMimeType) config.responseMimeType = body.responseMimeType;
  if (body.responseSchema) config.responseSchema = body.responseSchema;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await ai.models.generateContentStream({
          model: MODEL_NAME,
          contents: contents as never,
          config: config as never,
        });
        for await (const chunk of stream) {
          const t = chunk.text || "";
          if (t) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: t })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message || "Generation failed" })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
