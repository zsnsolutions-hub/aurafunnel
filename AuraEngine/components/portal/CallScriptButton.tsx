// AuraEngine/components/portal/CallScriptButton.tsx
//
// Roadmap 5.2 — pre-call AI script. Generates a natural call script for a lead
// from the lead's context + the active business brain. Standalone (no Twilio).

import React, { useState } from 'react';
import { FileText, Loader2, X, Copy, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { consumeCredits } from '../../lib/credits';
import { generateCallScript } from '../../lib/gemini';
import { getOperationCost } from '../../config/aiCreditCosts';

const COST = getOperationCost('call_script');

const CallScriptButton: React.FC<{ leadId: string; leadName?: string; className?: string }> = ({ leadId, leadName, className }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setOpen(true); setLoading(true); setError(null); setScript('');
    try {
      const credit = await consumeCredits(supabase, 'call_script');
      if (!credit.success) throw new Error(credit.message || 'Insufficient credits.');
      setScript(await generateCallScript(leadId));
    } catch (e) {
      setError((e as Error).message || 'Could not generate a script.');
    } finally { setLoading(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(script); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  return (
    <>
      <button
        onClick={run}
        title={`Generate a call script · ${COST} credits`}
        className={className ?? 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100'}
      >
        <FileText size={14} /> Script
      </button>

      {open && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white w-full max-w-lg max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" /> Call script{leadName ? ` — ${leadName}` : ''}
              </h3>
              <div className="flex items-center gap-2">
                {script && !loading && (
                  <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600">
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-8"><Loader2 size={16} className="animate-spin" /> Writing your script…</div>
              ) : error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">{script}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CallScriptButton;
