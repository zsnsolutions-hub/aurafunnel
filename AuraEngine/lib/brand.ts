// ── Centralized brand configuration ──
// Single source of truth for app identity, logos, and brand constants.

declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

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

  // Build stamp — injected at build time by Vite
  buildSha: typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev',
  buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '',
} as const;
