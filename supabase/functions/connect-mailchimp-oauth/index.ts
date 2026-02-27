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

    const { workspaceId, apiKey } = await req.json();

    if (!workspaceId || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: apiKey" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Validate Mailchimp API key ──
    // Mailchimp API keys contain the datacenter suffix: "xxx-us21"
    const dcMatch = apiKey.match(/-(\w+)$/);
    if (!dcMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid Mailchimp API key format. Expected format: key-dc (e.g. abc123-us21)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dc = dcMatch[1];
    let accountEmail = "";

    try {
      const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Mailchimp API key validation failed (${res.status})` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      accountEmail = data.email ?? "";
    } catch (fetchErr) {
      return new Response(
        JSON.stringify({ error: `Failed to reach Mailchimp API: ${(fetchErr as Error).message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Store sender account + secrets via RPC ──
    // Mailchimp is marketing only — NOT for cold outreach
    const { error: rpcError } = await supabaseAdmin.rpc("connect_sender_account", {
      p_workspace_id: workspaceId,
      p_provider: "mailchimp",
      p_display_name: accountEmail ? `${accountEmail} (Mailchimp)` : "Mailchimp",
      p_from_email: accountEmail || "mailchimp@connected",
      p_from_name: "",
      p_use_for_outreach: false, // CRITICAL: Mailchimp is marketing only
      p_secrets: {
        api_key: apiKey,
        datacenter: dc,
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
    console.error("connect-mailchimp-oauth error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
