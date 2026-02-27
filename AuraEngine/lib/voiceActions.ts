// ── Route Allowlist ──
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

// ── Human-readable labels for each route key ──
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

// ── Action Types ──
export type VoiceAction =
  | { type: 'NAVIGATE'; routeKey: string }
  | { type: 'OPEN_COMMAND_PALETTE' }
  | { type: 'TOGGLE_SIMPLIFIED_MODE' }
  | { type: 'NONE' };

// ── Validation ──
export function isValidRouteKey(key: string): key is keyof typeof VOICE_ROUTE_MAP {
  return key in VOICE_ROUTE_MAP;
}

export function resolveRoute(routeKey: string): string | null {
  return VOICE_ROUTE_MAP[routeKey] ?? null;
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
