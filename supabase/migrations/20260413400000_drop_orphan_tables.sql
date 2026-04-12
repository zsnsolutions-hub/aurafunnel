-- ─────────────────────────────────────────────────────────────────────────────
-- Third-pass cleanup — drop deprecated outbound_usage
--
-- outbound_usage was explicitly deprecated by 20260303000000_usage_consolidation.sql
-- with the note "Will drop after 2026-04-03." Today is past that date. Writes
-- stopped over a month ago; workspace_usage_counters + usage_events are the
-- authoritative replacements.
--
-- strategy_tasks and strategy_notes are ALSO orphaned (StrategyHub page was
-- removed in commit 3b5a381, no live code references them) but a first dry-run
-- found 7 rows of real data in strategy_tasks. The product decision — export,
-- migrate to TeamHub, or drop intentionally — belongs to the user, not this
-- automated cleanup. Flagged in the task tracker; not dropped here.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  c_outbound int;
  c_tasks    int;
  c_notes    int;
BEGIN
  SELECT count(*) INTO c_outbound FROM public.outbound_usage;
  SELECT count(*) INTO c_tasks    FROM public.strategy_tasks;
  SELECT count(*) INTO c_notes    FROM public.strategy_notes;

  RAISE NOTICE 'dropping outbound_usage (% row(s), deprecated, past scheduled drop date)', c_outbound;
  RAISE NOTICE 'NOT dropping strategy_tasks (% row(s)) or strategy_notes (% row(s)) — contain user data, awaiting product decision',
    c_tasks, c_notes;
END$$;

DROP TABLE IF EXISTS public.outbound_usage CASCADE;

DO $$
BEGIN
  RAISE NOTICE 'dropped: outbound_usage';
END$$;

COMMIT;
