import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, UserRole } from '../../types';
import { supabase } from '../../lib/supabase';

const SQL_SNIPPET = `-- Aura Engine Enterprise Schema v10.5 (Taxonomy RPC)
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

create policy "View Own Subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "View Own Leads" on public.leads for select using (auth.uid() = user_id);
create policy "Manage Own Leads" on public.leads for all using (auth.uid() = user_id);
create policy "Admin View All Leads" on public.leads for select using (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));
create policy "View Own Audit" on public.audit_logs for select using (auth.uid() = user_id);
create policy "Admin View All Audit" on public.audit_logs for select using (exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));

-- 10. Auto-Create Profile on Signup Trigger
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

-- 11. Seed Data
insert into public.blog_categories (name, slug, description)
values
('Product News', 'product-news', 'Latest updates from Aura Engine'),
('AI Strategy', 'ai-strategy', 'Deep dives into generative intelligence'),
('Success Stories', 'success-stories', 'How our clients win with Aura')
on conflict (name) do nothing;`;

interface AuthPageProps {
  user: User | null;
  onLogin: (user: User) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ user: currentUser, onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDbMissing, setIsDbMissing] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy SQL Script');
  
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (currentUser && !isSubmitting) {
      const from = (location.state as any)?.from?.pathname || (currentUser.role === UserRole.ADMIN ? '/admin' : '/portal');
      navigate(from, { replace: true });
    }
    return () => {
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    };
  }, [currentUser, navigate, location, isSubmitting]);

  const pollForProfile = async (userId: string, retries = 10): Promise<User | null> => {
    for (let i = 0; i < retries; i++) {
      try {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*, subscription:subscriptions(*)')
          .eq('id', userId)
          .maybeSingle();
        
        if (profileError && (profileError.code === '42P01' || profileError.message.includes('column'))) {
          setIsDbMissing(true);
          return null;
        }

        if (data) {
          return {
            ...data,
            subscription: Array.isArray(data.subscription) ? data.subscription[0] : data.subscription
          } as unknown as User;
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
      await new Promise(res => setTimeout(res, 1200));
    }
    return null;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    authTimeoutRef.current = setTimeout(() => {
      if (isSubmitting) {
        setIsSubmitting(false);
        setError('Connection timed out. Please ensure database schema is applied.');
      }
    }, 20000);
    
    try {
      if (isLogin) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;

        const profile = await pollForProfile(data.user.id, 5);
        if (profile) onLogin(profile);
        else throw new Error("Profile synchronization failed. Schema v10.5 required.");
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { full_name: name } }
        });
        if (authError) throw authError;

        if (data.user) {
          const profile = await pollForProfile(data.user.id, 10);
          if (profile) onLogin(profile);
          else throw new Error("Account provisioned, but profile sync failed.");
        }
      }

      setShowSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(SQL_SNIPPET);
    setCopyStatus('Copied!');
    setTimeout(() => setCopyStatus('Copy SQL Script'), 2000);
  };

  if (isDbMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-8">
        <div className="max-w-2xl w-full bg-white rounded-[2.5rem] p-12 shadow-3xl text-center space-y-8 animate-in zoom-in-95 duration-500">
           <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto">
             <span className="text-4xl font-black">!</span>
           </div>
           <h2 className="text-3xl font-black text-slate-900 font-heading">Schema v10.5 Required</h2>
           <p className="text-slate-500 max-w-md mx-auto leading-relaxed font-medium">
             Aura Engine detected that your database architecture is out of sync. 
             The <strong>Taxonomy Optimization</strong> update requires schema v10.5.
           </p>
           <div className="relative group">
             <pre className="bg-slate-950 text-indigo-300 p-6 rounded-2xl text-[10px] text-left overflow-x-auto max-h-48 custom-scrollbar font-mono leading-relaxed">
               {SQL_SNIPPET}
             </pre>
             <button 
              onClick={copyToClipboard}
              className="absolute top-4 right-4 px-4 py-2 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-xl text-[10px] font-black transition-all shadow-xl backdrop-blur-md uppercase tracking-widest"
             >
               {copyStatus}
             </button>
           </div>
           <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-2xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all"
           >
             Reload Platform
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center space-x-2 mb-6 group cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg transition-transform group-hover:rotate-12">A</div>
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-heading">AuraFunnel</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 font-heading tracking-tight">{isLogin ? 'Welcome back' : 'Create account'}</h2>
          <p className="text-slate-500 mt-2">{isLogin ? 'Sign in to access your intelligence dashboard.' : 'Start your 14-day free trial today.'}</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50">
          {error && <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl font-medium">{error}</div>}
          <form onSubmit={handleAuth} className="space-y-6">
            {!isLogin && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Full Name</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" />
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Email Address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" />
            </div>
            <button type="submit" disabled={isSubmitting || showSuccess} className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg flex items-center justify-center space-x-2 ${showSuccess ? 'bg-emerald-500 text-white cursor-default' : isSubmitting ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 hover:scale-[1.02] active:scale-95'}`}>
              {showSuccess ? 'Redirecting...' : isSubmitting ? 'Syncing...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
          </form>
          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <button onClick={() => setIsLogin(!isLogin)} className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors text-sm">
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;