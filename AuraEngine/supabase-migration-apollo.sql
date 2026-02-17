-- =============================================
-- AuraFunnel - Apollo Integration Migration
-- Tables: apollo_search_logs, apollo_import_logs
-- Run in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. apollo_search_logs
-- =============================================
CREATE TABLE IF NOT EXISTS apollo_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_params JSONB NOT NULL DEFAULT '{}',
  results_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE apollo_search_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own search logs" ON apollo_search_logs;
CREATE POLICY "Users can view own search logs"
  ON apollo_search_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own search logs" ON apollo_search_logs;
CREATE POLICY "Users can insert own search logs"
  ON apollo_search_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 2. apollo_import_logs
-- =============================================
CREATE TABLE IF NOT EXISTS apollo_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_log_id UUID REFERENCES apollo_search_logs(id) ON DELETE SET NULL,
  total_requested INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  duplicate_details JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE apollo_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own import logs" ON apollo_import_logs;
CREATE POLICY "Users can view own import logs"
  ON apollo_import_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own import logs" ON apollo_import_logs;
CREATE POLICY "Users can insert own import logs"
  ON apollo_import_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 3. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_apollo_search_logs_user_id ON apollo_search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_apollo_import_logs_user_id ON apollo_import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_apollo_import_logs_search_log_id ON apollo_import_logs(search_log_id);
