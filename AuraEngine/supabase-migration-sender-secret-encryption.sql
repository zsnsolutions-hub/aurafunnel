-- ============================================================================
-- Encrypt email-sender secrets at rest (extends social-token encryption).
--
-- Two tables held plaintext credentials:
--   * email_provider_configs.{smtp_pass, api_key}  — written DIRECTLY by the
--     browser (client upsert), so the values hit disk in the clear.
--   * sender_account_secrets.{smtp_pass, api_key, oauth_access_token,
--     oauth_refresh_token} — written by the connect_sender_account RPC.
--
-- Rather than scatter encrypt() calls across every writer (client + RPC + edge
-- fns), a single BEFORE INSERT/UPDATE trigger per table encrypts the named
-- columns using the same Vault-keyed app_encrypt_secret helper. The trigger is
-- SECURITY DEFINER so it can call the (service_role-only) crypto helper no
-- matter which role fires the write — including a browser's authenticated
-- insert. Reads are decrypted by the edge functions via app_decrypt_secret,
-- which passes through legacy plaintext (no 'v1:' prefix) unchanged.
--
-- Depends on supabase-migration-social-token-encryption.sql (app_encrypt_secret
-- / app_decrypt_secret / the Vault key). Idempotent / re-runnable.
-- ============================================================================

-- 1) Generic secret-column encryptor (columns passed as trigger args) ---------
create or replace function public.tg_encrypt_secret_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row jsonb := to_jsonb(NEW);
  v_col text;
  v_val text;
begin
  foreach v_col in array TG_ARGV loop
    v_val := v_row ->> v_col;
    -- Encrypt only fresh plaintext: skip null/empty and already-encrypted values.
    if v_val is not null and v_val <> '' and v_val not like 'v1:%' then
      v_row := jsonb_set(v_row, array[v_col], to_jsonb(public.app_encrypt_secret(v_val)));
    end if;
  end loop;
  NEW := jsonb_populate_record(NEW, v_row);
  return NEW;
end $$;

-- 2) Attach to both credential tables ----------------------------------------
drop trigger if exists encrypt_secrets on public.sender_account_secrets;
create trigger encrypt_secrets
  before insert or update on public.sender_account_secrets
  for each row execute function public.tg_encrypt_secret_columns(
    'smtp_pass', 'api_key', 'oauth_access_token', 'oauth_refresh_token'
  );

drop trigger if exists encrypt_secrets on public.email_provider_configs;
create trigger encrypt_secrets
  before insert or update on public.email_provider_configs
  for each row execute function public.tg_encrypt_secret_columns(
    'smtp_pass', 'api_key'
  );

-- 3) Backfill existing plaintext in place (skips 'v1:' and null/empty) --------
update public.sender_account_secrets
   set smtp_pass           = public.app_encrypt_secret(smtp_pass),
       api_key             = public.app_encrypt_secret(api_key),
       oauth_access_token  = public.app_encrypt_secret(oauth_access_token),
       oauth_refresh_token = public.app_encrypt_secret(oauth_refresh_token)
 where (smtp_pass           is not null and smtp_pass           not like 'v1:%')
    or (api_key             is not null and api_key             not like 'v1:%')
    or (oauth_access_token  is not null and oauth_access_token  not like 'v1:%')
    or (oauth_refresh_token is not null and oauth_refresh_token not like 'v1:%');

update public.email_provider_configs
   set smtp_pass = public.app_encrypt_secret(smtp_pass),
       api_key   = public.app_encrypt_secret(api_key)
 where (smtp_pass is not null and smtp_pass not like 'v1:%')
    or (api_key   is not null and api_key   not like 'v1:%');
