-- Aura Engine Enterprise Schema v10.5 (Taxonomy RPC)
-- Core schema: profiles, blog_posts, leads, subscriptions, audit_logs
-- Must run BEFORE all other migrations

-- 1. Setup Extensions
create extension if not exists "uuid-ossp";

-- 2. Setup Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('ADMIN', 'CLIENT', 'GUEST');
  end if;
  if not exists (select 1 from pg_type where typname = 'post_status') then
    create type post_status as enum ('draft', 'pending_review', 'published', 'archived');
  end if;
end$$;

-- 3. Core Tables
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  name text,
  role user_role default 'CLIENT'::user_role,
  status text default 'active',
  credits_total integer default 500,
  credits_used integer default 0,
  plan text default 'Starter',
  "createdAt" timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.blog_categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamp with time zone default now()
);

create table if not exists public.blog_posts (
  id uuid default uuid_generate_v4() primary key,
  author_id uuid references public.profiles(id) on delete cascade not null,
  category_id uuid references public.blog_categories(id) on delete set null,
  title text not null,
  slug text not null unique,
  content text not null,
  excerpt text,
  featured_image text,
  status post_status default 'draft'::post_status,
  visibility text default 'public',
  seo_settings jsonb default '{"title": "", "description": "", "og_image": ""}'::jsonb,
  ai_metadata jsonb default '{"summary": "", "readability": 0, "keywords": []}'::jsonb,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now()
);

-- 4. Migration helper for missing columns
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'blog_posts'
    and column_name = 'featured_image') then
    alter table public.blog_posts add column featured_image text;
  end if;
end$$;

-- 5. RPC Helper for Taxonomy Stats
drop function if exists public.get_category_post_counts();
create or replace function public.get_category_post_counts()
returns table (category_id uuid, post_count bigint)
language plpgsql
security definer as $$
begin
  return query
  select p.category_id, count(*) as post_count
  from public.blog_posts p
  where p.category_id is not null
  group by p.category_id;
end;
$$;

-- 6. Enable RLS
alter table public.profiles enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_categories enable row level security;

-- 7. Storage Initialization
insert into storage.buckets (id, name, public)
values ('blog-assets', 'blog-assets', true)
on conflict (id) do update set public = true;

-- 8. Security Policies
do $$
begin
  drop policy if exists "Public Profiles View" on public.profiles;
  drop policy if exists "Update Own Profile" on public.profiles;
  drop policy if exists "View Published Posts" on public.blog_posts;
  drop policy if exists "View Own/Admin Posts" on public.blog_posts;
  drop policy if exists "Create Own Drafts" on public.blog_posts;
  drop policy if exists "Admin Insert All" on public.blog_posts;
  drop policy if exists "Update Own Post Content" on public.blog_posts;
  drop policy if exists "Admin Full Access" on public.blog_posts;
  drop policy if exists "View All Categories" on public.blog_categories;
  drop policy if exists "Admin Manage Categories" on public.blog_categories;
  drop policy if exists "Public Asset View" on storage.objects;
  drop policy if exists "Admin Asset Manage" on storage.objects;
end$$;

create policy "Public Profiles View" on public.profiles for select using (true);
create policy "Update Own Profile" on public.profiles for update using (auth.uid() = id);

create policy "View Published Posts" on public.blog_posts for select using (status = 'published');
create policy "View Own/Admin Posts" on public.blog_posts for select using (auth.uid() = author_id OR exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));
create policy "Create Own Drafts" on public.blog_posts for insert with check (auth.uid() = author_id AND (status = 'draft' OR status = 'pending_review'));
create policy "Admin Insert All" on public.blog_posts for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));
create policy "Admin Full Access" on public.blog_posts for all using (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));

create policy "View All Categories" on public.blog_categories for select using (true);
create policy "Admin Manage Categories" on public.blog_categories for all using (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));

create policy "Public Asset View" on storage.objects for select using (bucket_id = 'blog-assets');
create policy "Admin Asset Manage" on storage.objects for all
using (bucket_id = 'blog-assets' AND (exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')))
with check (bucket_id = 'blog-assets' AND (exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')));

-- 9. Leads & Subscriptions Tables
create table if not exists public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  plan text default 'Starter',
  status text default 'active',
  expires_at timestamp with time zone default (now() + interval '30 days'),
  created_at timestamp with time zone default now()
);

create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  website text,
  industry text,
  company_size text,
  status text default 'new',
  score integer default 0,
  source text default 'manual',
  notes text,
  tags text[] default '{}',
  last_activity timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details text,
  created_at timestamp with time zone default now()
);

alter table public.subscriptions enable row level security;
alter table public.leads enable row level security;
alter table public.audit_logs enable row level security;

do $$
begin
  drop policy if exists "View Own Subscription" on public.subscriptions;
  drop policy if exists "View Own Leads" on public.leads;
  drop policy if exists "Manage Own Leads" on public.leads;
  drop policy if exists "View Own Audit" on public.audit_logs;
  drop policy if exists "Admin View All Leads" on public.leads;
  drop policy if exists "Admin View All Audit" on public.audit_logs;
end$$;

DO $$ BEGIN
  CREATE POLICY "View Own Subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "View Own Leads" ON public.leads FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Manage Own Leads" ON public.leads FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin View All Leads" ON public.leads FOR SELECT USING (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "View Own Audit" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin View All Audit" ON public.audit_logs FOR SELECT USING (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL;
END $$;

-- 10. Insert policy for audit_logs (needed by team hub and other features)
DO $$ BEGIN
  CREATE POLICY "Users can insert own audit logs"
    ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 11. Auto-Create Profile on Signup Trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'CLIENT');
  insert into public.subscriptions (user_id, plan, status, expires_at)
  values (new.id, 'Starter', 'active', now() + interval '30 days');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 12. Seed Data
insert into public.blog_categories (name, slug, description)
values
('Product News', 'product-news', 'Latest updates from Aura Engine'),
('AI Strategy', 'ai-strategy', 'Deep dives into generative intelligence'),
('Success Stories', 'success-stories', 'How our clients win with Aura')
on conflict (name) do nothing;
