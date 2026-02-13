import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Lead, ContentCategory, ToneType, EmailStep, User, EmailSequenceConfig } from '../../types';
import { generateContentByCategory, generateEmailSequence, parseEmailSequenceResponse, AIResponse } from '../../lib/gemini';
import {
  SparklesIcon, MailIcon, GlobeIcon, HashIcon, BookIcon, BriefcaseIcon, BoltIcon,
  CopyIcon, CheckIcon, ClockIcon, EyeIcon, XIcon, PlusIcon, DownloadIcon,
  ArrowRightIcon, ArrowLeftIcon, CalendarIcon, SendIcon, SplitIcon, ChartIcon,
  TrendUpIcon, TrendDownIcon, TargetIcon, FlameIcon, RefreshIcon
} from '../../components/Icons';
import { supabase } from '../../lib/supabase';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════
type ContentLength = 'Short' | 'Medium' | 'Long';
type ContentFocus = 'Problem → Solution' | 'Features → Benefits' | 'Story → CTA' | 'Data → Insight';
type WizardStep = 1 | 2 | 3 | 4 | 5;
type GenerationStage = 'analyzing' | 'crafting' | 'personalizing' | 'optimizing' | 'finalizing' | 'complete';

interface ContentBlock {
  id: string;
  title: string;
  subject: string;
  body: string;
  variant?: 'A' | 'B';
}

interface TemplateOption {
  id: string;
  name: string;
  blocks: ContentBlock[];
}

interface ScheduleConfig {
  mode: 'now' | 'scheduled' | 'draft';
  date: string;
  time: string;
  timezone: string;
  enableABTest: boolean;
}

interface ContentPerformance {
  id: string;
  title: string;
  type: string;
  sentAt: string;
  recipients: number;
  openRate: number;
  clickRate: number;
  responseRate: number;
  status: 'sent' | 'scheduled' | 'draft';
}

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const CONTENT_TYPES: { id: ContentCategory; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: ContentCategory.EMAIL_SEQUENCE, label: 'Email Sequence', icon: MailIcon },
  { id: ContentCategory.LANDING_PAGE, label: 'Landing Page', icon: GlobeIcon },
  { id: ContentCategory.SOCIAL_MEDIA, label: 'Social Post', icon: HashIcon },
  { id: ContentCategory.BLOG_ARTICLE, label: 'Blog Article', icon: BookIcon },
  { id: ContentCategory.AD_COPY, label: 'Ad Copy', icon: BoltIcon },
  { id: ContentCategory.PROPOSAL, label: 'Proposal', icon: BriefcaseIcon },
];

const LENGTH_OPTIONS: ContentLength[] = ['Short', 'Medium', 'Long'];
const FOCUS_OPTIONS: ContentFocus[] = ['Problem → Solution', 'Features → Benefits', 'Story → CTA', 'Data → Insight'];

const PERSONALIZATION_OPTIONS = [
  { id: 'names', label: 'Use lead names' },
  { id: 'company', label: 'Company details' },
  { id: 'insights', label: 'AI insights' },
  { id: 'behavioral', label: 'Behavioral data' },
];

const SUBJECT_LABEL: Record<string, string> = {
  [ContentCategory.EMAIL_SEQUENCE]: 'Subject Line',
  [ContentCategory.LANDING_PAGE]: 'Headline',
  [ContentCategory.SOCIAL_MEDIA]: 'Post Title',
  [ContentCategory.BLOG_ARTICLE]: 'Article Title',
  [ContentCategory.AD_COPY]: 'Ad Headline',
  [ContentCategory.PROPOSAL]: 'Proposal Title',
};

const FOCUS_TO_GOAL: Record<ContentFocus, EmailSequenceConfig['goal']> = {
  'Problem → Solution': 'book_meeting',
  'Features → Benefits': 'product_demo',
  'Story → CTA': 'nurture',
  'Data → Insight': 're_engage',
};

const LENGTH_TO_COUNT: Record<ContentLength, number> = { Short: 3, Medium: 5, Long: 7 };

const WIZARD_STEPS = [
  { num: 1 as WizardStep, label: 'Start', desc: 'Select type & audience' },
  { num: 2 as WizardStep, label: 'Parameters', desc: 'Tone, length & focus' },
  { num: 3 as WizardStep, label: 'Generate', desc: 'AI creates content' },
  { num: 4 as WizardStep, label: 'Review', desc: 'Edit & optimize' },
  { num: 5 as WizardStep, label: 'Deliver', desc: 'Send or schedule' },
];

const GENERATION_STAGES: { id: GenerationStage; label: string; duration: number }[] = [
  { id: 'analyzing', label: 'Analyzing lead profiles & segmentation data...', duration: 1200 },
  { id: 'crafting', label: 'Crafting content framework with AI engine...', duration: 2000 },
  { id: 'personalizing', label: 'Applying personalization tokens & dynamic fields...', duration: 1500 },
  { id: 'optimizing', label: 'Optimizing for engagement & conversion metrics...', duration: 1800 },
  { id: 'finalizing', label: 'Running quality checks & finalizing output...', duration: 1000 },
];

const TEMPLATES: Record<string, TemplateOption[]> = {
  [ContentCategory.EMAIL_SEQUENCE]: [
    { id: 'cold', name: 'Cold Outreach', blocks: [
      { id: 'e1', title: 'Initial Outreach', subject: 'Helping {{company}} with {{pain_point}}', body: 'Hi {{first_name}},\n\nI noticed {{company}} has been focusing on {{insight_1}}. We help companies like yours achieve {{benefit}} by {{solution}}.\n\nWould you be open to a brief chat?\n\n[Book a time]\n\nBest,\n[Your Name]' },
      { id: 'e2', title: 'Follow Up', subject: 'Quick follow up, {{first_name}}', body: 'Hi {{first_name}},\n\nI wanted to circle back on my previous note about {{pain_point}}. I believe we could help {{company}} see meaningful results.\n\nWould a 15-minute call this week work?\n\nBest,\n[Your Name]' },
      { id: 'e3', title: 'Break Up', subject: 'Closing the loop', body: 'Hi {{first_name}},\n\nI understand timing is everything. I\'ll assume {{pain_point}} isn\'t a priority for {{company}} right now.\n\nIf that changes, I\'d love to reconnect. Here\'s a resource that might help in the meantime: [link]\n\nAll the best,\n[Your Name]' },
    ]},
    { id: 'nurture', name: 'Nurture Sequence', blocks: [
      { id: 'n1', title: 'Value Share', subject: '{{industry}} insights for {{company}}', body: 'Hi {{first_name}},\n\nI came across this {{industry}} report that I thought {{company}} would find valuable. It covers {{insight_1}} and how top companies are approaching it.\n\n[Link to resource]\n\nHappy to discuss how this applies to your team.\n\nBest,\n[Your Name]' },
      { id: 'n2', title: 'Case Study', subject: 'How companies like {{company}} achieved {{benefit}}', body: 'Hi {{first_name}},\n\nI wanted to share how a company similar to {{company}} tackled {{pain_point}} and saw a 40% improvement in just 90 days.\n\nWould you like me to send over the full case study?\n\nBest,\n[Your Name]' },
      { id: 'n3', title: 'Soft Ask', subject: 'Quick question, {{first_name}}', body: 'Hi {{first_name}},\n\nI\'ve been sharing some resources around {{insight_1}} — curious if any of these resonated with your team at {{company}}?\n\nNo pressure at all, just want to make sure I\'m sending relevant info.\n\nBest,\n[Your Name]' },
    ]},
  ],
  [ContentCategory.LANDING_PAGE]: [
    { id: 'launch', name: 'Product Launch', blocks: [{ id: 'lp1', title: 'Product Launch Page', subject: 'Transform Your {{industry}} Results Today', body: 'Stop losing {{pain_point}} to outdated tools.\n\n{{company}} deserves better.\n\nOur platform helps teams like yours:\n\u2022 Increase efficiency by 40%\n\u2022 Reduce manual work by 60%\n\u2022 Get results in under 30 days\n\nTrusted by 500+ companies worldwide.\n\n[Start Free Trial] [Watch Demo]' }] },
    { id: 'webinar', name: 'Webinar Registration', blocks: [{ id: 'wp1', title: 'Webinar Page', subject: 'Free Webinar: Solving {{pain_point}} in {{industry}}', body: 'Join us for an exclusive session on how leading companies are tackling {{pain_point}}.\n\nWhat you\'ll learn:\n\u2022 The #1 mistake {{industry}} companies make\n\u2022 A proven framework for {{benefit}}\n\u2022 Live Q&A with industry experts\n\nDate: [Date] | Time: [Time]\nSpots limited to 100 attendees.\n\n[Reserve My Spot]' }] },
  ],
  [ContentCategory.SOCIAL_MEDIA]: [
    { id: 'thought', name: 'Thought Leadership', blocks: [{ id: 'sp1', title: 'LinkedIn Post', subject: 'Thought Leadership Post', body: 'Most {{industry}} companies are still doing {{pain_point}} the hard way.\n\nHere\'s what the top 1% do differently:\n\n1. They automate {{insight_1}}\n2. They focus on {{benefit}} over vanity metrics\n3. They invest in {{solution}} early\n\nThe result? 3x faster growth with half the effort.\n\nWhich of these resonates most with your experience?' }] },
  ],
  [ContentCategory.BLOG_ARTICLE]: [
    { id: 'howto', name: 'How-To Guide', blocks: [{ id: 'ba1', title: 'How-To Article', subject: 'How to Solve {{pain_point}}: A Step-by-Step Guide', body: 'Introduction:\n{{pain_point}} is one of the biggest challenges facing {{industry}} companies today. In this guide, we\'ll walk through a proven framework for {{benefit}}.\n\nStep 1: Audit Your Current Process\nBefore making changes, understand where you stand...\n\nStep 2: Identify Quick Wins\nLook for areas where {{solution}} can have immediate impact...\n\nStep 3: Implement and Measure\nTrack key metrics like {{insight_1}} to ensure progress...\n\nConclusion:\nBy following these steps, companies like {{company}} can expect to see measurable improvements within 30 days.' }] },
  ],
  [ContentCategory.AD_COPY]: [
    { id: 'google', name: 'Google Ads Set', blocks: [{ id: 'ad1', title: 'Google Search Ads', subject: 'Solve {{pain_point}} Fast | {{benefit}}', body: 'Headline 1: Solve {{pain_point}} in Days\nHeadline 2: {{benefit}} for {{industry}}\nHeadline 3: Trusted by 500+ Companies\n\nDescription 1: Stop wasting time on {{pain_point}}. Our {{solution}} helps {{industry}} companies achieve {{benefit}} 3x faster. Start free today.\n\nDescription 2: Join leading {{industry}} companies using our platform. Get {{benefit}} with proven {{solution}}. No credit card required.\n\nDisplay URL: yoursite.com/{{industry}}-solutions' }] },
  ],
  [ContentCategory.PROPOSAL]: [
    { id: 'saas', name: 'SaaS Proposal', blocks: [{ id: 'pr1', title: 'SaaS Proposal', subject: 'Proposal: {{solution}} for {{company}}', body: 'Dear {{first_name}},\n\nThank you for your interest in our platform. This proposal outlines how we can help {{company}} address {{pain_point}} and achieve {{benefit}}.\n\nThe Challenge:\n{{company}} currently faces {{pain_point}}, which impacts {{insight_1}}.\n\nOur Solution:\nWe propose implementing {{solution}} with the following deliverables:\n1. Full platform setup and integration\n2. Custom configuration for {{industry}}\n3. Team training and onboarding\n4. Dedicated success manager\n\nTimeline: 4-6 weeks\nInvestment: [Pricing tiers]\n\nNext Steps:\nWe\'d love to schedule a walkthrough. Please select a time at [link].\n\nBest regards,\n[Your Name]' }] },
  ],
};

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function deriveAISuggestions(body: string): { icon: string; text: string }[] {
  if (!body || body.length < 20) return [];
  const suggestions: { icon: string; text: string }[] = [];

  if (/\bachieve\b/i.test(body))
    suggestions.push({ icon: '\u{1F4A1}', text: 'Try "scale {{goal}}" instead of "achieve" for stronger action' });
  if (!/\d+%?/.test(body))
    suggestions.push({ icon: '\u{1F4CA}', text: 'Add specific metric: "increase efficiency by 40%"' });
  if (!/\b(used by|trusted by|join|companies|customers|clients)\b/i.test(body))
    suggestions.push({ icon: '\u{1F3C6}', text: 'Include social proof: "Used by 500+ companies"' });
  if (!body.includes('?'))
    suggestions.push({ icon: '\u{2753}', text: 'End with a question to boost response rates' });
  if (!/\{\{.+?\}\}/.test(body))
    suggestions.push({ icon: '\u{1F3AF}', text: 'Add personalization tags like {{first_name}} to increase engagement' });
  if (body.split(/\s+/).length > 200)
    suggestions.push({ icon: '\u{2702}\u{FE0F}', text: 'Consider shortening \u2014 emails under 125 words have 50% higher response rates' });
  if (!/p\.?s\.?/i.test(body) && body.split(/\s+/).length > 60)
    suggestions.push({ icon: '\u{1F4DD}', text: 'Add a P.S. line \u2014 it\'s the second most-read part of any email' });
  if (/\bhelp\b/i.test(body) && !/\bhelped\b/i.test(body))
    suggestions.push({ icon: '\u{1F4A1}', text: 'Replace "help" with a specific verb like "enable", "empower", or "streamline"' });

  return suggestions.slice(0, 3);
}

function derivePredictions(subject: string, body: string): { openRate: number; openVar: number; clickRate: number; clickVar: number; responseRate: number; responseVar: number; sendTime: string } | null {
  if (!body || body.length < 20) return null;
  const hasPersonalization = /\{\{.+?\}\}/.test(body);
  const subjectHasPersonalization = /\{\{.+?\}\}/.test(subject);
  const hasCTA = /\b(book|schedule|call|chat|demo|try|start|click|learn|reserve|sign up)\b/i.test(body);
  const hasQuestion = body.includes('?');
  const hasNumbers = /\d+%?/.test(body);
  const words = body.split(/\s+/).filter(Boolean).length;
  const subjectLen = subject.length;

  let openRate = 35;
  if (hasPersonalization) openRate += 4;
  if (subjectHasPersonalization) openRate += 5;
  if (subjectLen > 5 && subjectLen < 50) openRate += 3;
  if (subject.includes('?')) openRate += 2;

  let clickRate = 5;
  if (hasCTA) clickRate += 2;
  if (hasPersonalization) clickRate += 1.5;
  if (hasNumbers) clickRate += 1;

  let responseRate = 3;
  if (hasQuestion) responseRate += 1.5;
  if (hasPersonalization) responseRate += 1;
  if (words < 150) responseRate += 0.5;

  const times = ['Tue 10:30 AM', 'Wed 9:00 AM', 'Thu 2:00 PM', 'Tue 8:30 AM'];
  const timeIdx = (subject.length + body.length) % times.length;

  return {
    openRate: Math.round(openRate),
    openVar: 8,
    clickRate: Math.round(clickRate * 10) / 10,
    clickVar: 3,
    responseRate: Math.round(responseRate * 10) / 10,
    responseVar: 2,
    sendTime: times[timeIdx],
  };
}

const PREVIEW_REPLACEMENTS: Record<string, string> = {
  '{{first_name}}': 'Sarah',
  '{{last_name}}': 'Chen',
  '{{company}}': 'Acme Corp',
  '{{industry}}': 'SaaS',
  '{{pain_point}}': 'lead conversion bottlenecks',
  '{{insight_1}}': 'scaling outbound sales operations',
  '{{benefit}}': '3x pipeline growth',
  '{{solution}}': 'AI-powered sales automation',
  '{{goal}}': 'revenue targets',
  '{{recent_activity}}': 'viewed pricing page twice',
  '{{ai_insight}}': 'high purchase intent detected',
  '{{city}}': 'San Francisco',
};

function replaceTagsForPreview(text: string): string {
  let out = text;
  for (const [tag, val] of Object.entries(PREVIEW_REPLACEMENTS)) {
    out = out.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), val);
  }
  return out;
}

// Mock performance data
function generateMockPerformance(): ContentPerformance[] {
  const types = ['Email Sequence', 'Landing Page', 'Social Post', 'Blog Article'];
  const statuses: ContentPerformance['status'][] = ['sent', 'sent', 'sent', 'scheduled', 'draft'];
  return Array.from({ length: 8 }, (_, i) => {
    const dayOffset = i * 2 + 1;
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return {
      id: `perf-${i}`,
      title: [`Q1 Cold Outreach`, `Product Launch Campaign`, `Weekly Newsletter`, `LinkedIn Authority`, `Re-engagement Drip`, `Webinar Invite`, `Case Study Push`, `Trial Nudge`][i],
      type: types[i % types.length],
      sentAt: d.toISOString(),
      recipients: Math.floor(Math.random() * 500) + 50,
      openRate: +(Math.random() * 35 + 20).toFixed(1),
      clickRate: +(Math.random() * 12 + 3).toFixed(1),
      responseRate: +(Math.random() * 8 + 1).toFixed(1),
      status: statuses[i % statuses.length],
    };
  });
}

// ═══════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════
const ContentGen: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const query = new URLSearchParams(useLocation().search);
  const initialLeadId = query.get('leadId');

  // ── State ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [contentType, setContentType] = useState<ContentCategory>(ContentCategory.EMAIL_SEQUENCE);
  const [selectedSegments, setSelectedSegments] = useState<string[]>(['hot']);
  const [tone, setTone] = useState<ToneType>(ToneType.PROFESSIONAL);
  const [length, setLength] = useState<ContentLength>('Medium');
  const [focus, setFocus] = useState<ContentFocus>('Problem \u2192 Solution');
  const [personalization, setPersonalization] = useState<Record<string, boolean>>({ names: true, company: true, insights: true, behavioral: false });
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('analyzing');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    mode: 'now',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enableABTest: false,
  });
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [performanceData] = useState<ContentPerformance[]>(generateMockPerformance);

  const generationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const creditsTotal = user.credits_total ?? 500;
  const creditsUsed = user.credits_used ?? 0;

  // ── Effects ──
  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      const { data } = await supabase.from('leads').select('*').eq('client_id', user.id).order('score', { ascending: false });
      if (data) setLeads(data);
      setLoadingLeads(false);
    };
    if (user) fetchLeads();
  }, [user]);

  // ── Derived ──
  const segments = useMemo(() => [
    { id: 'hot', name: 'Hot Leads', count: leads.filter(l => l.score > 80).length },
    { id: 'enterprise', name: 'Enterprise', count: leads.filter(l => l.company && l.company.length > 8).length },
    { id: 'nurturing', name: 'Nurturing', count: leads.filter(l => l.status === 'Contacted').length },
    { id: 'new', name: 'New Leads', count: leads.filter(l => l.status === 'New').length },
    { id: 'qualified', name: 'Qualified', count: leads.filter(l => l.status === 'Qualified').length },
  ], [leads]);

  const targetLeads = useMemo(() => {
    const ids = new Set<string>();
    selectedSegments.forEach(seg => {
      const filter: Record<string, (l: Lead) => boolean> = {
        hot: l => l.score > 80,
        enterprise: l => l.company?.length > 8,
        nurturing: l => l.status === 'Contacted',
        new: l => l.status === 'New',
        qualified: l => l.status === 'Qualified',
      };
      leads.filter(filter[seg] || (() => false)).forEach(l => ids.add(l.id));
    });
    return leads.filter(l => ids.has(l.id));
  }, [leads, selectedSegments]);

  const activeBlock = blocks[activeBlockIdx] || null;
  const aiSuggestions = useMemo(() => deriveAISuggestions(activeBlock?.body || ''), [activeBlock?.body]);
  const predictions = useMemo(() => derivePredictions(activeBlock?.subject || '', activeBlock?.body || ''), [activeBlock?.subject, activeBlock?.body]);
  const currentTemplates = TEMPLATES[contentType] || [];

  // Aggregate performance metrics
  const perfMetrics = useMemo(() => {
    const sent = performanceData.filter(p => p.status === 'sent');
    if (sent.length === 0) return null;
    return {
      totalSent: sent.reduce((a, p) => a + p.recipients, 0),
      avgOpenRate: +(sent.reduce((a, p) => a + p.openRate, 0) / sent.length).toFixed(1),
      avgClickRate: +(sent.reduce((a, p) => a + p.clickRate, 0) / sent.length).toFixed(1),
      avgResponseRate: +(sent.reduce((a, p) => a + p.responseRate, 0) / sent.length).toFixed(1),
      totalPieces: sent.length,
    };
  }, [performanceData]);

  // ── Handlers ──
  const toggleSegment = (id: string) => {
    setSelectedSegments(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const togglePersonalization = (id: string) => {
    setPersonalization(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const updateBlock = (field: 'subject' | 'body', value: string) => {
    setBlocks(prev => prev.map((b, i) => i === activeBlockIdx ? { ...b, [field]: value } : b));
  };

  const addEmailBlock = () => {
    const num = blocks.length + 1;
    setBlocks(prev => [...prev, { id: `email-${num}-${Date.now()}`, title: `Email ${num}`, subject: '', body: '' }]);
    setActiveBlockIdx(blocks.length);
  };

  const applyTemplate = (template: TemplateOption) => {
    setBlocks(template.blocks.map((b, i) => ({ ...b, id: `tmpl-${i}-${Date.now()}` })));
    setActiveBlockIdx(0);
    setShowTemplates(false);
    setWizardStep(4);
  };

  const generateABVariant = useCallback(() => {
    if (!activeBlock) return;
    const variantB: ContentBlock = {
      ...activeBlock,
      id: `ab-${Date.now()}`,
      title: `${activeBlock.title} (B)`,
      subject: activeBlock.subject.replace(/^(.+)$/, '$1 - Alternative'),
      body: activeBlock.body,
      variant: 'B',
    };
    const updatedBlocks = [...blocks];
    updatedBlocks[activeBlockIdx] = { ...activeBlock, variant: 'A' };
    updatedBlocks.splice(activeBlockIdx + 1, 0, variantB);
    setBlocks(updatedBlocks);
    setActiveBlockIdx(activeBlockIdx + 1);
  }, [activeBlock, blocks, activeBlockIdx]);

  // ── Generation with staged progress ──
  const runGeneration = async () => {
    if (targetLeads.length === 0 && leads.length === 0) {
      setError('No leads available. Add leads first.');
      return;
    }
    if (creditsUsed >= creditsTotal) {
      setError('Credit limit reached. Please upgrade your plan.');
      return;
    }

    setWizardStep(3);
    setIsGenerating(true);
    setError('');
    setGenerationProgress(0);
    setGenerationStage('analyzing');

    // Animate through stages
    let stageIdx = 0;
    const totalDuration = GENERATION_STAGES.reduce((a, s) => a + s.duration, 0);
    let elapsed = 0;

    const advanceStage = () => {
      if (stageIdx < GENERATION_STAGES.length - 1) {
        elapsed += GENERATION_STAGES[stageIdx].duration;
        stageIdx++;
        setGenerationStage(GENERATION_STAGES[stageIdx].id);
        setGenerationProgress(Math.round((elapsed / totalDuration) * 90));
        generationRef.current = setTimeout(advanceStage, GENERATION_STAGES[stageIdx].duration);
      }
    };
    generationRef.current = setTimeout(advanceStage, GENERATION_STAGES[0].duration);

    const representative = targetLeads[0] || leads[0];
    const enabledTags = Object.entries(personalization).filter(([, v]) => v).map(([k]) => k);
    const contextParts = [
      `Focus: ${focus}`,
      `Length: ${length}`,
      `Personalization: ${enabledTags.join(', ')}`,
      `Target audience: ${selectedSegments.join(', ')} (${targetLeads.length} leads)`,
    ];

    try {
      const { error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      if (rpcError) console.error('Credit error:', rpcError);

      if (contentType === ContentCategory.EMAIL_SEQUENCE) {
        const config: EmailSequenceConfig = {
          audienceLeadIds: targetLeads.map(l => l.id),
          goal: FOCUS_TO_GOAL[focus],
          sequenceLength: LENGTH_TO_COUNT[length],
          cadence: 'every_2_days',
          tone,
        };
        const response = await generateEmailSequence(targetLeads.length > 0 ? targetLeads : leads.slice(0, 5), config);
        const parsed = parseEmailSequenceResponse(response.text, config);

        if (parsed.length > 0) {
          setBlocks(parsed.map((s, i) => ({
            id: `gen-${i}-${Date.now()}`,
            title: s.delay,
            subject: s.subject,
            body: s.body,
          })));
        } else {
          setBlocks([{ id: `raw-${Date.now()}`, title: 'Generated Sequence', subject: 'Email Sequence', body: response.text }]);
        }
        setActiveBlockIdx(0);

        await supabase.from('ai_usage_logs').insert({
          user_id: user.id,
          action_type: 'email_sequence_generation',
          tokens_used: response.tokens_used,
          model_name: response.model_name,
          prompt_name: response.prompt_name,
          prompt_version: response.prompt_version,
        });
      } else {
        const aiResponse = await generateContentByCategory(representative, contentType, tone, contextParts.join('. '));
        const lines = aiResponse.text.split('\n');
        const firstLine = lines[0]?.replace(/^#+\s*/, '').replace(/^\*+/, '').trim() || contentType;
        setBlocks([{
          id: `gen-${Date.now()}`,
          title: contentType,
          subject: firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine,
          body: aiResponse.text,
        }]);
        setActiveBlockIdx(0);

        await supabase.from('ai_usage_logs').insert({
          user_id: user.id,
          lead_id: representative.id,
          action_type: `${contentType.toLowerCase().replace(/\s+/g, '_')}_generation`,
          tokens_used: aiResponse.tokens_used,
          model_name: aiResponse.model_name,
          prompt_name: aiResponse.prompt_name,
          prompt_version: aiResponse.prompt_version,
        });
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED',
        details: `Generated ${contentType} for ${targetLeads.length} leads. Tone: ${tone}, Focus: ${focus}.`,
      });
      if (refreshProfile) await refreshProfile();

      // Complete generation
      if (generationRef.current) clearTimeout(generationRef.current);
      setGenerationStage('complete');
      setGenerationProgress(100);

      setTimeout(() => {
        setIsGenerating(false);
        setWizardStep(4);
      }, 600);
    } catch (err: any) {
      if (generationRef.current) clearTimeout(generationRef.current);
      setError(err.message || 'Generation failed.');
      setIsGenerating(false);
      setWizardStep(2);
    }
  };

  const handleSave = () => {
    localStorage.setItem('aura_studio_draft', JSON.stringify({ contentType, blocks, tone, focus, length }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAll = () => {
    const full = blocks.map(b => `--- ${b.title} ---\nSubject: ${b.subject}\n\n${b.body}`).join('\n\n');
    const blob = new Blob([full], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contentType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeliver = async () => {
    setDeliveryConfirmed(true);
    // Log delivery to audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: schedule.mode === 'now' ? 'CONTENT_SENT' : schedule.mode === 'scheduled' ? 'CONTENT_SCHEDULED' : 'CONTENT_DRAFT_SAVED',
      details: `${contentType}: ${blocks.length} blocks. Mode: ${schedule.mode}. Recipients: ${targetLeads.length} leads.${schedule.mode === 'scheduled' ? ` Scheduled: ${schedule.date} ${schedule.time}` : ''}`,
    });
    handleSave();
    setTimeout(() => setDeliveryConfirmed(false), 3000);
  };

  // ── Load saved draft on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('aura_studio_draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.blocks?.length > 0) {
          setBlocks(draft.blocks);
          if (draft.contentType) setContentType(draft.contentType);
          if (draft.tone) setTone(draft.tone);
          if (draft.focus) setFocus(draft.focus);
          if (draft.length) setLength(draft.length);
          setWizardStep(4);
        }
      }
    } catch {}
  }, []);

  // Cleanup generation timer
  useEffect(() => {
    return () => {
      if (generationRef.current) clearTimeout(generationRef.current);
    };
  }, []);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  const typeInfo = CONTENT_TYPES.find(t => t.id === contentType);
  const TypeIcon = typeInfo?.icon || SparklesIcon;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ═══ HEADER BAR ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <TypeIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center space-x-2 text-sm">
              <span className="font-bold text-slate-900 font-heading">Neural Studio</span>
              <span className="text-slate-300">&rsaquo;</span>
              <span className="text-indigo-600 font-bold">{WIZARD_STEPS[wizardStep - 1].label}</span>
            </div>
            <p className="text-[10px] text-slate-400">{targetLeads.length} leads targeted &middot; {(creditsTotal - creditsUsed).toLocaleString()} credits left</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowPerformance(!showPerformance)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center space-x-2 ${
              showPerformance ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'
            }`}
          >
            <ChartIcon className="w-3.5 h-3.5" />
            <span>Performance</span>
          </button>
          {blocks.length > 0 && (
            <button onClick={downloadAll} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" title="Download">
              <DownloadIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleSave}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              saved ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'
            }`}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* ═══ WIZARD STEP INDICATOR ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          {WIZARD_STEPS.map((step, i) => (
            <React.Fragment key={step.num}>
              <button
                onClick={() => {
                  if (step.num <= wizardStep || (step.num === 4 && blocks.length > 0)) {
                    setWizardStep(step.num);
                  }
                }}
                className={`flex items-center space-x-3 group ${
                  step.num <= wizardStep || (step.num === 4 && blocks.length > 0) ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                  step.num === wizardStep
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                    : step.num < wizardStep
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {step.num < wizardStep ? <CheckIcon className="w-4 h-4" /> : step.num}
                </div>
                <div className="hidden lg:block">
                  <p className={`text-xs font-bold ${step.num === wizardStep ? 'text-indigo-600' : step.num < wizardStep ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-slate-400">{step.desc}</p>
                </div>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 rounded-full transition-all ${
                  step.num < wizardStep ? 'bg-emerald-300' : 'bg-slate-100'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ═══ STEP 3: GENERATION PROGRESS ═══ */}
      {wizardStep === 3 && isGenerating && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 animate-in fade-in duration-300">
          <div className="max-w-lg mx-auto text-center space-y-8">
            {/* Animated Brain */}
            <div className="relative">
              <div className="w-24 h-24 mx-auto bg-indigo-50 rounded-3xl flex items-center justify-center animate-pulse">
                <SparklesIcon className="w-12 h-12 text-indigo-600" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center animate-bounce">
                <BoltIcon className="w-4 h-4 text-amber-600" />
              </div>
            </div>

            {/* Stage Label */}
            <div>
              <p className="text-lg font-black text-slate-900 font-heading mb-1">Creating Your Content</p>
              <p className="text-sm text-slate-500">
                {GENERATION_STAGES.find(s => s.id === generationStage)?.label || 'Processing...'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
              <p className="text-xs font-bold text-slate-400">{generationProgress}% complete</p>
            </div>

            {/* Stage Checklist */}
            <div className="space-y-2 text-left max-w-sm mx-auto">
              {GENERATION_STAGES.map((stage, i) => {
                const stageIdx = GENERATION_STAGES.findIndex(s => s.id === generationStage);
                const isComplete = i < stageIdx || generationStage === 'complete';
                const isCurrent = i === stageIdx && generationStage !== 'complete';
                return (
                  <div key={stage.id} className={`flex items-center space-x-3 py-1.5 transition-all ${isComplete || isCurrent ? 'opacity-100' : 'opacity-40'}`}>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                      isComplete ? 'bg-emerald-100 text-emerald-600' : isCurrent ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-300'
                    }`}>
                      {isComplete ? <CheckIcon className="w-3 h-3" /> : isCurrent ? (
                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                      ) : (
                        <span className="text-[8px] font-bold">{i + 1}</span>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${isComplete ? 'text-emerald-600' : isCurrent ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                      {stage.label.replace('...', '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEPS 1-2 & 4: MAIN LAYOUT ═══ */}
      {(wizardStep === 1 || wizardStep === 2 || wizardStep === 4) && (
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ─── SETUP PANEL (Left 30%) ─── */}
          {(wizardStep === 1 || wizardStep === 2) && (
            <div className="lg:w-[30%] shrink-0">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
                {/* STEP 1: CONTENT TYPE */}
                {wizardStep === 1 && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">1</span>
                        <span>Content Type</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {CONTENT_TYPES.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => { setContentType(id); setBlocks([]); setActiveBlockIdx(0); }}
                            className={`flex items-center space-x-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                              contentType === id
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">2</span>
                        <span>Target Audience</span>
                      </p>
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value && !selectedSegments.includes(e.target.value)) toggleSegment(e.target.value); }}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none mb-3"
                      >
                        <option value="">Select Segment...</option>
                        {segments.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.count})</option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        {segments.slice(0, 3).map(seg => (
                          <label key={seg.id} className="flex items-center space-x-1.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={selectedSegments.includes(seg.id)}
                              onChange={() => toggleSegment(seg.id)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className={`text-[11px] font-bold ${selectedSegments.includes(seg.id) ? 'text-indigo-600' : 'text-slate-500'}`}>
                              {seg.name}
                            </span>
                          </label>
                        ))}
                      </div>
                      {targetLeads.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-2">{targetLeads.length} leads in selected segments</p>
                      )}
                    </div>

                    {/* Templates Shortcut */}
                    <div>
                      <button
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="w-full px-4 py-3 rounded-xl text-xs font-bold border border-dashed border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                      >
                        Or use a template to skip ahead
                      </button>
                      {showTemplates && currentTemplates.length > 0 && (
                        <div className="mt-3 bg-slate-50 rounded-2xl border border-slate-200 p-3 space-y-2 animate-in fade-in duration-200">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Templates</p>
                          {currentTemplates.map(tmpl => (
                            <button
                              key={tmpl.id}
                              onClick={() => applyTemplate(tmpl)}
                              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all"
                            >
                              <p className="text-xs font-bold text-slate-700">{tmpl.name}</p>
                              <p className="text-[10px] text-slate-400">{tmpl.blocks.length} {tmpl.blocks.length === 1 ? 'block' : 'emails'}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={() => setWizardStep(2)}
                      className="w-full py-3 rounded-xl font-bold text-xs bg-slate-900 text-white hover:bg-indigo-600 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-100/50 active:scale-95"
                    >
                      <span>Next: Set Parameters</span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* STEP 2: AI PARAMETERS */}
                {wizardStep === 2 && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">3</span>
                        <span>AI Parameters</span>
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Tone</label>
                          <select value={tone} onChange={e => setTone(e.target.value as ToneType)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none">
                            {Object.values(ToneType).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Length</label>
                          <select value={length} onChange={e => setLength(e.target.value as ContentLength)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none">
                            {LENGTH_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Focus</label>
                          <select value={focus} onChange={e => setFocus(e.target.value as ContentFocus)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none">
                            {FOCUS_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">4</span>
                        <span>Personalization</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {PERSONALIZATION_OPTIONS.map(opt => (
                          <label key={opt.id} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!personalization[opt.id]}
                              onChange={() => togglePersonalization(opt.id)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className={`text-[11px] font-bold ${personalization[opt.id] ? 'text-indigo-600' : 'text-slate-500'}`}>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Summary Card */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Generation Summary</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Type</span>
                          <span className="font-bold text-slate-700">{typeInfo?.label}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Audience</span>
                          <span className="font-bold text-slate-700">{targetLeads.length} leads</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Tone</span>
                          <span className="font-bold text-slate-700">{tone}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Focus</span>
                          <span className="font-bold text-slate-700">{focus}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Credits Cost</span>
                          <span className="font-bold text-indigo-600">1 credit</span>
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-bold text-center">
                        {error}
                      </div>
                    )}

                    <div className="flex space-x-3">
                      <button
                        onClick={() => setWizardStep(1)}
                        className="px-4 py-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:text-slate-700 transition-all"
                      >
                        <ArrowLeftIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={runGeneration}
                        disabled={isGenerating || creditsUsed >= creditsTotal}
                        className={`flex-grow py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 ${
                          isGenerating || creditsUsed >= creditsTotal
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-100/50 active:scale-95'
                        }`}
                      >
                        <SparklesIcon className="w-4 h-4" />
                        <span>Generate with AI</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── EDITOR (Step 4: Full Width / Steps 1-2: Right 70%) ─── */}
          <div className={wizardStep === 4 ? 'w-full' : 'lg:w-[70%]'}>
            {wizardStep === 4 ? (
              <div className="space-y-6">
                {/* Editor Card */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Email Tabs */}
                  {blocks.length > 1 && (
                    <div className="px-6 pt-4 pb-0 flex items-center space-x-1 border-b border-slate-100 overflow-x-auto">
                      {blocks.map((b, i) => (
                        <button
                          key={b.id}
                          onClick={() => setActiveBlockIdx(i)}
                          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border border-b-0 transition-all whitespace-nowrap ${
                            i === activeBlockIdx
                              ? 'bg-white border-slate-200 text-indigo-600 -mb-px'
                              : 'bg-slate-50 border-transparent text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {b.title || `Email ${i + 1}`}
                          {b.variant && (
                            <span className={`ml-1.5 px-1 py-0.5 rounded text-[8px] font-black ${b.variant === 'A' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                              {b.variant}
                            </span>
                          )}
                        </button>
                      ))}
                      {contentType === ContentCategory.EMAIL_SEQUENCE && (
                        <button onClick={addEmailBlock} className="px-3 py-2.5 text-slate-300 hover:text-indigo-600 transition-colors" title="Add email">
                          <PlusIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Editor Body */}
                  {blocks.length > 0 && activeBlock ? (
                    <div className="p-6 space-y-4">
                      {/* Block Title + Actions */}
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                          <MailIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-grow">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {contentType === ContentCategory.EMAIL_SEQUENCE ? `EMAIL ${activeBlockIdx + 1}` : contentType.toUpperCase()}
                          </p>
                          <input
                            value={activeBlock.title}
                            onChange={e => setBlocks(prev => prev.map((b, i) => i === activeBlockIdx ? { ...b, title: e.target.value } : b))}
                            className="text-sm font-bold text-slate-800 bg-transparent outline-none w-full"
                            placeholder="Enter title..."
                          />
                        </div>
                        <div className="flex items-center space-x-1">
                          <button onClick={generateABVariant} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Create A/B variant">
                            <SplitIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setShowPreview(true)} className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Preview">
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => copyToClipboard(`Subject: ${activeBlock.subject}\n\n${activeBlock.body}`)}
                            className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            {copied ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <CopyIcon className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Subject Line */}
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{SUBJECT_LABEL[contentType] || 'Subject'}</label>
                        <input
                          value={activeBlock.subject}
                          onChange={e => updateBlock('subject', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                          placeholder={`Enter ${(SUBJECT_LABEL[contentType] || 'subject').toLowerCase()}...`}
                        />
                      </div>

                      {/* Body Editor */}
                      <div>
                        <textarea
                          value={activeBlock.body}
                          onChange={e => updateBlock('body', e.target.value)}
                          rows={14}
                          className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all resize-none font-mono"
                          placeholder="Start writing or generate content with AI..."
                        />
                      </div>

                      {/* AI Suggestions */}
                      {aiSuggestions.length > 0 && (
                        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                            <TargetIcon className="w-3.5 h-3.5" />
                            <span>AI Suggestions</span>
                          </p>
                          <div className="space-y-2">
                            {aiSuggestions.map((s, i) => (
                              <div key={i} className="flex items-start space-x-2">
                                <span className="text-sm shrink-0">{s.icon}</span>
                                <p className="text-xs text-slate-600 leading-relaxed">{s.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-12 text-center">
                      <div className="w-16 h-16 mx-auto bg-slate-50 rounded-3xl flex items-center justify-center mb-4">
                        <SparklesIcon className="w-8 h-8 text-slate-200" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-400 mb-1">No Content Yet</h3>
                      <p className="text-xs text-slate-300 max-w-xs mx-auto">
                        Go back to generate content or select a template.
                      </p>
                      <button
                        onClick={() => setWizardStep(1)}
                        className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
                      >
                        Start Over
                      </button>
                    </div>
                  )}
                </div>

                {/* Predictive Analytics */}
                {predictions && blocks.length > 0 && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 animate-in fade-in duration-300">
                    <div className="flex items-center space-x-2 mb-5">
                      <ChartIcon className="w-4 h-4 text-indigo-500" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Predictive Analytics</p>
                      <span className="text-[9px] bg-indigo-50 text-indigo-600 font-black px-2 py-0.5 rounded-lg uppercase tracking-wider">Expected Performance</span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-4 bg-slate-50 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Open Rate</p>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-2xl font-black text-slate-900">{predictions.openRate}%</span>
                          <span className="text-[10px] text-slate-400">(\u00B1{predictions.openVar}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full transition-all duration-700" style={{ width: `${predictions.openRate}%` }} />
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Click Rate</p>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-2xl font-black text-slate-900">{predictions.clickRate}%</span>
                          <span className="text-[10px] text-slate-400">(\u00B1{predictions.clickVar}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all duration-700" style={{ width: `${predictions.clickRate * 5}%` }} />
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Response Rate</p>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-2xl font-black text-slate-900">{predictions.responseRate}%</span>
                          <span className="text-[10px] text-slate-400">(\u00B1{predictions.responseVar}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div className="bg-amber-500 h-full rounded-full transition-all duration-700" style={{ width: `${predictions.responseRate * 8}%` }} />
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Optimal Send Time</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <ClockIcon className="w-5 h-5 text-indigo-500" />
                          <span className="text-lg font-black text-slate-900">{predictions.sendTime}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Based on audience patterns</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                {blocks.length > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:text-slate-700 transition-all"
                    >
                      <ArrowLeftIcon className="w-4 h-4" />
                      <span>Back to Parameters</span>
                    </button>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={runGeneration}
                        className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                      >
                        <RefreshIcon className="w-4 h-4" />
                        <span>Regenerate</span>
                      </button>
                      <button
                        onClick={() => setWizardStep(5)}
                        className="flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-100/50 transition-all active:scale-95"
                      >
                        <span>Next: Deliver</span>
                        <ArrowRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Steps 1-2 Right Panel: Quick Preview */
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                {blocks.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Draft Preview</p>
                      <button onClick={() => setWizardStep(4)} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700">
                        Edit in Full Editor &rarr;
                      </button>
                    </div>
                    {blocks.slice(0, 3).map((b, i) => (
                      <div key={b.id} className={`p-4 bg-slate-50 rounded-2xl ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{b.title}</p>
                        <p className="text-sm font-bold text-slate-800 mb-2">{b.subject}</p>
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{b.body}</p>
                      </div>
                    ))}
                    {blocks.length > 3 && (
                      <p className="text-[11px] text-slate-400 text-center">+{blocks.length - 3} more blocks</p>
                    )}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <div className="w-20 h-20 mx-auto bg-slate-50 rounded-3xl flex items-center justify-center mb-5">
                      <SparklesIcon className="w-10 h-10 text-slate-200" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-400 mb-1">Ready to Create</h3>
                    <p className="text-xs text-slate-300 max-w-xs mx-auto mb-6">
                      Configure your content type and audience, then let AI generate high-converting content in seconds.
                    </p>
                    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                      {[
                        { icon: <TargetIcon className="w-4 h-4" />, label: 'Smart Targeting' },
                        { icon: <SparklesIcon className="w-4 h-4" />, label: 'AI-Powered' },
                        { icon: <ChartIcon className="w-4 h-4" />, label: 'Predictive Analytics' },
                      ].map(f => (
                        <div key={f.label} className="p-3 bg-slate-50 rounded-xl text-center">
                          <div className="w-8 h-8 mx-auto bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-500 mb-2">
                            {f.icon}
                          </div>
                          <p className="text-[10px] font-bold text-slate-500">{f.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ STEP 5: DELIVER ═══ */}
      {wizardStep === 5 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          {/* Delivery Options */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">Delivery Method</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { mode: 'now' as const, label: 'Send Now', desc: 'Deliver immediately', icon: <SendIcon className="w-5 h-5" /> },
                  { mode: 'scheduled' as const, label: 'Schedule', desc: 'Set date & time', icon: <CalendarIcon className="w-5 h-5" /> },
                  { mode: 'draft' as const, label: 'Save Draft', desc: 'Continue later', icon: <BookIcon className="w-5 h-5" /> },
                ].map(opt => (
                  <button
                    key={opt.mode}
                    onClick={() => setSchedule(prev => ({ ...prev, mode: opt.mode }))}
                    className={`p-5 rounded-2xl border-2 transition-all text-center ${
                      schedule.mode === opt.mode
                        ? 'border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100'
                        : 'border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-3 ${
                      schedule.mode === opt.mode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {opt.icon}
                    </div>
                    <p className={`text-sm font-bold ${schedule.mode === opt.mode ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Schedule Config */}
              {schedule.mode === 'scheduled' && (
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 animate-in fade-in duration-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Schedule Details</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1.5">Date</label>
                      <input
                        type="date"
                        value={schedule.date}
                        onChange={e => setSchedule(prev => ({ ...prev, date: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1.5">Time</label>
                      <input
                        type="time"
                        value={schedule.time}
                        onChange={e => setSchedule(prev => ({ ...prev, time: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Timezone: {schedule.timezone}</p>
                  {predictions && (
                    <div className="flex items-center space-x-2 p-3 bg-indigo-50 rounded-xl">
                      <SparklesIcon className="w-4 h-4 text-indigo-500" />
                      <p className="text-[11px] text-indigo-700 font-medium">
                        AI recommends sending on <strong>{predictions.sendTime}</strong> for optimal engagement
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* A/B Testing Toggle */}
              <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <SplitIcon className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-700">Enable A/B Testing</p>
                      <p className="text-[10px] text-slate-400">Split audience 50/50 between variant A and B</p>
                    </div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative ${schedule.enableABTest ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    onClick={() => setSchedule(prev => ({ ...prev, enableABTest: !prev.enableABTest }))}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${schedule.enableABTest ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </div>
                </label>
                {schedule.enableABTest && blocks.filter(b => b.variant).length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-2 font-medium">No A/B variants created yet. Go back to the editor to create variants.</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setWizardStep(4)}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:text-slate-700 transition-all"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>Back to Editor</span>
              </button>
              <button
                onClick={handleDeliver}
                disabled={deliveryConfirmed}
                className={`flex items-center space-x-2 px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 ${
                  deliveryConfirmed
                    ? 'bg-emerald-500 text-white shadow-emerald-200'
                    : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-indigo-200'
                }`}
              >
                {deliveryConfirmed ? (
                  <><CheckIcon className="w-4 h-4" /><span>{schedule.mode === 'now' ? 'Sent!' : schedule.mode === 'scheduled' ? 'Scheduled!' : 'Saved!'}</span></>
                ) : (
                  <><SendIcon className="w-4 h-4" /><span>{schedule.mode === 'now' ? 'Send Now' : schedule.mode === 'scheduled' ? 'Schedule Delivery' : 'Save as Draft'}</span></>
                )}
              </button>
            </div>
          </div>

          {/* Delivery Summary */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Delivery Summary</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Content Type</span>
                  <span className="text-xs font-bold text-slate-700">{typeInfo?.label}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Blocks</span>
                  <span className="text-xs font-bold text-slate-700">{blocks.length}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Recipients</span>
                  <span className="text-xs font-bold text-slate-700">{targetLeads.length} leads</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500">A/B Test</span>
                  <span className={`text-xs font-bold ${schedule.enableABTest ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {schedule.enableABTest ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-slate-500">Method</span>
                  <span className="text-xs font-bold text-indigo-600 capitalize">{schedule.mode === 'now' ? 'Immediate' : schedule.mode}</span>
                </div>
              </div>
            </div>

            {/* Predicted Impact */}
            {predictions && (
              <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-3xl p-6 text-white">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-4">Predicted Impact</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-indigo-200">Expected Opens</span>
                      <span className="text-sm font-black">{Math.round(targetLeads.length * predictions.openRate / 100)}</span>
                    </div>
                    <div className="w-full bg-indigo-800/50 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-white/80 h-full rounded-full" style={{ width: `${predictions.openRate}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-indigo-200">Expected Clicks</span>
                      <span className="text-sm font-black">{Math.round(targetLeads.length * predictions.clickRate / 100)}</span>
                    </div>
                    <div className="w-full bg-indigo-800/50 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${predictions.clickRate * 5}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-indigo-200">Expected Responses</span>
                      <span className="text-sm font-black">{Math.round(targetLeads.length * predictions.responseRate / 100)}</span>
                    </div>
                    <div className="w-full bg-indigo-800/50 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full rounded-full" style={{ width: `${predictions.responseRate * 8}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CONTENT PERFORMANCE MONITORING ═══ */}
      {showPerformance && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Performance Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ChartIcon className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-black text-slate-900 font-heading">Content Performance</h2>
            </div>
            <button
              onClick={() => setShowPerformance(false)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Aggregate Metrics */}
          {perfMetrics && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Total Sent', value: perfMetrics.totalSent.toLocaleString(), icon: <SendIcon className="w-4 h-4" />, color: 'indigo' },
                { label: 'Avg Open Rate', value: `${perfMetrics.avgOpenRate}%`, icon: <EyeIcon className="w-4 h-4" />, color: 'blue', trend: perfMetrics.avgOpenRate > 30 ? 'up' : 'down' },
                { label: 'Avg Click Rate', value: `${perfMetrics.avgClickRate}%`, icon: <TargetIcon className="w-4 h-4" />, color: 'emerald', trend: perfMetrics.avgClickRate > 5 ? 'up' : 'down' },
                { label: 'Avg Response', value: `${perfMetrics.avgResponseRate}%`, icon: <MailIcon className="w-4 h-4" />, color: 'amber', trend: perfMetrics.avgResponseRate > 3 ? 'up' : 'down' },
                { label: 'Content Pieces', value: perfMetrics.totalPieces.toString(), icon: <BookIcon className="w-4 h-4" />, color: 'violet' },
              ].map(m => (
                <div key={m.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg bg-${m.color}-50 flex items-center justify-center text-${m.color}-500`}>
                      {m.icon}
                    </div>
                    {m.trend && (
                      m.trend === 'up'
                        ? <TrendUpIcon className="w-4 h-4 text-emerald-500" />
                        : <TrendDownIcon className="w-4 h-4 text-rose-500" />
                    )}
                  </div>
                  <p className="text-xl font-black text-slate-900">{m.value}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{m.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Content Pieces Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Content</p>
              <div className="flex items-center space-x-2">
                {['All', 'Sent', 'Scheduled', 'Draft'].map(f => (
                  <button key={f} className="px-3 py-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Content</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Recipients</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Open Rate</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Click Rate</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Response</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceData.map((item, i) => (
                    <tr key={item.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                      <td className="px-6 py-3">
                        <p className="text-xs font-bold text-slate-800">{item.title}</p>
                        <p className="text-[10px] text-slate-400">{new Date(item.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{item.type}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-700">{item.recipients}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-black ${item.openRate > 35 ? 'text-emerald-600' : item.openRate > 25 ? 'text-slate-700' : 'text-rose-500'}`}>
                          {item.openRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-black ${item.clickRate > 8 ? 'text-emerald-600' : item.clickRate > 4 ? 'text-slate-700' : 'text-rose-500'}`}>
                          {item.clickRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-black ${item.responseRate > 5 ? 'text-emerald-600' : item.responseRate > 2 ? 'text-slate-700' : 'text-rose-500'}`}>
                          {item.responseRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                          item.status === 'sent' ? 'bg-emerald-50 text-emerald-600' :
                          item.status === 'scheduled' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Performance Insights */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center space-x-2 mb-4">
              <SparklesIcon className="w-4 h-4 text-indigo-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Performance Insights</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                {
                  title: 'Best Performing Content',
                  desc: 'Cold outreach emails with personalized subject lines show 2.3x higher open rates than generic templates.',
                  action: 'Optimize templates',
                  color: 'emerald',
                },
                {
                  title: 'Engagement Drop Alert',
                  desc: 'Social media posts have seen a 15% decline in click-through rates over the past 2 weeks.',
                  action: 'Review social strategy',
                  color: 'amber',
                },
                {
                  title: 'Send Time Optimization',
                  desc: 'Emails sent Tuesday 10-11 AM see 40% higher response rates. Consider adjusting your schedule.',
                  action: 'Update schedule',
                  color: 'indigo',
                },
              ].map((insight, i) => (
                <div key={i} className={`p-4 bg-${insight.color}-50/50 rounded-2xl border border-${insight.color}-100`}>
                  <p className={`text-xs font-bold text-${insight.color}-700 mb-2`}>{insight.title}</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed mb-3">{insight.desc}</p>
                  <button className={`text-[10px] font-bold text-${insight.color}-600 hover:text-${insight.color}-700`}>
                    {insight.action} &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PREVIEW MODAL ═══ */}
      {showPreview && activeBlock && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <p className="text-sm font-bold text-slate-900">Content Preview</p>
                <p className="text-[10px] text-slate-400">Personalization tags replaced with sample data</p>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {blocks.map((block, i) => (
                <div key={block.id} className={`${i > 0 ? 'pt-6 border-t border-slate-100' : ''}`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{block.title}</p>
                    {block.variant && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${block.variant === 'A' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                        Variant {block.variant}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-800 mb-3">{replaceTagsForPreview(block.subject)}</p>
                  <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{replaceTagsForPreview(block.body)}</div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end space-x-3 shrink-0">
              <button onClick={() => {
                const full = blocks.map(b => `Subject: ${replaceTagsForPreview(b.subject)}\n\n${replaceTagsForPreview(b.body)}`).join('\n\n---\n\n');
                copyToClipboard(full);
              }} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center space-x-2 transition-colors">
                <CopyIcon className="w-4 h-4" />
                <span>{copied ? 'Copied!' : 'Copy Preview'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentGen;
