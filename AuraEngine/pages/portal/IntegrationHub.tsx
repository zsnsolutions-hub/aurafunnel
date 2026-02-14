import React, { useState, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import {
  PlugIcon, PlusIcon, CheckIcon, XIcon, RefreshIcon, CopyIcon, KeyIcon,
  BoltIcon, GlobeIcon, LinkIcon, AlertTriangleIcon, EyeIcon, EditIcon,
  DownloadIcon, BellIcon, ShieldIcon, ActivityIcon, DatabaseIcon,
  ClockIcon, MailIcon, MessageIcon, ChartIcon, FilterIcon, PlayIcon,
  CogIcon, LockIcon, ZapIcon, KeyboardIcon, BrainIcon, TrendUpIcon,
  TrendDownIcon, LayersIcon, TargetIcon, StarIcon, ArrowRightIcon,
  SparklesIcon
} from '../../components/Icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type IntegrationCategory = 'all' | 'crm' | 'marketing' | 'comms' | 'analytics';
type IntegrationStatus = 'connected' | 'partial' | 'disconnected';
type SyncDirection = 'bidirectional' | 'outbound' | 'inbound';

interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  lastSync: string;
  syncDirection: SyncDirection;
  objects: string[];
  error?: string;
  icon: string;
  color: string;
  dataVolume: number; // percentage
}

interface ApiKeyData {
  id: string;
  name: string;
  keyPreview: string;
  fullKey: string;
  lastUsed: string;
  permissions: 'read' | 'readwrite';
  active: boolean;
}

interface WebhookData {
  id: string;
  name: string;
  url: string;
  trigger: string;
  lastFired: string;
  active: boolean;
  successRate: number;
}

interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  integration: string;
  direction: string;
  records: number;
  status: 'success' | 'failed' | 'partial';
  duration: number;
}

interface IntegrationHealthMetric {
  name: string;
  uptime: number;
  errorRate: number;
  avgLatency: number;
  lastIncident: string;
  status: 'healthy' | 'degraded' | 'down';
}

const MOCK_SYNC_HISTORY: SyncHistoryEntry[] = [
  { id: 'sh1', timestamp: new Date(Date.now() - 120000).toISOString(), integration: 'Salesforce', direction: 'Inbound', records: 12, status: 'success', duration: 1.8 },
  { id: 'sh2', timestamp: new Date(Date.now() - 300000).toISOString(), integration: 'HubSpot', direction: 'Outbound', records: 45, status: 'success', duration: 3.2 },
  { id: 'sh3', timestamp: new Date(Date.now() - 600000).toISOString(), integration: 'Slack', direction: 'Outbound', records: 1, status: 'partial', duration: 0.5 },
  { id: 'sh4', timestamp: new Date(Date.now() - 900000).toISOString(), integration: 'Google Analytics', direction: 'Inbound', records: 1842, status: 'success', duration: 8.4 },
  { id: 'sh5', timestamp: new Date(Date.now() - 1500000).toISOString(), integration: 'Mailchimp', direction: 'Outbound', records: 42, status: 'success', duration: 2.1 },
  { id: 'sh6', timestamp: new Date(Date.now() - 1800000).toISOString(), integration: 'Salesforce', direction: 'Outbound', records: 8, status: 'failed', duration: 5.0 },
  { id: 'sh7', timestamp: new Date(Date.now() - 2400000).toISOString(), integration: 'HubSpot', direction: 'Outbound', records: 23, status: 'success', duration: 1.9 },
  { id: 'sh8', timestamp: new Date(Date.now() - 3600000).toISOString(), integration: 'Slack', direction: 'Outbound', records: 1, status: 'success', duration: 0.3 },
  { id: 'sh9', timestamp: new Date(Date.now() - 5400000).toISOString(), integration: 'Google Analytics', direction: 'Inbound', records: 2104, status: 'success', duration: 9.1 },
  { id: 'sh10', timestamp: new Date(Date.now() - 7200000).toISOString(), integration: 'Salesforce', direction: 'Inbound', records: 6, status: 'success', duration: 1.2 },
];

const SYNC_STATUS_STYLES: Record<SyncHistoryEntry['status'], { bg: string; text: string; label: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Success' },
  failed: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Failed' },
  partial: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Partial' },
};

const SECURITY_CHECKS = [
  { label: 'API Keys Encrypted', status: 'pass' as const, detail: 'AES-256 at rest' },
  { label: 'OAuth 2.0 Tokens', status: 'pass' as const, detail: 'Auto-refresh enabled' },
  { label: 'Data in Transit', status: 'pass' as const, detail: 'TLS 1.3 enforced' },
  { label: 'IP Allowlisting', status: 'warn' as const, detail: 'Not configured' },
  { label: 'Webhook Signatures', status: 'pass' as const, detail: 'HMAC-SHA256 verified' },
  { label: 'Audit Logging', status: 'pass' as const, detail: '90-day retention' },
  { label: 'Data Residency', status: 'pass' as const, detail: 'US-East-1 region' },
  { label: 'PII Masking', status: 'warn' as const, detail: 'Email fields exposed' },
];

const DEFAULT_INTEGRATIONS: Integration[] = [
  {
    id: 'salesforce', name: 'Salesforce', category: 'crm', status: 'connected',
    lastSync: '2 minutes ago', syncDirection: 'bidirectional',
    objects: ['Leads', 'Contacts', 'Accounts'], icon: '☁️', color: '#00A1E0', dataVolume: 42,
  },
  {
    id: 'hubspot', name: 'HubSpot', category: 'marketing', status: 'connected',
    lastSync: '5 minutes ago', syncDirection: 'outbound',
    objects: ['Campaigns', 'Contacts'], icon: '🔶', color: '#FF7A59', dataVolume: 28,
  },
  {
    id: 'slack', name: 'Slack', category: 'comms', status: 'partial',
    lastSync: '1 hour ago', syncDirection: 'outbound',
    objects: ['#sales-alerts', '#leads'], icon: '💬', color: '#4A154B',
    error: 'Channel #leads-archive not found', dataVolume: 15,
  },
  {
    id: 'ga', name: 'Google Analytics', category: 'analytics', status: 'connected',
    lastSync: '15 minutes ago', syncDirection: 'inbound',
    objects: ['Website traffic', 'Conversions'], icon: '📊', color: '#E37400', dataVolume: 10,
  },
  {
    id: 'mailchimp', name: 'Mailchimp', category: 'marketing', status: 'connected',
    lastSync: '30 minutes ago', syncDirection: 'outbound',
    objects: ['Lists', 'Campaigns', 'Templates'], icon: '🐵', color: '#FFE01B', dataVolume: 5,
  },
];

const DEFAULT_API_KEYS: ApiKeyData[] = [
  { id: 'prod', name: 'Production Key', keyPreview: 'af_live_...c2f9', fullKey: 'af_live_xxxx_xxxx_xxxx_xxxx_c2f9', lastUsed: '2 minutes ago', permissions: 'readwrite', active: true },
  { id: 'dev', name: 'Development Key', keyPreview: 'af_test_...8a3b', fullKey: 'af_test_xxxx_xxxx_xxxx_xxxx_8a3b', lastUsed: '1 hour ago', permissions: 'read', active: true },
];

const DEFAULT_WEBHOOKS: WebhookData[] = [
  { id: 'wh1', name: 'New Lead to Slack', url: 'https://hooks.slack.com/services/T.../B.../xxx', trigger: 'When lead is created', lastFired: '14:32', active: true, successRate: 99.2 },
  { id: 'wh2', name: 'Hot Lead Alert', url: 'https://api.yourapp.com/webhook/hot-lead', trigger: 'When lead score > 85', lastFired: '14:28', active: true, successRate: 97.8 },
  { id: 'wh3', name: 'Daily Summary', url: 'https://api.yourapp.com/webhook/summary', trigger: 'Daily at 18:00 UTC', lastFired: '18:00', active: false, successRate: 100 },
];

const SYNC_STATS = {
  totalRecords: 12842,
  successRate: 99.8,
  avgSyncTime: 2.4,
  failedSyncs: 24,
};

const API_USAGE = {
  requestsToday: 8424,
  avgLatency: 142,
  errorRate: 0.8,
  costToday: 4.28,
  rateLimits: { perMinute: 60, perHour: 1000, perDay: 10000 },
  currentUsagePct: 42,
};

const IntegrationHub: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [categoryFilter, setCategoryFilter] = useState<IntegrationCategory>('all');
  const [integrations, setIntegrations] = useState<Integration[]>(DEFAULT_INTEGRATIONS);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>(DEFAULT_API_KEYS);
  const [webhooks, setWebhooks] = useState<WebhookData[]>(DEFAULT_WEBHOOKS);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);
  const [showSyncLogs, setShowSyncLogs] = useState(false);
  const [showKeyFull, setShowKeyFull] = useState<string | null>(null);
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', trigger: 'When lead is created' });

  // ─── Enhanced Wireframe State ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHealthDashboard, setShowHealthDashboard] = useState(false);
  const [showSyncHistory, setShowSyncHistory] = useState(false);
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);

  // ─── Filtered integrations ───
  const filteredIntegrations = useMemo(() => {
    if (categoryFilter === 'all') return integrations;
    return integrations.filter(i => i.category === categoryFilter);
  }, [integrations, categoryFilter]);

  // ─── Data volume chart ───
  const volumeChartData = useMemo(() =>
    integrations.map(i => ({
      name: i.name,
      volume: i.dataVolume,
      color: i.color,
    })),
  [integrations]);

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const connectedCount = integrations.filter(i => i.status === 'connected').length;
    const activeWebhooks = webhooks.filter(w => w.active).length;
    const avgWebhookSuccess = webhooks.length > 0 ? webhooks.reduce((s, w) => s + w.successRate, 0) / webhooks.length : 0;
    const totalVolume = integrations.reduce((s, i) => s + i.dataVolume, 0);

    return [
      { label: 'Connected', value: `${connectedCount}/${integrations.length}`, icon: <PlugIcon className="w-5 h-5" />, color: 'indigo', trend: `${integrations.filter(i => i.status === 'partial').length} partial`, up: connectedCount > 0 },
      { label: 'Records Synced', value: SYNC_STATS.totalRecords.toLocaleString(), icon: <RefreshIcon className="w-5 h-5" />, color: 'emerald', trend: `${SYNC_STATS.successRate}% success rate`, up: true },
      { label: 'API Requests', value: API_USAGE.requestsToday.toLocaleString(), icon: <GlobeIcon className="w-5 h-5" />, color: 'blue', trend: `${API_USAGE.avgLatency}ms avg latency`, up: true },
      { label: 'Active Webhooks', value: `${activeWebhooks}/${webhooks.length}`, icon: <ZapIcon className="w-5 h-5" />, color: 'amber', trend: `${avgWebhookSuccess.toFixed(1)}% avg success`, up: avgWebhookSuccess >= 95 },
      { label: 'Data Volume', value: `${totalVolume}%`, icon: <DatabaseIcon className="w-5 h-5" />, color: 'violet', trend: `${integrations.length} sources active`, up: true },
      { label: 'API Cost', value: `$${API_USAGE.costToday.toFixed(2)}`, icon: <TargetIcon className="w-5 h-5" />, color: 'fuchsia', trend: `${API_USAGE.currentUsagePct}% of rate limit`, up: API_USAGE.currentUsagePct < 80 },
    ];
  }, [integrations, webhooks]);

  // ─── Integration Health ───
  const integrationHealth = useMemo((): IntegrationHealthMetric[] => {
    return integrations.map(integ => ({
      name: integ.name,
      uptime: integ.status === 'connected' ? 99.0 + Math.random() * 0.99 : integ.status === 'partial' ? 85 + Math.random() * 10 : 0,
      errorRate: integ.status === 'connected' ? Math.random() * 2 : integ.status === 'partial' ? 5 + Math.random() * 10 : 100,
      avgLatency: 50 + Math.floor(Math.random() * 200),
      lastIncident: integ.status === 'connected' ? '14 days ago' : integ.status === 'partial' ? '2 hours ago' : 'Now',
      status: integ.status === 'connected' ? 'healthy' : integ.status === 'partial' ? 'degraded' : 'down',
    }));
  }, [integrations]);

  // ─── Handlers ───
  const handleCopyKey = useCallback((key: ApiKeyData) => {
    navigator.clipboard.writeText(key.fullKey);
    setCopiedKey(key.id);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const handleRegenerateKey = useCallback((keyId: string) => {
    const chars = 'abcdef0123456789';
    const newSuffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setApiKeys(prev => prev.map(k => k.id === keyId ? {
      ...k,
      keyPreview: `${k.keyPreview.split('...')[0]}...${newSuffix}`,
      fullKey: `${k.fullKey.slice(0, -4)}${newSuffix}`,
      lastUsed: 'Just now',
    } : k));
  }, []);

  const handleTestIntegration = useCallback((id: string) => {
    setTestingId(id);
    setTestResult(null);
    setTimeout(() => {
      const success = Math.random() > 0.15;
      setTestResult({ id, success });
      setTestingId(null);
    }, 1500);
  }, []);

  const handleDisconnect = useCallback((id: string) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'disconnected' as IntegrationStatus, lastSync: 'Disconnected' } : i));
  }, []);

  const handleReconnect = useCallback((id: string) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'connected' as IntegrationStatus, lastSync: 'Just now', error: undefined } : i));
  }, []);

  const handleToggleWebhook = useCallback((id: string) => {
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, active: !w.active } : w));
  }, []);

  const handleTestWebhook = useCallback((id: string) => {
    setTestingId(`wh-${id}`);
    setTestResult(null);
    setTimeout(() => {
      setTestResult({ id: `wh-${id}`, success: true });
      setTestingId(null);
    }, 1200);
  }, []);

  const handleAddWebhook = useCallback(() => {
    if (!webhookForm.name || !webhookForm.url) return;
    const newWebhook: WebhookData = {
      id: `wh-${Date.now()}`,
      name: webhookForm.name,
      url: webhookForm.url,
      trigger: webhookForm.trigger,
      lastFired: 'Never',
      active: true,
      successRate: 100,
    };
    setWebhooks(prev => [...prev, newWebhook]);
    setWebhookForm({ name: '', url: '', trigger: 'When lead is created' });
    setShowAddWebhook(false);
  }, [webhookForm]);

  const handleExportConfig = useCallback(() => {
    const config = {
      integrations: integrations.map(i => ({
        name: i.name, category: i.category, status: i.status,
        syncDirection: i.syncDirection, objects: i.objects,
      })),
      webhooks: webhooks.map(w => ({
        name: w.name, url: w.url, trigger: w.trigger, active: w.active,
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: user.name,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `integration_config_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [integrations, webhooks, user.name]);

  const statusColor = (s: IntegrationStatus) =>
    s === 'connected' ? 'emerald' : s === 'partial' ? 'amber' : 'slate';

  const statusDot = (s: IntegrationStatus) =>
    s === 'connected' ? 'bg-emerald-500' : s === 'partial' ? 'bg-amber-500' : 'bg-slate-300';

  const statusLabel = (s: IntegrationStatus) =>
    s === 'connected' ? 'Connected' : s === 'partial' ? 'Partial' : 'Disconnected';

  const syncLabel = (d: SyncDirection) =>
    d === 'bidirectional' ? 'Bi-directional' : d === 'outbound' ? 'AuraFunnel → External' : 'External → AuraFunnel';

  const categories: { key: IntegrationCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'crm', label: 'CRM' },
    { key: 'marketing', label: 'Marketing' },
    { key: 'comms', label: 'Comms' },
    { key: 'analytics', label: 'Analytics' },
  ];

  // ─── Keyboard Shortcuts ───
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHealthDashboard(s => !s); return; }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); setShowSyncHistory(s => !s); return; }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setShowSecurityPanel(s => !s); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowAddIntegration(s => !s); return; }
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); setShowAddWebhook(s => !s); return; }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setShowSyncLogs(s => !s); return; }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleExportConfig(); return; }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowHealthDashboard(false);
        setShowSyncHistory(false);
        setShowSecurityPanel(false);
        setShowAddIntegration(false);
        setShowAddWebhook(false);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
            <PlugIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
              Integration Hub
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Connected systems, APIs &amp; webhooks &middot; {integrations.filter(i => i.status === 'connected').length} active
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowHealthDashboard(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showHealthDashboard ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <ActivityIcon className="w-3.5 h-3.5" />
            <span>Health</span>
          </button>
          <button
            onClick={() => setShowSyncHistory(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showSyncHistory ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <ClockIcon className="w-3.5 h-3.5" />
            <span>Sync History</span>
          </button>
          <button
            onClick={() => setShowSecurityPanel(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showSecurityPanel ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Security</span>
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            <span>Shortcuts</span>
          </button>
          <button
            onClick={() => setShowAddIntegration(!showAddIntegration)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add New</span>
          </button>
        </div>
      </div>

      {/* Add Integration Quick Panel */}
      {showAddIntegration && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-4">Available Integrations</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: 'Zapier', desc: 'Connect 5000+ apps', icon: '⚡' },
              { name: 'Stripe', desc: 'Payment processing', icon: '💳' },
              { name: 'Twilio', desc: 'SMS & voice', icon: '📱' },
              { name: 'SendGrid', desc: 'Email delivery', icon: '📧' },
              { name: 'Intercom', desc: 'Live chat', icon: '💬' },
              { name: 'Segment', desc: 'Data pipeline', icon: '📡' },
              { name: 'Mixpanel', desc: 'Product analytics', icon: '📈' },
              { name: 'Airtable', desc: 'Database & views', icon: '📋' },
            ].map(a => (
              <button
                key={a.name}
                className="flex items-center space-x-3 p-3 rounded-xl border-2 border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left"
              >
                <span className="text-xl">{a.icon}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{a.name}</p>
                  <p className="text-[10px] text-slate-400">{a.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KPI STATS BANNER                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                {stat.icon}
              </div>
              {stat.up !== null && (
                stat.up ? <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" /> : <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />
              )}
            </div>
            <p className="text-xl font-black text-slate-900">{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
            <p className="text-[10px] text-slate-400 mt-1 truncate">{stat.trend}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN 3-COLUMN LAYOUT                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col xl:flex-row gap-5">

        {/* ─── LEFT: Active Integrations (35%) ─── */}
        <div className="xl:w-[35%] space-y-5">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                  <PlugIcon className="w-4 h-4 text-violet-600" />
                  <span>Active Integrations</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-400">{filteredIntegrations.length} shown</span>
              </div>

              {/* Category Filter */}
              <div className="flex items-center space-x-1.5">
                {categories.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setCategoryFilter(c.key)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      categoryFilter === c.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Integration Cards */}
            <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
              {filteredIntegrations.map(integ => (
                <div key={integ.id} className="p-5 hover:bg-slate-50/30 transition-colors">
                  <div className="flex items-start space-x-3">
                    <span className="text-xl mt-0.5">{integ.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1.5">
                        <h4 className="font-bold text-sm text-slate-800">{integ.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-${statusColor(integ.status)}-50 text-${statusColor(integ.status)}-700`}>
                          {integ.category}
                        </span>
                      </div>

                      <div className="space-y-1 mb-3">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${statusDot(integ.status)} ${integ.status === 'connected' ? 'animate-pulse' : ''}`}></span>
                          <span className="text-xs text-slate-500">Status: <span className="font-semibold">{statusLabel(integ.status)}</span></span>
                        </div>
                        <p className="text-xs text-slate-400 flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>Last sync: {integ.lastSync}</span>
                        </p>
                        <p className="text-xs text-slate-400 flex items-center space-x-1">
                          <LinkIcon className="w-3 h-3" />
                          <span>Sync: {syncLabel(integ.syncDirection)}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          Objects: <span className="font-semibold text-slate-600">{integ.objects.join(', ')}</span>
                        </p>
                        {integ.error && (
                          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-amber-50 rounded-lg mt-1">
                            <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="text-[11px] text-amber-700 font-semibold">{integ.error}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-1.5">
                        {integ.status === 'connected' && (
                          <>
                            <button className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition-all">
                              Configure
                            </button>
                            <button
                              onClick={() => handleTestIntegration(integ.id)}
                              disabled={testingId === integ.id}
                              className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all disabled:opacity-50"
                            >
                              {testingId === integ.id ? 'Testing...' : 'Test'}
                            </button>
                            <button
                              onClick={() => handleDisconnect(integ.id)}
                              className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all"
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                        {integ.status === 'partial' && (
                          <>
                            <button
                              onClick={() => handleReconnect(integ.id)}
                              className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-100 transition-all"
                            >
                              Fix Issue
                            </button>
                            <button
                              onClick={() => handleReconnect(integ.id)}
                              className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all"
                            >
                              Reconnect
                            </button>
                          </>
                        )}
                        {integ.status === 'disconnected' && (
                          <button
                            onClick={() => handleReconnect(integ.id)}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-all"
                          >
                            Reconnect
                          </button>
                        )}
                      </div>

                      {/* Test result toast */}
                      {testResult?.id === integ.id && (
                        <div className={`mt-2 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                          testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {testResult.success ? <CheckIcon className="w-3.5 h-3.5" /> : <XIcon className="w-3.5 h-3.5" />}
                          <span>{testResult.success ? 'Connection test passed' : 'Connection test failed'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── CENTER: Integration Analytics (35%) ─── */}
        <div className="xl:w-[35%] space-y-5">

          {/* Data Flow Overview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2 mb-4">
              <ActivityIcon className="w-4 h-4 text-indigo-600" />
              <span>Data Flow Overview</span>
            </h3>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex flex-col items-center space-y-2">
                {/* Row 1: AuraFunnel Core */}
                <div className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md">
                  AuraFunnel Core
                </div>
                <div className="flex items-center space-x-1 text-slate-300">
                  <span>↓</span><span>↓</span><span>↓</span><span>↓</span>
                </div>
                {/* Row 2: Connectors */}
                <div className="flex items-center space-x-2">
                  {integrations.filter(i => i.status !== 'disconnected').map(i => (
                    <div key={i.id} className="flex flex-col items-center space-y-1">
                      <div className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border-2 ${
                        i.status === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}>
                        {i.name}
                      </div>
                      <span className="text-slate-300 text-xs">↓</span>
                      <span className="text-[9px] text-slate-400 font-semibold">{i.objects[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sync Statistics */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2 mb-4">
              <RefreshIcon className="w-4 h-4 text-emerald-600" />
              <span>Sync Statistics</span>
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">Last 24h</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: 'Total Records Synced', value: SYNC_STATS.totalRecords.toLocaleString(), color: 'indigo' },
                { label: 'Sync Success Rate', value: `${SYNC_STATS.successRate}%`, color: 'emerald' },
                { label: 'Avg Sync Time', value: `${SYNC_STATS.avgSyncTime}s`, color: 'violet' },
                { label: 'Failed Syncs', value: `${SYNC_STATS.failedSyncs} (0.2%)`, color: 'rose' },
              ].map(s => (
                <div key={s.label} className="p-3 rounded-xl bg-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
                  <p className={`text-lg font-black text-${s.color}-600 mt-0.5`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Data Volume Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 text-sm font-heading mb-3">Data Volume by Integration</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={volumeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 50]} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" width={100} />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                  formatter={(value: number) => [`${value}%`, 'Volume']}
                />
                <Bar dataKey="volume" radius={[0, 6, 6, 0]} barSize={20}>
                  {volumeChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sync Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSyncLogs(!showSyncLogs)}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              <span>{showSyncLogs ? 'Hide' : 'View'} Sync Logs</span>
            </button>
            <button className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <ChartIcon className="w-3.5 h-3.5" />
              <span>Performance Report</span>
            </button>
          </div>

          {/* Sync Logs */}
          {showSyncLogs && (
            <div className="bg-slate-900 rounded-2xl p-4 max-h-48 overflow-y-auto">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Recent Sync Logs</p>
              <div className="font-mono text-[11px] text-slate-400 space-y-0.5">
                {[
                  { time: '14:32:05', msg: 'Salesforce → AuraFunnel: 12 contacts synced', ok: true },
                  { time: '14:31:48', msg: 'AuraFunnel → HubSpot: Campaign update sent', ok: true },
                  { time: '14:30:22', msg: 'Slack notification sent to #sales-alerts', ok: true },
                  { time: '14:28:15', msg: 'Slack: Channel #leads-archive not found', ok: false },
                  { time: '14:25:40', msg: 'Google Analytics: Traffic data imported', ok: true },
                  { time: '14:22:10', msg: 'Salesforce → AuraFunnel: 8 leads synced', ok: true },
                  { time: '14:18:33', msg: 'AuraFunnel → Mailchimp: List updated (42 contacts)', ok: true },
                  { time: '14:15:01', msg: 'Webhook: Hot Lead Alert fired successfully', ok: true },
                ].map((log, i) => (
                  <p key={i}>
                    <span className="text-slate-600">[{log.time}]</span>{' '}
                    <span className={log.ok ? 'text-emerald-400' : 'text-rose-400'}>
                      {log.ok ? '✓' : '✗'}
                    </span>{' '}
                    <span className="text-slate-300">{log.msg}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: API Management (30%) ─── */}
        <div className="xl:w-[30%] space-y-5">

          {/* API Keys */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                <KeyIcon className="w-4 h-4 text-amber-600" />
                <span>API Keys</span>
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {apiKeys.map(key => (
                <div key={key.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{key.name}</p>
                      <p className="text-[10px] text-slate-400">Last used: {key.lastUsed}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      key.permissions === 'readwrite' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600'
                    }`}>
                      {key.permissions === 'readwrite' ? 'Read/Write' : 'Read Only'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 mb-3">
                    <div className="flex-1 px-3 py-2 bg-slate-50 rounded-lg font-mono text-xs text-slate-600 truncate">
                      {showKeyFull === key.id ? key.fullKey : key.keyPreview}
                    </div>
                    <button
                      onClick={() => setShowKeyFull(showKeyFull === key.id ? null : key.id)}
                      className="p-1.5 bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleCopyKey(key)}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        copiedKey === key.id
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {copiedKey === key.id ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
                      <span>{copiedKey === key.id ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleRegenerateKey(key.id)}
                      className="flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-100 transition-all"
                    >
                      <RefreshIcon className="w-3 h-3" />
                      <span>Regenerate</span>
                    </button>
                    <button className="flex items-center space-x-1 px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition-all">
                      <LockIcon className="w-3 h-3" />
                      <span>Permissions</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* API Usage */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">API Usage</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Requests Today', value: API_USAGE.requestsToday.toLocaleString(), color: 'indigo' },
                { label: 'Average Latency', value: `${API_USAGE.avgLatency}ms`, color: 'violet' },
                { label: 'Error Rate', value: `${API_USAGE.errorRate}%`, color: 'rose' },
                { label: 'Cost Today', value: `$${API_USAGE.costToday.toFixed(2)}`, color: 'amber' },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                  <span className="text-xs font-semibold text-slate-600">{m.label}</span>
                  <span className={`text-xs font-black text-${m.color}-600`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rate Limits */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Rate Limits</h3>
            <div className="space-y-2.5 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Per Minute</span>
                <span className="font-bold text-slate-700">{API_USAGE.rateLimits.perMinute} requests</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Per Hour</span>
                <span className="font-bold text-slate-700">{API_USAGE.rateLimits.perHour.toLocaleString()} requests</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Per Day</span>
                <span className="font-bold text-slate-700">{API_USAGE.rateLimits.perDay.toLocaleString()} requests</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Current Usage</span>
                <span className="text-xs font-black text-indigo-600">{API_USAGE.currentUsagePct}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${API_USAGE.currentUsagePct}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* API Actions */}
          <div className="flex items-center space-x-2">
            <button className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <GlobeIcon className="w-3.5 h-3.5" />
              <span>API Docs</span>
            </button>
            <button className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <BellIcon className="w-3.5 h-3.5" />
              <span>Set Alerts</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WEBHOOK CONFIGURATION                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
              <ZapIcon className="w-5 h-5 text-amber-600" />
              <span>Webhook Configuration</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {webhooks.filter(w => w.active).length} active webhooks &middot; {webhooks.length} total
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddWebhook(!showAddWebhook)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Create Webhook</span>
            </button>
            <button
              onClick={handleExportConfig}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              <span>Export Config</span>
            </button>
          </div>
        </div>

        {/* Add Webhook Form */}
        {showAddWebhook && (
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Name</label>
                <input
                  type="text"
                  value={webhookForm.name}
                  onChange={e => setWebhookForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Lead Created Alert"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Webhook URL</label>
                <input
                  type="url"
                  value={webhookForm.url}
                  onChange={e => setWebhookForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Trigger</label>
                <select
                  value={webhookForm.trigger}
                  onChange={e => setWebhookForm(prev => ({ ...prev, trigger: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option>When lead is created</option>
                  <option>When lead score changes</option>
                  <option>When lead score &gt; 85</option>
                  <option>When content is generated</option>
                  <option>Daily at 18:00 UTC</option>
                </select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleAddWebhook}
                disabled={!webhookForm.name || !webhookForm.url}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                Add Webhook
              </button>
              <button
                onClick={() => setShowAddWebhook(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Webhook List */}
        <div className="divide-y divide-slate-50">
          {webhooks.map(wh => (
            <div key={wh.id} className={`px-6 py-4 transition-colors ${wh.active ? 'hover:bg-slate-50/30' : 'bg-slate-50/50 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="font-bold text-sm text-slate-800">{wh.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      wh.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {wh.active ? 'Active' : 'Disabled'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{wh.successRate}% success</span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono truncate mb-0.5">URL: {wh.url}</p>
                  <p className="text-xs text-slate-500">Trigger: <span className="font-semibold">{wh.trigger}</span></p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Last fired: {wh.lastFired}</p>
                </div>

                <div className="flex items-center space-x-1.5 ml-4 shrink-0">
                  <button className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition-all">
                    Edit
                  </button>
                  <button
                    onClick={() => handleTestWebhook(wh.id)}
                    disabled={testingId === `wh-${wh.id}` || !wh.active}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all disabled:opacity-50"
                  >
                    {testingId === `wh-${wh.id}` ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    onClick={() => handleToggleWebhook(wh.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      wh.active
                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {wh.active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {/* Webhook test result */}
              {testResult?.id === `wh-${wh.id}` && (
                <div className="mt-2 flex items-center space-x-1.5 px-2.5 py-1.5 bg-emerald-50 rounded-lg text-[11px] font-bold text-emerald-700">
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>Webhook test fired successfully</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* INTEGRATION HEALTH DASHBOARD SIDEBAR                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showHealthDashboard && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowHealthDashboard(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Integration Health</h3>
                <p className="text-xs text-slate-400 mt-0.5">Real-time uptime and performance monitoring</p>
              </div>
              <button onClick={() => setShowHealthDashboard(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {/* Overall Health */}
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                <p className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2">System Health</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-2xl font-black text-emerald-900">
                      {integrationHealth.filter(h => h.status === 'healthy').length}/{integrationHealth.length}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-bold">Healthy</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-700">
                      {integrationHealth.length > 0 ? (integrationHealth.reduce((s, h) => s + h.uptime, 0) / integrationHealth.length).toFixed(1) : 0}%
                    </p>
                    <p className="text-[10px] text-emerald-600 font-bold">Avg Uptime</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-700">
                      {integrationHealth.length > 0 ? Math.round(integrationHealth.reduce((s, h) => s + h.avgLatency, 0) / integrationHealth.length) : 0}ms
                    </p>
                    <p className="text-[10px] text-emerald-600 font-bold">Avg Latency</p>
                  </div>
                </div>
              </div>

              {/* Per-Integration Health Cards */}
              {integrationHealth.map((health, i) => {
                const statusStyles = {
                  healthy: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Healthy' },
                  degraded: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Degraded' },
                  down: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Down' },
                }[health.status];
                return (
                  <div key={i} className="p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-slate-800">{health.name}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusStyles.bg} ${statusStyles.text}`}>
                        {statusStyles.label}
                      </span>
                    </div>

                    {/* Uptime Bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-slate-500">Uptime</span>
                        <span className={`font-black ${health.uptime >= 99 ? 'text-emerald-600' : health.uptime >= 90 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {health.uptime.toFixed(2)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div
                          className={`h-full rounded-full ${health.uptime >= 99 ? 'bg-emerald-500' : health.uptime >= 90 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(health.uptime, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className={`text-xs font-bold ${health.errorRate < 2 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {health.errorRate.toFixed(1)}%
                        </p>
                        <p className="text-[9px] text-slate-400">Error Rate</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">{health.avgLatency}ms</p>
                        <p className="text-[9px] text-slate-400">Avg Latency</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">{health.lastIncident}</p>
                        <p className="text-[9px] text-slate-400">Last Incident</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SYNC HISTORY SIDEBAR                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showSyncHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSyncHistory(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Sync History</h3>
                <p className="text-xs text-slate-400 mt-0.5">Recent data synchronization events</p>
              </div>
              <button onClick={() => setShowSyncHistory(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: 'Total', value: MOCK_SYNC_HISTORY.length, color: 'slate' },
                  { label: 'Success', value: MOCK_SYNC_HISTORY.filter(e => e.status === 'success').length, color: 'emerald' },
                  { label: 'Failed', value: MOCK_SYNC_HISTORY.filter(e => e.status === 'failed').length, color: 'rose' },
                  { label: 'Records', value: MOCK_SYNC_HISTORY.reduce((s, e) => s + e.records, 0).toLocaleString(), color: 'indigo' },
                ].map((s, i) => (
                  <div key={i} className={`p-2.5 bg-${s.color}-50 rounded-xl text-center`}>
                    <p className={`text-lg font-black text-${s.color}-700`}>{s.value}</p>
                    <p className={`text-[9px] font-bold text-${s.color}-500 uppercase`}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Sync Entries */}
              {MOCK_SYNC_HISTORY.map(entry => {
                const style = SYNC_STATUS_STYLES[entry.status];
                const ago = Math.round((Date.now() - new Date(entry.timestamp).getTime()) / 60000);
                const agoText = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                return (
                  <div key={entry.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white transition-all">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{agoText}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{entry.duration}s</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{entry.integration}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-500">
                        <span className={`font-semibold ${entry.direction === 'Inbound' ? 'text-blue-600' : 'text-violet-600'}`}>
                          {entry.direction}
                        </span>
                        {' '}&middot; {entry.records.toLocaleString()} records
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SECURITY & COMPLIANCE PANEL                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showSecurityPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSecurityPanel(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Security & Compliance</h3>
                <p className="text-xs text-slate-400 mt-0.5">Data security audit and compliance status</p>
              </div>
              <button onClick={() => setShowSecurityPanel(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Security Score */}
              <div className="flex flex-col items-center p-5 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-100">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke="#6366f1"
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(SECURITY_CHECKS.filter(c => c.status === 'pass').length / SECURITY_CHECKS.length) * 327} 327`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-indigo-700">
                      {Math.round((SECURITY_CHECKS.filter(c => c.status === 'pass').length / SECURITY_CHECKS.length) * 100)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">/ 100</span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-black text-indigo-700">Security Score</p>
                <p className="text-[10px] text-indigo-500">
                  {SECURITY_CHECKS.filter(c => c.status === 'pass').length}/{SECURITY_CHECKS.length} checks passed
                </p>
              </div>

              {/* Security Checks */}
              <div className="space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Security Checklist</p>
                {SECURITY_CHECKS.map((check, i) => (
                  <div key={i} className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-slate-100">
                    {check.status === 'pass' ? (
                      <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-700">{check.label}</p>
                      <p className="text-[10px] text-slate-400">{check.detail}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      check.status === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {check.status === 'pass' ? 'Pass' : 'Action Needed'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Compliance Badges */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Compliance Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'SOC 2 Type II', status: 'Compliant' },
                    { name: 'GDPR', status: 'Compliant' },
                    { name: 'CCPA', status: 'Compliant' },
                    { name: 'HIPAA', status: 'N/A' },
                  ].map((badge, i) => (
                    <div key={i} className="flex items-center space-x-2 p-2.5 bg-white rounded-lg border border-slate-100">
                      <ShieldIcon className={`w-3.5 h-3.5 ${badge.status === 'Compliant' ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="text-[10px] font-bold text-slate-700">{badge.name}</p>
                        <p className={`text-[9px] font-bold ${badge.status === 'Compliant' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {badge.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {SECURITY_CHECKS.some(c => c.status === 'warn') && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <div className="flex items-center space-x-2 mb-2">
                    <SparklesIcon className="w-4 h-4 text-amber-600" />
                    <p className="text-xs font-black text-amber-700 uppercase tracking-wider">Recommendations</p>
                  </div>
                  <div className="space-y-1.5">
                    {SECURITY_CHECKS.filter(c => c.status === 'warn').map((c, i) => (
                      <div key={i} className="flex items-start space-x-2">
                        <ArrowRightIcon className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700">
                          {c.label}: {c.detail}. Configure this for enhanced security.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS MODAL                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {[
                { key: 'N', label: 'Toggle add integration panel' },
                { key: 'W', label: 'Toggle add webhook form' },
                { key: 'H', label: 'Toggle health dashboard' },
                { key: 'S', label: 'Toggle sync history' },
                { key: 'C', label: 'Toggle security panel' },
                { key: 'L', label: 'Toggle sync logs' },
                { key: 'E', label: 'Export configuration' },
                { key: '?', label: 'Toggle this shortcuts panel' },
                { key: 'Esc', label: 'Close all panels' },
              ].map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <span className="text-sm text-slate-600">{shortcut.label}</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-500">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationHub;
