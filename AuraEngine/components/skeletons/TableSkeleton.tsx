import React, { useState, useEffect } from 'react';

/** Table page skeleton: search bar + header row + 10 data rows.
 *  Used as Suspense fallback for list/table pages (Leads, Invoices, etc). */
const TableSkeleton: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 120);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;

  return (
    <div className="animate-fadeIn w-full space-y-5 p-1">
      {/* Page title + action button */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-slate-200/70 rounded-lg animate-pulse" />
        <div className="h-9 w-28 bg-slate-100 rounded-xl animate-pulse" />
      </div>

      {/* Search / filter bar */}
      <div className="flex items-center gap-3">
        <div className="h-10 flex-1 max-w-sm bg-white rounded-xl border border-slate-100 animate-pulse" />
        <div className="h-10 w-24 bg-white rounded-xl border border-slate-100 animate-pulse" />
        <div className="h-10 w-24 bg-white rounded-xl border border-slate-100 animate-pulse" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="h-3 w-4 bg-slate-200 rounded" />
          <div className="h-3 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded flex-1" />
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
        </div>
        {/* Data rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`flex items-center gap-4 px-5 py-3.5 ${i < 9 ? 'border-b border-slate-50' : ''}`}>
            <div className="h-4 w-4 bg-slate-100 rounded" />
            <div className="h-4 w-36 bg-slate-50 rounded" />
            <div className="h-4 w-28 bg-slate-50 rounded" />
            <div className="h-4 flex-1 bg-slate-50 rounded" />
            <div className="h-4 w-16 bg-slate-50 rounded" />
            <div className="h-4 w-20 bg-slate-50 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
