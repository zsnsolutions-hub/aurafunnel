import { supabase } from './supabase';
import type {
  EmailMessage,
  EmailLink,
  EmailEvent,
  EmailEngagement,
  EmailProvider,
} from '../types';

const TRACKING_BASE_URL = import.meta.env.VITE_TRACKING_DOMAIN ?? '';

// ── Create email message record ──
export async function createEmailMessage(params: {
  leadId: string;
  provider: EmailProvider;
  providerMessageId?: string;
  subject?: string;
  toEmail: string;
  fromEmail?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
}): Promise<EmailMessage | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('email_messages')
    .insert({
      lead_id: params.leadId,
      owner_id: user.id,
      provider: params.provider,
      provider_message_id: params.providerMessageId ?? null,
      subject: params.subject ?? null,
      to_email: params.toEmail,
      from_email: params.fromEmail ?? null,
      track_opens: params.trackOpens ?? true,
      track_clicks: params.trackClicks ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create email message:', error);
    return null;
  }

  return data as EmailMessage;
}

// ── Instrument outgoing HTML with tracking pixel + link rewriting ──
export async function instrumentEmailHtml(
  html: string,
  messageId: string,
  trackOpens: boolean,
  trackClicks: boolean
): Promise<{ html: string; links: EmailLink[] }> {
  let result = html;
  const links: EmailLink[] = [];

  // Bail if no tracking domain configured
  if (!TRACKING_BASE_URL) {
    return { html: result, links };
  }

  // ── Click tracking: rewrite <a href="..."> ──
  if (trackClicks) {
    const anchorRegex = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    const matches: { fullMatch: string; url: string; index: number }[] = [];
    let match: RegExpExecArray | null;
    let linkIndex = 0;

    while ((match = anchorRegex.exec(html)) !== null) {
      const url = match[1];
      // Skip mailto, tel, anchors, and javascript links
      if (/^(mailto:|tel:|#|javascript:)/i.test(url)) continue;
      matches.push({ fullMatch: match[0], url, index: linkIndex++ });
    }

    if (matches.length > 0) {
      // Batch insert link rows
      const linkRows = matches.map((m) => ({
        message_id: messageId,
        destination_url: m.url,
        link_label: extractLinkLabel(html, m.fullMatch),
        link_index: m.index,
      }));

      const { data: insertedLinks, error: linkError } = await supabase
        .from('email_links')
        .insert(linkRows)
        .select();

      if (!linkError && insertedLinks) {
        // Replace each href with tracking URL
        for (let i = insertedLinks.length - 1; i >= 0; i--) {
          const link = insertedLinks[i] as EmailLink;
          const originalMatch = matches[i];
          links.push(link);

          const trackingUrl = `${TRACKING_BASE_URL}/t/c/${link.id}`;
          const replaced = originalMatch.fullMatch.replace(
            originalMatch.url,
            trackingUrl
          );
          result = result.replace(originalMatch.fullMatch, replaced);
        }
      }
    }
  }

  // ── Open tracking: append 1x1 pixel ──
  if (trackOpens) {
    const pixel = `<img src="${TRACKING_BASE_URL}/t/p/${messageId}.png" width="1" height="1" style="display:none" alt="" />`;
    if (result.includes('</body>')) {
      result = result.replace('</body>', `${pixel}</body>`);
    } else {
      result += pixel;
    }
  }

  return { html: result, links };
}

// ── Fetch aggregated engagement data for a lead ──
export async function fetchLeadEmailEngagement(
  leadId: string
): Promise<EmailEngagement | null> {
  // Fetch messages for this lead
  const { data: messages, error: msgErr } = await supabase
    .from('email_messages')
    .select('id, status, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (msgErr || !messages || messages.length === 0) {
    return {
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      uniqueOpens: 0,
      uniqueClicks: 0,
      totalBounced: 0,
      recentEvents: [],
    };
  }

  const messageIds = messages.map((m) => m.id);

  // Fetch events for these messages (exclude bots)
  const { data: events, error: evtErr } = await supabase
    .from('email_events')
    .select('*')
    .in('message_id', messageIds)
    .eq('is_bot', false)
    .order('created_at', { ascending: false });

  if (evtErr) {
    console.error('Failed to fetch email events:', evtErr);
    return null;
  }

  const allEvents = (events ?? []) as EmailEvent[];

  // Fetch top clicked link
  const { data: topLinks } = await supabase
    .from('email_links')
    .select('*')
    .in('message_id', messageIds)
    .order('click_count', { ascending: false })
    .limit(1);

  const topLink = topLinks?.[0] as EmailLink | undefined;

  // Aggregate
  const opens = allEvents.filter((e) => e.event_type === 'open');
  const clicks = allEvents.filter((e) => e.event_type === 'click');
  const uniqueOpenMessages = new Set(opens.map((e) => e.message_id));
  const uniqueClickMessages = new Set(clicks.map((e) => e.message_id));
  const bounced = messages.filter((m) => m.status === 'bounced');

  const lastOpen = opens[0]?.created_at;
  const lastClick = clicks[0]?.created_at;

  return {
    totalSent: messages.length,
    totalOpens: opens.length,
    totalClicks: clicks.length,
    uniqueOpens: uniqueOpenMessages.size,
    uniqueClicks: uniqueClickMessages.size,
    totalBounced: bounced.length,
    lastOpenedAt: lastOpen,
    lastClickedAt: lastClick,
    topClickedLink: topLink
      ? { label: topLink.link_label ?? topLink.destination_url, url: topLink.destination_url, clicks: topLink.click_count }
      : undefined,
    recentEvents: allEvents.slice(0, 10),
  };
}

// ── Send a tracked email via edge function ──
export interface SendEmailParams {
  leadId?: string;
  toEmail: string;
  fromEmail?: string;
  subject: string;
  htmlBody: string;
  provider?: EmailProvider;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  providerMessageId?: string;
  error?: string;
}

export async function sendTrackedEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Not authenticated' };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        lead_id: params.leadId ?? null,
        to_email: params.toEmail,
        from_email: params.fromEmail ?? null,
        subject: params.subject,
        html_body: params.htmlBody,
        provider: params.provider ?? 'sendgrid',
        track_opens: params.trackOpens ?? true,
        track_clicks: params.trackClicks ?? true,
      }),
    });

    const data = await res.json();
    return {
      success: data.success ?? false,
      messageId: data.message_id ?? undefined,
      providerMessageId: data.provider_message_id ?? undefined,
      error: data.error ?? undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error: ${(err as Error).message}`,
    };
  }
}

// ── Send emails to multiple leads (batch) ──
export async function sendTrackedEmailBatch(
  leads: { id: string; email: string; name: string }[],
  subject: string,
  htmlBody: string,
  options?: {
    fromEmail?: string;
    provider?: EmailProvider;
    trackOpens?: boolean;
    trackClicks?: boolean;
  }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = { sent: 0, failed: 0, errors: [] as string[] };

  for (const lead of leads) {
    // Personalize per lead
    const personalizedHtml = htmlBody
      .replace(/\{\{first_name\}\}/gi, lead.name.split(' ')[0] || '')
      .replace(/\{\{name\}\}/gi, lead.name);
    const personalizedSubject = subject
      .replace(/\{\{first_name\}\}/gi, lead.name.split(' ')[0] || '')
      .replace(/\{\{name\}\}/gi, lead.name);

    const result = await sendTrackedEmail({
      leadId: lead.id,
      toEmail: lead.email,
      fromEmail: options?.fromEmail,
      subject: personalizedSubject,
      htmlBody: personalizedHtml,
      provider: options?.provider,
      trackOpens: options?.trackOpens,
      trackClicks: options?.trackClicks,
    });

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push(`${lead.email}: ${result.error}`);
    }
  }

  return results;
}

// ── Schedule an email block for future delivery ──
export interface ScheduleEmailBlockParams {
  leads: { id: string; email: string; name: string }[];
  subject: string;
  htmlBody: string;
  scheduledAt: Date;
  blockIndex: number;
  sequenceId: string;
}

export async function scheduleEmailBlock(
  params: ScheduleEmailBlockParams
): Promise<{ scheduled: number; failed: number; errors: string[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { scheduled: 0, failed: 0, errors: ['Not authenticated'] };

  const results = { scheduled: 0, failed: 0, errors: [] as string[] };

  const rows = params.leads.map((lead) => {
    const personalizedHtml = params.htmlBody
      .replace(/\{\{first_name\}\}/gi, lead.name.split(' ')[0] || '')
      .replace(/\{\{name\}\}/gi, lead.name);
    const personalizedSubject = params.subject
      .replace(/\{\{first_name\}\}/gi, lead.name.split(' ')[0] || '')
      .replace(/\{\{name\}\}/gi, lead.name);

    return {
      owner_id: user.id,
      lead_id: lead.id,
      to_email: lead.email,
      subject: personalizedSubject,
      html_body: personalizedHtml,
      scheduled_at: params.scheduledAt.toISOString(),
      block_index: params.blockIndex,
      sequence_id: params.sequenceId,
      status: 'pending',
    };
  });

  const { data, error } = await supabase
    .from('scheduled_emails')
    .insert(rows)
    .select();

  if (error) {
    results.failed = params.leads.length;
    results.errors.push(`Schedule error: ${error.message}`);
  } else {
    results.scheduled = data?.length ?? 0;
  }

  return results;
}

// ── Fetch user's scheduled emails ──
export interface ScheduledEmail {
  id: string;
  lead_id: string | null;
  to_email: string;
  subject: string;
  scheduled_at: string;
  status: string;
  block_index: number;
  sequence_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export async function fetchScheduledEmails(): Promise<ScheduledEmail[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('scheduled_emails')
    .select('*')
    .eq('owner_id', user.id)
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch scheduled emails:', error);
    return [];
  }

  return (data ?? []) as ScheduledEmail[];
}

// ── Cancel a single scheduled email ──
export async function cancelScheduledEmail(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to cancel scheduled email:', error);
    return false;
  }
  return true;
}

// ── Cancel all pending emails in a sequence ──
export async function cancelScheduledSequence(sequenceId: string): Promise<number> {
  const { data, error } = await supabase
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('sequence_id', sequenceId)
    .eq('status', 'pending')
    .select();

  if (error) {
    console.error('Failed to cancel sequence:', error);
    return 0;
  }
  return data?.length ?? 0;
}

// ── Fetch email performance data for the current user ──
export interface EmailPerformanceEntry {
  subject: string;
  status: string;
  sentAt: string;
  opens: number;
  clicks: number;
  messageId: string;
}

export async function fetchOwnerEmailPerformance(): Promise<EmailPerformanceEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: messages, error: msgErr } = await supabase
    .from('email_messages')
    .select('id, subject, status, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (msgErr || !messages || messages.length === 0) return [];

  const messageIds = messages.map((m) => m.id);

  const { data: events } = await supabase
    .from('email_events')
    .select('message_id, event_type')
    .in('message_id', messageIds)
    .eq('is_bot', false);

  const eventMap = new Map<string, { opens: number; clicks: number }>();
  for (const ev of events ?? []) {
    const existing = eventMap.get(ev.message_id) ?? { opens: 0, clicks: 0 };
    if (ev.event_type === 'open') existing.opens++;
    if (ev.event_type === 'click') existing.clicks++;
    eventMap.set(ev.message_id, existing);
  }

  return messages.map((m) => {
    const stats = eventMap.get(m.id) ?? { opens: 0, clicks: 0 };
    return {
      messageId: m.id,
      subject: m.subject ?? '(no subject)',
      status: m.status,
      sentAt: m.created_at,
      opens: stats.opens,
      clicks: stats.clicks,
    };
  });
}

// ── Helper: extract visible text from anchor tag ──
function extractLinkLabel(html: string, anchorOpen: string): string {
  const startIdx = html.indexOf(anchorOpen);
  if (startIdx === -1) return '';
  const afterTag = html.substring(startIdx + anchorOpen.length);
  const closeIdx = afterTag.indexOf('</a>');
  if (closeIdx === -1) return '';
  // Strip inner HTML tags to get plain text
  return afterTag.substring(0, closeIdx).replace(/<[^>]*>/g, '').trim();
}
