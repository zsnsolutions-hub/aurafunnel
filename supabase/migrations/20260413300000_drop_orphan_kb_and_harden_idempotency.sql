-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup — orphan leads.knowledge_base column + permissive idempotency policies
--
-- Fix 1: leads has both "knowledgeBase" (jsonb, used by all app and edge code)
--        and "knowledge_base" (jsonb NOT NULL DEFAULT '{}', written by no code).
--        The snake_case column is a leftover from an earlier schema draft that
--        the app never adopted. Merge any stray data into the camelCase column,
--        then drop the orphan.
--
-- Fix 2: idempotency_keys had RLS enabled with two permissive policies:
--          idempotency_insert: WITH CHECK (true)   — any authenticated user
--          idempotency_select: USING (workspace_id IN <subquery>)
--        The 20260413200000 deny-all policy doesn't actually deny anything
--        because RLS is OR-ed across policies. idempotency_keys should be
--        service_role only (no client code references it), so drop both
--        permissive policies and keep the deny-all.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── Fix 1: leads.knowledge_base → leads.knowledgeBase ────────────────────────

-- 1a. Merge: for rows where the orphan column has real data and the canonical
--     column is empty, copy the data over. Do NOT overwrite existing camelCase
--     data.
DO $$
DECLARE
  orphan_with_data int;
  would_conflict   int;
  merged           int;
BEGIN
  SELECT count(*) INTO orphan_with_data
  FROM public.leads
  WHERE knowledge_base IS NOT NULL
    AND knowledge_base <> '{}'::jsonb;

  SELECT count(*) INTO would_conflict
  FROM public.leads
  WHERE knowledge_base IS NOT NULL
    AND knowledge_base <> '{}'::jsonb
    AND "knowledgeBase" IS NOT NULL
    AND "knowledgeBase" <> '{}'::jsonb
    AND knowledge_base <> "knowledgeBase";

  RAISE NOTICE 'leads.knowledge_base: % row(s) carry non-empty data; % would conflict with knowledgeBase',
    orphan_with_data, would_conflict;

  -- Copy orphan → canonical where canonical is empty.
  UPDATE public.leads
  SET "knowledgeBase" = knowledge_base
  WHERE knowledge_base IS NOT NULL
    AND knowledge_base <> '{}'::jsonb
    AND ("knowledgeBase" IS NULL OR "knowledgeBase" = '{}'::jsonb);
  GET DIAGNOSTICS merged = ROW_COUNT;
  RAISE NOTICE 'leads.knowledge_base: merged % row(s) into knowledgeBase', merged;

  -- Conflicts (both columns non-empty and disagreeing) keep the camelCase value.
  -- This preserves what the app actually uses.
END$$;

-- 1b. Drop the orphan column.
ALTER TABLE public.leads DROP COLUMN IF EXISTS knowledge_base;

-- ─── Fix 2: idempotency_keys RLS — drop permissive, keep deny-all ─────────────
DROP POLICY IF EXISTS idempotency_insert ON public.idempotency_keys;
DROP POLICY IF EXISTS idempotency_select ON public.idempotency_keys;

-- Sanity check: confirm no permissive policies remain that could override the
-- deny-all added by 20260413200000.
DO $$
DECLARE
  permissive_count int;
BEGIN
  SELECT count(*) INTO permissive_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'idempotency_keys'
    AND policyname <> 'idempotency_keys_deny_all';

  IF permissive_count > 0 THEN
    RAISE EXCEPTION
      'Expected only the deny-all policy on idempotency_keys, found % other policy(ies). Aborting.',
      permissive_count;
  END IF;

  RAISE NOTICE 'idempotency_keys: app-role access now correctly blocked; service_role bypasses RLS.';
END$$;

COMMIT;
