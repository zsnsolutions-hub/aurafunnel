// AuraEngine/lib/inbox.ts
//
// Unified inbox data layer over inbound_emails (replies fed by the inbound-email
// webhook). Owner-scoped by RLS.

import { supabase } from './supabase';

export interface InboundEmail {
  id: string;
  lead_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  received_at: string;
  is_read: boolean;
  leads: { first_name: string | null; last_name: string | null } | null;
}

export async function listInbound(userId: string, unreadOnly: boolean): Promise<InboundEmail[]> {
  let q = supabase.from('inbound_emails')
    .select('id, lead_id, from_email, from_name, to_email, subject, body_text, body_html, message_id, received_at, is_read, leads(first_name, last_name)')
    .eq('owner_id', userId)
    .order('received_at', { ascending: false })
    .limit(200);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data } = await q;
  return (data ?? []) as unknown as InboundEmail[];
}

export async function markInboundRead(id: string, isRead = true): Promise<void> {
  await supabase.from('inbound_emails').update({ is_read: isRead }).eq('id', id);
}

export async function unreadInboundCount(userId: string): Promise<number> {
  const { count } = await supabase.from('inbound_emails')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId).eq('is_read', false);
  return count ?? 0;
}

export const inboundSenderName = (m: InboundEmail): string => {
  const lead = `${m.leads?.first_name ?? ''} ${m.leads?.last_name ?? ''}`.trim();
  return lead || m.from_name || m.from_email;
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Send an in-app reply to an inbound email — threads via In-Reply-To, sends
 *  through the workspace's auto-picked sender (bypasses the validation gate). */
export async function sendReply(m: InboundEmail, bodyText: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Your session expired — please sign in again.' };
  if (!bodyText.trim()) return { ok: false, error: 'Write a reply first.' };

  const subject = m.subject && /^re:/i.test(m.subject.trim()) ? m.subject : `Re: ${m.subject ?? ''}`.trim();
  const html = `<div style="white-space:pre-wrap">${escapeHtml(bodyText)}</div>`;

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      lead_id: m.lead_id ?? undefined,
      to_email: m.from_email,
      subject,
      html_body: html,
      provider: null,                 // auto-pick the workspace sender
      in_reply_to: m.message_id ?? undefined,
      track_opens: true,
      track_clicks: true,
    }),
  });
  const data = await res.json().catch(() => ({} as { success?: boolean; error?: string }));
  if (!res.ok || data.success === false) return { ok: false, error: data.error || `Send failed (HTTP ${res.status})` };
  return { ok: true };
}
