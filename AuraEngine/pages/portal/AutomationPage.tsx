import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  User, Lead, AutomationRule, AutomationTrigger, AutomationAction,
  TriggerType, ActionType, Campaign, CampaignStep
} from '../../types';
import { supabase } from '../../lib/supabase';
import {
  BoltIcon, PlusIcon, XIcon, CheckIcon, SparklesIcon, ClockIcon,
  PlayIcon, PauseIcon, GitBranchIcon, ZapIcon, TargetIcon, TagIcon,
  MailIcon, RefreshIcon, EditIcon, FlameIcon, TrendUpIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

const TRIGGER_OPTIONS: { type: TriggerType; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'score_change', label: 'Score Changes', desc: 'When a lead score crosses a threshold', icon: <TrendUpIcon className="w-4 h-4" /> },
  { type: 'status_change', label: 'Status Updates', desc: 'When a lead status changes', icon: <RefreshIcon className="w-4 h-4" /> },
  { type: 'lead_created', label: 'New Lead Created', desc: 'When a new lead enters the pipeline', icon: <PlusIcon className="w-4 h-4" /> },
  { type: 'time_elapsed', label: 'Time Elapsed', desc: 'After X days with no activity', icon: <ClockIcon className="w-4 h-4" /> },
  { type: 'tag_added', label: 'Tag Added', desc: 'When a specific tag is applied', icon: <TagIcon className="w-4 h-4" /> },
  { type: 'content_generated', label: 'Content Generated', desc: 'When AI content is created for a lead', icon: <SparklesIcon className="w-4 h-4" /> },
];

const ACTION_OPTIONS: { type: ActionType; label: string; icon: React.ReactNode }[] = [
  { type: 'send_email', label: 'Send Email', icon: <MailIcon className="w-4 h-4" /> },
  { type: 'update_status', label: 'Update Status', icon: <RefreshIcon className="w-4 h-4" /> },
  { type: 'add_tag', label: 'Add Tag', icon: <TagIcon className="w-4 h-4" /> },
  { type: 'assign_user', label: 'Assign to User', icon: <TargetIcon className="w-4 h-4" /> },
  { type: 'generate_content', label: 'Generate Content', icon: <SparklesIcon className="w-4 h-4" /> },
  { type: 'create_alert', label: 'Create Alert', icon: <FlameIcon className="w-4 h-4" /> },
  { type: 'move_to_segment', label: 'Move to Segment', icon: <GitBranchIcon className="w-4 h-4" /> },
];

const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-1',
    name: 'New Lead Onboarding',
    description: 'Automated 14-day nurture sequence for new leads',
    status: 'draft',
    steps: [
      { id: 's1', day: 0, type: 'email', title: 'Welcome Email', description: 'Send personalized welcome with company value proposition' },
      { id: 's2', day: 1, type: 'wait', title: 'Wait 1 Day', description: 'Allow time for initial email engagement' },
      { id: 's3', day: 2, type: 'condition', title: 'Check Email Open', description: 'If email opened, proceed. Otherwise, send follow-up.' },
      { id: 's4', day: 3, type: 'email', title: 'Value Proposition', description: 'Send case study or ROI analysis relevant to their industry' },
      { id: 's5', day: 7, type: 'action', title: 'Score Check', description: 'Evaluate lead score. If > 70, fast-track to qualified.' },
      { id: 's6', day: 10, type: 'email', title: 'Social Proof', description: 'Share testimonials and success metrics from similar companies' },
      { id: 's7', day: 14, type: 'email', title: 'CTA - Book Demo', description: 'Final conversion email with clear call-to-action' },
    ],
    enrolledLeads: 0,
    completedLeads: 0,
    createdAt: new Date().toISOString(),
  },
];

const AI_SUGGESTIONS = [
  {
    id: 'sug-1',
    title: 'Auto-tag leads from LinkedIn',
    description: 'Leads coming from LinkedIn source tend to have 23% higher conversion. Auto-tag them as "LinkedIn-Sourced" for segment targeting.',
    trigger: 'lead_created' as TriggerType,
    action: 'add_tag' as ActionType,
    confidence: 89,
  },
  {
    id: 'sug-2',
    title: 'Re-engage stagnant leads',
    description: 'Leads inactive for 14+ days with score > 50 have a 40% re-engagement rate when sent a new content piece.',
    trigger: 'time_elapsed' as TriggerType,
    action: 'generate_content' as ActionType,
    confidence: 82,
  },
  {
    id: 'sug-3',
    title: 'Fast-track hot leads',
    description: 'When a lead scores above 80, automatically assign to a sales rep and send a personalized outreach email within 1 hour.',
    trigger: 'score_change' as TriggerType,
    action: 'send_email' as ActionType,
    confidence: 94,
  },
  {
    id: 'sug-4',
    title: 'Content-triggered nurture',
    description: 'After generating AI content for a lead, wait 3 days and check engagement. If no response, auto-generate follow-up content.',
    trigger: 'content_generated' as TriggerType,
    action: 'generate_content' as ActionType,
    confidence: 76,
  },
];

const STEP_TYPE_COLORS: Record<string, string> = {
  email: 'indigo',
  wait: 'amber',
  condition: 'violet',
  action: 'emerald',
};

const AutomationPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeTab, setActiveTab] = useState<'rules' | 'campaigns' | 'suggestions'>('rules');
  const [leads, setLeads] = useState<Lead[]>([]);

  // Rules
  const [rules, setRules] = useState<AutomationRule[]>(() => {
    const saved = localStorage.getItem(`aura_rules_${user?.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [builderName, setBuilderName] = useState('');
  const [builderDesc, setBuilderDesc] = useState('');
  const [builderTrigger, setBuilderTrigger] = useState<TriggerType | null>(null);
  const [builderTriggerConfig, setBuilderTriggerConfig] = useState<Record<string, string | number>>({});
  const [builderActions, setBuilderActions] = useState<{ type: ActionType; config: Record<string, string | number> }[]>([]);

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    const saved = localStorage.getItem(`aura_campaigns_${user?.id}`);
    return saved ? JSON.parse(saved) : DEFAULT_CAMPAIGNS;
  });
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampName, setNewCampName] = useState('');
  const [newCampDesc, setNewCampDesc] = useState('');

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
    localStorage.setItem(`aura_rules_${user?.id}`, JSON.stringify(rules));
  }, [rules, user?.id]);

  useEffect(() => {
    localStorage.setItem(`aura_campaigns_${user?.id}`, JSON.stringify(campaigns));
  }, [campaigns, user?.id]);

  const resetBuilder = () => {
    setBuilderName('');
    setBuilderDesc('');
    setBuilderTrigger(null);
    setBuilderTriggerConfig({});
    setBuilderActions([]);
    setShowRuleBuilder(false);
  };

  const saveRule = () => {
    if (!builderName || !builderTrigger || builderActions.length === 0) return;
    const newRule: AutomationRule = {
      id: `rule-${Date.now()}`,
      name: builderName,
      description: builderDesc,
      trigger: {
        type: builderTrigger,
        label: TRIGGER_OPTIONS.find(t => t.type === builderTrigger)?.label || builderTrigger,
        config: builderTriggerConfig,
      },
      actions: builderActions.map(a => ({
        type: a.type,
        label: ACTION_OPTIONS.find(o => o.type === a.type)?.label || a.type,
        config: a.config,
      })),
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };
    setRules(prev => [...prev, newRule]);
    resetBuilder();
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const addBuilderAction = (type: ActionType) => {
    setBuilderActions(prev => [...prev, { type, config: {} }]);
  };

  const removeBuilderAction = (index: number) => {
    setBuilderActions(prev => prev.filter((_, i) => i !== index));
  };

  const applySuggestion = (suggestion: typeof AI_SUGGESTIONS[0]) => {
    setShowRuleBuilder(true);
    setBuilderName(suggestion.title);
    setBuilderDesc(suggestion.description);
    setBuilderTrigger(suggestion.trigger);
    setBuilderActions([{ type: suggestion.action, config: {} }]);
  };

  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newStatus = c.status === 'active' ? 'paused' : c.status === 'paused' ? 'active' : 'active';
      return { ...c, status: newStatus, startedAt: newStatus === 'active' ? new Date().toISOString() : c.startedAt };
    }));
  };

  const createCampaign = () => {
    if (!newCampName) return;
    const newCamp: Campaign = {
      id: `camp-${Date.now()}`,
      name: newCampName,
      description: newCampDesc,
      status: 'draft',
      steps: [
        { id: `s-${Date.now()}`, day: 0, type: 'email', title: 'Initial Outreach', description: 'First contact email' },
      ],
      enrolledLeads: 0,
      completedLeads: 0,
      createdAt: new Date().toISOString(),
    };
    setCampaigns(prev => [...prev, newCamp]);
    setNewCampName('');
    setNewCampDesc('');
    setShowNewCampaign(false);
  };

  const addCampaignStep = (campaignId: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== campaignId) return c;
      const lastDay = c.steps.length > 0 ? c.steps[c.steps.length - 1].day + 1 : 0;
      return {
        ...c,
        steps: [...c.steps, {
          id: `s-${Date.now()}`,
          day: lastDay,
          type: 'email' as const,
          title: `Step ${c.steps.length + 1}`,
          description: 'Configure this step',
        }],
      };
    }));
  };

  const removeCampaignStep = (campaignId: string, stepId: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== campaignId) return c;
      return { ...c, steps: c.steps.filter(s => s.id !== stepId) };
    }));
  };

  const updateStepType = (campaignId: string, stepId: string, type: CampaignStep['type']) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== campaignId) return c;
      return { ...c, steps: c.steps.map(s => s.id === stepId ? { ...s, type } : s) };
    }));
  };

  const updateStepTitle = (campaignId: string, stepId: string, title: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== campaignId) return c;
      return { ...c, steps: c.steps.map(s => s.id === stepId ? { ...s, title } : s) };
    }));
  };

  const updateStepDay = (campaignId: string, stepId: string, day: number) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== campaignId) return c;
      return { ...c, steps: c.steps.map(s => s.id === stepId ? { ...s, day } : s) };
    }));
  };

  const tabs = [
    { key: 'rules' as const, label: 'Automation Rules', icon: <GitBranchIcon className="w-4 h-4" /> },
    { key: 'campaigns' as const, label: 'Campaign Builder', icon: <ZapIcon className="w-4 h-4" /> },
    { key: 'suggestions' as const, label: 'AI Suggestions', icon: <SparklesIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">Workflow Automation</h1>
          <p className="text-slate-500 mt-1 text-sm">Build intelligent IF/THEN rules and multi-step campaigns</p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full font-bold">
            {rules.filter(r => r.enabled).length} active rules
          </div>
          <div className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full font-bold">
            {campaigns.filter(c => c.status === 'active').length} running campaigns
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* === TAB: Automation Rules === */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Create Rule Button */}
          {!showRuleBuilder && (
            <button
              onClick={() => setShowRuleBuilder(true)}
              className="flex items-center space-x-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Create New Rule</span>
            </button>
          )}

          {/* Rule Builder */}
          {showRuleBuilder && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">New Automation Rule</h3>
                <button onClick={resetBuilder} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Name & Description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Rule Name</label>
                    <input
                      type="text"
                      value={builderName}
                      onChange={e => setBuilderName(e.target.value)}
                      placeholder="e.g., Auto-qualify hot leads"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Description</label>
                    <input
                      type="text"
                      value={builderDesc}
                      onChange={e => setBuilderDesc(e.target.value)}
                      placeholder="What does this rule do?"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>

                {/* IF - Trigger */}
                <div>
                  <label className="block text-xs font-black text-indigo-600 mb-3 uppercase tracking-wider">IF (Trigger)</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {TRIGGER_OPTIONS.map(trigger => (
                      <button
                        key={trigger.type}
                        onClick={() => setBuilderTrigger(trigger.type)}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          builderTrigger === trigger.type
                            ? 'border-indigo-600 bg-indigo-50 shadow-md'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1.5">
                          <span className={builderTrigger === trigger.type ? 'text-indigo-600' : 'text-slate-400'}>
                            {trigger.icon}
                          </span>
                          <span className="text-sm font-bold text-slate-900">{trigger.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">{trigger.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Trigger Config */}
                  {builderTrigger === 'score_change' && (
                    <div className="mt-3 flex items-center space-x-3">
                      <span className="text-xs font-bold text-slate-600">Score exceeds:</span>
                      <input
                        type="number"
                        value={builderTriggerConfig.threshold as number || 80}
                        onChange={e => setBuilderTriggerConfig(prev => ({ ...prev, threshold: parseInt(e.target.value) || 0 }))}
                        className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}
                  {builderTrigger === 'time_elapsed' && (
                    <div className="mt-3 flex items-center space-x-3">
                      <span className="text-xs font-bold text-slate-600">Days inactive:</span>
                      <input
                        type="number"
                        value={builderTriggerConfig.days as number || 14}
                        onChange={e => setBuilderTriggerConfig(prev => ({ ...prev, days: parseInt(e.target.value) || 0 }))}
                        className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}
                  {builderTrigger === 'status_change' && (
                    <div className="mt-3 flex items-center space-x-3">
                      <span className="text-xs font-bold text-slate-600">New status:</span>
                      <select
                        value={builderTriggerConfig.status as string || ''}
                        onChange={e => setBuilderTriggerConfig(prev => ({ ...prev, status: e.target.value }))}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Any</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* THEN - Actions */}
                <div>
                  <label className="block text-xs font-black text-emerald-600 mb-3 uppercase tracking-wider">THEN (Actions)</label>

                  {/* Selected actions */}
                  {builderActions.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {builderActions.map((action, idx) => {
                        const opt = ACTION_OPTIONS.find(a => a.type === action.type);
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="flex items-center space-x-3">
                              <span className="text-emerald-600">{opt?.icon}</span>
                              <span className="text-sm font-bold text-slate-900">{opt?.label}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Action {idx + 1}</span>
                            </div>
                            <button onClick={() => removeBuilderAction(idx)} className="p-1 text-slate-400 hover:text-red-500">
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {ACTION_OPTIONS.map(action => (
                      <button
                        key={action.type}
                        onClick={() => addBuilderAction(action.type)}
                        className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-all"
                      >
                        {action.icon}
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={saveRule}
                    disabled={!builderName || !builderTrigger || builderActions.length === 0}
                    className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckIcon className="w-4 h-4" />
                    <span>Save Rule</span>
                  </button>
                  <button onClick={resetBuilder} className="px-4 py-3 text-sm font-bold text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Existing Rules */}
          {rules.length === 0 && !showRuleBuilder ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
              <GitBranchIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">No automation rules yet</p>
              <p className="text-xs text-slate-400 mt-1">Create IF/THEN rules to automate your workflow</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  className={`bg-white rounded-2xl border p-5 transition-all ${
                    rule.enabled ? 'border-slate-100 shadow-sm' : 'border-slate-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        rule.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'
                      }`}>
                        <BoltIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{rule.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {/* Trigger & Actions summary */}
                      <div className="hidden md:flex items-center space-x-2">
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase">
                          IF: {rule.trigger.label}
                        </span>
                        <span className="text-slate-300">→</span>
                        {rule.actions.map((a, i) => (
                          <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase">
                            {a.label}
                          </span>
                        ))}
                      </div>

                      <span className="text-[10px] font-bold text-slate-400">
                        {rule.runCount} runs
                      </span>

                      <button
                        onClick={() => toggleRule(rule.id)}
                        className={`relative w-12 h-6 rounded-full transition-all ${
                          rule.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                          rule.enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`}></div>
                      </button>

                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === TAB: Campaign Automation === */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowNewCampaign(true)}
              className="flex items-center space-x-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New Campaign</span>
            </button>
          </div>

          {/* New Campaign Form */}
          {showNewCampaign && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Create Campaign</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Campaign Name</label>
                  <input
                    type="text"
                    value={newCampName}
                    onChange={e => setNewCampName(e.target.value)}
                    placeholder="e.g., Q1 Lead Nurture"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Description</label>
                  <input
                    type="text"
                    value={newCampDesc}
                    onChange={e => setNewCampDesc(e.target.value)}
                    placeholder="Campaign objective"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={createCampaign}
                  disabled={!newCampName}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>Create</span>
                </button>
                <button onClick={() => setShowNewCampaign(false)} className="text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
            </div>
          )}

          {/* Campaign List */}
          {campaigns.map(campaign => {
            const isExpanded = expandedCampaign === campaign.id;
            const statusColors: Record<string, string> = {
              draft: 'slate',
              active: 'emerald',
              paused: 'amber',
              completed: 'indigo',
            };
            const sColor = statusColors[campaign.status] || 'slate';

            return (
              <div key={campaign.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Campaign Header */}
                <div
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-xl bg-${sColor}-50 text-${sColor}-600 flex items-center justify-center`}>
                      <ZapIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-bold text-slate-900 text-sm">{campaign.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-${sColor}-50 text-${sColor}-600`}>
                          {campaign.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{campaign.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="hidden md:flex items-center space-x-4 text-xs text-slate-500">
                      <span><span className="font-bold text-slate-900">{campaign.steps.length}</span> steps</span>
                      <span><span className="font-bold text-slate-900">{campaign.enrolledLeads}</span> enrolled</span>
                    </div>

                    {campaign.status !== 'completed' && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleCampaignStatus(campaign.id); }}
                        className={`p-2.5 rounded-xl transition-all ${
                          campaign.status === 'active'
                            ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {campaign.status === 'active' ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Campaign Steps (Expanded) */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-50">
                    <div className="pt-4 space-y-0">
                      {campaign.steps.map((step, idx) => {
                        const stepColor = STEP_TYPE_COLORS[step.type] || 'slate';
                        return (
                          <div key={step.id} className="flex items-start">
                            {/* Timeline */}
                            <div className="flex flex-col items-center mr-4 shrink-0">
                              <div className={`w-8 h-8 rounded-full bg-${stepColor}-100 text-${stepColor}-600 flex items-center justify-center text-xs font-black border-2 border-white shadow-sm`}>
                                {step.day}
                              </div>
                              {idx < campaign.steps.length - 1 && (
                                <div className={`w-0.5 h-8 bg-${stepColor}-100`}></div>
                              )}
                            </div>

                            {/* Step Content */}
                            <div className="flex-1 pb-4">
                              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                                <div className="flex items-center space-x-3">
                                  <select
                                    value={step.type}
                                    onChange={e => updateStepType(campaign.id, step.id, e.target.value as CampaignStep['type'])}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-${stepColor}-50 text-${stepColor}-600 border-0 outline-none cursor-pointer`}
                                  >
                                    <option value="email">Email</option>
                                    <option value="wait">Wait</option>
                                    <option value="condition">Condition</option>
                                    <option value="action">Action</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={step.title}
                                    onChange={e => updateStepTitle(campaign.id, step.id, e.target.value)}
                                    className="text-sm font-bold text-slate-900 bg-transparent border-0 outline-none w-40"
                                  />
                                  <span className="text-xs text-slate-400 hidden md:inline">{step.description}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <div className="flex items-center space-x-1">
                                    <span className="text-[10px] font-bold text-slate-400">Day</span>
                                    <input
                                      type="number"
                                      value={step.day}
                                      onChange={e => updateStepDay(campaign.id, step.id, parseInt(e.target.value) || 0)}
                                      className="w-12 px-1.5 py-1 text-xs text-center border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <button
                                    onClick={() => removeCampaignStep(campaign.id, step.id)}
                                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                  >
                                    <XIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => addCampaignStep(campaign.id)}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all mt-2"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>Add Step</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* === TAB: AI Suggestions === */}
      {activeTab === 'suggestions' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-black text-slate-900">AI-Powered Automation Ideas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Based on your pipeline data ({leads.length} leads), here are recommended automations
            </p>
          </div>

          <div className="space-y-4">
            {AI_SUGGESTIONS.map(suggestion => (
              <div key={suggestion.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shrink-0">
                      <SparklesIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{suggestion.title}</p>
                      <p className="text-sm text-slate-500 mt-1">{suggestion.description}</p>

                      <div className="flex items-center space-x-2 mt-3">
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase">
                          IF: {TRIGGER_OPTIONS.find(t => t.type === suggestion.trigger)?.label}
                        </span>
                        <span className="text-slate-300">→</span>
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase">
                          THEN: {ACTION_OPTIONS.find(a => a.type === suggestion.action)?.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-4">
                    <div className="flex items-center space-x-1.5 mb-3">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${suggestion.confidence}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{suggestion.confidence}%</span>
                    </div>
                    <button
                      onClick={() => applySuggestion(suggestion)}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>Apply Rule</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pro Tip */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center space-x-3 mb-3">
              <SparklesIcon className="w-5 h-5 text-indigo-400" />
              <span className="text-xs font-black text-indigo-400 uppercase tracking-wider">Automation Tip</span>
            </div>
            <p className="text-sm text-slate-300">
              Start with 2-3 simple rules and monitor their effectiveness for a week before adding more.
              The best automations are ones that handle repetitive tasks you'd normally do manually,
              like tagging leads from specific sources or following up after content generation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationPage;
