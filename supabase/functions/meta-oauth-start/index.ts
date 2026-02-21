// File: supabase/functions/meta-oauth-start/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const OAUTH_REDIRECT_BASE = Deno.env.get("OAUTH_REDIRECT_BASE") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Demo mode: no META_APP_ID configured ──
    if (!META_APP_ID) {
      const demoPageId = `demo_page_${user.id.slice(0, 8)}`;
      const demoIgId = `demo_ig_${user.id.slice(0, 8)}`;
      const demoExpiry = new Date(Date.now() + 60 * 86400 * 1000).toISOString();

      const { data: existing } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", "meta")
        .eq("meta_page_id", demoPageId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("social_accounts").insert({
          user_id: user.id,
          provider: "meta",
          meta_page_id: demoPageId,
          meta_page_name: "My Business Page",
          meta_page_access_token_encrypted: "demo_token",
          meta_ig_user_id: demoIgId,
          meta_ig_username: "mybusiness",
          token_expires_at: demoExpiry,
        });
      }

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
      return new Response(JSON.stringify({ url: `${origin}/portal/social-scheduler?meta=connected&pages=1` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = crypto.randomUUID();

    // Store state temporarily for CSRF protection
    await supabase.from("social_post_events").insert({
      user_id: user.id,
      post_id: null,
      event_type: "started",
      payload: { oauth_state: state, provider: "meta" },
    });

    const redirectUri = `${OAUTH_REDIRECT_BASE}/functions/v1/meta-oauth-callback`;
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ].join(",");

    const authUrl =
      `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_type=code`;

    return new Response(JSON.stringify({ url: authUrl, state }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
