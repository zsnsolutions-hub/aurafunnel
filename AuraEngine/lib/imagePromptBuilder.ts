/**
 * Image Generation — Prompt Builder
 *
 * Merges module presets, user prompt, brand colours and logo instructions
 * into a single structured prompt string sent to the image-generation provider.
 */

import type {
  ImageModuleType,
  ImageAspectRatio,
  ImageGenBrandSettings,
  BusinessProfile,
} from '../types';

// ── Module-specific preset library ──

export interface ImagePreset {
  id: string;
  label: string;
  prompt: string;
}

export const MODULE_PRESETS: Record<ImageModuleType, ImagePreset[]> = {
  newsletter: [
    { id: 'newsletter-hero', label: 'Hero Banner', prompt: 'Professional newsletter hero banner, clean layout, modern typography, inviting color palette, editorial style' },
    { id: 'newsletter-feature', label: 'Feature Highlight', prompt: 'Clean feature highlight image, minimal design, single product focus, soft shadows, white background' },
    { id: 'newsletter-cta', label: 'Call to Action', prompt: 'Engaging call-to-action banner, bold headline area, contrasting button region, urgent yet professional' },
  ],
  pricing: [
    { id: 'pricing-comparison', label: 'Plan Comparison', prompt: 'Clean pricing comparison visual, tiered columns, highlighted recommended plan, professional SaaS style' },
    { id: 'pricing-value', label: 'Value Proposition', prompt: 'Value proposition illustration, abstract growth metaphor, upward trend, confident and aspirational' },
    { id: 'pricing-badge', label: 'Pricing Badge', prompt: 'Premium pricing badge design, gold or silver accent, trust seal, professional emblem style' },
  ],
  products: [
    { id: 'product-showcase', label: 'Product Showcase', prompt: 'Product showcase on clean background, studio lighting, professional product photography style, soft shadows' },
    { id: 'product-feature', label: 'Feature Grid', prompt: 'Product features grid layout, icon-driven, minimal text placeholders, organized and scannable' },
    { id: 'product-lifestyle', label: 'Lifestyle Shot', prompt: 'Product in lifestyle context, natural environment, warm lighting, aspirational and relatable' },
  ],
  services: [
    { id: 'service-overview', label: 'Service Overview', prompt: 'Professional service overview graphic, abstract representation of teamwork and expertise, corporate style' },
    { id: 'service-process', label: 'Process Flow', prompt: 'Service process flow diagram style, numbered steps, clean arrows, infographic aesthetic' },
    { id: 'service-benefit', label: 'Benefits Highlight', prompt: 'Service benefits illustration, positive outcomes imagery, growth and success metaphors, bright palette' },
  ],
};

// ── Aspect-ratio label map ──

const ASPECT_LABELS: Record<ImageAspectRatio, string> = {
  '1:1': 'square (1:1)',
  '4:5': 'portrait (4:5)',
  '16:9': 'landscape (16:9)',
};

// ── Font-vibe descriptors ──

const FONT_VIBE_DESC: Record<string, string> = {
  modern: 'modern sans-serif typography, clean geometric shapes',
  elegant: 'elegant serif typography, refined and luxurious feel',
  bold: 'bold heavy typography, strong visual impact',
  minimal: 'minimal thin typography, generous whitespace, understated',
};

// ── Background style descriptors ──

const BG_STYLE_DESC: Record<string, string> = {
  solid: 'solid flat background',
  gradient: 'smooth gradient background',
  'minimal-texture': 'subtle textured background with minimal noise',
};

// ── Hex colour validation ──

export function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// ── Main prompt builder ──

export function buildImagePrompt(opts: {
  moduleType: ImageModuleType;
  userPrompt: string;
  presetId?: string;
  aspectRatio: ImageAspectRatio;
  brand: ImageGenBrandSettings;
  businessProfile?: BusinessProfile;
}): string {
  const parts: string[] = [];

  // 1) Business context — gives the model understanding of what the company does
  const bp = opts.businessProfile;
  if (bp) {
    const ctxParts: string[] = [];
    if (bp.companyName) ctxParts.push(`Company: ${bp.companyName}`);
    if (bp.industry) ctxParts.push(`Industry: ${bp.industry}`);
    if (bp.productsServices) ctxParts.push(`Products/Services: ${bp.productsServices}`);
    if (bp.targetAudience) ctxParts.push(`Target audience: ${bp.targetAudience}`);
    if (bp.valueProp) ctxParts.push(`Value proposition: ${bp.valueProp}`);
    if (bp.businessDescription) ctxParts.push(`About: ${bp.businessDescription}`);
    if (ctxParts.length > 0) {
      parts.push(`Create an image for a business: ${ctxParts.join('. ')}.`);
    }
  }

  // 2) Module preset (if selected)
  if (opts.presetId) {
    const presets = MODULE_PRESETS[opts.moduleType] || [];
    const preset = presets.find(p => p.id === opts.presetId);
    if (preset) parts.push(preset.prompt);
  }

  // 3) User free-text prompt
  if (opts.userPrompt.trim()) {
    parts.push(opts.userPrompt.trim());
  }

  // 3) Aspect ratio instruction
  parts.push(`Image format: ${ASPECT_LABELS[opts.aspectRatio]}.`);

  // 4) Brand colours
  const { colors } = opts.brand;
  if (colors) {
    const colorParts: string[] = [];
    if (isValidHex(colors.primary)) colorParts.push(`primary ${colors.primary}`);
    if (isValidHex(colors.secondary)) colorParts.push(`secondary ${colors.secondary}`);
    if (isValidHex(colors.accent)) colorParts.push(`accent ${colors.accent}`);
    if (colorParts.length > 0) {
      parts.push(`Use brand colors: ${colorParts.join(', ')}. Keep layout minimal with ample whitespace.`);
    }
    if (colors.bgStyle && BG_STYLE_DESC[colors.bgStyle]) {
      parts.push(`Background: ${BG_STYLE_DESC[colors.bgStyle]}.`);
    }
  }

  // 5) Brand name
  if (opts.brand.brandName?.trim()) {
    parts.push(`Include the brand name "${opts.brand.brandName.trim()}" subtly in the design.`);
  }

  // 6) Font vibe
  if (opts.brand.fontVibe && FONT_VIBE_DESC[opts.brand.fontVibe]) {
    parts.push(`Typography style: ${FONT_VIBE_DESC[opts.brand.fontVibe]}.`);
  }

  // 7) Logo placement instruction (advisory — compositing handles the guarantee)
  if (opts.brand.logoAssetId && opts.brand.logoPlacement) {
    const placement = opts.brand.logoPlacement.replace('-', ' ');
    const opacity = (opts.brand.logoOpacity ?? 1) < 0.5 ? 'subtle watermark' : 'visible badge';
    parts.push(`Reserve space for a ${opacity} logo at the ${placement} of the image.`);
  }

  // 8) Module flavour note
  const flavour: Record<ImageModuleType, string> = {
    newsletter: 'Suitable for an email newsletter header or inline graphic.',
    pricing: 'Suitable for a SaaS pricing page or promotional material.',
    products: 'Suitable for an e-commerce product listing or catalog.',
    services: 'Suitable for a professional services landing page or brochure.',
  };
  parts.push(flavour[opts.moduleType]);

  return parts.join(' ');
}
