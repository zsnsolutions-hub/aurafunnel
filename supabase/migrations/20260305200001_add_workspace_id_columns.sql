-- Migration: Add workspace_id to all tenant-scoped tables + backfill.
-- Phase A-2 of workspace model rollout.
--
-- Strategy:
-- 1. Backfill workspaces for existing users (creates workspace_id = user.id)
-- 2. Add NULLABLE workspace_id columns
-- 3. Backfill workspace_id from existing ownership columns
-- 4. Set NOT NULL
-- 5. Add indexes

-- ── Step 1: Backfill workspaces for existing users ────────────

INSERT INTO workspaces (id, name, owner_id)
SELECT u.id, COALESCE(p.name, 'My Workspace'), u.id
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE id = u.id)
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members WHERE workspace_id = w.id AND user_id = w.owner_id
)
ON CONFLICT DO NOTHING;

-- ── Step 2: Add workspace_id columns (NULLABLE for zero-downtime) ──

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE user_prompts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE strategy_tasks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE strategy_notes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE email_sequence_runs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

-- ── Step 3: Backfill workspace_id from existing ownership columns ──

UPDATE email_templates SET workspace_id = owner_id WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE integrations SET workspace_id = owner_id WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE webhooks SET workspace_id = owner_id WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE invoices SET workspace_id = owner_id WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE user_prompts SET workspace_id = owner_id WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE social_posts SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE subscriptions SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE leads SET workspace_id = COALESCE(client_id, user_id) WHERE workspace_id IS NULL;
UPDATE workflows SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE social_accounts SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE tracking_links SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE strategy_tasks SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE strategy_notes SET workspace_id = user_id WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE email_sequence_runs SET workspace_id = owner_id WHERE workspace_id IS NULL AND owner_id IS NOT NULL;

-- ── Step 4: Set NOT NULL after backfill ───────────────────────

ALTER TABLE email_templates ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE integrations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE webhooks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE user_prompts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE social_posts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE leads ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workflows ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE social_accounts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE tracking_links ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE strategy_tasks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE strategy_notes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE email_sequence_runs ALTER COLUMN workspace_id SET NOT NULL;

-- ── Step 5: Indexes ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_templates_ws ON email_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integrations_ws ON integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_ws ON webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ws ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_prompts_ws ON user_prompts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_ws ON social_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ws ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_ws ON leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflows_ws ON workflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_ws ON social_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_ws ON tracking_links(workspace_id);
CREATE INDEX IF NOT EXISTS idx_strategy_tasks_ws ON strategy_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_strategy_notes_ws ON strategy_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_seq_runs_ws ON email_sequence_runs(workspace_id);
