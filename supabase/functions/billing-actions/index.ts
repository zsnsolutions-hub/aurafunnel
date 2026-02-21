import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper: look up per-user Stripe key from integrations table, fall back to global env var
async function getStripeKeyForUser(supabaseAdmin: any, userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("credentials")
    .eq("provider", "stripe")
    .eq("owner_id", userId)
    .eq("status", "connected")
    .limit(1)
    .single();

  if (data?.credentials?.secret_key) {
    return data.credentials.secret_key;
  }

  if (STRIPE_SECRET_KEY) {
    return STRIPE_SECRET_KEY;
  }

  throw new Error("No Stripe key configured. Connect Stripe in Integration Hub or set STRIPE_SECRET_KEY.");
}

async function stripeRequest(method: string, path: string, apiKey: string, params: Record<string, string> = {}): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (method === "POST") {
    options.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(`https://api.stripe.com${path}`, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error ${res.status}`);
  }
  return data;
}

async function stripePost(path: string, params: Record<string, string> = {}, apiKey: string = ""): Promise<any> {
  return stripeRequest("POST", path, apiKey, params);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Look up per-user Stripe key, fall back to global
    let stripeApiKey: string;
    try {
      stripeApiKey = await getStripeKeyForUser(supabaseAdmin, userId);
    } catch (keyErr) {
      return new Response(
        JSON.stringify({ error: (keyErr as Error).message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, invoice_id } = await req.json();

    if (!action || !invoice_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action, invoice_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["resend", "void", "send_email"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'resend', 'void', or 'send_email'." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice and verify ownership
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from("invoices")
      .select("id, stripe_invoice_id, stripe_hosted_url, invoice_number, total_cents, currency, due_date, owner_id, status, lead_id")
      .eq("id", invoice_id)
      .single();

    if (fetchError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.owner_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invoice does not belong to you" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!invoice.stripe_invoice_id) {
      return new Response(
        JSON.stringify({ error: "Invoice has no Stripe ID" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_email") {
      // Fetch lead info
      const { data: lead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("name, email")
        .eq("id", invoice.lead_id)
        .single();

      if (leadErr || !lead) {
        return new Response(
          JSON.stringify({ error: "Lead not found for this invoice" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If stripe_hosted_url is missing, fetch from Stripe
      let hostedUrl = invoice.stripe_hosted_url;
      if (!hostedUrl && invoice.stripe_invoice_id) {
        const stripeInv = await stripeRequest("GET", `/v1/invoices/${invoice.stripe_invoice_id}`, stripeApiKey);
        hostedUrl = stripeInv.hosted_invoice_url || null;
        if (hostedUrl) {
          await supabaseAdmin
            .from("invoices")
            .update({ stripe_hosted_url: hostedUrl, updated_at: new Date().toISOString() })
            .eq("id", invoice_id);
        }
      }

      // Update sent tracking
      await supabaseAdmin
        .from("invoices")
        .update({ sent_at: new Date().toISOString(), sent_via: "crm", updated_at: new Date().toISOString() })
        .eq("id", invoice_id);

      return new Response(
        JSON.stringify({
          success: true,
          invoice_number: invoice.invoice_number,
          total_cents: invoice.total_cents,
          currency: invoice.currency,
          due_date: invoice.due_date,
          lead_email: lead.email,
          lead_name: lead.name,
          hosted_url: hostedUrl,
          lead_id: invoice.lead_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "resend") {
      await stripePost(`/v1/invoices/${invoice.stripe_invoice_id}/send`, {}, stripeApiKey);

      await supabaseAdmin
        .from("invoices")
        .update({ sent_at: new Date().toISOString(), sent_via: "stripe", updated_at: new Date().toISOString() })
        .eq("id", invoice_id);
    } else if (action === "void") {
      await stripePost(`/v1/invoices/${invoice.stripe_invoice_id}/void`, {}, stripeApiKey);

      await supabaseAdmin
        .from("invoices")
        .update({ status: "void", updated_at: new Date().toISOString() })
        .eq("id", invoice_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("billing-actions error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
