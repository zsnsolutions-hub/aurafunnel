// supabase/functions/_shared/goal-steps/gemini.ts
//
// Server-side Gemini call used by enrich/score/email/social step handlers.
// The browser route goes through gemini-proxy; this one is internal and
// uses the GEMINI_API_KEY directly (already in the edge function env).

import { AI_MODELS, geminiEndpoint } from "../aiModels.ts";

const GEMINI_ENDPOINT = geminiEndpoint(AI_MODELS.goals);

// Minimal shape of the service-role client's rpc() — avoids importing the SDK type.
interface QuotaClient { rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }

// AI ceiling enforcement for goal-step LLM calls (Roadmap 2.4). goal-executor runs
// under service role with no request user, so meter against the goal's WORKSPACE
// directly (enforce_ai_proxy_quota_ws) — check-and-increment per call. Each live()
// step handler calls this before its geminiGenerate call(s); a per-lead loop
// breaks on !allowed (partial success), a single-shot step throws. Fails OPEN on
// an infra/RPC error so a quota-service blip never wedges automation.
export async function enforceGoalQuota(
  admin: QuotaClient, workspaceId: string, operation: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data, error } = await admin.rpc("enforce_ai_proxy_quota_ws", {
      p_workspace_id: workspaceId, p_operation: operation, p_kind: "content",
    });
    if (error) return { allowed: true }; // fail open
    const q = data as { allowed?: boolean; reason?: string } | null;
    return { allowed: q?.allowed !== false, reason: q?.reason };
  } catch { return { allowed: true }; }
}

export async function geminiGenerate(
  apiKey: string,
  prompt: string,
  systemInstruction: string,
  opts?: { responseMimeType?: string },
): Promise<{ text: string; tokens: number }> {
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const url = `${GEMINI_ENDPOINT}?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.5,
      topP: 0.9,
      ...(opts?.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const tokens = j.usageMetadata?.totalTokenCount ?? 0;
  return { text, tokens };
}
