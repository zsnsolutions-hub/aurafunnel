import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Target, Users, Brain, MessageSquare, Sparkles, PenSquare, Zap,
  PieChart, GitBranch, SlidersHorizontal, Plug, CreditCard,
  HelpCircle, BookOpen, Settings, LogOut, Search, Bell, Compass, FileText, Send, LayoutGrid
} from 'lucide-react';
import { User } from '../../types';
import CommandPalette from '../dashboard/CommandPalette';
import DailyBriefing from '../dashboard/DailyBriefing';
import { GuideMenuButton } from '../guide/GuideProvider';
import { AppShell } from './AppShell';
import { Sidebar } from './Sidebar';
import GlobalInviteBanner from './GlobalInviteBanner';
import { useIntegrations } from '../../lib/integrations';
import { TIER_LIMITS } from '../../lib/credits';

interface ClientLayoutProps {
  user: User;
  onLogout: () => void;
  refreshProfile: () => Promise<void>;
}

const ClientLayout: React.FC<ClientLayoutProps> = ({ user, onLogout, refreshProfile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { integrations: integrationStatuses } = useIntegrations();
  const activeIntegrationCount = integrationStatuses.filter(i => i.status === 'connected').length;

  const navItems = [
    { label: 'Dashboard', path: '/portal', icon: <Target size={20} /> },
    { label: 'Lead Management', path: '/portal/leads', icon: <Users size={20} />, children: [
      { label: 'People Search', path: '/portal/leads/apollo', icon: <Compass size={20} /> },
      { label: 'Lead Intelligence', path: '/portal/intelligence', icon: <Brain size={20} /> },
    ]},
    { label: 'AI Command Center', path: '/portal/ai', icon: <MessageSquare size={20} />, children: [
      { label: 'AI Prompt Studio', path: '/portal/model-training', icon: <SlidersHorizontal size={20} /> },
    ]},
    { label: 'Neural Studio', path: '/portal/content', icon: <Sparkles size={20} />, children: [
      { label: 'Content Studio', path: '/portal/content-studio', icon: <PenSquare size={20} /> },
      { label: 'Automation Engine', path: '/portal/automation', icon: <GitBranch size={20} /> },
    ]},
    { label: 'Team Hub', path: '/portal/strategy', icon: <Zap size={20} />, children: [
      { label: 'Team Boards', path: '/portal/team-hub', icon: <LayoutGrid size={20} /> },
    ]},
    { label: 'Social Scheduler', path: '/portal/social-scheduler', icon: <Send size={20} />, children: [
      { label: 'Guest Posts', path: '/portal/blog', icon: <PenSquare size={20} /> },
    ]},
    { label: 'Analytics Hub', path: '/portal/analytics', icon: <PieChart size={20} /> },
    { label: 'Integration Hub', path: '/portal/integrations', icon: <Plug size={20} />, badge: activeIntegrationCount > 0 ? `${activeIntegrationCount} active` : undefined },
    { label: 'Invoices', path: '/portal/invoices', icon: <FileText size={20} /> },
    { label: 'Billing & Tiers', path: '/portal/billing', icon: <CreditCard size={20} /> },
    { label: 'Settings', path: '/portal/settings', icon: <Settings size={20} />, children: [
      { label: 'User Manual', path: '/portal/manual', icon: <BookOpen size={20} /> },
      { label: 'Help Center', path: '/portal/help', icon: <HelpCircle size={20} /> },
    ]},
  ];

  const currentPlan = user.subscription?.plan_name || user.plan || 'Starter';
  const creditsTotal = user.credits_total || (TIER_LIMITS[currentPlan]?.credits ?? TIER_LIMITS.Starter.credits);
  const creditsUsed = user.credits_used || 0;
  const usagePercentage = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);


  // ─── Global keyboard shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Ctrl+K / Cmd+K → Command Palette (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        return;
      }

      // / → Search (open command palette) - only when not in input
      if (e.key === '/' && !isInput && !commandPaletteOpen) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // ? → Help
      if (e.key === '?' && !isInput && !commandPaletteOpen) {
        e.preventDefault();
        navigate('/portal/help');
        return;
      }

      // Escape → close overlays
      if (e.key === 'Escape') {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
                return;
      }

      // Skip G-shortcuts if in input or overlay is open
      if (isInput || commandPaletteOpen) return;

      // G then <key> navigation shortcuts
      if (e.key === 'g' || e.key === 'G') {
        if (!gPressedRef.current) {
          gPressedRef.current = true;
          if (gTimerRef.current) clearTimeout(gTimerRef.current);
          gTimerRef.current = setTimeout(() => { gPressedRef.current = false; }, 800);
          return;
        }
      }

      if (gPressedRef.current) {
        gPressedRef.current = false;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        const key = e.key.toLowerCase();
        const shortcuts: Record<string, string> = {
          d: '/portal',
          l: '/portal/leads',
          i: '/portal/intelligence',
          a: '/portal/ai',
          c: '/portal/content-studio',
          s: '/portal/strategy',
          n: '/portal/analytics',
          t: '/portal/model-training',
          h: '/portal/integrations',
          b: '/portal/billing',
        };
        if (shortcuts[key]) {
          e.preventDefault();
          navigate(shortcuts[key]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
    };
  }, [navigate, commandPaletteOpen]);

  return (
    <>
      <AppShell
        sidebarCollapsed={sidebarCollapsed}
        sidebar={
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(prev => !prev)}
            navItems={navItems}
            activePath={location.pathname}
            header={
              <Link to="/" className="flex items-center">
                <img src="/scaliyo-logo-light.png" alt="Scaliyo" className="h-8 w-auto" />
              </Link>
            }
            headerCollapsed={
              <Link to="/">
                <img src="/scaliyo-logo-light.png" alt="Scaliyo" className="h-8 w-auto" />
              </Link>
            }
            topSlot={
              <div className="flex items-center gap-2">
                <GuideMenuButton />
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 ease-out"
                  aria-label="Search"
                  title="Search (⌘K)"
                >
                  <Search size={16} />
                </button>
                <button
                  onClick={() => setNotificationsOpen(true)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 ease-out"
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <Bell size={16} />
                </button>
              </div>
            }
            footer={
              sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                  <button onClick={onLogout} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors duration-150">
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-gray-900 rounded-2xl text-white mb-4">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Compute Allocation</p>
                    <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden mb-2">
                      <div className="bg-indigo-400 h-full rounded-full transition-all duration-1000" style={{ width: `${usagePercentage}%` }}></div>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400">{(creditsTotal - creditsUsed).toLocaleString()} Gen Available</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                        {user.name?.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user.name || 'User'}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Verified</p>
                      </div>
                    </div>
                    <button onClick={onLogout} className="p-2 text-gray-300 hover:text-red-500 transition-colors duration-150">
                      <LogOut size={16} />
                    </button>
                  </div>
                </>
              )
            }
          />
        }
        topbar={null}
      >
        <GlobalInviteBanner user={user} />
        <Outlet context={{ user, refreshProfile }} />
      </AppShell>

      {/* Global Overlays */}
      <CommandPalette user={user} open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <DailyBriefing user={user} open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
};

export default ClientLayout;
