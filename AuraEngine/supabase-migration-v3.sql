-- =============================================
-- AuraFunnel - Migration v3
-- Adds signup trigger + profile auto-creation
-- Run in Supabase SQL Editor
-- =============================================

-- 1. Auto-create profile + subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, credits_total, credits_used)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'CLIENT',
    'Starter',
    500,
    0
  );

  INSERT INTO public.subscriptions (user_id, plan_name, plan, status, current_period_end, expires_at)
  VALUES (
    NEW.id,
    'Starter',
    'Starter',
    'active',
    now() + interval '30 days',
    now() + interval '30 days'
  );

  RETURN NEW;
END;
$$;

-- 2. Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Allow profiles to insert themselves (needed for trigger)
-- The trigger runs as SECURITY DEFINER so this isn't strictly needed,
-- but adding a service-role friendly policy for safety
DO $$ BEGIN
  CREATE POLICY "Service can insert profiles"
    ON profiles FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service can insert subscriptions"
    ON subscriptions FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Allow authenticated users to insert audit_logs
DO $$ BEGIN
  CREATE POLICY "Authenticated insert audit_logs"
    ON audit_logs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- Strategy Hub Tables
-- =============================================

-- 5. Strategy Tasks table
CREATE TABLE IF NOT EXISTS strategy_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  deadline DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_tasks_user_id ON strategy_tasks(user_id);

ALTER TABLE strategy_tasks ENABLE ROW LEVEL SECURITY;

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

-- 6. Strategy Notes table
CREATE TABLE IF NOT EXISTS strategy_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  lead_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_notes_user_id ON strategy_notes(user_id);

ALTER TABLE strategy_notes ENABLE ROW LEVEL SECURITY;

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

-- =============================================
-- Team Collaboration Tables
-- =============================================

-- 7. Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- 8. Team Members table
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

-- 9. Team Invites table
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

-- ── Helper Function: is_team_member ──
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

-- ── RLS: teams ──
DO $$ BEGIN
  CREATE POLICY "Team members can view their team"
    ON teams FOR SELECT
    USING (public.is_team_member(id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can create teams"
    ON teams FOR INSERT
    WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team owner can update team"
    ON teams FOR UPDATE
    USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS: team_members ──
DO $$ BEGIN
  CREATE POLICY "Team members can view team members"
    ON team_members FOR SELECT
    USING (public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert team members"
    ON team_members FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete team members"
    ON team_members FOR DELETE
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS: team_invites ──
DO $$ BEGIN
  CREATE POLICY "Inviters can view sent invites"
    ON team_invites FOR SELECT
    USING (auth.uid() = invited_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Invitees can view invites to their email"
    ON team_invites FOR SELECT
    USING (
      email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Team members can create invites"
    ON team_invites FOR INSERT
    WITH CHECK (public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Invitees can update invite status"
    ON team_invites FOR UPDATE
    USING (
      email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- ALTER existing tables for team support
-- =============================================

-- 10. Add team columns to strategy_tasks
ALTER TABLE strategy_tasks ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE strategy_tasks ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- 11. Add team columns to strategy_notes
ALTER TABLE strategy_notes ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE strategy_notes ADD COLUMN IF NOT EXISTS author_name TEXT;

-- 12. Add team column to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- =============================================
-- Team-aware RLS policies (additive)
-- =============================================

-- ── leads: team SELECT ──
DO $$ BEGIN
  CREATE POLICY "Team members can view team leads"
    ON leads FOR SELECT
    USING (
      client_id IN (
        SELECT tm2.user_id FROM team_members tm1
        JOIN team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── leads: team UPDATE ──
DO $$ BEGIN
  CREATE POLICY "Team members can update team leads"
    ON leads FOR UPDATE
    USING (
      client_id IN (
        SELECT tm2.user_id FROM team_members tm1
        JOIN team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── strategy_tasks: team SELECT ──
DO $$ BEGIN
  CREATE POLICY "Team members can view team tasks"
    ON strategy_tasks FOR SELECT
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── strategy_tasks: team UPDATE ──
DO $$ BEGIN
  CREATE POLICY "Team members can update team tasks"
    ON strategy_tasks FOR UPDATE
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── strategy_tasks: team INSERT ──
DO $$ BEGIN
  CREATE POLICY "Team members can insert team tasks"
    ON strategy_tasks FOR INSERT
    WITH CHECK (team_id IS NULL OR public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── strategy_notes: team SELECT ──
DO $$ BEGIN
  CREATE POLICY "Team members can view team notes"
    ON strategy_notes FOR SELECT
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── strategy_notes: team INSERT ──
DO $$ BEGIN
  CREATE POLICY "Team members can insert team notes"
    ON strategy_notes FOR INSERT
    WITH CHECK (team_id IS NULL OR public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── audit_logs: team SELECT ──
DO $$ BEGIN
  CREATE POLICY "Team members can view team audit logs"
    ON audit_logs FOR SELECT
    USING (team_id IS NOT NULL AND public.is_team_member(team_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
