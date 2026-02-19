/**
 * Edge Function: image-gen
 *
 * Actions:
 *   generate       – build prompt, call image provider, store results
 *   save-to-module – link generated image to a content record
 *
 * Provider interface + stub implementation included.
 * Swap StubProvider for a real provider (DALL·E 3, Stability, etc.) by
 * implementing the ImageProvider interface.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Environment ───

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "image-gen-assets";

// ─── CORS ───

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Rate Limiter (in-memory, per-user, 10 req / min) ───

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Hex Validation ───

function isValidHex(h: string): boolean {
  return typeof h === "string" && /^#[0-9A-Fa-f]{6}$/.test(h);
}

// ─── Provider Interface ───

interface GeneratedImageResult {
  imageData: Uint8Array; // raw bytes (PNG/SVG)
  contentType: string;
}

interface ImageProvider {
  generate(opts: {
    prompt: string;
    width: number;
    height: number;
    brandColors?: { primary: string; secondary: string; accent: string };
  }): Promise<GeneratedImageResult>;
}

// ─── Stub Provider (generates an SVG placeholder with brand colours) ───

class StubProvider implements ImageProvider {
  async generate(opts: {
    prompt: string;
    width: number;
    height: number;
    brandColors?: { primary: string; secondary: string; accent: string };
  }): Promise<GeneratedImageResult> {
    const p = opts.brandColors?.primary ?? "#4F46E5";
    const s = opts.brandColors?.secondary ?? "#111827";
    const a = opts.brandColors?.accent ?? "#F59E0B";
    const w = opts.width;
    const h = opts.height;

    // Unique pattern seed from prompt
    const seed = hashCode(opts.prompt);
    const angle = (seed % 360 + 360) % 360;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle} ${w / 2} ${h / 2})">
      <stop offset="0%" stop-color="${p}" />
      <stop offset="100%" stop-color="${s}" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)" />
  <circle cx="${w * 0.7}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.12}" fill="${a}" opacity="0.3" />
  <circle cx="${w * 0.25}" cy="${h * 0.7}" r="${Math.min(w, h) * 0.08}" fill="${a}" opacity="0.2" />
  <rect x="${w * 0.1}" y="${h * 0.42}" width="${w * 0.8}" height="1" fill="white" opacity="0.1" rx="0.5" />
  <text x="${w / 2}" y="${h / 2 - 10}" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="${Math.min(w, h) * 0.035}" font-weight="600" opacity="0.8">AI Generated Image</text>
  <text x="${w / 2}" y="${h / 2 + 18}" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="${Math.min(w, h) * 0.022}" opacity="0.5">${escapeXml(opts.prompt.slice(0, 60))}</text>
</svg>`;

    return {
      imageData: new TextEncoder().encode(svg),
      contentType: "image/svg+xml",
    };
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Aspect Ratio → Dimensions ───

function toDimensions(ar: string): { width: number; height: number } {
  switch (ar) {
    case "4:5":
      return { width: 1024, height: 1280 };
    case "16:9":
      return { width: 1280, height: 720 };
    default:
      return { width: 1024, height: 1024 };
  }
}

// ─── Ensure storage bucket exists ───

async function ensureBucket(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: [
        "image/png",
        "image/jpeg",
        "image/svg+xml",
        "image/webp",
      ],
    });
  }
}

// ─── Handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const action: string = body.action;

    // ────── ACTION: generate ──────
    if (action === "generate") {
      // Rate limit
      if (!checkRateLimit(user.id)) {
        return jsonResponse({ error: "Rate limit exceeded. Try again in a minute." }, 429);
      }

      const {
        moduleType,
        moduleId,
        prompt,
        aspectRatio,
        n,
        brand,
      } = body as {
        moduleType: string;
        moduleId: string | null;
        prompt: string;
        aspectRatio: string;
        n: number;
        brand: {
          colors?: { primary?: string; secondary?: string; accent?: string; bgStyle?: string };
          logoAssetId?: string;
          logoPlacement?: string;
          logoSize?: string;
          logoOpacity?: number;
          brandName?: string;
          fontVibe?: string;
        };
      };

      // Validate
      if (!["newsletter", "pricing", "products", "services"].includes(moduleType)) {
        return jsonResponse({ error: "Invalid moduleType" }, 400);
      }
      if (!prompt || typeof prompt !== "string") {
        return jsonResponse({ error: "prompt is required" }, 400);
      }
      const count = Math.max(1, Math.min(4, Number(n) || 1));
      const colors = brand?.colors;
      if (colors?.primary && !isValidHex(colors.primary)) {
        return jsonResponse({ error: "Invalid primary hex color" }, 400);
      }
      if (colors?.secondary && !isValidHex(colors.secondary)) {
        return jsonResponse({ error: "Invalid secondary hex color" }, 400);
      }
      if (colors?.accent && !isValidHex(colors.accent)) {
        return jsonResponse({ error: "Invalid accent hex color" }, 400);
      }

      // Ensure bucket
      await ensureBucket(admin);

      const dims = toDimensions(aspectRatio || "1:1");
      const provider: ImageProvider = new StubProvider();

      const images: { id: string; baseImageUrl: string; finalImageUrl?: string }[] = [];

      for (let i = 0; i < count; i++) {
        // Add variation entropy to prompt
        const variedPrompt = count > 1 ? `${prompt} (variation ${i + 1}/${count})` : prompt;

        const result = await provider.generate({
          prompt: variedPrompt,
          width: dims.width,
          height: dims.height,
          brandColors: colors
            ? {
                primary: colors.primary || "#4F46E5",
                secondary: colors.secondary || "#111827",
                accent: colors.accent || "#F59E0B",
              }
            : undefined,
        });

        // Upload to storage
        const ext = result.contentType === "image/svg+xml" ? "svg" : "png";
        const filePath = `generated/${user.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(filePath, result.imageData, {
            contentType: result.contentType,
            upsert: false,
          });

        if (upErr) {
          console.error("Upload error:", upErr.message);
          continue;
        }

        const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(filePath);

        // Insert DB record
        const { data: row, error: dbErr } = await admin
          .from("image_gen_generated_images")
          .insert({
            user_id: user.id,
            module_type: moduleType,
            module_id: moduleId || null,
            prompt: variedPrompt,
            aspect_ratio: aspectRatio || "1:1",
            provider: "stub",
            base_image_url: urlData.publicUrl,
            brand_settings: brand || {},
          })
          .select()
          .single();

        if (dbErr) {
          console.error("DB insert error:", dbErr.message);
          continue;
        }

        images.push({
          id: row.id,
          baseImageUrl: row.base_image_url,
        });
      }

      return jsonResponse({
        generationId: crypto.randomUUID(),
        images,
      });
    }

    // ────── ACTION: save-to-module ──────
    if (action === "save-to-module") {
      const { generatedImageId, moduleType, moduleId } = body as {
        generatedImageId: string;
        moduleType: string;
        moduleId: string;
      };

      if (!generatedImageId || !moduleType || !moduleId) {
        return jsonResponse({ error: "generatedImageId, moduleType, and moduleId are required" }, 400);
      }

      const { error: insErr } = await admin
        .from("image_gen_module_attachments")
        .insert({
          user_id: user.id,
          generated_image_id: generatedImageId,
          module_type: moduleType,
          module_id: moduleId,
        });

      if (insErr) {
        return jsonResponse({ error: `Save failed: ${insErr.message}` }, 500);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("image-gen error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
