-- ============================================================================
-- security_invariants.sql — repeatable DB security tests (no pgTAP dependency)
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_invariants.sql
--   or: supabase db query --linked "$(cat supabase/tests/security_invariants.sql)"
--
-- Wrapped in a transaction that ALWAYS rolls back, so it creates no lasting data.
-- Simulates roles via `set local role` + `set local request.jwt.claims`. Each
-- assertion RAISEs EXCEPTION on failure; a clean run prints "ALL SECURITY TESTS
-- PASSED".
-- ============================================================================
begin;

-- Deterministic test principals (do not need to exist in auth.users; profiles
-- has no FK to auth.users). We create a temp non-admin + admin profile.
create temporary table _t (nonadmin uuid, admin uuid, other uuid) on commit drop;
insert into _t values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

do $$
declare
  v_nonadmin uuid; v_admin uuid; v_other uuid;
  v_res jsonb; v_denied boolean; v_cnt int;
begin
  select nonadmin, admin, other into v_nonadmin, v_admin, v_other from _t;

  -- Seed a non-admin + an admin profile (run as the elevated migration role).
  insert into public.profiles (id, role) values (v_nonadmin, 'CLIENT') on conflict (id) do update set role='CLIENT';
  insert into public.profiles (id, role, is_super_admin) values (v_admin, 'ADMIN', true) on conflict (id) do update set role='ADMIN', is_super_admin=true;

  -- helper to simulate a JWT
  -- (inline via set_config below)

  ---------------------------------------------------------------------------
  -- 1. anon CANNOT execute an admin RPC (EXECUTE revoked)
  ---------------------------------------------------------------------------
  begin
    set local role anon;
    perform public.admin_grant_credits(v_other, 999999, v_admin, 'test');
    reset role;
    raise exception 'FAIL 1: anon was able to execute admin_grant_credits';
  exception
    when insufficient_privilege then reset role; -- expected: permission denied
    when others then
      reset role;
      if sqlstate = '42501' then null; else raise; end if;
  end;

  ---------------------------------------------------------------------------
  -- 2. authenticated NON-ADMIN cannot grant credits (returns Unauthorized)
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_res := public.admin_grant_credits(v_other, 999999, v_admin, 'test');
  reset role;
  if coalesce((v_res->>'success')::boolean, false) then
    raise exception 'FAIL 2: non-admin granted credits: %', v_res;
  end if;

  ---------------------------------------------------------------------------
  -- 3. authenticated ADMIN CAN execute the admin RPC
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_res := public.admin_grant_credits(v_other, 0, v_admin, 'test');  -- 0-credit no-op
  reset role;
  if not coalesce((v_res->>'success')::boolean, false) then
    raise exception 'FAIL 3: admin could not execute admin_grant_credits: %', v_res;
  end if;

  ---------------------------------------------------------------------------
  -- 4. authenticated user CANNOT self-write subscriptions
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    insert into public.subscriptions (user_id, plan, status, credits_total)
    values (v_nonadmin, 'scale', 'active', 999999);
  exception when insufficient_privilege or others then v_denied := true;
  end;
  -- Either the insert was blocked, or (if a row exists) it inserted nothing usable.
  reset role;
  select count(*) into v_cnt from public.subscriptions where user_id=v_nonadmin and credits_total=999999;
  if v_cnt > 0 then raise exception 'FAIL 4: user self-inserted a subscription'; end if;

  ---------------------------------------------------------------------------
  -- 5. authenticated user CANNOT read an unrelated user's profile row
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.profiles where id = v_admin;  -- unrelated
  reset role;
  if v_cnt <> 0 then raise exception 'FAIL 5: user read an unrelated profile (%). PII leak.', v_cnt; end if;

  ---------------------------------------------------------------------------
  -- 6. authenticated user CANNOT read secret columns
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform api_key from public.email_provider_configs limit 1;
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 6: authenticated could read email_provider_configs.api_key'; end if;

  ---------------------------------------------------------------------------
  -- 7. authenticated CANNOT read the other secret columns either
  --    (webhook signing key, profile commercial/billing columns)
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform secret from public.webhook_endpoints limit 1;
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 7a: authenticated could read webhook_endpoints.secret'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform "businessProfile" from public.profiles limit 1;
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 7b: authenticated could read profiles.businessProfile'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform stripe_customer_id from public.profiles limit 1;
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 7c: authenticated could read profiles.stripe_customer_id'; end if;

  ---------------------------------------------------------------------------
  -- 8. the crypto helpers are not a decrypt oracle for the browser.
  --    Supabase's default privileges grant EXECUTE on new public functions to
  --    anon/authenticated BY NAME, so this has to be re-checked every time a
  --    helper is added — revoking from PUBLIC alone does not undo it.
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform public.app_decrypt_jsonb('{"a":"b"}'::jsonb);
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 8a: authenticated could call app_decrypt_jsonb'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform public.app_decrypt_secret('v1:x');
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 8b: authenticated could call app_decrypt_secret'; end if;

  ---------------------------------------------------------------------------
  -- 9. secrets are ciphertext AT REST, not just hidden behind grants
  ---------------------------------------------------------------------------
  select count(*) into v_cnt
    from public.integrations i, jsonb_each_text(i.credentials) kv
   where i.credentials is not null and kv.value <> '' and kv.value not like 'v1:%';
  if v_cnt > 0 then raise exception 'FAIL 9a: % plaintext integration credential leaves on disk', v_cnt; end if;

  select count(*) into v_cnt from public.webhook_endpoints
   where secret is not null and secret not like 'v1:%';
  if v_cnt > 0 then raise exception 'FAIL 9b: % plaintext webhook signing keys on disk', v_cnt; end if;

  select count(*) into v_cnt from public.sender_account_secrets
   where (smtp_pass is not null and smtp_pass <> '' and smtp_pass not like 'v1:%')
      or (api_key   is not null and api_key   <> '' and api_key   not like 'v1:%');
  if v_cnt > 0 then raise exception 'FAIL 9c: % plaintext sender secrets on disk', v_cnt; end if;

  ---------------------------------------------------------------------------
  -- 10. the DNS ownership token is not readable raw, and not plaintext on disk
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform verification_token from public.workspace_domains limit 1;
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 10a: authenticated could read workspace_domains.verification_token'; end if;

  select count(*) into v_cnt from public.workspace_domains
   where verification_token is not null and verification_token not like 'v1:%';
  if v_cnt > 0 then raise exception 'FAIL 10b: % plaintext domain tokens on disk', v_cnt; end if;

  ---------------------------------------------------------------------------
  -- 11. the notification bell cannot be spoofed from the browser.
  --     Both routes: the service_role writer, and a direct insert (the table
  --     deliberately has SELECT+UPDATE policies only, no INSERT).
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform public.notify_user(v_nonadmin, 'success', 'spoofed');
  exception when insufficient_privilege then v_denied := true;
    when others then if sqlstate='42501' then v_denied := true; else raise; end if;
  end;
  reset role;
  if not v_denied then raise exception 'FAIL 11a: authenticated could call notify_user'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role','authenticated')::text, true);
  v_denied := false;
  begin
    insert into public.notifications (workspace_id, user_id, type, title, is_read)
    values (v_nonadmin, v_nonadmin, 'success', 'direct spoof', false);
  exception when others then v_denied := true;
  end;
  reset role;
  select count(*) into v_cnt from public.notifications where title = 'direct spoof';
  if not v_denied or v_cnt > 0 then raise exception 'FAIL 11b: authenticated inserted a notification directly'; end if;

  raise notice '✅ ALL SECURITY TESTS PASSED (11/11)';
end $$;

rollback;
