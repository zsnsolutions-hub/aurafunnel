import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, UserRole } from '../../types';
import { supabase } from '../../lib/supabase';

const SQL_SNIPPET = `-- AuraFunnel Enterprise Schema v9.6 (AI Financial Intelligence)
-- 1. Setup Extensions
create extension if not exists "uuid-ossp";

-- 2. Setup Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('ADMIN', 'CLIENT', 'GUEST');
  end if;
end$$;

-- 3. Create Tables
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

create table if not exists public.rate_limits (
  user_id uuid references public.profiles(id) on delete cascade,
  window_key text,
  count integer default 1,
  expires_at timestamp with time zone not null,
  primary key (user_id, window_key)
);

create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  company text,
  email text,
  score integer default 0 check (score >= 0 and score <= 100),
  status text default 'New',
  "lastActivity" text default 'Just now',
  insights text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.ai_prompts (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  version integer not null default 1,
  template text not null,
  is_active boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(name, version)
);

create table if not exists public.ai_usage_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete set null,
  action_type text not null,
  tokens_used integer not null default 0,
  model_name text not null,
  prompt_name text,
  prompt_version integer,
  status text default 'success',
  latency_ms integer default 0,
  estimated_cost numeric(12,8) default 0, -- Unit cost tracking
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.plans (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  price text not null,
  credits integer not null,
  description text default '',
  features text[] not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  plan_name text not null,
  status text default 'active',
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable RLS
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.rate_limits enable row level security;
alter table public.audit_logs enable row level security;

-- 5. Rate Limiting RPC
create or replace function public.enforce_rate_limit()
returns json as $$
declare
  v_user_role user_role;
  v_minute_key text;
  v_day_key text;
  v_minute_limit integer := 5;
  v_day_limit integer := 50;
  v_minute_count integer;
  v_day_count integer;
begin
  select role into v_user_role from public.profiles where id = auth.uid();
  if v_user_role = 'ADMIN' then
    return json_build_object('success', true, 'message', 'Admin exemption granted.');
  end if;

  v_minute_key := 'min_' || to_char(now(), 'YYYY-MM-DD_HH24:MI');
  v_day_key := 'day_' || to_char(now(), 'YYYY-MM-DD');

  select count into v_minute_count from public.rate_limits 
  where user_id = auth.uid() and window_key = v_minute_key;
  
  if v_minute_count >= v_minute_limit then
    return json_build_object('success', false, 'error_code', 429, 'message', 'Minute rate limit exceeded.');
  end if;

  select count into v_day_count from public.rate_limits 
  where user_id = auth.uid() and window_key = v_day_key;
  
  if v_day_count >= v_day_limit then
    return json_build_object('success', false, 'error_code', 429, 'message', 'Daily quota reached.');
  end if;

  insert into public.rate_limits (user_id, window_key, count, expires_at)
  values (auth.uid(), v_minute_key, 1, now() + interval '2 minutes')
  on conflict (user_id, window_key) do update set count = public.rate_limits.count + 1;

  insert into public.rate_limits (user_id, window_key, count, expires_at)
  values (auth.uid(), v_day_key, 1, now() + interval '25 hours')
  on conflict (user_id, window_key) do update set count = public.rate_limits.count + 1;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- 6. Atomic Credit Enforcement RPC
create or replace function public.consume_credits(amount integer)
returns json as $$
declare
  v_used integer;
  v_total integer;
begin
  select credits_used, credits_total into v_used, v_total
  from public.profiles
  where id = auth.uid()
  for update;

  if (v_used + amount) > v_total then
    return json_build_object('success', false, 'message', 'Insufficient credits.');
  end if;

  update public.profiles 
  set credits_used = credits_used + amount,
      updated_at = now()
  where id = auth.uid();

  return json_build_object('success', true, 'new_usage', v_used + amount);
end;
$$ language plpgsql security definer;

-- 7. Seed Data
insert into public.plans (name, price, credits, description, features) 
values 
('Starter', '$49', 500, 'Perfect for solo founders and small sales teams.', ARRAY['500 AI Credits', 'Basic Lead Scoring']),
('Professional', '$149', 2500, 'For growing teams that need scale and precision.', ARRAY['2500 AI Credits', 'Advanced Scoring', 'Priority Support']),
('Enterprise', 'Custom', 1000000, 'Infrastructure for high-volume enterprise teams.', ARRAY['Unlimited Credits', 'Full API Access'])
on conflict (name) do update set
  price = excluded.price,
  credits = excluded.credits,
  description = excluded.description,
  features = excluded.features;

insert into public.ai_prompts (name, version, template, is_active)
values ('sales_outreach', 1, 'You are a world-class SDR. Generate a {{type}} for {{lead_name}} at {{company}}. Context: {{insights}}', true)
on conflict (name, version) do nothing;

-- 8. Policies
do $$
begin
  drop policy if exists "Public Profiles Access" on public.profiles;
  create policy "Public Profiles Access" on public.profiles for select using (true);
  
  drop policy if exists "User/Admin Profile Updates" on public.profiles;
  create policy "User/Admin Profile Updates" on public.profiles for update 
  using (auth.uid() = id OR exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));

  drop policy if exists "Rate Limit View" on public.rate_limits;
  create policy "Rate Limit View" on public.rate_limits for select using (auth.uid() = user_id);

  drop policy if exists "Usage Logs Access" on public.ai_usage_logs;
  create policy "Usage Logs Access" on public.ai_usage_logs for select 
  using (auth.uid() = user_id OR exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN'));
end$$;

-- 9. Triggers
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'CLIENT');
  
  insert into public.subscriptions (user_id, plan_name, status, current_period_end)
  values (new.id, 'Starter', 'active', now() + interval '30 days');
  
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();`;

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
        else throw new Error("Profile synchronization failed. Schema v9.6 required.");
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
           <h2 className="text-3xl font-black text-slate-900 font-heading">Schema v9.6 Required</h2>
           <p className="text-slate-500 max-w-md mx-auto leading-relaxed font-medium">
             AuraFunnel detected that your Supabase architecture is out of sync. 
             Financial intelligence and cost tracking updates are mandatory.
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