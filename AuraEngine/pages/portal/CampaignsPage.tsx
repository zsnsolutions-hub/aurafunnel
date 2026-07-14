// AuraEngine/pages/portal/CampaignsPage.tsx
//
// Manage saved email campaigns (email_sequences): list them, edit their email
// steps + cadence, enroll status, and start sending. Fills the gap where
// campaigns were created (e.g. from Leads → "Create campaign") but had no
// surface to view or launch.

import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Megaphone, Plus, Trash2, Send, X, Users, Mail, Loader2, RefreshCw } from 'lucide-react';
import type { User } from '../../types';
import { useToast } from '../../components/ui/Toast';
import {
  listCampaigns, getSteps, getEnrolledCount, updateCampaign, addStep, updateStep, deleteStep,
  deleteCampaign, launchCampaign, type Campaign, type CampaignStep, type CampaignStatus,
} from '../../lib/campaigns';

interface LayoutContext { user: User }

const STATUS_META: Record<CampaignStatus, string> = {
  draft:     'bg-slate-100 text-slate-600',
  active:    'bg-emerald-50 text-emerald-700',
  paused:    'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
  archived:  'bg-slate-100 text-slate-400',
};
const STATUS_ORDER: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'archived'];

const CampaignsPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setCampaigns(await listCampaigns(user.id));
    setLoading(false);
  }, [user.id]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 font-heading">
            <Megaphone className="w-6 h-6 text-indigo-600" /> Campaigns
          </h1>
          <p className="text-sm text-slate-500 mt-1">Your saved email sequences — edit the steps, then start sending.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <Megaphone className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-500">No campaigns yet</p>
          <p className="text-xs text-slate-400 mt-1">Create one from Leads → select leads → “Create campaign”, then manage it here.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-indigo-200 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 truncate">{c.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_META[c.status]}`}>{c.status}</span>
                  </div>
                  {c.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.description}</p>}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.total_leads}</span>
                  <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{c.step_count ?? 0} step{(c.step_count ?? 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-5 mt-3 text-[11px] text-slate-400 tabular-nums">
                <span>{c.total_sent} sent</span><span>{c.total_opened} opened</span><span>{c.total_clicked} clicked</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <CampaignDrawer
          campaign={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
          toast={toast}
        />
      )}
    </div>
  );
};

// ── Detail drawer ──
interface DrawerProps {
  campaign: Campaign;
  onClose: () => void;
  onChanged: () => void;
  toast: (m: string, k?: 'info' | 'success' | 'warning' | 'error') => void;
}

const CampaignDrawer: React.FC<DrawerProps> = ({ campaign, onClose, onChanged, toast }) => {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [enrolled, setEnrolled] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    setSteps(await getSteps(campaign.id));
    setEnrolled(await getEnrolledCount(campaign.id));
  }, [campaign.id]);
  useEffect(() => { void reload(); }, [reload]);

  const saveMeta = useCallback(async (patch: Partial<Pick<Campaign, 'name' | 'description' | 'status'>>) => {
    const err = await updateCampaign(campaign.id, patch);
    if (err) toast(err, 'error'); else onChanged();
  }, [campaign.id, onChanged, toast]);

  const onAddStep = useCallback(async () => {
    setBusy(true);
    const next = (steps[steps.length - 1]?.step_number ?? 0) + 1;
    const created = await addStep(campaign.id, { subject: '', body_html: '', delay_days: steps.length === 0 ? 0 : 2, step_number: next });
    setBusy(false);
    if (created) { setSteps(prev => [...prev, created]); onChanged(); }
    else toast('Could not add step', 'error');
  }, [campaign.id, steps, onChanged, toast]);

  const onStepBlur = useCallback(async (id: string, patch: Partial<CampaignStep>) => {
    const err = await updateStep(id, patch);
    if (err) toast(err, 'error');
  }, [toast]);

  const onDeleteStep = useCallback(async (id: string) => {
    await deleteStep(id);
    setSteps(prev => prev.filter(s => s.id !== id));
    onChanged();
  }, [onChanged]);

  const patchLocalStep = (id: string, patch: Partial<CampaignStep>) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const onSend = useCallback(async () => {
    if (!confirm(`Start sending "${name}" to its enrolled leads now?`)) return;
    setSending(true);
    const res = await launchCampaign({ ...campaign, name });
    setSending(false);
    if ('error' in res) { toast(res.error, 'error'); return; }
    toast(`Sending started — ${res.total} email${res.total !== 1 ? 's' : ''} queued.`, 'success');
    setStatus('active');
    onChanged();
  }, [campaign, name, onChanged, toast]);

  const onDelete = useCallback(async () => {
    if (!confirm(`Delete "${name}" and its steps? Enrolled leads are unenrolled. This can't be undone.`)) return;
    await deleteCampaign(campaign.id);
    toast('Campaign deleted', 'success');
    onChanged(); onClose();
  }, [campaign.id, name, onChanged, onClose, toast]);

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-slate-900">Edit campaign</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Meta */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && saveMeta({ name: name.trim() })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-300" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} onBlur={() => saveMeta({ description: description.trim() || null as unknown as string })}
                placeholder="Optional" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-300" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{enrolled ?? '…'} enrolled</span>
              </div>
              <select value={status} onChange={e => { const s = e.target.value as CampaignStatus; setStatus(s); void saveMeta({ status: s }); }}
                className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg capitalize outline-none focus:border-indigo-300">
                {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Email steps</h3>
              <button onClick={onAddStep} disabled={busy}
                className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" /> Add step
              </button>
            </div>
            {steps.length === 0 && <p className="text-xs text-slate-400">No steps yet. Add one to define what gets sent.</p>}
            {steps.map((s, i) => (
              <div key={s.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500 flex items-center gap-1">
                      wait
                      <input type="number" min={0} value={s.delay_days}
                        onChange={e => patchLocalStep(s.id, { delay_days: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                        onBlur={() => onStepBlur(s.id, { delay_days: s.delay_days })}
                        className="w-14 px-2 py-1 text-xs border border-slate-200 rounded-md" />
                      days
                    </label>
                    <button onClick={() => onDeleteStep(s.id)} className="p-1 text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <input value={s.subject} placeholder="Subject line"
                  onChange={e => patchLocalStep(s.id, { subject: e.target.value })}
                  onBlur={() => onStepBlur(s.id, { subject: s.subject })}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg outline-none focus:border-indigo-300" />
                <textarea value={s.body_html} placeholder="Email body — use {{first_name}}, {{company}} for personalization"
                  onChange={e => patchLocalStep(s.id, { body_html: e.target.value })}
                  onBlur={() => onStepBlur(s.id, { body_html: s.body_html })}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-300 resize-y" />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button onClick={onSend} disabled={sending || steps.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Start sending
            </button>
            <button onClick={onDelete}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignsPage;
