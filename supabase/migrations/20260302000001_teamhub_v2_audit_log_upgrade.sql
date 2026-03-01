-- ====================================================
-- Team Hub v2 Migration 2: Audit Log Normalization
-- ====================================================

-- C1. Add structured columns to audit_logs (backward-compatible, all nullable)
DO $$ BEGIN
  ALTER TABLE public.audit_logs ADD COLUMN entity_type TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.audit_logs ADD COLUMN entity_id UUID;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.audit_logs ADD COLUMN workspace_id UUID;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.audit_logs ADD COLUMN payload JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- C2. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON public.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- C3. Trigger function: mirror teamhub_activity → audit_logs
CREATE OR REPLACE FUNCTION public.teamhub_mirror_activity_to_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id UUID;
  v_entity_type TEXT;
  v_entity_id UUID;
BEGIN
  -- Look up workspace_id from the board
  SELECT workspace_id INTO v_workspace_id
  FROM teamhub_boards WHERE id = NEW.board_id;

  -- Derive entity_type and entity_id from action_type
  IF NEW.card_id IS NOT NULL THEN
    v_entity_type := 'card';
    v_entity_id := NEW.card_id;
  ELSIF NEW.action_type IN ('list_created', 'list_deleted', 'list_renamed') THEN
    v_entity_type := 'list';
    v_entity_id := (NEW.meta_json->>'list_id')::UUID;
  ELSE
    v_entity_type := 'board';
    v_entity_id := NEW.board_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id,
    workspace_id, payload, created_at
  ) VALUES (
    NEW.actor_id,
    'teamhub.' || NEW.action_type,
    v_entity_type,
    v_entity_id,
    v_workspace_id,
    NEW.meta_json,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

-- C4. Attach trigger
DROP TRIGGER IF EXISTS trg_teamhub_activity_to_audit ON teamhub_activity;
CREATE TRIGGER trg_teamhub_activity_to_audit
  AFTER INSERT ON teamhub_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.teamhub_mirror_activity_to_audit();

-- C5. Backfill existing teamhub_activity rows into audit_logs
INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, workspace_id, payload, created_at)
SELECT
  a.actor_id,
  'teamhub.' || a.action_type,
  CASE
    WHEN a.card_id IS NOT NULL THEN 'card'
    ELSE 'board'
  END,
  COALESCE(a.card_id, a.board_id),
  b.workspace_id,
  a.meta_json,
  a.created_at
FROM teamhub_activity a
JOIN teamhub_boards b ON b.id = a.board_id
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs al
  WHERE al.action = 'teamhub.' || a.action_type
    AND al.created_at = a.created_at
    AND al.user_id = a.actor_id
);
