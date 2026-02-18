-- ============================================================
-- Automation Engine Tables
-- workflows + workflow_executions + RLS + indexes
-- ============================================================

-- ─── Workflows ───
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID,
  name        TEXT NOT NULL DEFAULT 'Untitled Workflow',
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
  nodes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats       JSONB NOT NULL DEFAULT '{"leadsProcessed":0,"conversionRate":0,"timeSavedHrs":0,"roi":0}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Workflow Executions ───
CREATE TABLE IF NOT EXISTS workflow_executions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  current_node  TEXT,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lead_id ON workflow_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);

-- ─── RLS ───
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Users can see own workflows
CREATE POLICY workflows_select ON workflows FOR SELECT USING (
  auth.uid() = user_id
);
CREATE POLICY workflows_insert ON workflows FOR INSERT WITH CHECK (
  auth.uid() = user_id
);
CREATE POLICY workflows_update ON workflows FOR UPDATE USING (
  auth.uid() = user_id
);
CREATE POLICY workflows_delete ON workflows FOR DELETE USING (
  auth.uid() = user_id
);

-- Users can see own executions
CREATE POLICY executions_select ON workflow_executions FOR SELECT USING (
  auth.uid() = user_id
);
CREATE POLICY executions_insert ON workflow_executions FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- ─── Auto-update updated_at on workflows ───
CREATE OR REPLACE FUNCTION update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_workflows_updated_at();
