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
    const messageId = cleanAngle(p.message_id ?? p["Message-Id"] ?? p["Message-ID"] ?? p.messageId);
    const inReplyTo = cleanAngle(p.in_reply_to ?? p["In-Reply-To"] ?? p.inReplyTo);
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

    // 1. Thread match by In-Reply-To → the outgoing message.
    if (inReplyTo) {
      const { data: msg } = await admin.from("email_messages")
        .select("id, owner_id, lead_id, workspace_id, sender_account_id")
        .eq("provider_message_id", inReplyTo).maybeSingle();
      if (msg) {
        replyToMessageId = msg.id; ownerId = msg.owner_id; leadId = msg.lead_id;
        workspaceId = msg.workspace_id; senderAccountId = msg.sender_account_id;
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
