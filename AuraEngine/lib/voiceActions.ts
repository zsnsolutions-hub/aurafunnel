// ══════════════════════════════════════════════════════════════════════════════
// Portal Route Allowlist (authenticated users)
// ══════════════════════════════════════════════════════════════════════════════
export const VOICE_ROUTE_MAP: Record<string, string> = {
  dashboard: '/portal',
  leads: '/portal/leads',
  find_prospects: '/portal/leads/apollo',
  lead_insights: '/portal/intelligence',
  campaigns: '/portal/content',
  content_studio: '/portal/content-studio',
  automations: '/portal/automation',
  social: '/portal/social-scheduler',
  blog: '/portal/blog',
  reports: '/portal/analytics',
  ai_assistant: '/portal/ai',
  tasks: '/portal/strategy',
  board_view: '/portal/team-hub',
  integrations: '/portal/integrations',
  ai_settings: '/portal/model-training',
  subscription: '/portal/billing',
  invoices: '/portal/invoices',
  settings: '/portal/settings',
  settings_security: '/portal/settings?tab=security',
  settings_business: '/portal/settings?tab=business_profile',
  help: '/portal/help',
  manual: '/portal/manual',
};

export const VOICE_ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  find_prospects: 'Find Prospects',
  lead_insights: 'Lead Insights',
  campaigns: 'Campaigns',
  content_studio: 'Content Studio',
  automations: 'Automations',
  social: 'Social Scheduler',
  blog: 'Blog Posts',
  reports: 'Reports',
  ai_assistant: 'AI Assistant',
  tasks: 'Tasks',
  board_view: 'Board View',
  integrations: 'Integrations',
  ai_settings: 'AI Settings',
  subscription: 'Subscription',
  invoices: 'Billing History',
  settings: 'Settings',
  settings_security: 'Security Settings',
  settings_business: 'Business Profile',
  help: 'Help Center',
  manual: 'User Manual',
};

// ══════════════════════════════════════════════════════════════════════════════
// Marketing Route Allowlist (public visitors)
// ══════════════════════════════════════════════════════════════════════════════
export const MARKETING_ROUTE_MAP: Record<string, string> = {
  home: '/',
  features: '/features',
  pricing: '/pricing',
  blog: '/blog',
  about: '/about',
  contact: '/contact',
  signup: '/signup',
  login: '/auth',
};

export const MARKETING_ROUTE_LABELS: Record<string, string> = {
  home: 'Home',
  features: 'Features',
  pricing: 'Pricing',
  blog: 'Blog',
  about: 'About Us',
  contact: 'Contact',
  signup: 'Start Free Trial',
  login: 'Log In',
};

// ══════════════════════════════════════════════════════════════════════════════
// Landing Page Section Anchors (scroll targets on "/")
// ══════════════════════════════════════════════════════════════════════════════
export const SECTION_ANCHOR_MAP: Record<string, string> = {
  hero: 'hero',
  logos: 'logos',
  problem: 'problem',
  features_section: 'features',
  how_it_works: 'how-it-works',
  testimonials: 'testimonials',
  pricing_section: 'pricing',
  faq: 'faq',
  cta: 'cta',
};

export const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero',
  logos: 'Trusted By',
  problem: 'The Problem',
  features_section: 'Features',
  how_it_works: 'How It Works',
  testimonials: 'Testimonials',
  pricing_section: 'Pricing',
  faq: 'FAQ',
  cta: 'Get Started',
};

// ── Action Types ──
export type VoiceAction =
  | { type: 'NAVIGATE'; routeKey: string }
  | { type: 'SCROLL_TO_SECTION'; sectionKey: string }
  | { type: 'OPEN_COMMAND_PALETTE' }
  | { type: 'TOGGLE_SIMPLIFIED_MODE' }
  | { type: 'NONE' };

// ── Validation ──
export function isValidRouteKey(key: string): key is keyof typeof VOICE_ROUTE_MAP {
  return key in VOICE_ROUTE_MAP;
}

export function isValidMarketingRouteKey(key: string): key is keyof typeof MARKETING_ROUTE_MAP {
  return key in MARKETING_ROUTE_MAP;
}

export function isValidSectionKey(key: string): key is keyof typeof SECTION_ANCHOR_MAP {
  return key in SECTION_ANCHOR_MAP;
}

export function resolveRoute(routeKey: string): string | null {
  return VOICE_ROUTE_MAP[routeKey] ?? null;
}

export function resolveMarketingRoute(routeKey: string): string | null {
  return MARKETING_ROUTE_MAP[routeKey] ?? null;
}

export function resolveSectionAnchor(sectionKey: string): string | null {
  return SECTION_ANCHOR_MAP[sectionKey] ?? null;
}

// ── Debounce guard ──
let lastNavTime = 0;
const NAV_DEBOUNCE_MS = 500;

export function canNavigate(): boolean {
  const now = Date.now();
  if (now - lastNavTime < NAV_DEBOUNCE_MS) return false;
  lastNavTime = now;
  return true;
}
