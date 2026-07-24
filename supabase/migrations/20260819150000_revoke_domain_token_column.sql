-- ============================================================================
-- 20260819150000_revoke_domain_token_column.sql
-- CONTRACT step for 20260819130000 (see CLAUDE.md).
--
-- Takes workspace_domains.verification_token away from the browser. Apply this
-- ONLY once a frontend that reads domains through list_workspace_domains() is
-- live — a column REVOKE makes Postgres reject the whole `select('*')` the old
-- Branding page issues, so landing it early breaks that page outright.
-- ============================================================================

revoke select on public.workspace_domains from authenticated, anon;
grant  select (id, workspace_id, domain, status, is_primary, verified_at,
               last_check_at, last_check_error, created_by, created_at)
  on public.workspace_domains to authenticated;

-- provisioning columns were added by the vanity-TLS migration; grant them too
-- if they exist, so the Branding page's status badges keep working.
do $$
declare v_col text;
begin
  foreach v_col in array array['provisioned_at','cert_expires_at','last_provision_at','last_provision_error'] loop
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='workspace_domains' and column_name=v_col) then
      execute format('grant select (%I) on public.workspace_domains to authenticated', v_col);
    end if;
  end loop;
end $$;

