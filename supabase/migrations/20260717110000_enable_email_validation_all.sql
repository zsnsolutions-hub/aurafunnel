-- ops: enable email_validation for ALL workspaces to unblock testing. The flag
-- alone incurs no cost (Mails.so credits are only spent on an explicit Validate
-- click), and send-gating is a no-op for workspaces with no validation records.
-- Idempotent.
do $$
declare v_count int;
begin
  insert into public.workspace_feature_flags (workspace_id, flag_key, enabled)
  select id, 'email_validation', true from public.workspaces
  on conflict (workspace_id, flag_key) do update set enabled = true;
  get diagnostics v_count = row_count;
  raise notice 'email_validation enabled for % workspace(s) total', v_count;
end $$;
