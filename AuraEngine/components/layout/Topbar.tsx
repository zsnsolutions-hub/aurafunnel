import React from 'react';

interface TopbarProps {
  children?: React.ReactNode;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ children, actions, search, className = '' }) => (
  <header role="banner" aria-label="Top navigation bar" className={`h-14 bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-20 flex items-center justify-between px-6 gap-4 ${className}`}>
    <div className="flex items-center gap-4 min-w-0">{children}</div>
    {search && <div className="hidden sm:flex flex-1 justify-center max-w-md">{search}</div>}
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </header>
);
