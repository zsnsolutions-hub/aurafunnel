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
