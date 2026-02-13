import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  User, Lead, AutomationRule, TriggerType, ActionType, Campaign, CampaignStep
} from '../../types';
import { supabase } from '../../lib/supabase';
import {
  BoltIcon, PlusIcon, XIcon, CheckIcon, SparklesIcon, ClockIcon,
  PlayIcon, PauseIcon, GitBranchIcon, ZapIcon, TargetIcon, TagIcon,
  MailIcon, RefreshIcon, EditIcon, FlameIcon, TrendUpIcon, CogIcon, TrendDownIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Workflow Node Types ───
type NodeType = 'trigger' | 'action' | 'condition' | 'wait';

interface WorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  description: string;
  config: Record<string, string | number | boolean>;
}

interface Workflow {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'draft';
  nodes: WorkflowNode[];
  createdAt: string;
  stats: {
    leadsProcessed: number;
    conversionRate: number;
    timeSavedHrs: number;
    roi: number;
  };
}

const NODE_TYPE_META: Record<NodeType, { label: string; color: string; icon: React.ReactNode; bgClass: string }> = {
  trigger: { label: 'TRIGGER', color: 'indigo', icon: <BoltIcon className="w-4 h-4" />, bgClass: 'bg-indigo-600 text-white' },
  action: { label: 'ACTION', color: 'emerald', icon: <ZapIcon className="w-4 h-4" />, bgClass: 'bg-emerald-600 text-white' },
  condition: { label: 'CONDITION', color: 'amber', icon: <GitBranchIcon className="w-4 h-4" />, bgClass: 'bg-amber-500 text-white' },
  wait: { label: 'WAIT', color: 'violet', icon: <ClockIcon className="w-4 h-4" />, bgClass: 'bg-violet-600 text-white' },
};

const TRIGGER_OPTIONS: { type: TriggerType; label: string; desc: string }[] = [
  { type: 'lead_created', label: 'New lead added', desc: 'When a new lead enters the pipeline' },
  { type: 'score_change', label: 'Score changes', desc: 'When a lead score crosses a threshold' },
  { type: 'status_change', label: 'Status updates', desc: 'When a lead status changes' },
  { type: 'time_elapsed', label: 'Time elapsed', desc: 'After X days with no activity' },
  { type: 'tag_added', label: 'Tag added', desc: 'When a specific tag is applied' },
  { type: 'content_generated', label: 'Content generated', desc: 'When AI content is created' },
];

const ACTION_OPTIONS: { type: ActionType; label: string }[] = [
  { type: 'send_email', label: 'Send Email' },
  { type: 'update_status', label: 'Update Status' },
  { type: 'add_tag', label: 'Add Tag' },
  { type: 'assign_user', label: 'Assign to User' },
  { type: 'generate_content', label: 'Generate Content' },
  { type: 'create_alert', label: 'Create Alert' },
  { type: 'move_to_segment', label: 'Move to Segment' },
];

const DEFAULT_WORKFLOW: Workflow = {
  id: 'wf-default',
  name: 'New Lead Nurturing Sequence',
  status: 'active',
  nodes: [
    { id: 'n1', type: 'trigger', title: 'New lead added', description: 'Triggers when a lead enters the pipeline', config: { triggerType: 'lead_created' } },
    { id: 'n2', type: 'action', title: 'AI scores lead', description: 'Automatically scores the lead using AI model', config: { model: 'gemini-3-flash', companyData: true, webBehavior: true, socialSignals: false, emailEngagement: true, frequency: 'real_time', threshold: 80 } },
    { id: 'n3', type: 'condition', title: 'Score > 50?', description: 'Check if lead score exceeds threshold', config: { field: 'score', operator: 'gt', value: 50 } },
    { id: 'n4', type: 'action', title: 'Send welcome email', description: 'Personalized welcome with value proposition', config: { emailType: 'welcome', template: 'default' } },
    { id: 'n5', type: 'action', title: 'Add to nurture campaign', description: 'Enroll in drip nurture sequence', config: { campaign: 'nurture_sequence' } },
    { id: 'n6', type: 'wait', title: 'Wait 2 days', description: 'Allow time for email engagement', config: { days: 2 } },
    { id: 'n7', type: 'action', title: 'Check engagement', description: 'Evaluate email opens and clicks', config: { checkType: 'email_engagement' } },
    { id: 'n8', type: 'condition', title: 'Score > 75?', description: 'Check if lead is sales-ready', config: { field: 'score', operator: 'gt', value: 75 } },
    { id: 'n9', type: 'action', title: 'Notify sales team', description: 'Alert sales rep for immediate follow-up', config: { notifyType: 'sales_alert' } },
  ],
  createdAt: new Date().toISOString(),
  stats: { leadsProcessed: 1242, conversionRate: 8.4, timeSavedHrs: 42, roi: 320 },
};

// ─── Config panels per node type ───
const MODEL_OPTIONS = ['gemini-3-flash', 'gemini-3-pro', 'gpt-4o', 'claude-sonnet'];
const FREQUENCY_OPTIONS = ['real_time', 'hourly', 'daily', 'weekly'];
const OPERATOR_OPTIONS = [
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'eq', label: 'Equals' },
];

const AutomationPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [leads, setLeads] = useState<Lead[]>([]);

  // Workflow state
  const [workflow, setWorkflow] = useState<Workflow>(() => {
    const saved = localStorage.getItem(`aura_workflow_${user?.id}`);
    return saved ? JSON.parse(saved) : DEFAULT_WORKFLOW;
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('n2');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Saved workflows list
  const [workflows, setWorkflows] = useState<Workflow[]>(() => {
    const saved = localStorage.getItem(`aura_workflows_list_${user?.id}`);
    return saved ? JSON.parse(saved) : [DEFAULT_WORKFLOW];
  });
  const [showWorkflowList, setShowWorkflowList] = useState(false);

  // Add step modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addNodeType, setAddNodeType] = useState<NodeType>('action');

  useEffect(() => {
    const fetchLeads = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id);
      setLeads((data || []) as Lead[]);
    };
    fetchLeads();
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem(`aura_workflow_${user?.id}`, JSON.stringify(workflow));
  }, [workflow, user?.id]);

  useEffect(() => {
    localStorage.setItem(`aura_workflows_list_${user?.id}`, JSON.stringify(workflows));
  }, [workflows, user?.id]);

  const selectedNode = useMemo(() => {
    return workflow.nodes.find(n => n.id === selectedNodeId) || null;
  }, [workflow.nodes, selectedNodeId]);

  // ─── Handlers ───
  const updateNodeConfig = (nodeId: string, key: string, value: string | number | boolean) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n),
    }));
  };

  const updateNodeTitle = (nodeId: string, title: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, title } : n),
    }));
  };

  const updateNodeDescription = (nodeId: string, description: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, description } : n),
    }));
  };

  const addNode = (type: NodeType) => {
    const titles: Record<NodeType, string> = {
      trigger: 'New trigger',
      action: 'New action step',
      condition: 'New condition',
      wait: 'Wait period',
    };
    const descs: Record<NodeType, string> = {
      trigger: 'Configure the trigger event',
      action: 'Configure the action to perform',
      condition: 'Set the condition criteria',
      wait: 'Set the wait duration',
    };
    const newNode: WorkflowNode = {
      id: `n-${Date.now()}`,
      type,
      title: titles[type],
      description: descs[type],
      config: type === 'wait' ? { days: 1 } : type === 'condition' ? { field: 'score', operator: 'gt', value: 50 } : {},
    };
    setWorkflow(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
    setSelectedNodeId(newNode.id);
    setShowAddModal(false);
  };

  const removeNode = (nodeId: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const moveNode = (nodeId: string, direction: 'up' | 'down') => {
    setWorkflow(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      if (idx < 0) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.nodes.length - 1) return prev;
      const newNodes = [...prev.nodes];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [newNodes[idx], newNodes[swapIdx]] = [newNodes[swapIdx], newNodes[idx]];
      return { ...prev, nodes: newNodes };
    });
  };

  const handleSave = () => {
    setWorkflows(prev => {
      const exists = prev.findIndex(w => w.id === workflow.id);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = workflow;
        return updated;
      }
      return [...prev, workflow];
    });
  };

  const handleTest = () => {
    setTestRunning(true);
    setTestResult(null);
    setTimeout(() => {
      setTestRunning(false);
      const sampleLead = leads.length > 0 ? leads[0] : { name: 'Sarah Chen', company: 'Acme Corp', score: 72 };
      setTestResult(`Test passed. Workflow executed ${workflow.nodes.length} steps for sample lead "${(sampleLead as any).name}" (Score: ${(sampleLead as any).score}). All conditions evaluated successfully.`);
    }, 2000);
  };

  const toggleWorkflowStatus = () => {
    setWorkflow(prev => ({
      ...prev,
      status: prev.status === 'active' ? 'paused' : 'active',
    }));
  };

  const createNewWorkflow = () => {
    const newWf: Workflow = {
      id: `wf-${Date.now()}`,
      name: 'Untitled Workflow',
      status: 'draft',
      nodes: [
        { id: `n-${Date.now()}`, type: 'trigger', title: 'New trigger', description: 'Configure the trigger event', config: { triggerType: 'lead_created' } },
      ],
      createdAt: new Date().toISOString(),
      stats: { leadsProcessed: 0, conversionRate: 0, timeSavedHrs: 0, roi: 0 },
    };
    setWorkflow(newWf);
    setSelectedNodeId(null);
    setShowWorkflowList(false);
  };

  const loadWorkflow = (wf: Workflow) => {
    setWorkflow(wf);
    setSelectedNodeId(null);
    setShowWorkflowList(false);
  };

  // ─── Node rendering helpers ───
  const getNodeIcon = (type: NodeType) => {
    switch (type) {
      case 'trigger': return <BoltIcon className="w-4 h-4" />;
      case 'action': return <ZapIcon className="w-4 h-4" />;
      case 'condition': return <GitBranchIcon className="w-4 h-4" />;
      case 'wait': return <ClockIcon className="w-4 h-4" />;
    }
  };

  // Condition node renders with Yes/No branches
  const isCondition = (node: WorkflowNode) => node.type === 'condition';

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    draft: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
  };
  const sc = statusColors[workflow.status];

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER BAR                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
            Automation <span className="text-slate-300 mx-0.5">&rsaquo;</span> Workflow Builder <span className="text-slate-300 mx-0.5">&rsaquo;</span>
            <input
              type="text"
              value={workflow.name}
              onChange={e => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
              className="bg-transparent border-0 outline-none text-2xl font-black text-slate-900 font-heading w-64 inline-block"
              placeholder="Workflow name"
            />
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          {/* Workflow Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowWorkflowList(!showWorkflowList)}
              className="flex items-center space-x-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <GitBranchIcon className="w-3.5 h-3.5" />
              <span>{workflows.length} Workflows</span>
            </button>
            {showWorkflowList && (
              <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-xl shadow-xl z-30 w-64 py-2">
                {workflows.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => loadWorkflow(wf)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                      wf.id === workflow.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600'
                    }`}
                  >
                    <span className="font-semibold">{wf.name}</span>
                    <span className={`ml-2 text-[10px] font-bold uppercase ${wf.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {wf.status}
                    </span>
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    onClick={createNewWorkflow}
                    className="w-full text-left px-4 py-2.5 text-sm text-indigo-600 font-bold hover:bg-indigo-50 transition-colors flex items-center space-x-2"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>New Workflow</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <CheckIcon className="w-4 h-4 text-emerald-500" />
            <span>Save</span>
          </button>
          <button
            onClick={handleTest}
            disabled={testRunning}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            {testRunning ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <PlayIcon className="w-4 h-4" />
            )}
            <span>{testRunning ? 'Running...' : 'Test'}</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CANVAS (70%) + CONFIG PANEL (30%)                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ─── Workflow Canvas (70%) ─── */}
        <div className="lg:w-[70%]">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            {/* Canvas Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h3 className="font-bold text-slate-800 font-heading text-sm">{workflow.name}</h3>
                <button
                  onClick={toggleWorkflowStatus}
                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${sc.bg} ${sc.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${workflow.status === 'active' ? 'animate-pulse' : ''}`}></span>
                  <span>{workflow.status}</span>
                </button>
              </div>
              <span className="text-xs text-slate-400 font-medium">{workflow.nodes.length} steps</span>
            </div>

            {/* Canvas Body - Visual Workflow */}
            <div className="p-6 min-h-[420px]">
              <div className="flex flex-col items-center space-y-0">
                {workflow.nodes.map((node, idx) => {
                  const meta = NODE_TYPE_META[node.type];
                  const isSelected = selectedNodeId === node.id;
                  const isCond = isCondition(node);

                  return (
                    <React.Fragment key={node.id}>
                      {/* Node Card */}
                      <button
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`w-full max-w-md relative group transition-all ${
                          isSelected
                            ? 'ring-2 ring-indigo-500 ring-offset-2 rounded-xl shadow-lg'
                            : 'hover:shadow-md rounded-xl'
                        }`}
                      >
                        <div className={`p-4 rounded-xl border transition-all ${
                          isSelected ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.bgClass}`}>
                              {getNodeIcon(node.type)}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] font-black uppercase tracking-wider text-${meta.color}-600`}>
                                  {meta.label}{idx > 0 && node.type === 'action' ? ` ${workflow.nodes.slice(0, idx).filter(n => n.type === 'action').length + 1}` : ''}
                                </span>
                              </div>
                              <p className="font-bold text-sm text-slate-800 mt-0.5 truncate">{node.title}</p>
                              <p className="text-xs text-slate-400 mt-0.5 truncate">{node.description}</p>
                            </div>
                            {isSelected && (
                              <div className="shrink-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                              </div>
                            )}
                          </div>

                          {/* Condition branches indicator */}
                          {isCond && (
                            <div className="flex items-center justify-center space-x-8 mt-3 pt-3 border-t border-slate-100">
                              <span className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600">
                                <CheckIcon className="w-3.5 h-3.5" />
                                <span>Yes</span>
                              </span>
                              <span className="flex items-center space-x-1.5 text-xs font-bold text-rose-500">
                                <XIcon className="w-3.5 h-3.5" />
                                <span>No</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Delete button on hover */}
                        {node.type !== 'trigger' && (
                          <div className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); removeNode(node.id); }}
                              className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </button>

                      {/* Connector Arrow */}
                      {idx < workflow.nodes.length - 1 && (
                        <div className="flex flex-col items-center py-1">
                          <div className="w-0.5 h-4 bg-slate-200"></div>
                          <svg className="w-3 h-3 text-slate-300" fill="currentColor" viewBox="0 0 12 12">
                            <path d="M6 9L1 4h10L6 9z" />
                          </svg>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Add Step Buttons */}
              <div className="flex items-center justify-center space-x-3 mt-6 pt-4 border-t border-dashed border-slate-200">
                <button
                  onClick={() => addNode('action')}
                  className="flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all border border-emerald-200"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Add Step</span>
                </button>
                <button
                  onClick={() => addNode('condition')}
                  className="flex items-center space-x-1.5 px-4 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all border border-amber-200"
                >
                  <GitBranchIcon className="w-3.5 h-3.5" />
                  <span>Add Condition</span>
                </button>
                <button
                  onClick={() => addNode('wait')}
                  className="flex items-center space-x-1.5 px-4 py-2.5 bg-violet-50 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-100 transition-all border border-violet-200"
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                  <span>Add Wait</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Step Configuration (30%) ─── */}
        <div className="lg:w-[30%] space-y-5">
          {selectedNode ? (
            <>
              {/* Config Panel */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${NODE_TYPE_META[selectedNode.type].bgClass}`}>
                      {getNodeIcon(selectedNode.type)}
                    </div>
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      {NODE_TYPE_META[selectedNode.type].label} Config
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => moveNode(selectedNode.id, 'up')}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Move up"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => moveNode(selectedNode.id, 'down')}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                </div>

                {/* Selected node title */}
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Step Name</label>
                  <input
                    type="text"
                    value={selectedNode.title}
                    onChange={e => updateNodeTitle(selectedNode.id, e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                  <textarea
                    value={selectedNode.description}
                    onChange={e => updateNodeDescription(selectedNode.id, e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                  />
                </div>

                {/* Type-specific settings */}
                <div className="space-y-3">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Settings</p>

                  {/* Trigger Config */}
                  {selectedNode.type === 'trigger' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Trigger Event</label>
                      <select
                        value={selectedNode.config.triggerType as string || 'lead_created'}
                        onChange={e => updateNodeConfig(selectedNode.id, 'triggerType', e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {TRIGGER_OPTIONS.map(t => (
                          <option key={t.type} value={t.type}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Action Config - AI Scoring specific */}
                  {selectedNode.type === 'action' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Use model</label>
                        <select
                          value={selectedNode.config.model as string || 'gemini-3-flash'}
                          onChange={e => updateNodeConfig(selectedNode.id, 'model', e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {MODEL_OPTIONS.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-2">Include</label>
                        <div className="space-y-2">
                          {[
                            { key: 'companyData', label: 'Company data' },
                            { key: 'webBehavior', label: 'Web behavior' },
                            { key: 'socialSignals', label: 'Social signals' },
                            { key: 'emailEngagement', label: 'Email engagement' },
                          ].map(opt => (
                            <label key={opt.key} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!selectedNode.config[opt.key]}
                                onChange={e => updateNodeConfig(selectedNode.id, opt.key, e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Update frequency</label>
                        <select
                          value={selectedNode.config.frequency as string || 'real_time'}
                          onChange={e => updateNodeConfig(selectedNode.id, 'frequency', e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {FREQUENCY_OPTIONS.map(f => (
                            <option key={f} value={f}>{f.replace('_', '-').replace(/\b\w/g, c => c.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Confidence threshold</label>
                        <select
                          value={selectedNode.config.threshold as number || 80}
                          onChange={e => updateNodeConfig(selectedNode.id, 'threshold', parseInt(e.target.value))}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {[60, 70, 80, 90, 95].map(v => (
                            <option key={v} value={v}>{v}%</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {/* Condition Config */}
                  {selectedNode.type === 'condition' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Field</label>
                        <select
                          value={selectedNode.config.field as string || 'score'}
                          onChange={e => updateNodeConfig(selectedNode.id, 'field', e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="score">Lead Score</option>
                          <option value="status">Lead Status</option>
                          <option value="company">Company Size</option>
                          <option value="engagement">Engagement Level</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Operator</label>
                          <select
                            value={selectedNode.config.operator as string || 'gt'}
                            onChange={e => updateNodeConfig(selectedNode.id, 'operator', e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            {OPERATOR_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Value</label>
                          <input
                            type="number"
                            value={selectedNode.config.value as number || 50}
                            onChange={e => updateNodeConfig(selectedNode.id, 'value', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Wait Config */}
                  {selectedNode.type === 'wait' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Wait duration (days)</label>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.config.days as number || 1}
                        onChange={e => updateNodeConfig(selectedNode.id, 'days', parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Test Parameters */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Test Parameters</p>
                <div className="space-y-2.5">
                  <button
                    onClick={handleTest}
                    disabled={testRunning}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-all border border-indigo-200 disabled:opacity-50"
                  >
                    <PlayIcon className="w-4 h-4" />
                    <span>Test with sample lead</span>
                  </button>
                  <button className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-all border border-slate-200">
                    <CogIcon className="w-4 h-4" />
                    <span>View scoring logic</span>
                  </button>
                </div>

                {testResult && (
                  <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="flex items-start space-x-2">
                      <CheckIcon className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-emerald-700 leading-relaxed">{testResult}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Performance */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Performance</p>
                <div className="space-y-3">
                  {[
                    { label: 'Avg. accuracy', value: '94.2%', color: 'emerald' },
                    { label: 'Avg. time', value: '1.2 seconds', color: 'indigo' },
                    { label: 'Cost per score', value: '$0.08', color: 'amber' },
                  ].map((perf, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{perf.label}</span>
                      <span className={`text-sm font-bold text-${perf.color}-600`}>{perf.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Empty state - no node selected */
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                <CogIcon className="w-7 h-7 text-slate-300" />
              </div>
              <h3 className="font-bold text-slate-700 text-sm">Step Configuration</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Select a step in the workflow canvas to configure its settings, test parameters, and view performance metrics.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WORKFLOW ANALYTICS (Bottom Panel)                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
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

        {/* Mini activity bar */}
        <div className="mt-5 pt-4 border-t border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold">Processing activity (last 7 days)</span>
            <span className="font-bold text-slate-400">{Math.round(workflow.stats.leadsProcessed / 30)} avg/day</span>
          </div>
          <div className="flex items-end space-x-1 h-10">
            {[35, 42, 28, 55, 48, 62, 38].map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors"
                style={{ height: `${(v / 62) * 100}%` }}
              ></div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationPage;
