// AuraEngine/pages/portal/TeamPerformancePage.tsx
//
// Per-rep (workspace member) performance report — assigned leads, deal pipeline
// (open/won + value), win rate, logged activities and completed tasks, ranked by
// won value. Reads real data via lib/repPerformance (RLS-scoped to the workspace,
// filtered to the active business). Deterministic — no AI.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Users, Trophy } from 'lucide-react';
import type { User } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { getRepPerformance, type RepStats } from '../../lib/repPerformance';

interface LayoutContext { user: User }

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const WINDOWS: { label: string; days: number | null }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: null },
];

const TeamPerformancePage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const { currentBusinessId, multiBusinessEnabled } = useCurrentBusiness();
  const bizId = multiBusinessEnabled ? currentBusinessId : null;

  const [rows, setRows] = useState<RepStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<number | null>(30);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getRepPerformance(user.id, bizId, windowDays)); }
    finally { setLoading(false); }
  }, [user.id, bizId, windowDays]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    leads: t.leads + r.leadsAssigned,
    openValue: t.openValue + r.openValue,
    wonValue: t.wonValue + r.wonValue,
    won: t.won + r.wonDeals,
    lost: t.lost + r.lostDeals,
  }), { leads: 0, openValue: 0, wonValue: 0, won: 0, lost: 0 }), [rows]);
  const teamWinRate = totals.won + totals.lost > 0 ? totals.won / (totals.won + totals.lost) : 0;

  const hasAnyData = rows.some(r => r.leadsAssigned || r.openDeals || r.wonDeals || r.lostDeals || r.activities || r.tasksCompleted);

  const cards = [
    { label: 'Leads assigned', value: totals.leads.toLocaleString() },
    { label: 'Open pipeline', value: money(totals.openValue) },
    { label: 'Won', value: money(totals.wonValue) },
    { label: 'Team win rate', value: `${Math.round(teamWinRate * 100)}%` },
  ];

  return (
    <div className="pb-10">
      <PageHeader
        title="Team Report"
        description={`${rows.length} team member${rows.length === 1 ? '' : 's'}`}
        actions={
          <div className="inline-flex bg-slate-100 rounded-xl p-0.5">
            {WINDOWS.map(w => (
              <button
                key={w.label}
                onClick={() => setWindowDays(w.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${windowDays === w.days ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-2xl font-black text-slate-900 tabular-nums">{c.value}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading report…
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Rep</th>
                  <th className="text-right px-4 py-3">Leads</th>
                  <th className="text-right px-4 py-3">Open deals</th>
                  <th className="text-right px-4 py-3">Won</th>
                  <th className="text-right px-4 py-3">Win rate</th>
                  <th className="text-right px-4 py-3">Activities</th>
                  <th className="text-right px-4 py-3">Tasks done</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.userId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">
                          {(r.name || '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                            {r.name}{r.userId === user.id && <span className="text-[10px] font-medium text-slate-400">(you)</span>}
                            {i === 0 && hasAnyData && r.wonValue > 0 && <Trophy size={12} className="text-amber-500" />}
                          </p>
                          {r.email && <p className="text-[11px] text-slate-400 truncate">{r.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.leadsAssigned.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.openDeals}<span className="text-[11px] text-slate-400"> · {money(r.openValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.wonDeals}<span className="text-[11px] text-slate-400"> · {money(r.wonValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">
                      {r.wonDeals + r.lostDeals > 0 ? `${Math.round(r.winRate * 100)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.activities.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.tasksCompleted.toLocaleString()}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No team members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!hasAnyData && rows.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
              <Users size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-500">Nothing to report yet. Assign leads to team members, create deals, log activities and complete tasks — they'll roll up here per rep.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamPerformancePage;
