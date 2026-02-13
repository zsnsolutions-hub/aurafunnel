import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead, ToneType } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  SparklesIcon, MailIcon, CheckIcon, XIcon, PlusIcon, CopyIcon,
  EditIcon, EyeIcon, ChartIcon, RefreshIcon, FilterIcon,
  TrendUpIcon, TrendDownIcon, ClockIcon, TargetIcon, BoltIcon,
  DownloadIcon, FlameIcon, SlidersIcon, ArrowRightIcon, StarIcon,
  LinkedInIcon, RecycleIcon, LayersIcon, GridIcon, DocumentIcon,
  KeyboardIcon, HelpCircleIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Types ───
type ContentMode = 'email' | 'linkedin' | 'proposal';

interface EmailVariant {
  id: string;
  name: string;
  subject: string;
  body: string;
  performance: { openRate: number; clickRate: number; replyRate: number; conversion: number };
  isControl: boolean;
}

interface EmailStep {
  id: string;
  stepNumber: number;
  delay: string;
  variants: EmailVariant[];
  activeVariantId: string;
}

interface AISuggestion {
  id: string;
  type: 'word' | 'metric' | 'personalization' | 'structure' | 'cta';
  category: 'high' | 'medium' | 'style';
  title: string;
  description: string;
  replacement?: string;
  impactLabel: string;
  impactPercent: number;
  applied: boolean;
}

interface PersonalizationRule {
  id: string;
  condition: string;
  conditionValue: string;
  thenShow: string;
  insteadOf: string;
  audiencePercent: number;
}

interface ABTestConfig {
  metric: 'open_rate' | 'click_rate' | 'conversion_rate';
  duration: '24h' | '48h' | 'significant';
  winnerSelection: 'auto' | 'manual';
  trafficSplit: number[];
  status: 'draft' | 'running' | 'completed';
}

interface ContentTemplate {
  id: string;
  name: string;
  type: ContentMode;
  industry: string;
  goal: string;
  performance: number;
  body: string;
  subject?: string;
}

interface BatchItem {
  id: string;
  type: ContentMode;
  label: string;
  tone: string;
  status: 'pending' | 'generating' | 'done';
}

type ViewTab = 'editor' | 'preview' | 'analytics' | 'templates';

const PERSONALIZATION_TAGS = [
  '{{first_name}}', '{{company}}', '{{industry}}', '{{recent_activity}}',
  '{{ai_insight}}', '{{pain_point}}', '{{your_name}}', '{{target_outcome}}',
  '{{company_size}}', '{{job_title}}'
];

const INITIAL_SUGGESTIONS: AISuggestion[] = [
  {
    id: 'sug-1', type: 'word', category: 'high', title: 'Try "streamline" instead of "help"',
    description: 'More action-oriented verbs increase engagement by conveying immediate value.',
    replacement: 'streamline', impactLabel: '+8% expected opens', impactPercent: 8, applied: false,
  },
  {
    id: 'sug-2', type: 'metric', category: 'high', title: 'Add a specific metric',
    description: 'Including data like "increase efficiency by 40%" adds credibility and specificity.',
    replacement: 'increase efficiency by 40%', impactLabel: '+12% credibility', impactPercent: 12, applied: false,
  },
  {
    id: 'sug-3', type: 'personalization', category: 'high', title: 'Personalize for industry',
    description: 'Opening with "As a {{industry}} leader..." signals that the email is tailored, not mass-sent.',
    replacement: 'As a {{industry}} leader, ', impactLabel: '+15% relevance', impactPercent: 15, applied: false,
  },
  {
    id: 'sug-4', type: 'cta', category: 'medium', title: 'Strengthen the CTA',
    description: 'Replace generic "let\'s chat" with time-bounded urgency: "Grab a 15-min slot this week".',
    replacement: 'Grab a 15-min slot this week?', impactLabel: '+10% reply rate', impactPercent: 10, applied: false,
  },
  {
    id: 'sug-5', type: 'structure', category: 'style', title: 'Add a P.S. line',
    description: 'P.S. lines get read 79% of the time, even when the body is skimmed.',
    replacement: '\n\nP.S. {{personalized_ps}}', impactLabel: '+6% engagement', impactPercent: 6, applied: false,
  },
];

const INITIAL_RULES: PersonalizationRule[] = [
  { id: 'rule-1', condition: 'lead_score', conditionValue: '> 75', thenShow: 'Case study link', insteadOf: 'Generic example', audiencePercent: 42 },
  { id: 'rule-2', condition: 'company_size', conditionValue: '> 200', thenShow: 'Enterprise pricing section', insteadOf: 'Standard pricing', audiencePercent: 28 },
  { id: 'rule-3', condition: 'industry', conditionValue: '= "Technology"', thenShow: 'Technical specifications', insteadOf: 'General features', audiencePercent: 15 },
];

const TEMPLATES: ContentTemplate[] = [
  { id: 'tpl-1', name: 'Technical Demo Request', type: 'email', industry: 'Technology', goal: 'book_meeting', performance: 67, subject: '{{first_name}}, quick demo of what we built for {{industry}}', body: `Hi {{first_name}},\n\nI saw that {{company}} is expanding its technical infrastructure — impressive growth.\n\nWe built something specifically for {{industry}} teams dealing with {{pain_point}}.\n\n3 companies your size saw 40% improvement in 90 days.\n\nWorth a 15-min demo?\n\n{{your_name}}` },
  { id: 'tpl-2', name: 'Enterprise Case Study', type: 'email', industry: 'Enterprise', goal: 'nurture', performance: 52, subject: 'How [Similar Company] solved {{pain_point}}', body: `Hi {{first_name}},\n\nI wanted to share how a company similar to {{company}} tackled {{pain_point}}.\n\nKey results:\n• 42% increase in pipeline velocity\n• 3x improvement in lead quality\n• ROI positive in 60 days\n\nI put together a quick summary — want me to send it over?\n\n{{your_name}}` },
  { id: 'tpl-3', name: 'Price Increase Communication', type: 'email', industry: 'All', goal: 'retention', performance: 89, subject: 'Important update about your {{company}} account', body: `Hi {{first_name}},\n\nI wanted to personally reach out about an upcoming change to your plan.\n\nHere's what's changing and why:\n• [Change details]\n• [Value additions]\n• [Timeline]\n\nAs a valued partner, you'll get [special offer]. Happy to walk through it.\n\n{{your_name}}` },
  { id: 'tpl-4', name: 'Thought Leadership Post', type: 'linkedin', industry: 'All', goal: 'engagement', performance: 74, body: `3 trends reshaping {{industry}} in 2026:\n\n1. [Trend 1] — already impacting companies like {{company}}\n2. [Trend 2] — early adopters seeing 2x results\n3. [Trend 3] — the next 12 months will be critical\n\nWe're seeing these patterns across 100+ clients.\n\nWhat's your take? Drop a comment below.\n\n#{{industry}} #Leadership #Innovation` },
  { id: 'tpl-5', name: 'ROI-Focused Proposal', type: 'proposal', industry: 'Enterprise', goal: 'close_deal', performance: 61, body: `EXECUTIVE SUMMARY\n\n{{company}} is facing {{pain_point}} across its {{industry}} operations. Our solution delivers measurable ROI:\n\n• Projected savings: $[amount]/year\n• Implementation timeline: [weeks] weeks\n• Expected ROI: [X]x in 12 months\n\nPROPOSED SOLUTION\n[Solution details tailored to {{company}}]\n\nPRICING OPTIONS\n[Tiered pricing based on {{company_size}}]\n\nNEXT STEPS\n1. Technical review call\n2. Pilot program (2 weeks)\n3. Full deployment` },
  { id: 'tpl-6', name: 'AI Transformation Post', type: 'linkedin', industry: 'Technology', goal: 'thought_leadership', performance: 82, body: `3 ways AI is transforming lead generation:\n\n1. Predictive scoring identifies hot leads 7 days before they're ready to buy\n2. Personalization at scale increases engagement by 300%\n3. Automated nurturing reduces manual work by 40 hours/week\n\nWe're seeing these results with clients across {{industry}}. What's your experience?\n\n#AI #LeadGeneration #MarketingTech` },
];

const createDefaultVariant = (name: string, isControl: boolean): EmailVariant => ({
  id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name,
  subject: isControl
    ? 'Helping {{company}} {{solve_pain_point}}'
    : name === 'Variant B'
    ? 'Quick question about {{company}}\'s growth'
    : '{{first_name}}, saw this and thought of {{company}}',
  body: isControl
    ? `Hi {{first_name}},

{{personalized_opening}} based on your work at {{company}}.

{{value_proposition}} that helps {{target_outcome}}.

Would love to share how we've helped similar companies — would a 15-min chat work this week?

Best,
{{your_name}}`
    : name === 'Variant B'
    ? `Hey {{first_name}},

I noticed {{company}} is expanding in {{industry}} — congrats on the growth!

We've been helping teams like yours {{target_outcome}} with {{value_proposition}}.

Mind if I send over a quick case study?

Cheers,
{{your_name}}`
    : `{{first_name}},

As a {{industry}} leader, you know that {{pain_point}} can slow momentum.

At {{company}}, you're probably looking for ways to {{target_outcome}} — that's exactly what we built.

3 companies in your space saw 40% improvement in 90 days.

Worth a quick look? → [Book 15 min]

{{your_name}}

P.S. {{personalized_ps}}`,
  performance: {
    openRate: isControl ? 42 : name === 'Variant B' ? 38 : 47,
    clickRate: isControl ? 8 : name === 'Variant B' ? 6 : 11,
    replyRate: isControl ? 5 : name === 'Variant B' ? 4 : 7,
    conversion: isControl ? 3.2 : name === 'Variant B' ? 2.8 : 4.1,
  },
  isControl,
});

const createDefaultSteps = (): EmailStep[] => [
  {
    id: 'step-1', stepNumber: 1, delay: 'Day 1',
    variants: [createDefaultVariant('Variant A', true), createDefaultVariant('Variant B', false), createDefaultVariant('Variant C', false)],
    activeVariantId: '',
  },
  {
    id: 'step-2', stepNumber: 2, delay: 'Day 3',
    variants: [{
      ...createDefaultVariant('Variant A', true),
      subject: 'Following up — {{company}} + us',
      body: `Hi {{first_name}},

Just wanted to circle back on my last email. I know things get busy at {{company}}.

Here's a 2-min case study that shows how we helped a similar {{industry}} company {{target_outcome}}: [Link]

Happy to walk through it if you're curious.

{{your_name}}`
    }],
    activeVariantId: '',
  },
  {
    id: 'step-3', stepNumber: 3, delay: 'Day 6',
    variants: [{
      ...createDefaultVariant('Variant A', true),
      subject: 'One last thing, {{first_name}}',
      body: `Hey {{first_name}},

I'll keep this short — if the timing isn't right for {{company}}, no worries at all.

But if {{pain_point}} is still on your radar, I'd love 15 minutes to show you what we've built.

Either way, wishing you and the {{company}} team all the best.

{{your_name}}`
    }],
    activeVariantId: '',
  },
];

const ContentStudio: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Content Mode ───
  const [contentMode, setContentMode] = useState<ContentMode>('email');

  // ─── Email State ───
  const [steps, setSteps] = useState<EmailStep[]>(() => {
    const s = createDefaultSteps();
    return s.map(step => ({ ...step, activeVariantId: step.variants[0].id }));
  });
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // ─── LinkedIn State ───
  const [linkedinPost, setLinkedinPost] = useState(`3 ways AI is transforming lead generation:\n\n1. Predictive scoring identifies hot leads 7 days before they're ready to buy\n2. Personalization at scale increases engagement by 300%\n3. Automated nurturing reduces manual work by 40 hours/week\n\nWe're seeing these results with clients like {{company}}. What's your experience?\n\n#AI #LeadGeneration #MarketingTech`);
  const [linkedinTone, setLinkedinTone] = useState<'thought_leadership' | 'casual' | 'educational' | 'storytelling'>('thought_leadership');
  const [linkedinGoal, setLinkedinGoal] = useState<'engagement' | 'traffic' | 'leads'>('engagement');

  // ─── Proposal State ───
  const [proposalSections, setProposalSections] = useState({
    executiveSummary: `{{company}} is facing {{pain_point}} across its {{industry}} operations. Our AI-powered platform delivers measurable ROI within 90 days.`,
    problemStatement: `Based on our analysis, {{company}} currently experiences:\n• Manual lead scoring taking 15+ hours/week\n• Inconsistent follow-up leading to 40% lead drop-off\n• Limited visibility into pipeline health`,
    solution: `Our platform provides:\n• AI-driven lead scoring with 92% accuracy\n• Automated multi-channel outreach sequences\n• Real-time analytics and conversion predictions\n• Custom model training on your data`,
    roi: `Projected impact for {{company}}:\n• Pipeline velocity: +42% improvement\n• Lead conversion: +35% increase\n• Time saved: 40 hours/week\n• Expected ROI: 5.2x in 12 months`,
    pricing: `Based on {{company}}'s needs ({{company_size}} employees):\n\nGrowth Plan: $499/mo\n• 5,000 AI credits\n• 3 team seats\n\nEnterprise Plan: $999/mo\n• Unlimited credits\n• Unlimited seats\n• Custom model training`,
    nextSteps: `1. Technical review call (30 min)\n2. Pilot program — 2 weeks, no commitment\n3. Full deployment with dedicated support`,
  });

  // ─── Shared State ───
  const [viewTab, setViewTab] = useState<ViewTab>('editor');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(INITIAL_SUGGESTIONS);
  const [rules, setRules] = useState<PersonalizationRule[]>(INITIAL_RULES);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [suggestionsRefreshing, setSuggestionsRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRule, setNewRule] = useState<PersonalizationRule>({ id: '', condition: 'lead_score', conditionValue: '> 50', thenShow: '', insteadOf: '', audiencePercent: 0 });
  const [showTestRules, setShowTestRules] = useState(false);

  // ─── A/B Test Config ───
  const [abTestConfig, setAbTestConfig] = useState<ABTestConfig>({
    metric: 'open_rate', duration: '48h', winnerSelection: 'auto', trafficSplit: [50, 50], status: 'draft',
  });
  const [showABConfig, setShowABConfig] = useState(false);

  // ─── Templates ───
  const [templateFilter, setTemplateFilter] = useState<{ industry: string; goal: string }>({ industry: 'All', goal: 'All' });

  // ─── Batch Creation ───
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([
    { id: 'b-1', type: 'linkedin', label: 'LinkedIn Post — Thought Leadership', tone: 'Professional', status: 'pending' },
    { id: 'b-2', type: 'linkedin', label: 'LinkedIn Post — Product Update', tone: 'Conversational', status: 'pending' },
    { id: 'b-3', type: 'email', label: 'Cold Email Sequence — Demo Request', tone: 'Professional', status: 'pending' },
  ]);

  // ─── Content Recycling ───
  const [showRecycleModal, setShowRecycleModal] = useState(false);
  const [recycleSource, setRecycleSource] = useState<ContentMode>('email');
  const [recycleTarget, setRecycleTarget] = useState<ContentMode>('linkedin');

  // ─── Context Menu ───
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // ─── Panels ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('leads').select('*').eq('client_id', user.id).order('score', { ascending: false });
      setLeads((data || []) as Lead[]);
    } catch (err) {
      console.error('Studio fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+S → Save
      if (isMod && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      // Ctrl+P → Toggle Preview
      if (isMod && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setViewTab(prev => prev === 'preview' ? 'editor' : 'preview');
        return;
      }
      // Ctrl+Shift+A → Refresh AI suggestions
      if (isMod && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        refreshSuggestions();
        return;
      }
      // Ctrl+Shift+P → Toggle Performance (analytics)
      if (isMod && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setViewTab(prev => prev === 'analytics' ? 'editor' : 'analytics');
        return;
      }
      // Ctrl+K → Tag picker
      if (isMod && e.key === 'k') {
        e.preventDefault();
        setShowTagPicker(prev => !prev);
        return;
      }
      // Escape → close context menu
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu]);

  // ─── Close context menu on outside click ───
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const contextActions = [
    { label: 'Generate alternative', action: () => { refreshSuggestions(); setContextMenu(null); } },
    { label: 'Improve readability', action: () => { applySuggestion('sug-1'); setContextMenu(null); } },
    { label: 'Shorten content', action: () => { setContextMenu(null); } },
    { label: 'Lengthen content', action: () => { setContextMenu(null); } },
    { label: 'Change tone', action: () => { setContextMenu(null); } },
    { label: 'Add call-to-action', action: () => { applySuggestion('sug-4'); setContextMenu(null); } },
    { label: 'Insert personalization tag', action: () => { setShowTagPicker(true); setContextMenu(null); } },
    { label: 'Check grammar', action: () => { setContextMenu(null); } },
  ];

  // ─── Computed ───
  const activeStep = steps[activeStepIdx];
  const activeVariant = activeStep?.variants.find(v => v.id === activeStep.activeVariantId) || activeStep?.variants[0];

  const aggregatePerformance = useMemo(() => {
    if (!activeVariant) return { openRate: 0, clickRate: 0, replyRate: 0, conversion: 0 };
    const base = activeVariant.performance;
    const appliedBoost = suggestions.filter(s => s.applied).reduce((a, b) => a + b.impactPercent, 0);
    return {
      openRate: +(base.openRate + appliedBoost * 0.3).toFixed(1),
      clickRate: +(base.clickRate + appliedBoost * 0.15).toFixed(1),
      replyRate: +(base.replyRate + appliedBoost * 0.12).toFixed(1),
      conversion: +(base.conversion + appliedBoost * 0.08).toFixed(1),
    };
  }, [activeVariant, suggestions]);

  const userAvgComparison = useMemo(() => {
    const userAvg = { opens: 30, clicks: 4.5, replies: 2.5 };
    return {
      opens: { value: `${aggregatePerformance.openRate > userAvg.opens ? '+' : ''}${(aggregatePerformance.openRate - userAvg.opens).toFixed(0)}%`, up: aggregatePerformance.openRate > userAvg.opens },
      clicks: { value: `${aggregatePerformance.clickRate > userAvg.clicks ? '+' : ''}${(aggregatePerformance.clickRate - userAvg.clicks).toFixed(0)}%`, up: aggregatePerformance.clickRate > userAvg.clicks },
      replies: { value: `${aggregatePerformance.replyRate > userAvg.replies ? '+' : ''}${(aggregatePerformance.replyRate - userAvg.replies).toFixed(0)}%`, up: aggregatePerformance.replyRate > userAvg.replies },
    };
  }, [aggregatePerformance]);

  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter(t => {
      if (t.type !== contentMode) return false;
      if (templateFilter.industry !== 'All' && t.industry !== templateFilter.industry && t.industry !== 'All') return false;
      if (templateFilter.goal !== 'All' && t.goal !== templateFilter.goal) return false;
      return true;
    });
  }, [contentMode, templateFilter]);

  // ─── Handlers ───
  const updateVariantField = (field: 'subject' | 'body', value: string) => {
    setSteps(prev => prev.map((step, i) => {
      if (i !== activeStepIdx) return step;
      return {
        ...step,
        variants: step.variants.map(v => v.id === step.activeVariantId ? { ...v, [field]: value } : v),
      };
    }));
  };

  const switchVariant = (variantId: string) => {
    setSteps(prev => prev.map((step, i) =>
      i === activeStepIdx ? { ...step, activeVariantId: variantId } : step
    ));
  };

  const addVariant = () => {
    const names = ['Variant A', 'Variant B', 'Variant C', 'Variant D', 'Variant E'];
    const existingCount = activeStep.variants.length;
    if (existingCount >= 5) return;
    const newVar = createDefaultVariant(names[existingCount] || `Variant ${existingCount + 1}`, false);
    setSteps(prev => prev.map((step, i) =>
      i === activeStepIdx ? { ...step, variants: [...step.variants, newVar] } : step
    ));
  };

  const applySuggestion = (sugId: string) => {
    setSuggestions(prev => prev.map(s => s.id === sugId ? { ...s, applied: true } : s));
    const sug = suggestions.find(s => s.id === sugId);
    if (sug?.replacement && activeVariant) {
      if (sug.type === 'structure' || sug.type === 'cta') {
        updateVariantField('body', activeVariant.body + sug.replacement);
      }
    }
  };

  const refreshSuggestions = () => {
    setSuggestionsRefreshing(true);
    setTimeout(() => {
      setSuggestions(INITIAL_SUGGESTIONS.map(s => ({ ...s, applied: false, impactPercent: +(s.impactPercent + (Math.random() * 4 - 2)).toFixed(0) })));
      setSuggestionsRefreshing(false);
    }, 1000);
  };

  const insertTag = (tag: string) => {
    if (contentMode === 'email' && activeVariant) {
      updateVariantField('body', activeVariant.body + ' ' + tag);
    } else if (contentMode === 'linkedin') {
      setLinkedinPost(prev => prev + ' ' + tag);
    }
    setShowTagPicker(false);
  };

  const handleFindReplace = () => {
    if (!findText) return;
    if (contentMode === 'email' && activeVariant) {
      updateVariantField('body', activeVariant.body.replaceAll(findText, replaceText));
      updateVariantField('subject', activeVariant.subject.replaceAll(findText, replaceText));
    } else if (contentMode === 'linkedin') {
      setLinkedinPost(prev => prev.replaceAll(findText, replaceText));
    }
    setShowFindReplace(false);
    setFindText('');
    setReplaceText('');
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addRule = () => {
    if (!newRule.thenShow.trim()) return;
    const hotLeads = leads.filter(l => l.score > 75).length;
    const total = leads.length || 1;
    const estimatedPct = newRule.condition === 'lead_score' ? Math.round((hotLeads / total) * 100)
      : Math.round(15 + Math.random() * 30);
    setRules(prev => [...prev, { ...newRule, id: `rule-${Date.now()}`, audiencePercent: estimatedPct }]);
    setNewRule({ id: '', condition: 'lead_score', conditionValue: '> 50', thenShow: '', insteadOf: '', audiencePercent: 0 });
    setShowRuleModal(false);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleExport = () => {
    let content = '';
    if (contentMode === 'email') {
      content = steps.map(step => {
        const v = step.variants.find(vr => vr.id === step.activeVariantId) || step.variants[0];
        return `=== Email ${step.stepNumber} (${step.delay}) ===\nSubject: ${v.subject}\n\n${v.body}`;
      }).join('\n\n');
    } else if (contentMode === 'linkedin') {
      content = `=== LinkedIn Post ===\nTone: ${linkedinTone}\nGoal: ${linkedinGoal}\n\n${linkedinPost}`;
    } else {
      content = Object.entries(proposalSections).map(([key, val]) => `=== ${key.replace(/([A-Z])/g, ' $1').toUpperCase()} ===\n${val}`).join('\n\n');
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contentMode}_content_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyTemplate = (tpl: ContentTemplate) => {
    if (tpl.type === 'email') {
      setSteps(prev => prev.map((step, i) => {
        if (i !== 0) return step;
        return {
          ...step,
          variants: step.variants.map(v => v.id === step.activeVariantId ? { ...v, subject: tpl.subject || v.subject, body: tpl.body } : v),
        };
      }));
    } else if (tpl.type === 'linkedin') {
      setLinkedinPost(tpl.body);
    } else if (tpl.type === 'proposal') {
      const lines = tpl.body.split('\n\n');
      if (lines.length >= 3) {
        setProposalSections(prev => ({ ...prev, executiveSummary: lines[0] || prev.executiveSummary, solution: lines[1] || prev.solution, pricing: lines[2] || prev.pricing }));
      }
    }
    setViewTab('editor');
  };

  const startBatchGeneration = () => {
    setBatchItems(prev => prev.map(b => ({ ...b, status: 'generating' as const })));
    let idx = 0;
    const interval = setInterval(() => {
      setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, status: 'done' as const } : b));
      idx++;
      if (idx >= batchItems.length) clearInterval(interval);
    }, 1200);
  };

  const handleRecycle = () => {
    if (recycleSource === 'email' && recycleTarget === 'linkedin' && activeVariant) {
      const body = activeVariant.body.replace(/{{your_name}}/g, '').replace(/Hi |Hey |Best,|Cheers,/g, '').trim();
      const shortened = body.split('\n').filter(l => l.trim()).slice(0, 6).join('\n');
      setLinkedinPost(shortened + '\n\n#AI #LeadGeneration #MarketingTech');
      setContentMode('linkedin');
    } else if (recycleSource === 'linkedin' && recycleTarget === 'email') {
      const variant = activeVariant;
      if (variant) {
        updateVariantField('body', `Hi {{first_name}},\n\nI shared this insight recently and thought it'd resonate with {{company}}:\n\n${linkedinPost.replace(/#\w+/g, '').trim()}\n\nWant to discuss how this applies to your team?\n\n{{your_name}}`);
      }
      setContentMode('email');
    }
    setShowRecycleModal(false);
  };

  const getSuggestionColor = (cat: string) => {
    if (cat === 'high') return { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' };
    if (cat === 'medium') return { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700' };
    return { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', text: 'text-blue-700' };
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
            <EditIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
              AI Content Studio <span className="text-slate-300 mx-1">&rsaquo;</span>
              <span className="text-indigo-600">
                {contentMode === 'email' ? 'Email Sequence' : contentMode === 'linkedin' ? 'LinkedIn Post' : 'Sales Proposal'}
              </span>
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {contentMode === 'email' && <>Multi-variant editor &middot; {steps.length} steps &middot; {activeStep?.variants.length || 0} variants</>}
              {contentMode === 'linkedin' && <>Social media content &middot; {linkedinPost.split(/\s+/).filter(Boolean).length} words &middot; {(linkedinPost.match(/#\w+/g) || []).length} hashtags</>}
              {contentMode === 'proposal' && <>Full proposal generator &middot; {Object.keys(proposalSections).length} sections</>}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowRecycleModal(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm" title="Recycle Content">
            <RecycleIcon className="w-3.5 h-3.5" />
            <span>Recycle</span>
          </button>
          <button onClick={() => setShowBatchModal(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <LayersIcon className="w-3.5 h-3.5" />
            <span>Batch</span>
          </button>
          <button onClick={handleExport} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <DownloadIcon className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button onClick={handleSave} className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${saved ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}>
            {saved ? <CheckIcon className="w-4 h-4" /> : <MailIcon className="w-4 h-4" />}
            <span>{saved ? 'Saved!' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTENT TYPE SELECTOR                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center space-x-2">
        {([
          { key: 'email' as ContentMode, label: 'Email Sequence', icon: <MailIcon className="w-4 h-4" /> },
          { key: 'linkedin' as ContentMode, label: 'LinkedIn Post', icon: <LinkedInIcon className="w-4 h-4" /> },
          { key: 'proposal' as ContentMode, label: 'Sales Proposal', icon: <DocumentIcon className="w-4 h-4" /> },
        ]).map(mode => (
          <button
            key={mode.key}
            onClick={() => { setContentMode(mode.key); setViewTab('editor'); }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              contentMode === mode.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
            }`}
          >
            {mode.icon}
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* VARIANT MANAGER / TOP BAR                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Email Step / Variant Tabs */}
            {contentMode === 'email' && (
              <>
                <div className="flex items-center space-x-1 mr-4 pr-4 border-r border-slate-200">
                  {steps.map((step, i) => (
                    <button
                      key={step.id}
                      onClick={() => setActiveStepIdx(i)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeStepIdx === i
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Email {step.stepNumber}
                    </button>
                  ))}
                </div>
                {activeStep?.variants.map(v => (
                  <button
                    key={v.id}
                    onClick={() => switchVariant(v.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      activeStep.activeVariantId === v.id
                        ? 'bg-violet-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {v.name} {v.isControl && <span className="text-[9px] opacity-75">(Control)</span>}
                  </button>
                ))}
                {activeStep && activeStep.variants.length < 5 && (
                  <button onClick={addVariant} className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all">
                    <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}

            {contentMode === 'linkedin' && (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tone:</span>
                  {(['thought_leadership', 'casual', 'educational', 'storytelling'] as const).map(t => (
                    <button key={t} onClick={() => setLinkedinTone(t)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${linkedinTone === t ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <div className="border-l border-slate-200 pl-3 flex items-center space-x-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Goal:</span>
                  {(['engagement', 'traffic', 'leads'] as const).map(g => (
                    <button key={g} onClick={() => setLinkedinGoal(g)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${linkedinGoal === g ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {contentMode === 'proposal' && (
              <span className="text-xs font-bold text-slate-500">Enterprise Proposal Template &middot; 6 sections</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {contentMode === 'email' && (
              <button
                onClick={() => setShowABConfig(!showABConfig)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${showABConfig ? 'bg-violet-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              >
                <SlidersIcon className="w-3.5 h-3.5" />
                <span>A/B Config</span>
              </button>
            )}
            <button
              onClick={() => setShowFindReplace(!showFindReplace)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all"
            >
              <FilterIcon className="w-3.5 h-3.5" />
              <span>Find &amp; Replace</span>
            </button>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {(['editor', 'preview', 'analytics', 'templates'] as ViewTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className={`px-3 py-2 text-xs font-bold transition-all ${
                    viewTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {tab === 'templates' ? 'Templates' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active variant info bar — email only */}
        {contentMode === 'email' && activeVariant && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-4 text-xs text-slate-500">
              <span>Active: <span className="font-bold text-slate-700">{activeVariant.name}</span> {activeVariant.isControl && '(Control)'}</span>
              <span>&middot; Step {activeStep.stepNumber}: <span className="font-bold text-slate-700">{activeStep.delay}</span></span>
              <span>&middot; Performance: <span className="font-bold text-indigo-600">{aggregatePerformance.openRate}% opens</span></span>
            </div>
            <div className="flex items-center space-x-1">
              {suggestions.filter(s => s.applied).length > 0 && (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold">
                  {suggestions.filter(s => s.applied).length} suggestions applied
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* A/B Test Configuration Panel */}
      {showABConfig && contentMode === 'email' && (
        <div className="bg-white rounded-2xl border border-violet-200 shadow-sm p-5">
          <div className="flex items-center space-x-2 mb-4">
            <SlidersIcon className="w-4 h-4 text-violet-600" />
            <h3 className="font-bold text-slate-800 font-heading">A/B Test Configuration</h3>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${abTestConfig.status === 'draft' ? 'bg-slate-100 text-slate-500' : abTestConfig.status === 'running' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
              {abTestConfig.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Metric to Track */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Metric to Track</label>
              <div className="space-y-1.5">
                {([
                  { key: 'open_rate' as const, label: 'Open Rate' },
                  { key: 'click_rate' as const, label: 'Click Rate' },
                  { key: 'conversion_rate' as const, label: 'Conversion Rate' },
                ]).map(m => (
                  <label key={m.key} className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="ab-metric" checked={abTestConfig.metric === m.key} onChange={() => setAbTestConfig(prev => ({ ...prev, metric: m.key }))}
                      className="w-3.5 h-3.5 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs font-semibold text-slate-700">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Duration</label>
              <div className="space-y-1.5">
                {([
                  { key: '24h' as const, label: '24 hours' },
                  { key: '48h' as const, label: '48 hours' },
                  { key: 'significant' as const, label: 'Until statistically significant' },
                ]).map(d => (
                  <label key={d.key} className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="ab-duration" checked={abTestConfig.duration === d.key} onChange={() => setAbTestConfig(prev => ({ ...prev, duration: d.key }))}
                      className="w-3.5 h-3.5 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs font-semibold text-slate-700">{d.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Winner Selection */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Winner Selection</label>
              <div className="space-y-1.5">
                {([
                  { key: 'auto' as const, label: 'Auto-select best performer' },
                  { key: 'manual' as const, label: 'Notify me to choose' },
                ]).map(w => (
                  <label key={w.key} className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="ab-winner" checked={abTestConfig.winnerSelection === w.key} onChange={() => setAbTestConfig(prev => ({ ...prev, winnerSelection: w.key }))}
                      className="w-3.5 h-3.5 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs font-semibold text-slate-700">{w.label}</span>
                  </label>
                ))}
              </div>
              {/* Traffic Split */}
              <div className="mt-4">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Traffic Split</label>
                <div className="flex items-center space-x-2">
                  {activeStep?.variants.map((v, i) => (
                    <div key={v.id} className="flex items-center space-x-1">
                      <span className="text-[10px] font-bold text-slate-500">{v.name}:</span>
                      <span className="text-[10px] font-black text-violet-600">{Math.round(100 / (activeStep?.variants.length || 1))}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={() => setAbTestConfig(prev => ({ ...prev, status: 'running' }))}
              className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
            >
              {abTestConfig.status === 'running' ? 'Test Running...' : 'Start Test'}
            </button>
            <button className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">
              Save as Draft
            </button>
          </div>
        </div>
      )}

      {/* Find & Replace Panel */}
      {showFindReplace && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center space-x-3">
            <input
              value={findText}
              onChange={e => setFindText(e.target.value)}
              placeholder="Find..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <ArrowRightIcon className="w-4 h-4 text-slate-300 shrink-0" />
            <input
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <button onClick={handleFindReplace} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all">
              Replace All
            </button>
            <button onClick={() => setShowFindReplace(false)} className="p-2 text-slate-400 hover:text-slate-600">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TEMPLATES TAB                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewTab === 'templates' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                <GridIcon className="w-4 h-4 text-indigo-600" />
                <span>Content Templates</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {filteredTemplates.length} templates for {contentMode === 'email' ? 'Email' : contentMode === 'linkedin' ? 'LinkedIn' : 'Proposal'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <select value={templateFilter.industry} onChange={e => setTemplateFilter(prev => ({ ...prev, industry: e.target.value }))}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="All">All Industries</option>
                <option value="Technology">Technology</option>
                <option value="Enterprise">Enterprise</option>
                <option value="SaaS">SaaS</option>
              </select>
              <select value={templateFilter.goal} onChange={e => setTemplateFilter(prev => ({ ...prev, goal: e.target.value }))}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="All">All Goals</option>
                <option value="book_meeting">Book Meeting</option>
                <option value="nurture">Nurture</option>
                <option value="retention">Retention</option>
                <option value="engagement">Engagement</option>
                <option value="thought_leadership">Thought Leadership</option>
                <option value="close_deal">Close Deal</option>
              </select>
            </div>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="p-12 text-center">
              <GridIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">No templates match this filter</p>
              <p className="text-xs text-slate-300 mt-1">Try changing your industry or goal filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
              {filteredTemplates.map(tpl => (
                <div key={tpl.id} className="border border-slate-100 rounded-xl p-4 hover:border-indigo-200 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{tpl.name}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold">{tpl.industry}</span>
                        <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold">{tpl.goal.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <StarIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-black text-slate-700">{tpl.performance}%</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 mb-3 h-20 overflow-hidden">
                    <p className="text-[10px] text-slate-500 font-mono leading-relaxed line-clamp-4">{tpl.body.slice(0, 150)}...</p>
                  </div>
                  <button
                    onClick={() => applyTemplate(tpl)}
                    className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all opacity-0 group-hover:opacity-100"
                  >
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN LAYOUT                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewTab !== 'templates' && (
        <div className="flex flex-col lg:flex-row gap-5">

          {/* ─── Editor / Preview Area (65%) ─── */}
          <div className="lg:w-[65%] space-y-5">

            {/* ═══ EMAIL EDITOR ═══ */}
            {viewTab === 'editor' && contentMode === 'email' && activeVariant && (
              <>
                {/* Subject Line */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Subject Line</label>
                  <input
                    value={activeVariant.subject}
                    onChange={e => updateVariantField('subject', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="Enter subject line with {{tags}}..."
                  />
                  <div className="flex items-center mt-2 space-x-2">
                    <span className="text-[10px] text-slate-400">Chars: {activeVariant.subject.length}</span>
                    <span className={`text-[10px] font-bold ${activeVariant.subject.length > 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {activeVariant.subject.length > 60 ? 'Consider shorter' : 'Good length'}
                    </span>
                  </div>
                </div>

                {/* Body Editor */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Email Body</label>
                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <button
                          onClick={() => setShowTagPicker(!showTagPicker)}
                          className="flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all"
                        >
                          <BoltIcon className="w-3 h-3" />
                          <span>Insert Tag</span>
                        </button>
                        {showTagPicker && (
                          <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-52 py-2 max-h-64 overflow-y-auto">
                            {PERSONALIZATION_TAGS.map(tag => (
                              <button
                                key={tag}
                                onClick={() => insertTag(tag)}
                                className="w-full text-left px-3 py-2 text-xs font-mono text-indigo-600 hover:bg-indigo-50 transition-colors"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <textarea
                    value={activeVariant.body}
                    onChange={e => updateVariantField('body', e.target.value)}
                    onContextMenu={handleContextMenu}
                    rows={14}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none font-mono"
                    placeholder="Write your email body here..."
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-slate-400">Words: {activeVariant.body.split(/\s+/).filter(Boolean).length}</span>
                    <span className="text-[10px] text-slate-400">
                      Tags used: {(activeVariant.body.match(/\{\{[^}]+\}\}/g) || []).length}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* ═══ LINKEDIN EDITOR ═══ */}
            {viewTab === 'editor' && contentMode === 'linkedin' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <LinkedInIcon className="w-4 h-4 text-blue-600" />
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Post Content</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <button
                        onClick={() => setShowTagPicker(!showTagPicker)}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-all"
                      >
                        <BoltIcon className="w-3 h-3" />
                        <span>Insert Tag</span>
                      </button>
                      {showTagPicker && (
                        <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-52 py-2 max-h-64 overflow-y-auto">
                          {PERSONALIZATION_TAGS.map(tag => (
                            <button key={tag} onClick={() => insertTag(tag)}
                              className="w-full text-left px-3 py-2 text-xs font-mono text-blue-600 hover:bg-blue-50 transition-colors">{tag}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <textarea
                  value={linkedinPost}
                  onChange={e => setLinkedinPost(e.target.value)}
                  onContextMenu={handleContextMenu}
                  rows={12}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  placeholder="Write your LinkedIn post..."
                />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] text-slate-400">Chars: {linkedinPost.length}/3000</span>
                    <span className="text-[10px] text-slate-400">Words: {linkedinPost.split(/\s+/).filter(Boolean).length}</span>
                    <span className={`text-[10px] font-bold ${linkedinPost.length > 3000 ? 'text-rose-600' : linkedinPost.length > 1300 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {linkedinPost.length > 3000 ? 'Over limit' : linkedinPost.length > 1300 ? 'Good length' : 'Consider longer'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-400">Hashtags: {(linkedinPost.match(/#\w+/g) || []).length}</span>
                  </div>
                </div>

                {/* Hashtag suggestions */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Suggested Hashtags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['#AI', '#LeadGeneration', '#MarketingTech', '#SaaS', '#B2B', '#Sales', '#Growth', '#Automation'].map(tag => (
                      <button key={tag} onClick={() => { if (!linkedinPost.includes(tag)) setLinkedinPost(prev => prev + ' ' + tag); }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${linkedinPost.includes(tag) ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Post metadata */}
                <div className="mt-4 p-3.5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-blue-200 uppercase tracking-wider mb-1">Optimal Post Time</p>
                      <p className="text-xs font-bold">Wednesday 8:30 AM</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-blue-200 uppercase tracking-wider mb-1">Expected Engagement</p>
                      <p className="text-xs font-bold">2.8% <span className="text-blue-200 text-[10px]">(Above average)</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-blue-200 uppercase tracking-wider mb-1">Estimated Reach</p>
                      <p className="text-xs font-bold">~1,200 impressions</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROPOSAL EDITOR ═══ */}
            {viewTab === 'editor' && contentMode === 'proposal' && (
              <div className="space-y-4">
                {([
                  { key: 'executiveSummary', label: 'Executive Summary', icon: <TargetIcon className="w-3.5 h-3.5" /> },
                  { key: 'problemStatement', label: 'Problem Statement', icon: <FlameIcon className="w-3.5 h-3.5" /> },
                  { key: 'solution', label: 'Proposed Solution', icon: <SparklesIcon className="w-3.5 h-3.5" /> },
                  { key: 'roi', label: 'ROI Calculation', icon: <ChartIcon className="w-3.5 h-3.5" /> },
                  { key: 'pricing', label: 'Pricing Options', icon: <CopyIcon className="w-3.5 h-3.5" /> },
                  { key: 'nextSteps', label: 'Next Steps', icon: <ArrowRightIcon className="w-3.5 h-3.5" /> },
                ] as { key: keyof typeof proposalSections; label: string; icon: React.ReactNode }[]).map(section => (
                  <div key={section.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-indigo-600">{section.icon}</span>
                      <label className="text-xs font-black text-slate-500 uppercase tracking-wider">{section.label}</label>
                    </div>
                    <textarea
                      value={proposalSections[section.key]}
                      onChange={e => setProposalSections(prev => ({ ...prev, [section.key]: e.target.value }))}
                      rows={section.key === 'executiveSummary' || section.key === 'roi' || section.key === 'pricing' ? 6 : 4}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ═══ PREVIEW TAB ═══ */}
            {viewTab === 'preview' && contentMode === 'email' && activeVariant && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <EyeIcon className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 font-heading">AI Preview</h3>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Personalized</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                    <p className="text-xs text-slate-400">From: <span className="text-slate-600 font-semibold">{user.name} &lt;{user.email}&gt;</span></p>
                    <p className="text-xs text-slate-400 mt-1">To: <span className="text-slate-600 font-semibold">{leads[0]?.name || 'Sarah Johnson'} &lt;{leads[0]?.email || 'sarah@example.com'}&gt;</span></p>
                    <p className="text-xs text-slate-400 mt-1">Subject: <span className="text-slate-900 font-bold">
                      {activeVariant.subject
                        .replace('{{company}}', leads[0]?.company || 'Acme Corp')
                        .replace('{{first_name}}', leads[0]?.name?.split(' ')[0] || 'Sarah')
                        .replace('{{solve_pain_point}}', 'streamline lead management')}
                    </span></p>
                  </div>
                  <div className="p-5">
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {activeVariant.body
                        .replace(/\{\{first_name\}\}/g, leads[0]?.name?.split(' ')[0] || 'Sarah')
                        .replace(/\{\{company\}\}/g, leads[0]?.company || 'Acme Corp')
                        .replace(/\{\{industry\}\}/g, 'technology')
                        .replace(/\{\{personalized_opening\}\}/g, 'I noticed your recent expansion')
                        .replace(/\{\{value_proposition\}\}/g, 'Our AI-powered platform')
                        .replace(/\{\{target_outcome\}\}/g, 'accelerate pipeline velocity')
                        .replace(/\{\{pain_point\}\}/g, 'managing a growing lead pipeline')
                        .replace(/\{\{your_name\}\}/g, user.name || 'Your Name')
                        .replace(/\{\{recent_activity\}\}/g, 'viewed pricing page')
                        .replace(/\{\{ai_insight\}\}/g, leads[0]?.insights || 'High engagement detected')
                        .replace(/\{\{personalized_ps\}\}/g, `I saw ${leads[0]?.company || 'your company'} just raised a new round — exciting times!`)}
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 mt-3">
                  Preview personalized for: <span className="font-bold">{leads[0]?.name || 'Sample Lead'}</span> ({leads[0]?.company || 'Sample Co'})
                </p>
              </div>
            )}

            {viewTab === 'preview' && contentMode === 'linkedin' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <LinkedInIcon className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-800 font-heading">LinkedIn Preview</h3>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-w-lg mx-auto">
                  {/* LinkedIn post header */}
                  <div className="p-4 flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg">
                      {user.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{user.name || 'Your Name'}</p>
                      <p className="text-[11px] text-slate-400">Marketing Professional &middot; 1st</p>
                      <p className="text-[10px] text-slate-400">Just now &middot; <span className="text-blue-500">🌐</span></p>
                    </div>
                  </div>
                  {/* Post body */}
                  <div className="px-4 pb-4">
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {linkedinPost
                        .replace(/\{\{company\}\}/g, leads[0]?.company || 'Acme Corp')
                        .replace(/\{\{industry\}\}/g, 'technology')
                        .replace(/\{\{client_name\}\}/g, leads[0]?.company || 'leading companies')}
                    </div>
                  </div>
                  {/* Engagement bar */}
                  <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>👍 12 &middot; 💡 3</span>
                    <span>4 comments &middot; 2 reposts</span>
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-around">
                    {['Like', 'Comment', 'Repost', 'Send'].map(a => (
                      <button key={a} className="text-xs font-semibold text-slate-500 hover:text-slate-700 py-1 px-3 rounded-lg hover:bg-slate-50 transition-all">{a}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {viewTab === 'preview' && contentMode === 'proposal' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-6">
                  <DocumentIcon className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 font-heading">Proposal Preview</h3>
                </div>

                <div className="border border-slate-200 rounded-xl p-8 max-w-2xl mx-auto space-y-6">
                  {/* Title page */}
                  <div className="text-center py-8 border-b border-slate-100">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Confidential Proposal</p>
                    <h2 className="text-2xl font-black text-slate-900 font-heading">AI-Powered Growth Platform</h2>
                    <p className="text-sm text-slate-500 mt-2">Prepared for {leads[0]?.company || '{{company}}'}</p>
                    <p className="text-xs text-slate-400 mt-1">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>

                  {([
                    { key: 'executiveSummary', label: 'Executive Summary' },
                    { key: 'problemStatement', label: 'Problem Statement' },
                    { key: 'solution', label: 'Proposed Solution' },
                    { key: 'roi', label: 'ROI Analysis' },
                    { key: 'pricing', label: 'Pricing' },
                    { key: 'nextSteps', label: 'Next Steps' },
                  ] as { key: keyof typeof proposalSections; label: string }[]).map(s => (
                    <div key={s.key}>
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-2">{s.label}</h4>
                      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {proposalSections[s.key]
                          .replace(/\{\{company\}\}/g, leads[0]?.company || 'Acme Corp')
                          .replace(/\{\{industry\}\}/g, 'technology')
                          .replace(/\{\{pain_point\}\}/g, 'scaling lead generation')
                          .replace(/\{\{company_size\}\}/g, '150')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ ANALYTICS TAB ═══ */}
            {viewTab === 'analytics' && (
              <div className="space-y-5">
                {/* Variant Comparison Table — email only */}
                {contentMode === 'email' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="font-bold text-slate-800 font-heading">A/B Test Comparison</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Performance across all variants for Email {activeStep.stepNumber}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Variant</th>
                            <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Opens</th>
                            <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Clicks</th>
                            <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Replies</th>
                            <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Conv.</th>
                            <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Winner</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {activeStep.variants.map(v => {
                            const best = [...activeStep.variants].sort((a, b) => b.performance.openRate - a.performance.openRate)[0];
                            const isWinner = v.id === best.id;
                            return (
                              <tr key={v.id} className={`hover:bg-slate-50/50 transition-colors ${isWinner ? 'bg-emerald-50/30' : ''}`}>
                                <td className="px-6 py-3.5">
                                  <div className="flex items-center space-x-2">
                                    <span className={`w-2 h-2 rounded-full ${v.isControl ? 'bg-indigo-500' : 'bg-violet-500'}`}></span>
                                    <span className="font-semibold text-sm text-slate-800">{v.name}</span>
                                    {v.isControl && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">CTRL</span>}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5 text-right"><span className="text-sm font-bold text-slate-700">{v.performance.openRate}%</span></td>
                                <td className="px-6 py-3.5 text-right"><span className="text-sm font-bold text-slate-700">{v.performance.clickRate}%</span></td>
                                <td className="px-6 py-3.5 text-right"><span className="text-sm font-bold text-slate-700">{v.performance.replyRate}%</span></td>
                                <td className="px-6 py-3.5 text-right"><span className="text-sm font-bold text-slate-700">{v.performance.conversion}%</span></td>
                                <td className="px-6 py-3.5 text-right">
                                  {isWinner && (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black">
                                      WINNER
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sequence Performance Overview — email only */}
                {contentMode === 'email' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 font-heading mb-4">Sequence Drop-off</h3>
                    <div className="space-y-3">
                      {steps.map((step, i) => {
                        const dropOff = 100 - (i * 22);
                        const width = Math.max(15, dropOff);
                        return (
                          <div key={step.id} className="flex items-center space-x-4">
                            <div className="w-16 text-right shrink-0">
                              <p className="text-xs font-bold text-slate-600">Email {step.stepNumber}</p>
                              <p className="text-[10px] text-slate-400">{step.delay}</p>
                            </div>
                            <div className="flex-1">
                              <div className="h-8 bg-slate-50 rounded-lg overflow-hidden">
                                <div
                                  className="h-full rounded-lg flex items-center transition-all duration-700 bg-gradient-to-r from-indigo-500 to-violet-500"
                                  style={{ width: `${width}%` }}
                                >
                                  <span className="text-white font-black text-xs ml-3">{dropOff}%</span>
                                </div>
                              </div>
                            </div>
                            <div className="w-20 text-right shrink-0">
                              {i > 0 && (
                                <span className="text-xs font-semibold text-rose-500">
                                  &darr;{22}% drop
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* LinkedIn / Proposal Analytics */}
                {contentMode !== 'email' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 font-heading mb-4">
                      {contentMode === 'linkedin' ? 'Post Performance Prediction' : 'Proposal Effectiveness'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {contentMode === 'linkedin' ? (
                        <>
                          {[
                            { label: 'Impressions', value: '~1,200', trend: '+18%' },
                            { label: 'Engagement', value: '2.8%', trend: '+0.4%' },
                            { label: 'Comments', value: '~8', trend: '+3' },
                            { label: 'Profile Views', value: '~45', trend: '+22%' },
                          ].map(m => (
                            <div key={m.label} className="p-4 bg-slate-50 rounded-xl text-center">
                              <p className="text-lg font-black text-slate-800">{m.value}</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{m.label}</p>
                              <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{m.trend}</p>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          {[
                            { label: 'Win Rate', value: '34%', trend: '+8%' },
                            { label: 'Avg Deal Size', value: '$18.5K', trend: '+$2.1K' },
                            { label: 'Time to Close', value: '18 days', trend: '-3 days' },
                            { label: 'Response Rate', value: '72%', trend: '+12%' },
                          ].map(m => (
                            <div key={m.label} className="p-4 bg-slate-50 rounded-xl text-center">
                              <p className="text-lg font-black text-slate-800">{m.value}</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{m.label}</p>
                              <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{m.trend}</p>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ CAMPAIGN PERFORMANCE TRACKING ═══ */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                      <ChartIcon className="w-4 h-4 text-indigo-600" />
                      <span>Campaign Performance</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Last campaign results &middot; Based on {leads.length > 0 ? leads.length * 12 : 1245} sends</p>
                  </div>

                  <div className="p-5">
                    {/* KPI Row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                      {[
                        { label: 'Sent', value: leads.length > 0 ? (leads.length * 12).toLocaleString() : '1,245', color: 'slate' },
                        { label: 'Opens', value: '634 (51%)', color: 'indigo' },
                        { label: 'Clicks', value: '189 (15%)', color: 'violet' },
                        { label: 'Replies', value: '42 (3.4%)', color: 'emerald' },
                        { label: 'Demos Booked', value: '17 (1.4%)', color: 'amber' },
                      ].map(kpi => (
                        <div key={kpi.label} className={`p-3 rounded-xl bg-${kpi.color}-50 text-center`}>
                          <p className={`text-sm font-black text-${kpi.color}-700`}>{kpi.value}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{kpi.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Top Performing Segments */}
                    <div className="mb-5">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Top Performing Segments</p>
                      <div className="space-y-2">
                        {[
                          { segment: 'Tech Industry', conversion: 2.3, width: 100 },
                          { segment: '50-200 employees', conversion: 1.9, width: 83 },
                          { segment: 'West Coast', conversion: 1.7, width: 74 },
                        ].map(seg => (
                          <div key={seg.segment} className="flex items-center space-x-3">
                            <span className="text-xs font-semibold text-slate-600 w-36 shrink-0">{seg.segment}</span>
                            <div className="flex-1 h-5 bg-slate-50 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full flex items-center transition-all duration-700" style={{ width: `${seg.width}%` }}>
                                <span className="text-white font-black text-[10px] ml-2">{seg.conversion}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI Insights */}
                    <div className="mb-4">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">AI Insights</p>
                      <div className="space-y-2">
                        {[
                          'Subject lines with questions performed 28% better',
                          'Emails sent Tuesday AM had 40% higher opens',
                          'Personalized P.S. lines doubled reply rate',
                        ].map((insight, i) => (
                          <div key={i} className="flex items-start space-x-2 p-2.5 bg-indigo-50 rounded-lg">
                            <SparklesIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-indigo-700 font-semibold">&ldquo;{insight}&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2">
                      <button className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                        Replicate Success
                      </button>
                      <button onClick={() => setShowABConfig(true)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
                        A/B Test Improvements
                      </button>
                    </div>
                  </div>
                </div>

                {/* ═══ OPTIMIZATION WORKFLOW ═══ */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-bold text-slate-800 font-heading mb-3 flex items-center space-x-2">
                    <TargetIcon className="w-4 h-4 text-emerald-600" />
                    <span>Weekly Optimization Routine</span>
                  </h3>
                  <div className="space-y-2.5">
                    {[
                      { day: 'Mon', task: 'Review last week\'s performance', icon: <ChartIcon className="w-3.5 h-3.5" /> },
                      { day: 'Mon', task: 'Identify top 3 performing pieces', icon: <TrendUpIcon className="w-3.5 h-3.5" /> },
                      { day: 'Tue', task: 'Identify bottom 3 performing pieces', icon: <TrendDownIcon className="w-3.5 h-3.5" /> },
                      { day: 'Tue', task: 'Click [AI Analyze] on each', icon: <SparklesIcon className="w-3.5 h-3.5" /> },
                      { day: 'Wed', task: 'Apply learnings to this week\'s content', icon: <EditIcon className="w-3.5 h-3.5" /> },
                      { day: 'Thu', task: 'Set up A/B tests for hypotheses', icon: <SlidersIcon className="w-3.5 h-3.5" /> },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center space-x-3 p-2.5 rounded-lg hover:bg-slate-50 transition-all">
                        <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black w-10 text-center">{item.day}</span>
                        <span className="text-indigo-500">{item.icon}</span>
                        <span className="text-xs font-semibold text-slate-700">{item.task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* PERSONALIZATION ENGINE                                  */}
            {/* ═══════════════════════════════════════════════════════ */}
            {viewTab !== 'templates' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                      <SlidersIcon className="w-4 h-4 text-amber-600" />
                      <span>Personalization Engine</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Dynamic content rules &middot; {rules.length} active</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setShowTestRules(!showTestRules)}
                      className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${showTestRules ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      <EyeIcon className="w-3 h-3" />
                      <span>Test Rules</span>
                    </button>
                    <button onClick={() => setShowRuleModal(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                      <PlusIcon className="w-3 h-3" />
                      <span>Add Rule</span>
                    </button>
                  </div>
                </div>

                {/* Test Rules Preview */}
                {showTestRules && (
                  <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Rule Test Preview</p>
                    <p className="text-xs text-amber-600">
                      With a lead scoring 82 from a 300-person tech company: {rules.filter(r => {
                        if (r.condition === 'lead_score') return true;
                        if (r.condition === 'company_size') return true;
                        if (r.condition === 'industry') return true;
                        return false;
                      }).length} rules would fire, showing personalized content to ~{Math.min(100, rules.reduce((a, r) => a + r.audiencePercent, 0))}% of this segment.
                    </p>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">If</th>
                        <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Then Show</th>
                        <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Instead Of</th>
                        <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Audience</th>
                        <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rules.map(rule => (
                        <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-3.5">
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-mono font-bold">
                              {rule.condition} {rule.conditionValue}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="text-sm font-semibold text-slate-700">{rule.thenShow}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="text-sm text-slate-400">{rule.insteadOf || '—'}</span>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <span className="text-sm font-bold text-slate-600">{rule.audiencePercent}%</span>
                            <span className="text-[10px] text-slate-400 ml-1">of audience</span>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button onClick={() => removeRule(rule.id)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Sidebar (35%) ─── */}
          <div className="lg:w-[35%] space-y-5">

            {/* AI Suggestions — Color-coded */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                  <SparklesIcon className="w-4 h-4 text-indigo-600" />
                  <span>AI Suggestions</span>
                </h3>
                <button onClick={refreshSuggestions} disabled={suggestionsRefreshing} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                  <RefreshIcon className={`w-4 h-4 ${suggestionsRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center space-x-3 mb-3 px-1">
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-[9px] font-bold text-slate-400">High impact</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span className="text-[9px] font-bold text-slate-400">Medium</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-[9px] font-bold text-slate-400">Style</span>
                </div>
              </div>

              <div className="space-y-3">
                {suggestions.map(sug => {
                  const colors = getSuggestionColor(sug.category);
                  return (
                    <div
                      key={sug.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        sug.applied ? 'bg-emerald-50 border-emerald-200' : `${colors.bg} ${colors.border} hover:shadow-sm`
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${sug.applied ? 'bg-emerald-500' : colors.dot}`}></span>
                          <p className="text-xs font-bold text-slate-800">{sug.title}</p>
                        </div>
                        {sug.applied && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed mb-2 ml-4">{sug.description}</p>
                      <div className="flex items-center justify-between ml-4">
                        <span className={`text-[10px] font-bold ${sug.applied ? 'text-emerald-600' : colors.text}`}>
                          {sug.applied ? 'Applied' : sug.impactLabel}
                        </span>
                        {!sug.applied && (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => applySuggestion(sug.id)}
                              className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => setSuggestions(prev => prev.filter(s => s.id !== sug.id))}
                              className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all"
                            >
                              Ignore
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Predictive Performance */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                <ChartIcon className="w-4 h-4 text-violet-600" />
                <span>Predictive Performance</span>
              </h3>
              <p className="text-[10px] text-slate-400 mb-4">Based on 1,200 similar campaigns</p>

              <div className="space-y-3 mb-5">
                {[
                  { label: 'Open Rate', value: aggregatePerformance.openRate, margin: 8, color: 'indigo' },
                  { label: 'Click Rate', value: aggregatePerformance.clickRate, margin: 3, color: 'violet' },
                  { label: 'Reply Rate', value: aggregatePerformance.replyRate, margin: 2, color: 'emerald' },
                  { label: 'Conversion', value: aggregatePerformance.conversion, margin: 1.5, color: 'amber' },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{m.label}</span>
                      <span className="text-xs font-black text-slate-800">{m.value}% <span className="text-slate-400 font-normal">(&plusmn; {m.margin}%)</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-${m.color}-500 transition-all duration-500`} style={{ width: `${Math.min(100, m.value * 2)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Compared to YOUR Average */}
              <div className="p-3.5 bg-slate-50 rounded-xl mb-5">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Compared to YOUR Average</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Opens', ...userAvgComparison.opens },
                    { label: 'Clicks', ...userAvgComparison.clicks },
                    { label: 'Replies', ...userAvgComparison.replies },
                  ].map(b => (
                    <div key={b.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{b.label}</span>
                      <span className={`text-xs font-bold flex items-center space-x-1 ${b.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {b.up ? <TrendUpIcon className="w-3 h-3" /> : <TrendDownIcon className="w-3 h-3" />}
                        <span>{b.value} {b.up ? 'better' : 'worse'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optimal Send Time */}
              <div className="p-3.5 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl text-white">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-2">Optimal Send Time</p>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-[9px] font-black">1</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Tue 10:30 AM</p>
                      <p className="text-[10px] text-indigo-200">42% expected opens</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-[9px] font-black">2</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Thu 2:15 PM</p>
                      <p className="text-[10px] text-indigo-200">38% expected opens</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-indigo-200 mt-1">Avoid: Mon AM, Fri PM</p>
                </div>
              </div>
            </div>

            {/* ═══ KEYBOARD SHORTCUTS ═══ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowShortcuts(!showShortcuts)}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center space-x-2">
                  <KeyboardIcon className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Keyboard Shortcuts</span>
                </div>
                <span className={`text-slate-400 text-xs transition-transform ${showShortcuts ? 'rotate-180' : ''}`}>&darr;</span>
              </button>
              {showShortcuts && (
                <div className="px-5 pb-4 space-y-2 border-t border-slate-100 pt-3">
                  {[
                    { keys: 'Ctrl + S', desc: 'Save draft' },
                    { keys: 'Ctrl + P', desc: 'Toggle preview' },
                    { keys: 'Ctrl + K', desc: 'Insert personalization tag' },
                    { keys: 'Ctrl + Shift + A', desc: 'Refresh AI suggestions' },
                    { keys: 'Ctrl + Shift + P', desc: 'Performance prediction' },
                  ].map(s => (
                    <div key={s.keys} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{s.desc}</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-500">{s.keys}</kbd>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-semibold">Right-click in any editor for quick actions menu</p>
                  </div>
                </div>
              )}
            </div>

            {/* ═══ TROUBLESHOOTING ═══ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center space-x-2">
                  <HelpCircleIcon className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Troubleshooting</span>
                </div>
                <span className={`text-slate-400 text-xs transition-transform ${showTroubleshooting ? 'rotate-180' : ''}`}>&darr;</span>
              </button>
              {showTroubleshooting && (
                <div className="px-5 pb-4 space-y-4 border-t border-slate-100 pt-3">
                  {/* Issue 1 */}
                  <div>
                    <p className="text-xs font-bold text-slate-700 mb-1.5">AI content seems generic?</p>
                    <div className="space-y-1">
                      {[
                        'Upload your brand guidelines',
                        'Train AI on your style (Model Training)',
                        'Use industry-specific jargon',
                        'Add customer testimonials & metrics',
                        'Reference company-specific challenges',
                      ].map((tip, i) => (
                        <div key={i} className="flex items-start space-x-1.5">
                          <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-500">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Issue 2 */}
                  <div>
                    <p className="text-xs font-bold text-slate-700 mb-1.5">Low open/click rates?</p>
                    <div className="space-y-1">
                      {[
                        'Test different subject lines (A/B testing)',
                        'Adjust send times (check AI recommendations)',
                        'Improve preview text',
                        'Segment audience more specifically',
                        'Personalize beyond just {{first_name}}',
                        'Add urgency or curiosity elements',
                      ].map((tip, i) => (
                        <div key={i} className="flex items-start space-x-1.5">
                          <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-500">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Issue 3 */}
                  <div>
                    <p className="text-xs font-bold text-slate-700 mb-1.5">Content takes too long?</p>
                    <div className="space-y-1">
                      {[
                        'Use templates (saves 80% time)',
                        'Batch create content weekly',
                        'Set up content calendars in advance',
                        'Delegate to AI for first drafts',
                        'Recycle high-performing content',
                      ].map((tip, i) => (
                        <div key={i} className="flex items-start space-x-1.5">
                          <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-500">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ADD RULE MODAL                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRuleModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900">Add Personalization Rule</h2>
                <p className="text-xs text-slate-400 mt-0.5">Define dynamic content conditions</p>
              </div>
              <button onClick={() => setShowRuleModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">If</label>
                <div className="flex items-center space-x-2">
                  <select
                    value={newRule.condition}
                    onChange={e => setNewRule(prev => ({ ...prev, condition: e.target.value }))}
                    className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  >
                    <option value="lead_score">lead_score</option>
                    <option value="company_size">company_size</option>
                    <option value="industry">industry</option>
                    <option value="status">status</option>
                    <option value="days_in_pipeline">days_in_pipeline</option>
                  </select>
                  <input
                    value={newRule.conditionValue}
                    onChange={e => setNewRule(prev => ({ ...prev, conditionValue: e.target.value }))}
                    placeholder='> 75 or = "tech"'
                    className="w-32 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">Then Show</label>
                <input
                  value={newRule.thenShow}
                  onChange={e => setNewRule(prev => ({ ...prev, thenShow: e.target.value }))}
                  placeholder="e.g. Case study link + demo CTA"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">Instead Of</label>
                <input
                  value={newRule.insteadOf}
                  onChange={e => setNewRule(prev => ({ ...prev, insteadOf: e.target.value }))}
                  placeholder="e.g. Generic example"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <button
                onClick={addRule}
                disabled={!newRule.thenShow.trim()}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BATCH CREATION MODAL                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBatchModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                  <LayersIcon className="w-5 h-5 text-indigo-600" />
                  <span>Batch Content Creation</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Generate multiple pieces of content at once</p>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                {batchItems.map((item, i) => (
                  <div key={item.id} className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    item.status === 'done' ? 'bg-emerald-50 border-emerald-200' : item.status === 'generating' ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-black text-slate-400 w-5">{i + 1}.</span>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{item.label}</p>
                        <p className="text-[10px] text-slate-400">{item.tone} tone</p>
                      </div>
                    </div>
                    <div>
                      {item.status === 'pending' && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold">Pending</span>
                      )}
                      {item.status === 'generating' && (
                        <div className="flex items-center space-x-1.5">
                          <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                          <span className="text-[10px] font-bold text-indigo-600">Generating...</span>
                        </div>
                      )}
                      {item.status === 'done' && (
                        <span className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">
                          <CheckIcon className="w-3 h-3" />
                          <span>Done</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add batch item */}
              <button
                onClick={() => setBatchItems(prev => [...prev, { id: `b-${Date.now()}`, type: 'email', label: 'New Content Piece', tone: 'Professional', status: 'pending' }])}
                className="w-full py-2.5 border border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center space-x-1.5"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Add Content Piece</span>
              </button>

              <button
                onClick={startBatchGeneration}
                disabled={batchItems.every(b => b.status === 'done')}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {batchItems.every(b => b.status === 'done') ? 'All Generated!' : batchItems.some(b => b.status === 'generating') ? 'Generating...' : `Generate All (${batchItems.length} pieces)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTENT RECYCLING MODAL                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showRecycleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRecycleModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                  <RecycleIcon className="w-5 h-5 text-emerald-600" />
                  <span>Recycle Content</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Transform high-performing content into a new format</p>
              </div>
              <button onClick={() => setShowRecycleModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Source Format</label>
                <div className="flex items-center space-x-2">
                  {(['email', 'linkedin', 'proposal'] as ContentMode[]).map(m => (
                    <button key={m} onClick={() => setRecycleSource(m)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${recycleSource === m ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      {m === 'email' ? 'Email' : m === 'linkedin' ? 'LinkedIn' : 'Proposal'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-center">
                <ArrowRightIcon className="w-5 h-5 text-slate-300 rotate-90" />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Target Format</label>
                <div className="flex items-center space-x-2">
                  {(['email', 'linkedin', 'proposal'] as ContentMode[]).map(m => (
                    <button key={m} onClick={() => setRecycleTarget(m)} disabled={m === recycleSource}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${recycleTarget === m ? 'bg-emerald-600 text-white shadow-md' : m === recycleSource ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      {m === 'email' ? 'Email' : m === 'linkedin' ? 'LinkedIn' : 'Proposal'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">What happens</p>
                <p className="text-xs text-slate-600">
                  AI will adapt your {recycleSource} content into {recycleTarget} format while keeping the winning elements — tone, key messages, and persuasive structure.
                </p>
              </div>

              <button
                onClick={handleRecycle}
                disabled={recycleSource === recycleTarget}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
              >
                Recycle Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTEXT MENU (Right-click)                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed bg-white border border-slate-200 rounded-xl shadow-2xl py-2 z-50 w-56"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Quick Actions</p>
          </div>
          {contextActions.map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center space-x-2"
            >
              <SparklesIcon className="w-3 h-3 text-slate-400" />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentStudio;
