-- ops: enable the email_validation feature flag for the operator's workspace(s).
-- Idempotent; on a fresh DB with no matching users this simply affects 0 rows.
do $$
declare v_count int;
begin
  insert into public.workspace_feature_flags (workspace_id, flag_key, enabled)
  select distinct wm.workspace_id, 'email_validation', true
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where lower(u.email) in ('zsnsolutions1@gmail.com', 'alyamjadshah@gmail.com')
  on conflict (workspace_id, flag_key) do update set enabled = true;
  get diagnostics v_count = row_count;
  raise notice 'email_validation flag enabled for % workspace(s)', v_count;
end $$;
