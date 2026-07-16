// supabase/functions/twilio-voicemail/index.ts
//
// Voicemail fallback for inbound calls when no browser client answers (either
// nobody online, or the dial timed out). Two phases on the same URL:
//   • greeting  — no RecordingUrl yet → play a prompt + <Record action=self>
//   • save      — <Record> action fires with RecordingUrl → persist a voicemail
//     row in lead_call_logs (outcome 'voicemail'), attributed to a matching lead
//     when the caller number is known, else owned by the primary user.
//
// PUBLIC — deploy with: supabase functions deploy twilio-voicemail --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient } from "../_shared/auth.ts";
import { verifyTwilioSignature } from "../_shared/twilio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SELF = `${SUPABASE_URL}/functions/v1/twilio-voicemail`;

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const twiml = (inner: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200, headers: { "Content-Type": "text/xml" },
  });

function toE164(raw: string): string {
  const t = (raw ?? "").trim();
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/[^\d]/g, "");
  const d = t.replace(/[^\d]/g, "");
  if (d.length === 10) return `+1${d}`;
  return `+${d}`;
}

interface LeadMatch { id: string; client_id: string; business_id: string | null }

async function matchLead(admin: ReturnType<typeof adminClient>, from: string): Promise<LeadMatch | null> {
  const target = toE164(from);
  const { data } = await admin
    .from("leads")
    .select("id, client_id, business_id, primary_phone, phones")
    .not("primary_phone", "is", null)
    .limit(3000);
  for (const r of (data ?? []) as { id: string; client_id: string; business_id: string | null; primary_phone: string | null; phones: string[] | null }[]) {
    if ((r.primary_phone && toE164(r.primary_phone) === target) || (r.phones ?? []).some(p => toE164(p) === target)) {
      return { id: r.id, client_id: r.client_id, business_id: r.business_id };
    }
  }
  return null;
}

serve(async (req) => {
  try {
    const form = await req.formData().catch(() => null);
    const p: Record<string, string> = {};
    if (form) for (const [k, v] of form.entries()) p[k] = String(v);

    // Reject spoofed requests — Twilio signs every webhook.
    if (!(await verifyTwilioSignature(req, req.url, p))) {
      return new Response("<Response/>", { status: 403, headers: { "Content-Type": "text/xml" } });
    }

    const recordingUrl = p["RecordingUrl"] ?? "";

    // ── Phase: save (the <Record> action fired) ──
    if (recordingUrl) {
      const admin = adminClient();
      const from = p["From"] ?? p["Caller"] ?? "";
      const dur = parseInt(p["RecordingDuration"] ?? "0", 10);

      const matched = from ? await matchLead(admin, from) : null;
      let clientId = matched?.client_id ?? null;
      if (!clientId) {
        // Unknown caller → own the voicemail to the primary (most-recent) user.
        const { data: routes } = await admin
          .from("voip_inbound_routes").select("user_id").order("last_seen", { ascending: false }).limit(1);
        clientId = (routes?.[0] as { user_id: string } | undefined)?.user_id ?? null;
      }

      if (clientId) {
        await admin.from("lead_call_logs").insert({
          lead_id: matched?.id ?? null,
          client_id: clientId,
          business_id: matched?.business_id ?? null,
          direction: "inbound",
          outcome: "voicemail",
          status: "completed",
          phone_number: from || null,
          duration_seconds: isNaN(dur) ? null : dur,
          recording_url: `${recordingUrl}.mp3`,
          call_sid: p["CallSid"] ?? null,
          notes: "Voicemail",
        });
      }
      return twiml(`<Say>Thank you. We'll get back to you soon. Goodbye.</Say><Hangup/>`);
    }

    // ── Phase: greeting (first hit / <Redirect> from incoming) ──
    return twiml(
      `<Say>You've reached us. Please leave a message after the beep, then hang up or press the pound key.</Say>` +
      `<Record maxLength="120" playBeep="true" finishOnKey="#" action="${xmlEscape(SELF)}" method="POST"/>` +
      `<Say>We didn't catch a message. Goodbye.</Say><Hangup/>`,
    );
  } catch (_e) {
    return twiml(`<Say>Sorry, an error occurred. Goodbye.</Say><Hangup/>`);
  }
});
