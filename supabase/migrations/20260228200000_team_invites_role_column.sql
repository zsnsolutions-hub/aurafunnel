-- Add role column to team_invites so inviters can assign a role upfront
ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin', 'member'));
