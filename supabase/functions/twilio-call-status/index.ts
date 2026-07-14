// supabase/functions/twilio-call-status/index.ts
//
// Public callback hit by Twilio when a call ends (the <Dial action>) and when a
// recording is ready (recordingStatusCallback). Enriches the lead_call_logs row
// (matched by ?callLogId=) with the Twilio CallSid, talk duration, recording URL
// and final status/outcome. Client already writes a client-measured duration on
// disconnect; this fills in what only Twilio knows (recording + authoritative
// status). Only sets fields present in the payload, so the two callbacks don't
// clobber each other.
//
// PUBLIC — deploy with: supabase functions deploy twilio-call-status --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient } from "../_shared/auth.ts";

// Twilio Dial statuses → our manual `outcome` vocabulary (connected | voicemail |
// no_answer | busy | wrong_number). Unmapped ones leave outcome untouched.
const OUTCOME: Record<string, string> = {
  completed: "connected",
  answered: "connected",
  "no-answer": "no_answer",
  busy: "busy",
};

serve(async (req) => {
  try {
    const callLogId = new URL(req.url).searchParams.get("callLogId");
    const form = await req.formData();
    const p: Record<string, string> = {};
    for (const [k, v] of form.entries()) p[k] = String(v);

    const dialStatus = p["DialCallStatus"] ?? p["CallStatus"] ?? "";
    const duration = p["DialCallDuration"] ?? p["RecordingDuration"] ?? "";
    const recordingUrl = p["RecordingUrl"] ?? "";
    const callSid = p["DialCallSid"] ?? p["CallSid"] ?? "";

    const patch: Record<string, unknown> = {};
    if (callSid) patch.call_sid = callSid;
    if (dialStatus) patch.status = dialStatus;
    if (dialStatus && OUTCOME[dialStatus]) patch.outcome = OUTCOME[dialStatus];
    if (duration) { const n = parseInt(duration, 10); if (!isNaN(n)) patch.duration_seconds = n; }
    if (recordingUrl) patch.recording_url = `${recordingUrl}.mp3`;

    if (callLogId && Object.keys(patch).length > 0) {
      const admin = adminClient();
      // Prefer the explicit row; fall back to matching an existing CallSid.
      const { error } = await admin.from("lead_call_logs").update(patch).eq("id", callLogId);
      if (error && callSid) {
        await admin.from("lead_call_logs").update(patch).eq("call_sid", callSid);
      }
    }

    // Twilio expects 200 + (optionally) TwiML. Empty <Response> = hang up cleanly.
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
      status: 200, headers: { "Content-Type": "text/xml" },
    });
  } catch (_e) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
      status: 200, headers: { "Content-Type": "text/xml" },
    });
  }
});
