-- ============================================================
-- Super Admin Support Access System — Migration
-- ============================================================
-- Run in the Supabase SQL editor after backing up.
-- Adds: is_super_admin column, helper functions, support_sessions,
--        support_audit_logs, and session-scoped RLS policies.
-- ============================================================

-- 1. Add is_super_admin flag to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Helper: is_super_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND is_super_admin = true
  );
$$;

-- 3. Helper: has_active_support_session(target_id)
CREATE OR REPLACE FUNCTION public.has_active_support_session(target_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
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

-- ============================================================
-- 4. support_sessions table
-- ============================================================
CREATE TABLE IF NOT EXISTS support_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL DEFAULT '',
  access_level  TEXT NOT NULL DEFAULT 'read_only'
                  CHECK (access_level IN ('read_only', 'debug')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  ended_at      TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_sessions_admin
  ON support_sessions(admin_id, is_active);
CREATE INDEX IF NOT EXISTS idx_support_sessions_target
  ON support_sessions(target_user_id, is_active);

-- RLS
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage their own sessions"
  ON support_sessions FOR ALL
  USING (public.is_super_admin() AND admin_id = auth.uid())
  WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

-- ============================================================
-- 5. support_audit_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS support_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES support_sessions(id) ON DELETE SET NULL,
  admin_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  details         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_audit_logs_session
  ON support_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_support_audit_logs_admin
  ON support_audit_logs(admin_id, created_at DESC);

ALTER TABLE support_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can insert audit logs"
  ON support_audit_logs FOR INSERT
  WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

CREATE POLICY "Super admins can view audit logs"
  ON support_audit_logs FOR SELECT
  USING (public.is_super_admin());

-- ============================================================
-- 6. Session-scoped RLS: allow super admins with active
--    support sessions to SELECT target user data
-- ============================================================

-- integrations
CREATE POLICY "Support session: view target integrations"
  ON integrations FOR SELECT
  USING (public.has_active_support_session(owner_id));

-- email_provider_configs
CREATE POLICY "Support session: view target email configs"
  ON email_provider_configs FOR SELECT
  USING (public.has_active_support_session(owner_id));

-- webhooks
CREATE POLICY "Support session: view target webhooks"
  ON webhooks FOR SELECT
  USING (public.has_active_support_session(owner_id));

-- email_messages
CREATE POLICY "Support session: view target email messages"
  ON email_messages FOR SELECT
  USING (public.has_active_support_session(owner_id));

-- subscriptions
CREATE POLICY "Support session: view target subscriptions"
  ON subscriptions FOR SELECT
  USING (public.has_active_support_session(user_id));

-- leads
CREATE POLICY "Support session: view target leads"
  ON leads FOR SELECT
  USING (public.has_active_support_session(client_id));

-- ============================================================
-- 7. Seed config_settings toggle
-- ============================================================
INSERT INTO config_settings (key, value)
VALUES ('support_mode_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
