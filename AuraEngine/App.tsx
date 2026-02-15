import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { UserRole, User } from './types';
import { supabase } from './lib/supabase';
import ErrorBoundary from './components/ErrorBoundary';

// Layouts — kept eager since they wrap all child routes
import MarketingLayout from './components/layout/MarketingLayout';
import AdminLayout from './components/layout/AdminLayout';
import ClientLayout from './components/layout/ClientLayout';

// ─── Lazy-loaded pages ───

// Marketing
const LandingPage = lazy(() => import('./pages/marketing/LandingPage'));
const FeaturesPage = lazy(() => import('./pages/marketing/FeaturesPage'));
const PricingPage = lazy(() => import('./pages/marketing/PricingPage'));
const AboutPage = lazy(() => import('./pages/marketing/AboutPage'));
const ContactPage = lazy(() => import('./pages/marketing/ContactPage'));
const BlogPage = lazy(() => import('./pages/marketing/BlogPage'));

// Auth
const AuthPage = lazy(() => import('./pages/portal/AuthPage'));

// Client Portal
const ClientDashboard = lazy(() => import('./pages/portal/ClientDashboard'));
const LeadManagement = lazy(() => import('./pages/portal/LeadManagement'));
const LeadProfile = lazy(() => import('./pages/portal/LeadProfile'));
const ContentGen = lazy(() => import('./pages/portal/ContentGen'));
const StrategyHub = lazy(() => import('./pages/portal/StrategyHub'));
const BlogDrafts = lazy(() => import('./pages/portal/BlogDrafts'));
const AnalyticsPage = lazy(() => import('./pages/portal/AnalyticsPage'));
const AutomationPage = lazy(() => import('./pages/portal/AutomationPage'));
const BillingPage = lazy(() => import('./pages/portal/BillingPage'));
const HelpCenterPage = lazy(() => import('./pages/portal/HelpCenterPage'));
const UserManualPage = lazy(() => import('./pages/portal/UserManualPage'));
const ProfilePage = lazy(() => import('./pages/portal/ProfilePage'));
const LeadIntelligence = lazy(() => import('./pages/portal/LeadIntelligence'));
const AICommandCenter = lazy(() => import('./pages/portal/AICommandCenter'));
const ContentStudio = lazy(() => import('./pages/portal/ContentStudio'));
const MobileDashboard = lazy(() => import('./pages/portal/MobileDashboard'));
const ModelTraining = lazy(() => import('./pages/portal/ModelTraining'));
const IntegrationHub = lazy(() => import('./pages/portal/IntegrationHub'));

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const SystemHealth = lazy(() => import('./pages/admin/SystemHealth'));
const LeadsManagement = lazy(() => import('./pages/admin/LeadsManagement'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AIOperations = lazy(() => import('./pages/admin/AIOperations'));
const PromptLab = lazy(() => import('./pages/admin/PromptLab'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const BlogManager = lazy(() => import('./pages/admin/BlogManager'));
const PricingManagement = lazy(() => import('./pages/admin/PricingManagement'));

const PageFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const fetchProfile = useCallback(async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, subscription:subscriptions(*)')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setDbError("Database Schema Sync Required. Please visit Auth page for script.");
        return null;
      }

      if (data) {
        const subData = Array.isArray(data.subscription) ? data.subscription[0] : data.subscription;
        return {
          ...data,
          subscription: subData
        } as unknown as User;
      }
      return null;
    } catch (err) {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const profile = await fetchProfile(user.id);
      if (profile) setUser(profile);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const profile = await fetchProfile(session.user.id);
          if (profile) setUser(profile);
        }
      } finally {
        setLoading(false);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        const profile = await fetchProfile(session.user.id);
        if (profile) setUser(profile);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
            <Route path="/features" element={<ErrorBoundary><FeaturesPage /></ErrorBoundary>} />
            <Route path="/pricing" element={<ErrorBoundary><PricingPage /></ErrorBoundary>} />
            <Route path="/blog" element={<ErrorBoundary><BlogPage /></ErrorBoundary>} />
            <Route path="/about" element={<ErrorBoundary><AboutPage /></ErrorBoundary>} />
            <Route path="/contact" element={<ErrorBoundary><ContactPage /></ErrorBoundary>} />
          </Route>

          <Route path="/auth" element={<AuthPage user={user} onLogin={(u) => setUser(u)} />} />

          <Route
            path="/portal"
            element={
              user?.role === UserRole.CLIENT ?
              <ClientLayout user={user!} onLogout={handleLogout} refreshProfile={refreshProfile} /> :
              <Navigate to="/auth" state={{ from: location }} />
            }
          >
            <Route index element={<ErrorBoundary><ClientDashboard user={user!} /></ErrorBoundary>} />
            <Route path="leads" element={<ErrorBoundary><LeadManagement /></ErrorBoundary>} />
            <Route path="leads/:leadId" element={<ErrorBoundary><LeadProfile /></ErrorBoundary>} />
            <Route path="content" element={<ErrorBoundary><ContentGen /></ErrorBoundary>} />
            <Route path="strategy" element={<ErrorBoundary><StrategyHub /></ErrorBoundary>} />
            <Route path="blog" element={<ErrorBoundary><BlogDrafts /></ErrorBoundary>} />
            <Route path="analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
            <Route path="automation" element={<ErrorBoundary><AutomationPage /></ErrorBoundary>} />
            <Route path="billing" element={<ErrorBoundary><BillingPage /></ErrorBoundary>} />
            <Route path="help" element={<ErrorBoundary><HelpCenterPage /></ErrorBoundary>} />
            <Route path="manual" element={<ErrorBoundary><UserManualPage /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
            <Route path="intelligence" element={<ErrorBoundary><LeadIntelligence /></ErrorBoundary>} />
            <Route path="ai" element={<ErrorBoundary><AICommandCenter /></ErrorBoundary>} />
            <Route path="content-studio" element={<ErrorBoundary><ContentStudio /></ErrorBoundary>} />
            <Route path="mobile" element={<ErrorBoundary><MobileDashboard /></ErrorBoundary>} />
            <Route path="model-training" element={<ErrorBoundary><ModelTraining /></ErrorBoundary>} />
            <Route path="integrations" element={<ErrorBoundary><IntegrationHub /></ErrorBoundary>} />
          </Route>

          <Route
            path="/admin"
            element={
              user?.role === UserRole.ADMIN ?
              <AdminLayout user={user!} onLogout={handleLogout} /> :
              <Navigate to="/auth" state={{ from: location }} />
            }
          >
            <Route index element={<ErrorBoundary><AdminDashboard /></ErrorBoundary>} />
            <Route path="users" element={<ErrorBoundary><UserManagement /></ErrorBoundary>} />
            <Route path="ai" element={<ErrorBoundary><AIOperations /></ErrorBoundary>} />
            <Route path="prompts" element={<ErrorBoundary><PromptLab /></ErrorBoundary>} />
            <Route path="leads" element={<ErrorBoundary><LeadsManagement /></ErrorBoundary>} />
            <Route path="blog" element={<ErrorBoundary><BlogManager /></ErrorBoundary>} />
            <Route path="health" element={<ErrorBoundary><SystemHealth /></ErrorBoundary>} />
            <Route path="audit" element={<ErrorBoundary><AuditLogs /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><AdminSettings /></ErrorBoundary>} />
            <Route path="pricing" element={<ErrorBoundary><PricingManagement /></ErrorBoundary>} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
