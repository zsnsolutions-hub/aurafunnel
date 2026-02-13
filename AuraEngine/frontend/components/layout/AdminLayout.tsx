import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { User } from '../../types';
import { ChartIcon, UsersIcon, BoltIcon, LogoutIcon, TargetIcon, CogIcon, CreditCardIcon, SparklesIcon, ShieldIcon, LockIcon } from '../Icons';

interface AdminLayoutProps {
  user: User;
  onLogout: () => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ user, onLogout }) => {
  const location = useLocation();

  const navItems = [
    { label: 'Overview', path: '/admin', icon: <ChartIcon className="w-5 h-5" /> },
    { label: 'User Directory', path: '/admin/users', icon: <UsersIcon className="w-5 h-5" /> },
    { label: 'Neural Analytics', path: '/admin/ai', icon: <SparklesIcon className="w-5 h-5" /> },
    { label: 'Prompt Lab', path: '/admin/prompts', icon: <BoltIcon className="w-5 h-5" /> },
    { label: 'Global Leads', path: '/admin/leads', icon: <TargetIcon className="w-5 h-5" /> },
    { label: 'System Integrity', path: '/admin/health', icon: <ShieldIcon className="w-5 h-5" /> },
    { label: 'Audit Vault', path: '/admin/audit', icon: <LockIcon className="w-5 h-5" /> },
    { label: 'Config Settings', path: '/admin/settings', icon: <CogIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-slate-900 text-slate-300 hidden lg:flex flex-col fixed inset-y-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center font-bold text-white font-heading">A</div>
            <span className="text-xl font-bold text-white tracking-tight font-heading">AuraAdmin</span>
          </div>
        </div>
        <nav className="flex-grow p-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                location.pathname === item.path 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="font-medium text-xs uppercase tracking-widest">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-slate-800 hover:bg-red-900/30 hover:text-red-400 rounded-lg transition-all text-xs font-black uppercase tracking-widest"
          >
            <LogoutIcon className="w-4 h-4" />
            <span>Terminate Session</span>
          </button>
        </div>
      </aside>

      <div className="flex-grow lg:pl-64">
        <header className="h-16 glass sticky top-0 z-40 flex items-center justify-between px-8 border-b border-slate-200">
          <div className="flex items-center space-x-4">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Neural Link: Stable</span>
          </div>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;