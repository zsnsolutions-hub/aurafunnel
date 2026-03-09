-- Add extra_seats column to subscriptions for tracking purchased seats beyond plan base
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extra_seats INTEGER NOT NULL DEFAULT 0;
