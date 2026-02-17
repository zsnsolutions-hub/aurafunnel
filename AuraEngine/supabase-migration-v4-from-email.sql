-- ============================================================
-- Add from_email column to scheduled_emails
-- Tracks which sender address was used for each campaign email
-- ============================================================

ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS from_email TEXT;

-- Track which email provider (smtp, sendgrid, gmail) was used for each scheduled email
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS provider TEXT;
