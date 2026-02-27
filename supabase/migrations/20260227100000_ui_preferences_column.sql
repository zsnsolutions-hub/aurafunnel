-- Add ui_preferences JSONB column to profiles for persisting UI mode across devices
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;
