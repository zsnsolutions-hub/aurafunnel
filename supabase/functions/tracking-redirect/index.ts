// File: supabase/functions/tracking-redirect/index.ts
// Public endpoint: handles /t/:slug → log click → 302 redirect
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

function hashIP(ip: string): string {
  // Simple hash for privacy - not cryptographic but sufficient for analytics
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Extract slug from path: /tracking-redirect?slug=xxx or /tracking-redirect/xxx
    let slug = url.searchParams.get("slug");
    if (!slug) {
      // Try path extraction
      const pathParts = url.pathname.split("/").filter(Boolean);
      slug = pathParts[pathParts.length - 1];
      if (slug === "tracking-redirect") slug = null;
    }

    if (!slug) {
      return Response.redirect(APP_BASE_URL || "/", 302);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up tracking link
    const { data: link } = await adminClient
      .from("tracking_links")
      .select("id, user_id, destination_url")
      .eq("slug", slug)
      .maybeSingle();

    if (!link) {
      return Response.redirect(APP_BASE_URL || "/", 302);
    }

    // Log click event asynchronously (don't block redirect)
    const referrer = req.headers.get("referer") || req.headers.get("referrer") || null;
    const userAgent = req.headers.get("user-agent") || null;
    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
    const ipHash = hashIP(forwardedFor.split(",")[0].trim());

    // Fire and forget - don't await
    adminClient.from("tracking_events").insert({
      link_id: link.id,
      user_id: link.user_id,
      referrer,
      user_agent: userAgent,
      ip_hash: ipHash,
    }).then(() => {}).catch(() => {});

    return Response.redirect(link.destination_url, 302);
  } catch {
    return Response.redirect(APP_BASE_URL || "/", 302);
  }
});
