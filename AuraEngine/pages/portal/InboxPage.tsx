// AuraEngine/pages/portal/InboxPage.tsx
//
// Unified inbox — replies to your campaigns/outreach, matched to the lead and the
// message they replied to. Fed by the inbound-email webhook. Read a reply, jump
// to the lead, or reply from your mail client.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Inbox as InboxIcon, RefreshCw, ArrowRight, Send, Search, Mail, Loader2 } from 'lucide-react';
import type { User } from '../../types';
import { useToast } from '../../components/ui/Toast';
import RichReplyEditor, { type RichReplyHandle } from '../../components/portal/RichReplyEditor';
import { listInbound, markInboundRead, sendReply, inboundSenderName, type InboundEmail } from '../../lib/inbox';

interface LayoutContext { user: User }

const relTime = (iso: string): string => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const InboxPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rows, setRows] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyEmpty, setReplyEmpty] = useState(true);
  const [sending, setSending] = useState(false);
  const editorRef = useRef<RichReplyHandle>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listInbound(user.id, unreadOnly));
    setLoading(false);
  }, [user.id, unreadOnly]);
  useEffect(() => { void load(); }, [load]);

  const open = useCallback(async (m: InboundEmail) => {
    const next = openId === m.id ? null : m.id;
    setOpenId(next);
    setReplyEmpty(true);
    if (next && !m.is_read) {
      setRows(prev => prev.map(r => r.id === m.id ? { ...r, is_read: true } : r));
      await markInboundRead(m.id, true);
    }
  }, [openId]);

  const onSendReply = useCallback(async (m: InboundEmail) => {
    const html = editorRef.current?.getHtml() ?? '';
    setSending(true);
    const res = await sendReply(m, html);
    setSending(false);
    if (!res.ok) { toast(res.error || 'Reply failed', 'error'); return; }
    toast(`Reply sent to ${inboundSenderName(m)}`, 'success');
    editorRef.current?.clear();
    setOpenId(null);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(m =>
      inboundSenderName(m).toLowerCase().includes(q) ||
      m.from_email.toLowerCase().includes(q) ||
      (m.subject ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  const unread = rows.filter(r => !r.is_read).length;

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 font-heading">
            <InboxIcon className="w-6 h-6 text-indigo-600" /> Inbox
            {unread > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">{unread}</span>}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Replies to your outreach, matched to each lead.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {([['all', 'All'], ['unread', 'Unread']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setUnreadOnly(k === 'unread')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${(k === 'unread') === unreadOnly ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-200'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search sender or subject…"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-300 transition-colors w-56" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-500">{rows.length === 0 ? 'No replies yet' : 'No matches'}</p>
            <p className="text-xs text-slate-400 mt-1">When leads reply to your campaigns, they show up here.</p>
          </div>
        ) : filtered.map(m => {
          const isOpen = openId === m.id;
          return (
            <div key={m.id} className={`${!m.is_read ? 'bg-indigo-50/30' : ''}`}>
              <button onClick={() => open(m)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/60 transition-colors">
                {!m.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                {m.is_read && <span className="w-2 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm truncate ${!m.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{inboundSenderName(m)}</p>
                  <p className="text-xs text-slate-500 truncate">{m.subject || '(no subject)'}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{relTime(m.received_at)}</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 pt-1 space-y-3 bg-slate-50/40">
                  <p className="text-[11px] text-slate-400">{m.from_name ? `${m.from_name} · ` : ''}{m.from_email}{m.to_email ? ` → ${m.to_email}` : ''}</p>
                  {m.body_html ? (
                    // Untrusted email HTML — isolate it: sandbox blocks scripts,
                    // forms, same-origin access, and top-level navigation.
                    <iframe
                      title="Email body"
                      sandbox=""
                      srcDoc={`<!doctype html><meta name="color-scheme" content="light"><base target="_blank"><div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#334155;padding:4px">${m.body_html}</div>`}
                      className="w-full h-72 border border-slate-100 rounded-xl bg-white"
                    />
                  ) : (
                    <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto border border-slate-100 rounded-xl bg-white p-3">
                      {m.body_text || '(empty message)'}
                    </div>
                  )}
                  {/* In-app reply */}
                  <div className="space-y-2">
                    <RichReplyEditor ref={editorRef} placeholder={`Reply to ${inboundSenderName(m)}…`}
                      onInput={() => setReplyEmpty(editorRef.current?.isEmpty() ?? true)} />
                    <div className="flex items-center gap-2">
                      <button onClick={() => onSendReply(m)} disabled={sending || replyEmpty}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send reply
                      </button>
                      {m.lead_id && (
                        <button onClick={() => navigate(`/portal/leads/${m.lead_id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                          <ArrowRight className="w-3.5 h-3.5" /> Open lead
                        </button>
                      )}
                      {!m.lead_id && <span className="text-[11px] text-slate-400">Not matched to a lead</span>}
                    </div>
                    <p className="text-[11px] text-slate-400">Sends from your connected sender and threads into the conversation.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InboxPage;
