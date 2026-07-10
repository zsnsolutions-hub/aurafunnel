// supabase/functions/fetch-page/index.ts
//
// Server-side website fetcher for the business-profile analyzer. Gemini's
// grounding (url_context) is unreliable from the edge runtime, so instead we
// fetch the site ourselves here (a plain HTTP GET is reliable) and hand the
// extracted text to a normal, non-grounded AI call. Fetches the homepage plus a
// few common pages, best-effort, and returns cleaned text.
//
// Deploy: supabase functions deploy fetch-page

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

const MAX_CHARS = 45_000;
const PER_PAGE_TIMEOUT_MS = 10_000;
const SUBPATHS = ["", "/about", "/about-us", "/services", "/products", "/pricing", "/solutions"];

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOne(url: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScaliyoBot/1.0; +https://scaliyo.com)", "Accept": "text/html" },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return "";
    const html = await res.text();
    return htmlToText(html);
  } catch { return ""; } finally { clearTimeout(t); }
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const cors = getCorsHeaders(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  // Require an authenticated user (prevents open SSRF-ish abuse).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401, cors);
  const admin = adminClient();
  const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401, cors);

  let body: { url?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
  let raw = (body.url || "").trim();
  if (!raw) return json({ error: "url is required" }, 400, cors);
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let base: URL;
  try { base = new URL(raw); } catch { return json({ error: "Invalid URL" }, 400, cors); }
  // Block internal/loopback targets.
  const host = base.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) {
    return json({ error: "URL not allowed" }, 400, cors);
  }

  const origin = `${base.protocol}//${base.host}`;
  const results = await Promise.all(SUBPATHS.map((p) => fetchOne(p === "" ? raw : `${origin}${p}`)));
  let text = "";
  const seen = new Set<string>();
  for (const chunk of results) {
    if (!chunk || seen.has(chunk.slice(0, 200))) continue;
    seen.add(chunk.slice(0, 200));
    text += (text ? "\n\n" : "") + chunk;
    if (text.length >= MAX_CHARS) break;
  }
  text = text.slice(0, MAX_CHARS);

  return json({ text, chars: text.length, url: raw }, 200, cors);
});
