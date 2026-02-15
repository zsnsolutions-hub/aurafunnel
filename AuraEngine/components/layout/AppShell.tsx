import React from 'react';

interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  topbar?: React.ReactNode;
  sidebarCollapsed?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, sidebar, topbar, sidebarCollapsed = false }) => (
  <div className="min-h-screen bg-gray-50 font-body">
    {sidebar}
    <div className={`flex flex-col min-h-screen transition-[padding] duration-150 ease-out ${sidebarCollapsed ? 'lg:pl-[88px]' : 'lg:pl-[272px]'}`}>
      {topbar}
      <main className="flex-grow p-6">
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  </div>
);
