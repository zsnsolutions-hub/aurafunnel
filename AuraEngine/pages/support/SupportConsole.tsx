import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, UserCircle, ArrowRight, Clock, Shield, CreditCard,
  User, Eye, EyeOff, Plug, Mail, Target, RefreshCw,
  CheckCircle2, XCircle, FileDown, Check, ChevronDown, ChevronRight,
  Headphones, AlertTriangle, History, Wrench, ScrollText, Hash,
} from 'lucide-react';
import { useSupport } from '../../components/support/SupportProvider';
import {
  searchUsers,
  TargetProfile,
  SupportSession,
  getSessionHistory,
  getTargetProfile,
  getTargetSubscription,
  getTargetIntegrations,
  getTargetEmailConfigs,
  getTargetWebhooks,
  getTargetLeads,
  getAuditLogs,
  getTargetEmailMessages,
  debugIntegration,
  exportDiagnosticReport,
  downloadJson,
} from '../../lib/support';
import { logSupportAction, logAuditAction } from '../../lib/supportAudit';
import { supabase } from '../../lib/supabase';

// ── Query Debug Types ─────────────────────────────────────────
interface QueryLogEntry {
  name: string;
  durationMs: number;
  rows: number;
  status: 'OK' | 'ERROR';
  error?: string;
  ts: string;
}

// ── Helpers ───────────────────────────────────────────────────

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m`;
  return `${mins}m`;
}

function creditsPct(used: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
}

// ── Sub-component: Skeleton ───────────────────────────────────

const Skeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="animate-pulse space-y-3 py-4">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="h-3 bg-gray-100 rounded-full" style={{ width: `${70 + Math.random() * 30}%` }} />
    ))}
  </div>
);

// ── Sub-component: EmptyState ─────────────────────────────────

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description?: string }> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300 mb-3">{icon}</div>
    <p className="text-sm font-bold text-gray-400">{title}</p>
    {description && <p className="text-xs text-gray-300 mt-1 max-w-xs">{description}</p>}
  </div>
);

// ── Sub-component: ErrorBanner ────────────────────────────────

const ErrorBanner: React.FC<{ errors: string[]; onDismiss: () => void }> = ({ errors, onDismiss }) => {
  if (errors.length === 0) return null;
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-xs text-red-700 space-y-1">
            {errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        </div>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 text-xs font-bold ml-4">Dismiss</button>
      </div>
    </div>
  );
};

// ── Integration Row Type ──────────────────────────────────────

interface IntegrationRow {
  id: string;
  type: string;
  provider?: string;
  is_connected?: boolean;
  source: 'integration' | 'email_config';
}

// ── RIGHT column active tab ───────────────────────────────────

type RightTab = 'controls' | 'debug' | 'export' | 'logs';

// ── Diagnostic export sections ────────────────────────────────

const EXPORT_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'email_configs', label: 'Email Configs' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'leads_summary', label: 'Leads Summary' },
  { id: 'audit_logs', label: 'Audit Logs' },
];

// ══════════════════════════════════════════════════════════════
// ██ MAIN COMPONENT ██
// ══════════════════════════════════════════════════════════════

const SupportConsole: React.FC = () => {
  const {
    adminId, activeSession, viewingAsUser,
    isImpersonating, startSession, endSession,
    impersonateUser, stopImpersonation, logAction,
  } = useSupport();

  // ── Query debug log ──────────────────────────────────────
  const [queryLog, setQueryLog] = useState<QueryLogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const pushLog = useCallback((entry: QueryLogEntry) => {
    setQueryLog(prev => [entry, ...prev].slice(0, 100));
  }, []);

  async function supportQuery<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    const start = performance.now();
    try {
      const result = await fn();
      const rows = Array.isArray(result) ? result.length : (result ? 1 : 0);
      pushLog({ name, durationMs: Math.round(performance.now() - start), rows, status: 'OK', ts: new Date().toISOString() });
      return result;
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error';
      pushLog({ name, durationMs: Math.round(performance.now() - start), rows: 0, status: 'ERROR', error: msg, ts: new Date().toISOString() });
      setErrors(prev => [...prev, `${name}: ${msg}`]);
      return null;
    }
  }

  // ── LEFT: Search state ───────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TargetProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TargetProfile | null>(null);
  const [reason, setReason] = useState('');
  const [starting, setStarting] = useState(false);

  // ── LEFT: Recent sessions ────────────────────────────────
  const [recentSessions, setRecentSessions] = useState<(SupportSession & { targetName?: string })[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // ── CENTER: Customer data ────────────────────────────────
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [integrationRows, setIntegrationRows] = useState<IntegrationRow[]>([]);
  const [leadSummary, setLeadSummary] = useState<{ total: number; byStatus: Record<string, number>; avgScore: number }>({ total: 0, byStatus: {}, avgScore: 0 });
  const [centerLoading, setCenterLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // ── RIGHT: Tab state ─────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightTab>('controls');

  // ── RIGHT > Debug ────────────────────────────────────────
  const [testing, setTesting] = useState<string | null>(null);
  const [debugResults, setDebugResults] = useState<Record<string, Record<string, unknown>>>({});

  // ── RIGHT > Export ───────────────────────────────────────
  const [exportSections, setExportSections] = useState<Set<string>>(new Set(EXPORT_SECTIONS.map(s => s.id)));
  const [generating, setGenerating] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  // ── RIGHT > Logs ─────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [emailMessages, setEmailMessages] = useState<Record<string, unknown>[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSubTab, setLogSubTab] = useState<'audit' | 'emails'>('audit');
  const [logFilter, setLogFilter] = useState('');

  // ── RIGHT > History (expanded session) ───────────────────
  const [historyExpanded, setHistoryExpanded] = useState<Set<string>>(new Set());
  const [sessionLogs, setSessionLogs] = useState<Record<string, Record<string, unknown>[]>>({});

  // ─────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────

  // Load recent sessions on mount
  useEffect(() => {
    if (!adminId) return;
    setRecentLoading(true);
    supportQuery('recent_sessions', () => getSessionHistory(adminId, 20))
      .then(async (sessions) => {
        if (!sessions) { setRecentLoading(false); return; }
        // Resolve target names for display
        const enriched = await Promise.all(
          sessions.slice(0, 10).map(async (s) => {
            const profile = await getTargetProfile(s.target_user_id).catch(() => null);
            return { ...s, targetName: profile?.name || profile?.email || s.target_user_id.slice(0, 8) + '...' };
          })
        );
        setRecentSessions(enriched);
        setRecentLoading(false);
      });
  }, [adminId]);

  // Session timer tick
  useEffect(() => {
    if (!activeSession) return;
    const tick = () => setTimeLeft(formatTimeLeft(activeSession.expires_at));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [activeSession]);

  // Load customer context when session changes
  useEffect(() => {
    if (!activeSession?.target_user_id) {
      setSubscription(null);
      setIntegrationRows([]);
      setLeadSummary({ total: 0, byStatus: {}, avgScore: 0 });
      return;
    }
    const uid = activeSession.target_user_id;
    setCenterLoading(true);

    Promise.all([
      supportQuery('target_subscription', () => getTargetSubscription(uid)),
      supportQuery('target_integrations', () => getTargetIntegrations(uid)),
      supportQuery('target_email_configs', () => getTargetEmailConfigs(uid)),
      supportQuery('target_leads', () => getTargetLeads(uid)),
    ]).then(([sub, integrations, emailConfigs, leads]) => {
      setSubscription(sub);

      // Build integration rows
      const intRows: IntegrationRow[] = [
        ...(integrations || []).map((i: Record<string, unknown>) => ({
          id: i.id as string,
          type: i.type as string,
          provider: i.provider as string,
          is_connected: i.is_connected as boolean,
          source: 'integration' as const,
        })),
        ...(emailConfigs || []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          type: `email_${(c.provider as string) || 'unknown'}`,
          provider: c.provider as string,
          is_connected: true,
          source: 'email_config' as const,
        })),
      ];
      setIntegrationRows(intRows);

      // Build lead summary
      const allLeads = leads || [];
      const byStatus: Record<string, number> = {};
      let totalScore = 0;
      allLeads.forEach((l: Record<string, unknown>) => {
        const status = (l.status as string) || 'Unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
        totalScore += (l.score as number) || 0;
      });
      setLeadSummary({
        total: allLeads.length,
        byStatus,
        avgScore: allLeads.length > 0 ? Math.round(totalScore / allLeads.length) : 0,
      });

      setCenterLoading(false);
    });
  }, [activeSession?.target_user_id]);

  // Load logs when switching to logs tab or session changes
  useEffect(() => {
    if (!activeSession?.target_user_id || rightTab !== 'logs') return;
    const uid = activeSession.target_user_id;
    setLogsLoading(true);
    Promise.all([
      supportQuery('audit_logs', () => getAuditLogs(uid)),
      supportQuery('email_messages', () => getTargetEmailMessages(uid)),
    ]).then(([audit, emails]) => {
      setAuditLogs(audit || []);
      setEmailMessages(emails || []);
      setLogsLoading(false);
    });
  }, [activeSession?.target_user_id, rightTab]);

  // ─────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    const results = await supportQuery('search_users', () => searchUsers(searchQuery.trim()));
    setSearchResults(results || []);
    setSearchLoading(false);
  };

  const handleStartSession = async () => {
    if (!selectedUser || !reason.trim()) return;
    setStarting(true);
    try {
      await startSession(selectedUser.id, reason.trim());
      await logAuditAction({
        user_id: selectedUser.id,
        action: 'support_session_started',
        details: { reason: reason.trim() },
      });
      setSelectedUser(null);
      setReason('');
      setSearchResults([]);
      setSearchQuery('');
    } finally {
      setStarting(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    await logAuditAction({
      user_id: activeSession.target_user_id,
      action: 'support_session_ended',
    });
    await endSession();
  };

  const handleImpersonate = async () => {
    if (!activeSession) return;
    await impersonateUser(activeSession.target_user_id);
    await logAuditAction({
      user_id: activeSession.target_user_id,
      action: 'support_impersonation_started',
    });
  };

  const handleStopImpersonation = () => {
    if (activeSession) {
      logAuditAction({
        user_id: activeSession.target_user_id,
        action: 'support_impersonation_stopped',
      });
    }
    stopImpersonation();
  };

  const handleTestIntegration = async (row: IntegrationRow) => {
    if (!activeSession) return;
    setTesting(row.id);
    try {
      const response = await supportQuery(`debug_${row.type}`, () =>
        debugIntegration(activeSession.target_user_id, row.type, row.id)
      );
      setDebugResults(prev => ({ ...prev, [row.id]: (response as Record<string, unknown>)?.result ?? response ?? { status: 'no_response' } }));
      await logAction('debug_integration', row.type, row.id);
      await logAuditAction({
        user_id: activeSession.target_user_id,
        action: 'support_debug_integration',
        resource_type: row.type,
        resource_id: row.id,
      });
    } catch (err) {
      setDebugResults(prev => ({ ...prev, [row.id]: { status: 'error', message: (err as Error).message } }));
    } finally {
      setTesting(null);
    }
  };

  const handleExport = async () => {
    if (!activeSession) return;
    setGenerating(true);
    setExportDone(false);
    try {
      const response = await supportQuery('diagnostic_export', () =>
        exportDiagnosticReport(activeSession.target_user_id, Array.from(exportSections))
      );
      if (response) {
        const report = (response as Record<string, unknown>).report ?? response;
        const filename = `diagnostic_${viewingAsUser?.email || activeSession.target_user_id}_${new Date().toISOString().slice(0, 10)}.json`;
        downloadJson(report, filename);
        await logAction('export_diagnostic_report', 'diagnostic_report', undefined, { sections: Array.from(exportSections) });
        await logAuditAction({
          user_id: activeSession.target_user_id,
          action: 'support_diagnostic_exported',
          details: { sections: Array.from(exportSections) },
        });
        setExportDone(true);
        setTimeout(() => setExportDone(false), 3000);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRefreshLogs = async () => {
    if (!activeSession?.target_user_id) return;
    const uid = activeSession.target_user_id;
    setLogsLoading(true);
    const [audit, emails] = await Promise.all([
      supportQuery('audit_logs_refresh', () => getAuditLogs(uid)),
      supportQuery('email_messages_refresh', () => getTargetEmailMessages(uid)),
    ]);
    setAuditLogs(audit || []);
    setEmailMessages(emails || []);
    setLogsLoading(false);
  };

  const handleSelectRecentSession = async (session: SupportSession) => {
    // Load the target profile and pre-select them
    const profile = await supportQuery('recent_target_profile', () => getTargetProfile(session.target_user_id));
    if (profile) {
      setSelectedUser(profile);
      setSearchResults([profile]);
    }
  };

  const toggleHistoryExpand = async (sessionId: string) => {
    const next = new Set(historyExpanded);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
      if (!sessionLogs[sessionId]) {
        const logs = await supportQuery(`session_logs_${sessionId.slice(0, 8)}`, () => getAuditLogs(undefined, 200));
        const filtered = (logs || []).filter((l: Record<string, unknown>) => l.session_id === sessionId);
        setSessionLogs(prev => ({ ...prev, [sessionId]: filtered }));
      }
    }
    setHistoryExpanded(next);
  };

  // ── Derived data ─────────────────────────────────────────

  const integrationSummary = useMemo(() => {
    const connected = integrationRows.filter(r => r.is_connected === true).length;
    const disconnected = integrationRows.filter(r => r.is_connected === false).length;
    return { total: integrationRows.length, connected, disconnected };
  }, [integrationRows]);

  const filteredAuditLogs = useMemo(() => {
    if (!logFilter.trim()) return auditLogs;
    const q = logFilter.toLowerCase();
    return auditLogs.filter(log =>
      ((log.action as string) || '').toLowerCase().includes(q) ||
      ((log.resource_type as string) || '').toLowerCase().includes(q)
    );
  }, [auditLogs, logFilter]);

  const filteredEmails = useMemo(() => {
    if (!logFilter.trim()) return emailMessages;
    const q = logFilter.toLowerCase();
    return emailMessages.filter(msg =>
      ((msg.subject as string) || '').toLowerCase().includes(q) ||
      ((msg.to_email as string) || '').toLowerCase().includes(q) ||
      ((msg.status as string) || '').toLowerCase().includes(q)
    );
  }, [emailMessages, logFilter]);

  // Credit gauge
  const pct = viewingAsUser ? creditsPct(viewingAsUser.credits_used, viewingAsUser.credits_total) : 0;
  const circumference = 2 * Math.PI * 36;
  const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;

  // Right tab config
  const rightTabs: { id: RightTab; label: string; icon: React.ReactNode; needsSession: boolean }[] = [
    { id: 'controls', label: 'Session', icon: <Shield size={14} />, needsSession: true },
    { id: 'debug', label: 'Debug', icon: <Wrench size={14} />, needsSession: true },
    { id: 'export', label: 'Export', icon: <FileDown size={14} />, needsSession: true },
    { id: 'logs', label: 'Logs', icon: <ScrollText size={14} />, needsSession: true },
  ];

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Support Console</h1>
          <p className="text-sm text-gray-500 mt-1">Internal support cockpit for customer workspace troubleshooting</p>
        </div>
        {activeSession && viewingAsUser && (
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <div className="text-xs">
              <span className="font-bold text-gray-900">{viewingAsUser.name || viewingAsUser.email}</span>
              <span className="text-gray-400 ml-2">{timeLeft} remaining</span>
            </div>
          </div>
        )}
      </div>

      <ErrorBanner errors={errors} onDismiss={() => setErrors([])} />

      {/* ── 3-Column Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: 'calc(100vh - 240px)' }}>

        {/* ████ LEFT COLUMN (3 cols) — Finder + Recent ████ */}
        <div className="col-span-12 lg:col-span-3 space-y-4">

          {/* Search Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Find Customer</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {searchLoading ? '...' : 'Go'}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{searchResults.length} Results</p>
              </div>
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                      selectedUser?.id === user.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <UserCircle size={18} className="text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">{user.name || 'Unnamed'}</p>
                        <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {user.status}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold">{user.plan}</span>
                      </div>
                    </div>
                    {/* Credits mini bar */}
                    <div className="mt-2 ml-11">
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            creditsPct(user.credits_used, user.credits_total) >= 90 ? 'bg-red-500' :
                            creditsPct(user.credits_used, user.credits_total) >= 70 ? 'bg-amber-500' :
                            'bg-indigo-500'
                          }`}
                          style={{ width: `${creditsPct(user.credits_used, user.credits_total)}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-gray-300 mt-0.5">{user.credits_used}/{user.credits_total} credits</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start Session Panel */}
          {selectedUser && !activeSession && (
            <div className="bg-white rounded-2xl border border-amber-200 p-4">
              <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider mb-2">
                Enter Support Mode
              </p>
              <p className="text-xs font-bold text-gray-900 mb-1">{selectedUser.name || selectedUser.email}</p>
              <p className="text-[10px] text-gray-400 mb-3">{selectedUser.email}</p>
              <textarea
                placeholder="Reason for access (required)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none mb-2"
              />
              <button
                onClick={handleStartSession}
                disabled={starting || !reason.trim()}
                className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {starting ? 'Starting...' : 'Enter Support Mode'}
                <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Switch User (when session already active) */}
          {selectedUser && activeSession && selectedUser.id !== activeSession.target_user_id && (
            <div className="bg-white rounded-2xl border border-amber-200 p-4">
              <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg mb-3">
                <p className="text-[10px] text-amber-700 font-medium">Active session will be ended to start a new one.</p>
              </div>
              <p className="text-xs font-bold text-gray-900 mb-1">{selectedUser.name || selectedUser.email}</p>
              <textarea
                placeholder="Reason for access (required)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none mb-2"
              />
              <button
                onClick={handleStartSession}
                disabled={starting || !reason.trim()}
                className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {starting ? 'Starting...' : 'Switch Workspace'}
                <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Recently Supported */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Recently Supported</p>
              <History size={14} className="text-gray-300" />
            </div>
            {recentLoading ? (
              <Skeleton lines={4} />
            ) : recentSessions.length === 0 ? (
              <p className="text-xs text-gray-300">No recent sessions.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {recentSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectRecentSession(s)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-700 truncate">{s.targetName}</p>
                      <p className="text-[10px] text-gray-400 truncate">{s.reason || '(no reason)'}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <span className="text-[9px] text-gray-400">
                        {new Date(s.started_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ████ CENTER COLUMN (5 cols) — Customer Context ████ */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {!activeSession || !viewingAsUser ? (
            /* No session — show welcome state */
            <div className="bg-white rounded-2xl border border-gray-200 h-full flex flex-col items-center justify-center p-12">
              <div className="w-16 h-16 rounded-3xl bg-gray-50 flex items-center justify-center mb-4">
                <Headphones size={28} className="text-gray-300" />
              </div>
              <h2 className="text-lg font-black text-gray-900 mb-1">Support Console</h2>
              <p className="text-sm text-gray-400 text-center max-w-sm mb-6">
                Search for a customer workspace in the left panel, then start a support session to view their data and run diagnostics.
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs w-full max-w-xs">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <Search size={16} className="mx-auto text-gray-300 mb-1" />
                  <p className="font-bold text-gray-500">1. Find</p>
                  <p className="text-gray-400">Search by email</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <Shield size={16} className="mx-auto text-gray-300 mb-1" />
                  <p className="font-bold text-gray-500">2. Connect</p>
                  <p className="text-gray-400">Start session</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <Eye size={16} className="mx-auto text-gray-300 mb-1" />
                  <p className="font-bold text-gray-500">3. Inspect</p>
                  <p className="text-gray-400">View context</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <Wrench size={16} className="mx-auto text-gray-300 mb-1" />
                  <p className="font-bold text-gray-500">4. Debug</p>
                  <p className="text-gray-400">Run diagnostics</p>
                </div>
              </div>
            </div>
          ) : centerLoading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <Skeleton lines={8} />
            </div>
          ) : (
            <>
              {/* Profile Card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                      {viewingAsUser.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-gray-900">{viewingAsUser.name || 'Unnamed User'}</h2>
                      <p className="text-[10px] text-gray-400">{viewingAsUser.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      viewingAsUser.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {viewingAsUser.role}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      viewingAsUser.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {viewingAsUser.status}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-300 font-mono">ID: {viewingAsUser.id}</p>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: 'Plan', value: viewingAsUser.plan, icon: <CreditCard size={14} /> },
                  { label: 'Session Timer', value: timeLeft, icon: <Clock size={14} /> },
                  { label: 'Credits', value: `${viewingAsUser.credits_used} / ${viewingAsUser.credits_total}`, icon: <User size={14} /> },
                  { label: 'Access Level', value: activeSession.access_level, icon: <Shield size={14} /> },
                ] as { label: string; value: string; icon: React.ReactNode }[]).map((card) => (
                  <div key={card.label} className="bg-white rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                      {card.icon}
                      <span className="text-[9px] font-bold uppercase tracking-wider">{card.label}</span>
                    </div>
                    <p className="text-sm font-black text-gray-900">{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Integration + Lead + Credit row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Integrations */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-2">
                    <Plug size={14} />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Integrations</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 mb-1">{integrationSummary.total}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[9px] text-gray-500">{integrationSummary.connected}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span className="text-[9px] text-gray-500">{integrationSummary.disconnected}</span>
                    </div>
                  </div>
                </div>

                {/* Lead Stats */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-2">
                    <Target size={14} />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Leads</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 mb-1">{leadSummary.total}</p>
                  <p className="text-[9px] text-gray-400">Avg score: {leadSummary.avgScore}</p>
                </div>

                {/* Credit Gauge */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col items-center justify-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Usage</span>
                  <svg viewBox="0 0 96 96" className="w-16 h-16">
                    <circle cx="48" cy="48" r="36" fill="none" stroke="#f3f4f6" strokeWidth="7" />
                    <circle cx="48" cy="48" r="36" fill="none"
                      stroke={pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#6366f1'}
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={strokeDasharray}
                      transform="rotate(-90 48 48)" />
                    <text x="48" y="45" textAnchor="middle" className="fill-gray-900" style={{ fontSize: '16px', fontWeight: 700 }}>
                      {pct}%
                    </text>
                    <text x="48" y="57" textAnchor="middle" className="fill-gray-400" style={{ fontSize: '7px' }}>
                      credits
                    </text>
                  </svg>
                </div>
              </div>

              {/* Subscription */}
              {subscription && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3">Subscription</p>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[9px] text-gray-400 font-bold">Plan</span>
                      <p className="font-bold text-gray-900">{(subscription.plan_name as string) || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 font-bold">Status</span>
                      <p className="font-bold text-gray-900">{(subscription.status as string) || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 font-bold">Period End</span>
                      <p className="font-bold text-gray-900">
                        {subscription.current_period_end ? new Date(subscription.current_period_end as string).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Lead Status Breakdown */}
              {Object.keys(leadSummary.byStatus).length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3">Lead Status Breakdown</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(leadSummary.byStatus).map(([status, count]) => (
                      <span key={status} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                        {status}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ████ RIGHT COLUMN (4 cols) — Actions + Evidence ████ */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {!activeSession ? (
            /* No session — show history stats */
            <>
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Session History</p>
                {recentLoading ? (
                  <Skeleton lines={3} />
                ) : recentSessions.length === 0 ? (
                  <EmptyState icon={<History size={20} />} title="No history yet" description="Past support sessions will appear here." />
                ) : (
                  <>
                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-50 rounded-xl p-3 text-center">
                        <Hash size={12} className="mx-auto text-gray-300 mb-1" />
                        <p className="text-sm font-bold text-gray-900">{recentSessions.length}</p>
                        <p className="text-[9px] text-gray-400">Sessions</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center">
                        <Clock size={12} className="mx-auto text-gray-300 mb-1" />
                        <p className="text-sm font-bold text-gray-900">
                          {(() => {
                            const ended = recentSessions.filter(s => s.ended_at);
                            if (ended.length === 0) return 'N/A';
                            const avg = ended.reduce((a, s) => a + (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()), 0) / ended.length / 60_000;
                            return `${Math.round(avg)}m`;
                          })()}
                        </p>
                        <p className="text-[9px] text-gray-400">Avg Duration</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center">
                        <User size={12} className="mx-auto text-gray-300 mb-1" />
                        <p className="text-sm font-bold text-gray-900">
                          {new Set(recentSessions.map(s => s.target_user_id)).size}
                        </p>
                        <p className="text-[9px] text-gray-400">Unique Users</p>
                      </div>
                    </div>

                    {/* Expandable session list */}
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {recentSessions.map((s) => (
                        <div key={s.id}>
                          <button
                            onClick={() => toggleHistoryExpand(s.id)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {historyExpanded.has(s.id) ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-gray-700 truncate">{s.targetName}</p>
                                <p className="text-[9px] text-gray-400 truncate">{s.reason || '(no reason)'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-2 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                                s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {s.is_active ? 'Active' : 'Ended'}
                              </span>
                              <span className="text-[9px] text-gray-400">{new Date(s.started_at).toLocaleDateString()}</span>
                            </div>
                          </button>
                          {historyExpanded.has(s.id) && (
                            <div className="bg-gray-50 rounded-lg px-3 py-2 ml-5 mt-1 mb-1">
                              {!sessionLogs[s.id] ? (
                                <p className="text-[10px] text-gray-400">Loading logs...</p>
                              ) : sessionLogs[s.id].length === 0 ? (
                                <p className="text-[10px] text-gray-400">No audit entries.</p>
                              ) : (
                                <div className="space-y-1">
                                  {sessionLogs[s.id].map((log, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                      <span className="font-bold text-gray-600">{log.action as string}</span>
                                      <span className="text-gray-400">{new Date(log.created_at as string).toLocaleTimeString()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            /* Session active — show action tabs */
            <>
              {/* Tab bar */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {rightTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRightTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex-1 justify-center ${
                      rightTab === tab.id
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Session Controls ──────────────────── */}
              {rightTab === 'controls' && (
                <div className="space-y-4">
                  {/* Session Info */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3">Session Info</p>
                    <div className="text-[10px] text-gray-500 space-y-1.5">
                      <p><span className="font-bold text-gray-700">ID:</span> <span className="font-mono">{activeSession.id.slice(0, 16)}...</span></p>
                      <p><span className="font-bold text-gray-700">Started:</span> {new Date(activeSession.started_at).toLocaleString()}</p>
                      <p><span className="font-bold text-gray-700">Expires:</span> {new Date(activeSession.expires_at).toLocaleString()}</p>
                      <p><span className="font-bold text-gray-700">Reason:</span> {activeSession.reason}</p>
                      <p><span className="font-bold text-gray-700">Access:</span> {activeSession.access_level}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">Actions</p>
                    {!isImpersonating ? (
                      <button
                        onClick={handleImpersonate}
                        className="flex items-center gap-2 w-full justify-center px-4 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors"
                      >
                        <Eye size={14} />
                        Impersonate (Read-Only)
                      </button>
                    ) : (
                      <button
                        onClick={handleStopImpersonation}
                        className="flex items-center gap-2 w-full justify-center px-4 py-2.5 bg-gray-600 text-white rounded-xl text-xs font-bold hover:bg-gray-700 transition-colors"
                      >
                        <EyeOff size={14} />
                        Stop Impersonation
                      </button>
                    )}
                    <button
                      onClick={handleEndSession}
                      className="flex items-center gap-2 w-full justify-center px-4 py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors"
                    >
                      End Session
                    </button>
                  </div>
                </div>
              )}

              {/* ── Tab: Integration Debug ─────────────────── */}
              {rightTab === 'debug' && (
                <div className="space-y-3">
                  {/* Summary badges */}
                  {integrationRows.length > 0 && (
                    <div className="flex gap-2">
                      <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-gray-100 text-gray-600">
                        Total: {integrationSummary.total}
                      </span>
                      <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                        OK: {integrationSummary.connected}
                      </span>
                      <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-red-100 text-red-700">
                        Down: {integrationSummary.disconnected}
                      </span>
                    </div>
                  )}

                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Integrations & Email Configs</p>
                    </div>
                    {integrationRows.length === 0 ? (
                      <EmptyState icon={<Plug size={20} />} title="No integrations" description="This user has no connected integrations." />
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto">
                        {integrationRows.map((row) => (
                          <div key={row.id} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${
                                  row.is_connected === true ? 'bg-emerald-500' :
                                  row.is_connected === false ? 'bg-red-500' : 'bg-gray-300'
                                }`} />
                                {row.source === 'email_config'
                                  ? <Mail size={14} className="text-blue-500" />
                                  : <Plug size={14} className="text-indigo-500" />
                                }
                                <div>
                                  <p className="text-xs font-bold text-gray-900">{row.type}</p>
                                  {row.provider && <p className="text-[9px] text-gray-400">{row.provider}</p>}
                                </div>
                              </div>
                              <button
                                onClick={() => handleTestIntegration(row)}
                                disabled={testing === row.id}
                                className="flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw size={10} className={testing === row.id ? 'animate-spin' : ''} />
                                {testing === row.id ? '...' : 'Test'}
                              </button>
                            </div>
                            {debugResults[row.id] && (
                              <div className="mt-2 bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  {(debugResults[row.id].status as string) === 'error' ? (
                                    <XCircle size={12} className="text-red-500" />
                                  ) : (
                                    <CheckCircle2 size={12} className="text-emerald-500" />
                                  )}
                                  <span className="text-[10px] font-bold text-gray-700">
                                    {debugResults[row.id].status as string}
                                  </span>
                                </div>
                                <pre className="text-[9px] text-gray-500 whitespace-pre-wrap break-all font-mono max-h-32 overflow-y-auto">
                                  {JSON.stringify(debugResults[row.id], null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab: Diagnostic Export ──────────────────── */}
              {rightTab === 'export' && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Diagnostic Report</p>
                    <p className="text-[10px] text-gray-400">Select sections. Credentials will be auto-masked.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {EXPORT_SECTIONS.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => {
                          setExportSections(prev => {
                            const next = new Set(prev);
                            if (next.has(section.id)) next.delete(section.id);
                            else next.add(section.id);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold transition-all ${
                          exportSections.has(section.id)
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded border flex items-center justify-center ${
                          exportSections.has(section.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                        }`}>
                          {exportSections.has(section.id) && <Check size={8} className="text-white" />}
                        </div>
                        {section.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleExport}
                    disabled={generating || exportSections.size === 0}
                    className="flex items-center gap-2 w-full justify-center px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {generating ? 'Generating...' : exportDone ? (
                      <><Check size={14} /> Downloaded!</>
                    ) : (
                      <><FileDown size={14} /> Generate & Download</>
                    )}
                  </button>
                </div>
              )}

              {/* ── Tab: Logs & Events ─────────────────────── */}
              {rightTab === 'logs' && (
                <div className="space-y-3">
                  {/* Filter */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Filter logs..."
                      value={logFilter}
                      onChange={(e) => setLogFilter(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>

                  {/* Sub-tab toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setLogSubTab('audit')}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                          logSubTab === 'audit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Audit ({filteredAuditLogs.length})
                      </button>
                      <button
                        onClick={() => setLogSubTab('emails')}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                          logSubTab === 'emails' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Emails ({filteredEmails.length})
                      </button>
                    </div>
                    <button
                      onClick={handleRefreshLogs}
                      disabled={logsLoading}
                      className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <RefreshCw size={10} className={logsLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden max-h-[50vh] overflow-y-auto">
                    {logsLoading ? (
                      <div className="p-6"><Skeleton lines={5} /></div>
                    ) : logSubTab === 'audit' ? (
                      filteredAuditLogs.length === 0 ? (
                        <EmptyState icon={<ScrollText size={20} />} title="No audit logs" description={logFilter ? 'No matching logs.' : 'No audit activity yet.'} />
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {filteredAuditLogs.map((log, i) => (
                            <div key={i} className="px-4 py-2.5 flex items-center justify-between text-[10px]">
                              <div>
                                <span className="font-bold text-gray-900">{log.action as string}</span>
                                {log.resource_type && (
                                  <span className="text-gray-400 ml-1.5">on {log.resource_type as string}</span>
                                )}
                              </div>
                              <span className="text-gray-400">{new Date(log.created_at as string).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      filteredEmails.length === 0 ? (
                        <EmptyState icon={<Mail size={20} />} title="No emails" description={logFilter ? 'No matching emails.' : 'No email messages found.'} />
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {filteredEmails.map((msg, i) => (
                            <div key={i} className="px-4 py-2.5 text-[10px]">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-gray-900 truncate max-w-[60%]">{(msg.subject as string) || '(no subject)'}</span>
                                <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                                  msg.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                                  msg.status === 'bounced' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {(msg.status as string) || 'unknown'}
                                </span>
                              </div>
                              <p className="text-gray-400 mt-0.5">
                                To: {(msg.to_email as string) || 'N/A'}
                                {msg.created_at && <span className="ml-2">{new Date(msg.created_at as string).toLocaleString()}</span>}
                              </p>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Query Debug Panel ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setDebugOpen(!debugOpen)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Wrench size={14} className="text-gray-400" />
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Query Debug</span>
            <span className="text-[10px] font-bold text-gray-400">{queryLog.length} queries</span>
          </div>
          {debugOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>
        {debugOpen && (
          <div className="border-t border-gray-100 max-h-64 overflow-y-auto">
            {queryLog.length === 0 ? (
              <p className="px-5 py-4 text-xs text-gray-400">No queries executed yet.</p>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Query</th>
                    <th className="text-right px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="text-right px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Rows</th>
                    <th className="text-right px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {queryLog.map((entry, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-700">{entry.name}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{entry.durationMs}ms</td>
                      <td className="px-4 py-2 text-right text-gray-500">{entry.rows}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                          entry.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportConsole;
