import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  SparklesIcon, ShieldIcon, BoltIcon, TargetIcon, ChartIcon, CheckIcon,
  TrendUpIcon, UsersIcon, LockIcon, EyeIcon
} from '../../components/Icons';

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
  
  const [showPassword, setShowPassword] = useState(false);

  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '', bars: 0 };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const levels = [
      { score: 0, label: '', color: '', bars: 0 },
      { score: 1, label: 'Weak', color: 'red', bars: 1 },
      { score: 2, label: 'Fair', color: 'amber', bars: 2 },
      { score: 3, label: 'Good', color: 'amber', bars: 3 },
      { score: 4, label: 'Strong', color: 'emerald', bars: 4 },
      { score: 5, label: 'Very Strong', color: 'emerald', bars: 5 },
    ];
    return levels[Math.min(score, 5)];
  }, [password]);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
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
    <div className="min-h-screen flex bg-slate-50 relative overflow-hidden">
      {/* ─── Left Panel: Branded Showcase ─── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-white/3 rounded-full -translate-x-1/2 -translate-y-1/2" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center text-white font-black text-2xl border border-white/20 transition-transform group-hover:rotate-12">A</div>
            <span className="text-2xl font-black tracking-tight text-white font-heading">AuraFunnel</span>
          </div>

          {/* Hero Text */}
          <div className="space-y-8">
            <div>
              <p className="text-xs font-black text-indigo-200 uppercase tracking-[0.3em] mb-4">AI-Powered Marketing</p>
              <h2 className="text-4xl font-black text-white leading-tight">
                Turn leads into<br />
                <span className="text-indigo-200">revenue machines</span>
              </h2>
              <p className="text-indigo-100 mt-4 text-sm leading-relaxed max-w-md">
                The world's first AI-native marketing platform that predicts, creates, and converts — while you focus on strategy.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-3">
              {[
                { icon: <SparklesIcon className="w-4 h-4" />, text: 'AI-powered lead scoring & content generation' },
                { icon: <TargetIcon className="w-4 h-4" />, text: 'Predictive analytics with 94% accuracy' },
                { icon: <BoltIcon className="w-4 h-4" />, text: 'Automated workflows that optimize themselves' },
                { icon: <ShieldIcon className="w-4 h-4" />, text: 'Enterprise-grade security & GDPR compliance' },
              ].map((feat, idx) => (
                <div key={idx} className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-indigo-200">
                    {feat.icon}
                  </div>
                  <span className="text-sm text-indigo-100 font-medium">{feat.text}</span>
                </div>
              ))}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: '2,500+', label: 'Companies' },
                { value: '94%', label: 'AI Accuracy' },
                { value: '3.2x', label: 'Avg ROI' },
              ].map((stat, idx) => (
                <div key={idx} className="text-center p-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <p className="text-xl font-black text-white">{stat.value}</p>
                  <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trust Badges */}
          <div className="space-y-3">
            <div className="flex items-center space-x-4">
              {['SOC 2', 'GDPR', 'ISO 27001'].map((badge, idx) => (
                <div key={idx} className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
                  <ShieldIcon className="w-3 h-3 text-indigo-300" />
                  <span className="text-[10px] font-bold text-indigo-200">{badge}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-indigo-300/60">Trusted by teams at Fortune 500 companies worldwide</p>
          </div>
        </div>
      </div>

      {/* ─── Right Panel: Auth Form ─── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="text-center mb-10 lg:mb-8">
            <div className="lg:hidden inline-flex items-center space-x-2 mb-6 group cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg transition-transform group-hover:rotate-12">A</div>
              <span className="text-2xl font-bold tracking-tight text-slate-900 font-heading">AuraFunnel</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 font-heading tracking-tight">{isLogin ? 'Welcome back' : 'Create account'}</h2>
            <p className="text-slate-500 mt-2 text-sm">{isLogin ? 'Sign in to access your intelligence dashboard.' : 'Start your 14-day free trial today.'}</p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-red-600 text-xs font-black">!</span>
                </div>
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              {!isLogin && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                  <div className="relative">
                    <UsersIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium text-sm" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                  {isLogin && (
                    <button type="button" className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">Forgot password?</button>
                  )}
                </div>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    <EyeIcon className="w-4 h-4" />
                  </button>
                </div>
                {/* Password Strength (signup only) */}
                {!isLogin && password.length > 0 && (
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`flex-1 h-1 rounded-full transition-all ${
                          i <= passwordStrength.bars
                            ? passwordStrength.color === 'red' ? 'bg-red-500'
                            : passwordStrength.color === 'amber' ? 'bg-amber-500'
                            : 'bg-emerald-500'
                            : 'bg-slate-200'
                        }`} />
                      ))}
                    </div>
                    <p className={`text-[10px] font-bold ${
                      passwordStrength.color === 'red' ? 'text-red-500'
                      : passwordStrength.color === 'amber' ? 'text-amber-500'
                      : 'text-emerald-500'
                    }`}>
                      {passwordStrength.label}
                    </p>
                  </div>
                )}
              </div>

              {isLogin && (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-xs text-slate-500 font-medium">Remember me for 30 days</span>
                </label>
              )}

              {!isLogin && (
                <label className="flex items-start space-x-2 cursor-pointer">
                  <input type="checkbox" required className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-0.5" />
                  <span className="text-xs text-slate-500 font-medium">
                    I agree to the <span className="text-indigo-600 font-bold">Terms of Service</span> and <span className="text-indigo-600 font-bold">Privacy Policy</span>
                  </span>
                </label>
              )}

              <button type="submit" disabled={isSubmitting || showSuccess} className={`w-full py-4 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center space-x-2 ${
                showSuccess ? 'bg-emerald-500 text-white cursor-default' :
                isSubmitting ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
                'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 hover:scale-[1.02] active:scale-95'
              }`}>
                {showSuccess ? (
                  <><CheckIcon className="w-5 h-5" /><span>Redirecting...</span></>
                ) : isSubmitting ? (
                  <><div className="w-5 h-5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /><span>Syncing...</span></>
                ) : (
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center space-x-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Social Auth Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="flex items-center justify-center space-x-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span>Google</span>
              </button>
              <button type="button" className="flex items-center justify-center space-x-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                <span>GitHub</span>
              </button>
            </div>

            {/* Toggle Auth Mode */}
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <button onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); }} className="text-sm font-medium text-slate-500">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <span className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors">
                  {isLogin ? 'Sign up free' : 'Sign in'}
                </span>
              </button>
            </div>
          </div>

          {/* Security Note */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-2 text-[10px] text-slate-400">
              <LockIcon className="w-3 h-3" />
              <span>256-bit SSL encryption &bull; SOC 2 certified &bull; GDPR compliant</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;