-- ─────────────────────────────────────────────────────────────────────────────
-- Credit system FK fix — rewires ai_credit_usage, credit_purchases, and
-- workspace_ai_usage from the incorrect "workspace_id REFERENCES profiles(id)"
-- to the correct "workspace_id REFERENCES workspaces(id)".
--
-- Context:
--   - 20260309000000_credit_system_refactor.sql introduced these tables with
--     workspace_id incorrectly pointing at profiles(id).
--   - AuraEngine/lib/credits.ts passes user.id into the workspace_id slot,
--     which accidentally satisfies the wrong FK but breaks once real teams
--     exist with workspace.id != user.id.
--
-- This migration is designed to run end-to-end in a single transaction with
-- embedded assertions: if any data doesn't fit the expected shape, it aborts
-- with a descriptive error and leaves the DB unchanged.
--
-- Coordinated deploy order (MUST run together):
--   1. Apply this migration.
--   2. Within the same window, deploy the updated AuraEngine/lib/credits.ts
--      that resolves workspace_id via workspace_members.
--
-- If step 1 aborts: investigate the offending rows (the error message will
-- name them), then fix data manually and retry.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Guard 1: every existing workspace_id on our three tables must map to a
--             workspace via workspace_members.user_id (i.e. the value is a
--             user_id whose single workspace we can look up). ──────────────
DO $$
DECLARE
  orphan_count int;
  sample uuid;
BEGIN
  -- ai_credit_usage
  SELECT count(*) INTO orphan_count
  FROM public.ai_credit_usage acu
  LEFT JOIN public.workspace_members wm ON wm.user_id = acu.workspace_id
  LEFT JOIN public.workspaces w          ON w.id      = acu.workspace_id
  WHERE wm.workspace_id IS NULL AND w.id IS NULL;

  IF orphan_count > 0 THEN
    SELECT acu.workspace_id INTO sample
    FROM public.ai_credit_usage acu
    LEFT JOIN public.workspace_members wm ON wm.user_id = acu.workspace_id
    LEFT JOIN public.workspaces w          ON w.id      = acu.workspace_id
    WHERE wm.workspace_id IS NULL AND w.id IS NULL
    LIMIT 1;
    RAISE EXCEPTION
      'credit_system_fk_fix aborted: % ai_credit_usage row(s) have workspace_id=% that matches neither a workspace_members.user_id nor a workspaces.id. Resolve data before retrying.',
      orphan_count, sample;
  END IF;

  -- credit_purchases
  SELECT count(*) INTO orphan_count
  FROM public.credit_purchases cp
  LEFT JOIN public.workspace_members wm ON wm.user_id = cp.workspace_id
  LEFT JOIN public.workspaces w          ON w.id      = cp.workspace_id
  WHERE wm.workspace_id IS NULL AND w.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'credit_system_fk_fix aborted: % credit_purchases row(s) have an un-mappable workspace_id. Resolve data before retrying.',
      orphan_count;
  END IF;

  -- workspace_ai_usage (also using user.id in the workspace_id slot)
  SELECT count(*) INTO orphan_count
  FROM public.workspace_ai_usage wau
  LEFT JOIN public.workspace_members wm ON wm.user_id = wau.workspace_id
  LEFT JOIN public.workspaces w          ON w.id      = wau.workspace_id
  WHERE wm.workspace_id IS NULL AND w.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'credit_system_fk_fix aborted: % workspace_ai_usage row(s) have an un-mappable workspace_id. Resolve data before retrying.',
      orphan_count;
  END IF;
END$$;

-- ── Guard 2: every user_id in workspace_members must resolve to exactly one
--             workspace. Rows that own 0 or >1 workspaces would be ambiguous
--             during backfill. ─────────────────────────────────────────────
DO $$
DECLARE
  ambiguous int;
BEGIN
  SELECT count(*) INTO ambiguous FROM (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.user_id IN (
      SELECT DISTINCT workspace_id FROM public.ai_credit_usage
      UNION SELECT DISTINCT workspace_id FROM public.credit_purchases
      UNION SELECT DISTINCT workspace_id FROM public.workspace_ai_usage
    )
    GROUP BY wm.user_id
    HAVING count(DISTINCT wm.workspace_id) > 1
  ) sub;

  IF ambiguous > 0 THEN
    RAISE EXCEPTION
      'credit_system_fk_fix aborted: % user(s) belong to multiple workspaces, so credit history cannot be auto-attributed. Manual triage required.',
      ambiguous;
  END IF;
END$$;

-- ── Step 1: drop incorrect FK constraints ──────────────────────────────────
ALTER TABLE public.ai_credit_usage
  DROP CONSTRAINT IF EXISTS ai_credit_usage_workspace_id_fkey;

ALTER TABLE public.credit_purchases
  DROP CONSTRAINT IF EXISTS credit_purchases_workspace_id_fkey;

-- ── Step 2: backfill workspace_id from workspace_members.user_id ───────────
-- For rows where workspace_id is actually a user_id, swap it to the user's
-- single workspace. Rows that already hold a real workspace.id are no-ops
-- (the WHERE clause skips them).

UPDATE public.ai_credit_usage acu
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = acu.workspace_id
  AND NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = acu.workspace_id);

UPDATE public.credit_purchases cp
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = cp.workspace_id
  AND NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = cp.workspace_id);

UPDATE public.workspace_ai_usage wau
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = wau.workspace_id
  AND NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = wau.workspace_id);

-- ── Step 3: add correct FK constraints ─────────────────────────────────────
ALTER TABLE public.ai_credit_usage
  ADD CONSTRAINT ai_credit_usage_workspace_id_fkey
  FOREIGN KEY (workspace_id)
  REFERENCES public.workspaces(id)
  ON DELETE CASCADE;

ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_workspace_id_fkey
  FOREIGN KEY (workspace_id)
  REFERENCES public.workspaces(id)
  ON DELETE CASCADE;

-- workspace_ai_usage may not have had an FK at all; add one if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_ai_usage_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.workspace_ai_usage
      ADD CONSTRAINT workspace_ai_usage_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- ── Step 4: replace broken RLS policies ────────────────────────────────────
-- Old policies tested workspace_id = auth.uid(), which only worked while
-- workspace_id was being misused as a user_id. Switch to a proper membership
-- check.

DROP POLICY IF EXISTS "Users can view own credit usage" ON public.ai_credit_usage;
DROP POLICY IF EXISTS "System can insert credit usage"  ON public.ai_credit_usage;
DROP POLICY IF EXISTS "Users can view own purchases"    ON public.credit_purchases;

CREATE POLICY ai_credit_usage_select
  ON public.ai_credit_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_credit_usage.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY ai_credit_usage_insert
  ON public.ai_credit_usage
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_credit_usage.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY credit_purchases_select
  ON public.credit_purchases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = credit_purchases.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- credit_purchases inserts are service_role only (Stripe webhook); no app-role
-- INSERT/UPDATE policies by design. service_role bypasses RLS.

-- ── Step 5: post-condition assertions ──────────────────────────────────────
DO $$
DECLARE
  dangling int;
BEGIN
  SELECT count(*) INTO dangling
  FROM public.ai_credit_usage acu
  LEFT JOIN public.workspaces w ON w.id = acu.workspace_id
  WHERE w.id IS NULL;
  IF dangling > 0 THEN
    RAISE EXCEPTION 'post-condition failed: % ai_credit_usage rows still do not reference a workspace', dangling;
  END IF;

  SELECT count(*) INTO dangling
  FROM public.credit_purchases cp
  LEFT JOIN public.workspaces w ON w.id = cp.workspace_id
  WHERE w.id IS NULL;
  IF dangling > 0 THEN
    RAISE EXCEPTION 'post-condition failed: % credit_purchases rows still do not reference a workspace', dangling;
  END IF;

  SELECT count(*) INTO dangling
  FROM public.workspace_ai_usage wau
  LEFT JOIN public.workspaces w ON w.id = wau.workspace_id
  WHERE w.id IS NULL;
  IF dangling > 0 THEN
    RAISE EXCEPTION 'post-condition failed: % workspace_ai_usage rows still do not reference a workspace', dangling;
  END IF;

  RAISE NOTICE 'credit_system_fk_fix applied successfully at %', now();
END$$;

COMMIT;
