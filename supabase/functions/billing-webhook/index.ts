import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, stripe-signature",
};

// Verify Stripe webhook signature using HMAC-SHA256
async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!secret || !sigHeader) return true; // skip if not configured

  try {
    // Parse "t=...,v1=..." header
    const parts: Record<string, string> = {};
    for (const item of sigHeader.split(",")) {
      const [key, val] = item.split("=", 2);
      if (key && val) parts[key.trim()] = val.trim();
    }

    const timestamp = parts["t"];
    const expectedSig = parts["v1"];
    if (!timestamp || !expectedSig) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload)
    );

    // Convert to hex
    const computed = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === expectedSig;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.text();

    // Verify Stripe signature
    const sigHeader = req.headers.get("stripe-signature");
    if (STRIPE_WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(body, sigHeader, STRIPE_WEBHOOK_SECRET);
      if (!valid) {
        console.error("Invalid Stripe webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(body);
    const type = event.type as string;
    const invoice = event.data?.object;

    if (!invoice?.id) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const stripeInvoiceId = invoice.id as string;

    // Map Stripe event types to our status values
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (type === "invoice.paid") {
      updates.status = "paid";
      updates.paid_at = new Date().toISOString();
    } else if (type === "invoice.voided") {
      updates.status = "void";
    } else if (type === "invoice.marked_uncollectible") {
      updates.status = "uncollectible";
    } else if (type === "invoice.finalized") {
      updates.status = "open";
      if (invoice.hosted_invoice_url) updates.stripe_hosted_url = invoice.hosted_invoice_url;
      if (invoice.invoice_pdf) updates.stripe_pdf_url = invoice.invoice_pdf;
    } else {
      // Unhandled event type — acknowledge but do nothing
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update local invoice record
    const { error: updateError } = await supabaseAdmin
      .from("invoices")
      .update(updates)
      .eq("stripe_invoice_id", stripeInvoiceId);

    if (updateError) {
      console.error("Webhook DB update error:", updateError.message);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("billing-webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
