-- ============================================================================
-- IMAP poller state + cron. poll-imap-inbox tracks the last-seen UID per sender
-- so it only fetches new mail; invoke_imap_poll fires it every 5 min (when any
-- password-based sender exists to poll).
-- ============================================================================

create table if not exists public.imap_poll_state (
  sender_account_id uuid primary key references public.sender_accounts(id) on delete cascade,
  uid_validity      bigint,
  last_uid          bigint not null default 0,
  last_polled_at    timestamptz,
  last_error        text
);
-- Service-role only (no RLS policies needed; poller uses the service key).
alter table public.imap_poll_state enable row level security;

create or replace function public.invoke_imap_poll()
returns bigint language plpgsql security definer set search_path to 'public', 'vault' as $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/poll-imap-inbox';
  v_token  text;
  v_req_id bigint;
  v_any    int;
begin
  select count(*) into v_any from public.sender_account_secrets where smtp_pass is not null limit 1;
  if v_any = 0 then return null; end if;

  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_token is null then
    select decrypted_secret into v_token from vault.decrypted_secrets where name = 'webhook_dispatcher_service_key' limit 1;
  end if;
  if v_token is null or v_token = '' then
    raise warning 'invoke_imap_poll: no service-role token — skipping'; return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_req_id;
  return v_req_id;
end;
$$;

do $$ begin perform cron.unschedule('invoke-imap-poll'); exception when others then null; end $$;
select cron.schedule('invoke-imap-poll', '*/5 * * * *', 'select public.invoke_imap_poll();');
