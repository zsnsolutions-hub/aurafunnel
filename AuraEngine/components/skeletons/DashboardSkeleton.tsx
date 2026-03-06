import React, { useState, useEffect } from 'react';

/** Dashboard skeleton: KPI cards + chart block + activity list.
 *  Used as Suspense fallback for dashboard-style pages. */
const DashboardSkeleton: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 120);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;

  return (
    <div className="animate-fadeIn w-full space-y-6 p-1">
      {/* Page title */}
      <div className="h-7 w-52 bg-slate-200/70 rounded-lg animate-pulse" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[100px] bg-white rounded-2xl border border-slate-100 p-4 animate-pulse space-y-3">
            <div className="h-3 w-20 bg-slate-100 rounded" />
            <div className="h-6 w-16 bg-slate-200/60 rounded" />
            <div className="h-2 w-24 bg-slate-50 rounded" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 animate-pulse">
        <div className="h-5 w-36 bg-slate-100 rounded-lg mb-4" />
        <div className="h-[200px] bg-slate-50 rounded-xl" />
      </div>

      {/* Activity list */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4 animate-pulse">
        <div className="h-5 w-28 bg-slate-100 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 bg-slate-50 rounded" />
              <div className="h-2.5 w-1/3 bg-slate-50 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardSkeleton;
