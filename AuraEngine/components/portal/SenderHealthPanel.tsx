/**
 * SenderHealthPanel — operational visibility for sender deliverability.
 *
 * Renders for the current workspace:
 *   - Per-sender health: score, daily-sent / daily-cap, bounce + complaint
 *     rates, consecutive failures, last health check.
 *   - DLQ summary: counts by kind in the last 7 days, plus the 10 most
 *     recent rows.
 *
 * All data is workspace-scoped via RLS; this panel is safe to embed in
 * user-facing pages (e.g. /portal/sender-accounts) as well as the admin
 * support-session view of a target workspace.
 *
 * Phase 3.x — read-only. No mutations, no behaviour changes.
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  HeartPulse, ShieldAlert, MailWarning, Flame, Activity,
  CheckCircle, AlertTriangle, AlertOctagon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SenderAccount, EmailDlqEntry } from '../../types';

interface Props {
  workspaceId: string;
}

interface HealthRow extends SenderAccount {
  daily_cap: number;
}

const HEALTH_TIER = (score: number | null) => {
  const s = score ?? 100;
  if (s >= 80) return { label: 'Healthy',     color: 'emerald', icon: CheckCircle };
  if (s >= 50) return { label: 'Watch',       color: 'amber',   icon: AlertTriangle };
  if (s >= 25) return { label: 'Throttled',   color: 'orange',  icon: AlertTriangle };
  return        { label: 'Quarantined', color: 'rose',    icon: AlertOctagon };
};

const DLQ_LABEL: Record<EmailDlqEntry['kind'], { label: string; tone: string }> = {
  hard_bounce:    { label: 'Hard bounces',    tone: 'rose'    },
  spam_complaint: { label: 'Spam complaints', tone: 'rose'    },
  rate_limited:   { label: 'Rate limited',    tone: 'amber'   },
  provider_error: { label: 'Provider errors', tone: 'amber'   },
  unsubscribed:   { label: 'Unsubscribes',    tone: 'slate'   },
  other:          { label: 'Other',           tone: 'slate'   },
};

const SenderHealthPanel: React.FC<Props> = ({ workspaceId }) => {
  // Per-sender health (joined to live daily_cap via the SQL function).
  const { data: senders = [], isLoading: sendersLoading } = useQuery<HealthRow[]>({
    queryKey: ['sender-health', workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('sender_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      const list = rows ?? [];
      // Resolve each sender's effective daily cap in parallel.
      const caps = await Promise.all(
        list.map(async (r) => {
          try {
            const { data } = await supabase.rpc('sender_daily_cap', { p_sender_id: r.id });
            return typeof data === 'number' ? data : 500;
          } catch {
            return 500;
          }
        }),
      );
      return list.map((r, i) => ({ ...(r as SenderAccount), daily_cap: caps[i] }));
    },
  });

  // Last 7 days of DLQ entries.
  const { data: dlq = [], isLoading: dlqLoading } = useQuery<EmailDlqEntry[]>({
    queryKey: ['email-dlq', workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('email_dlq')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('last_failed_at', since)
        .order('last_failed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EmailDlqEntry[];
    },
  });

  const dlqByKind = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of dlq) m[r.kind] = (m[r.kind] ?? 0) + 1;
    return m;
  }, [dlq]);

  if (sendersLoading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 animate-pulse h-40" />;
  }

  if (senders.length === 0) {
    return null; // Nothing to show — page already handles the empty-senders state.
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <HeartPulse size={16} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Deliverability health
        </h2>
        <span className="text-xs text-slate-400">refreshes hourly</span>
      </div>

      {/* ── Sender health table ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left">Sender</th>
              <th className="px-4 py-2.5 text-left">Score</th>
              <th className="px-4 py-2.5 text-left">Today</th>
              <th className="px-4 py-2.5 text-left">Bounce 7d</th>
              <th className="px-4 py-2.5 text-left">Spam 7d</th>
              <th className="px-4 py-2.5 text-left">Failures</th>
              <th className="px-4 py-2.5 text-left">Last check</th>
            </tr>
          </thead>
          <tbody>
            {senders.map((s) => {
              const tier = HEALTH_TIER(s.health_score);
              const Tone = tier.icon;
              const utilisation = s.daily_cap > 0 ? s.daily_sent_today / s.daily_cap : 0;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.from_email}</div>
                    <div className="text-xs text-slate-500">{s.provider} · {s.display_name || s.from_name || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold bg-${tier.color}-50 text-${tier.color}-700`}>
                      <Tone size={12} /> {s.health_score ?? 100} · {tier.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.daily_sent_today} / {s.daily_cap}</div>
                    <div className="h-1 mt-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full ${utilisation >= 1 ? 'bg-rose-500' : utilisation >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, utilisation * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{(s.bounce_rate_7d * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-slate-700">{(s.complaint_rate_7d * 100).toFixed(3)}%</td>
                  <td className="px-4 py-3">
                    {s.consecutive_failures > 0 ? (
                      <span className="text-rose-600 font-semibold">{s.consecutive_failures}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {s.last_health_check_at ? new Date(s.last_health_check_at).toLocaleString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── DLQ summary ── */}
      <div className="flex items-center gap-2 mt-6">
        <ShieldAlert size={16} className="text-rose-500" />
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Dead letter queue
        </h2>
        <span className="text-xs text-slate-400">last 7 days</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(Object.keys(DLQ_LABEL) as Array<keyof typeof DLQ_LABEL>).map((k) => {
          const meta = DLQ_LABEL[k];
          const count = dlqByKind[k] ?? 0;
          return (
            <div key={k} className="p-3 rounded-xl border border-slate-200 bg-white">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{meta.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${count > 0 ? `text-${meta.tone}-600` : 'text-slate-300'}`}>
                {count}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Recent DLQ rows ── */}
      {dlq.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">When</th>
                <th className="px-4 py-2.5 text-left">Kind</th>
                <th className="px-4 py-2.5 text-left">Recipient</th>
                <th className="px-4 py-2.5 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {dlq.slice(0, 10).map((r) => {
                const meta = DLQ_LABEL[r.kind] ?? DLQ_LABEL.other;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(r.last_failed_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-${meta.tone}-50 text-${meta.tone}-700`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.to_email}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-md">{r.reason || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {dlq.length > 10 && (
            <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
              showing 10 of {dlq.length} entries · last 7 days
            </div>
          )}
        </div>
      )}

      {dlqLoading && (
        <div className="text-xs text-slate-400">Loading DLQ…</div>
      )}
    </div>
  );
};

export default SenderHealthPanel;
