import React from 'react';
import {
  BoltIcon, UsersIcon, TargetIcon, ClockIcon, BrainIcon, ShieldIcon,
  TrendUpIcon, TrendDownIcon,
} from '../Icons';

interface KpiStat {
  label: string;
  value: string;
  color: string;
  trend: string;
  up: boolean | null;
}

const KPI_ICONS: Record<string, React.ReactNode> = {
  'Active Workflows': <BoltIcon className="w-5 h-5" />,
  'Leads Processed': <UsersIcon className="w-5 h-5" />,
  'Avg Conversion': <TargetIcon className="w-5 h-5" />,
  'Time Saved': <ClockIcon className="w-5 h-5" />,
  'AI-Enabled Nodes': <BrainIcon className="w-5 h-5" />,
  'Success Rate': <ShieldIcon className="w-5 h-5" />,
};

interface KpiStatsBarProps {
  stats: KpiStat[];
}

export const KpiStatsBar: React.FC<KpiStatsBarProps> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    {stats.map((stat, i) => (
      <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all group">
        <div className="flex items-center justify-between mb-2">
          <div className={`w-9 h-9 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 flex items-center justify-center group-hover:scale-110 transition-transform`}>
            {KPI_ICONS[stat.label] || <BoltIcon className="w-5 h-5" />}
          </div>
          {stat.up !== null && (
            stat.up ? <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" /> : <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />
          )}
        </div>
        <p className="text-xl font-black text-slate-900">{stat.value}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
        <p className="text-[10px] text-slate-400 mt-1 truncate">{stat.trend}</p>
      </div>
    ))}
  </div>
);
