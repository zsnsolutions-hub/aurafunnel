import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { User } from '../../types';
import { ChartIcon, UsersIcon, BoltIcon, LogoutIcon, TargetIcon, CogIcon, SparklesIcon, ShieldIcon, LockIcon, EditIcon } from '../Icons';

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
    { label: 'Blog Engine', path: '/admin/blog', icon: <EditIcon className="w-5 h-5" /> },
    { label: 'System Integrity', path: '/admin/health', icon: <ShieldIcon className="w-5 h-5" /> },
    { label: 'Audit Vault', path: '/admin/audit', icon: <LockIcon className="w-5 h-5" /> },
    { label: 'Platform Settings', path: '/admin/settings', icon: <CogIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-slate-900 text-slate-300 hidden lg:flex flex-col fixed inset-y-0 shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">A</div>
            <span className="text-xl font-bold text-white tracking-tight font-heading">AuraAdmin</span>
          </div>
        </div>
        <nav className="flex-grow p-4 space-y-1.5 mt-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                location.pathname === item.path 
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/40' 
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="font-medium text-xs uppercase tracking-[0.1em]">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-3 px-3 py-2 mb-4">
             <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-400 text-xs border border-slate-700 uppercase">
               {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
             </div>
             <div className="min-w-0">
               <p className="text-xs font-bold text-white truncate">{user?.name || 'Admin'}</p>
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">Root Administrator</p>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all text-xs font-black uppercase tracking-widest"
          >
            <LogoutIcon className="w-4 h-4" />
            <span>Terminate Session</span>
          </button>
        </div>
      </aside>

      <div className="flex-grow lg:pl-64 flex flex-col">
        <header className="h-16 glass sticky top-0 z-40 flex items-center justify-between px-8 border-b border-slate-200">
          <div className="flex items-center space-x-4">
             <div className="relative">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
             </div>
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Sentinel Online</span>
          </div>
          <div className="flex items-center space-x-3">
             <span className="text-[9px] font-black bg-slate-900 text-white px-3 py-1 rounded-full uppercase tracking-widest">v10.0.0-Stable</span>
          </div>
        </header>
        <main className="p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;