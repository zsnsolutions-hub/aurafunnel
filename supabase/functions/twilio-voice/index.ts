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

const CALLER_ID = Deno.env.get("TWILIO_CALLER_ID") ?? "";
const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const twiml = (inner: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200, headers: { "Content-Type": "text/xml" },
  });

// Twilio signs requests: HMAC-SHA1(url + sorted POST params) keyed by AuthToken,
// base64. Only enforced when TWILIO_AUTH_TOKEN is set.
async function validSignature(req: Request, url: string, params: Record<string, string>): Promise<boolean> {
  if (!AUTH_TOKEN) return true; // opt-in
  const sig = req.headers.get("X-Twilio-Signature");
  if (!sig) return false;
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(AUTH_TOKEN), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === sig;
}

serve(async (req) => {
  try {
    const reqUrl = new URL(req.url);
    const callLogId = reqUrl.searchParams.get("callLogId") ?? "";

    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);

    if (!(await validSignature(req, req.url, params))) {
      return twiml(`<Say>Unauthorized.</Say>`);
    }

    const to = (params["To"] ?? "").trim();
    if (!to || !CALLER_ID) {
      return twiml(`<Say>This number can't be called right now.</Say>`);
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
