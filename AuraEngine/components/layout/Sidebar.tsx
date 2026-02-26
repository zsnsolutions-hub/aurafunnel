import React from 'react';
import PrefetchLink from '../PrefetchLink';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface SidebarNavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: string;
  children?: SidebarNavItem[];
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
      aria-label="Sidebar navigation"
      className={`hidden lg:flex flex-col fixed inset-y-0 z-30 transition-all duration-150 ease-out ${collapsed ? 'w-[88px]' : 'w-[272px]'} ${isLight ? 'bg-white border-r border-gray-200' : 'bg-slate-900 border-r border-slate-800'}`}
    >
      {/* Header */}
      <div className={`h-16 flex items-center shrink-0 ${collapsed ? 'justify-center px-3' : 'px-6'} border-b ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
        {collapsed ? (headerCollapsed || header) : header}
      </div>

      {/* Top Slot */}
      {topSlot && !collapsed && <div className="px-4 pt-4 shrink-0">{topSlot}</div>}

      {/* Navigation */}
      <nav className="flex-grow py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          const hasChildren = item.children && item.children.length > 0;
          const isChildActive = hasChildren && item.children!.some(child => activePath === child.path);
          const isExpanded = hasChildren && (isActive || isChildActive);
          return (
            <div key={item.path}>
              <PrefetchLink
                to={item.path}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center rounded-xl transition-all duration-150 ease-out group relative ${collapsed ? 'justify-center px-3 py-3' : 'px-3 py-2.5 gap-3'} ${isActive || isChildActive
                  ? isLight
                    ? 'bg-indigo-50/80 text-indigo-700 font-medium'
                    : 'bg-indigo-500/15 text-indigo-400 font-medium'
                  : isLight
                    ? 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full ${isLight ? 'bg-indigo-600' : 'bg-indigo-400'}`} />
                )}
                <span className={`shrink-0 [&>svg]:w-5 [&>svg]:h-5 transition-colors duration-150 ${isActive || isChildActive ? '' : isLight ? 'text-gray-400 group-hover:text-gray-600' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="text-[13px] truncate">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border ${isActive ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {item.badge}
                  </span>
                )}
                {/* Tooltip for collapsed */}
                {collapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-out whitespace-nowrap z-50 pointer-events-none shadow-lg">
                    {item.label}
                  </div>
                )}
              </PrefetchLink>
              {/* Children sub-links */}
              {hasChildren && isExpanded && !collapsed && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {item.children!.map((child) => {
                    const isChildItemActive = activePath === child.path;
                    return (
                      <PrefetchLink
                        key={child.path}
                        to={child.path}
                        aria-current={isChildItemActive ? 'page' : undefined}
                        className={`flex items-center rounded-lg px-3 py-2 gap-2.5 transition-all duration-150 ease-out group relative ${isChildItemActive
                          ? isLight
                            ? 'bg-indigo-50/60 text-indigo-700 font-medium'
                            : 'bg-indigo-500/10 text-indigo-400 font-medium'
                          : isLight
                            ? 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                            : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
                        }`}
                      >
                        {isChildItemActive && (
                          <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full ${isLight ? 'bg-indigo-500' : 'bg-indigo-400'}`} />
                        )}
                        <span className={`shrink-0 [&>svg]:w-4 [&>svg]:h-4 transition-colors duration-150 ${isChildItemActive ? '' : isLight ? 'text-gray-300 group-hover:text-gray-500' : 'text-slate-600 group-hover:text-slate-400'}`}>
                          {child.icon}
                        </span>
                        <span className="text-[12px] truncate">{child.label}</span>
                      </PrefetchLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className={`px-3 py-2.5 shrink-0 border-t ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`w-full flex items-center justify-center p-2 rounded-xl transition-all duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${isLight ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {/* Footer */}
      {footer && (
        <div className={`shrink-0 ${collapsed ? 'px-3 py-3' : 'px-4 py-4'} border-t ${isLight ? 'border-gray-100 bg-gray-50/30' : 'border-slate-800 bg-slate-950/30'}`}>
          {footer}
        </div>
      )}
    </aside>
  );
};
