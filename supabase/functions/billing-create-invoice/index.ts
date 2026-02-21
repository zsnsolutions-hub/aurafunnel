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

// Helper: call Stripe API with form-encoded body
async function stripePost(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error ${res.status}`);
  }
  return data;
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

    const { lead_id, line_items, due_date, notes } = await req.json();

    if (!lead_id || !line_items?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id, line_items" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch lead and verify ownership
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, name, email, client_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lead.client_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: lead does not belong to you" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lead.email) {
      return new Response(
        JSON.stringify({ error: "Lead does not have an email address" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get or create Stripe customer
    // Check if we've created a Stripe customer for this lead before
    const { data: existingInvoice } = await supabaseAdmin
      .from("invoices")
      .select("stripe_customer_id")
      .eq("lead_id", lead_id)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .single();

    let stripeCustomerId: string;

    if (existingInvoice?.stripe_customer_id) {
      stripeCustomerId = existingInvoice.stripe_customer_id;
    } else {
      const customer = await stripePost("/v1/customers", {
        name: lead.name || "",
        email: lead.email,
        "metadata[lead_id]": lead_id,
        "metadata[owner_id]": userId,
      }, stripeApiKey);
      stripeCustomerId = customer.id;
    }

    // 3. Create the Stripe invoice (draft) first
    const currency = "usd";
    let subtotalCents = 0;

    const daysUntilDue = due_date
      ? Math.max(1, Math.ceil((new Date(due_date).getTime() - Date.now()) / 86400000))
      : 30;

    const invoiceParams: Record<string, string> = {
      customer: stripeCustomerId,
      collection_method: "send_invoice",
      days_until_due: String(daysUntilDue),
      pending_invoice_items_behavior: "exclude",
      "metadata[lead_id]": lead_id,
      "metadata[owner_id]": userId,
    };
    if (notes) invoiceParams.description = notes;

    const stripeInvoice = await stripePost("/v1/invoices", invoiceParams, stripeApiKey);

    // 4. Add line items to the invoice
    for (const item of line_items) {
      const amountCents = (item.quantity || 1) * item.unit_price_cents;
      subtotalCents += amountCents;

      await stripePost("/v1/invoiceitems", {
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        description: `${item.description}${(item.quantity || 1) > 1 ? ` (x${item.quantity})` : ""}`,
        amount: String(amountCents),
        currency,
      }, stripeApiKey);
    }

    // 5. Finalize the invoice
    const finalizedInvoice = await stripePost(`/v1/invoices/${stripeInvoice.id}/finalize`, {}, stripeApiKey);

    // 6. Send the invoice
    await stripePost(`/v1/invoices/${stripeInvoice.id}/send`, {}, stripeApiKey);

    // 7. Insert into local DB
    const { data: localInvoice, error: insertError } = await supabaseAdmin
      .from("invoices")
      .insert({
        owner_id: userId,
        lead_id,
        stripe_customer_id: stripeCustomerId,
        stripe_invoice_id: stripeInvoice.id,
        invoice_number: finalizedInvoice.number || null,
        status: "open",
        currency,
        subtotal_cents: subtotalCents,
        total_cents: finalizedInvoice.total ?? subtotalCents,
        due_date: due_date || null,
        notes: notes || null,
        stripe_hosted_url: finalizedInvoice.hosted_invoice_url || null,
        stripe_pdf_url: finalizedInvoice.invoice_pdf || null,
      })
      .select()
      .single();

    if (insertError || !localInvoice) {
      return new Response(
        JSON.stringify({ error: `Invoice sent but DB insert failed: ${insertError?.message}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Insert line items
    const lineItemRows = line_items.map((item: any) => ({
      invoice_id: localInvoice.id,
      description: item.description,
      quantity: item.quantity || 1,
      unit_price_cents: item.unit_price_cents,
      amount_cents: (item.quantity || 1) * item.unit_price_cents,
    }));

    await supabaseAdmin.from("invoice_line_items").insert(lineItemRows);

    return new Response(
      JSON.stringify({
        success: true,
        invoice_id: localInvoice.id,
        hosted_url: finalizedInvoice.hosted_invoice_url || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("billing-create-invoice error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${(err as Error).message}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
