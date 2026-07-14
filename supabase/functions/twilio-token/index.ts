// supabase/functions/twilio-token/index.ts
//
// Mints a Twilio Voice Access Token (JWT) for the browser Voice SDK. The client
// calls this, gets a short-lived token, and does `new Device(token)` to place
// in-app calls. Requires a logged-in user (the token identity = user id).
//
// Returns 200 { configured:false } (not an error) when Twilio secrets aren't set,
// so the UI can show a friendly "set up calling" state instead of breaking.
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET,
//          TWILIO_TWIML_APP_SID
// Deploy: supabase functions deploy twilio-token

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const API_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID") ?? "";
const API_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET") ?? "";
const TWIML_APP_SID = Deno.env.get("TWILIO_TWIML_APP_SID") ?? "";

const configured = () => Boolean(ACCOUNT_SID && API_KEY_SID && API_KEY_SECRET && TWIML_APP_SID);

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string): string => b64url(new TextEncoder().encode(s));

async function signHS256(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return b64url(new Uint8Array(sig));
}

/** Build a Twilio AccessToken with a VoiceGrant (outgoing via the TwiML app). */
async function mintVoiceToken(identity: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${API_KEY_SID}-${now}`,
    iss: API_KEY_SID,
    sub: ACCOUNT_SID,
    iat: now,
    nbf: now,
    exp: now + 3600,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: TWIML_APP_SID },
      },
    },
  };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const sig = await signHS256(unsigned, API_KEY_SECRET);
  return `${unsigned}.${sig}`;
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401, cors);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await adminClient().auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401, cors);

    if (!configured()) return json({ configured: false }, 200, cors);

    const voiceToken = await mintVoiceToken(user.id);
    return json({ configured: true, token: voiceToken, identity: user.id }, 200, cors);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Token mint failed" }, 500, cors);
  }
});
