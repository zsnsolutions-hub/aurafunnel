// AuraEngine/components/leads/LeadScorePanel.tsx
//
// Lead score breakdown (Phase C). Shows the deterministic 0-100 score, its
// sub-score bars, confidence, reason, and a non-contactable warning, with a
// Recalculate button. Self-gates on the `enabled` (lead_intelligence) prop.

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Lead } from '../../types';
import { LeadScoreBreakdown, getLeadScore, recalcLeadScore } from '../../lib/leadScoring';

const SUBS: { key: keyof LeadScoreBreakdown; label: string; max: number }[] = [
  { key: 'fit_score', label: 'Fit', max: 25 },
  { key: 'intent_score', label: 'Intent', max: 20 },
  { key: 'engagement_score', label: 'Engagement', max: 20 },
  { key: 'data_quality_score', label: 'Data quality', max: 15 },
  { key: 'deliverability_score', label: 'Deliverability', max: 10 },
  { key: 'urgency_score', label: 'Urgency', max: 10 },
];

const scoreColor = (t: number) =>
  t >= 75 ? 'text-emerald-600' : t >= 50 ? 'text-amber-600' : t >= 25 ? 'text-orange-600' : 'text-rose-600';

interface Props { lead: Lead; businessId: string | null; workspaceId: string | null; enabled: boolean }

export const LeadScorePanel: React.FC<Props> = ({ lead, businessId, workspaceId, enabled }) => {
  const [score, setScore] = useState<LeadScoreBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalcing, setRecalcing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    (async () => {
      const s = await getLeadScore(lead.id);
      if (!cancelled) { setScore(s); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [enabled, lead.id]);

  const recalc = useCallback(async () => {
    if (!businessId || !workspaceId) return;
    setRecalcing(true);
    try { setScore(await recalcLeadScore(businessId, workspaceId, lead)); }
    catch (e) { console.warn('[LeadScore] recalc failed:', (e as Error).message); }
    finally { setRecalcing(false); }
  }, [businessId, workspaceId, lead]);

  if (!enabled) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 text-sm">Lead Score</h3>
        <button onClick={recalc} disabled={recalcing || !businessId}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
          {recalcing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {score ? 'Recalculate' : 'Calculate'}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : !score ? (
        <p className="text-xs text-slate-400">Not scored yet — calculate this lead's score from real data (fit, engagement, validation, activity).</p>
      ) : (
        <>
          <div className="flex items-end gap-3 mb-4">
            <span className={`text-4xl font-black leading-none ${scoreColor(score.total_score)}`}>{score.total_score}</span>
            <span className="text-xs text-slate-400 mb-1">/ 100 · {Math.round(score.confidence * 100)}% confidence</span>
          </div>

          {!score.contactable && (
            <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={13} /> Non-contactable (suppressed / unsubscribed)
            </div>
          )}

          <div className="space-y-2">
            {SUBS.map(s => {
              const val = score[s.key] as number;
              return (
                <div key={s.key}>
                  <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
                    <span>{s.label}</span><span>{val}/{s.max}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round((val / s.max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {score.risk_score > 0 && (
              <div>
                <div className="flex justify-between text-[11px] text-rose-500 mb-0.5">
                  <span>Risk penalty</span><span>−{score.risk_score}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.round((score.risk_score / 20) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {score.reason_summary && <p className="text-xs text-slate-500 mt-3 leading-relaxed">{score.reason_summary}</p>}
        </>
      )}
    </div>
  );
};

export default LeadScorePanel;
