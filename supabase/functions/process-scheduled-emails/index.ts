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
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending emails that are due
    const { data: pendingEmails, error: fetchError } = await supabaseAdmin
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch scheduled emails: ${fetchError.message}`);
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending emails" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const ids = pendingEmails.map((e) => e.id);

    // Mark them as processing
    await supabaseAdmin
      .from("scheduled_emails")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .in("id", ids);

    let sent = 0;
    let failed = 0;

    for (const email of pendingEmails) {
      try {
        // Call the send-email edge function with service role key
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            owner_id: email.owner_id,
            lead_id: email.lead_id,
            to_email: email.to_email,
            subject: email.subject,
            html_body: email.html_body,
            track_opens: true,
            track_clicks: true,
          }),
        });

        const result = await res.json();

        if (result.success) {
          await supabaseAdmin
            .from("scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", email.id);
          sent++;
        } else {
          await supabaseAdmin
            .from("scheduled_emails")
            .update({
              status: "failed",
              error_message: result.error || "Unknown error",
              updated_at: new Date().toISOString(),
            })
            .eq("id", email.id);
          failed++;
        }
      } catch (err) {
        await supabaseAdmin
          .from("scheduled_emails")
          .update({
            status: "failed",
            error_message: `Processing error: ${(err as Error).message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", email.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        processed: pendingEmails.length,
        sent,
        failed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("process-scheduled-emails error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
