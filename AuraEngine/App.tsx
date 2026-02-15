import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { UserRole, User } from './types';
import { supabase } from './lib/supabase';

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
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
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
          <Route index element={<ClientDashboard user={user!} />} />
          <Route path="leads" element={<LeadManagement />} />
          <Route path="leads/:leadId" element={<LeadProfile />} />
          <Route path="content" element={<ContentGen />} />
          <Route path="strategy" element={<StrategyHub />} />
          <Route path="blog" element={<BlogDrafts />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="automation" element={<AutomationPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="help" element={<HelpCenterPage />} />
          <Route path="manual" element={<UserManualPage />} />
          <Route path="settings" element={<ProfilePage />} />
          <Route path="intelligence" element={<LeadIntelligence />} />
          <Route path="ai" element={<AICommandCenter />} />
          <Route path="content-studio" element={<ContentStudio />} />
          <Route path="mobile" element={<MobileDashboard />} />
          <Route path="model-training" element={<ModelTraining />} />
          <Route path="integrations" element={<IntegrationHub />} />
        </Route>

        <Route
          path="/admin"
          element={
            user?.role === UserRole.ADMIN ?
            <AdminLayout user={user!} onLogout={handleLogout} /> :
            <Navigate to="/auth" state={{ from: location }} />
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="ai" element={<AIOperations />} />
          <Route path="prompts" element={<PromptLab />} />
          <Route path="leads" element={<LeadsManagement />} />
          <Route path="blog" element={<BlogManager />} />
          <Route path="health" element={<SystemHealth />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="pricing" element={<PricingManagement />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
};

export default App;
