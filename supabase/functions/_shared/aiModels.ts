// supabase/functions/_shared/aiModels.ts
//
// Single source of truth for edge-function model names (Roadmap 2.4 / BUG-019).
// Every LLM-calling edge function imports from here instead of hardcoding its own
// string. The client mirror is AuraEngine/lib/aiConfig.ts (AI_MODELS) — keep the
// two in sync when a model changes.

export const AI_MODELS = {
  /** Default text model for generation/analysis/chat. */
  text: "gemini-2.5-flash",
  /** Goals subsystem planner/executor. NOTE: this is a PREVIEW model — revisit
   *  if it's deprecated or rate-limited (reconciling to `text` is a one-liner). */
  goals: "gemini-3-flash-preview",
  /** Image generation. */
  image: "imagen-4.0-generate-001",
} as const;

/** Build a Generative Language REST endpoint for a model (callers that POST the
 *  raw v1beta API rather than using the SDK client). */
export const geminiEndpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
