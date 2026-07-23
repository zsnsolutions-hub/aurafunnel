// supabase/functions/embed-text/index.ts
//
// Text-embedding endpoint for RAG (Roadmap 2.3). Turns text into vectors via
// OpenAI text-embedding-3-small (1536 dims) server-side, so the key never hits
// the browser. Used both to embed memory rows on write and to embed the query
// context on read. Accepts a single string or an array (batch).
//
// Deploy: supabase functions deploy embed-text

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { AI_MODELS, EMBEDDING_DIMS } from "../_shared/aiModels.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const RATE_LIMIT_PER_MIN = 60;
const MAX_BATCH = 64;
const MAX_CHARS = 8000; // per input (~2k tokens); truncate longer

serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s: number) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const admin = adminClient();
  const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Rate limit (embeddings are cheap; this just stops abuse).
  try {
    const { data } = await admin.rpc("consume_ai_rate_limit", { p_user_id: user.id, p_max_per_min: RATE_LIMIT_PER_MIN });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed === false) return json({ error: "Rate limit exceeded. Please wait a moment." }, 429);
  } catch { /* fail open */ }

  if (!OPENAI_API_KEY) return json({ error: "Embeddings not configured — OPENAI_API_KEY is missing.", not_configured: true }, 200);

  let body: { input?: string | string[] };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const rawInputs = Array.isArray(body.input) ? body.input : body.input != null ? [body.input] : [];
  const inputs = rawInputs
    .map((s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS))
    .filter((s) => s.length > 0);
  if (inputs.length === 0) return json({ error: "input is required (string or string[])" }, 400);
  if (inputs.length > MAX_BATCH) return json({ error: `Too many inputs (max ${MAX_BATCH})` }, 400);

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: AI_MODELS.embedding, input: inputs }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("embed-text OpenAI error:", res.status, t.slice(0, 300));
      return json({ error: `Embedding provider error (${res.status}): ${t.slice(0, 200)}` }, res.status === 401 ? 502 : 502);
    }
    const data = await res.json() as { data?: { embedding: number[]; index: number }[] };
    const sorted = (data.data ?? []).sort((a, b) => a.index - b.index);
    const embeddings = sorted.map((d) => d.embedding);
    if (embeddings.length === 0 || embeddings[0]?.length !== EMBEDDING_DIMS) {
      return json({ error: `Unexpected embedding shape (dims=${embeddings[0]?.length ?? 0}, expected ${EMBEDDING_DIMS}).` }, 502);
    }
    // Single-input callers get { embedding }; batch callers get { embeddings }.
    return json({ model: AI_MODELS.embedding, dims: EMBEDDING_DIMS, embeddings, embedding: embeddings[0] }, 200);
  } catch (err) {
    console.error("embed-text fatal:", err);
    return json({ error: `Internal error: ${(err as Error).message}` }, 500);
  }
});
