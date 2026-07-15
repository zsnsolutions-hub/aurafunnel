// supabase/functions/inbound-email/index.ts
//
// Generic inbound-email ingestion. POST a reply here (JSON or form-data) and it's
// matched to a lead + the outgoing message it replies to, then stored in
// inbound_emails for the unified inbox. Source-agnostic: SendGrid/Mailgun Inbound
// Parse, a Gmail→webhook forward, Zapier/Make, or an IMAP poller can all feed it.
//
// Matching order:
//   1. In-Reply-To → email_messages.provider_message_id (exact thread) → owner+lead
//   2. To address   → sender_accounts.from_email → owner; From → lead by email
//
// Auth: if INBOUND_EMAIL_SECRET is set, require header X-Inbound-Secret to match.
// PUBLIC — deploy with: supabase functions deploy inbound-email --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient } from "../_shared/auth.ts";

const INBOUND_SECRET = Deno.env.get("INBOUND_EMAIL_SECRET") ?? "";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const cleanAngle = (s: string | undefined | null) => (s ?? "").trim().replace(/^<|>$/g, "");
const emailOnly = (s: string | undefined | null): string => {
  const m = (s ?? "").match(/<([^>]+)>/);
  return (m ? m[1] : (s ?? "")).trim().toLowerCase();
};
const nameOnly = (s: string | undefined | null): string | null => {
  const m = (s ?? "").match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : null;
};

// SendGrid Inbound Parse (and some Mailgun setups) post the full RFC822 header
// block in a single `headers` field rather than discrete Message-Id/In-Reply-To
// fields. Parse it so threading — and therefore reply→A/B-variant attribution —
// works from hosted sources, not just IMAP.
function parseRawHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const unfolded = (raw || "").replace(/\r?\n[ \t]+/g, " "); // unfold continuations
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    if (k && !(k in out)) out[k] = line.slice(i + 1).trim();
  }
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (INBOUND_SECRET && req.headers.get("X-Inbound-Secret") !== INBOUND_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    // Accept JSON or form-encoded (SendGrid/Mailgun Inbound Parse post form-data).
    let p: Record<string, string> = {};
    const ct = req.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json")) {
      p = await req.json();
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) p[k] = String(v);
    }

    // Normalize across common provider field names.
    const fromRaw = p.from ?? p.From ?? p.sender ?? "";
    const toRaw = p.to ?? p.To ?? p.recipient ?? "";
    const subject = p.subject ?? p.Subject ?? "";
    const bodyText = p.text ?? p["body-plain"] ?? p.plain ?? "";
    const bodyHtml = p.html ?? p["body-html"] ?? "";
    // Fall back to the raw header block (SendGrid/Mailgun) for threading fields.
    const hdr = (p.headers || p.Headers) ? parseRawHeaders(p.headers ?? p.Headers) : {};
    const messageId = cleanAngle(p.message_id ?? p["Message-Id"] ?? p["Message-ID"] ?? p.messageId ?? hdr["message-id"]);
    const inReplyTo = cleanAngle(p.in_reply_to ?? p["In-Reply-To"] ?? p.inReplyTo ?? hdr["in-reply-to"]);
    // References lists the whole thread ancestry; last id is the immediate parent.
    // Used only as a fallback when In-Reply-To doesn't resolve to one of our messages.
    const referenceIds = (p.references ?? p.References ?? hdr["references"] ?? "")
      .split(/\s+/).map(cleanAngle).filter(Boolean).reverse();
    const receivedAt = p.received_at ?? new Date().toISOString();

    const fromEmail = emailOnly(fromRaw);
    const toEmail = emailOnly(toRaw);
    if (!fromEmail) return json({ error: "missing from" }, 400);

    const admin = adminClient();

    let ownerId: string | null = null;
    let leadId: string | null = null;
    let workspaceId: string | null = null;
    let senderAccountId: string | null = null;
    let replyToMessageId: string | null = null;

    // 1. Thread match by In-Reply-To → the outgoing message; if that misses, walk
    //    the References chain (nearest ancestor first) so hosted providers that
    //    only emit References still attribute the reply to our sent message.
    const threadCandidates = [inReplyTo, ...referenceIds].filter(Boolean);
    for (const candidate of threadCandidates) {
      const { data: msg } = await admin.from("email_messages")
        .select("id, owner_id, lead_id, workspace_id, sender_account_id")
        .eq("provider_message_id", candidate).maybeSingle();
      if (msg) {
        replyToMessageId = msg.id; ownerId = msg.owner_id; leadId = msg.lead_id;
        workspaceId = msg.workspace_id; senderAccountId = msg.sender_account_id;
        break;
      }
    }

    // 2. Fallback: To address → our sender account → owner; From → lead.
    if (!ownerId && toEmail) {
      const { data: sa } = await admin.from("sender_accounts")
        .select("id, workspace_id").ilike("from_email", toEmail).maybeSingle();
      if (sa) {
        senderAccountId = sa.id; workspaceId = sa.workspace_id;
        ownerId = sa.workspace_id; // legacy: workspace_id mirrors the owner id
      }
    }
    if (ownerId && !leadId) {
      const { data: lead } = await admin.from("leads")
        .select("id").eq("client_id", ownerId)
        .or(`primary_email.ilike.${fromEmail},emails.cs.{${fromEmail}}`)
        .limit(1).maybeSingle();
      if (lead) leadId = lead.id;
    }

    if (!ownerId) return json({ ok: true, stored: false, reason: "no matching sender/owner" }, 200);

    const { error } = await admin.from("inbound_emails").insert({
      owner_id: ownerId, workspace_id: workspaceId, lead_id: leadId,
      sender_account_id: senderAccountId, reply_to_message_id: replyToMessageId,
      from_email: fromEmail, from_name: nameOnly(fromRaw), to_email: toEmail,
      subject, body_text: bodyText || null, body_html: bodyHtml || null,
      message_id: messageId || null, in_reply_to: inReplyTo || null, received_at: receivedAt,
    });
    // Duplicate message_id (already ingested) is a success, not an error.
    if (error && !String(error.message).includes("duplicate")) {
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, stored: true, lead_matched: Boolean(leadId) }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
