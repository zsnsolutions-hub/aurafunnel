import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://scaliyo.com";

// ── Stripe API helper ────────────────────────────────────────────────────────

async function stripePost(
  path: string,
  params: Record<string, string>,
): Promise<any> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
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

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error ${res.status}`);
  }
  return data;
}

// ── Get or create Stripe customer ────────────────────────────────────────────

async function getOrCreateCustomer(
  supabaseAdmin: any,
  userId: string,
  email: string,
  name?: string,
): Promise<string> {
  // Check if profile already has a Stripe customer ID
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Create a new Stripe customer
  const params: Record<string, string> = {
    email,
    "metadata[user_id]": userId,
    "metadata[source]": "scaliyo",
  };
  if (name) params.name = name;

  const customer = await stripePost("/v1/customers", params);

  // Save to profile
  await supabaseAdmin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function createCheckoutSession(
  supabaseAdmin: any,
  userId: string,
  email: string,
  name: string | undefined,
  body: any,
): Promise<{ url: string }> {
  const { plan_name, stripe_price_id, billing_interval = "monthly" } = body;

  if (!stripe_price_id) {
    throw new Error("stripe_price_id is required");
  }

  const customerId = await getOrCreateCustomer(supabaseAdmin, userId, email, name);

  const params: Record<string, string> = {
    "mode": "subscription",
    "customer": customerId,
    "line_items[0][price]": stripe_price_id,
    "line_items[0][quantity]": "1",
    "success_url": `${APP_URL}/portal/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${APP_URL}/portal/billing?checkout=cancelled`,
    "metadata[user_id]": userId,
    "metadata[plan_name]": plan_name || "",
    "metadata[billing_interval]": billing_interval,
    "subscription_data[metadata][user_id]": userId,
    "subscription_data[metadata][plan_name]": plan_name || "",
    "allow_promotion_codes": "true",
  };

  const session = await stripePost("/v1/checkout/sessions", params);
  return { url: session.url };
}

async function createCreditCheckout(
  supabaseAdmin: any,
  userId: string,
  email: string,
  name: string | undefined,
  body: any,
): Promise<{ url: string }> {
  const { credits, price_cents, label } = body;

  if (!credits || !price_cents) {
    throw new Error("credits and price_cents are required");
  }

  const customerId = await getOrCreateCustomer(supabaseAdmin, userId, email, name);

  const params: Record<string, string> = {
    "mode": "payment",
    "customer": customerId,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(price_cents),
    "line_items[0][price_data][product_data][name]": label || `${credits} AI Credits`,
    "line_items[0][quantity]": "1",
    "success_url": `${APP_URL}/portal/billing?checkout=credits&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${APP_URL}/portal/billing?checkout=cancelled`,
    "metadata[user_id]": userId,
    "metadata[type]": "credit_purchase",
    "metadata[package_credits]": String(credits),
    "metadata[package_price_cents]": String(price_cents),
  };

  const session = await stripePost("/v1/checkout/sessions", params);
  return { url: session.url };
}

async function createPortalSession(
  supabaseAdmin: any,
  userId: string,
): Promise<{ url: string }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!profile?.stripe_customer_id) {
    throw new Error("No Stripe customer found. Subscribe to a plan first.");
  }

  const session = await stripePost("/v1/billing_portal/sessions", {
    customer: profile.stripe_customer_id,
    return_url: `${APP_URL}/portal/billing`,
  });

  return { url: session.url };
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    // Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;

    let result: { url: string };

    switch (action) {
      case "create_checkout_session":
        result = await createCheckoutSession(
          supabaseAdmin, user.id, user.email!, user.user_metadata?.name, body,
        );
        break;

      case "create_credit_checkout":
        result = await createCreditCheckout(
          supabaseAdmin, user.id, user.email!, user.user_metadata?.name, body,
        );
        break;

      case "create_portal_session":
        result = await createPortalSession(supabaseAdmin, user.id);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("billing-checkout error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
