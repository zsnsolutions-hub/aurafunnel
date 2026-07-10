-- ============================================================================
-- Phase A · Stage 1 of 3 — EXPAND (multi-business foundation)
-- proposed file: supabase/migrations/20260711100000_phase_a_expand_multibusiness.sql
-- ============================================================================
-- Staged re-scope: EXPAND (this) -> CUTOVER (rewrite leads/etc RLS) -> CONTRACT.
--
-- This stage is ADDITIVE & NON-BREAKING:
--   * creates businesses / business_members / business_profiles
--   * adds NULLABLE workspace_id + business_id to existing user-scoped tables
--   * backfills them (one default business per user's workspace)
--   * adds RLS ONLY on the 3 new tables + membership helper RPCs
--
-- It DOES NOT touch existing RLS on leads/social_posts/blog_posts/
-- email_templates/ai_threads, and adds NO NOT NULL constraints. So with the
-- `multi_business` flag off, the app behaves exactly as today. The CUTOVER
-- migration (separate, after this backfill is verified in prod) swaps those
-- policies to (workspace_id, business_id).
--
-- Fully idempotent — safe to re-run.
-- ============================================================================

-- ─── 1. New tables ──────────────────────────────────────────────────────────

create table if not exists public.businesses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  website      text,
  industry     text,
  description  text,
  logo_url     text,
  default_tone text,
  status       text not null default 'active' check (status in ('active','archived')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_businesses_workspace on public.businesses(workspace_id);

create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);
create index if not exists idx_business_members_user     on public.business_members(user_id);
create index if not exists idx_business_members_business on public.business_members(business_id);

create table if not exists public.business_profiles (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null unique references public.businesses(id) on delete cascade,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  products_services  text,
  audience           text,
  tone               text,
  offers             text,
  faqs               jsonb,
  objections         text,
  competitors        text,
  case_studies       text,
  sender_name        text,
  sender_email       text,
  postal_address     text,
  confidence         numeric,
  ai_summary         text,
  brand_voice        text,
  visual_style_notes text,
  preferred_ctas     text[],
  -- typed homes for high-value existing brain fields (faithful migration, queryable)
  value_prop            text,
  unique_selling_points text[],
  competitive_advantage text,
  company_story         text,
  source_json        jsonb,   -- raw migrated profiles."businessProfile" (nothing lost)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── 2. Membership helpers (SECURITY DEFINER → no RLS recursion) ─────────────
create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_business_admin(p_business_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

-- ─── 3. Additive NULLABLE scoping columns on existing tables ─────────────────
alter table public.leads           add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.leads           add column if not exists business_id  uuid references public.businesses(id) on delete cascade;
alter table public.social_posts    add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.social_posts    add column if not exists business_id  uuid references public.businesses(id) on delete cascade;
alter table public.blog_posts      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.blog_posts      add column if not exists business_id  uuid references public.businesses(id) on delete cascade;
alter table public.email_templates add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.email_templates add column if not exists business_id  uuid references public.businesses(id) on delete cascade;
alter table public.ai_threads      add column if not exists business_id  uuid references public.businesses(id) on delete cascade;

create index if not exists idx_leads_business           on public.leads(business_id);
create index if not exists idx_social_posts_business    on public.social_posts(business_id);
create index if not exists idx_blog_posts_business      on public.blog_posts(business_id);
create index if not exists idx_email_templates_business on public.email_templates(business_id);
create index if not exists idx_ai_threads_business      on public.ai_threads(business_id);

-- ─── 4. Backfill: one default business per user's workspace ──────────────────
-- Each user -> their workspace (created if missing) -> a single default business
-- -> owner membership -> migrated business brain -> stamp their existing rows.
do $$
declare
  r     record;
  v_ws  uuid;
  v_biz uuid;
  v_bp  jsonb;
begin
  for r in select id from public.profiles loop
    -- resolve or create the user's workspace (earliest membership wins)
    select wm.workspace_id into v_ws
      from public.workspace_members wm
     where wm.user_id = r.id
     order by wm.joined_at asc
     limit 1;

    if v_ws is null then
      insert into public.workspaces (name, owner_id) values ('My Workspace', r.id)
      returning id into v_ws;
      insert into public.workspace_members (workspace_id, user_id, role)
      values (v_ws, r.id, 'owner') on conflict do nothing;
    end if;

    -- one default business per workspace (idempotent)
    select b.id into v_biz from public.businesses b
      where b.workspace_id = v_ws order by b.created_at asc limit 1;

    if v_biz is null then
      select p."businessProfile" into v_bp from public.profiles p where p.id = r.id;

      insert into public.businesses (workspace_id, name, website, industry, description, default_tone, created_by)
      values (
        v_ws,
        coalesce(nullif(v_bp->>'companyName',''), 'My Business'),
        v_bp->>'companyWebsite',
        v_bp->>'industry',
        v_bp->>'businessDescription',
        v_bp->>'contentTone',
        r.id
      ) returning id into v_biz;

      insert into public.business_profiles (
        business_id, workspace_id,
        products_services, audience, tone,
        sender_name, sender_email, postal_address,
        value_prop, unique_selling_points, competitive_advantage, company_story,
        source_json
      ) values (
        v_biz, v_ws,
        v_bp->>'productsServices',          -- products_services
        v_bp->>'targetAudience',            -- audience
        v_bp->>'contentTone',               -- tone
        nullif(v_bp->>'companyName',''),    -- sender_name (compliance default)
        v_bp->>'businessEmail',             -- sender_email
        v_bp->>'address',                   -- postal_address
        v_bp->>'valueProp',                 -- value_prop
        case when jsonb_typeof(v_bp->'uniqueSellingPoints') = 'array'
             then array(select jsonb_array_elements_text(v_bp->'uniqueSellingPoints')) end,
        v_bp->>'competitiveAdvantage',      -- competitive_advantage
        v_bp->>'companyStory',              -- company_story
        v_bp                                -- source_json (everything, nothing lost)
      ) on conflict (business_id) do nothing;
      -- Deliberately left NULL (no faithful source in the old blob; AI fills these
      -- in Phase C): offers, faqs, objections, competitors, case_studies,
      -- confidence, ai_summary, brand_voice, visual_style_notes, preferred_ctas.
    end if;

    insert into public.business_members (business_id, workspace_id, user_id, role)
    values (v_biz, v_ws, r.id, 'owner') on conflict (business_id, user_id) do nothing;

    -- stamp existing owned rows (only where still unset). Owner columns verified
    -- against the LIVE schema dump (they drifted from the CREATE statements):
    --   leads.client_id (no user_id) · social_posts.user_id · blog_posts.author_id
    --   · email_templates.owner_id · ai_threads.workspace_id (== the user id)
    -- leads + ai_threads already carry a (legacy, RLS-critical) workspace_id, so
    -- we set ONLY business_id there and leave workspace_id for the cutover stage.
    update public.leads           set business_id = v_biz                       where client_id = r.id and business_id is null;
    update public.social_posts    set workspace_id = v_ws, business_id = v_biz where user_id   = r.id and business_id is null;
    update public.blog_posts      set workspace_id = v_ws, business_id = v_biz where author_id = r.id and business_id is null;
    update public.email_templates set workspace_id = v_ws, business_id = v_biz where owner_id  = r.id and business_id is null;  -- system defaults (owner_id null) stay shared
    update public.ai_threads      set business_id  = v_biz                     where workspace_id = r.id and business_id is null;
  end loop;
end $$;

-- ─── 5. RLS on the 3 new tables (per-business membership) ────────────────────
alter table public.businesses        enable row level security;
alter table public.business_members  enable row level security;
alter table public.business_profiles enable row level security;

do $$ begin create policy "biz member read"  on public.businesses for select using (public.is_business_member(id));
exception when duplicate_object then null; end $$;
do $$ begin create policy "biz create"       on public.businesses for insert with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
do $$ begin create policy "biz admin update" on public.businesses for update using (public.is_business_admin(id));
exception when duplicate_object then null; end $$;
do $$ begin create policy "biz admin delete" on public.businesses for delete using (public.is_business_admin(id));
exception when duplicate_object then null; end $$;

do $$ begin create policy "bm read"   on public.business_members for select using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
do $$ begin create policy "bm manage" on public.business_members for all
  using (public.is_business_admin(business_id)) with check (public.is_business_admin(business_id));
exception when duplicate_object then null; end $$;

do $$ begin create policy "bp read"  on public.business_profiles for select using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
do $$ begin create policy "bp write" on public.business_profiles for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

-- ─── 6. Create-business RPC (atomic: business + owner membership + profile) ──
-- The client calls this instead of a raw INSERT, so the first membership row is
-- created server-side (avoids an RLS bootstrap gap on business_members).
create or replace function public.create_business(
  p_workspace_id uuid,
  p_name text,
  p_website text default null,
  p_industry text default null,
  p_description text default null,
  p_default_tone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_biz uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  insert into public.businesses (workspace_id, name, website, industry, description, default_tone, created_by)
  values (p_workspace_id, coalesce(nullif(p_name,''),'My Business'), p_website, p_industry, p_description, p_default_tone, auth.uid())
  returning id into v_biz;

  insert into public.business_members (business_id, workspace_id, user_id, role)
  values (v_biz, p_workspace_id, auth.uid(), 'owner');

  insert into public.business_profiles (business_id, workspace_id, tone)
  values (v_biz, p_workspace_id, p_default_tone) on conflict (business_id) do nothing;

  return v_biz;
end $$;

revoke all on function public.create_business(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.create_business(uuid,text,text,text,text,text) to authenticated;

-- ─── 7. Default-business resolver (app self-heal / current-business bootstrap) ─
create or replace function public.get_or_create_default_business()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_biz uuid;
begin
  select workspace_id into v_ws from public.workspace_members
    where user_id = auth.uid() order by joined_at asc limit 1;
  if v_ws is null then
    insert into public.workspaces (name, owner_id) values ('My Workspace', auth.uid()) returning id into v_ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, auth.uid(), 'owner') on conflict do nothing;
  end if;

  select b.id into v_biz from public.businesses b
    join public.business_members m on m.business_id = b.id and m.user_id = auth.uid()
    where b.workspace_id = v_ws order by b.created_at asc limit 1;

  if v_biz is null then
    v_biz := public.create_business(v_ws, 'My Business');
  end if;
  return v_biz;
end $$;

revoke all on function public.get_or_create_default_business() from public, anon;
grant execute on function public.get_or_create_default_business() to authenticated;

-- ─── 8. Post-backfill verification (prints in the migration output) ──────────
do $$
declare
  v_profiles int; v_biz int; v_members int;
  v_leads_bad int; v_social_bad int; v_blog_bad int; v_tpl_bad int; v_thread_bad int;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_biz      from public.businesses;
  select count(*) into v_members  from public.business_members;
  select count(*) into v_leads_bad   from public.leads           where business_id is null;
  select count(*) into v_social_bad  from public.social_posts    where business_id is null;
  select count(*) into v_blog_bad    from public.blog_posts      where business_id is null;
  select count(*) into v_tpl_bad     from public.email_templates where business_id is null and owner_id is not null; -- exclude shared system defaults
  select count(*) into v_thread_bad  from public.ai_threads      where business_id is null;

  raise notice 'PHASE-A VERIFY: profiles=%, businesses=%, business_members=%', v_profiles, v_biz, v_members;
  raise notice 'PHASE-A VERIFY (should all be 0): leads_unscoped=%, social_unscoped=%, blog_unscoped=%, templates_unscoped=%, threads_unscoped=%',
    v_leads_bad, v_social_bad, v_blog_bad, v_tpl_bad, v_thread_bad;

  if v_leads_bad > 0 or v_social_bad > 0 or v_blog_bad > 0 or v_tpl_bad > 0 or v_thread_bad > 0 then
    raise warning 'PHASE-A: some owned rows were left unscoped — investigate before cutover';
  end if;
end $$;
