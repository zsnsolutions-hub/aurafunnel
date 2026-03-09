import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, stripe-signature",
};

// ── Verify Stripe webhook signature ──────────────────────────────────────────

async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !sigHeader) return true; // skip if not configured

  try {
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
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload),
    );

    const computed = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === expectedSig;
  } catch {
    return false;
  }
}

// ── Event handlers ───────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  supabaseAdmin: any,
  session: any,
): Promise<void> {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.warn("checkout.session.completed: no user_id in metadata");
    return;
  }

  if (session.mode === "subscription") {
    const planName = session.metadata?.plan_name || "Starter";
    const billingInterval = session.metadata?.billing_interval || "monthly";
    const stripeSubId = session.subscription;
    const stripeCustomerId = session.customer;

    // Update profile
    await supabaseAdmin
      .from("profiles")
      .update({
        plan: planName,
        stripe_customer_id: stripeCustomerId,
      })
      .eq("id", userId);

    // Upsert subscription
    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          workspace_id: userId,
          plan: planName.toLowerCase(),
          plan_name: planName,
          status: "active",
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubId,
          billing_interval: billingInterval,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    // Reset AI credits for the new billing period
    const month = new Date().toISOString().slice(0, 7);
    await supabaseAdmin
      .from("workspace_ai_usage")
      .upsert(
        {
          workspace_id: userId,
          month_year: month,
          credits_used: 0,
          tokens_used: 0,
        },
        { onConflict: "workspace_id,month_year" },
      );

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "SUBSCRIPTION_CREATED",
      details: `Subscribed to ${planName} (${billingInterval}) via Stripe Checkout`,
    });

    console.log(`Subscription created: user=${userId} plan=${planName}`);
  } else if (session.mode === "payment") {
    // Credit package purchase
    const type = session.metadata?.type;
    if (type === "credit_purchase") {
      const credits = parseInt(session.metadata?.package_credits || "0", 10);
      const priceCents = parseInt(session.metadata?.package_price_cents || "0", 10);

      if (credits > 0) {
        // Record the purchase
        await supabaseAdmin.from("credit_purchases").insert({
          workspace_id: userId,
          credits_purchased: credits,
          amount_paid_cents: priceCents,
          stripe_payment_id: session.payment_intent,
          status: "completed",
        });

        // Add credits to current month's limit
        const month = new Date().toISOString().slice(0, 7);
        const { data: usageRow } = await supabaseAdmin
          .from("workspace_ai_usage")
          .select("credits_limit")
          .eq("workspace_id", userId)
          .eq("month_year", month)
          .maybeSingle();

        const currentLimit = usageRow?.credits_limit ?? 0;
        await supabaseAdmin
          .from("workspace_ai_usage")
          .upsert(
            {
              workspace_id: userId,
              month_year: month,
              credits_limit: currentLimit + credits,
            },
            { onConflict: "workspace_id,month_year" },
          );

        // Audit log
        await supabaseAdmin.from("audit_logs").insert({
          user_id: userId,
          action: "CREDIT_PURCHASE",
          details: `Purchased ${credits} AI credits for $${(priceCents / 100).toFixed(2)}`,
        });

        console.log(`Credit purchase: user=${userId} credits=${credits}`);
      }
    }
  }
}

async function handleSubscriptionUpdated(
  supabaseAdmin: any,
  subscription: any,
): Promise<void> {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn("subscription.updated: no user_id in metadata");
    return;
  }

  const stripePriceId = subscription.items?.data?.[0]?.price?.id;
  const status = subscription.status; // active, past_due, canceled, etc.
  const cancelAtPeriodEnd = subscription.cancel_at_period_end ?? false;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const currentPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;

  // Look up plan by stripe_price_id
  let planName: string | null = null;
  if (stripePriceId) {
    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("name")
      .or(`stripe_price_id.eq.${stripePriceId},stripe_price_id_annual.eq.${stripePriceId}`)
      .limit(1)
      .maybeSingle();

    if (plan) planName = plan.name;
  }

  // Update subscription record
  const subUpdate: Record<string, any> = {
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    stripe_price_id: stripePriceId || undefined,
    updated_at: new Date().toISOString(),
  };
  if (currentPeriodEnd) subUpdate.current_period_end = currentPeriodEnd;
  if (currentPeriodStart) subUpdate.current_period_start = currentPeriodStart;
  if (planName) {
    subUpdate.plan = planName.toLowerCase();
    subUpdate.plan_name = planName;
  }

  await supabaseAdmin
    .from("subscriptions")
    .update(subUpdate)
    .eq("stripe_subscription_id", subscription.id);

  // Update profile plan if changed
  if (planName) {
    await supabaseAdmin
      .from("profiles")
      .update({ plan: planName })
      .eq("id", userId);
  }

  console.log(`Subscription updated: user=${userId} status=${status} plan=${planName}`);
}

async function handleSubscriptionDeleted(
  supabaseAdmin: any,
  subscription: any,
): Promise<void> {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn("subscription.deleted: no user_id in metadata");
    return;
  }

  // Downgrade to Free
  await supabaseAdmin
    .from("profiles")
    .update({ plan: "Free" })
    .eq("id", userId);

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "canceled",
      plan: "free",
      plan_name: "Free",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  // Audit log
  await supabaseAdmin.from("audit_logs").insert({
    user_id: userId,
    action: "SUBSCRIPTION_CANCELED",
    details: "Subscription canceled — downgraded to Free plan",
  });

  console.log(`Subscription deleted: user=${userId} downgraded to Free`);
}

// ── Invoice handlers (existing) ──────────────────────────────────────────────

async function handleInvoiceEvent(
  supabaseAdmin: any,
  type: string,
  invoice: any,
): Promise<void> {
  const stripeInvoiceId = invoice.id as string;
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
    return;
  }

  const { error } = await supabaseAdmin
    .from("invoices")
    .update(updates)
    .eq("stripe_invoice_id", stripeInvoiceId);

  if (error) console.error("Invoice update error:", error.message);
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
    const obj = event.data?.object;

    if (!obj?.id) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Route events
    switch (type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabaseAdmin, obj);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabaseAdmin, obj);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabaseAdmin, obj);
        break;

      case "invoice.paid":
      case "invoice.voided":
      case "invoice.marked_uncollectible":
      case "invoice.finalized":
        await handleInvoiceEvent(supabaseAdmin, type, obj);
        break;

      default:
        console.log(`Unhandled event: ${type}`);
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("billing-webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 200, // Always return 200 to Stripe to avoid retries on our errors
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
