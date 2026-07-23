// supabase/functions/ai-health/index.ts
//
// Lightweight AI-stack liveness/config probe (Roadmap 2.4). Reports which
// providers are configured and the active model names — WITHOUT calling an LLM
// (so it's free and fast to poll). Use it to catch a missing GEMINI_API_KEY or a
// model-config drift before users hit a failing generation.
//
// Deploy: supabase functions deploy ai-health

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { AI_MODELS } from "../_shared/aiModels.ts";

serve((req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  const geminiConfigured = !!(Deno.env.get("GEMINI_API_KEY") ?? "");
  const openaiConfigured = !!(Deno.env.get("OPENAI_API_KEY") ?? "");
  const pdlConfigured = !!(Deno.env.get("PDL_API_KEY") ?? "");

  // Healthy = the primary text provider (Gemini) has a key. Others are optional.
  const ok = geminiConfigured;

  return new Response(
    JSON.stringify({
      ok,
      models: AI_MODELS,
      providers: { gemini: geminiConfigured, openai: openaiConfigured, pdl: pdlConfigured },
      note: "Config/liveness only — does not call an LLM.",
    }),
    { status: ok ? 200 : 503, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
