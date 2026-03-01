-- Performance indexes for common query patterns

-- Email analytics hotspot
CREATE INDEX IF NOT EXISTS idx_email_events_message_type_bot
  ON email_events(message_id, event_type, is_bot);
CREATE INDEX IF NOT EXISTS idx_email_messages_owner_created
  ON email_messages(owner_id, created_at DESC);

-- Lead analytics
CREATE INDEX IF NOT EXISTS idx_leads_client_created
  ON leads(client_id, created_at DESC);

-- Audit trail
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs(user_id, created_at DESC);

-- Blog content analytics
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_created
  ON blog_posts(author_id, created_at DESC);

-- Email links performance
CREATE INDEX IF NOT EXISTS idx_email_links_message_clicks
  ON email_links(message_id, click_count DESC);
