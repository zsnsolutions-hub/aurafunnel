-- ─────────────────────────────────────────────────────────────────────────────
-- Schema refinement — pass 2
--
-- Finding 1: jobs.workspace_id and idempotency_keys.workspace_id are declared
--            NOT NULL but have no FK to workspaces(id) — any write with a
--            bogus uuid becomes an orphan that no CASCADE can reach.
--
-- Finding 2: jobs RLS allows SELECT only when created_by = auth.uid(), so a
--            teammate can't see jobs kicked off by another member of the same
--            workspace. Breaks the team collaboration model. Fix: expand
--            SELECT to workspace members; keep INSERT restricted to the
--            creator (so attribution remains honest).
--
-- All changes are additive / permission-expanding; nothing restricts access
-- that used to work. Runs in a single transaction with guards.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Guard: every jobs.workspace_id must already resolve to a workspace ─────
DO $$
DECLARE orphan int;
BEGIN
  SELECT count(*) INTO orphan
  FROM public.jobs j
  LEFT JOIN public.workspaces w ON w.id = j.workspace_id
  WHERE w.id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION
      'jobs_fk_and_rls aborted: % jobs row(s) reference a non-existent workspace. Purge or reassign before retrying.',
      orphan;
  END IF;

  SELECT count(*) INTO orphan
  FROM public.idempotency_keys ik
  LEFT JOIN public.workspaces w ON w.id = ik.workspace_id
  WHERE w.id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION
      'jobs_fk_and_rls aborted: % idempotency_keys row(s) reference a non-existent workspace.',
      orphan;
  END IF;
END$$;

-- ── 1. Add missing FKs ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'idempotency_keys_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.idempotency_keys
      ADD CONSTRAINT idempotency_keys_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- ── 2. Expand jobs SELECT policy to workspace members ──────────────────────
-- The existing jobs_select policy (created_by = auth.uid()) and
-- jobs_admin_select (global admin) stay, but we add a third policy that
-- allows any member of the owning workspace to read. Policies are OR-ed, so
-- no access is removed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'jobs_workspace_member_select'
  ) THEN
    CREATE POLICY jobs_workspace_member_select ON public.jobs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = jobs.workspace_id
            AND wm.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- Same for job_events (read cascade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_events'
      AND policyname = 'job_events_workspace_member_select'
  ) THEN
    CREATE POLICY job_events_workspace_member_select ON public.job_events
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.jobs j
          JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
          WHERE j.id = job_events.job_id
            AND wm.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- ── 3. Make idempotency_keys explicitly service-role only ──────────────────
-- RLS is enabled in 20260304100000 but no policies are defined, meaning all
-- app-role access is denied (service_role bypasses). Add an explicit deny
-- policy for clarity and to defend against future accidental grants.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'idempotency_keys'
      AND policyname = 'idempotency_keys_deny_all'
  ) THEN
    CREATE POLICY idempotency_keys_deny_all
      ON public.idempotency_keys
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;

COMMENT ON TABLE public.idempotency_keys IS
  'Request-dedup cache. Service_role only (Edge Functions / workers). App-role access explicitly denied via RLS.';

-- ── 4. Known-issue marker ──────────────────────────────────────────────────
-- plans.credits, plans.limits.credits, plans.limits.aiCredits, and
-- plans.limits.aiCreditsMonthly currently all store the same value. This
-- was patched twice (20260309000000, 20260310200000) and the read path in
-- AuraEngine/lib/plans.ts:187-208 uses four-way fallbacks. Fixing it
-- requires coordinated code change — left as a TODO for a later migration.
COMMENT ON COLUMN public.plans.credits IS
  'DEPRECATED (redundant with limits->>''aiCredits''). Kept for compatibility with older client code. Prefer plans.limits on all reads. To be dropped once lib/plans.ts is narrowed to a single source of truth.';

COMMIT;
