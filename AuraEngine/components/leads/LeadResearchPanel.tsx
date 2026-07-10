// AuraEngine/components/leads/LeadResearchPanel.tsx
//
// AI lead research profile (Phase C, §3). Generate/Refresh an on-demand research
// profile, shown grouped with a confidence meter and missing-info warnings.
// Unknown fields render as "Not enough information" (no fabrication).

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { Lead } from '../../types';
import { LeadResearch, getLeadResearch, generateLeadResearch } from '../../lib/leadResearch';
import { consumeCredits } from '../../lib/credits';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';

const SECTIONS: { title: string; fields: { key: keyof LeadResearch; label: string }[] }[] = [
  { title: 'Company', fields: [
    { key: 'company_summary', label: 'Summary' },
    { key: 'industry', label: 'Industry' },
    { key: 'estimated_company_size', label: 'Est. size' },
    { key: 'target_customer', label: 'Their customer' },
    { key: 'likely_decision_maker', label: 'Decision maker' },
  ]},
  { title: 'Needs & objections', fields: [
    { key: 'possible_needs', label: 'Possible needs' },
    { key: 'pain_points', label: 'Pain points' },
    { key: 'buying_triggers', label: 'Buying triggers' },
    { key: 'objections', label: 'Likely objections' },
  ]},
  { title: 'How to reach out', fields: [
    { key: 'best_channel', label: 'Best channel' },
    { key: 'urgency', label: 'Urgency' },
    { key: 'suggested_offer', label: 'Suggested offer' },
    { key: 'suggested_pitch_angle', label: 'Pitch angle' },
    { key: 'recommended_email_angle', label: 'Email angle' },
    { key: 'recommended_call_angle', label: 'Call angle' },
    { key: 'recommended_social_angle', label: 'Social angle' },
  ]},
];

interface Props { lead: Lead; businessId: string | null; workspaceId: string | null; userId: string; enabled: boolean }

export const LeadResearchPanel: React.FC<Props> = ({ lead, businessId, workspaceId, userId, enabled }) => {
  const { toast } = useToast();
  const [research, setResearch] = useState<LeadResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    (async () => {
      const r = await getLeadResearch(lead.id);
      if (!cancelled) { setResearch(r); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [enabled, lead.id]);

  const generate = useCallback(async () => {
    if (!businessId || !workspaceId) { toast('No business selected.', 'error'); return; }
    setBusy(true);
    try {
      const credit = await consumeCredits(supabase, 'lead_research');
      if (!credit.success) { toast(credit.message, 'error'); return; }
      setResearch(await generateLeadResearch(businessId, workspaceId, lead, userId));
      toast('Lead profile generated', 'success');
    } catch (e) {
      toast((e as Error).message || 'Could not generate profile', 'error');
    } finally { setBusy(false); }
  }, [businessId, workspaceId, lead, userId, toast]);

  if (!enabled) return null;

  const missing = Array.isArray(research?.missing_info) ? (research!.missing_info as string[]) : [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5"><Sparkles size={14} className="text-indigo-500" /> AI Lead Profile</h3>
        <button onClick={generate} disabled={busy || !businessId}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {research ? 'Refresh Lead Profile' : 'Generate Lead Profile'}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : !research ? (
        <p className="text-xs text-slate-400">No profile yet — generate an AI research profile from this lead's data and your business context (2 credits).</p>
      ) : (
        <>
          {research.confidence != null && (
            <div className="mb-3">
              <div className="flex justify-between text-[11px] text-slate-500 mb-0.5"><span>Research confidence</span><span>{Math.round(research.confidence * 100)}%</span></div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(research.confidence * 100)}%` }} /></div>
            </div>
          )}

          {missing.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span><span className="font-semibold">Missing info:</span> {missing.join(', ')}</span>
            </div>
          )}

          <div className="space-y-4">
            {SECTIONS.map(section => (
              <div key={section.title}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{section.title}</p>
                <dl className="space-y-1.5">
                  {section.fields.map(f => {
                    const v = research[f.key] as string | null;
                    return (
                      <div key={f.key as string} className="grid grid-cols-[110px_1fr] gap-2">
                        <dt className="text-[11px] text-slate-400">{f.label}</dt>
                        <dd className={`text-xs ${v ? 'text-slate-700' : 'text-slate-300 italic'}`}>{v || 'Not enough information'}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>

          {research.researched_at && (
            <p className="text-[10px] text-slate-300 mt-3">Researched {new Date(research.researched_at).toLocaleString()}</p>
          )}
        </>
      )}
    </div>
  );
};

export default LeadResearchPanel;
