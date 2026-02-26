/**
 * Central map of route paths to their dynamic import() calls.
 * Mirrors the lazy() declarations in App.tsx so the browser can
 * fetch & cache chunks before navigation actually happens.
 */

const routeImportMap: Record<string, () => Promise<unknown>> = {
  // Marketing
  '/':            () => import('../pages/marketing/LandingPage'),
  '/features':    () => import('../pages/marketing/FeaturesPage'),
  '/pricing':     () => import('../pages/marketing/PricingPage'),
  '/about':       () => import('../pages/marketing/AboutPage'),
  '/contact':     () => import('../pages/marketing/ContactPage'),
  '/blog':        () => import('../pages/marketing/BlogPage'),
  '/signup':      () => import('../pages/marketing/TrialSignupPage'),

  // Auth
  '/auth':           () => import('../pages/portal/AuthPage'),
  '/reset-password': () => import('../pages/portal/ResetPasswordPage'),
  '/auth/confirm':   () => import('../pages/portal/ConfirmEmailPage'),

  // Onboarding
  '/onboarding': () => import('../pages/portal/OnboardingPage'),

  // Client Portal
  '/portal':                () => import('../pages/portal/ClientDashboard'),
  '/portal/leads':          () => import('../pages/portal/LeadManagement'),
  '/portal/leads/apollo':   () => import('../pages/portal/ApolloSearchPage'),
  '/portal/content':        () => import('../pages/portal/ContentGen'),
  '/portal/strategy':       () => import('../pages/portal/TeamHub'),
  '/portal/blog':           () => import('../pages/portal/BlogDrafts'),
  '/portal/analytics':      () => import('../pages/portal/AnalyticsPage'),
  '/portal/automation':     () => import('../pages/portal/AutomationPage'),
  '/portal/billing':        () => import('../pages/portal/BillingPage'),
  '/portal/help':           () => import('../pages/portal/HelpCenterPage'),
  '/portal/manual':         () => import('../pages/portal/UserManualPage'),
  '/portal/settings':       () => import('../pages/portal/ProfilePage'),
  '/portal/intelligence':   () => import('../pages/portal/LeadIntelligence'),
  '/portal/ai':             () => import('../pages/portal/AICommandCenter'),
  '/portal/content-studio': () => import('../pages/portal/ContentStudio'),
  '/portal/mobile':         () => import('../pages/portal/MobileDashboard'),
  '/portal/model-training': () => import('../pages/portal/ModelTraining'),
  '/portal/integrations':   () => import('../pages/portal/IntegrationHub'),
  '/portal/invoices':       () => import('../pages/portal/InvoicesPage'),
  '/portal/social-scheduler': () => import('../pages/portal/SocialScheduler'),
  '/portal/team-hub':       () => import('../pages/portal/team-hub/TeamHubPage'),

  // Admin
  '/admin':          () => import('../pages/admin/AdminDashboard'),
  '/admin/users':    () => import('../pages/admin/UserManagement'),
  '/admin/ai':       () => import('../pages/admin/AIOperations'),
  '/admin/prompts':  () => import('../pages/admin/PromptLab'),
  '/admin/leads':    () => import('../pages/admin/LeadsManagement'),
  '/admin/blog':     () => import('../pages/admin/BlogManager'),
  '/admin/health':   () => import('../pages/admin/SystemHealth'),
  '/admin/audit':    () => import('../pages/admin/AuditLogs'),
  '/admin/settings': () => import('../pages/admin/AdminSettings'),
  '/admin/pricing':  () => import('../pages/admin/PricingManagement'),
};

const prefetched = new Set<string>();

export function prefetchRoute(path: string): void {
  if (prefetched.has(path)) return;
  const loader = routeImportMap[path];
  if (loader) {
    prefetched.add(path);
    loader();
  }
}

export function prefetchRoutes(paths: string[]): void {
  paths.forEach(prefetchRoute);
}
