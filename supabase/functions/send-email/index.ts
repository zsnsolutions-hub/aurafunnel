import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TRACKING_BASE_URL = Deno.env.get("TRACKING_BASE_URL") ?? "";

// Fallback env vars (used when no per-user config exists)
const ENV_SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const ENV_SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const ENV_SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
const ENV_SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const ENV_SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Provider credentials (per-user DB config or env fallback) ──
interface ProviderCreds {
  api_key?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  from_email?: string;
  from_name?: string;
}

async function loadProviderCreds(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  provider: string
): Promise<ProviderCreds> {
  // Try per-user config from DB
  const { data } = await supabaseAdmin
    .from("email_provider_configs")
    .select("*")
    .eq("owner_id", userId)
    .eq("provider", provider)
    .eq("is_active", true)
    .single();

  if (data) {
    return {
      api_key: data.api_key ?? undefined,
      smtp_host: data.smtp_host ?? undefined,
      smtp_port: data.smtp_port ?? 587,
      smtp_user: data.smtp_user ?? undefined,
      smtp_pass: data.smtp_pass ?? undefined,
      from_email: data.from_email ?? undefined,
      from_name: data.from_name ?? undefined,
    };
  }

  // Fallback to env vars
  if (provider === "sendgrid") {
    return { api_key: ENV_SENDGRID_API_KEY || undefined };
  }
  return {
    smtp_host: ENV_SMTP_HOST || undefined,
    smtp_port: ENV_SMTP_PORT,
    smtp_user: ENV_SMTP_USER || undefined,
    smtp_pass: ENV_SMTP_PASS || undefined,
  };
}

// ── Link rewriting + pixel injection (server-side instrumentation) ──
function instrumentHtml(
  html: string,
  messageId: string,
  linkRows: { id: string; destination_url: string }[],
  trackOpens: boolean,
  trackClicks: boolean
): string {
  let result = html;

  if (trackClicks && TRACKING_BASE_URL && linkRows.length > 0) {
    for (const link of linkRows) {
      const trackingUrl = `${TRACKING_BASE_URL}/t/c/${link.id}`;
      result = result.replace(
        new RegExp(
          `(href\\s*=\\s*["'])${escapeRegex(link.destination_url)}(["'])`,
          "i"
        ),
        `$1${trackingUrl}$2`
      );
    }
  }

  if (trackOpens && TRACKING_BASE_URL) {
    const pixel = `<img src="${TRACKING_BASE_URL}/t/p/${messageId}.png" width="1" height="1" style="display:none" alt="" />`;
    if (result.includes("</body>")) {
      result = result.replace("</body>", `${pixel}</body>`);
    } else {
      result += pixel;
    }
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Extract links from HTML ──
function extractLinks(
  html: string
): { url: string; label: string; index: number }[] {
  const anchorRegex =
    /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: { url: string; label: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1];
    if (/^(mailto:|tel:|#|javascript:)/i.test(url)) continue;
    const label = match[2].replace(/<[^>]*>/g, "").trim();
    links.push({ url, label, index: idx++ });
  }
  return links;
}

// ── Send via SendGrid ──
async function sendViaSendGrid(
  to: string,
  from: string,
  subject: string,
  html: string,
  creds: ProviderCreds
): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  const apiKey = creds.api_key;
  if (!apiKey)
    return {
      success: false,
      error:
        "SendGrid API key not configured. Go to Settings → Integrations → SendGrid to add your key.",
    };

  const fromObj: { email: string; name?: string } = { email: from };
  if (creds.from_name) fromObj.name = creds.from_name;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: fromObj,
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `SendGrid ${res.status}: ${errText}` };
  }

  const messageId = res.headers.get("x-message-id") ?? undefined;
  return { success: true, providerMessageId: messageId };
}

// ── Send via SMTP ──
async function sendViaSmtp(
  to: string,
  from: string,
  subject: string,
  html: string,
  creds: ProviderCreds
): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  const host = creds.smtp_host;
  if (!host)
    return {
      success: false,
      error:
        "SMTP host not configured. Go to Settings → Integrations → SMTP/Gmail to add your credentials.",
    };

  try {
    const port = creds.smtp_port ?? 587;
    const conn = await Deno.connect({ hostname: host, port });
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function readLine(): Promise<string> {
      const buf = new Uint8Array(1024);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)).trim() : "";
    }

    async function send(cmd: string): Promise<string> {
      await conn.write(encoder.encode(cmd + "\r\n"));
      return await readLine();
    }

    await readLine(); // greeting
    await send("EHLO localhost");

    if (creds.smtp_user && creds.smtp_pass) {
      await send("AUTH LOGIN");
      await send(btoa(creds.smtp_user));
      await send(btoa(creds.smtp_pass));
    }

    const fromDisplay = creds.from_name
      ? `${creds.from_name} <${from}>`
      : from;

    await send(`MAIL FROM:<${from}>`);
    await send(`RCPT TO:<${to}>`);
    await send("DATA");

    const boundary = `boundary-${crypto.randomUUID()}`;
    const message = [
      `From: ${fromDisplay}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      html,
      ``,
      `--${boundary}--`,
      `.`,
    ].join("\r\n");

    const resp = await send(message);
    await send("QUIT");
    conn.close();

    const idMatch = resp.match(/<([^>]+)>/);
    return {
      success: true,
      providerMessageId: idMatch?.[1] ?? undefined,
    };
  } catch (err) {
    return { success: false, error: `SMTP error: ${(err as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const {
      lead_id,
      to_email,
      from_email,
      subject,
      html_body,
      provider = "sendgrid",
      track_opens = true,
      track_clicks = true,
    } = body;

    if (!to_email || !subject || !html_body) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to_email, subject, html_body",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load per-user provider credentials (falls back to env vars)
    const creds = await loadProviderCreds(supabaseAdmin, user.id, provider);
    const senderEmail =
      from_email || creds.from_email || creds.smtp_user || "noreply@example.com";

    // 1. Create email_messages record
    const { data: emailMsg, error: msgError } = await supabaseAdmin
      .from("email_messages")
      .insert({
        lead_id: lead_id || null,
        owner_id: user.id,
        provider,
        subject,
        to_email,
        from_email: senderEmail,
        status: "sent",
        track_opens,
        track_clicks,
      })
      .select()
      .single();

    if (msgError || !emailMsg) {
      return new Response(
        JSON.stringify({
          error: `Failed to create message record: ${msgError?.message}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Extract and insert tracked links
    let linkRows: { id: string; destination_url: string }[] = [];
    if (track_clicks && TRACKING_BASE_URL) {
      const links = extractLinks(html_body);
      if (links.length > 0) {
        const { data: inserted } = await supabaseAdmin
          .from("email_links")
          .insert(
            links.map((l) => ({
              message_id: emailMsg.id,
              destination_url: l.url,
              link_label: l.label || null,
              link_index: l.index,
            }))
          )
          .select("id, destination_url");
        linkRows = inserted ?? [];
      }
    }

    // 3. Instrument the HTML
    const instrumentedHtml = instrumentHtml(
      html_body,
      emailMsg.id,
      linkRows,
      track_opens,
      track_clicks
    );

    // 4. Send via chosen provider
    let sendResult: {
      success: boolean;
      providerMessageId?: string;
      error?: string;
    };

    if (provider === "sendgrid") {
      sendResult = await sendViaSendGrid(
        to_email,
        senderEmail,
        subject,
        instrumentedHtml,
        creds
      );
    } else if (provider === "smtp" || provider === "gmail") {
      sendResult = await sendViaSmtp(
        to_email,
        senderEmail,
        subject,
        instrumentedHtml,
        creds
      );
    } else {
      sendResult = { success: true };
    }

    // 5. Update message record
    if (sendResult.success) {
      if (sendResult.providerMessageId) {
        await supabaseAdmin
          .from("email_messages")
          .update({
            provider_message_id: sendResult.providerMessageId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", emailMsg.id);
      }
    } else {
      await supabaseAdmin
        .from("email_messages")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailMsg.id);
    }

    return new Response(
      JSON.stringify({
        success: sendResult.success,
        message_id: emailMsg.id,
        provider_message_id: sendResult.providerMessageId ?? null,
        error: sendResult.error ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
