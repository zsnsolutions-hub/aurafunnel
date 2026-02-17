import React from 'react';
import { DashboardQuickStats } from '../../types';
import { TargetIcon, FlameIcon, SparklesIcon, BoltIcon, TrendUpIcon, TrendDownIcon, ChartIcon, CheckIcon } from '../Icons';

interface QuickStatsRowProps {
  stats: DashboardQuickStats;
  loading: boolean;
}

const StatCard = ({ title, value, icon, trend, loading }: {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string } | null;
  loading: boolean;
}) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
    <div className="flex items-center justify-between mb-3">
      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
        {icon}
      </div>
      {!loading && trend && (
        <span className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          trend.value >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
        }`}>
          {trend.value >= 0 ? <TrendUpIcon className="w-3 h-3" /> : <TrendDownIcon className="w-3 h-3" />}
          <span>{trend.label}</span>
        </span>
      )}
    </div>
    <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{title}</h3>
    {loading ? (
      <div className="h-8 w-20 bg-slate-100 animate-pulse rounded-lg mt-1"></div>
    ) : (
      <p className="text-2xl font-bold text-slate-900 mt-1 font-heading tracking-tight">{value}</p>
    )}
  </div>
);

const QuickStatsRow: React.FC<QuickStatsRowProps & { children?: React.ReactNode }> = ({ stats, loading, children }) => {
  const leadsTrend = stats.leadsYesterday !== undefined && stats.leadsYesterday > 0
    ? { value: stats.leadsToday - stats.leadsYesterday, label: `${stats.leadsToday > stats.leadsYesterday ? '+' : ''}${stats.leadsToday - stats.leadsYesterday} today` }
    : null;

  const hotTrend = stats.hotLeadsYesterday !== undefined
    ? { value: stats.hotLeads - stats.hotLeadsYesterday, label: `${stats.hotLeads > stats.hotLeadsYesterday ? '+' : ''}${stats.hotLeads - stats.hotLeadsYesterday} vs yday` }
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
      <StatCard title="Leads Today" value={stats.leadsToday.toString()} icon={<TargetIcon className="w-5 h-5" />} trend={leadsTrend} loading={loading} />
      <StatCard title="Hot Leads" value={`${stats.hotLeads} Active`} icon={<FlameIcon className="w-5 h-5" />} trend={hotTrend} loading={loading} />
      <StatCard title="Content Created" value={stats.contentCreated.toString()} icon={<SparklesIcon className="w-5 h-5" />} trend={null} loading={loading} />
      <StatCard title="Avg AI Score" value={`${stats.avgAiScore}%`} icon={<BoltIcon className="w-5 h-5" />} trend={null} loading={loading} />
      <StatCard title="Predicted Conv." value={stats.predictedConversions.toString()} icon={<ChartIcon className="w-5 h-5" />} trend={null} loading={loading} />
      <StatCard title="Recommendations" value={stats.recommendations.toString()} icon={<CheckIcon className="w-5 h-5" />} trend={null} loading={loading} />
      {children}
    </div>
  );
};

export default React.memo(QuickStatsRow);
