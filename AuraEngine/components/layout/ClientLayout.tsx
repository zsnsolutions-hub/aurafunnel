import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { User } from '../../types';
import { TargetIcon, SparklesIcon, CreditCardIcon, CogIcon, LogoutIcon, BoltIcon, EditIcon, PieChartIcon, GitBranchIcon, HelpCircleIcon, BookOpenIcon, UsersIcon, BrainIcon, MessageIcon, SlidersIcon } from '../Icons';

interface ClientLayoutProps {
  user: User;
  onLogout: () => void;
  refreshProfile: () => Promise<void>;
}

const ClientLayout: React.FC<ClientLayoutProps> = ({ user, onLogout, refreshProfile }) => {
  const location = useLocation();

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
    { label: 'Billing & Tiers', path: '/portal/billing', icon: <CreditCardIcon className="w-5 h-5" /> },
    { label: 'Help Center', path: '/portal/help', icon: <HelpCircleIcon className="w-5 h-5" /> },
    { label: 'User Manual', path: '/portal/manual', icon: <BookOpenIcon className="w-5 h-5" /> },
    { label: 'Account Architecture', path: '/portal/settings', icon: <CogIcon className="w-5 h-5" /> },
  ];

  const creditsTotal = user.credits_total || 500;
  const creditsUsed = user.credits_used || 0;
  const usagePercentage = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col lg:flex-row font-body">
      <aside className="w-72 hidden lg:flex flex-col bg-white border-r border-slate-200 fixed inset-y-0 shadow-sm">
        <div className="h-16 flex items-center px-8 border-b border-slate-100">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black font-heading text-lg">A</div>
            <span className="text-xl font-bold tracking-tight text-slate-900 font-heading uppercase tracking-tighter">AuraFunnel</span>
          </Link>
        </div>
        
        <div className="flex-grow py-8 px-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-5 py-3.5 rounded-2xl transition-all duration-300 group ${
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
        <main className="p-8 max-w-7xl mx-auto w-full flex-grow">
          <Outlet context={{ user, refreshProfile }} />
        </main>
      </div>
    </div>
  );
};

export default ClientLayout;