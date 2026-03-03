import React, { useState, useEffect, useCallback } from 'react';
import { Save, Eye, EyeOff, Plus, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { logConfigAction } from '../../../lib/auditLogger';
import { executeRpc } from '../../../lib/adminActions';

interface Props { adminId: string }

type SubTab = 'settings' | 'plans' | 'flags';

interface ConfigSetting { key: string; value: string }
interface Plan { id: string; name: string; key: string; price: number; credits: number; ai_credits: number; max_inboxes: number; emails_per_month: number; is_active: boolean }
interface Flag { id: string; key: string; enabled: boolean; description: string }

const ConfigTab: React.FC<Props> = ({ adminId }) => {
  const [subTab, setSubTab] = useState<SubTab>('settings');

  // Settings state
  const [settings, setSettings] = useState<ConfigSetting[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Flags state
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagDesc, setNewFlagDesc] = useState('');

  // ── Settings ───────────────────────────
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('config_settings').select('key, value');
    setSettings(data ?? []);
  }, []);

  useEffect(() => { if (subTab === 'settings') fetchSettings(); }, [subTab, fetchSettings]);

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    for (const s of settings) {
      await supabase.from('config_settings').upsert({ key: s.key, value: s.value }, { onConflict: 'key' });
    }
    await logConfigAction(adminId, 'config.update', 'config_settings', undefined, { keys: settings.map(s => s.key) });
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  // ── Plans ──────────────────────────────
  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    const { data } = await supabase.from('plans').select('*').order('price', { ascending: true });
    setPlans((data ?? []) as Plan[]);
    setPlansLoading(false);
  }, []);

  useEffect(() => { if (subTab === 'plans') fetchPlans(); }, [subTab, fetchPlans]);

  const clonePlan = async (sourceKey: string) => {
    const newName = prompt(`New plan name (cloning ${sourceKey}):`);
    if (!newName) return;
    const newKey = newName.toLowerCase().replace(/\s+/g, '_');
    await executeRpc(adminId, 'admin_clone_plan', {
      source_plan_key: sourceKey,
      new_plan_name: newName,
      new_plan_key: newKey,
    }, 'plan.clone');
    await fetchPlans();
  };

  // ── Feature Flags ─────────────────────
  const fetchFlags = useCallback(async () => {
    setFlagsLoading(true);
    const { data } = await supabase.from('feature_flags').select('*').order('key');
    setFlags((data ?? []) as Flag[]);
    setFlagsLoading(false);
  }, []);

  useEffect(() => { if (subTab === 'flags') fetchFlags(); }, [subTab, fetchFlags]);

  const toggleFlag = async (flag: Flag) => {
    const newEnabled = !flag.enabled;
    await executeRpc(adminId, 'admin_update_feature_flag', {
      flag_key: flag.key,
      enabled: newEnabled,
    }, 'config.feature_flag_toggle');
    await logConfigAction(adminId, 'config.feature_flag_toggle', flag.key, { enabled: flag.enabled }, { enabled: newEnabled });
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: newEnabled } : f));
  };

  const addFlag = async () => {
    if (!newFlagKey.trim()) return;
    await supabase.from('feature_flags').insert({ key: newFlagKey.trim(), enabled: false, description: newFlagDesc });
    setNewFlagKey('');
    setNewFlagDesc('');
    await fetchFlags();
  };

  const isSensitive = (key: string) => /key|secret|token|password/i.test(key);

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-gray-200 -mb-px">
        {([
          { key: 'settings', label: 'Platform Settings' },
          { key: 'plans', label: 'Plans & Pricing' },
          { key: 'flags', label: 'Feature Flags' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              subTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Settings */}
      {subTab === 'settings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setShowSecrets(!showSecrets)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
              {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />} {showSecrets ? 'Hide' : 'Show'} secrets
            </button>
            <div className="flex items-center gap-2">
              {settingsSaved && <span className="text-sm text-emerald-600">Saved</span>}
              <button onClick={saveSettings} disabled={savingSettings} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save All
              </button>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {settings.length === 0 ? (
              <p className="text-sm text-gray-400 italic p-6">No configuration settings found.</p>
            ) : (
              settings.map(s => (
                <div key={s.key} className="flex items-center gap-4 px-5 py-4">
                  <label className="text-sm font-medium text-gray-700 w-48 shrink-0 font-mono">{s.key}</label>
                  <input
                    type={isSensitive(s.key) && !showSecrets ? 'password' : 'text'}
                    value={s.value}
                    onChange={e => updateSetting(s.key, e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Plans */}
      {subTab === 'plans' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {plansLoading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Key</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Price</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Credits</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">AI Credits</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Inboxes</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Emails/mo</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Active</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map(p => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.key}</td>
                      <td className="px-4 py-3 text-right">${p.price ?? 0}</td>
                      <td className="px-4 py-3 text-right">{p.credits ?? 0}</td>
                      <td className="px-4 py-3 text-right">{p.ai_credits ?? 0}</td>
                      <td className="px-4 py-3 text-right">{p.max_inboxes ?? 0}</td>
                      <td className="px-4 py-3 text-right">{p.emails_per_month ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => clonePlan(p.key)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Clone</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Feature Flags */}
      {subTab === 'flags' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              value={newFlagKey}
              onChange={e => setNewFlagKey(e.target.value)}
              placeholder="flag_key"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono w-48"
            />
            <input
              value={newFlagDesc}
              onChange={e => setNewFlagDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
            <button onClick={addFlag} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
              <Plus size={14} /> Add Flag
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {flagsLoading ? (
              <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : flags.length === 0 ? (
              <p className="text-sm text-gray-400 italic p-6">No feature flags defined.</p>
            ) : (
              flags.map(f => (
                <div key={f.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-mono font-medium text-gray-900">{f.key}</p>
                    {f.description && <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>}
                  </div>
                  <button onClick={() => toggleFlag(f)} className="text-gray-400 hover:text-indigo-600 transition-colors">
                    {f.enabled ? <ToggleRight size={28} className="text-indigo-600" /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigTab;
