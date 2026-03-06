import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Activity, Mail, Plug, Share2, Sparkles, DollarSign,
  Upload, RefreshCw, ScrollText, ShieldCheck, Play, AlertTriangle,
  CheckCircle2, XCircle, Clock, User as UserIcon, Download,
  ChevronRight, Loader2, BookOpen, RotateCcw, Zap, Eye,
  CreditCard, FileDown, Send, Database, Wifi, WifiOff,
  Bug, ChevronDown, ChevronUp, ServerCrash, Inbox, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  searchUsers,
  getTargetProfile,
  getTargetIntegrations,
  getTargetSubscription,
  getTargetEmailMessages,
  startSupportSession,
  endSupportSession,
  getActiveSession,
  downloadJson,
  type TargetProfile,
  type SupportSession,
} from '../../lib/support';
import { logSupportAction } from '../../lib/supportAudit';
import { getPlans, type DbPlan } from '../../lib/plans';

// ── Types ──────────────────────────────────────────────────────

type OpsTab =
  | 'triage' | 'workspace' | 'email' | 'integrations' | 'social'
  | 'ai' | 'billing' | 'imports' | 'jobs' | 'logs' | 'security';

interface ActionResult {
  action: string;
  status: 'success' | 'error';
  message: string;
  ts: string;
  payload?: Record<string, unknown>;
}

interface WorkspaceSnapshot {
  profile: TargetProfile;
  subscription: Record<string, unknown> | null;
  aiUsage: Record<string, unknown> | null;
  usageCounters: Record<string, unknown> | null;
}

interface QueryLogEntry {
  name: string;
  startedAt: number;
  durationMs: number;
  rowCount: number | null;
  error: string | null;
  params?: string;
}

// ── Tab config ─────────────────────────────────────────────────

const TAB_CONFIG: { id: OpsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'triage',       label: 'Triage',         icon: <Activity size={15} /> },
  { id: 'workspace',    label: 'Workspace',      icon: <UserIcon size={15} /> },
  { id: 'email',        label: 'Email',           icon: <Mail size={15} /> },
  { id: 'integrations', label: 'Integrations',   icon: <Plug size={15} /> },
  { id: 'social',       label: 'Social',          icon: <Share2 size={15} /> },
  { id: 'ai',           label: 'AI + Credits',    icon: <Sparkles size={15} /> },
  { id: 'billing',      label: 'Billing',         icon: <DollarSign size={15} /> },
  { id: 'imports',      label: 'Imports',          icon: <Upload size={15} /> },
  { id: 'jobs',         label: 'Jobs + Refresh',  icon: <RefreshCw size={15} /> },
  { id: 'logs',         label: 'Logs + Evidence', icon: <ScrollText size={15} /> },
  { id: 'security',     label: 'Security',        icon: <ShieldCheck size={15} /> },
];

// ── Shared UI Helpers ──────────────────────────────────────────

function StatusBadge({ status }: { status: 'ok' | 'warn' | 'fail' | 'unknown' }) {
  const cls = {
    ok:      'bg-emerald-500/10 text-emerald-600',
    warn:    'bg-amber-500/10 text-amber-600',
    fail:    'bg-red-500/10 text-red-600',
    unknown: 'bg-gray-200 text-gray-500',
  }[status];
  const icon = {
    ok:      <CheckCircle2 size={12} />,
    warn:    <AlertTriangle size={12} />,
    fail:    <XCircle size={12} />,
    unknown: <Clock size={12} />,
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {icon} {status}
    </span>
  );
}

function SectionCard({ title, children, status, actions }: {
  title: string;
  children: React.ReactNode;
  status?: 'ok' | 'warn' | 'fail' | 'unknown';
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">{title}</h4>
        <div className="flex items-center gap-2">
          {actions}
          {status && <StatusBadge status={status} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function ActionBtn({
  label, icon, onClick, loading, disabled, variant = 'default',
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  const base = variant === 'danger'
    ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
    : 'bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20';
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${base}`}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-[11px] text-gray-500 font-semibold">{label}</span>
      <span className="text-[11px] text-gray-900 font-bold font-mono">{value ?? '—'}</span>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-xs text-gray-400 italic py-2">No data</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-left">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} className="px-2 py-1.5 text-[9px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map(c => (
                <td key={c} className="px-2 py-1.5 text-[11px] text-gray-700 font-mono whitespace-nowrap max-w-[200px] truncate">
                  {String(row[c] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-3 bg-gray-100 rounded-xl text-gray-400 mb-3">{icon}</div>
      <p className="text-sm font-bold text-gray-700">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
    </div>
  );
}

function ErrorBanner({ errors, onDismiss }: { errors: string[]; onDismiss?: () => void }) {
  if (!errors.length) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3">
      <ServerCrash size={16} className="text-red-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-red-800 mb-1">Data Loading Errors ({errors.length})</p>
        <ul className="space-y-0.5">
          {errors.slice(0, 5).map((e, i) => (
            <li key={i} className="text-[11px] text-red-700 font-mono truncate">{e}</li>
          ))}
          {errors.length > 5 && <li className="text-[10px] text-red-500">+ {errors.length - 5} more</li>}
        </ul>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="p-1 text-red-400 hover:text-red-600">
          <XCircle size={14} />
        </button>
      )}
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="h-3 bg-gray-200 rounded w-32" />
          <div className="space-y-2">
            <div className="h-2.5 bg-gray-100 rounded w-full" />
            <div className="h-2.5 bg-gray-100 rounded w-3/4" />
            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

const AdminOpsCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<OpsTab>('triage');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TargetProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);
  const [adminId, setAdminId] = useState<string>('');
  const [actionResults, setActionResults] = useState<ActionResult[]>([]);

  // Tab-specific data
  const [triageData, setTriageData] = useState<Record<string, unknown> | null>(null);
  const [emailData, setEmailData] = useState<Record<string, unknown> | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, unknown>[]>([]);
  const [socialData, setSocialData] = useState<Record<string, unknown> | null>(null);
  const [billingData, setBillingData] = useState<Record<string, unknown> | null>(null);
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [supportAuditLogs, setSupportAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Global overview data
  const [globalData, setGlobalData] = useState<Record<string, unknown> | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<TargetProfile[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);

  // Query debug panel
  const [queryLog, setQueryLog] = useState<QueryLogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [dataErrors, setDataErrors] = useState<string[]>([]);

  const wsId = selectedWorkspace?.profile?.id;

  // ── opsQuery: timed wrapper for all Supabase calls ──────────

  const pushQueryLog = useCallback((entry: QueryLogEntry) => {
    setQueryLog(prev => [entry, ...prev.slice(0, 49)]);
    if (entry.error) {
      setDataErrors(prev => {
        const msg = `[${entry.name}] ${entry.error}`;
        if (prev.includes(msg)) return prev;
        return [msg, ...prev.slice(0, 19)];
      });
    }
  }, []);

  const opsQuery = useCallback(async <T,>(
    name: string,
    fn: () => Promise<{ data: T | null; error: { message: string } | null }>,
    paramsSummary?: string,
  ): Promise<{ data: T | null; error: string | null }> => {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      const rowCount = Array.isArray(result.data) ? result.data.length : (result.data != null ? 1 : 0);
      const errorMsg = result.error?.message ?? null;
      pushQueryLog({ name, startedAt: start, durationMs: duration, rowCount, error: errorMsg, params: paramsSummary });
      return { data: result.data, error: errorMsg };
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      const errorMsg = err instanceof Error ? err.message : String(err);
      pushQueryLog({ name, startedAt: start, durationMs: duration, rowCount: null, error: errorMsg, params: paramsSummary });
      return { data: null, error: errorMsg };
    }
  }, [pushQueryLog]);

  // Count-specific helper
  const opsCount = useCallback(async (
    name: string,
    fn: () => Promise<{ count: number | null; error: { message: string } | null }>,
    paramsSummary?: string,
  ): Promise<number> => {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      const errorMsg = result.error?.message ?? null;
      pushQueryLog({ name, startedAt: start, durationMs: duration, rowCount: result.count, error: errorMsg, params: paramsSummary });
      return result.count ?? 0;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      const errorMsg = err instanceof Error ? err.message : String(err);
      pushQueryLog({ name, startedAt: start, durationMs: duration, rowCount: null, error: errorMsg, params: paramsSummary });
      return 0;
    }
  }, [pushQueryLog]);

  // ── Get admin user id on mount + auto-select workspace ──────

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid || !mounted) return;
      setAdminId(uid);

      // Auto-select admin's own workspace so the page is never blank
      try {
        const profile = await getTargetProfile(uid);
        if (profile && mounted) {
          const [subscription, aiUsage, usageCounters] = await Promise.all([
            getTargetSubscription(uid),
            Promise.resolve(supabase
              .from('workspace_ai_usage')
              .select('*')
              .eq('workspace_id', uid)
              .eq('month_year', new Date().toISOString().slice(0, 7))
              .maybeSingle())
              .then(r => r.data)
              .catch(() => null),
            Promise.resolve(supabase
              .from('workspace_usage_counters')
              .select('*')
              .eq('workspace_id', uid)
              .eq('date_key', new Date().toISOString().slice(0, 10))
              .maybeSingle())
              .then(r => r.data)
              .catch(() => null),
          ]);
          if (mounted) {
            setSelectedWorkspace({
              profile,
              subscription: subscription as Record<string, unknown> | null,
              aiUsage: aiUsage as Record<string, unknown> | null,
              usageCounters: usageCounters as Record<string, unknown> | null,
            });
          }
        }
      } catch { /* silently fall back to global view */ }
    };
    init();
    return () => { mounted = false; };
  }, []);

  // ── Load global overview data ───────────────────────────────

  useEffect(() => {
    let mounted = true;
    const loadGlobal = async () => {
      setGlobalLoading(true);
      try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const [
          recentAdminActions,
          failedEmailsCount,
          errorIntegrationsCount,
          failedImportsCount,
          recentProfiles,
          totalUsers,
          activeSubscriptions,
        ] = await Promise.all([
          // Recent admin actions
          opsQuery('global:admin_actions', () =>
            Promise.resolve(supabase.from('audit_logs')
              .select('id, action, user_id, entity_type, details, created_at')
              .or('action.ilike.ADMIN_%,action.ilike.OPS_%')
              .order('created_at', { ascending: false })
              .limit(20))
          ),

          // Failed emails last 24h
          opsCount('global:failed_emails_24h', () =>
            Promise.resolve(supabase.from('scheduled_emails')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'failed')
              .gte('created_at', yesterday))
          ),

          // Error integrations
          opsCount('global:error_integrations', () =>
            Promise.resolve(supabase.from('integrations')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'error'))
          ),

          // Failed imports
          opsCount('global:failed_imports', () =>
            Promise.resolve(supabase.from('import_batches')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'failed')
              .gte('created_at', yesterday))
          ),

          // Recent workspaces for picker
          opsQuery('global:recent_profiles', () =>
            Promise.resolve(supabase.from('profiles')
              .select('id, email, name, role, status, plan, credits_total, credits_used, createdAt:created_at')
              .order('updated_at', { ascending: false })
              .limit(10))
          ),

          // Total user count
          opsCount('global:total_users', () =>
            Promise.resolve(supabase.from('profiles')
              .select('id', { count: 'exact', head: true }))
          ),

          // Active subscriptions
          opsCount('global:active_subscriptions', () =>
            Promise.resolve(supabase.from('subscriptions')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'active'))
          ),
        ]);

        if (mounted) {
          setGlobalData({
            recentAdminActions: recentAdminActions.data ?? [],
            failedEmailsCount,
            errorIntegrationsCount,
            failedImportsCount,
            totalUsers,
            activeSubscriptions,
          });
          setRecentWorkspaces((recentProfiles.data ?? []) as TargetProfile[]);
        }
      } catch { /* keep whatever partial data we got */ }
      if (mounted) setGlobalLoading(false);
    };
    loadGlobal();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for active support session when workspace changes
  useEffect(() => {
    if (!adminId || !wsId) { setSupportSession(null); return; }
    Promise.resolve(supabase
      .from('support_sessions')
      .select('*')
      .eq('admin_id', adminId)
      .eq('target_user_id', wsId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle())
      .then(({ data }) => setSupportSession(data as SupportSession | null))
      .catch(() => setSupportSession(null));
  }, [adminId, wsId]);

  // ── Logging helper ────────────────────────────────────────────

  const logAction = useCallback(async (
    action: string,
    details: Record<string, unknown> = {},
    resourceType?: string,
    resourceId?: string,
  ) => {
    if (!adminId) return;

    // Always write to audit_logs
    try {
      await supabase.from('audit_logs').insert({
        user_id: adminId,
        workspace_id: wsId ?? null,
        action: `OPS_${action}`,
        entity_type: resourceType ?? null,
        entity_id: resourceId ?? null,
        details: `Admin ops: ${action}`,
        payload: {
          ...details,
          admin_id: adminId,
          workspace_id: wsId ?? null,
          ts: new Date().toISOString(),
        },
      });
    } catch { /* audit should never block */ }

    // If support session is active, also write to support_audit_logs
    if (supportSession && wsId) {
      await logSupportAction({
        session_id: supportSession.id,
        admin_id: adminId,
        target_user_id: wsId,
        action: `OPS_${action}`,
        resource_type: resourceType,
        resource_id: resourceId,
        details,
      });
    }
  }, [adminId, wsId, supportSession]);

  // ── Edge function invoker ─────────────────────────────────────

  const invokeAdminFn = useCallback(async (
    fnName: string,
    payload: Record<string, unknown>,
    actionLabel: string,
  ): Promise<{ data?: unknown; error?: string }> => {
    setActionLoading(actionLabel);
    const startTs = new Date().toISOString();

    const redactedPayload = { ...payload };
    for (const key of ['token', 'secret', 'password', 'api_key', 'credentials']) {
      if (key in redactedPayload) redactedPayload[key] = '[REDACTED]';
    }

    try {
      const res = await supabase.functions.invoke(fnName, { body: payload });
      const result: ActionResult = {
        action: actionLabel,
        status: res.error ? 'error' : 'success',
        message: res.error ? String(res.error.message || res.error) : 'Completed',
        ts: startTs,
        payload: res.data as Record<string, unknown> | undefined,
      };
      setActionResults(prev => [result, ...prev.slice(0, 49)]);

      await logAction(actionLabel, {
        edge_function: fnName,
        payload_summary: redactedPayload,
        result_status: result.status,
        result_excerpt: result.message.slice(0, 200),
      });

      return res.error ? { error: result.message } : { data: res.data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const result: ActionResult = { action: actionLabel, status: 'error', message: msg, ts: startTs };
      setActionResults(prev => [result, ...prev.slice(0, 49)]);
      await logAction(actionLabel, { error: msg });
      return { error: msg };
    } finally {
      setActionLoading(null);
    }
  }, [logAction]);

  // ── RPC invoker ──────────────────────────────────────────────

  const invokeRpc = useCallback(async (
    rpcName: string,
    params: Record<string, unknown>,
    actionLabel: string,
  ): Promise<{ data?: unknown; error?: string }> => {
    setActionLoading(actionLabel);
    const startTs = new Date().toISOString();
    try {
      const { data, error } = await supabase.rpc(rpcName, params);
      const result: ActionResult = {
        action: actionLabel,
        status: error ? 'error' : 'success',
        message: error ? error.message : 'Completed',
        ts: startTs,
        payload: data != null ? (typeof data === 'object' ? data : { result: data }) : undefined,
      };
      setActionResults(prev => [result, ...prev.slice(0, 49)]);
      await logAction(actionLabel, {
        rpc: rpcName,
        params_summary: params,
        result_status: result.status,
      });
      return error ? { error: error.message } : { data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionResults(prev => [{ action: actionLabel, status: 'error', message: msg, ts: startTs }, ...prev.slice(0, 49)]);
      await logAction(actionLabel, { error: msg });
      return { error: msg };
    } finally {
      setActionLoading(null);
    }
  }, [logAction]);

  // ── Search ────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchQuery.trim());
      if (isUuid) {
        const profile = await getTargetProfile(searchQuery.trim());
        setSearchResults(profile ? [profile] : []);
      } else {
        const results = await searchUsers(searchQuery.trim());
        setSearchResults(results);
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // ── Select workspace ──────────────────────────────────────────

  const selectWorkspace = useCallback(async (profile: TargetProfile) => {
    setLoading(true);
    setSearchResults([]);
    setDataErrors([]);
    try {
      const [subscription, aiUsage, usageCounters] = await Promise.all([
        getTargetSubscription(profile.id),
        Promise.resolve(supabase
          .from('workspace_ai_usage')
          .select('*')
          .eq('workspace_id', profile.id)
          .eq('month_year', new Date().toISOString().slice(0, 7))
          .maybeSingle())
          .then(r => r.data)
          .catch(() => null),
        Promise.resolve(supabase
          .from('workspace_usage_counters')
          .select('*')
          .eq('workspace_id', profile.id)
          .eq('date_key', new Date().toISOString().slice(0, 10))
          .maybeSingle())
          .then(r => r.data)
          .catch(() => null),
      ]);
      setSelectedWorkspace({
        profile,
        subscription: subscription as Record<string, unknown> | null,
        aiUsage: aiUsage as Record<string, unknown> | null,
        usageCounters: usageCounters as Record<string, unknown> | null,
      });
      setActiveTab('triage');
      // Reset tab data so stale data from previous workspace doesn't show
      setTriageData(null);
      setEmailData(null);
      setIntegrations([]);
      setSocialData(null);
      setBillingData(null);
      setImportData(null);
      setAuditLogs([]);
      setSupportAuditLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch tab data on tab change ──────────────────────────────

  useEffect(() => {
    if (!wsId) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        switch (activeTab) {
          case 'triage': {
            const [
              pendingEmails,
              failedEmails,
              recentMessages,
              recentEvents,
              seqRuns,
              stuckItems,
            ] = await Promise.all([
              opsCount('triage:pending_emails', () =>
                Promise.resolve(supabase.from('scheduled_emails').select('id', { count: 'exact', head: true }).eq('owner_id', wsId).eq('status', 'pending'))
              ),
              opsCount('triage:failed_emails', () =>
                Promise.resolve(supabase.from('scheduled_emails').select('id', { count: 'exact', head: true }).eq('owner_id', wsId).eq('status', 'failed'))
              ),
              opsQuery('triage:recent_messages', () =>
                Promise.resolve(supabase.from('email_messages').select('id, subject, status, provider, created_at').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(10))
              ),
              opsQuery('triage:recent_events', async () => {
                const { data: msgIds } = await supabase.from('email_messages').select('id').eq('owner_id', wsId).limit(100);
                return Promise.resolve(supabase.from('email_events').select('id, event_type, is_bot, created_at, message_id')
                  .in('message_id', msgIds?.map(m => m.id) ?? ['__none__'])
                  .order('created_at', { ascending: false }).limit(20));
              }),
              opsQuery('triage:sequence_runs', () =>
                Promise.resolve(supabase.from('email_sequence_runs').select('id, status, items_total, items_done, items_failed, created_at').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(5))
              ),
              opsCount('triage:stuck_writing', () =>
                Promise.resolve(supabase.from('email_sequence_run_items').select('id', { count: 'exact', head: true }).eq('status', 'writing'))
              ),
            ]);

            const [intgs, socialPosts] = await Promise.all([
              opsQuery('triage:integrations', () =>
                Promise.resolve(supabase.from('integrations').select('id, provider, status, updated_at').eq('owner_id', wsId))
              ),
              opsQuery('triage:social_posts', () =>
                Promise.resolve(supabase.from('social_posts').select('id, status, scheduled_at, created_at').eq('user_id', wsId).order('created_at', { ascending: false }).limit(10))
              ),
            ]);

            if (mounted) {
              setTriageData({
                pendingEmails,
                failedEmails,
                recentMessages: recentMessages.data ?? [],
                recentEvents: recentEvents.data ?? [],
                seqRuns: seqRuns.data ?? [],
                stuckItems,
                integrations: intgs.data ?? [],
                socialPosts: socialPosts.data ?? [],
              });
            }
            break;
          }

          case 'email': {
            const [seqRuns, runItems, scheduled, messages, events] = await Promise.all([
              opsQuery('email:sequence_runs', () =>
                Promise.resolve(supabase.from('email_sequence_runs').select('*').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(10))
              ),
              opsQuery('email:run_items', () =>
                Promise.resolve(supabase.from('email_sequence_run_items').select('id, run_id, status, step_index, lead_email, attempt_count, error_message, created_at').order('created_at', { ascending: false }).limit(50))
              ),
              opsQuery('email:scheduled', () =>
                Promise.resolve(supabase.from('scheduled_emails').select('id, status, scheduled_at, sequence_id, error_message, created_at').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(50))
              ),
              opsQuery('email:messages', () =>
                Promise.resolve(supabase.from('email_messages').select('id, subject, to_email, status, provider, created_at').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(50))
              ),
              opsQuery('email:events', async () => {
                const { data: msgIds } = await supabase.from('email_messages').select('id').eq('owner_id', wsId).limit(200);
                return Promise.resolve(supabase.from('email_events').select('id, message_id, event_type, is_bot, created_at')
                  .in('message_id', msgIds?.map(m => m.id) ?? ['__none__'])
                  .order('created_at', { ascending: false }).limit(50));
              }),
            ]);
            if (mounted) {
              setEmailData({
                seqRuns: seqRuns.data ?? [],
                runItems: runItems.data ?? [],
                scheduled: scheduled.data ?? [],
                messages: messages.data ?? [],
                events: events.data ?? [],
              });
            }
            break;
          }

          case 'integrations': {
            const data = await getTargetIntegrations(wsId);
            if (mounted) setIntegrations(data as Record<string, unknown>[]);
            break;
          }

          case 'social': {
            const [posts, targets] = await Promise.all([
              opsQuery('social:posts', () =>
                Promise.resolve(supabase.from('social_posts').select('*').eq('user_id', wsId).order('created_at', { ascending: false }).limit(20))
              ),
              opsQuery('social:targets', () =>
                Promise.resolve(supabase.from('social_post_targets').select('*').eq('user_id', wsId).order('created_at', { ascending: false }).limit(30))
              ),
            ]);
            if (mounted) setSocialData({ posts: posts.data ?? [], targets: targets.data ?? [] });
            break;
          }

          case 'billing': {
            const [invoices, sub] = await Promise.all([
              opsQuery('billing:invoices', () =>
                Promise.resolve(supabase.from('invoices').select('*').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(20))
              ),
              getTargetSubscription(wsId),
            ]);
            if (mounted) setBillingData({ invoices: invoices.data ?? [], subscription: sub });
            break;
          }

          case 'imports': {
            const [batches, apolloSearch, apolloImport] = await Promise.all([
              opsQuery('imports:batches', () =>
                Promise.resolve(supabase.from('import_batches').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }).limit(20))
              ),
              opsQuery('imports:apollo_search', () =>
                Promise.resolve(supabase.from('apollo_search_logs').select('*').eq('user_id', wsId).order('created_at', { ascending: false }).limit(10))
              ),
              opsQuery('imports:apollo_import', () =>
                Promise.resolve(supabase.from('apollo_import_logs').select('*').eq('user_id', wsId).order('created_at', { ascending: false }).limit(10))
              ),
            ]);
            if (mounted) {
              setImportData({
                batches: batches.data ?? [],
                apolloSearch: apolloSearch.data ?? [],
                apolloImport: apolloImport.data ?? [],
              });
            }
            break;
          }

          case 'logs': {
            const [aLogs, saLogs] = await Promise.all([
              opsQuery('logs:audit', () =>
                Promise.resolve(supabase.from('audit_logs').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }).limit(100))
              ),
              opsQuery('logs:support_audit', () =>
                Promise.resolve(supabase.from('support_audit_logs').select('*').eq('target_user_id', wsId).order('created_at', { ascending: false }).limit(100))
              ),
            ]);
            if (mounted) {
              setAuditLogs((aLogs.data ?? []) as Record<string, unknown>[]);
              setSupportAuditLogs((saLogs.data ?? []) as Record<string, unknown>[]);
            }
            break;
          }

          default:
            break;
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, wsId]);

  // ── Support session controls ──────────────────────────────────

  const handleStartSession = useCallback(async () => {
    if (!adminId || !wsId) return;
    setActionLoading('start_session');
    try {
      const session = await startSupportSession(adminId, wsId, 'Ops Center investigation', 'debug');
      setSupportSession(session);
      await logAction('START_SUPPORT_SESSION', { session_id: session.id });
    } catch (err) {
      console.error('Failed to start support session:', err);
    } finally {
      setActionLoading(null);
    }
  }, [adminId, wsId, logAction]);

  const handleEndSession = useCallback(async () => {
    if (!supportSession || !adminId || !wsId) return;
    setActionLoading('end_session');
    try {
      await endSupportSession(supportSession.id, adminId, wsId);
      await logAction('END_SUPPORT_SESSION', { session_id: supportSession.id });
      setSupportSession(null);
    } catch (err) {
      console.error('Failed to end support session:', err);
    } finally {
      setActionLoading(null);
    }
  }, [supportSession, adminId, wsId, logAction]);

  // ── Diagnostic report ─────────────────────────────────────────

  const generateDiagnosticReport = useCallback(async () => {
    if (!wsId || !selectedWorkspace) return;
    setActionLoading('diagnostic_report');
    try {
      const [recentAudit, recentMessages, recentScheduled, intgs] = await Promise.all([
        opsQuery('diag:audit', () =>
          Promise.resolve(supabase.from('audit_logs').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }).limit(50))
        ),
        opsQuery('diag:messages', () =>
          Promise.resolve(supabase.from('email_messages').select('id, subject, to_email, status, provider, created_at').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(50))
        ),
        opsQuery('diag:scheduled', () =>
          Promise.resolve(supabase.from('scheduled_emails').select('id, status, scheduled_at, error_message, created_at').eq('owner_id', wsId).order('created_at', { ascending: false }).limit(50))
        ),
        getTargetIntegrations(wsId),
      ]);

      const report = {
        generated_at: new Date().toISOString(),
        workspace: {
          id: selectedWorkspace.profile.id,
          email: selectedWorkspace.profile.email,
          name: selectedWorkspace.profile.name,
          plan: selectedWorkspace.profile.plan,
          status: selectedWorkspace.profile.status,
          credits_total: selectedWorkspace.profile.credits_total,
          credits_used: selectedWorkspace.profile.credits_used,
        },
        subscription: selectedWorkspace.subscription,
        ai_usage: selectedWorkspace.aiUsage,
        usage_counters: selectedWorkspace.usageCounters,
        triage_summary: triageData,
        recent_audit_logs: recentAudit.data ?? [],
        recent_email_messages: recentMessages.data ?? [],
        recent_scheduled_emails: recentScheduled.data ?? [],
        integrations: intgs,
        action_history: actionResults,
        query_log: queryLog.slice(0, 50),
      };

      downloadJson(report, `scaliyo-diagnostic-${wsId.slice(0, 8)}-${Date.now()}.json`);
      await logAction('GENERATE_DIAGNOSTIC_REPORT');
    } finally {
      setActionLoading(null);
    }
  }, [wsId, selectedWorkspace, triageData, actionResults, queryLog, logAction, opsQuery]);

  // ── Playbook data ─────────────────────────────────────────────

  const playbooks = useMemo(() => {
    if (!triageData) return [];
    const items: { title: string; cause: string; evidence: string; actions: { label: string; fn: () => void }[] }[] = [];

    if ((triageData.stuckItems as number) > 0) {
      items.push({
        title: 'Emails stuck writing',
        cause: 'AI writer items locked for too long or worker crashed mid-processing.',
        evidence: `${triageData.stuckItems} items in "writing" status`,
        actions: [
          { label: 'Reset stuck items', fn: () => invokeRpc('reset_stuck_writing_items', {}, 'RESET_STUCK_WRITING_ITEMS') },
          { label: 'Kick writer queue', fn: () => invokeAdminFn('process-email-writing-queue', { run_id: null }, 'KICK_WRITING_QUEUE') },
        ],
      });
    }

    if ((triageData.pendingEmails as number) > 10) {
      items.push({
        title: 'Scheduled emails not sending',
        cause: 'process-scheduled-emails worker may have stalled or hit rate limits.',
        evidence: `${triageData.pendingEmails} pending scheduled emails`,
        actions: [
          { label: 'Kick scheduled processor', fn: () => invokeAdminFn('process-scheduled-emails', {}, 'KICK_SCHEDULED_EMAILS') },
        ],
      });
    }

    if ((triageData.failedEmails as number) > 0) {
      items.push({
        title: 'Failed emails detected',
        cause: 'Sender account misconfigured, rate limited, or provider error.',
        evidence: `${triageData.failedEmails} failed scheduled emails`,
        actions: [
          { label: 'View Email tab', fn: () => setActiveTab('email') },
        ],
      });
    }

    const intgs = triageData.integrations as Record<string, unknown>[];
    const errorIntgs = intgs.filter(i => i.status === 'error');
    if (errorIntgs.length > 0) {
      items.push({
        title: 'Integration errors',
        cause: 'One or more integrations have lost connectivity or credentials expired.',
        evidence: `${errorIntgs.length} integration(s) in error state: ${errorIntgs.map(i => i.provider).join(', ')}`,
        actions: [
          { label: 'View Integrations tab', fn: () => setActiveTab('integrations') },
        ],
      });
    }

    return items;
  }, [triageData, invokeRpc, invokeAdminFn]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ops Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Debug workspaces, run safe maintenance jobs, and investigate system issues.
        </p>
      </div>

      {/* Error banner */}
      <ErrorBanner errors={dataErrors} onDismiss={() => setDataErrors([])} />

      {/* Search bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search workspace by email or workspace_id"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </div>

      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
          {searchResults.map(p => (
            <button
              key={p.id}
              onClick={() => selectWorkspace(p)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-50 transition-all text-left"
            >
              <div>
                <p className="text-sm font-bold text-gray-900">{p.name || p.email}</p>
                <p className="text-xs text-gray-500">{p.email} · {p.plan} · {p.status}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-gray-400">{p.id.slice(0, 8)}…</span>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Workspace context pill + controls */}
      {selectedWorkspace && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xs font-bold">
                {selectedWorkspace.profile.name?.charAt(0) || selectedWorkspace.profile.email.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{selectedWorkspace.profile.name || selectedWorkspace.profile.email}</p>
                <p className="text-[10px] text-gray-400 font-mono truncate">
                  {selectedWorkspace.profile.id} · {selectedWorkspace.profile.plan} · {selectedWorkspace.profile.status}
                </p>
              </div>
            </div>
          </div>

          {/* Support session status */}
          <div className="flex items-center gap-2">
            {supportSession ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                <Wifi size={10} /> Active Session
                <span className="text-emerald-500/60">
                  ({Math.max(0, Math.round((new Date(supportSession.expires_at).getTime() - Date.now()) / 60000))}m left)
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold">
                <WifiOff size={10} /> No Session
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {supportSession ? (
              <button
                onClick={handleEndSession}
                disabled={actionLoading === 'end_session'}
                className="px-3 py-1.5 bg-red-500/10 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                End Session
              </button>
            ) : (
              <button
                onClick={handleStartSession}
                disabled={actionLoading === 'start_session'}
                className="px-3 py-1.5 bg-indigo-500/10 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-500/20 transition-all disabled:opacity-50"
              >
                Start Session
              </button>
            )}
            <button
              onClick={() => setActiveTab('logs')}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition-all"
            >
              Audit Logs
            </button>
            <button
              onClick={generateDiagnosticReport}
              disabled={actionLoading === 'diagnostic_report'}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center gap-1"
            >
              {actionLoading === 'diagnostic_report' ? <Loader2 size={10} className="animate-spin" /> : <FileDown size={10} />}
              Diagnostic Report
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {selectedWorkspace ? (
        // ── Workspace Mode ──
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            {/* Tab bar */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto mb-6">
              {TAB_CONFIG.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {loading ? (
              <SkeletonLoader />
            ) : (
              <div className="space-y-4">
                {activeTab === 'triage' && (
                  triageData
                    ? <TriageTab data={triageData} />
                    : <EmptyState icon={<Activity size={20} />} title="Loading triage data..." description="Select a workspace to see its health overview." />
                )}
                {activeTab === 'workspace' && (
                  <WorkspaceTab
                    snapshot={selectedWorkspace}
                    adminId={adminId}
                    onRefresh={() => selectWorkspace(selectedWorkspace.profile)}
                    logAction={logAction}
                  />
                )}
                {activeTab === 'email' && (
                  emailData
                    ? <EmailTab data={emailData} invokeAdminFn={invokeAdminFn} invokeRpc={invokeRpc} actionLoading={actionLoading} />
                    : <EmptyState icon={<Mail size={20} />} title="No email data loaded" description="Switch to this tab to load email pipeline data." />
                )}
                {activeTab === 'integrations' && (
                  <IntegrationsTab integrations={integrations} wsId={wsId!} invokeAdminFn={invokeAdminFn} actionLoading={actionLoading} />
                )}
                {activeTab === 'social' && (
                  socialData
                    ? <SocialTab data={socialData} invokeAdminFn={invokeAdminFn} actionLoading={actionLoading} />
                    : <EmptyState icon={<Share2 size={20} />} title="No social data loaded" description="Switch to this tab to load social media data." />
                )}
                {activeTab === 'ai' && (
                  <AiCreditsTab snapshot={selectedWorkspace} adminId={adminId} logAction={logAction} onRefresh={() => selectWorkspace(selectedWorkspace.profile)} />
                )}
                {activeTab === 'billing' && (
                  billingData
                    ? <BillingTab data={billingData} invokeAdminFn={invokeAdminFn} actionLoading={actionLoading} />
                    : <EmptyState icon={<DollarSign size={20} />} title="No billing data loaded" description="Switch to this tab to load billing data." />
                )}
                {activeTab === 'imports' && (
                  importData
                    ? <ImportsTab data={importData} />
                    : <EmptyState icon={<Upload size={20} />} title="No import data loaded" description="Switch to this tab to load import batch data." />
                )}
                {activeTab === 'jobs' && (
                  <JobsTab invokeAdminFn={invokeAdminFn} invokeRpc={invokeRpc} actionLoading={actionLoading} actionResults={actionResults} wsId={wsId!} integrations={integrations} />
                )}
                {activeTab === 'logs' && (
                  <LogsTab auditLogs={auditLogs} supportAuditLogs={supportAuditLogs} generateDiagnosticReport={generateDiagnosticReport} actionLoading={actionLoading} />
                )}
                {activeTab === 'security' && (
                  <SecurityTab supportSession={supportSession} onStartSession={handleStartSession} onEndSession={handleEndSession} actionLoading={actionLoading} />
                )}
              </div>
            )}
          </div>

          {/* Right: Playbook drawer */}
          {playbooks.length > 0 && (
            <div className="hidden xl:block w-72 shrink-0">
              <div className="sticky top-6">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-amber-600" />
                    <h3 className="text-xs font-black text-amber-800 uppercase tracking-wider">Playbooks</h3>
                    <span className="ml-auto text-[9px] font-bold text-amber-600 bg-amber-200 px-1.5 py-0.5 rounded-full">{playbooks.length}</span>
                  </div>
                  {playbooks.map((pb, i) => (
                    <div key={i} className="bg-white rounded-lg border border-amber-200 p-3 space-y-2">
                      <h4 className="text-[11px] font-bold text-gray-900">{pb.title}</h4>
                      <p className="text-[10px] text-gray-500">{pb.cause}</p>
                      <p className="text-[10px] text-amber-700 font-semibold">{pb.evidence}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {pb.actions.map((a, j) => (
                          <button
                            key={j}
                            onClick={a.fn}
                            className="px-2 py-1 bg-amber-500/10 text-amber-700 rounded text-[10px] font-bold hover:bg-amber-500/20 transition-all"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // ── Global Overview (no workspace selected) ──
        <GlobalOverview
          data={globalData}
          loading={globalLoading}
          recentWorkspaces={recentWorkspaces}
          onSelectWorkspace={selectWorkspace}
        />
      )}

      {/* Action results toast bar */}
      {actionResults.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm">
          {actionResults.slice(0, 3).map((r, i) => (
            <div
              key={`${r.ts}-${i}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-bold ${
                r.status === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              {r.status === 'success' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              <span className="truncate">{r.action}: {r.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Query Debug Panel ── */}
      <QueryDebugPanel queryLog={queryLog} open={debugOpen} onToggle={() => setDebugOpen(p => !p)} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// GLOBAL OVERVIEW (shown when no workspace is selected)
// ═══════════════════════════════════════════════════════════════

function GlobalOverview({
  data, loading, recentWorkspaces, onSelectWorkspace,
}: {
  data: Record<string, unknown> | null;
  loading: boolean;
  recentWorkspaces: TargetProfile[];
  onSelectWorkspace: (p: TargetProfile) => void;
}) {
  if (loading) return <SkeletonLoader />;

  const failedEmails = (data?.failedEmailsCount as number) ?? 0;
  const errorIntegrations = (data?.errorIntegrationsCount as number) ?? 0;
  const failedImports = (data?.failedImportsCount as number) ?? 0;
  const totalUsers = (data?.totalUsers as number) ?? 0;
  const activeSubscriptions = (data?.activeSubscriptions as number) ?? 0;
  const recentActions = (data?.recentAdminActions as Record<string, unknown>[]) ?? [];

  const hasIssues = failedEmails > 0 || errorIntegrations > 0 || failedImports > 0;

  return (
    <div className="space-y-6">
      {/* System Health Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-indigo-500" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total Users</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{totalUsers.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mt-1">{activeSubscriptions} active subscriptions</p>
        </div>

        <div className={`bg-white rounded-xl border p-4 ${failedEmails > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Mail size={14} className={failedEmails > 0 ? 'text-red-500' : 'text-emerald-500'} />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Email Failures (24h)</span>
          </div>
          <p className={`text-2xl font-black ${failedEmails > 0 ? 'text-red-600' : 'text-gray-900'}`}>{failedEmails}</p>
          <p className="text-[10px] text-gray-400 mt-1">{failedEmails === 0 ? 'All clear' : 'Failed scheduled emails'}</p>
        </div>

        <div className={`bg-white rounded-xl border p-4 ${errorIntegrations > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Plug size={14} className={errorIntegrations > 0 ? 'text-red-500' : 'text-emerald-500'} />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Integration Errors</span>
          </div>
          <p className={`text-2xl font-black ${errorIntegrations > 0 ? 'text-red-600' : 'text-gray-900'}`}>{errorIntegrations}</p>
          <p className="text-[10px] text-gray-400 mt-1">{errorIntegrations === 0 ? 'All connected' : 'Integrations in error state'}</p>
        </div>

        <div className={`bg-white rounded-xl border p-4 ${failedImports > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Upload size={14} className={failedImports > 0 ? 'text-amber-500' : 'text-emerald-500'} />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Failed Imports (24h)</span>
          </div>
          <p className={`text-2xl font-black ${failedImports > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{failedImports}</p>
          <p className="text-[10px] text-gray-400 mt-1">{failedImports === 0 ? 'All clear' : 'Failed import batches'}</p>
        </div>
      </div>

      {/* Issues callout */}
      {hasIssues && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-800">System Issues Detected</p>
            <p className="text-[11px] text-amber-700 mt-1">
              Select a workspace above to investigate and resolve issues.
              {failedEmails > 0 && ` ${failedEmails} failed email(s).`}
              {errorIntegrations > 0 && ` ${errorIntegrations} integration error(s).`}
              {failedImports > 0 && ` ${failedImports} failed import(s).`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Admin Actions */}
        <SectionCard title="Recent Admin Actions">
          {recentActions.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">No recent admin actions</p>
          ) : (
            <div className="space-y-0">
              {recentActions.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-gray-900 truncate">{String(a.action)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{String(a.details ?? '—')}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-2">{String(a.created_at ?? '').slice(11, 19)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Recent Workspaces */}
        <SectionCard title="Recent Workspaces" actions={
          <span className="text-[9px] font-bold text-gray-400 uppercase">Click to select</span>
        }>
          {recentWorkspaces.length === 0 ? (
            <EmptyState icon={<Inbox size={20} />} title="No workspaces found" description="Search for a workspace using the search bar above." />
          ) : (
            <div className="space-y-0">
              {recentWorkspaces.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSelectWorkspace(p)}
                  className="w-full flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-1 px-1 rounded transition-all text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 text-[10px] font-bold shrink-0">
                      {p.name?.charAt(0) || p.email.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-gray-900 truncate">{p.name || p.email}</p>
                      <p className="text-[10px] text-gray-400 truncate">{p.email} · {p.plan}</p>
                    </div>
                  </div>
                  <ChevronRight size={12} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUERY DEBUG PANEL
// ═══════════════════════════════════════════════════════════════

function QueryDebugPanel({ queryLog, open, onToggle }: {
  queryLog: QueryLogEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  const errorCount = queryLog.filter(q => q.error).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-all"
      >
        <div className="flex items-center gap-2">
          <Bug size={14} className="text-gray-400" />
          <span className="text-xs font-bold text-gray-700">Query Debug Panel</span>
          <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{queryLog.length}</span>
          {errorCount > 0 && (
            <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{errorCount} errors</span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 max-h-80 overflow-y-auto">
          {queryLog.length === 0 ? (
            <p className="text-xs text-gray-400 italic p-4">No queries executed yet</p>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-[9px] font-black text-gray-400 uppercase tracking-wider">Query</th>
                  <th className="px-3 py-1.5 text-[9px] font-black text-gray-400 uppercase tracking-wider text-right">Duration</th>
                  <th className="px-3 py-1.5 text-[9px] font-black text-gray-400 uppercase tracking-wider text-right">Rows</th>
                  <th className="px-3 py-1.5 text-[9px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {queryLog.map((q, i) => (
                  <tr key={i} className={q.error ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-1.5">
                      <p className="text-[11px] font-mono text-gray-700">{q.name}</p>
                      {q.error && <p className="text-[10px] text-red-600 truncate max-w-xs">{q.error}</p>}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-gray-500 text-right">{q.durationMs}ms</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-gray-500 text-right">{q.rowCount ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      {q.error ? (
                        <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">ERROR</span>
                      ) : (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ── Triage Tab ──────────────────────────────────────────────────

function TriageTab({ data }: { data: Record<string, unknown> }) {
  const emailStatus = (data.failedEmails as number) > 5 ? 'fail' : (data.pendingEmails as number) > 20 ? 'warn' : 'ok';
  const aiStatus: 'ok' | 'warn' | 'fail' | 'unknown' = 'ok';
  const intgs = data.integrations as Record<string, unknown>[];
  const intgStatus = intgs.some(i => i.status === 'error') ? 'fail' as const : intgs.some(i => i.status === 'disconnected') ? 'warn' as const : intgs.length > 0 ? 'ok' as const : 'unknown' as const;
  const socialPosts = data.socialPosts as Record<string, unknown>[];
  const failedPosts = socialPosts.filter(p => p.status === 'failed');
  const socialStatus = failedPosts.length > 0 ? 'warn' as const : socialPosts.length > 0 ? 'ok' as const : 'unknown' as const;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SectionCard title="Email Pipeline" status={emailStatus}>
        <StatRow label="Pending scheduled" value={data.pendingEmails as number} />
        <StatRow label="Failed scheduled" value={data.failedEmails as number} />
        <StatRow label="Stuck writing items" value={data.stuckItems as number} />
        <StatRow label="Recent messages" value={(data.recentMessages as unknown[]).length} />
        <StatRow label="Recent events" value={(data.recentEvents as unknown[]).length} />
      </SectionCard>

      <SectionCard title="Sequence Runs" status={(data.seqRuns as unknown[]).length > 0 ? 'ok' : 'unknown'}>
        {(data.seqRuns as Record<string, unknown>[]).length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No sequence runs</p>
        ) : (
          (data.seqRuns as Record<string, unknown>[]).slice(0, 5).map((run, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
              <span className="text-[10px] font-mono text-gray-500">{String(run.id).slice(0, 8)}</span>
              <span className={`text-[10px] font-bold ${run.status === 'completed' ? 'text-emerald-600' : run.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                {String(run.status)} ({String(run.items_done)}/{String(run.items_total)})
              </span>
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard title="Integrations" status={intgStatus}>
        {intgs.length === 0 && <p className="text-xs text-gray-400 italic">No integrations</p>}
        {intgs.map((ig, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
            <span className="text-[11px] font-semibold text-gray-700">{String(ig.provider)}</span>
            <StatusBadge status={ig.status === 'connected' ? 'ok' : ig.status === 'error' ? 'fail' : 'warn'} />
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Social Media" status={socialStatus}>
        <StatRow label="Recent posts" value={socialPosts.length} />
        <StatRow label="Failed posts" value={failedPosts.length} />
        {failedPosts.slice(0, 3).map((p, i) => (
          <p key={i} className="text-[10px] text-red-500 truncate">{String(p.id).slice(0, 8)}: {String(p.status)}</p>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Workspace Tab ───────────────────────────────────────────────

function WorkspaceTab({
  snapshot, adminId, onRefresh, logAction,
}: {
  snapshot: WorkspaceSnapshot;
  adminId: string;
  onRefresh: () => void;
  logAction: (action: string, details?: Record<string, unknown>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<DbPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [planChangeReason, setPlanChangeReason] = useState('');
  const [planChanging, setPlanChanging] = useState(false);
  const [planChangeResult, setPlanChangeResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const p = snapshot.profile;

  useEffect(() => {
    getPlans().then(setAvailablePlans).catch(e => console.warn('[AdminOps] plan load failed:', e));
  }, []);

  const currentPlan = String(
    snapshot.subscription
      ? (snapshot.subscription as Record<string, unknown>).plan_name ?? (snapshot.subscription as Record<string, unknown>).plan
      : p.plan || 'Starter'
  );

  const toggleStatus = async () => {
    setSaving(true);
    const newStatus = p.status === 'active' ? 'disabled' : 'active';
    try {
      await supabase.from('profiles').update({ status: newStatus }).eq('id', p.id);
      await logAction('TOGGLE_WORKSPACE_STATUS', { old_status: p.status, new_status: newStatus });
      onRefresh();
    } finally { setSaving(false); }
  };

  const resetUiPreferences = async () => {
    setSaving(true);
    try {
      await supabase.from('profiles').update({ ui_preferences: {} }).eq('id', p.id);
      await logAction('RESET_UI_PREFERENCES');
      onRefresh();
    } finally { setSaving(false); }
  };

  const changePlan = async () => {
    if (!selectedPlan || selectedPlan === currentPlan) return;
    setPlanChanging(true);
    setPlanChangeResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_change_user_plan', {
        p_target_user_id: p.id,
        p_new_plan_name: selectedPlan,
        p_admin_id: adminId,
        p_reason: planChangeReason || 'Admin override via Ops Center',
      });
      if (error) throw new Error(error.message);
      const result = data as { success: boolean; message: string };
      if (!result.success) throw new Error(result.message);

      await logAction('CHANGE_USER_PLAN', {
        old_plan: currentPlan,
        new_plan: selectedPlan,
        reason: planChangeReason || 'Admin override',
      });

      setPlanChangeResult({ ok: true, msg: result.message });
      setSelectedPlan('');
      setPlanChangeReason('');
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setPlanChangeResult({ ok: false, msg });
    } finally {
      setPlanChanging(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Profile Detail">
        <StatRow label="ID" value={p.id} />
        <StatRow label="Email" value={p.email} />
        <StatRow label="Name" value={p.name} />
        <StatRow label="Role" value={p.role} />
        <StatRow label="Status" value={p.status} />
        <StatRow label="Plan" value={p.plan} />
        <StatRow label="Credits" value={`${p.credits_used} / ${p.credits_total}`} />
        <StatRow label="Created" value={p.createdAt} />
      </SectionCard>

      <SectionCard title="Subscription">
        {snapshot.subscription ? (
          <>
            <StatRow label="Plan" value={String((snapshot.subscription as Record<string, unknown>).plan_name ?? (snapshot.subscription as Record<string, unknown>).plan)} />
            <StatRow label="Status" value={String((snapshot.subscription as Record<string, unknown>).status)} />
            <StatRow label="Expires" value={String((snapshot.subscription as Record<string, unknown>).expires_at ?? (snapshot.subscription as Record<string, unknown>).current_period_end)} />
          </>
        ) : <p className="text-xs text-gray-400 italic">No subscription data</p>}
      </SectionCard>

      <SectionCard title="Plan & Billing Controls">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-24 shrink-0">Current Plan</span>
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg">{currentPlan}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-24 shrink-0 pt-2">Change To</span>
            <div className="flex-grow space-y-2">
              <select
                value={selectedPlan}
                onChange={e => setSelectedPlan(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Select plan...</option>
                {availablePlans.filter(plan => plan.name !== currentPlan).map(plan => (
                  <option key={plan.id} value={plan.name}>{plan.name} ({plan.price})</option>
                ))}
              </select>
              <input
                type="text"
                value={planChangeReason}
                onChange={e => setPlanChangeReason(e.target.value)}
                placeholder="Reason for change (optional)..."
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <ActionBtn
                label={planChanging ? 'Changing...' : 'Apply Plan Change'}
                icon={planChanging ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
                onClick={changePlan}
                loading={planChanging}
              />
            </div>
          </div>
          {planChangeResult && (
            <div className={`p-2 rounded-lg text-xs font-bold ${
              planChangeResult.ok
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {planChangeResult.ok ? 'Done: ' : 'Error: '}{planChangeResult.msg}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Credit Controls">
        <CreditControls
          workspaceId={p.id}
          adminId={adminId}
          creditsTotal={p.credits_total}
          creditsUsed={p.credits_used}
          logAction={logAction}
          onRefresh={onRefresh}
        />
      </SectionCard>

      <SectionCard title="Usage (Today)">
        {snapshot.usageCounters ? (
          <>
            <StatRow label="Emails sent" value={String((snapshot.usageCounters as Record<string, unknown>).emails_sent)} />
            <StatRow label="LinkedIn actions" value={String((snapshot.usageCounters as Record<string, unknown>).linkedin_actions)} />
            <StatRow label="AI credits" value={String((snapshot.usageCounters as Record<string, unknown>).ai_credits_used)} />
          </>
        ) : <p className="text-xs text-gray-400 italic">No usage data for today</p>}
      </SectionCard>

      <SectionCard title="Admin Controls">
        <div className="flex flex-wrap gap-2">
          <ActionBtn
            label={p.status === 'active' ? 'Disable Workspace' : 'Enable Workspace'}
            icon={p.status === 'active' ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
            onClick={toggleStatus}
            loading={saving}
            variant={p.status === 'active' ? 'danger' : 'default'}
          />
          <ActionBtn
            label="Reset UI Preferences"
            icon={<RotateCcw size={13} />}
            onClick={resetUiPreferences}
            loading={saving}
          />
        </div>
      </SectionCard>
    </div>
  );
}

// ── Credit Controls ─────────────────────────────────────────────

function CreditControls({ workspaceId, adminId, creditsTotal, creditsUsed, logAction, onRefresh }: {
  workspaceId: string; adminId: string; creditsTotal: number; creditsUsed: number;
  logAction: (action: string, details?: Record<string, unknown>) => Promise<void>;
  onRefresh: () => void;
}) {
  const [grantAmt, setGrantAmt] = useState(100);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [saving, setSaving] = useState(false);

  const grant = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_grant_credits', {
        p_workspace_id: workspaceId, p_amount: grantAmt, p_admin_id: adminId, p_reason: 'Admin grant via Ops Center',
      });
      if (error) throw new Error(error.message);
      await logAction('GRANT_CREDITS', { amount: grantAmt });
      onRefresh();
    } catch (err) {
      alert(`Grant failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setSaving(false); }
  };

  const adjust = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_adjust_credits_used', {
        p_workspace_id: workspaceId, p_delta: adjustDelta, p_admin_id: adminId, p_reason: 'Admin adjust via Ops Center',
      });
      if (error) throw new Error(error.message);
      await logAction('ADJUST_CREDITS_USED', { delta: adjustDelta });
      onRefresh();
    } catch (err) {
      alert(`Adjust failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-24 shrink-0">Balance</span>
        <span className="text-xs font-bold text-gray-700">{creditsUsed} / {creditsTotal}</span>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase">Grant</label>
          <div className="flex gap-1">
            <input type="number" value={grantAmt} onChange={e => setGrantAmt(parseInt(e.target.value) || 0)}
              className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none w-20" />
            <ActionBtn label="Grant" icon={<Zap size={13} />} onClick={grant} loading={saving} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase">Adjust Used</label>
          <div className="flex gap-1">
            <input type="number" value={adjustDelta} onChange={e => setAdjustDelta(parseInt(e.target.value) || 0)}
              className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none w-20" />
            <ActionBtn label="Adjust" icon={<RotateCcw size={13} />} onClick={adjust} loading={saving} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Email Tab ───────────────────────────────────────────────────

function EmailTab({
  data, invokeAdminFn, invokeRpc, actionLoading,
}: {
  data: Record<string, unknown>;
  invokeAdminFn: (fn: string, payload: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  invokeRpc: (rpc: string, params: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  actionLoading: string | null;
}) {
  const seqRuns = data.seqRuns as Record<string, unknown>[];
  const runItems = data.runItems as Record<string, unknown>[];
  const scheduled = data.scheduled as Record<string, unknown>[];
  const messages = data.messages as Record<string, unknown>[];
  const events = data.events as Record<string, unknown>[];

  return (
    <div className="space-y-4">
      <SectionCard title="Pipeline Actions">
        <div className="flex flex-wrap gap-2">
          <ActionBtn
            label="Reset Stuck Writing Items"
            icon={<RotateCcw size={13} />}
            onClick={() => invokeRpc('reset_stuck_writing_items', {}, 'RESET_STUCK_WRITING_ITEMS')}
            loading={actionLoading === 'RESET_STUCK_WRITING_ITEMS'}
          />
          <ActionBtn
            label="Kick Writing Queue"
            icon={<Play size={13} />}
            onClick={() => invokeAdminFn('process-email-writing-queue', { run_id: null }, 'KICK_WRITING_QUEUE')}
            loading={actionLoading === 'KICK_WRITING_QUEUE'}
          />
          <ActionBtn
            label="Kick Scheduled Processor"
            icon={<Send size={13} />}
            onClick={() => invokeAdminFn('process-scheduled-emails', {}, 'KICK_SCHEDULED_EMAILS')}
            loading={actionLoading === 'KICK_SCHEDULED_EMAILS'}
          />
          <ActionBtn
            label="Refresh Email Analytics"
            icon={<Database size={13} />}
            onClick={() => invokeRpc('refresh_email_analytics', {}, 'REFRESH_EMAIL_ANALYTICS')}
            loading={actionLoading === 'REFRESH_EMAIL_ANALYTICS'}
          />
        </div>
      </SectionCard>

      <SectionCard title={`Sequence Runs (${seqRuns.length})`}>
        <DataTable columns={['id', 'status', 'items_total', 'items_done', 'items_failed', 'created_at']} rows={seqRuns} />
      </SectionCard>

      <SectionCard title={`Run Items (${runItems.length})`}>
        <DataTable columns={['id', 'status', 'lead_email', 'step_index', 'attempt_count', 'error_message']} rows={runItems} />
      </SectionCard>

      <SectionCard title={`Scheduled Emails (${scheduled.length})`}>
        <DataTable columns={['id', 'status', 'scheduled_at', 'error_message', 'created_at']} rows={scheduled} />
      </SectionCard>

      <SectionCard title={`Sent Messages (${messages.length})`}>
        <DataTable columns={['id', 'subject', 'to_email', 'status', 'provider', 'created_at']} rows={messages} />
      </SectionCard>

      <SectionCard title={`Events (${events.length})`}>
        <DataTable columns={['id', 'event_type', 'is_bot', 'created_at']} rows={events} />
      </SectionCard>
    </div>
  );
}

// ── Integrations Tab ────────────────────────────────────────────

function IntegrationsTab({
  integrations, wsId, invokeAdminFn, actionLoading,
}: {
  integrations: Record<string, unknown>[];
  wsId: string;
  invokeAdminFn: (fn: string, payload: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  actionLoading: string | null;
}) {
  return (
    <div className="space-y-4">
      <SectionCard title={`Connected Integrations (${integrations.length})`}>
        {integrations.length === 0 && (
          <EmptyState icon={<Plug size={20} />} title="No integrations connected" description="This workspace has no integrations configured." />
        )}
        {integrations.map((ig, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div>
              <p className="text-[11px] font-bold text-gray-900">{String(ig.provider)}</p>
              <p className="text-[10px] text-gray-500">Category: {String(ig.category ?? '—')} · Updated: {String(ig.updated_at ?? '—').slice(0, 10)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={ig.status === 'connected' ? 'ok' : ig.status === 'error' ? 'fail' : 'warn'} />
              <ActionBtn
                label="Validate"
                icon={<Zap size={11} />}
                onClick={() => invokeAdminFn('validate-integration', {
                  provider: ig.provider,
                  credentials: (ig.credentials as Record<string, unknown>) ?? {},
                }, `VALIDATE_INTEGRATION_${String(ig.provider).toUpperCase()}`)}
                loading={actionLoading === `VALIDATE_INTEGRATION_${String(ig.provider).toUpperCase()}`}
              />
            </div>
          </div>
        ))}
      </SectionCard>

      <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500">
          <Eye size={12} className="inline mr-1" />
          To reauthorize an integration, direct the user to{' '}
          <span className="font-mono text-indigo-600">app.scaliyo.com/portal/integrations</span>
        </p>
      </div>
    </div>
  );
}

// ── Social Tab ──────────────────────────────────────────────────

function SocialTab({
  data, invokeAdminFn, actionLoading,
}: {
  data: Record<string, unknown>;
  invokeAdminFn: (fn: string, payload: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  actionLoading: string | null;
}) {
  const posts = data.posts as Record<string, unknown>[];
  const targets = data.targets as Record<string, unknown>[];
  const duePosts = posts.filter(p => p.status === 'scheduled');
  const failedPosts = posts.filter(p => p.status === 'failed');

  return (
    <div className="space-y-4">
      <SectionCard title="Overview">
        <StatRow label="Total posts" value={posts.length} />
        <StatRow label="Due/scheduled" value={duePosts.length} />
        <StatRow label="Failed" value={failedPosts.length} />
      </SectionCard>

      <SectionCard title="Actions">
        <div className="flex flex-wrap gap-2">
          <ActionBtn
            label="Run Social Scheduler"
            icon={<Play size={13} />}
            onClick={() => invokeAdminFn('social-run-scheduler', {}, 'RUN_SOCIAL_SCHEDULER')}
            loading={actionLoading === 'RUN_SOCIAL_SCHEDULER'}
          />
        </div>
        <p className="text-[10px] text-amber-600 mt-2">
          <AlertTriangle size={10} className="inline mr-1" />
          Instagram publishing may block up to 20s per post (container polling).
        </p>
      </SectionCard>

      {failedPosts.length > 0 && (
        <SectionCard title={`Failed Posts (${failedPosts.length})`}>
          <DataTable columns={['id', 'status', 'scheduled_at', 'created_at']} rows={failedPosts} />
        </SectionCard>
      )}

      <SectionCard title={`Post Targets (${targets.length})`}>
        <DataTable columns={['id', 'channel', 'target_label', 'status', 'error_message', 'published_at']} rows={targets} />
      </SectionCard>
    </div>
  );
}

// ── AI + Credits Tab ────────────────────────────────────────────

function AiCreditsTab({
  snapshot, adminId, logAction, onRefresh,
}: {
  snapshot: WorkspaceSnapshot;
  adminId: string;
  logAction: (action: string, details?: Record<string, unknown>) => Promise<void>;
  onRefresh: () => void;
}) {
  const [grantAmount, setGrantAmount] = useState(100);
  const [saving, setSaving] = useState(false);
  const [aiLogs, setAiLogs] = useState<Record<string, unknown>[]>([]);
  const p = snapshot.profile;

  useEffect(() => {
    supabase
      .from('ai_usage_logs')
      .select('*')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setAiLogs((data ?? []) as Record<string, unknown>[]));
  }, [p.id]);

  const grantCredits = async () => {
    setSaving(true);
    try {
      const newTotal = p.credits_total + grantAmount;
      await supabase.from('profiles').update({ credits_total: newTotal }).eq('id', p.id);
      await logAction('GRANT_CREDITS', { amount: grantAmount, old_total: p.credits_total, new_total: newTotal });
      onRefresh();
    } finally { setSaving(false); }
  };

  const exportAiErrors = () => {
    downloadJson(aiLogs, `ai-usage-${p.id.slice(0, 8)}-${Date.now()}.json`);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Credits">
        <StatRow label="Credits total" value={p.credits_total} />
        <StatRow label="Credits used" value={p.credits_used} />
        <StatRow label="Credits remaining" value={p.credits_total - p.credits_used} />
      </SectionCard>

      <SectionCard title="AI Usage (This Month)">
        {snapshot.aiUsage ? (
          <>
            <StatRow label="Credits used" value={String((snapshot.aiUsage as Record<string, unknown>).credits_used)} />
            <StatRow label="Tokens used" value={String((snapshot.aiUsage as Record<string, unknown>).tokens_used)} />
            <StatRow label="Credits limit" value={String((snapshot.aiUsage as Record<string, unknown>).credits_limit)} />
          </>
        ) : <p className="text-xs text-gray-400 italic">No AI usage data this month</p>}
      </SectionCard>

      <SectionCard title="Grant Credits (Super-Admin)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={grantAmount}
            onChange={e => setGrantAmount(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center"
            min={0}
          />
          <ActionBtn label="Grant Credits" icon={<CreditCard size={13} />} onClick={grantCredits} loading={saving} />
        </div>
      </SectionCard>

      <SectionCard title={`Recent AI Usage Logs (${aiLogs.length})`}>
        <div className="flex justify-end mb-2">
          <ActionBtn label="Export JSON" icon={<Download size={13} />} onClick={exportAiErrors} />
        </div>
        <DataTable columns={['action_type', 'model_name', 'tokens_used', 'prompt_name', 'created_at']} rows={aiLogs} />
      </SectionCard>
    </div>
  );
}

// ── Billing Tab ─────────────────────────────────────────────────

function BillingTab({
  data, invokeAdminFn, actionLoading,
}: {
  data: Record<string, unknown>;
  invokeAdminFn: (fn: string, payload: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  actionLoading: string | null;
}) {
  const invoices = data.invoices as Record<string, unknown>[];
  const subscription = data.subscription as Record<string, unknown> | null;

  return (
    <div className="space-y-4">
      <SectionCard title="Subscription">
        {subscription ? (
          <>
            <StatRow label="Plan" value={String(subscription.plan_name ?? subscription.plan)} />
            <StatRow label="Status" value={String(subscription.status)} />
            <StatRow label="Period end" value={String(subscription.expires_at ?? subscription.current_period_end ?? '—')} />
          </>
        ) : <p className="text-xs text-gray-400 italic">No subscription</p>}
      </SectionCard>

      <SectionCard title={`Invoices (${invoices.length})`}>
        {invoices.length === 0 ? (
          <EmptyState icon={<DollarSign size={20} />} title="No invoices" description="This workspace has no invoices yet." />
        ) : (
          invoices.map((inv, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-[11px] font-bold text-gray-900">{String(inv.invoice_number ?? inv.id)}</p>
                <p className="text-[10px] text-gray-500">{String(inv.status)} · {String(inv.created_at ?? '').slice(0, 10)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-gray-700">
                  ${((inv.total_cents as number) / 100).toFixed(2)}
                </span>
                {inv.status === 'open' && (
                  <ActionBtn
                    label="Resend"
                    icon={<Send size={11} />}
                    onClick={() => invokeAdminFn('billing-actions', { action: 'resend', invoice_id: inv.id }, `RESEND_INVOICE_${String(inv.id).slice(0, 8)}`)}
                    loading={actionLoading === `RESEND_INVOICE_${String(inv.id).slice(0, 8)}`}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </SectionCard>
    </div>
  );
}

// ── Imports Tab ──────────────────────────────────────────────────

function ImportsTab({ data }: { data: Record<string, unknown> }) {
  const batches = data.batches as Record<string, unknown>[];
  const apolloSearch = data.apolloSearch as Record<string, unknown>[];
  const apolloImport = data.apolloImport as Record<string, unknown>[];

  const exportFailedRows = (batch: Record<string, unknown>) => {
    const skipped = batch.skipped_rows as unknown[] ?? [];
    if (!skipped.length) return;
    const csv = ['row_index,reason,...data'];
    for (const row of skipped) {
      const r = row as Record<string, string>;
      csv.push(`${r.row_index ?? ''},${r.reason ?? ''},${JSON.stringify(r)}`);
    }
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed-rows-${String(batch.id).slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <SectionCard title={`Import Batches (${batches.length})`}>
        {batches.length === 0 ? (
          <EmptyState icon={<Upload size={20} />} title="No import batches" description="This workspace hasn't imported any data yet." />
        ) : (
          batches.map((b, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-[11px] font-bold text-gray-900">{String(b.file_name)}</p>
                <p className="text-[10px] text-gray-500">
                  {String(b.status)} · Imported: {String(b.imported_count)} · Skipped: {String(b.skipped_count)} · {String(b.created_at ?? '').slice(0, 10)}
                </p>
              </div>
              {(b.skipped_rows as unknown[] ?? []).length > 0 && (
                <ActionBtn label="Export Failed" icon={<Download size={11} />} onClick={() => exportFailedRows(b)} />
              )}
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard title={`Apollo Search Logs (${apolloSearch.length})`}>
        <DataTable columns={['id', 'results_count', 'created_at']} rows={apolloSearch} />
      </SectionCard>

      <SectionCard title={`Apollo Import Logs (${apolloImport.length})`}>
        <DataTable columns={['id', 'total_requested', 'imported_count', 'skipped_count', 'failed_count', 'created_at']} rows={apolloImport} />
      </SectionCard>
    </div>
  );
}

// ── Jobs + Refresh Tab ──────────────────────────────────────────

function JobsTab({
  invokeAdminFn, invokeRpc, actionLoading, actionResults, wsId, integrations,
}: {
  invokeAdminFn: (fn: string, payload: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  invokeRpc: (rpc: string, params: Record<string, unknown>, label: string) => Promise<{ data?: unknown; error?: string }>;
  actionLoading: string | null;
  actionResults: ActionResult[];
  wsId: string;
  integrations: Record<string, unknown>[];
}) {
  const jobs = [
    {
      label: 'Refresh Email Analytics',
      action: 'REFRESH_EMAIL_ANALYTICS',
      description: 'Refreshes the email_analytics_summary materialized view.',
      fn: () => invokeRpc('refresh_email_analytics', {}, 'REFRESH_EMAIL_ANALYTICS'),
      icon: <Database size={14} />,
    },
    {
      label: 'Reset Stuck Writing Items',
      action: 'RESET_STUCK_WRITING_ITEMS',
      description: 'Releases locked AI writer items that are stuck in "writing" state.',
      fn: () => invokeRpc('reset_stuck_writing_items', {}, 'RESET_STUCK_WRITING_ITEMS'),
      icon: <RotateCcw size={14} />,
    },
    {
      label: 'Process Scheduled Emails',
      action: 'KICK_SCHEDULED_EMAILS',
      description: 'Triggers the scheduled email sending processor.',
      fn: () => invokeAdminFn('process-scheduled-emails', {}, 'KICK_SCHEDULED_EMAILS'),
      icon: <Send size={14} />,
    },
    {
      label: 'Process Email Writing Queue',
      action: 'KICK_WRITING_QUEUE',
      description: 'Triggers the AI email writer to process pending queue items.',
      fn: () => invokeAdminFn('process-email-writing-queue', { run_id: null }, 'KICK_WRITING_QUEUE'),
      icon: <Zap size={14} />,
    },
    {
      label: 'Validate All Integrations',
      action: 'VALIDATE_ALL_INTEGRATIONS',
      description: `Validates all ${integrations.length} connected integration(s).`,
      fn: async () => {
        for (const ig of integrations) {
          await invokeAdminFn('validate-integration', {
            provider: ig.provider,
            credentials: (ig.credentials as Record<string, unknown>) ?? {},
          }, `VALIDATE_INTEGRATION_${String(ig.provider).toUpperCase()}`);
        }
      },
      icon: <Plug size={14} />,
    },
  ];

  return (
    <div className="space-y-3">
      {jobs.map(job => {
        const lastResult = actionResults.find(r => r.action === job.action);
        return (
          <div key={job.action} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-600">{job.icon}</div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-gray-900">{job.label}</h4>
                <p className="text-[10px] text-gray-500">{job.description}</p>
                {lastResult && (
                  <p className={`text-[10px] font-semibold mt-0.5 ${lastResult.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                    Last: {lastResult.status} at {new Date(lastResult.ts).toLocaleTimeString()} — {lastResult.message.slice(0, 80)}
                  </p>
                )}
              </div>
            </div>
            <ActionBtn label="Run" icon={<Play size={13} />} onClick={job.fn} loading={actionLoading === job.action} />
          </div>
        );
      })}
    </div>
  );
}

// ── Logs + Evidence Tab ─────────────────────────────────────────

function LogsTab({
  auditLogs, supportAuditLogs, generateDiagnosticReport, actionLoading,
}: {
  auditLogs: Record<string, unknown>[];
  supportAuditLogs: Record<string, unknown>[];
  generateDiagnosticReport: () => void;
  actionLoading: string | null;
}) {
  const [logType, setLogType] = useState<'audit' | 'support'>('audit');
  const logs = logType === 'audit' ? auditLogs : supportAuditLogs;
  const columns = logType === 'audit'
    ? ['action', 'user_id', 'entity_type', 'details', 'created_at']
    : ['action', 'admin_id', 'resource_type', 'created_at'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setLogType('audit')}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${logType === 'audit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            Audit Logs ({auditLogs.length})
          </button>
          <button
            onClick={() => setLogType('support')}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${logType === 'support' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            Support Logs ({supportAuditLogs.length})
          </button>
        </div>
        <ActionBtn
          label="Download Diagnostic Report"
          icon={<FileDown size={13} />}
          onClick={generateDiagnosticReport}
          loading={actionLoading === 'diagnostic_report'}
        />
      </div>

      <DataTable columns={columns} rows={logs} />
    </div>
  );
}

// ── Security Tab ────────────────────────────────────────────────

function SecurityTab({
  supportSession, onStartSession, onEndSession, actionLoading,
}: {
  supportSession: SupportSession | null;
  onStartSession: () => void;
  onEndSession: () => void;
  actionLoading: string | null;
}) {
  return (
    <div className="space-y-4">
      <SectionCard title="Support Session">
        {supportSession ? (
          <>
            <StatRow label="Session ID" value={supportSession.id} />
            <StatRow label="Access level" value={supportSession.access_level} />
            <StatRow label="Started" value={new Date(supportSession.started_at).toLocaleString()} />
            <StatRow label="Expires" value={new Date(supportSession.expires_at).toLocaleString()} />
            <StatRow label="Time remaining" value={`${Math.max(0, Math.round((new Date(supportSession.expires_at).getTime() - Date.now()) / 60000))} minutes`} />
            <div className="pt-2">
              <ActionBtn
                label="End Support Session"
                icon={<XCircle size={13} />}
                onClick={onEndSession}
                loading={actionLoading === 'end_session'}
                variant="danger"
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">No active support session. Start one to enable audited access to this workspace.</p>
            <ActionBtn
              label="Start Support Session"
              icon={<ShieldCheck size={13} />}
              onClick={onStartSession}
              loading={actionLoading === 'start_session'}
            />
          </>
        )}
      </SectionCard>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck size={16} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-red-800">Security Scope</h4>
            <ul className="text-[11px] text-red-700 mt-1 space-y-1 list-disc list-inside">
              <li>Secrets (API keys, OAuth tokens, SMTP passwords) are stored in <code className="bg-red-100 px-1 rounded">sender_account_secrets</code> — service_role only, never exposed in UI.</li>
              <li>All actions are logged to <code className="bg-red-100 px-1 rounded">audit_logs</code> and <code className="bg-red-100 px-1 rounded">support_audit_logs</code> (when session is active).</li>
              <li>Support sessions expire after 2 hours. Extend by starting a new session.</li>
              <li>Integration credentials shown in the Integrations tab are metadata only — no secrets.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminOpsCenter;
