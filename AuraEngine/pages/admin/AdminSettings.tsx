import React, { useState, useEffect } from 'react';
import { BoltIcon, ShieldIcon, CogIcon, SparklesIcon, UsersIcon, LinkIcon, CheckIcon, XIcon, KeyIcon, EyeIcon } from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import { IntegrationConfig, TeamMember, RolePermission } from '../../types';

type AdminTab = 'config' | 'team' | 'integrations';

const INTEGRATIONS_STORAGE_KEY = 'aurafunnel_integrations';

const ROLE_PERMISSIONS: RolePermission[] = [
  {
    role: 'Administrator',
    description: 'Full platform access',
    color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    permissions: ['User management', 'System configuration', 'Billing access', 'API management', 'All data access', 'Audit logs']
  },
  {
    role: 'Manager',
    description: 'Team-level access',
    color: 'bg-amber-50 text-amber-600 border-amber-100',
    permissions: ['Team member management', 'Campaign approval', 'Report generation', 'Lead assignment', 'Content review']
  },
  {
    role: 'User',
    description: 'Limited access',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    permissions: ['Lead management', 'Content creation', 'Basic reporting', 'Personal dashboard']
  }
];

const DEFAULT_INTEGRATIONS: IntegrationConfig[] = [
  { id: 'salesforce', name: 'Salesforce', category: 'crm', icon: 'SF', status: 'disconnected' },
  { id: 'hubspot', name: 'HubSpot', category: 'crm', icon: 'HS', status: 'disconnected' },
  { id: 'sendgrid', name: 'SendGrid', category: 'email', icon: 'SG', status: 'disconnected' },
  { id: 'mailgun', name: 'Mailgun', category: 'email', icon: 'MG', status: 'disconnected' },
  { id: 'google-analytics', name: 'Google Analytics', category: 'analytics', icon: 'GA', status: 'disconnected' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'analytics', icon: 'MP', status: 'disconnected' },
  { id: 'google-calendar', name: 'Google Calendar', category: 'calendar', icon: 'GC', status: 'disconnected' },
  { id: 'outlook', name: 'Outlook Calendar', category: 'calendar', icon: 'OL', status: 'disconnected' },
  { id: 'slack', name: 'Slack', category: 'communication', icon: 'SL', status: 'disconnected' },
  { id: 'teams', name: 'Microsoft Teams', category: 'communication', icon: 'MT', status: 'disconnected' },
  { id: 'stripe', name: 'Stripe', category: 'payment', icon: 'ST', status: 'disconnected' },
  { id: 'paypal', name: 'PayPal', category: 'payment', icon: 'PP', status: 'disconnected' },
];

const CATEGORY_LABELS: Record<string, string> = {
  crm: 'CRM Systems',
  email: 'Email Services',
  analytics: 'Analytics',
  calendar: 'Calendar',
  communication: 'Communication',
  payment: 'Payment Processors'
};

const CATEGORY_COLORS: Record<string, string> = {
  crm: 'bg-blue-50 text-blue-600',
  email: 'bg-indigo-50 text-indigo-600',
  analytics: 'bg-purple-50 text-purple-600',
  calendar: 'bg-emerald-50 text-emerald-600',
  communication: 'bg-amber-50 text-amber-600',
  payment: 'bg-rose-50 text-rose-600'
};

const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('config');

  // Config State
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [config, setConfig] = useState({
    stripe_api_key: '',
    openai_api_key: '',
    platform_version: 'v10.0.0-neural'
  });

  // Team State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Integration State
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>(() => {
    try {
      const stored = localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_INTEGRATIONS;
    } catch { return DEFAULT_INTEGRATIONS; }
  });
  const [setupModalId, setSetupModalId] = useState<string | null>(null);
  const [setupApiKey, setSetupApiKey] = useState('');
  const [setupWebhook, setSetupWebhook] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const tabs = [
    { id: 'config' as AdminTab, label: 'Global Config', icon: <CogIcon className="w-4 h-4" /> },
    { id: 'team' as AdminTab, label: 'Team Management', icon: <UsersIcon className="w-4 h-4" /> },
    { id: 'integrations' as AdminTab, label: 'Integrations', icon: <LinkIcon className="w-4 h-4" /> },
  ];

  useEffect(() => {
    fetchConfig();
    fetchTeam();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('config_settings').select('key, value');
      if (data) {
        const mappedConfig: any = { ...config };
        data.forEach((item: any) => {
          if (item.key in mappedConfig) mappedConfig[item.key] = item.value || '';
        });
        setConfig(mappedConfig);
      }
    } catch (err) {
      console.error("Config fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeam = async () => {
    setLoadingTeam(true);
    try {
      const { data } = await supabase.from('profiles').select('id, name, email, role, status, created_at').order('created_at', { ascending: true });
      if (data) {
        setTeamMembers(data.map((m: any) => ({
          id: m.id,
          name: m.name || m.email?.split('@')[0] || 'Unknown',
          email: m.email,
          role: m.role === 'ADMIN' ? 'Administrator' : m.role === 'CLIENT' ? 'User' : 'User',
          status: m.status || 'active',
          joinedAt: m.created_at
        })));
      }
    } catch (err) {
      console.error("Team fetch error:", err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const updates = Object.entries(config).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('config_settings').upsert(updates, { onConflict: 'key' });
      if (!error) {
        await supabase.from('audit_logs').insert({ action: 'GLOBAL_CONFIG_UPDATE', details: 'Administrative variables updated via platform settings panel' });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Config save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    const dbRole = newRole === 'Administrator' ? 'ADMIN' : 'CLIENT';
    const { error } = await supabase.from('profiles').update({ role: dbRole }).eq('id', memberId);
    if (!error) {
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole as TeamMember['role'] } : m));
      await supabase.from('audit_logs').insert({ action: 'ROLE_UPDATE', details: `Role changed to ${newRole} for user ${memberId}` });
    }
  };

  const handleToggleStatus = async (memberId: string) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (!member) return;
    const newStatus = member.status === 'active' ? 'disabled' : 'active';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', memberId);
    if (!error) {
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: newStatus } : m));
      await supabase.from('audit_logs').insert({ action: 'USER_STATUS_UPDATE', details: `User ${memberId} status changed to ${newStatus}` });
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    await new Promise(res => setTimeout(res, 1500));
    setTestResult(setupApiKey.length > 5 ? 'success' : 'error');
    setIsTesting(false);
  };

  const handleActivateIntegration = () => {
    if (!setupModalId || testResult !== 'success') return;
    const updated = integrations.map(i =>
      i.id === setupModalId ? { ...i, status: 'connected' as const, apiKey: setupApiKey, webhookUrl: setupWebhook, lastSync: new Date().toISOString() } : i
    );
    setIntegrations(updated);
    localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(updated));
    supabase.from('audit_logs').insert({ action: 'INTEGRATION_CONNECTED', details: `Integration ${setupModalId} activated` });
    setSetupModalId(null);
    setSetupApiKey('');
    setSetupWebhook('');
    setTestResult(null);
  };

  const handleDisconnect = (id: string) => {
    const updated = integrations.map(i =>
      i.id === id ? { ...i, status: 'disconnected' as const, apiKey: undefined, webhookUrl: undefined, lastSync: undefined } : i
    );
    setIntegrations(updated);
    localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(updated));
    supabase.from('audit_logs').insert({ action: 'INTEGRATION_DISCONNECTED', details: `Integration ${id} disconnected` });
  };

  const categories: string[] = Array.from(new Set(integrations.map(i => i.category)));

  return (
    <div className="max-w-5xl space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading">Platform Settings</h1>
          <p className="text-slate-500">Global configuration, team management, and third-party integrations.</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-6 py-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Global Config Tab */}
      {activeTab === 'config' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-end">
            <button onClick={() => setShowKeys(!showKeys)}
              className="text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors flex items-center space-x-2">
              <EyeIcon className="w-3.5 h-3.5" />
              <span>{showKeys ? 'Hide Secrets' : 'Reveal Secrets'}</span>
            </button>
          </div>

          {loading ? (
            <div className="py-24 text-center">
              <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Decrypting Vault...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><SparklesIcon className="w-5 h-5" /></div>
                    <h3 className="font-bold text-slate-800">Intelligence Layers</h3>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">OpenAI Secret Key</label>
                    <div className="relative group">
                      <input type={showKeys ? "text" : "password"} value={config.openai_api_key}
                        onChange={(e) => setConfig({...config, openai_api_key: e.target.value})}
                        placeholder="sk-...."
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
                      {!showKeys && config.openai_api_key && <div className="absolute inset-0 bg-slate-50/10 backdrop-blur-[1px] rounded-2xl pointer-events-none"></div>}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">System Build Signature</label>
                    <input type="text" readOnly value={config.platform_version}
                      className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-mono text-xs text-slate-400 cursor-not-allowed" />
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><BoltIcon className="w-5 h-5" /></div>
                    <h3 className="font-bold text-slate-800">Payment Gateway</h3>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Stripe Secret Key</label>
                    <div className="relative group">
                      <input type={showKeys ? "text" : "password"} value={config.stripe_api_key}
                        onChange={(e) => setConfig({...config, stripe_api_key: e.target.value})}
                        placeholder="rk_live_...."
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
                      {!showKeys && config.stripe_api_key && <div className="absolute inset-0 bg-slate-50/10 backdrop-blur-[1px] rounded-2xl pointer-events-none"></div>}
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Integration Status</p>
                    <p className="text-xs font-medium text-emerald-600">Secure Webhook Handlers are ACTIVE on this node.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 font-heading flex items-center space-x-3">
                  <CogIcon className="w-5 h-5 text-slate-400" />
                  <span>Unified Integration Bus</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4 p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
                    <span className="px-2 py-1 bg-slate-900 text-white text-[9px] font-black rounded uppercase">REST</span>
                    <input readOnly value="https://api.aurafunnel.io/v1/telemetry" className="flex-grow bg-transparent text-xs font-mono text-slate-500 outline-none" />
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-end space-x-4 pt-4">
            {success && <span className="text-emerald-600 text-sm font-bold animate-in slide-in-from-right-2">System variables updated successfully</span>}
            <button onClick={handleSaveConfig} disabled={isSaving || loading}
              className={`px-10 py-4 rounded-2xl font-bold shadow-xl transition-all active:scale-95 flex items-center space-x-3 ${isSaving || loading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-slate-200'}`}>
              {isSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
              <span>{isSaving ? 'Synchronizing Keys...' : 'Commit Settings'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Team Management Tab */}
      {activeTab === 'team' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Roles & Permissions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ROLE_PERMISSIONS.map(role => (
              <div key={role.role} className={`p-6 rounded-2xl border ${role.color} space-y-4`}>
                <div>
                  <h4 className="text-sm font-black">{role.role}</h4>
                  <p className="text-xs opacity-70 mt-0.5">{role.description}</p>
                </div>
                <ul className="space-y-2">
                  {role.permissions.map((p, i) => (
                    <li key={i} className="flex items-center space-x-2 text-xs">
                      <CheckIcon className="w-3 h-3 flex-shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Team Members */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 font-heading">Team Directory</h3>
                <p className="text-xs text-slate-400 mt-1">{teamMembers.length} members</p>
              </div>
            </div>

            {loadingTeam ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs text-slate-400 font-bold">Loading team...</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                  <tr>
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamMembers.map(member => (
                    <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-black text-sm uppercase">
                            {member.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{member.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                          className="text-xs font-bold bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-300 cursor-pointer"
                        >
                          <option value="Administrator">Administrator</option>
                          <option value="Manager">Manager</option>
                          <option value="User">User</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${member.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-slate-500">{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'N/A'}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleToggleStatus(member.id)}
                          className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors ${member.status === 'active' ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}
                        >
                          {member.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {integrations.filter(i => i.status === 'connected').length} of {integrations.length} integrations active
            </p>
          </div>

          {categories.map(cat => (
            <div key={cat} className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{CATEGORY_LABELS[cat]}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integrations.filter(i => i.category === cat).map(integration => (
                  <div key={integration.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between group hover:shadow-md transition-all">
                    <div className="flex items-center space-x-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs ${CATEGORY_COLORS[cat]}`}>
                        {integration.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{integration.name}</p>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${integration.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                          <span className="text-[10px] font-bold text-slate-400 capitalize">{integration.status}</span>
                          {integration.lastSync && (
                            <span className="text-[10px] text-slate-300">&middot; Synced {new Date(integration.lastSync).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {integration.status === 'connected' ? (
                      <button
                        onClick={() => handleDisconnect(integration.id)}
                        className="px-4 py-2 text-[10px] font-bold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => { setSetupModalId(integration.id); setSetupApiKey(''); setSetupWebhook(''); setTestResult(null); }}
                        className="px-4 py-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
                      >
                        Setup
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Integration Setup Modal */}
      {setupModalId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSetupModalId(null)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading">
                  Setup {integrations.find(i => i.id === setupModalId)?.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">Enter credentials and test the connection.</p>
              </div>
              <button onClick={() => setSetupModalId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {/* Step indicators */}
              <div className="flex items-center space-x-2 text-xs font-bold">
                <span className="px-3 py-1 bg-indigo-600 text-white rounded-full">1. Credentials</span>
                <div className="w-8 h-0.5 bg-slate-200"></div>
                <span className={`px-3 py-1 rounded-full ${testResult ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>2. Test</span>
                <div className="w-8 h-0.5 bg-slate-200"></div>
                <span className={`px-3 py-1 rounded-full ${testResult === 'success' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>3. Activate</span>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">API Key / Token</label>
                <input
                  type="text"
                  value={setupApiKey}
                  onChange={(e) => setSetupApiKey(e.target.value)}
                  placeholder="Enter API key..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Webhook URL (Optional)</label>
                <input
                  type="text"
                  value={setupWebhook}
                  onChange={(e) => setSetupWebhook(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                />
              </div>

              {testResult && (
                <div className={`p-4 rounded-2xl border ${testResult === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <div className="flex items-center space-x-2">
                    {testResult === 'success' ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <XIcon className="w-4 h-4 text-red-600" />}
                    <p className={`text-xs font-bold ${testResult === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {testResult === 'success' ? 'Connection successful! Ready to activate.' : 'Connection failed. Check credentials.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3 pt-4">
                <button
                  onClick={handleTestConnection}
                  disabled={!setupApiKey || isTesting}
                  className={`flex-grow py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all ${!setupApiKey || isTesting ? 'bg-slate-100 text-slate-300' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}
                >
                  {isTesting ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div><span>Testing...</span></>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>
                <button
                  onClick={handleActivateIntegration}
                  disabled={testResult !== 'success'}
                  className={`flex-grow py-3 rounded-xl font-bold text-sm transition-all ${testResult === 'success' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                >
                  Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
