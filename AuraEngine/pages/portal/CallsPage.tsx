// AuraEngine/pages/portal/CallsPage.tsx
//
// Global call history — every row in lead_call_logs for the current user, across
// all leads plus lead-less inbound calls from unknown numbers. Filter by
// direction, search by name/number, jump to the matched lead, and play the
// recording. This is the only surface that shows unmatched inbound calls (the
// per-lead timeline filters by lead_id).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Phone, PhoneIncoming, PhoneOutgoing, PlayCircle, Search, RefreshCw, ArrowRight } from 'lucide-react';
import type { User } from '../../types';
import { supabase } from '../../lib/supabase';
import { formatDuration } from '../../lib/twilioVoice';

interface LayoutContext { user: User }

interface CallRow {
  id: string;
  direction: string | null;
  phone_number: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  status: string | null;
  outcome: string | null;
  notes: string | null;
  created_at: string;
  lead_id: string | null;
  leads: { first_name: string | null; last_name: string | null } | null;
}

type Filter = 'all' | 'inbound' | 'outbound';

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  connected:    { label: 'Connected',    cls: 'bg-emerald-50 text-emerald-700' },
  voicemail:    { label: 'Voicemail',    cls: 'bg-amber-50 text-amber-700' },
  no_answer:    { label: 'No answer',    cls: 'bg-slate-100 text-slate-500' },
  busy:         { label: 'Busy',         cls: 'bg-rose-50 text-rose-600' },
  wrong_number: { label: 'Wrong number', cls: 'bg-rose-50 text-rose-600' },
};

const leadName = (r: CallRow): string => {
  const n = `${r.leads?.first_name ?? ''} ${r.leads?.last_name ?? ''}`.trim();
  return n || (r.phone_number ?? 'Unknown caller');
};

const relTime = (iso: string): string => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const CallsPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();

  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('lead_call_logs')
      .select('id, direction, phone_number, duration_seconds, recording_url, status, outcome, notes, created_at, lead_id, leads(first_name, last_name)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300);
    setRows((data ?? []) as unknown as CallRow[]);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && (r.direction ?? 'outbound') !== filter) return false;
      if (!q) return true;
      return leadName(r).toLowerCase().includes(q) || (r.phone_number ?? '').toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  const counts = useMemo(() => ({
    all: rows.length,
    inbound: rows.filter(r => r.direction === 'inbound').length,
    outbound: rows.filter(r => (r.direction ?? 'outbound') === 'outbound').length,
  }), [rows]);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 font-heading">
            <Phone className="w-6 h-6 text-emerald-600" /> Calls
          </h1>
          <p className="text-sm text-slate-500 mt-1">Every inbound and outbound call, across all leads and unknown numbers.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {(['all', 'inbound', 'outbound'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize transition-colors ${filter === f ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-200'}`}>
              {f} <span className={filter === f ? 'text-emerald-100' : 'text-slate-400'}>· {counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or number…"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-300 transition-colors w-56" />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading calls…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-500">{rows.length === 0 ? 'No calls yet' : 'No calls match your filter'}</p>
            <p className="text-xs text-slate-400 mt-1">{rows.length === 0 ? 'Calls you make or receive will show up here.' : 'Try a different filter or search.'}</p>
          </div>
        ) : filtered.map(r => {
          const inbound = r.direction === 'inbound';
          const om = r.outcome ? OUTCOME_META[r.outcome] : undefined;
          return (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${inbound ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {inbound ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900 truncate">{leadName(r)}</p>
                  {!r.lead_id && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide bg-slate-100 px-1.5 py-0.5 rounded">No lead</span>}
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {inbound ? 'Inbound' : 'Outbound'}{r.phone_number ? ` · ${r.phone_number}` : ''} · {relTime(r.created_at)}
                </p>
              </div>

              {om && <span className={`hidden sm:inline text-[10px] font-bold px-2 py-1 rounded-full ${om.cls}`}>{om.label}</span>}

              <div className="text-right shrink-0 w-16">
                <p className="text-xs font-semibold text-slate-600 tabular-nums">
                  {r.duration_seconds && r.duration_seconds > 0 ? formatDuration(r.duration_seconds) : '—'}
                </p>
              </div>

              {r.recording_url ? (
                <a href={r.recording_url} target="_blank" rel="noopener noreferrer" title="Play recording"
                  className="shrink-0 text-slate-400 hover:text-emerald-600 transition-colors" onClick={e => e.stopPropagation()}>
                  <PlayCircle className="w-5 h-5" />
                </a>
              ) : <span className="w-5 shrink-0" />}

              {r.lead_id ? (
                <button onClick={() => navigate(`/portal/leads/${r.lead_id}`)} title="Open lead"
                  className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : <span className="w-4 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CallsPage;
