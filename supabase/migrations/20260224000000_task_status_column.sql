-- Add status column to strategy_tasks for kanban board
-- Wrapped in DO block so it's safe if table doesn't exist yet
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategy_tasks') THEN
    ALTER TABLE strategy_tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo';

    -- Add check constraint safely
    BEGIN
      ALTER TABLE strategy_tasks ADD CONSTRAINT strategy_tasks_status_check
        CHECK (status IN ('todo', 'in_progress', 'done'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Backfill from existing completed column
    UPDATE strategy_tasks SET status = 'done' WHERE completed = true AND status = 'todo';

    -- Index for fast column queries
    CREATE INDEX IF NOT EXISTS idx_strategy_tasks_status ON strategy_tasks(status);
  END IF;
END $$;
