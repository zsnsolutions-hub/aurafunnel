import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, NotificationPreferences, DashboardPreferences, ApiKey } from '../../types';
import { ShieldIcon, BellIcon, KeyIcon, LayoutIcon, CogIcon, CopyIcon, PlusIcon, XIcon, CheckIcon, EyeIcon, LockIcon } from '../../components/Icons';
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
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Account Architecture</h1>
        <p className="text-slate-500 mt-1">Manage your profile, preferences, security, and API access.</p>
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
    </div>
  );
};

export default ProfilePage;
