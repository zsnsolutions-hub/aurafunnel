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
  received_at: string;
  is_read: boolean;
  leads: { first_name: string | null; last_name: string | null } | null;
}

export async function listInbound(userId: string, unreadOnly: boolean): Promise<InboundEmail[]> {
  let q = supabase.from('inbound_emails')
    .select('id, lead_id, from_email, from_name, to_email, subject, body_text, body_html, received_at, is_read, leads(first_name, last_name)')
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
