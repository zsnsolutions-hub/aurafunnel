-- ============================================================================
-- 20260818180001_notification_type_task_reminder.sql
-- Allow the 'task_reminder' notification type (deliver-task-reminders writes it).
-- The previous CHECK only permitted info/success/warning/error, which silently
-- rejected reminder rows. Additive widening — existing rows are unaffected.
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['info', 'success', 'warning', 'error', 'task_reminder']));
