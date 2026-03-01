-- Performance indexes for Scaliyo
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- These use CONCURRENTLY to avoid locking tables during creation.

-- Email analytics hotspot
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_events_message_type_bot
  ON email_events(message_id, event_type, is_bot);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_messages_owner_created
  ON email_messages(owner_id, created_at DESC);

-- Lead analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_client_created
  ON leads(client_id, created_at DESC);

-- Audit trail
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs(user_id, created_at DESC);

-- Blog content analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blog_posts_author_created
  ON blog_posts(author_id, created_at DESC);

-- Email links performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_links_message_clicks
  ON email_links(message_id, click_count DESC);
