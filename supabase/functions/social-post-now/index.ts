// File: supabase/functions/social-post-now/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Publishing helpers ──────────────────────────────────────────────────────

async function getSignedMediaUrl(adminClient: any, mediaPath: string): Promise<string | null> {
  const { data, error } = await adminClient.storage
    .from("social_media")
    .createSignedUrl(mediaPath, 3600); // 1 hour TTL
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function publishToFacebookPage(
  pageId: string,
  pageToken: string,
  text: string,
  mediaUrl: string | null,
  linkUrl: string | null
): Promise<{ id?: string; error?: string }> {
  try {
    if (mediaUrl) {
      // Photo post
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: mediaUrl,
          message: text,
          access_token: pageToken,
        }),
      });
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      return { id: data.id || data.post_id };
    } else {
      // Text/link post
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
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function publishToInstagram(
  igUserId: string,
  pageToken: string,
  text: string,
  mediaUrl: string | null
): Promise<{ id?: string; error?: string }> {
  try {
    if (!mediaUrl) {
      return { error: "Instagram requires an image for publishing" };
    }
    // Step 1: Create media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: mediaUrl,
          caption: text,
          access_token: pageToken,
        }),
      }
    );
    const containerData = await containerRes.json();
    if (containerData.error) return { error: containerData.error.message };
    const containerId = containerData.id;

    // Step 2: Wait for container to be ready (poll)
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${pageToken}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") {
        ready = true;
        break;
      }
      if (statusData.status_code === "ERROR") {
        return { error: "Instagram media processing failed" };
      }
    }
    if (!ready) return { error: "Instagram media processing timed out" };

    // Step 3: Publish
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: pageToken,
        }),
      }
    );
    const publishData = await publishRes.json();
    if (publishData.error) return { error: publishData.error.message };
    return { id: publishData.id };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function publishToLinkedIn(
  authorUrn: string,
  accessToken: string,
  text: string,
  mediaUrl: string | null,
  linkUrl: string | null
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
      // Register upload to get uploadUrl and asset
      const registerRes = await fetch(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: authorUrn,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          }),
        }
      );
      const registerData = await registerRes.json();
      const uploadUrl =
        registerData.value?.uploadMechanism?.[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ]?.uploadUrl;
      const asset = registerData.value?.asset;

      if (uploadUrl && asset) {
        // Download image and upload to LinkedIn
        const imgRes = await fetch(mediaUrl);
        const imgBlob = await imgRes.blob();
        await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/octet-stream",
          },
          body: imgBlob,
        });

        postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
          {
            status: "READY",
            media: asset,
          },
        ];
      }
    } else if (linkUrl) {
      postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
        {
          status: "READY",
          originalUrl: linkUrl,
        },
      ];
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
      return { error: errData.message || `LinkedIn API error: ${res.status}` };
    }

    const postId = res.headers.get("x-restli-id") || res.headers.get("X-RestLi-Id");
    return { id: postId || "published" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

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
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      content_text,
      link_url,
      media_paths,
      targets,
      track_clicks,
    } = await req.json();

    if (!content_text || !targets || targets.length === 0) {
      return new Response(JSON.stringify({ error: "Missing content or targets" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create post record
    const { data: post, error: postErr } = await supabase
      .from("social_posts")
      .insert({
        user_id: user.id,
        content_text,
        link_url: link_url || null,
        media_paths: media_paths || null,
        status: "processing",
      })
      .select()
      .single();

    if (postErr || !post) {
      return new Response(JSON.stringify({ error: postErr?.message || "Failed to create post" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create tracking link if requested
    let publishText = content_text;
    if (track_clicks && link_url) {
      const slug = crypto.randomUUID().substring(0, 8);
      await supabase.from("tracking_links").insert({
        user_id: user.id,
        post_id: post.id,
        slug,
        destination_url: link_url,
      });
      const trackUrl = `${Deno.env.get("APP_BASE_URL") || ""}/t/${slug}`;
      publishText = content_text.replace(link_url, trackUrl);
    }

    // Resolve first media URL if any
    let mediaUrl: string | null = null;
    if (media_paths && media_paths.length > 0) {
      mediaUrl = await getSignedMediaUrl(adminClient, media_paths[0]);
    }

    // Create target rows
    const targetRows = targets.map((t: any) => ({
      post_id: post.id,
      user_id: user.id,
      channel: t.channel,
      target_id: t.target_id,
      target_label: t.target_label || null,
      status: "processing",
    }));

    const { data: insertedTargets } = await supabase
      .from("social_post_targets")
      .insert(targetRows)
      .select();

    // Fetch all social accounts for this user
    const { data: accounts } = await adminClient
      .from("social_accounts")
      .select("*")
      .eq("user_id", user.id);

    const results: any[] = [];

    // Publish to each target
    for (const target of insertedTargets || []) {
      let result: { id?: string; error?: string } = { error: "Unknown channel" };

      if (target.channel === "facebook_page") {
        const acc = (accounts || []).find(
          (a: any) => a.provider === "meta" && a.meta_page_id === target.target_id
        );
        if (acc) {
          result = await publishToFacebookPage(
            acc.meta_page_id,
            acc.meta_page_access_token_encrypted,
            publishText,
            mediaUrl,
            link_url
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
            acc.meta_ig_user_id!,
            acc.meta_page_access_token_encrypted!,
            publishText,
            mediaUrl
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
            acc.linkedin_member_urn!,
            acc.linkedin_access_token_encrypted!,
            publishText,
            mediaUrl,
            link_url
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
            acc.linkedin_org_urn!,
            acc.linkedin_access_token_encrypted!,
            publishText,
            mediaUrl,
            link_url
          );
        } else {
          result = { error: "LinkedIn org account not found" };
        }
      }

      const newStatus = result.error ? "failed" : "published";

      await adminClient
        .from("social_post_targets")
        .update({
          status: newStatus,
          remote_post_id: result.id || null,
          error_message: result.error || null,
          published_at: result.error ? null : new Date().toISOString(),
        })
        .eq("id", target.id);

      await adminClient.from("social_post_events").insert({
        user_id: user.id,
        post_id: post.id,
        target_id: target.id,
        event_type: result.error ? "failed" : "published",
        payload: result,
      });

      results.push({ target_id: target.id, channel: target.channel, ...result, status: newStatus });
    }

    // Update post status
    const allFailed = results.every((r) => r.status === "failed");
    const anyPublished = results.some((r) => r.status === "published");
    const postStatus = allFailed ? "failed" : "completed";

    await supabase.from("social_posts").update({ status: postStatus }).eq("id", post.id);

    return new Response(
      JSON.stringify({ post_id: post.id, status: postStatus, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
