-- ============================================================================
-- 20260518110000_webhook_dispatcher_via_guc.sql
-- ----------------------------------------------------------------------------
-- Same fix as 20260518100000 applied to invoke_webhook_dispatcher.
-- The webhook-dispatcher cron has been silently failing every minute with
-- 401 "service-role only" since the vault secret drifted from the real
-- service role key. Switch to the auto-populated GUC.
--
-- Function body preserved verbatim except for the token source.
-- ============================================================================

create or replace function public.invoke_webhook_dispatcher()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/webhook-dispatcher';
  v_token  text;
  v_req_id bigint;
begin
  v_token := current_setting('app.settings.service_role_key', true);
  if v_token is null or v_token = '' then
    raise warning 'app.settings.service_role_key not populated — invoke_webhook_dispatcher skipping';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) into v_req_id;

  return v_req_id;
end;
$$;
