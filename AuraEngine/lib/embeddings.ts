// AuraEngine/lib/embeddings.ts
//
// Roadmap 2.3 — client wrapper for the embed-text edge function (OpenAI
// text-embedding-3-small, 1536 dims). Used to embed memory rows on write and the
// query context on read for semantic retrieval. All failures return null so the
// caller degrades gracefully to recency-based recall — RAG never breaks a
// generation or a memory write.

import { supabase } from './supabase';

export const EMBEDDING_DIMS = 1536;

/** Embed a single string. Returns null on any failure (not configured, provider
 *  error, empty input). */
export async function embedText(text: string): Promise<number[] | null> {
  const t = (text ?? '').trim();
  if (!t) return null;
  try {
    const { data, error } = await supabase.functions.invoke('embed-text', { body: { input: t } });
    if (error || !data || data.not_configured || data.error) return null;
    const emb = data.embedding as number[] | undefined;
    return Array.isArray(emb) && emb.length === EMBEDDING_DIMS ? emb : null;
  } catch {
    return null;
  }
}

/** Embed a batch. Returns an array aligned to inputs, or null on failure. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const inputs = texts.map((s) => (s ?? '').trim()).filter(Boolean);
  if (inputs.length === 0) return null;
  try {
    const { data, error } = await supabase.functions.invoke('embed-text', { body: { input: inputs } });
    if (error || !data || data.not_configured || data.error) return null;
    const embs = data.embeddings as number[][] | undefined;
    return Array.isArray(embs) && embs.length === inputs.length ? embs : null;
  } catch {
    return null;
  }
}
