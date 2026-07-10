-- ops: enable email_validation for admin / super-admin workspaces (the operator
-- testing the feature), so it doesn't depend on guessing their login email and
-- doesn't roll out to every customer (shared Mails.so key). Idempotent.
do $$
declare v_count int;
begin
  insert into public.workspace_feature_flags (workspace_id, flag_key, enabled)
  select distinct wm.workspace_id, 'email_validation', true
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where coalesce(p.is_super_admin, false) = true
     or upper(coalesce(p.role, '')) = 'ADMIN'
  on conflict (workspace_id, flag_key) do update set enabled = true;
  get diagnostics v_count = row_count;
  raise notice 'email_validation enabled for % admin/super-admin workspace(s)', v_count;
end $$;
