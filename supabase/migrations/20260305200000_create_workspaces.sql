-- Migration: Create workspace tables, membership helper, and auto-create trigger.
-- Phase A-1 of workspace model rollout.

-- ── Workspaces table ──────────────────────────────────────────

CREATE TABLE workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL DEFAULT 'My Workspace',
  slug       TEXT UNIQUE,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier  TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Workspace members ─────────────────────────────────────────

CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'member',
  invited_by   UUID REFERENCES auth.users(id),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- ── Helper: check workspace membership ────────────────────────

CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;

-- ── Workspace policies ────────────────────────────────────────

-- Members can read their workspaces
CREATE POLICY "workspace_select" ON workspaces FOR SELECT
  USING (is_workspace_member(id));

-- Only owner can update workspace
CREATE POLICY "workspace_update" ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- ── Membership policies ───────────────────────────────────────

-- Members can read other members in their workspace
CREATE POLICY "members_select" ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Only owners/admins can add members
CREATE POLICY "members_insert" ON workspace_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ── Auto-create workspace on user signup ──────────────────────

CREATE OR REPLACE FUNCTION handle_new_user_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workspaces (id, name, owner_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Workspace'), NEW.id);

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_workspace();
