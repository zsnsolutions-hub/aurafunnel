import React, { useMemo } from 'react';
import { TrendUpIcon } from '../Icons';
import { WORKFLOW_STATUS_STYLES } from './constants';
import type { Workflow, ExecutionLogEntry } from './types';

interface WorkflowAnalyticsBarProps {
  workflow: Workflow;
  executionLog: ExecutionLogEntry[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WorkflowAnalyticsBar: React.FC<WorkflowAnalyticsBarProps> = ({ workflow, executionLog }) => {
  const sc = WORKFLOW_STATUS_STYLES[workflow.status];

  // Build real daily activity from execution log (last 7 days)
  const dailyActivity = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentEntries = executionLog.filter(e => new Date(e.timestamp).getTime() >= sevenDaysAgo);

    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const entry of recentEntries) {
      const d = new Date(entry.timestamp);
      // getDay: 0=Sun..6=Sat -> shift to Mon=0..Sun=6
      const dayIdx = (d.getDay() + 6) % 7;
      buckets[dayIdx]++;
    }
    return buckets;
  }, [executionLog]);

  const maxActivity = Math.max(...dailyActivity, 1);
  const hasActivity = dailyActivity.some(v => v > 0);

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Workflow Analytics</h3>
        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${sc.bg} ${sc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
          <span>{workflow.status}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-3xl font-black text-white">{workflow.stats.leadsProcessed.toLocaleString()}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Leads Processed</p>
        </div>
        <div>
          <p className="text-3xl font-black text-white">
            {workflow.stats.conversionRate}%
            <span className="text-emerald-400 text-sm font-bold ml-1.5">
              <TrendUpIcon className="w-3.5 h-3.5 inline" /> 2.1% from manual
            </span>
          </p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Conversion Rate</p>
        </div>
        <div>
          <p className="text-3xl font-black text-white">{workflow.stats.timeSavedHrs} hrs</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Time Saved This Month</p>
        </div>
        <div>
          <p className="text-3xl font-black text-emerald-400">{workflow.stats.roi}%</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">ROI</p>
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-slate-700">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span className="font-semibold">Processing activity (last 7 days)</span>
          <span className="font-bold text-slate-400">
            {hasActivity
              ? `${Math.round(dailyActivity.reduce((a, b) => a + b, 0) / 7)} avg/day`
              : 'No activity yet'}
          </span>
        </div>
        <div className="flex items-end space-x-1 h-10">
          {dailyActivity.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors"
              style={{ height: hasActivity ? `${(v / maxActivity) * 100}%` : '4px' }}
            ></div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          {DAY_LABELS.map(d => <span key={d}>{d}</span>)}
        </div>
      </div>
    </div>
  );
};
