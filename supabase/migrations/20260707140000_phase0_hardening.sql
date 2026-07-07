-- ============================================================================
-- Phase 0 — security & compliance hardening (verified against the REAL schema)
-- ============================================================================
-- Two genuinely-open issues confirmed against the live migrations:
--   1. profiles self-privilege-escalation: the "Update Own Profile" policy has
--      no WITH CHECK / column guard, so any CLIENT can set their own
--      role='ADMIN' / is_super_admin=true / credits / plan / status.
--   2. There is no suppression (do-not-contact) table for the send pipeline.
--
-- (The earlier audit also flagged audit_logs cross-tenant reads, WITH CHECK(true)
--  inserts, and team hijack — but the real migrations already fixed those, so
--  they are intentionally NOT touched here.)
--
-- Idempotent. The privesc fix is a column-level trigger that blocks NON-admins
-- from changing privileged columns (so the existing admin UIs, which do direct
-- profiles.update({role/status}), keep working — no frontend change required).
-- ============================================================================

-- ─── 1. Block privilege-column escalation by non-admins ─────────────────────
CREATE OR REPLACE FUNCTION public.enforce_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER              -- must see the real current_user, not the definer
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

DROP TRIGGER IF EXISTS trg_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER trg_profiles_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privileged_columns();

-- ─── 2. Suppression list (do-not-contact) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppressions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email       text NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('unsub','bounce','complaint','manual','invalid')),
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, email)
);

CREATE INDEX IF NOT EXISTS idx_suppressions_owner_email ON public.suppressions (owner_id, lower(email));

ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Owner can read suppressions"
    ON public.suppressions FOR SELECT USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owner can add suppressions"
    ON public.suppressions FOR INSERT WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owner can remove suppressions"
    ON public.suppressions FOR DELETE USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The send worker / unsubscribe handler write here with the service_role key
-- (bypasses RLS), attributing rows to the correct owner_id.
