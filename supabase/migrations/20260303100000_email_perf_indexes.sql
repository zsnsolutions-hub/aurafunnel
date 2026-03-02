-- ══════════════════════════════════════════════════════════════
-- PR-5: Critical performance indexes for email processing & analytics
-- ══════════════════════════════════════════════════════════════
--
-- Three hot query paths audited:
--
--   1. process-scheduled-emails cron (.eq status pending, .lte scheduled_at)
--      → ALREADY OPTIMAL via partial index idx_scheduled_emails_pending.
--        No change needed.
--
--   2. Analytics email_events (.in message_id, .eq is_bot, .in event_type, .gte created_at)
--      → Existing (message_id, event_type, is_bot) forces heap recheck on
--        created_at range and mis-orders is_bot after event_type.
--        New 4-column composite eliminates Filter + Recheck rows.
--
--   3. Per-lead engagement (.eq lead_id, .order created_at DESC)
--      → Existing single-column (lead_id) forces a Sort node.
--        New composite provides pre-sorted results.
--
-- Safety: Tables are small (early-stage product). Regular CREATE INDEX
-- used here. For future large-table changes, run CONCURRENTLY outside
-- a transaction:
--   CREATE INDEX CONCURRENTLY idx_name ON table(...);
-- ══════════════════════════════════════════════════════════════


-- ── 1. email_messages(lead_id, created_at DESC) ─────────────
--
-- Hot query (fetchLeadEmailEngagement, ~every lead profile open):
--   SELECT id, status, created_at FROM email_messages
--   WHERE lead_id = $1 ORDER BY created_at DESC
--
-- Before: Index Scan using idx_email_messages_lead_id
--           → Sort (created_at DESC)    ← eliminated
-- After:  Index Scan (Backward) using idx_email_messages_lead_created
--           (pre-sorted, no Sort node)
--
CREATE INDEX IF NOT EXISTS idx_email_messages_lead_created
  ON email_messages(lead_id, created_at DESC);

-- Superseded: leading column identical, composite strictly better.
DROP INDEX IF EXISTS idx_email_messages_lead_id;


-- ── 2. email_events(message_id, is_bot, event_type, created_at) ─
--
-- Hot query (fetchBatchEmailSummary, ~every lead list render):
--   SELECT message_id, event_type FROM email_events
--   WHERE message_id IN (...) AND is_bot = false
--     AND created_at >= $thirtyDaysAgo AND event_type IN ('open','click')
--
-- Before: Index Scan using idx_email_events_message_type_bot
--           Index Cond: message_id = ANY(...)
--           Filter: is_bot = false AND created_at >= ...  ← heap recheck
-- After:  Index Scan using idx_email_events_msg_bot_type_ts
--           Index Cond: message_id = ANY(...)
--             AND is_bot = false AND event_type = ANY(...)
--             AND created_at >= ...                       ← all in index
--
-- Column order rationale:
--   message_id (equality/IN) → is_bot (equality, 2 values) →
--   event_type (equality/IN, 6 values) → created_at (range scan)
-- Range column last maximizes index condition pushdown.
--
CREATE INDEX IF NOT EXISTS idx_email_events_msg_bot_type_ts
  ON email_events(message_id, is_bot, event_type, created_at);

-- Superseded: all 3 original columns present in new composite.
DROP INDEX IF EXISTS idx_email_events_message_type_bot;

-- Superseded: leading column covered by new composite.
DROP INDEX IF EXISTS idx_email_events_message_id;

-- Superseded: no query filters by event_type alone; covered as 3rd col.
DROP INDEX IF EXISTS idx_email_events_type;


-- ── 3. scheduled_emails campaign history ────────────────────
--
-- Hot query (fetchCampaignHistory, campaigns tab):
--   SELECT sequence_id, subject, status, ... FROM scheduled_emails
--   WHERE owner_id = $1 AND sequence_id IS NOT NULL
--   ORDER BY created_at DESC
--
-- Before: Index Scan using idx_scheduled_emails_owner
--           Filter: sequence_id IS NOT NULL   ← heap filter
--           → Sort (created_at DESC)          ← eliminated
-- After:  Index Scan using idx_sched_emails_owner_campaign
--           (partial index eliminates NULL rows, pre-sorted)
--
CREATE INDEX IF NOT EXISTS idx_sched_emails_owner_campaign
  ON scheduled_emails(owner_id, created_at DESC)
  WHERE sequence_id IS NOT NULL;
