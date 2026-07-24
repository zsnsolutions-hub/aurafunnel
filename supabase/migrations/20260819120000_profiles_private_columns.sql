-- ============================================================================
-- 20260819120000_profiles_private_columns.sql
-- P2 residual (audit 2026-07-16) — the cross-tenant `profiles` leak was closed
-- in 20260817110000 by replacing `Public Profiles View USING (true)` with a
-- tenant-co-member policy. What that left behind: co-members can read each
-- OTHER'S FULL ROW. Sharing a workspace should reveal a name and an email for a
-- member list — not the person's `businessProfile` (company, value prop,
-- positioning, target-customer notes — the tenant's commercial crown jewels)
-- and not `stripe_customer_id`, which is a live handle into their billing
-- account.
--
-- RLS can't fix this: policies are row-level, and the row IS legitimately
-- visible. The column split has to come from GRANTs — but grants are per-ROLE,
-- and the owner reads their own profile through the very same `authenticated`
-- role as their co-workers. So the two private columns come off the role grant
-- entirely, and self-reads go through a SECURITY DEFINER accessor that is
-- hard-scoped to auth.uid().
--
-- Blast radius checked before writing this: the only client read that would
-- break is useAuthMachine's `select('*', subscription:subscriptions(*))` —
-- Postgres rejects the WHOLE query when `*` expands over a column the role
-- lacks, it does not silently drop it. That call is switched to
-- get_own_profile() in the same change. Every other client read already names
-- its columns and none of them name these two. Edge functions are unaffected
-- (service_role bypasses column ACLs).
-- ============================================================================

-- 1) Re-grant everything except the two private columns ----------------------
-- The table-wide grant has to be dropped first: it would override any
-- column-level revoke.
revoke select on public.profiles from authenticated;
grant  select (
  id, email, name, role, status, plan,
  credits_total, credits_used,
  created_at, updated_at,
  is_super_admin, ui_preferences, preferences,
  full_name, avatar_url, is_active,
  onboarding_completed, onboarding_role, onboarding_team_size
) on public.profiles to authenticated;
-- Deliberately NOT granted: "businessProfile", stripe_customer_id.
--
-- `anon` keeps the narrower (id, name, avatar_url, role) grant from
-- 20260512220000 — untouched here.

-- UPDATE is untouched: the owner still writes their own businessProfile from
-- ProfilePage (RLS scopes it to their row). Writing a column you cannot read
-- back is fine in Postgres, and the client never asks for the row back.

-- 2) Self-read accessor ------------------------------------------------------
-- Returns the caller's OWN full profile with the subscription embedded, which
-- is the exact shape useAuthMachine used to get from PostgREST's
-- `select('*, subscription:subscriptions(*)')`.
--
-- Takes no user parameter on purpose. A p_user_id argument here would be the
-- same defect as the admin_* RPCs: authorization has to come from auth.uid(),
-- never from something the caller can type.
create or replace function public.get_own_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile jsonb;
  v_sub     jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select to_jsonb(p) into v_profile from public.profiles p where p.id = v_uid;
  if v_profile is null then
    return null;
  end if;

  select to_jsonb(s) into v_sub
    from public.subscriptions s
   where s.user_id = v_uid
   order by s.created_at desc
   limit 1;

  return v_profile || jsonb_build_object('subscription', coalesce(v_sub, 'null'::jsonb));
end $$;

revoke execute on function public.get_own_profile() from public, anon;
grant  execute on function public.get_own_profile() to authenticated;

comment on function public.get_own_profile() is
  'Caller''s own profile + latest subscription, as jsonb. Exists because '
  '"businessProfile" and stripe_customer_id are revoked from the authenticated '
  'role so tenant co-members cannot read them; this is the self-read path. '
  'Scoped to auth.uid() — do not add a user-id parameter.';

comment on column public.profiles."businessProfile" is
  'Tenant commercial profile. NOT granted to anon/authenticated — read your own '
  'via get_own_profile(); server-side code reads it as service_role.';
comment on column public.profiles.stripe_customer_id is
  'Stripe customer handle. NOT granted to anon/authenticated — billing code '
  'reads it as service_role.';
