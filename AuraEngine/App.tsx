import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { UserRole, User } from './types';
import ErrorBoundary from './components/ErrorBoundary';
import { BackgroundTasksProvider } from './components/background/BackgroundTasks';
import { GuideProvider } from './components/guide/GuideProvider';
import { SupportProvider } from './components/support/SupportProvider';
import { SupportBanner } from './components/support/SupportBanner';
import { UIModeProvider } from './components/ui-mode';
import { useIdlePrefetch } from './hooks/useIdlePrefetch';
import { useAuthMachine } from './hooks/useAuthMachine';
import { AuthGate } from './components/auth/AuthGate';
import { useIsMobile } from './hooks/useIsMobile';
import { canEnterAdmin, canEnterSupport } from './lib/permissions';
import { loadBranding, loadBrandingByHost, applyBrandingToDocument } from './lib/branding';

// Reload-safe lazy(): a dynamic import can fail with a ChunkLoadError when a new
// deploy has rotated out (last-5-releases) the hashed chunk that this older,
// still-open bundle references. The ErrorBoundary would otherwise catch the
// rejection and show a permanent crash screen. Instead: retry once for a
// transient network hiccup, then force a single full reload to pull a fresh
// index.html + current chunk names. Guarded by the same sessionStorage key
// index.html uses, so it can never loop.
function lazyWithRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  const isChunkError = (msg: string) =>
    /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(msg);
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      try { return await factory(); } catch (err2) {
        const msg = (err2 as Error)?.message || (err as Error)?.message || '';
        if (isChunkError(msg) && !sessionStorage.getItem('__chunkReload')) {
          sessionStorage.setItem('__chunkReload', '1');
          window.location.reload();
          return await new Promise<{ default: T }>(() => {}); // hold render until reload
        }
        throw err2;
      }
    }
  });
}

// Dev perf panel — lazy-loaded, tree-shaken in production
const PerfPanel = lazyWithRetry(() => import('./components/dev/PerfPanel'));

// Layouts — direct imports so the app shell never suspends
import MarketingLayout from './components/layout/MarketingLayout';
import AdminLayout from './components/layout/AdminLayout';
import ClientLayout from './components/layout/ClientLayout';

// ─── Lazy-loaded pages ───

// Marketing
const LandingPage = lazyWithRetry(() => import('./pages/marketing/LandingPage'));
const FeaturesPage = lazyWithRetry(() => import('./pages/marketing/FeaturesPage'));
const PricingPage = lazyWithRetry(() => import('./pages/marketing/PricingPage'));
const AboutPage = lazyWithRetry(() => import('./pages/marketing/AboutPage'));
const ContactPage = lazyWithRetry(() => import('./pages/marketing/ContactPage'));
const BlogPage = lazyWithRetry(() => import('./pages/marketing/BlogPage'));
const BlogPostPage = lazyWithRetry(() => import('./pages/marketing/BlogPostPage'));
const TrialSignupPage = lazyWithRetry(() => import('./pages/marketing/TrialSignupPage'));

// Auth
const AuthPage = lazyWithRetry(() => import('./pages/portal/AuthPage'));
const VoiceAgentLauncher = lazyWithRetry(() => import('./components/voice/VoiceAgentLauncher'));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/portal/ResetPasswordPage'));
const ConfirmEmailPage = lazyWithRetry(() => import('./pages/portal/ConfirmEmailPage'));

// Onboarding
const OnboardingPage = lazyWithRetry(() => import('./pages/portal/OnboardingPage'));

// Client Portal
const ClientDashboard = lazyWithRetry(() => import('./pages/portal/ClientDashboard'));
const MissionControl = lazyWithRetry(() => import('./pages/portal/MissionControl'));
const LeadManagement = lazyWithRetry(() => import('./pages/portal/LeadManagement'));
const LeadProfile = lazyWithRetry(() => import('./pages/portal/LeadProfile'));
const BusinessesPage = lazyWithRetry(() => import('./pages/portal/BusinessesPage'));
const BusinessSettingsPage = lazyWithRetry(() => import('./pages/portal/BusinessSettingsPage'));
const ImageStudio = lazyWithRetry(() => import('./pages/portal/ImageStudio'));
const ContentGen = lazyWithRetry(() => import('./pages/portal/ContentGen'));
const BlogDrafts = lazyWithRetry(() => import('./pages/portal/BlogDrafts'));
const AnalyticsPage = lazyWithRetry(() => import('./pages/portal/AnalyticsPage'));
const AutomationPage = lazyWithRetry(() => import('./pages/portal/AutomationPage'));
const BillingPage = lazyWithRetry(() => import('./pages/portal/BillingPage'));
const HelpCenterPage = lazyWithRetry(() => import('./pages/portal/HelpCenterPage'));
const UserManualPage = lazyWithRetry(() => import('./pages/portal/UserManualPage'));
const ProfilePage = lazyWithRetry(() => import('./pages/portal/ProfilePage'));
const LeadIntelligence = lazyWithRetry(() => import('./pages/portal/LeadIntelligence'));
const AICommandCenter = lazyWithRetry(() => import('./pages/portal/AICommandCenter'));
const ContentStudio = lazyWithRetry(() => import('./pages/portal/ContentStudio'));
// Mobile portal
import MobileAppShell from './components/layout/MobileAppShell';
const MobileHome = lazyWithRetry(() => import('./pages/portal/mobile/MobileHome'));
const MobileLeads = lazyWithRetry(() => import('./pages/portal/mobile/MobileLeads'));
const MobileLeadDetail = lazyWithRetry(() => import('./pages/portal/mobile/MobileLeadDetail'));
const MobileCampaigns = lazyWithRetry(() => import('./pages/portal/mobile/MobileCampaigns'));
const MobileActivity = lazyWithRetry(() => import('./pages/portal/mobile/MobileActivity'));
const MobileMore = lazyWithRetry(() => import('./pages/portal/mobile/MobileMore'));
const MobileGoals = lazyWithRetry(() => import('./pages/portal/mobile/MobileGoals'));
const ModelTraining = lazyWithRetry(() => import('./pages/portal/ModelTraining'));
const IntegrationHub = lazyWithRetry(() => import('./pages/portal/IntegrationHub'));
const InvoicesPage = lazyWithRetry(() => import('./pages/portal/InvoicesPage'));
const SocialScheduler = lazyWithRetry(() => import('./pages/portal/SocialScheduler'));
const TeamHubBoards = lazyWithRetry(() => import('./pages/portal/team-hub/TeamHubPage'));
const SenderAccountsPage = lazyWithRetry(() => import('./pages/portal/SenderAccountsPage'));
const ApiKeysPage = lazyWithRetry(() => import('./pages/portal/ApiKeysPage'));
const ApiDocsPage = lazyWithRetry(() => import('./pages/portal/ApiDocsPage'));
const GoalsPage = lazyWithRetry(() => import('./pages/portal/GoalsPage'));
const QuickLaunchPage = lazyWithRetry(() => import('./pages/portal/QuickLaunchPage'));
const WebhooksPage = lazyWithRetry(() => import('./pages/portal/WebhooksPage'));
const BrandingPage = lazyWithRetry(() => import('./pages/portal/BrandingPage'));

// Admin
// Legacy AdminDashboard + SystemHealth removed (Phase 0): they rendered fabricated
// health/analytics. /admin and /admin/health now redirect to the real Admin Console.
const SupportConsole = lazyWithRetry(() => import('./pages/support/SupportConsole'));
const UserManagement = lazyWithRetry(() => import('./pages/admin/UserManagement'));
const LeadsManagement = lazyWithRetry(() => import('./pages/admin/LeadsManagement'));
const AdminSettings = lazyWithRetry(() => import('./pages/admin/AdminSettings'));
const AIOperations = lazyWithRetry(() => import('./pages/admin/AIOperations'));
const DnaRegistryPage = lazyWithRetry(() => import('./pages/admin/prompt-lab/DnaRegistryPage'));
const DnaEditorPage = lazyWithRetry(() => import('./pages/admin/prompt-lab/DnaEditorPage'));
const AuditLogs = lazyWithRetry(() => import('./pages/admin/AuditLogs'));
const BlogManager = lazyWithRetry(() => import('./pages/admin/BlogManager'));
const PricingManagement = lazyWithRetry(() => import('./pages/admin/PricingManagement'));
const AdminOpsCenter = lazyWithRetry(() => import('./pages/admin/AdminOpsCenter'));
const AdminCommandCenter = lazyWithRetry(() => import('./pages/admin/CommandCenter/AdminCommandCenterPage'));
const AdminConsolePage = lazyWithRetry(() => import('./pages/admin/console/AdminConsolePage'));

// ─── Route guard components ───
// These isolate useLocation / useIsMobile so App never re-renders on navigation.

/** Redirects to /auth with the current location in state. Only mounts for unauthenticated users. */
function AuthRedirect() {
  const location = useLocation();
  return <Navigate to="/auth" state={{ from: location }} />;
}

/** Portal entry guard — checks onboarding + mobile + pending plan selection, then renders ClientLayout. */
function PortalGuard({ user, onLogout, refreshProfile }: { user: User; onLogout: () => void; refreshProfile: () => Promise<void> }) {
  const isMobile = useIsMobile();
  const location = useLocation();

  if (!user.businessProfile?.companyName && !localStorage.getItem('scaliyo_onboarding_complete')) {
    return <Navigate to="/onboarding" replace />;
  }

  // If user selected a plan from pricing page, redirect to billing with that plan
  const storedPlan = localStorage.getItem('scaliyo_selected_plan');
  if (storedPlan && !location.pathname.includes('/billing')) {
    // Don't remove yet — BillingPage will clear it after opening checkout
    return <Navigate to={`/portal/billing?plan=${storedPlan}`} replace />;
  }

  // Mobile users get redirected to the mobile shell from the bare /portal
  // entry point only. If they navigate to a specific desktop sub-route
  // (e.g. clicking "Billing" from /portal/mobile/more), they see the
  // desktop layout — cramped but functional — instead of being trapped
  // in the 6-page mobile portal.
  if (isMobile && location.pathname === '/portal') {
    return <Navigate to="/portal/mobile" replace />;
  }
  return <ClientLayout user={user} onLogout={onLogout} refreshProfile={refreshProfile} />;
}

/** Mobile portal entry guard — checks onboarding, then renders MobileAppShell. */
function MobilePortalGuard({ user, onLogout, refreshProfile }: { user: User; onLogout: () => void; refreshProfile: () => Promise<void> }) {
  if (!user.businessProfile?.companyName && !localStorage.getItem('scaliyo_onboarding_complete')) {
    return <Navigate to="/onboarding" replace />;
  }
  return <MobileAppShell user={user} onLogout={onLogout} refreshProfile={refreshProfile} />;
}

/** Runs idle prefetching in isolation — its useLocation() doesn't cause App to re-render. */
function IdlePrefetcher() {
  useIdlePrefetch();
  return null;
}

const PageFallback = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 150);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="animate-fadeIn px-6 py-10 max-w-4xl mx-auto space-y-6">
      <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
        <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { state, retry, logout, setUser, refreshProfile } = useAuthMachine();
  const { user } = state;
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const qc = useQueryClient();

  // Phase 4.6.b — pre-login branding from Host header. Runs ONCE at mount.
  // If the SPA is being served from a verified vanity domain, fetch and
  // apply that workspace's branding immediately so the auth page renders
  // branded before any user logs in. Platform hosts return null and leave
  // defaults in place. The user-keyed effect below overrides once auth
  // resolves (workspace branding for the logged-in user wins post-login).
  useEffect(() => {
    let cancelled = false;
    loadBrandingByHost(window.location.hostname).then((b) => {
      if (!cancelled && b) applyBrandingToDocument(b);
    }).catch(() => { /* keep platform defaults */ });
    return () => { cancelled = true; };
  }, []);

  // Phase 4.6.a — apply per-workspace branding once we have a user.
  // Best-effort; failure leaves whatever the host-based effect put down.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    loadBranding(user.id).then((b) => {
      if (!cancelled && b) applyBrandingToDocument(b);
    }).catch(() => { /* keep current branding */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  // ErrorBoundary reset: invalidate caches + re-bootstrap auth
  const handleErrorReset = useCallback(() => {
    retry();
  }, [retry]);

  const handleLogout = useCallback(() => {
    setShowLogoutModal(true);
  }, []);

  const confirmLogout = useCallback(async () => {
    setShowLogoutModal(false);
    await logout();
  }, [logout]);

  return (
    <AuthGate phase={state.phase} error={state.error} onRetry={retry}>
    <UIModeProvider userId={user?.id}>
    <SupportProvider user={user}>
    <BackgroundTasksProvider>
    <ErrorBoundary queryClient={qc} onReset={handleErrorReset}>
      <GuideProvider>
      <SupportBanner />
      <IdlePrefetcher />
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLogoutModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Sign Out?</h3>
                <p className="text-sm text-slate-500 mt-1">Are you sure you want to sign out of your account?</p>
              </div>
              <div className="flex items-center gap-3 w-full pt-2">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 px-5 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 px-5 py-3 rounded-2xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-100"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        <Routes>
          {/* Marketing — has its own full-page Suspense since there's no persistent shell */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Suspense fallback={<PageFallback />}><LandingPage /></Suspense>} />
            <Route path="/features" element={<Suspense fallback={<PageFallback />}><FeaturesPage /></Suspense>} />
            <Route path="/pricing" element={<Suspense fallback={<PageFallback />}><PricingPage /></Suspense>} />
            <Route path="/blog" element={<Suspense fallback={<PageFallback />}><BlogPage /></Suspense>} />
            <Route path="/blog/:slug" element={<Suspense fallback={<PageFallback />}><BlogPostPage /></Suspense>} />
            <Route path="/about" element={<Suspense fallback={<PageFallback />}><AboutPage /></Suspense>} />
            <Route path="/contact" element={<Suspense fallback={<PageFallback />}><ContactPage /></Suspense>} />
          </Route>

          <Route path="/signup" element={<Suspense fallback={<PageFallback />}><TrialSignupPage /></Suspense>} />
          <Route path="/auth" element={<Suspense fallback={null}><AuthPage user={user} onLogin={(u) => setUser(u)} /><VoiceAgentLauncher agentId={import.meta.env.VITE_ELEVENLABS_AUTH_AGENT_ID} /></Suspense>} />
          <Route path="/reset-password" element={<Suspense fallback={<PageFallback />}><ResetPasswordPage /></Suspense>} />
          <Route path="/auth/confirm" element={<Suspense fallback={<PageFallback />}><ConfirmEmailPage /></Suspense>} />

          <Route
            path="/onboarding"
            element={
              user?.role === UserRole.CLIENT ?
              <Suspense fallback={<PageFallback />}><OnboardingPage user={user!} refreshProfile={refreshProfile} /></Suspense> :
              <AuthRedirect />
            }
          />

          {/* Mobile portal — layout has ErrorBoundary + Suspense around Outlet */}
          <Route
            path="/portal/mobile"
            element={
              user?.role === UserRole.CLIENT ?
              <MobilePortalGuard user={user!} onLogout={handleLogout} refreshProfile={refreshProfile} /> :
              <AuthRedirect />
            }
          >
            <Route index element={<MobileHome />} />
            <Route path="leads" element={<MobileLeads />} />
            <Route path="leads/:leadId" element={<MobileLeadDetail />} />
            <Route path="campaigns" element={<MobileCampaigns />} />
            <Route path="activity" element={<MobileActivity />} />
            <Route path="goals" element={<MobileGoals />} />
            <Route path="more" element={<MobileMore />} />
          </Route>

          {/* Desktop portal — layout has ErrorBoundary + Suspense around Outlet */}
          <Route
            path="/portal"
            element={
              user?.role === UserRole.CLIENT ?
              <PortalGuard user={user!} onLogout={handleLogout} refreshProfile={refreshProfile} /> :
              <AuthRedirect />
            }
          >
            <Route index element={<MissionControl />} />
            <Route path="dashboard" element={<ClientDashboard user={user!} />} />
            {/* Legacy alias — old links to /portal/mission still resolve. */}
            <Route path="mission" element={<Navigate to="/portal" replace />} />
            <Route path="leads" element={<LeadManagement />} />
            {/* Legacy alias — Apollo search was retired; route any deep link back to leads. */}
            <Route path="leads/apollo" element={<Navigate to="/portal/leads" replace />} />
            <Route path="leads/:leadId" element={<LeadProfile />} />
            <Route path="content" element={<ContentGen />} />
            <Route path="strategy" element={<Navigate to="/portal/team-hub" replace />} />
            <Route path="blog" element={<BlogDrafts />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="help" element={<HelpCenterPage />} />
            <Route path="manual" element={<UserManualPage />} />
            <Route path="settings" element={<ProfilePage />} />
            <Route path="businesses" element={<BusinessesPage />} />
            <Route path="business-settings" element={<BusinessSettingsPage />} />
            <Route path="image-studio" element={<ImageStudio />} />
            <Route path="intelligence" element={<LeadIntelligence />} />
            <Route path="ai" element={<AICommandCenter />} />
            <Route path="content-studio" element={<ContentStudio />} />
            <Route path="model-training" element={<ModelTraining />} />
            <Route path="integrations" element={<IntegrationHub />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="social-scheduler" element={<SocialScheduler />} />
            <Route path="team-hub" element={<TeamHubBoards />} />
            <Route path="sender-accounts" element={<SenderAccountsPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="api-docs" element={<ApiDocsPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="quick-launch" element={<QuickLaunchPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="branding" element={<BrandingPage />} />
          </Route>

          {/* Admin — layout has ErrorBoundary + Suspense around Outlet */}
          <Route
            path="/admin"
            element={
              canEnterAdmin(user) ?
              <AdminLayout user={user!} onLogout={handleLogout} /> :
              <AuthRedirect />
            }
          >
            <Route index element={<Navigate to="/admin/console" replace />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="ai" element={<AIOperations />} />
            <Route path="prompts" element={<DnaRegistryPage />} />
            <Route path="prompts/:id" element={<DnaEditorPage />} />
            <Route path="leads" element={<LeadsManagement />} />
            <Route path="blog" element={<BlogManager />} />
            <Route path="health" element={<Navigate to="/admin/console?tab=health" replace />} />
            <Route path="audit" element={<AuditLogs />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="pricing" element={<PricingManagement />} />
            <Route path="console" element={<AdminConsolePage />} />
            <Route path="ops" element={<AdminOpsCenter />} />
            <Route path="command" element={<AdminCommandCenter />} />
            {canEnterSupport(user) && (
              <Route path="support" element={<SupportConsole />} />
            )}
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    </GuideProvider>
    </ErrorBoundary>
    </BackgroundTasksProvider>
    {import.meta.env.DEV && (
      <Suspense fallback={null}><PerfPanel /></Suspense>
    )}
    </SupportProvider>
    </UIModeProvider>
    </AuthGate>
  );
};

export default App;
