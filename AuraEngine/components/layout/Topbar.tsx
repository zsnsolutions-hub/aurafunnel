import React from 'react';

interface TopbarProps {
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ children, actions, className = '' }) => (
  <header className={`h-14 bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-20 flex items-center justify-between px-6 ${className}`}>
    <div className="flex items-center gap-4">{children}</div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>
);
