// supabase/functions/gemini-proxy/index.ts
//
// Generic Gemini API proxy. Accepts the same `{ model, contents, config }`
// payload the @google/genai SDK sends to `ai.models.generateContent(...)` and
// `ai.models.generateContentStream(...)`, forwards it server-side with the
// GEMINI_API_KEY, and returns the response in the shape the client SDK would
// have produced. Also handles Imagen via `kind: "images"` (mirrors
// `ai.models.generateImages(...)`).
//
// This closes the long-standing leak of GEMINI_API_KEY into the browser bundle
// (previously read via `process.env.API_KEY` at build time). The key never
// leaves the Edge Function environment.
//
// Protocol:
//   POST /functions/v1/gemini-proxy
//   Authorization: Bearer <supabase_user_jwt>
//   Body (text): { kind?: "content", model, contents, config, stream?: boolean }
//   Body (image): { kind: "images", model, prompt, config }
//
//   Text non-streaming: → 200 application/json  { text, candidates, usageMetadata, ... }
//   Text streaming:     → 200 text/event-stream  (SSE; each event is a JSON chunk)
//   Image:              → 200 application/json  { generatedImages: [{ image: { imageBytes } }] }
//
// Deploy: supabase functions deploy gemini-proxy

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.0.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_GROUNDED_FALLBACK = "gemini-2.5-flash";

// ── Provider routing ─────────────────────────────────────────────────────────
// Text generation runs on OpenAI (faster/cheaper). Image generation and any
// grounded request (Google Search / URL context — which OpenAI's chat API can't
// do) stay on Gemini regardless of the requested model name.
function isOpenAIModel(model: string): boolean {
  return /^(gpt-|o[1-9]|chatgpt|text-)/i.test(model);
}
function hasGroundingTools(config: Record<string, unknown> | undefined): boolean {
  const tools = config?.tools;
  if (!Array.isArray(tools)) return false;
  return tools.some((t) => {
    if (!t || typeof t !== "object") return false;
    const k = Object.keys(t as Record<string, unknown>);
    return k.includes("googleSearch") || k.includes("urlContext") ||
      k.includes("google_search") || k.includes("url_context");
  });
}
type Provider = "openai" | "gemini";
function routeProvider(
  kind: string,
  model: string,
  config: Record<string, unknown> | undefined,
): { provider: Provider; model: string } {
  if (kind === "images") return { provider: "gemini", model };
  if (hasGroundingTools(config)) {
    // Grounded call — force Gemini; use the requested Gemini model or fall back.
    return { provider: "gemini", model: isOpenAIModel(model) ? GEMINI_GROUNDED_FALLBACK : model };
  }
  if (isOpenAIModel(model)) return { provider: "openai", model };
  return { provider: "gemini", model };
}

// ── Gemini → OpenAI payload translation ──────────────────────────────────────
function extractSystemText(si: unknown): string {
  if (!si) return "";
  if (typeof si === "string") return si;
  if (typeof si === "object") {
    const parts = (si as { parts?: unknown }).parts;
    if (Array.isArray(parts)) {
      return parts.map((p) => (p && typeof p === "object" ? (p as { text?: string }).text ?? "" : "")).join("\n");
    }
    const text = (si as { text?: string }).text;
    if (typeof text === "string") return text;
  }
  return "";
}
type OpenAIContent = string | Array<Record<string, unknown>>;
function partsToContent(parts: unknown): OpenAIContent {
  if (!Array.isArray(parts)) return "";
  const hasImage = parts.some((p) => p && typeof p === "object" && "inlineData" in (p as Record<string, unknown>));
  if (!hasImage) {
    return parts.map((p) => (p && typeof p === "object" ? (p as { text?: string }).text ?? "" : "")).join("");
  }
  return parts.map((p) => {
    const part = p as { text?: string; inlineData?: { mimeType?: string; data?: string } };
    if (part.inlineData?.data) {
      return { type: "image_url", image_url: { url: `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}` } };
    }
    return { type: "text", text: part.text ?? "" };
  });
}
function toOpenAIMessages(contents: unknown, systemText: string): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (systemText) messages.push({ role: "system", content: systemText });
  if (typeof contents === "string") {
    messages.push({ role: "user", content: contents });
  } else if (Array.isArray(contents)) {
    for (const c of contents) {
      if (typeof c === "string") { messages.push({ role: "user", content: c }); continue; }
      const item = c as { role?: string; parts?: unknown };
      const role = item.role === "model" || item.role === "assistant" ? "assistant" : "user";
      messages.push({ role, content: partsToContent(item.parts) });
    }
  } else if (contents && typeof contents === "object") {
    const item = contents as { parts?: unknown };
    messages.push({ role: "user", content: partsToContent(item.parts) });
  }
  return messages;
}
function buildOpenAIBody(model: string, contents: unknown, config: Record<string, unknown> | undefined, stream: boolean) {
  const cfg = config ?? {};
  const systemText = extractSystemText(cfg.systemInstruction);
  const messages = toOpenAIMessages(contents, systemText);
  const wantsJson = cfg.responseMimeType === "application/json" || cfg.responseSchema != null;
  if (wantsJson) {
    // OpenAI's json_object mode requires the literal word "json" in the prompt.
    messages.push({ role: "system", content: "Respond with a single valid JSON value and nothing else." });
  }
  const bodyObj: Record<string, unknown> = { model, messages, stream };
  if (typeof cfg.temperature === "number") bodyObj.temperature = cfg.temperature;
  if (typeof cfg.topP === "number") bodyObj.top_p = cfg.topP;
  if (typeof cfg.maxOutputTokens === "number") bodyObj.max_tokens = cfg.maxOutputTokens;
  if (Array.isArray(cfg.stopSequences)) bodyObj.stop = cfg.stopSequences;
  if (wantsJson) bodyObj.response_format = { type: "json_object" };
  if (stream) bodyObj.stream_options = { include_usage: true };
  return bodyObj;
}

// Cluster-wide rate limit (60 req/min per user) via Postgres consume_ai_rate_limit.
// The previous in-memory Map only worked within a single worker, so a user
// could exceed the cap by hitting multiple instances. Fail-open on RPC error
// — transient DB issues shouldn't take AI offline.
const RATE_LIMIT_PER_MIN = 60;

async function checkRateLimit(
  admin: ReturnType<typeof adminClient>,
  userId: string,
): Promise<{ allowed: boolean; resetAt: string | null }> {
  try {
    const { data, error } = await admin.rpc("consume_ai_rate_limit", {
      p_user_id: userId,
      p_max_per_min: RATE_LIMIT_PER_MIN,
    });
    if (error) {
      console.warn("[gemini-proxy] rate-limit RPC error, allowing:", error.message);
      return { allowed: true, resetAt: null };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed !== false,
      resetAt: (row?.reset_at as string | undefined) ?? null,
    };
  } catch (e) {
    console.warn("[gemini-proxy] rate-limit threw, allowing:", (e as Error).message);
    return { allowed: true, resetAt: null };
  }
}

interface ProxyRequest {
  model: string;
  contents?: unknown;
  prompt?: string;
  config?: Record<string, unknown>;
  stream?: boolean;
  kind?: "content" | "images";
  /** Optional AI-operation label (e.g. "blog_content") for exact per-op cost.
   *  Absent -> the quota RPC charges a per-kind default so it's never free. */
  operation?: string;
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  // Provider keys are validated per-route (below) — text may go to OpenAI while
  // images/grounded stay on Gemini, so we don't hard-fail globally on one key.

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401, corsHeaders);
  }

  const supabaseAdmin = adminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  // ── Rate limit (cluster-wide via Postgres) ──
  const rl = await checkRateLimit(supabaseAdmin, user.id);
  if (!rl.allowed) {
    const retryAfter = rl.resetAt
      ? Math.max(1, Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000))
      : 60;
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded (${RATE_LIMIT_PER_MIN} req/min). Please slow down.`,
        reset_at: rl.resetAt,
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
      },
    );
  }

  // ── Parse body ──
  let body: ProxyRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const kind = body.kind ?? "content";

  if (!body.model) {
    return jsonResponse({ error: "Missing required field: model" }, 400, corsHeaders);
  }
  if (kind === "content" && body.contents === undefined) {
    return jsonResponse({ error: "Missing required field: contents" }, 400, corsHeaders);
  }
  if (kind === "images" && !body.prompt) {
    return jsonResponse({ error: "Missing required field: prompt" }, 400, corsHeaders);
  }

  // ── AI credit enforcement (server-authoritative, anti-bypass) ──
  // Credits are billed client-side per user *action* (some non-AI), so we do
  // NOT re-bill here. Instead we enforce an independent monthly ceiling on
  // ACTUAL Gemini usage (ai_proxy_usage) so a modified client can't call this
  // proxy directly for unlimited free AI. Honest clients charge before calling
  // us, so their in-app limit trips first and they never reach this ceiling.
  // Fails CLOSED: a check failure denies the call rather than leaking free AI.
  const operation =
    typeof body.operation === "string" && body.operation ? body.operation : null;
  try {
    const { data: quota, error: quotaErr } = await supabaseAdmin.rpc(
      "enforce_ai_proxy_quota",
      { p_user_id: user.id, p_operation: operation, p_kind: kind },
    );
    if (quotaErr) {
      console.error("[gemini-proxy] quota RPC error, denying:", quotaErr.message);
      return jsonResponse({ error: "AI credit check failed. Please try again." }, 503, corsHeaders);
    }
    const q = quota as {
      allowed?: boolean; reason?: string; remaining?: number; cost?: number; limit?: number;
    };
    if (!q?.allowed) {
      const msg = q?.reason === "insufficient_credits"
        ? `Insufficient AI credits (${q?.remaining ?? 0} remaining, ${q?.cost ?? 0} needed for this operation). Upgrade your plan for more capacity.`
        : "AI credits are unavailable for this account.";
      return jsonResponse({ error: msg, reason: q?.reason, remaining: q?.remaining }, 402, corsHeaders);
    }
  } catch (e) {
    console.error("[gemini-proxy] quota check threw, denying:", (e as Error).message);
    return jsonResponse({ error: "AI credit check failed. Please try again." }, 503, corsHeaders);
  }

  const route = routeProvider(kind, body.model, body.config);

  // ── OpenAI branch (default for plain text) ──
  if (route.provider === "openai") {
    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500, corsHeaders);
    }
    try {
      const oaBody = buildOpenAIBody(route.model, body.contents, body.config, !!body.stream);
      const oaRes = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(oaBody),
      });

      if (!body.stream) {
        const data = await oaRes.json().catch(() => null) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          error?: { message?: string };
        } | null;
        if (!oaRes.ok || !data || data.error) {
          const msg = data?.error?.message ?? `OpenAI HTTP ${oaRes.status}`;
          console.error("[gemini-proxy] openai error:", msg);
          return jsonResponse({ error: `OpenAI API error: ${msg}` }, 502, corsHeaders);
        }
        const text = data.choices?.[0]?.message?.content ?? "";
        return jsonResponse({
          text,
          candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: data.choices?.[0]?.finish_reason ?? "STOP" }],
          usageMetadata: {
            promptTokenCount: data.usage?.prompt_tokens ?? 0,
            candidatesTokenCount: data.usage?.completion_tokens ?? 0,
            totalTokenCount: data.usage?.total_tokens ?? 0,
          },
        }, 200, corsHeaders);
      }

      // Streaming: translate OpenAI SSE deltas into the client's GeminiResponse SSE.
      if (!oaRes.ok || !oaRes.body) {
        const errText = await oaRes.text().catch(() => "");
        return jsonResponse({ error: `OpenAI API error: HTTP ${oaRes.status} ${errText}` }, 502, corsHeaders);
      }
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = oaRes.body.getReader();
      const readable = new ReadableStream({
        async start(controller) {
          let buf = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const events = buf.split("\n\n");
              buf = events.pop() ?? "";
              for (const evt of events) {
                const line = evt.split("\n").find((l) => l.startsWith("data: "));
                if (!line) continue;
                const payload = line.slice(6).trim();
                if (payload === "[DONE]") continue;
                try {
                  const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
                  const delta = j.choices?.[0]?.delta?.content ?? "";
                  if (delta) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta, candidates: [], usageMetadata: null })}\n\n`));
                  }
                } catch { /* ignore keepalive/partial */ }
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
            controller.close();
          }
        },
      });
      return new Response(readable, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[gemini-proxy] openai upstream error:", message);
      return jsonResponse({ error: `OpenAI API error: ${message}` }, 502, corsHeaders);
    }
  }

  // ── Gemini branch (images + grounded + any gemini-* model) ──
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "GEMINI_API_KEY not configured" }, 500, corsHeaders);
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  try {
    // ── Image generation (Imagen) ──
    if (kind === "images") {
      const response = await ai.models.generateImages({
        model: route.model,
        prompt: body.prompt as string,
        config: body.config as never,
      });
      return jsonResponse(
        { generatedImages: response.generatedImages ?? [] },
        200,
        corsHeaders,
      );
    }

    // ── Streaming ──
    if (body.stream) {
      const stream = await ai.models.generateContentStream({
        model: route.model,
        contents: body.contents as never,
        config: body.config as never,
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const payload = JSON.stringify({
                text: chunk.text ?? "",
                candidates: chunk.candidates ?? [],
                usageMetadata: chunk.usageMetadata ?? null,
              });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ── Non-streaming ──
    const response = await ai.models.generateContent({
      model: route.model,
      contents: body.contents as never,
      config: body.config as never,
    });

    return jsonResponse(
      {
        text: response.text ?? "",
        candidates: response.candidates ?? [],
        usageMetadata: response.usageMetadata ?? null,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[gemini-proxy] upstream error:", message);
    return jsonResponse({ error: `Gemini API error: ${message}` }, 502, corsHeaders);
  }
});
