/**
 * Image Generation — Client API
 *
 * Thin wrappers around Supabase storage + edge-function calls.
 * All functions are workspace-isolated via RLS (user_id).
 */

import { supabase } from './supabase';
import { overlayLogo } from './logoCompositor';
import { buildImagePrompt } from './imagePromptBuilder';
import type {
  ImageGenRequest,
  ImageGenResponse,
  ImageGenBrandAsset,
  ImageGenGeneratedImage,
} from '../types';

const BUCKET = 'image-gen-assets';

// ── Helpers ──

async function callEdgeFunction<T>(fnName: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json as T;
}

// ── Logo Upload (client-side to Supabase Storage → DB record) ──

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadLogo(file: File): Promise<ImageGenBrandAsset> {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    throw new Error(`Invalid file type. Allowed: ${ALLOWED_LOGO_TYPES.join(', ')}`);
  }
  if (file.size > MAX_LOGO_SIZE) {
    throw new Error('Logo must be under 5 MB');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `logos/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file);
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

  const { data, error } = await supabase
    .from('image_gen_brand_assets')
    .insert({
      user_id: user.id,
      type: 'logo',
      file_url: urlData.publicUrl,
      file_name: file.name,
    })
    .select()
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return data as ImageGenBrandAsset;
}

// ── List Logos ──

export async function listLogos(): Promise<ImageGenBrandAsset[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('image_gen_brand_assets')
    .select('*')
    .eq('user_id', user.id)
    .eq('type', 'logo')
    .order('created_at', { ascending: false });

  if (error) { console.error('listLogos:', error); return []; }
  return (data ?? []) as ImageGenBrandAsset[];
}

// ── Delete Logo ──

export async function deleteLogo(id: string): Promise<void> {
  await supabase.from('image_gen_brand_assets').delete().eq('id', id);
}

// ── Generate Images ──

export async function generateImages(req: ImageGenRequest): Promise<ImageGenResponse> {
  // Build the full prompt on the client so it's visible/debuggable
  const fullPrompt = buildImagePrompt({
    moduleType: req.moduleType,
    userPrompt: req.prompt,
    presetId: req.presetId,
    aspectRatio: req.aspectRatio,
    brand: req.brand,
  });

  const res = await callEdgeFunction<ImageGenResponse>('image-gen', {
    action: 'generate',
    moduleType: req.moduleType,
    moduleId: req.moduleId ?? null,
    prompt: fullPrompt,
    aspectRatio: req.aspectRatio,
    n: req.n,
    brand: req.brand,
  });

  return res;
}

// ── Post-process: overlay logo onto generated images ──

export async function compositeLogoOnImages(
  images: ImageGenGeneratedImage[],
  logoUrl: string,
  placement: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-watermark',
  size: 'small' | 'medium' | 'large',
  opacity: number,
): Promise<ImageGenGeneratedImage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const results: ImageGenGeneratedImage[] = [];

  for (const img of images) {
    const composited = await overlayLogo({
      baseImageUrl: img.base_image_url,
      logoUrl,
      placement,
      size,
      opacity,
    });

    // Upload composited image
    const fileName = `composited/${user.id}/${img.id}-final.png`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(fileName, composited, { contentType: 'image/png' });
    if (upErr) { console.error('Composite upload failed:', upErr); results.push(img); continue; }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    const finalUrl = urlData.publicUrl;

    // Update DB record
    await supabase
      .from('image_gen_generated_images')
      .update({ final_image_url: finalUrl })
      .eq('id', img.id);

    results.push({ ...img, final_image_url: finalUrl });
  }

  return results;
}

// ── Save to Module ──

export async function saveToModule(params: {
  generatedImageId: string;
  moduleType: string;
  moduleId: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('image_gen_module_attachments')
    .insert({
      user_id: user.id,
      generated_image_id: params.generatedImageId,
      module_type: params.moduleType,
      module_id: params.moduleId,
    });

  if (error) throw new Error(`Save failed: ${error.message}`);
}

// ── Fetch Generation History ──

export async function fetchGenerationHistory(opts?: {
  moduleType?: string;
  limit?: number;
}): Promise<ImageGenGeneratedImage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('image_gen_generated_images')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);

  if (opts?.moduleType) {
    query = query.eq('module_type', opts.moduleType);
  }

  const { data, error } = await query;
  if (error) { console.error('fetchGenerationHistory:', error); return []; }
  return (data ?? []) as ImageGenGeneratedImage[];
}
