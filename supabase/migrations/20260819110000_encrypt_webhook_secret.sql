-- ============================================================================
-- 20260819110000_encrypt_webhook_secret.sql
-- P2 (audit 2026-07-16) — `webhook_endpoints.secret` is the HMAC-SHA256 key
-- Scaliyo signs outbound event payloads with. It was stored plaintext AND
-- table-granted to `authenticated`, so lib/webhooks.ts `select('*')` shipped
-- every workspace member's signing key to the browser on page load. Anyone who
-- got hold of it could forge perfectly-signed events into the customer's
-- receiver.
--
-- Unlike the other secrets we've encrypted, this one is genuinely needed in
-- plaintext at DISPATCH time, so the shape is encrypt-at-rest +
-- decrypt-per-use: the webhook-dispatcher (service_role) calls
-- app_decrypt_secret right before computing the HMAC.
--
-- The UI already treated the secret as show-once ("the secret value never
-- leaves this dialog") — it just wasn't true, because the value stayed
-- readable forever afterwards. This migration makes the promise real:
--   * writes are encrypted by the shared tg_encrypt_secret_columns trigger
--   * `secret` is revoked from the browser's column grants entirely
--   * losing it is recoverable via rotate_webhook_secret(), which mints a new
--     key server-side and returns the plaintext exactly once
--
-- Depends on AuraEngine/supabase-migration-sender-secret-encryption.sql for
-- tg_encrypt_secret_columns. Idempotent.
-- ============================================================================

-- 1) Encrypt on write --------------------------------------------------------
drop trigger if exists encrypt_secrets on public.webhook_endpoints;
create trigger encrypt_secrets
  before insert or update on public.webhook_endpoints
  for each row execute function public.tg_encrypt_secret_columns('secret');

-- 2) Backfill existing plaintext (no-op on values already carrying 'v1:') ----
update public.webhook_endpoints
   set secret = public.app_encrypt_secret(secret)
 where secret is not null
   and secret not like 'v1:%';

-- 3) Take the column away from the browser ----------------------------------
-- A table-wide grant overrides a column-level revoke, so the table grant has to
-- go first and the safe columns get re-granted individually.
revoke select on public.webhook_endpoints from authenticated, anon;
grant  select (id, workspace_id, created_by, url, description, event_types,
               enabled, failure_count, disabled_at, last_attempt_at,
               last_success_at, created_at, updated_at)
  on public.webhook_endpoints to authenticated;

-- INSERT/UPDATE are untouched: members still create endpoints (the client mints
-- the secret, the trigger encrypts it) and still edit url/description/enabled.

-- 4) Rotation — the only way to see a signing key after creation -------------
create or replace function public.rotate_webhook_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_workspace uuid;
  v_secret    text;
begin
  select workspace_id into v_workspace
    from public.webhook_endpoints where id = p_id;
  if v_workspace is null then
    raise exception 'Webhook endpoint not found';
  end if;

  -- Authorize on auth.uid(), never on a parameter (audit lesson from the
  -- admin_* RPCs). Mirrors the table's own RLS membership check.
  if not exists (
    select 1 from public.workspace_members
     where workspace_id = v_workspace and user_id = auth.uid()
  ) then
    raise exception 'Not authorized for this workspace';
  end if;

  -- 32 random bytes, base64url — same alphabet/length the client mints.
  v_secret := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=', '-_'
  );

  -- The BEFORE UPDATE trigger encrypts it on the way to disk; v_secret stays
  -- plaintext in this function and is returned to the caller exactly once.
  update public.webhook_endpoints
     set secret = v_secret, updated_at = now()
   where id = p_id;

  return v_secret;
end $$;

revoke execute on function public.rotate_webhook_secret(uuid) from public, anon;
grant  execute on function public.rotate_webhook_secret(uuid) to authenticated;

comment on column public.webhook_endpoints.secret is
  'HMAC-SHA256 signing key, AES-encrypted at rest (''v1:'' prefix) by the '
  'encrypt_secrets trigger. NOT readable by anon/authenticated — the dispatcher '
  'decrypts it per use as service_role. Lost keys are replaced via '
  'rotate_webhook_secret(), which returns the new value once.';
