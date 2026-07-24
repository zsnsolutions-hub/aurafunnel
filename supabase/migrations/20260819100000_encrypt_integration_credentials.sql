-- ============================================================================
-- 20260819100000_encrypt_integration_credentials.sql
-- P2 (audit 2026-07-16) — `integrations.credentials` was the last big pile of
-- third-party bearer secrets still sitting on disk in the clear: Slack webhook
-- URLs, HubSpot / Salesforce / Google-Analytics tokens and, worst of them, the
-- tenant's own Stripe `secret_key`. Column-level grants (migration
-- 20260817150000) already stopped the browser READING them back, but the values
-- were plaintext in the table, in every backup, and in any support export.
--
-- This encrypts them at rest with the same Vault-keyed helpers the social and
-- email-sender secrets use (`app_encrypt_secret` / `app_decrypt_secret`,
-- 'v1:' ciphertext prefix, service_role-only).
--
-- `credentials` is JSONB, not text, so the generic text-column trigger doesn't
-- apply. Instead a JSONB-walking pair encrypts every STRING LEAF of the object
-- and leaves the key names, numbers, booleans and nulls alone. Keeping the
-- shape intact matters: `validate-integration` and the billing functions index
-- into it by name (`credentials.secret_key`, `.apiKey`, `.webhookUrl`), so the
-- object must still look like an object — only the values become ciphertext.
--
-- Reads: service_role edge functions call `app_decrypt_jsonb` (or the
-- per-field `app_decrypt_secret`) before use. Legacy plaintext has no 'v1:'
-- prefix and passes through untouched, so the switchover needs no downtime and
-- the backfill below is safe to re-run.
--
-- Depends on AuraEngine/supabase-migration-social-token-encryption.sql for
-- app_encrypt_secret / app_decrypt_secret / the Vault key. Idempotent.
-- ============================================================================

-- 1) JSONB leaf-walking encrypt --------------------------------------------
create or replace function public.app_encrypt_jsonb(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_out jsonb;
  v_key text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;

  case jsonb_typeof(p_value)
    when 'string' then
      -- Empty strings carry no secret and would only bloat the row.
      if p_value #>> '{}' = '' then return p_value; end if;
      return to_jsonb(public.app_encrypt_secret(p_value #>> '{}'));
    when 'object' then
      v_out := '{}'::jsonb;
      for v_key in select jsonb_object_keys(p_value) loop
        v_out := jsonb_set(v_out, array[v_key], public.app_encrypt_jsonb(p_value -> v_key), true);
      end loop;
      return v_out;
    when 'array' then
      return coalesce(
        (select jsonb_agg(public.app_encrypt_jsonb(elem)) from jsonb_array_elements(p_value) elem),
        '[]'::jsonb
      );
    else
      -- numbers / booleans: nothing to hide, and encrypting them would change
      -- the JSON type the callers expect.
      return p_value;
  end case;
end $$;

-- 2) JSONB leaf-walking decrypt --------------------------------------------
create or replace function public.app_decrypt_jsonb(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_out jsonb;
  v_key text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;

  case jsonb_typeof(p_value)
    when 'string' then
      return to_jsonb(public.app_decrypt_secret(p_value #>> '{}'));
    when 'object' then
      v_out := '{}'::jsonb;
      for v_key in select jsonb_object_keys(p_value) loop
        v_out := jsonb_set(v_out, array[v_key], public.app_decrypt_jsonb(p_value -> v_key), true);
      end loop;
      return v_out;
    when 'array' then
      return coalesce(
        (select jsonb_agg(public.app_decrypt_jsonb(elem)) from jsonb_array_elements(p_value) elem),
        '[]'::jsonb
      );
    else
      return p_value;
  end case;
end $$;

-- 3) Lock the helpers to service_role ---------------------------------------
-- Supabase's default privileges hand EXECUTE to anon/authenticated on new
-- public functions, and revoking from PUBLIC alone does NOT undo a grant made
-- to those roles by name — so revoke them by name too (same lesson as
-- app_encrypt_secret; a decrypt oracle callable from the browser would make
-- the whole scheme pointless).
revoke execute on function public.app_encrypt_jsonb(jsonb) from public, anon, authenticated;
revoke execute on function public.app_decrypt_jsonb(jsonb) from public, anon, authenticated;
grant  execute on function public.app_encrypt_jsonb(jsonb) to service_role;
grant  execute on function public.app_decrypt_jsonb(jsonb) to service_role;

-- 4) Encrypt-on-write trigger ------------------------------------------------
-- SECURITY DEFINER so it can reach the service_role-only crypto helpers no
-- matter which role fires the write — the browser upserts this row directly
-- (lib/integrations.ts upsertIntegration), so the client needs no change.
create or replace function public.tg_encrypt_integration_credentials()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.credentials is not null then
    NEW.credentials := public.app_encrypt_jsonb(NEW.credentials);
  end if;
  return NEW;
end $$;

drop trigger if exists encrypt_credentials on public.integrations;
create trigger encrypt_credentials
  before insert or update on public.integrations
  for each row execute function public.tg_encrypt_integration_credentials();

-- 5) Backfill existing plaintext --------------------------------------------
-- app_encrypt_secret is a no-op on values that already carry the 'v1:' prefix,
-- so this cannot double-encrypt and may be re-run freely.
update public.integrations
   set credentials = public.app_encrypt_jsonb(credentials)
 where credentials is not null
   and credentials <> '{}'::jsonb;

comment on column public.integrations.credentials is
  'Third-party integration secrets. Every string leaf is AES-encrypted at rest '
  '(''v1:'' prefix, Vault key social_token_enc_key) by the encrypt_credentials '
  'trigger. Read it with app_decrypt_jsonb() as service_role — never grant this '
  'column to anon/authenticated.';
