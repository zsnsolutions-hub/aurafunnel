-- ============================================================
-- Hardening Sprint: Additional Performance Indexes
-- ============================================================

-- ── Leads: workspace + status for filtered lists ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_workspace_status
  ON leads (workspace_id, status);

-- ── Leads: workspace + score for priority prospect queries ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_workspace_score
  ON leads (workspace_id, lead_score DESC NULLS LAST);

-- ── Email messages: workspace + status for outbox views ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_messages_workspace_status
  ON email_messages (workspace_id, status);

-- ── AI messages: thread lookup (hot path during chat) ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_messages_thread_created
  ON ai_messages (thread_id, created_at ASC);

-- ── AI threads: workspace + updated for thread list ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_threads_workspace_updated
  ON ai_threads (workspace_id, updated_at DESC);

-- ── Invoices: owner + status for invoice list page ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_owner_status
  ON invoices (owner_id, status);

-- ── Sender accounts: workspace lookup ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sender_accounts_workspace
  ON sender_accounts (workspace_id);

-- ── Social posts: workspace + scheduled time for scheduler ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_posts_workspace_scheduled
  ON social_posts (workspace_id, scheduled_at)
  WHERE status = 'scheduled';

-- ── Automation workflows: workspace lookup ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_workflows_workspace
  ON automation_workflows (workspace_id);

-- ── Idempotency keys: TTL cleanup (created_at for cron purge) ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_keys_ttl
  ON idempotency_keys (created_at)
  WHERE created_at < now() - interval '7 days';
