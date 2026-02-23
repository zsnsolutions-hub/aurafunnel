-- Fix: team creation fails because .insert().select() requires the new row
-- to pass SELECT RLS, but the only SELECT policy checks team_members which
-- hasn't been populated yet at insert time.
-- Add an owner-based SELECT policy so the creator can read back the new row.

DO $$ BEGIN
  CREATE POLICY "Team owner can view own team"
    ON teams FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
