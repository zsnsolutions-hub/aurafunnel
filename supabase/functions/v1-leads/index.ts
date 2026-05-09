// supabase/functions/v1-leads/index.ts
//
// Phase 4.1 — Public REST API endpoint: list workspace leads.
//
//   GET  /functions/v1/v1-leads
//   Authorization: Bearer scal_<token>
//   Required scope: leads.read
//
// Query params:
//   limit       (int, default 50, max 200)
//   cursor      (ISO timestamp; pagination on created_at DESC)
//   status      (filter by lead status)
//
// Response:
//   {
//     "data":        [ { id, first_name, last_name, primary_email, ... } ],
//     "next_cursor": "<created_at-of-last-row>" | null,
//     "has_more":    boolean,
//     "limit":       number
//   }
//
// Workspace scope is derived from the API key — no workspace_id query
// param is needed or honored. The key's scope `leads.read` is required.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticateApiKey, adminClient } from "../_shared/api-auth.ts";

const COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "primary_email",
  "primary_phone",
  "company",
  "title",
  "industry",
  "company_size",
  "linkedin_url",
  "location",
  "source",
  "score",
  "status",
  "insights",
  "last_activity",
  "created_at",
  "updated_at",
].join(",");

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed", code: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const auth = await authenticateApiKey(req, {
    requiredScope: "leads.read",
    corsHeaders,
  });
  if (!auth.ok) return auth.response;

  const { workspaceId } = auth.auth;
  const url = new URL(req.url);

  // ── Params ──
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(MAX_LIMIT, limitRaw)
    : DEFAULT_LIMIT;

  const cursor = url.searchParams.get("cursor"); // ISO timestamp
  const statusFilter = url.searchParams.get("status");

  // ── Query ──
  const admin = adminClient();
  let q = admin
    .from("leads")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // fetch one extra to detect has_more

  if (cursor) q = q.lt("created_at", cursor);
  if (statusFilter) q = q.eq("status", statusFilter);

  const { data, error } = await q;
  if (error) {
    console.error("[v1-leads] query error:", error.message);
    return new Response(
      JSON.stringify({ error: "Query failed", code: "query_failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rows = data ?? [];
  const has_more = rows.length > limit;
  const result = has_more ? rows.slice(0, limit) : rows;
  const next_cursor = has_more
    ? (result[result.length - 1] as { created_at: string }).created_at
    : null;

  return new Response(
    JSON.stringify({ data: result, next_cursor, has_more, limit }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
