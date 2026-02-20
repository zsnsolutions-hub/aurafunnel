import React from 'react';
import { Drawer } from '../ui/Drawer';
import { BoltIcon, ZapIcon, GitBranchIcon, ClockIcon } from '../Icons';
import { NODE_TYPE_META } from './constants';
import type { NodePerformanceMetric, WorkflowNode, NodeType } from './types';

interface NodeAnalyticsDrawerProps {
  open: boolean;
  onClose: () => void;
  workflowName: string;
  nodePerformance: NodePerformanceMetric[];
  workflowNodes: WorkflowNode[];
}

const getNodeIcon = (type: NodeType) => {
  switch (type) {
    case 'trigger': return <BoltIcon className="w-4 h-4" />;
    case 'action': return <ZapIcon className="w-4 h-4" />;
    case 'condition': return <GitBranchIcon className="w-4 h-4" />;
    case 'wait': return <ClockIcon className="w-4 h-4" />;
  }
};

export const NodeAnalyticsDrawer: React.FC<NodeAnalyticsDrawerProps> = ({ open, onClose, workflowName, nodePerformance, workflowNodes }) => {
  const totalNodes = workflowNodes.length;
  const avgSuccessRate = nodePerformance.length > 0
    ? Math.round(nodePerformance.reduce((sum, n) => sum + n.successRate, 0) / nodePerformance.length)
    : 0;
  const avgDuration = nodePerformance.length > 0
    ? Math.round(nodePerformance.reduce((sum, n) => sum + n.avgDuration, 0) / nodePerformance.length)
    : 0;

  return (
    <Drawer open={open} onClose={onClose} title="Node Analytics">
      <div className="space-y-5">
        {/* Workflow Name */}
        <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{workflowName}</div>

        {/* Pipeline Summary */}
        <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Pipeline Summary</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-xl font-black text-slate-800">{totalNodes}</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Nodes</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-emerald-600">{avgSuccessRate}%</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Success %</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-violet-600">{avgDuration}ms</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Duration</div>
            </div>
          </div>
        </div>

        {/* Per-node Cards */}
        <div className="space-y-3">
          {nodePerformance.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">No performance data available.</div>
          )}
          {nodePerformance.map((node, idx) => {
            const meta = NODE_TYPE_META[node.nodeType];
            const successBarWidth = Math.max(node.successRate, 2);
            const lastRunAgo = Math.round((Date.now() - new Date(node.lastRun).getTime()) / 60000);
            const lastRunText = lastRunAgo < 60 ? `${lastRunAgo}m ago` : `${Math.round(lastRunAgo / 60)}h ago`;

            return (
              <div
                key={idx}
                className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors duration-150 bg-white"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${meta.bgClass}`}>
                    {getNodeIcon(node.nodeType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{node.nodeTitle}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{meta.label}</div>
                  </div>
                </div>

                {/* Success Rate Bar */}
                <div className="mb-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-slate-500">Success Rate</span>
                    <span className="text-[10px] font-bold text-emerald-600">{node.successRate}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${successBarWidth}%` }}
                    />
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span><span className="font-semibold text-slate-700">{node.executions}</span> executions</span>
                  <span className="text-slate-300">&middot;</span>
                  <span><span className="font-semibold text-slate-700">{node.avgDuration}ms</span> avg</span>
                  <span className="text-slate-300">&middot;</span>
                  <span className="text-slate-400">{lastRunText}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
};
