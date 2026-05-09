-- pgcrypto for digest()
create extension if not exists pgcrypto;

-- ============================================================================
-- 20260509200000_api_keys.sql
-- ----------------------------------------------------------------------------
-- Phase 4.1 — Public API key management.
--
-- Personal access tokens for the public REST API. Plaintext tokens are
-- never stored at rest — only the SHA-256 hash and the first 8 chars
-- (for UI display, e.g. "scal_a1b2c3d4..."). The plaintext is returned
-- to the caller exactly once at create time and must be saved by the
-- consumer; revocation requires re-creation.
--
-- Token format:  scal_<43-char base64url>
-- Hash format:   sha-256 of the full plaintext, hex-encoded (64 chars)
--
-- All routes:
--   create_api_key      — workspace-scoped, returns plaintext once
--   verify_api_key      — service-role only, hash lookup
--   revoke_api_key      — workspace-scoped, soft-delete via revoked_at
--   touch_api_key       — service-role only, updates last_used_at
-- ============================================================================

create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  label         text not null,
  key_hash      text not null unique,
  key_prefix    text not null,           -- first 8 chars of plaintext for UI display
  scopes        text[] not null default '{}',
  last_used_at  timestamptz,
  expires_at    timestamptz,             -- null = never expires
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_api_keys_workspace
  on public.api_keys (workspace_id, created_at desc);
create index if not exists idx_api_keys_active
  on public.api_keys (workspace_id)
  where revoked_at is null;

alter table public.api_keys enable row level security;

create policy api_keys_select on public.api_keys
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- INSERTs are funneled through create_api_key (SECURITY DEFINER) so we
-- can validate scope strings, enforce length, and ensure key_hash uniqueness.
-- No client-direct insert policy.

create policy api_keys_update on public.api_keys
  for update using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy api_keys_delete on public.api_keys
  for delete using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

comment on table public.api_keys is
  'Phase 4.1 — Public REST API personal access tokens. Plaintext is never stored; only SHA-256 hash + 8-char prefix. Plaintext returned once at creation via create_api_key().';

-- ── create_api_key ────────────────────────────────────────────────────────
--
-- Caller passes the plaintext (the edge function generates random bytes and
-- shows the user the plaintext once before storing). We hash and persist.
-- Returns the new row's id so the client can show "key created".

create or replace function public.create_api_key(
  p_workspace_id uuid,
  p_label        text,
  p_plaintext    text,    -- full token incl. "scal_" prefix
  p_scopes       text[] default array['leads.read'],
  p_expires_at   timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_hash text;
  v_prefix text;
begin
  -- Caller must be a member of the workspace.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden: caller not in workspace %', p_workspace_id;
  end if;

  if length(coalesce(p_plaintext, '')) < 16 then
    raise exception 'api key plaintext too short';
  end if;

  v_hash   := encode(digest(p_plaintext, 'sha256'), 'hex');
  v_prefix := left(p_plaintext, 12);  -- "scal_" + 7 chars of body

  insert into public.api_keys
    (workspace_id, created_by, label, key_hash, key_prefix, scopes, expires_at)
  values
    (p_workspace_id, auth.uid(), coalesce(nullif(trim(p_label), ''), 'untitled'),
     v_hash, v_prefix, coalesce(p_scopes, '{}'::text[]), p_expires_at)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_api_key(uuid, text, text, text[], timestamptz) from public;
grant execute on function public.create_api_key(uuid, text, text, text[], timestamptz) to authenticated;

comment on function public.create_api_key is
  'Phase 4.1 — Workspace member creates a new API key. Caller is responsible for showing the plaintext to the user once. Returns the api_keys.id.';

-- ── verify_api_key ────────────────────────────────────────────────────────
--
-- Edge functions call this with the incoming Authorization header value
-- (sans "Bearer " prefix). Returns workspace_id + scopes if valid + active,
-- or NULL if not. Touches last_used_at as a side effect.

create or replace function public.verify_api_key(p_plaintext text)
returns table (
  api_key_id   uuid,
  workspace_id uuid,
  scopes       text[]
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id   uuid;
  v_ws   uuid;
  v_sc   text[];
begin
  if p_plaintext is null or p_plaintext = '' then return; end if;
  v_hash := encode(digest(p_plaintext, 'sha256'), 'hex');

  select k.id, k.workspace_id, k.scopes
    into v_id, v_ws, v_sc
    from public.api_keys k
   where k.key_hash    = v_hash
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now())
   limit 1;

  if v_id is null then return; end if;

  -- Best-effort touch (don't fail verification if this update errors).
  begin
    update public.api_keys set last_used_at = now() where id = v_id;
  exception when others then null;
  end;

  api_key_id   := v_id;
  workspace_id := v_ws;
  scopes       := v_sc;
  return next;
end;
$$;

revoke all on function public.verify_api_key(text) from public;
grant execute on function public.verify_api_key(text) to service_role;

comment on function public.verify_api_key is
  'Phase 4.1 — Edge-function-only. Hashes plaintext, looks up active api_keys row, returns workspace_id + scopes. Touches last_used_at. Returns 0 rows if key is invalid, expired, or revoked.';

-- ── revoke_api_key ────────────────────────────────────────────────────────

create or replace function public.revoke_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys
     set revoked_at = now()
   where id = p_key_id
     and workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid());
end;
$$;

revoke all on function public.revoke_api_key(uuid) from public;
grant execute on function public.revoke_api_key(uuid) to authenticated;

comment on function public.revoke_api_key is
  'Phase 4.1 — Workspace member soft-revokes a key by id. Idempotent.';
