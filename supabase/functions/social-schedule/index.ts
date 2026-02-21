// File: supabase/functions/social-schedule/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

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

    const {
      content_text,
      link_url,
      media_paths,
      targets,
      scheduled_at,
      timezone,
      track_clicks,
    } = await req.json();

    if (!content_text || !targets || targets.length === 0 || !scheduled_at) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: content_text, targets, scheduled_at" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the post with scheduled status
    const { data: post, error: postErr } = await supabase
      .from("social_posts")
      .insert({
        user_id: user.id,
        content_text,
        link_url: link_url || null,
        media_paths: media_paths || null,
        scheduled_at,
        timezone: timezone || "Asia/Karachi",
        status: "scheduled",
      })
      .select()
      .single();

    if (postErr || !post) {
      return new Response(
        JSON.stringify({ error: postErr?.message || "Failed to create scheduled post" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create tracking link if requested
    if (track_clicks && link_url) {
      const slug = crypto.randomUUID().substring(0, 8);
      await supabase.from("tracking_links").insert({
        user_id: user.id,
        post_id: post.id,
        slug,
        destination_url: link_url,
      });
    }

    // Create target rows
    const targetRows = targets.map((t: any) => ({
      post_id: post.id,
      user_id: user.id,
      channel: t.channel,
      target_id: t.target_id,
      target_label: t.target_label || null,
      status: "scheduled",
    }));

    const { data: insertedTargets, error: targetsErr } = await supabase
      .from("social_post_targets")
      .insert(targetRows)
      .select();

    if (targetsErr) {
      return new Response(
        JSON.stringify({ error: targetsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log scheduling event
    await supabase.from("social_post_events").insert({
      user_id: user.id,
      post_id: post.id,
      event_type: "scheduled",
      payload: {
        scheduled_at,
        timezone,
        target_count: targets.length,
      },
    });

    return new Response(
      JSON.stringify({
        post_id: post.id,
        status: "scheduled",
        scheduled_at,
        targets: insertedTargets,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
