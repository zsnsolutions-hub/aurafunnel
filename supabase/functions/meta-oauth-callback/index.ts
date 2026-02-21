// File: supabase/functions/meta-oauth-callback/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
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
        `${APP_BASE_URL}/portal/social-scheduler?error=meta_denied`,
        302
      );
    }

    // Use service role to look up the state → user mapping
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: stateRow } = await adminClient
      .from("social_post_events")
      .select("user_id")
      .eq("event_type", "started")
      .filter("payload->>oauth_state", "eq", state)
      .filter("payload->>provider", "eq", "meta")
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
    const redirectUri = `${OAUTH_REDIRECT_BASE}/functions/v1/meta-oauth-callback`;

    // 1. Exchange code for short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${META_APP_SECRET}` +
      `&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return Response.redirect(
        `${APP_BASE_URL}/portal/social-scheduler?error=token_exchange_failed`,
        302
      );
    }

    const shortToken = tokenData.access_token;

    // 2. Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}` +
      `&fb_exchange_token=${shortToken}`
    );
    const longData = await longRes.json();
    const longToken = longData.access_token || shortToken;
    const expiresIn = longData.expires_in || 5184000; // ~60 days default

    // 3. Fetch managed pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${longToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];

    // 4. For each page, check for connected IG Business account
    const accounts: {
      meta_page_id: string;
      meta_page_name: string;
      meta_page_access_token_encrypted: string;
      meta_ig_user_id: string | null;
      meta_ig_username: string | null;
    }[] = [];

    for (const page of pages) {
      let igUserId: string | null = null;
      let igUsername: string | null = null;

      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`
        );
        const igData = await igRes.json();
        if (igData.instagram_business_account) {
          igUserId = igData.instagram_business_account.id;
          igUsername = igData.instagram_business_account.username || null;
        }
      } catch {
        // Page may not have an IG account linked
      }

      accounts.push({
        meta_page_id: page.id,
        meta_page_name: page.name,
        meta_page_access_token_encrypted: page.access_token,
        meta_ig_user_id: igUserId,
        meta_ig_username: igUsername,
      });
    }

    // 5. Upsert social_accounts rows
    for (const acc of accounts) {
      // Check if account already exists
      const { data: existing } = await adminClient
        .from("social_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "meta")
        .eq("meta_page_id", acc.meta_page_id)
        .maybeSingle();

      const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

      if (existing) {
        await adminClient
          .from("social_accounts")
          .update({
            meta_page_name: acc.meta_page_name,
            meta_page_access_token_encrypted: acc.meta_page_access_token_encrypted,
            meta_ig_user_id: acc.meta_ig_user_id,
            meta_ig_username: acc.meta_ig_username,
            token_expires_at: tokenExpiry,
          })
          .eq("id", existing.id);
      } else {
        await adminClient.from("social_accounts").insert({
          user_id: userId,
          provider: "meta",
          meta_page_id: acc.meta_page_id,
          meta_page_name: acc.meta_page_name,
          meta_page_access_token_encrypted: acc.meta_page_access_token_encrypted,
          meta_ig_user_id: acc.meta_ig_user_id,
          meta_ig_username: acc.meta_ig_username,
          token_expires_at: tokenExpiry,
        });
      }
    }

    // 6. Log event
    await adminClient.from("social_post_events").insert({
      user_id: userId,
      post_id: null,
      event_type: "published",
      payload: { provider: "meta", pages_connected: accounts.length },
    });

    return Response.redirect(
      `${APP_BASE_URL}/portal/social-scheduler?meta=connected&pages=${accounts.length}`,
      302
    );
  } catch (err) {
    return Response.redirect(
      `${APP_BASE_URL}/portal/social-scheduler?error=${encodeURIComponent((err as Error).message)}`,
      302
    );
  }
});
