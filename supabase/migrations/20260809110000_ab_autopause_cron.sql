-- Every 15 min, run the A/B auto-optimizer when any opted-in active campaign exists.
create or replace function public.invoke_ab_autopause()
returns bigint language plpgsql security definer set search_path to 'public', 'vault' as $$
declare
  v_url   text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/ab-autopause';
  v_token text;
  v_req   bigint;
  v_any   int;
begin
  select count(*) into v_any from public.email_sequences
   where ab_auto_optimize = true and status in ('active','processing') limit 1;
  if v_any = 0 then return null; end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token from vault.decrypted_secrets where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_ab_autopause: no service-role token — skipping'; return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_token),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  ) into v_req;
  return v_req;
end;
$$;

do $$ begin perform cron.unschedule('invoke-ab-autopause'); exception when others then null; end $$;
select cron.schedule('invoke-ab-autopause', '*/15 * * * *', 'select public.invoke_ab_autopause();');
