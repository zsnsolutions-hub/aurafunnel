import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { generateGuestPostPitch, parseGuestPostPitchResponse } from '../../lib/gemini';
import { User } from '../../types';
import {
  PlusIcon, EditIcon, SparklesIcon, CheckIcon, RefreshIcon, XIcon,
  TrendUpIcon, TrendDownIcon, GlobeIcon, MailIcon, TargetIcon,
  FilterIcon, CalendarIcon, LinkIcon, ActivityIcon, BrainIcon,
} from '../Icons';

interface OutreachOpportunity {
  id: string;
  user_id: string;
  blog_name: string;
  blog_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  domain_authority: number | null;
  monthly_traffic: string | null;
  status: string;
  pitch_subject: string | null;
  pitch_body: string | null;
  notes: string | null;
  target_publish_date: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
}

const STATUSES = ['researching', 'pitched', 'accepted', 'writing', 'published', 'rejected'] as const;
type OutreachStatus = typeof STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  researching: 'bg-slate-100 text-slate-600',
  pitched: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  writing: 'bg-violet-100 text-violet-700',
  published: 'bg-green-100 text-green-700',
  rejected: 'bg-rose-100 text-rose-600',
};

const PITCH_TONES = ['Professional', 'Friendly', 'Casual', 'Enthusiastic', 'Authoritative'];

const emptyForm = {
  blog_name: '',
  blog_url: '',
  contact_name: '',
  contact_email: '',
  domain_authority: '' as string | number,
  monthly_traffic: '',
  status: 'researching' as OutreachStatus,
  notes: '',
  target_publish_date: '',
  published_url: '',
};

interface Props {
  user: User;
  refreshProfile: () => Promise<void>;
}

const OutreachPanel: React.FC<Props> = ({ user, refreshProfile }) => {
  const [opportunities, setOpportunities] = useState<OutreachOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | OutreachStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // AI Pitch state
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [pitchOpportunity, setPitchOpportunity] = useState<OutreachOpportunity | null>(null);
  const [pitchTone, setPitchTone] = useState('Professional');
  const [pitchTopics, setPitchTopics] = useState('');
  const [pitchGenerating, setPitchGenerating] = useState(false);
  const [pitchResult, setPitchResult] = useState<{ subject: string; body: string } | null>(null);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('guest_post_outreach')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setOpportunities(data);
    } catch (err) {
      console.error('Failed to fetch outreach:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { fetchOpportunities(); }, [fetchOpportunities]);

  // KPI stats
  const kpiStats = useMemo(() => {
    const total = opportunities.length;
    const pitched = opportunities.filter(o => o.status === 'pitched').length;
    const accepted = opportunities.filter(o => ['accepted', 'writing', 'published'].includes(o.status)).length;
    const published = opportunities.filter(o => o.status === 'published').length;
    return [
      { label: 'Opportunities', value: total, icon: <GlobeIcon className="w-4 h-4" />, color: 'indigo', trend: `${total} tracked`, up: true },
      { label: 'Pitched', value: pitched, icon: <MailIcon className="w-4 h-4" />, color: 'blue', trend: pitched > 0 ? 'In progress' : 'Start pitching', up: pitched > 0 },
      { label: 'Accepted', value: accepted, icon: <CheckIcon className="w-4 h-4" />, color: 'emerald', trend: accepted > 0 ? 'Writing queued' : 'None yet', up: accepted > 0 },
      { label: 'Published', value: published, icon: <LinkIcon className="w-4 h-4" />, color: 'green', trend: published > 0 ? 'Live backlinks' : 'None yet', up: published > 0 },
    ];
  }, [opportunities]);

  // Filtered
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return opportunities;
    return opportunities.filter(o => o.status === statusFilter);
  }, [opportunities, statusFilter]);

  // Open add/edit modal
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
    setError(null);
  };

  const openEdit = (opp: OutreachOpportunity) => {
    setEditingId(opp.id);
    setForm({
      blog_name: opp.blog_name,
      blog_url: opp.blog_url || '',
      contact_name: opp.contact_name || '',
      contact_email: opp.contact_email || '',
      domain_authority: opp.domain_authority ?? '',
      monthly_traffic: opp.monthly_traffic || '',
      status: opp.status as OutreachStatus,
      notes: opp.notes || '',
      target_publish_date: opp.target_publish_date || '',
      published_url: opp.published_url || '',
    });
    setShowModal(true);
    setError(null);
  };

  // Save
  const handleSave = async () => {
    if (!form.blog_name.trim()) { setError('Blog name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        blog_name: form.blog_name.trim(),
        blog_url: form.blog_url.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        domain_authority: form.domain_authority !== '' ? Number(form.domain_authority) : null,
        monthly_traffic: form.monthly_traffic.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
        target_publish_date: form.target_publish_date || null,
        published_url: form.published_url.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error: err } = await supabase.from('guest_post_outreach').update(payload).eq('id', editingId).eq('user_id', user.id);
        if (err) throw err;
        setSuccess('Opportunity updated.');
      } else {
        const { error: err } = await supabase.from('guest_post_outreach').insert([{ ...payload, user_id: user.id }]);
        if (err) throw err;
        setSuccess('Opportunity added.');
      }
      setShowModal(false);
      await fetchOpportunities();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this opportunity?')) return;
    const { error: err } = await supabase.from('guest_post_outreach').delete().eq('id', id).eq('user_id', user.id);
    if (err) { setError(err.message); return; }
    setSuccess('Opportunity deleted.');
    await fetchOpportunities();
    setTimeout(() => setSuccess(null), 4000);
  };

  // AI Pitch
  const openPitchModal = (opp: OutreachOpportunity) => {
    setPitchOpportunity(opp);
    setPitchTone('Professional');
    setPitchTopics('');
    setPitchResult(null);
    setShowPitchModal(true);
  };

  const handleGeneratePitch = async () => {
    if (!pitchOpportunity) return;
    setPitchGenerating(true);
    setPitchResult(null);
    try {
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS['guest_post_pitch']);
      if (!creditResult.success) {
        setError(creditResult.message || 'Insufficient credits.');
        setPitchGenerating(false);
        return;
      }
      const result = await generateGuestPostPitch({
        blogName: pitchOpportunity.blog_name,
        blogUrl: pitchOpportunity.blog_url || undefined,
        contactName: pitchOpportunity.contact_name || undefined,
        tone: pitchTone,
        proposedTopics: pitchTopics.trim() || undefined,
      }, user.id);

      const parsed = parseGuestPostPitchResponse(result.text);
      setPitchResult(parsed);
      if (refreshProfile) await refreshProfile();
    } catch {
      setError('Pitch generation failed. Please try again.');
    } finally {
      setPitchGenerating(false);
    }
  };

  const savePitchToOpportunity = async () => {
    if (!pitchResult || !pitchOpportunity) return;
    const { error: err } = await supabase
      .from('guest_post_outreach')
      .update({
        pitch_subject: pitchResult.subject,
        pitch_body: pitchResult.body,
        status: pitchOpportunity.status === 'researching' ? 'pitched' : pitchOpportunity.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pitchOpportunity.id)
      .eq('user_id', user.id);
    if (err) { setError(err.message); return; }
    setShowPitchModal(false);
    setSuccess('Pitch saved to opportunity.');
    await fetchOpportunities();
    setTimeout(() => setSuccess(null), 4000);
  };

  return (
    <div className="space-y-5">
      {/* Toasts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl font-bold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-0.5 text-red-400 hover:text-red-600"><XIcon className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-xl font-bold flex items-center space-x-2">
          <CheckIcon className="w-4 h-4" /><span>{success}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiStats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg bg-${s.color}-100 flex items-center justify-center text-${s.color}-600`}>{s.icon}</div>
              {s.up ? <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" /> : <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />}
            </div>
            <p className="text-xl font-black text-slate-800">{s.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-[10px] mt-1 font-semibold ${s.up ? 'text-emerald-500' : 'text-rose-500'}`}>{s.trend}</p>
          </div>
        ))}
      </div>

      {/* Status Filter + Add */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center space-x-1 bg-white rounded-xl border border-slate-100 shadow-sm p-1 flex-wrap">
          {(['all', ...STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                statusFilter === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={openAdd}
          className="ml-auto flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Opportunity</span>
        </button>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white border border-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <GlobeIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">No outreach opportunities</p>
          <p className="text-xs text-slate-400 mt-1">{statusFilter !== 'all' ? 'Try a different filter' : 'Start building your guest post pipeline'}</p>
          <button onClick={openAdd} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
            Add First Opportunity
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Blog</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider hidden md:table-cell">Contact</th>
                  <th className="text-center px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider hidden lg:table-cell">DA</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider hidden lg:table-cell">Target Date</th>
                  <th className="text-right px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(opp => (
                  <tr key={opp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-800">{opp.blog_name}</p>
                      {opp.blog_url && (
                        <a href={opp.blog_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-500 hover:text-indigo-700 truncate block max-w-[200px]">
                          {opp.blog_url.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      {opp.contact_name && <p className="text-xs font-semibold text-slate-700">{opp.contact_name}</p>}
                      {opp.contact_email && <p className="text-[10px] text-slate-400">{opp.contact_email}</p>}
                      {!opp.contact_name && !opp.contact_email && <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center hidden lg:table-cell">
                      {opp.domain_authority != null ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                          opp.domain_authority >= 50 ? 'bg-emerald-100 text-emerald-700' :
                          opp.domain_authority >= 25 ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{opp.domain_authority}</span>
                      ) : <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_COLORS[opp.status] || 'bg-slate-100 text-slate-600'}`}>
                        {opp.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {opp.target_publish_date ? (
                        <span className="text-xs text-slate-600">{new Date(opp.target_publish_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      ) : <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button onClick={() => openEdit(opp)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit">
                          <EditIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openPitchModal(opp)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all" title="AI Pitch">
                          <SparklesIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(opp.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Delete">
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ ADD/EDIT MODAL ══════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-black text-slate-900 font-heading">{editingId ? 'Edit Opportunity' : 'Add Opportunity'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Blog Name *</label>
                  <input value={form.blog_name} onChange={e => setForm({ ...form, blog_name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="TechCrunch" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Blog URL</label>
                  <input value={form.blog_url} onChange={e => setForm({ ...form, blog_url: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="https://example.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Name</label>
                  <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="John Smith" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Email</label>
                  <input value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="editor@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain Authority</label>
                  <input type="number" min="0" max="100" value={form.domain_authority} onChange={e => setForm({ ...form, domain_authority: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="0-100" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Traffic</label>
                  <input value={form.monthly_traffic} onChange={e => setForm({ ...form, monthly_traffic: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="50K" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as OutreachStatus })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none capitalize">
                    {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Publish Date</label>
                  <input type="date" value={form.target_publish_date} onChange={e => setForm({ ...form, target_publish_date: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Published URL</label>
                  <input value={form.published_url} onChange={e => setForm({ ...form, published_url: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="https://example.com/your-post" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none" placeholder="Any notes about this opportunity..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end space-x-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.blog_name.trim()} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-40 flex items-center space-x-2">
                {saving ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : editingId ? 'Update' : 'Add'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ AI PITCH MODAL ══════════════ */}
      {showPitchModal && pitchOpportunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowPitchModal(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-black text-slate-900 font-heading">Generate Pitch</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">{pitchOpportunity.blog_name}</p>
                </div>
              </div>
              <button onClick={() => setShowPitchModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {PITCH_TONES.map(t => (
                    <button
                      key={t}
                      onClick={() => setPitchTone(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        pitchTone === t ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Proposed Topics (optional)</label>
                <textarea
                  value={pitchTopics}
                  onChange={e => setPitchTopics(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                  placeholder="e.g. AI-powered sales funnels, B2B lead scoring strategies"
                />
              </div>
              <button
                onClick={handleGeneratePitch}
                disabled={pitchGenerating}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-all disabled:opacity-40 flex items-center justify-center space-x-2 shadow-lg shadow-purple-200"
              >
                {pitchGenerating ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                <span>{pitchGenerating ? 'Generating...' : 'Generate Pitch'}</span>
                {!pitchGenerating && <span className="px-1.5 py-0.5 text-[9px] font-black bg-white/20 rounded-md">{CREDIT_COSTS['guest_post_pitch']} cr</span>}
              </button>

              {pitchResult && (
                <div className="space-y-3 mt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Line</label>
                    <input
                      value={pitchResult.subject}
                      onChange={e => setPitchResult({ ...pitchResult, subject: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Body</label>
                    <textarea
                      value={pitchResult.body}
                      onChange={e => setPitchResult({ ...pitchResult, body: e.target.value })}
                      rows={10}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm leading-relaxed focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                    />
                  </div>
                  <button
                    onClick={savePitchToOpportunity}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center space-x-2"
                  >
                    <CheckIcon className="w-4 h-4" />
                    <span>Save Pitch to Opportunity</span>
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">Edit the pitch above, then save it to the opportunity record.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutreachPanel;
