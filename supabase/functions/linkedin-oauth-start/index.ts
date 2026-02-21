// File: supabase/functions/linkedin-oauth-start/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID") ?? "";
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

    // ── Demo mode: no LINKEDIN_CLIENT_ID configured ──
    if (!LINKEDIN_CLIENT_ID) {
      const demoMemberUrn = `urn:li:person:demo_${user.id.slice(0, 8)}`;
      const demoOrgUrn = `urn:li:organization:demo_${user.id.slice(0, 8)}`;
      const demoExpiry = new Date(Date.now() + 60 * 86400 * 1000).toISOString();

      const { data: existing } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", "linkedin")
        .maybeSingle();

      if (!existing) {
        await supabase.from("social_accounts").insert({
          user_id: user.id,
          provider: "linkedin",
          linkedin_member_urn: demoMemberUrn,
          linkedin_org_urn: demoOrgUrn,
          linkedin_org_name: "My Company",
          linkedin_access_token_encrypted: "demo_token",
          token_expires_at: demoExpiry,
        });
      }

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
      return new Response(JSON.stringify({ url: `${origin}/portal/social-scheduler?linkedin=connected` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = crypto.randomUUID();

    await supabase.from("social_post_events").insert({
      user_id: user.id,
      post_id: null,
      event_type: "started",
      payload: { oauth_state: state, provider: "linkedin" },
    });

    const redirectUri = `${OAUTH_REDIRECT_BASE}/functions/v1/linkedin-oauth-callback`;
    const scopes = "openid profile email w_member_social r_organization_social w_organization_social r_basicprofile";

    const authUrl =
      `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code` +
      `&client_id=${LINKEDIN_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=${encodeURIComponent(scopes)}`;

    return new Response(JSON.stringify({ url: authUrl, state }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
