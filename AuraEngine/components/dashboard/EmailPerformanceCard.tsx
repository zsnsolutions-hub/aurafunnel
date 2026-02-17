import React, { useState, useEffect } from 'react';
import { MailIcon, EyeIcon, CursorClickIcon } from '../Icons';
import { fetchOwnerEmailPerformance } from '../../lib/emailTracking';
import { useNavigate } from 'react-router-dom';

interface EmailStats {
  sent: number;
  opened: number;
  clicks: number;
}

const EmailPerformanceCard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    fetchOwnerEmailPerformance()
      .then((entries) => {
        const thirtyDaysAgo = Date.now() - 30 * 86400000;
        const recent = entries.filter(e => new Date(e.sentAt).getTime() >= thirtyDaysAgo);
        setStats({
          sent: recent.length,
          opened: recent.reduce((s, e) => s + e.opens, 0),
          clicks: recent.reduce((s, e) => s + e.clicks, 0),
        });
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const navigateWithFilter = (filter?: string) => {
    const params = new URLSearchParams();
    if (filter) params.set('emailFilter', filter);
    navigate(`/portal/leads${params.toString() ? `?${params}` : ''}`);
  };

  // Loading skeleton — matches StatCard height
  if (loading) {
    return (
      <div className="col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2.5 bg-slate-100 rounded-xl animate-pulse w-10 h-10" />
          <div className="h-3 w-14 bg-slate-50 rounded animate-pulse" />
        </div>
        <div className="h-3 w-24 bg-slate-100 rounded animate-pulse mb-2" />
        <div className="flex items-center space-x-4 mt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center space-x-1.5">
              <div className="h-6 w-8 bg-slate-100 rounded animate-pulse" />
              <div className="h-3 w-10 bg-slate-50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center">
        <p className="text-xs text-red-500 mr-2">Failed to load</p>
        <button onClick={load} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700">Retry</button>
      </div>
    );
  }

  // Empty state
  if (stats && stats.sent === 0 && stats.opened === 0 && stats.clicks === 0) {
    return (
      <div className="col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
            <MailIcon className="w-5 h-5" />
          </div>
        </div>
        <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Email Performance</h3>
        <p className="text-sm text-slate-400 mt-1">
          No activity yet &middot;{' '}
          <button onClick={() => navigateWithFilter()} className="text-indigo-600 font-bold hover:text-indigo-700">View leads</button>
        </p>
      </div>
    );
  }

  const kpis = [
    { label: 'Sent', value: stats!.sent, icon: <MailIcon className="w-3.5 h-3.5" />, color: 'text-blue-600', filter: 'sent' },
    { label: 'Opened', value: stats!.opened, icon: <EyeIcon className="w-3.5 h-3.5" />, color: 'text-emerald-600', filter: 'opened' },
    { label: 'Clicks', value: stats!.clicks, icon: <CursorClickIcon className="w-3.5 h-3.5" />, color: 'text-amber-600', filter: 'clicked' },
  ];

  return (
    <div className="col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
          <MailIcon className="w-5 h-5" />
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">30 days</span>
      </div>
      <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Email Performance</h3>
      <div className="flex items-baseline space-x-5 mt-1">
        {kpis.map(kpi => (
          <button
            key={kpi.label}
            onClick={() => navigateWithFilter(kpi.filter)}
            className="flex items-baseline space-x-1.5 hover:opacity-70 transition-opacity"
          >
            <span className="text-2xl font-bold text-slate-900 font-heading tracking-tight">{kpi.value}</span>
            <span className={`flex items-center space-x-0.5 text-[10px] font-bold uppercase tracking-widest ${kpi.color}`}>
              {kpi.icon}
              <span>{kpi.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(EmailPerformanceCard);
