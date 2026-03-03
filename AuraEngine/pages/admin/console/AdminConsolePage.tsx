import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Users, ScrollText, Settings, Database,
  ShieldCheck, Activity, BarChart3, Loader2,
} from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { supabase } from '../../../lib/supabase';

// Lazy-load tabs so only active tab is bundled in the critical path
const OverviewTab    = lazy(() => import('./OverviewTab'));
const UsersTab       = lazy(() => import('./UsersTab'));
const AuditTab       = lazy(() => import('./AuditTab'));
const ConfigTab      = lazy(() => import('./ConfigTab'));
const DataOpsTab     = lazy(() => import('./DataOpsTab'));
const SecurityTab    = lazy(() => import('./SecurityTab'));
const HealthTab      = lazy(() => import('./HealthTab'));
const ReportsTab     = lazy(() => import('./ReportsTab'));

type TabKey = 'overview' | 'users' | 'audit' | 'config' | 'dataops' | 'security' | 'health' | 'reports';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview',  label: 'Overview',         icon: <LayoutDashboard size={16} /> },
  { key: 'users',     label: 'Users & Access',   icon: <Users size={16} /> },
  { key: 'audit',     label: 'Audit & Activity', icon: <ScrollText size={16} /> },
  { key: 'config',    label: 'Configuration',    icon: <Settings size={16} /> },
  { key: 'dataops',   label: 'Data Ops',         icon: <Database size={16} /> },
  { key: 'security',  label: 'Security & Risk',  icon: <ShieldCheck size={16} /> },
  { key: 'health',    label: 'System Health',     icon: <Activity size={16} /> },
  { key: 'reports',   label: 'Reports',          icon: <BarChart3 size={16} /> },
];

const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 size={20} className="animate-spin text-gray-400" />
  </div>
);

const AdminConsolePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam && TABS.some(t => t.key === tabParam) ? tabParam : 'overview');
  const [adminId, setAdminId] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAdminId(data.session.user.id);
        supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', data.session.user.id)
          .maybeSingle()
          .then(({ data: p }) => {
            if (p?.is_super_admin) setIsSuperAdmin(true);
          });
      }
    });
  }, []);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Admin Console"
        description="Unified platform administration — users, audit, configuration, data operations, security, and system health."
      />

      {/* Tab navigation */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-0.5 min-w-max -mb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'overview'  && <OverviewTab adminId={adminId} />}
        {activeTab === 'users'     && <UsersTab adminId={adminId} isSuperAdmin={isSuperAdmin} />}
        {activeTab === 'audit'     && <AuditTab adminId={adminId} />}
        {activeTab === 'config'    && <ConfigTab adminId={adminId} />}
        {activeTab === 'dataops'   && <DataOpsTab adminId={adminId} />}
        {activeTab === 'security'  && <SecurityTab adminId={adminId} isSuperAdmin={isSuperAdmin} />}
        {activeTab === 'health'    && <HealthTab />}
        {activeTab === 'reports'   && <ReportsTab />}
      </Suspense>
    </div>
  );
};

export default AdminConsolePage;
