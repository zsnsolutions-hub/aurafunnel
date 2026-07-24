-- ============================================================================
-- 20260819130000_encrypt_domain_verification_token.sql
-- Encrypt workspace_domains.verification_token at rest.
--
-- Note on the threat model, because it is NOT the same as the other secrets we
-- encrypted: this token is something the user must PUBLISH in public DNS to
-- prove they control a domain. Knowing it buys an attacker nothing unless they
-- also control the zone, so this is not a bearer credential and encrypting it
-- is defence-in-depth (backups, disk, support exports), not a hole being
-- closed. Consistency with the other secret columns is the point.
--
-- Because it exists to be READ by the user and pasted into their DNS panel, it
-- cannot simply be revoked-and-forgotten like a signing key. The read path
-- becomes a membership-checked accessor that decrypts:
--   * list_workspace_domains(ws)  — the list the Branding page renders, tokens
--                                   decrypted for members of that workspace
--   * add_workspace_domain(...)   — still returns the plaintext it just minted
--
-- EXPAND step only (see CLAUDE.md): this migration is purely additive, so the
-- currently-deployed frontend keeps working while it lands. Revoking the raw
-- column from `authenticated` is the CONTRACT step and lives in
-- 20260819150000, to be applied only after the new frontend is live.
--
-- Depends on the app_encrypt_secret / app_decrypt_secret helpers. Idempotent.
-- ============================================================================

-- 1) Encrypt on write --------------------------------------------------------
drop trigger if exists encrypt_secrets on public.workspace_domains;
create trigger encrypt_secrets
  before insert or update on public.workspace_domains
  for each row execute function public.tg_encrypt_secret_columns('verification_token');

-- 2) Backfill ----------------------------------------------------------------
update public.workspace_domains
   set verification_token = public.app_encrypt_secret(verification_token)
 where verification_token is not null
   and verification_token not like 'v1:%';

-- 3) Membership-checked read path (decrypts) ---------------------------------
create or replace function public.list_workspace_domains(p_workspace_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.workspace_members
     where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden: caller not in workspace %', p_workspace_id;
  end if;

  return query
    select to_jsonb(d) || jsonb_build_object(
             'verification_token', public.app_decrypt_secret(d.verification_token))
      from public.workspace_domains d
     where d.workspace_id = p_workspace_id
     order by d.created_at desc;
end $$;

revoke execute on function public.list_workspace_domains(uuid) from public, anon;
grant  execute on function public.list_workspace_domains(uuid) to authenticated;

-- 4) add_workspace_domain must hand back the PLAINTEXT it minted -------------
-- The BEFORE INSERT trigger encrypts on the way to disk, so the `returning *`
-- row now carries ciphertext. Overwrite that one field with the plaintext the
-- function already holds; everything else about the function is unchanged.
--
-- The return type goes from `public.workspace_domains` to jsonb (so the token
-- can be swapped in), and CREATE OR REPLACE cannot change a return type — drop
-- first. PostgREST serialises both to the same JSON object, so the client sees
-- no difference.
drop function if exists public.add_workspace_domain(uuid, text);

create or replace function public.add_workspace_domain(
  p_workspace_id uuid,
  p_domain       text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token text;
  v_row   public.workspace_domains;
begin
  if not exists (
    select 1 from public.workspace_members
     where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden: caller not in workspace %', p_workspace_id;
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.workspace_domains (workspace_id, domain, verification_token, created_by)
  values (p_workspace_id, lower(trim(p_domain)), v_token, auth.uid())
  returning * into v_row;

  return to_jsonb(v_row) || jsonb_build_object('verification_token', v_token);
end $$;

revoke execute on function public.add_workspace_domain(uuid, text) from public, anon;
grant  execute on function public.add_workspace_domain(uuid, text) to authenticated;

comment on column public.workspace_domains.verification_token is
  'DNS ownership proof, AES-encrypted at rest. Not granted to anon/authenticated '
  '— members read it decrypted via list_workspace_domains(); verify-domain '
  'decrypts it as service_role.';
