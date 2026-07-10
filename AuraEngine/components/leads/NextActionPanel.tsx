// AuraEngine/components/leads/NextActionPanel.tsx
//
// "Next best action" (Phase F, §9) — a data-grounded recommendation built from
// the unified context packet (business + lead + score + research + validation +
// engagement). Reports which context sources it used and what was missing.

import React, { useState, useCallback } from 'react';
import { Loader2, Zap, ArrowRight } from 'lucide-react';
import { Lead } from '../../types';
import { buildLeadContextPacket, suggestNextAction, NextAction } from '../../lib/contextPacket';
import { consumeCredits } from '../../lib/credits';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';

interface Props { lead: Lead; businessId: string | null; enabled: boolean }

export const NextActionPanel: React.FC<Props> = ({ lead, businessId, enabled }) => {
  const { toast } = useToast();
  const [action, setAction] = useState<NextAction | null>(null);
  const [sources, setSources] = useState<{ used: string[]; missing: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!businessId) return;
    setBusy(true);
    try {
      const credit = await consumeCredits(supabase, 'dashboard_insights');
      if (!credit.success) { toast(credit.message, 'error'); return; }
      const packet = await buildLeadContextPacket(businessId, lead);
      setSources({ used: packet.sourcesUsed, missing: packet.missing });
      setAction(await suggestNextAction(packet));
    } catch (e) {
      toast((e as Error).message || 'Failed to suggest an action', 'error');
    } finally { setBusy(false); }
  }, [businessId, lead, toast]);

  if (!enabled) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5"><Zap size={14} className="text-amber-500" /> Next best action</h3>
        <button onClick={run} disabled={busy || !businessId} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} Suggest
        </button>
      </div>
      {!action ? (
        <p className="text-xs text-slate-400">A data-grounded recommendation for what to do next — built from this lead's score, research, validation &amp; engagement (1 credit).</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{action.channel}</span>
            {action.confidence != null && <span className="text-[11px] text-slate-400">{Math.round(action.confidence * 100)}% confidence</span>}
          </div>
          <p className="text-sm font-semibold text-slate-900">{action.action}</p>
          {action.reason && <p className="text-xs text-slate-500 mt-1">{action.reason}</p>}
          {sources && (
            <p className="text-[10px] text-slate-400 mt-3">
              Context used: {sources.used.join(', ') || 'none'}{sources.missing.length ? ` · Missing: ${sources.missing.join(', ')}` : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default NextActionPanel;
