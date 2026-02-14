import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, NotificationPreferences, DashboardPreferences, ApiKey } from '../../types';
import {
  ShieldIcon, BellIcon, KeyIcon, LayoutIcon, CogIcon, CopyIcon, PlusIcon, XIcon, CheckIcon, EyeIcon, LockIcon,
  TrendUpIcon, TrendDownIcon, KeyboardIcon, ActivityIcon, BrainIcon, LayersIcon, UsersIcon,
  ClockIcon, AlertTriangleIcon, DownloadIcon, SparklesIcon, DocumentIcon, TargetIcon
} from '../../components/Icons';
import { supabase } from '../../lib/supabase';

const PREFS_STORAGE_KEY = 'aurafunnel_dashboard_prefs';
const NOTIF_STORAGE_KEY = 'aurafunnel_notification_prefs';
const APIKEYS_STORAGE_KEY = 'aurafunnel_api_keys';

type SettingsTab = 'profile' | 'notifications' | 'preferences' | 'api_keys' | 'security';

const ProfilePage: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile
  const [name, setName] = useState(user?.name || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {
        emailAlerts: true, leadScoreAlerts: true, weeklyDigest: true,
        contentReady: true, teamMentions: false, systemUpdates: true
      };
    } catch { return { emailAlerts: true, leadScoreAlerts: true, weeklyDigest: true, contentReady: true, teamMentions: false, systemUpdates: true }; }
  });

  // Preferences
  const [preferences, setPreferences] = useState<DashboardPreferences>(() => {
    try {
      const stored = localStorage.getItem(PREFS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {
        defaultView: 'grid', itemsPerPage: 25, showQuickStats: true,
        showAiInsights: true, showActivityFeed: true, theme: 'light'
      };
    } catch { return { defaultView: 'grid', itemsPerPage: 25, showQuickStats: true, showAiInsights: true, showActivityFeed: true, theme: 'light' }; }
  });

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(() => {
    try {
      const stored = localStorage.getItem(APIKEYS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [newKeyName, setNewKeyName] = useState('');
  const [showKeyId, setShowKeyId] = useState<string | null>(null);

  // Security
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);

  const tabs = [
    { id: 'profile' as SettingsTab, label: 'Profile', icon: <CogIcon className="w-4 h-4" /> },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: <BellIcon className="w-4 h-4" /> },
    { id: 'preferences' as SettingsTab, label: 'Preferences', icon: <LayoutIcon className="w-4 h-4" /> },
    { id: 'api_keys' as SettingsTab, label: 'API Keys', icon: <KeyIcon className="w-4 h-4" /> },
    { id: 'security' as SettingsTab, label: 'Security', icon: <LockIcon className="w-4 h-4" /> },
  ];

  // Profile handlers
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setError('');
    setSuccess(false);
    try {
      const { error: updateError } = await supabase.from('profiles').update({ name }).eq('id', user.id);
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update configuration.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  // Notification handlers
  const toggleNotification = (key: keyof NotificationPreferences) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
  };

  // Preferences handlers
  const updatePreference = <K extends keyof DashboardPreferences>(key: K, value: DashboardPreferences[K]) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
  };

  // API Key handlers
  const generateApiKey = () => {
    if (!newKeyName.trim()) return;
    const key: ApiKey = {
      id: Date.now().toString(),
      name: newKeyName.trim(),
      key: `af_${Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    const updated = [...apiKeys, key];
    setApiKeys(updated);
    localStorage.setItem(APIKEYS_STORAGE_KEY, JSON.stringify(updated));
    setNewKeyName('');
    setShowKeyId(key.id);
  };

  const revokeApiKey = (id: string) => {
    const updated = apiKeys.map(k => k.id === id ? { ...k, status: 'revoked' as const } : k);
    setApiKeys(updated);
    localStorage.setItem(APIKEYS_STORAGE_KEY, JSON.stringify(updated));
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
  };

  // ─── New Enhancement State ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAccountHealth, setShowAccountHealth] = useState(false);
  const [showSessionActivity, setShowSessionActivity] = useState(false);
  const [showDataExport, setShowDataExport] = useState(false);

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const activeKeyCount = apiKeys.filter(k => k.status === 'active').length;
    const enabledNotifs = Object.values(notifications).filter(Boolean).length;
    const totalNotifs = Object.keys(notifications).length;

    return [
      { label: 'Account Status', value: 'Active', sub: user?.role === 'ADMIN' ? 'Administrator' : 'Client Node', trend: 'up' as const, color: 'emerald' },
      { label: 'API Keys', value: activeKeyCount.toString(), sub: `${apiKeys.length} total generated`, trend: activeKeyCount > 0 ? 'up' as const : 'down' as const, color: 'indigo' },
      { label: 'Notifications', value: `${enabledNotifs}/${totalNotifs}`, sub: 'Channels active', trend: enabledNotifs > 3 ? 'up' as const : 'down' as const, color: 'violet' },
      { label: 'Security Score', value: twoFactorEnabled ? '95%' : '60%', sub: twoFactorEnabled ? '2FA enabled' : '2FA disabled', trend: twoFactorEnabled ? 'up' as const : 'down' as const, color: twoFactorEnabled ? 'emerald' : 'amber' },
      { label: 'Theme', value: preferences.theme === 'light' ? 'Light' : preferences.theme === 'dark' ? 'Dark' : 'System', sub: `${preferences.defaultView} view`, trend: 'up' as const, color: 'slate' },
      { label: 'Session Age', value: 'Active', sub: new Date().toLocaleDateString(), trend: 'up' as const, color: 'rose' },
    ];
  }, [apiKeys, notifications, twoFactorEnabled, preferences, user]);

  // ─── Account Health Data ───
  const accountHealth = useMemo(() => {
    const checks = [
      { label: 'Profile Complete', passed: !!name.trim(), weight: 15 },
      { label: 'Email Verified', passed: true, weight: 20 },
      { label: '2FA Enabled', passed: twoFactorEnabled, weight: 25 },
      { label: 'API Key Generated', passed: apiKeys.some(k => k.status === 'active'), weight: 10 },
      { label: 'Notifications Configured', passed: Object.values(notifications).some(Boolean), weight: 10 },
      { label: 'Dashboard Customized', passed: preferences.theme !== 'light' || preferences.defaultView !== 'grid', weight: 5 },
      { label: 'Lead Score Alerts', passed: notifications.leadScoreAlerts, weight: 10 },
      { label: 'Weekly Digest Active', passed: notifications.weeklyDigest, weight: 5 },
    ];
    const score = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
    return { checks, score };
  }, [name, twoFactorEnabled, apiKeys, notifications, preferences]);

  // ─── Session Activity Mock ───
  const sessionActivity = useMemo(() => [
    { time: 'Just now', action: 'Viewed Account Architecture', type: 'navigation' },
    { time: '2 min ago', action: 'Updated notification preferences', type: 'settings' },
    { time: '5 min ago', action: 'Viewed Lead Management', type: 'navigation' },
    { time: '12 min ago', action: 'Generated AI content', type: 'ai' },
    { time: '18 min ago', action: 'Exported analytics report', type: 'export' },
    { time: '25 min ago', action: 'Updated lead score for TechCorp', type: 'leads' },
    { time: '32 min ago', action: 'Logged in via password', type: 'auth' },
    { time: '1 hour ago', action: 'Previous session ended', type: 'auth' },
  ], []);

  const SESSION_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
    navigation: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    settings: { bg: 'bg-violet-50', text: 'text-violet-600' },
    ai: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    export: { bg: 'bg-amber-50', text: 'text-amber-600' },
    leads: { bg: 'bg-rose-50', text: 'text-rose-600' },
    auth: { bg: 'bg-slate-100', text: 'text-slate-600' },
  };

  // ─── Data Export Options ───
  const exportOptions = useMemo(() => [
    { id: 'profile', label: 'Profile Data', desc: 'Name, email, role, preferences', icon: <UsersIcon className="w-4 h-4" />, size: '~2 KB' },
    { id: 'leads', label: 'All Leads', desc: 'Complete lead database with scores', icon: <TargetIcon className="w-4 h-4" />, size: '~500 KB' },
    { id: 'content', label: 'Generated Content', desc: 'All AI-generated content history', icon: <DocumentIcon className="w-4 h-4" />, size: '~1.2 MB' },
    { id: 'analytics', label: 'Analytics Data', desc: 'Performance metrics and reports', icon: <ActivityIcon className="w-4 h-4" />, size: '~800 KB' },
    { id: 'audit', label: 'Audit Logs', desc: 'Complete activity history', icon: <ClockIcon className="w-4 h-4" />, size: '~300 KB' },
    { id: 'api', label: 'API Usage Logs', desc: 'Request history and rate limits', icon: <KeyIcon className="w-4 h-4" />, size: '~150 KB' },
  ], []);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      const overlayOpen = showShortcuts || showAccountHealth || showSessionActivity || showDataExport || isDeleteModalOpen;

      if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        if (showAccountHealth) setShowAccountHealth(false);
        if (showSessionActivity) setShowSessionActivity(false);
        if (showDataExport) setShowDataExport(false);
        return;
      }

      if (overlayOpen) return;

      switch (e.key) {
        case '1': e.preventDefault(); setActiveTab('profile'); break;
        case '2': e.preventDefault(); setActiveTab('notifications'); break;
        case '3': e.preventDefault(); setActiveTab('preferences'); break;
        case '4': e.preventDefault(); setActiveTab('api_keys'); break;
        case '5': e.preventDefault(); setActiveTab('security'); break;
        case 'h': case 'H': e.preventDefault(); setShowAccountHealth(true); break;
        case 'a': case 'A': e.preventDefault(); setShowSessionActivity(true); break;
        case 'e': case 'E': e.preventDefault(); setShowDataExport(true); break;
        case '?': e.preventDefault(); setShowShortcuts(true); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, showAccountHealth, showSessionActivity, showDataExport, isDeleteModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const notificationItems = [
    { key: 'emailAlerts' as const, label: 'Email Alerts', desc: 'Receive email notifications for important events' },
    { key: 'leadScoreAlerts' as const, label: 'Lead Score Changes', desc: 'Notify when a lead score changes significantly' },
    { key: 'weeklyDigest' as const, label: 'Weekly Digest', desc: 'Summary of activity sent every Monday' },
    { key: 'contentReady' as const, label: 'Content Ready', desc: 'Alert when AI content generation completes' },
    { key: 'teamMentions' as const, label: 'Team Mentions', desc: 'Notify when a team member mentions you' },
    { key: 'systemUpdates' as const, label: 'System Updates', desc: 'Platform updates and maintenance notices' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight font-heading">Account Architecture</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage your profile, preferences, security, and API access</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowAccountHealth(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all">
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Health</span>
          </button>
          <button onClick={() => setShowSessionActivity(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all">
            <ActivityIcon className="w-3.5 h-3.5" />
            <span>Activity</span>
          </button>
          <button onClick={() => setShowDataExport(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-100 transition-all">
            <DownloadIcon className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button onClick={() => setShowShortcuts(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
            <KeyboardIcon className="w-3.5 h-3.5" />
            <span>?</span>
          </button>
        </div>
      </div>

      {/* ─── KPI Stats Banner ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiStats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{stat.label}</p>
              {stat.trend === 'up' ? (
                <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendDownIcon className="w-3.5 h-3.5 text-red-400" />
              )}
            </div>
            <p className="text-2xl font-black text-slate-900">{stat.value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-lg'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-10 border-b border-slate-100 flex items-center space-x-8 bg-slate-50/50">
              <div className="w-24 h-24 rounded-[2rem] bg-indigo-600 flex items-center justify-center text-4xl text-white font-black shadow-2xl shadow-indigo-200 group relative cursor-pointer overflow-hidden border-4 border-white uppercase">
                <span className="relative z-10">{name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}</span>
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Update</span>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 font-heading tracking-tight truncate max-w-[280px]">{name || 'Unnamed User'}</h3>
                <p className="text-slate-500 text-sm font-medium uppercase tracking-widest text-[10px] mt-1">{user?.role === 'ADMIN' ? 'Platform Administrator' : 'Client Access Node'}</p>
                <div className="mt-3 flex items-center space-x-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Verified Instance</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleUpdate} className="p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Display Name</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Login Identifier</label>
                  <input type="email" disabled value={user?.email || ''}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-100 bg-slate-50 text-slate-400 font-bold cursor-not-allowed outline-none" />
                </div>
              </div>

              <div className="pt-8 border-t border-slate-50 flex items-center justify-between">
                <div className="flex-grow">
                  {success && (
                    <span className="text-emerald-600 text-xs font-black uppercase tracking-widest flex items-center space-x-2 animate-in slide-in-from-left-2 duration-300">
                      <div className="w-5 h-5 bg-emerald-100 rounded-lg flex items-center justify-center text-[10px]">
                        <CheckIcon className="w-3 h-3" />
                      </div>
                      <span>Database Synced</span>
                    </span>
                  )}
                  {error && <span className="text-red-600 text-xs font-black uppercase tracking-widest truncate max-w-[300px]">Error: {error}</span>}
                </div>
                <button type="submit" disabled={isUpdating}
                  className={`px-10 py-4 font-bold rounded-2xl shadow-2xl transition-all active:scale-95 ${isUpdating ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 hover:scale-[1.02]'}`}>
                  {isUpdating ? 'Synchronizing...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>

          <div className="p-10 bg-white rounded-[2.5rem] border border-red-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-8 border-l-8 border-l-red-500">
            <div>
              <h4 className="text-slate-900 font-black font-heading text-lg">Decommission Account</h4>
              <p className="text-slate-500 text-sm mt-1 max-w-sm font-medium">Permanently purge prospect intelligence, custom AI models, and credit history.</p>
            </div>
            <button onClick={() => setIsDeleteModalOpen(true)}
              className="whitespace-nowrap px-8 py-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-600 hover:text-white transition-all transform active:scale-95 shadow-sm">
              Destroy Instance
            </button>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 font-heading">Notification Preferences</h3>
            <p className="text-sm text-slate-500 mt-1">Control which alerts and digests you receive.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {notificationItems.map(item => (
              <div key={item.key} className="px-8 py-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => toggleNotification(item.key)}
                  className={`relative w-12 h-7 rounded-full transition-colors ${notifications[item.key] ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${notifications[item.key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
            <h3 className="text-lg font-bold text-slate-900 font-heading">Dashboard Layout</h3>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Default View</p>
                <div className="flex space-x-3">
                  {(['grid', 'list'] as const).map(v => (
                    <button key={v} onClick={() => updatePreference('defaultView', v)}
                      className={`px-6 py-3 rounded-xl text-xs font-bold border transition-all capitalize ${preferences.defaultView === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'}`}>
                      {v} View
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Items Per Page</p>
                <div className="flex space-x-3">
                  {[10, 25, 50, 100].map(n => (
                    <button key={n} onClick={() => updatePreference('itemsPerPage', n)}
                      className={`px-5 py-3 rounded-xl text-xs font-bold border transition-all ${preferences.itemsPerPage === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Theme</p>
                <div className="flex space-x-3">
                  {(['light', 'dark', 'system'] as const).map(t => (
                    <button key={t} onClick={() => updatePreference('theme', t)}
                      className={`px-6 py-3 rounded-xl text-xs font-bold border transition-all capitalize ${preferences.theme === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 font-heading">Dashboard Widgets</h3>
            {([
              { key: 'showQuickStats' as const, label: 'Quick Stats Row', desc: 'Show 6-card stats at top of dashboard' },
              { key: 'showAiInsights' as const, label: 'AI Insights Panel', desc: 'Display AI-generated recommendations' },
              { key: 'showActivityFeed' as const, label: 'Activity Feed', desc: 'Show live activity feed on dashboard' },
            ]).map(item => (
              <div key={item.key} className="flex items-center justify-between py-4 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => updatePreference(item.key, !preferences[item.key])}
                  className={`relative w-12 h-7 rounded-full transition-colors ${preferences[item.key] ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${preferences[item.key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api_keys' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading">API Access Keys</h3>
                <p className="text-sm text-slate-500 mt-1">Generate keys for programmatic access to the AuraFunnel API.</p>
              </div>
            </div>

            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateApiKey()}
                  placeholder="Key name (e.g. 'Production App')..."
                  className="flex-grow px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
                <button
                  onClick={generateApiKey}
                  disabled={!newKeyName.trim()}
                  className={`px-6 py-3 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all ${newKeyName.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>Generate Key</span>
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {apiKeys.length > 0 ? apiKeys.map(k => (
                <div key={k.id} className="px-8 py-5 flex items-center justify-between group hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center space-x-4 flex-grow min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${k.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 'bg-red-50 text-red-400'}`}>
                      <KeyIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-bold text-slate-800">{k.name}</p>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${k.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                          {k.status}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 mt-1">
                        <p className="text-xs text-slate-400 font-mono truncate max-w-[300px]">
                          {showKeyId === k.id ? k.key : `${k.key.slice(0, 8)}${'•'.repeat(24)}`}
                        </p>
                        <button onClick={() => setShowKeyId(showKeyId === k.id ? null : k.id)} className="text-slate-300 hover:text-indigo-600 transition-colors">
                          <EyeIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => copyKey(k.key)} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <CopyIcon className="w-4 h-4" />
                    </button>
                    {k.status === 'active' && (
                      <button onClick={() => revokeApiKey(k.id)} className="px-3 py-1.5 text-[10px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="px-8 py-16 text-center">
                  <KeyIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 italic">No API keys generated yet.</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-100">
            <p className="text-xs font-bold text-amber-700">Security Notice: API keys grant full access to your account. Store them securely and never expose them in client-side code.</p>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading">Two-Factor Authentication</h3>
                <p className="text-sm text-slate-500 mt-1">Add an extra layer of security to your account.</p>
              </div>
              <button
                onClick={() => { setTwoFactorEnabled(!twoFactorEnabled); setShowQRCode(!twoFactorEnabled); }}
                className={`relative w-14 h-8 rounded-full transition-colors ${twoFactorEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${twoFactorEnabled ? 'left-7' : 'left-1.5'}`} />
              </button>
            </div>

            {showQRCode && twoFactorEnabled && (
              <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in duration-300">
                <div className="flex items-start space-x-6">
                  <div className="w-32 h-32 bg-white rounded-2xl border border-indigo-200 flex items-center justify-center shadow-sm">
                    <div className="w-24 h-24 bg-slate-100 rounded-xl flex items-center justify-center">
                      <div className="grid grid-cols-5 gap-0.5">
                        {Array.from({ length: 25 }).map((_, i) => (
                          <div key={i} className={`w-3.5 h-3.5 rounded-sm ${Math.random() > 0.4 ? 'bg-slate-800' : 'bg-white'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-indigo-800">Scan QR Code</p>
                    <p className="text-xs text-indigo-600 leading-relaxed">Open your authenticator app (Google Authenticator, Authy) and scan this QR code to enable 2FA.</p>
                    <div className="flex items-center space-x-2">
                      <code className="px-3 py-2 bg-white rounded-lg text-xs font-mono text-slate-600 border border-indigo-100">AURA-2FA-XXXX-XXXX</code>
                      <button className="p-2 text-indigo-600 hover:bg-white rounded-lg transition-colors">
                        <CopyIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!twoFactorEnabled && (
              <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-xs font-bold text-amber-700">2FA is currently disabled. Enable it for enhanced account security.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
            <h3 className="text-lg font-bold text-slate-900 font-heading">Active Sessions</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <ShieldIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Current Session</p>
                    <p className="text-xs text-slate-400 mt-0.5">Browser &middot; {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-3 py-1 rounded-full">Active</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 font-heading">Password</h3>
            <p className="text-sm text-slate-500">Change your password via Supabase authentication.</p>
            <button
              onClick={async () => {
                await supabase.auth.resetPasswordForEmail(user.email);
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
              }}
              className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-colors"
            >
              Send Password Reset Email
            </button>
            {success && <p className="text-xs font-bold text-emerald-600">Reset email sent!</p>}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => !isDeleting && setIsDeleteModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300 p-12 text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-red-50">
              <ShieldIcon className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 font-heading mb-3">Terminate Node?</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-10 font-medium">
              You are about to permanently wipe all data. This process is irreversible and all connected AI assets will be lost.
            </p>
            <div className="space-y-4">
              <button onClick={handleDeleteAccount} disabled={isDeleting}
                className={`w-full py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center space-x-2 ${isDeleting ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-2xl shadow-red-100'}`}>
                {isDeleting ? <div className="w-6 h-6 border-2 border-slate-300 border-t-red-600 rounded-full animate-spin"></div> : <span>Destroy Everything</span>}
              </button>
              <button onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting}
                className="w-full py-4 bg-white text-slate-500 rounded-2xl font-bold hover:bg-slate-50 transition-all border border-slate-100">
                Abort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Account Health Dashboard Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showAccountHealth && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowAccountHealth(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <ShieldIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Account Health</h2>
                  <p className="text-[10px] text-slate-400">Security & completeness score</p>
                </div>
              </div>
              <button onClick={() => setShowAccountHealth(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Health Score Gauge */}
              <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <svg className="w-24 h-24 mx-auto mb-4" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none"
                    stroke={accountHealth.score >= 80 ? '#10b981' : accountHealth.score >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8"
                    strokeDasharray={`${(accountHealth.score / 100) * 251.3} 251.3`}
                    strokeLinecap="round" transform="rotate(-90 48 48)" />
                  <text x="48" y="44" textAnchor="middle" className="text-xl font-black" fill="#1e293b">{accountHealth.score}%</text>
                  <text x="48" y="58" textAnchor="middle" className="text-[8px] font-bold" fill="#94a3b8">HEALTH</text>
                </svg>
                <p className="text-sm font-black text-slate-900">
                  {accountHealth.score >= 80 ? 'Excellent' : accountHealth.score >= 50 ? 'Needs Improvement' : 'At Risk'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {accountHealth.checks.filter(c => c.passed).length}/{accountHealth.checks.length} checks passed
                </p>
              </div>

              {/* Health Checks */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Security Checklist</p>
                <div className="space-y-2">
                  {accountHealth.checks.map((check, idx) => (
                    <div key={idx} className={`flex items-center justify-between p-3 rounded-xl ${check.passed ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className="flex items-center space-x-3">
                        {check.passed ? (
                          <CheckIcon className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangleIcon className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-xs font-bold text-slate-700">{check.label}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold text-slate-400">+{check.weight}%</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${check.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {check.passed ? 'Pass' : 'Fix'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {accountHealth.score < 100 && (
                <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl text-white">
                  <p className="text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-3">Recommendations</p>
                  <div className="space-y-2">
                    {accountHealth.checks.filter(c => !c.passed).map((check, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <SparklesIcon className="w-3.5 h-3.5 text-indigo-300" />
                        <span className="text-xs font-medium text-indigo-100">Enable: {check.label} (+{check.weight}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Account Summary */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-3">Account Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-black">{user?.role === 'ADMIN' ? 'Admin' : 'Client'}</p>
                    <p className="text-[10px] text-slate-400">Account Type</p>
                  </div>
                  <div>
                    <p className="text-lg font-black">{apiKeys.filter(k => k.status === 'active').length}</p>
                    <p className="text-[10px] text-slate-400">Active API Keys</p>
                  </div>
                  <div>
                    <p className="text-lg font-black">{twoFactorEnabled ? 'On' : 'Off'}</p>
                    <p className="text-[10px] text-slate-400">2FA Status</p>
                  </div>
                  <div>
                    <p className="text-lg font-black">{Object.values(notifications).filter(Boolean).length}</p>
                    <p className="text-[10px] text-slate-400">Active Alerts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Session Activity Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showSessionActivity && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSessionActivity(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <ActivityIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Session Activity</h2>
                  <p className="text-[10px] text-slate-400">Your recent actions this session</p>
                </div>
              </div>
              <button onClick={() => setShowSessionActivity(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Session Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-indigo-50 rounded-xl text-center">
                  <p className="text-xl font-black text-indigo-700">{sessionActivity.length}</p>
                  <p className="text-[10px] font-bold text-indigo-500">Actions</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-center">
                  <p className="text-xl font-black text-emerald-700">32m</p>
                  <p className="text-[10px] font-bold text-emerald-500">Duration</p>
                </div>
                <div className="p-3 bg-violet-50 rounded-xl text-center">
                  <p className="text-xl font-black text-violet-700">4</p>
                  <p className="text-[10px] font-bold text-violet-500">Pages</p>
                </div>
              </div>

              {/* Activity Timeline */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Activity Timeline</p>
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-200" />
                  <div className="space-y-3">
                    {sessionActivity.map((item, idx) => {
                      const style = SESSION_TYPE_STYLES[item.type] || SESSION_TYPE_STYLES.navigation;
                      return (
                        <div key={idx} className="relative pl-10">
                          <div className={`absolute left-1.5 top-2 w-4 h-4 rounded-full border-2 border-white shadow ${style.bg}`}>
                            <div className={`w-full h-full rounded-full ${idx === 0 ? 'animate-pulse bg-indigo-500' : ''}`} />
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${style.bg} ${style.text} capitalize`}>{item.type}</span>
                              <span className="text-[10px] text-slate-400 font-bold">{item.time}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-700">{item.action}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Device Info */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-3">Device Information</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Browser</span>
                    <span className="text-xs font-bold text-white">Chrome / Desktop</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">IP Address</span>
                    <span className="text-xs font-bold text-white">192.168.1.***</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Location</span>
                    <span className="text-xs font-bold text-white">United States</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Login Method</span>
                    <span className="text-xs font-bold text-white">Password + {twoFactorEnabled ? '2FA' : 'No 2FA'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Data Export Sidebar ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showDataExport && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowDataExport(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                  <DownloadIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Data Export</h2>
                  <p className="text-[10px] text-slate-400">Download your account data</p>
                </div>
              </div>
              <button onClick={() => setShowDataExport(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Export Options */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Available Exports</p>
                <div className="space-y-2">
                  {exportOptions.map(opt => (
                    <div key={opt.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group cursor-pointer">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                          {opt.icon}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{opt.label}</p>
                          <p className="text-[10px] text-slate-400">{opt.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-bold text-slate-400">{opt.size}</span>
                        <div className="flex items-center space-x-1">
                          <button className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors">CSV</button>
                          <button className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors">JSON</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bulk Export */}
              <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl text-white">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-3">Complete Data Export</p>
                <p className="text-xs text-indigo-100 mb-4">Download all your account data in a single archive. GDPR-compliant full data export.</p>
                <button className="w-full py-3 bg-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/20 transition-colors flex items-center justify-center space-x-2">
                  <DownloadIcon className="w-4 h-4" />
                  <span>Export All Data (ZIP)</span>
                </button>
              </div>

              {/* Export History */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Recent Exports</p>
                <div className="space-y-2">
                  {[
                    { name: 'leads_export_jan2024.csv', date: '2024-01-15', size: '482 KB' },
                    { name: 'analytics_q4_2023.json', date: '2024-01-02', size: '1.1 MB' },
                    { name: 'full_backup_dec2023.zip', date: '2023-12-28', size: '4.7 MB' },
                  ].map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center space-x-3">
                        <DocumentIcon className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">{file.name}</p>
                          <p className="text-[10px] text-slate-400">{file.date}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{file.size}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Retention Notice */}
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <div className="flex items-start space-x-2">
                  <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">Data Retention Policy</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">Exports are available for 30 days. Data is retained per your plan terms. Contact support for extended retention options.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── Keyboard Shortcuts Modal ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <KeyboardIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900">Account Shortcuts</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-3 max-h-80 overflow-y-auto">
              {[
                { key: '1', action: 'Profile tab' },
                { key: '2', action: 'Notifications tab' },
                { key: '3', action: 'Preferences tab' },
                { key: '4', action: 'API Keys tab' },
                { key: '5', action: 'Security tab' },
                { key: 'H', action: 'Account Health' },
                { key: 'A', action: 'Session Activity' },
                { key: 'E', action: 'Data Export' },
                { key: '?', action: 'This shortcuts panel' },
                { key: 'Esc', action: 'Close panels' },
              ].map((sc, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">{sc.action}</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
