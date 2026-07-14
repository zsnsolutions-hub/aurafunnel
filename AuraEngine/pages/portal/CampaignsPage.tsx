// AuraEngine/pages/portal/CampaignsPage.tsx
//
// Manage saved email campaigns (email_sequences): list them, edit their email
// steps + cadence, enroll status, and start sending. Fills the gap where
// campaigns were created (e.g. from Leads → "Create campaign") but had no
// surface to view or launch.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Megaphone, Plus, Trash2, Send, X, Users, Mail, Loader2, RefreshCw, Search, UserPlus, Eye, Braces, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import type { User } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { supabase } from '../../lib/supabase';
import {
  listCampaigns, getSteps, getEnrolledLeads, removeEnrollment, updateCampaign, addStep, updateStep, deleteStep,
  deleteCampaign, launchCampaign, searchLeadsForCampaign, addLeadToCampaign, previewStepForLead, previewVerbatimForLead,
  MERGE_FIELDS,
  type Campaign, type CampaignStep, type CampaignStatus, type EnrolledLead, type LeadHit,
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
          userId={user.id}
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
  userId: string;
  onClose: () => void;
  onChanged: () => void;
  toast: (m: string, k?: 'info' | 'success' | 'warning' | 'error') => void;
}

const CampaignDrawer: React.FC<DrawerProps> = ({ campaign, userId, onClose, onChanged, toast }) => {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [aiPersonalize, setAiPersonalize] = useState(campaign.ai_personalize);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [winOn, setWinOn] = useState(campaign.send_window_start != null);
  const [winStart, setWinStart] = useState(campaign.send_window_start ?? 9);
  const [winEnd, setWinEnd] = useState(campaign.send_window_end ?? 17);
  const [winWeekdays, setWinWeekdays] = useState(campaign.send_weekdays_only);
  const [winTz, setWinTz] = useState(campaign.send_timezone ?? browserTz);
  const persistWindow = useCallback((on: boolean, start: number, end: number, weekdays: boolean, tz: string) => {
    void updateCampaign(campaign.id, on
      ? { send_window_start: start, send_window_end: end, send_weekdays_only: weekdays, send_timezone: tz }
      : { send_window_start: null, send_window_end: null }).then(() => onChanged());
  }, [campaign.id, onChanged]);
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [audience, setAudience] = useState<EnrolledLead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    setSteps(await getSteps(campaign.id));
    setAudience(await getEnrolledLeads(campaign.id));
  }, [campaign.id]);
  useEffect(() => { void reload(); }, [reload]);

  const onRemoveLead = useCallback(async (e: EnrolledLead) => {
    setAudience(prev => (prev ?? []).filter(a => a.enrollmentId !== e.enrollmentId));
    await removeEnrollment(e.enrollmentId, campaign.id);
    onChanged();
  }, [campaign.id, onChanged]);

  // ── Add-leads search ──
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits([]); return; }
    setSearching(true);
    const excludeIds = (audience ?? []).map(a => a.leadId);
    const t = setTimeout(async () => {
      setHits(await searchLeadsForCampaign(userId, term, excludeIds));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, audience, userId]);

  const onAddLead = useCallback(async (hit: LeadHit) => {
    setAdding(hit.id);
    const enrollmentId = await addLeadToCampaign(campaign.id, userId, hit.id);
    setAdding(null);
    if (enrollmentId) {
      setAudience(prev => [{ enrollmentId, leadId: hit.id, name: hit.name, email: hit.email, company: hit.company, status: 'active' }, ...(prev ?? [])]);
      setHits(prev => prev.filter(h => h.id !== hit.id));
      onChanged();
    } else {
      toast('That lead is already in this campaign.', 'info');
    }
  }, [campaign.id, userId, onChanged, toast]);

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

  // ── Per-lead preview ──
  const [previewLeadId, setPreviewLeadId] = useState('');
  const [previews, setPreviews] = useState<Record<string, { loading?: boolean; subject?: string; body_html?: string; error?: string }>>({});
  useEffect(() => { if (!previewLeadId && audience && audience.length) setPreviewLeadId(audience[0].leadId); }, [audience, previewLeadId]);

  const onPreview = useCallback(async (step: CampaignStep) => {
    if (!previewLeadId) { toast('Add a lead to the audience first, then pick one to preview.', 'info'); return; }
    setPreviews(prev => ({ ...prev, [step.id]: { loading: true } }));
    // Verbatim mode is a deterministic merge — instant + free. AI mode costs a credit.
    let res: { subject: string; body_html: string } | { error: string };
    if (aiPersonalize) {
      const credit = await consumeCredits(supabase, 'content_suggestions');
      if (!credit.success) { setPreviews(prev => ({ ...prev, [step.id]: { error: credit.message } })); toast(credit.message, 'error'); return; }
      res = await previewStepForLead({ ...campaign, ai_personalize: aiPersonalize }, step, previewLeadId);
    } else {
      res = await previewVerbatimForLead(step, previewLeadId);
    }
    if ('error' in res) setPreviews(prev => ({ ...prev, [step.id]: { error: res.error } }));
    else setPreviews(prev => ({ ...prev, [step.id]: { subject: res.subject, body_html: res.body_html } }));
  }, [previewLeadId, campaign, aiPersonalize, toast]);

  const onPreviewAll = useCallback(() => { steps.forEach(s => void onPreview(s)); }, [steps, onPreview]);

  // Insert a {{field}} token at the caret of the last-focused subject/body input.
  const focusRef = useRef<{ id: string; field: 'subject' | 'body_html'; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const [fieldMenuStep, setFieldMenuStep] = useState<string | null>(null);
  const insertToken = useCallback((s: CampaignStep, token: string) => {
    setFieldMenuStep(null);
    const f = focusRef.current && focusRef.current.id === s.id ? focusRef.current : null;
    if (f?.el) {
      const el = f.el;
      const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
      const val = el.value.slice(0, start) + token + el.value.slice(end);
      patchLocalStep(s.id, { [f.field]: val } as Partial<CampaignStep>);
      void onStepBlur(s.id, { [f.field]: val } as Partial<CampaignStep>);
      requestAnimationFrame(() => { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); });
    } else {
      const val = `${s.body_html}${s.body_html && !s.body_html.endsWith(' ') ? ' ' : ''}${token}`;
      patchLocalStep(s.id, { body_html: val });
      void onStepBlur(s.id, { body_html: val });
    }
  }, [onStepBlur]);

  // A/B subject variants (the main subject is variant A).
  const setVariants = useCallback((s: CampaignStep, variants: string[]) => {
    patchLocalStep(s.id, { subject_variants: variants });
    void onStepBlur(s.id, { subject_variants: variants.map(v => v.trim()).filter(Boolean) });
  }, [onStepBlur]);
  const addVariant = useCallback((s: CampaignStep) => setVariants(s, [...(s.subject_variants ?? []), '']), [setVariants]);
  const patchVariant = useCallback((s: CampaignStep, idx: number, val: string) => {
    const arr = [...(s.subject_variants ?? [])]; arr[idx] = val; patchLocalStep(s.id, { subject_variants: arr });
  }, []);
  const blurVariant = useCallback((s: CampaignStep) => onStepBlur(s.id, { subject_variants: (s.subject_variants ?? []).map(v => v.trim()).filter(Boolean) }), [onStepBlur]);
  const removeVariant = useCallback((s: CampaignStep, idx: number) => setVariants(s, (s.subject_variants ?? []).filter((_, i) => i !== idx)), [setVariants]);

  const onDuplicateStep = useCallback(async (s: CampaignStep) => {
    setBusy(true);
    const next = (steps[steps.length - 1]?.step_number ?? 0) + 1;
    const created = await addStep(campaign.id, { subject: s.subject, body_html: s.body_html, delay_days: s.delay_days, step_number: next, subject_variants: s.subject_variants });
    setBusy(false);
    if (created) { setSteps(prev => [...prev, created]); onChanged(); } else toast('Could not duplicate step', 'error');
  }, [campaign.id, steps, onChanged, toast]);

  const onMoveStep = useCallback(async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= steps.length) return;
    const a = steps[idx], b = steps[j];
    // Swap their step_number and reorder locally.
    setSteps(prev => { const arr = [...prev]; [arr[idx], arr[j]] = [arr[j], arr[idx]]; return arr; });
    await Promise.all([updateStep(a.id, { step_number: b.step_number }), updateStep(b.id, { step_number: a.step_number })]);
  }, [steps]);

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
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{audience?.length ?? '…'} enrolled</span>
              </div>
              <select value={status} onChange={e => { const s = e.target.value as CampaignStatus; setStatus(s); void saveMeta({ status: s }); }}
                className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg capitalize outline-none focus:border-indigo-300">
                {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Content mode */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="pr-2">
                <p className="text-xs font-bold text-slate-800">{aiPersonalize ? 'AI-personalize each email' : 'Send my text as-is (mail-merge)'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {aiPersonalize
                    ? 'The AI rewrites each email per lead using their company, role & context.'
                    : 'Sends your exact copy with {{first_name}}, {{company}} filled in — no AI rewrite.'}
                </p>
              </div>
              <button
                onClick={() => { const next = !aiPersonalize; setAiPersonalize(next); setPreviews({}); void updateCampaign(campaign.id, { ai_personalize: next }).then(() => onChanged()); }}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${aiPersonalize ? 'bg-indigo-600' : 'bg-slate-300'}`}
                title="Toggle AI personalization">
                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${aiPersonalize ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            {/* Send window */}
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <p className="text-xs font-bold text-slate-800">Send only during set hours</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Hold emails until they're inside this window (checked every minute).</p>
                </div>
                <button onClick={() => { const next = !winOn; setWinOn(next); persistWindow(next, winStart, winEnd, winWeekdays, winTz); }}
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${winOn ? 'bg-indigo-600' : 'bg-slate-300'}`} title="Toggle send window">
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${winOn ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {winOn && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-semibold">Between</span>
                    <select value={winStart} onChange={e => { const v = +e.target.value; setWinStart(v); persistWindow(true, v, winEnd, winWeekdays, winTz); }}
                      className="px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-indigo-300">
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                    </select>
                    <span className="text-slate-400">and</span>
                    <select value={winEnd} onChange={e => { const v = +e.target.value; setWinEnd(v); persistWindow(true, winStart, v, winWeekdays, winTz); }}
                      className="px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-indigo-300">
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-semibold">Timezone</span>
                    <select value={winTz} onChange={e => { setWinTz(e.target.value); persistWindow(true, winStart, winEnd, winWeekdays, e.target.value); }}
                      className="flex-1 px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-indigo-300">
                      {Array.from(new Set([browserTz, 'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Asia/Karachi', 'Asia/Dubai'])).map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={winWeekdays} onChange={e => { setWinWeekdays(e.target.checked); persistWindow(true, winStart, winEnd, e.target.checked, winTz); }} />
                    Weekdays only (Mon–Fri)
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Target audience */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Target audience</h3>
              <span className="text-[11px] text-slate-400">{audience?.length ?? 0} lead{(audience?.length ?? 0) !== 1 ? 's' : ''}</span>
            </div>
            {audience === null ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : audience.length === 0 ? (
              <p className="text-xs text-slate-400">No leads yet. Add them from the <span className="font-semibold">Leads</span> page → select leads → <span className="font-semibold">Add to campaign</span>.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-50 max-h-56 overflow-y-auto">
                {audience.map(a => (
                  <div key={a.enrollmentId} className="flex items-center gap-3 px-3 py-2 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{a.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{a.email}{a.company ? ` · ${a.company}` : ''}</p>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{a.status}</span>
                    <button onClick={() => onRemoveLead(a)} title="Remove from campaign"
                      className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Add-leads search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search leads by name, email, or company to add…"
                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-300" />
              {searching && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
              {query.trim().length >= 2 && !searching && (
                <div className="absolute left-0 right-0 mt-1 z-10 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
                  {hits.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-400">No matching leads (or all already added).</p>
                  ) : hits.map(h => (
                    <button key={h.id} onClick={() => onAddLead(h)} disabled={adding === h.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 transition-colors disabled:opacity-50">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{h.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{h.email}{h.company ? ` · ${h.company}` : ''}</p>
                      </div>
                      {adding === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : <UserPlus className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400">…or from the Leads page: select leads and choose “Add to campaign”.</p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Email steps</h3>
              <div className="flex items-center gap-3">
                {steps.length > 0 && (
                  <button onClick={onPreviewAll} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600">
                    <Eye className="w-3.5 h-3.5" /> Preview all
                  </button>
                )}
                <button onClick={onAddStep} disabled={busy}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" /> Add step
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 -mt-1">
              {aiPersonalize
                ? 'Each email is AI-personalized per lead at send. Use Preview (eye) to see what a lead will get.'
                : 'Your exact copy is sent with {{fields}} filled per lead. Use Preview (eye) to check it.'}
            </p>
            {(audience && audience.length > 0) && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-semibold">Preview as</span>
                <select value={previewLeadId} onChange={e => setPreviewLeadId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-300">
                  {audience.map(a => <option key={a.enrollmentId} value={a.leadId}>{a.name}{a.company ? ` · ${a.company}` : ''}</option>)}
                </select>
              </div>
            )}
            {steps.length === 0 && <p className="text-xs text-slate-400">No steps yet. Add one to define what gets sent.</p>}
            {steps.map((s, i) => (
              <div key={s.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step {i + 1}</span>
                    <button onClick={() => onMoveStep(i, -1)} disabled={i === 0} title="Move up" className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onMoveStep(i, 1)} disabled={i === steps.length - 1} title="Move down" className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
                      wait
                      <input type="number" min={0} value={s.delay_days}
                        onChange={e => patchLocalStep(s.id, { delay_days: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                        onBlur={() => onStepBlur(s.id, { delay_days: s.delay_days })}
                        className="w-14 px-2 py-1 text-xs border border-slate-200 rounded-md" />
                      days
                    </label>
                    <div className="relative">
                      <button onClick={() => setFieldMenuStep(fieldMenuStep === s.id ? null : s.id)} title="Insert field"
                        className="p-1 text-slate-400 hover:text-indigo-600"><Braces className="w-3.5 h-3.5" /></button>
                      {fieldMenuStep === s.id && (
                        <>
                          <div className="fixed inset-0 z-[121]" onClick={() => setFieldMenuStep(null)} />
                          <div className="absolute right-0 mt-1 z-[122] w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 max-h-64 overflow-y-auto">
                            <p className="px-3 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Insert field</p>
                            {MERGE_FIELDS.map(f => (
                              <button key={f.token} onClick={() => insertToken(s, f.token)}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-indigo-50">
                                <span className="text-slate-700">{f.label}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{f.token.replace(/[{}]/g, '')}</span>
                              </button>
                            ))}
                            <p className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-50 mt-1">Custom: <span className="font-mono">{'{{custom.key}}'}</span></p>
                          </div>
                        </>
                      )}
                    </div>
                    <button onClick={() => onPreview(s)} disabled={previews[s.id]?.loading} title="Preview for the selected lead"
                      className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-50">
                      {previews[s.id]?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => onDuplicateStep(s)} disabled={busy} title="Duplicate step" className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-50"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onDeleteStep(s.id)} title="Delete step" className="p-1 text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input value={s.subject} placeholder="Subject line"
                    onChange={e => patchLocalStep(s.id, { subject: e.target.value })}
                    onFocus={e => { focusRef.current = { id: s.id, field: 'subject', el: e.target }; }}
                    onBlur={() => onStepBlur(s.id, { subject: s.subject })}
                    className="flex-1 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg outline-none focus:border-indigo-300" />
                  {(s.subject_variants?.length ?? 0) > 0 && <span className="text-[9px] font-black text-slate-400 uppercase">A</span>}
                </div>
                {(s.subject_variants ?? []).map((v, vi) => (
                  <div key={vi} className="flex items-center gap-2">
                    <input value={v} placeholder={`Subject variant ${String.fromCharCode(66 + vi)}`}
                      onChange={e => patchVariant(s, vi, e.target.value)}
                      onBlur={() => blurVariant(s)}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-300" />
                    <span className="text-[9px] font-black text-slate-400 uppercase">{String.fromCharCode(66 + vi)}</span>
                    <button onClick={() => removeVariant(s, vi)} className="p-1 text-slate-300 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => addVariant(s)} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600">+ A/B subject variant</button>
                <textarea value={s.body_html} placeholder={aiPersonalize ? 'Write the gist — the AI personalizes it per lead. {{first_name}}, {{company}} are hints.' : 'Write the exact email. {{first_name}}, {{company}} are filled per lead.'}
                  onChange={e => patchLocalStep(s.id, { body_html: e.target.value })}
                  onFocus={e => { focusRef.current = { id: s.id, field: 'body_html', el: e.target }; }}
                  onBlur={() => onStepBlur(s.id, { body_html: s.body_html })}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-300 resize-y" />

                {previews[s.id] && !previews[s.id].loading && (
                  previews[s.id].error ? (
                    <p className="text-[11px] text-rose-600">{previews[s.id].error}</p>
                  ) : (
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-1">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Preview for {audience?.find(a => a.leadId === previewLeadId)?.name ?? 'lead'}</p>
                      <p className="text-xs font-bold text-slate-800">{previews[s.id].subject}</p>
                      <div className="text-xs text-slate-600 [&_p]:mb-1.5" dangerouslySetInnerHTML={{ __html: previews[s.id].body_html ?? '' }} />
                    </div>
                  )
                )}
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
