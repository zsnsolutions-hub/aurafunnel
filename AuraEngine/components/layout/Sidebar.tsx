import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface SidebarNavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  navItems: SidebarNavItem[];
  activePath: string;
  header: React.ReactNode;
  headerCollapsed?: React.ReactNode;
  footer?: React.ReactNode;
  topSlot?: React.ReactNode;
  variant?: 'light' | 'dark';
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  navItems,
  activePath,
  header,
  headerCollapsed,
  footer,
  topSlot,
  variant = 'light',
}) => {
  const isLight = variant === 'light';

  return (
    <aside
      className={`hidden lg:flex flex-col fixed inset-y-0 z-30 transition-all duration-150 ease-out ${collapsed ? 'w-20' : 'w-[260px]'} ${isLight ? 'bg-white border-r border-gray-200' : 'bg-slate-900 border-r border-slate-800'}`}
    >
      {/* Header */}
      <div className={`h-16 flex items-center shrink-0 ${collapsed ? 'justify-center px-2' : 'px-6'} border-b ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
        {collapsed ? (headerCollapsed || header) : header}
      </div>

      {/* Top Slot (e.g. search trigger) */}
      {topSlot && !collapsed && <div className="px-3 pt-3 shrink-0">{topSlot}</div>}

      {/* Navigation */}
      <nav className="flex-grow py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-xl transition-all duration-150 ease-out group relative ${collapsed ? 'justify-center px-2 py-3' : 'px-4 py-2.5 gap-3'} ${isActive ? (isLight ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 font-semibold' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 font-semibold') : (isLight ? 'text-gray-600 hover:bg-gray-50 hover:text-gray-900' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}`}
            >
              <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{item.icon}</span>
              {!collapsed && <span className="text-sm truncate">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                  {item.badge}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-out whitespace-nowrap z-50 pointer-events-none shadow-lg">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className={`px-3 py-2 shrink-0 border-t ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
        <button
          onClick={onToggle}
          className={`w-full flex items-center justify-center p-2 rounded-lg transition-all duration-150 ease-out ${isLight ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Footer */}
      {footer && (
        <div className={`shrink-0 ${collapsed ? 'px-2 py-3' : 'px-4 py-4'} border-t ${isLight ? 'border-gray-100 bg-gray-50/50' : 'border-slate-800 bg-slate-950/50'}`}>
          {footer}
        </div>
      )}
    </aside>
  );
};
