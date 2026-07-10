// AuraEngine/lib/aiConfig.ts
//
// Centralised AI model configuration. Every Gemini call site should pull its
// model name + default sampling params from here so a model upgrade is a
// one-file change instead of a global grep-and-replace.

export const AI_MODELS = {
  /** Default text generation model used by lead/content/email/dashboard flows. */
  // Text generation now runs on OpenAI gpt-4o-mini (faster, cheaper). The proxy
  // routes any request whose model starts with `gpt`/`o` to OpenAI, and keeps
  // Gemini for image generation and for grounded calls (Google Search + URL
  // context) which OpenAI's chat API can't do. See gemini-proxy/index.ts.
  text: 'gpt-4o-mini',
  /** Gemini model for grounded text (Google Search + URL context) — the
   *  analyze-website + grounded lead-research flows keep using this. */
  textGrounded: 'gemini-2.5-flash',
  /** Image generation model (Imagen via gemini-proxy kind:"images"). */
  image: 'imagen-4.0-generate-001',
  /** Lightweight model used for prompt-lab test runs in ModelTraining. */
  textTesting: 'gpt-4o-mini',
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
