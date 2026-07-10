// AuraEngine/lib/imageStudio.ts
//
// Image → content pipeline (Phase E). Upload an image, analyze it with Gemini
// vision (image-context-analyzer), then generate channel content from the
// analysis + business context. Everything is business-scoped and runs through
// the credit-gated proxy. Analysis describes only what's visible (no fabrication).

import { supabase } from './supabase';
import { generateContent } from './geminiClient';
import { AI_MODELS } from './aiConfig';
import { uploadBase64Image } from './imageUpload';
import { getBusinessProfile } from './businesses';

export interface MediaAsset {
  id: string;
  file_url: string;
  file_type: string | null;
  title: string | null;
  ai_image_summary: string | null;
  detected_objects: unknown;
  detected_style: string | null;
  detected_product: string | null;
  mood: string | null;
  suggested_use_cases: unknown;
  suggested_campaign_angle: string | null;
  suggested_audience: string | null;
  suggested_cta: string | null;
  suggested_channels: unknown;
}

export type Channel = 'email' | 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'blog' | 'campaign';
export type Goal = 'sell' | 'educate' | 'announce' | 'nurture' | 'follow_up' | 'launch' | 'promote' | 'post';

export interface GenConfig { goal: Goal; channel: Channel; audience: string; tone: string }

function parseJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

const str = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);
const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

/** Upload a base64 data-URI image and create the media_assets row. */
export async function uploadImageAsset(
  businessId: string, workspaceId: string, userId: string, dataUri: string, title?: string,
): Promise<{ asset: MediaAsset; dataUri: string }> {
  const fileUrl = await uploadBase64Image(dataUri);
  const mime = dataUri.match(/^data:(image\/\w+);base64,/)?.[1] ?? 'image/png';
  const { data, error } = await supabase.from('media_assets').insert({
    workspace_id: workspaceId, business_id: businessId, uploaded_by: userId,
    file_url: fileUrl, file_type: mime, title: title ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return { asset: data as MediaAsset, dataUri };
}

/** Analyze an uploaded image with Gemini vision; persists the analysis. */
export async function analyzeImage(
  businessId: string, assetId: string, dataUri: string, note?: string,
): Promise<MediaAsset> {
  const biz = await getBusinessProfile(businessId) as Record<string, unknown> | null;
  const m = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image data.');
  const [, mimeType, base64] = m;

  const prompt = `You are a marketing creative analyst. Describe ONLY what is actually visible in this image — do not invent brands, text, or objects that are not there. Relate it to the seller's business where reasonable.

Seller business: products/services = ${biz?.products_services ?? 'n/a'}; audience = ${biz?.audience ?? 'n/a'}.
${note ? `User note: ${note}` : ''}

Return ONLY JSON with:
"ai_image_summary" (1-2 sentences), "detected_objects" (array of strings), "detected_style" (e.g. minimal, bold, luxury), "detected_product" (what product/service it represents, or "unknown"), "mood" (one word), "suggested_use_cases" (array), "suggested_campaign_angle" (string), "suggested_audience" (string), "suggested_cta" (string), "suggested_channels" (array from: email, instagram, facebook, tiktok, linkedin, blog).`;

  const res = await generateContent({
    model: AI_MODELS.text,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
    operation: 'business_analysis',
  });
  const p = parseJson(res.text) ?? {};

  const patch = {
    ai_image_summary: str(p.ai_image_summary),
    detected_objects: arr(p.detected_objects),
    detected_style: str(p.detected_style),
    detected_product: str(p.detected_product),
    mood: str(p.mood),
    suggested_use_cases: arr(p.suggested_use_cases),
    suggested_campaign_angle: str(p.suggested_campaign_angle),
    suggested_audience: str(p.suggested_audience),
    suggested_cta: str(p.suggested_cta),
    suggested_channels: arr(p.suggested_channels),
    analyzed_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('media_assets').update(patch).eq('id', assetId).select().single();
  if (error) throw new Error(error.message);
  return data as MediaAsset;
}

export interface GeneratedPiece {
  variant: 'short' | 'long';
  title: string | null;
  preview_text: string | null;
  content: string;
  hashtags: string[] | null;
  cta: string | null;
}

/** Generate channel content from the analyzed image + config; stores generated_assets. */
export async function generateFromImage(
  businessId: string, workspaceId: string, userId: string, asset: MediaAsset, cfg: GenConfig,
): Promise<GeneratedPiece[]> {
  const biz = await getBusinessProfile(businessId) as Record<string, unknown> | null;
  const social = ['instagram', 'facebook', 'tiktok', 'linkedin'].includes(cfg.channel);

  const shape = cfg.channel === 'email'
    ? '{"title": subject line, "preview_text": preview, "content": html-free body, "cta": call to action}'
    : cfg.channel === 'blog'
    ? '{"title": post title, "content": article, "cta": call to action}'
    : cfg.channel === 'campaign'
    ? '{"content": a campaign angle + plan, "cta": call to action}'
    : '{"content": the post/caption/script, "hashtags": array of hashtags, "cta": call to action}';

  const prompt = `You are a senior copywriter. Using the IMAGE ANALYSIS and BUSINESS below, write ${cfg.channel} content.
Goal: ${cfg.goal}. Audience: ${cfg.audience || biz?.audience || 'the business audience'}. Tone: ${cfg.tone || biz?.tone || 'professional'}.
Base it on what the image actually shows; do not invent product claims.

IMAGE ANALYSIS: ${asset.ai_image_summary ?? ''} | product: ${asset.detected_product ?? 'n/a'} | style: ${asset.detected_style ?? 'n/a'} | angle: ${asset.suggested_campaign_angle ?? 'n/a'}
BUSINESS: products = ${biz?.products_services ?? 'n/a'}; value = ${biz?.value_prop ?? 'n/a'}.

Return ONLY JSON: {"short": ${shape}, "long": ${shape}} — "short" is concise, "long" is fuller.${social ? ' Include relevant "hashtags".' : ''}`;

  const res = await generateContent({ model: AI_MODELS.text, contents: prompt, operation: 'content_generation' });
  const p = parseJson(res.text) ?? {};

  const pieces: GeneratedPiece[] = (['short', 'long'] as const).map(v => {
    const o = (p[v] ?? {}) as Record<string, unknown>;
    return {
      variant: v,
      title: str(o.title),
      preview_text: str(o.preview_text),
      content: str(o.content) ?? '',
      hashtags: (arr(o.hashtags) as string[] | null),
      cta: str(o.cta),
    };
  }).filter(pc => pc.content);

  if (pieces.length) {
    const rows = pieces.map(pc => ({
      workspace_id: workspaceId, business_id: businessId, media_asset_id: asset.id, created_by: userId,
      kind: cfg.channel, channel: cfg.channel, goal: cfg.goal, tone: cfg.tone, audience: cfg.audience,
      variant: pc.variant, title: pc.title, preview_text: pc.preview_text, content: pc.content,
      hashtags: pc.hashtags, cta: pc.cta,
    }));
    const { error } = await supabase.from('generated_assets').insert(rows);
    if (error) console.warn('[imageStudio] save failed:', error.message);
  }
  return pieces;
}
