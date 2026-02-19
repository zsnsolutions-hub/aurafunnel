/**
 * Image Generation — Client API
 *
 * Generates images client-side (stub SVGs for now) and provides
 * data-URL based images that work immediately without any backend.
 * When a real provider is wired, swap generateStubSvg for a fetch call.
 */

import { buildImagePrompt } from './imagePromptBuilder';
import type {
  ImageGenRequest,
  ImageGenResponse,
  ImageGenGeneratedImage,
} from '../types';

// ── SVG Stub Generator ──

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toDimensions(ar: string): { width: number; height: number } {
  switch (ar) {
    case '4:5': return { width: 1024, height: 1280 };
    case '16:9': return { width: 1280, height: 720 };
    default: return { width: 1024, height: 1024 };
  }
}

function generateStubSvgDataUrl(prompt: string, width: number, height: number, colors?: { primary?: string; secondary?: string; accent?: string }): string {
  const p = colors?.primary || '#4F46E5';
  const s = colors?.secondary || '#111827';
  const a = colors?.accent || '#F59E0B';
  const seed = hashCode(prompt);
  const angle = (seed % 360 + 360) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle} ${width / 2} ${height / 2})">
      <stop offset="0%" stop-color="${p}" />
      <stop offset="100%" stop-color="${s}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <circle cx="${width * 0.7}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.12}" fill="${a}" opacity="0.3" />
  <circle cx="${width * 0.25}" cy="${height * 0.7}" r="${Math.min(width, height) * 0.08}" fill="${a}" opacity="0.2" />
  <rect x="${width * 0.1}" y="${height * 0.42}" width="${width * 0.8}" height="1" fill="white" opacity="0.1" rx="0.5" />
  <text x="${width / 2}" y="${height / 2 - 10}" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="${Math.min(width, height) * 0.035}" font-weight="600" opacity="0.8">AI Generated Image</text>
  <text x="${width / 2}" y="${height / 2 + 18}" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="${Math.min(width, height) * 0.022}" opacity="0.5">${escapeXml(prompt.slice(0, 60))}</text>
</svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// ── Generate Images (fully client-side, no DB/storage needed) ──

export async function generateImages(req: ImageGenRequest): Promise<ImageGenResponse> {
  const fullPrompt = buildImagePrompt({
    moduleType: req.moduleType,
    userPrompt: req.prompt,
    presetId: req.presetId,
    aspectRatio: req.aspectRatio,
    brand: req.brand,
  });

  const count = Math.max(1, Math.min(4, req.n));
  const dims = toDimensions(req.aspectRatio || '1:1');
  const colors = req.brand?.colors;

  const images: { id: string; baseImageUrl: string; finalImageUrl?: string }[] = [];

  for (let i = 0; i < count; i++) {
    const variedPrompt = count > 1 ? `${fullPrompt} (variation ${i + 1}/${count})` : fullPrompt;
    const dataUrl = generateStubSvgDataUrl(variedPrompt, dims.width, dims.height, colors);

    images.push({
      id: crypto.randomUUID(),
      baseImageUrl: dataUrl,
    });
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
