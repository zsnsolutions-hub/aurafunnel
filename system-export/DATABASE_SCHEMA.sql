-- ============================================================================
-- Scaliyo — DATABASE_SCHEMA.sql  (SCHEMA ONLY — no data)
-- ----------------------------------------------------------------------------
-- Generated from a schema-only `supabase db dump` of the linked project.
-- Contains: tables, columns, constraints (PK/FK), indexes, views, functions,
-- triggers, enums, and Row-Level Security policies.
-- EXCLUDES: all row data, API keys, passwords, tokens, customer records,
-- and private configuration values (verified: 0 COPY / 0 INSERT statements).
-- Any string literals below are DDL defaults/policy expressions, not secrets.
-- ============================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'Scaliyo — AI Revenue Operating System. Canonical entities: workspaces, workspace_members, leads, sender_accounts, email_messages (now with workspace_id), email_events, lead_memory, campaign_memory, workspace_memory. Deprecation comments live on individual tables/columns.';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."post_status" AS ENUM (
    'draft',
    'pending_review',
    'published',
    'archived'
);


ALTER TYPE "public"."post_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'ADMIN',
    'CLIENT',
    'GUEST'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."workspace_role" AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
);


ALTER TYPE "public"."workspace_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_wh_after_email_dlq_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event text;
begin
  v_event := case new.kind
    when 'hard_bounce'    then 'email.bounced'
    when 'spam_complaint' then 'email.spam_complaint'
    when 'unsubscribed'   then 'email.unsubscribed'
    else null
  end;

  if v_event is not null and new.workspace_id is not null then
    perform public.queue_webhook_event(
      new.workspace_id,
      v_event,
      jsonb_build_object(
        'id',                 new.id,
        'workspace_id',       new.workspace_id,
        'sender_account_id',  new.sender_account_id,
        'message_id',         new.message_id,
        'to_email',           new.to_email,
        'kind',               new.kind,
        'reason',             new.reason,
        'first_failed_at',    new.first_failed_at,
        'last_failed_at',     new.last_failed_at
      )
    );
  end if;
  return null;
exception when others then
  raise warning '[wh] %.enqueue failed: % %', new.kind, sqlstate, sqlerrm;
  return null;
end;
$$;


ALTER FUNCTION "public"."_wh_after_email_dlq_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_wh_after_email_message_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.workspace_id is not null and new.status = 'sent' then
    perform public.queue_webhook_event(
      new.workspace_id,
      'email.sent',
      jsonb_build_object(
        'id',                 new.id,
        'workspace_id',       new.workspace_id,
        'lead_id',            new.lead_id,
        'sender_account_id',  new.sender_account_id,
        'sequence_id',        new.sequence_id,
        'sequence_step',      new.sequence_step,
        'provider',           new.provider,
        'to_email',           new.to_email,
        'from_email',         new.from_email,
        'subject',            new.subject,
        'created_at',         new.created_at
      )
    );
  end if;
  return null;
exception when others then
  raise warning '[wh] email.sent enqueue failed: % %', sqlstate, sqlerrm;
  return null;
end;
$$;


ALTER FUNCTION "public"."_wh_after_email_message_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_wh_after_lead_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.workspace_id is not null then
    perform public.queue_webhook_event(
      new.workspace_id, 'lead.created', public._wh_lead_payload(new)
    );
  end if;
  return null;
exception when others then
  raise warning '[wh] lead.created enqueue failed: % %', sqlstate, sqlerrm;
  return null;
end;
$$;


ALTER FUNCTION "public"."_wh_after_lead_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_wh_after_lead_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.workspace_id is not null and (old.status is distinct from new.status) then
    perform public.queue_webhook_event(
      new.workspace_id,
      'lead.updated',
      public._wh_lead_payload(new) || jsonb_build_object(
        'previous_status', old.status,
        'changed_field',   'status'
      )
    );
  end if;
  return null;
exception when others then
  raise warning '[wh] lead.updated enqueue failed: % %', sqlstate, sqlerrm;
  return null;
end;
$$;


ALTER FUNCTION "public"."_wh_after_lead_status_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_wh_after_seq_run_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_workspace_id uuid;
begin
  -- Only fire when status transitions INTO 'completed'.
  if new.status is distinct from old.status and new.status = 'completed' then
    -- email_sequence_runs.workspace_id may be null on legacy rows; fall back
    -- to deriving from owner_id → workspace_members.
    v_workspace_id := new.workspace_id;
    if v_workspace_id is null then
      select workspace_id into v_workspace_id
        from public.workspace_members
        where user_id = new.owner_id
        order by created_at asc
        limit 1;
    end if;

    if v_workspace_id is not null then
      perform public.queue_webhook_event(
        v_workspace_id,
        'sequence.completed',
        jsonb_build_object(
          'id',           new.id,
          'workspace_id', v_workspace_id,
          'lead_count',   new.lead_count,
          'step_count',   new.step_count,
          'items_total',  new.items_total,
          'items_done',   new.items_done,
          'items_failed', new.items_failed,
          'started_at',   new.started_at,
          'completed_at', new.completed_at,
          'config',       new.sequence_config
        )
      );
    end if;
  end if;
  return null;
exception when others then
  raise warning '[wh] sequence.completed enqueue failed: % %', sqlstate, sqlerrm;
  return null;
end;
$$;


ALTER FUNCTION "public"."_wh_after_seq_run_update"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "company" "text" DEFAULT ''::"text",
    "score" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'New'::"text" NOT NULL,
    "insights" "text" DEFAULT ''::"text",
    "knowledgeBase" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "primary_email" "text",
    "emails" "text"[] DEFAULT '{}'::"text"[],
    "primary_phone" "text",
    "phones" "text"[] DEFAULT '{}'::"text"[],
    "linkedin_url" "text",
    "location" "text",
    "import_batch_id" "uuid",
    "imported_at" timestamp with time zone,
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "source" "text",
    "title" "text",
    "industry" "text",
    "company_size" "text",
    "last_activity" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "assigned_to" "uuid",
    "phone" "text",
    "website" "text",
    "last_activity_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "business_id" "uuid",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['New'::"text", 'Contacted'::"text", 'Qualified'::"text", 'Converted'::"text", 'Lost'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads"."knowledgeBase" IS 'Per-lead enrichment blob (see AuraEngine/types.ts:128). Keys: website, linkedin, twitter, instagram, facebook, youtube, phone, plus AI-generated enrichment fields populated after save by analyzeBusinessFromWeb / lead enrichment jobs.';



CREATE OR REPLACE FUNCTION "public"."_wh_lead_payload"("l" "public"."leads") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select jsonb_build_object(
    'id',            l.id,
    'workspace_id',  l.workspace_id,
    'first_name',    l.first_name,
    'last_name',     l.last_name,
    'primary_email', l.primary_email,
    'company',       l.company,
    'status',        l.status,
    'score',         l.score,
    'source',        l.source,
    'created_at',    l.created_at,
    'updated_at',    l.updated_at
  );
$$;


ALTER FUNCTION "public"."_wh_lead_payload"("l" "public"."leads") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "verification_token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "verified_at" timestamp with time zone,
    "last_check_at" timestamp with time zone,
    "last_check_error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provisioned_at" timestamp with time zone,
    "cert_expires_at" timestamp with time zone,
    "last_provision_at" timestamp with time zone,
    "last_provision_error" "text",
    CONSTRAINT "workspace_domains_domain_format" CHECK (("domain" ~* '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'::"text")),
    CONSTRAINT "workspace_domains_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."workspace_domains" OWNER TO "postgres";


COMMENT ON TABLE "public"."workspace_domains" IS 'Phase 4.6.b — vanity domain registrations. Verification by DNS TXT record on _scaliyo-verify.<domain> or CNAME pointing at app.scaliyo.com. TLS provisioning and nginx server-block templating live in the next session.';



CREATE OR REPLACE FUNCTION "public"."add_workspace_domain"("p_workspace_id" "uuid", "p_domain" "text") RETURNS "public"."workspace_domains"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_token text;
  v_row   public.workspace_domains%rowtype;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden: caller not in workspace %', p_workspace_id;
  end if;

  -- Token: 32 random hex chars (16 bytes from gen_random_bytes).
  v_token := encode(gen_random_bytes(16), 'hex');

  insert into public.workspace_domains (workspace_id, domain, verification_token, created_by)
  values (p_workspace_id, lower(trim(p_domain)), v_token, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."add_workspace_domain"("p_workspace_id" "uuid", "p_domain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_adjust_credits_used"("p_workspace_id" "uuid", "p_delta" integer, "p_admin_id" "uuid", "p_reason" "text" DEFAULT 'Admin adjustment'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_used INTEGER;
  v_new_used INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT credits_used INTO v_old_used FROM profiles WHERE id = p_workspace_id;
  IF v_old_used IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Workspace not found');
  END IF;

  v_new_used := GREATEST(v_old_used + p_delta, 0);
  UPDATE profiles SET credits_used = v_new_used WHERE id = p_workspace_id;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id, 'ADMIN_CREDITS_ADJUSTED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_used', v_old_used, 'delta', p_delta, 'new_used', v_new_used, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', format('Adjusted credits used by %s. New used: %s', p_delta, v_new_used),
    'old_used', v_old_used, 'new_used', v_new_used);
END;
$$;


ALTER FUNCTION "public"."admin_adjust_credits_used"("p_workspace_id" "uuid", "p_delta" integer, "p_admin_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_change_user_plan"("p_target_user_id" "uuid", "p_new_plan_name" "text", "p_admin_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_plan TEXT;
  v_sub_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_admin_id
      AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: admin role required');
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  -- Verify new plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE name = p_new_plan_name AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Plan not found or inactive');
  END IF;

  -- Get current plan from profiles
  SELECT plan INTO v_old_plan FROM profiles WHERE id = p_target_user_id;

  -- Update profiles.plan
  UPDATE profiles
  SET plan = p_new_plan_name
  WHERE id = p_target_user_id;

  -- Upsert subscription row
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE user_id = p_target_user_id
  LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET plan = p_new_plan_name,
        plan_name = p_new_plan_name
    WHERE id = v_sub_id;
  ELSE
    INSERT INTO subscriptions (user_id, plan, plan_name, status, current_period_end)
    VALUES (
      p_target_user_id,
      p_new_plan_name,
      p_new_plan_name,
      'active',
      (now() + interval '30 days')::text
    );
  END IF;

  -- Write audit log
  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id,
    'admin_change_plan',
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'old_plan', COALESCE(v_old_plan, 'none'),
      'new_plan', p_new_plan_name,
      'reason', COALESCE(p_reason, 'Admin override'),
      'target_user_id', p_target_user_id::text
    ));

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan changed from %s to %s', COALESCE(v_old_plan, 'none'), p_new_plan_name),
    'old_plan', COALESCE(v_old_plan, 'none'),
    'new_plan', p_new_plan_name
  );
END;
$$;


ALTER FUNCTION "public"."admin_change_user_plan"("p_target_user_id" "uuid", "p_new_plan_name" "text", "p_admin_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_clone_plan"("p_source_plan_id" "uuid", "p_new_name" "text", "p_new_key" "text", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_id UUID;
  v_source RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT * INTO v_source FROM plans WHERE id = p_source_plan_id;
  IF v_source IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Source plan not found');
  END IF;

  INSERT INTO plans (name, key, price, price_monthly_cents, currency, stripe_price_id, credits, description, features, is_active, limits, sort_order)
  VALUES (p_new_name, p_new_key, v_source.price, v_source.price_monthly_cents, v_source.currency, NULL,
    v_source.credits, v_source.description, v_source.features, false, v_source.limits,
    COALESCE(v_source.sort_order, 0) + 1)
  RETURNING id INTO v_new_id;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id, 'ADMIN_PLAN_CLONED', 'plan', v_new_id::text,
    jsonb_build_object('source_plan_id', p_source_plan_id, 'source_name', v_source.name, 'new_name', p_new_name, 'new_key', p_new_key));

  RETURN jsonb_build_object('success', true, 'message', format('Plan "%s" cloned as "%s"', v_source.name, p_new_name), 'new_plan_id', v_new_id);
END;
$$;


ALTER FUNCTION "public"."admin_clone_plan"("p_source_plan_id" "uuid", "p_new_name" "text", "p_new_key" "text", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_grant_credits"("p_workspace_id" "uuid", "p_amount" integer, "p_admin_id" "uuid", "p_reason" "text" DEFAULT 'Admin grant'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_total INTEGER;
  v_new_total INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT credits_total INTO v_old_total FROM profiles WHERE id = p_workspace_id;
  IF v_old_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Workspace not found');
  END IF;

  v_new_total := v_old_total + p_amount;
  UPDATE profiles SET credits_total = v_new_total WHERE id = p_workspace_id;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id, 'ADMIN_CREDITS_GRANTED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_total', v_old_total, 'granted', p_amount, 'new_total', v_new_total, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', format('Granted %s credits. New total: %s', p_amount, v_new_total),
    'old_total', v_old_total, 'new_total', v_new_total);
END;
$$;


ALTER FUNCTION "public"."admin_grant_credits"("p_workspace_id" "uuid", "p_amount" integer, "p_admin_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset_monthly_usage"("p_workspace_id" "uuid", "p_admin_id" "uuid", "p_reason" "text" DEFAULT 'Admin reset'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_month TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: super-admin required');
  END IF;

  v_month := to_char(now(), 'YYYY-MM');

  -- Reset workspace_usage_counters for current month
  UPDATE workspace_usage_counters
  SET emails_sent = 0, linkedin_actions = 0, ai_credits_used = 0, warmup_emails_sent = 0
  WHERE workspace_id = p_workspace_id AND month_key = v_month;

  -- Reset workspace_ai_usage for current month
  UPDATE workspace_ai_usage
  SET credits_used = 0, tokens_used = 0
  WHERE workspace_id = p_workspace_id AND month_year = v_month;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id, 'ADMIN_USAGE_RESET', 'workspace', p_workspace_id::text,
    jsonb_build_object('month', v_month, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', format('Monthly usage reset for %s', v_month));
END;
$$;


ALTER FUNCTION "public"."admin_reset_monthly_usage"("p_workspace_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_entitlements"("p_workspace_id" "uuid", "p_overrides" "jsonb", "p_admin_id" "uuid", "p_reason" "text" DEFAULT 'Admin override'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan_id UUID;
  v_plan_limits JSONB;
  v_effective JSONB;
  v_old_overrides JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  -- Get the user's current plan
  SELECT p.id, p.limits INTO v_plan_id, v_plan_limits
  FROM profiles pr
  JOIN plans p ON p.name = pr.plan
  WHERE pr.id = p_workspace_id
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    -- Try without join
    v_plan_limits := '{}'::jsonb;
  END IF;

  -- Merge plan limits with overrides (overrides win)
  v_effective := COALESCE(v_plan_limits, '{}'::jsonb) || p_overrides;

  -- Get old overrides for audit
  SELECT overrides INTO v_old_overrides FROM workspace_entitlements WHERE workspace_id = p_workspace_id;

  -- Upsert
  INSERT INTO workspace_entitlements (workspace_id, plan_id, overrides, effective_limits, updated_at)
  VALUES (p_workspace_id, v_plan_id, p_overrides, v_effective, now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id = COALESCE(v_plan_id, workspace_entitlements.plan_id),
    overrides = p_overrides,
    effective_limits = v_effective,
    updated_at = now();

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id, 'ADMIN_ENTITLEMENTS_UPDATED', 'workspace', p_workspace_id::text,
    jsonb_build_object('old_overrides', COALESCE(v_old_overrides, '{}'::jsonb), 'new_overrides', p_overrides, 'effective', v_effective, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', 'Entitlements updated',
    'effective_limits', v_effective);
END;
$$;


ALTER FUNCTION "public"."admin_update_entitlements"("p_workspace_id" "uuid", "p_overrides" "jsonb", "p_admin_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_feature_flag"("p_key" "text", "p_enabled" boolean, "p_rules" "jsonb" DEFAULT NULL::"jsonb", "p_admin_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_enabled BOOLEAN;
BEGIN
  IF p_admin_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT enabled INTO v_old_enabled FROM feature_flags WHERE key = p_key;

  UPDATE feature_flags SET
    enabled = p_enabled,
    rules = COALESCE(p_rules, rules),
    updated_at = now(),
    updated_by = p_admin_id
  WHERE key = p_key;

  IF NOT FOUND THEN
    INSERT INTO feature_flags (key, enabled, rules, updated_by)
    VALUES (p_key, p_enabled, COALESCE(p_rules, '{}'), p_admin_id);
    v_old_enabled := NULL;
  END IF;

  IF p_admin_id IS NOT NULL THEN
    insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id, 'ADMIN_FEATURE_FLAG_UPDATED', 'feature_flag', p_key,
      jsonb_build_object('old_enabled', v_old_enabled, 'new_enabled', p_enabled, 'rules', COALESCE(p_rules, '{}')));
  END IF;

  RETURN jsonb_build_object('success', true, 'message', format('Flag "%s" set to %s', p_key, p_enabled));
END;
$$;


ALTER FUNCTION "public"."admin_update_feature_flag"("p_key" "text", "p_enabled" boolean, "p_rules" "jsonb", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_plan"("p_plan_id" "uuid", "p_admin_id" "uuid", "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan_name TEXT;
  v_old_data JSONB;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_admin_id
      AND (role = 'ADMIN' OR is_super_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: admin role required');
  END IF;

  -- Get current plan state for audit
  SELECT name, to_jsonb(plans.*) INTO v_plan_name, v_old_data
  FROM plans WHERE id = p_plan_id;

  IF v_plan_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Plan not found');
  END IF;

  -- Apply updates dynamically
  UPDATE plans SET
    name               = COALESCE((p_updates->>'name')::text, name),
    price              = COALESCE((p_updates->>'price')::text, price),
    price_monthly_cents = COALESCE((p_updates->>'price_monthly_cents')::integer, price_monthly_cents),
    credits            = COALESCE((p_updates->>'credits')::integer, credits),
    description        = COALESCE((p_updates->>'description')::text, description),
    features           = COALESCE((p_updates->'features')::text[], features),
    limits             = COALESCE((p_updates->'limits')::jsonb, limits),
    is_active          = COALESCE((p_updates->>'is_active')::boolean, is_active),
    stripe_price_id    = COALESCE((p_updates->>'stripe_price_id')::text, stripe_price_id),
    sort_order         = COALESCE((p_updates->>'sort_order')::integer, sort_order),
    updated_at         = now()
  WHERE id = p_plan_id;

  -- Audit log
  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, details)
  values (p_admin_id, p_admin_id,
    'admin_update_plan',
    'plan',
    p_plan_id::text,
    jsonb_build_object(
      'plan_name', v_plan_name,
      'updates', p_updates,
      'previous', v_old_data
    ));

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan "%s" updated successfully', v_plan_name)
  );
END;
$$;


ALTER FUNCTION "public"."admin_update_plan"("p_plan_id" "uuid", "p_admin_id" "uuid", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_goal_progress"("p_goal_id" "uuid", "p_increment" numeric) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.automation_goals
     set progress_value = least(target_value, progress_value + p_increment)
   where id = p_goal_id;
$$;


ALTER FUNCTION "public"."advance_goal_progress"("p_goal_id" "uuid", "p_increment" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."auth_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_confirm_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."auto_confirm_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_sequence_total_sent"("p_campaign_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.email_sequences set total_sent = total_sent + 1, updated_at = now()
  where id = p_campaign_id;
$$;


ALTER FUNCTION "public"."bump_sequence_total_sent"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campaign_variant_stats"("p_campaign_id" "uuid") RETURNS TABLE("step" integer, "variant" integer, "sent" bigint, "opened" bigint, "clicked" bigint, "replied" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(m.sequence_step, 0)   as step,
    coalesce(m.subject_variant, 0) as variant,
    count(*)                       as sent,
    count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.event_type = 'open'))  as opened,
    count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.event_type = 'click')) as clicked,
    count(*) filter (where exists (select 1 from public.inbound_emails ib where ib.reply_to_message_id = m.id))                as replied
  from public.email_messages m
  where m.sequence_id = p_campaign_id
    and m.owner_id = auth.uid()
  group by 1, 2
  order by 1, 2;
$$;


ALTER FUNCTION "public"."campaign_variant_stats"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_email_exists"("check_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = lower(check_email)
  );
$$;


ALTER FUNCTION "public"."check_email_exists"("check_email" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_sequence_run_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "step_index" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "lead_email" "text" NOT NULL,
    "lead_name" "text",
    "lead_company" "text",
    "lead_context" "jsonb" DEFAULT '{}'::"jsonb",
    "template_subject" "text" NOT NULL,
    "template_body" "text" NOT NULL,
    "ai_subject" "text",
    "ai_body_html" "text",
    "delay_days" integer DEFAULT 0 NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "locked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject_variant" smallint,
    "best_send_hour" smallint,
    CONSTRAINT "email_sequence_run_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'writing'::"text", 'written'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_sequence_run_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_next_writing_item"("p_run_id" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "public"."email_sequence_run_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_item email_sequence_run_items%ROWTYPE;
BEGIN
  UPDATE email_sequence_run_items
  SET status = 'writing',
      locked_until = now() + interval '5 minutes',
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE id = (
    SELECT id FROM email_sequence_run_items
    WHERE status = 'pending'
      AND (locked_until IS NULL OR locked_until < now())
      AND (p_run_id IS NULL OR run_id = p_run_id)
    ORDER BY step_index, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_item;

  IF v_item.id IS NOT NULL THEN
    RETURN NEXT v_item;
  END IF;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."claim_next_writing_item"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_pending_webhook_deliveries"("p_limit" integer DEFAULT 50) RETURNS TABLE("delivery_id" "uuid", "endpoint_id" "uuid", "workspace_id" "uuid", "url" "text", "secret" "text", "event_type" "text", "payload" "jsonb", "attempt_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with claimed as (
    update public.webhook_deliveries d
       set status = 'processing',
           attempt_count = d.attempt_count + 1
     where d.id in (
       select wd.id
         from public.webhook_deliveries wd
        where wd.status = 'pending'
          and wd.next_attempt_at <= now()
        order by wd.next_attempt_at asc
        for update skip locked
        limit p_limit
     )
    returning d.id, d.endpoint_id, d.workspace_id, d.event_type, d.payload, d.attempt_count
  )
  select c.id, c.endpoint_id, c.workspace_id, e.url, e.secret, c.event_type, c.payload, c.attempt_count
    from claimed c
    join public.webhook_endpoints e on e.id = c.endpoint_id;
end;
$$;


ALTER FUNCTION "public"."claim_pending_webhook_deliveries"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_resumable_goal_step_runs"("p_limit" integer DEFAULT 20) RETURNS TABLE("goal_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with claimed as (
    update public.automation_step_runs
       set status = 'running',
           started_at = now()
     where id in (
       select id
         from public.automation_step_runs
        where status = 'pending'
          and not_before is not null
          and not_before <= now()
        order by not_before asc
        for update skip locked
        limit p_limit
     )
    returning goal_id
  )
  select distinct c.goal_id from claimed c;
end;
$$;


ALTER FUNCTION "public"."claim_resumable_goal_step_runs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_business_profile"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_ws    uuid;
  v_plan  text;
  v_key   text;
  v_limit integer;
  v_cost  integer := 2;   -- mirrors config/aiCreditCosts.ts clear_business_profile
  v_month text;
  v_used  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Resolve workspace like the client (lib/credits.ts): first membership row.
  SELECT workspace_id INTO v_ws
  FROM public.workspace_members
  WHERE user_id = v_uid
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'No workspace found for this account.' USING ERRCODE = 'P0001';
  END IF;

  -- Plan -> monthly credit limit (mirrors config/creditLimits.ts).
  SELECT plan INTO v_plan FROM public.profiles WHERE id = v_uid;
  v_key := lower(coalesce(v_plan, 'free'));
  v_key := CASE v_key
             WHEN 'professional' THEN 'growth'
             WHEN 'enterprise'   THEN 'scale'
             WHEN 'business'     THEN 'scale'
             WHEN 'starter'      THEN 'starter'
             WHEN 'growth'       THEN 'growth'
             WHEN 'scale'        THEN 'scale'
             WHEN 'free'         THEN 'free'
             ELSE 'free'
           END;
  v_limit := CASE v_key
               WHEN 'starter' THEN 2000
               WHEN 'growth'  THEN 10000
               WHEN 'scale'   THEN 40000
               ELSE 200
             END;

  v_month := to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM');

  -- Atomic check-and-charge against the client billing counter.
  INSERT INTO public.workspace_ai_usage (workspace_id, month_year, credits_used, tokens_used, credits_limit, updated_at)
  VALUES (v_ws, v_month, 0, 0, v_limit, now())
  ON CONFLICT (workspace_id, month_year) DO NOTHING;

  SELECT credits_used INTO v_used
  FROM public.workspace_ai_usage
  WHERE workspace_id = v_ws AND month_year = v_month
  FOR UPDATE;

  IF v_used + v_cost > v_limit THEN
    RAISE EXCEPTION 'Insufficient credits (% remaining, % needed).',
      GREATEST(v_limit - v_used, 0), v_cost USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.workspace_ai_usage
  SET credits_used  = credits_used + v_cost,
      credits_limit = v_limit,
      updated_at    = now()
  WHERE workspace_id = v_ws AND month_year = v_month;

  INSERT INTO public.ai_credit_usage (workspace_id, operation, credits_used)
  VALUES (v_ws, 'clear_business_profile', v_cost);

  -- The wipe — atomic with the charge, so both commit or both roll back.
  UPDATE public.profiles SET "businessProfile" = NULL WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'charged', v_cost,
    'remaining', GREATEST(v_limit - (v_used + v_cost), 0)
  );
END;
$$;


ALTER FUNCTION "public"."clear_business_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sent             int;
  v_bounces          int;
  v_complaints       int;
  v_consec           int;
  v_account_age_days numeric;
  v_bounce_rate      numeric(5,4);
  v_complaint_rate   numeric(5,4);
  v_score            int;
begin
  select extract(epoch from (now() - created_at)) / 86400.0
    into v_account_age_days
    from public.sender_accounts where id = p_sender_id;
  if v_account_age_days is null then
    return null;
  end if;

  select coalesce(consecutive_failures, 0)
    into v_consec from public.sender_accounts where id = p_sender_id;

  -- Sent in last 7 days for this sender
  select count(*)
    into v_sent
    from public.email_messages em
    where em.sender_account_id = p_sender_id
      and em.created_at >= now() - interval '7 days'
      and em.status in ('sent','delivered','bounced','failed');

  if v_sent = 0 then
    -- No data → leave score at 100; mark check time.
    update public.sender_accounts
       set last_health_check_at = now(),
           bounce_rate_7d = 0,
           complaint_rate_7d = 0
     where id = p_sender_id;
    return 100;
  end if;

  -- Bounces and spam complaints from event log
  select
    count(*) filter (where ee.event_type = 'bounced'),
    count(*) filter (where ee.event_type = 'spam_report')
    into v_bounces, v_complaints
    from public.email_events ee
    join public.email_messages em on em.id = ee.message_id
    where em.sender_account_id = p_sender_id
      and em.created_at >= now() - interval '7 days';

  v_bounce_rate    := round(v_bounces::numeric    / nullif(v_sent, 0), 4);
  v_complaint_rate := round(v_complaints::numeric / nullif(v_sent, 0), 4);

  v_score := 100
    - round(v_bounce_rate    * 200)
    - round(v_complaint_rate * 5000)
    - (v_consec * 5);

  -- Probationary cap for new senders (<7 days of history).
  if v_account_age_days < 7 then
    v_score := least(v_score, 95);
  end if;

  v_score := greatest(0, least(100, v_score));

  update public.sender_accounts
     set health_score         = v_score,
         bounce_rate_7d       = v_bounce_rate,
         complaint_rate_7d    = v_complaint_rate,
         last_health_check_at = now()
   where id = p_sender_id;

  return v_score;
exception when others then
  raise warning 'compute_sender_health failed for %: % %', p_sender_id, sqlstate, sqlerrm;
  return null;
end;
$$;


ALTER FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") IS 'Phase 3.1 — recomputes health_score, bounce_rate_7d, complaint_rate_7d from last 7 days of email_messages + email_events. Returns the new score.';



CREATE OR REPLACE FUNCTION "public"."connect_sender_account"("p_workspace_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_from_email" "text", "p_from_name" "text" DEFAULT ''::"text", "p_use_for_outreach" boolean DEFAULT true, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_oauth_access" "text" DEFAULT NULL::"text", "p_oauth_refresh" "text" DEFAULT NULL::"text", "p_oauth_expires" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_smtp_host" "text" DEFAULT NULL::"text", "p_smtp_port" integer DEFAULT 587, "p_smtp_user" "text" DEFAULT NULL::"text", "p_smtp_pass" "text" DEFAULT NULL::"text", "p_api_key" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  DECLARE
    v_account_id uuid;
    v_count      integer;
  BEGIN
    -- Upsert sender account: update if same workspace + provider + email exists
    INSERT INTO sender_accounts
      (workspace_id, provider, display_name, from_email, from_name, use_for_outreach, metadata, status, updated_at)
    VALUES
      (p_workspace_id, p_provider, p_display_name, p_from_email, p_from_name, p_use_for_outreach, p_metadata, 'connected', now())
    ON CONFLICT (workspace_id, provider, from_email)
    DO UPDATE SET
      display_name    = EXCLUDED.display_name,
      from_name       = EXCLUDED.from_name,
      use_for_outreach = EXCLUDED.use_for_outreach,
      metadata        = EXCLUDED.metadata,
      status          = 'connected',
      updated_at      = now()
    RETURNING id INTO v_account_id;

    -- Upsert secrets
    INSERT INTO sender_account_secrets
      (sender_account_id, oauth_access_token, oauth_refresh_token, oauth_expires_at,
       smtp_host, smtp_port, smtp_user, smtp_pass, api_key, updated_at)
    VALUES
      (v_account_id, p_oauth_access, p_oauth_refresh, p_oauth_expires,
       p_smtp_host, p_smtp_port, p_smtp_user, p_smtp_pass, p_api_key, now())
    ON CONFLICT (sender_account_id)
    DO UPDATE SET
      oauth_access_token  = EXCLUDED.oauth_access_token,
      oauth_refresh_token = EXCLUDED.oauth_refresh_token,
      oauth_expires_at    = EXCLUDED.oauth_expires_at,
      smtp_host           = EXCLUDED.smtp_host,
      smtp_port           = EXCLUDED.smtp_port,
      smtp_user           = EXCLUDED.smtp_user,
      smtp_pass           = EXCLUDED.smtp_pass,
      api_key             = EXCLUDED.api_key,
      updated_at          = now();

    -- Set as default if it's the first account in the workspace
    SELECT COUNT(*) INTO v_count FROM sender_accounts WHERE workspace_id = p_workspace_id;
    IF v_count = 1 THEN
      UPDATE sender_accounts SET is_default = true WHERE id = v_account_id;
    END IF;

    RETURN v_account_id;
  END;
  $$;


ALTER FUNCTION "public"."connect_sender_account"("p_workspace_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_from_email" "text", "p_from_name" "text", "p_use_for_outreach" boolean, "p_metadata" "jsonb", "p_oauth_access" "text", "p_oauth_refresh" "text", "p_oauth_expires" timestamp with time zone, "p_smtp_host" "text", "p_smtp_port" integer, "p_smtp_user" "text", "p_smtp_pass" "text", "p_api_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer DEFAULT 60) RETURNS TABLE("allowed" boolean, "current_count" integer, "reset_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_count  int;
begin
  insert into public.ai_rate_limit_buckets (user_id, bucket_minute, count)
  values (p_user_id, v_bucket, 1)
  on conflict (user_id, bucket_minute)
  do update set count = public.ai_rate_limit_buckets.count + 1
  returning count into v_count;

  allowed       := v_count <= p_max_per_min;
  current_count := v_count;
  reset_at      := v_bucket + interval '1 minute';
  return next;
end;
$$;


ALTER FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer) IS 'Cluster-wide per-user AI rate limit. Edge functions call this on every request; allowed=false means return 429.';



CREATE OR REPLACE FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer DEFAULT 60) RETURNS TABLE("allowed" boolean, "current_count" integer, "reset_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_count  int;
begin
  insert into public.api_rate_limit_buckets (api_key_id, bucket_minute, count)
  values (p_key_id, v_bucket, 1)
  on conflict (api_key_id, bucket_minute)
  do update set count = public.api_rate_limit_buckets.count + 1
  returning count into v_count;

  allowed       := v_count <= p_max_per_min;
  current_count := v_count;
  reset_at      := v_bucket + interval '1 minute';
  return next;
end;
$$;


ALTER FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer) IS 'Phase 4.2 — atomic fixed-window rate limit. Edge functions call this on every request; allowed=false means return 429. Buckets purged hourly.';



CREATE OR REPLACE FUNCTION "public"."consume_credits"("amount" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  profile_record RECORD;
BEGIN
  SELECT credits_total, credits_used
  INTO profile_record
  FROM profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Profile not found.');
  END IF;

  IF (profile_record.credits_used + amount) > profile_record.credits_total THEN
    RETURN json_build_object('success', false, 'message', 'Insufficient credits.');
  END IF;

  UPDATE profiles
  SET credits_used = credits_used + amount,
      updated_at = now()
  WHERE id = auth.uid();

  RETURN json_build_object('success', true, 'message', 'Credits consumed.');
END;
$$;


ALTER FUNCTION "public"."consume_credits"("amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_credits"("ws_id" "uuid", "amount" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_credits INTEGER;
  current_used INTEGER;
BEGIN
  SELECT credits_total, credits_used INTO current_credits, current_used
  FROM subscriptions WHERE workspace_id = ws_id FOR UPDATE;

  IF current_credits IS NULL OR current_credits - current_used < amount THEN
    RETURN FALSE;
  END IF;

  UPDATE subscriptions
  SET credits_used = credits_used + amount
  WHERE workspace_id = ws_id;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."consume_credits"("ws_id" "uuid", "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[] DEFAULT ARRAY['leads.read'::"text"], "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_id   uuid;
  v_hash text;
  v_prefix text;
begin
  -- Caller must be a member of the workspace.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden: caller not in workspace %', p_workspace_id;
  end if;

  if length(coalesce(p_plaintext, '')) < 16 then
    raise exception 'api key plaintext too short';
  end if;

  v_hash   := encode(digest(p_plaintext, 'sha256'), 'hex');
  v_prefix := left(p_plaintext, 12);  -- "scal_" + 7 chars of body

  insert into public.api_keys
    (workspace_id, created_by, label, key_hash, key_prefix, scopes, expires_at)
  values
    (p_workspace_id, auth.uid(), coalesce(nullif(trim(p_label), ''), 'untitled'),
     v_hash, v_prefix, coalesce(p_scopes, '{}'::text[]), p_expires_at)
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) IS 'Phase 4.1 — Workspace member creates a new API key. Caller is responsible for showing the plaintext to the user once. Returns the api_keys.id.';



CREATE OR REPLACE FUNCTION "public"."create_business"("p_workspace_id" "uuid", "p_name" "text", "p_website" "text" DEFAULT NULL::"text", "p_industry" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_default_tone" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_biz uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  insert into public.businesses (workspace_id, name, website, industry, description, default_tone, created_by)
  values (p_workspace_id, coalesce(nullif(p_name,''),'My Business'), p_website, p_industry, p_description, p_default_tone, auth.uid())
  returning id into v_biz;

  insert into public.business_members (business_id, workspace_id, user_id, role)
  values (v_biz, p_workspace_id, auth.uid(), 'owner');

  insert into public.business_profiles (business_id, workspace_id, tone)
  values (v_biz, p_workspace_id, p_default_tone) on conflict (business_id) do nothing;

  return v_biz;
end $$;


ALTER FUNCTION "public"."create_business"("p_workspace_id" "uuid", "p_name" "text", "p_website" "text", "p_industry" "text", "p_description" "text", "p_default_tone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_my_workspace"("p_name" "text" DEFAULT NULL::"text") RETURNS TABLE("workspace_id" "uuid", "created" boolean, "name" "text", "leads_adopted" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_user_id     uuid := auth.uid();
  v_target      uuid;
  v_existing    uuid;
  v_existing_nm text;
  v_name        text;
  v_adopted     int := 0;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Already a member? Use that workspace.
  select wm.workspace_id, ws.name
    into v_existing, v_existing_nm
    from public.workspace_members wm
    join public.workspaces ws on ws.id = wm.workspace_id
   where wm.user_id = v_user_id
   order by wm.joined_at asc
   limit 1;

  if v_existing is not null then
    v_target := v_existing;
    name     := v_existing_nm;
    created  := false;
  else
    -- Resolve name: trimmed param > auth full_name > 'My Workspace'.
    v_name := nullif(trim(coalesce(p_name, '')), '');
    if v_name is null then
      select nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), '')
        into v_name
        from auth.users u
       where u.id = v_user_id;
    end if;
    v_name := coalesce(v_name, 'My Workspace');

    insert into public.workspaces (id, name, owner_id)
    values (v_user_id, v_name, v_user_id)
    on conflict (id) do nothing;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_user_id, v_user_id, 'owner')
    on conflict (workspace_id, user_id) do nothing;

    v_target := v_user_id;
    name     := v_name;
    created  := true;
  end if;

  -- Adopt owned leads whose workspace_id has drifted. Safe because the
  -- WHERE clause filters by ownership; we never touch leads belonging
  -- to a different client_id/user_id.
  with adopted as (
    update public.leads l
       set workspace_id = v_target,
           updated_at   = now()
     where (l.client_id = v_user_id or l.user_id = v_user_id)
       and (l.workspace_id is distinct from v_target)
     returning 1
  )
  select count(*)::int into v_adopted from adopted;

  workspace_id  := v_target;
  leads_adopted := v_adopted;
  return next;
end;
$$;


ALTER FUNCTION "public"."create_my_workspace"("p_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_my_workspace"("p_name" "text") IS 'Self-service workspace recovery + lead adoption. Creates workspace+membership for auth.uid() if missing, then re-parents the caller''s owned leads (by client_id/user_id) into that workspace. Idempotent.';



CREATE OR REPLACE FUNCTION "public"."cron_auto_replan_drifting_goals"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_token  text;
  v_goal   record;
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/goal-replanner';
  v_count  int := 0;
begin
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'cron_auto_replan_drifting_goals: no service-role token in GUC or vault — skipping';
    return;
  end if;

  for v_goal in
    select g.id, g.workspace_id
      from public.automation_goals g
     where g.status in ('planned','active','running','paused')
       and exists (
         select 1 from public.workspace_memory wm
          where wm.workspace_id = g.workspace_id
            and wm.kind = 'observation'
            and wm.key = 'goal:' || g.id::text
            and wm.created_at > now() - interval '24 hours'
       )
       and not exists (
         select 1 from public.automation_plans ap
          where ap.goal_id = g.id and ap.created_by_kind = 'replanner'
            and ap.created_at > now() - interval '6 hours'
       )
       and exists (
         select 1 from public.automation_plans ap
          where ap.goal_id = g.id and ap.is_active = true
       )
     order by g.updated_at asc
     limit 20
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := jsonb_build_object('goal_id', v_goal.id),
      timeout_milliseconds := 60000
    );
    v_count := v_count + 1;
  end loop;
exception when others then
  raise warning 'cron_auto_replan_drifting_goals failed: % %', sqlstate, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."cron_auto_replan_drifting_goals"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cron_auto_replan_drifting_goals"() IS 'Phase 6.3.b — hourly. For each goal with a fresh observation and no recent replan, POSTs to the goal-replanner edge function so an LLM produces a revised plan version.';



CREATE OR REPLACE FUNCTION "public"."cron_observe_goal_drift"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_goal      record;
  v_obs       jsonb;
  v_reason    text;
begin
  for v_goal in
    select g.id, g.workspace_id, g.statement, g.status, g.target_value, g.progress_value, g.due_at, g.updated_at
      from public.automation_goals g
     where g.status in ('active','running','paused')
  loop
    v_obs := null;

    -- (a) past due with progress < target
    if v_goal.due_at is not null and v_goal.due_at < now() and v_goal.progress_value < v_goal.target_value then
      v_reason := 'past_due_with_unmet_target';
      v_obs := jsonb_build_object(
        'kind', v_reason,
        'goal_id', v_goal.id,
        'progress', v_goal.progress_value,
        'target', v_goal.target_value,
        'due_at', v_goal.due_at,
        'observed_at', now()
      );
    end if;

    -- (b) paused for > 12h
    if v_obs is null and v_goal.status = 'paused' and v_goal.updated_at < now() - interval '12 hours' then
      v_reason := 'paused_too_long';
      v_obs := jsonb_build_object(
        'kind', v_reason,
        'goal_id', v_goal.id,
        'paused_since', v_goal.updated_at,
        'observed_at', now()
      );
    end if;

    -- (c) running without recent step progress
    if v_obs is null and v_goal.status = 'running' then
      if not exists (
        select 1 from public.automation_step_runs
        where goal_id = v_goal.id
          and completed_at > now() - interval '6 hours'
      ) then
        v_reason := 'stalled_running';
        v_obs := jsonb_build_object(
          'kind', v_reason,
          'goal_id', v_goal.id,
          'observed_at', now()
        );
      end if;
    end if;

    if v_obs is null then continue; end if;

    -- De-dup: don't write the same observation kind for the same goal
    -- if one was written in the last 24h.
    if exists (
      select 1 from public.workspace_memory wm
      where wm.workspace_id = v_goal.workspace_id
        and wm.kind = 'observation'
        and wm.key = 'goal:' || v_goal.id::text
        and wm.value->>'kind' = v_reason
        and wm.created_at > now() - interval '24 hours'
    ) then
      continue;
    end if;

    insert into public.workspace_memory (
      workspace_id, kind, key, value, source, confidence, tags
    ) values (
      v_goal.workspace_id,
      'observation',
      'goal:' || v_goal.id::text,
      v_obs,
      'goal_observer',
      0.80,
      array['goal','observation', v_reason]
    );
  end loop;
exception when others then
  raise warning 'cron_observe_goal_drift failed: % %', sqlstate, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."cron_observe_goal_drift"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cron_observe_goal_drift"() IS 'Phase 6.3 — hourly observer. Scans active/running/paused goals and writes workspace_memory rows for drift signals (past due, stalled, paused too long). Phase 6.3.b will wire an LLM replanner that consumes these.';



CREATE OR REPLACE FUNCTION "public"."cron_refresh_sender_health"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sender_id uuid;
  v_count     int := 0;
begin
  for v_sender_id in
    select id from public.sender_accounts
     where status = 'connected'
       and use_for_outreach = true
     order by coalesce(last_health_check_at, 'epoch'::timestamptz) asc
     limit 200
  loop
    perform public.compute_sender_health(v_sender_id);
    v_count := v_count + 1;
  end loop;
end;
$$;


ALTER FUNCTION "public"."cron_refresh_sender_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cron_resume_paused_goals"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_token  text;
  v_goal   record;
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/goal-executor';
begin
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'cron_resume_paused_goals: no service-role token in GUC or vault — skipping';
    return;
  end if;

  for v_goal in
    select goal_id from public.claim_resumable_goal_step_runs(20)
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := jsonb_build_object(
        'goal_id', v_goal.goal_id,
        'mode',    'live',
        'resume',  true
      ),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."cron_resume_paused_goals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cron_sweep_campaign_outcomes"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run_id uuid;
begin
  for v_run_id in
    select r.id
      from public.email_sequence_runs r
      where r.status = 'completed'
        and r.completed_at < now() - interval '48 hours'
        and r.completed_at > now() - interval '60 days'
        and not exists (
          select 1 from public.campaign_memory cm
          where cm.campaign_kind = 'email_sequence'
            and cm.campaign_id   = r.id::text
            and cm.kind          = 'outcome'
        )
      order by r.completed_at desc
      limit 50
  loop
    perform public.log_campaign_memory_sequence_outcome(v_run_id);
  end loop;
end;
$$;


ALTER FUNCTION "public"."cron_sweep_campaign_outcomes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cron_sweep_campaign_outcomes"() IS 'Hourly pg_cron worker that finds completed sequence runs without a memory outcome row and calls log_campaign_memory_sequence_outcome for each. Capped at 50 per tick.';



CREATE OR REPLACE FUNCTION "public"."enforce_ai_proxy_quota"("p_user_id" "uuid", "p_operation" "text", "p_kind" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ws    uuid;
  v_plan  text;
  v_key   text;
  v_limit integer;
  v_cost  integer;
  v_month text;
  v_used  integer;
BEGIN
  -- Resolve workspace the SAME way the client does (lib/credits.ts:
  -- first workspace_members row for the user, ordered by joined_at).
  SELECT workspace_id INTO v_ws
  FROM public.workspace_members
  WHERE user_id = p_user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_ws IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_workspace', 'cost', 0);
  END IF;

  -- Resolve plan -> monthly AI credit limit (mirrors config/creditLimits.ts).
  SELECT plan INTO v_plan FROM public.profiles WHERE id = p_user_id;
  v_key := lower(coalesce(v_plan, 'free'));
  v_key := CASE v_key
             WHEN 'professional'            THEN 'growth'
             WHEN 'enterprise'              THEN 'scale'
             WHEN 'business'                THEN 'scale'
             WHEN 'starter'                 THEN 'starter'
             WHEN 'growth'                  THEN 'growth'
             WHEN 'scale'                   THEN 'scale'
             WHEN 'free'                    THEN 'free'
             ELSE 'free'
           END;
  v_limit := CASE v_key
               WHEN 'starter' THEN 2000
               WHEN 'growth'  THEN 10000
               WHEN 'scale'   THEN 40000
               ELSE 200                       -- free
             END;

  -- Per-operation cost (mirrors config/aiCreditCosts.ts). Unknown/absent
  -- operation falls back to a per-kind default so a client that sends no
  -- operation label is still charged (never free).
  v_cost := CASE p_operation
              WHEN 'email_generation'         THEN 2
              WHEN 'email_sequence'           THEN 3
              WHEN 'content_generation'       THEN 2
              WHEN 'content_suggestions'      THEN 1
              WHEN 'blog_generation'          THEN 5
              WHEN 'blog_content'             THEN 5
              WHEN 'social_caption'           THEN 1
              WHEN 'guest_post_pitch'         THEN 2
              WHEN 'image_generation'         THEN 3
              WHEN 'lead_research'            THEN 2
              WHEN 'lead_scoring'             THEN 1
              WHEN 'business_analysis'        THEN 5
              WHEN 'profile_field_generation' THEN 1
              WHEN 'pipeline_strategy'        THEN 3
              WHEN 'workflow_optimization'    THEN 2
              WHEN 'command_center'           THEN 2
              WHEN 'dashboard_insights'       THEN 1
              WHEN 'batch_generation'         THEN 5
              WHEN 'follow_up_questions'      THEN 1
              ELSE CASE WHEN p_kind = 'images' THEN 3 ELSE 2 END
            END;

  v_month := to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM');

  -- Ensure the row exists, then lock it for an atomic check-and-increment.
  INSERT INTO public.ai_proxy_usage (workspace_id, month_year)
  VALUES (v_ws, v_month)
  ON CONFLICT (workspace_id, month_year) DO NOTHING;

  SELECT credits_used INTO v_used
  FROM public.ai_proxy_usage
  WHERE workspace_id = v_ws AND month_year = v_month
  FOR UPDATE;

  IF v_used + v_cost > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_credits',
      'cost', v_cost, 'limit', v_limit, 'used', v_used,
      'remaining', GREATEST(v_limit - v_used, 0)
    );
  END IF;

  UPDATE public.ai_proxy_usage
  SET credits_used = credits_used + v_cost,
      call_count   = call_count + 1,
      last_used_at = now(),
      updated_at   = now()
  WHERE workspace_id = v_ws AND month_year = v_month;

  RETURN jsonb_build_object(
    'allowed', true, 'cost', v_cost, 'limit', v_limit,
    'used', v_used + v_cost,
    'remaining', GREATEST(v_limit - (v_used + v_cost), 0)
  );
END;
$$;


ALTER FUNCTION "public"."enforce_ai_proxy_quota"("p_user_id" "uuid", "p_operation" "text", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_profile_privileged_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  caller_role  text;
  caller_super boolean;
BEGIN
  -- service_role and SECURITY DEFINER admin RPCs run as a non-'authenticated'
  -- role (e.g. postgres/service_role) → allowed. Only direct end-user
  -- (PostgREST 'authenticated') updates are policed.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT role::text, COALESCE(is_super_admin, false)
    INTO caller_role, caller_super
    FROM public.profiles
    WHERE id = auth.uid();

  -- Non-admins may not modify ANY privileged column. This closes the
  -- CLIENT → ADMIN / is_super_admin / free-credits self-escalation.
  IF caller_role IS DISTINCT FROM 'ADMIN' THEN
    IF NEW.role           IS DISTINCT FROM OLD.role
    OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
    OR NEW.plan           IS DISTINCT FROM OLD.plan
    OR NEW.credits_total  IS DISTINCT FROM OLD.credits_total
    OR NEW.credits_used   IS DISTINCT FROM OLD.credits_used
    OR NEW.status         IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Not authorized to modify privileged profile columns'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Only an existing super-admin may grant/revoke super-admin — even a regular
  -- ADMIN cannot elevate themselves or others to super-admin by direct update.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin AND NOT caller_super THEN
    RAISE EXCEPTION 'Only a super-admin may change is_super_admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_profile_privileged_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_email_sequence_run"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_run       email_sequence_runs%ROWTYPE;
  v_pending   INT;
  v_writing   INT;
  v_failed    INT;
BEGIN
  SELECT * INTO v_run FROM email_sequence_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', p_run_id;
  END IF;

  -- Check no pending/writing items remain
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') ,
    COUNT(*) FILTER (WHERE status = 'writing') ,
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_pending, v_writing, v_failed
  FROM email_sequence_run_items
  WHERE run_id = p_run_id;

  IF v_pending > 0 OR v_writing > 0 THEN
    -- Not ready to finalize yet
    RETURN;
  END IF;

  -- Insert into scheduled_emails from all written items
  INSERT INTO scheduled_emails (
    owner_id, lead_id, to_email, subject, html_body,
    scheduled_at, block_index, sequence_id, status,
    from_email, provider
  )
  SELECT
    v_run.owner_id,
    i.lead_id,
    i.lead_email,
    i.ai_subject,
    i.ai_body_html,
    now() + (i.delay_days || ' days')::interval,
    i.step_index,
    p_run_id::text,
    'pending',
    v_run.sequence_config->>'from_email',
    v_run.sequence_config->>'provider'
  FROM email_sequence_run_items i
  WHERE i.run_id = p_run_id
    AND i.status = 'written';

  -- Update run as completed
  UPDATE email_sequence_runs
  SET status = 'completed',
      completed_at = now(),
      items_failed = v_failed,
      updated_at = now()
  WHERE id = p_run_id;
END;
$$;


ALTER FUNCTION "public"."finalize_email_sequence_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_board_snapshot"("p_board_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
BEGIN
  -- RLS: only board members can access
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teamhub_flow_members
    WHERE board_id = p_board_id AND user_id = v_user_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'board', (
      SELECT to_jsonb(b.*)
      FROM teamhub_boards b
      WHERE b.id = p_board_id
    ),
    'lists', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l.*) ORDER BY l.position
      )
      FROM teamhub_lists l
      WHERE l.board_id = p_board_id
    ), '[]'::jsonb),
    'cards', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(c.*) || jsonb_build_object(
          'comment_count', COALESCE(cc.cnt, 0),
          'latest_comment', cc.latest_body,
          'assigned_members', COALESCE(cm.members, '[]'::jsonb),
          'lead_link', ll.link
        )
      )
      FROM teamhub_cards c
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int AS cnt,
          (SELECT body FROM teamhub_comments
           WHERE card_id = c.id ORDER BY created_at DESC LIMIT 1) AS latest_body
        FROM teamhub_comments
        WHERE card_id = c.id
      ) cc ON TRUE
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', tcm.user_id,
            'user_name', COALESCE(p.name, ''),
            'user_email', COALESCE(p.email, '')
          )
        ) AS members
        FROM teamhub_card_members tcm
        LEFT JOIN profiles p ON p.id = tcm.user_id
        WHERE tcm.card_id = c.id
      ) cm ON TRUE
      LEFT JOIN LATERAL (
        SELECT CASE WHEN til.id IS NOT NULL THEN
          jsonb_build_object(
            'id', til.id,
            'item_id', til.item_id,
            'lead_id', til.lead_id,
            'lead_name', COALESCE(ld.name, ''),
            'lead_email', COALESCE(ld.email, ''),
            'lead_status', COALESCE(ld.status, ''),
            'is_active', til.is_active
          )
        ELSE NULL END AS link
        FROM teamhub_item_leads til
        LEFT JOIN leads ld ON ld.id = til.lead_id
        WHERE til.item_id = c.id AND til.is_active = true
        LIMIT 1
      ) ll ON TRUE
      WHERE c.board_id = p_board_id AND c.is_archived = false
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_board_snapshot"("p_board_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_branding_by_domain"("p_domain" "text") RETURNS TABLE("logo_url" "text", "favicon_url" "text", "primary_color" "text", "accent_color" "text", "background_color" "text", "product_name" "text", "support_email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    wb.logo_url,
    wb.favicon_url,
    wb.primary_color,
    wb.accent_color,
    wb.background_color,
    wb.product_name,
    wb.support_email
  from public.workspace_domains wd
  join public.workspace_branding wb on wb.workspace_id = wd.workspace_id
  where lower(wd.domain)        = lower(p_domain)
    and wd.status               = 'verified'
    and wd.provisioned_at is not null
  limit 1;
$$;


ALTER FUNCTION "public"."get_branding_by_domain"("p_domain" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_branding_by_domain"("p_domain" "text") IS 'Phase 4.6.b — anon-callable. Returns workspace branding for a vanity domain that is both verified and TLS-provisioned. Used by the SPA to render branded auth/landing pages before login. Exposes ONLY the public-facing branding columns.';



CREATE OR REPLACE FUNCTION "public"."get_category_post_counts"() RETURNS TABLE("category_id" "uuid", "post_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return query
  select p.category_id, count(*) as post_count
  from public.blog_posts p
  where p.category_id is not null
  group by p.category_id;
end;
$$;


ALTER FUNCTION "public"."get_category_post_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_default_business"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_ws uuid; v_biz uuid;
begin
  select workspace_id into v_ws from public.workspace_members
    where user_id = auth.uid() order by joined_at asc limit 1;
  if v_ws is null then
    insert into public.workspaces (name, owner_id) values ('My Workspace', auth.uid()) returning id into v_ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, auth.uid(), 'owner') on conflict do nothing;
  end if;

  select b.id into v_biz from public.businesses b
    join public.business_members m on m.business_id = b.id and m.user_id = auth.uid()
    where b.workspace_id = v_ws order by b.created_at asc limit 1;

  if v_biz is null then
    v_biz := public.create_business(v_ws, 'My Business');
  end if;
  return v_biz;
end $$;


ALTER FUNCTION "public"."get_or_create_default_business"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sender_daily_sent"("p_sender_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
  v_date  date;
BEGIN
  SELECT daily_sent_today, daily_sent_date
  INTO v_count, v_date
  FROM sender_accounts
  WHERE id = p_sender_id;

  IF v_date IS NULL OR v_date < CURRENT_DATE THEN
    RETURN 0;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;


ALTER FUNCTION "public"."get_sender_daily_sent"("p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_daily_usage"("p_workspace_id" "uuid") RETURNS TABLE("emails_sent" integer, "linkedin_actions" integer, "ai_credits_used" integer, "warmup_emails_sent" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    COALESCE(w.emails_sent, 0),
    COALESCE(w.linkedin_actions, 0),
    COALESCE(w.ai_credits_used, 0),
    COALESCE(w.warmup_emails_sent, 0)
  FROM workspace_usage_counters w
  WHERE w.workspace_id = p_workspace_id
    AND w.date_key = CURRENT_DATE
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_workspace_daily_usage"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_monthly_usage"("p_workspace_id" "uuid", "p_month_key" "text") RETURNS TABLE("total_emails_sent" bigint, "total_linkedin_actions" bigint, "total_ai_credits_used" bigint, "total_warmup_sent" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    COALESCE(SUM(emails_sent), 0),
    COALESCE(SUM(linkedin_actions), 0),
    COALESCE(SUM(ai_credits_used), 0),
    COALESCE(SUM(warmup_emails_sent), 0)
  FROM workspace_usage_counters
  WHERE workspace_id = p_workspace_id
    AND month_key = p_month_key;
$$;


ALTER FUNCTION "public"."get_workspace_monthly_usage"("p_workspace_id" "uuid", "p_month_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'CLIENT');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into workspaces (id, name, owner_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'My Workspace'), new.id);

  insert into workspace_members (workspace_id, user_id, role)
  values (new.id, new.id, 'owner');

  insert into public.subscriptions (user_id, workspace_id, plan, status, expires_at)
  values (new.id, new.id, 'Starter', 'active', now() + interval '30 days');

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user_workspace"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_active_support_session"("target_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM support_sessions
        WHERE admin_id = auth.uid()
          AND target_user_id = target_id
          AND is_active = true
          AND expires_at > now()
          AND ended_at IS NULL
      );
    $$;


ALTER FUNCTION "public"."has_active_support_session"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_leads_batch"("p_workspace_id" "uuid", "p_file_name" "text", "p_file_type" "text", "p_rows" "jsonb", "p_mapping" "jsonb", "p_options" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_batch_id       uuid;
  v_plan           text;
  v_contact_limit  integer;
  v_current_count  integer;
  v_remaining      integer;
  v_imported       integer := 0;
  v_updated        integer := 0;
  v_skipped        integer := 0;
  v_skipped_rows   jsonb := '[]'::jsonb;
  v_row            jsonb;
  v_row_idx        integer := 0;
  v_dedupe         text;
  v_field          text;
  v_col            text;
  v_val            text;
  v_custom         jsonb;

  v_full_name      text;
  v_first_name     text;
  v_last_name      text;
  v_email          text;
  v_phone          text;
  v_company        text;
  v_linkedin       text;
  v_title          text;
  v_location       text;
  v_source         text;
  v_industry       text;
  v_company_size   text;
  v_insights       text;

  v_existing_id    uuid;
  v_business_id    uuid;
  v_emails         text[];
  v_email_tok      text;
  v_website        text;
begin
  v_plan := coalesce(p_options->>'plan_name', 'Starter');
  case v_plan
    when 'Scale','Enterprise','Business' then v_contact_limit := 50000;
    when 'Growth','Professional'         then v_contact_limit := 10000;
    else                                       v_contact_limit := 1000;
  end case;

  select count(*) into v_current_count
    from public.leads where client_id = p_workspace_id;

  v_remaining := v_contact_limit - v_current_count;
  v_dedupe    := coalesce(p_options->>'dedupe_strategy', 'merge');
  v_business_id := nullif(p_options->>'business_id', '')::uuid;

  insert into public.import_batches
    (workspace_id, file_name, file_type, total_rows, column_mapping, options, status)
  values
    (p_workspace_id, p_file_name, p_file_type, jsonb_array_length(p_rows), p_mapping, p_options, 'processing')
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_row_idx := v_row_idx + 1;

    v_full_name := null; v_first_name := null; v_last_name := null;
    v_email := null; v_phone := null; v_company := null;
    v_linkedin := null; v_title := null; v_location := null;
    v_source := null; v_industry := null; v_company_size := null;
    v_insights := null; v_custom := '{}'::jsonb; v_emails := '{}'::text[]; v_website := null;

    for v_col, v_field in select key, value#>>'{}' from jsonb_each(p_mapping) loop
      v_val := v_row->>v_col;
      if v_val is null or trim(v_val) = '' then continue; end if;
      v_val := trim(v_val);

      case v_field
        when 'full_name'     then v_full_name    := v_val;
        when 'first_name'    then v_first_name   := v_val;
        when 'last_name'     then v_last_name    := v_val;
        when 'primary_email' then
          -- Split the cell (may hold several addresses); first valid one becomes
          -- the primary, all are collected into the emails[] set.
          for v_email_tok in
            select lower(trim(t)) from regexp_split_to_table(v_val, '[\s;,/|]+') t
          loop
            if position('@' in v_email_tok) > 1 and not (v_email_tok = any(v_emails)) then
              v_emails := array_append(v_emails, v_email_tok);
              if v_email is null then v_email := v_email_tok; end if;
            end if;
          end loop;
        when 'additional_emails' then
          for v_email_tok in
            select lower(trim(t)) from regexp_split_to_table(v_val, '[\s;,/|]+') t
          loop
            if position('@' in v_email_tok) > 1 and not (v_email_tok = any(v_emails)) then
              v_emails := array_append(v_emails, v_email_tok);
            end if;
          end loop;
        when 'primary_phone' then v_phone        := regexp_replace(v_val, '[^0-9+\-() ]', '', 'g');
        when 'company'       then v_company      := v_val;
        when 'website'       then v_website      := case when v_val ~* '^https?://' then v_val else 'https://' || v_val end;
        when 'linkedin_url'  then
          v_linkedin := lower(v_val);
          if v_linkedin not like 'http%' then
            v_linkedin := 'https://www.linkedin.com/in/' || v_linkedin;
          end if;
          v_linkedin := regexp_replace(v_linkedin, '/+$', '');
        when 'title'         then v_title        := v_val;
        when 'location'      then v_location     := v_val;
        when 'source'        then v_source       := v_val;
        when 'industry'      then v_industry     := v_val;
        when 'company_size'  then v_company_size := v_val;
        when 'insights'      then v_insights     := v_val;
        else
          if v_field like 'custom:%' then
            v_custom := v_custom || jsonb_build_object(substring(v_field from 8), v_val);
          end if;
      end case;
    end loop;

    if v_full_name is not null and v_first_name is null then
      v_first_name := split_part(v_full_name, ' ', 1);
      if position(' ' in v_full_name) > 0 then
        v_last_name := coalesce(v_last_name, trim(substring(v_full_name from position(' ' in v_full_name) + 1)));
      end if;
    end if;

    if v_email is null and v_phone is null and v_linkedin is null then
      v_custom := v_custom || '{"needs_enrichment": true}'::jsonb;
    end if;

    v_existing_id := null;
    if v_email is not null then
      select id into v_existing_id from public.leads
        where client_id = p_workspace_id and lower(primary_email) = v_email
        limit 1;
    end if;
    if v_existing_id is null and v_linkedin is not null then
      select id into v_existing_id from public.leads
        where client_id = p_workspace_id and lower(linkedin_url) = v_linkedin
        limit 1;
    end if;

    if v_existing_id is not null then
      if v_dedupe = 'skip' then
        v_skipped := v_skipped + 1;
        v_skipped_rows := v_skipped_rows || jsonb_build_object(
          'row', v_row_idx, 'reason', 'duplicate', 'identifier', coalesce(v_email, v_linkedin));
        continue;
      elsif v_dedupe = 'merge' then
        update public.leads set
          business_id     = coalesce(leads.business_id,   v_business_id),
          first_name      = coalesce(leads.first_name,    v_first_name),
          last_name       = coalesce(leads.last_name,     v_last_name),
          primary_email   = coalesce(leads.primary_email,  v_email),
          emails          = (select array_agg(distinct e)
                             from unnest(coalesce(leads.emails, '{}'::text[]) || v_emails) e
                             where e is not null and e <> ''),
          primary_phone   = coalesce(leads.primary_phone,  v_phone),
          company         = coalesce(leads.company,        v_company),
          website         = coalesce(leads.website,        v_website),
          linkedin_url    = coalesce(leads.linkedin_url,   v_linkedin),
          title           = coalesce(leads.title,          v_title),
          location        = coalesce(leads.location,       v_location),
          source          = coalesce(leads.source,         v_source),
          industry        = coalesce(leads.industry,       v_industry),
          company_size    = coalesce(leads.company_size,   v_company_size),
          custom_fields   = leads.custom_fields || v_custom,
          import_batch_id = v_batch_id,
          updated_at      = now()
        where id = v_existing_id;
        v_updated := v_updated + 1;
        continue;
      else
        update public.leads set
          business_id     = coalesce(leads.business_id, v_business_id),
          first_name      = coalesce(v_first_name,   leads.first_name),
          last_name       = coalesce(v_last_name,    leads.last_name),
          primary_email   = coalesce(v_email,        leads.primary_email),
          emails          = (select array_agg(distinct e)
                             from unnest(coalesce(leads.emails, '{}'::text[]) || v_emails) e
                             where e is not null and e <> ''),
          primary_phone   = coalesce(v_phone,        leads.primary_phone),
          company         = coalesce(v_company,      leads.company),
          website         = coalesce(v_website,      leads.website),
          linkedin_url    = coalesce(v_linkedin,     leads.linkedin_url),
          title           = coalesce(v_title,        leads.title),
          location        = coalesce(v_location,     leads.location),
          source          = coalesce(v_source,       leads.source),
          industry        = coalesce(v_industry,     leads.industry),
          company_size    = coalesce(v_company_size, leads.company_size),
          custom_fields   = v_custom || leads.custom_fields,
          import_batch_id = v_batch_id,
          updated_at      = now()
        where id = v_existing_id;
        v_updated := v_updated + 1;
        continue;
      end if;
    end if;

    if v_remaining <= 0 then
      v_skipped := v_skipped + 1;
      v_skipped_rows := v_skipped_rows || jsonb_build_object(
        'row', v_row_idx, 'reason', 'plan_limit');
      continue;
    end if;

    insert into public.leads (
      client_id, workspace_id, business_id, company, website, score, status, source, insights,
      first_name, last_name, primary_email, emails, primary_phone,
      linkedin_url, title, location, industry, company_size,
      import_batch_id, imported_at, custom_fields
    ) values (
      p_workspace_id, p_workspace_id, v_business_id, v_company, v_website,
      0, 'New', coalesce(v_source, 'File Import'), coalesce(v_insights, 'Imported from file'),
      v_first_name, v_last_name, v_email, nullif(v_emails, '{}'::text[]), v_phone,
      v_linkedin, v_title, v_location, v_industry, v_company_size,
      v_batch_id, now(), v_custom
    );
    v_imported := v_imported + 1;
    v_remaining := v_remaining - 1;
  end loop;

  update public.import_batches set
    imported_count = v_imported,
    updated_count  = v_updated,
    skipped_count  = v_skipped,
    skipped_rows   = v_skipped_rows,
    status         = 'completed',
    completed_at   = now()
  where id = v_batch_id;

  insert into public.audit_logs (user_id, workspace_id, action, details)
  values (p_workspace_id, p_workspace_id, 'FILE_IMPORT', format(
    'Imported %s, updated %s, skipped %s from %s',
    v_imported, v_updated, v_skipped, p_file_name
  ));

  return jsonb_build_object(
    'batch_id',        v_batch_id,
    'imported_count',  v_imported,
    'updated_count',   v_updated,
    'skipped_count',   v_skipped,
    'skipped_rows',    v_skipped_rows,
    'plan_limit',      v_contact_limit,
    'contacts_before', v_current_count,
    'contacts_after',  v_current_count + v_imported
  );
end;
$_$;


ALTER FUNCTION "public"."import_leads_batch"("p_workspace_id" "uuid", "p_file_name" "text", "p_file_type" "text", "p_rows" "jsonb", "p_mapping" "jsonb", "p_options" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_ai_usage"("p_workspace_id" "uuid", "p_month_year" "text", "p_credits" integer, "p_tokens" bigint, "p_credits_limit" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_credits integer;
BEGIN
  INSERT INTO workspace_ai_usage (workspace_id, month_year, credits_used, tokens_used, credits_limit, updated_at)
  VALUES (p_workspace_id, p_month_year, p_credits, p_tokens, p_credits_limit, now())
  ON CONFLICT (workspace_id, month_year)
  DO UPDATE SET
    credits_used  = workspace_ai_usage.credits_used + p_credits,
    tokens_used   = workspace_ai_usage.tokens_used  + p_tokens,
    credits_limit = p_credits_limit,
    updated_at    = now()
  RETURNING credits_used INTO v_new_credits;

  RETURN v_new_credits;
END;
$$;


ALTER FUNCTION "public"."increment_ai_usage"("p_workspace_id" "uuid", "p_month_year" "text", "p_credits" integer, "p_tokens" bigint, "p_credits_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_outbound_usage"("p_workspace_id" "uuid", "p_inbox_id" "text", "p_channel" "text", "p_period_type" "text", "p_period_key" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO public.outbound_usage (workspace_id, inbox_id, channel, period_type, period_key, count, updated_at)
  VALUES (p_workspace_id, p_inbox_id, p_channel, p_period_type, p_period_key, 1, now())
  ON CONFLICT (workspace_id, inbox_id, channel, period_type, period_key)
  DO UPDATE SET count = outbound_usage.count + 1, updated_at = now()
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;


ALTER FUNCTION "public"."increment_outbound_usage"("p_workspace_id" "uuid", "p_inbox_id" "text", "p_channel" "text", "p_period_type" "text", "p_period_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_sender_daily_sent"("p_sender_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE sender_accounts
  SET
    daily_sent_today = CASE
      WHEN daily_sent_date = CURRENT_DATE THEN daily_sent_today + 1
      ELSE 1  -- new day, reset
    END,
    daily_sent_date = CURRENT_DATE,
    updated_at = now()
  WHERE id = p_sender_id
  RETURNING daily_sent_today INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;


ALTER FUNCTION "public"."increment_sender_daily_sent"("p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new int;
begin
  update public.sender_accounts
     set consecutive_failures = consecutive_failures + 1,
         updated_at           = now()
   where id = p_sender_id
   returning consecutive_failures into v_new;
  return coalesce(v_new, 0);
end;
$$;


ALTER FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") IS 'Phase 3.2.1 — called from send-email on a failed send. The Phase 3.1 sender_daily_cap halves the cap when consecutive_failures pushes health_score below 50 on the next refresh.';



CREATE OR REPLACE FUNCTION "public"."increment_usage"("ws_id" "uuid", "ctype" "text", "amount" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO usage_counters (workspace_id, counter_type, period_key, count)
  VALUES (ws_id, ctype, to_char(NOW(), 'YYYY-MM'), amount)
  ON CONFLICT (workspace_id, counter_type, period_key)
  DO UPDATE SET count = usage_counters.count + amount;
END;
$$;


ALTER FUNCTION "public"."increment_usage"("ws_id" "uuid", "ctype" "text", "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage"("p_workspace_id" "uuid", "p_event_type" "text", "p_source_event_id" "text" DEFAULT NULL::"text", "p_quantity" integer DEFAULT 1, "p_sender_account_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_date_key  date := CURRENT_DATE;
  v_month_key text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_result    jsonb;
BEGIN
  -- Idempotency check: if source_event_id provided, try to insert
  IF p_source_event_id IS NOT NULL THEN
    BEGIN
      INSERT INTO usage_events (source_event_id, workspace_id, event_type, quantity, sender_account_id, metadata)
      VALUES (p_source_event_id, p_workspace_id, p_event_type, p_quantity, p_sender_account_id, p_metadata);
    EXCEPTION WHEN unique_violation THEN
      -- Duplicate event — return without incrementing
      RETURN jsonb_build_object('duplicate', true, 'source_event_id', p_source_event_id);
    END;
  END IF;

  -- Increment workspace_usage_counters
  INSERT INTO workspace_usage_counters
    (workspace_id, date_key, month_key,
     emails_sent, linkedin_actions, ai_credits_used, warmup_emails_sent)
  VALUES (
    p_workspace_id, v_date_key, v_month_key,
    CASE WHEN p_event_type = 'email_sent'       THEN p_quantity ELSE 0 END,
    CASE WHEN p_event_type = 'linkedin_action'   THEN p_quantity ELSE 0 END,
    CASE WHEN p_event_type = 'ai_credit'         THEN p_quantity ELSE 0 END,
    CASE WHEN p_event_type = 'warmup_sent'       THEN p_quantity ELSE 0 END
  )
  ON CONFLICT (workspace_id, date_key)
  DO UPDATE SET
    emails_sent        = workspace_usage_counters.emails_sent
                         + CASE WHEN p_event_type = 'email_sent'     THEN p_quantity ELSE 0 END,
    linkedin_actions   = workspace_usage_counters.linkedin_actions
                         + CASE WHEN p_event_type = 'linkedin_action' THEN p_quantity ELSE 0 END,
    ai_credits_used    = workspace_usage_counters.ai_credits_used
                         + CASE WHEN p_event_type = 'ai_credit'       THEN p_quantity ELSE 0 END,
    warmup_emails_sent = workspace_usage_counters.warmup_emails_sent
                         + CASE WHEN p_event_type = 'warmup_sent'     THEN p_quantity ELSE 0 END,
    updated_at         = now();

  -- For email sends: also bump sender_accounts.daily_sent_today
  IF p_event_type = 'email_sent' AND p_sender_account_id IS NOT NULL THEN
    UPDATE sender_accounts
    SET
      daily_sent_today = CASE
        WHEN daily_sent_date = CURRENT_DATE THEN daily_sent_today + p_quantity
        ELSE p_quantity
      END,
      daily_sent_date = CURRENT_DATE,
      updated_at = now()
    WHERE id = p_sender_account_id;
  END IF;

  v_result := jsonb_build_object(
    'duplicate', false,
    'event_type', p_event_type,
    'quantity', p_quantity
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."increment_usage"("p_workspace_id" "uuid", "p_event_type" "text", "p_source_event_id" "text", "p_quantity" integer, "p_sender_account_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_workspace_usage"("p_workspace_id" "uuid", "p_date_key" "date", "p_month_key" "text", "p_emails" integer DEFAULT 0, "p_linkedin" integer DEFAULT 0, "p_ai_credits" integer DEFAULT 0, "p_warmup" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO workspace_usage_counters
    (workspace_id, date_key, month_key, emails_sent, linkedin_actions, ai_credits_used, warmup_emails_sent)
  VALUES
    (p_workspace_id, p_date_key, p_month_key, p_emails, p_linkedin, p_ai_credits, p_warmup)
  ON CONFLICT (workspace_id, date_key)
  DO UPDATE SET
    emails_sent        = workspace_usage_counters.emails_sent        + p_emails,
    linkedin_actions   = workspace_usage_counters.linkedin_actions   + p_linkedin,
    ai_credits_used    = workspace_usage_counters.ai_credits_used    + p_ai_credits,
    warmup_emails_sent = workspace_usage_counters.warmup_emails_sent + p_warmup,
    updated_at         = now();
END;
$$;


ALTER FUNCTION "public"."increment_workspace_usage"("p_workspace_id" "uuid", "p_date_key" "date", "p_month_key" "text", "p_emails" integer, "p_linkedin" integer, "p_ai_credits" integer, "p_warmup" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_ab_autopause"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_url   text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/ab-autopause';
  v_token text;
  v_req   bigint;
  v_any   int;
begin
  select count(*) into v_any from public.email_sequences
   where ab_auto_optimize = true and status in ('active','processing') limit 1;
  if v_any = 0 then return null; end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token from vault.decrypted_secrets where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_ab_autopause: no service-role token — skipping'; return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_token),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  ) into v_req;
  return v_req;
end;
$$;


ALTER FUNCTION "public"."invoke_ab_autopause"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_email_writing_queue"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/process-email-writing-queue';
  v_token  text;
  v_req_id bigint;
  v_pending int;
begin
  -- Cheap pre-check: skip the HTTP call entirely when nothing's queued.
  select count(*) into v_pending
    from public.email_sequence_run_items
   where status in ('pending', 'writing')
   limit 1;
  if v_pending = 0 then
    return null;
  end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_email_writing_queue: no service-role token in GUC or vault — skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_req_id;

  return v_req_id;
end;
$$;


ALTER FUNCTION "public"."invoke_email_writing_queue"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."invoke_email_writing_queue"() IS 'pg_cron backstop for AI email-writing queue. Drains email_sequence_run_items pending/writing rows that the client-side trigger missed.';



CREATE OR REPLACE FUNCTION "public"."invoke_imap_poll"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/poll-imap-inbox';
  v_token  text;
  v_req_id bigint;
  v_any    int;
begin
  select count(*) into v_any from public.sender_account_secrets where smtp_pass is not null limit 1;
  if v_any = 0 then return null; end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token from vault.decrypted_secrets where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_imap_poll: no service-role token — skipping'; return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_req_id;
  return v_req_id;
end;
$$;


ALTER FUNCTION "public"."invoke_imap_poll"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_sequence_sends"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/process-sequence-sends';
  v_token  text;
  v_req_id bigint;
  v_due    int;
begin
  -- Only fire when at least one written item's send time has arrived.
  select count(*) into v_due
    from public.email_sequence_run_items
   where status = 'written'
     and created_at + (coalesce(delay_days, 0) || ' days')::interval <= now()
   limit 1;
  if v_due = 0 then
    return null;
  end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_sequence_sends: no service-role token in GUC or vault — skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_req_id;
  return v_req_id;
end;
$$;


ALTER FUNCTION "public"."invoke_sequence_sends"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_webhook_dispatcher"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/webhook-dispatcher';
  v_token  text;
  v_req_id bigint;
begin
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_webhook_dispatcher: no service-role token in GUC or vault — skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) into v_req_id;

  return v_req_id;
end;
$$;


ALTER FUNCTION "public"."invoke_webhook_dispatcher"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."invoke_webhook_dispatcher"() IS 'Phase 4.3 cron — POSTs to webhook-dispatcher edge function with the service-role key from vault. Logs warning + skips when secret is missing.';



CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_admin"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid() and role in ('owner','admin')
  );
$$;


ALTER FUNCTION "public"."is_business_admin"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_member"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_business_member"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'ADMIN'
          AND is_super_admin = true
      );
    $$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("check_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members WHERE team_id = check_team_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_team_member"("check_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("ws_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("ws_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run            email_sequence_runs%rowtype;
  v_workspace_id   uuid;
  v_message_ids    uuid[];
  v_sent           int;
  v_unique_opens   int;
  v_unique_clicks  int;
  v_replies        int;
  v_bounces        int;
  v_open_rate      numeric(5,4);
  v_click_rate     numeric(5,4);
  v_reply_rate     numeric(5,4);
  v_bounce_rate    numeric(5,4);
  v_already        int;
begin
  -- Idempotency: skip if an outcome row already exists for this run.
  select count(*) into v_already
  from public.campaign_memory
  where campaign_kind = 'email_sequence'
    and campaign_id = p_run_id::text
    and kind = 'outcome';
  if v_already > 0 then return; end if;

  -- Pull the run.
  select * into v_run from public.email_sequence_runs where id = p_run_id;
  if v_run.id is null or v_run.status <> 'completed' then return; end if;

  -- Resolve workspace_id. Prefer the run's own column; fall back to leads.
  v_workspace_id := v_run.workspace_id;
  if v_workspace_id is null then
    select l.workspace_id
      into v_workspace_id
      from public.email_sequence_run_items i
      join public.leads l on l.id = i.lead_id
      where i.run_id = p_run_id
      limit 1;
  end if;
  if v_workspace_id is null then return; end if;

  -- Collect all email_messages.id for emails sent as part of this run.
  -- finalize_email_sequence_run sets scheduled_emails.sequence_id = run_id::text,
  -- and send-email carries that into email_messages.sequence_id.
  select coalesce(array_agg(em.id), '{}')
    into v_message_ids
    from public.email_messages em
    where em.sequence_id = p_run_id::text;

  v_sent := coalesce(array_length(v_message_ids, 1), 0);
  if v_sent = 0 then
    -- No messages tied back to this run yet — likely too early; bail.
    return;
  end if;

  -- Aggregate events. UNIQUE per message for opens/clicks (one human, many opens).
  select
    count(distinct case when ee.event_type = 'open'    and not ee.is_bot and not ee.is_apple_privacy then ee.message_id end),
    count(distinct case when ee.event_type = 'click'   and not ee.is_bot then ee.message_id end),
    count(*) filter (where ee.event_type = 'replied'),
    count(*) filter (where ee.event_type = 'bounced')
    into v_unique_opens, v_unique_clicks, v_replies, v_bounces
    from public.email_events ee
    where ee.message_id = any (v_message_ids);

  v_open_rate   := round(v_unique_opens::numeric / v_sent, 4);
  v_click_rate  := round(v_unique_clicks::numeric / v_sent, 4);
  v_reply_rate  := round(v_replies::numeric       / v_sent, 4);
  v_bounce_rate := round(v_bounces::numeric       / v_sent, 4);

  insert into public.campaign_memory (
    workspace_id, campaign_kind, campaign_id, kind, value,
    metric_value, source, confidence, tags
  ) values (
    v_workspace_id,
    'email_sequence',
    p_run_id::text,
    'outcome',
    jsonb_build_object(
      'sent',          v_sent,
      'unique_opens',  v_unique_opens,
      'unique_clicks', v_unique_clicks,
      'replies',       v_replies,
      'bounces',       v_bounces,
      'open_rate',     v_open_rate,
      'click_rate',    v_click_rate,
      'reply_rate',    v_reply_rate,
      'bounce_rate',   v_bounce_rate,
      'lead_count',    v_run.lead_count,
      'step_count',    v_run.step_count,
      'tone',          v_run.sequence_config->>'tone',
      'goal',          v_run.sequence_config->>'goal',
      'cadence',       v_run.sequence_config->>'cadence',
      'started_at',    v_run.started_at,
      'completed_at',  v_run.completed_at
    ),
    -- Headline metric: reply_rate when present (strongest signal),
    -- otherwise open_rate.
    case when v_replies > 0 then v_reply_rate else v_open_rate end,
    'sequence_completion',
    -- Higher confidence when audience was bigger (smaller samples are noisier).
    case
      when v_sent >= 100 then 0.90
      when v_sent >=  30 then 0.75
      when v_sent >=  10 then 0.60
      else                    0.45
    end,
    array['email_sequence', 'outcome',
          (v_run.sequence_config->>'tone'),
          (v_run.sequence_config->>'goal')]
      || case when v_replies > 0 then array['has_replies'] else array[]::text[] end
  );
exception when others then
  raise warning 'log_campaign_memory_sequence_outcome failed for %: % %', p_run_id, sqlstate, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") IS 'Phase 2.2 memory writer. Aggregates email_events for a completed email_sequence_runs row and inserts a campaign_memory(kind=outcome) row with the resulting open/click/reply/bounce rates. Idempotent. Errors warned, not raised.';



CREATE OR REPLACE FUNCTION "public"."log_goal_outcome_to_memory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_active_plan jsonb;
  v_step_summary jsonb;
  v_memory_kind text;
begin
  -- Only fire on transitions to terminal states.
  if new.status not in ('completed','failed','cancelled') then return new; end if;
  if old.status is not distinct from new.status then return new; end if;
  if old.status in ('completed','failed','cancelled') then return new; end if;

  v_memory_kind := case
    when new.status = 'completed' then 'winning_pattern'
    else 'avoid'
  end;

  -- Get the active plan's body for memory context.
  select plan into v_active_plan
    from public.automation_plans
   where goal_id = new.id and is_active = true
   limit 1;

  -- Get the step run aggregate counts.
  select jsonb_build_object(
    'succeeded', count(*) filter (where status = 'succeeded'),
    'failed',    count(*) filter (where status = 'failed'),
    'skipped',   count(*) filter (where status = 'skipped'),
    'total',     count(*)
  ) into v_step_summary
  from public.automation_step_runs
  where goal_id = new.id;

  insert into public.workspace_memory (
    workspace_id, kind, key, value, source, confidence, tags
  )
  values (
    new.workspace_id,
    v_memory_kind,
    'goal:' || new.id::text,
    jsonb_build_object(
      'goal_statement',       new.statement,
      'goal_target_metric',   new.target_metric,
      'goal_target_value',    new.target_value,
      'goal_progress',        new.progress_value,
      'goal_status',          new.status,
      'plan_summary',         coalesce(v_active_plan->>'summary', ''),
      'plan_step_count',      coalesce(jsonb_array_length(v_active_plan->'steps'), 0),
      'step_run_summary',     v_step_summary,
      'completed_at',         coalesce(new.completed_at, now())
    ),
    'goal_outcome',
    case
      when (v_step_summary->>'total')::int >= 5  then 0.85
      when (v_step_summary->>'total')::int >= 3  then 0.70
      else 0.55
    end,
    array['goal','automation', new.target_metric, v_memory_kind]
  );

  return new;
exception when others then
  raise warning 'log_goal_outcome_to_memory failed for %: % %', new.id, sqlstate, sqlerrm;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_goal_outcome_to_memory"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_goal_outcome_to_memory"() IS 'Phase 6.4 — on goal status → completed/failed/cancelled, write a workspace_memory row (winning_pattern or avoid) so future generateGoalPlan() runs see this outcome.';



CREATE OR REPLACE FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid" DEFAULT NULL::"uuid", "p_destination_url" "text" DEFAULT NULL::"text", "p_is_bot" boolean DEFAULT false, "p_is_apple_privacy" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead_id      uuid;
  v_workspace_id uuid;
begin
  -- Skip noise: bots and Apple privacy proxy opens.
  if p_is_bot or p_is_apple_privacy then
    return;
  end if;

  -- Only record outcomes we care about for memory.
  if p_event_type not in ('open', 'click', 'delivered', 'bounced', 'replied') then
    return;
  end if;

  -- Resolve lead + workspace from the message.
  select em.lead_id, l.workspace_id
    into v_lead_id, v_workspace_id
  from public.email_messages em
  join public.leads l on l.id = em.lead_id
  where em.id = p_message_id
  limit 1;

  -- If we can't tie back to a lead+workspace (e.g. test send), skip silently.
  if v_lead_id is null or v_workspace_id is null then
    return;
  end if;

  insert into public.lead_memory (
    workspace_id, lead_id, kind, value, source, confidence, tags, occurred_at
  )
  values (
    v_workspace_id,
    v_lead_id,
    'interaction',
    jsonb_build_object(
      'event', p_event_type,
      'message_id', p_message_id,
      'link_id', p_link_id,
      'destination_url', p_destination_url
    ),
    'email_track',
    case p_event_type
      when 'replied'   then 0.95
      when 'click'     then 0.85
      when 'open'      then 0.55
      when 'delivered' then 0.30
      when 'bounced'   then 0.40
      else 0.50
    end,
    array['email', 'interaction', p_event_type],
    now()
  );
exception when others then
  -- Never break tracking just because memory write failed.
  raise warning 'log_lead_memory_email_event failed: % %', sqlstate, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_destination_url" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_destination_url" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean) IS 'Phase 2.1 memory writer. Turns email open/click/reply/bounce events into lead_memory rows so the AI can recall prior interactions. Bot and Apple privacy events are ignored. Errors are warned (not raised) to keep email tracking unbreakable.';



CREATE OR REPLACE FUNCTION "public"."mark_domain_failed"("p_domain_id" "uuid", "p_error" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.workspace_domains
     set status = case when verified_at is not null then 'verified' else 'failed' end,
         last_check_at = now(),
         last_check_error = p_error
   where id = p_domain_id;
end;
$$;


ALTER FUNCTION "public"."mark_domain_failed"("p_domain_id" "uuid", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_domain_provision_failed"("p_domain_id" "uuid", "p_error" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.workspace_domains
     set last_provision_at     = now(),
         last_provision_error  = p_error
   where id = p_domain_id;
$$;


ALTER FUNCTION "public"."mark_domain_provision_failed"("p_domain_id" "uuid", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_domain_provisioned"("p_domain_id" "uuid", "p_cert_expires_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.workspace_domains
     set provisioned_at        = coalesce(provisioned_at, now()),
         last_provision_at     = now(),
         last_provision_error  = null,
         cert_expires_at       = p_cert_expires_at
   where id = p_domain_id;
$$;


ALTER FUNCTION "public"."mark_domain_provisioned"("p_domain_id" "uuid", "p_cert_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_domain_verified"("p_domain_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.workspace_domains
     set status = 'verified',
         verified_at = now(),
         last_check_at = now(),
         last_check_error = null
   where id = p_domain_id;
end;
$$;


ALTER FUNCTION "public"."mark_domain_verified"("p_domain_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_webhook_delivery_result"("p_delivery_id" "uuid", "p_succeeded" boolean, "p_status_code" integer DEFAULT NULL::integer, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_attempt int;
  v_ep_id   uuid;
begin
  if p_succeeded then
    update public.webhook_deliveries
       set status = 'succeeded',
           last_status_code = p_status_code,
           last_error = null,
           succeeded_at = now()
     where id = p_delivery_id
     returning endpoint_id into v_ep_id;

    if v_ep_id is not null then
      update public.webhook_endpoints
         set failure_count = 0,
             last_success_at = now(),
             last_attempt_at = now(),
             updated_at = now()
       where id = v_ep_id;
    end if;
  else
    -- Backoff schedule: 1m, 5m, 30m, 2h, 12h. After 5 attempts → dead.
    update public.webhook_deliveries
       set status = case when attempt_count >= 5 then 'dead' else 'pending' end,
           last_status_code = p_status_code,
           last_error = p_error,
           next_attempt_at = case attempt_count
             when 1 then now() + interval '1 minute'
             when 2 then now() + interval '5 minutes'
             when 3 then now() + interval '30 minutes'
             when 4 then now() + interval '2 hours'
             else now() + interval '12 hours'
           end
     where id = p_delivery_id
     returning endpoint_id, attempt_count into v_ep_id, v_attempt;

    if v_ep_id is not null then
      update public.webhook_endpoints
         set failure_count = failure_count + 1,
             last_attempt_at = now(),
             -- Auto-disable after 24h of consecutive failures (rough heuristic
             -- using failure_count; real signal would track time-since-last-success).
             disabled_at = case when failure_count + 1 >= 50 then now() else disabled_at end,
             enabled = case when failure_count + 1 >= 50 then false else enabled end,
             updated_at = now()
       where id = v_ep_id;
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."mark_webhook_delivery_result"("p_delivery_id" "uuid", "p_succeeded" boolean, "p_status_code" integer, "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") RETURNS TABLE("sender_id" "uuid", "provider" "text", "from_email" "text", "health_score" integer, "daily_cap" integer, "daily_sent" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    sa.id,
    sa.provider,
    sa.from_email,
    sa.health_score,
    public.sender_daily_cap(sa.id) as cap,
    -- Auto-reset stale daily counters
    case when sa.daily_sent_date = current_date then sa.daily_sent_today else 0 end as sent
  from public.sender_accounts sa
  where sa.workspace_id     = p_workspace_id
    and sa.status           = 'connected'
    and sa.use_for_outreach = true
    and coalesce(sa.health_score, 100) >= 25
  order by
    -- Prefer the healthiest, least-utilised sender.
    sa.health_score desc nulls last,
    case when sa.daily_sent_date = current_date then sa.daily_sent_today else 0 end::numeric
      / greatest(public.sender_daily_cap(sa.id), 1)::numeric asc,
    sa.created_at asc
  limit 1
  -- Caller must check daily_sent < daily_cap; we don't filter here so we can
  -- still return a sender that's at cap with an explicit signal.
  ;
end;
$$;


ALTER FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") IS 'Phase 3.1 — selects the best outreach sender for a workspace ordered by health then utilisation. Returns 0 rows if no eligible senders. Caller still must verify daily_sent < daily_cap.';



CREATE OR REPLACE FUNCTION "public"."purge_ai_rate_limit_buckets"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.ai_rate_limit_buckets
   where bucket_minute < now() - interval '1 hour';
$$;


ALTER FUNCTION "public"."purge_ai_rate_limit_buckets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_api_idempotency"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.api_idempotency where expires_at < now();
$$;


ALTER FUNCTION "public"."purge_api_idempotency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_api_rate_limit_buckets"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.api_rate_limit_buckets
   where bucket_minute < now() - interval '1 hour';
$$;


ALTER FUNCTION "public"."purge_api_rate_limit_buckets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count int;
begin
  insert into public.webhook_deliveries
    (endpoint_id, workspace_id, event_type, payload)
  select
    e.id, p_workspace_id, p_event_type, p_payload
  from public.webhook_endpoints e
  where e.workspace_id = p_workspace_id
    and e.enabled
    and (cardinality(e.event_types) = 0 or p_event_type = any(e.event_types));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") IS 'Phase 4.3 — fan-out an event to all matching webhook_endpoints. Returns the number of deliveries queued. Canonical event types fired by triggers in 20260510000000: lead.created, lead.updated, sequence.completed, email.sent, email.bounced, email.spam_complaint, email.unsubscribed. Apps may also queue custom events (e.g. test.ping from the UI).';



CREATE OR REPLACE FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") RETURNS TABLE("goal_id" "uuid", "observation_count" integer, "latest_kind" "text", "latest_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (wm.value->>'goal_id')::uuid as goal_id,
    count(*)::int                as observation_count,
    (array_agg(wm.value->>'kind' order by wm.created_at desc))[1] as latest_kind,
    max(wm.created_at)           as latest_at
  from public.workspace_memory wm
  where wm.workspace_id = p_workspace_id
    and wm.kind = 'observation'
    and wm.key like 'goal:%'
    and wm.created_at > now() - interval '24 hours'
    and exists (
      select 1 from public.workspace_members m
       where m.workspace_id = p_workspace_id
         and m.user_id = auth.uid()
    )
  group by 1;
$$;


ALTER FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") IS 'Phase 6.3.b UI helper — per-goal aggregate of observation rows in the last 24h. Used by /portal/goals to render drift chips without fetching every observation value.';



CREATE OR REPLACE FUNCTION "public"."record_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid" DEFAULT NULL::"uuid", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_is_bot" boolean DEFAULT false, "p_is_apple_privacy" boolean DEFAULT false, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Validate the message exists
  IF NOT EXISTS (SELECT 1 FROM email_messages WHERE id = p_message_id) THEN
    RAISE EXCEPTION 'Message not found: %', p_message_id;
  END IF;

  -- Insert the event
  INSERT INTO email_events (message_id, link_id, event_type, ip_address, user_agent, is_bot, is_apple_privacy, metadata)
  VALUES (p_message_id, p_link_id, p_event_type, p_ip_address, p_user_agent, p_is_bot, p_is_apple_privacy, p_metadata)
  RETURNING id INTO v_event_id;

  -- Side effects
  IF p_event_type = 'click' AND p_link_id IS NOT NULL THEN
    UPDATE email_links SET click_count = click_count + 1 WHERE id = p_link_id;
  END IF;

  IF p_event_type = 'delivered' THEN
    UPDATE email_messages SET status = 'delivered', updated_at = now() WHERE id = p_message_id AND status = 'sent';
  ELSIF p_event_type = 'bounced' THEN
    UPDATE email_messages SET status = 'bounced', updated_at = now() WHERE id = p_message_id;
  END IF;

  RETURN v_event_id;
END;
$$;


ALTER FUNCTION "public"."record_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_ip_address" "text", "p_user_agent" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean, "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."relearn_best_send_hours"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_updated integer;
begin
  with lead_best as (
    select
      em.lead_id,
      mode() within group (order by extract(hour from (e.created_at at time zone 'UTC'))::int) as best_hour
    from public.email_events e
    join public.email_messages em on em.id = e.message_id
    where e.event_type = 'open'
      and e.created_at > now() - interval '90 days'
      and em.lead_id is not null
    group by em.lead_id
    having count(*) >= 2
  )
  update public.email_sequence_run_items it
    set best_send_hour = lb.best_hour,
        updated_at = now()
  from public.email_sequence_runs r,
       lead_best lb
  where it.run_id = r.id
    and r.status = 'processing'
    and coalesce((r.sequence_config->>'sendBestTime')::boolean, false)
    and it.status in ('pending', 'written')
    and it.lead_id = lb.lead_id
    and it.best_send_hour is distinct from lb.best_hour;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;


ALTER FUNCTION "public"."relearn_best_send_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.sender_accounts
     set consecutive_failures = 0,
         updated_at           = now()
   where id = p_sender_id and consecutive_failures > 0;
$$;


ALTER FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") IS 'Phase 3.2.1 — called from send-email on a successful send to clear the consecutive-failures circuit-breaker counter.';



CREATE OR REPLACE FUNCTION "public"."reset_stuck_writing_items"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Reset items stuck in 'writing' with expired lock and < 3 attempts back to pending
  UPDATE email_sequence_run_items
  SET status = 'pending',
      locked_until = NULL,
      updated_at = now()
  WHERE status = 'writing'
    AND locked_until < now()
    AND attempt_count < 3;

  -- Mark items with >= 3 attempts as failed
  UPDATE email_sequence_run_items
  SET status = 'failed',
      error_message = COALESCE(error_message, '') || ' | Max retries exceeded',
      locked_until = NULL,
      updated_at = now()
  WHERE status = 'writing'
    AND locked_until < now()
    AND attempt_count >= 3;
END;
$$;


ALTER FUNCTION "public"."reset_stuck_writing_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.api_keys
     set revoked_at = now()
   where id = p_key_id
     and workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid());
end;
$$;


ALTER FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") IS 'Phase 4.1 — Workspace member soft-revokes a key by id. Idempotent.';



CREATE OR REPLACE FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_warmup       boolean;
  v_age_days     numeric;
  v_health       int;
  v_base_cap     int;
begin
  select warmup_enabled,
         extract(epoch from (now() - created_at)) / 86400.0,
         coalesce(health_score, 100)
    into v_warmup, v_age_days, v_health
    from public.sender_accounts where id = p_sender_id;

  if v_warmup is null then return 0; end if;

  if v_warmup and v_age_days < 21 then
    v_base_cap := 50 + floor((v_age_days / 21.0) * 450)::int;
  else
    v_base_cap := 500;
  end if;

  if v_health < 25 then return 0; end if;
  if v_health < 50 then return v_base_cap / 2; end if;
  return v_base_cap;
end;
$$;


ALTER FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") IS 'Phase 3.1 — returns the daily send cap for a sender. 50→500 ramp over 21 days when warmup_enabled, halved if health_score<50, zero if <25.';



CREATE OR REPLACE FUNCTION "public"."set_goal_status"("p_goal_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_status not in ('draft','planning','planned','active','running','paused','completed','cancelled','failed') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.automation_goals
     set status = p_status,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_goal_id;
end;
$$;


ALTER FUNCTION "public"."set_goal_status"("p_goal_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text" DEFAULT NULL::"text", "p_created_by_kind" "text" DEFAULT 'planner'::"text", "p_model_used" "text" DEFAULT NULL::"text", "p_tokens_used" integer DEFAULT NULL::integer, "p_superseded_reason" "text" DEFAULT 'newer plan'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ws        uuid;
  v_caller_in_ws boolean;
  v_next_ver  int;
  v_new_id    uuid;
begin
  select workspace_id into v_ws from public.automation_goals where id = p_goal_id;
  if v_ws is null then raise exception 'goal not found: %', p_goal_id; end if;

  select exists (
    select 1 from public.workspace_members
    where workspace_id = v_ws and user_id = auth.uid()
  ) into v_caller_in_ws;
  if not v_caller_in_ws then raise exception 'forbidden: caller not in workspace %', v_ws; end if;

  -- Deactivate prior active plan(s).
  update public.automation_plans
     set is_active = false,
         superseded_reason = p_superseded_reason
   where goal_id = p_goal_id and is_active = true;

  -- Next version.
  select coalesce(max(version), 0) + 1 into v_next_ver
    from public.automation_plans where goal_id = p_goal_id;

  insert into public.automation_plans
    (goal_id, workspace_id, version, created_by_kind, plan, rationale, model_used, tokens_used)
  values
    (p_goal_id, v_ws, v_next_ver, p_created_by_kind, p_plan, p_rationale, p_model_used, p_tokens_used)
  returning id into v_new_id;

  -- Advance goal status only if still in pre-planned state.
  update public.automation_goals
     set status = 'planned'
   where id = p_goal_id and status in ('draft','planning');

  return v_new_id;
end;
$$;


ALTER FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text", "p_created_by_kind" "text", "p_model_used" "text", "p_tokens_used" integer, "p_superseded_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text", "p_created_by_kind" "text", "p_model_used" "text", "p_tokens_used" integer, "p_superseded_reason" "text") IS 'Phase 6.1 — atomic plan-version insert. Deactivates prior active plan + bumps version + inserts new active row + advances goal status from draft/planning → planned.';



CREATE OR REPLACE FUNCTION "public"."teamhub_check_lead_link_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_board_id UUID;
  v_lead_owner UUID;
BEGIN
  -- Get the card's board_id
  SELECT board_id INTO v_board_id
  FROM teamhub_cards WHERE id = NEW.item_id;

  -- Get the lead's owner
  SELECT client_id INTO v_lead_owner
  FROM leads WHERE id = NEW.lead_id;

  -- Check that the lead owner is a member of the board
  IF NOT EXISTS (
    SELECT 1 FROM teamhub_flow_members
    WHERE board_id = v_board_id AND user_id = v_lead_owner
  ) THEN
    RAISE EXCEPTION 'Lead owner must be a member of the board';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."teamhub_check_lead_link_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teamhub_mirror_activity_to_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_workspace_id UUID;
  v_entity_type TEXT;
  v_entity_id UUID;
BEGIN
  -- Look up workspace_id from the board
  SELECT workspace_id INTO v_workspace_id
  FROM teamhub_boards WHERE id = NEW.board_id;

  -- Derive entity_type and entity_id from action_type
  IF NEW.card_id IS NOT NULL THEN
    v_entity_type := 'card';
    v_entity_id := NEW.card_id;
  ELSIF NEW.action_type IN ('list_created', 'list_deleted', 'list_renamed') THEN
    v_entity_type := 'list';
    v_entity_id := (NEW.meta_json->>'list_id')::UUID;
  ELSE
    v_entity_type := 'board';
    v_entity_id := NEW.board_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id,
    workspace_id, payload, created_at
  ) VALUES (
    NEW.actor_id,
    'teamhub.' || NEW.action_type,
    v_entity_type,
    v_entity_id,
    v_workspace_id,
    NEW.meta_json,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."teamhub_mirror_activity_to_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teamhub_sync_lead_on_move"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_lead_id UUID;
  v_template_id UUID;
  v_structure JSONB;
  v_lane_name TEXT;
  v_lane_status_map JSONB;
  v_new_status TEXT;
BEGIN
  -- Only fire when list_id actually changes
  IF OLD.list_id = NEW.list_id THEN
    RETURN NEW;
  END IF;

  -- Check if card has an active lead link
  SELECT lead_id INTO v_lead_id
  FROM teamhub_item_leads
  WHERE item_id = NEW.id AND is_active = true;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the new lane name
  SELECT name INTO v_lane_name
  FROM teamhub_lists WHERE id = NEW.list_id;

  IF v_lane_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if board has a template with lead_sync enabled
  SELECT template_id INTO v_template_id
  FROM teamhub_boards WHERE id = NEW.board_id;

  IF v_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT structure_json INTO v_structure
  FROM teamhub_flow_templates WHERE id = v_template_id;

  IF v_structure IS NULL OR (v_structure->>'lead_sync')::boolean IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_lane_status_map := v_structure->'lane_status_map';
  IF v_lane_status_map IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve status from lane_status_map
  v_new_status := v_lane_status_map->>v_lane_name;
  IF v_new_status IS NULL THEN
    -- Try case-insensitive match via lower()
    SELECT val INTO v_new_status
    FROM jsonb_each_text(v_lane_status_map) AS x(key, val)
    WHERE lower(x.key) = lower(v_lane_name)
    LIMIT 1;
  END IF;

  IF v_new_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update the lead status (canonical fields)
  UPDATE leads SET
    status = v_new_status,
    last_activity = now(),
    updated_at = now()
  WHERE id = v_lead_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."teamhub_sync_lead_on_move"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teamhub_user_flow_role"("p_board_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT role FROM teamhub_flow_members
  WHERE board_id = p_board_id AND user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."teamhub_user_flow_role"("p_board_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_automation_goals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at := now(); return new; end;
$$;


ALTER FUNCTION "public"."touch_automation_goals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_workspace_branding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at := now(); return new; end;
$$;


ALTER FUNCTION "public"."touch_workspace_branding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_workspace_memory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_workspace_memory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_jobs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workflows_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_workflows_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_api_key"("p_plaintext" "text") RETURNS TABLE("api_key_id" "uuid", "workspace_id" "uuid", "scopes" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_hash text;
  v_id   uuid;
  v_ws   uuid;
  v_sc   text[];
begin
  if p_plaintext is null or p_plaintext = '' then return; end if;
  v_hash := encode(digest(p_plaintext, 'sha256'), 'hex');

  select k.id, k.workspace_id, k.scopes
    into v_id, v_ws, v_sc
    from public.api_keys k
   where k.key_hash    = v_hash
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now())
   limit 1;

  if v_id is null then return; end if;

  -- Best-effort touch (don't fail verification if this update errors).
  begin
    update public.api_keys set last_used_at = now() where id = v_id;
  exception when others then null;
  end;

  api_key_id   := v_id;
  workspace_id := v_ws;
  scopes       := v_sc;
  return next;
end;
$$;


ALTER FUNCTION "public"."verify_api_key"("p_plaintext" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_api_key"("p_plaintext" "text") IS 'Phase 4.1 — Edge-function-only. Hashes plaintext, looks up active api_keys row, returns workspace_id + scopes. Touches last_used_at. Returns 0 rows if key is invalid, expired, or revoked.';



CREATE OR REPLACE FUNCTION "public"."workspace_has_flag"("p_workspace_id" "uuid", "p_flag_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select enabled
       from public.workspace_feature_flags
      where workspace_id = p_workspace_id
        and flag_key = p_flag_key
      limit 1),
    false
  );
$$;


ALTER FUNCTION "public"."workspace_has_flag"("p_workspace_id" "uuid", "p_flag_key" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_feed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "uuid",
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_feed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_credit_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "credits_used" integer NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text"
);


ALTER TABLE "public"."ai_credit_usage" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_credit_usage"."idempotency_key" IS 'Client-supplied key to dedupe retried credit consumption calls. NULL allowed for historical rows only; new writes should populate.';



CREATE TABLE IF NOT EXISTS "public"."ai_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'complete'::"text" NOT NULL,
    "mode" "text" DEFAULT 'analyst'::"text" NOT NULL,
    "tokens_used" integer DEFAULT 0,
    "latency_ms" integer DEFAULT 0,
    "confidence" integer DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "ai_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'ai'::"text", 'system'::"text"]))),
    CONSTRAINT "ai_messages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'streaming'::"text", 'complete'::"text", 'error'::"text", 'aborted'::"text"])))
);


ALTER TABLE "public"."ai_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_proxy_usage" (
    "workspace_id" "uuid" NOT NULL,
    "month_year" "text" NOT NULL,
    "credits_used" integer DEFAULT 0 NOT NULL,
    "call_count" integer DEFAULT 0 NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_proxy_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_rate_limit_buckets" (
    "user_id" "uuid" NOT NULL,
    "bucket_minute" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ai_rate_limit_buckets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "mode" "text" DEFAULT 'analyst'::"text" NOT NULL,
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "business_id" "uuid"
);


ALTER TABLE "public"."ai_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tokens_used" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lead_id" "uuid",
    "action_type" "text" DEFAULT ''::"text",
    "model_name" "text" DEFAULT ''::"text",
    "prompt_name" "text" DEFAULT ''::"text",
    "prompt_version" integer DEFAULT 0
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_usage_logs" IS 'ACTIVELY USED — earlier deprecation comment was inaccurate. Tracks per-user token / action / cost across the platform; written from ClientDashboard, ContentGen, and read by AdminDashboard, AnalyticsPage, MobileHome, and analyticsQueries. ai_credit_usage tracks workspace-scoped credit consumption (different concern). Both coexist; do not drop without migrating writers AND readers.';



CREATE TABLE IF NOT EXISTS "public"."api_idempotency" (
    "workspace_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "api_key_id" "uuid",
    "endpoint" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "response_status" integer NOT NULL,
    "response_body" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL
);


ALTER TABLE "public"."api_idempotency" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_idempotency" IS 'Phase 4 — public API idempotency keys. RLS is enabled with zero policies on purpose: only the service-role api-* edge functions write here, and direct user access would defeat replay protection. Do not add user-facing policies.';



CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "label" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_keys" IS 'Phase 4.1 — Public REST API personal access tokens. Plaintext is never stored; only SHA-256 hash + 8-char prefix. Plaintext returned once at creation via create_api_key().';



CREATE TABLE IF NOT EXISTS "public"."api_rate_limit_buckets" (
    "api_key_id" "uuid" NOT NULL,
    "bucket_minute" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."api_rate_limit_buckets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apollo_import_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "search_log_id" "uuid",
    "total_requested" integer DEFAULT 0 NOT NULL,
    "imported_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "duplicate_details" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apollo_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apollo_search_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "query_params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "results_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apollo_search_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "entity_type" "text",
    "entity_id" "uuid",
    "workspace_id" "uuid" NOT NULL,
    "payload" "jsonb"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "statement" "text" NOT NULL,
    "target_metric" "text" NOT NULL,
    "target_value" numeric NOT NULL,
    "progress_value" numeric DEFAULT 0 NOT NULL,
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "guardrails" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "automation_goals_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'planning'::"text", 'planned'::"text", 'active'::"text", 'running'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."automation_goals" OWNER TO "postgres";


COMMENT ON TABLE "public"."automation_goals" IS 'Phase 6.1 — customer-stated goals. The Planner consumes statement + target_metric/value + guardrails + workspace_memory and emits an automation_plans row. Phase 6.2 will add an executor.';



CREATE TABLE IF NOT EXISTS "public"."automation_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "created_by_kind" "text" DEFAULT 'planner'::"text" NOT NULL,
    "plan" "jsonb" NOT NULL,
    "rationale" "text",
    "model_used" "text",
    "tokens_used" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "superseded_reason" "text",
    CONSTRAINT "automation_plans_created_by_kind_check" CHECK (("created_by_kind" = ANY (ARRAY['planner'::"text", 'replanner'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."automation_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."automation_plans" IS 'Phase 6.1 — versioned plan snapshots. Plan body is JSONB; schema enforced at the TS layer (lib/goals.ts AutomationPlan). One row per (goal_id, version). is_active=true on at most one row per goal at any time.';



CREATE TABLE IF NOT EXISTS "public"."automation_step_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "step_id" "text" NOT NULL,
    "step_kind" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "mode" "text" DEFAULT 'dry_run'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "input_params" "jsonb",
    "output" "jsonb",
    "error" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "not_before" timestamp with time zone,
    CONSTRAINT "automation_step_runs_mode_check" CHECK (("mode" = ANY (ARRAY['dry_run'::"text", 'live'::"text"]))),
    CONSTRAINT "automation_step_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'succeeded'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."automation_step_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."automation_step_runs" IS 'Phase 6.2.a — per-step execution state. Service-role-only writes; the goal-executor edge function is the sole writer. mode=dry_run means the step was simulated (no real side effects); mode=live (Phase 6.2.b) means the primitive was actually invoked.';



CREATE TABLE IF NOT EXISTS "public"."blog_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."blog_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "category_id" "uuid",
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "excerpt" "text",
    "featured_image" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text",
    "seo_settings" "jsonb",
    "ai_metadata" "jsonb",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contributor_id" "uuid",
    "workspace_id" "uuid",
    "business_id" "uuid",
    CONSTRAINT "blog_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."blog_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."business_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "products_services" "text",
    "audience" "text",
    "tone" "text",
    "offers" "text",
    "faqs" "jsonb",
    "objections" "text",
    "competitors" "text",
    "case_studies" "text",
    "sender_name" "text",
    "sender_email" "text",
    "postal_address" "text",
    "confidence" numeric,
    "ai_summary" "text",
    "brand_voice" "text",
    "visual_style_notes" "text",
    "preferred_ctas" "text"[],
    "value_prop" "text",
    "unique_selling_points" "text"[],
    "competitive_advantage" "text",
    "company_story" "text",
    "source_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."business_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "website" "text",
    "industry" "text",
    "description" "text",
    "logo_url" "text",
    "default_tone" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "businesses_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "campaign_kind" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "metric_value" numeric,
    "source" "text",
    "confidence" numeric(3,2) DEFAULT 0.50 NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "embedding_meta" "jsonb",
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_memory_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))
);


ALTER TABLE "public"."campaign_memory" OWNER TO "postgres";


COMMENT ON TABLE "public"."campaign_memory" IS 'Per-campaign outcomes: best-performing subjects, CTAs, send windows, segment fit. Feeds back into future campaign generation.';



CREATE TABLE IF NOT EXISTS "public"."config_settings" (
    "key" "text" NOT NULL,
    "value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."config_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "credits_added" integer NOT NULL,
    "amount_paid_cents" integer NOT NULL,
    "stripe_payment_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credit_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "link_id" "uuid",
    "event_type" "text" NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "is_bot" boolean DEFAULT false,
    "is_apple_privacy" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['open'::"text", 'click'::"text", 'delivered'::"text", 'bounced'::"text", 'unsubscribe'::"text", 'spam_report'::"text"])))
);


ALTER TABLE "public"."email_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "owner_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_message_id" "text",
    "subject" "text",
    "to_email" "text" NOT NULL,
    "from_email" "text",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "track_opens" boolean DEFAULT true NOT NULL,
    "track_clicks" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sequence_id" "uuid",
    "sequence_step" integer,
    "sender_account_id" "uuid",
    "workspace_id" "uuid" NOT NULL,
    "subject_variant" smallint,
    CONSTRAINT "email_messages_provider_check" CHECK (("provider" = ANY (ARRAY['sendgrid'::"text", 'mailchimp'::"text", 'gmail'::"text", 'smtp'::"text", 'manual'::"text"]))),
    CONSTRAINT "email_messages_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'bounced'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."email_messages"."sender_account_id" IS 'Phase 3.1 — set by send-email when Phase 3.2 cutover lands. Joins email_events to a sender for health computation.';



COMMENT ON COLUMN "public"."email_messages"."workspace_id" IS 'Phase 3.5 — canonical workspace scope. Backfilled from leads.workspace_id where possible. New rows should be set explicitly by send-email when Phase 3.2 cutover lands.';



CREATE MATERIALIZED VIEW "public"."email_analytics_summary" AS
 SELECT "em"."owner_id",
    "date"("em"."created_at") AS "analytics_date",
    "count"(DISTINCT "em"."id") AS "total_sent",
    "count"(DISTINCT
        CASE
            WHEN (("ee"."event_type" = 'open'::"text") AND ("ee"."is_bot" = false)) THEN "ee"."message_id"
            ELSE NULL::"uuid"
        END) AS "unique_opens",
    "count"(DISTINCT
        CASE
            WHEN (("ee"."event_type" = 'click'::"text") AND ("ee"."is_bot" = false)) THEN "ee"."message_id"
            ELSE NULL::"uuid"
        END) AS "unique_clicks",
    "count"(
        CASE
            WHEN (("ee"."event_type" = 'open'::"text") AND ("ee"."is_bot" = false)) THEN 1
            ELSE NULL::integer
        END) AS "total_open_events",
    "count"(
        CASE
            WHEN (("ee"."event_type" = 'click'::"text") AND ("ee"."is_bot" = false)) THEN 1
            ELSE NULL::integer
        END) AS "total_click_events"
   FROM ("public"."email_messages" "em"
     LEFT JOIN "public"."email_events" "ee" ON (("em"."id" = "ee"."message_id")))
  GROUP BY "em"."owner_id", ("date"("em"."created_at"))
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."email_analytics_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_dlq" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "sender_account_id" "uuid",
    "message_id" "uuid",
    "to_email" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "reason" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "first_failed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_failed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "email_dlq_kind_check" CHECK (("kind" = ANY (ARRAY['hard_bounce'::"text", 'spam_complaint'::"text", 'rate_limited'::"text", 'provider_error'::"text", 'unsubscribed'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."email_dlq" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_dlq" IS 'Phase 3.1 — dead-letter queue for unrecoverable email failures. Populated by Phase 3.2 send-email when a hard bounce or spam complaint comes in. Inspected from /admin/ops in a future ship.';



CREATE TABLE IF NOT EXISTS "public"."email_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "destination_url" "text" NOT NULL,
    "link_label" "text",
    "link_index" integer DEFAULT 0 NOT NULL,
    "click_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_provider_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "api_key" "text",
    "smtp_host" "text",
    "smtp_port" integer DEFAULT 587,
    "smtp_user" "text",
    "smtp_pass" "text",
    "from_email" "text",
    "from_name" "text",
    "webhook_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_provider_configs_provider_check" CHECK (("provider" = ANY (ARRAY['sendgrid'::"text", 'mailchimp'::"text", 'smtp'::"text", 'gmail'::"text"])))
);


ALTER TABLE "public"."email_provider_configs" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_provider_configs" IS 'Per-user email provider configs (api_key, smtp_pass, webhook_key). Anon SELECT revoked. Authenticated reads scoped by owner RLS.';



CREATE TABLE IF NOT EXISTS "public"."email_sequence_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "lead_count" integer DEFAULT 0 NOT NULL,
    "step_count" integer DEFAULT 0 NOT NULL,
    "items_total" integer DEFAULT 0 NOT NULL,
    "items_done" integer DEFAULT 0 NOT NULL,
    "items_failed" integer DEFAULT 0 NOT NULL,
    "sequence_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "error_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_sequence_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."email_sequence_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "goal" "text",
    "tone" "text" DEFAULT 'professional'::"text",
    "total_leads" integer DEFAULT 0 NOT NULL,
    "total_sent" integer DEFAULT 0 NOT NULL,
    "total_opened" integer DEFAULT 0 NOT NULL,
    "total_clicked" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_personalize" boolean DEFAULT true NOT NULL,
    "send_window_start" smallint,
    "send_window_end" smallint,
    "send_weekdays_only" boolean DEFAULT false NOT NULL,
    "send_timezone" "text",
    "ab_auto_optimize" boolean DEFAULT false NOT NULL,
    "send_best_time" boolean DEFAULT false NOT NULL,
    CONSTRAINT "email_sequences_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."email_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "subject_template" "text" DEFAULT ''::"text" NOT NULL,
    "body_template" "text" DEFAULT ''::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_id" "uuid",
    "business_id" "uuid",
    CONSTRAINT "email_templates_category_check" CHECK (("category" = ANY (ARRAY['welcome'::"text", 'follow_up'::"text", 'case_study'::"text", 'demo_invite'::"text", 'nurture'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_validation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "deliverability" "text",
    "reason" "text",
    "is_disposable" boolean DEFAULT false NOT NULL,
    "is_role" boolean DEFAULT false NOT NULL,
    "is_free" boolean DEFAULT false NOT NULL,
    "score" numeric,
    "provider" "text" DEFAULT 'mails.so'::"text" NOT NULL,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_validation_log_status_check" CHECK (("status" = ANY (ARRAY['valid'::"text", 'invalid'::"text", 'risky'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."email_validation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "deliverability" "text",
    "reason" "text",
    "is_disposable" boolean DEFAULT false NOT NULL,
    "is_role" boolean DEFAULT false NOT NULL,
    "is_free" boolean DEFAULT false NOT NULL,
    "score" numeric,
    "provider" "text" DEFAULT 'mails.so'::"text" NOT NULL,
    "raw_response" "jsonb",
    "validated_by" "uuid",
    "validated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_validations_status_check" CHECK (("status" = ANY (ARRAY['valid'::"text", 'invalid'::"text", 'risky'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."email_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "media_asset_id" "uuid",
    "lead_id" "uuid",
    "created_by" "uuid",
    "kind" "text" NOT NULL,
    "channel" "text",
    "goal" "text",
    "tone" "text",
    "audience" "text",
    "variant" "text",
    "title" "text",
    "preview_text" "text",
    "content" "text",
    "hashtags" "jsonb",
    "cta" "text",
    "metadata" "jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "generated_assets_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'used'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."generated_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_contributors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "status" "text" DEFAULT 'invited'::"text",
    "posts_submitted" integer DEFAULT 0,
    "posts_published" integer DEFAULT 0,
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "guest_contributors_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."guest_contributors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_post_outreach" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "blog_name" "text" NOT NULL,
    "blog_url" "text",
    "contact_name" "text",
    "contact_email" "text",
    "domain_authority" integer,
    "monthly_traffic" "text",
    "status" "text" DEFAULT 'researching'::"text",
    "pitch_subject" "text",
    "pitch_body" "text",
    "notes" "text",
    "target_publish_date" "date",
    "published_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "guest_post_outreach_domain_authority_check" CHECK ((("domain_authority" >= 0) AND ("domain_authority" <= 100))),
    CONSTRAINT "guest_post_outreach_status_check" CHECK (("status" = ANY (ARRAY['researching'::"text", 'pitched'::"text", 'accepted'::"text", 'writing'::"text", 'published'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."guest_post_outreach" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."imap_poll_state" (
    "sender_account_id" "uuid" NOT NULL,
    "uid_validity" bigint,
    "last_uid" bigint DEFAULT 0 NOT NULL,
    "last_polled_at" timestamp with time zone,
    "last_error" "text"
);


ALTER TABLE "public"."imap_poll_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" DEFAULT 'csv'::"text" NOT NULL,
    "total_rows" integer DEFAULT 0 NOT NULL,
    "imported_count" integer DEFAULT 0 NOT NULL,
    "updated_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "skipped_rows" "jsonb" DEFAULT '[]'::"jsonb",
    "column_mapping" "jsonb" DEFAULT '{}'::"jsonb",
    "options" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."import_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "workspace_id" "uuid",
    "lead_id" "uuid",
    "sender_account_id" "uuid",
    "reply_to_message_id" "uuid",
    "from_email" "text" NOT NULL,
    "from_name" "text",
    "to_email" "text",
    "subject" "text",
    "body_text" "text",
    "body_html" "text",
    "message_id" "text",
    "in_reply_to" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inbound_emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'disconnected'::"text" NOT NULL,
    "credentials" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "integrations_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'disconnected'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."integrations" IS 'Per-user / per-workspace third-party integration configs (credentials jsonb). Anon SELECT revoked. Authenticated reads scoped by owner RLS.';



CREATE TABLE IF NOT EXISTS "public"."invoice_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1,
    "unit_price_cents" integer NOT NULL,
    "amount_cents" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_package_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1,
    "unit_price_cents" integer NOT NULL
);


ALTER TABLE "public"."invoice_package_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_invoice_id" "text",
    "invoice_number" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "currency" "text" DEFAULT 'usd'::"text",
    "subtotal_cents" integer DEFAULT 0,
    "total_cents" integer DEFAULT 0,
    "due_date" "date",
    "notes" "text",
    "stripe_hosted_url" "text",
    "stripe_pdf_url" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    "sent_via" "text",
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'paid'::"text", 'void'::"text", 'uncollectible'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_events_level_check" CHECK (("level" = ANY (ARRAY['info'::"text", 'warn'::"text", 'error'::"text"])))
);

ALTER TABLE ONLY "public"."job_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "progress_current" integer DEFAULT 0 NOT NULL,
    "progress_total" integer DEFAULT 0 NOT NULL,
    "result" "jsonb",
    "error" "text",
    "request_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'succeeded'::"text", 'failed'::"text", 'canceled'::"text"]))),
    CONSTRAINT "jobs_type_check" CHECK (("type" = ANY (ARRAY['email_sequence'::"text", 'bulk_import'::"text", 'apollo_import'::"text", 'apollo_search'::"text", 'social_publish'::"text", 'analytics_refresh'::"text", 'lead_enrichment'::"text", 'invoice_send'::"text", 'integration_validate'::"text"])))
);

ALTER TABLE ONLY "public"."jobs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "outcome" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "call_sid" "text",
    "direction" "text" DEFAULT 'outbound'::"text" NOT NULL,
    "phone_number" "text",
    "duration_seconds" integer,
    "recording_url" "text",
    "status" "text"
);


ALTER TABLE "public"."lead_call_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_color_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "color_token" "text" NOT NULL
);


ALTER TABLE "public"."lead_color_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_enrichment_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "label" "text",
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_enrichment_jobs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'done'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."lead_enrichment_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "title" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "source" "text",
    "confidence" numeric(3,2) DEFAULT 0.50 NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "embedding_meta" "jsonb",
    "occurred_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_memory_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))
);


ALTER TABLE "public"."lead_memory" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_memory" IS 'Per-lead context the AI can recall: prior interactions, objections, interests, sentiment.';



CREATE TABLE IF NOT EXISTS "public"."lead_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_ai_generated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_research_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "knowledge_base_id" "uuid",
    "company_summary" "text",
    "industry" "text",
    "target_customer" "text",
    "estimated_company_size" "text",
    "likely_decision_maker" "text",
    "possible_needs" "text",
    "pain_points" "text",
    "buying_triggers" "text",
    "objections" "text",
    "suggested_offer" "text",
    "suggested_pitch_angle" "text",
    "recommended_email_angle" "text",
    "recommended_call_angle" "text",
    "recommended_social_angle" "text",
    "best_channel" "text",
    "urgency" "text",
    "confidence" numeric,
    "sources" "jsonb",
    "missing_info" "jsonb",
    "researched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "researched_by" "uuid",
    "status" "text" DEFAULT 'complete'::"text" NOT NULL,
    CONSTRAINT "lead_research_profiles_status_check" CHECK (("status" = ANY (ARRAY['complete'::"text", 'partial'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."lead_research_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "total_score" integer DEFAULT 0 NOT NULL,
    "fit_score" integer DEFAULT 0 NOT NULL,
    "intent_score" integer DEFAULT 0 NOT NULL,
    "engagement_score" integer DEFAULT 0 NOT NULL,
    "data_quality_score" integer DEFAULT 0 NOT NULL,
    "deliverability_score" integer DEFAULT 0 NOT NULL,
    "urgency_score" integer DEFAULT 0 NOT NULL,
    "risk_score" integer DEFAULT 0 NOT NULL,
    "confidence" numeric,
    "reason_summary" "text",
    "scoring_inputs" "jsonb",
    "last_calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_stage_colors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "color_token" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_stage_colors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_tag_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_tag_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "uploaded_by" "uuid",
    "file_url" "text" NOT NULL,
    "file_type" "text",
    "title" "text",
    "description" "text",
    "ai_image_summary" "text",
    "detected_objects" "jsonb",
    "detected_style" "text",
    "detected_product" "text",
    "mood" "text",
    "suggested_use_cases" "jsonb",
    "suggested_campaign_angle" "text",
    "suggested_audience" "text",
    "suggested_cta" "text",
    "suggested_channels" "jsonb",
    "analyzed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "link" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" "text" DEFAULT '$0'::"text" NOT NULL,
    "credits" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "features" "text"[] DEFAULT '{}'::"text"[],
    "key" "text",
    "price_monthly_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "stripe_price_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_price_id_annual" "text"
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plans"."credits" IS 'DEPRECATED (redundant with limits->>''aiCredits''). Kept for compatibility with older client code. Prefer plans.limits on all reads. To be dropped once lib/plans.ts is narrowed to a single source of truth.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'CLIENT'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "plan" "text" DEFAULT 'Starter'::"text",
    "credits_total" integer DEFAULT 100,
    "credits_used" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "businessProfile" "jsonb",
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "ui_preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "stripe_customer_id" "text",
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "onboarding_role" "text",
    "onboarding_team_size" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['ADMIN'::"text", 'CLIENT'::"text", 'GUEST'::"text"]))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."created_at" IS 'Row-creation timestamp. The legacy camelCase "createdAt" column was dropped 2026-05-15.';



COMMENT ON COLUMN "public"."profiles"."businessProfile" IS 'Full BusinessProfile object (see AuraEngine/types.ts:50). Keys: companyName, industry, companyWebsite, businessDescription, productsServices, targetAudience, valueProp, pricingModel, salesApproach, services[], pricingTiers[], uniqueSellingPoints[], socialLinks{linkedin,twitter,instagram,facebook}, phone, businessEmail, address, logoUrl, + deep-analysis fields. Feeds AI prompt resolution.';



CREATE TABLE IF NOT EXISTS "public"."scheduled_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "to_email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "html_body" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "block_index" integer DEFAULT 0 NOT NULL,
    "sequence_id" "text",
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "from_email" "text",
    "provider" "text",
    CONSTRAINT "scheduled_emails_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."scheduled_emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sender_account_secrets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_account_id" "uuid" NOT NULL,
    "oauth_access_token" "text",
    "oauth_refresh_token" "text",
    "oauth_expires_at" timestamp with time zone,
    "smtp_host" "text",
    "smtp_port" integer DEFAULT 587,
    "smtp_user" "text",
    "smtp_pass" "text",
    "api_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sender_account_secrets" OWNER TO "postgres";


COMMENT ON TABLE "public"."sender_account_secrets" IS 'Per-user sender account secrets (api_key, oauth_access_token, oauth_refresh_token, smtp_pass). Anon SELECT revoked — only service-role and authenticated paths read this. RLS still enforces per-user scoping for authenticated readers.';



CREATE TABLE IF NOT EXISTS "public"."sender_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "from_email" "text" NOT NULL,
    "from_name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "use_for_outreach" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "daily_sent_today" integer DEFAULT 0 NOT NULL,
    "daily_sent_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "warmup_enabled" boolean DEFAULT false NOT NULL,
    "warmup_daily_sent" integer DEFAULT 0 NOT NULL,
    "last_health_check_at" timestamp with time zone,
    "health_score" integer DEFAULT 100,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bounce_rate_7d" numeric(5,4) DEFAULT 0 NOT NULL,
    "complaint_rate_7d" numeric(5,4) DEFAULT 0 NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "sender_accounts_provider_check" CHECK (("provider" = ANY (ARRAY['gmail'::"text", 'smtp'::"text", 'sendgrid'::"text", 'mailchimp'::"text"]))),
    CONSTRAINT "sender_accounts_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'needs_reauth'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."sender_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sender_accounts"."bounce_rate_7d" IS 'Rolling 7-day bounce rate (bounces / sent), refreshed by cron-driven compute_sender_health.';



COMMENT ON COLUMN "public"."sender_accounts"."complaint_rate_7d" IS 'Rolling 7-day spam-complaint rate (spam_report events / sent).';



COMMENT ON COLUMN "public"."sender_accounts"."consecutive_failures" IS 'Reset to 0 on successful send. Incremented on send-time failures. Used to circuit-break a flapping sender.';



CREATE TABLE IF NOT EXISTS "public"."sequence_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "current_step" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "next_send_at" timestamp with time zone,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "sequence_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'completed'::"text", 'bounced'::"text", 'unsubscribed'::"text"])))
);


ALTER TABLE "public"."sequence_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sequence_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "delay_days" integer DEFAULT 0 NOT NULL,
    "is_ai_generated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject_variants" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "body_variants" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."sequence_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "meta_page_id" "text",
    "meta_page_name" "text",
    "meta_page_access_token_encrypted" "text",
    "meta_ig_user_id" "text",
    "meta_ig_username" "text",
    "linkedin_member_urn" "text",
    "linkedin_org_urn" "text",
    "linkedin_org_name" "text",
    "linkedin_access_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "social_accounts_provider_check" CHECK (("provider" = ANY (ARRAY['meta'::"text", 'linkedin'::"text"])))
);


ALTER TABLE "public"."social_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."social_accounts" IS 'Per-user connected social accounts with encrypted OAuth tokens. Anon SELECT revoked. Authenticated reads scoped by user_id RLS.';



CREATE TABLE IF NOT EXISTS "public"."social_post_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "target_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "social_post_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['scheduled'::"text", 'started'::"text", 'published'::"text", 'failed'::"text", 'retry'::"text"])))
);


ALTER TABLE "public"."social_post_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_post_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "target_label" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "remote_post_id" "text",
    "error_code" "text",
    "error_message" "text",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "social_post_targets_channel_check" CHECK (("channel" = ANY (ARRAY['facebook_page'::"text", 'instagram'::"text", 'linkedin_member'::"text", 'linkedin_org'::"text"]))),
    CONSTRAINT "social_post_targets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'scheduled'::"text", 'processing'::"text", 'published'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."social_post_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content_text" "text" NOT NULL,
    "link_url" "text",
    "media_paths" "jsonb",
    "scheduled_at" timestamp with time zone,
    "timezone" "text" DEFAULT 'Asia/Karachi'::"text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    "business_id" "uuid",
    CONSTRAINT "social_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."social_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_name" "text" DEFAULT 'Starter'::"text",
    "plan" "text" DEFAULT 'Starter'::"text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "billing_interval" "text" DEFAULT 'monthly'::"text",
    "cancel_at_period_end" boolean DEFAULT false,
    "current_period_start" timestamp with time zone,
    "workspace_id" "uuid" NOT NULL,
    "seats_included" integer DEFAULT 1 NOT NULL,
    "seats_extra" integer DEFAULT 0 NOT NULL,
    "credits_total" integer DEFAULT 100 NOT NULL,
    "credits_used" integer DEFAULT 0 NOT NULL,
    "credits_reset_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "trial_ends_at" timestamp with time zone,
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscriptions" IS 'Stripe subscription rows (stripe_customer_id, stripe_subscription_id). Anon SELECT revoked. Joined via subscription:subscriptions(*) in fetchProfile / pollForProfile — both run authenticated.';



CREATE TABLE IF NOT EXISTS "public"."support_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "admin_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."support_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "access_level" "text" DEFAULT 'read_only'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval) NOT NULL,
    "ended_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_sessions_access_level_check" CHECK (("access_level" = ANY (ARRAY['read_only'::"text", 'debug'::"text"])))
);


ALTER TABLE "public"."support_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suppressions_reason_check" CHECK (("reason" = ANY (ARRAY['unsub'::"text", 'bounce'::"text", 'complaint'::"text", 'manual'::"text", 'invalid'::"text"])))
);


ALTER TABLE "public"."suppressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "name" "text",
    CONSTRAINT "team_invites_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "team_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."team_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "card_color" "text",
    CONSTRAINT "team_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "card_id" "uuid",
    "actor_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "meta_json" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teamhub_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Untitled Board'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid"
);


ALTER TABLE "public"."teamhub_boards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_card_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."teamhub_card_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "list_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "due_date" "date",
    "priority" "text",
    "labels" "jsonb" DEFAULT '[]'::"jsonb",
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teamhub_cards_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."teamhub_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teamhub_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_flow_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teamhub_flow_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."teamhub_flow_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_flow_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'system'::"text" NOT NULL,
    "structure_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "teamhub_flow_templates_type_check" CHECK (("type" = ANY (ARRAY['system'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."teamhub_flow_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teamhub_invites_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "teamhub_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."teamhub_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_item_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teamhub_item_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teamhub_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Untitled List'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teamhub_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracking_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "link_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "referrer" "text",
    "user_agent" "text",
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tracking_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracking_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid",
    "slug" "text" NOT NULL,
    "destination_url" "text" NOT NULL,
    "channel" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "original_url" "text",
    "short_code" "text",
    "click_count" integer DEFAULT 0
);


ALTER TABLE "public"."tracking_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_event_id" "text" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "sender_account_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['email_sent'::"text", 'linkedin_action'::"text", 'ai_credit'::"text", 'warmup_sent'::"text"])))
);


ALTER TABLE "public"."usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_prompt_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt_id" "uuid" NOT NULL,
    "owner_id" "uuid",
    "version" integer NOT NULL,
    "system_instruction" "text" DEFAULT ''::"text" NOT NULL,
    "prompt_template" "text" DEFAULT ''::"text" NOT NULL,
    "temperature" real DEFAULT 0.7 NOT NULL,
    "top_p" real DEFAULT 0.9 NOT NULL,
    "change_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_prompt_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "prompt_key" "text" NOT NULL,
    "category" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "system_instruction" "text" DEFAULT ''::"text" NOT NULL,
    "prompt_template" "text" DEFAULT ''::"text" NOT NULL,
    "temperature" real DEFAULT 0.7 NOT NULL,
    "top_p" real DEFAULT 0.9 NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "last_tested_at" timestamp with time zone,
    "test_result" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_prompts_category_check" CHECK (("category" = ANY (ARRAY['sales_outreach'::"text", 'analytics'::"text", 'email'::"text", 'content'::"text", 'lead_research'::"text", 'blog'::"text", 'social'::"text", 'automation'::"text", 'strategy'::"text"])))
);


ALTER TABLE "public"."user_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voip_inbound_routes" (
    "user_id" "uuid" NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."voip_inbound_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "endpoint_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_status_code" integer,
    "last_error" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "succeeded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_deliveries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."webhook_deliveries" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_deliveries" IS 'Phase 4.3 — one row per (event × endpoint). Dispatcher processes status=pending where next_attempt_at <= now(). Backoff: 1m, 5m, 30m, 2h, 12h. After 5 failures, status=dead.';



CREATE TABLE IF NOT EXISTS "public"."webhook_endpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "url" "text" NOT NULL,
    "secret" "text" NOT NULL,
    "description" "text",
    "event_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "disabled_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_endpoints_url_https" CHECK (("url" ~* '^https://'::"text"))
);


ALTER TABLE "public"."webhook_endpoints" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_endpoints" IS 'Phase 4.3 — customer-registered outbound webhooks. Secret is HMAC-SHA256 key for X-Scaliyo-Signature header.';



CREATE TABLE IF NOT EXISTS "public"."workflow_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "current_node" "text",
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "error_message" "text",
    CONSTRAINT "workflow_executions_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."workflow_executions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "name" "text" DEFAULT 'Untitled Workflow'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "nodes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "stats" "jsonb" DEFAULT '{"roi": 0, "timeSavedHrs": 0, "conversionRate": 0, "leadsProcessed": 0}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workflows_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'draft'::"text"])))
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_ai_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "month_year" "text" NOT NULL,
    "credits_used" integer DEFAULT 0 NOT NULL,
    "tokens_used" bigint DEFAULT 0 NOT NULL,
    "credits_limit" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workspace_ai_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_branding" (
    "workspace_id" "uuid" NOT NULL,
    "logo_url" "text",
    "favicon_url" "text",
    "email_logo_url" "text",
    "primary_color" "text",
    "accent_color" "text",
    "background_color" "text",
    "product_name" "text",
    "support_email" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_branding_accent_color_check" CHECK ((("accent_color" IS NULL) OR ("accent_color" ~ '^#[0-9A-Fa-f]{6}$'::"text"))),
    CONSTRAINT "workspace_branding_background_color_check" CHECK ((("background_color" IS NULL) OR ("background_color" ~ '^#[0-9A-Fa-f]{6}$'::"text"))),
    CONSTRAINT "workspace_branding_primary_color_check" CHECK ((("primary_color" IS NULL) OR ("primary_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")))
);


ALTER TABLE "public"."workspace_branding" OWNER TO "postgres";


COMMENT ON TABLE "public"."workspace_branding" IS 'Phase 4.6.a — per-workspace theme overrides. SPA reads this row at boot and injects as CSS variables. Vanity domain (4.6.b) is separate.';



CREATE TABLE IF NOT EXISTS "public"."workspace_entitlements" (
    "workspace_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "effective_limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_feature_flags" (
    "workspace_id" "uuid" NOT NULL,
    "flag_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "set_by" "uuid",
    "set_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_feature_flags" OWNER TO "postgres";


COMMENT ON TABLE "public"."workspace_feature_flags" IS 'Phase 6.2.b — per-workspace feature flag toggles. Known flag_keys: goal_executor_live, goal_executor_send_email, goal_executor_send_social. Missing rows default to disabled.';



CREATE TABLE IF NOT EXISTS "public"."workspace_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."workspace_role" DEFAULT 'member'::"public"."workspace_role" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."workspace_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."workspace_role" DEFAULT 'member'::"public"."workspace_role" NOT NULL,
    "invited_by" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "key" "text",
    "value" "jsonb" NOT NULL,
    "source" "text",
    "confidence" numeric(3,2) DEFAULT 0.50 NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "embedding_meta" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "workspace_memory_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))
);


ALTER TABLE "public"."workspace_memory" OWNER TO "postgres";


COMMENT ON TABLE "public"."workspace_memory" IS 'Persistent AI memory at workspace scope. Tone, preferences, USPs, winning patterns. Read on every Gemini call to prime the system prompt.';



CREATE TABLE IF NOT EXISTS "public"."workspace_usage_counters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "date_key" "date" NOT NULL,
    "month_key" "text" NOT NULL,
    "emails_sent" integer DEFAULT 0 NOT NULL,
    "linkedin_actions" integer DEFAULT 0 NOT NULL,
    "ai_credits_used" integer DEFAULT 0 NOT NULL,
    "warmup_emails_sent" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_usage_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'My Workspace'::"text" NOT NULL,
    "slug" "text",
    "owner_id" "uuid" NOT NULL,
    "plan_tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_name" "text",
    "website" "text",
    "industry" "text",
    "description" "text",
    "logo_url" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_credit_usage"
    ADD CONSTRAINT "ai_credit_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_proxy_usage"
    ADD CONSTRAINT "ai_proxy_usage_pkey" PRIMARY KEY ("workspace_id", "month_year");



ALTER TABLE ONLY "public"."ai_rate_limit_buckets"
    ADD CONSTRAINT "ai_rate_limit_buckets_pkey" PRIMARY KEY ("user_id", "bucket_minute");



ALTER TABLE ONLY "public"."ai_threads"
    ADD CONSTRAINT "ai_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_idempotency"
    ADD CONSTRAINT "api_idempotency_pkey" PRIMARY KEY ("workspace_id", "key");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_rate_limit_buckets"
    ADD CONSTRAINT "api_rate_limit_buckets_pkey" PRIMARY KEY ("api_key_id", "bucket_minute");



ALTER TABLE ONLY "public"."apollo_import_logs"
    ADD CONSTRAINT "apollo_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apollo_search_logs"
    ADD CONSTRAINT "apollo_search_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_goals"
    ADD CONSTRAINT "automation_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_plans"
    ADD CONSTRAINT "automation_plans_goal_id_version_key" UNIQUE ("goal_id", "version");



ALTER TABLE ONLY "public"."automation_plans"
    ADD CONSTRAINT "automation_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_step_runs"
    ADD CONSTRAINT "automation_step_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_step_runs"
    ADD CONSTRAINT "automation_step_runs_plan_id_step_id_attempt_count_key" UNIQUE ("plan_id", "step_id", "attempt_count");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_business_id_user_id_key" UNIQUE ("business_id", "user_id");



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_business_id_key" UNIQUE ("business_id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_memory"
    ADD CONSTRAINT "campaign_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config_settings"
    ADD CONSTRAINT "config_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."credit_purchases"
    ADD CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_dlq"
    ADD CONSTRAINT "email_dlq_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_links"
    ADD CONSTRAINT "email_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_provider_configs"
    ADD CONSTRAINT "email_provider_configs_owner_id_provider_key" UNIQUE ("owner_id", "provider");



ALTER TABLE ONLY "public"."email_provider_configs"
    ADD CONSTRAINT "email_provider_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sequence_run_items"
    ADD CONSTRAINT "email_sequence_run_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sequence_runs"
    ADD CONSTRAINT "email_sequence_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sequences"
    ADD CONSTRAINT "email_sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_validation_log"
    ADD CONSTRAINT "email_validation_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_validations"
    ADD CONSTRAINT "email_validations_business_id_email_key" UNIQUE ("business_id", "email");



ALTER TABLE ONLY "public"."email_validations"
    ADD CONSTRAINT "email_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_contributors"
    ADD CONSTRAINT "guest_contributors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_post_outreach"
    ADD CONSTRAINT "guest_post_outreach_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."imap_poll_state"
    ADD CONSTRAINT "imap_poll_state_pkey" PRIMARY KEY ("sender_account_id");



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_owner_id_provider_key" UNIQUE ("owner_id", "provider");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_package_items"
    ADD CONSTRAINT "invoice_package_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_packages"
    ADD CONSTRAINT "invoice_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_call_logs"
    ADD CONSTRAINT "lead_call_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_color_overrides"
    ADD CONSTRAINT "lead_color_overrides_owner_id_lead_id_key" UNIQUE ("owner_id", "lead_id");



ALTER TABLE ONLY "public"."lead_color_overrides"
    ADD CONSTRAINT "lead_color_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_enrichment_jobs"
    ADD CONSTRAINT "lead_enrichment_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_meetings"
    ADD CONSTRAINT "lead_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_memory"
    ADD CONSTRAINT "lead_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_research_profiles"
    ADD CONSTRAINT "lead_research_profiles_lead_id_key" UNIQUE ("lead_id");



ALTER TABLE ONLY "public"."lead_research_profiles"
    ADD CONSTRAINT "lead_research_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "lead_scores_lead_id_key" UNIQUE ("lead_id");



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_stage_colors"
    ADD CONSTRAINT "lead_stage_colors_owner_id_stage_key" UNIQUE ("owner_id", "stage");



ALTER TABLE ONLY "public"."lead_stage_colors"
    ADD CONSTRAINT "lead_stage_colors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_lead_id_tag_id_key" UNIQUE ("lead_id", "tag_id");



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_emails"
    ADD CONSTRAINT "scheduled_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sender_account_secrets"
    ADD CONSTRAINT "sender_account_secrets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sender_account_secrets"
    ADD CONSTRAINT "sender_account_secrets_sender_account_id_key" UNIQUE ("sender_account_id");



ALTER TABLE ONLY "public"."sender_accounts"
    ADD CONSTRAINT "sender_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_sequence_id_lead_id_key" UNIQUE ("sequence_id", "lead_id");



ALTER TABLE ONLY "public"."sequence_steps"
    ADD CONSTRAINT "sequence_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sequence_steps"
    ADD CONSTRAINT "sequence_steps_sequence_id_step_number_key" UNIQUE ("sequence_id", "step_number");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_post_events"
    ADD CONSTRAINT "social_post_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_post_targets"
    ADD CONSTRAINT "social_post_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."support_audit_logs"
    ADD CONSTRAINT "support_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_sessions"
    ADD CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppressions"
    ADD CONSTRAINT "suppressions_owner_id_email_key" UNIQUE ("owner_id", "email");



ALTER TABLE ONLY "public"."suppressions"
    ADD CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_workspace_id_name_key" UNIQUE ("workspace_id", "name");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_team_id_email_key" UNIQUE ("team_id", "email");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."teamhub_activity"
    ADD CONSTRAINT "teamhub_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_boards"
    ADD CONSTRAINT "teamhub_boards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_card_members"
    ADD CONSTRAINT "teamhub_card_members_card_id_user_id_key" UNIQUE ("card_id", "user_id");



ALTER TABLE ONLY "public"."teamhub_card_members"
    ADD CONSTRAINT "teamhub_card_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_cards"
    ADD CONSTRAINT "teamhub_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_comments"
    ADD CONSTRAINT "teamhub_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_flow_members"
    ADD CONSTRAINT "teamhub_flow_members_board_id_user_id_key" UNIQUE ("board_id", "user_id");



ALTER TABLE ONLY "public"."teamhub_flow_members"
    ADD CONSTRAINT "teamhub_flow_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_flow_templates"
    ADD CONSTRAINT "teamhub_flow_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_invites"
    ADD CONSTRAINT "teamhub_invites_board_id_email_key" UNIQUE ("board_id", "email");



ALTER TABLE ONLY "public"."teamhub_invites"
    ADD CONSTRAINT "teamhub_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_item_leads"
    ADD CONSTRAINT "teamhub_item_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teamhub_lists"
    ADD CONSTRAINT "teamhub_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracking_events"
    ADD CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracking_links"
    ADD CONSTRAINT "tracking_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracking_links"
    ADD CONSTRAINT "tracking_links_short_code_key" UNIQUE ("short_code");



ALTER TABLE ONLY "public"."tracking_links"
    ADD CONSTRAINT "tracking_links_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_source_event_id_key" UNIQUE ("source_event_id");



ALTER TABLE ONLY "public"."user_prompt_versions"
    ADD CONSTRAINT "user_prompt_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_prompts"
    ADD CONSTRAINT "user_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voip_inbound_routes"
    ADD CONSTRAINT "voip_inbound_routes_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_ai_usage"
    ADD CONSTRAINT "workspace_ai_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_ai_usage"
    ADD CONSTRAINT "workspace_ai_usage_unique" UNIQUE ("workspace_id", "month_year");



ALTER TABLE ONLY "public"."workspace_branding"
    ADD CONSTRAINT "workspace_branding_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspace_domains"
    ADD CONSTRAINT "workspace_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_entitlements"
    ADD CONSTRAINT "workspace_entitlements_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspace_feature_flags"
    ADD CONSTRAINT "workspace_feature_flags_pkey" PRIMARY KEY ("workspace_id", "flag_key");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_workspace_id_email_key" UNIQUE ("workspace_id", "email");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspace_memory"
    ADD CONSTRAINT "workspace_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_usage_counters"
    ADD CONSTRAINT "workspace_usage_counters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_usage_counters"
    ADD CONSTRAINT "workspace_usage_counters_unique" UNIQUE ("workspace_id", "date_key");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_slug_key" UNIQUE ("slug");



CREATE UNIQUE INDEX "email_analytics_summary_owner_id_analytics_date_idx" ON "public"."email_analytics_summary" USING "btree" ("owner_id", "analytics_date");



CREATE INDEX "idx_activity_workspace" ON "public"."activity_feed" USING "btree" ("workspace_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_ai_credit_usage_idempotency_key" ON "public"."ai_credit_usage" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_ai_credit_usage_operation" ON "public"."ai_credit_usage" USING "btree" ("operation");



CREATE INDEX "idx_ai_credit_usage_workspace" ON "public"."ai_credit_usage" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_ai_messages_streaming" ON "public"."ai_messages" USING "btree" ("status") WHERE ("status" = 'streaming'::"text");



CREATE INDEX "idx_ai_messages_thread" ON "public"."ai_messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "idx_ai_messages_workspace" ON "public"."ai_messages" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_ai_rate_limit_purge" ON "public"."ai_rate_limit_buckets" USING "btree" ("bucket_minute");



CREATE INDEX "idx_ai_threads_business" ON "public"."ai_threads" USING "btree" ("business_id");



CREATE INDEX "idx_ai_threads_workspace" ON "public"."ai_threads" USING "btree" ("workspace_id", "updated_at" DESC);



CREATE INDEX "idx_ai_usage_logs_user_id" ON "public"."ai_usage_logs" USING "btree" ("user_id");



CREATE INDEX "idx_api_idempotency_purge" ON "public"."api_idempotency" USING "btree" ("expires_at");



CREATE INDEX "idx_api_keys_active" ON "public"."api_keys" USING "btree" ("workspace_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_api_keys_workspace" ON "public"."api_keys" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_api_rate_limit_purge" ON "public"."api_rate_limit_buckets" USING "btree" ("bucket_minute");



CREATE INDEX "idx_apollo_import_logs_search_log_id" ON "public"."apollo_import_logs" USING "btree" ("search_log_id");



CREATE INDEX "idx_apollo_import_logs_user_id" ON "public"."apollo_import_logs" USING "btree" ("user_id");



CREATE INDEX "idx_apollo_search_logs_user_id" ON "public"."apollo_search_logs" USING "btree" ("user_id");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_logs_user_created" ON "public"."audit_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_workspace" ON "public"."audit_logs" USING "btree" ("workspace_id");



CREATE INDEX "idx_automation_goals_created_by" ON "public"."automation_goals" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_automation_goals_workspace_status" ON "public"."automation_goals" USING "btree" ("workspace_id", "status", "created_at" DESC);



CREATE INDEX "idx_automation_plans_goal_active" ON "public"."automation_plans" USING "btree" ("goal_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_automation_plans_workspace" ON "public"."automation_plans" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_automation_step_runs_goal_status" ON "public"."automation_step_runs" USING "btree" ("goal_id", "status");



CREATE INDEX "idx_automation_step_runs_resumable" ON "public"."automation_step_runs" USING "btree" ("not_before") WHERE (("status" = 'pending'::"text") AND ("not_before" IS NOT NULL));



CREATE INDEX "idx_automation_step_runs_workspace_recent" ON "public"."automation_step_runs" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_blog_posts_author_created" ON "public"."blog_posts" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_blog_posts_business" ON "public"."blog_posts" USING "btree" ("business_id");



CREATE INDEX "idx_blog_posts_contributor" ON "public"."blog_posts" USING "btree" ("contributor_id");



CREATE INDEX "idx_blog_posts_status" ON "public"."blog_posts" USING "btree" ("status");



CREATE INDEX "idx_business_members_user" ON "public"."business_members" USING "btree" ("user_id");



CREATE INDEX "idx_businesses_workspace" ON "public"."businesses" USING "btree" ("workspace_id");



CREATE INDEX "idx_campaign_memory_campaign" ON "public"."campaign_memory" USING "btree" ("campaign_kind", "campaign_id", "observed_at" DESC);



CREATE INDEX "idx_campaign_memory_tags" ON "public"."campaign_memory" USING "gin" ("tags");



CREATE INDEX "idx_campaign_memory_workspace_kind" ON "public"."campaign_memory" USING "btree" ("workspace_id", "kind");



CREATE INDEX "idx_credit_purchases_workspace" ON "public"."credit_purchases" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_email_dlq_message" ON "public"."email_dlq" USING "btree" ("message_id");



CREATE INDEX "idx_email_dlq_sender" ON "public"."email_dlq" USING "btree" ("sender_account_id", "last_failed_at" DESC) WHERE ("sender_account_id" IS NOT NULL);



CREATE INDEX "idx_email_dlq_workspace_kind" ON "public"."email_dlq" USING "btree" ("workspace_id", "kind", "last_failed_at" DESC);



CREATE INDEX "idx_email_events_created" ON "public"."email_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_email_events_link_id" ON "public"."email_events" USING "btree" ("link_id");



CREATE INDEX "idx_email_events_msg_bot_type_ts" ON "public"."email_events" USING "btree" ("message_id", "is_bot", "event_type", "created_at");



CREATE INDEX "idx_email_links_message_clicks" ON "public"."email_links" USING "btree" ("message_id", "click_count" DESC);



CREATE INDEX "idx_email_messages_lead_created" ON "public"."email_messages" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_email_messages_owner_created" ON "public"."email_messages" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_email_messages_provider_msg" ON "public"."email_messages" USING "btree" ("provider_message_id");



CREATE INDEX "idx_email_messages_sender_account_created" ON "public"."email_messages" USING "btree" ("sender_account_id", "created_at" DESC) WHERE ("sender_account_id" IS NOT NULL);



CREATE INDEX "idx_email_messages_seq" ON "public"."email_messages" USING "btree" ("sequence_id", "sequence_step") WHERE ("sequence_id" IS NOT NULL);



CREATE INDEX "idx_email_messages_sequence_id" ON "public"."email_messages" USING "btree" ("sequence_id") WHERE ("sequence_id" IS NOT NULL);



CREATE INDEX "idx_email_messages_workspace_created" ON "public"."email_messages" USING "btree" ("workspace_id", "created_at" DESC) WHERE ("workspace_id" IS NOT NULL);



CREATE INDEX "idx_email_sequence_run_items_lead" ON "public"."email_sequence_run_items" USING "btree" ("lead_id");



CREATE INDEX "idx_email_sequence_runs_workspace" ON "public"."email_sequence_runs" USING "btree" ("workspace_id");



CREATE INDEX "idx_email_templates_business" ON "public"."email_templates" USING "btree" ("business_id");



CREATE INDEX "idx_email_templates_category" ON "public"."email_templates" USING "btree" ("category");



CREATE INDEX "idx_email_templates_owner" ON "public"."email_templates" USING "btree" ("owner_id");



CREATE INDEX "idx_email_validation_log_lookup" ON "public"."email_validation_log" USING "btree" ("business_id", "lower"("email"), "validated_at" DESC);



CREATE INDEX "idx_email_validations_lookup" ON "public"."email_validations" USING "btree" ("business_id", "lower"("email"));



CREATE INDEX "idx_enrollments_next" ON "public"."sequence_enrollments" USING "btree" ("next_send_at") WHERE (("status" = 'active'::"text") AND ("next_send_at" IS NOT NULL));



CREATE INDEX "idx_enrollments_workspace" ON "public"."sequence_enrollments" USING "btree" ("workspace_id");



CREATE INDEX "idx_entitlements_plan" ON "public"."workspace_entitlements" USING "btree" ("plan_id");



CREATE INDEX "idx_esr_owner" ON "public"."email_sequence_runs" USING "btree" ("owner_id");



CREATE INDEX "idx_esr_status" ON "public"."email_sequence_runs" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "idx_esri_pending" ON "public"."email_sequence_run_items" USING "btree" ("status", "locked_until") WHERE ("status" = ANY (ARRAY['pending'::"text", 'writing'::"text"]));



CREATE INDEX "idx_esri_run_status" ON "public"."email_sequence_run_items" USING "btree" ("run_id", "status");



CREATE INDEX "idx_feature_flags_enabled" ON "public"."feature_flags" USING "btree" ("enabled");



CREATE INDEX "idx_generated_assets_business" ON "public"."generated_assets" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "idx_generated_assets_media" ON "public"."generated_assets" USING "btree" ("media_asset_id");



CREATE INDEX "idx_guest_contributors_status" ON "public"."guest_contributors" USING "btree" ("user_id", "status");



CREATE INDEX "idx_guest_post_outreach_status" ON "public"."guest_post_outreach" USING "btree" ("user_id", "status");



CREATE INDEX "idx_import_batches_workspace" ON "public"."import_batches" USING "btree" ("workspace_id");



CREATE INDEX "idx_inbound_emails_lead" ON "public"."inbound_emails" USING "btree" ("lead_id", "received_at" DESC);



CREATE INDEX "idx_inbound_emails_owner" ON "public"."inbound_emails" USING "btree" ("owner_id", "received_at" DESC);



CREATE INDEX "idx_inbound_emails_unread" ON "public"."inbound_emails" USING "btree" ("owner_id") WHERE (NOT "is_read");



CREATE INDEX "idx_invoice_line_items_invoice" ON "public"."invoice_line_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_package_items_package" ON "public"."invoice_package_items" USING "btree" ("package_id");



CREATE INDEX "idx_invoice_packages_owner" ON "public"."invoice_packages" USING "btree" ("owner_id");



CREATE INDEX "idx_invoices_lead" ON "public"."invoices" USING "btree" ("lead_id");



CREATE INDEX "idx_invoices_owner" ON "public"."invoices" USING "btree" ("owner_id");



CREATE INDEX "idx_invoices_stripe_invoice" ON "public"."invoices" USING "btree" ("stripe_invoice_id");



CREATE UNIQUE INDEX "idx_item_leads_active_item" ON "public"."teamhub_item_leads" USING "btree" ("item_id") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "idx_item_leads_active_lead" ON "public"."teamhub_item_leads" USING "btree" ("lead_id") WHERE ("is_active" = true);



CREATE INDEX "idx_item_leads_item" ON "public"."teamhub_item_leads" USING "btree" ("item_id");



CREATE INDEX "idx_item_leads_lead" ON "public"."teamhub_item_leads" USING "btree" ("lead_id");



CREATE INDEX "idx_job_events_created" ON "public"."job_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_job_events_job_id" ON "public"."job_events" USING "btree" ("job_id");



CREATE INDEX "idx_jobs_created" ON "public"."jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_jobs_request_id" ON "public"."jobs" USING "btree" ("request_id") WHERE ("request_id" IS NOT NULL);



CREATE INDEX "idx_jobs_type_status" ON "public"."jobs" USING "btree" ("type", "status");



CREATE INDEX "idx_jobs_workspace_status" ON "public"."jobs" USING "btree" ("workspace_id", "status");



CREATE INDEX "idx_lead_call_logs_call_sid" ON "public"."lead_call_logs" USING "btree" ("call_sid") WHERE ("call_sid" IS NOT NULL);



CREATE INDEX "idx_lead_call_logs_lead" ON "public"."lead_call_logs" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_lead_enrichment_jobs_lead" ON "public"."lead_enrichment_jobs" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_enrichment_jobs_owner" ON "public"."lead_enrichment_jobs" USING "btree" ("client_id", "status", "started_at" DESC);



CREATE INDEX "idx_lead_meetings_lead" ON "public"."lead_meetings" USING "btree" ("lead_id", "scheduled_at" DESC);



CREATE INDEX "idx_lead_memory_lead" ON "public"."lead_memory" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_lead_memory_tags" ON "public"."lead_memory" USING "gin" ("tags");



CREATE INDEX "idx_lead_memory_workspace_kind" ON "public"."lead_memory" USING "btree" ("workspace_id", "kind");



CREATE INDEX "idx_lead_notes_author" ON "public"."lead_notes" USING "btree" ("author_id");



CREATE INDEX "idx_lead_notes_lead" ON "public"."lead_notes" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_notes_workspace" ON "public"."lead_notes" USING "btree" ("workspace_id");



CREATE INDEX "idx_lead_research_business" ON "public"."lead_research_profiles" USING "btree" ("business_id");



CREATE INDEX "idx_lead_scores_business" ON "public"."lead_scores" USING "btree" ("business_id");



CREATE INDEX "idx_lead_tag_assignments_tag" ON "public"."lead_tag_assignments" USING "btree" ("tag_id");



CREATE INDEX "idx_leads_assigned_to" ON "public"."leads" USING "btree" ("assigned_to") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "idx_leads_business" ON "public"."leads" USING "btree" ("business_id");



CREATE INDEX "idx_leads_client_created" ON "public"."leads" USING "btree" ("client_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_leads_client_email" ON "public"."leads" USING "btree" ("client_id", "lower"("primary_email")) WHERE ("primary_email" IS NOT NULL);



CREATE UNIQUE INDEX "idx_leads_client_linkedin" ON "public"."leads" USING "btree" ("client_id", "lower"("linkedin_url")) WHERE ("linkedin_url" IS NOT NULL);



CREATE INDEX "idx_leads_first_name_search" ON "public"."leads" USING "btree" ("lower"("first_name") "text_pattern_ops") WHERE ("first_name" IS NOT NULL);



CREATE INDEX "idx_leads_last_activity" ON "public"."leads" USING "btree" ("last_activity" DESC NULLS LAST);



CREATE INDEX "idx_leads_primary_email_search" ON "public"."leads" USING "btree" ("lower"("primary_email") "text_pattern_ops") WHERE ("primary_email" IS NOT NULL);



CREATE INDEX "idx_leads_score" ON "public"."leads" USING "btree" ("score" DESC);



CREATE INDEX "idx_leads_workspace_id" ON "public"."leads" USING "btree" ("workspace_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_leads_workspace_score" ON "public"."leads" USING "btree" ("workspace_id", "score" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_leads_workspace_status" ON "public"."leads" USING "btree" ("workspace_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_media_assets_business" ON "public"."media_assets" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "idx_notif_user" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_notifications_workspace" ON "public"."notifications" USING "btree" ("workspace_id");



CREATE INDEX "idx_plans_active" ON "public"."plans" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_plans_stripe_price_id" ON "public"."plans" USING "btree" ("stripe_price_id");



CREATE INDEX "idx_plans_stripe_price_id_annual" ON "public"."plans" USING "btree" ("stripe_price_id_annual");



CREATE INDEX "idx_profiles_stripe_customer_id" ON "public"."profiles" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_sched_emails_owner_campaign" ON "public"."scheduled_emails" USING "btree" ("owner_id", "created_at" DESC) WHERE ("sequence_id" IS NOT NULL);



CREATE INDEX "idx_scheduled_emails_lead" ON "public"."scheduled_emails" USING "btree" ("lead_id");



CREATE INDEX "idx_scheduled_emails_pending" ON "public"."scheduled_emails" USING "btree" ("scheduled_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_scheduled_emails_sequence" ON "public"."scheduled_emails" USING "btree" ("sequence_id") WHERE ("sequence_id" IS NOT NULL);



CREATE INDEX "idx_scheduled_emails_status" ON "public"."scheduled_emails" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_sender_accounts_dedup" ON "public"."sender_accounts" USING "btree" ("workspace_id", "provider", "from_email");



CREATE UNIQUE INDEX "idx_sender_accounts_default" ON "public"."sender_accounts" USING "btree" ("workspace_id") WHERE ("is_default" = true);



CREATE INDEX "idx_sender_accounts_lookup" ON "public"."sender_accounts" USING "btree" ("workspace_id", "status", "use_for_outreach");



CREATE INDEX "idx_sequence_enrollments_lead" ON "public"."sequence_enrollments" USING "btree" ("lead_id");



CREATE INDEX "idx_sequences_workspace" ON "public"."email_sequences" USING "btree" ("workspace_id");



CREATE INDEX "idx_social_accounts_provider" ON "public"."social_accounts" USING "btree" ("user_id", "provider");



CREATE INDEX "idx_social_post_events_post" ON "public"."social_post_events" USING "btree" ("post_id");



CREATE INDEX "idx_social_post_events_target" ON "public"."social_post_events" USING "btree" ("target_id");



CREATE INDEX "idx_social_post_events_user" ON "public"."social_post_events" USING "btree" ("user_id");



CREATE INDEX "idx_social_post_targets_post_id" ON "public"."social_post_targets" USING "btree" ("post_id");



CREATE INDEX "idx_social_post_targets_status" ON "public"."social_post_targets" USING "btree" ("status");



CREATE INDEX "idx_social_post_targets_user" ON "public"."social_post_targets" USING "btree" ("user_id");



CREATE INDEX "idx_social_posts_business" ON "public"."social_posts" USING "btree" ("business_id");



CREATE INDEX "idx_social_posts_scheduled" ON "public"."social_posts" USING "btree" ("status", "scheduled_at") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "idx_social_posts_scheduled_at" ON "public"."social_posts" USING "btree" ("scheduled_at") WHERE ("scheduled_at" IS NOT NULL);



CREATE INDEX "idx_social_posts_user_id" ON "public"."social_posts" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_stripe_sub_id" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscriptions_workspace" ON "public"."subscriptions" USING "btree" ("workspace_id");



CREATE INDEX "idx_support_audit_logs_admin" ON "public"."support_audit_logs" USING "btree" ("admin_id", "created_at" DESC);



CREATE INDEX "idx_support_audit_logs_session" ON "public"."support_audit_logs" USING "btree" ("session_id");



CREATE INDEX "idx_support_sessions_admin" ON "public"."support_sessions" USING "btree" ("admin_id", "is_active");



CREATE INDEX "idx_support_sessions_target" ON "public"."support_sessions" USING "btree" ("target_user_id", "is_active");



CREATE INDEX "idx_suppressions_owner_email" ON "public"."suppressions" USING "btree" ("owner_id", "lower"("email"));



CREATE INDEX "idx_team_invites_pending_email" ON "public"."team_invites" USING "btree" ("email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_team_members_user_id" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_teamhub_activity_board_time" ON "public"."teamhub_activity" USING "btree" ("board_id", "created_at" DESC);



CREATE INDEX "idx_teamhub_activity_card" ON "public"."teamhub_activity" USING "btree" ("card_id");



CREATE INDEX "idx_teamhub_boards_created_by" ON "public"."teamhub_boards" USING "btree" ("created_by");



CREATE INDEX "idx_teamhub_boards_workspace" ON "public"."teamhub_boards" USING "btree" ("workspace_id");



CREATE INDEX "idx_teamhub_cards_archived" ON "public"."teamhub_cards" USING "btree" ("is_archived");



CREATE INDEX "idx_teamhub_cards_board" ON "public"."teamhub_cards" USING "btree" ("board_id");



CREATE INDEX "idx_teamhub_cards_board_active_pos" ON "public"."teamhub_cards" USING "btree" ("board_id", "is_archived", "position") WHERE ("is_archived" = false);



CREATE INDEX "idx_teamhub_cards_list" ON "public"."teamhub_cards" USING "btree" ("list_id");



CREATE INDEX "idx_teamhub_comments_card_time" ON "public"."teamhub_comments" USING "btree" ("card_id", "created_at" DESC);



CREATE INDEX "idx_teamhub_flow_members_board" ON "public"."teamhub_flow_members" USING "btree" ("board_id");



CREATE INDEX "idx_teamhub_flow_members_user_board" ON "public"."teamhub_flow_members" USING "btree" ("user_id", "board_id");



CREATE INDEX "idx_teamhub_invites_board" ON "public"."teamhub_invites" USING "btree" ("board_id");



CREATE INDEX "idx_teamhub_lists_board" ON "public"."teamhub_lists" USING "btree" ("board_id");



CREATE INDEX "idx_teams_owner_id" ON "public"."teams" USING "btree" ("owner_id");



CREATE INDEX "idx_tracking_events_link_id" ON "public"."tracking_events" USING "btree" ("link_id");



CREATE INDEX "idx_tracking_events_user" ON "public"."tracking_events" USING "btree" ("user_id");



CREATE INDEX "idx_tracking_links_post_id" ON "public"."tracking_links" USING "btree" ("post_id");



CREATE INDEX "idx_tracking_links_user_id" ON "public"."tracking_links" USING "btree" ("user_id");



CREATE INDEX "idx_usage_events_workspace_created" ON "public"."usage_events" USING "btree" ("workspace_id", "created_at");



CREATE INDEX "idx_user_prompt_versions_prompt" ON "public"."user_prompt_versions" USING "btree" ("prompt_id");



CREATE UNIQUE INDEX "idx_user_prompts_active_unique" ON "public"."user_prompts" USING "btree" ("owner_id", "prompt_key") WHERE ("is_active" = true);



CREATE INDEX "idx_user_prompts_category" ON "public"."user_prompts" USING "btree" ("category");



CREATE INDEX "idx_user_prompts_key" ON "public"."user_prompts" USING "btree" ("prompt_key");



CREATE INDEX "idx_user_prompts_owner" ON "public"."user_prompts" USING "btree" ("owner_id");



CREATE INDEX "idx_voip_inbound_routes_last_seen" ON "public"."voip_inbound_routes" USING "btree" ("last_seen" DESC);



CREATE INDEX "idx_webhook_deliveries_endpoint_status" ON "public"."webhook_deliveries" USING "btree" ("endpoint_id", "status");



CREATE INDEX "idx_webhook_deliveries_pending" ON "public"."webhook_deliveries" USING "btree" ("next_attempt_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_webhook_deliveries_workspace" ON "public"."webhook_deliveries" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_webhook_endpoints_workspace" ON "public"."webhook_endpoints" USING "btree" ("workspace_id", "enabled");



CREATE INDEX "idx_workflow_executions_lead_id" ON "public"."workflow_executions" USING "btree" ("lead_id");



CREATE INDEX "idx_workflow_executions_status" ON "public"."workflow_executions" USING "btree" ("status");



CREATE INDEX "idx_workflow_executions_user_id" ON "public"."workflow_executions" USING "btree" ("user_id");



CREATE INDEX "idx_workflow_executions_workflow_id" ON "public"."workflow_executions" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflows_status" ON "public"."workflows" USING "btree" ("status");



CREATE INDEX "idx_workflows_user_id" ON "public"."workflows" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_workspace_domains_one_primary" ON "public"."workspace_domains" USING "btree" ("workspace_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_workspace_domains_provision_queue" ON "public"."workspace_domains" USING "btree" ("status", "provisioned_at") WHERE (("status" = 'verified'::"text") AND ("provisioned_at" IS NULL));



CREATE UNIQUE INDEX "idx_workspace_domains_unique" ON "public"."workspace_domains" USING "btree" ("lower"("domain"));



CREATE INDEX "idx_workspace_domains_workspace" ON "public"."workspace_domains" USING "btree" ("workspace_id", "status");



CREATE INDEX "idx_workspace_feature_flags_enabled" ON "public"."workspace_feature_flags" USING "btree" ("workspace_id") WHERE ("enabled" = true);



CREATE INDEX "idx_workspace_feature_flags_set_by" ON "public"."workspace_feature_flags" USING "btree" ("set_by") WHERE ("set_by" IS NOT NULL);



CREATE INDEX "idx_workspace_invites_invited_by" ON "public"."workspace_invites" USING "btree" ("invited_by");



CREATE INDEX "idx_workspace_members_user" ON "public"."workspace_members" USING "btree" ("user_id");



CREATE INDEX "idx_workspace_memory_created_by" ON "public"."workspace_memory" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_workspace_memory_recent" ON "public"."workspace_memory" USING "btree" ("workspace_id", "updated_at" DESC);



CREATE INDEX "idx_workspace_memory_tags" ON "public"."workspace_memory" USING "gin" ("tags");



CREATE INDEX "idx_workspace_memory_workspace_kind_key" ON "public"."workspace_memory" USING "btree" ("workspace_id", "kind", "key");



CREATE INDEX "idx_workspace_usage_workspace_month" ON "public"."workspace_usage_counters" USING "btree" ("workspace_id", "month_key");



CREATE INDEX "idx_workspaces_owner" ON "public"."workspaces" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "uq_inbound_emails_msgid" ON "public"."inbound_emails" USING "btree" ("owner_id", "message_id") WHERE ("message_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_automation_goals_touch" BEFORE UPDATE ON "public"."automation_goals" FOR EACH ROW EXECUTE FUNCTION "public"."touch_automation_goals"();



CREATE OR REPLACE TRIGGER "trg_jobs_updated_at" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_jobs_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lead_notes_updated_at" BEFORE UPDATE ON "public"."lead_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_log_goal_outcome" AFTER UPDATE ON "public"."automation_goals" FOR EACH ROW EXECUTE FUNCTION "public"."log_goal_outcome_to_memory"();



CREATE OR REPLACE TRIGGER "trg_profiles_privileged_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_profile_privileged_columns"();



CREATE OR REPLACE TRIGGER "trg_sequences_updated_at" BEFORE UPDATE ON "public"."email_sequences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_steps_updated_at" BEFORE UPDATE ON "public"."sequence_steps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_teamhub_activity_to_audit" AFTER INSERT ON "public"."teamhub_activity" FOR EACH ROW EXECUTE FUNCTION "public"."teamhub_mirror_activity_to_audit"();



CREATE OR REPLACE TRIGGER "trg_teamhub_card_lead_sync" AFTER UPDATE OF "list_id" ON "public"."teamhub_cards" FOR EACH ROW EXECUTE FUNCTION "public"."teamhub_sync_lead_on_move"();



CREATE OR REPLACE TRIGGER "trg_teamhub_check_lead_scope" BEFORE INSERT OR UPDATE ON "public"."teamhub_item_leads" FOR EACH ROW EXECUTE FUNCTION "public"."teamhub_check_lead_link_scope"();



CREATE OR REPLACE TRIGGER "trg_wh_email_dlq_insert" AFTER INSERT ON "public"."email_dlq" FOR EACH ROW EXECUTE FUNCTION "public"."_wh_after_email_dlq_insert"();



CREATE OR REPLACE TRIGGER "trg_wh_email_message_insert" AFTER INSERT ON "public"."email_messages" FOR EACH ROW EXECUTE FUNCTION "public"."_wh_after_email_message_insert"();



CREATE OR REPLACE TRIGGER "trg_wh_lead_insert" AFTER INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."_wh_after_lead_insert"();



CREATE OR REPLACE TRIGGER "trg_wh_lead_status_update" AFTER UPDATE OF "status" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."_wh_after_lead_status_update"();



CREATE OR REPLACE TRIGGER "trg_wh_seq_run_update" AFTER UPDATE OF "status" ON "public"."email_sequence_runs" FOR EACH ROW EXECUTE FUNCTION "public"."_wh_after_seq_run_update"();



CREATE OR REPLACE TRIGGER "trg_workspace_branding_touch" BEFORE UPDATE ON "public"."workspace_branding" FOR EACH ROW EXECUTE FUNCTION "public"."touch_workspace_branding"();



CREATE OR REPLACE TRIGGER "trg_workspace_memory_touch" BEFORE UPDATE ON "public"."workspace_memory" FOR EACH ROW EXECUTE FUNCTION "public"."touch_workspace_memory"();



CREATE OR REPLACE TRIGGER "trigger_workflows_updated_at" BEFORE UPDATE ON "public"."workflows" FOR EACH ROW EXECUTE FUNCTION "public"."update_workflows_updated_at"();



ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_credit_usage"
    ADD CONSTRAINT "ai_credit_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_proxy_usage"
    ADD CONSTRAINT "ai_proxy_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_threads"
    ADD CONSTRAINT "ai_threads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_threads"
    ADD CONSTRAINT "ai_threads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_idempotency"
    ADD CONSTRAINT "api_idempotency_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_idempotency"
    ADD CONSTRAINT "api_idempotency_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_rate_limit_buckets"
    ADD CONSTRAINT "api_rate_limit_buckets_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apollo_import_logs"
    ADD CONSTRAINT "apollo_import_logs_search_log_id_fkey" FOREIGN KEY ("search_log_id") REFERENCES "public"."apollo_search_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."apollo_import_logs"
    ADD CONSTRAINT "apollo_import_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apollo_search_logs"
    ADD CONSTRAINT "apollo_search_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."automation_goals"
    ADD CONSTRAINT "automation_goals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."automation_goals"
    ADD CONSTRAINT "automation_goals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_plans"
    ADD CONSTRAINT "automation_plans_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."automation_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_plans"
    ADD CONSTRAINT "automation_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_step_runs"
    ADD CONSTRAINT "automation_step_runs_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."automation_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_step_runs"
    ADD CONSTRAINT "automation_step_runs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."automation_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_step_runs"
    ADD CONSTRAINT "automation_step_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "public"."guest_contributors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_memory"
    ADD CONSTRAINT "campaign_memory_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_purchases"
    ADD CONSTRAINT "credit_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_purchases"
    ADD CONSTRAINT "credit_purchases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_dlq"
    ADD CONSTRAINT "email_dlq_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_dlq"
    ADD CONSTRAINT "email_dlq_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_dlq"
    ADD CONSTRAINT "email_dlq_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."email_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_links"
    ADD CONSTRAINT "email_links_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_provider_configs"
    ADD CONSTRAINT "email_provider_configs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_sequence_run_items"
    ADD CONSTRAINT "email_sequence_run_items_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_sequence_run_items"
    ADD CONSTRAINT "email_sequence_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."email_sequence_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_sequence_runs"
    ADD CONSTRAINT "email_sequence_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_sequences"
    ADD CONSTRAINT "email_sequences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_sequences"
    ADD CONSTRAINT "email_sequences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_validation_log"
    ADD CONSTRAINT "email_validation_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_validation_log"
    ADD CONSTRAINT "email_validation_log_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_validation_log"
    ADD CONSTRAINT "email_validation_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_validations"
    ADD CONSTRAINT "email_validations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_validations"
    ADD CONSTRAINT "email_validations_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_validations"
    ADD CONSTRAINT "email_validations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_contributors"
    ADD CONSTRAINT "guest_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_post_outreach"
    ADD CONSTRAINT "guest_post_outreach_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."imap_poll_state"
    ADD CONSTRAINT "imap_poll_state_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."email_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_package_items"
    ADD CONSTRAINT "invoice_package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."invoice_packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_packages"
    ADD CONSTRAINT "invoice_packages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_call_logs"
    ADD CONSTRAINT "lead_call_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_call_logs"
    ADD CONSTRAINT "lead_call_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_color_overrides"
    ADD CONSTRAINT "lead_color_overrides_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_color_overrides"
    ADD CONSTRAINT "lead_color_overrides_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_enrichment_jobs"
    ADD CONSTRAINT "lead_enrichment_jobs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_meetings"
    ADD CONSTRAINT "lead_meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_meetings"
    ADD CONSTRAINT "lead_meetings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_memory"
    ADD CONSTRAINT "lead_memory_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_memory"
    ADD CONSTRAINT "lead_memory_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_research_profiles"
    ADD CONSTRAINT "lead_research_profiles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_research_profiles"
    ADD CONSTRAINT "lead_research_profiles_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_research_profiles"
    ADD CONSTRAINT "lead_research_profiles_researched_by_fkey" FOREIGN KEY ("researched_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_research_profiles"
    ADD CONSTRAINT "lead_research_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "lead_scores_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "lead_scores_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "lead_scores_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_stage_colors"
    ADD CONSTRAINT "lead_stage_colors_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_emails"
    ADD CONSTRAINT "scheduled_emails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_emails"
    ADD CONSTRAINT "scheduled_emails_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sender_account_secrets"
    ADD CONSTRAINT "sender_account_secrets_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sender_accounts"
    ADD CONSTRAINT "sender_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_steps"
    ADD CONSTRAINT "sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_events"
    ADD CONSTRAINT "social_post_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_events"
    ADD CONSTRAINT "social_post_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."social_post_targets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_post_events"
    ADD CONSTRAINT "social_post_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_targets"
    ADD CONSTRAINT "social_post_targets_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_targets"
    ADD CONSTRAINT "social_post_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_audit_logs"
    ADD CONSTRAINT "support_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_audit_logs"
    ADD CONSTRAINT "support_audit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."support_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_audit_logs"
    ADD CONSTRAINT "support_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_sessions"
    ADD CONSTRAINT "support_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_sessions"
    ADD CONSTRAINT "support_sessions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppressions"
    ADD CONSTRAINT "suppressions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_activity"
    ADD CONSTRAINT "teamhub_activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_activity"
    ADD CONSTRAINT "teamhub_activity_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."teamhub_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_activity"
    ADD CONSTRAINT "teamhub_activity_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."teamhub_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teamhub_boards"
    ADD CONSTRAINT "teamhub_boards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_boards"
    ADD CONSTRAINT "teamhub_boards_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."teamhub_flow_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teamhub_card_members"
    ADD CONSTRAINT "teamhub_card_members_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."teamhub_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_card_members"
    ADD CONSTRAINT "teamhub_card_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_cards"
    ADD CONSTRAINT "teamhub_cards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."teamhub_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_cards"
    ADD CONSTRAINT "teamhub_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_cards"
    ADD CONSTRAINT "teamhub_cards_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."teamhub_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_comments"
    ADD CONSTRAINT "teamhub_comments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."teamhub_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_comments"
    ADD CONSTRAINT "teamhub_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_flow_members"
    ADD CONSTRAINT "teamhub_flow_members_flow_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."teamhub_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_flow_members"
    ADD CONSTRAINT "teamhub_flow_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_flow_templates"
    ADD CONSTRAINT "teamhub_flow_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teamhub_invites"
    ADD CONSTRAINT "teamhub_invites_flow_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."teamhub_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_invites"
    ADD CONSTRAINT "teamhub_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_item_leads"
    ADD CONSTRAINT "teamhub_item_leads_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."teamhub_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_item_leads"
    ADD CONSTRAINT "teamhub_item_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teamhub_lists"
    ADD CONSTRAINT "teamhub_lists_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."teamhub_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracking_events"
    ADD CONSTRAINT "tracking_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."tracking_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracking_events"
    ADD CONSTRAINT "tracking_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracking_links"
    ADD CONSTRAINT "tracking_links_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tracking_links"
    ADD CONSTRAINT "tracking_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_prompt_versions"
    ADD CONSTRAINT "user_prompt_versions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_prompt_versions"
    ADD CONSTRAINT "user_prompt_versions_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."user_prompts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_prompts"
    ADD CONSTRAINT "user_prompts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voip_inbound_routes"
    ADD CONSTRAINT "voip_inbound_routes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_ai_usage"
    ADD CONSTRAINT "workspace_ai_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_branding"
    ADD CONSTRAINT "workspace_branding_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_branding"
    ADD CONSTRAINT "workspace_branding_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_domains"
    ADD CONSTRAINT "workspace_domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_domains"
    ADD CONSTRAINT "workspace_domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_entitlements"
    ADD CONSTRAINT "workspace_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."workspace_entitlements"
    ADD CONSTRAINT "workspace_entitlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_feature_flags"
    ADD CONSTRAINT "workspace_feature_flags_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_feature_flags"
    ADD CONSTRAINT "workspace_feature_flags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_memory"
    ADD CONSTRAINT "workspace_memory_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_memory"
    ADD CONSTRAINT "workspace_memory_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_usage_counters"
    ADD CONSTRAINT "workspace_usage_counters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin Full Access" ON "public"."blog_posts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admin Insert All" ON "public"."blog_posts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admin Manage Categories" ON "public"."blog_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admin View All Audit" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admin View All Leads" ON "public"."leads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can delete all leads" ON "public"."leads" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert leads" ON "public"."leads" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage all blog posts" ON "public"."blog_posts" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage blog categories" ON "public"."blog_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage config" ON "public"."config_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage plans" ON "public"."plans" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can update all leads" ON "public"."leads" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update all subscriptions" ON "public"."subscriptions" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can view all ai_usage_logs" ON "public"."ai_usage_logs" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all leads" ON "public"."leads" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all subscriptions" ON "public"."subscriptions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Anyone can insert tracking events" ON "public"."tracking_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view blog categories" ON "public"."blog_categories" FOR SELECT USING (true);



CREATE POLICY "Anyone can view plans" ON "public"."plans" FOR SELECT USING (true);



CREATE POLICY "Anyone can view published blog posts" ON "public"."blog_posts" FOR SELECT USING ((("status" = 'published'::"text") OR ("auth"."uid"() = "author_id")));



CREATE POLICY "Authenticated insert audit_logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can create teams" ON "public"."teams" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Authors can manage own posts" ON "public"."blog_posts" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Co-members can view profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("public"."teamhub_user_flow_role"("a"."board_id") IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."teamhub_flow_members" "b"
          WHERE (("b"."board_id" = "a"."board_id") AND ("b"."user_id" = "profiles"."id"))))))));



CREATE POLICY "Create Own Drafts" ON "public"."blog_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "author_id") AND (("status" = 'draft'::"text") OR ("status" = 'pending_review'::"text"))));



CREATE POLICY "Invitees can update invite status" ON "public"."team_invites" FOR UPDATE USING (("email" = "public"."auth_email"()));



CREATE POLICY "Invitees can view invites to their email" ON "public"."team_invites" FOR SELECT USING (("email" = "public"."auth_email"()));



CREATE POLICY "Invitees can view teams they are invited to" ON "public"."teams" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_invites"
  WHERE (("team_invites"."team_id" = "teams"."id") AND ("team_invites"."email" = "public"."auth_email"()) AND ("team_invites"."status" = 'pending'::"text")))));



CREATE POLICY "Inviters can view sent invites" ON "public"."team_invites" FOR SELECT USING (("auth"."uid"() = "invited_by"));



CREATE POLICY "Members delete business leads" ON "public"."leads" FOR DELETE USING ((("business_id" IS NOT NULL) AND "public"."is_business_member"("business_id")));



CREATE POLICY "Members insert business leads" ON "public"."leads" FOR INSERT WITH CHECK ((("business_id" IS NOT NULL) AND "public"."is_business_member"("business_id")));



CREATE POLICY "Members read own proxy usage" ON "public"."ai_proxy_usage" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Members update business leads" ON "public"."leads" FOR UPDATE USING ((("business_id" IS NOT NULL) AND "public"."is_business_member"("business_id")));



CREATE POLICY "Members view business leads" ON "public"."leads" FOR SELECT USING ((("business_id" IS NOT NULL) AND "public"."is_business_member"("business_id")));



CREATE POLICY "Owner can add suppressions" ON "public"."suppressions" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owner can read suppressions" ON "public"."suppressions" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owner can remove suppressions" ON "public"."suppressions" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owner can update member roles" ON "public"."team_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members" "self"
  WHERE (("self"."team_id" = "team_members"."team_id") AND ("self"."user_id" = "auth"."uid"()) AND ("self"."role" = 'owner'::"text")))));



CREATE POLICY "Owner/admin can remove members or self-leave" ON "public"."team_members" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."team_members" "self"
  WHERE (("self"."team_id" = "team_members"."team_id") AND ("self"."user_id" = "auth"."uid"()) AND ("self"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Public Profiles View" ON "public"."profiles" FOR SELECT USING (true);



COMMENT ON POLICY "Public Profiles View" ON "public"."profiles" IS 'Permissive row-visibility policy. Anon access is column-scoped via GRANT SELECT (id, name, avatar_url) TO anon — NOT via this policy. Authenticated reads are scoped by the own / co-members / admins policies on this table. Do not broaden the column grant without a security review.';



CREATE POLICY "Service can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service can insert subscriptions" ON "public"."subscriptions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."scheduled_emails" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on run items" ON "public"."email_sequence_run_items" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on runs" ON "public"."email_sequence_runs" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Super admins can insert audit logs" ON "public"."support_audit_logs" FOR INSERT WITH CHECK (("public"."is_super_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Super admins can manage their own sessions" ON "public"."support_sessions" USING (("public"."is_super_admin"() AND ("admin_id" = "auth"."uid"()))) WITH CHECK (("public"."is_super_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Super admins can view audit logs" ON "public"."support_audit_logs" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "Support session: view target email configs" ON "public"."email_provider_configs" FOR SELECT USING ("public"."has_active_support_session"("owner_id"));



CREATE POLICY "Support session: view target email messages" ON "public"."email_messages" FOR SELECT USING ("public"."has_active_support_session"("owner_id"));



CREATE POLICY "Support session: view target integrations" ON "public"."integrations" FOR SELECT USING ("public"."has_active_support_session"("owner_id"));



CREATE POLICY "Support session: view target leads" ON "public"."leads" FOR SELECT USING ("public"."has_active_support_session"("client_id"));



CREATE POLICY "Support session: view target subscriptions" ON "public"."subscriptions" FOR SELECT USING ("public"."has_active_support_session"("user_id"));



CREATE POLICY "Team members can create invites" ON "public"."team_invites" FOR INSERT WITH CHECK ("public"."is_team_member"("team_id"));



CREATE POLICY "Team members can view team audit logs" ON "public"."audit_logs" FOR SELECT USING ((("team_id" IS NOT NULL) AND "public"."is_team_member"("team_id")));



CREATE POLICY "Team members can view team invites" ON "public"."team_invites" FOR SELECT USING ("public"."is_team_member"("team_id"));



CREATE POLICY "Team members can view team members" ON "public"."team_members" FOR SELECT USING ("public"."is_team_member"("team_id"));



CREATE POLICY "Team members can view their team" ON "public"."teams" FOR SELECT USING ("public"."is_team_member"("id"));



CREATE POLICY "Team owner can update team" ON "public"."teams" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Team owner can view own team" ON "public"."teams" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Team owner/admin can delete invites" ON "public"."team_invites" FOR DELETE USING ("public"."is_team_member"("team_id"));



CREATE POLICY "Update Own Profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can add themselves as team members" ON "public"."team_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own color overrides" ON "public"."lead_color_overrides" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own integrations" ON "public"."integrations" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own leads" ON "public"."leads" FOR DELETE USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Users can delete own package items" ON "public"."invoice_package_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."invoice_packages"
  WHERE (("invoice_packages"."id" = "invoice_package_items"."package_id") AND ("invoice_packages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own packages" ON "public"."invoice_packages" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own provider configs" ON "public"."email_provider_configs" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own social accounts" ON "public"."social_accounts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own social posts" ON "public"."social_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own stage colors" ON "public"."lead_stage_colors" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete their own scheduled emails" ON "public"."scheduled_emails" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert own audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own color overrides" ON "public"."lead_color_overrides" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own email links" ON "public"."email_links" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."email_messages"
  WHERE (("email_messages"."id" = "email_links"."message_id") AND ("email_messages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own email messages" ON "public"."email_messages" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own import logs" ON "public"."apollo_import_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own integrations" ON "public"."integrations" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own invoice line items" ON "public"."invoice_line_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own invoices" ON "public"."invoices" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own leads" ON "public"."leads" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Users can insert own package items" ON "public"."invoice_package_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoice_packages"
  WHERE (("invoice_packages"."id" = "invoice_package_items"."package_id") AND ("invoice_packages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own packages" ON "public"."invoice_packages" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own post targets" ON "public"."social_post_targets" FOR INSERT WITH CHECK (("post_id" IN ( SELECT "social_posts"."id"
   FROM "public"."social_posts"
  WHERE ("social_posts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own provider configs" ON "public"."email_provider_configs" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own runs" ON "public"."email_sequence_runs" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own search logs" ON "public"."apollo_search_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own social accounts" ON "public"."social_accounts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own social posts" ON "public"."social_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own stage colors" ON "public"."lead_stage_colors" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own subscription" ON "public"."subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own tracking links" ON "public"."tracking_links" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own usage logs" ON "public"."ai_usage_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own scheduled emails" ON "public"."scheduled_emails" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can manage own contributors" ON "public"."guest_contributors" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own outreach" ON "public"."guest_post_outreach" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own color overrides" ON "public"."lead_color_overrides" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own email messages" ON "public"."email_messages" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own integrations" ON "public"."integrations" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own invoices" ON "public"."invoices" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own leads" ON "public"."leads" FOR UPDATE USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Users can update own package items" ON "public"."invoice_package_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."invoice_packages"
  WHERE (("invoice_packages"."id" = "invoice_package_items"."package_id") AND ("invoice_packages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own packages" ON "public"."invoice_packages" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own post targets" ON "public"."social_post_targets" FOR UPDATE USING (("post_id" IN ( SELECT "social_posts"."id"
   FROM "public"."social_posts"
  WHERE ("social_posts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own provider configs" ON "public"."email_provider_configs" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own runs" ON "public"."email_sequence_runs" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own social accounts" ON "public"."social_accounts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own social posts" ON "public"."social_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own stage colors" ON "public"."lead_stage_colors" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own subscription" ON "public"."subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own tracking links" ON "public"."tracking_links" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own scheduled emails" ON "public"."scheduled_emails" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view audit logs" ON "public"."audit_logs" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view own color overrides" ON "public"."lead_color_overrides" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own email events" ON "public"."email_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."email_messages"
  WHERE (("email_messages"."id" = "email_events"."message_id") AND ("email_messages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own email links" ON "public"."email_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."email_messages"
  WHERE (("email_messages"."id" = "email_links"."message_id") AND ("email_messages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own email messages" ON "public"."email_messages" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own import logs" ON "public"."apollo_import_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own integrations" ON "public"."integrations" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own invoice line items" ON "public"."invoice_line_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own invoices" ON "public"."invoices" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own leads" ON "public"."leads" FOR SELECT USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Users can view own package items" ON "public"."invoice_package_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."invoice_packages"
  WHERE (("invoice_packages"."id" = "invoice_package_items"."package_id") AND ("invoice_packages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own packages" ON "public"."invoice_packages" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own post targets" ON "public"."social_post_targets" FOR SELECT USING (("post_id" IN ( SELECT "social_posts"."id"
   FROM "public"."social_posts"
  WHERE ("social_posts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own provider configs" ON "public"."email_provider_configs" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own run items" ON "public"."email_sequence_run_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."email_sequence_runs" "r"
  WHERE (("r"."id" = "email_sequence_run_items"."run_id") AND ("r"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own runs" ON "public"."email_sequence_runs" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own search logs" ON "public"."apollo_search_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own social accounts" ON "public"."social_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own social posts" ON "public"."social_posts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own stage colors" ON "public"."lead_stage_colors" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own subscription" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own tracking events" ON "public"."tracking_events" FOR SELECT USING (("link_id" IN ( SELECT "tracking_links"."id"
   FROM "public"."tracking_links"
  WHERE ("tracking_links"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own tracking links" ON "public"."tracking_links" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own usage logs" ON "public"."ai_usage_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own scheduled emails" ON "public"."scheduled_emails" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users manage own import batches" ON "public"."import_batches" USING (("auth"."uid"() = "workspace_id"));



CREATE POLICY "Users manage own post targets" ON "public"."social_post_targets" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own social accounts" ON "public"."social_accounts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own social posts" ON "public"."social_posts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own tracking links" ON "public"."tracking_links" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own post events" ON "public"."social_post_events" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own tracking events" ON "public"."tracking_events" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "View All Categories" ON "public"."blog_categories" FOR SELECT USING (true);



CREATE POLICY "View Own Audit" ON "public"."audit_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View Own Subscription" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View Own/Admin Posts" ON "public"."blog_posts" FOR SELECT USING ((("auth"."uid"() = "author_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text"))))));



CREATE POLICY "View Published Posts" ON "public"."blog_posts" FOR SELECT USING (("status" = 'published'::"text"));



ALTER TABLE "public"."activity_feed" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_insert" ON "public"."teamhub_activity" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_activity"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "activity_select" ON "public"."activity_feed" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "activity_select" ON "public"."teamhub_activity" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_activity"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."ai_credit_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_credit_usage_insert" ON "public"."ai_credit_usage" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "ai_credit_usage"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "ai_credit_usage_select" ON "public"."ai_credit_usage" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "ai_credit_usage"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."ai_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_proxy_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "api_keys_delete" ON "public"."api_keys" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "api_keys_select" ON "public"."api_keys" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "api_keys_update" ON "public"."api_keys" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."apollo_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apollo_search_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_goals_delete" ON "public"."automation_goals" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "automation_goals_insert" ON "public"."automation_goals" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "automation_goals_select" ON "public"."automation_goals" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "automation_goals_update" ON "public"."automation_goals" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."automation_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_plans_select" ON "public"."automation_plans" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."automation_step_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_step_runs_select" ON "public"."automation_step_runs" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "biz admin delete" ON "public"."businesses" FOR DELETE USING ("public"."is_business_admin"("id"));



CREATE POLICY "biz admin update" ON "public"."businesses" FOR UPDATE USING ("public"."is_business_admin"("id"));



CREATE POLICY "biz create" ON "public"."businesses" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "biz member read" ON "public"."businesses" FOR SELECT USING ("public"."is_business_member"("id"));



ALTER TABLE "public"."blog_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bm manage" ON "public"."business_members" USING ("public"."is_business_admin"("business_id")) WITH CHECK ("public"."is_business_admin"("business_id"));



CREATE POLICY "bm read" ON "public"."business_members" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "bp read" ON "public"."business_profiles" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "bp write" ON "public"."business_profiles" USING ("public"."is_business_member"("business_id")) WITH CHECK ("public"."is_business_member"("business_id"));



ALTER TABLE "public"."business_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_memory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_memory_select" ON "public"."campaign_memory" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "campaign_memory_write" ON "public"."campaign_memory" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"())))) WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "card_member_delete" ON "public"."teamhub_card_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_flow_members" "fm"
     JOIN "public"."teamhub_cards" "c" ON (("c"."board_id" = "fm"."board_id")))
  WHERE (("c"."id" = "teamhub_card_members"."card_id") AND ("fm"."user_id" = "auth"."uid"()) AND ("fm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "card_member_insert" ON "public"."teamhub_card_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_flow_members" "fm"
     JOIN "public"."teamhub_cards" "c" ON (("c"."board_id" = "fm"."board_id")))
  WHERE (("c"."id" = "teamhub_card_members"."card_id") AND ("fm"."user_id" = "auth"."uid"()) AND ("fm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "card_member_select" ON "public"."teamhub_card_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_flow_members" "fm"
     JOIN "public"."teamhub_cards" "c" ON (("c"."board_id" = "fm"."board_id")))
  WHERE (("c"."id" = "teamhub_card_members"."card_id") AND ("fm"."user_id" = "auth"."uid"())))));



CREATE POLICY "comment_insert" ON "public"."teamhub_comments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_flow_members" "fm"
     JOIN "public"."teamhub_cards" "c" ON (("c"."board_id" = "fm"."board_id")))
  WHERE (("c"."id" = "teamhub_comments"."card_id") AND ("fm"."user_id" = "auth"."uid"()) AND ("fm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "comment_select" ON "public"."teamhub_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_flow_members" "fm"
     JOIN "public"."teamhub_cards" "c" ON (("c"."board_id" = "fm"."board_id")))
  WHERE (("c"."id" = "teamhub_comments"."card_id") AND ("fm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."config_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_purchases_select" ON "public"."credit_purchases" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "credit_purchases"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "delete_own_prompts" ON "public"."user_prompts" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "delete_own_templates" ON "public"."email_templates" FOR DELETE USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."email_dlq" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_dlq_select" ON "public"."email_dlq" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



ALTER TABLE "public"."email_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_provider_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_sequence_run_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_sequence_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_validation_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_validations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enroll_insert" ON "public"."sequence_enrollments" FOR INSERT WITH CHECK ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "enroll_select" ON "public"."sequence_enrollments" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "enroll_update" ON "public"."sequence_enrollments" FOR UPDATE USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "entitlements_admin_all" ON "public"."workspace_entitlements" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'ADMIN'::"text") OR ("profiles"."is_super_admin" = true))))));



CREATE POLICY "entitlements_owner_read" ON "public"."workspace_entitlements" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "executions_insert" ON "public"."workflow_executions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "executions_select" ON "public"."workflow_executions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feature_flags_admin_write" ON "public"."feature_flags" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'ADMIN'::"text") OR ("profiles"."is_super_admin" = true))))));



CREATE POLICY "feature_flags_read" ON "public"."feature_flags" FOR SELECT USING (true);



CREATE POLICY "flow_creator_select" ON "public"."teamhub_boards" FOR SELECT USING (("auth"."uid"() = "created_by"));



CREATE POLICY "flow_delete" ON "public"."teamhub_boards" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_boards"."id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = 'owner'::"text")))));



CREATE POLICY "flow_insert" ON "public"."teamhub_boards" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "flow_select" ON "public"."teamhub_boards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_boards"."id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "flow_update" ON "public"."teamhub_boards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_boards"."id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."generated_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_contributors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_post_outreach" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."imap_poll_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_emails" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_own_prompt_versions" ON "public"."user_prompt_versions" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "insert_own_prompts" ON "public"."user_prompts" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "insert_own_templates" ON "public"."email_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invite_delete" ON "public"."teamhub_invites" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_invites"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "invite_insert" ON "public"."teamhub_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_invites"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "invite_select" ON "public"."teamhub_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_invites"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "invites_insert" ON "public"."workspace_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workspace_invites"."workspace_id") AND ("wm"."user_id" = "auth"."uid"()) AND ("wm"."role" = ANY (ARRAY['owner'::"public"."workspace_role", 'admin'::"public"."workspace_role"]))))));



CREATE POLICY "invites_select" ON "public"."workspace_invites" FOR SELECT USING (("public"."is_workspace_member"("workspace_id") OR ("email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "invites_update" ON "public"."workspace_invites" FOR UPDATE USING (("email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."invoice_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_package_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_delete" ON "public"."teamhub_cards" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_cards"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "item_insert" ON "public"."teamhub_cards" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_cards"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "item_lead_delete" ON "public"."teamhub_item_leads" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_cards" "c"
     JOIN "public"."teamhub_flow_members" "fm" ON (("fm"."board_id" = "c"."board_id")))
  WHERE (("c"."id" = "teamhub_item_leads"."item_id") AND ("fm"."user_id" = "auth"."uid"()) AND ("fm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "item_lead_insert" ON "public"."teamhub_item_leads" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_cards" "c"
     JOIN "public"."teamhub_flow_members" "fm" ON (("fm"."board_id" = "c"."board_id")))
  WHERE (("c"."id" = "teamhub_item_leads"."item_id") AND ("fm"."user_id" = "auth"."uid"()) AND ("fm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "item_lead_select" ON "public"."teamhub_item_leads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_cards" "c"
     JOIN "public"."teamhub_flow_members" "fm" ON (("fm"."board_id" = "c"."board_id")))
  WHERE (("c"."id" = "teamhub_item_leads"."item_id") AND ("fm"."user_id" = "auth"."uid"())))));



CREATE POLICY "item_lead_update" ON "public"."teamhub_item_leads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."teamhub_cards" "c"
     JOIN "public"."teamhub_flow_members" "fm" ON (("fm"."board_id" = "c"."board_id")))
  WHERE (("c"."id" = "teamhub_item_leads"."item_id") AND ("fm"."user_id" = "auth"."uid"()) AND ("fm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "item_select" ON "public"."teamhub_cards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_cards"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "item_update" ON "public"."teamhub_cards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_cards"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



ALTER TABLE "public"."job_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_events_insert" ON "public"."job_events" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "job_events_select" ON "public"."job_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_events"."job_id") AND (("j"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))))))));



CREATE POLICY "job_events_workspace_member_select" ON "public"."job_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "j"."workspace_id")))
  WHERE (("j"."id" = "job_events"."job_id") AND ("wm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "jobs_admin_select" ON "public"."jobs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "jobs_insert" ON "public"."jobs" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "jobs_select" ON "public"."jobs" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "jobs_workspace_member_select" ON "public"."jobs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "jobs"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "lane_delete" ON "public"."teamhub_lists" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_lists"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "lane_insert" ON "public"."teamhub_lists" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_lists"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "lane_select" ON "public"."teamhub_lists" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_lists"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "lane_update" ON "public"."teamhub_lists" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members"
  WHERE (("teamhub_flow_members"."board_id" = "teamhub_lists"."board_id") AND ("teamhub_flow_members"."user_id" = "auth"."uid"()) AND ("teamhub_flow_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."lead_call_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_color_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_enrichment_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_memory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_memory_select" ON "public"."lead_memory" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "lead_memory_write" ON "public"."lead_memory" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"())))) WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."lead_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_research_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_stage_colors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_tag_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lta_delete" ON "public"."lead_tag_assignments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."leads" "l"
  WHERE (("l"."id" = "lead_tag_assignments"."lead_id") AND "public"."is_workspace_member"("l"."workspace_id")))));



CREATE POLICY "lta_insert" ON "public"."lead_tag_assignments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."leads" "l"
  WHERE (("l"."id" = "lead_tag_assignments"."lead_id") AND "public"."is_workspace_member"("l"."workspace_id")))));



CREATE POLICY "lta_select" ON "public"."lead_tag_assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."leads" "l"
  WHERE (("l"."id" = "lead_tag_assignments"."lead_id") AND "public"."is_workspace_member"("l"."workspace_id")))));



ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_bootstrap_insert" ON "public"."teamhub_flow_members" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."teamhub_boards"
  WHERE (("teamhub_boards"."id" = "teamhub_flow_members"."board_id") AND ("teamhub_boards"."created_by" = "auth"."uid"())))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."teamhub_flow_members" "existing"
  WHERE ("existing"."board_id" = "teamhub_flow_members"."board_id"))))));



CREATE POLICY "member_delete" ON "public"."teamhub_flow_members" FOR DELETE USING (("public"."teamhub_user_flow_role"("board_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "member_insert" ON "public"."teamhub_flow_members" FOR INSERT WITH CHECK (("public"."teamhub_user_flow_role"("board_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "member_select" ON "public"."teamhub_flow_members" FOR SELECT USING (("public"."teamhub_user_flow_role"("board_id") IS NOT NULL));



CREATE POLICY "member_update" ON "public"."teamhub_flow_members" FOR UPDATE USING (("public"."teamhub_user_flow_role"("board_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "members read gen" ON "public"."generated_assets" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "members read media" ON "public"."media_assets" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "members read research" ON "public"."lead_research_profiles" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "members read scores" ON "public"."lead_scores" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "members read validation log" ON "public"."email_validation_log" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "members read validations" ON "public"."email_validations" FOR SELECT USING ("public"."is_business_member"("business_id"));



CREATE POLICY "members write gen" ON "public"."generated_assets" USING ("public"."is_business_member"("business_id")) WITH CHECK ("public"."is_business_member"("business_id"));



CREATE POLICY "members write media" ON "public"."media_assets" USING ("public"."is_business_member"("business_id")) WITH CHECK ("public"."is_business_member"("business_id"));



CREATE POLICY "members write research" ON "public"."lead_research_profiles" USING ("public"."is_business_member"("business_id")) WITH CHECK ("public"."is_business_member"("business_id"));



CREATE POLICY "members write scores" ON "public"."lead_scores" USING ("public"."is_business_member"("business_id")) WITH CHECK ("public"."is_business_member"("business_id"));



CREATE POLICY "members_delete" ON "public"."workspace_members" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workspace_members"."workspace_id") AND ("wm"."user_id" = "auth"."uid"()) AND ("wm"."role" = ANY (ARRAY['owner'::"public"."workspace_role", 'admin'::"public"."workspace_role"]))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "members_insert" ON "public"."workspace_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workspace_members"."workspace_id") AND ("wm"."user_id" = "auth"."uid"()) AND ("wm"."role" = ANY (ARRAY['owner'::"public"."workspace_role", 'admin'::"public"."workspace_role"]))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "members_select" ON "public"."workspace_members" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "messages_owner_all" ON "public"."ai_messages" USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "notes_delete" ON "public"."lead_notes" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "notes_insert" ON "public"."lead_notes" FOR INSERT WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "notes_select" ON "public"."lead_notes" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "notes_update" ON "public"."lead_notes" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "notif_select" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notif_update" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner manages own route" ON "public"."voip_inbound_routes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "owner reads call logs" ON "public"."lead_call_logs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "owner reads enrichment jobs" ON "public"."lead_enrichment_jobs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "owner reads inbound" ON "public"."inbound_emails" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner reads meetings" ON "public"."lead_meetings" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "owner updates inbound" ON "public"."inbound_emails" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner updates meetings" ON "public"."lead_meetings" FOR UPDATE USING (("client_id" = "auth"."uid"()));



CREATE POLICY "owner writes call logs" ON "public"."lead_call_logs" FOR INSERT WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "owner writes meetings" ON "public"."lead_meetings" FOR INSERT WITH CHECK (("client_id" = "auth"."uid"()));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_admin_write" ON "public"."plans" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'ADMIN'::"text") OR ("profiles"."is_super_admin" = true))))));



CREATE POLICY "plans_read" ON "public"."plans" FOR SELECT USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_default_prompts" ON "public"."user_prompts" FOR SELECT USING ((("owner_id" IS NULL) AND ("is_default" = true)));



CREATE POLICY "read_default_templates" ON "public"."email_templates" FOR SELECT USING ((("owner_id" IS NULL) AND ("is_default" = true)));



CREATE POLICY "read_own_prompt_versions" ON "public"."user_prompt_versions" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "read_own_prompts" ON "public"."user_prompts" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "read_own_templates" ON "public"."email_templates" FOR SELECT USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."scheduled_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sender_account_secrets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sender_account_secrets_deny_all" ON "public"."sender_account_secrets" USING (false) WITH CHECK (false);



ALTER TABLE "public"."sender_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sender_accounts_delete" ON "public"."sender_accounts" FOR DELETE USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "sender_accounts_insert" ON "public"."sender_accounts" FOR INSERT WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "sender_accounts_select" ON "public"."sender_accounts" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "sender_accounts_update" ON "public"."sender_accounts" FOR UPDATE USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "seq_delete" ON "public"."email_sequences" FOR DELETE USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "seq_insert" ON "public"."email_sequences" FOR INSERT WITH CHECK ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "seq_select" ON "public"."email_sequences" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "seq_update" ON "public"."email_sequences" FOR UPDATE USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."sequence_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sequence_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_post_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_post_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "steps_delete" ON "public"."sequence_steps" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."email_sequences" "s"
  WHERE (("s"."id" = "sequence_steps"."sequence_id") AND "public"."is_workspace_member"("s"."workspace_id")))));



CREATE POLICY "steps_insert" ON "public"."sequence_steps" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."email_sequences" "s"
  WHERE (("s"."id" = "sequence_steps"."sequence_id") AND "public"."is_workspace_member"("s"."workspace_id")))));



CREATE POLICY "steps_select" ON "public"."sequence_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."email_sequences" "s"
  WHERE (("s"."id" = "sequence_steps"."sequence_id") AND "public"."is_workspace_member"("s"."workspace_id")))));



CREATE POLICY "steps_update" ON "public"."sequence_steps" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."email_sequences" "s"
  WHERE (("s"."id" = "sequence_steps"."sequence_id") AND "public"."is_workspace_member"("s"."workspace_id")))));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_delete" ON "public"."tags" FOR DELETE USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "tags_insert" ON "public"."tags" FOR INSERT WITH CHECK ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "tags_select" ON "public"."tags" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "tags_update" ON "public"."tags" FOR UPDATE USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."team_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_boards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_card_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_flow_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_flow_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_item_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teamhub_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_delete" ON "public"."teamhub_flow_templates" FOR DELETE USING ((("created_by" = "auth"."uid"()) AND ("type" = 'user'::"text")));



CREATE POLICY "template_insert" ON "public"."teamhub_flow_templates" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND ("type" = 'user'::"text")));



CREATE POLICY "template_select" ON "public"."teamhub_flow_templates" FOR SELECT USING ((("type" = 'system'::"text") OR ("created_by" = "auth"."uid"())));



CREATE POLICY "threads_owner_all" ON "public"."ai_threads" USING (("workspace_id" = "auth"."uid"()));



ALTER TABLE "public"."tracking_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracking_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_own_prompts" ON "public"."user_prompts" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "update_own_templates" ON "public"."email_templates" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."usage_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usage_events_select" ON "public"."usage_events" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



ALTER TABLE "public"."user_prompt_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voip_inbound_routes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_deliveries_select" ON "public"."webhook_deliveries" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."webhook_endpoints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_endpoints_delete" ON "public"."webhook_endpoints" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "webhook_endpoints_insert" ON "public"."webhook_endpoints" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "webhook_endpoints_select" ON "public"."webhook_endpoints" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "webhook_endpoints_update" ON "public"."webhook_endpoints" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "wff_select" ON "public"."workspace_feature_flags" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "wff_update" ON "public"."workspace_feature_flags" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "wff_upsert" ON "public"."workspace_feature_flags" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."workflow_executions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflows_delete" ON "public"."workflows" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workflows_insert" ON "public"."workflows" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "workflows_select" ON "public"."workflows" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workflows_update" ON "public"."workflows" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workspace_ai_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_ai_usage_insert" ON "public"."workspace_ai_usage" FOR INSERT WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "workspace_ai_usage_select" ON "public"."workspace_ai_usage" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "workspace_ai_usage_update" ON "public"."workspace_ai_usage" FOR UPDATE USING (("workspace_id" = "auth"."uid"()));



ALTER TABLE "public"."workspace_branding" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_branding_select" ON "public"."workspace_branding" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_branding_update" ON "public"."workspace_branding" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_branding_upsert" ON "public"."workspace_branding" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."workspace_domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_domains_delete" ON "public"."workspace_domains" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_domains_insert" ON "public"."workspace_domains" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_domains_select" ON "public"."workspace_domains" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_domains_update" ON "public"."workspace_domains" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."workspace_entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_insert" ON "public"."workspaces" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."workspace_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_memory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_memory_select" ON "public"."workspace_memory" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_memory_write" ON "public"."workspace_memory" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"())))) WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "workspace_select" ON "public"."workspaces" FOR SELECT USING ("public"."is_workspace_member"("id"));



CREATE POLICY "workspace_update" ON "public"."workspaces" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."workspace_usage_counters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_usage_insert" ON "public"."workspace_usage_counters" FOR INSERT WITH CHECK (("workspace_id" = "auth"."uid"()));



CREATE POLICY "workspace_usage_select" ON "public"."workspace_usage_counters" FOR SELECT USING (("workspace_id" = "auth"."uid"()));



CREATE POLICY "workspace_usage_update" ON "public"."workspace_usage_counters" FOR UPDATE USING (("workspace_id" = "auth"."uid"()));



ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."_wh_after_email_dlq_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."_wh_after_email_dlq_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_wh_after_email_dlq_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_wh_after_email_message_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."_wh_after_email_message_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_wh_after_email_message_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_wh_after_lead_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."_wh_after_lead_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_wh_after_lead_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_wh_after_lead_status_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."_wh_after_lead_status_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_wh_after_lead_status_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_wh_after_seq_run_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."_wh_after_seq_run_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_wh_after_seq_run_update"() TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON FUNCTION "public"."_wh_lead_payload"("l" "public"."leads") TO "anon";
GRANT ALL ON FUNCTION "public"."_wh_lead_payload"("l" "public"."leads") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_wh_lead_payload"("l" "public"."leads") TO "service_role";



GRANT ALL ON TABLE "public"."workspace_domains" TO "anon";
GRANT ALL ON TABLE "public"."workspace_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_domains" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_workspace_domain"("p_workspace_id" "uuid", "p_domain" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_workspace_domain"("p_workspace_id" "uuid", "p_domain" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_workspace_domain"("p_workspace_id" "uuid", "p_domain" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_workspace_domain"("p_workspace_id" "uuid", "p_domain" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_adjust_credits_used"("p_workspace_id" "uuid", "p_delta" integer, "p_admin_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_credits_used"("p_workspace_id" "uuid", "p_delta" integer, "p_admin_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_credits_used"("p_workspace_id" "uuid", "p_delta" integer, "p_admin_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_change_user_plan"("p_target_user_id" "uuid", "p_new_plan_name" "text", "p_admin_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_change_user_plan"("p_target_user_id" "uuid", "p_new_plan_name" "text", "p_admin_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_change_user_plan"("p_target_user_id" "uuid", "p_new_plan_name" "text", "p_admin_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_clone_plan"("p_source_plan_id" "uuid", "p_new_name" "text", "p_new_key" "text", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_clone_plan"("p_source_plan_id" "uuid", "p_new_name" "text", "p_new_key" "text", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_clone_plan"("p_source_plan_id" "uuid", "p_new_name" "text", "p_new_key" "text", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_grant_credits"("p_workspace_id" "uuid", "p_amount" integer, "p_admin_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_grant_credits"("p_workspace_id" "uuid", "p_amount" integer, "p_admin_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_grant_credits"("p_workspace_id" "uuid", "p_amount" integer, "p_admin_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_reset_monthly_usage"("p_workspace_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_reset_monthly_usage"("p_workspace_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reset_monthly_usage"("p_workspace_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_entitlements"("p_workspace_id" "uuid", "p_overrides" "jsonb", "p_admin_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_entitlements"("p_workspace_id" "uuid", "p_overrides" "jsonb", "p_admin_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_entitlements"("p_workspace_id" "uuid", "p_overrides" "jsonb", "p_admin_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_feature_flag"("p_key" "text", "p_enabled" boolean, "p_rules" "jsonb", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_feature_flag"("p_key" "text", "p_enabled" boolean, "p_rules" "jsonb", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_feature_flag"("p_key" "text", "p_enabled" boolean, "p_rules" "jsonb", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_plan"("p_plan_id" "uuid", "p_admin_id" "uuid", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_plan"("p_plan_id" "uuid", "p_admin_id" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_plan"("p_plan_id" "uuid", "p_admin_id" "uuid", "p_updates" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_goal_progress"("p_goal_id" "uuid", "p_increment" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_goal_progress"("p_goal_id" "uuid", "p_increment" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."advance_goal_progress"("p_goal_id" "uuid", "p_increment" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_goal_progress"("p_goal_id" "uuid", "p_increment" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_confirm_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_confirm_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_confirm_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_sequence_total_sent"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bump_sequence_total_sent"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_sequence_total_sent"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."campaign_variant_stats"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."campaign_variant_stats"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."campaign_variant_stats"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_email_exists"("check_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_email_exists"("check_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_email_exists"("check_email" "text") TO "service_role";



GRANT ALL ON TABLE "public"."email_sequence_run_items" TO "anon";
GRANT ALL ON TABLE "public"."email_sequence_run_items" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sequence_run_items" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_next_writing_item"("p_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_writing_item"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_writing_item"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_pending_webhook_deliveries"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_pending_webhook_deliveries"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pending_webhook_deliveries"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pending_webhook_deliveries"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_resumable_goal_step_runs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_resumable_goal_step_runs"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_resumable_goal_step_runs"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_resumable_goal_step_runs"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_business_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_business_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_business_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_sender_health"("p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."connect_sender_account"("p_workspace_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_from_email" "text", "p_from_name" "text", "p_use_for_outreach" boolean, "p_metadata" "jsonb", "p_oauth_access" "text", "p_oauth_refresh" "text", "p_oauth_expires" timestamp with time zone, "p_smtp_host" "text", "p_smtp_port" integer, "p_smtp_user" "text", "p_smtp_pass" "text", "p_api_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."connect_sender_account"("p_workspace_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_from_email" "text", "p_from_name" "text", "p_use_for_outreach" boolean, "p_metadata" "jsonb", "p_oauth_access" "text", "p_oauth_refresh" "text", "p_oauth_expires" timestamp with time zone, "p_smtp_host" "text", "p_smtp_port" integer, "p_smtp_user" "text", "p_smtp_pass" "text", "p_api_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."connect_sender_account"("p_workspace_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_from_email" "text", "p_from_name" "text", "p_use_for_outreach" boolean, "p_metadata" "jsonb", "p_oauth_access" "text", "p_oauth_refresh" "text", "p_oauth_expires" timestamp with time zone, "p_smtp_host" "text", "p_smtp_port" integer, "p_smtp_user" "text", "p_smtp_pass" "text", "p_api_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_ai_rate_limit"("p_user_id" "uuid", "p_max_per_min" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_api_rate_limit"("p_key_id" "uuid", "p_max_per_min" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_credits"("amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_credits"("amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_credits"("amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_credits"("ws_id" "uuid", "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_credits"("ws_id" "uuid", "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_credits"("ws_id" "uuid", "amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_api_key"("p_workspace_id" "uuid", "p_label" "text", "p_plaintext" "text", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_business"("p_workspace_id" "uuid", "p_name" "text", "p_website" "text", "p_industry" "text", "p_description" "text", "p_default_tone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_business"("p_workspace_id" "uuid", "p_name" "text", "p_website" "text", "p_industry" "text", "p_description" "text", "p_default_tone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_business"("p_workspace_id" "uuid", "p_name" "text", "p_website" "text", "p_industry" "text", "p_description" "text", "p_default_tone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_my_workspace"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_my_workspace"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_my_workspace"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_my_workspace"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_auto_replan_drifting_goals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_auto_replan_drifting_goals"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_auto_replan_drifting_goals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_auto_replan_drifting_goals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_observe_goal_drift"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_observe_goal_drift"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_observe_goal_drift"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_observe_goal_drift"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_refresh_sender_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_refresh_sender_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_refresh_sender_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_refresh_sender_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_resume_paused_goals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_resume_paused_goals"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_resume_paused_goals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_resume_paused_goals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_sweep_campaign_outcomes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_sweep_campaign_outcomes"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_sweep_campaign_outcomes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_sweep_campaign_outcomes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_ai_proxy_quota"("p_user_id" "uuid", "p_operation" "text", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_ai_proxy_quota"("p_user_id" "uuid", "p_operation" "text", "p_kind" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_profile_privileged_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_profile_privileged_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_profile_privileged_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_email_sequence_run"("p_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_email_sequence_run"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_email_sequence_run"("p_run_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_board_snapshot"("p_board_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_board_snapshot"("p_board_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_board_snapshot"("p_board_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_branding_by_domain"("p_domain" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_branding_by_domain"("p_domain" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_branding_by_domain"("p_domain" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_branding_by_domain"("p_domain" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_category_post_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_category_post_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_category_post_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_default_business"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_default_business"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_default_business"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sender_daily_sent"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sender_daily_sent"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sender_daily_sent"("p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workspace_daily_usage"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_daily_usage"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_daily_usage"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workspace_monthly_usage"("p_workspace_id" "uuid", "p_month_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_monthly_usage"("p_workspace_id" "uuid", "p_month_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_monthly_usage"("p_workspace_id" "uuid", "p_month_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_workspace"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_workspace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_workspace"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_active_support_session"("target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_support_session"("target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_support_session"("target_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."import_leads_batch"("p_workspace_id" "uuid", "p_file_name" "text", "p_file_type" "text", "p_rows" "jsonb", "p_mapping" "jsonb", "p_options" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."import_leads_batch"("p_workspace_id" "uuid", "p_file_name" "text", "p_file_type" "text", "p_rows" "jsonb", "p_mapping" "jsonb", "p_options" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_leads_batch"("p_workspace_id" "uuid", "p_file_name" "text", "p_file_type" "text", "p_rows" "jsonb", "p_mapping" "jsonb", "p_options" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_ai_usage"("p_workspace_id" "uuid", "p_month_year" "text", "p_credits" integer, "p_tokens" bigint, "p_credits_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_ai_usage"("p_workspace_id" "uuid", "p_month_year" "text", "p_credits" integer, "p_tokens" bigint, "p_credits_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_ai_usage"("p_workspace_id" "uuid", "p_month_year" "text", "p_credits" integer, "p_tokens" bigint, "p_credits_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_outbound_usage"("p_workspace_id" "uuid", "p_inbox_id" "text", "p_channel" "text", "p_period_type" "text", "p_period_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_outbound_usage"("p_workspace_id" "uuid", "p_inbox_id" "text", "p_channel" "text", "p_period_type" "text", "p_period_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_outbound_usage"("p_workspace_id" "uuid", "p_inbox_id" "text", "p_channel" "text", "p_period_type" "text", "p_period_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_sender_daily_sent"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_sender_daily_sent"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_sender_daily_sent"("p_sender_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_sender_failures"("p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage"("ws_id" "uuid", "ctype" "text", "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage"("ws_id" "uuid", "ctype" "text", "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage"("ws_id" "uuid", "ctype" "text", "amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage"("p_workspace_id" "uuid", "p_event_type" "text", "p_source_event_id" "text", "p_quantity" integer, "p_sender_account_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_workspace_id" "uuid", "p_event_type" "text", "p_source_event_id" "text", "p_quantity" integer, "p_sender_account_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_workspace_id" "uuid", "p_event_type" "text", "p_source_event_id" "text", "p_quantity" integer, "p_sender_account_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_workspace_usage"("p_workspace_id" "uuid", "p_date_key" "date", "p_month_key" "text", "p_emails" integer, "p_linkedin" integer, "p_ai_credits" integer, "p_warmup" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_workspace_usage"("p_workspace_id" "uuid", "p_date_key" "date", "p_month_key" "text", "p_emails" integer, "p_linkedin" integer, "p_ai_credits" integer, "p_warmup" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_workspace_usage"("p_workspace_id" "uuid", "p_date_key" "date", "p_month_key" "text", "p_emails" integer, "p_linkedin" integer, "p_ai_credits" integer, "p_warmup" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_ab_autopause"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_ab_autopause"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_ab_autopause"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invoke_email_writing_queue"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoke_email_writing_queue"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_email_writing_queue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_email_writing_queue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_imap_poll"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_imap_poll"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_imap_poll"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_sequence_sends"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_sequence_sends"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_sequence_sends"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invoke_webhook_dispatcher"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoke_webhook_dispatcher"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_webhook_dispatcher"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_webhook_dispatcher"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_business_admin"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_admin"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_admin"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_business_member"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_member"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_member"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"("check_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"("check_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("check_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_campaign_memory_sequence_outcome"("p_run_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_goal_outcome_to_memory"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_goal_outcome_to_memory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_goal_outcome_to_memory"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_destination_url" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_destination_url" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_destination_url" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_lead_memory_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_destination_url" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_domain_failed"("p_domain_id" "uuid", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_domain_failed"("p_domain_id" "uuid", "p_error" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_domain_failed"("p_domain_id" "uuid", "p_error" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_domain_failed"("p_domain_id" "uuid", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_domain_provision_failed"("p_domain_id" "uuid", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_domain_provision_failed"("p_domain_id" "uuid", "p_error" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_domain_provision_failed"("p_domain_id" "uuid", "p_error" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_domain_provision_failed"("p_domain_id" "uuid", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_domain_provisioned"("p_domain_id" "uuid", "p_cert_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_domain_provisioned"("p_domain_id" "uuid", "p_cert_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_domain_provisioned"("p_domain_id" "uuid", "p_cert_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_domain_provisioned"("p_domain_id" "uuid", "p_cert_expires_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_domain_verified"("p_domain_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_domain_verified"("p_domain_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_domain_verified"("p_domain_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_domain_verified"("p_domain_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_webhook_delivery_result"("p_delivery_id" "uuid", "p_succeeded" boolean, "p_status_code" integer, "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_webhook_delivery_result"("p_delivery_id" "uuid", "p_succeeded" boolean, "p_status_code" integer, "p_error" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_webhook_delivery_result"("p_delivery_id" "uuid", "p_succeeded" boolean, "p_status_code" integer, "p_error" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_webhook_delivery_result"("p_delivery_id" "uuid", "p_succeeded" boolean, "p_status_code" integer, "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pick_outreach_sender"("p_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_ai_rate_limit_buckets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_ai_rate_limit_buckets"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_ai_rate_limit_buckets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_ai_rate_limit_buckets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_api_idempotency"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_api_idempotency"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_api_idempotency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_api_idempotency"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_api_rate_limit_buckets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_api_rate_limit_buckets"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_api_rate_limit_buckets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_api_rate_limit_buckets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_webhook_event"("p_workspace_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recent_goal_observation_counts"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_ip_address" "text", "p_user_agent" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean, "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_ip_address" "text", "p_user_agent" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean, "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_email_event"("p_message_id" "uuid", "p_event_type" "text", "p_link_id" "uuid", "p_ip_address" "text", "p_user_agent" "text", "p_is_bot" boolean, "p_is_apple_privacy" boolean, "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."relearn_best_send_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."relearn_best_send_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."relearn_best_send_hours"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_sender_failures"("p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_stuck_writing_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_stuck_writing_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_stuck_writing_items"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_api_key"("p_key_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sender_daily_cap"("p_sender_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_goal_status"("p_goal_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_goal_status"("p_goal_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_goal_status"("p_goal_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_goal_status"("p_goal_id" "uuid", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text", "p_created_by_kind" "text", "p_model_used" "text", "p_tokens_used" integer, "p_superseded_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text", "p_created_by_kind" "text", "p_model_used" "text", "p_tokens_used" integer, "p_superseded_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text", "p_created_by_kind" "text", "p_model_used" "text", "p_tokens_used" integer, "p_superseded_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."store_plan_version"("p_goal_id" "uuid", "p_plan" "jsonb", "p_rationale" "text", "p_created_by_kind" "text", "p_model_used" "text", "p_tokens_used" integer, "p_superseded_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."teamhub_check_lead_link_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."teamhub_check_lead_link_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."teamhub_check_lead_link_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."teamhub_mirror_activity_to_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."teamhub_mirror_activity_to_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."teamhub_mirror_activity_to_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."teamhub_sync_lead_on_move"() TO "anon";
GRANT ALL ON FUNCTION "public"."teamhub_sync_lead_on_move"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."teamhub_sync_lead_on_move"() TO "service_role";



GRANT ALL ON FUNCTION "public"."teamhub_user_flow_role"("p_board_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."teamhub_user_flow_role"("p_board_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teamhub_user_flow_role"("p_board_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_automation_goals"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_automation_goals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_automation_goals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_workspace_branding"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_workspace_branding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_workspace_branding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_workspace_memory"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_workspace_memory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_workspace_memory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_jobs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_workflows_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_workflows_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workflows_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_api_key"("p_plaintext" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_api_key"("p_plaintext" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_api_key"("p_plaintext" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_api_key"("p_plaintext" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."workspace_has_flag"("p_workspace_id" "uuid", "p_flag_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."workspace_has_flag"("p_workspace_id" "uuid", "p_flag_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_has_flag"("p_workspace_id" "uuid", "p_flag_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_has_flag"("p_workspace_id" "uuid", "p_flag_key" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."activity_feed" TO "anon";
GRANT ALL ON TABLE "public"."activity_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_feed" TO "service_role";



GRANT ALL ON TABLE "public"."ai_credit_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_credit_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_credit_usage" TO "service_role";



GRANT ALL ON TABLE "public"."ai_messages" TO "anon";
GRANT ALL ON TABLE "public"."ai_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ai_proxy_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_proxy_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_proxy_usage" TO "service_role";



GRANT ALL ON TABLE "public"."ai_rate_limit_buckets" TO "anon";
GRANT ALL ON TABLE "public"."ai_rate_limit_buckets" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_rate_limit_buckets" TO "service_role";



GRANT ALL ON TABLE "public"."ai_threads" TO "anon";
GRANT ALL ON TABLE "public"."ai_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_threads" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."api_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."api_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."api_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."api_rate_limit_buckets" TO "anon";
GRANT ALL ON TABLE "public"."api_rate_limit_buckets" TO "authenticated";
GRANT ALL ON TABLE "public"."api_rate_limit_buckets" TO "service_role";



GRANT ALL ON TABLE "public"."apollo_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."apollo_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."apollo_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."apollo_search_logs" TO "anon";
GRANT ALL ON TABLE "public"."apollo_search_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."apollo_search_logs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_goals" TO "anon";
GRANT ALL ON TABLE "public"."automation_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_goals" TO "service_role";



GRANT ALL ON TABLE "public"."automation_plans" TO "anon";
GRANT ALL ON TABLE "public"."automation_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_plans" TO "service_role";



GRANT ALL ON TABLE "public"."automation_step_runs" TO "anon";
GRANT ALL ON TABLE "public"."automation_step_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_step_runs" TO "service_role";



GRANT ALL ON TABLE "public"."blog_categories" TO "anon";
GRANT ALL ON TABLE "public"."blog_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_categories" TO "service_role";



GRANT ALL ON TABLE "public"."blog_posts" TO "anon";
GRANT ALL ON TABLE "public"."blog_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_posts" TO "service_role";



GRANT ALL ON TABLE "public"."business_members" TO "anon";
GRANT ALL ON TABLE "public"."business_members" TO "authenticated";
GRANT ALL ON TABLE "public"."business_members" TO "service_role";



GRANT ALL ON TABLE "public"."business_profiles" TO "anon";
GRANT ALL ON TABLE "public"."business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_memory" TO "anon";
GRANT ALL ON TABLE "public"."campaign_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_memory" TO "service_role";



GRANT ALL ON TABLE "public"."config_settings" TO "anon";
GRANT ALL ON TABLE "public"."config_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."config_settings" TO "service_role";



GRANT ALL ON TABLE "public"."credit_purchases" TO "anon";
GRANT ALL ON TABLE "public"."credit_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."email_events" TO "anon";
GRANT ALL ON TABLE "public"."email_events" TO "authenticated";
GRANT ALL ON TABLE "public"."email_events" TO "service_role";



GRANT ALL ON TABLE "public"."email_messages" TO "anon";
GRANT ALL ON TABLE "public"."email_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."email_messages" TO "service_role";



GRANT ALL ON TABLE "public"."email_analytics_summary" TO "anon";
GRANT ALL ON TABLE "public"."email_analytics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."email_analytics_summary" TO "service_role";



GRANT ALL ON TABLE "public"."email_dlq" TO "anon";
GRANT ALL ON TABLE "public"."email_dlq" TO "authenticated";
GRANT ALL ON TABLE "public"."email_dlq" TO "service_role";



GRANT ALL ON TABLE "public"."email_links" TO "anon";
GRANT ALL ON TABLE "public"."email_links" TO "authenticated";
GRANT ALL ON TABLE "public"."email_links" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."email_provider_configs" TO "anon";
GRANT ALL ON TABLE "public"."email_provider_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_provider_configs" TO "service_role";



GRANT ALL ON TABLE "public"."email_sequence_runs" TO "anon";
GRANT ALL ON TABLE "public"."email_sequence_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sequence_runs" TO "service_role";



GRANT ALL ON TABLE "public"."email_sequences" TO "anon";
GRANT ALL ON TABLE "public"."email_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."email_validation_log" TO "anon";
GRANT ALL ON TABLE "public"."email_validation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_validation_log" TO "service_role";



GRANT ALL ON TABLE "public"."email_validations" TO "anon";
GRANT ALL ON TABLE "public"."email_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."email_validations" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."generated_assets" TO "anon";
GRANT ALL ON TABLE "public"."generated_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_assets" TO "service_role";



GRANT ALL ON TABLE "public"."guest_contributors" TO "anon";
GRANT ALL ON TABLE "public"."guest_contributors" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_contributors" TO "service_role";



GRANT ALL ON TABLE "public"."guest_post_outreach" TO "anon";
GRANT ALL ON TABLE "public"."guest_post_outreach" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_post_outreach" TO "service_role";



GRANT ALL ON TABLE "public"."imap_poll_state" TO "anon";
GRANT ALL ON TABLE "public"."imap_poll_state" TO "authenticated";
GRANT ALL ON TABLE "public"."imap_poll_state" TO "service_role";



GRANT ALL ON TABLE "public"."import_batches" TO "anon";
GRANT ALL ON TABLE "public"."import_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."import_batches" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_emails" TO "anon";
GRANT ALL ON TABLE "public"."inbound_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_emails" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."integrations" TO "anon";
GRANT ALL ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_line_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_line_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_package_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_package_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_package_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_packages" TO "anon";
GRANT ALL ON TABLE "public"."invoice_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_packages" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."job_events" TO "anon";
GRANT ALL ON TABLE "public"."job_events" TO "authenticated";
GRANT ALL ON TABLE "public"."job_events" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."lead_call_logs" TO "anon";
GRANT ALL ON TABLE "public"."lead_call_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_call_logs" TO "service_role";



GRANT ALL ON TABLE "public"."lead_color_overrides" TO "anon";
GRANT ALL ON TABLE "public"."lead_color_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_color_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."lead_enrichment_jobs" TO "anon";
GRANT ALL ON TABLE "public"."lead_enrichment_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_enrichment_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."lead_meetings" TO "anon";
GRANT ALL ON TABLE "public"."lead_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_meetings" TO "service_role";



GRANT ALL ON TABLE "public"."lead_memory" TO "anon";
GRANT ALL ON TABLE "public"."lead_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_memory" TO "service_role";



GRANT ALL ON TABLE "public"."lead_notes" TO "anon";
GRANT ALL ON TABLE "public"."lead_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_notes" TO "service_role";



GRANT ALL ON TABLE "public"."lead_research_profiles" TO "anon";
GRANT ALL ON TABLE "public"."lead_research_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_research_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."lead_scores" TO "anon";
GRANT ALL ON TABLE "public"."lead_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scores" TO "service_role";



GRANT ALL ON TABLE "public"."lead_stage_colors" TO "anon";
GRANT ALL ON TABLE "public"."lead_stage_colors" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_stage_colors" TO "service_role";



GRANT ALL ON TABLE "public"."lead_tag_assignments" TO "anon";
GRANT ALL ON TABLE "public"."lead_tag_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_tag_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("name") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("role") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";



GRANT ALL ON TABLE "public"."scheduled_emails" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_emails" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."sender_account_secrets" TO "anon";
GRANT ALL ON TABLE "public"."sender_account_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."sender_account_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."sender_accounts" TO "anon";
GRANT ALL ON TABLE "public"."sender_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."sender_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."sequence_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."sequence_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."sequence_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."sequence_steps" TO "anon";
GRANT ALL ON TABLE "public"."sequence_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."sequence_steps" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."social_accounts" TO "anon";
GRANT ALL ON TABLE "public"."social_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."social_post_events" TO "anon";
GRANT ALL ON TABLE "public"."social_post_events" TO "authenticated";
GRANT ALL ON TABLE "public"."social_post_events" TO "service_role";



GRANT ALL ON TABLE "public"."social_post_targets" TO "anon";
GRANT ALL ON TABLE "public"."social_post_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."social_post_targets" TO "service_role";



GRANT ALL ON TABLE "public"."social_posts" TO "anon";
GRANT ALL ON TABLE "public"."social_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_posts" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."support_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."support_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."support_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."support_sessions" TO "anon";
GRANT ALL ON TABLE "public"."support_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."support_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."suppressions" TO "anon";
GRANT ALL ON TABLE "public"."suppressions" TO "authenticated";
GRANT ALL ON TABLE "public"."suppressions" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."team_invites" TO "anon";
GRANT ALL ON TABLE "public"."team_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."team_invites" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_activity" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_activity" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_boards" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_boards" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_card_members" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_card_members" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_card_members" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_cards" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_cards" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_comments" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_comments" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_flow_members" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_flow_members" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_flow_members" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_flow_templates" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_flow_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_flow_templates" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_invites" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_invites" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_item_leads" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_item_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_item_leads" TO "service_role";



GRANT ALL ON TABLE "public"."teamhub_lists" TO "anon";
GRANT ALL ON TABLE "public"."teamhub_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."teamhub_lists" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."tracking_events" TO "anon";
GRANT ALL ON TABLE "public"."tracking_events" TO "authenticated";
GRANT ALL ON TABLE "public"."tracking_events" TO "service_role";



GRANT ALL ON TABLE "public"."tracking_links" TO "anon";
GRANT ALL ON TABLE "public"."tracking_links" TO "authenticated";
GRANT ALL ON TABLE "public"."tracking_links" TO "service_role";



GRANT ALL ON TABLE "public"."usage_events" TO "anon";
GRANT ALL ON TABLE "public"."usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_prompt_versions" TO "anon";
GRANT ALL ON TABLE "public"."user_prompt_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_prompt_versions" TO "service_role";



GRANT ALL ON TABLE "public"."user_prompts" TO "anon";
GRANT ALL ON TABLE "public"."user_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."voip_inbound_routes" TO "anon";
GRANT ALL ON TABLE "public"."voip_inbound_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."voip_inbound_routes" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_endpoints" TO "anon";
GRANT ALL ON TABLE "public"."webhook_endpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_endpoints" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_executions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_executions" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."workspace_ai_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_ai_usage" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_branding" TO "anon";
GRANT ALL ON TABLE "public"."workspace_branding" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_branding" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."workspace_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."workspace_feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invites" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invites" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_memory" TO "anon";
GRANT ALL ON TABLE "public"."workspace_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_memory" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_usage_counters" TO "anon";
GRANT ALL ON TABLE "public"."workspace_usage_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_usage_counters" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































