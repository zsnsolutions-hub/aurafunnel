import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { User, UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  SparklesIcon, ShieldIcon, BoltIcon, TargetIcon, CheckIcon,
  UsersIcon, LockIcon, EyeIcon
} from '../../components/Icons';

const SQL_SNIPPET = `-- Scaliyo Enterprise Schema v10.5 (Taxonomy RPC)
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
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name', ''), 'CLIENT');
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
('Product News', 'product-news', 'Latest updates from Scaliyo'),
('AI Strategy', 'ai-strategy', 'Deep dives into generative intelligence'),
('Success Stories', 'success-stories', 'How our clients win with Aura')
on conflict (name) do nothing;`;

interface AuthPageProps {
  user: User | null;
  onLogin: (user: User) => void;
}

type AuthView = 'login' | 'signup' | 'confirm_email' | 'forgot_password';

const AuthPage: React.FC<AuthPageProps> = ({ user: currentUser, onLogin }) => {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDbMissing, setIsDbMissing] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy SQL Script');
  const [resetSent, setResetSent] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  // Derived helpers for backward compat with existing template logic
  const isLogin = view === 'login';

  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const selectedPlan = searchParams.get('plan');

  // Store selected plan from pricing page so it survives email verification
  useEffect(() => {
    if (selectedPlan) {
      localStorage.setItem('scaliyo_selected_plan', selectedPlan);
      if (view === 'login') setView('signup');
    }
  }, [selectedPlan]);

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
      // Check if user selected a plan from the pricing page
      const storedPlan = localStorage.getItem('scaliyo_selected_plan');
      if (storedPlan && currentUser.role !== UserRole.ADMIN) {
        // Don't remove from localStorage here — PortalGuard may redirect to
        // /onboarding first, losing the URL param. BillingPage clears it
        // after actually opening checkout.
        navigate(`/portal/billing?plan=${storedPlan}`, { replace: true });
        return;
      }

      const roleHome = currentUser.role === UserRole.ADMIN ? '/admin' : '/portal';
      const from = (location.state as any)?.from?.pathname;
      // Only honour the "from" redirect if it matches the user's role area;
      // otherwise a CLIENT sent from /admin would loop back endlessly.
      const target =
        from && (
          (currentUser.role === UserRole.ADMIN && from.startsWith('/admin')) ||
          (currentUser.role !== UserRole.ADMIN && from.startsWith('/portal'))
        )
          ? from
          : roleHome;
      navigate(target, { replace: true });
    }
    return () => {
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, navigate, isSubmitting]);

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

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setOauthLoading(provider);
    setError('');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (oauthError) {
      setError(oauthError.message);
      setOauthLoading(null);
    }
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

        // If identities is empty, email already exists
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error('An account with this email already exists.');
        }

        // Show "check your email" screen instead of auto-login
        setView('confirm_email');
        return;
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

  // ─── DB Missing Screen ───
  if (isDbMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBFAF7] p-8">
        <div className="max-w-2xl w-full bg-white rounded-[1.5rem] border border-[#EAE3D6] shadow-chic p-12 text-center space-y-8">
           <div className="w-20 h-20 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
             <span className="text-4xl font-black">!</span>
           </div>
           <h2 className="font-display text-3xl font-medium text-[#1C1A17]">Schema v10.5 Required</h2>
           <p className="text-[#6F6860] max-w-md mx-auto leading-relaxed">
             Scaliyo detected that your database architecture is out of sync.
             The <strong className="text-[#1C1A17]">Taxonomy Optimization</strong> update requires schema v10.5.
           </p>
           <div className="relative group">
             <pre className="bg-[#1C1A17] text-teal-300 p-6 rounded-xl border border-[#EAE3D6] text-[10px] text-left overflow-x-auto max-h-48 custom-scrollbar font-mono leading-relaxed">
               {SQL_SNIPPET}
             </pre>
             <button
              onClick={copyToClipboard}
              className="absolute top-4 right-4 px-4 py-2 bg-white/10 hover:bg-white text-teal-200 hover:text-[#1C1A17] rounded-xl text-[10px] font-bold transition-all backdrop-blur-md uppercase tracking-widest border border-white/20"
             >
               {copyStatus}
             </button>
           </div>
           <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-[#1C1A17] text-white rounded-full font-semibold hover:bg-black hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-chic"
           >
             Reload Platform
           </button>
        </div>
      </div>
    );
  }

  // ─── Email Confirmation Screen ───
  if (view === 'confirm_email') {
    const handleResend = async () => {
      setResendStatus('sending');
      await supabase.auth.resend({ type: 'signup', email });
      setResendStatus('sent');
      setTimeout(() => setResendStatus('idle'), 5000);
    };

    return (
      <div className="min-h-screen bg-[#FBFAF7] text-[#1C1A17] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#EAF2EF] flex items-center justify-center">
            <svg className="w-8 h-8 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-medium mb-3">Check your email</h1>
          <p className="text-[#6F6860] mb-2">
            We&rsquo;ve sent a confirmation link to <strong className="text-[#1C1A17]">{email}</strong>.
          </p>
          <p className="text-sm text-[#9A9189] mb-6">
            Click the link in the email to verify your account, then come back to sign in.
          </p>
          <button
            onClick={handleResend}
            disabled={resendStatus === 'sending'}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition-colors disabled:opacity-50"
          >
            {resendStatus === 'sent' ? 'Email resent!' : resendStatus === 'sending' ? 'Sending...' : "Didn\u2019t get it? Resend email"}
          </button>
          <div className="mt-6">
            <button onClick={() => { setView('login'); setError(''); setPassword(''); }} className="text-sm text-[#9A9189] hover:text-[#1C1A17] transition-colors">
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Forgot Password Screen ───
  if (view === 'forgot_password') {
    const handleResetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError('');
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setResetSent(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to send reset email.');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#FBFAF7] text-[#1C1A17] flex items-center justify-center px-6">
        <div className="max-w-[420px] w-full">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center mb-8 group">
              <img src="/scaliyo-logo-light.webp" alt="Scaliyo" width={106} height={40} className="h-10 w-auto group-hover:scale-105 transition-transform duration-300" />
            </Link>
            <h2 className="font-display text-3xl font-medium text-[#1C1A17] tracking-tight">Reset password</h2>
            <p className="text-[#6F6860] mt-2 text-sm">
              {resetSent ? 'Check your inbox for the reset link.' : 'Enter your email and we\u2019ll send you a reset link.'}
            </p>
          </div>

          <div className="bg-white p-8 rounded-[1.5rem] border border-[#EAE3D6] shadow-chic">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-red-600 text-xs font-black">!</span>
                </div>
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}

            {resetSent ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#EAF2EF] flex items-center justify-center">
                  <svg className="w-7 h-7 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[#4B453E] text-sm font-medium">
                  If an account exists for <strong className="text-[#1C1A17]">{email}</strong>, you&rsquo;ll receive a password reset link shortly.
                </p>
                <button
                  onClick={() => { setView('login'); setError(''); setPassword(''); setResetSent(false); }}
                  className="w-full py-4 rounded-full bg-[#1C1A17] text-white font-semibold text-sm transition-all hover:bg-black shadow-chic hover:-translate-y-0.5 active:translate-y-0"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#A79E90] uppercase tracking-widest mb-2">Email Address</label>
                  <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A798]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white border border-[#EAE3D6] text-[#1C1A17] placeholder-[#B0A798] focus:outline-none focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 transition-all font-medium text-sm" />
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full py-4 rounded-full bg-[#1C1A17] text-white font-semibold text-sm transition-all flex items-center justify-center space-x-2 hover:bg-black shadow-chic hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                  {isSubmitting ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Sending...</span></>
                  ) : (
                    <span>Send reset link</span>
                  )}
                </button>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-[#EAE3D6] text-center">
              <button onClick={() => { setView('login'); setError(''); setPassword(''); setResetSent(false); }} className="text-sm font-medium text-[#6F6860]">
                <span className="text-teal-700 font-semibold hover:text-teal-800 transition-colors">Back to sign in</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Auth UI ───
  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#1C1A17] relative overflow-hidden flex">
      {/* ─── Left Panel: Feature Showcase ─── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#F3F1EA] border-r border-[#EAE3D6]">
        {/* Soft pastel wash */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#E7F0ED] rounded-full blur-3xl opacity-70" />
        <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-[#F5E7DF] rounded-full blur-3xl opacity-60" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center group">
            <img src="/scaliyo-logo-light.webp" alt="Scaliyo" width={106} height={40} className="h-10 w-auto group-hover:scale-105 transition-transform duration-300" />
          </Link>

          {/* Hero Text */}
          <div className="space-y-10">
            <div>
              <div className="inline-flex items-center gap-2.5 border border-[#E0D9CD] bg-white/60 backdrop-blur px-4 py-1.5 rounded-full mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                <span className="text-[10px] font-semibold text-[#8A8178] uppercase tracking-[0.2em]">AI-Powered Revenue Intelligence</span>
              </div>
              <h2 className="font-display text-4xl xl:text-[3.25rem] font-medium text-[#1C1A17] leading-[1.05] tracking-[-0.02em]">
                Know who&rsquo;s ready{' '}
                <span className="text-teal-700">to buy</span>
              </h2>
              <p className="text-[#6F6860] mt-5 text-sm leading-relaxed max-w-md">
                Scaliyo detects buyer intent, scores leads with behavioral AI, and launches personalized outreach automatically.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-3">
              {[
                { icon: <SparklesIcon className="w-4 h-4" />, text: 'AI-powered lead scoring & content generation' },
                { icon: <TargetIcon className="w-4 h-4" />, text: 'Real-time intent scoring across 50+ signals' },
                { icon: <BoltIcon className="w-4 h-4" />, text: 'Automated sequences with smart follow-ups' },
                { icon: <ShieldIcon className="w-4 h-4" />, text: 'Encrypted data & GDPR-aligned by default' },
              ].map((feat, idx) => (
                <div key={idx} className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-[#EAF2EF] border border-teal-600/10 flex items-center justify-center text-teal-700">
                    {feat.icon}
                  </div>
                  <span className="text-sm text-[#4B453E] font-medium">{feat.text}</span>
                </div>
              ))}
            </div>

            {/* Product-fact stats (honest for an early-stage brand) */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: '50+', label: 'Signals / lead' },
                { value: '5 min', label: 'To go live' },
                { value: '24/7', label: 'Follow-up' },
              ].map((stat, idx) => (
                <div key={idx} className="text-center p-4 bg-white rounded-xl border border-[#EAE3D6] shadow-chic-sm">
                  <p className="font-display text-xl font-medium text-[#1C1A17]">{stat.value}</p>
                  <p className="text-[10px] font-semibold text-[#A79E90] uppercase tracking-wider mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trust Badges */}
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              {['SOC 2', 'GDPR', 'Encrypted'].map((badge, idx) => (
                <div key={idx} className="flex items-center space-x-1.5 px-3 py-1.5 bg-white rounded-full border border-[#EAE3D6]">
                  <ShieldIcon className="w-3 h-3 text-teal-600/70" />
                  <span className="text-[10px] font-semibold text-[#8A8178]">{badge}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#A79E90]">Built for modern revenue teams</p>
          </div>
        </div>
      </div>

      {/* ─── Right Panel: Auth Form ─── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-[420px] w-full">
          {/* Mobile Logo */}
          <div className="text-center mb-10 lg:mb-8">
            <Link to="/" className="lg:hidden inline-flex items-center mb-8 group">
              <img src="/scaliyo-logo-light.webp" alt="Scaliyo" width={106} height={40} className="h-10 w-auto group-hover:scale-105 transition-transform duration-300" />
            </Link>
            <h2 className="font-display text-3xl font-medium text-[#1C1A17] tracking-tight">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-[#6F6860] mt-2 text-sm">
              {isLogin ? 'Sign in to access your intelligence dashboard.' : 'Start your 14-day free trial today.'}
            </p>
          </div>

          {/* Auth Card */}
          <div className="bg-white p-8 rounded-[1.5rem] border border-[#EAE3D6] shadow-chic">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-red-600 text-xs font-black">!</span>
                </div>
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              {!isLogin && (
                <div>
                  <label className="block text-[10px] font-bold text-[#A79E90] uppercase tracking-widest mb-2">Full Name</label>
                  <div className="relative">
                    <UsersIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A798]" />
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white border border-[#EAE3D6] text-[#1C1A17] placeholder-[#B0A798] focus:outline-none focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 transition-all font-medium text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-[#A79E90] uppercase tracking-widest mb-2">Email Address</label>
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A798]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white border border-[#EAE3D6] text-[#1C1A17] placeholder-[#B0A798] focus:outline-none focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 transition-all font-medium text-sm" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-[#A79E90] uppercase tracking-widest">Password</label>
                  {isLogin && (
                    <button type="button" onClick={() => { setView('forgot_password'); setError(''); setResetSent(false); }} className="text-[10px] font-bold text-teal-700 hover:text-teal-800 transition-colors">Forgot password?</button>
                  )}
                </div>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A798]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-white border border-[#EAE3D6] text-[#1C1A17] placeholder-[#B0A798] focus:outline-none focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 transition-all font-medium text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#B0A798] hover:text-[#6F6860] transition-colors">
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
                            : 'bg-[#EAE3D6]'
                        }`} />
                      ))}
                    </div>
                    <p className={`text-[10px] font-bold ${
                      passwordStrength.color === 'red' ? 'text-red-500'
                      : passwordStrength.color === 'amber' ? 'text-amber-600'
                      : 'text-emerald-600'
                    }`}>
                      {passwordStrength.label}
                    </p>
                  </div>
                )}
              </div>

              {isLogin && (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-[#D9D0C0] bg-white text-teal-600 focus:ring-teal-600/30" />
                  <span className="text-xs text-[#6F6860] font-medium">Remember me for 30 days</span>
                </label>
              )}

              {!isLogin && (
                <label className="flex items-start space-x-2 cursor-pointer">
                  <input type="checkbox" required className="w-4 h-4 rounded border-[#D9D0C0] bg-white text-teal-600 focus:ring-teal-600/30 mt-0.5" />
                  <span className="text-xs text-[#6F6860] font-medium">
                    I agree to the <span className="text-teal-700 font-semibold">Terms of Service</span> and <span className="text-teal-700 font-semibold">Privacy Policy</span>
                  </span>
                </label>
              )}

              <button type="submit" disabled={isSubmitting || showSuccess} className={`w-full py-4 rounded-full font-semibold text-sm transition-all flex items-center justify-center space-x-2 ${
                showSuccess ? 'bg-emerald-600 text-white cursor-default shadow-chic' :
                isSubmitting ? 'bg-[#F0EBE1] text-[#A79E90] cursor-not-allowed border border-[#EAE3D6]' :
                'bg-[#1C1A17] text-white hover:bg-black shadow-chic hover:-translate-y-0.5 active:translate-y-0'
              }`}>
                {showSuccess ? (
                  <><CheckIcon className="w-5 h-5" /><span>Redirecting...</span></>
                ) : isSubmitting ? (
                  <><div className="w-5 h-5 border-2 border-[#D9D0C0] border-t-[#8A8178] rounded-full animate-spin" /><span>Syncing...</span></>
                ) : (
                  <span>{isLogin ? 'Sign in' : 'Create account'}</span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center space-x-4">
              <div className="flex-1 h-px bg-[#EAE3D6]" />
              <span className="text-[10px] font-bold text-[#A79E90] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[#EAE3D6]" />
            </div>

            {/* Social Auth Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => handleOAuthLogin('google')} disabled={oauthLoading !== null} className="flex items-center justify-center space-x-2 px-4 py-3 bg-white border border-[#EAE3D6] rounded-xl text-xs font-semibold text-[#4B453E] hover:bg-[#FBFAF7] hover:border-[#D9D0C0] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white">
                {oauthLoading === 'google' ? (
                  <div className="w-4 h-4 border-2 border-[#D9D0C0] border-t-[#8A8178] rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                )}
                <span>Google</span>
              </button>
              <button type="button" onClick={() => handleOAuthLogin('github')} disabled={oauthLoading !== null} className="flex items-center justify-center space-x-2 px-4 py-3 bg-white border border-[#EAE3D6] rounded-xl text-xs font-semibold text-[#4B453E] hover:bg-[#FBFAF7] hover:border-[#D9D0C0] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white">
                {oauthLoading === 'github' ? (
                  <div className="w-4 h-4 border-2 border-[#D9D0C0] border-t-[#8A8178] rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                )}
                <span>GitHub</span>
              </button>
            </div>

            {/* Toggle Auth Mode */}
            <div className="mt-8 pt-6 border-t border-[#EAE3D6] text-center">
              <button onClick={() => { setView(isLogin ? 'signup' : 'login'); setError(''); setPassword(''); }} className="text-sm font-medium text-[#6F6860]">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <span className="text-teal-700 font-semibold hover:text-teal-800 transition-colors">
                  {isLogin ? 'Sign up free' : 'Sign in'}
                </span>
              </button>
            </div>
          </div>

          {/* Security Note */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-2 text-[10px] text-[#A79E90]">
              <LockIcon className="w-3 h-3" />
              <span>256-bit SSL encryption &bull; SOC 2 practices &bull; GDPR-aligned</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
