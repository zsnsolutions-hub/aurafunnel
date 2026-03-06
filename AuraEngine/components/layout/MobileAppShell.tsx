import React, { useState, useCallback, Suspense, lazy } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Users, Sparkles, Activity, MoreHorizontal,
  Plus, PenSquare, UserPlus, Mail, Zap,
} from 'lucide-react';
import { User } from '../../types';
import { resolvePlanName, TIER_LIMITS } from '../../lib/credits';
import ErrorBoundary from '../ErrorBoundary';

interface MobileAppShellProps {
  user: User;
  onLogout: () => void;
  refreshProfile: () => Promise<void>;
}

interface TabItem {
  key: string;
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  path: string;
}

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: Home, path: '/portal/mobile' },
  { key: 'leads', label: 'Leads', icon: Users, path: '/portal/mobile/leads' },
  { key: 'campaigns', label: 'Campaigns', icon: Sparkles, path: '/portal/mobile/campaigns' },
  { key: 'activity', label: 'Activity', icon: Activity, path: '/portal/mobile/activity' },
  { key: 'more', label: 'More', icon: MoreHorizontal, path: '/portal/mobile/more' },
];

const TAB_LABELS: Record<string, string> = {
  home: 'Home',
  leads: 'Leads',
  campaigns: 'Campaigns',
  activity: 'Activity',
  more: 'More',
};

const FAB_ACTIONS = [
  { label: 'New Email', icon: Mail, action: '/portal/content' },
  { label: 'Add Lead', icon: UserPlus, action: '/portal/leads' },
  { label: 'Create Post', icon: PenSquare, action: '/portal/content-studio' },
];

const MobileAppShell: React.FC<MobileAppShellProps> = ({ user, onLogout, refreshProfile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [fabOpen, setFabOpen] = useState(false);

  // Resolve active tab — exact match first, then prefix
  const activeTab = TABS.find(t => location.pathname === t.path)?.key
    ?? TABS.find(t => t.path !== '/portal/mobile' && location.pathname.startsWith(t.path + '/'))?.key
    ?? 'home';

  // Whether we're on a sub-page (e.g. /portal/mobile/leads/123)
  const isSubPage = !TABS.some(t => location.pathname === t.path);

  const pageTitle = isSubPage ? 'Details' : TAB_LABELS[activeTab] || 'Scaliyo';

  // Credits
  const currentPlan = resolvePlanName(user.subscription?.plan_name || user.plan || 'Starter');
  const creditsTotal = user.credits_total || (TIER_LIMITS[currentPlan]?.credits ?? TIER_LIMITS.Starter.credits);
  const creditsUsed = user.credits_used || 0;
  const creditsLeft = creditsTotal - creditsUsed;

  const handleTabPress = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const handleFabAction = useCallback((action: string) => {
    setFabOpen(false);
    navigate(action);
  }, [navigate]);

  return (
    <div className="min-h-[100dvh] w-full bg-gray-50 flex flex-col">
      {/* ─── Sticky Header ─── */}
      <header
        className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 safe-area-top"
      >
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white font-black text-sm">S</span>
            </div>
            <span className="font-black text-sm text-gray-900 tracking-tight">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Credits pill */}
            <div className="flex items-center gap-1 px-2 py-1 bg-indigo-50 rounded-full">
              <Zap size={12} className="text-indigo-600" />
              <span className="text-[10px] font-bold text-indigo-600">{creditsLeft.toLocaleString()}</span>
            </div>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
              {user.name?.charAt(0) || 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center h-48">
              <div className="w-7 h-7 border-[3px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          }>
            <Outlet context={{ user, onLogout, refreshProfile }} />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* ─── FAB backdrop ─── */}
      {fabOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
          onClick={() => setFabOpen(false)}
        />
      )}

      {/* ─── FAB ─── */}
      <div
        className="fixed right-4 z-50"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        {fabOpen && (
          <div className="absolute bottom-14 right-0 flex flex-col gap-2 items-end animate-in fade-in slide-in-from-bottom-2 duration-150">
            {FAB_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => handleFabAction(a.action)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-2xl shadow-lg border border-gray-100 text-sm font-semibold text-gray-700 active:scale-95 transition-all whitespace-nowrap"
              >
                <a.icon size={16} className="text-indigo-600" />
                {a.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setFabOpen(prev => !prev)}
          className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${
            fabOpen
              ? 'bg-gray-800 rotate-45'
              : 'bg-indigo-600 shadow-indigo-200'
          }`}
          aria-label="Quick actions"
        >
          <Plus size={22} className="text-white" />
        </button>
      </div>

      {/* ─── Bottom Tab Bar ─── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 safe-area-bottom"
        style={{ height: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-around h-[72px] px-1">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabPress(tab.path)}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-full transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-gray-400'
                }`}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <tab.icon size={22} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                <span className={`text-[10px] font-bold leading-none ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="w-4 h-0.5 bg-indigo-600 rounded-full mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default MobileAppShell;
