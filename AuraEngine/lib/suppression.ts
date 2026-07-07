// lib/suppression.ts
//
// Phase 0 — the single source of truth for "who must never be emailed".
// Previously this logic lived inline only in QuickLaunch, so the ContentGen /
// ContentStudio send paths could re-mail bounced or unsubscribed contacts. This
// module centralizes it. The authoritative server-side enforcement still belongs
// in the send-email edge worker (see the growth-platform plan), but every client
// send path should call this first so the UI never *offers* a suppressed send.
//
// Sources of suppression (union), all scoped to the current owner:
//   1. `suppressions` table            — explicit do-not-contact (unsub/manual/etc.)
//   2. `email_messages` status         — bounced / failed
//   3. `email_events` event_type       — unsubscribe / spam_report / bounced
//   4. lead.status                     — matches SUPPRESSED_STATUS

import { supabase } from './supabase';

/** Lead statuses that mean "never contact". */
export const SUPPRESSED_STATUS = /unsub|bounce|complain|spam|do.?not|opt.?out/i;

export type SuppressionReason = 'unsub' | 'bounce' | 'complaint' | 'manual' | 'invalid';

/** Build the set of lower-cased emails that must not be contacted for this owner. */
export async function fetchSuppressedEmails(ownerId: string): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    // 1. Explicit suppression list.
    const { data: sup } = await supabase
      .from('suppressions')
      .select('email')
      .eq('owner_id', ownerId);
    for (const r of (sup ?? []) as { email: string | null }[]) {
      const em = (r.email ?? '').trim().toLowerCase();
      if (em) set.add(em);
    }

    // 2/3. Bounced / failed messages + unsubscribe / spam / bounce events.
    const { data: msgs } = await supabase
      .from('email_messages')
      .select('id, to_email, status')
      .eq('owner_id', ownerId)
      .limit(5000);
    const idToEmail = new Map<string, string>();
    for (const m of (msgs ?? []) as { id: string; to_email: string | null; status: string | null }[]) {
      const em = (m.to_email ?? '').trim().toLowerCase();
      if (!em) continue;
      idToEmail.set(m.id, em);
      if (m.status === 'bounced' || m.status === 'failed') set.add(em);
    }
    const ids = [...idToEmail.keys()];
    for (let i = 0; i < ids.length; i += 1000) {
      const { data: evs } = await supabase
        .from('email_events')
        .select('message_id, event_type')
        .in('message_id', ids.slice(i, i + 1000))
        .in('event_type', ['unsubscribe', 'spam_report', 'bounced']);
      for (const ev of (evs ?? []) as { message_id: string; event_type: string }[]) {
        const em = idToEmail.get(ev.message_id);
        if (em) set.add(em);
      }
    }
  } catch (e) {
    console.warn('[suppression] fetch failed:', e);
  }
  return set;
}

export interface SuppressibleLead {
  primary_email?: string | null;
  status?: string | null;
}

export interface FilterResult<T> {
  leads: T[];
  dupes: number;
  suppressed: number;
}

/**
 * Dedup by email + drop suppressed (by the given set OR by suppressed lead status).
 * Returns the deliverable leads plus how many were removed for each reason.
 */
export function filterSuppressed<T extends SuppressibleLead>(
  leads: T[],
  suppressedEmails: Set<string>,
): FilterResult<T> {
  const seen = new Set<string>();
  const out: T[] = [];
  let dupes = 0;
  let suppressed = 0;
  for (const l of leads) {
    const email = (l.primary_email ?? '').trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) { dupes++; continue; }
    if (suppressedEmails.has(email) || (l.status && SUPPRESSED_STATUS.test(l.status))) { suppressed++; continue; }
    seen.add(email);
    out.push(l);
  }
  return { leads: out, dupes, suppressed };
}

/** Add an email to the persistent suppression list (idempotent per owner+email). */
export async function addSuppression(
  ownerId: string,
  email: string,
  reason: SuppressionReason,
  source?: string,
): Promise<void> {
  const em = email.trim().toLowerCase();
  if (!em) return;
  const { error } = await supabase
    .from('suppressions')
    .upsert({ owner_id: ownerId, email: em, reason, source }, { onConflict: 'owner_id,email' });
  if (error) console.warn('[suppression] add failed:', error.message);
}
