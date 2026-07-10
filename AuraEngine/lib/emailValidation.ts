// AuraEngine/lib/emailValidation.ts
//
// Client data layer for Mails.so email validation (Phase B). Calls the
// mails-validation-worker edge function (server-side key) and reads cached
// results from the email_validations table (RLS-scoped to business members).
// The gating helper turns a validation status into a send decision.

import { supabase } from './supabase';
import { isFlagEnabled } from './goals';
import { resolveWorkspaceForUser } from './memory';

export type ValidationStatus = 'valid' | 'invalid' | 'risky' | 'unknown';

export interface EmailValidation {
  email: string;
  status: ValidationStatus;
  deliverability: string | null;
  reason: string | null;
  is_disposable: boolean;
  is_role: boolean;
  is_free: boolean;
  score: number | null;
  cached?: boolean;
}

/** Validate one or more emails for a business (server-side via the edge fn). */
export async function validateEmails(
  businessId: string,
  emails: string[],
  force = false,
): Promise<EmailValidation[]> {
  const { data, error } = await supabase.functions.invoke('mails-validation-worker', {
    body: { business_id: businessId, emails, force },
  });
  if (error) throw new Error(error.message || 'Validation failed');
  const payload = data as { results?: EmailValidation[]; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  return payload?.results ?? [];
}

export async function validateEmail(
  businessId: string,
  email: string,
  force = false,
): Promise<EmailValidation | null> {
  const [first] = await validateEmails(businessId, [email], force);
  return first ?? null;
}

/** Read already-cached validations from the DB (no provider call). */
export async function getValidations(
  businessId: string,
  emails: string[],
): Promise<Map<string, EmailValidation>> {
  const map = new Map<string, EmailValidation>();
  const lowered = Array.from(new Set(emails.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean)));
  if (lowered.length === 0) return map;
  const { data, error } = await supabase
    .from('email_validations')
    .select('email,status,deliverability,reason,is_disposable,is_role,is_free,score')
    .eq('business_id', businessId)
    .in('email', lowered);
  if (error) { console.warn('[emailValidation] read failed:', error.message); return map; }
  for (const row of (data ?? []) as EmailValidation[]) map.set(row.email, row);
  return map;
}

// ── Send gating ─────────────────────────────────────────────────────────────
export type SendDecision = 'allow' | 'warn' | 'override' | 'block';

/**
 * Decide whether an email may be sent based on its validation status.
 * NOTE: suppression (unsub/bounce/complaint) is a separate, always-block check
 * (lib/suppression.ts + the send-email edge fn) and takes precedence.
 *   valid   -> allow
 *   risky   -> override (owner/admin must confirm)
 *   invalid -> block
 *   unknown / unvalidated -> warn (or block if the workspace requires validation)
 */
export function sendDecision(
  status: ValidationStatus | undefined,
  opts?: { requireValidation?: boolean },
): SendDecision {
  switch (status) {
    case 'valid': return 'allow';
    case 'risky': return 'override';
    case 'invalid': return 'block';
    default: return opts?.requireValidation ? 'block' : 'warn';
  }
}

/** Human label + intent for a status (for badges/toasts). */
export function statusMeta(status: ValidationStatus | undefined): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  switch (status) {
    case 'valid':   return { label: 'Valid', tone: 'good' };
    case 'risky':   return { label: 'Risky', tone: 'warn' };
    case 'invalid': return { label: 'Invalid', tone: 'bad' };
    case 'unknown': return { label: 'Unknown', tone: 'muted' };
    default:        return { label: 'Unvalidated', tone: 'muted' };
  }
}

export async function emailValidationEnabled(userId: string): Promise<boolean> {
  try {
    const ws = await resolveWorkspaceForUser(userId);
    if (!ws) return false;
    return await isFlagEnabled(ws, 'email_validation');
  } catch { return false; }
}
