import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, BarChart3, DollarSign, Package, Users, Zap, Mail, Plug,
  Upload, RefreshCw, ScrollText, ShieldCheck, Flag, ChevronRight,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, X,
  User as UserIcon, Download, Copy, ToggleLeft, ToggleRight,
  CreditCard, Play, RotateCcw, Eye, Send, Database, Sparkles,
  Plus, Trash2, Save, FileDown, Shield, Settings, Globe, Terminal,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  searchUsers, getTargetProfile, getTargetSubscription,
  getTargetIntegrations, getTargetEmailMessages,
  getActiveSession, downloadJson,
  type TargetProfile, type SupportSession,
} from '../../../lib/support';
import { logSupportAction } from '../../../lib/supportAudit';
import { getAllPlans, getPlans, invalidatePlanCache, type DbPlan } from '../../../lib/plans';
import { executeRpc, executeEdgeFn, executeMutation, type ActionResult } from '../../../lib/adminActions';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type CmdMode = 'global' | 'workspace';
type CmdTab =
  | 'overview' | 'plans' | 'entitlements' | 'users'
  | 'credits' | 'email' | 'integrations' | 'imports'
  | 'jobs' | 'logs' | 'security' | 'flags';

interface ActionLog {
  id: string;
  action: string;
  status: 'success' | 'error';
  message: string;
  ts: string;
  requestId: string;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const GLOBAL_TABS: { id: CmdTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',      label: 'Overview',           icon: <BarChart3 size={15} /> },
  { id: 'plans',         label: 'Plans & Pricing',    icon: <DollarSign size={15} /> },
  { id: 'entitlements',  label: 'Entitlements',       icon: <Package size={15} /> },
  { id: 'users',         label: 'Users',              icon: <Users size={15} /> },
  { id: 'jobs',          label: 'Jobs & Queues',      icon: <RefreshCw size={15} /> },
  { id: 'flags',         label: 'Feature Flags',      icon: <Flag size={15} /> },
];

const WORKSPACE_TABS: { id: CmdTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',      label: 'Overview',           icon: <BarChart3 size={15} /> },
  { id: 'users',         label: 'Subscription',       icon: <CreditCard size={15} /> },
  { id: 'credits',       label: 'Credits & Usage',    icon: <Zap size={15} /> },
  { id: 'entitlements',  label: 'Entitlements',       icon: <Package size={15} /> },
  { id: 'email',         label: 'Email',              icon: <Mail size={15} /> },
  { id: 'integrations',  label: 'Integrations',       icon: <Plug size={15} /> },
  { id: 'imports',       label: 'Imports',            icon: <Upload size={15} /> },
  { id: 'jobs',          label: 'Jobs',               icon: <RefreshCw size={15} /> },
  { id: 'logs',          label: 'Logs & Evidence',    icon: <ScrollText size={15} /> },
  { id: 'security',      label: 'Security',           icon: <ShieldCheck size={15} /> },
];

// ═══════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SectionCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h3>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-bold text-slate-700 font-mono max-w-[60%] truncate text-right">{String(value ?? '—')}</span>
    </div>
  );
}

function ActionBtn({ label, icon, onClick, loading, variant = 'default', disabled }: {
  label: string; icon: React.ReactNode; onClick: () => void;
  loading?: boolean; variant?: 'default' | 'danger' | 'success'; disabled?: boolean;
}) {
  const cls = {
    default: 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
    success: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${cls} ${(loading || disabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ResultToast({ result, onDismiss }: { result: ActionLog; onDismiss: () => void }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl text-xs border animate-in slide-in-from-right ${
      result.status === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
    }`}>
      {result.status === 'success' ? <CheckCircle2 size={14} className="text-emerald-500 mt-0.5" /> : <XCircle size={14} className="text-red-500 mt-0.5" />}
      <div className="flex-grow min-w-0">
        <p className="font-bold text-slate-700">{result.action}</p>
        <p className="text-slate-500 truncate">{result.message}</p>
        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{result.requestId} · {result.durationMs}ms</p>
      </div>
      <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const AdminCommandCenterPage: React.FC = () => {
  // Auth
  const [adminId, setAdminId] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Mode
  const [mode, setMode] = useState<CmdMode>('global');
  const [activeTab, setActiveTab] = useState<CmdTab>('overview');

  // Workspace selection
  const [wsSearch, setWsSearch] = useState('');
  const [wsResults, setWsResults] = useState<TargetProfile[]>([]);
  const [wsSearching, setWsSearching] = useState(false);
  const [selectedWs, setSelectedWs] = useState<TargetProfile | null>(null);
  const [wsSubscription, setWsSubscription] = useState<Record<string, unknown> | null>(null);

  // Data
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [featureFlags, setFeatureFlags] = useState<{ key: string; enabled: boolean; description: string | null; rules: Record<string, unknown>; updated_at: string }[]>([]);
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [wsIntegrations, setWsIntegrations] = useState<Record<string, unknown>[]>([]);
  const [wsEmails, setWsEmails] = useState<Record<string, unknown>[]>([]);
  const [wsSenders, setWsSenders] = useState<Record<string, unknown>[]>([]);
  const [wsEntitlements, setWsEntitlements] = useState<Record<string, unknown> | null>(null);
  const [wsUsage, setWsUsage] = useState<Record<string, unknown> | null>(null);
  const [wsAiUsage, setWsAiUsage] = useState<Record<string, unknown> | null>(null);
  const [wsImports, setWsImports] = useState<Record<string, unknown>[]>([]);

  // Support session
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);

  // Action state
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAdminId(user.id);
        supabase.from('profiles').select('is_super_admin').eq('id', user.id).single()
          .then(({ data }) => setIsSuperAdmin(data?.is_super_admin ?? false));
        getActiveSession(user.id).then(s => setSupportSession(s));
      }
    });
    loadPlans();
    loadFlags();
  }, []);

  const loadPlans = async () => {
    const data = await getAllPlans();
    setPlans(data);
  };

  const loadFlags = async () => {
    const { data } = await supabase.from('feature_flags').select('*').order('key');
    if (data) setFeatureFlags(data);
  };

  // ── Workspace search & select ────────────────────────────────────
  const handleWsSearch = useCallback(async () => {
    if (wsSearch.length < 2) return;
    setWsSearching(true);
    try {
      const results = await searchUsers(wsSearch);
      setWsResults(results);
    } finally { setWsSearching(false); }
  }, [wsSearch]);

  useEffect(() => {
    if (wsSearch.length < 2) { setWsResults([]); return; }
    const t = setTimeout(handleWsSearch, 400);
    return () => clearTimeout(t);
  }, [wsSearch, handleWsSearch]);

  const selectWorkspace = useCallback(async (profile: TargetProfile) => {
    setSelectedWs(profile);
    setMode('workspace');
    setActiveTab('overview');
    setWsSearch('');
    setWsResults([]);
    setLoading(true);

    try {
      const [sub, integrations, emails, entitlements, usage, aiUsage, senders, imports] = await Promise.all([
        getTargetSubscription(profile.id),
        getTargetIntegrations(profile.id),
        getTargetEmailMessages(profile.id, 50),
        supabase.from('workspace_entitlements').select('*').eq('workspace_id', profile.id).maybeSingle().then(r => r.data),
        supabase.rpc('get_workspace_monthly_usage', { p_workspace_id: profile.id, p_month_key: new Date().toISOString().slice(0, 7) }).then(r => {
          const row = Array.isArray(r.data) ? r.data[0] : r.data;
          return row ?? null;
        }),
        supabase.from('workspace_ai_usage').select('*').eq('workspace_id', profile.id).eq('month_year', new Date().toISOString().slice(0, 7)).maybeSingle().then(r => r.data),
        supabase.from('sender_accounts').select('id, provider, display_name, from_email, status, is_default, daily_sent_today, warmup_enabled, health_score, created_at').eq('workspace_id', profile.id).then(r => r.data ?? []),
        supabase.from('import_batches').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20).then(r => r.data ?? []),
      ]);
      setWsSubscription(sub);
      setWsIntegrations(integrations);
      setWsEmails(emails);
      setWsEntitlements(entitlements);
      setWsUsage(usage);
      setWsAiUsage(aiUsage);
      setWsSenders(senders as Record<string, unknown>[]);
      setWsImports(imports);
    } catch (err) {
      console.error('Workspace load error:', err);
    } finally { setLoading(false); }
  }, []);

  const clearWorkspace = () => {
    setSelectedWs(null);
    setMode('global');
    setActiveTab('overview');
    setWsSubscription(null);
    setWsIntegrations([]);
    setWsEmails([]);
    setWsSenders([]);
    setWsEntitlements(null);
    setWsUsage(null);
    setWsAiUsage(null);
    setWsImports([]);
  };

  // ── Action executor wrapper ──────────────────────────────────────
  const runAction = useCallback(async (
    fn: () => Promise<ActionResult>,
    actionLabel: string,
  ) => {
    const result = await fn();
    const log: ActionLog = {
      id: result.requestId,
      action: actionLabel,
      status: result.success ? 'success' : 'error',
      message: result.message,
      ts: new Date().toISOString(),
      requestId: result.requestId,
      durationMs: result.durationMs,
    };
    setActionLogs(prev => [log, ...prev].slice(0, 50));
    return result;
  }, []);

  const dismissLog = (id: string) => setActionLogs(prev => prev.filter(l => l.id !== id));

  // ── Load audit logs for workspace ────────────────────────────────
  const loadAuditLogs = useCallback(async () => {
    if (!selectedWs) return;
    const { data } = await supabase.from('audit_logs')
      .select('*')
      .or(`user_id.eq.${selectedWs.id},resource_id.eq.${selectedWs.id}`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setAuditLogs(data);
  }, [selectedWs]);

  useEffect(() => {
    if (activeTab === 'logs' && selectedWs) loadAuditLogs();
  }, [activeTab, selectedWs, loadAuditLogs]);

  // ── Current tabs ─────────────────────────────────────────────────
  const tabs = mode === 'workspace' ? WORKSPACE_TABS : GLOBAL_TABS;

  const actionOpts = useMemo(() => ({
    supportSessionId: supportSession?.id ?? null,
    targetUserId: selectedWs?.id,
  }), [supportSession, selectedWs]);

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Command Center</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {mode === 'global' ? 'Global administration — plans, jobs, flags' : `Workspace: ${selectedWs?.email}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'workspace' && (
            <button onClick={clearWorkspace} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
              <Globe size={14} /> Switch to Global
            </button>
          )}
          <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${mode === 'global' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {mode} mode
          </span>
        </div>
      </div>

      {/* Workspace picker */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            value={wsSearch}
            onChange={e => setWsSearch(e.target.value)}
            placeholder="Search workspace by email or name..."
            className="flex-grow text-sm outline-none text-slate-700 placeholder:text-slate-300"
          />
          {wsSearching && <Loader2 size={16} className="animate-spin text-indigo-500" />}
          {selectedWs && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
              <UserIcon size={14} className="text-indigo-500" />
              <span className="text-xs font-bold text-indigo-700">{selectedWs.name || selectedWs.email}</span>
              <button onClick={clearWorkspace} className="text-indigo-400 hover:text-indigo-600"><X size={14} /></button>
            </div>
          )}
        </div>
        {wsResults.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
            {wsResults.map(u => (
              <button
                key={u.id}
                onClick={() => selectWorkspace(u)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-600 uppercase">
                  {u.name?.charAt(0) || u.email?.charAt(0) || '?'}
                </div>
                <div className="min-w-0 flex-grow">
                  <p className="text-xs font-bold text-slate-700 truncate">{u.name || 'Unnamed'}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">{u.plan || 'Free'}</span>
                <ChevronRight size={14} className="text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-lg'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Action log toast area */}
      {actionLogs.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {actionLogs.slice(0, 3).map(log => (
            <ResultToast key={log.id} result={log} onDismiss={() => dismissLog(log.id)} />
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ════ OVERVIEW ════ */}
          {activeTab === 'overview' && mode === 'global' && (
            <GlobalOverview plans={plans} flags={featureFlags} />
          )}
          {activeTab === 'overview' && mode === 'workspace' && selectedWs && (
            <WorkspaceOverview
              profile={selectedWs}
              subscription={wsSubscription}
              usage={wsUsage}
              aiUsage={wsAiUsage}
              entitlements={wsEntitlements}
            />
          )}

          {/* ════ PLANS & PRICING ════ */}
          {activeTab === 'plans' && (
            <PlansSection
              plans={plans}
              adminId={adminId}
              onRefresh={loadPlans}
              runAction={runAction}
            />
          )}

          {/* ════ ENTITLEMENTS ════ */}
          {activeTab === 'entitlements' && mode === 'global' && (
            <GlobalEntitlements />
          )}
          {activeTab === 'entitlements' && mode === 'workspace' && selectedWs && (
            <WorkspaceEntitlements
              profile={selectedWs}
              entitlements={wsEntitlements}
              adminId={adminId}
              runAction={runAction}
              actionOpts={actionOpts}
              onRefresh={() => selectWorkspace(selectedWs)}
            />
          )}

          {/* ════ USERS / SUBSCRIPTION ════ */}
          {activeTab === 'users' && mode === 'global' && (
            <GlobalUsers adminId={adminId} plans={plans} runAction={runAction} />
          )}
          {activeTab === 'users' && mode === 'workspace' && selectedWs && (
            <WorkspaceSubscription
              profile={selectedWs}
              subscription={wsSubscription}
              plans={plans}
              adminId={adminId}
              runAction={runAction}
              actionOpts={actionOpts}
              onRefresh={() => selectWorkspace(selectedWs)}
            />
          )}

          {/* ════ CREDITS & USAGE ════ */}
          {activeTab === 'credits' && selectedWs && (
            <CreditsSection
              profile={selectedWs}
              usage={wsUsage}
              aiUsage={wsAiUsage}
              adminId={adminId}
              isSuperAdmin={isSuperAdmin}
              runAction={runAction}
              actionOpts={actionOpts}
              onRefresh={() => selectWorkspace(selectedWs)}
            />
          )}

          {/* ════ EMAIL ════ */}
          {activeTab === 'email' && selectedWs && (
            <EmailSection
              profile={selectedWs}
              emails={wsEmails}
              senders={wsSenders}
              adminId={adminId}
              isSuperAdmin={isSuperAdmin}
              runAction={runAction}
              actionOpts={actionOpts}
            />
          )}

          {/* ════ INTEGRATIONS ════ */}
          {activeTab === 'integrations' && selectedWs && (
            <IntegrationsSection
              profile={selectedWs}
              integrations={wsIntegrations}
              adminId={adminId}
              runAction={runAction}
              actionOpts={actionOpts}
            />
          )}

          {/* ════ IMPORTS ════ */}
          {activeTab === 'imports' && selectedWs && (
            <ImportsSection imports={wsImports} />
          )}

          {/* ════ JOBS & QUEUES ════ */}
          {activeTab === 'jobs' && (
            <JobsSection
              adminId={adminId}
              wsId={selectedWs?.id}
              runAction={runAction}
              actionOpts={actionOpts}
            />
          )}

          {/* ════ LOGS & EVIDENCE ════ */}
          {activeTab === 'logs' && selectedWs && (
            <LogsSection
              profile={selectedWs}
              logs={auditLogs}
              adminId={adminId}
              runAction={runAction}
              actionOpts={actionOpts}
              onRefresh={loadAuditLogs}
            />
          )}

          {/* ════ SECURITY ════ */}
          {activeTab === 'security' && selectedWs && (
            <SecuritySection
              profile={selectedWs}
              adminId={adminId}
              isSuperAdmin={isSuperAdmin}
              supportSession={supportSession}
              onSessionChange={setSupportSession}
              runAction={runAction}
            />
          )}

          {/* ════ FEATURE FLAGS ════ */}
          {activeTab === 'flags' && (
            <FlagsSection
              flags={featureFlags}
              adminId={adminId}
              runAction={runAction}
              onRefresh={loadFlags}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Global Overview
// ═══════════════════════════════════════════════════════════════════════════

function GlobalOverview({ plans, flags }: { plans: DbPlan[]; flags: { key: string; enabled: boolean }[] }) {
  const [stats, setStats] = useState({ users: 0, active: 0, paid: 0, mrr: 0 });

  useEffect(() => {
    supabase.from('profiles').select('id, status, plan', { count: 'exact', head: false }).then(({ data, count }) => {
      if (!data) return;
      const active = data.filter(u => u.status === 'active').length;
      const paid = data.filter(u => u.plan && u.plan !== 'Free' && u.plan !== 'Starter').length;
      const starterCount = data.filter(u => u.plan === 'Starter').length;
      const growthCount = data.filter(u => u.plan === 'Growth' || u.plan === 'Professional').length;
      const scaleCount = data.filter(u => u.plan === 'Scale' || u.plan === 'Enterprise' || u.plan === 'Business').length;
      const mrr = starterCount * 29 + growthCount * 79 + scaleCount * 199;
      setStats({ users: count ?? data.length, active, paid: paid + starterCount, mrr });
    });
  }, []);

  const kpis = [
    { label: 'Total Users', value: stats.users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Active', value: stats.active, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Paid Plans', value: stats.paid, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Est. MRR', value: `$${stats.mrr.toLocaleString()}`, color: 'text-amber-600 bg-amber-50' },
    { label: 'Plans', value: plans.length, color: 'text-violet-600 bg-violet-50' },
    { label: 'Flags On', value: flags.filter(f => f.enabled).length, color: 'text-teal-600 bg-teal-50' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map(k => (
        <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
          <p className={`text-2xl font-bold font-heading ${k.color.split(' ')[0]}`}>{k.value}</p>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Workspace Overview
// ═══════════════════════════════════════════════════════════════════════════

function WorkspaceOverview({ profile, subscription, usage, aiUsage, entitlements }: {
  profile: TargetProfile; subscription: Record<string, unknown> | null;
  usage: Record<string, unknown> | null; aiUsage: Record<string, unknown> | null;
  entitlements: Record<string, unknown> | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SectionCard title="Profile">
        <StatRow label="ID" value={profile.id} />
        <StatRow label="Email" value={profile.email} />
        <StatRow label="Name" value={profile.name} />
        <StatRow label="Role" value={profile.role} />
        <StatRow label="Status" value={profile.status} />
        <StatRow label="Plan" value={profile.plan} />
        <StatRow label="Credits" value={`${profile.credits_used} / ${profile.credits_total}`} />
      </SectionCard>
      <SectionCard title="Subscription">
        {subscription ? (
          <>
            <StatRow label="Plan" value={String(subscription.plan_name ?? subscription.plan)} />
            <StatRow label="Status" value={String(subscription.status)} />
            <StatRow label="Period End" value={String(subscription.current_period_end ?? subscription.expires_at)} />
          </>
        ) : <p className="text-xs text-slate-400 italic">No subscription data</p>}
      </SectionCard>
      <SectionCard title="Monthly Usage">
        {usage ? (
          <>
            <StatRow label="Emails Sent" value={String(usage.total_emails_sent ?? usage.emails_sent ?? 0)} />
            <StatRow label="LinkedIn" value={String(usage.total_linkedin_actions ?? usage.linkedin_actions ?? 0)} />
            <StatRow label="AI Credits" value={String(usage.total_ai_credits_used ?? usage.ai_credits_used ?? 0)} />
          </>
        ) : <p className="text-xs text-slate-400 italic">No usage data</p>}
      </SectionCard>
      <SectionCard title="AI Usage">
        {aiUsage ? (
          <>
            <StatRow label="Credits Used" value={String(aiUsage.credits_used)} />
            <StatRow label="Credits Limit" value={String(aiUsage.credits_limit)} />
            <StatRow label="Tokens Used" value={String(aiUsage.tokens_used)} />
          </>
        ) : <p className="text-xs text-slate-400 italic">No AI usage data</p>}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Plans & Pricing
// ═══════════════════════════════════════════════════════════════════════════

function PlansSection({ plans, adminId, onRefresh, runAction }: {
  plans: DbPlan[]; adminId: string; onRefresh: () => void;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
}) {
  const [cloneName, setCloneName] = useState('');
  const [cloneKey, setCloneKey] = useState('');
  const [cloneSource, setCloneSource] = useState('');

  const clonePlan = async () => {
    if (!cloneSource || !cloneName || !cloneKey) return;
    await runAction(
      () => executeRpc(adminId, 'admin_clone_plan', {
        p_source_plan_id: cloneSource, p_new_name: cloneName, p_new_key: cloneKey, p_admin_id: adminId,
      }, 'ADMIN_PLAN_CLONED'),
      'Clone Plan',
    );
    invalidatePlanCache();
    onRefresh();
    setCloneName(''); setCloneKey(''); setCloneSource('');
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Active Plans">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-2">Name</th><th className="pb-2">Key</th><th className="pb-2">Price</th>
                <th className="pb-2">Credits</th><th className="pb-2">AI Credits</th><th className="pb-2">Inboxes</th>
                <th className="pb-2">Emails/Mo</th><th className="pb-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className="border-b border-slate-50 text-xs">
                  <td className="py-2 font-bold text-slate-700">{p.name}</td>
                  <td className="py-2 font-mono text-slate-400">{p.key || '—'}</td>
                  <td className="py-2">{p.price}</td>
                  <td className="py-2">{p.credits.toLocaleString()}</td>
                  <td className="py-2">{p.limits.aiCreditsMonthly.toLocaleString()}</td>
                  <td className="py-2">{p.limits.maxInboxes}</td>
                  <td className="py-2">{p.limits.emailsPerMonth.toLocaleString()}</td>
                  <td className="py-2">{p.is_active ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-red-400" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">Edit plans in detail at <span className="font-bold">/admin/pricing</span></p>
      </SectionCard>

      <SectionCard title="Clone Plan">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Source</label>
            <select value={cloneSource} onChange={e => setCloneSource(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
              <option value="">Select...</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">New Name</label>
            <input type="text" value={cloneName} onChange={e => setCloneName(e.target.value)}
              placeholder="e.g. Enterprise" className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Key</label>
            <input type="text" value={cloneKey} onChange={e => setCloneKey(e.target.value)}
              placeholder="e.g. enterprise" className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono outline-none w-32" />
          </div>
          <ActionBtn label="Clone" icon={<Copy size={13} />} onClick={clonePlan} disabled={!cloneSource || !cloneName || !cloneKey} />
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Entitlements
// ═══════════════════════════════════════════════════════════════════════════

function GlobalEntitlements() {
  return (
    <SectionCard title="Entitlements System">
      <div className="space-y-3 text-xs text-slate-600">
        <p>Entitlements = <span className="font-bold">Plan Limits</span> + <span className="font-bold">Per-Workspace Overrides</span></p>
        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
          <p className="font-bold text-indigo-700 mb-1">How it works:</p>
          <ul className="list-disc ml-4 space-y-1 text-indigo-600">
            <li>Each plan defines base limits (credits, inboxes, emails, etc.)</li>
            <li>Admins can apply per-workspace overrides that stack on top</li>
            <li>Effective limits = plan limits merged with overrides</li>
            <li>Select a workspace above to manage individual overrides</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

function WorkspaceEntitlements({ profile, entitlements, adminId, runAction, actionOpts, onRefresh }: {
  profile: TargetProfile; entitlements: Record<string, unknown> | null;
  adminId: string; runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string }; onRefresh: () => void;
}) {
  const [overrideJson, setOverrideJson] = useState(
    JSON.stringify(entitlements?.overrides ?? {}, null, 2)
  );
  const [reason, setReason] = useState('');

  const applyOverrides = async () => {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(overrideJson); } catch { alert('Invalid JSON'); return; }

    await runAction(
      () => executeRpc(adminId, 'admin_update_entitlements', {
        p_workspace_id: profile.id, p_overrides: parsed, p_admin_id: adminId, p_reason: reason || 'Admin override',
      }, 'ADMIN_ENTITLEMENTS_UPDATED', actionOpts),
      'Update Entitlements',
    );
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Current Entitlements">
        {entitlements ? (
          <>
            <StatRow label="Plan ID" value={String(entitlements.plan_id)} />
            <StatRow label="Updated" value={String(entitlements.updated_at)} />
            <div className="mt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Effective Limits</p>
              <pre className="text-[10px] bg-slate-50 p-3 rounded-lg overflow-x-auto font-mono text-slate-600">
                {JSON.stringify(entitlements.effective_limits, null, 2)}
              </pre>
            </div>
          </>
        ) : <p className="text-xs text-slate-400 italic">No entitlements configured — using plan defaults</p>}
      </SectionCard>

      <SectionCard title="Apply Override">
        <div className="space-y-3">
          <textarea
            value={overrideJson}
            onChange={e => setOverrideJson(e.target.value)}
            rows={6}
            className="w-full p-3 bg-slate-950 text-indigo-200 font-mono text-xs rounded-lg outline-none resize-none"
            placeholder='{"extra_credits": 500, "extra_inboxes": 2}'
          />
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason..." className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none" />
          <ActionBtn label="Apply Overrides" icon={<Save size={13} />} onClick={applyOverrides} />
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Workspace Subscription
// ═══════════════════════════════════════════════════════════════════════════

function WorkspaceSubscription({ profile, subscription, plans, adminId, runAction, actionOpts, onRefresh }: {
  profile: TargetProfile; subscription: Record<string, unknown> | null; plans: DbPlan[];
  adminId: string; runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string }; onRefresh: () => void;
}) {
  const [newPlan, setNewPlan] = useState('');
  const [reason, setReason] = useState('');

  const currentPlan = String(subscription?.plan_name ?? subscription?.plan ?? profile.plan ?? 'Starter');

  const changePlan = async () => {
    if (!newPlan || newPlan === currentPlan) return;
    await runAction(
      () => executeRpc(adminId, 'admin_change_user_plan', {
        p_target_user_id: profile.id, p_new_plan_name: newPlan, p_admin_id: adminId, p_reason: reason || 'Admin override',
      }, 'ADMIN_USER_PLAN_CHANGED', actionOpts),
      'Change Plan',
    );
    onRefresh();
  };

  const toggleStatus = async () => {
    const newStatus = profile.status === 'active' ? 'disabled' : 'active';
    await runAction(
      () => executeMutation(adminId, profile.status === 'active' ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_RESUMED',
        async () => supabase.from('profiles').update({ status: newStatus }).eq('id', profile.id).then(r => ({ error: r.error ? { message: r.error.message } : null })),
        { target_user_id: profile.id, old_status: profile.status, new_status: newStatus },
        actionOpts,
      ),
      profile.status === 'active' ? 'Suspend User' : 'Resume User',
    );
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Current Subscription">
        <StatRow label="Profile Plan" value={profile.plan} />
        {subscription && (
          <>
            <StatRow label="Sub Plan" value={String(subscription.plan_name ?? subscription.plan)} />
            <StatRow label="Status" value={String(subscription.status)} />
            <StatRow label="Period End" value={String(subscription.current_period_end ?? subscription.expires_at)} />
          </>
        )}
      </SectionCard>

      <SectionCard title="Change Package">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-grow">
            <label className="text-[10px] font-bold text-slate-400 uppercase">New Plan</label>
            <select value={newPlan} onChange={e => setNewPlan(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
              <option value="">Select...</option>
              {plans.filter(p => p.name !== currentPlan).map(p => (
                <option key={p.id} value={p.name}>{p.name} ({p.price})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-grow">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Reason</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Optional..." className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none" />
          </div>
          <ActionBtn label="Apply" icon={<CreditCard size={13} />} onClick={changePlan} disabled={!newPlan} />
        </div>
      </SectionCard>

      <SectionCard title="Account Controls">
        <ActionBtn
          label={profile.status === 'active' ? 'Suspend Account' : 'Resume Account'}
          icon={profile.status === 'active' ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
          onClick={toggleStatus}
          variant={profile.status === 'active' ? 'danger' : 'success'}
        />
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Global Users (bulk)
// ═══════════════════════════════════════════════════════════════════════════

function GlobalUsers({ adminId, plans, runAction }: {
  adminId: string; plans: DbPlan[];
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
}) {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkPlan, setBulkPlan] = useState('');
  const [bulkCredits, setBulkCredits] = useState(0);

  useEffect(() => {
    supabase.from('profiles').select('id, email, name, plan, status, credits_total, credits_used, createdAt')
      .order('createdAt', { ascending: false }).limit(200)
      .then(({ data }) => { if (data) setUsers(data); setLoading(false); });
  }, []);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(users.map(u => u.id as string)));
  const clearAll = () => setSelected(new Set());

  const bulkChangePlan = async () => {
    if (!bulkPlan || selected.size === 0) return;
    for (const uid of selected) {
      await runAction(
        () => executeRpc(adminId, 'admin_change_user_plan', {
          p_target_user_id: uid, p_new_plan_name: bulkPlan, p_admin_id: adminId, p_reason: 'Bulk plan change',
        }, 'ADMIN_USER_PLAN_CHANGED'),
        `Change plan → ${bulkPlan}`,
      );
    }
    // Refresh
    supabase.from('profiles').select('id, email, name, plan, status, credits_total, credits_used, createdAt')
      .order('createdAt', { ascending: false }).limit(200)
      .then(({ data }) => { if (data) setUsers(data); });
  };

  const bulkGrantCredits = async () => {
    if (bulkCredits <= 0 || selected.size === 0) return;
    for (const uid of selected) {
      await runAction(
        () => executeRpc(adminId, 'admin_grant_credits', {
          p_workspace_id: uid, p_amount: bulkCredits, p_admin_id: adminId, p_reason: 'Bulk grant',
        }, 'ADMIN_CREDITS_GRANTED'),
        `Grant ${bulkCredits} credits`,
      );
    }
  };

  const exportCsv = () => {
    const selectedUsers = users.filter(u => selected.has(u.id as string));
    const headers = ['id', 'email', 'name', 'plan', 'status', 'credits_total', 'credits_used'];
    const csv = [headers.join(','), ...selectedUsers.map(u => headers.map(h => String(u[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `users_export_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      {selected.size > 0 && (
        <SectionCard title={`Bulk Actions (${selected.size} selected)`}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Change Plan</label>
              <div className="flex gap-2">
                <select value={bulkPlan} onChange={e => setBulkPlan(e.target.value)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                  <option value="">Select...</option>
                  {plans.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <ActionBtn label="Apply" icon={<CreditCard size={13} />} onClick={bulkChangePlan} disabled={!bulkPlan} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Grant Credits</label>
              <div className="flex gap-2">
                <input type="number" value={bulkCredits} onChange={e => setBulkCredits(parseInt(e.target.value) || 0)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none w-24" />
                <ActionBtn label="Grant" icon={<Plus size={13} />} onClick={bulkGrantCredits} disabled={bulkCredits <= 0} />
              </div>
            </div>
            <ActionBtn label="Export CSV" icon={<FileDown size={13} />} onClick={exportCsv} />
            <ActionBtn label="Clear Selection" icon={<X size={13} />} onClick={clearAll} />
          </div>
        </SectionCard>
      )}

      {/* Users table */}
      <SectionCard title="Users" actions={
        <button onClick={selectAll} className="text-[10px] font-bold text-indigo-600 hover:underline">Select All</button>
      }>
        {loading ? <Loader2 size={18} className="animate-spin text-indigo-500 mx-auto" /> : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="pb-2 w-8"></th>
                  <th className="pb-2">Email</th><th className="pb-2">Name</th><th className="pb-2">Plan</th>
                  <th className="pb-2">Status</th><th className="pb-2">Credits</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id as string} className={`border-b border-slate-50 text-xs cursor-pointer hover:bg-slate-50 ${selected.has(u.id as string) ? 'bg-indigo-50' : ''}`}
                    onClick={() => toggleSelect(u.id as string)}>
                    <td className="py-2">
                      <input type="checkbox" checked={selected.has(u.id as string)} readOnly className="rounded border-slate-300" />
                    </td>
                    <td className="py-2 font-mono text-slate-500 truncate max-w-[200px]">{u.email as string}</td>
                    <td className="py-2 font-bold text-slate-700">{(u.name as string) || '—'}</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold">{(u.plan as string) || 'Free'}</span></td>
                    <td className="py-2"><span className={`text-[9px] font-bold uppercase ${u.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{u.status as string}</span></td>
                    <td className="py-2 text-slate-500">{String(u.credits_used ?? 0)}/{String(u.credits_total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Credits & Usage
// ═══════════════════════════════════════════════════════════════════════════

function CreditsSection({ profile, usage, aiUsage, adminId, isSuperAdmin, runAction, actionOpts, onRefresh }: {
  profile: TargetProfile; usage: Record<string, unknown> | null; aiUsage: Record<string, unknown> | null;
  adminId: string; isSuperAdmin: boolean;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string }; onRefresh: () => void;
}) {
  const [grantAmt, setGrantAmt] = useState(100);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [reason, setReason] = useState('');

  const grant = async () => {
    await runAction(
      () => executeRpc(adminId, 'admin_grant_credits', {
        p_workspace_id: profile.id, p_amount: grantAmt, p_admin_id: adminId, p_reason: reason || 'Admin grant',
      }, 'ADMIN_CREDITS_GRANTED', actionOpts),
      `Grant ${grantAmt} credits`,
    );
    onRefresh();
  };

  const adjust = async () => {
    await runAction(
      () => executeRpc(adminId, 'admin_adjust_credits_used', {
        p_workspace_id: profile.id, p_delta: adjustDelta, p_admin_id: adminId, p_reason: reason || 'Admin adjustment',
      }, 'ADMIN_CREDITS_ADJUSTED', actionOpts),
      `Adjust credits used by ${adjustDelta}`,
    );
    onRefresh();
  };

  const resetUsage = async () => {
    if (!confirm('Reset all monthly usage counters? This is irreversible.')) return;
    await runAction(
      () => executeRpc(adminId, 'admin_reset_monthly_usage', {
        p_workspace_id: profile.id, p_admin_id: adminId, p_reason: reason || 'Admin reset',
      }, 'ADMIN_USAGE_RESET', actionOpts),
      'Reset Monthly Usage',
    );
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Credit Balances">
          <StatRow label="Total" value={profile.credits_total} />
          <StatRow label="Used" value={profile.credits_used} />
          <StatRow label="Remaining" value={profile.credits_total - profile.credits_used} />
        </SectionCard>
        <SectionCard title="Monthly Usage">
          {usage ? (
            <>
              <StatRow label="Emails" value={String(usage.total_emails_sent ?? usage.emails_sent ?? 0)} />
              <StatRow label="LinkedIn" value={String(usage.total_linkedin_actions ?? usage.linkedin_actions ?? 0)} />
              <StatRow label="AI Credits" value={String(usage.total_ai_credits_used ?? usage.ai_credits_used ?? 0)} />
            </>
          ) : <p className="text-xs text-slate-400 italic">No data</p>}
        </SectionCard>
      </div>

      <SectionCard title="AI Usage">
        {aiUsage ? (
          <>
            <StatRow label="Credits Used" value={String(aiUsage.credits_used)} />
            <StatRow label="Credits Limit" value={String(aiUsage.credits_limit)} />
            <StatRow label="Tokens Used" value={String(aiUsage.tokens_used)} />
          </>
        ) : <p className="text-xs text-slate-400 italic">No AI usage data this month</p>}
      </SectionCard>

      <SectionCard title="Admin Actions">
        <div className="space-y-4">
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for action..." className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none" />

          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Grant Credits</label>
              <div className="flex gap-2">
                <input type="number" value={grantAmt} onChange={e => setGrantAmt(parseInt(e.target.value) || 0)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none w-24" />
                <ActionBtn label="Grant" icon={<Plus size={13} />} onClick={grant} variant="success" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Adjust Used (delta)</label>
              <div className="flex gap-2">
                <input type="number" value={adjustDelta} onChange={e => setAdjustDelta(parseInt(e.target.value) || 0)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none w-24" />
                <ActionBtn label="Adjust" icon={<Settings size={13} />} onClick={adjust} />
              </div>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="pt-3 border-t border-slate-100">
              <ActionBtn label="Reset Monthly Usage" icon={<RotateCcw size={13} />} onClick={resetUsage} variant="danger" />
              <p className="text-[10px] text-red-400 mt-1">Super-admin only. Resets all usage counters for current month.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Email Deliverability
// ═══════════════════════════════════════════════════════════════════════════

function EmailSection({ profile, emails, senders, adminId, isSuperAdmin, runAction, actionOpts }: {
  profile: TargetProfile; emails: Record<string, unknown>[]; senders: Record<string, unknown>[];
  adminId: string; isSuperAdmin: boolean;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string };
}) {
  const kickWritingQueue = () => runAction(
    () => executeEdgeFn(adminId, 'process-email-writing-queue', { run_id: null }, 'ADMIN_EMAIL_QUEUE_KICKED', actionOpts),
    'Kick Writing Queue',
  );
  const kickScheduled = () => runAction(
    () => executeEdgeFn(adminId, 'process-scheduled-emails', {}, 'ADMIN_SCHEDULED_KICKED', actionOpts),
    'Kick Scheduled Processor',
  );
  const refreshAnalytics = () => runAction(
    () => executeRpc(adminId, 'refresh_email_analytics', {}, 'ADMIN_EMAIL_ANALYTICS_REFRESHED', actionOpts),
    'Refresh Analytics',
  );
  const resetStuck = () => runAction(
    () => executeRpc(adminId, 'reset_stuck_writing_items', {}, 'ADMIN_EMAIL_STUCK_RESET', actionOpts),
    'Reset Stuck Items',
  );

  return (
    <div className="space-y-4">
      <SectionCard title="Sender Accounts (Safe View)">
        {senders.length === 0 ? <p className="text-xs text-slate-400 italic">No sender accounts</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="pb-2">Email</th><th className="pb-2">Provider</th><th className="pb-2">Status</th>
                  <th className="pb-2">Daily Sent</th><th className="pb-2">Warmup</th><th className="pb-2">Health</th>
                </tr>
              </thead>
              <tbody>
                {senders.map((s, i) => (
                  <tr key={i} className="border-b border-slate-50 text-xs">
                    <td className="py-2 font-mono text-slate-600">{String(s.from_email)}</td>
                    <td className="py-2">{String(s.provider)}</td>
                    <td className="py-2"><span className={`text-[9px] font-bold uppercase ${s.status === 'connected' ? 'text-emerald-600' : 'text-amber-600'}`}>{String(s.status)}</span></td>
                    <td className="py-2">{String(s.daily_sent_today ?? 0)}</td>
                    <td className="py-2">{s.warmup_enabled ? <CheckCircle2 size={12} className="text-emerald-500" /> : <XCircle size={12} className="text-slate-300" />}</td>
                    <td className="py-2">{s.health_score != null ? `${s.health_score}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Messages (Last 50)">
        {emails.length === 0 ? <p className="text-xs text-slate-400 italic">No messages</p> : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="pb-2">To</th><th className="pb-2">Subject</th><th className="pb-2">Status</th><th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((e, i) => (
                  <tr key={i} className="border-b border-slate-50 text-xs">
                    <td className="py-1.5 font-mono text-slate-500 truncate max-w-[150px]">{String(e.to_email ?? '')}</td>
                    <td className="py-1.5 truncate max-w-[200px]">{String(e.subject ?? '—')}</td>
                    <td className="py-1.5"><span className={`text-[9px] font-bold uppercase ${e.status === 'delivered' ? 'text-emerald-600' : e.status === 'bounced' ? 'text-red-600' : 'text-slate-500'}`}>{String(e.status)}</span></td>
                    <td className="py-1.5 text-slate-400">{String(e.created_at ?? '').slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Repair Actions">
        <div className="flex flex-wrap gap-2">
          <ActionBtn label="Kick Writing Queue" icon={<Play size={13} />} onClick={kickWritingQueue} />
          <ActionBtn label="Kick Scheduled" icon={<Send size={13} />} onClick={kickScheduled} />
          <ActionBtn label="Refresh Analytics" icon={<RefreshCw size={13} />} onClick={refreshAnalytics} />
          <ActionBtn label="Reset Stuck Items" icon={<RotateCcw size={13} />} onClick={resetStuck} />
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Integrations
// ═══════════════════════════════════════════════════════════════════════════

function IntegrationsSection({ profile, integrations, adminId, runAction, actionOpts }: {
  profile: TargetProfile; integrations: Record<string, unknown>[];
  adminId: string;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string };
}) {
  const validate = (intId: string, provider: string) => runAction(
    () => executeEdgeFn(adminId, 'validate-integration', {
      target_user_id: profile.id, integration_id: intId, provider,
    }, 'ADMIN_INTEGRATION_VALIDATED', actionOpts),
    `Validate ${provider}`,
  );

  const debug = (intId: string, provider: string) => runAction(
    () => executeEdgeFn(adminId, 'support-debug-integration', {
      target_user_id: profile.id, integration_id: intId, integration_type: provider,
    }, 'ADMIN_INTEGRATION_DEBUGGED', actionOpts),
    `Debug ${provider}`,
  );

  return (
    <SectionCard title="Installed Integrations">
      {integrations.length === 0 ? <p className="text-xs text-slate-400 italic">No integrations</p> : (
        <div className="space-y-3">
          {integrations.map((int, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xs font-bold text-slate-700">{String(int.provider)} — <span className={`${int.status === 'connected' ? 'text-emerald-600' : 'text-red-500'}`}>{String(int.status)}</span></p>
                <p className="text-[10px] text-slate-400">{String(int.category ?? '')} · Last sync: {String(int.updated_at ?? '—').slice(0, 16)}</p>
              </div>
              <div className="flex gap-1">
                <ActionBtn label="Validate" icon={<CheckCircle2 size={11} />} onClick={() => validate(String(int.id), String(int.provider))} />
                <ActionBtn label="Debug" icon={<Terminal size={11} />} onClick={() => debug(String(int.id), String(int.provider))} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Imports
// ═══════════════════════════════════════════════════════════════════════════

function ImportsSection({ imports }: { imports: Record<string, unknown>[] }) {
  return (
    <SectionCard title="Import Batches">
      {imports.length === 0 ? <p className="text-xs text-slate-400 italic">No import batches</p> : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-2">ID</th><th className="pb-2">Status</th><th className="pb-2">Total</th>
                <th className="pb-2">Success</th><th className="pb-2">Failed</th><th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((b, i) => (
                <tr key={i} className="border-b border-slate-50 text-xs">
                  <td className="py-1.5 font-mono text-slate-400 truncate max-w-[100px]">{String(b.id ?? '').slice(0, 8)}</td>
                  <td className="py-1.5"><span className={`text-[9px] font-bold uppercase ${b.status === 'completed' ? 'text-emerald-600' : b.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>{String(b.status)}</span></td>
                  <td className="py-1.5">{String(b.total_rows ?? b.row_count ?? 0)}</td>
                  <td className="py-1.5 text-emerald-600">{String(b.success_count ?? 0)}</td>
                  <td className="py-1.5 text-red-500">{String(b.error_count ?? b.failed_count ?? 0)}</td>
                  <td className="py-1.5 text-slate-400">{String(b.created_at ?? '').slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Jobs & Queues
// ═══════════════════════════════════════════════════════════════════════════

function JobsSection({ adminId, wsId, runAction, actionOpts }: {
  adminId: string; wsId?: string;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string };
}) {
  const jobs = [
    { name: 'Email Writing Queue', fn: 'process-email-writing-queue', type: 'edge', scope: 'global' },
    { name: 'Scheduled Email Processor', fn: 'process-scheduled-emails', type: 'edge', scope: 'global' },
    { name: 'Social Scheduler', fn: 'social-run-scheduler', type: 'edge', scope: 'global' },
    { name: 'Refresh Email Analytics', fn: 'refresh_email_analytics', type: 'rpc', scope: 'global' },
    { name: 'Reset Stuck Writing Items', fn: 'reset_stuck_writing_items', type: 'rpc', scope: 'global' },
  ];

  const runJob = (job: typeof jobs[0]) => {
    const label = `ADMIN_JOB_TRIGGERED`;
    if (job.type === 'edge') {
      return runAction(() => executeEdgeFn(adminId, job.fn, {}, label, actionOpts), job.name);
    }
    return runAction(() => executeRpc(adminId, job.fn, {}, label, actionOpts), job.name);
  };

  return (
    <SectionCard title="Jobs & Queues">
      <div className="space-y-3">
        {jobs.map(job => (
          <div key={job.fn} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="text-xs font-bold text-slate-700">{job.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">{job.type === 'edge' ? `edge: ${job.fn}` : `rpc: ${job.fn}()`}</p>
            </div>
            <ActionBtn label="Run Now" icon={<Play size={13} />} onClick={() => runJob(job)} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Logs & Evidence
// ═══════════════════════════════════════════════════════════════════════════

function LogsSection({ profile, logs, adminId, runAction, actionOpts, onRefresh }: {
  profile: TargetProfile; logs: Record<string, unknown>[];
  adminId: string;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  actionOpts: { supportSessionId?: string | null; targetUserId?: string };
  onRefresh: () => void;
}) {
  const exportDiagnostic = async () => {
    // Try edge function first
    const result = await runAction(
      () => executeEdgeFn(adminId, 'support-diagnostic-report', {
        target_user_id: profile.id,
      }, 'ADMIN_DIAGNOSTIC_EXPORTED', actionOpts),
      'Export Diagnostic',
    );

    if (result.success && result.data) {
      downloadJson(result.data, `diagnostic_${profile.email}_${Date.now()}.json`);
    } else {
      // Fallback: client-side bundle
      const bundle = {
        profile,
        audit_logs: logs.slice(0, 50),
        exported_at: new Date().toISOString(),
        exported_by: adminId,
      };
      downloadJson(bundle, `diagnostic_${profile.email}_${Date.now()}.json`);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Actions" actions={
        <div className="flex gap-2">
          <ActionBtn label="Refresh" icon={<RefreshCw size={13} />} onClick={onRefresh} />
          <ActionBtn label="Export Diagnostic" icon={<Download size={13} />} onClick={exportDiagnostic} />
        </div>
      }>
        <p className="text-xs text-slate-400">Showing last {logs.length} audit entries</p>
      </SectionCard>

      <SectionCard title="Audit Log">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-2">Action</th><th className="pb-2">Resource</th><th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i} className="border-b border-slate-50 text-xs">
                  <td className="py-1.5 font-bold text-slate-700">{String(l.action)}</td>
                  <td className="py-1.5 text-slate-500">{String(l.resource_type ?? '')}:{String(l.resource_id ?? '').slice(0, 8)}</td>
                  <td className="py-1.5 text-slate-400 font-mono">{String(l.created_at ?? '').slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Security & Support Sessions
// ═══════════════════════════════════════════════════════════════════════════

function SecuritySection({ profile, adminId, isSuperAdmin, supportSession, onSessionChange, runAction }: {
  profile: TargetProfile; adminId: string; isSuperAdmin: boolean;
  supportSession: SupportSession | null;
  onSessionChange: (s: SupportSession | null) => void;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
}) {
  const [reason, setReason] = useState('');

  const startSession = async () => {
    if (!isSuperAdmin) { alert('Super-admin required'); return; }
    try {
      const { startSupportSession } = await import('../../../lib/support');
      const session = await startSupportSession(adminId, profile.id, reason || 'Support investigation', 'debug');
      onSessionChange(session);
      await runAction(
        () => Promise.resolve({ success: true, message: 'Session started', requestId: `session_${session.id}`, durationMs: 0 }),
        'Start Support Session',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start session');
    }
  };

  const endSession = async () => {
    if (!supportSession) return;
    try {
      const { endSupportSession } = await import('../../../lib/support');
      await endSupportSession(supportSession.id, adminId, profile.id);
      onSessionChange(null);
      await runAction(
        () => Promise.resolve({ success: true, message: 'Session ended', requestId: `session_end_${Date.now()}`, durationMs: 0 }),
        'End Support Session',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to end session');
    }
  };

  const expiresAt = supportSession ? new Date(supportSession.expires_at) : null;
  const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : 0;

  return (
    <div className="space-y-4">
      <SectionCard title="Support Session">
        {supportSession ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-emerald-700">Active Session</span>
              <span className="text-[10px] text-slate-400">· {minutesLeft} min remaining</span>
            </div>
            <StatRow label="Session ID" value={supportSession.id} />
            <StatRow label="Target" value={profile.email} />
            <StatRow label="Expires" value={String(supportSession.expires_at)} />
            <ActionBtn label="End Session" icon={<ShieldCheck size={13} />} onClick={endSession} variant="danger" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">No active support session. Start one to enable detailed audit logging.</p>
            {isSuperAdmin ? (
              <>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Reason for session..." className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none" />
                <ActionBtn label="Start Session (2hr)" icon={<Shield size={13} />} onClick={startSession} variant="success" />
              </>
            ) : (
              <p className="text-[10px] text-amber-600 font-bold">Super-admin role required to start sessions</p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Feature Flags
// ═══════════════════════════════════════════════════════════════════════════

function FlagsSection({ flags, adminId, runAction, onRefresh }: {
  flags: { key: string; enabled: boolean; description: string | null; rules: Record<string, unknown>; updated_at: string }[];
  adminId: string;
  runAction: (fn: () => Promise<ActionResult>, label: string) => Promise<ActionResult>;
  onRefresh: () => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const toggleFlag = async (key: string, currentEnabled: boolean) => {
    await runAction(
      () => executeRpc(adminId, 'admin_update_feature_flag', {
        p_key: key, p_enabled: !currentEnabled, p_admin_id: adminId,
      }, 'ADMIN_FEATURE_FLAG_UPDATED'),
      `Toggle ${key} → ${!currentEnabled}`,
    );
    onRefresh();
  };

  const addFlag = async () => {
    if (!newKey) return;
    await runAction(
      () => executeRpc(adminId, 'admin_update_feature_flag', {
        p_key: newKey, p_enabled: false, p_admin_id: adminId, p_rules: {},
      }, 'ADMIN_FEATURE_FLAG_UPDATED'),
      `Create flag: ${newKey}`,
    );
    onRefresh();
    setNewKey(''); setNewDesc('');
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Feature Flags">
        <div className="space-y-2">
          {flags.map(flag => (
            <div key={flag.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="min-w-0 flex-grow">
                <p className="text-xs font-bold text-slate-700 font-mono">{flag.key}</p>
                {flag.description && <p className="text-[10px] text-slate-400 truncate">{flag.description}</p>}
                <p className="text-[9px] text-slate-300 font-mono">Updated: {flag.updated_at?.slice(0, 19)}</p>
              </div>
              <button onClick={() => toggleFlag(flag.key, flag.enabled)} className="ml-3">
                {flag.enabled
                  ? <ToggleRight size={28} className="text-emerald-500" />
                  : <ToggleLeft size={28} className="text-slate-300" />
                }
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Add Flag">
        <div className="flex gap-3 items-end">
          <div className="space-y-1 flex-grow">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Key</label>
            <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
              placeholder="e.g. new_dashboard" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono outline-none" />
          </div>
          <ActionBtn label="Add" icon={<Plus size={13} />} onClick={addFlag} disabled={!newKey} />
        </div>
      </SectionCard>
    </div>
  );
}

export default AdminCommandCenterPage;
