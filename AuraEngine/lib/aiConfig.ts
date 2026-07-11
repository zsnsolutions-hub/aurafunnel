// AuraEngine/lib/aiConfig.ts
//
// Centralised AI model configuration. Every Gemini call site should pull its
// model name + default sampling params from here so a model upgrade is a
// one-file change instead of a global grep-and-replace.

export const AI_MODELS = {
  /** Default text generation model used by lead/content/email/dashboard flows. */
  // Text generation runs on Gemini 2.5-flash. (We trialled OpenAI gpt-4o-mini but
  // the workspace's OpenAI account wasn't authorized, so text + chat are back on
  // Gemini.) The proxy still supports routing gpt-* models to OpenAI, so flipping
  // this back to 'gpt-4o-mini' is all it takes to switch once OpenAI is sorted.
  text: 'gemini-2.5-flash',
  /** Gemini model for grounded text (Google Search + URL context) — the
   *  analyze-website + grounded lead-research flows keep using this. */
  textGrounded: 'gemini-2.5-flash',
  /** Image generation model (Imagen via gemini-proxy kind:"images"). */
  image: 'imagen-4.0-generate-001',
  /** Lightweight model used for prompt-lab test runs in ModelTraining. */
  textTesting: 'gemini-2.0-flash',
} as const;

export const AI_DEFAULTS = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  /** Per-call timeout for non-streaming Gemini requests (ms). */
  timeoutMs: 15_000,
  /** Retry attempts for transient upstream failures. */
  maxRetries: 3,
} as const;

export function getTextModel(): string {
  return AI_MODELS.text;
}

export function getImageModel(): string {
  return AI_MODELS.image;
}

/** Gemini model for grounded (Google Search / URL context) generation. */
export function getGroundedModel(): string {
  return AI_MODELS.textGrounded;
}
