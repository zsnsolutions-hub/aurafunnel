import React from 'react';
import { Drawer } from '../ui/Drawer';
import { ScoreGauge } from './ScoreGauge';
import { CheckIcon, XIcon, AlertTriangleIcon, ArrowRightIcon, SparklesIcon } from '../Icons';
import type { WorkflowHealth } from './types';

interface HealthPanelDrawerProps {
  open: boolean;
  onClose: () => void;
  workflowHealth: WorkflowHealth;
}

const RECOMMENDATIONS: Record<string, string> = {
  'Branching Logic': 'Add condition nodes for smarter lead routing.',
  'AI Features': 'Enable AI personalization on action nodes for better engagement.',
  'Error Handling': 'Add fallback actions to protect against step failures.',
  'Complexity': 'Consider adding more steps for a more robust workflow.',
  'Trigger Setup': 'Add a trigger node to start your workflow.',
  'Action Steps': 'Add at least one action step to perform operations.',
};

const getStatusIcon = (status: 'pass' | 'fail' | 'warn') => {
  switch (status) {
    case 'pass': return <CheckIcon className="w-4 h-4 text-emerald-500" />;
    case 'fail': return <XIcon className="w-4 h-4 text-rose-500" />;
    case 'warn': return <AlertTriangleIcon className="w-4 h-4 text-amber-500" />;
  }
};

const getStatusColor = (status: 'pass' | 'fail' | 'warn') => {
  switch (status) {
    case 'pass': return 'bg-emerald-500';
    case 'fail': return 'bg-rose-500';
    case 'warn': return 'bg-amber-500';
  }
};

export const HealthPanelDrawer: React.FC<HealthPanelDrawerProps> = ({ open, onClose, workflowHealth }) => {
  const score = workflowHealth.score;
  const statusText = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Work';
  const statusColor = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';

  const nonPassMetrics = workflowHealth.metrics.filter(m => m.status !== 'pass');

  return (
    <Drawer open={open} onClose={onClose} title="Workflow Health">
      <div className="space-y-6">
        {/* Score Circle */}
        <div className="flex flex-col items-center py-4">
          <ScoreGauge value={score} max={100} size={128} label="/100" />
          <div className={`mt-3 text-lg font-bold ${statusColor}`}>{statusText}</div>
          <div className="text-xs text-slate-400 font-medium">Overall Health Score</div>
        </div>

        {/* Metric Breakdown */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metric Breakdown</div>
          {workflowHealth.metrics.map((metric, idx) => (
            <div key={idx} className="border border-gray-100 rounded-xl p-3.5 bg-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(metric.status)}
                  <span className="text-sm font-semibold text-slate-800">{metric.label}</span>
                </div>
                <span className="text-xs font-bold text-slate-600">{metric.score}/{metric.max}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getStatusColor(metric.status)}`}
                  style={{ width: `${metric.max > 0 ? (metric.score / metric.max) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        {nonPassMetrics.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recommendations</span>
            </div>
            {nonPassMetrics.map((metric, idx) => {
              const recommendation = RECOMMENDATIONS[metric.label];
              if (!recommendation) return null;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 border border-amber-100 bg-amber-50/50 rounded-xl p-3.5"
                >
                  <ArrowRightIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{metric.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{recommendation}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
};
