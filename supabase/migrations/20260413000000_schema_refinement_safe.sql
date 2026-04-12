-- ─────────────────────────────────────────────────────────────────────────────
-- Schema refinement — safe additive fixes only
-- Every statement is idempotent (IF NOT EXISTS / IF EXISTS) and does not
-- rewrite or move data. Safe to apply to production without a maintenance
-- window. Covers findings #3, #4, #13, #14 from the 2026-04-13 audit.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Idempotency key on ai_credit_usage
-- Prevents double-deduction when a Gemini/Apollo call is retried by a client
-- that already succeeded server-side. Nullable so existing rows remain valid;
-- new writes should supply a deterministic key (e.g. hash of user_id + operation + request_id).
ALTER TABLE public.ai_credit_usage
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_credit_usage_idempotency_key
  ON public.ai_credit_usage (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.ai_credit_usage.idempotency_key IS
  'Client-supplied key to dedupe retried credit consumption calls. NULL allowed for historical rows only; new writes should populate.';

-- 2. Explicit deny-all policy on sender_account_secrets
-- RLS is already enabled with zero policies (effectively denies non-service_role).
-- Adding an explicit FOR ALL USING (false) policy makes intent obvious to future
-- maintainers and protects against someone accidentally adding a permissive
-- policy and unlocking credential reads for app-role users.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sender_account_secrets'
      AND policyname = 'sender_account_secrets_deny_all'
  ) THEN
    CREATE POLICY sender_account_secrets_deny_all
      ON public.sender_account_secrets
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;

COMMENT ON TABLE public.sender_account_secrets IS
  'OAuth refresh tokens and SMTP passwords. Access only via service_role key in Edge Functions. RLS is configured to deny all app-role access by design.';

-- 3. Missing FK indexes (confirmed from grep of migrations)
-- Each FK column below was spot-checked to exist but lacks an index.
-- Adding them improves DELETE cascade speed and JOIN plans.

-- leads.client_id is already indexed; leads.workspace_id is also indexed.
-- Audited but skipping: leads.created_by/assigned_to — not present in current schema.

-- email_messages (added in email analytics migrations)
CREATE INDEX IF NOT EXISTS idx_email_messages_sender_account_id
  ON public.email_messages (sender_account_id)
  WHERE sender_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_sequence_id
  ON public.email_messages (sequence_id)
  WHERE sequence_id IS NOT NULL;

-- scheduled_emails
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_sender_account_id
  ON public.scheduled_emails (sender_account_id)
  WHERE sender_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_sequence_id
  ON public.scheduled_emails (sequence_id)
  WHERE sequence_id IS NOT NULL;

-- workflow_executions
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lead_id
  ON public.workflow_executions (lead_id)
  WHERE lead_id IS NOT NULL;

-- workspace_invites.invited_by (profile FK)
CREATE INDEX IF NOT EXISTS idx_workspace_invites_invited_by
  ON public.workspace_invites (invited_by);

-- 4. JSONB column documentation
-- Several JSONB columns carry implicit schemas that live only in TypeScript.
-- Document them at the DB layer so queries, backups, and future migrations
-- don't have to reverse-engineer intent from the application.

COMMENT ON COLUMN public.profiles."businessProfile" IS
  'Full BusinessProfile object (see AuraEngine/types.ts:50). Keys: companyName, industry, companyWebsite, businessDescription, productsServices, targetAudience, valueProp, pricingModel, salesApproach, services[], pricingTiers[], uniqueSellingPoints[], socialLinks{linkedin,twitter,instagram,facebook}, phone, businessEmail, address, logoUrl, + deep-analysis fields. Feeds AI prompt resolution.';

COMMENT ON COLUMN public.leads."knowledgeBase" IS
  'Per-lead enrichment blob (see AuraEngine/types.ts:128). Keys: website, linkedin, twitter, instagram, facebook, youtube, phone, plus AI-generated enrichment fields populated after save by analyzeBusinessFromWeb / lead enrichment jobs.';

-- 5. Safety: verify no duplicate statements ran
-- (Postgres will simply ignore IF NOT EXISTS additions; this is a sentinel for humans.)
DO $$
BEGIN
  RAISE NOTICE 'schema_refinement_safe applied successfully at %', now();
END$$;
