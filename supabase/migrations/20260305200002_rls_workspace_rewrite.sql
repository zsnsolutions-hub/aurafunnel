-- Migration: Rewrite all tenant-scoped RLS policies to use workspace membership.
-- Phase A-3 of workspace model rollout.
--
-- Pattern: drop old owner_id/user_id policies → create workspace-based policies
-- using the is_workspace_member() helper from 20260305200000.

-- ═══════════════════════════════════════════════════════════════
-- email_templates
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "read_default_templates" ON email_templates;
DROP POLICY IF EXISTS "read_own_templates" ON email_templates;
DROP POLICY IF EXISTS "insert_own_templates" ON email_templates;
DROP POLICY IF EXISTS "update_own_templates" ON email_templates;
DROP POLICY IF EXISTS "delete_own_templates" ON email_templates;

CREATE POLICY "ws_email_templates_select" ON email_templates FOR SELECT
  USING (is_workspace_member(workspace_id) OR owner_id IS NULL);
CREATE POLICY "ws_email_templates_insert" ON email_templates FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_email_templates_update" ON email_templates FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_email_templates_delete" ON email_templates FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- integrations
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can insert own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can update own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can delete own integrations" ON integrations;

CREATE POLICY "ws_integrations_select" ON integrations FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_integrations_insert" ON integrations FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_integrations_update" ON integrations FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_integrations_delete" ON integrations FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- webhooks
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view own webhooks" ON webhooks;
DROP POLICY IF EXISTS "Users can insert own webhooks" ON webhooks;
DROP POLICY IF EXISTS "Users can update own webhooks" ON webhooks;
DROP POLICY IF EXISTS "Users can delete own webhooks" ON webhooks;

CREATE POLICY "ws_webhooks_select" ON webhooks FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_webhooks_insert" ON webhooks FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_webhooks_update" ON webhooks FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_webhooks_delete" ON webhooks FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- invoices
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;

CREATE POLICY "ws_invoices_select" ON invoices FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_invoices_insert" ON invoices FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_invoices_update" ON invoices FOR UPDATE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- user_prompts
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "read_default_prompts" ON user_prompts;
DROP POLICY IF EXISTS "read_own_prompts" ON user_prompts;
DROP POLICY IF EXISTS "insert_own_prompts" ON user_prompts;
DROP POLICY IF EXISTS "update_own_prompts" ON user_prompts;
DROP POLICY IF EXISTS "delete_own_prompts" ON user_prompts;

CREATE POLICY "ws_user_prompts_select" ON user_prompts FOR SELECT
  USING (is_workspace_member(workspace_id) OR owner_id IS NULL);
CREATE POLICY "ws_user_prompts_insert" ON user_prompts FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_user_prompts_update" ON user_prompts FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_user_prompts_delete" ON user_prompts FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- social_posts
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users manage own social posts" ON social_posts;
DROP POLICY IF EXISTS "Users can view own social posts" ON social_posts;
DROP POLICY IF EXISTS "Users can insert own social posts" ON social_posts;
DROP POLICY IF EXISTS "Users can update own social posts" ON social_posts;
DROP POLICY IF EXISTS "Users can delete own social posts" ON social_posts;

CREATE POLICY "ws_social_posts_select" ON social_posts FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_social_posts_insert" ON social_posts FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_social_posts_update" ON social_posts FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_social_posts_delete" ON social_posts FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- subscriptions
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "View Own Subscription" ON subscriptions;

CREATE POLICY "ws_subscriptions_select" ON subscriptions FOR SELECT
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- leads
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "View Own Leads" ON leads;
DROP POLICY IF EXISTS "Manage Own Leads" ON leads;
DROP POLICY IF EXISTS "Admin View All Leads" ON leads;

CREATE POLICY "ws_leads_select" ON leads FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_leads_insert" ON leads FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_leads_update" ON leads FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_leads_delete" ON leads FOR DELETE
  USING (is_workspace_member(workspace_id));

-- Admin override: admins can still read all leads
CREATE POLICY "ws_leads_admin_select" ON leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- workflows
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS workflows_select ON workflows;
DROP POLICY IF EXISTS workflows_insert ON workflows;
DROP POLICY IF EXISTS workflows_update ON workflows;
DROP POLICY IF EXISTS workflows_delete ON workflows;

CREATE POLICY "ws_workflows_select" ON workflows FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_workflows_insert" ON workflows FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_workflows_update" ON workflows FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_workflows_delete" ON workflows FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- social_accounts
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users manage own social accounts" ON social_accounts;
DROP POLICY IF EXISTS "Users can view own social accounts" ON social_accounts;
DROP POLICY IF EXISTS "Users can insert own social accounts" ON social_accounts;
DROP POLICY IF EXISTS "Users can update own social accounts" ON social_accounts;
DROP POLICY IF EXISTS "Users can delete own social accounts" ON social_accounts;

CREATE POLICY "ws_social_accounts_select" ON social_accounts FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_social_accounts_insert" ON social_accounts FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_social_accounts_update" ON social_accounts FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_social_accounts_delete" ON social_accounts FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- tracking_links
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users manage own tracking links" ON tracking_links;
DROP POLICY IF EXISTS "Users can view own tracking links" ON tracking_links;
DROP POLICY IF EXISTS "Users can insert own tracking links" ON tracking_links;
DROP POLICY IF EXISTS "Users can update own tracking links" ON tracking_links;

CREATE POLICY "ws_tracking_links_select" ON tracking_links FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_tracking_links_insert" ON tracking_links FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_tracking_links_update" ON tracking_links FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_tracking_links_delete" ON tracking_links FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- strategy_tasks
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can select own strategy tasks" ON strategy_tasks;
DROP POLICY IF EXISTS "Users can insert own strategy tasks" ON strategy_tasks;
DROP POLICY IF EXISTS "Users can update own strategy tasks" ON strategy_tasks;
DROP POLICY IF EXISTS "Users can delete own strategy tasks" ON strategy_tasks;
DROP POLICY IF EXISTS "Team members can view team tasks" ON strategy_tasks;
DROP POLICY IF EXISTS "Team members can update team tasks" ON strategy_tasks;
DROP POLICY IF EXISTS "Team members can insert team tasks" ON strategy_tasks;

CREATE POLICY "ws_strategy_tasks_select" ON strategy_tasks FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_strategy_tasks_insert" ON strategy_tasks FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_strategy_tasks_update" ON strategy_tasks FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_strategy_tasks_delete" ON strategy_tasks FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- strategy_notes
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can select own strategy notes" ON strategy_notes;
DROP POLICY IF EXISTS "Users can insert own strategy notes" ON strategy_notes;
DROP POLICY IF EXISTS "Users can delete own strategy notes" ON strategy_notes;
DROP POLICY IF EXISTS "Team members can view team notes" ON strategy_notes;
DROP POLICY IF EXISTS "Team members can insert team notes" ON strategy_notes;

CREATE POLICY "ws_strategy_notes_select" ON strategy_notes FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_strategy_notes_insert" ON strategy_notes FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_strategy_notes_delete" ON strategy_notes FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- email_sequence_runs
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view own runs" ON email_sequence_runs;
DROP POLICY IF EXISTS "Users can insert own runs" ON email_sequence_runs;
DROP POLICY IF EXISTS "Users can update own runs" ON email_sequence_runs;
DROP POLICY IF EXISTS "Service role full access on runs" ON email_sequence_runs;

CREATE POLICY "ws_email_runs_select" ON email_sequence_runs FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_email_runs_insert" ON email_sequence_runs FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_email_runs_update" ON email_sequence_runs FOR UPDATE
  USING (is_workspace_member(workspace_id));
-- Service role bypasses RLS — no explicit policy needed

-- ═══════════════════════════════════════════════════════════════
-- jobs (already has workspace_id — just swap policy)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS jobs_select ON jobs;
DROP POLICY IF EXISTS jobs_admin_select ON jobs;
DROP POLICY IF EXISTS jobs_insert ON jobs;

CREATE POLICY "ws_jobs_select" ON jobs FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_jobs_insert" ON jobs FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_jobs_update" ON jobs FOR UPDATE
  USING (is_workspace_member(workspace_id));

-- Admin override for jobs
CREATE POLICY "ws_jobs_admin_select" ON jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
    )
  );
