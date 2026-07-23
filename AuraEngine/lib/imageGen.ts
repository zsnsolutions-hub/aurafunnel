/**
 * Image Generation — Client API
 *
 * Uses Google Imagen 4 via the `gemini-proxy` Edge Function (GEMINI_API_KEY
 * lives there, not in the client bundle).
 */

import { getGeminiClient } from './geminiClient';
import { supabase } from './supabase';
import { AI_MODELS } from './aiConfig';
import { buildImagePrompt } from './imagePromptBuilder';
import type {
  ImageGenRequest,
  ImageGenResponse,
  ImageGenGeneratedImage,
} from '../types';

// Imagen aspect ratio mapping (our values → Imagen-supported values)
const IMAGEN_ASPECT_RATIO: Record<string, string> = {
  '1:1': '1:1',
  '4:5': '3:4',   // closest portrait ratio Imagen supports
  '16:9': '16:9',
};

// ── Generate Images via Imagen 4 ──

export async function generateImages(req: ImageGenRequest): Promise<ImageGenResponse> {
  const fullPrompt = buildImagePrompt({
    moduleType: req.moduleType,
    userPrompt: req.prompt,
    presetId: req.presetId,
    aspectRatio: req.aspectRatio,
    brand: req.brand,
    businessProfile: req.businessProfile,
    plans: req.plans,
    moduleFields: req.moduleFields,
  });

  const count = Math.max(1, Math.min(4, req.n));
  const aspectRatio = IMAGEN_ASPECT_RATIO[req.aspectRatio] || '1:1';

  const ai = getGeminiClient();

  const response = await ai.models.generateImages({
    model: AI_MODELS.image,
    operation: 'image_generation',
    prompt: fullPrompt,
    config: {
      numberOfImages: count,
      aspectRatio,
    },
  });

  const generationId = crypto.randomUUID();
  const images: { id: string; baseImageUrl: string; finalImageUrl?: string }[] = [];

  // Persist to the image-gen-assets bucket + image_gen_generated_images so the
  // gallery survives reload (Roadmap 4.3, BUG-032). Best-effort: on any storage/DB
  // failure we fall back to the in-memory data: URI so generation never breaks.
  const { data: { user } } = await supabase.auth.getUser();

  if (response.generatedImages) {
    for (const generatedImage of response.generatedImages) {
      const imgBytes = generatedImage.image?.imageBytes;
      if (!imgBytes) continue;
      const id = crypto.randomUUID();
      let url = `data:image/png;base64,${imgBytes}`;
      if (user) {
        try {
          const bytes = Uint8Array.from(atob(imgBytes), (c) => c.charCodeAt(0));
          const path = `${user.id}/${generationId}/${id}.png`;
          const up = await supabase.storage.from('image-gen-assets').upload(path, bytes, { contentType: 'image/png', upsert: true });
          if (!up.error) {
            const pub = supabase.storage.from('image-gen-assets').getPublicUrl(path);
            const publicUrl = pub.data.publicUrl;
            url = publicUrl;
            await supabase.from('image_gen_generated_images').insert({
              id,
              user_id: user.id,
              module_type: req.moduleType,
              module_id: req.moduleId ?? null,
              prompt: req.prompt,
              aspect_ratio: req.aspectRatio,
              provider: 'gemini',
              base_image_url: publicUrl,
              brand_settings: req.brand ?? {},
            });
          }
        } catch (e) {
          console.warn('[imageGen] persist failed; keeping in-memory image:', (e as Error).message);
        }
      }
      images.push({ id, baseImageUrl: url });
    }
  }

  if (images.length === 0) {
    throw new Error('No images were generated. Try a different prompt.');
  }

  return { generationId, images };
}

// ── Fetch Generation History (Roadmap 4.3) ──

export async function fetchGenerationHistory(opts?: {
  moduleType?: string;
  limit?: number;
}): Promise<ImageGenGeneratedImage[]> {
  let q = supabase
    .from('image_gen_generated_images')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 40);
  if (opts?.moduleType) q = q.eq('module_type', opts.moduleType);
  const { data, error } = await q;
  if (error) { console.error('fetchGenerationHistory failed:', error.message); return []; }
  return (data ?? []) as ImageGenGeneratedImage[];
}
