-- ============================================================================
-- Wire up the sequence SEND stage. Writing worked (items reach status 'written')
-- but nothing dispatched them — no function read 'written' run-items to send.
-- This adds:
--   • bump_sequence_total_sent(campaign) — atomic total_sent increment.
--   • invoke_sequence_sends() — mirrors invoke_email_writing_queue; POSTs the new
--     process-sequence-sends edge fn when any 'written' item is DUE.
--   • a per-minute cron job to call it.
-- ============================================================================

create or replace function public.bump_sequence_total_sent(p_campaign_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.email_sequences set total_sent = total_sent + 1, updated_at = now()
  where id = p_campaign_id;
$$;

create or replace function public.invoke_sequence_sends()
returns bigint language plpgsql security definer set search_path to 'public', 'vault' as $$
declare
  v_url    text := 'https://utvydxqiqedaaxmmpfpf.functions.supabase.co/process-sequence-sends';
  v_token  text;
  v_req_id bigint;
  v_due    int;
begin
  -- Only fire when at least one written item's send time has arrived.
  select count(*) into v_due
    from public.email_sequence_run_items
   where status = 'written'
     and created_at + (coalesce(delay_days, 0) || ' days')::interval <= now()
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
    raise warning 'invoke_sequence_sends: no service-role token in GUC or vault — skipping';
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
$$;

-- Every minute, like the writing queue. Idempotent (unschedule if it exists).
do $$ begin
  perform cron.unschedule('invoke-sequence-sends');
exception when others then null; end $$;
select cron.schedule('invoke-sequence-sends', '* * * * *', 'select public.invoke_sequence_sends();');
