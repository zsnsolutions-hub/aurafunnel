import React from 'react';
import { Drawer } from '../ui/Drawer';
import type { ExecutionLogEntry } from './types';
import { EXECUTION_STATUS_STYLES } from './constants';

interface ExecutionLogDrawerProps {
  open: boolean;
  onClose: () => void;
  executionLog: ExecutionLogEntry[];
  onRefresh: () => void;
}

export const ExecutionLogDrawer: React.FC<ExecutionLogDrawerProps> = ({ open, onClose, executionLog, onRefresh }) => {
  const totalCount = executionLog.length;
  const successCount = executionLog.filter(e => e.status === 'success').length;
  const failedCount = executionLog.filter(e => e.status === 'failed').length;
  const runningCount = executionLog.filter(e => e.status === 'running').length;

  const summaryCards = [
    { label: 'Total', value: totalCount, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
    { label: 'Success', value: successCount, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Failed', value: failedCount, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
    { label: 'Running', value: runningCount, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  ];

  return (
    <Drawer open={open} onClose={onClose} title="Execution Log">
      <div className="space-y-5">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map(card => (
            <div key={card.label} className={`${card.bg} border ${card.border} rounded-xl p-3 text-center`}>
              <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{card.label}</div>
            </div>
          ))}
        </div>

        {/* Refresh Button */}
        <div className="flex justify-end">
          <button
            onClick={onRefresh}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors duration-150"
          >
            Refresh
          </button>
        </div>

        {/* Log Entries */}
        <div className="space-y-2">
          {executionLog.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">No execution logs yet.</div>
          )}
          {executionLog.map(entry => {
            const style = EXECUTION_STATUS_STYLES[entry.status];
            const ago = Math.round((Date.now() - new Date(entry.timestamp).getTime()) / 60000);
            const agoText = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;

            return (
              <div
                key={entry.id}
                className="border border-gray-100 rounded-xl p-3.5 hover:border-gray-200 transition-colors duration-150 bg-white"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">{agoText}</span>
                </div>
                <div className="text-sm font-semibold text-slate-800 mb-0.5">{entry.step}</div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{entry.leadName}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span>{entry.workflowName}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span>{entry.duration}ms</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
};
