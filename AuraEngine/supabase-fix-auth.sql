-- =============================================
-- AuraFunnel - Auth Fix
-- Fixes profile creation trigger + subscription FK
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Fix subscriptions FK: point to profiles(id) instead of auth.users(id)
--    This allows PostgREST to detect the join for:
--    .from('profiles').select('*, subscription:subscriptions(*)')
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Fix audit_logs FK: point to profiles(id) instead of auth.users(id)
--    This allows PostgREST to detect the join for:
--    .from('audit_logs').select('..., profiles(name, email)')
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. Fix leads FK: point client_id to profiles(id)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_client_id_fkey;
ALTER TABLE leads
  ADD CONSTRAINT leads_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. Auto-create profile + subscription on signup
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

-- 4. Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Broad insert policies (trigger runs as SECURITY DEFINER but adding for safety)
DO $$ BEGIN
  CREATE POLICY "Service can insert profiles"
    ON profiles FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service can insert subscriptions"
    ON subscriptions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Manually create profile for any existing auth users that are missing one
INSERT INTO profiles (id, email, name, role, plan, credits_total, credits_used)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', ''),
  'CLIENT',
  'Starter',
  500,
  0
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 7. Create subscriptions for any profiles missing one
INSERT INTO subscriptions (user_id, plan_name, plan, status, current_period_end, expires_at)
SELECT
  p.id,
  'Starter',
  'Starter',
  'active',
  now() + interval '30 days',
  now() + interval '30 days'
FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id
WHERE s.id IS NULL;
