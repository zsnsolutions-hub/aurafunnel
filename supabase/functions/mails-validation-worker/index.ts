// supabase/functions/mails-validation-worker/index.ts
//
// Server-side email validation via Mails.so (Phase B). Validates one or many
// emails for a business, caches results in email_validations (upsert per
// business+email), and returns normalized statuses the app gates on.
//
// The MAILS_SO_API_KEY never leaves the edge function. Results are cached for
// CACHE_TTL_DAYS; a manual re-validate can force a refresh.
//
// Protocol:
//   POST /functions/v1/mails-validation-worker
//   Authorization: Bearer <supabase_user_jwt>
//   Body: { business_id: string, email?: string, emails?: string[], force?: boolean }
//   -> 200 { results: [{ email, status, deliverability, reason, is_disposable,
//                        is_role, is_free, score, cached }] }
//
// Deploy: supabase functions deploy mails-validation-worker
// Requires secret: MAILS_SO_API_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

const MAILS_SO_API_KEY = Deno.env.get("MAILS_SO_API_KEY") ?? "";
const MAILS_SO_URL = "https://api.mails.so/v1/validate";
const CACHE_TTL_DAYS = 30;
const MAX_EMAILS = 50; // per request — keep well under the function timeout

type Status = "valid" | "invalid" | "risky" | "unknown";

interface ValidationResult {
  email: string;
  status: Status;
  deliverability: string | null;
  reason: string | null;
  is_disposable: boolean;
  is_role: boolean;
  is_free: boolean;
  score: number | null;
  cached: boolean;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// Map Mails.so's raw result string to our normalized status. Defensive about the
// exact spelling — anything unrecognized is treated as "unknown" (never blocks).
function normalizeStatus(result: string | undefined | null): Status {
  const r = (result ?? "").toString().toLowerCase().trim();
  if (["deliverable", "valid", "ok", "safe"].includes(r)) return "valid";
  if (["undeliverable", "invalid", "bad", "not_deliverable", "rejected"].includes(r)) return "invalid";
  if (["risky", "accept_all", "catch_all", "catchall", "low_quality", "low_deliverability", "unknown_risky"].includes(r)) return "risky";
  return "unknown";
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

async function callMailsSo(email: string): Promise<Record<string, unknown> | null> {
  const url = `${MAILS_SO_URL}?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { "x-mails-api-key": MAILS_SO_API_KEY, "Accept": "application/json" } });
  if (!res.ok) {
    console.warn(`[mails-validation] provider ${res.status} for ${email}`);
    return null;
  }
  const body = await res.json().catch(() => null);
  // Mails.so wraps the payload in { data: {...} } — unwrap if present.
  const d = (body && typeof body === "object" && "data" in body) ? (body as { data: unknown }).data : body;
  return (d && typeof d === "object") ? d as Record<string, unknown> : null;
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const cors = getCorsHeaders(req);

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!MAILS_SO_API_KEY) return json({ error: "MAILS_SO_API_KEY not configured" }, 500, cors);

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401, cors);
  const admin = adminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401, cors);

  // ── Parse ──
  let body: { business_id?: string; email?: string; emails?: string[]; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }

  const businessId = body.business_id;
  if (!businessId) return json({ error: "business_id is required" }, 400, cors);

  const rawList = body.emails ?? (body.email ? [body.email] : []);
  const emails = Array.from(new Set(
    rawList.map((e) => (e ?? "").toString().trim().toLowerCase()).filter((e) => e.includes("@")),
  ));
  if (emails.length === 0) return json({ error: "No valid emails provided" }, 400, cors);
  if (emails.length > MAX_EMAILS) return json({ error: `Too many emails (max ${MAX_EMAILS} per request)` }, 400, cors);

  // ── Verify the caller is a member of this business + resolve workspace_id ──
  const { data: membership } = await admin
    .from("business_members").select("business_id").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
  if (!membership) return json({ error: "Not a member of this business" }, 403, cors);

  const { data: biz } = await admin.from("businesses").select("workspace_id").eq("id", businessId).maybeSingle();
  const workspaceId = (biz as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) return json({ error: "Business not found" }, 404, cors);

  const staleBefore = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000).toISOString();
  const results: ValidationResult[] = [];

  for (const email of emails) {
    // ── Cache ──
    if (!body.force) {
      const { data: cached } = await admin
        .from("email_validations")
        .select("email,status,deliverability,reason,is_disposable,is_role,is_free,score,validated_at")
        .eq("business_id", businessId).eq("email", email)
        .gte("validated_at", staleBefore)
        .maybeSingle();
      if (cached) {
        const c = cached as Record<string, unknown>;
        results.push({
          email, status: c.status as Status, deliverability: (c.deliverability as string) ?? null,
          reason: (c.reason as string) ?? null, is_disposable: bool(c.is_disposable), is_role: bool(c.is_role),
          is_free: bool(c.is_free), score: (c.score as number) ?? null, cached: true,
        });
        continue;
      }
    }

    // ── Validate ──
    const raw = await callMailsSo(email);
    const status = normalizeStatus((raw?.result ?? raw?.status) as string | undefined);
    const result: ValidationResult = {
      email,
      status,
      deliverability: (raw?.result ?? raw?.status ?? null) as string | null,
      reason: (raw?.reason as string) ?? null,
      is_disposable: bool(raw?.is_disposable ?? raw?.disposable),
      // Mails.so has no is_role field — a generic/role address (info@, support@)
      // is flagged by isv_nogeneric === false.
      is_role: bool(raw?.is_role ?? raw?.role) || raw?.isv_nogeneric === false,
      is_free: bool(raw?.is_free ?? raw?.free),
      score: (typeof raw?.score === "number" ? raw.score : null) as number | null,
      cached: false,
    };
    results.push(result);

    // ── Persist (upsert per business+email) ──
    const { error: upErr } = await admin.from("email_validations").upsert({
      workspace_id: workspaceId,
      business_id: businessId,
      email,
      status: result.status,
      deliverability: result.deliverability,
      reason: result.reason,
      is_disposable: result.is_disposable,
      is_role: result.is_role,
      is_free: result.is_free,
      score: result.score,
      provider: "mails.so",
      raw_response: raw ?? null,
      validated_by: user.id,
      validated_at: new Date().toISOString(),
    }, { onConflict: "business_id,email" });
    if (upErr) console.warn("[mails-validation] upsert failed:", upErr.message);

    // ── Append to history log (one row per fresh validation) ──
    const { error: logErr } = await admin.from("email_validation_log").insert({
      workspace_id: workspaceId,
      business_id: businessId,
      email,
      status: result.status,
      deliverability: result.deliverability,
      reason: result.reason,
      is_disposable: result.is_disposable,
      is_role: result.is_role,
      is_free: result.is_free,
      score: result.score,
      provider: "mails.so",
      validated_by: user.id,
      validated_at: new Date().toISOString(),
    });
    if (logErr) console.warn("[mails-validation] log insert failed:", logErr.message);
  }

  return json({ results }, 200, cors);
});
