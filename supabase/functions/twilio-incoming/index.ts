// supabase/functions/twilio-incoming/index.ts
//
// Inbound Voice webhook — set this as the "A Call Comes In" URL on the Twilio
// number. When someone calls the number, this dials every browser client that
// has an active presence heartbeat (voip_inbound_routes), so whoever is online
// rings; first to answer takes it. The <Client> identity == the user id minted
// into the Voice token. Recording is enabled and reported to twilio-call-status.
//
// PUBLIC — deploy with: supabase functions deploy twilio-incoming --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient } from "../_shared/auth.ts";
import { verifyTwilioSignature } from "../_shared/twilio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PRESENCE_WINDOW_SEC = 120; // only ring clients seen in the last 2 min

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const twiml = (inner: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200, headers: { "Content-Type": "text/xml" },
  });

serve(async (req) => {
  try {
    // Verify this is really Twilio before doing anything (writes DB rows below).
    const form = await req.formData().catch(() => null);
    const params: Record<string, string> = {};
    if (form) for (const [k, v] of form.entries()) params[k] = String(v);
    if (!(await verifyTwilioSignature(req, req.url, params))) {
      return new Response("<Response/>", { status: 403, headers: { "Content-Type": "text/xml" } });
    }

    const admin = adminClient();
    const cutoff = new Date(Date.now() - PRESENCE_WINDOW_SEC * 1000).toISOString();
    const { data: routes } = await admin
      .from("voip_inbound_routes")
      .select("user_id")
      .gte("last_seen", cutoff)
      .order("last_seen", { ascending: false })
      .limit(10);

    const vmUrl = `${SUPABASE_URL}/functions/v1/twilio-voicemail`;
    const identities = (routes ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
    if (identities.length === 0) {
      // Nobody online → straight to voicemail.
      return twiml(`<Redirect method="POST">${xmlEscape(vmUrl)}</Redirect>`);
    }

    const cb = `${SUPABASE_URL}/functions/v1/twilio-call-status`;
    // vm=1 tells twilio-call-status to send unanswered inbound calls to voicemail.
    const action = `${cb}?vm=1`;
    const clients = identities.map(id => `<Client>${xmlEscape(id)}</Client>`).join("");
    const dial =
      `<Dial answerOnBridge="true" timeout="25"` +
      ` record="record-from-answer-dual"` +
      ` action="${xmlEscape(action)}" method="POST"` +
      ` recordingStatusCallback="${xmlEscape(cb)}" recordingStatusCallbackEvent="completed">` +
      clients +
      `</Dial>`;
    return twiml(dial);
  } catch (_e) {
    return twiml(`<Say>An error occurred connecting your call.</Say>`);
  }
});
