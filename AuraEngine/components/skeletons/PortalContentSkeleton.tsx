import React from 'react';

/** Skeleton shown inside the portal content area while a lazy page loads.
 *  Matches the portal's full-width layout — no max-w-4xl centering. */
const PortalContentSkeleton: React.FC = () => {
  return (
    <div className="animate-fadeIn w-full space-y-6 p-1">
      {/* Page title */}
      <div className="h-7 w-44 bg-slate-200/70 rounded-lg animate-pulse" />

      {/* KPI cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] bg-white rounded-2xl border border-slate-100 animate-pulse" />
        ))}
      </div>

      {/* Main content block */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-slate-100 rounded-lg" />
          <div className="h-8 w-24 bg-slate-100 rounded-lg" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-4 bg-slate-100 rounded" />
            <div className="h-4 flex-1 bg-slate-50 rounded" />
            <div className="h-4 w-20 bg-slate-50 rounded" />
            <div className="h-4 w-16 bg-slate-50 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PortalContentSkeleton;
