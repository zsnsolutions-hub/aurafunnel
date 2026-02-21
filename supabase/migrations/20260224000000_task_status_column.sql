-- Add status column to strategy_tasks for kanban board
ALTER TABLE strategy_tasks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo'
  CHECK (status IN ('todo', 'in_progress', 'done'));

-- Backfill from existing completed column
UPDATE strategy_tasks SET status = 'done' WHERE completed = true;
UPDATE strategy_tasks SET status = 'todo' WHERE completed = false;

-- Index for fast column queries
CREATE INDEX IF NOT EXISTS idx_strategy_tasks_status ON strategy_tasks(status);
