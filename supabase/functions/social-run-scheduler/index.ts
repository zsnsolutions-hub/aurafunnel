// File: supabase/functions/social-run-scheduler/index.ts
// Invoked every minute by pg_cron. Finds due scheduled posts, locks them,
// publishes to each target channel, and updates statuses.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Publishing helpers (same as social-post-now) ─────────────────────────────

async function getSignedMediaUrl(adminClient: any, mediaPath: string): Promise<string | null> {
  const { data, error } = await adminClient.storage
    .from("social_media")
    .createSignedUrl(mediaPath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function publishToFacebookPage(
  pageId: string, pageToken: string, text: string,
  mediaUrl: string | null, linkUrl: string | null
): Promise<{ id?: string; error?: string }> {
  try {
    if (mediaUrl) {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: mediaUrl, message: text, access_token: pageToken }),
      });
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      return { id: data.id || data.post_id };
    } else {
      const body: Record<string, string> = { message: text, access_token: pageToken };
      if (linkUrl) body.link = linkUrl;
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      return { id: data.id };
    }
  } catch (err) { return { error: (err as Error).message }; }
}

async function publishToInstagram(
  igUserId: string, pageToken: string, text: string, mediaUrl: string | null
): Promise<{ id?: string; error?: string }> {
  try {
    if (!mediaUrl) return { error: "Instagram requires an image" };
    const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: mediaUrl, caption: text, access_token: pageToken }),
    });
    const containerData = await containerRes.json();
    if (containerData.error) return { error: containerData.error.message };
    const containerId = containerData.id;

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${pageToken}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") return { error: "IG media processing failed" };
      if (i === 9) return { error: "IG media processing timed out" };
    }

    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: pageToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.error) return { error: publishData.error.message };
    return { id: publishData.id };
  } catch (err) { return { error: (err as Error).message }; }
}

async function publishToLinkedIn(
  authorUrn: string, accessToken: string, text: string,
  mediaUrl: string | null, linkUrl: string | null
): Promise<{ id?: string; error?: string }> {
  try {
    const postBody: any = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: mediaUrl ? "IMAGE" : linkUrl ? "ARTICLE" : "NONE",
        },
      },
    };

    if (mediaUrl) {
      const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: authorUrn,
            serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
          },
        }),
      });
      const registerData = await registerRes.json();
      const uploadUrl = registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      const asset = registerData.value?.asset;
      if (uploadUrl && asset) {
        const imgRes = await fetch(mediaUrl);
        const imgBlob = await imgRes.blob();
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/octet-stream" },
          body: imgBlob,
        });
        postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{ status: "READY", media: asset }];
      }
    } else if (linkUrl) {
      postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{ status: "READY", originalUrl: linkUrl }];
    }

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || `LinkedIn error: ${res.status}` };
    }
    const postId = res.headers.get("x-restli-id") || res.headers.get("X-RestLi-Id");
    return { id: postId || "published" };
  } catch (err) { return { error: (err as Error).message }; }
}

// ── Main scheduler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find due posts: scheduled_at <= now() AND status = 'scheduled'
    // Using RPC to leverage FOR UPDATE SKIP LOCKED for concurrency safety
    const { data: duePosts, error: fetchErr } = await adminClient
      .rpc("claim_due_social_posts", {});

    // Fallback if RPC doesn't exist: use simple query
    let posts = duePosts;
    if (fetchErr || !posts) {
      const { data } = await adminClient
        .from("social_posts")
        .select("*")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(20);
      posts = data || [];

      // Mark as processing
      for (const p of posts) {
        await adminClient
          .from("social_posts")
          .update({ status: "processing" })
          .eq("id", p.id)
          .eq("status", "scheduled");
      }
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalProcessed = 0;

    for (const post of posts) {
      // Fetch targets
      const { data: targets } = await adminClient
        .from("social_post_targets")
        .select("*")
        .eq("post_id", post.id)
        .in("status", ["scheduled", "pending"]);

      if (!targets || targets.length === 0) {
        await adminClient.from("social_posts").update({ status: "completed" }).eq("id", post.id);
        continue;
      }

      // Get accounts
      const { data: accounts } = await adminClient
        .from("social_accounts")
        .select("*")
        .eq("user_id", post.user_id);

      // Resolve media
      let mediaUrl: string | null = null;
      if (post.media_paths && post.media_paths.length > 0) {
        mediaUrl = await getSignedMediaUrl(adminClient, post.media_paths[0]);
      }

      // Check for tracking link
      let publishText = post.content_text;
      if (post.link_url) {
        const { data: trackLink } = await adminClient
          .from("tracking_links")
          .select("slug")
          .eq("post_id", post.id)
          .limit(1)
          .maybeSingle();
        if (trackLink) {
          const trackUrl = `${APP_BASE_URL}/t/${trackLink.slug}`;
          publishText = post.content_text.replace(post.link_url, trackUrl);
        }
      }

      let allFailed = true;

      for (const target of targets) {
        await adminClient
          .from("social_post_targets")
          .update({ status: "processing" })
          .eq("id", target.id);

        let result: { id?: string; error?: string } = { error: "Unknown channel" };

        if (target.channel === "facebook_page") {
          const acc = (accounts || []).find(
            (a: any) => a.provider === "meta" && a.meta_page_id === target.target_id
          );
          if (acc) {
            result = await publishToFacebookPage(
              acc.meta_page_id, acc.meta_page_access_token_encrypted, publishText, mediaUrl, post.link_url
            );
          } else {
            result = { error: "Facebook Page account not found" };
          }
        } else if (target.channel === "instagram") {
          const acc = (accounts || []).find(
            (a: any) => a.provider === "meta" && a.meta_ig_user_id === target.target_id
          );
          if (acc) {
            result = await publishToInstagram(
              acc.meta_ig_user_id!, acc.meta_page_access_token_encrypted!, publishText, mediaUrl
            );
          } else {
            result = { error: "Instagram account not found" };
          }
        } else if (target.channel === "linkedin_member") {
          const acc = (accounts || []).find(
            (a: any) => a.provider === "linkedin" && a.linkedin_member_urn === target.target_id
          );
          if (acc) {
            result = await publishToLinkedIn(
              acc.linkedin_member_urn!, acc.linkedin_access_token_encrypted!, publishText, mediaUrl, post.link_url
            );
          } else {
            result = { error: "LinkedIn member account not found" };
          }
        } else if (target.channel === "linkedin_org") {
          const acc = (accounts || []).find(
            (a: any) => a.provider === "linkedin" && a.linkedin_org_urn === target.target_id
          );
          if (acc) {
            result = await publishToLinkedIn(
              acc.linkedin_org_urn!, acc.linkedin_access_token_encrypted!, publishText, mediaUrl, post.link_url
            );
          } else {
            result = { error: "LinkedIn org account not found" };
          }
        }

        const newStatus = result.error ? "failed" : "published";
        if (!result.error) allFailed = false;

        await adminClient.from("social_post_targets").update({
          status: newStatus,
          remote_post_id: result.id || null,
          error_message: result.error || null,
          published_at: result.error ? null : new Date().toISOString(),
        }).eq("id", target.id);

        await adminClient.from("social_post_events").insert({
          user_id: post.user_id,
          post_id: post.id,
          target_id: target.id,
          event_type: result.error ? "failed" : "published",
          payload: result,
        });
      }

      await adminClient.from("social_posts").update({
        status: allFailed ? "failed" : "completed",
      }).eq("id", post.id);

      totalProcessed++;
    }

    return new Response(
      JSON.stringify({ processed: totalProcessed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
