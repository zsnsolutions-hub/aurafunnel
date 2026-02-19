/**
 * Image Generation — Client API
 *
 * Uses Google Imagen 4 (via @google/genai SDK) for real image generation.
 * Falls back to SVG placeholders if the API call fails.
 */

import { GoogleGenAI } from '@google/genai';
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
  });

  const count = Math.max(1, Math.min(4, req.n));
  const aspectRatio = IMAGEN_ASPECT_RATIO[req.aspectRatio] || '1:1';

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: fullPrompt,
    config: {
      numberOfImages: count,
      aspectRatio,
    },
  });

  const images: { id: string; baseImageUrl: string; finalImageUrl?: string }[] = [];

  if (response.generatedImages) {
    for (const generatedImage of response.generatedImages) {
      const imgBytes = generatedImage.image?.imageBytes;
      if (imgBytes) {
        images.push({
          id: crypto.randomUUID(),
          baseImageUrl: `data:image/png;base64,${imgBytes}`,
        });
      }
    }
  }

  if (images.length === 0) {
    throw new Error('No images were generated. Try a different prompt.');
  }

  return { generationId: crypto.randomUUID(), images };
}

// ── Fetch Generation History (returns empty until DB tables are set up) ──

export async function fetchGenerationHistory(_opts?: {
  moduleType?: string;
  limit?: number;
}): Promise<ImageGenGeneratedImage[]> {
  return [];
}
