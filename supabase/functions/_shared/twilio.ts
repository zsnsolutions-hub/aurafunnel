// Shared Twilio webhook signature verification.
//
// Twilio signs each request with X-Twilio-Signature =
//   base64( HMAC-SHA1( requestUrl + concat(sortedPostParams as key+value), AuthToken ) )
//
// This verifier FAILS CLOSED: it rejects when TWILIO_AUTH_TOKEN is unset or the
// signature is missing/invalid. That is safe because the VOIP feature is dormant
// until the Twilio secrets are provisioned (setup-twilio.sh); once they are set,
// genuine Twilio requests verify and everything else is rejected. Comparison is
// constant-time to avoid signature-timing leaks.
export async function verifyTwilioSignature(
  req: Request,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  if (!token) return false; // cannot authenticate without the account token
  const sig = req.headers.get("X-Twilio-Signature");
  if (!sig) return false;

  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
