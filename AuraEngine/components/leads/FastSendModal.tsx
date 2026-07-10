// AuraEngine/components/leads/FastSendModal.tsx
//
// Fast validated send (Phase D, §6). Generate -> Validate -> Preview -> Send/
// Schedule. Runs a preflight (business, sender, suppression, Mails.so validation,
// compliance footer, content) and shows the EXACT html that will be sent. The
// hard blocks (suppressed / invalid / risky) are also enforced server-side by
// sendTrackedEmail + the send-email edge fn — this UI just surfaces them early.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Loader2, Send, Clock, Sparkles, Check, AlertTriangle, Ban } from 'lucide-react';
import { Lead, BusinessProfile, ContentType } from '../../types';
import { supabase } from '../../lib/supabase';
import { sendTrackedEmail } from '../../lib/emailTracking';
import { generateLeadContent, buildEmailFooter } from '../../lib/gemini';
import { consumeCredits } from '../../lib/credits';
import { getValidations, statusMeta, type ValidationStatus } from '../../lib/emailValidation';
import { useToast } from '../ui/Toast';

interface Sender { id: string; from_email: string; from_name: string | null; is_default: boolean; status: string }

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  businessId: string | null;
  workspaceId: string | null;
  userId: string;
  businessProfile?: BusinessProfile;
}

const wrapBody = (body: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;max-width:600px">${
    body.trim().split('\n').map(l => l.trim()).join('<br>')
  }</div>`;

export const FastSendModal: React.FC<Props> = ({ open, onClose, lead, businessId, workspaceId, userId, businessProfile }) => {
  const { toast } = useToast();
  const email = (lead.primary_email ?? '').trim();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState<string>('');
  const [footerOn, setFooterOn] = useState(true);
  const [status, setStatus] = useState<ValidationStatus | undefined>();
  const [suppressed, setSuppressed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [sendRes, valMap, supRes] = await Promise.all([
        workspaceId
          ? supabase.from('sender_accounts').select('id,from_email,from_name,is_default,status')
              .eq('workspace_id', workspaceId).eq('status', 'active').order('is_default', { ascending: false })
          : Promise.resolve({ data: [] }),
        businessId && email ? getValidations(businessId, [email]) : Promise.resolve(new Map()),
        email ? supabase.from('suppressions').select('reason').eq('email', email.toLowerCase()).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      const list = ((sendRes as { data: Sender[] }).data ?? []);
      setSenders(list);
      setSenderId(list.find(s => s.is_default)?.id ?? list[0]?.id ?? '');
      setStatus((valMap as Map<string, { status: ValidationStatus }>).get(email.toLowerCase())?.status);
      setSuppressed(!!(supRes as { data: unknown }).data);
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, businessId, email]);

  const footer = useMemo(() => (footerOn ? buildEmailFooter(businessProfile) : ''), [footerOn, businessProfile]);
  const htmlBody = useMemo(() => wrapBody(body) + footer, [body, footer]);
  const sender = senders.find(s => s.id === senderId);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const credit = await consumeCredits(supabase, 'content_generation');
      if (!credit.success) { toast(credit.message, 'error'); return; }
      const res = await generateLeadContent(lead, ContentType.EMAIL, businessProfile, userId);
      const text = res.text || '';
      // First non-empty line -> subject if we don't have one; rest -> body.
      if (!subject.trim()) {
        const lines = text.split('\n').filter(Boolean);
        const subjLine = lines.find(l => /^subject[:\-]/i.test(l));
        if (subjLine) setSubject(subjLine.replace(/^subject[:\-]\s*/i, '').trim());
      }
      setBody(text.replace(/^subject[:\-].*$/im, '').trim());
      toast('Draft generated', 'success');
    } catch (e) {
      toast((e as Error).message || 'Generation failed', 'error');
    } finally { setGenerating(false); }
  }, [lead, businessProfile, userId, subject, toast]);

  const blocked = suppressed || status === 'invalid';
  const canSend = !!email && !!subject.trim() && !!body.trim() && !blocked && !sending;

  const doSend = useCallback(async (schedule: boolean) => {
    if (!canSend) return;
    if (schedule && !scheduleAt) { toast('Pick a date & time to schedule.', 'error'); return; }
    setSending(true);
    try {
      if (schedule) {
        const { error } = await supabase.from('scheduled_emails').insert({
          owner_id: userId, lead_id: lead.id, to_email: email, subject,
          html_body: htmlBody, scheduled_at: new Date(scheduleAt).toISOString(),
          status: 'pending', from_email: sender?.from_email ?? null,
        });
        if (error) throw new Error(error.message);
        toast(`Scheduled for ${new Date(scheduleAt).toLocaleString()}`, 'success');
        onClose();
      } else {
        const res = await sendTrackedEmail({ leadId: lead.id, toEmail: email, subject, htmlBody, fromEmail: sender?.from_email });
        if (!res.success) { toast(res.error || 'Send failed', 'error'); return; }
        toast('Email sent', 'success');
        onClose();
      }
    } catch (e) {
      toast((e as Error).message || 'Failed', 'error');
    } finally { setSending(false); }
  }, [canSend, scheduleAt, userId, lead.id, email, subject, htmlBody, sender, onClose, toast]);

  if (!open) return null;

  const vmeta = statusMeta(status);
  const checks: { ok: boolean; warn?: boolean; label: string }[] = [
    { ok: !!businessId, label: 'Business selected' },
    { ok: !!sender || senders.length === 0, warn: senders.length === 0, label: sender ? `Sender: ${sender.from_email}` : 'Sender: workspace default' },
    { ok: !suppressed, label: suppressed ? 'Recipient is suppressed — blocked' : 'Not on suppression list' },
    { ok: status === 'valid', warn: status !== 'valid' && status !== 'invalid', label: `Validation: ${status ? vmeta.label : 'unvalidated'}` },
    { ok: footerOn, warn: !footerOn, label: footerOn ? 'Compliance footer included' : 'No compliance footer' },
    { ok: !!subject.trim() && !!body.trim(), label: 'Subject & body present' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Fast Send · {lead.name || email}</h2>
          <button onClick={onClose} disabled={sending} className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-0 overflow-hidden flex-1 min-h-0">
          {/* Compose */}
          <div className="p-5 space-y-3 overflow-y-auto border-r border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">To</label>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status === 'valid' ? 'text-emerald-700 bg-emerald-50' : status === 'invalid' ? 'text-rose-700 bg-rose-50' : status === 'risky' ? 'text-amber-700 bg-amber-50' : 'text-slate-500 bg-slate-100'}`}>{status ? vmeta.label : 'unvalidated'}</span>
            </div>
            <input value={email} readOnly className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500" />

            {senders.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-600">From</label>
                <select value={senderId} onChange={e => setSenderId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1">
                  {senders.map(s => <option key={s.id} value={s.id}>{s.from_name ? `${s.from_name} · ` : ''}{s.from_email}{s.is_default ? ' (default)' : ''}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Subject</label>
              <button onClick={generate} disabled={generating} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate with AI
              </button>
            </div>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={9} placeholder="Write your email, or Generate with AI…" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none" />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={footerOn} onChange={e => setFooterOn(e.target.checked)} className="rounded" />
              Append compliance / unsubscribe footer
            </label>
          </div>

          {/* Preflight + preview */}
          <div className="p-5 space-y-4 overflow-y-auto bg-slate-50/50">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preflight</p>
              <ul className="space-y-1.5">
                {checks.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    {!c.ok && !c.warn ? <Ban size={13} className="text-rose-500 shrink-0" /> : c.warn ? <AlertTriangle size={13} className="text-amber-500 shrink-0" /> : <Check size={13} className="text-emerald-500 shrink-0" />}
                    <span className={!c.ok && !c.warn ? 'text-rose-600' : c.warn ? 'text-amber-700' : 'text-slate-600'}>{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preview (exactly what's sent)</p>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-bold text-slate-800 mb-2 pb-2 border-b border-slate-100">{subject || <span className="text-slate-300">No subject</span>}</p>
                <div className="text-xs" dangerouslySetInnerHTML={{ __html: htmlBody }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
          {blocked && <span className="text-xs text-rose-600 font-medium mr-auto">{suppressed ? 'Recipient suppressed — cannot send.' : 'Email invalid — cannot send.'}</span>}
          <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 ml-auto" />
          <button onClick={() => doSend(true)} disabled={!canSend || !scheduleAt} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
            <Clock size={15} /> Schedule
          </button>
          <button onClick={() => doSend(false)} disabled={!canSend} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send now
          </button>
        </div>
      </div>
    </div>
  );
};

export default FastSendModal;
