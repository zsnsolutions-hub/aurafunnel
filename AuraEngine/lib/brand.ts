// ── Centralized brand configuration ──
// Single source of truth for app identity, logos, and brand constants.

export const BRAND = {
  name: 'Scaliyo',
  tagline: 'AI-Powered B2B Growth Intelligence',
  url: 'https://scaliyo.com',

  // Logo assets (relative to /public)
  logo: {
    light: '/scaliyo-logo-light.webp',   // For light/white backgrounds
    dark: '/scaliyo-logo-dark.webp',      // For dark backgrounds
    fallback: '/scaliyo-logo.webp',       // Generic/default
  },

  favicon: '/favicon.png',

  // Dimensions for consistent rendering
  logoSize: { width: 106, height: 40 },
  logoCollapsedSize: { width: 32, height: 32 },

  version: 'v10.0.0',
} as const;
