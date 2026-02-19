/**
 * Image Generation — Logo Compositor
 *
 * Client-side Canvas-based compositing that overlays a user's logo
 * onto a generated base image with deterministic placement, sizing
 * and opacity.  Works with transparent PNG logos.
 */

import type { LogoPlacement, LogoSize } from '../types';

// ── Size multipliers (fraction of the shortest image dimension) ──
const SIZE_FACTOR: Record<LogoSize, number> = {
  small: 0.08,
  medium: 0.14,
  large: 0.22,
};

const PADDING_FACTOR = 0.03; // 3 % of shortest dimension

// ── Load an image from a URL into an HTMLImageElement ──
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Overlay a logo onto a base image.
 *
 * @returns A Blob of the composited PNG image.
 */
export async function overlayLogo(opts: {
  baseImageUrl: string;
  logoUrl: string;
  placement: LogoPlacement;
  size: LogoSize;
  opacity: number; // 0 – 1
}): Promise<Blob> {
  const [baseImg, logoImg] = await Promise.all([
    loadImage(opts.baseImageUrl),
    loadImage(opts.logoUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = baseImg.naturalWidth;
  canvas.height = baseImg.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Draw base image
  ctx.drawImage(baseImg, 0, 0);

  // Compute logo dimensions (maintain aspect ratio)
  const shortest = Math.min(canvas.width, canvas.height);
  const maxDim = shortest * SIZE_FACTOR[opts.size];
  const logoAR = logoImg.naturalWidth / logoImg.naturalHeight;
  let logoW: number;
  let logoH: number;
  if (logoAR >= 1) {
    logoW = maxDim;
    logoH = maxDim / logoAR;
  } else {
    logoH = maxDim;
    logoW = maxDim * logoAR;
  }

  const pad = shortest * PADDING_FACTOR;

  // Compute position
  let x = 0;
  let y = 0;
  switch (opts.placement) {
    case 'top-left':
      x = pad;
      y = pad;
      break;
    case 'top-right':
      x = canvas.width - logoW - pad;
      y = pad;
      break;
    case 'bottom-left':
      x = pad;
      y = canvas.height - logoH - pad;
      break;
    case 'bottom-right':
      x = canvas.width - logoW - pad;
      y = canvas.height - logoH - pad;
      break;
    case 'center-watermark':
      x = (canvas.width - logoW) / 2;
      y = (canvas.height - logoH) / 2;
      break;
  }

  // Draw logo with opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, opts.opacity));
  ctx.drawImage(logoImg, x, y, logoW, logoH);
  ctx.globalAlpha = 1;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/png',
    );
  });
}
