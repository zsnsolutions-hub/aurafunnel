-- ============================================================================
-- 20260818180000_task_reminders.sql
-- Task reminder delivery. Adds an idempotency stamp so a reminder fires once,
-- and an index for the cron sweep. Delivery itself (in-app notification + best-
-- effort email) is done by the deliver-task-reminders edge function, invoked by
-- pg_cron via invoke_task_reminders().
-- ============================================================================

alter table public.tasks add column if not exists reminder_sent_at timestamptz;

-- Partial index for the sweep: open, due, not-yet-sent reminders.
create index if not exists idx_tasks_due_reminders
  on public.tasks (reminder_at)
  where reminder_at is not null and reminder_sent_at is null and status = 'open';

-- ── Cron invoker: POST the edge function only when a reminder is actually due.
create or replace function public.invoke_task_reminders()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/deliver-task-reminders';
  v_token  text;
  v_req_id bigint;
  v_due    int;
begin
  select count(*) into v_due
    from public.tasks
   where status = 'open'
     and reminder_at is not null
     and reminder_sent_at is null
     and reminder_at <= now()
   limit 1;
  if v_due = 0 then
    return null;
  end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_task_reminders: no service-role token in GUC or vault — skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_req_id;
  return v_req_id;
end;
$function$;

-- Run every 5 minutes (self-gated: no-ops when nothing is due). Idempotent.
do $$ begin
  perform cron.unschedule('invoke-task-reminders');
exception when others then null; end $$;
select cron.schedule('invoke-task-reminders', '*/5 * * * *', 'select public.invoke_task_reminders();');
