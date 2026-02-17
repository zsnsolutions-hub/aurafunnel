-- ============================================================
-- Add from_email column to scheduled_emails
-- Tracks which sender address was used for each campaign email
-- ============================================================

ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS from_email TEXT;
