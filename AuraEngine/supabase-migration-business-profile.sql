-- Add businessProfile JSONB column to profiles table
-- Stores the client's business context for AI personalization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'businessProfile'
  ) THEN
    ALTER TABLE profiles ADD COLUMN "businessProfile" JSONB DEFAULT NULL;
  END IF;
END $$;
