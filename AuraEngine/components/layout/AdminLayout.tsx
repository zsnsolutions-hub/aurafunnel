import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  BarChart3, Users, Sparkles, Zap, Target, PenSquare,
  Shield, Lock, Settings, LogOut
} from 'lucide-react';
import { User } from '../../types';
import { AppShell } from './AppShell';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AdminLayoutProps {
  user: User;
  onLogout: () => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navItems = [
    { label: 'Overview', path: '/admin', icon: <BarChart3 size={20} /> },
    { label: 'User Directory', path: '/admin/users', icon: <Users size={20} /> },
    { label: 'Neural Analytics', path: '/admin/ai', icon: <Sparkles size={20} /> },
    { label: 'Prompt Lab', path: '/admin/prompts', icon: <Zap size={20} /> },
    { label: 'Global Leads', path: '/admin/leads', icon: <Target size={20} /> },
    { label: 'Blog Engine', path: '/admin/blog', icon: <PenSquare size={20} /> },
    { label: 'System Integrity', path: '/admin/health', icon: <Shield size={20} /> },
    { label: 'Audit Vault', path: '/admin/audit', icon: <Lock size={20} /> },
    { label: 'Platform Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(prev => !prev)}
          navItems={navItems}
          activePath={location.pathname}
          variant="dark"
          header={
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">A</div>
              <span className="text-lg font-bold text-white tracking-tight">AuraAdmin</span>
            </Link>
          }
          headerCollapsed={
            <Link to="/">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">A</div>
            </Link>
          }
          footer={
            sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-400 text-xs border border-slate-700">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                </div>
                <button onClick={onLogout} className="p-1.5 text-red-400 hover:text-red-500 transition-colors duration-150">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-1 mb-4">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-400 text-xs border border-slate-700 uppercase shrink-0">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{user?.name || 'Admin'}</p>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Administrator</p>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-all duration-150 ease-out text-xs font-bold uppercase tracking-wider"
                >
                  <LogOut size={16} />
                  <span>Terminate Session</span>
                </button>
              </>
            )
          }
        />
      }
      topbar={
        <Topbar
          actions={
            <span className="text-[9px] font-black bg-gray-900 text-white px-3 py-1 rounded-full uppercase tracking-widest">v10.0.0-Stable</span>
          }
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
            </div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sentinel Online</span>
          </div>
        </Topbar>
      }
    >
      <Outlet />
    </AppShell>
  );
};

export default AdminLayout;
