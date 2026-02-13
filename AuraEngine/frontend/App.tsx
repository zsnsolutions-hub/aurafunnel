import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { UserRole, User } from './types';
import { supabase } from './lib/supabase';

// Layouts
import MarketingLayout from './components/layout/MarketingLayout';
import AdminLayout from './components/layout/AdminLayout';
import ClientLayout from './components/layout/ClientLayout';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import SystemHealth from './pages/admin/SystemHealth';
import LeadsManagement from './pages/admin/LeadsManagement';
import AdminSettings from './pages/admin/AdminSettings';
import AIOperations from './pages/admin/AIOperations';
import PromptLab from './pages/admin/PromptLab';
import AuditLogs from './pages/admin/AuditLogs';

// Client Pages
import ClientDashboard from './pages/portal/ClientDashboard';
import ContentGen from './pages/portal/ContentGen';
import BillingPage from './pages/portal/BillingPage';
import ProfilePage from './pages/portal/ProfilePage';
import AuthPage from './pages/portal/AuthPage';
import StrategyHub from './pages/portal/StrategyHub';

// Marketing
import LandingPage from './pages/marketing/LandingPage';
import FeaturesPage from './pages/marketing/FeaturesPage';
import PricingPage from './pages/marketing/PricingPage';
import AboutPage from './pages/marketing/AboutPage';
import ContactPage from './pages/marketing/ContactPage';
import BlogPage from './pages/marketing/BlogPage';

import { SparklesIcon } from './components/Icons';

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
        return {
          ...data,
          subscription: Array.isArray(data.subscription) ? data.subscription[0] : data.subscription
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
          <Navigate to="/auth" />
        }
      >
        <Route index element={<ClientDashboard user={user!} />} />
        <Route path="content" element={<ContentGen />} />
        <Route path="strategy" element={<StrategyHub />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<ProfilePage />} />
      </Route>

      <Route 
        path="/admin" 
        element={
          user?.role === UserRole.ADMIN ? 
          <AdminLayout user={user!} onLogout={handleLogout} /> : 
          <Navigate to="/auth" />
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="ai" element={<AIOperations />} />
        <Route path="prompts" element={<PromptLab />} />
        <Route path="leads" element={<LeadsManagement />} />
        <Route path="health" element={<SystemHealth />} />
        <Route path="audit" element={<AuditLogs />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;