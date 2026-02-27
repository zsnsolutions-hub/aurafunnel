import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Search, Bell } from 'lucide-react';
import { User } from '../../types';
import CommandPalette from '../dashboard/CommandPalette';
import DailyBriefing from '../dashboard/DailyBriefing';
import { GuideMenuButton } from '../guide/GuideProvider';
import { AppShell } from './AppShell';
import { Sidebar, SidebarNavItem } from './Sidebar';
import GlobalInviteBanner from './GlobalInviteBanner';
import { useIntegrations } from '../../lib/integrations';
import { TIER_LIMITS, resolvePlanName } from '../../lib/credits';
import { NAV_CONFIG, NavConfigItem } from '../../lib/navConfig';
import { UIModeSwitcher } from '../ui-mode';
import { useUIMode } from '../ui-mode/UIModeProvider';

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
  const [notificationsAutoShown, setNotificationsAutoShown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { integrations: integrationStatuses } = useIntegrations();
  const activeIntegrationCount = integrationStatuses.filter(i => i.status === 'connected').length;
  const { isSimplified } = useUIMode();

  const navItems = useMemo(() => {
    function toSidebarItem(cfg: NavConfigItem): SidebarNavItem {
      const Icon = cfg.icon;
      const item: SidebarNavItem = {
        label: cfg.navLabel,
        path: cfg.route,
        icon: <Icon size={20} />,
        divider: cfg.divider,
        isGroup: cfg.isGroup,
        badge: cfg.route === '/portal/integrations' && activeIntegrationCount > 0
          ? `${activeIntegrationCount} active`
          : undefined,
      };
      if (cfg.children) {
        const children = isSimplified
          ? cfg.children.filter(c => c.simplifiedVisible !== false)
          : cfg.children;
        item.children = children.map(toSidebarItem);
      }
      return item;
    }

    if (!isSimplified) return NAV_CONFIG.map(toSidebarItem);

    // Simplified mode: merge Workspace + Billing children into Settings
    const mergedChildren: NavConfigItem[] = [];
    const simplified = NAV_CONFIG.filter(cfg => {
      if (cfg.section === 'workspace' && cfg.isGroup) {
        const visible = (cfg.children || []).filter(c => c.simplifiedVisible !== false);
        mergedChildren.push(...visible);
        return false;
      }
      if (cfg.section === 'billing' && cfg.isGroup) {
        mergedChildren.push(...(cfg.children || []));
        return false;
      }
      return true;
    });

    return simplified.map(cfg => {
      if (cfg.section === 'settings' && cfg.route === '/portal/settings') {
        const merged: NavConfigItem = {
          ...cfg,
          children: [...(cfg.children || []), ...mergedChildren],
        };
        return toSidebarItem(merged);
      }
      return toSidebarItem(cfg);
    });
  }, [activeIntegrationCount, isSimplified]);

  const currentPlan = resolvePlanName(user.subscription?.plan_name || user.plan || 'Starter');
  const creditsTotal = user.credits_total || (TIER_LIMITS[currentPlan]?.credits ?? TIER_LIMITS.Starter.credits);
  const creditsUsed = user.credits_used || 0;
  const usagePercentage = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);


  // ─── Auto-show notifications once per session ───
  useEffect(() => {
    if (notificationsAutoShown) return;
    const key = `notifications_shown_${new Date().toISOString().split('T')[0]}`;
    if (sessionStorage.getItem(key)) {
      setNotificationsAutoShown(true);
      return;
    }
    const timer = setTimeout(() => {
      setNotificationsOpen(true);
      setNotificationsAutoShown(true);
      sessionStorage.setItem(key, 'true');
    }, 800);
    return () => clearTimeout(timer);
  }, [notificationsAutoShown]);

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
                <img src="/scaliyo-logo-light.png" alt="Scaliyo" className="h-10 w-auto" />
              </Link>
            }
            headerCollapsed={
              <Link to="/">
                <img src="/scaliyo-logo-light.png" alt="Scaliyo" className="h-10 w-auto" />
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
                  <UIModeSwitcher collapsed />
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                  <button onClick={onLogout} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors duration-150">
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <UIModeSwitcher />
                  <div className="p-4 bg-gray-900 rounded-2xl text-white mb-4 mt-3">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">AI Credits</p>
                    <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden mb-2">
                      <div className="bg-indigo-400 h-full rounded-full transition-all duration-1000" style={{ width: `${usagePercentage}%` }}></div>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400">{(creditsTotal - creditsUsed).toLocaleString()} AI Actions Left</p>
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
