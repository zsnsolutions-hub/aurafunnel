import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://scaliyo.com";
const SENDER_EMAIL = Deno.env.get("AUTH_SENDER_EMAIL") ?? "support@scaliyo.com";
const SENDER_NAME = Deno.env.get("AUTH_SENDER_NAME") ?? "Scaliyo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Branded HTML email wrapper ──
function wrapInLayout(title: string, preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="light dark"/>
<title>${title}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
  .wrapper { width: 100%; background-color: #f1f5f9; padding: 40px 0; }
  .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
  .header { background: linear-gradient(135deg, #0A1628 0%, #0F2440 100%); padding: 36px 40px; text-align: center; }
  .header img { height: 32px; width: auto; }
  .body { padding: 40px; }
  .body h1 { margin: 0 0 12px; font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1.3; }
  .body p { margin: 0 0 16px; font-size: 15px; color: #475569; line-height: 1.6; }
  .cta-wrapper { text-align: center; margin: 32px 0; }
  .cta { display: inline-block; padding: 14px 40px; background-color: #14b8a6; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; }
  .note { margin: 24px 0 0; padding: 16px 20px; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }
  .note p { font-size: 13px; color: #64748b; margin: 0; }
  .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #f1f5f9; }
  .footer p { margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5; }
  .preheader { display: none !important; max-height: 0; overflow: hidden; mso-hide: all; }
  @media (prefers-color-scheme: dark) {
    body { background-color: #0f172a !important; }
    .wrapper { background-color: #0f172a !important; }
    .container { background-color: #1e293b !important; }
    .body h1 { color: #f1f5f9 !important; }
    .body p { color: #94a3b8 !important; }
    .note { background-color: #0f172a !important; border-color: #334155 !important; }
    .note p { color: #64748b !important; }
    .footer p { color: #475569 !important; }
  }
</style>
</head>
<body>
<span class="preheader">${preheader}</span>
<div class="wrapper">
  <div class="container">
    <div class="header">
      <img src="${SITE_URL}/scaliyo-logo-dark.png" alt="Scaliyo" />
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Scaliyo. All rights reserved.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Email content per action type ──
function buildConfirmationEmail(confirmUrl: string): { subject: string; html: string } {
  const subject = "Confirm your Scaliyo account";
  const body = `
    <h1>Welcome to Scaliyo</h1>
    <p>Thanks for signing up! Please confirm your email address by clicking the button below.</p>
    <div class="cta-wrapper">
      <a href="${confirmUrl}" class="cta" target="_blank" clicktracking="off">Confirm Email Address</a>
    </div>
    <div class="note">
      <p>This link expires in 24 hours. If you didn&rsquo;t create a Scaliyo account, you can safely ignore this email.</p>
    </div>
  `;
  return {
    subject,
    html: wrapInLayout(subject, "Confirm your email to get started with Scaliyo.", body),
  };
}

function buildRecoveryEmail(resetUrl: string): { subject: string; html: string } {
  const subject = "Reset your Scaliyo password";
  const body = `
    <h1>Reset your password</h1>
    <p>We received a request to reset the password for your Scaliyo account. Click the button below to choose a new password.</p>
    <div class="cta-wrapper">
      <a href="${resetUrl}" class="cta" target="_blank" clicktracking="off">Reset Password</a>
    </div>
    <div class="note">
      <p>This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash; your password will remain unchanged.</p>
    </div>
  `;
  return {
    subject,
    html: wrapInLayout(subject, "Reset your Scaliyo password.", body),
  };
}

function buildEmailChangeEmail(confirmUrl: string): { subject: string; html: string } {
  const subject = "Confirm your new email address";
  const body = `
    <h1>Confirm email change</h1>
    <p>You requested to change the email address on your Scaliyo account. Please confirm your new address by clicking the button below.</p>
    <div class="cta-wrapper">
      <a href="${confirmUrl}" class="cta" target="_blank" clicktracking="off">Confirm New Email</a>
    </div>
    <div class="note">
      <p>If you didn&rsquo;t request this change, please contact support immediately.</p>
    </div>
  `;
  return {
    subject,
    html: wrapInLayout(subject, "Confirm your new email for Scaliyo.", body),
  };
}

// ── Send via SendGrid API ──
async function sendViaSendGrid(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY not set — cannot send auth email");
    return false;
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDER_EMAIL, name: SENDER_NAME },
      subject,
      content: [{ type: "text/html", value: html }],
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`SendGrid error ${res.status}: ${errText}`);
    throw new Error(`SendGrid ${res.status}: ${errText}`);
  }

  return true;
}

// ── Main handler ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    const userEmail: string = payload.user?.email;
    const emailAction: string = payload.email_data?.email_action_type;
    const tokenHash: string = payload.email_data?.token_hash ?? "";

    if (!userEmail || !emailAction || !tokenHash) {
      console.error("Missing required fields:", { userEmail, emailAction, tokenHash: !!tokenHash });
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the verification URL pointing to the app (HashRouter)
    // The app will verify the token client-side using supabase.auth.verifyOtp()
    const actionType = emailAction === "recovery" ? "recovery" : emailAction === "email_change" ? "email_change" : "signup";
    const verifyParams = new URLSearchParams({ token_hash: tokenHash, type: actionType });
    const confirmUrl = `${SITE_URL}/#/auth/confirm?${verifyParams.toString()}`;

    let email: { subject: string; html: string };

    switch (emailAction) {
      case "signup":
        email = buildConfirmationEmail(confirmUrl);
        break;
      case "recovery":
        email = buildRecoveryEmail(confirmUrl);
        break;
      case "email_change":
        email = buildEmailChangeEmail(confirmUrl);
        break;
      case "invite":
        email = buildConfirmationEmail(confirmUrl); // reuse confirmation template for invites
        break;
      default:
        // For any other action type, build a generic confirmation
        email = buildConfirmationEmail(confirmUrl);
        break;
    }

    const sent = await sendViaSendGrid(userEmail, email.subject, email.html);

    if (!sent) {
      return new Response(
        JSON.stringify({ error: "Failed to send email via SendGrid" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error("auth-send-email error:", errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
