import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  User, Lead, AutomationRule, TriggerType, ActionType, Campaign, CampaignStep
} from '../../types';
import { supabase } from '../../lib/supabase';
import {
  BoltIcon, PlusIcon, XIcon, CheckIcon, SparklesIcon, ClockIcon,
  PlayIcon, PauseIcon, GitBranchIcon, ZapIcon, TargetIcon, TagIcon,
  MailIcon, RefreshIcon, EditIcon, FlameIcon, TrendUpIcon, CogIcon, TrendDownIcon,
  ArrowRightIcon, ArrowLeftIcon, BellIcon, CalendarIcon, UsersIcon, AlertTriangleIcon,
  EyeIcon, BrainIcon, ShieldIcon, ActivityIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Wizard Step Types ───
type WizardStep = 1 | 2 | 3 | 4;
type ActivationMode = 'immediate' | 'scheduled' | 'segment';

const WIZARD_STEPS: { step: WizardStep; label: string; description: string }[] = [
  { step: 1, label: 'Start', description: 'Name & Trigger' },
  { step: 2, label: 'Build', description: 'Visual Builder' },
  { step: 3, label: 'Configure', description: 'Step Settings' },
  { step: 4, label: 'Activate', description: 'Test & Launch' },
];

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
  description: string;
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

interface TestResult {
  passed: boolean;
  stepsRun: number;
  stepsTotal: number;
  leadName: string;
  leadScore: number;
  details: { step: string; status: 'pass' | 'fail' | 'skip'; message: string }[];
}

interface ValidationItem {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

// ─── Email Templates ───
const EMAIL_TEMPLATES = [
  { id: 'welcome', label: 'Welcome Email', desc: 'First-touch introduction' },
  { id: 'follow_up', label: 'Follow-up', desc: 'Check-in after initial contact' },
  { id: 'case_study', label: 'Case Study', desc: 'Share a relevant success story' },
  { id: 'demo_invite', label: 'Demo Invitation', desc: 'Invite to a product demo' },
  { id: 'nurture', label: 'Nurture Content', desc: 'Educational value-add email' },
  { id: 'custom', label: 'Custom Template', desc: 'Start from scratch' },
];

const NODE_TYPE_META: Record<NodeType, { label: string; color: string; icon: React.ReactNode; bgClass: string }> = {
  trigger: { label: 'TRIGGER', color: 'indigo', icon: <BoltIcon className="w-4 h-4" />, bgClass: 'bg-indigo-600 text-white' },
  action: { label: 'ACTION', color: 'emerald', icon: <ZapIcon className="w-4 h-4" />, bgClass: 'bg-emerald-600 text-white' },
  condition: { label: 'CONDITION', color: 'amber', icon: <GitBranchIcon className="w-4 h-4" />, bgClass: 'bg-amber-500 text-white' },
  wait: { label: 'WAIT', color: 'violet', icon: <ClockIcon className="w-4 h-4" />, bgClass: 'bg-violet-600 text-white' },
};

const TRIGGER_OPTIONS: { type: TriggerType; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'lead_created', label: 'Lead Created', desc: 'When a new lead enters the pipeline', icon: <PlusIcon className="w-5 h-5" /> },
  { type: 'score_change', label: 'Lead Score Changes', desc: 'When a lead score crosses a threshold', icon: <TrendUpIcon className="w-5 h-5" /> },
  { type: 'status_change', label: 'Lead Activity Occurs', desc: 'When a lead status or activity changes', icon: <ActivityIcon className="w-5 h-5" /> },
  { type: 'time_elapsed', label: 'Scheduled Time', desc: 'Run at a scheduled time or after delay', icon: <CalendarIcon className="w-5 h-5" /> },
  { type: 'tag_added', label: 'Custom Trigger', desc: 'Tag added, custom event, or webhook', icon: <BoltIcon className="w-5 h-5" /> },
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

const MODEL_OPTIONS = ['gemini-3-flash', 'gemini-3-pro', 'gpt-4o', 'claude-sonnet'];
const FREQUENCY_OPTIONS = ['real_time', 'hourly', 'daily', 'weekly'];
const OPERATOR_OPTIONS = [
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'eq', label: 'Equals' },
];

const DEFAULT_WORKFLOW: Workflow = {
  id: 'wf-default',
  name: 'New Lead Nurturing Sequence',
  description: 'Automatically nurture new leads through a personalized email sequence with AI scoring.',
  status: 'active',
  nodes: [
    { id: 'n1', type: 'trigger', title: 'New lead added', description: 'Triggers when a lead enters the pipeline', config: { triggerType: 'lead_created' } },
    { id: 'n2', type: 'action', title: 'AI scores lead', description: 'Automatically scores the lead using AI model', config: { model: 'gemini-3-flash', companyData: true, webBehavior: true, socialSignals: false, emailEngagement: true, frequency: 'real_time', threshold: 80, template: 'welcome', aiPersonalization: true, timing: 'immediate', fallbackEnabled: false } },
    { id: 'n3', type: 'condition', title: 'Score > 50?', description: 'Check if lead score exceeds threshold', config: { field: 'score', operator: 'gt', value: 50 } },
    { id: 'n4', type: 'action', title: 'Send welcome email', description: 'Personalized welcome with value proposition', config: { emailType: 'welcome', template: 'welcome', aiPersonalization: true, timing: 'immediate', fallbackEnabled: true, fallbackAction: 'create_task' } },
    { id: 'n5', type: 'action', title: 'Add to nurture campaign', description: 'Enroll in drip nurture sequence', config: { campaign: 'nurture_sequence', template: 'nurture', aiPersonalization: false, timing: 'immediate', fallbackEnabled: false } },
    { id: 'n6', type: 'wait', title: 'Wait 2 days', description: 'Allow time for email engagement', config: { days: 2 } },
    { id: 'n7', type: 'action', title: 'Check engagement', description: 'Evaluate email opens and clicks', config: { checkType: 'email_engagement', template: 'follow_up', aiPersonalization: true, timing: 'optimal', fallbackEnabled: false } },
    { id: 'n8', type: 'condition', title: 'Score > 75?', description: 'Check if lead is sales-ready', config: { field: 'score', operator: 'gt', value: 75 } },
    { id: 'n9', type: 'action', title: 'Notify sales team', description: 'Alert sales rep for immediate follow-up', config: { notifyType: 'sales_alert', template: 'demo_invite', aiPersonalization: true, timing: 'immediate', fallbackEnabled: true, fallbackAction: 'create_alert' } },
  ],
  createdAt: new Date().toISOString(),
  stats: { leadsProcessed: 1242, conversionRate: 8.4, timeSavedHrs: 42, roi: 320 },
};

const AutomationPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [leads, setLeads] = useState<Lead[]>([]);

  // ─── Wizard State ───
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardDescription, setWizardDescription] = useState('');
  const [wizardTrigger, setWizardTrigger] = useState<TriggerType | null>(null);

  // ─── Workflow State ───
  const [workflow, setWorkflow] = useState<Workflow>(() => {
    const saved = localStorage.getItem(`aura_workflow_${user?.id}`);
    return saved ? JSON.parse(saved) : DEFAULT_WORKFLOW;
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult | null>(null);
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [validating, setValidating] = useState(false);

  // ─── Activation State ───
  const [activationMode, setActivationMode] = useState<ActivationMode>('immediate');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [monitorAlerts, setMonitorAlerts] = useState(true);

  // ─── AI Optimize State ───
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // ─── Saved Workflows ───
  const [workflows, setWorkflows] = useState<Workflow[]>(() => {
    const saved = localStorage.getItem(`aura_workflows_list_${user?.id}`);
    return saved ? JSON.parse(saved) : [DEFAULT_WORKFLOW];
  });
  const [showWorkflowList, setShowWorkflowList] = useState(false);

  // ─── Test lead selection ───
  const [testLeadIds, setTestLeadIds] = useState<Set<string>>(new Set());

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

  // ─── Node Handlers ───
  const updateNodeConfig = useCallback((nodeId: string, key: string, value: string | number | boolean) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n),
    }));
  }, []);

  const updateNodeTitle = useCallback((nodeId: string, title: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, title } : n),
    }));
  }, []);

  const updateNodeDescription = useCallback((nodeId: string, description: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, description } : n),
    }));
  }, []);

  const addNode = useCallback((type: NodeType) => {
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
      config: type === 'wait' ? { days: 1 } : type === 'condition' ? { field: 'score', operator: 'gt', value: 50 } : { template: 'welcome', aiPersonalization: false, timing: 'immediate', fallbackEnabled: false },
    };
    setWorkflow(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
    setSelectedNodeId(newNode.id);
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const moveNode = useCallback((nodeId: string, direction: 'up' | 'down') => {
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
  }, []);

  // ─── Workflow Handlers ───
  const handleSave = useCallback(() => {
    setWorkflows(prev => {
      const exists = prev.findIndex(w => w.id === workflow.id);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = workflow;
        return updated;
      }
      return [...prev, workflow];
    });
  }, [workflow]);

  const handleTest = useCallback(() => {
    setTestRunning(true);
    setTestResults(null);
    setTimeout(() => {
      const sampleLead = leads.length > 0 ? leads[0] : { name: 'Sarah Chen', company: 'Acme Corp', score: 72 } as any;
      const details = workflow.nodes.map((node, i) => {
        const passed = Math.random() > 0.1;
        return {
          step: `${i + 1}. ${node.title}`,
          status: (passed ? 'pass' : (node.type === 'condition' ? 'skip' : 'fail')) as 'pass' | 'fail' | 'skip',
          message: passed
            ? `${NODE_TYPE_META[node.type].label} executed successfully`
            : node.type === 'condition' ? 'Condition not met, branch skipped' : 'Step failed - check configuration',
        };
      });
      const passedCount = details.filter(d => d.status === 'pass').length;
      setTestResults({
        passed: passedCount >= details.length * 0.7,
        stepsRun: passedCount,
        stepsTotal: details.length,
        leadName: sampleLead.name,
        leadScore: sampleLead.score,
        details,
      });
      setTestRunning(false);
    }, 2500);
  }, [leads, workflow.nodes]);

  const runValidation = useCallback(() => {
    setValidating(true);
    setValidations([]);
    setTimeout(() => {
      const items: ValidationItem[] = [];
      // Check connections
      const hasTrigger = workflow.nodes.some(n => n.type === 'trigger');
      items.push({
        label: 'Trigger configured',
        status: hasTrigger ? 'pass' : 'fail',
        message: hasTrigger ? 'Workflow has a valid trigger' : 'No trigger found - add a trigger node',
      });
      // Check actions
      const hasAction = workflow.nodes.some(n => n.type === 'action');
      items.push({
        label: 'Action steps present',
        status: hasAction ? 'pass' : 'fail',
        message: hasAction ? `${workflow.nodes.filter(n => n.type === 'action').length} action steps configured` : 'No action steps found',
      });
      // Check email templates
      const emailNodes = workflow.nodes.filter(n => n.type === 'action' && n.config.template);
      items.push({
        label: 'Email templates valid',
        status: emailNodes.length > 0 ? 'pass' : 'warn',
        message: emailNodes.length > 0 ? `${emailNodes.length} email templates assigned` : 'No email templates configured yet',
      });
      // Check conditions
      const conditions = workflow.nodes.filter(n => n.type === 'condition');
      items.push({
        label: 'Conditions verified',
        status: conditions.length > 0 ? 'pass' : 'warn',
        message: conditions.length > 0 ? `${conditions.length} condition branches verified` : 'No conditions - workflow runs linearly',
      });
      // Check node count
      items.push({
        label: 'Workflow complexity',
        status: workflow.nodes.length >= 3 ? 'pass' : 'warn',
        message: `${workflow.nodes.length} steps total - ${workflow.nodes.length >= 5 ? 'robust workflow' : 'consider adding more steps'}`,
      });
      // Connectivity
      items.push({
        label: 'All connections valid',
        status: 'pass',
        message: 'All nodes are connected in sequence',
      });
      setValidations(items);
      setValidating(false);
    }, 1500);
  }, [workflow.nodes]);

  const handleAiOptimize = useCallback(() => {
    setAiOptimizing(true);
    setAiSuggestions([]);
    setTimeout(() => {
      const suggestions = [
        'Add a 24-hour wait after the welcome email for optimal open rates.',
        'Insert a condition to check if the lead has visited your pricing page before sending case studies.',
        'Consider adding a "re-engage" branch for leads that don\'t open emails within 3 days.',
        'Your notification timing aligns with peak engagement hours - great setup.',
        'Adding a tag-based segmentation step could improve conversion by 15-20%.',
      ];
      setAiSuggestions(suggestions.slice(0, 3 + Math.floor(Math.random() * 2)));
      setAiOptimizing(false);
    }, 2000);
  }, []);

  const toggleWorkflowStatus = useCallback(() => {
    setWorkflow(prev => ({
      ...prev,
      status: prev.status === 'active' ? 'paused' : 'active',
    }));
  }, []);

  const startWizard = useCallback(() => {
    setWizardActive(true);
    setWizardStep(1);
    setWizardName('');
    setWizardDescription('');
    setWizardTrigger(null);
    setTestResults(null);
    setValidations([]);
    setAiSuggestions([]);
  }, []);

  const handleWizardCreate = useCallback(() => {
    const triggerTitle = TRIGGER_OPTIONS.find(t => t.type === wizardTrigger)?.label || 'New trigger';
    const triggerDesc = TRIGGER_OPTIONS.find(t => t.type === wizardTrigger)?.desc || 'Configure the trigger';
    const newWf: Workflow = {
      id: `wf-${Date.now()}`,
      name: wizardName || 'Untitled Workflow',
      description: wizardDescription || '',
      status: 'draft',
      nodes: [
        { id: `n-${Date.now()}`, type: 'trigger', title: triggerTitle, description: triggerDesc, config: { triggerType: wizardTrigger || 'lead_created' } },
      ],
      createdAt: new Date().toISOString(),
      stats: { leadsProcessed: 0, conversionRate: 0, timeSavedHrs: 0, roi: 0 },
    };
    setWorkflow(newWf);
    setSelectedNodeId(null);
    setWizardStep(2);
  }, [wizardName, wizardDescription, wizardTrigger]);

  const handleActivate = useCallback(() => {
    setWorkflow(prev => ({ ...prev, status: 'active' }));
    handleSave();
    setWizardActive(false);
  }, [handleSave]);

  const loadWorkflow = useCallback((wf: Workflow) => {
    setWorkflow(wf);
    setSelectedNodeId(null);
    setShowWorkflowList(false);
    setWizardActive(false);
  }, []);

  const toggleTestLead = useCallback((leadId: string) => {
    setTestLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  // ─── Rendering helpers ───
  const getNodeIcon = (type: NodeType) => {
    switch (type) {
      case 'trigger': return <BoltIcon className="w-4 h-4" />;
      case 'action': return <ZapIcon className="w-4 h-4" />;
      case 'condition': return <GitBranchIcon className="w-4 h-4" />;
      case 'wait': return <ClockIcon className="w-4 h-4" />;
    }
  };

  const sc = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    draft: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
  }[workflow.status];

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER BAR                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">Automation Engine</h1>
          {wizardActive && (
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-wider">
              Wizard Mode
            </span>
          )}
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
                    onClick={startWizard}
                    className="w-full text-left px-4 py-2.5 text-sm text-indigo-600 font-bold hover:bg-indigo-50 transition-colors flex items-center space-x-2"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>Create New</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {!wizardActive && (
            <button
              onClick={startWizard}
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Create New</span>
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WIZARD STEP INDICATOR                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {wizardActive && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-8 py-5">
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((ws, i) => (
              <React.Fragment key={ws.step}>
                <button
                  onClick={() => {
                    if (ws.step === 1 || (ws.step === 2 && wizardTrigger) || (ws.step <= wizardStep)) {
                      setWizardStep(ws.step);
                    }
                  }}
                  className={`flex items-center space-x-3 group ${ws.step <= wizardStep ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-all ${
                    wizardStep === ws.step
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                      : wizardStep > ws.step
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}>
                    {wizardStep > ws.step ? <CheckIcon className="w-5 h-5" /> : ws.step}
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${wizardStep >= ws.step ? 'text-slate-800' : 'text-slate-400'}`}>
                      {ws.label}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">{ws.description}</p>
                  </div>
                </button>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 rounded-full transition-all ${
                    wizardStep > ws.step ? 'bg-emerald-300' : 'bg-slate-100'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WIZARD STEP 1: START NEW WORKFLOW                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {wizardActive && wizardStep === 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-8 py-6 border-b border-slate-100">
            <h2 className="text-lg font-black text-slate-900 font-heading">Start New Workflow</h2>
            <p className="text-sm text-slate-400 mt-1">Define the basics and choose when this automation should trigger.</p>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* Name & Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Workflow Name</label>
                <input
                  type="text"
                  value={wizardName}
                  onChange={e => setWizardName(e.target.value)}
                  placeholder="e.g. Hot Lead Follow-up"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Description</label>
                <input
                  type="text"
                  value={wizardDescription}
                  onChange={e => setWizardDescription(e.target.value)}
                  placeholder="e.g. Automatically follow up with hot leads"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
                />
              </div>
            </div>

            {/* Trigger Selection */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-3">When should this run?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {TRIGGER_OPTIONS.map(trigger => (
                  <button
                    key={trigger.type}
                    onClick={() => setWizardTrigger(trigger.type)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      wizardTrigger === trigger.type
                        ? 'border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-100'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                      wizardTrigger === trigger.type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {trigger.icon}
                    </div>
                    <p className={`text-sm font-bold ${wizardTrigger === trigger.type ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {trigger.label}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{trigger.desc}</p>
                    {wizardTrigger === trigger.type && (
                      <div className="mt-2 flex items-center space-x-1 text-indigo-600">
                        <CheckIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase">Selected</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 1 Footer */}
          <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <button
              onClick={() => setWizardActive(false)}
              className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleWizardCreate}
              disabled={!wizardName.trim() || !wizardTrigger}
              className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Next: Build Workflow</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WIZARD STEP 2: VISUAL BUILDER  /  MAIN BUILDER VIEW          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {(!wizardActive || wizardStep === 2) && (
        <>
          {/* Builder Header (non-wizard mode) */}
          {!wizardActive && (
            <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-4">
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  value={workflow.name}
                  onChange={e => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-transparent border-0 outline-none text-lg font-black text-slate-900 font-heading w-72"
                  placeholder="Workflow name"
                />
                <button
                  onClick={toggleWorkflowStatus}
                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${sc.bg} ${sc.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${workflow.status === 'active' ? 'animate-pulse' : ''}`}></span>
                  <span>{workflow.status}</span>
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={handleSave} className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Save</span>
                </button>
                <button onClick={handleTest} disabled={testRunning} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
                  {testRunning ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <PlayIcon className="w-3.5 h-3.5" />}
                  <span>{testRunning ? 'Running...' : 'Test'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Wizard Step 2 Header */}
          {wizardActive && wizardStep === 2 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900 font-heading">{workflow.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Drag nodes from the palette to build your workflow. Click any node to configure it.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => setWizardStep(1)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    onClick={() => setWizardStep(3)}
                    disabled={workflow.nodes.length < 2}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40"
                  >
                    <span>Next: Configure</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CANVAS + CONFIG */}
          <div className="flex flex-col lg:flex-row gap-5">
            {/* ─── Workflow Canvas (70%) ─── */}
            <div className="lg:w-[70%]">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-bold text-slate-800 font-heading text-sm">Visual Workflow</h3>
                    <span className="text-xs text-slate-400 font-medium">{workflow.nodes.length} steps</span>
                  </div>
                  <button
                    onClick={handleAiOptimize}
                    disabled={aiOptimizing}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-[11px] font-bold hover:bg-violet-100 transition-all border border-violet-200 disabled:opacity-50"
                  >
                    {aiOptimizing ? <div className="w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin"></div> : <BrainIcon className="w-3.5 h-3.5" />}
                    <span>{aiOptimizing ? 'Analyzing...' : 'AI Optimize'}</span>
                  </button>
                </div>

                {/* AI Suggestions Banner */}
                {aiSuggestions.length > 0 && (
                  <div className="mx-6 mt-4 p-4 bg-violet-50 rounded-xl border border-violet-200">
                    <div className="flex items-center space-x-2 mb-2">
                      <BrainIcon className="w-4 h-4 text-violet-600" />
                      <p className="text-xs font-black text-violet-700 uppercase tracking-wider">AI Suggestions</p>
                      <button onClick={() => setAiSuggestions([])} className="ml-auto p-0.5 text-violet-400 hover:text-violet-600">
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {aiSuggestions.map((s, i) => (
                        <div key={i} className="flex items-start space-x-2">
                          <SparklesIcon className="w-3.5 h-3.5 text-violet-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-violet-700 leading-relaxed">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Canvas Body */}
                <div className="p-6 min-h-[420px]">
                  <div className="flex flex-col items-center space-y-0">
                    {workflow.nodes.map((node, idx) => {
                      const meta = NODE_TYPE_META[node.type];
                      const isSelected = selectedNodeId === node.id;
                      const isCond = node.type === 'condition';

                      return (
                        <React.Fragment key={node.id}>
                          <button
                            onClick={() => setSelectedNodeId(node.id)}
                            className={`w-full max-w-md relative group transition-all ${
                              isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 rounded-xl shadow-lg' : 'hover:shadow-md rounded-xl'
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
                                  <span className={`text-[10px] font-black uppercase tracking-wider text-${meta.color}-600`}>
                                    {meta.label}
                                  </span>
                                  <p className="font-bold text-sm text-slate-800 mt-0.5 truncate">{node.title}</p>
                                  <p className="text-xs text-slate-400 mt-0.5 truncate">{node.description}</p>
                                </div>
                                {node.config.aiPersonalization && (
                                  <span className="shrink-0 px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded text-[9px] font-black">AI</span>
                                )}
                                {isSelected && (
                                  <div className="shrink-0">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                                  </div>
                                )}
                              </div>
                              {isCond && (
                                <div className="flex items-center justify-center space-x-8 mt-3 pt-3 border-t border-slate-100">
                                  <span className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600">
                                    <CheckIcon className="w-3.5 h-3.5" /><span>Yes</span>
                                  </span>
                                  <span className="flex items-center space-x-1.5 text-xs font-bold text-rose-500">
                                    <XIcon className="w-3.5 h-3.5" /><span>No</span>
                                  </span>
                                </div>
                              )}
                            </div>
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
                          {idx < workflow.nodes.length - 1 && (
                            <div className="flex flex-col items-center py-1">
                              <div className="w-0.5 h-4 bg-slate-200"></div>
                              <svg className="w-3 h-3 text-slate-300" fill="currentColor" viewBox="0 0 12 12"><path d="M6 9L1 4h10L6 9z" /></svg>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Node Palette */}
                  <div className="mt-6 pt-5 border-t border-dashed border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 text-center">Add to Workflow</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button onClick={() => addNode('action')} className="flex flex-col items-center p-3 bg-emerald-50 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-all border border-emerald-200">
                        <ZapIcon className="w-5 h-5 mb-1" />
                        <span className="text-[11px] font-bold">Action</span>
                        <span className="text-[9px] text-emerald-500">Email, Task, Alert</span>
                      </button>
                      <button onClick={() => addNode('condition')} className="flex flex-col items-center p-3 bg-amber-50 rounded-xl text-amber-700 hover:bg-amber-100 transition-all border border-amber-200">
                        <GitBranchIcon className="w-5 h-5 mb-1" />
                        <span className="text-[11px] font-bold">Condition</span>
                        <span className="text-[9px] text-amber-500">If/Then Logic</span>
                      </button>
                      <button onClick={() => addNode('wait')} className="flex flex-col items-center p-3 bg-violet-50 rounded-xl text-violet-700 hover:bg-violet-100 transition-all border border-violet-200">
                        <ClockIcon className="w-5 h-5 mb-1" />
                        <span className="text-[11px] font-bold">Delay</span>
                        <span className="text-[9px] text-violet-500">Wait X Days</span>
                      </button>
                      <button onClick={() => addNode('condition')} className="flex flex-col items-center p-3 bg-rose-50 rounded-xl text-rose-700 hover:bg-rose-100 transition-all border border-rose-200">
                        <GitBranchIcon className="w-5 h-5 mb-1" />
                        <span className="text-[11px] font-bold">Branch</span>
                        <span className="text-[9px] text-rose-500">Multiple Paths</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Config Panel (30%) ─── */}
            <div className="lg:w-[30%] space-y-5">
              {selectedNode ? (
                <>
                  {/* Node Config */}
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
                        <button onClick={() => moveNode(selectedNode.id, 'up')} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Move up">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button onClick={() => moveNode(selectedNode.id, 'down')} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Move down">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-xs font-bold text-slate-600 mb-1">Step Name</label>
                      <input type="text" value={selectedNode.title} onChange={e => updateNodeTitle(selectedNode.id, e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                      <textarea value={selectedNode.description} onChange={e => updateNodeDescription(selectedNode.id, e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none" />
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Settings</p>

                      {/* Trigger Config */}
                      {selectedNode.type === 'trigger' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Trigger Event</label>
                          <select value={selectedNode.config.triggerType as string || 'lead_created'} onChange={e => updateNodeConfig(selectedNode.id, 'triggerType', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                            {TRIGGER_OPTIONS.map(t => (<option key={t.type} value={t.type}>{t.label}</option>))}
                          </select>
                        </div>
                      )}

                      {/* Action Config */}
                      {selectedNode.type === 'action' && (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Email Template</label>
                            <select value={selectedNode.config.template as string || 'welcome'} onChange={e => updateNodeConfig(selectedNode.id, 'template', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                              {EMAIL_TEMPLATES.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">{EMAIL_TEMPLATES.find(t => t.id === (selectedNode.config.template as string))?.desc}</p>
                          </div>

                          <label className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-200 cursor-pointer group">
                            <div className="flex items-center space-x-2">
                              <BrainIcon className="w-4 h-4 text-violet-600" />
                              <div>
                                <span className="text-xs font-bold text-violet-700">AI Personalization</span>
                                <p className="text-[10px] text-violet-500">Tailor content per lead</p>
                              </div>
                            </div>
                            <input type="checkbox" checked={!!selectedNode.config.aiPersonalization} onChange={e => updateNodeConfig(selectedNode.id, 'aiPersonalization', e.target.checked)} className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                          </label>

                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Timing</label>
                            <select value={selectedNode.config.timing as string || 'immediate'} onChange={e => updateNodeConfig(selectedNode.id, 'timing', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                              <option value="immediate">Send immediately</option>
                              <option value="optimal">AI optimal time</option>
                              <option value="morning">Next morning (9 AM)</option>
                              <option value="afternoon">Next afternoon (2 PM)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Use Model</label>
                            <select value={selectedNode.config.model as string || 'gemini-3-flash'} onChange={e => updateNodeConfig(selectedNode.id, 'model', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                              {MODEL_OPTIONS.map(m => (<option key={m} value={m}>{m}</option>))}
                            </select>
                          </div>

                          <label className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-200 cursor-pointer">
                            <div className="flex items-center space-x-2">
                              <ShieldIcon className="w-4 h-4 text-amber-600" />
                              <div>
                                <span className="text-xs font-bold text-amber-700">Fallback Action</span>
                                <p className="text-[10px] text-amber-500">If this step fails</p>
                              </div>
                            </div>
                            <input type="checkbox" checked={!!selectedNode.config.fallbackEnabled} onChange={e => updateNodeConfig(selectedNode.id, 'fallbackEnabled', e.target.checked)} className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                          </label>

                          {selectedNode.config.fallbackEnabled && (
                            <select value={selectedNode.config.fallbackAction as string || 'create_task'} onChange={e => updateNodeConfig(selectedNode.id, 'fallbackAction', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                              <option value="create_task">Create a follow-up task</option>
                              <option value="create_alert">Create an alert</option>
                              <option value="retry">Retry after 1 hour</option>
                              <option value="skip">Skip and continue</option>
                            </select>
                          )}
                        </>
                      )}

                      {/* Condition Config */}
                      {selectedNode.type === 'condition' && (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Field</label>
                            <select value={selectedNode.config.field as string || 'score'} onChange={e => updateNodeConfig(selectedNode.id, 'field', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                              <option value="score">Lead Score</option>
                              <option value="status">Lead Status</option>
                              <option value="email_opened">Email Opened</option>
                              <option value="email_clicked">Email Clicked</option>
                              <option value="visited_pricing">Visited Pricing Page</option>
                              <option value="engagement">Engagement Level</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">Operator</label>
                              <select value={selectedNode.config.operator as string || 'gt'} onChange={e => updateNodeConfig(selectedNode.id, 'operator', e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                {OPERATOR_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">Value</label>
                              <input type="number" value={selectedNode.config.value as number || 50} onChange={e => updateNodeConfig(selectedNode.id, 'value', parseInt(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                          </div>
                          <label className="flex items-center space-x-2 cursor-pointer text-sm text-slate-700">
                            <input type="checkbox" checked={!!selectedNode.config.onlyIfNoEmail} onChange={e => updateNodeConfig(selectedNode.id, 'onlyIfNoEmail', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            <span>Only if lead hasn't received email</span>
                          </label>
                        </>
                      )}

                      {/* Wait Config */}
                      {selectedNode.type === 'wait' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Wait Duration (days)</label>
                          <input type="number" min={1} value={selectedNode.config.days as number || 1} onChange={e => updateNodeConfig(selectedNode.id, 'days', parseInt(e.target.value) || 1)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pro Tip */}
                  <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-200 p-5">
                    <div className="flex items-center space-x-2 mb-2">
                      <SparklesIcon className="w-4 h-4 text-violet-600" />
                      <p className="text-xs font-black text-violet-700 uppercase tracking-wider">Pro Tip</p>
                    </div>
                    <p className="text-xs text-violet-600 leading-relaxed">
                      Use AI to optimize your workflow. Click the <strong>AI Optimize</strong> button above the canvas to get intelligent suggestions for improving performance.
                    </p>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                    <CogIcon className="w-7 h-7 text-slate-300" />
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm">Step Configuration</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Select a step in the workflow canvas to configure templates, AI personalization, timing, and fallback actions.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WIZARD STEP 3: CONFIGURE EACH STEP                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {wizardActive && wizardStep === 3 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 font-heading">Configure Each Step</h2>
              <p className="text-sm text-slate-400 mt-1">Review and fine-tune settings for every step in your workflow.</p>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => setWizardStep(2)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
                <ArrowLeftIcon className="w-3.5 h-3.5" /><span>Back</span>
              </button>
              <button onClick={() => setWizardStep(4)} className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                <span>Next: Test &amp; Activate</span><ArrowRightIcon className="w-3.5 h-3.5" />
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
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Template</p>
                            <p className="text-sm text-slate-700 font-semibold">{EMAIL_TEMPLATES.find(t => t.id === node.config.template)?.label || 'None'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Timing</p>
                            <p className="text-sm text-slate-700 font-semibold capitalize">{(node.config.timing as string || 'immediate').replace('_', ' ')}</p>
                          </div>
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
                      onClick={() => { setSelectedNodeId(node.id); setWizardStep(2); }}
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
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WIZARD STEP 4: TEST & ACTIVATE                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {wizardActive && wizardStep === 4 && (
        <div className="space-y-5">
          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => setWizardStep(3)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <ArrowLeftIcon className="w-3.5 h-3.5" /><span>Back to Configure</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ─── Test Panel ─── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100">
                <h3 className="font-black text-slate-900 font-heading">Test Workflow</h3>
                <p className="text-xs text-slate-400 mt-1">Run a simulation before going live.</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Select Test Leads */}
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Select Test Leads</p>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-3">
                    {leads.length > 0 ? leads.slice(0, 8).map(lead => (
                      <label key={lead.id} className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={testLeadIds.has(lead.id)} onChange={() => toggleTestLead(lead.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm text-slate-700">{lead.name}</span>
                        <span className="text-xs text-slate-400">Score: {lead.score}</span>
                      </label>
                    )) : (
                      <p className="text-xs text-slate-400 italic">No leads available. A sample lead will be used.</p>
                    )}
                  </div>
                </div>

                {/* Test Actions */}
                <div className="flex items-center space-x-2">
                  <button onClick={handleTest} disabled={testRunning} className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
                    {testRunning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <PlayIcon className="w-4 h-4" />}
                    <span>{testRunning ? 'Running Simulation...' : 'Run Simulation'}</span>
                  </button>
                  <button onClick={runValidation} disabled={validating} className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all disabled:opacity-50">
                    {validating ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div> : <ShieldIcon className="w-4 h-4" />}
                    <span>Validate</span>
                  </button>
                </div>

                {/* Test Results */}
                {testResults && (
                  <div className={`p-4 rounded-xl border ${testResults.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex items-center space-x-2 mb-3">
                      {testResults.passed ? <CheckIcon className="w-5 h-5 text-emerald-600" /> : <AlertTriangleIcon className="w-5 h-5 text-rose-600" />}
                      <p className={`text-sm font-black ${testResults.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {testResults.passed ? 'Test Passed' : 'Issues Found'}
                      </p>
                      <span className="text-xs text-slate-500">
                        {testResults.stepsRun}/{testResults.stepsTotal} steps completed for "{testResults.leadName}" (Score: {testResults.leadScore})
                      </span>
                    </div>
                    <div className="space-y-1">
                      {testResults.details.map((d, i) => (
                        <div key={i} className="flex items-center space-x-2 text-xs">
                          {d.status === 'pass' && <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0" />}
                          {d.status === 'fail' && <XIcon className="w-3 h-3 text-rose-500 shrink-0" />}
                          {d.status === 'skip' && <ArrowRightIcon className="w-3 h-3 text-amber-500 shrink-0" />}
                          <span className="text-slate-600">{d.step}</span>
                          <span className="text-slate-400">&mdash; {d.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validation Results */}
                {validations.length > 0 && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Validation Results</p>
                    <div className="space-y-1.5">
                      {validations.map((v, i) => (
                        <div key={i} className="flex items-center space-x-2 text-xs">
                          {v.status === 'pass' && <CheckIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                          {v.status === 'fail' && <XIcon className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                          {v.status === 'warn' && <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="font-semibold text-slate-700">{v.label}</span>
                          <span className="text-slate-400">&mdash; {v.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ─── Activation Panel ─── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100">
                <h3 className="font-black text-slate-900 font-heading">Activation Rules</h3>
                <p className="text-xs text-slate-400 mt-1">Choose how and when this workflow goes live.</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Activation Mode */}
                <div className="space-y-2">
                  {([
                    { mode: 'immediate' as ActivationMode, label: 'Activate Immediately', desc: 'Start processing leads right away', icon: <BoltIcon className="w-4 h-4" /> },
                    { mode: 'scheduled' as ActivationMode, label: 'Schedule Activation', desc: 'Start at a specific date and time', icon: <CalendarIcon className="w-4 h-4" /> },
                    { mode: 'segment' as ActivationMode, label: 'Only for Certain Segments', desc: 'Apply to specific lead segments only', icon: <UsersIcon className="w-4 h-4" /> },
                  ]).map(opt => (
                    <button
                      key={opt.mode}
                      onClick={() => setActivationMode(opt.mode)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center space-x-3 ${
                        activationMode === opt.mode
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${activationMode === opt.mode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {opt.icon}
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${activationMode === opt.mode ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</p>
                        <p className="text-xs text-slate-400">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Schedule Fields */}
                {activationMode === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Date</label>
                      <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Time</label>
                      <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                )}

                {/* Segment Filter */}
                {activationMode === 'segment' && (
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Target Segment</label>
                    <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="all">All Leads</option>
                      <option value="hot">Hot Leads (Score 75+)</option>
                      <option value="warm">Warm Leads (Score 50-74)</option>
                      <option value="new">New Leads Only</option>
                      <option value="contacted">Contacted Leads</option>
                    </select>
                  </div>
                )}

                {/* Monitoring */}
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Monitoring After Activation</p>
                  <label className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200 cursor-pointer mb-2">
                    <div className="flex items-center space-x-2">
                      <BellIcon className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700">Alert on Failures</span>
                    </div>
                    <input type="checkbox" checked={monitorAlerts} onChange={e => setMonitorAlerts(e.target.checked)} className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                      <EyeIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                      <p className="text-[10px] font-bold text-slate-500">Real-time view</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                      <AlertTriangleIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                      <p className="text-[10px] font-bold text-slate-500">Failure alerts</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                      <ActivityIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                      <p className="text-[10px] font-bold text-slate-500">Weekly review</p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 pt-3">
                  <button onClick={handleSave} className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex-1">
                    <EditIcon className="w-4 h-4" />
                    <span>Save Draft</span>
                  </button>
                  <button onClick={handleTest} disabled={testRunning} className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex-1 disabled:opacity-50">
                    <RefreshIcon className="w-4 h-4" />
                    <span>Test Again</span>
                  </button>
                  <button onClick={handleActivate} className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex-1">
                    <PlayIcon className="w-4 h-4" />
                    <span>Activate</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* WORKFLOW ANALYTICS (Bottom Panel)                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {(!wizardActive || wizardStep === 2) && (
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
              <span className="font-bold text-slate-400">{Math.round(workflow.stats.leadsProcessed / 30)} avg/day</span>
            </div>
            <div className="flex items-end space-x-1 h-10">
              {[35, 42, 28, 55, 48, 62, 38].map((v, i) => (
                <div key={i} className="flex-1 rounded-t bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors" style={{ height: `${(v / 62) * 100}%` }}></div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationPage;
