import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { TargetIcon, SparklesIcon, CreditCardIcon, CogIcon, LogoutIcon, BoltIcon, EditIcon, PieChartIcon, GitBranchIcon, HelpCircleIcon, BookOpenIcon, UsersIcon, BrainIcon, MessageIcon, SlidersIcon, PlugIcon, FilterIcon, BellIcon } from '../Icons';
import CommandPalette from '../dashboard/CommandPalette';
import DailyBriefing from '../dashboard/DailyBriefing';

interface ClientLayoutProps {
  user: User;
  onLogout: () => void;
  refreshProfile: () => Promise<void>;
}

const ClientLayout: React.FC<ClientLayoutProps> = ({ user, onLogout, refreshProfile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingShown, setBriefingShown] = useState(false);
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navItems = [
    { label: 'Main Dashboard', path: '/portal', icon: <TargetIcon className="w-5 h-5" /> },
    { label: 'Lead Management', path: '/portal/leads', icon: <UsersIcon className="w-5 h-5" /> },
    { label: 'Lead Intelligence', path: '/portal/intelligence', icon: <BrainIcon className="w-5 h-5" /> },
    { label: 'AI Command Center', path: '/portal/ai', icon: <MessageIcon className="w-5 h-5" /> },
    { label: 'Neural Studio', path: '/portal/content', icon: <SparklesIcon className="w-5 h-5" /> },
    { label: 'Content Studio', path: '/portal/content-studio', icon: <EditIcon className="w-5 h-5" /> },
    { label: 'Strategy Hub', path: '/portal/strategy', icon: <BoltIcon className="w-5 h-5" /> },
    { label: 'Guest Posts', path: '/portal/blog', icon: <EditIcon className="w-5 h-5" /> },
    { label: 'Analytics Hub', path: '/portal/analytics', icon: <PieChartIcon className="w-5 h-5" /> },
    { label: 'Automation Engine', path: '/portal/automation', icon: <GitBranchIcon className="w-5 h-5" /> },
    { label: 'Model Training', path: '/portal/model-training', icon: <SlidersIcon className="w-5 h-5" /> },
    { label: 'Integration Hub', path: '/portal/integrations', icon: <PlugIcon className="w-5 h-5" /> },
    { label: 'Billing & Tiers', path: '/portal/billing', icon: <CreditCardIcon className="w-5 h-5" /> },
    { label: 'Help Center', path: '/portal/help', icon: <HelpCircleIcon className="w-5 h-5" /> },
    { label: 'User Manual', path: '/portal/manual', icon: <BookOpenIcon className="w-5 h-5" /> },
    { label: 'Account Architecture', path: '/portal/settings', icon: <CogIcon className="w-5 h-5" /> },
  ];

  const creditsTotal = user.credits_total || 500;
  const creditsUsed = user.credits_used || 0;
  const usagePercentage = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);

  // ─── Show daily briefing once per session ───
  useEffect(() => {
    if (!briefingShown) {
      const key = `briefing_shown_${new Date().toISOString().split('T')[0]}`;
      const alreadyShown = sessionStorage.getItem(key);
      if (!alreadyShown) {
        const timer = setTimeout(() => {
          setBriefingOpen(true);
          setBriefingShown(true);
          sessionStorage.setItem(key, 'true');
        }, 800);
        return () => clearTimeout(timer);
      }
      setBriefingShown(true);
    }
  }, [briefingShown]);

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
      if (e.key === '/' && !isInput && !commandPaletteOpen && !briefingOpen) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // ? → Help
      if (e.key === '?' && !isInput && !commandPaletteOpen && !briefingOpen) {
        e.preventDefault();
        navigate('/portal/help');
        return;
      }

      // Escape → close overlays
      if (e.key === 'Escape') {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        if (briefingOpen) setBriefingOpen(false);
        return;
      }

      // Skip G-shortcuts if in input or overlay is open
      if (isInput || commandPaletteOpen || briefingOpen) return;

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
  }, [navigate, commandPaletteOpen, briefingOpen]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col lg:flex-row font-body">
      <aside className="w-72 hidden lg:flex flex-col bg-white border-r border-slate-200 fixed inset-y-0 shadow-sm">
        <div className="h-16 flex items-center px-8 border-b border-slate-100">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black font-heading text-lg">A</div>
            <span className="text-xl font-bold tracking-tight text-slate-900 font-heading uppercase tracking-tighter">AuraFunnel</span>
          </Link>
        </div>

        <div className="flex-grow py-4 px-4 space-y-0.5 overflow-y-auto">
          {/* Command Palette Trigger */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full flex items-center space-x-3 px-5 py-2.5 rounded-xl mb-3 bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all group"
          >
            <FilterIcon className="w-4 h-4" />
            <span className="text-xs font-medium flex-1 text-left">Search...</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-400 group-hover:text-slate-500">⌘K</kbd>
          </button>

          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-5 py-3 rounded-2xl transition-all duration-300 group ${
                location.pathname === item.path
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 font-bold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-medium'
              }`}
            >
              <span className="transition-transform group-hover:scale-110">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="p-5 bg-slate-900 rounded-3xl text-white shadow-2xl">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-3">Compute Allocation</p>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mb-3 shadow-inner">
              <div className="bg-indigo-50 h-full rounded-full transition-all duration-1000" style={{ width: `${usagePercentage}%` }}></div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">{(creditsTotal - creditsUsed).toLocaleString()} Gen Available</p>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{user.name || 'User'}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-tighter">Verified Node</p>
              </div>
            </div>
            <button onClick={onLogout} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
              <LogoutIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-grow lg:pl-72 flex flex-col">
        {/* Top bar with briefing button */}
        <div className="h-12 border-b border-slate-100 bg-white/80 backdrop-blur-sm flex items-center justify-end px-8 space-x-2">
          <button
            onClick={() => setBriefingOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg text-[11px] font-bold hover:bg-slate-100 hover:text-slate-700 transition-all"
          >
            <BellIcon className="w-3.5 h-3.5" />
            <span>Briefing</span>
          </button>
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg text-[11px] font-bold hover:bg-slate-100 hover:text-slate-700 transition-all"
          >
            <FilterIcon className="w-3.5 h-3.5" />
            <span>Search</span>
            <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">/</kbd>
          </button>
        </div>

        <main className="p-8 max-w-7xl mx-auto w-full flex-grow">
          <Outlet context={{ user, refreshProfile }} />
        </main>
      </div>

      {/* Global Overlays */}
      <CommandPalette user={user} open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <DailyBriefing user={user} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
    </div>
  );
};

export default ClientLayout;
