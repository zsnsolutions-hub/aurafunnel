import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User, Lead, ToneType, ContentCategory, EmailSequenceConfig, EmailProvider } from '../../types';
import { supabase } from '../../lib/supabase';
import { normalizeLeads } from '../../lib/queries';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { fetchOwnerEmailPerformance, sendTrackedEmail, sendTrackedEmailBatch, scheduleEmailBlock, fetchConnectedEmailProvider } from '../../lib/emailTracking';
import type { ConnectedEmailProvider } from '../../lib/emailTracking';
import { generateProposalPdf, generateEmailSequencePdf } from '../../lib/pdfExport';
import { generateEmailSequence, generateContentByCategory, parseEmailSequenceResponse, buildEmailFooter, generateContentSuggestions } from '../../lib/gemini';
import { resolvePersonalizationTags } from '../../lib/personalization';
import {
  SparklesIcon, MailIcon, CheckIcon, XIcon, PlusIcon, CopyIcon,
  EditIcon, EyeIcon, ChartIcon, RefreshIcon, FilterIcon,
  TrendUpIcon, TrendDownIcon, ClockIcon, TargetIcon, BoltIcon,
  DownloadIcon, FlameIcon, SlidersIcon, ArrowRightIcon, StarIcon,
  LinkedInIcon, RecycleIcon, LayersIcon, GridIcon, DocumentIcon,
  KeyboardIcon, HelpCircleIcon, BrainIcon, ActivityIcon, CalendarIcon,
  TagIcon, MessageIcon, SendIcon, AlertTriangleIcon, CameraIcon, CursorClickIcon, ChevronDownIcon
} from '../../components/Icons';
import ImageGeneratorDrawer from '../../components/image-gen/ImageGeneratorDrawer';
import CTAButtonBuilderModal from '../../components/email/CTAButtonBuilderModal';
import { PageHeader } from '../../components/layout/PageHeader';
import { AdvancedOnly } from '../../components/ui-mode';
import { useIntegrations } from '../../lib/integrations';
import { useUsageLimits } from '../../hooks/useUsageLimits';
import UpgradeModal from '../../components/portal/UpgradeModal';

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
  originalText?: string;
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

interface ContentNote {
  id: string;
  text: string;
  variant: string;
  timestamp: Date;
}

interface SendHistoryEntry {
  id: string;
  label: string;
  sentAt: Date;
  recipients: number;
  openRate: number;
  status: 'sent' | 'scheduled' | 'failed';
}

interface ContentHealthScore {
  overall: number;
  personalization: number;
  clarity: number;
  ctaStrength: number;
  engagement: number;
  deliverability: number;
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
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    conversion: 0,
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
  const { user, refreshProfile } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { integrations: integrationStatuses } = useIntegrations();
  const { warnings: usageWarnings, checkEmail: checkEmailLimit, limitError, clearError: clearLimitError } = useUsageLimits(user.id, user.plan);

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
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ─── Panels ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // ─── New Wireframe State ───
  const [contentNotes, setContentNotes] = useState<ContentNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showSendHistory, setShowSendHistory] = useState(false);
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [sendHistory, setSendHistory] = useState<SendHistoryEntry[]>([]);
  const [sendHistoryLoading, setSendHistoryLoading] = useState(false);
  const [linkedinCopied, setLinkedinCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSendPostMenu, setShowSendPostMenu] = useState(false);
  const [showGenerateMenu, setShowGenerateMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showCtaBuilder, setShowCtaBuilder] = useState(false);
  const [emailImages, setEmailImages] = useState<string[]>([]);

  // ─── AI Generation ───
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ─── Email Sending ───
  const [connectedProvider, setConnectedProvider] = useState<ConnectedEmailProvider | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [sendingEmails, setSendingEmails] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<string>('all');

  // ─── Test Email ───
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; error?: string } | null>(null);

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('leads').select('*').eq('client_id', user.id).order('score', { ascending: false });
      if (error) throw error;
      setLeads(normalizeLeads(data || []));
    } catch (err: unknown) {
      console.error('Studio fetch error:', err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Fetch connected email provider ──
  useEffect(() => {
    let cancelled = false;
    fetchConnectedEmailProvider().then(result => {
      if (!cancelled) { setConnectedProvider(result); setProviderLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const filteredLeadsForSend = useMemo(() => {
    return leads.filter(l => {
      if (!l.email) return false;
      if (segmentFilter === 'all') return true;
      if (segmentFilter === 'hot') return l.score > 75;
      if (segmentFilter === 'warm') return l.score >= 40 && l.score <= 75;
      if (segmentFilter === 'cold') return l.score < 40;
      if (segmentFilter === 'new') return l.status === 'New';
      return true;
    });
  }, [leads, segmentFilter]);

  // ── Load real send history when panel opens ──
  useEffect(() => {
    if (!showSendHistory) return;
    let cancelled = false;
    const loadHistory = async () => {
      setSendHistoryLoading(true);
      const raw = await fetchOwnerEmailPerformance();
      if (cancelled) return;

      // Group by subject into SendHistoryEntry
      const grouped = new Map<string, typeof raw>();
      for (const entry of raw) {
        const key = entry.subject;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(entry);
      }

      const history: SendHistoryEntry[] = Array.from(grouped.entries()).map(([subject, entries], i) => ({
        id: `sh-${i}`,
        label: subject,
        sentAt: new Date(entries[0].sentAt),
        recipients: entries.length,
        openRate: entries.length > 0
          ? +(entries.reduce((a, e) => a + (e.opens > 0 ? 1 : 0), 0) / entries.length * 100).toFixed(1)
          : 0,
        status: 'sent' as const,
      }));

      setSendHistory(history);
      setSendHistoryLoading(false);
    };
    loadHistory();
    return () => { cancelled = true; };
  }, [showSendHistory]);

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

  const IMAGE_PLACEHOLDER_REGEX = /\[image:(https?:\/\/[^\]]+)\]/g;

  const buildHtmlBody = (bodyText: string, footer: string) => {
    // Legacy: prepend images from emailImages array (LinkedIn mode / backward compat)
    const legacyImagesHtml = emailImages.length > 0
      ? emailImages.map(url => `<div style="margin-bottom:16px;text-align:center;"><img src="${url}" alt="" style="display:block;margin:0 auto;max-width:100%;height:auto;border-radius:8px;" /></div>`).join('')
      : '';
    // Replace [image:URL] placeholders with inline <img> tags
    const htmlBody = bodyText
      .replace(IMAGE_PLACEHOLDER_REGEX, (_match, url) => `<div style="margin:16px 0;text-align:center;"><img src="${url}" alt="" style="display:block;margin:0 auto;max-width:100%;height:auto;border-radius:8px;" /></div>`)
      .replace(/\n/g, '<br />');
    return `<div>${legacyImagesHtml}${htmlBody}</div>${footer}`;
  };

  const parseBodySegments = (text: string): { type: 'text' | 'image'; value: string }[] => {
    const segments: { type: 'text' | 'image'; value: string }[] = [];
    const regex = /\[image:(https?:\/\/[^\]]+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // Always push a text segment before each image (even if empty)
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      segments.push({ type: 'image', value: match[1] });
      lastIndex = regex.lastIndex;
    }
    // Always push trailing text segment
    segments.push({ type: 'text', value: text.slice(lastIndex) });
    return segments;
  };

  const reconstructBody = (segments: { type: 'text' | 'image'; value: string }[]): string => {
    return segments.map(seg => seg.type === 'image' ? `[image:${seg.value}]` : seg.value).join('');
  };

  const moveImageInBody = (imageIndex: number, direction: 'up' | 'down') => {
    if (!activeVariant) return;
    const segments = parseBodySegments(activeVariant.body);
    let count = 0;
    let segIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].type === 'image') {
        if (count === imageIndex) { segIdx = i; break; }
        count++;
      }
    }
    if (segIdx === -1) return;
    if (direction === 'up' && segIdx > 1) {
      // Swap image with the text segment above it
      [segments[segIdx - 1], segments[segIdx]] = [segments[segIdx], segments[segIdx - 1]];
    } else if (direction === 'down' && segIdx < segments.length - 2) {
      // Swap image with the text segment below it
      [segments[segIdx], segments[segIdx + 1]] = [segments[segIdx + 1], segments[segIdx]];
    }
    updateVariantField('body', reconstructBody(segments));
  };

  const removeImageFromBody = (imageIndex: number) => {
    if (!activeVariant) return;
    const segments = parseBodySegments(activeVariant.body);
    let count = 0;
    const newSegments = segments.filter(seg => {
      if (seg.type === 'image') {
        if (count === imageIndex) { count++; return false; }
        count++;
      }
      return true;
    });
    updateVariantField('body', reconstructBody(newSegments));
  };

  const updateTextSegment = (segmentIndex: number, newText: string) => {
    if (!activeVariant) return;
    const segments = parseBodySegments(activeVariant.body);
    if (segmentIndex < segments.length && segments[segmentIndex].type === 'text') {
      segments[segmentIndex] = { ...segments[segmentIndex], value: newText };
      updateVariantField('body', reconstructBody(segments));
    }
  };

  const bodyImageUrls = useMemo(() => {
    if (!activeVariant) return [];
    const urls: string[] = [];
    const regex = /\[image:(https?:\/\/[^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(activeVariant.body)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, [activeVariant]);

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

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const totalVariants = steps.reduce((a, s) => a + s.variants.length, 0);
    const suggestionsApplied = suggestions.filter(s => s.applied).length;
    const avgOpen = aggregatePerformance.openRate;
    const improvement = suggestions.filter(s => s.applied).reduce((a, s) => a + s.impactPercent, 0);
    return {
      piecesCreated: steps.length + (contentMode === 'linkedin' ? 1 : 0) + (contentMode === 'proposal' ? 1 : 0),
      activeVariants: totalVariants,
      avgOpenRate: avgOpen,
      rulesActive: rules.length,
      suggestionsApplied,
      improvementScore: improvement,
    };
  }, [steps, suggestions, aggregatePerformance.openRate, rules.length, contentMode]);

  // ─── Content Health Score ───
  const contentHealth = useMemo((): ContentHealthScore | null => {
    let body = '';
    let subject = '';
    if (contentMode === 'email' && activeVariant) {
      body = activeVariant.body;
      subject = activeVariant.subject;
    } else if (contentMode === 'linkedin') {
      body = linkedinPost;
    } else if (contentMode === 'proposal') {
      body = Object.values(proposalSections).join('\n');
    }
    if (!body || body.length < 20) return null;

    const hasTags = /\{\{.+?\}\}/.test(body);
    const subjectTags = /\{\{.+?\}\}/.test(subject);
    const hasCTA = /\b(book|schedule|call|demo|try|start|click|learn|reserve|sign up|register)\b/i.test(body);
    const hasQuestion = body.includes('?');
    const hasNumbers = /\d+%?/.test(body);
    const hasSocialProof = /\b(used by|trusted by|companies|customers|clients|teams)\b/i.test(body);
    const words = body.split(/\s+/).filter(Boolean).length;
    const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentLen = sentences.length > 0 ? words / sentences.length : words;

    let personalization = 25;
    if (hasTags) personalization += 35;
    if (subjectTags) personalization += 20;
    if (rules.length > 0) personalization += Math.min(20, rules.length * 7);

    let clarity = 35;
    if (avgSentLen < 20) clarity += 30;
    else if (avgSentLen < 30) clarity += 15;
    if (body.includes('\n\n')) clarity += 15;
    if (/[•\-\*]\s/.test(body)) clarity += 20;

    let ctaStrength = 10;
    if (hasCTA) ctaStrength += 35;
    if (/\[.+?\]/.test(body)) ctaStrength += 25;
    if (/\bfree\b|\btoday\b|\bnow\b/i.test(body)) ctaStrength += 15;
    if (/\b\d+ min(ute)?s?\b/i.test(body)) ctaStrength += 15;

    let engagement = 20;
    if (hasQuestion) engagement += 20;
    if (hasSocialProof) engagement += 15;
    if (hasNumbers) engagement += 15;
    if (words > 40 && words < 200) engagement += 15;
    if (/p\.?s\.?/i.test(body)) engagement += 15;

    let deliverability = 60;
    if (!/[A-Z]{5,}/.test(body)) deliverability += 15;
    if (!/!{2,}/.test(body)) deliverability += 10;
    if (!(body.match(/free|guarantee|limited time|act now|congratulations/gi) || []).length) deliverability += 15;

    const scores = {
      personalization: Math.min(personalization, 100),
      clarity: Math.min(clarity, 100),
      ctaStrength: Math.min(ctaStrength, 100),
      engagement: Math.min(engagement, 100),
      deliverability: Math.min(deliverability, 100),
    };
    const overall = Math.round(Object.values(scores).reduce((a, v) => a + v, 0) / 5);
    return { overall, ...scores };
  }, [contentMode, activeVariant, linkedinPost, proposalSections, rules.length]);

  // ─── Industry Benchmarks ───
  const industryBenchmarks = useMemo(() => {
    return {
      openRate: { yours: aggregatePerformance.openRate, industry: 28.5, top10: 52.3 },
      clickRate: { yours: aggregatePerformance.clickRate, industry: 4.2, top10: 12.8 },
      replyRate: { yours: aggregatePerformance.replyRate, industry: 2.1, top10: 7.4 },
      conversionRate: { yours: aggregatePerformance.conversion, industry: 1.8, top10: 5.2 },
    };
  }, [aggregatePerformance]);

  // ─── Handlers ───
  const addNote = () => {
    if (!noteInput.trim()) return;
    const note: ContentNote = {
      id: `note-${Date.now()}`,
      text: noteInput.trim(),
      variant: contentMode === 'email' ? (activeVariant?.name || 'Email') : contentMode,
      timestamp: new Date(),
    };
    setContentNotes(prev => [note, ...prev].slice(0, 20));
    setNoteInput('');
  };

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
    const sug = suggestions.find(s => s.id === sugId);
    if (!sug?.replacement) return;
    setSuggestions(prev => prev.map(s => s.id === sugId ? { ...s, applied: true } : s));

    if (contentMode === 'email' && activeVariant) {
      if (sug.originalText) {
        // Find-and-replace in subject or body
        if (activeVariant.subject.includes(sug.originalText)) {
          updateVariantField('subject', activeVariant.subject.replace(sug.originalText, sug.replacement));
        } else {
          updateVariantField('body', activeVariant.body.replace(sug.originalText, sug.replacement));
        }
      } else {
        // No original text (structure/cta) — append
        updateVariantField('body', activeVariant.body + '\n' + sug.replacement);
      }
    } else if (contentMode === 'linkedin') {
      if (sug.originalText) {
        setLinkedinPost(prev => prev.replace(sug.originalText!, sug.replacement!));
      } else {
        setLinkedinPost(prev => prev + '\n' + sug.replacement);
      }
    } else if (contentMode === 'proposal') {
      if (sug.originalText) {
        // Find which section contains the original text, replace there
        setProposalSections(prev => {
          const updated = { ...prev };
          for (const key of Object.keys(updated) as (keyof typeof updated)[]) {
            if (updated[key].includes(sug.originalText!)) {
              updated[key] = updated[key].replace(sug.originalText!, sug.replacement!);
              break;
            }
          }
          return updated;
        });
      } else {
        // Append to executive summary for structure/cta
        setProposalSections(prev => ({ ...prev, executiveSummary: prev.executiveSummary + '\n' + sug.replacement }));
      }
    }
  };

  const parseSuggestionsFromAI = (text: string): AISuggestion[] => {
    const blocks = text.split('===SUGGESTION===').filter(b => b.trim());
    const parsed: AISuggestion[] = [];
    for (const block of blocks) {
      const cleaned = block.replace('===END_SUGGESTION===', '').trim();
      const typeMatch = cleaned.match(/TYPE:\s*(word|metric|personalization|structure|cta)/i);
      const catMatch = cleaned.match(/CATEGORY:\s*(high|medium|style)/i);
      const titleMatch = cleaned.match(/TITLE:\s*(.+)/i);
      const descMatch = cleaned.match(/DESCRIPTION:\s*(.+)/i);
      const origMatch = cleaned.match(/ORIGINAL_TEXT:\s*(.+)/i);
      const replMatch = cleaned.match(/REPLACEMENT:\s*(.+)/i);
      const impactLabelMatch = cleaned.match(/IMPACT_LABEL:\s*(.+)/i);
      const impactPctMatch = cleaned.match(/IMPACT_PERCENT:\s*(\d+)/i);
      if (titleMatch && descMatch) {
        parsed.push({
          id: `sug-ai-${Date.now()}-${parsed.length}`,
          type: (typeMatch?.[1]?.toLowerCase() as AISuggestion['type']) || 'word',
          category: (catMatch?.[1]?.toLowerCase() as AISuggestion['category']) || 'medium',
          title: titleMatch[1].trim(),
          description: descMatch[1].trim(),
          originalText: origMatch?.[1]?.trim() || undefined,
          replacement: replMatch?.[1]?.trim() || undefined,
          impactLabel: impactLabelMatch?.[1]?.trim() || '+5% improvement',
          impactPercent: parseInt(impactPctMatch?.[1] || '5', 10),
          applied: false,
        });
      }
    }
    return parsed;
  };

  const refreshSuggestions = async () => {
    let content = '';
    if (contentMode === 'email' && activeVariant) {
      content = `Subject: ${activeVariant.subject}\n\n${activeVariant.body}`;
    } else if (contentMode === 'linkedin') {
      content = linkedinPost;
    } else if (contentMode === 'proposal') {
      content = Object.entries(proposalSections).map(([k, v]) => `${k}: ${v}`).join('\n\n');
    }
    if (content.length < 20) return;

    setSuggestionsRefreshing(true);
    try {
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS['content_suggestions']);
      if (!creditResult.success) {
        setAiError(creditResult.message || 'Insufficient credits.');
        setSuggestionsRefreshing(false);
        return;
      }
      const response = await generateContentSuggestions(content, contentMode, user.businessProfile);
      if (response.text.startsWith('SUGGESTIONS FAILED')) {
        setAiError('Failed to refresh suggestions. Please try again.');
        return;
      }
      const parsed = parseSuggestionsFromAI(response.text);
      if (parsed.length > 0) {
        setSuggestions(parsed);
      }
    } catch {
      setAiError('Failed to refresh suggestions. Please try again.');
    } finally {
      setSuggestionsRefreshing(false);
    }
  };

  const parseProposalSections = (text: string): Partial<typeof proposalSections> => {
    const result: Partial<typeof proposalSections> = {};
    const sectionMap: Record<string, keyof typeof proposalSections> = {
      'executive summary': 'executiveSummary',
      'problem statement': 'problemStatement',
      'proposed solution': 'solution',
      'solution': 'solution',
      'roi': 'roi',
      'roi analysis': 'roi',
      'roi calculation': 'roi',
      'pricing': 'pricing',
      'pricing options': 'pricing',
      'next steps': 'nextSteps',
      'timeline': 'nextSteps',
    };
    const sections = text.split(/(?:^|\n)(?:#{1,3}\s*|[A-Z][A-Z\s/&]+:?\s*\n|(?:\*\*|__)([^*_]+)(?:\*\*|__)\s*\n)/m);
    const headerPattern = /(?:#{1,3}\s*|(?:\*\*|__)?)([A-Za-z\s/&]+?)(?:\*\*|__)?:?\s*$/;
    let currentKey: keyof typeof proposalSections | null = null;

    for (const chunk of sections) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const headerMatch = trimmed.match(headerPattern);
      if (headerMatch) {
        const headerLower = headerMatch[1].trim().toLowerCase();
        for (const [pattern, key] of Object.entries(sectionMap)) {
          if (headerLower.includes(pattern)) { currentKey = key; break; }
        }
      } else if (currentKey) {
        result[currentKey] = trimmed;
      }
    }

    // Fallback: split into 6 chunks
    if (Object.keys(result).length < 2) {
      const lines = text.split('\n\n').filter(l => l.trim().length > 10);
      const keys: (keyof typeof proposalSections)[] = ['executiveSummary', 'problemStatement', 'solution', 'roi', 'pricing', 'nextSteps'];
      for (let i = 0; i < Math.min(lines.length, keys.length); i++) {
        result[keys[i]] = lines[i].trim();
      }
    }
    return result;
  };

  const handleGenerateWithAI = async () => {
    if (leads.length === 0 || aiGenerating) return;
    setAiGenerating(true);
    setAiError(null);

    try {
      const creditType = contentMode === 'email' ? 'email_sequence' : 'content_generation';
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS[creditType]);
      if (!creditResult.success) {
        setAiError(creditResult.message || 'Insufficient credits.');
        setAiGenerating(false);
        return;
      }
      if (contentMode === 'email') {
        const config: EmailSequenceConfig = {
          audienceLeadIds: leads.map(l => l.id),
          goal: 'book_meeting',
          sequenceLength: steps.length || 3,
          cadence: 'every_2_days',
          tone: ToneType.PROFESSIONAL,
        };
        const response = await generateEmailSequence(leads, config, user.businessProfile);
        if (response.text.startsWith('SEQUENCE GENERATION FAILED') || response.text.startsWith('CRITICAL FAILURE')) {
          setAiError('Email generation failed. Please try again.');
          return;
        }
        const parsed = parseEmailSequenceResponse(response.text, config);
        if (parsed.length > 0) {
          const newSteps: EmailStep[] = parsed.map(p => ({
            id: p.id,
            stepNumber: p.stepNumber,
            delay: p.delay,
            variants: [{
              id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: 'AI Generated',
              subject: p.subject,
              body: p.body,
              performance: { openRate: 0, clickRate: 0, replyRate: 0, conversion: 0 },
              isControl: true,
            }],
            activeVariantId: '',
          }));
          setSteps(newSteps.map(s => ({ ...s, activeVariantId: s.variants[0].id })));
          setActiveStepIdx(0);
        }
      } else if (contentMode === 'linkedin') {
        const context = `Tone: ${linkedinTone}, Goal: ${linkedinGoal}`;
        const response = await generateContentByCategory(
          leads[0], ContentCategory.SOCIAL_MEDIA, ToneType.PROFESSIONAL, context, user.businessProfile
        );
        if (!response.text.startsWith('GENERATION FAILED') && !response.text.startsWith('CRITICAL FAILURE')) {
          setLinkedinPost(response.text);
        } else {
          setAiError('LinkedIn post generation failed. Please try again.');
        }
      } else if (contentMode === 'proposal') {
        const response = await generateContentByCategory(
          leads[0], ContentCategory.PROPOSAL, ToneType.PROFESSIONAL, '', user.businessProfile
        );
        if (!response.text.startsWith('GENERATION FAILED') && !response.text.startsWith('CRITICAL FAILURE')) {
          const sections = parseProposalSections(response.text);
          setProposalSections(prev => ({ ...prev, ...sections }));
        } else {
          setAiError('Proposal generation failed. Please try again.');
        }
      }
      if (refreshProfile) await refreshProfile();
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'AI generation failed. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  const insertTag = (tag: string) => {
    if (contentMode === 'email' && activeVariant) {
      const el = activeTextareaRef.current;
      if (el) {
        const segIdx = parseInt(el.dataset.segIdx || '0', 10);
        const segments = parseBodySegments(activeVariant.body);
        if (segIdx < segments.length && segments[segIdx].type === 'text') {
          const pos = el.selectionStart ?? segments[segIdx].value.length;
          segments[segIdx] = { ...segments[segIdx], value: segments[segIdx].value.slice(0, pos) + tag + segments[segIdx].value.slice(pos) };
          updateVariantField('body', reconstructBody(segments));
          requestAnimationFrame(() => {
            el.focus();
            const newPos = pos + tag.length;
            el.selectionStart = newPos;
            el.selectionEnd = newPos;
          });
        }
      } else {
        updateVariantField('body', activeVariant.body + tag);
      }
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

  const handleCopyLinkedin = () => {
    const personalized = resolvePersonalizationTags(
      linkedinPost.replace(/\{\{your_name\}\}/gi, user.name || ''),
      leads[0] || {},
      user.businessProfile
    );
    navigator.clipboard.writeText(personalized);
    setLinkedinCopied(true);
    setTimeout(() => setLinkedinCopied(false), 2500);
  };

  const handleOpenLinkedin = () => {
    window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank');
  };

  const handleExport = async (format: 'txt' | 'pdf' = 'txt') => {
    setShowExportMenu(false);
    if (format === 'pdf') {
      if (contentMode === 'proposal') {
        const sections = [
          { label: 'Executive Summary', body: proposalSections.executiveSummary },
          { label: 'Problem Statement', body: proposalSections.problemStatement },
          { label: 'Proposed Solution', body: proposalSections.solution },
          { label: 'ROI Analysis', body: proposalSections.roi },
          { label: 'Pricing', body: proposalSections.pricing },
          { label: 'Next Steps', body: proposalSections.nextSteps },
        ];
        const selectedLead = leads[0];
        const personalization: Record<string, string> = {
          '{{company}}': selectedLead?.company || 'Acme Corp',
          '{{industry}}': selectedLead?.knowledgeBase?.industry || 'your industry',
          '{{pain_point}}': 'scaling lead generation',
          '{{company_size}}': selectedLead?.knowledgeBase?.employeeCount || '',
          '{{first_name}}': selectedLead?.name?.split(' ')[0] || '',
        };
        await generateProposalPdf({
          companyName: user.name || 'Your Company',
          recipientCompany: leads[0]?.company || '{{company}}',
          date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          sections,
          personalization,
        });
      } else if (contentMode === 'email') {
        const blocks = steps.map(step => {
          const v = step.variants.find(vr => vr.id === step.activeVariantId) || step.variants[0];
          return { title: `Email ${step.stepNumber} (${step.delay})`, subject: v.subject, body: v.body };
        });
        await generateEmailSequencePdf(blocks);
      } else if (contentMode === 'linkedin') {
        await generateEmailSequencePdf([{ title: 'LinkedIn Post', subject: linkedinTone, body: linkedinPost }]);
      }
      return;
    }
    // TXT export (original logic)
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

  const startBatchGeneration = async () => {
    if (leads.length === 0) return;
    for (let idx = 0; idx < batchItems.length; idx++) {
      const item = batchItems[idx];
      if (item.status === 'done') continue;
      setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, status: 'generating' as const } : b));
      try {
        const batchCredit = await consumeCredits(supabase, CREDIT_COSTS['batch_generation']);
        if (!batchCredit.success) {
          setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, status: 'done' as const } : b));
          break;
        }
        if (item.type === 'email') {
          await generateEmailSequence(leads, {
            audienceLeadIds: leads.map(l => l.id), goal: 'book_meeting',
            sequenceLength: 3, cadence: 'every_2_days', tone: ToneType.PROFESSIONAL,
          }, user.businessProfile);
        } else if (item.type === 'linkedin') {
          await generateContentByCategory(leads[0], ContentCategory.SOCIAL_MEDIA, ToneType.PROFESSIONAL, item.tone, user.businessProfile);
        } else {
          await generateContentByCategory(leads[0], ContentCategory.PROPOSAL, ToneType.PROFESSIONAL, '', user.businessProfile);
        }
      } catch (err) {
        console.error(`Batch item ${item.label} failed:`, err);
      }
      setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, status: 'done' as const } : b));
    }
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

  const handleSendEmails = async () => {
    if (selectedLeadIds.size === 0 || sendingEmails) return;

    // Pre-flight limit check
    const inboxId = connectedProvider?.from_email ?? 'default';
    const allowed = await checkEmailLimit(inboxId);
    if (!allowed) return;

    setSendingEmails(true);
    setSendResult(null);

    try {
      const eligibleLeads = leads
        .filter(l => selectedLeadIds.has(l.id) && l.email)
        .map(l => ({ id: l.id, email: l.email, name: l.name, company: l.company, insights: l.insights, score: l.score, status: l.status, lastActivity: l.lastActivity, knowledgeBase: l.knowledgeBase }));

      if (eligibleLeads.length === 0) {
        setSendResult({ sent: 0, failed: 0 });
        return;
      }

      const sequenceId = `seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const footer = buildEmailFooter(user.businessProfile);
      let totalSent = 0;
      let totalFailed = 0;

      if (sendMode === 'now') {
        // Send first step immediately
        const firstStep = steps[0];
        const v = firstStep.variants.find(vr => vr.id === firstStep.activeVariantId) || firstStep.variants[0];
        const htmlBody = buildHtmlBody(v.body, footer);
        const result = await sendTrackedEmailBatch(
          eligibleLeads,
          v.subject,
          htmlBody,
          { trackOpens: true, trackClicks: true, provider: connectedProvider?.provider as EmailProvider, fromName: connectedProvider?.from_name }
        );
        totalSent += result.sent;
        totalFailed += result.failed;

        // Auto-mark New leads as Contacted
        try {
          const storedPrefs = localStorage.getItem('scaliyo_dashboard_prefs');
          const prefs = storedPrefs ? JSON.parse(storedPrefs) : {};
          if (prefs.autoContactedOnSend) {
            const newLeadIds = eligibleLeads.filter(l => l.status === 'New').map(l => l.id);
            if (newLeadIds.length > 0) {
              await supabase.from('leads')
                .update({ status: 'Contacted', lastActivity: 'Auto-contacted via email send' })
                .in('id', newLeadIds)
                .eq('status', 'New');
            }
          }
        } catch (e) {
          console.error('Auto-contacted hook error:', e);
        }

        // Schedule remaining steps
        for (let i = 1; i < steps.length; i++) {
          const step = steps[i];
          const sv = step.variants.find(vr => vr.id === step.activeVariantId) || step.variants[0];
          const delayMatch = step.delay.match(/\d+/);
          const delayDays = delayMatch ? parseInt(delayMatch[0], 10) : (i + 1) * 2;
          const scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + delayDays);

          const stepHtml = buildHtmlBody(sv.body, footer);
          await scheduleEmailBlock({
            leads: eligibleLeads,
            subject: sv.subject,
            htmlBody: stepHtml,
            scheduledAt,
            blockIndex: i,
            sequenceId,
            fromEmail: connectedProvider?.from_email,
            fromName: connectedProvider?.from_name,
            provider: connectedProvider?.provider,
          });
        }
      } else {
        // Schedule ALL steps relative to base date
        const baseDate = new Date(`${scheduleDate}T${scheduleTime}`);
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const sv = step.variants.find(vr => vr.id === step.activeVariantId) || step.variants[0];
          const delayMatch = step.delay.match(/\d+/);
          const delayDays = delayMatch ? parseInt(delayMatch[0], 10) : i * 2;
          const scheduledAt = new Date(baseDate.getTime() + delayDays * 86400000);

          const stepHtml = buildHtmlBody(sv.body, footer);
          await scheduleEmailBlock({
            leads: eligibleLeads,
            subject: sv.subject,
            htmlBody: stepHtml,
            scheduledAt,
            blockIndex: i,
            sequenceId,
            fromEmail: connectedProvider?.from_email,
            fromName: connectedProvider?.from_name,
            provider: connectedProvider?.provider,
          });
          totalSent += eligibleLeads.length;
        }
      }

      setSendResult({ sent: totalSent, failed: totalFailed });
      fetchData();
    } catch (err: unknown) {
      console.error('Send emails error:', err);
      setSendResult({ sent: 0, failed: selectedLeadIds.size });
    } finally {
      setSendingEmails(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim() || !activeVariant || testEmailSending) return;
    setTestEmailSending(true);
    setTestEmailResult(null);

    try {
      const footer = buildEmailFooter(user.businessProfile);
      const htmlBody = buildHtmlBody(activeVariant.body, footer);

      // Personalize with first lead data or sample values
      const sampleLead = leads[0];
      const personalizedSubject = resolvePersonalizationTags(
        activeVariant.subject.replace(/\{\{your_name\}\}/gi, user.name || 'Your Name'),
        sampleLead || {},
        user.businessProfile
      );
      const personalizedHtml = resolvePersonalizationTags(
        htmlBody.replace(/\{\{your_name\}\}/gi, user.name || 'Your Name'),
        sampleLead || {},
        user.businessProfile
      );

      const result = await sendTrackedEmail({
        toEmail: testEmailAddress.trim(),
        subject: `[TEST] ${personalizedSubject}`,
        htmlBody: personalizedHtml,
        provider: connectedProvider?.provider as EmailProvider,
        trackOpens: false,
        trackClicks: false,
      });

      setTestEmailResult({ success: result.success, error: result.error });
    } catch (err: unknown) {
      setTestEmailResult({ success: false, error: err instanceof Error ? err.message : 'Failed to send test email' });
    } finally {
      setTestEmailSending(false);
    }
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
      <PageHeader
        title="Content Studio"
        description={
          contentMode === 'email' ? `Multi-variant editor · ${steps.length} steps · ${activeStep?.variants.length || 0} variants` :
          contentMode === 'linkedin' ? `Social media content · ${linkedinPost.split(/\s+/).filter(Boolean).length} words` :
          `Full proposal generator · ${Object.keys(proposalSections).length} sections`
        }
        actions={
          <>
            <div className="relative" data-guide="content-image-gen">
              <button
                onClick={() => setShowGenerateMenu(prev => !prev)}
                disabled={aiGenerating}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiGenerating ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <SparklesIcon className="w-3.5 h-3.5" />
                )}
                <span>{aiGenerating ? 'Generating...' : 'Generate'}</span>
                {!aiGenerating && <ChevronDownIcon className="w-3 h-3 ml-0.5" />}
              </button>
              {showGenerateMenu && !aiGenerating && (
                <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-48 py-1">
                  <button
                    onClick={() => { setShowGenerateMenu(false); handleGenerateWithAI(); }}
                    disabled={leads.length === 0}
                    className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <SparklesIcon className="w-4 h-4 text-violet-500" />
                    <span>Content</span>
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-black bg-violet-50 text-violet-600 rounded">{CREDIT_COSTS[contentMode === 'email' ? 'email_sequence' : 'content_generation']} cr</span>
                  </button>
                  <button
                    onClick={() => { setShowGenerateMenu(false); setShowImageGen(true); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center space-x-2"
                  >
                    <CameraIcon className="w-4 h-4 text-indigo-500" />
                    <span>Image</span>
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-black bg-indigo-50 text-indigo-600 rounded">{CREDIT_COSTS.image_generation} cr</span>
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setShowSendPostMenu(prev => !prev)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
              >
                <SendIcon className="w-4 h-4" />
                <span>Send / Post</span>
                <ChevronDownIcon className="w-3.5 h-3.5 ml-0.5" />
              </button>
              {showSendPostMenu && (
                <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-48 py-1">
                  {contentMode === 'email' && (
                    <button
                      onClick={() => { setShowSendPostMenu(false); setSendResult(null); setShowSendModal(true); }}
                      disabled={!connectedProvider}
                      className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <MailIcon className="w-4 h-4 text-emerald-500" />
                      <span>Send Email</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowSendPostMenu(false);
                      let content = '';
                      if (contentMode === 'email' && activeVariant) {
                        content = activeVariant.body;
                      } else if (contentMode === 'linkedin') {
                        content = resolvePersonalizationTags(
                          linkedinPost.replace(/\{\{your_name\}\}/gi, user.name || ''),
                          leads[0] || {},
                          user.businessProfile
                        );
                      } else if (contentMode === 'proposal') {
                        content = Object.values(proposalSections).filter(Boolean).join('\n\n');
                      }
                      if (content) navigate('/portal/social-scheduler', { state: { content } });
                    }}
                    className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center space-x-2"
                  >
                    <LinkedInIcon className="w-4 h-4 text-indigo-500" />
                    <span>Post to Social</span>
                  </button>
                </div>
              )}
            </div>
            <button onClick={handleSave} className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${saved ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}>
              {saved ? <CheckIcon className="w-4 h-4" /> : <MailIcon className="w-4 h-4" />}
              <span>{saved ? 'Saved!' : 'Save'}</span>
            </button>
          </>
        }
        advancedActions={
          <>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(prev => !prev)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border ${
                  showNotes || showSendHistory ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>More</span>
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-44 py-1">
                    <button onClick={() => { setShowNotes(!showNotes); setShowMoreMenu(false); }} className={`w-full text-left flex items-center space-x-2.5 px-3 py-2 text-xs font-bold transition-colors ${showNotes ? 'text-amber-600 bg-amber-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <MessageIcon className="w-3.5 h-3.5" />
                      <span>Notes</span>
                      {contentNotes.length > 0 && <span className="ml-auto px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black">{contentNotes.length}</span>}
                    </button>
                    <button onClick={() => { setShowSendHistory(!showSendHistory); setShowMoreMenu(false); }} className={`w-full text-left flex items-center space-x-2.5 px-3 py-2 text-xs font-bold transition-colors ${showSendHistory ? 'text-violet-600 bg-violet-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <ClockIcon className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>
                    <button onClick={() => { setShowRecycleModal(true); setShowMoreMenu(false); }} className="w-full text-left flex items-center space-x-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                      <RecycleIcon className="w-3.5 h-3.5" />
                      <span>Recycle</span>
                    </button>
                    <button onClick={() => { setShowBatchModal(true); setShowMoreMenu(false); }} className="w-full text-left flex items-center space-x-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                      <LayersIcon className="w-3.5 h-3.5" />
                      <span>Batch</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setShowExportMenu(prev => !prev)} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                <DownloadIcon className="w-3.5 h-3.5" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-40 py-1">
                  <button onClick={() => handleExport('txt')} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Export as TXT</button>
                  <button onClick={() => handleExport('pdf')} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Export as PDF</button>
                </div>
              )}
            </div>
          </>
        }
      />

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
      {/* KPI STATS BANNER                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Pieces Created', value: kpiStats.piecesCreated, icon: <EditIcon className="w-4 h-4" />, color: 'indigo' },
          { label: 'Active Variants', value: kpiStats.activeVariants, icon: <LayersIcon className="w-4 h-4" />, color: 'violet' },
          { label: 'Avg Open Rate', value: `${kpiStats.avgOpenRate}%`, icon: <EyeIcon className="w-4 h-4" />, color: 'emerald', trend: kpiStats.avgOpenRate > 35 ? 'up' : kpiStats.avgOpenRate > 0 ? 'down' : null },
          { label: 'Rules Active', value: kpiStats.rulesActive, icon: <SlidersIcon className="w-4 h-4" />, color: 'amber' },
          { label: 'AI Applied', value: kpiStats.suggestionsApplied, icon: <SparklesIcon className="w-4 h-4" />, color: 'blue' },
          { label: 'Improvement', value: kpiStats.improvementScore > 0 ? `+${kpiStats.improvementScore}%` : '0%', icon: <TrendUpIcon className="w-4 h-4" />, color: 'rose', trend: kpiStats.improvementScore > 0 ? 'up' : null },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg bg-${stat.color}-50 flex items-center justify-center text-${stat.color}-500`}>
                {stat.icon}
              </div>
              {stat.trend === 'up' && <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" />}
              {stat.trend === 'down' && <TrendDownIcon className="w-3.5 h-3.5 text-rose-400" />}
            </div>
            <p className="text-lg font-black text-slate-900">{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* AI ERROR BANNER                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {aiError && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl">
          <div className="flex items-center space-x-2">
            <AlertTriangleIcon className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-xs font-semibold text-rose-700">{aiError}</p>
          </div>
          <button onClick={() => setAiError(null)} className="p-1 text-rose-400 hover:text-rose-600 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* NO-PROVIDER WARNING (email mode only) */}
      {contentMode === 'email' && !connectedProvider && !providerLoading && (
        <div className="flex items-center space-x-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-700">
            No email provider connected. Go to Settings &rarr; Integrations to connect SendGrid, Gmail, or SMTP to send emails.
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTENT HEALTH SCORE                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>
      {contentHealth && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <BrainIcon className="w-4 h-4 text-indigo-600" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Content Health Score</p>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                contentHealth.overall >= 75 ? 'bg-emerald-50 text-emerald-600' :
                contentHealth.overall >= 50 ? 'bg-amber-50 text-amber-600' :
                'bg-rose-50 text-rose-600'
              }`}>
                {contentHealth.overall >= 75 ? 'Excellent' : contentHealth.overall >= 50 ? 'Good' : 'Needs Work'}
              </span>
            </div>
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-xl ${
              contentHealth.overall >= 75 ? 'bg-emerald-50 text-emerald-600' :
              contentHealth.overall >= 50 ? 'bg-amber-50 text-amber-600' :
              'bg-rose-50 text-rose-600'
            }`}>
              {contentHealth.overall}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: 'Personalization', value: contentHealth.personalization, color: 'indigo' },
              { label: 'Clarity', value: contentHealth.clarity, color: 'blue' },
              { label: 'CTA Strength', value: contentHealth.ctaStrength, color: 'amber' },
              { label: 'Engagement', value: contentHealth.engagement, color: 'emerald' },
              { label: 'Deliverability', value: contentHealth.deliverability, color: 'violet' },
            ].map(metric => (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500">{metric.label}</span>
                  <span className={`text-[10px] font-black text-${metric.color}-600`}>{metric.value}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className={`bg-${metric.color}-500 h-full rounded-full transition-all duration-500`} style={{ width: `${metric.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SEND HISTORY TIMELINE                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showSendHistory && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <ClockIcon className="w-4 h-4 text-violet-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Send History</p>
            </div>
            <button onClick={() => setShowSendHistory(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          {sendHistoryLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
              <span className="ml-2 text-xs text-slate-500">Loading history...</span>
            </div>
          ) : sendHistory.length === 0 ? (
            <div className="text-center py-8">
              <ClockIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-400">No send history yet</p>
              <p className="text-[10px] text-slate-300 mt-0.5">Send emails to see real performance data here.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-100" />
              <div className="space-y-4">
                {sendHistory.map(entry => {
                  const daysAgo = Math.round((Date.now() - entry.sentAt.getTime()) / 86400000);
                  const timeLabel = daysAgo < 0 ? `in ${Math.abs(daysAgo)} days` : daysAgo === 0 ? 'today' : `${daysAgo}d ago`;
                  return (
                    <div key={entry.id} className="flex items-start space-x-4 relative pl-8">
                      <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                        entry.status === 'sent' ? 'bg-emerald-400' : entry.status === 'scheduled' ? 'bg-amber-400' : 'bg-rose-400'
                      }`} />
                      <div className="flex-1 flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{entry.label}</p>
                          <p className="text-[10px] text-slate-400">{timeLabel} &middot; {entry.recipients} recipients</p>
                        </div>
                        <div className="text-right">
                          {entry.status === 'sent' ? (
                            <p className={`text-xs font-black ${entry.openRate > 40 ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {entry.openRate}% opens
                            </p>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-bold">Scheduled</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* COLLABORATION NOTES                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showNotes && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <MessageIcon className="w-4 h-4 text-amber-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Content Notes</p>
            </div>
            <button onClick={() => setShowNotes(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center space-x-2 mb-3">
            <input
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
              placeholder="Add a note about this content..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none"
            />
            <button onClick={addNote} disabled={!noteInput.trim()} className="px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-50">
              Add
            </button>
          </div>
          {contentNotes.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {contentNotes.map(note => (
                <div key={note.id} className="flex items-start justify-between p-2.5 bg-amber-50/50 rounded-xl group">
                  <div>
                    <p className="text-xs text-slate-700">{note.text}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {note.variant} &middot; {note.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => setContentNotes(prev => prev.filter(n => n.id !== note.id))}
                    className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 text-center py-3">No notes yet. Add context, ideas, or feedback.</p>
          )}
        </div>
      )}
      </AdvancedOnly>

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
            <div data-guide="content-preview" className="flex rounded-lg overflow-hidden border border-slate-200">
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
      <AdvancedOnly>
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
      </AdvancedOnly>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN LAYOUT                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewTab !== 'templates' && (
        <div className="flex flex-col lg:flex-row gap-5">

          {/* ─── Editor / Preview Area (65%) ─── */}
          <div className="lg:flex-1 space-y-5" data-guide="content-editor">

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
                      <button
                        onClick={handleGenerateWithAI}
                        disabled={aiGenerating || leads.length === 0}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-[10px] font-bold hover:bg-violet-100 transition-all disabled:opacity-50"
                      >
                        <SparklesIcon className="w-3 h-3" />
                        <span>AI Generate</span>
                      </button>
                      <button
                        data-guide="content-cta"
                        onClick={() => setShowCtaBuilder(true)}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-all"
                      >
                        <CursorClickIcon className="w-3 h-3" />
                        <span>Add CTA</span>
                      </button>
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
                  {/* Visual Block Editor */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                    {(() => {
                      const segments = parseBodySegments(activeVariant.body);
                      const hasImages = segments.some(s => s.type === 'image');
                      let imageCount = 0;
                      return segments.map((seg, segIdx) => {
                        if (seg.type === 'text') {
                          return (
                            <textarea
                              key={`text-${segIdx}`}
                              ref={(el) => { if (segIdx === 0) emailBodyRef.current = el; }}
                              data-seg-idx={segIdx}
                              value={seg.value}
                              onChange={e => updateTextSegment(segIdx, e.target.value)}
                              onFocus={(e) => { activeTextareaRef.current = e.target as HTMLTextAreaElement; }}
                              onContextMenu={handleContextMenu}
                              rows={!hasImages ? 14 : Math.max(2, seg.value.split('\n').length + 1)}
                              className="w-full px-4 py-3 bg-slate-50 text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-indigo-500/20 focus:bg-white outline-none resize-none font-mono transition-colors"
                              placeholder={segIdx === 0 ? 'Write your email body here...' : 'Continue writing...'}
                            />
                          );
                        } else {
                          const imgIdx = imageCount++;
                          const isFirst = segIdx <= 1 && segments[0].value === '';
                          const isLast = segIdx >= segments.length - 2 && segments[segments.length - 1].value === '';
                          return (
                            <div key={`img-${segIdx}`} className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-50/80 to-violet-50/60 border-y border-indigo-100/60">
                              <img
                                src={seg.value}
                                alt={`Image ${imgIdx + 1}`}
                                className="w-16 h-16 rounded-lg object-cover border-2 border-white shadow-sm flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                                  <CameraIcon className="w-3 h-3" />
                                  Image {imgIdx + 1}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{seg.value.split('/').pop()}</p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => moveImageInBody(imgIdx, 'up')}
                                  disabled={isFirst}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                                  title="Move up"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                </button>
                                <button
                                  onClick={() => moveImageInBody(imgIdx, 'down')}
                                  disabled={isLast}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                                  title="Move down"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                <button
                                  onClick={() => removeImageFromBody(imgIdx)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-rose-200 text-rose-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition-all shadow-sm"
                                  title="Remove image"
                                >
                                  <XIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        }
                      });
                    })()}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-slate-400">Words: {activeVariant.body.replace(/\[image:https?:\/\/[^\]]+\]/g, '').split(/\s+/).filter(Boolean).length}</span>
                    <div className="flex items-center space-x-3">
                      {bodyImageUrls.length > 0 && (
                        <span className="text-[10px] text-indigo-500 font-semibold">{bodyImageUrls.length} image{bodyImageUrls.length > 1 ? 's' : ''} embedded</span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        Tags used: {(activeVariant.body.match(/\{\{[^}]+\}\}/g) || []).length}
                      </span>
                      <button
                        onClick={() => { setTestEmailResult(null); setShowTestEmailModal(true); }}
                        disabled={!connectedProvider}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg text-[10px] font-bold hover:bg-amber-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <MailIcon className="w-3 h-3" />
                        <span>Send Test</span>
                      </button>
                    </div>
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
                    <button
                      onClick={handleGenerateWithAI}
                      disabled={aiGenerating || leads.length === 0}
                      className="flex items-center space-x-1 px-2.5 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-[10px] font-bold hover:bg-violet-100 transition-all disabled:opacity-50"
                    >
                      <SparklesIcon className="w-3 h-3" />
                      <span>AI Generate</span>
                    </button>
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

                {/* Attached Images */}
                {emailImages.length > 0 && (
                  <div className="mt-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attached Images</span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {emailImages.map((url, idx) => (
                        <div key={idx} className="relative group">
                          <img src={url} alt={`Image ${idx + 1}`} className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
                          <button
                            onClick={() => setEmailImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">These images will be included with your post.</p>
                  </div>
                )}

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

                {/* LinkedIn Action Buttons */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleCopyLinkedin}
                      className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                        linkedinCopied
                          ? 'bg-emerald-600 text-white shadow-emerald-200'
                          : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'
                      }`}
                    >
                      {linkedinCopied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                      <span>{linkedinCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
                    </button>
                    {emailImages.length > 0 && (
                      <a
                        href={emailImages[0]}
                        download="linkedin-post-image.png"
                        className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200"
                      >
                        <DownloadIcon className="w-4 h-4" />
                        <span>Download Image</span>
                      </a>
                    )}
                    <button
                      onClick={handleOpenLinkedin}
                      className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm shadow-blue-200"
                    >
                      <LinkedInIcon className="w-4 h-4" />
                      <span>Open LinkedIn</span>
                    </button>
                    <button
                      onClick={() => {
                        const personalized = resolvePersonalizationTags(
                          linkedinPost.replace(/\{\{your_name\}\}/gi, user.name || ''),
                          leads[0] || {},
                          user.businessProfile
                        );
                        navigate('/portal/social-scheduler', { state: { content: personalized } });
                      }}
                      className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
                    >
                      <SendIcon className="w-4 h-4" />
                      <span>Post to Social</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    {emailImages.length > 0
                      ? 'Copy your post and download the image, then paste both in LinkedIn'
                      : 'Copy your post first, then paste it in the LinkedIn composer'}
                  </p>
                </div>
              </div>
            )}

            {/* ═══ PROPOSAL EDITOR ═══ */}
            {viewTab === 'editor' && contentMode === 'proposal' && (
              <div className="space-y-4">
                <div className="flex items-center justify-end">
                  <button
                    onClick={handleGenerateWithAI}
                    disabled={aiGenerating || leads.length === 0}
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-[10px] font-bold hover:bg-violet-100 transition-all disabled:opacity-50"
                  >
                    <SparklesIcon className="w-3 h-3" />
                    <span>AI Generate All Sections</span>
                  </button>
                </div>
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
                      {resolvePersonalizationTags(
                        activeVariant.subject.replace(/\{\{your_name\}\}/gi, user.name || 'Your Name'),
                        leads[0] || {},
                        user.businessProfile
                      )}
                    </span></p>
                  </div>
                  <div className="p-5">
                    <div className="text-sm text-slate-700 leading-relaxed">
                      {parseBodySegments(
                        resolvePersonalizationTags(
                          activeVariant.body.replace(/\{\{your_name\}\}/gi, user.name || 'Your Name'),
                          leads[0] || {},
                          user.businessProfile
                        )
                      ).map((seg, i) =>
                        seg.type === 'image' ? (
                          <div key={i} style={{ margin: '16px 0' }}>
                            <img src={seg.value} alt="" className="max-w-full h-auto rounded-lg" />
                          </div>
                        ) : (
                          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{seg.value}</span>
                        )
                      )}
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
                      {resolvePersonalizationTags(
                        linkedinPost.replace(/\{\{your_name\}\}/gi, user.name || ''),
                        leads[0] || {},
                        user.businessProfile
                      )}
                    </div>
                  </div>
                  {/* Post image */}
                  {emailImages.length > 0 && (
                    <div className="border-t border-b border-slate-100">
                      <img src={emailImages[0]} alt="Post image" className="w-full object-cover" />
                    </div>
                  )}
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

                {/* LinkedIn Action Buttons (Preview) */}
                <div className="mt-4 flex items-center space-x-3">
                  <button
                    onClick={handleCopyLinkedin}
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                      linkedinCopied
                        ? 'bg-emerald-600 text-white shadow-emerald-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'
                    }`}
                  >
                    {linkedinCopied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                    <span>{linkedinCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
                  </button>
                  {emailImages.length > 0 && (
                    <a
                      href={emailImages[0]}
                      download="linkedin-post-image.png"
                      className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      <span>Download Image</span>
                    </a>
                  )}
                  <button
                    onClick={handleOpenLinkedin}
                    className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm shadow-blue-200"
                  >
                    <LinkedInIcon className="w-4 h-4" />
                    <span>Open LinkedIn</span>
                  </button>
                  <button
                    onClick={() => {
                      const personalized = resolvePersonalizationTags(
                        linkedinPost.replace(/\{\{your_name\}\}/gi, user.name || ''),
                        leads[0] || {},
                        user.businessProfile
                      );
                      navigate('/portal/social-scheduler', { state: { content: personalized } });
                    }}
                    className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
                  >
                    <SendIcon className="w-4 h-4" />
                    <span>Post to Social</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  {emailImages.length > 0
                    ? 'Copy your post and download the image, then paste both in LinkedIn'
                    : 'Copy your post first, then paste it in the LinkedIn composer'}
                </p>
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
          </div>

          {/* ─── Right Sidebar (35%) ─── */}
          <AdvancedOnly>
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

            {/* ═══ INDUSTRY BENCHMARKS ═══ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                  <TargetIcon className="w-4 h-4 text-rose-500" />
                  <span>Industry Benchmarks</span>
                </h3>
                <span className="text-[9px] bg-rose-50 text-rose-600 font-black px-2 py-0.5 rounded-lg">B2B SaaS</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Open Rate', yours: industryBenchmarks.openRate.yours, industry: industryBenchmarks.openRate.industry, top10: industryBenchmarks.openRate.top10 },
                  { label: 'Click Rate', yours: industryBenchmarks.clickRate.yours, industry: industryBenchmarks.clickRate.industry, top10: industryBenchmarks.clickRate.top10 },
                  { label: 'Reply Rate', yours: industryBenchmarks.replyRate.yours, industry: industryBenchmarks.replyRate.industry, top10: industryBenchmarks.replyRate.top10 },
                  { label: 'Conversion', yours: industryBenchmarks.conversionRate.yours, industry: industryBenchmarks.conversionRate.industry, top10: industryBenchmarks.conversionRate.top10 },
                ].map(b => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500">{b.label}</span>
                      <div className="flex items-center space-x-3 text-[9px]">
                        <span className="font-bold text-indigo-600">You: {b.yours}%</span>
                        <span className="text-slate-400">Avg: {b.industry}%</span>
                        <span className="text-emerald-600 font-bold">Top 10%: {b.top10}%</span>
                      </div>
                    </div>
                    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                      {/* Industry average marker */}
                      <div className="absolute h-full w-0.5 bg-slate-400 z-10" style={{ left: `${Math.min(100, (b.industry / b.top10) * 100)}%` }} />
                      {/* Top 10% marker */}
                      <div className="absolute h-full w-full bg-emerald-100 rounded-full" style={{ width: '100%' }} />
                      {/* Your score */}
                      <div className={`absolute h-full rounded-full transition-all duration-500 ${
                        b.yours >= b.top10 ? 'bg-emerald-500' : b.yours >= b.industry ? 'bg-indigo-500' : 'bg-rose-400'
                      }`} style={{ width: `${Math.min(100, (b.yours / b.top10) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center space-x-4 text-[9px]">
                <div className="flex items-center space-x-1"><div className="w-2 h-2 rounded-full bg-indigo-500" /><span className="font-bold text-slate-500">Your Content</span></div>
                <div className="flex items-center space-x-1"><div className="w-2 h-0.5 bg-slate-400" /><span className="text-slate-400">Industry Avg</span></div>
                <div className="flex items-center space-x-1"><div className="w-2 h-2 rounded-full bg-emerald-100 border border-emerald-300" /><span className="text-slate-400">Top 10%</span></div>
              </div>
            </div>

            {/* ═══ CONTENT WORD ANALYSIS ═══ */}
            {(() => {
              let body = '';
              if (contentMode === 'email' && activeVariant) body = activeVariant.body;
              else if (contentMode === 'linkedin') body = linkedinPost;
              else body = Object.values(proposalSections).join(' ');
              if (!body || body.length < 30) return null;

              const words = body.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
              const freq: Record<string, number> = {};
              words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
              const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8);
              const maxFreq = topWords[0]?.[1] || 1;

              return (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                    <TagIcon className="w-4 h-4 text-blue-500" />
                    <span>Word Frequency</span>
                  </h3>
                  <div className="space-y-2">
                    {topWords.map(([word, count]) => (
                      <div key={word} className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold text-slate-600 w-20 truncate">{word}</span>
                        <div className="flex-1 h-2 bg-slate-50 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${(count / maxFreq) * 100}%` }} />
                        </div>
                        <span className="text-[9px] font-black text-slate-400 w-6 text-right">{count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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
          </AdvancedOnly>
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
      {/* SEND EMAIL MODAL                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TEST EMAIL MODAL                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showTestEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTestEmailModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <MailIcon className="w-5 h-5 text-amber-500" />
                  <span>Send Test Email</span>
                </h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Preview your email in a real inbox before sending to leads</p>
              </div>
              <button onClick={() => setShowTestEmailModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {testEmailResult ? (
                <div className="text-center py-4">
                  <div className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center ${testEmailResult.success ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                    {testEmailResult.success ? <CheckIcon className="w-7 h-7 text-emerald-600" /> : <AlertTriangleIcon className="w-7 h-7 text-rose-600" />}
                  </div>
                  <h3 className="text-base font-black text-slate-900">{testEmailResult.success ? 'Test Email Sent!' : 'Send Failed'}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {testEmailResult.success
                      ? <>Sent to <span className="font-bold text-slate-700">{testEmailAddress}</span> &mdash; check your inbox</>
                      : testEmailResult.error || 'Something went wrong'}
                  </p>
                  <div className="flex items-center justify-center space-x-2 mt-5">
                    <button
                      onClick={() => setTestEmailResult(null)}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                    >
                      Send Another
                    </button>
                    <button
                      onClick={() => setShowTestEmailModal(false)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Email Input */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Recipient Email</label>
                    <input
                      type="email"
                      value={testEmailAddress}
                      onChange={e => setTestEmailAddress(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendTestEmail(); }}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                      autoFocus
                    />
                  </div>

                  {/* What will be sent */}
                  <div className="p-3.5 bg-slate-50 rounded-xl space-y-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">What will be sent</p>
                    {activeVariant && (
                      <>
                        <div className="flex items-start space-x-2">
                          <span className="text-[10px] text-slate-400 mt-0.5 flex-shrink-0 w-12">Subject:</span>
                          <p className="text-xs font-semibold text-slate-700 truncate">[TEST] {activeVariant.subject || '(empty)'}</p>
                        </div>
                        <div className="flex items-start space-x-2">
                          <span className="text-[10px] text-slate-400 mt-0.5 flex-shrink-0 w-12">Body:</span>
                          <p className="text-xs text-slate-500 truncate">{activeVariant.body.replace(/\[image:https?:\/\/[^\]]+\]/g, '[image]').slice(0, 80) || '(empty)'}{activeVariant.body.length > 80 ? '...' : ''}</p>
                        </div>
                        {bodyImageUrls.length > 0 && (
                          <div className="flex items-start space-x-2">
                            <span className="text-[10px] text-slate-400 mt-0.5 flex-shrink-0 w-12">Images:</span>
                            <p className="text-xs text-slate-500">{bodyImageUrls.length} inline image{bodyImageUrls.length > 1 ? 's' : ''}</p>
                          </div>
                        )}
                      </>
                    )}
                    {leads.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-1">Personalization tags resolved using: <span className="font-bold text-slate-500">{leads[0].name}</span></p>
                    )}
                  </div>

                  {/* Provider */}
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Sending via</p>
                    {connectedProvider ? (
                      <p className="text-xs text-slate-700 font-semibold">{connectedProvider.provider.toUpperCase()} &middot; {connectedProvider.from_email}</p>
                    ) : (
                      <p className="text-xs text-amber-600 font-semibold">No provider connected</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setShowTestEmailModal(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendTestEmail}
                      disabled={testEmailSending || !testEmailAddress.trim() || !connectedProvider}
                      className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {testEmailSending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <SendIcon className="w-4 h-4" />
                          <span>Send Test</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSendModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                  <SendIcon className="w-5 h-5 text-emerald-600" />
                  <span>Send Email Sequence</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{steps.length} steps &middot; Select recipients and delivery method</p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {sendResult ? (
              <div className="p-8 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${sendResult.failed === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  {sendResult.failed === 0 ? <CheckIcon className="w-8 h-8 text-emerald-600" /> : <AlertTriangleIcon className="w-8 h-8 text-amber-600" />}
                </div>
                <h3 className="text-lg font-black text-slate-900">{sendResult.failed === 0 ? 'Emails Sent!' : 'Partially Sent'}</h3>
                <p className="text-sm text-slate-500 mt-1">{sendResult.sent} sent{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}</p>
                <button onClick={() => setShowSendModal(false)} className="mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                  Close
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Segment Filter Tabs */}
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Filter Recipients</p>
                  <div className="flex items-center space-x-1.5">
                    {[
                      { key: 'all', label: 'All Leads' },
                      { key: 'hot', label: 'Hot (75+)' },
                      { key: 'warm', label: 'Warm (40-75)' },
                      { key: 'cold', label: 'Cold (<40)' },
                      { key: 'new', label: 'New' },
                    ].map(seg => (
                      <button
                        key={seg.key}
                        onClick={() => setSegmentFilter(seg.key)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          segmentFilter === seg.key ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {seg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lead List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{filteredLeadsForSend.length} Recipients</p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedLeadIds(new Set(filteredLeadsForSend.map(l => l.id)))}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setSelectedLeadIds(new Set())}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl">
                    {filteredLeadsForSend.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-xs text-slate-400">No leads match this filter</p>
                      </div>
                    ) : (
                      filteredLeadsForSend.map(lead => (
                        <label key={lead.id} className="flex items-center space-x-3 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.has(lead.id)}
                            onChange={e => {
                              setSelectedLeadIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(lead.id); else next.delete(lead.id);
                                return next;
                              });
                            }}
                            className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{lead.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{lead.company} &middot; {lead.email}</p>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                            lead.score > 75 ? 'bg-emerald-50 text-emerald-700' :
                            lead.score >= 40 ? 'bg-amber-50 text-amber-700' :
                            'bg-slate-50 text-slate-500'
                          }`}>
                            {lead.score}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Send Mode Toggle */}
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Delivery Method</p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSendMode('now')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        sendMode === 'now' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Send Now
                    </button>
                    <button
                      onClick={() => setSendMode('scheduled')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        sendMode === 'scheduled' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Schedule
                    </button>
                  </div>
                  {sendMode === 'scheduled' && (
                    <div className="flex items-center space-x-2 mt-3">
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={e => setScheduleDate(e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={e => setScheduleTime(e.target.value)}
                        className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Provider Info */}
                <div className="p-3.5 bg-slate-50 rounded-xl">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Email Provider</p>
                  {connectedProvider ? (
                    <p className="text-xs text-slate-700 font-semibold">
                      {connectedProvider.provider.toUpperCase()} &middot; {connectedProvider.from_email}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 font-semibold">No provider connected — go to Settings to set up email</p>
                  )}
                </div>

                {/* Summary */}
                <div className="p-3.5 bg-indigo-50 rounded-xl">
                  <p className="text-xs font-bold text-indigo-700">
                    {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} selected &middot; {steps.length} step{steps.length !== 1 ? 's' : ''} &middot; {sendMode === 'now' ? 'Sending immediately' : `Scheduled for ${scheduleDate || 'TBD'}`}
                  </p>
                </div>

                {/* Usage warnings */}
                {usageWarnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                    {usageWarnings.filter(w => w.type === 'MONTHLY_EMAIL' || w.type === 'DAILY_EMAIL').map(w => (
                      <p key={w.type} className="text-xs font-semibold text-amber-700">
                        <AlertTriangleIcon className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                        {w.type === 'DAILY_EMAIL' ? 'Daily' : 'Monthly'} email usage at {w.percent}% ({w.current}/{w.limit})
                      </p>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowSendModal(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendEmails}
                    disabled={sendingEmails || selectedLeadIds.size === 0 || !connectedProvider || (sendMode === 'scheduled' && !scheduleDate)}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {sendingEmails ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <SendIcon className="w-4 h-4" />
                        <span>{sendMode === 'now' ? 'Send Now' : 'Schedule'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
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
      <ImageGeneratorDrawer open={showImageGen} onClose={() => setShowImageGen(false)} moduleType={contentMode === 'linkedin' ? 'services' : contentMode === 'proposal' ? 'products' : 'newsletter'} onInsertImage={(url) => {
        if (contentMode === 'email' && activeVariant) {
          updateVariantField('body', activeVariant.body + `[image:${url}]`);
        } else {
          setEmailImages(prev => [...prev, url]);
        }
      }} businessProfile={user.businessProfile} insertLabel={contentMode === 'linkedin' ? 'Use in Post' : 'Use in Email'} />
      <CTAButtonBuilderModal
        open={showCtaBuilder}
        onClose={() => setShowCtaBuilder(false)}
        onInsert={(html) => {
          if (activeVariant) {
            updateVariantField('body', activeVariant.body + '\n\n' + html);
          }
        }}
      />

      {/* Upgrade Modal — shown when email send limit is reached */}
      {limitError && (
        <UpgradeModal
          limitType={limitError.type}
          currentPlan={user.plan}
          onClose={clearLimitError}
        />
      )}
    </div>
  );
};

export default ContentStudio;
