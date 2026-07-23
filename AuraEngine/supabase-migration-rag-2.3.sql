-- Roadmap 2.3 — RAG foundation on the workspace memory layer.
--
-- Adds pgvector + a 1536-dim embedding column to workspace_memory (the hot recall
-- path, "read on every Gemini call") + a cosine-similarity match RPC. Embeddings
-- come from OpenAI text-embedding-3-small (see supabase/functions/embed-text).
-- Business scoping mirrors the recency recall (BUG-016): a business sees its own
-- rows + truly-global (business_id IS NULL) rows.
--
-- Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.workspace_memory ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW cosine index over the embedded rows only (unembedded rows stay NULL).
CREATE INDEX IF NOT EXISTS idx_workspace_memory_embedding
  ON public.workspace_memory USING hnsw (embedding vector_cosine_ops);

-- Cosine-similarity search, business-scoped + expiry-aware. SECURITY INVOKER so
-- workspace_memory RLS still gates cross-workspace access even though the caller
-- passes p_workspace_id. p_query is the embedding as a JSON/text array ('[...]',
-- exactly pgvector's input format) cast to vector inside — avoids any ambiguity in
-- how PostgREST would coerce a raw JSON number array to a vector param.
DROP FUNCTION IF EXISTS public.match_workspace_memory(uuid, uuid, vector, integer, text[]);
DROP FUNCTION IF EXISTS public.match_workspace_memory(uuid, uuid, text, integer, text[]);

CREATE FUNCTION public.match_workspace_memory(
  p_workspace_id uuid,
  p_business_id  uuid,
  p_query        text,
  p_k            integer DEFAULT 12,
  p_kinds        text[]  DEFAULT NULL
)
RETURNS TABLE (
  id uuid, kind text, key text, value jsonb, source text,
  confidence numeric, tags text[], similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT wm.id, wm.kind, wm.key, wm.value, wm.source, wm.confidence, wm.tags,
         (1 - (wm.embedding <=> p_query::vector(1536)))::real AS similarity
  FROM public.workspace_memory wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.embedding IS NOT NULL
    AND (p_business_id IS NULL OR wm.business_id = p_business_id OR wm.business_id IS NULL)
    AND (p_kinds IS NULL OR wm.kind = ANY(p_kinds))
    AND (wm.expires_at IS NULL OR wm.expires_at > now())
  ORDER BY wm.embedding <=> p_query::vector(1536)
  LIMIT GREATEST(p_k, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_workspace_memory(uuid, uuid, text, integer, text[]) TO authenticated, service_role;
