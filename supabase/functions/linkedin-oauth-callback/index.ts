// File: supabase/functions/linkedin-oauth-callback/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID") ?? "";
const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET") ?? "";
const OAUTH_REDIRECT_BASE = Deno.env.get("OAUTH_REDIRECT_BASE") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam || !code || !state) {
      return Response.redirect(
        `${APP_BASE_URL}/portal/social-scheduler?error=linkedin_denied`,
        302
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate state
    const { data: stateRow } = await adminClient
      .from("social_post_events")
      .select("user_id")
      .eq("event_type", "started")
      .filter("payload->>oauth_state", "eq", state)
      .filter("payload->>provider", "eq", "linkedin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!stateRow) {
      return Response.redirect(
        `${APP_BASE_URL}/portal/social-scheduler?error=invalid_state`,
        302
      );
    }

    const userId = stateRow.user_id;
    const redirectUri = `${OAUTH_REDIRECT_BASE}/functions/v1/linkedin-oauth-callback`;

    // 1. Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return Response.redirect(
        `${APP_BASE_URL}/portal/social-scheduler?error=linkedin_token_failed`,
        302
      );
    }

    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000;

    // 2. Get member profile (userinfo endpoint for OpenID)
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    const memberUrn = profile.sub ? `urn:li:person:${profile.sub}` : null;

    // 3. Try to get organization admin pages
    let orgUrn: string | null = null;
    let orgName: string | null = null;

    try {
      const orgRes = await fetch(
        "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(localizedName)))",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        const elements = orgData.elements || [];
        if (elements.length > 0) {
          const firstOrg = elements[0];
          // Extract organization URN from the element
          const orgEntity = firstOrg.organization;
          if (orgEntity) {
            orgUrn = orgEntity;
            orgName = firstOrg["organization~"]?.localizedName || null;
          }
        }
      }
    } catch {
      // Org access not available, proceed with member only
    }

    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 4. Upsert social_accounts
    const { data: existing } = await adminClient
      .from("social_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "linkedin")
      .maybeSingle();

    const payload = {
      user_id: userId,
      provider: "linkedin" as const,
      linkedin_member_urn: memberUrn,
      linkedin_org_urn: orgUrn,
      linkedin_org_name: orgName,
      linkedin_access_token_encrypted: accessToken,
      token_expires_at: tokenExpiry,
    };

    if (existing) {
      await adminClient
        .from("social_accounts")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await adminClient.from("social_accounts").insert(payload);
    }

    // 5. Log
    await adminClient.from("social_post_events").insert({
      user_id: userId,
      post_id: null,
      event_type: "published",
      payload: {
        provider: "linkedin",
        member_urn: memberUrn,
        org_urn: orgUrn,
      },
    });

    return Response.redirect(
      `${APP_BASE_URL}/portal/social-scheduler?linkedin=connected`,
      302
    );
  } catch (err) {
    return Response.redirect(
      `${APP_BASE_URL}/portal/social-scheduler?error=${encodeURIComponent((err as Error).message)}`,
      302
    );
  }
});
