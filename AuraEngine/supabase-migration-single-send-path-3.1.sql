-- Roadmap 3.1 (BUG-006/020) — make process-sequence-sends the SOLE sender.
--
-- Root cause of the double-send: finalize_email_sequence_run copied every
-- 'written' run_item into scheduled_emails (Path B) WITHOUT marking the run_items,
-- so the per-minute invoke-sequence-sends cron (Path A) still found and sent the
-- same items. Two senders, no idempotency in send-email → every email went twice.
--
-- Fix: finalize now ONLY does run-completion bookkeeping. Path A (run_items →
-- process-sequence-sends, which handles delay_days + send windows + A/B) is the
-- single sender. scheduled_emails is left for genuine one-off scheduled mail.
--
-- Idempotent (CREATE OR REPLACE). Safe to re-run.

CREATE OR REPLACE FUNCTION public.finalize_email_sequence_run(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run     email_sequence_runs%ROWTYPE;
  v_pending INT;
  v_writing INT;
  v_failed  INT;
BEGIN
  SELECT * INTO v_run FROM email_sequence_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', p_run_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'writing'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_pending, v_writing, v_failed
  FROM email_sequence_run_items
  WHERE run_id = p_run_id;

  IF v_pending > 0 OR v_writing > 0 THEN
    RETURN; -- not ready to finalize yet
  END IF;

  -- Roadmap 3.1: the scheduled_emails fan-out (Path B) is REMOVED. Written items
  -- are dispatched directly from email_sequence_run_items by process-sequence-sends
  -- (Path A). Only run bookkeeping remains here.
  UPDATE email_sequence_runs
  SET status = 'completed',
      completed_at = now(),
      items_failed = v_failed,
      updated_at = now()
  WHERE id = p_run_id;
END;
$function$;
