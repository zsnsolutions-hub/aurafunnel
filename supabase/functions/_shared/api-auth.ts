// supabase/functions/_shared/api-auth.ts
//
// Phase 4.1 — Shared auth + rate-limit middleware for the public REST API.
//
// Public-API endpoints (function names prefixed `v1-...`) call
// authenticateApiKey() at the top of every request. It:
//   1. Reads the `Authorization: Bearer scal_...` header
//   2. Calls the verify_api_key() RPC (service-role, hashes server-side)
//   3. Enforces 60 req/min in-memory rate limit per api_key_id
//   4. Validates the requested scope against the key's granted scopes
//
// Returns the workspace_id + scopes on success, or a Response with the
// appropriate 401/403/429 to bail with.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Phase 4.2 — Postgres-backed cluster-wide rate limit via consume_api_rate_limit
// RPC. Fixed-window (1-min bucket), 60 req/min/key. Falls back to "allow"
// on RPC failure so transient Postgres issues don't take the API offline.
const RATE_LIMIT_PER_MIN = 60;

async function checkRateLimit(
  admin: ReturnType<typeof createClient>,
  keyId: string,
): Promise<{ allowed: boolean; resetAt: string | null }> {
  try {
    const { data, error } = await admin.rpc("consume_api_rate_limit", {
      p_key_id: keyId,
      p_max_per_min: RATE_LIMIT_PER_MIN,
    });
    if (error) {
      console.warn("[api-auth] rate-limit RPC error, allowing:", error.message);
      return { allowed: true, resetAt: null };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed !== false,
      resetAt: (row?.reset_at as string | undefined) ?? null,
    };
  } catch (e) {
    console.warn("[api-auth] rate-limit threw, allowing:", (e as Error).message);
    return { allowed: true, resetAt: null };
  }
}

export interface ApiAuth {
  apiKeyId: string;
  workspaceId: string;
  scopes: string[];
}

/**
 * Try to authenticate the request via API key. Returns either:
 *   - { ok: true, auth: ApiAuth }  on success
 *   - { ok: false, response: Response }  with the appropriate error to return
 *
 * Pass `requiredScope` (e.g. "leads.read") to enforce a scope check.
 * Pass `corsHeaders` so error responses include CORS headers.
 */
export async function authenticateApiKey(
  req: Request,
  opts: { requiredScope?: string; corsHeaders?: Record<string, string> } = {},
): Promise<
  | { ok: true; auth: ApiAuth }
  | { ok: false; response: Response }
> {
  const corsHeaders = opts.corsHeaders ?? {};
  const headersJson = { ...corsHeaders, "Content-Type": "application/json" };

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Missing Authorization: Bearer header", code: "missing_auth" }),
        { status: 401, headers: headersJson },
      ),
    };
  }

  const plaintext = authHeader.slice(7).trim();
  if (!plaintext.startsWith("scal_") || plaintext.length < 16) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Invalid API key format", code: "invalid_key" }),
        { status: 401, headers: headersJson },
      ),
    };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc("verify_api_key", { p_plaintext: plaintext });
  if (error) {
    console.error("[api-auth] verify_api_key error:", error.message);
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Auth verification failed", code: "verify_failed" }),
        { status: 500, headers: headersJson },
      ),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.api_key_id || !row?.workspace_id) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "API key invalid, expired, or revoked", code: "invalid_key" }),
        { status: 401, headers: headersJson },
      ),
    };
  }

  const rl = await checkRateLimit(admin, row.api_key_id);
  if (!rl.allowed) {
    const retryAfter = rl.resetAt
      ? Math.max(1, Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000))
      : 60;
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: `Rate limit exceeded (${RATE_LIMIT_PER_MIN} req/min per key)`,
          code: "rate_limited",
          reset_at: rl.resetAt,
        }),
        { status: 429, headers: { ...headersJson, "Retry-After": String(retryAfter) } },
      ),
    };
  }

  const scopes: string[] = Array.isArray(row.scopes) ? row.scopes : [];
  if (opts.requiredScope && !scopes.includes(opts.requiredScope)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: `Missing required scope: ${opts.requiredScope}`,
          code: "missing_scope",
          granted_scopes: scopes,
        }),
        { status: 403, headers: headersJson },
      ),
    };
  }

  return {
    ok: true,
    auth: {
      apiKeyId: row.api_key_id as string,
      workspaceId: row.workspace_id as string,
      scopes,
    },
  };
}

/** Service-role client for use after authenticateApiKey returns ok. */
export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}
