import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { workspaceId, host, port, user: smtpUser, pass, fromEmail, fromName } = await req.json();

    if (!workspaceId || !host || !smtpUser || !pass || !fromEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: host, user, pass, fromEmail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Validate SMTP credentials by attempting a connection ──
    try {
      const smtpPort = port ?? 587;
      let conn: Deno.Conn;

      if (smtpPort === 465) {
        conn = await Deno.connectTls({ hostname: host, port: smtpPort });
      } else {
        conn = await Deno.connect({ hostname: host, port: smtpPort });
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      const buf = new Uint8Array(4096);

      async function readResp(): Promise<string> {
        let full = "";
        while (true) {
          const n = await conn.read(buf);
          if (!n) break;
          full += decoder.decode(buf.subarray(0, n));
          const lines = full.trimEnd().split("\n");
          const last = lines[lines.length - 1].trimStart();
          if (/^\d{3}\s/.test(last) || /^\d{3}$/.test(last)) break;
        }
        return full.trim();
      }

      async function send(cmd: string): Promise<string> {
        await conn.write(encoder.encode(cmd + "\r\n"));
        return await readResp();
      }

      // Read greeting
      await readResp();
      const ehlo = await send("EHLO localhost");

      // STARTTLS for non-465 ports
      if (smtpPort !== 465 && (ehlo.includes("STARTTLS") || smtpPort === 587)) {
        const tlsResp = await send("STARTTLS");
        if (tlsResp.startsWith("220")) {
          conn = await (Deno as any).startTls(conn, { hostname: host });
          await send("EHLO localhost");
        }
      }

      // AUTH LOGIN
      await send("AUTH LOGIN");
      await send(btoa(smtpUser));
      const authResp = await send(btoa(pass));

      if (authResp.startsWith("535") || authResp.startsWith("534")) {
        conn.close();
        return new Response(
          JSON.stringify({ error: "SMTP authentication failed. Check your credentials." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await send("QUIT");
      conn.close();
    } catch (connErr) {
      return new Response(
        JSON.stringify({ error: `SMTP connection failed: ${(connErr as Error).message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Store sender account + secrets via RPC ──
    const { error: rpcError } = await supabaseAdmin.rpc("connect_sender_account", {
      p_workspace_id: workspaceId,
      p_provider: "smtp",
      p_display_name: fromName ? `${fromName} (SMTP)` : fromEmail,
      p_from_email: fromEmail,
      p_from_name: fromName ?? "",
      p_use_for_outreach: true,
      p_secrets: {
        smtp_host: host,
        smtp_port: port ?? 587,
        smtp_user: smtpUser,
        smtp_pass: pass,
      },
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: `Failed to save account: ${rpcError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("connect-smtp error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
