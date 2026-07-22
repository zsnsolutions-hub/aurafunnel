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
const MAX_PAGES = 12;              // homepage + up to this many discovered pages
const MAX_SITEMAP_CHILDREN = 3;    // cap child sitemaps we expand from an index
const MAX_CANDIDATES = 400;        // safety bound on URLs considered

// Path keywords that signal high-value business pages, best first. Used to rank
// discovered links + sitemap URLs so we crawl the pages that describe the business.
const PRIORITY = [
  "about", "company", "who-we-are", "services", "solutions", "products", "product",
  "platform", "features", "pricing", "plans", "team", "leadership", "customers",
  "case-stud", "clients", "industries", "faq", "contact",
];
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|mp4|mp3|zip|css|js|xml|json|ico|woff2?)($|\?)/i;

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function decode(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x27;/gi, "'").replace(/&rsquo;|&#8217;/gi, "'");
}

function htmlToText(html: string): string {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// Extract the structured head data (title, meta description/keywords/OG, JSON-LD).
// SPAs render an empty <body> via JS but still ship this in the HTML source, so
// it's often the ONLY real business info a plain fetch can see.
function extractHead(html: string): string {
  const parts: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) parts.push(`Title: ${decode(title.trim())}`);
  const wanted = ["description", "keywords", "author", "og:title", "og:description", "og:site_name"];
  for (const tag of html.match(/<meta[^>]+>/gi) ?? []) {
    const name = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
    if (name && content && wanted.includes(name)) parts.push(`${name}: ${decode(content.trim())}`);
  }
  const ldRe = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html)) !== null) {
    const j = m[1].trim();
    if (j) parts.push(`Structured data (JSON-LD): ${j.slice(0, 2500)}`);
  }
  return parts.join("\n");
}

// Fetch a URL and return the raw HTML (or "" on any failure / non-HTML).
async function fetchRaw(url: string, accept = "text/html"): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScaliyoBot/1.0; +https://scaliyo.com)", "Accept": accept },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text") && !ct.includes("xml")) return "";
    return await res.text();
  } catch { return ""; } finally { clearTimeout(t); }
}

// Same-registrable-host check (SSRF + relevance): only crawl the target's origin.
function sameHost(u: URL, base: URL): boolean {
  return u.hostname.toLowerCase() === base.hostname.toLowerCase();
}

function normalize(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!sameHost(u, base)) return null;
    if (SKIP_EXT.test(u.pathname)) return null;
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch { return null; }
}

// Discover same-origin links from a page's <a href> attributes.
function discoverLinks(html: string, base: URL): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const n = normalize(m[1], base);
    if (n) out.add(n);
    if (out.size >= MAX_CANDIDATES) break;
  }
  return [...out];
}

// Fetch sitemap.xml (following one level of sitemap-index) and return page URLs.
async function fetchSitemapUrls(base: URL): Promise<string[]> {
  const origin = `${base.protocol}//${base.host}`;
  const xml = await fetchRaw(`${origin}/sitemap.xml`, "application/xml");
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const isIndex = /<sitemapindex/i.test(xml);
  const out = new Set<string>();
  if (isIndex) {
    for (const child of locs.slice(0, MAX_SITEMAP_CHILDREN)) {
      const childXml = await fetchRaw(child, "application/xml");
      for (const m of childXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        const n = normalize(m[1].trim(), base);
        if (n) out.add(n);
        if (out.size >= MAX_CANDIDATES) break;
      }
    }
  } else {
    for (const l of locs) {
      const n = normalize(l, base);
      if (n) out.add(n);
      if (out.size >= MAX_CANDIDATES) break;
    }
  }
  return [...out];
}

// Rank a URL by how likely it is to describe the business (priority keywords +
// shallow paths first).
function scoreUrl(url: string): number {
  const path = url.toLowerCase();
  let score = 0;
  PRIORITY.forEach((kw, i) => { if (path.includes(kw)) score += PRIORITY.length - i; });
  const depth = (new URL(url).pathname.match(/\//g) || []).length;
  score -= depth; // prefer shallower pages
  return score;
}

async function fetchText(url: string): Promise<string> {
  const html = await fetchRaw(url);
  return html ? htmlToText(html) : "";
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

  // 1. Homepage: raw HTML gives us the richest head metadata AND the nav/footer
  //    links to discover the rest of the site.
  const homeHtml = await fetchRaw(raw);
  const head = homeHtml ? extractHead(homeHtml) : "";
  const homeText = homeHtml ? htmlToText(homeHtml) : "";

  // 2. Discover candidate pages from the homepage links + sitemap.xml, rank by
  //    business relevance, and pick the top N same-origin pages to crawl.
  const homeUrl = normalize(raw, base) ?? raw.replace(/\/$/, "");
  const [links, sitemap] = await Promise.all([
    Promise.resolve(discoverLinks(homeHtml, base)),
    fetchSitemapUrls(base).catch(() => [] as string[]),
  ]);
  const candidates = [...new Set([...links, ...sitemap])].filter((u) => u !== homeUrl);
  const chosen = candidates
    .map((u) => ({ u, s: scoreUrl(u) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_PAGES)
    .map((x) => x.u);

  // 3. Fetch the chosen pages and assemble deduped text (head + homepage first).
  const pageTexts = await Promise.all(chosen.map((u) => fetchText(u).catch(() => "")));

  let text = head;
  const seen = new Set<string>();
  const append = (body: string) => {
    if (!body || body.length < 40) return;
    const key = body.slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    text += (text ? "\n\n" : "") + body;
  };
  append(homeText);
  for (const t of pageTexts) {
    if (text.length >= MAX_CHARS) break;
    append(t);
  }
  text = text.slice(0, MAX_CHARS);

  return json({ text, chars: text.length, url: raw, pages_crawled: 1 + chosen.length }, 200, cors);
});
