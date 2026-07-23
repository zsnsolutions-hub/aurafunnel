-- ============================================================================
-- Encrypt social OAuth access tokens at rest.
--
-- BEFORE: social_accounts.meta_page_access_token_encrypted and
-- linkedin_access_token_encrypted were named "_encrypted" but stored the raw
-- OAuth access token as PLAINTEXT — readable in the table, in backups, and by
-- anyone with row access.
--
-- AFTER: values are AES-encrypted (pgcrypto pgp_sym_encrypt) with a key held in
-- Supabase Vault. Two SECURITY DEFINER helpers do the work; only service_role
-- (the edge functions) may call them. Ciphertext carries a 'v1:' version prefix
-- so decrypt is backward-compatible: legacy plaintext rows (and the "demo_token"
-- placeholder) pass through untouched until they are re-written as real tokens.
-- Idempotent / re-runnable.
-- ============================================================================

-- 1) Encryption key in Vault (create once; never overwrite an existing one) ---
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'social_token_enc_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'social_token_enc_key',
      'AES key for social_accounts OAuth token columns'
    );
  end if;
end $$;

-- 2) Encrypt: plaintext -> 'v1:' || base64(pgp_sym_encrypt) -------------------
create or replace function public.app_encrypt_secret(p_plaintext text)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_key text;
begin
  if p_plaintext is null then return null; end if;
  -- Already encrypted? leave as-is (idempotent backfill / double-encrypt guard).
  if p_plaintext like 'v1:%' then return p_plaintext; end if;

  select decrypted_secret into v_key from vault.decrypted_secrets
   where name = 'social_token_enc_key' limit 1;
  if v_key is null then
    raise exception 'social_token_enc_key is not configured in Vault';
  end if;

  return 'v1:' || encode(extensions.pgp_sym_encrypt(p_plaintext, v_key), 'base64');
end $$;

-- 3) Decrypt: 'v1:' ciphertext -> plaintext; anything else passes through -----
create or replace function public.app_decrypt_secret(p_ciphertext text)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_key text;
begin
  if p_ciphertext is null then return null; end if;
  -- Legacy plaintext (no version prefix) or the demo placeholder — return as-is.
  if p_ciphertext not like 'v1:%' then return p_ciphertext; end if;

  select decrypted_secret into v_key from vault.decrypted_secrets
   where name = 'social_token_enc_key' limit 1;
  if v_key is null then
    raise exception 'social_token_enc_key is not configured in Vault';
  end if;

  return extensions.pgp_sym_decrypt(
    decode(substring(p_ciphertext from 4), 'base64'),
    v_key
  );
end $$;

-- 4) Lock the helpers down to service_role (edge functions) only --------------
-- NB: Supabase's default privileges auto-grant EXECUTE to anon + authenticated
-- BY NAME, so revoking PUBLIC alone leaves them able to decrypt tokens. Revoke
-- those roles explicitly.
revoke all on function public.app_encrypt_secret(text) from public, anon, authenticated;
revoke all on function public.app_decrypt_secret(text) from public, anon, authenticated;
grant execute on function public.app_encrypt_secret(text) to service_role;
grant execute on function public.app_decrypt_secret(text) to service_role;

-- 5) Backfill existing real tokens in place (skips 'v1:' and 'demo_token') ----
update public.social_accounts
   set meta_page_access_token_encrypted = public.app_encrypt_secret(meta_page_access_token_encrypted)
 where meta_page_access_token_encrypted is not null
   and meta_page_access_token_encrypted not like 'v1:%'
   and meta_page_access_token_encrypted <> 'demo_token';

update public.social_accounts
   set linkedin_access_token_encrypted = public.app_encrypt_secret(linkedin_access_token_encrypted)
 where linkedin_access_token_encrypted is not null
   and linkedin_access_token_encrypted not like 'v1:%'
   and linkedin_access_token_encrypted <> 'demo_token';
