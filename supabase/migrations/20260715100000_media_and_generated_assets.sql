-- ============================================================================
-- Phase E · Image → content — media_assets + generated_assets
-- ============================================================================
-- Net-new, additive, business-scoped (RLS via is_business_member; members
-- read+write). media_assets = uploaded images + their AI analysis;
-- generated_assets = the unified store for AI-produced content, linked back to
-- the media asset it came from. Idempotent.
-- ============================================================================

create table if not exists public.media_assets (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  business_id              uuid not null references public.businesses(id) on delete cascade,
  uploaded_by              uuid references auth.users(id) on delete set null,
  file_url                 text not null,
  file_type                text,
  title                    text,
  description              text,
  -- image-context-analyzer output:
  ai_image_summary         text,
  detected_objects         jsonb,
  detected_style           text,
  detected_product         text,
  mood                     text,
  suggested_use_cases      jsonb,
  suggested_campaign_angle text,
  suggested_audience       text,
  suggested_cta            text,
  suggested_channels       jsonb,
  analyzed_at              timestamptz,
  created_at               timestamptz not null default now()
);
create index if not exists idx_media_assets_business on public.media_assets (business_id, created_at desc);

create table if not exists public.generated_assets (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  kind           text not null,   -- email | instagram | facebook | tiktok | linkedin | blog | campaign
  channel        text,
  goal           text,
  tone           text,
  audience       text,
  variant        text,            -- short | long
  title          text,            -- e.g. email subject
  preview_text   text,            -- e.g. email preview
  content        text,            -- body / caption / script
  hashtags       jsonb,
  cta            text,
  metadata       jsonb,
  status         text not null default 'draft' check (status in ('draft','used','archived')),
  created_at     timestamptz not null default now()
);
create index if not exists idx_generated_assets_business on public.generated_assets (business_id, created_at desc);
create index if not exists idx_generated_assets_media on public.generated_assets (media_asset_id);

alter table public.media_assets enable row level security;
alter table public.generated_assets enable row level security;

do $$ begin
  create policy "members read media" on public.media_assets for select using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members write media" on public.media_assets for all
    using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members read gen" on public.generated_assets for select using (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members write gen" on public.generated_assets for all
    using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
exception when duplicate_object then null; end $$;
