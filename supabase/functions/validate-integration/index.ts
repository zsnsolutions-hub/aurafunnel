import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { decryptCredentials } from "../_shared/tokenCrypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Auth: extract user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { provider, credentials: bodyCreds } = await req.json();

    if (!provider) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // On initial connect the client passes the credentials it just entered. On
    // re-validation the client no longer has them (secrets aren't sent to the
    // browser), so load them server-side (service role) for this user+provider.
    let credentials = bodyCreds;
    if (!credentials || Object.keys(credentials).length === 0) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: row } = await admin
        .from("integrations")
        .select("credentials")
        .eq("owner_id", user.id)
        .eq("provider", provider)
        .maybeSingle();
      // Stored credentials are encrypted at rest (migration 20260819100000);
      // decrypt before handing them to the provider validators.
      credentials = row?.credentials
        ? await decryptCredentials(admin, row.credentials)
        : null;
    }

    if (!credentials || Object.keys(credentials).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No stored credentials for this provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: { success: boolean; error?: string; details?: string };

    switch (provider) {
      case "slack":
        result = await validateSlack(credentials);
        break;
      case "hubspot":
        result = await validateHubSpot(credentials);
        break;
      case "salesforce":
        result = await validateSalesforce(credentials);
        break;
      case "ga":
        result = await validateGoogleAnalytics(credentials);
        break;
      case "stripe":
        result = await validateStripe(credentials);
        break;
      default:
        result = { success: false, error: `Unknown provider: ${provider}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Slack: POST a test message to the webhook URL ──
async function validateSlack(
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: string }> {
  const { webhookUrl } = credentials;
  if (!webhookUrl) {
    return { success: false, error: "Missing webhookUrl" };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "AuraFunnel integration test — connection verified.",
      }),
    });

    if (res.ok) {
      return { success: true, details: "Slack webhook responded successfully" };
    }
    const body = await res.text();
    return { success: false, error: `Slack returned ${res.status}: ${body}` };
  } catch (err) {
    return { success: false, error: `Slack connection failed: ${(err as Error).message}` };
  }
}

// ── HubSpot: GET contacts with Bearer token ──
async function validateHubSpot(
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: string }> {
  const { apiKey } = credentials;
  if (!apiKey) {
    return { success: false, error: "Missing apiKey" };
  }

  try {
    const res = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts?limit=1",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (res.ok) {
      return { success: true, details: "HubSpot API key is valid" };
    }
    const body = await res.json().catch(() => ({}));
    return {
      success: false,
      error: `HubSpot returned ${res.status}: ${(body as any).message || "Invalid API key"}`,
    };
  } catch (err) {
    return { success: false, error: `HubSpot connection failed: ${(err as Error).message}` };
  }
}

// ── Salesforce: GET API versions list ──
async function validateSalesforce(
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: string }> {
  const { instanceUrl, accessToken } = credentials;
  if (!instanceUrl || !accessToken) {
    return { success: false, error: "Missing instanceUrl or accessToken" };
  }

  try {
    const url = instanceUrl.replace(/\/$/, "");
    const res = await fetch(`${url}/services/data/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      return { success: true, details: "Salesforce credentials are valid" };
    }
    const body = await res.text();
    return {
      success: false,
      error: `Salesforce returned ${res.status}: ${body.slice(0, 200)}`,
    };
  } catch (err) {
    return { success: false, error: `Salesforce connection failed: ${(err as Error).message}` };
  }
}

// ── Stripe: GET /v1/balance to validate secret key ──
async function validateStripe(
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: string }> {
  const { secret_key } = credentials;
  if (!secret_key) {
    return { success: false, error: "Missing secret_key" };
  }

  if (!secret_key.startsWith("sk_test_") && !secret_key.startsWith("sk_live_")) {
    return { success: false, error: "Invalid key format. Must start with sk_test_ or sk_live_." };
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${secret_key}` },
    });

    if (res.ok) {
      const data = await res.json();
      const mode = secret_key.startsWith("sk_live_") ? "live" : "test";
      const available = data.available?.[0];
      const detail = available
        ? `Stripe account connected (${mode} mode, ${available.currency.toUpperCase()} balance available)`
        : `Stripe account connected (${mode} mode)`;
      return { success: true, details: detail };
    }

    const body = await res.json().catch(() => ({}));
    return {
      success: false,
      error: `Stripe returned ${res.status}: ${(body as any).error?.message || "Invalid API key"}`,
    };
  } catch (err) {
    return { success: false, error: `Stripe connection failed: ${(err as Error).message}` };
  }
}

// ── Google Analytics: POST to GA4 Measurement Protocol debug endpoint ──
async function validateGoogleAnalytics(
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: string }> {
  const { measurementId, apiSecret } = credentials;
  if (!measurementId || !apiSecret) {
    return { success: false, error: "Missing measurementId or apiSecret" };
  }

  try {
    const res = await fetch(
      `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "aurafunnel_test",
          events: [{ name: "test_event", params: {} }],
        }),
      }
    );

    if (!res.ok) {
      return { success: false, error: `GA4 returned ${res.status}` };
    }

    const body = await res.json();
    const messages = body.validationMessages || [];
    if (messages.length === 0) {
      return { success: true, details: "GA4 credentials are valid" };
    }
    return {
      success: false,
      error: `GA4 validation errors: ${messages.map((m: any) => m.description).join("; ")}`,
    };
  } catch (err) {
    return { success: false, error: `GA4 connection failed: ${(err as Error).message}` };
  }
}
