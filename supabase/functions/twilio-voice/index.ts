// supabase/functions/twilio-voice/index.ts
//
// TwiML webhook hit by Twilio when the browser Voice SDK places an outgoing call
// (it is the Voice URL of the TwiML App). Reads the dialed number (`To`) and our
// `callLogId` from the POST params, and returns TwiML that dials the lead from
// the Twilio caller ID with recording enabled. The <Dial action> fires
// twilio-call-status when the call ends (duration + recording + status).
//
// PUBLIC endpoint — Twilio sends no Supabase JWT. Deploy with:
//   supabase functions deploy twilio-voice --no-verify-jwt
// Optional signature check: set TWILIO_AUTH_TOKEN to enforce X-Twilio-Signature.
//
// Secrets: TWILIO_CALLER_ID (E.164, a Voice-capable Twilio number), SUPABASE_URL,
//          optionally TWILIO_AUTH_TOKEN.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioSignature } from "../_shared/twilio.ts";

const CALLER_ID = Deno.env.get("TWILIO_CALLER_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const twiml = (inner: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200, headers: { "Content-Type": "text/xml" },
  });

serve(async (req) => {
  try {
    const reqUrl = new URL(req.url);
    const callLogId = reqUrl.searchParams.get("callLogId") ?? "";

    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);

    if (!(await verifyTwilioSignature(req, req.url, params))) {
      return twiml(`<Say>Unauthorized.</Say>`);
    }

    const to = (params["To"] ?? "").trim();
    if (!to || !CALLER_ID) {
      return twiml(`<Say>This number can't be called right now.</Say>`);
    }

    // Server-side credit gate (Roadmap 5.1 / BUG-010). The browser also charges
    // (workspace_ai_usage), but that's bypassable; enforce the workspace AI
    // ceiling here too — a distinct counter (ai_proxy_usage). Identity comes from
    // the signed Voice token: From = "client:<userId>". Fail OPEN on any infra
    // error so a metering blip never blocks a legitimate call.
    const from = params["From"] ?? "";
    const callerUserId = from.startsWith("client:") ? from.slice("client:".length) : "";
    if (callerUserId && SUPABASE_URL && SERVICE_ROLE_KEY) {
      try {
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { data, error } = await admin.rpc("enforce_ai_proxy_quota", {
          p_user_id: callerUserId, p_operation: "voice_call", p_kind: "content",
        });
        const q = data as { allowed?: boolean } | null;
        if (!error && q && q.allowed === false) {
          return twiml(`<Say>You have reached your calling credit limit for this month. Please upgrade your plan to keep making calls.</Say>`);
        }
      } catch (_e) { /* fail open */ }
    }

    // Where Twilio reports the finished call (duration + recording + status).
    const cb = `${SUPABASE_URL}/functions/v1/twilio-call-status${callLogId ? `?callLogId=${encodeURIComponent(callLogId)}` : ""}`;

    // <Number> vs <Sip> — E.164 numbers dial as <Number>.
    const dial =
      `<Dial callerId="${xmlEscape(CALLER_ID)}" answerOnBridge="true"` +
      ` record="record-from-answer-dual"` +
      ` action="${xmlEscape(cb)}" method="POST"` +
      ` recordingStatusCallback="${xmlEscape(cb)}" recordingStatusCallbackEvent="completed">` +
      `<Number>${xmlEscape(to)}</Number>` +
      `</Dial>`;
    return twiml(dial);
  } catch (_e) {
    return twiml(`<Say>An error occurred placing the call.</Say>`);
  }
});
