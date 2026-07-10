// AuraEngine/components/validation/EmailValidationControl.tsx
//
// Reusable email-validation badge + validate button (Phase B). Reads the cached
// status for an email in the current business and lets the user (re)validate via
// the mails-validation-worker edge function. Renders nothing unless enabled +
// given a business and email.

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Loader2, RefreshCw } from 'lucide-react';
import { EmailValidation, getValidations, validateEmail, statusMeta } from '../../lib/emailValidation';

const toneClasses: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  bad: 'bg-rose-50 text-rose-700 border-rose-200',
  muted: 'bg-gray-50 text-gray-500 border-gray-200',
};
const toneIcon = { good: ShieldCheck, warn: ShieldAlert, bad: ShieldX, muted: ShieldQuestion } as const;

interface Props {
  businessId: string | null;
  email: string | null | undefined;
  enabled: boolean;
  onValidated?: () => void;
}

export const EmailValidationControl: React.FC<Props> = ({ businessId, email, enabled, onValidated }) => {
  const [val, setVal] = useState<EmailValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const normalized = (email ?? '').trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !businessId || !normalized) { setVal(null); return; }
    (async () => {
      const map = await getValidations(businessId, [normalized]);
      if (!cancelled) setVal(map.get(normalized) ?? null);
    })();
    return () => { cancelled = true; };
  }, [enabled, businessId, normalized]);

  const run = useCallback(async (force: boolean) => {
    if (!businessId || !normalized) return;
    setLoading(true);
    try {
      setVal(await validateEmail(businessId, normalized, force));
      onValidated?.();
    } catch (e) {
      console.warn('[EmailValidation] validate failed:', (e as Error).message);
    } finally { setLoading(false); }
  }, [businessId, normalized, onValidated]);

  if (!enabled || !businessId || !normalized) return null;

  const meta = statusMeta(val?.status);
  const Icon = toneIcon[meta.tone];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${toneClasses[meta.tone]}`}>
        <Icon size={12} /> {meta.label}
        {val?.reason ? <span className="font-normal opacity-70">· {val.reason}</span> : null}
      </span>
      <button onClick={() => run(!!val)} disabled={loading} title={val ? 'Re-validate' : 'Validate email'}
        className="p-1 text-gray-400 hover:text-indigo-600 rounded disabled:opacity-50">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      </button>
    </span>
  );
};

export default EmailValidationControl;
