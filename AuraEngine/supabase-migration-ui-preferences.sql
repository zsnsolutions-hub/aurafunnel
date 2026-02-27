-- Phase 6: UI Preferences persistence
-- Run this in the Supabase SQL Editor if not using CLI migrations

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;
