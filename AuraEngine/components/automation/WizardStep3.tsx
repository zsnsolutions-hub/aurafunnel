import React from 'react';
import {
  ArrowLeftIcon, ArrowRightIcon, BoltIcon, ZapIcon, GitBranchIcon, ClockIcon,
} from '../Icons';
import { NODE_TYPE_META, TRIGGER_OPTIONS, ACTION_OPTIONS, EMAIL_TEMPLATES, OPERATOR_OPTIONS } from './constants';
import type { Workflow, NodeType } from './types';

const getNodeIcon = (type: NodeType) => {
  switch (type) {
    case 'trigger': return <BoltIcon className="w-4 h-4" />;
    case 'action': return <ZapIcon className="w-4 h-4" />;
    case 'condition': return <GitBranchIcon className="w-4 h-4" />;
    case 'wait': return <ClockIcon className="w-4 h-4" />;
  }
};

interface WizardStep3Props {
  workflow: Workflow;
  onBack: () => void;
  onNext: () => void;
  onEditNode: (nodeId: string) => void;
}

export const WizardStep3: React.FC<WizardStep3Props> = ({
  workflow,
  onBack,
  onNext,
  onEditNode,
}) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-black text-slate-900 font-heading">Configure Each Step</h2>
        <p className="text-sm text-slate-400 mt-1">Review and fine-tune settings for every step in your workflow.</p>
      </div>
      <div className="flex items-center space-x-2">
        <button onClick={onBack} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
          <ArrowLeftIcon className="w-3.5 h-3.5" /><span>Back</span>
        </button>
        <button onClick={onNext} className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
          <span>Next: Send &amp; Activate</span><ArrowRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div className="px-8 py-6 space-y-4 max-h-[65vh] overflow-y-auto">
      {workflow.nodes.map((node, idx) => {
        const meta = NODE_TYPE_META[node.type];
        return (
          <div key={node.id} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className={`px-5 py-3 flex items-center space-x-3 ${idx === 0 ? 'bg-indigo-50' : 'bg-slate-50'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bgClass}`}>
                {getNodeIcon(node.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider text-${meta.color}-600`}>Step {idx + 1}: {meta.label}</span>
                </div>
                <p className="text-sm font-bold text-slate-800">{node.title}</p>
              </div>
              {node.config.aiPersonalization && <span className="px-2 py-0.5 bg-violet-100 text-violet-600 rounded-full text-[9px] font-black">AI Enabled</span>}
              {node.config.fallbackEnabled && <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full text-[9px] font-black">Fallback</span>}
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {node.type === 'trigger' && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Trigger Event</p>
                    <p className="text-sm text-slate-700 font-semibold">{TRIGGER_OPTIONS.find(t => t.type === node.config.triggerType)?.label || 'Not set'}</p>
                  </div>
                )}
                {node.type === 'action' && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Action</p>
                      <p className="text-sm text-slate-700 font-semibold">{ACTION_OPTIONS.find(a => a.type === (node.config.actionType as string))?.label || 'Send Email'}</p>
                    </div>
                    {(node.config.actionType as string || 'send_email') === 'send_email' && (
                      <>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Template</p>
                          <p className="text-sm text-slate-700 font-semibold">{EMAIL_TEMPLATES.find(t => t.id === node.config.template)?.label || 'None'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Timing</p>
                          <p className="text-sm text-slate-700 font-semibold capitalize">{(node.config.timing as string || 'immediate').replace('_', ' ')}</p>
                        </div>
                      </>
                    )}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">AI</p>
                      <p className={`text-sm font-semibold ${node.config.aiPersonalization ? 'text-violet-600' : 'text-slate-400'}`}>
                        {node.config.aiPersonalization ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Fallback</p>
                      <p className={`text-sm font-semibold ${node.config.fallbackEnabled ? 'text-amber-600' : 'text-slate-400'}`}>
                        {node.config.fallbackEnabled ? (node.config.fallbackAction as string || 'create_task').replace('_', ' ') : 'None'}
                      </p>
                    </div>
                  </>
                )}
                {node.type === 'condition' && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Field</p>
                      <p className="text-sm text-slate-700 font-semibold capitalize">{(node.config.field as string || 'score').replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Condition</p>
                      <p className="text-sm text-slate-700 font-semibold">
                        {OPERATOR_OPTIONS.find(o => o.value === node.config.operator)?.label} {node.config.value}
                      </p>
                    </div>
                  </>
                )}
                {node.type === 'wait' && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Duration</p>
                    <p className="text-sm text-slate-700 font-semibold">{node.config.days} day{(node.config.days as number) !== 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => onEditNode(node.id)}
                className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                Edit in builder &rarr;
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
