import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { sendTrackedEmail } from '../../lib/emailTracking';
import { User } from '../../types';
import {
  PlusIcon, EditIcon, CheckIcon, RefreshIcon, XIcon, UsersIcon,
  TrendUpIcon, TrendDownIcon, MailIcon, GlobeIcon, ActivityIcon,
  LinkIcon, LayersIcon, SendIcon, EyeIcon,
} from '../Icons';

interface Contributor {
  id: string;
  user_id: string;
  name: string;
  email: string;
  bio: string | null;
  website: string | null;
  status: string;
  posts_submitted: number;
  posts_published: number;
  invited_at: string;
  created_at: string;
  updated_at: string;
}

interface ContributorPost {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

const STATUS_BADGES: Record<string, string> = {
  invited: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
};

const emptyForm = {
  name: '',
  email: '',
  bio: '',
  website: '',
  status: 'invited' as 'invited' | 'active' | 'inactive',
};

interface Props {
  user: User;
  refreshProfile: () => Promise<void>;
}

const ContributorsPanel: React.FC<Props> = ({ user, refreshProfile }) => {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);

  // View posts
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contributorPosts, setContributorPosts] = useState<ContributorPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const fetchContributors = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('guest_contributors')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setContributors(data);
    } catch (err) {
      console.error('Failed to fetch contributors:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { fetchContributors(); }, [fetchContributors]);

  // KPI stats
  const kpiStats = useMemo(() => {
    const total = contributors.length;
    const active = contributors.filter(c => c.status === 'active').length;
    const submitted = contributors.reduce((sum, c) => sum + c.posts_submitted, 0);
    const published = contributors.reduce((sum, c) => sum + c.posts_published, 0);
    return [
      { label: 'Contributors', value: total, icon: <UsersIcon className="w-4 h-4" />, color: 'indigo', trend: `${total} total`, up: true },
      { label: 'Active', value: active, icon: <ActivityIcon className="w-4 h-4" />, color: 'emerald', trend: active > 0 ? 'Contributing' : 'None yet', up: active > 0 },
      { label: 'Submitted', value: submitted, icon: <LayersIcon className="w-4 h-4" />, color: 'violet', trend: submitted > 0 ? `${submitted} posts` : 'No posts yet', up: submitted > 0 },
      { label: 'Published', value: published, icon: <CheckIcon className="w-4 h-4" />, color: 'green', trend: published > 0 ? 'On your blog' : 'None yet', up: published > 0 },
    ];
  }, [contributors]);

  // Open add/edit
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
    setError(null);
  };

  const openEdit = (c: Contributor) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      email: c.email,
      bio: c.bio || '',
      website: c.website || '',
      status: c.status as 'invited' | 'active' | 'inactive',
    });
    setShowModal(true);
    setError(null);
  };

  // Save
  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        bio: form.bio.trim() || null,
        website: form.website.trim() || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error: err } = await supabase.from('guest_contributors').update(payload).eq('id', editingId).eq('user_id', user.id);
        if (err) throw err;
        setSuccess('Contributor updated.');
      } else {
        const { error: err } = await supabase.from('guest_contributors').insert([{ ...payload, user_id: user.id }]);
        if (err) throw err;
        setSuccess('Contributor added.');
      }
      setShowModal(false);
      await fetchContributors();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Remove this contributor?')) return;
    const { error: err } = await supabase.from('guest_contributors').delete().eq('id', id).eq('user_id', user.id);
    if (err) { setError(err.message); return; }
    setSuccess('Contributor removed.');
    await fetchContributors();
    setTimeout(() => setSuccess(null), 4000);
  };

  // Send invite email
  const handleSendInvite = async (c: Contributor) => {
    setSendingInvite(c.id);
    try {
      const result = await sendTrackedEmail({
        toEmail: c.email,
        subject: `You're invited to contribute to our blog!`,
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#1e293b;margin-bottom:8px">Guest Contributor Invitation</h2>
          <p style="color:#64748b;line-height:1.6">Hi ${c.name},</p>
          <p style="color:#64748b;line-height:1.6">We'd love for you to contribute a guest post to our blog. Your expertise would provide great value to our readers.</p>
          <p style="color:#64748b;line-height:1.6">If you're interested, please reply to this email and we'll share our content guidelines with you.</p>
          <p style="color:#64748b;line-height:1.6;margin-top:24px">Looking forward to hearing from you!</p>
        </div>`,
      });
      if (result.success) {
        setSuccess(`Invitation sent to ${c.email}.`);
      } else {
        setError(result.error || 'Failed to send invitation.');
      }
    } catch {
      setError('Failed to send invitation email.');
    } finally {
      setSendingInvite(null);
      setTimeout(() => { setSuccess(null); setError(null); }, 4000);
    }
  };

  // View posts for contributor
  const togglePosts = async (contributorId: string) => {
    if (expandedId === contributorId) { setExpandedId(null); return; }
    setExpandedId(contributorId);
    setLoadingPosts(true);
    try {
      const { data } = await supabase
        .from('blog_posts')
        .select('id, title, status, created_at')
        .eq('contributor_id', contributorId)
        .order('created_at', { ascending: false });
      setContributorPosts(data || []);
    } catch {
      setContributorPosts([]);
    } finally {
      setLoadingPosts(false);
    }
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

      {/* Add Button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400">{contributors.length} contributor{contributors.length !== 1 ? 's' : ''}</span>
        <button
          onClick={openAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Contributor</span>
        </button>
      </div>

      {/* Contributor Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-40 bg-white border border-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : contributors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <UsersIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">No contributors yet</p>
          <p className="text-xs text-slate-400 mt-1">Invite writers to submit guest posts to your blog</p>
          <button onClick={openAdd} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
            Add First Contributor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contributors.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 font-heading">{c.name}</h4>
                      <p className="text-[10px] text-slate-400">{c.email}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_BADGES[c.status] || 'bg-slate-100 text-slate-500'}`}>
                    {c.status}
                  </span>
                </div>

                {c.bio && <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">{c.bio}</p>}

                {c.website && (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-[10px] text-indigo-500 hover:text-indigo-700 mb-3">
                    <LinkIcon className="w-3 h-3" />
                    <span>{c.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}

                <div className="flex items-center space-x-4 mb-3 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <p className="text-sm font-black text-slate-700">{c.posts_submitted}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Submitted</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-slate-700">{c.posts_published}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Published</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-slate-400">{new Date(c.invited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Invited</p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button onClick={() => openEdit(c)} className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all">
                    <EditIcon className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleSendInvite(c)}
                    disabled={sendingInvite === c.id}
                    className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all disabled:opacity-40"
                  >
                    {sendingInvite === c.id ? <RefreshIcon className="w-3 h-3 animate-spin" /> : <SendIcon className="w-3 h-3" />}
                    <span>{sendingInvite === c.id ? 'Sending...' : 'Invite'}</span>
                  </button>
                  <button onClick={() => togglePosts(c.id)} className={`flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${expandedId === c.id ? 'text-violet-700 bg-violet-100' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}>
                    <EyeIcon className="w-3 h-3" />
                    <span>Posts</span>
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Remove">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded Posts */}
              {expandedId === c.id && (
                <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                  {loadingPosts ? (
                    <div className="h-8 bg-slate-50 rounded animate-pulse" />
                  ) : contributorPosts.length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center py-2">No posts from this contributor yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {contributorPosts.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                          <div>
                            <p className="text-xs font-bold text-slate-700 truncate max-w-[200px]">{p.title}</p>
                            <p className="text-[9px] text-slate-400">{new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            p.status === 'published' ? 'bg-emerald-50 text-emerald-600' :
                            p.status === 'pending_review' ? 'bg-amber-50 text-amber-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>{p.status.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ ADD/EDIT MODAL ══════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900 font-heading">{editingId ? 'Edit Contributor' : 'Add Contributor'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bio</label>
                <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none" placeholder="Short bio about the contributor..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Website</label>
                <input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="https://janedoe.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as 'invited' | 'active' | 'inactive' })} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none capitalize">
                  <option value="invited">Invited</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end space-x-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.email.trim()} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-40 flex items-center space-x-2">
                {saving ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : editingId ? 'Update' : 'Add'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContributorsPanel;
