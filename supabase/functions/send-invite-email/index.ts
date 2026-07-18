// supabase/functions/send-invite-email/index.ts
//
// Sends a workspace-invitation email (system email via SendGrid). Auth: the
// caller must be a workspace owner/admin (verified by re-checking membership),
// so this can't be used to spam arbitrary addresses. The accept flow itself is
// still gated by the token + the invitee's email on accept_workspace_invite.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient, bearerToken } from "../_shared/auth.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const SENDER_EMAIL = Deno.env.get("AUTH_SENDER_EMAIL") ?? "support@scaliyo.com";
const SENDER_NAME = Deno.env.get("AUTH_SENDER_NAME") ?? "Scaliyo";
const SITE_URL = Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://scaliyo.com";

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = bearerToken(req);
  if (!token) return json({ error: "Missing Authorization" }, 401);

  const admin = adminClient();
  const { data: userRes, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userRes?.user) return json({ error: "Invalid token" }, 401);
  const uid = userRes.user.id;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const email = String(body.email ?? "").trim().toLowerCase();
  const inviteToken = String(body.token ?? "").trim();
  const role = String(body.role ?? "member");
  const inviterName = String(body.inviter_name ?? "A teammate");
  const workspaceName = String(body.workspace_name ?? "a Scaliyo workspace");
  if (!email || !inviteToken) return json({ error: "email and token are required" }, 400);

  // Authorize: caller must be a workspace owner/admin, and the token must belong
  // to that same workspace (prevents sending arbitrary tokens / spamming).
  const { data: inv } = await admin.from("workspace_invites")
    .select("workspace_id, email, status").eq("token", inviteToken).maybeSingle();
  if (!inv || inv.status !== "pending" || inv.email.toLowerCase() !== email) {
    return json({ error: "Invite not found or not pending" }, 400);
  }
  const { data: mem } = await admin.from("workspace_members")
    .select("role").eq("workspace_id", inv.workspace_id).eq("user_id", uid).maybeSingle();
  if (!mem || !["owner", "admin"].includes(mem.role)) return json({ error: "Not authorized" }, 403);

  if (!SENDGRID_API_KEY) return json({ error: "Email is not configured (SENDGRID_API_KEY)" }, 500);

  const acceptUrl = `${SITE_URL}/#/auth?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`;
  const html = `<!doctype html><html><body style="font-family:sans-serif;background:#f6f7fb;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <h2 style="color:#111827;margin:0 0 8px;">You're invited to ${esc(workspaceName)}</h2>
      <p style="color:#4b5563;">${esc(inviterName)} invited you to join their Scaliyo workspace as <strong>${esc(role)}</strong>.</p>
      <p style="margin:24px 0;"><a href="${acceptUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">Accept invitation</a></p>
      <p style="color:#9ca3af;font-size:12px;">Sign in or create an account with <strong>${esc(email)}</strong> to accept. This invite expires in 7 days.</p>
    </div></body></html>`;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: SENDER_EMAIL, name: SENDER_NAME },
      subject: `${inviterName} invited you to ${workspaceName} on Scaliyo`,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) {
    console.error("SendGrid invite email failed:", res.status, (await res.text()).slice(0, 200));
    return json({ error: "Failed to send invite email" }, 502);
  }
  return json({ success: true });
});
