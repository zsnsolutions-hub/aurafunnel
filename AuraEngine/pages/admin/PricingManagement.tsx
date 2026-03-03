
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getAllPlans, invalidatePlanCache, type DbPlan, type PlanLimits } from '../../lib/plans';
import { logSupportAction } from '../../lib/supportAudit';
import { getActiveSession } from '../../lib/support';
import {
  CreditCardIcon, SparklesIcon, EditIcon, CheckIcon, BoltIcon, CameraIcon, XIcon,
} from '../../components/Icons';
import {
  Save, X, AlertTriangle, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Mail, Users, HardDrive, Inbox, Zap, Globe, Linkedin, Sparkles, DollarSign,
  Shield, Loader2, Copy, Plus,
} from 'lucide-react';
import ImageGeneratorDrawer from '../../components/image-gen/ImageGeneratorDrawer';

// ── Limit field definitions ─────────────────────────────────────────────────

interface LimitFieldDef {
  key: keyof PlanLimits;
  label: string;
  icon: React.ReactNode;
  type: 'number' | 'boolean';
  group: string;
}

const LIMIT_FIELDS: LimitFieldDef[] = [
  { key: 'credits',              label: 'AI Credits/Mo',      icon: <Sparkles size={14} />,  type: 'number',  group: 'Core' },
  { key: 'contacts',             label: 'Contacts',           icon: <Users size={14} />,     type: 'number',  group: 'Core' },
  { key: 'seats',                label: 'Seats',              icon: <Users size={14} />,     type: 'number',  group: 'Core' },
  { key: 'emails',               label: 'Emails/Mo',          icon: <Mail size={14} />,      type: 'number',  group: 'Core' },
  { key: 'storage',              label: 'Storage (MB)',        icon: <HardDrive size={14} />, type: 'number',  group: 'Core' },
  { key: 'maxInboxes',           label: 'Max Inboxes',        icon: <Inbox size={14} />,     type: 'number',  group: 'Outbound' },
  { key: 'emailsPerDayPerInbox', label: 'Emails/Day/Inbox',   icon: <Mail size={14} />,      type: 'number',  group: 'Outbound' },
  { key: 'emailsPerMonth',       label: 'Emails/Month (Cap)', icon: <Mail size={14} />,      type: 'number',  group: 'Outbound' },
  { key: 'linkedInPerDay',       label: 'LinkedIn/Day',       icon: <Linkedin size={14} />,  type: 'number',  group: 'Outbound' },
  { key: 'linkedInPerMonth',     label: 'LinkedIn/Month',     icon: <Linkedin size={14} />,  type: 'number',  group: 'Outbound' },
  { key: 'aiCreditsMonthly',     label: 'AI Credits Monthly', icon: <Zap size={14} />,       type: 'number',  group: 'AI' },
  { key: 'hasAI',                label: 'AI Enabled',         icon: <Sparkles size={14} />,  type: 'boolean', group: 'AI' },
];

// ── Component ───────────────────────────────────────────────────────────────

const PricingManagement: React.FC = () => {
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<DbPlan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showImageGen, setShowImageGen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [limitsExpanded, setLimitsExpanded] = useState(true);

  // Form state
  const [form, setForm] = useState({
    name: '',
    price: '',
    price_monthly_cents: 0,
    credits: 0,
    description: '',
    features: '',
    is_active: true,
    stripe_price_id: '',
    sort_order: 0,
    limits: {} as PlanLimits,
  });

  // Clone plan state
  const [showClone, setShowClone] = useState(false);
  const [cloneSource, setCloneSource] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneKey, setCloneKey] = useState('');
  const [cloning, setCloning] = useState(false);

  const handleClone = async () => {
    if (!cloneSource || !cloneName || !cloneKey) return;
    setCloning(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('admin_clone_plan', {
        p_source_plan_id: cloneSource, p_new_name: cloneName, p_new_key: cloneKey, p_admin_id: authUser.id,
      });
      if (error) throw new Error(error.message);
      const result = data as { success: boolean; message: string };
      if (!result.success) throw new Error(result.message);
      invalidatePlanCache();
      await fetchPlans();
      setShowClone(false); setCloneName(''); setCloneKey(''); setCloneSource('');
      setSuccessMsg(`Cloned plan as "${cloneName}"`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(`Clone failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setCloning(false); }
  };

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllPlans();
      setPlans(data);
    } catch (err) {
      console.error('Plan fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openEditor = (plan: DbPlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      price: plan.price,
      price_monthly_cents: plan.price_monthly_cents,
      credits: plan.credits,
      description: plan.description || '',
      features: plan.features.join('\n'),
      is_active: plan.is_active,
      stripe_price_id: plan.stripe_price_id || '',
      sort_order: plan.sort_order,
      limits: { ...plan.limits },
    });
    setLimitsExpanded(true);
    setShowConfirm(false);
  };

  const closeEditor = () => {
    if (!isSaving) {
      setEditingPlan(null);
      setShowConfirm(false);
    }
  };

  const handleSave = async () => {
    if (!editingPlan) return;
    setIsSaving(true);
    setShowConfirm(false);

    try {
      const featureArray = form.features.split('\n').filter(f => f.trim() !== '');

      const updates = {
        name: form.name,
        price: form.price,
        price_monthly_cents: form.price_monthly_cents,
        credits: form.credits,
        description: form.description,
        features: featureArray,
        is_active: form.is_active,
        stripe_price_id: form.stripe_price_id || null,
        sort_order: form.sort_order,
        limits: form.limits,
      };

      // Get current admin
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Try the admin_update_plan RPC first (requires migration)
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_plan', {
        p_plan_id: editingPlan.id,
        p_admin_id: authUser.id,
        p_updates: updates,
      });

      if (rpcError) {
        // Fallback: direct update if RPC doesn't exist yet
        console.warn('admin_update_plan RPC not available, using direct update:', rpcError.message);
        const updatePayload: Record<string, unknown> = {
          price: updates.price,
          credits: updates.credits,
          description: updates.description,
          features: updates.features,
        };
        // Only include new columns if they exist (won't error on missing cols with this approach)
        if (editingPlan.key !== undefined) {
          Object.assign(updatePayload, {
            name: updates.name,
            price_monthly_cents: updates.price_monthly_cents,
            is_active: updates.is_active,
            stripe_price_id: updates.stripe_price_id,
            sort_order: updates.sort_order,
            limits: updates.limits,
          });
        }
        const { error: directErr } = await supabase
          .from('plans')
          .update(updatePayload)
          .eq('id', editingPlan.id);
        if (directErr) throw new Error(directErr.message);
      } else {
        const result = rpcData as { success: boolean; message: string };
        if (!result.success) throw new Error(result.message);
      }

      // If support session active, also log there
      try {
        const session = await getActiveSession(authUser.id);
        if (session) {
          await logSupportAction({
            session_id: session.id,
            admin_id: authUser.id,
            target_user_id: authUser.id,
            action: 'update_plan_config',
            resource_type: 'plan',
            resource_id: editingPlan.id,
            details: { plan_name: form.name, updates },
          });
        }
      } catch { /* audit should never block */ }

      invalidatePlanCache();
      await fetchPlans();
      setEditingPlan(null);
      setSuccessMsg(`Updated ${form.name} plan successfully`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Plan update failed:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to update plan: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateLimit = (key: keyof PlanLimits, value: number | boolean) => {
    setForm(prev => ({
      ...prev,
      limits: { ...prev.limits, [key]: value },
    }));
  };

  const formatCents = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  // Group limit fields
  const groups = ['Core', 'Outbound', 'AI'] as const;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Subscription Architect</h1>
          <p className="text-slate-500 mt-1">Configure plans, limits, and monetization logic. All changes are audited.</p>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setShowClone(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-all shadow-sm">
              <Copy size={14} />
              <span>Clone Plan</span>
            </button>
            <button onClick={() => setShowImageGen(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <CameraIcon className="w-3.5 h-3.5" />
              <span>Generate Image</span>
            </button>
          </div>
          {successMsg && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100 animate-in slide-in-from-right-4">
              {successMsg}
            </div>
          )}
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 animate-pulse h-[480px]" />
          ))
        ) : (
          plans.map(plan => (
            <div
              key={plan.id}
              className={`bg-white p-8 rounded-[2.5rem] border shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500 ${
                plan.is_active ? 'border-slate-200' : 'border-red-200 opacity-60'
              }`}
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <CreditCardIcon className="w-24 h-24" />
              </div>

              {/* Active badge */}
              {!plan.is_active && (
                <div className="absolute top-4 right-4 px-2 py-0.5 bg-red-100 text-red-600 text-[9px] font-black rounded-full uppercase tracking-wider">
                  Inactive
                </div>
              )}

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 font-heading">{plan.name}</h3>
                    {plan.key && (
                      <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                        key: {plan.key}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => openEditor(plan)}
                    className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-5 flex-grow">
                  {/* Pricing */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pricing</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-xl font-bold text-slate-900">{plan.price}</p>
                      <p className="text-xs text-slate-400">({formatCents(plan.price_monthly_cents)}/mo)</p>
                    </div>
                  </div>

                  {/* Credits */}
                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Compute Capacity</p>
                    <p className="text-xl font-bold text-indigo-700">{plan.credits.toLocaleString()} Gen/Mo</p>
                  </div>

                  {/* Key Limits Summary */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Inboxes', value: plan.limits.maxInboxes },
                      { label: 'Emails/Mo', value: plan.limits.emailsPerMonth.toLocaleString() },
                      { label: 'AI Credits', value: plan.limits.aiCreditsMonthly.toLocaleString() },
                      { label: 'Seats', value: plan.limits.seats },
                    ].map(item => (
                      <div key={item.label} className="p-2 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                        <p className="text-sm font-bold text-slate-700">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</p>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 italic">
                      "{plan.description || 'No description configured.'}"
                    </p>
                  </div>

                  {/* Features */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Features ({plan.features.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.features.slice(0, 3).map((f, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[9px] font-black rounded-md border border-slate-100 truncate max-w-[120px]">
                          {f}
                        </span>
                      ))}
                      {plan.features.length > 3 && (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-md border border-indigo-100">
                          +{plan.features.length - 3} More
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── EDIT DRAWER ────────────────────────────────────────────────────── */}
      {editingPlan && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeEditor} />
          <div className="relative bg-white w-full max-w-2xl shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-200">
                  <SparklesIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Edit Plan</h2>
                  <p className="text-xs text-slate-400">Modifying <span className="font-bold text-indigo-600">{editingPlan.name}</span></p>
                </div>
              </div>
              <button onClick={closeEditor} disabled={isSaving} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8">
              {/* Basic Info */}
              <section className="space-y-5">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <DollarSign size={14} /> Basic Info
                </h3>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Price</label>
                    <input
                      type="text"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="$29/mo"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Price (cents)</label>
                    <input
                      type="number"
                      value={form.price_monthly_cents}
                      onChange={e => setForm(f => ({ ...f, price_monthly_cents: parseInt(e.target.value) || 0 }))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 transition-all text-sm"
                    />
                    <p className="text-[10px] text-slate-400">{formatCents(form.price_monthly_cents)}/mo</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gen Credits</label>
                    <input
                      type="number"
                      value={form.credits}
                      onChange={e => setForm(f => ({ ...f, credits: parseInt(e.target.value) || 0 }))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort Order</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stripe Price ID</label>
                  <input
                    type="text"
                    value={form.stripe_price_id}
                    onChange={e => setForm(f => ({ ...f, stripe_price_id: e.target.value }))}
                    placeholder="price_1..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200 transition-all"
                  />
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Plan Active</p>
                    <p className="text-[10px] text-slate-400">Inactive plans won't show in pricing page</p>
                  </div>
                  <button
                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    className="transition-colors"
                  >
                    {form.is_active
                      ? <ToggleRight size={32} className="text-emerald-500" />
                      : <ToggleLeft size={32} className="text-slate-300" />
                    }
                  </button>
                </div>
              </section>

              {/* Description & Features */}
              <section className="space-y-5">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Globe size={14} /> Content
                </h3>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marketing Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200 transition-all resize-none"
                    placeholder="Summarize the plan's purpose..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Features (one per line)</label>
                  <textarea
                    value={form.features}
                    onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                    rows={5}
                    className="w-full p-3 bg-slate-950 border border-white/10 rounded-xl font-mono text-xs text-indigo-200 outline-none focus:ring-2 focus:ring-indigo-900/50 transition-all resize-none"
                    placeholder={"Advanced Scoring\nPriority Support\nCustom Integration..."}
                  />
                </div>
              </section>

              {/* Limits */}
              <section className="space-y-4">
                <button
                  onClick={() => setLimitsExpanded(!limitsExpanded)}
                  className="w-full flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-widest"
                >
                  <span className="flex items-center gap-2"><Shield size={14} /> Plan Limits</span>
                  {limitsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {limitsExpanded && (
                  <div className="space-y-6">
                    {groups.map(group => (
                      <div key={group} className="space-y-3">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest border-b border-indigo-50 pb-1">{group}</p>
                        <div className="grid grid-cols-2 gap-3">
                          {LIMIT_FIELDS.filter(f => f.group === group).map(field => (
                            <div key={field.key} className="space-y-1">
                              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                {field.icon} {field.label}
                              </label>
                              {field.type === 'number' ? (
                                <input
                                  type="number"
                                  value={form.limits[field.key] as number}
                                  onChange={e => updateLimit(field.key, parseInt(e.target.value) || 0)}
                                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 transition-all"
                                />
                              ) : (
                                <button
                                  onClick={() => updateLimit(field.key, !form.limits[field.key])}
                                  className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg w-full transition-all"
                                >
                                  {form.limits[field.key]
                                    ? <ToggleRight size={20} className="text-emerald-500" />
                                    : <ToggleLeft size={20} className="text-slate-300" />
                                  }
                                  <span className="text-xs font-bold text-slate-600">
                                    {form.limits[field.key] ? 'Enabled' : 'Disabled'}
                                  </span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Save / Cancel */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={isSaving}
                  className={`flex-grow py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                    isSaving
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 active:scale-[0.98]'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
                <button
                  onClick={closeEditor}
                  disabled={isSaving}
                  className="px-6 py-4 text-slate-400 rounded-xl font-bold hover:bg-slate-50 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL ──────────────────────────────────────────── */}
      {showConfirm && editingPlan && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Confirm Plan Update</h3>
                <p className="text-xs text-slate-500">This will affect all users on the <strong>{editingPlan.name}</strong> plan.</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2 text-xs">
              <p className="font-bold text-slate-700">Changes Summary:</p>
              <ul className="space-y-1 text-slate-600">
                <li>Price: {editingPlan.price} → {form.price}</li>
                <li>Credits: {editingPlan.credits.toLocaleString()} → {form.credits.toLocaleString()}</li>
                <li>Active: {editingPlan.is_active ? 'Yes' : 'No'} → {form.is_active ? 'Yes' : 'No'}</li>
                <li>AI Credits: {editingPlan.limits.aiCreditsMonthly.toLocaleString()} → {form.limits.aiCreditsMonthly.toLocaleString()}</li>
                <li>Emails/Mo: {editingPlan.limits.emailsPerMonth.toLocaleString()} → {form.limits.emailsPerMonth.toLocaleString()}</li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-grow py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                <span>Confirm & Save</span>
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-5 py-3 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Plan Modal */}
      {showClone && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !cloning && setShowClone(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Copy size={20} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Clone Plan</h3>
                <p className="text-xs text-slate-500">Create a new plan from an existing template</p>
              </div>
            </div>
            <div className="space-y-4 mb-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source Plan</label>
                <select value={cloneSource} onChange={e => setCloneSource(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none text-sm">
                  <option value="">Select plan to clone...</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Plan Name</label>
                <input type="text" value={cloneName} onChange={e => setCloneName(e.target.value)}
                  placeholder="e.g. Enterprise" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan Key</label>
                <input type="text" value={cloneKey} onChange={e => setCloneKey(e.target.value)}
                  placeholder="e.g. enterprise" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-slate-600 outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleClone} disabled={cloning || !cloneSource || !cloneName || !cloneKey}
                className="flex-grow py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {cloning ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                <span>Clone Plan</span>
              </button>
              <button onClick={() => setShowClone(false)} disabled={cloning}
                className="px-5 py-3 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ImageGeneratorDrawer open={showImageGen} onClose={() => setShowImageGen(false)} moduleType="pricing" />
    </div>
  );
};

export default PricingManagement;
