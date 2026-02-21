-- =============================================
-- Strategy Hub & Team Collaboration Tables
-- Creates strategy_tasks, strategy_notes, teams,
-- team_members, team_invites with full RLS
-- =============================================

-- 1. Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- 2. Team Members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- 3. Team Invites table
CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  UNIQUE (team_id, email)
);

ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

-- 4. Helper: is_team_member()
CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members WHERE team_id = check_team_id AND user_id = auth.uid()
  );
$$;

-- 5. Strategy Tasks table (all columns included)
CREATE TABLE IF NOT EXISTS strategy_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  deadline DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'todo'
);

-- Add constraint for status values (safe if already exists)
DO $$ BEGIN
  ALTER TABLE strategy_tasks ADD CONSTRAINT strategy_tasks_status_check
    CHECK (status IN ('todo', 'in_progress', 'done'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_strategy_tasks_user_id ON strategy_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_strategy_tasks_status ON strategy_tasks(status);
ALTER TABLE strategy_tasks ENABLE ROW LEVEL SECURITY;

-- 6. Strategy Notes table (all columns included)
CREATE TABLE IF NOT EXISTS strategy_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  lead_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  author_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_strategy_notes_user_id ON strategy_notes(user_id);
ALTER TABLE strategy_notes ENABLE ROW LEVEL SECURITY;

-- 7. Audit logs team_id column (safe if table exists)
DO $$ BEGIN
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- RLS Policies (all use DO/EXCEPTION for idempotency)
-- =============================================

-- teams
DO $$ BEGIN
  CREATE POLICY "Team members can view their team"
    ON teams FOR SELECT USING (public.is_team_member(id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can create teams"
    ON teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team owner can update team"
    ON teams FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- team_members
DO $$ BEGIN
  CREATE POLICY "Team members can view team members"
    ON team_members FOR SELECT USING (public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert team members"
    ON team_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete team members"
    ON team_members FOR DELETE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- team_invites
DO $$ BEGIN
  CREATE POLICY "Inviters can view sent invites"
    ON team_invites FOR SELECT USING (auth.uid() = invited_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Invitees can view invites to their email"
    ON team_invites FOR SELECT
    USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team members can create invites"
    ON team_invites FOR INSERT WITH CHECK (public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Invitees can update invite status"
    ON team_invites FOR UPDATE
    USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- strategy_tasks (own)
DO $$ BEGIN
  CREATE POLICY "Users can select own strategy tasks"
    ON strategy_tasks FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own strategy tasks"
    ON strategy_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own strategy tasks"
    ON strategy_tasks FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own strategy tasks"
    ON strategy_tasks FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- strategy_tasks (team)
DO $$ BEGIN
  CREATE POLICY "Team members can view team tasks"
    ON strategy_tasks FOR SELECT
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team members can update team tasks"
    ON strategy_tasks FOR UPDATE
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team members can insert team tasks"
    ON strategy_tasks FOR INSERT
    WITH CHECK (team_id IS NULL OR public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- strategy_notes (own)
DO $$ BEGIN
  CREATE POLICY "Users can select own strategy notes"
    ON strategy_notes FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own strategy notes"
    ON strategy_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own strategy notes"
    ON strategy_notes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- strategy_notes (team)
DO $$ BEGIN
  CREATE POLICY "Team members can view team notes"
    ON strategy_notes FOR SELECT
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team members can insert team notes"
    ON strategy_notes FOR INSERT
    WITH CHECK (team_id IS NULL OR public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- audit_logs (team)
DO $$ BEGIN
  CREATE POLICY "Team members can view team audit logs"
    ON audit_logs FOR SELECT
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
