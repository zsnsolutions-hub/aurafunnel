import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Lead, ContentCategory, ToneType, EmailStep, User, EmailSequenceConfig, EmailProvider } from '../../types';
import { generateContentByCategory, generateEmailSequence, parseEmailSequenceResponse, AIResponse, buildEmailFooter } from '../../lib/gemini';
import {
  SparklesIcon, MailIcon, GlobeIcon, HashIcon, BookIcon, BriefcaseIcon, BoltIcon,
  CopyIcon, CheckIcon, ClockIcon, EyeIcon, XIcon, PlusIcon, DownloadIcon,
  ArrowRightIcon, ArrowLeftIcon, CalendarIcon, SendIcon, SplitIcon, ChartIcon,
  TrendUpIcon, TrendDownIcon, TargetIcon, FlameIcon, RefreshIcon,
  KeyboardIcon, BrainIcon, LayersIcon, ActivityIcon, TagIcon, StarIcon, GridIcon,
  AlertTriangleIcon, ChevronDownIcon, CameraIcon, CursorClickIcon
} from '../../components/Icons';
import ImageGeneratorDrawer from '../../components/image-gen/ImageGeneratorDrawer';
import CTAButtonBuilderModal from '../../components/email/CTAButtonBuilderModal';
import { PageHeader } from '../../components/layout/PageHeader';
import { AdvancedOnly } from '../../components/ui-mode';
import { supabase } from '../../lib/supabase';
import { normalizeLeads } from '../../lib/queries';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { sendTrackedEmail, sendTrackedEmailBatch, scheduleEmailBlock, fetchOwnerEmailPerformance, fetchCampaignHistory, fetchCampaignRecipients, fetchConnectedEmailProvider } from '../../lib/emailTracking';
import type { EmailPerformanceEntry, CampaignSummary, CampaignRecipient, ConnectedEmailProvider } from '../../lib/emailTracking';
import { generateEmailSequencePdf } from '../../lib/pdfExport';
import { useUsageLimits } from '../../hooks/useUsageLimits';
import UpgradeModal from '../../components/portal/UpgradeModal';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════
type ContentLength = 'Short' | 'Medium' | 'Long';
type ContentFocus = 'Problem → Solution' | 'Features → Benefits' | 'Story → CTA' | 'Data → Insight';
type ContentGoal = 'product_demo' | 'download_content' | 'newsletter' | 'book_meeting' | 'free_trial' | 'webinar';
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

interface CustomPrompt {
  id: string;
  label: string;
  prompt: string;
  category: ContentCategory;
  usedCount: number;
  createdAt: Date;
}

interface ContentQualityScore {
  overall: number;
  personalization: number;
  engagement: number;
  clarity: number;
  ctaStrength: number;
  readability: number;
}

interface WritingMetrics {
  wordCount: number;
  readingTime: string;
  sentenceCount: number;
  avgSentenceLength: number;
  readabilityGrade: string;
  readabilityScore: number;
}

interface ToneBreakdown {
  label: string;
  value: number;
  color: string;
}

interface CalendarEntry {
  date: string;
  title: string;
  type: string;
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

const GOAL_OPTIONS: { id: ContentGoal; label: string; desc: string; icon: string }[] = [
  { id: 'product_demo', label: 'Schedule Product Demo', desc: 'Drive prospects to book a live demo', icon: '📅' },
  { id: 'download_content', label: 'Download Content', desc: 'Get leads to download assets', icon: '📥' },
  { id: 'newsletter', label: 'Newsletter Signup', desc: 'Grow your subscriber list', icon: '📧' },
  { id: 'book_meeting', label: 'Book a Meeting', desc: 'Schedule 1:1 conversations', icon: '🤝' },
  { id: 'free_trial', label: 'Start Free Trial', desc: 'Convert to trial users', icon: '🚀' },
  { id: 'webinar', label: 'Register for Webinar', desc: 'Fill webinar seats', icon: '🎤' },
];

const TONE_OPTIONS: { id: ToneType; label: string; desc: string }[] = [
  { id: ToneType.PROFESSIONAL, label: 'Professional but Friendly', desc: 'Warm and authoritative' },
  { id: ToneType.CASUAL, label: 'Casual & Conversational', desc: 'Like chatting with a friend' },
  { id: ToneType.PERSUASIVE, label: 'Persuasive & Urgent', desc: 'Action-driven with urgency' },
  { id: ToneType.TECHNICAL, label: 'Technical & Detailed', desc: 'Data-rich and precise' },
  { id: ToneType.EMPATHETIC, label: 'Empathetic & Supportive', desc: 'Understanding and caring' },
];

const LENGTH_DETAILS: Record<ContentLength, { emails: string; desc: string }> = {
  Short: { emails: '3 emails', desc: 'Quick nurture — best for warm leads' },
  Medium: { emails: '5 emails', desc: 'Standard sequence — balanced depth' },
  Long: { emails: '7+ emails', desc: 'Deep funnel — ideal for cold outreach' },
};

const PERSONALIZATION_OPTIONS = [
  { id: 'names', label: 'Use lead names', desc: 'First & last name tokens', icon: '👤' },
  { id: 'company', label: 'Include company details', desc: 'Company name, size & industry', icon: '🏢' },
  { id: 'insights', label: 'Add AI insights', desc: 'AI-derived engagement data', icon: '🧠' },
  { id: 'behavioral', label: 'Dynamic content based on behavior', desc: 'Page visits, clicks & activity', icon: '📊' },
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

const CONTENT_GOAL_TO_SEQ_GOAL: Record<ContentGoal, EmailSequenceConfig['goal']> = {
  product_demo: 'product_demo',
  download_content: 'nurture',
  newsletter: 'nurture',
  book_meeting: 'book_meeting',
  free_trial: 'product_demo',
  webinar: 're_engage',
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
function deriveAISuggestions(body: string): { icon: string; text: string; apply?: (body: string) => string }[] {
  if (!body || body.length < 20) return [];
  const suggestions: { icon: string; text: string; apply?: (body: string) => string }[] = [];

  if (/\bachieve\b/i.test(body))
    suggestions.push({ icon: '\u{1F4A1}', text: 'Try "scale {{goal}}" instead of "achieve" for stronger action', apply: b => b.replace(/\bachieve\b/gi, 'scale {{goal}}') });
  if (!/\d+%?/.test(body))
    suggestions.push({ icon: '\u{1F4CA}', text: 'Add specific metric: "increase efficiency by 40%"', apply: b => b.trimEnd() + '\n\nOur clients typically see a 40% increase in efficiency within the first quarter.' });
  if (!/\b(used by|trusted by|join|companies|customers|clients)\b/i.test(body))
    suggestions.push({ icon: '\u{1F3C6}', text: 'Include social proof: "Used by 500+ companies"', apply: b => b.trimEnd() + '\n\nTrusted by 500+ companies worldwide.' });
  if (!body.includes('?'))
    suggestions.push({ icon: '\u{2753}', text: 'End with a question to boost response rates', apply: b => b.trimEnd() + '\n\nWould you be open to a quick 15-minute call this week?' });
  if (!/\{\{.+?\}\}/.test(body))
    suggestions.push({ icon: '\u{1F3AF}', text: 'Add personalization tags like {{first_name}} to increase engagement', apply: b => 'Hi {{first_name}},\n\n' + b });
  if (body.split(/\s+/).length > 200)
    suggestions.push({ icon: '\u{2702}\u{FE0F}', text: 'Consider shortening \u2014 emails under 125 words have 50% higher response rates' });
  if (!/p\.?s\.?/i.test(body) && body.split(/\s+/).length > 60)
    suggestions.push({ icon: '\u{1F4DD}', text: 'Add a P.S. line \u2014 it\'s the second most-read part of any email', apply: b => b.trimEnd() + '\n\nP.S. I have a few ideas specifically for {{company}} \u2014 happy to share if you\'re interested.' });
  if (/\bhelp\b/i.test(body) && !/\bhelped\b/i.test(body))
    suggestions.push({ icon: '\u{1F4A1}', text: 'Replace "help" with a specific verb like "enable", "empower", or "streamline"', apply: b => b.replace(/\bhelp\b/gi, 'empower') });

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

// Helper: extract day offset from block title like "Day 3", "Email 2 — Day 5", etc.
function extractDelayDays(title: string, fallbackIndex: number): number {
  const match = title.match(/Day\s+(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return fallbackIndex * 2;
}

// ═══════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════
const ContentGen: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const navigate = useNavigate();
  const query = new URLSearchParams(useLocation().search);
  const initialLeadId = query.get('leadId');
  const { warnings: usageWarnings, checkEmail: checkEmailLimit, limitError, clearError: clearLimitError } = useUsageLimits(user.id, user.plan);

  // ── State ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [contentType, setContentType] = useState<ContentCategory>(ContentCategory.EMAIL_SEQUENCE);
  const [selectedSegments, setSelectedSegments] = useState<string[]>(['hot']);
  const [tone, setTone] = useState<ToneType>(ToneType.PROFESSIONAL);
  const [length, setLength] = useState<ContentLength>('Medium');
  const [focus, setFocus] = useState<ContentFocus>('Problem \u2192 Solution');
  const [goal, setGoal] = useState<ContentGoal>('product_demo');
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
  const [performanceData, setPerformanceData] = useState<ContentPerformance[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [deliveryProgress, setDeliveryProgress] = useState<{ current: number; total: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showCtaBuilder, setShowCtaBuilder] = useState(false);
  const [emailImages, setEmailImages] = useState<string[]>([]);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [contentHistory, setContentHistory] = useState<{ id: string; timestamp: Date; blocks: ContentBlock[]; label: string }[]>([]);
  const [showWritingAssistant, setShowWritingAssistant] = useState(true);
  const [excludedLeadIds, setExcludedLeadIds] = useState<Set<string>>(new Set());
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [showCampaignHistory, setShowCampaignHistory] = useState(false);
  const [campaignHistory, setCampaignHistory] = useState<CampaignSummary[]>([]);
  const [campaignHistoryLoading, setCampaignHistoryLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignRecipients, setCampaignRecipients] = useState<CampaignRecipient[]>([]);
  const [campaignRecipientsLoading, setCampaignRecipientsLoading] = useState(false);
  const [connectedProvider, setConnectedProvider] = useState<ConnectedEmailProvider | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; error?: string } | null>(null);

  // ── Business Brief State ──
  const [customContext, setCustomContext] = useState('');
  const [keyDifferentiator, setKeyDifferentiator] = useState('');
  const [competitorContext, setCompetitorContext] = useState('');

  const generationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const creditsTotal = user.credits_total ?? 500;
  const creditsUsed = user.credits_used ?? 0;

  // ── Business Profile Detection ──
  const bp = user.businessProfile;
  const hasBusinessProfile = !!(bp?.companyName || bp?.productsServices || bp?.industry);
  const profileCompleteness = [
    bp?.companyName, bp?.industry, bp?.productsServices,
    bp?.targetAudience, bp?.valueProp, bp?.pricingModel, bp?.salesApproach
  ].filter(Boolean).length;
  const profileTotal = 7;

  // ── Auto-populate brief from business profile ──
  useEffect(() => {
    if (bp?.productsServices && !customContext) setCustomContext(bp.productsServices);
    if (bp?.valueProp && !keyDifferentiator) setKeyDifferentiator(bp.valueProp);
  }, []);

  // ── Effects ──
  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      const { data } = await supabase.from('leads').select('*').eq('client_id', user.id).order('score', { ascending: false });
      if (data) setLeads(normalizeLeads(data));
      setLoadingLeads(false);
    };
    if (user) fetchLeads();
  }, [user]);

  // ── Load real performance data when panel opens ──
  useEffect(() => {
    if (!showPerformance) return;
    let cancelled = false;
    const loadPerformance = async () => {
      setPerformanceLoading(true);
      const raw = await fetchOwnerEmailPerformance();
      if (cancelled) return;

      // Group by subject into ContentPerformance entries
      const grouped = new Map<string, { entries: typeof raw; subject: string }>();
      for (const entry of raw) {
        const key = entry.subject;
        if (!grouped.has(key)) grouped.set(key, { entries: [], subject: key });
        grouped.get(key)!.entries.push(entry);
      }

      const perfData: ContentPerformance[] = Array.from(grouped.values()).map((g, i) => {
        const totalOpens = g.entries.reduce((a, e) => a + e.opens, 0);
        const totalClicks = g.entries.reduce((a, e) => a + e.clicks, 0);
        const count = g.entries.length;
        return {
          id: `perf-${i}`,
          title: g.subject,
          type: 'Email Sequence',
          sentAt: g.entries[0].sentAt,
          recipients: count,
          openRate: count > 0 ? +(totalOpens / count * 100).toFixed(1) : 0,
          clickRate: count > 0 ? +(totalClicks / count * 100).toFixed(1) : 0,
          responseRate: 0,
          status: 'sent' as const,
        };
      });

      setPerformanceData(perfData);
      setPerformanceLoading(false);
    };
    loadPerformance();
    return () => { cancelled = true; };
  }, [showPerformance]);

  // ── Load campaign history when panel opens ──
  useEffect(() => {
    if (!showCampaignHistory) return;
    let cancelled = false;
    const loadCampaigns = async () => {
      setCampaignHistoryLoading(true);
      const data = await fetchCampaignHistory();
      if (cancelled) return;
      setCampaignHistory(data);
      setCampaignHistoryLoading(false);
    };
    loadCampaigns();
    return () => { cancelled = true; };
  }, [showCampaignHistory]);

  // ── Load campaign recipients when a campaign is selected ──
  useEffect(() => {
    if (!selectedCampaignId) return;
    let cancelled = false;
    const loadRecipients = async () => {
      setCampaignRecipientsLoading(true);
      const data = await fetchCampaignRecipients(selectedCampaignId);
      if (cancelled) return;
      setCampaignRecipients(data);
      setCampaignRecipientsLoading(false);
    };
    loadRecipients();
    return () => { cancelled = true; };
  }, [selectedCampaignId]);

  // ── Load connected email provider on mount ──
  useEffect(() => {
    let cancelled = false;
    const loadProvider = async () => {
      setProviderLoading(true);
      const result = await fetchConnectedEmailProvider();
      if (cancelled) return;
      setConnectedProvider(result);
      setProviderLoading(false);
    };
    loadProvider();
    return () => { cancelled = true; };
  }, []);

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

  const selectedLeads = useMemo(() =>
    targetLeads.filter(l => !excludedLeadIds.has(l.id)),
  [targetLeads, excludedLeadIds]);

  const activeBlock = blocks[activeBlockIdx] || null;

  const buildHtmlBody = (bodyText: string, footer: string) => {
    const imagesHtml = emailImages.length > 0
      ? emailImages.map(url => `<div style="margin-bottom:16px;text-align:center;"><img src="${url}" alt="" style="display:block;margin:0 auto;max-width:100%;height:auto;border-radius:8px;" /></div>`).join('')
      : '';
    return `<div>${imagesHtml}${bodyText.replace(/\n/g, '<br />')}</div>${footer}`;
  };

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

  // ── KPI Stats ──
  const kpiStats = useMemo(() => {
    const sent = performanceData.filter(p => p.status === 'sent');
    const totalGenerated = performanceData.length + blocks.length;
    const activeSequences = performanceData.filter(p => p.status === 'scheduled').length;
    const avgOpenRate = sent.length > 0 ? +(sent.reduce((a, p) => a + p.openRate, 0) / sent.length).toFixed(1) : 0;
    const bestType = sent.length > 0
      ? sent.reduce((best, p) => p.openRate > best.openRate ? p : best, sent[0]).type
      : 'N/A';
    const creditsRemaining = creditsTotal - creditsUsed;
    const aiAccuracy = sent.length > 0 ? Math.round(65 + (avgOpenRate / 2)) : 0;
    return { totalGenerated, activeSequences, avgOpenRate, bestType, creditsRemaining, aiAccuracy };
  }, [performanceData, blocks.length, creditsTotal, creditsUsed]);

  // ── Content Quality Score ──
  const contentQuality = useMemo((): ContentQualityScore | null => {
    if (!activeBlock?.body || activeBlock.body.length < 20) return null;
    const body = activeBlock.body;
    const subject = activeBlock.subject || '';

    const hasPersonalization = /\{\{.+?\}\}/.test(body);
    const subjectHasPersonalization = /\{\{.+?\}\}/.test(subject);
    const hasCTA = /\b(book|schedule|call|demo|try|start|click|learn|reserve|sign up|register|download|get)\b/i.test(body);
    const hasQuestion = body.includes('?');
    const hasNumbers = /\d+%?/.test(body);
    const hasSocialProof = /\b(used by|trusted by|join|companies|customers|clients|teams)\b/i.test(body);
    const words = body.split(/\s+/).filter(Boolean).length;

    let personalization = 30;
    if (hasPersonalization) personalization += 30;
    if (subjectHasPersonalization) personalization += 20;
    if (/\{\{company\}\}/.test(body)) personalization += 10;
    if (/\{\{industry\}\}/.test(body)) personalization += 10;

    let engagement = 20;
    if (hasQuestion) engagement += 20;
    if (hasSocialProof) engagement += 20;
    if (hasNumbers) engagement += 15;
    if (body.includes('P.S.') || body.includes('p.s.')) engagement += 10;
    if (words > 50 && words < 200) engagement += 15;

    let clarity = 40;
    const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentLen = sentences.length > 0 ? words / sentences.length : words;
    if (avgSentLen < 20) clarity += 30;
    else if (avgSentLen < 30) clarity += 15;
    if (body.includes('\n\n')) clarity += 15;
    if (/[•\-\*]\s/.test(body)) clarity += 15;

    let ctaStrength = 10;
    if (hasCTA) ctaStrength += 35;
    if (/\[.+?\]/.test(body)) ctaStrength += 25;
    if (/\bfree\b/i.test(body)) ctaStrength += 15;
    if (/\btoday\b|\bnow\b|\bthis week\b/i.test(body)) ctaStrength += 15;

    let readability = 50;
    if (avgSentLen < 15) readability += 30;
    else if (avgSentLen < 25) readability += 20;
    const longWords = body.split(/\s+/).filter(w => w.length > 12).length;
    if (longWords < 3) readability += 20;

    const scores = {
      personalization: Math.min(personalization, 100),
      engagement: Math.min(engagement, 100),
      clarity: Math.min(clarity, 100),
      ctaStrength: Math.min(ctaStrength, 100),
      readability: Math.min(readability, 100),
    };
    const overall = Math.round(Object.values(scores).reduce((a, v) => a + v, 0) / 5);

    return { overall, ...scores };
  }, [activeBlock?.body, activeBlock?.subject]);

  // ── Writing Metrics ──
  const writingMetrics = useMemo((): WritingMetrics | null => {
    if (!activeBlock?.body || activeBlock.body.length < 10) return null;
    const body = activeBlock.body;
    const words = body.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const minutes = Math.ceil(wordCount / 200);
    const readingTime = minutes < 1 ? '< 1 min' : `${minutes} min`;
    const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const avgSentenceLength = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;

    let grade = 'Easy';
    let score = 80;
    if (avgSentenceLength > 25) { grade = 'Complex'; score = 40; }
    else if (avgSentenceLength > 18) { grade = 'Moderate'; score = 60; }
    else if (avgSentenceLength > 12) { grade = 'Clear'; score = 75; }
    else { grade = 'Simple'; score = 90; }

    return { wordCount, readingTime, sentenceCount, avgSentenceLength, readabilityGrade: grade, readabilityScore: score };
  }, [activeBlock?.body]);

  // ── Tone Analysis ──
  const toneAnalysis = useMemo((): ToneBreakdown[] => {
    if (!activeBlock?.body || activeBlock.body.length < 20) return [];
    const body = activeBlock.body.toLowerCase();

    const professional = /\b(regarding|furthermore|accordingly|therefore|hereby|pursuant|facilitate)\b/i.test(body) ? 70 : 35;
    const friendly = /\b(hi|hey|thanks|awesome|great|love|happy|glad|cheers)\b/i.test(body) ? 75 : 30;
    const urgent = /\b(now|today|limited|hurry|fast|quick|immediately|asap|deadline|last chance)\b/i.test(body) ? 80 : 20;
    const empathetic = /\b(understand|care|support|help|feel|concern|worry|struggle)\b/i.test(body) ? 70 : 25;
    const datadriven = /\d+%|\b(data|metric|analytics|report|statistics|results|performance)\b/i.test(body) ? 75 : 20;

    return [
      { label: 'Professional', value: Math.min(professional, 100), color: 'indigo' },
      { label: 'Friendly', value: Math.min(friendly, 100), color: 'emerald' },
      { label: 'Urgent', value: Math.min(urgent, 100), color: 'rose' },
      { label: 'Empathetic', value: Math.min(empathetic, 100), color: 'violet' },
      { label: 'Data-Driven', value: Math.min(datadriven, 100), color: 'amber' },
    ];
  }, [activeBlock?.body]);

  // ── Calendar Entries ──
  const calendarEntries = useMemo((): CalendarEntry[] => {
    return performanceData.map(p => ({
      date: new Date(p.sentAt).toISOString().split('T')[0],
      title: p.title,
      type: p.type,
      status: p.status,
    }));
  }, [performanceData]);

  // ── Handlers ──
  const toggleSegment = (id: string) => {
    setSelectedSegments(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    setExcludedLeadIds(new Set());
    setExpandedLeadId(null);
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
    if (selectedLeads.length === 0 && leads.length === 0) {
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

    const representative = selectedLeads[0] || leads[0];
    const enabledTags = Object.entries(personalization).filter(([, v]) => v).map(([k]) => k);
    const goalLabel = GOAL_OPTIONS.find(g => g.id === goal)?.label || goal;
    const contextParts = [
      `Goal: ${goalLabel}`,
      `Focus: ${focus}`,
      `Length: ${length}`,
      `Personalization: ${enabledTags.join(', ')}`,
      `Target audience: ${selectedSegments.join(', ')} (${selectedLeads.length} leads)`,
    ];
    if (customContext) contextParts.push(`Products/Services: ${customContext}`);
    if (keyDifferentiator) contextParts.push(`Key Differentiator: ${keyDifferentiator}`);
    if (competitorContext) contextParts.push(`Competitors: ${competitorContext}`);

    try {
      const creditType = contentType === ContentCategory.EMAIL_SEQUENCE ? 'email_sequence' : 'content_generation';
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS[creditType]);
      if (!creditResult.success) {
        setError(creditResult.message || 'Insufficient credits.');
        setIsGenerating(false);
        setWizardStep(2);
        return;
      }

      if (contentType === ContentCategory.EMAIL_SEQUENCE) {
        const config: EmailSequenceConfig = {
          audienceLeadIds: selectedLeads.map(l => l.id),
          goal: CONTENT_GOAL_TO_SEQ_GOAL[goal] || FOCUS_TO_GOAL[focus],
          sequenceLength: LENGTH_TO_COUNT[length],
          cadence: 'every_2_days',
          tone,
        };
        const response = await generateEmailSequence(selectedLeads.length > 0 ? selectedLeads : leads.slice(0, 5), config, user.businessProfile);
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
        const aiResponse = await generateContentByCategory(representative, contentType, tone, contextParts.join('. '), user.businessProfile);
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
        details: `Generated ${contentType} for ${selectedLeads.length} leads. Goal: ${goalLabel}, Tone: ${tone}, Focus: ${focus}.`,
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
    } catch (err: unknown) {
      if (generationRef.current) clearTimeout(generationRef.current);
      setError(err instanceof Error ? err.message : 'Generation failed.');
      setIsGenerating(false);
      setWizardStep(2);
    }
  };

  const handleSave = () => {
    try { localStorage.setItem(`aura_studio_draft_${user.id}`, JSON.stringify({ contentType, blocks, tone, focus, length, goal })); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const downloadAll = async (format: 'txt' | 'pdf' = 'txt') => {
    setShowDownloadMenu(false);
    if (format === 'pdf') {
      await generateEmailSequencePdf(blocks.map(b => ({ title: b.title, subject: b.subject, body: b.body })));
      return;
    }
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
    // Pre-flight limit check for email sends
    if (contentType === ContentCategory.EMAIL_SEQUENCE && selectedLeads.length > 0 && schedule.mode === 'now') {
      const inboxId = connectedProvider?.from_email ?? 'default';
      const allowed = await checkEmailLimit(inboxId);
      if (!allowed) return;
    }

    setDeliveryConfirmed(true);

    if (contentType === ContentCategory.EMAIL_SEQUENCE && selectedLeads.length > 0 && blocks.length > 0) {
      const eligibleLeads = selectedLeads
        .filter(l => l.email)
        .map(l => ({ id: l.id, email: l.email, name: l.name, company: l.company, insights: l.insights, score: l.score, status: l.status, lastActivity: l.lastActivity }));

      if (eligibleLeads.length > 0) {
        const sequenceId = `seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        if (schedule.mode === 'now') {
          // Send first block immediately
          setDeliveryProgress({ current: 1, total: blocks.length });
          const firstBlock = blocks[0];
          const footer = buildEmailFooter(user.businessProfile);
          const htmlBody = buildHtmlBody(firstBlock.body, footer);
          const result = await sendTrackedEmailBatch(
            eligibleLeads,
            firstBlock.subject,
            htmlBody,
            { trackOpens: true, trackClicks: true, provider: connectedProvider?.provider as EmailProvider, fromName: connectedProvider?.from_name }
          );
          console.log(`Email delivery block 1: ${result.sent} sent, ${result.failed} failed`, result.errors);

          // Mode B: Auto-mark New leads as Contacted if preference is enabled
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

          // Record block 0 in scheduled_emails for campaign history tracking
          const now = new Date().toISOString();
          const trackingRows = eligibleLeads.map(lead => ({
            owner_id: user.id,
            lead_id: lead.id,
            to_email: lead.email,
            subject: firstBlock.subject
              .replace(/\{\{first_name\}\}/gi, lead.name.split(' ')[0] || '')
              .replace(/\{\{name\}\}/gi, lead.name)
              .replace(/\{\{company\}\}/gi, lead.company || '')
              .replace(/\{\{ai_insight\}\}/gi, lead.insights || '')
              .replace(/\{\{insights\}\}/gi, lead.insights || '')
              .replace(/\{\{your_name\}\}/gi, connectedProvider?.from_name || '')
              .replace(/\{\{[a-z_]+\}\}/gi, ''),
            html_body: htmlBody,
            scheduled_at: now,
            block_index: 0,
            sequence_id: sequenceId,
            status: 'sent',
            sent_at: now,
            from_email: connectedProvider?.from_email ?? null,
            provider: connectedProvider?.provider ?? null,
          }));
          await supabase.from('scheduled_emails').insert(trackingRows);

          // Schedule remaining blocks
          for (let i = 1; i < blocks.length; i++) {
            setDeliveryProgress({ current: i + 1, total: blocks.length });
            const block = blocks[i];
            const delayDays = extractDelayDays(block.title, i);
            const scheduledAt = new Date();
            scheduledAt.setDate(scheduledAt.getDate() + delayDays);

            const htmlBody = buildHtmlBody(block.body, footer);
            await scheduleEmailBlock({
              leads: eligibleLeads,
              subject: block.subject,
              htmlBody,
              scheduledAt,
              blockIndex: i,
              sequenceId,
              fromEmail: connectedProvider?.from_email,
              fromName: connectedProvider?.from_name,
              provider: connectedProvider?.provider,
            });
          }
          setDeliveryProgress(null);

        } else if (schedule.mode === 'scheduled') {
          // Schedule ALL blocks relative to the base date
          const baseDate = new Date(`${schedule.date}T${schedule.time}`);
          const scheduledFooter = buildEmailFooter(user.businessProfile);
          for (let i = 0; i < blocks.length; i++) {
            setDeliveryProgress({ current: i + 1, total: blocks.length });
            const block = blocks[i];
            const delayDays = extractDelayDays(block.title, i);
            const scheduledAt = new Date(baseDate.getTime() + delayDays * 86400000);

            const htmlBody = buildHtmlBody(block.body, scheduledFooter);
            await scheduleEmailBlock({
              leads: eligibleLeads,
              subject: block.subject,
              htmlBody,
              scheduledAt,
              blockIndex: i,
              sequenceId,
              fromEmail: connectedProvider?.from_email,
              fromName: connectedProvider?.from_name,
              provider: connectedProvider?.provider,
            });
          }
          setDeliveryProgress(null);
        }
        // draft mode: no sending or scheduling
      }
    }

    // Log delivery to audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: schedule.mode === 'now' ? 'CONTENT_SENT' : schedule.mode === 'scheduled' ? 'CONTENT_SCHEDULED' : 'CONTENT_DRAFT_SAVED',
      details: `${contentType}: ${blocks.length} blocks. Mode: ${schedule.mode}. Recipients: ${selectedLeads.length} leads.${schedule.mode === 'scheduled' ? ` Scheduled: ${schedule.date} ${schedule.time}` : ''}`,
    });
    handleSave();
    setTimeout(() => setDeliveryConfirmed(false), 3000);
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim() || !activeBlock || testEmailSending) return;
    setTestEmailSending(true);
    setTestEmailResult(null);
    try {
      const footer = buildEmailFooter(user.businessProfile);
      const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">${activeBlock.body.split('\n').map(l => l.trim() ? `<p style="margin:0 0 12px;">${l}</p>` : '').join('')}${footer}</div>`;
      const result = await sendTrackedEmail({
        toEmail: testEmailAddress.trim(),
        subject: activeBlock.subject || 'Test Email',
        htmlBody,
        leadId: undefined,
        trackOpens: true,
        trackClicks: true,
        provider: connectedProvider?.provider as EmailProvider,
      });
      setTestEmailResult({ success: result.success, error: result.error });
    } catch (err) {
      setTestEmailResult({ success: false, error: err instanceof Error ? err.message : 'Failed to send test email' });
    }
    setTestEmailSending(false);
  };

  // ── Prompt Library ──
  const handleSaveCustomPrompt = useCallback((label: string) => {
    if (!activeBlock?.body) return;
    const newPrompt: CustomPrompt = {
      id: `prompt-${Date.now()}`,
      label,
      prompt: activeBlock.body.slice(0, 200),
      category: contentType,
      usedCount: 0,
      createdAt: new Date(),
    };
    setCustomPrompts(prev => [newPrompt, ...prev].slice(0, 15));
    // Persist
    try {
      const stored = JSON.parse(localStorage.getItem('aura_custom_prompts') || '[]');
      localStorage.setItem('aura_custom_prompts', JSON.stringify([newPrompt, ...stored].slice(0, 15)));
    } catch {}
  }, [activeBlock?.body, contentType]);

  // ── Content History (version snapshots) ──
  const snapshotContent = useCallback(() => {
    if (blocks.length === 0) return;
    const snapshot = {
      id: `snap-${Date.now()}`,
      timestamp: new Date(),
      blocks: JSON.parse(JSON.stringify(blocks)),
      label: `v${contentHistory.length + 1} — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    };
    setContentHistory(prev => [snapshot, ...prev].slice(0, 10));
  }, [blocks, contentHistory.length]);

  const restoreSnapshot = useCallback((snapId: string) => {
    const snap = contentHistory.find(s => s.id === snapId);
    if (snap) {
      snapshotContent(); // save current before restoring
      setBlocks(snap.blocks);
      setActiveBlockIdx(0);
    }
  }, [contentHistory, snapshotContent]);

  // ── Load saved draft on mount (user-scoped, stay on Step 1) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`aura_studio_draft_${user.id}`);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.blocks?.length > 0) {
          setBlocks(draft.blocks);
          if (draft.contentType) setContentType(draft.contentType);
          if (draft.tone) setTone(draft.tone);
          if (draft.focus) setFocus(draft.focus);
          if (draft.length) setLength(draft.length);
          if (draft.goal) setGoal(draft.goal);
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

  // Load custom prompts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('aura_custom_prompts');
      if (stored) setCustomPrompts(JSON.parse(stored));
    } catch {}
  }, []);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Ctrl+S → Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      // Ctrl+G → Generate (only from step 2)
      if ((e.ctrlKey || e.metaKey) && e.key === 'g' && wizardStep === 2) {
        e.preventDefault();
        runGeneration();
        return;
      }
      // Ctrl+P → Preview
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && blocks.length > 0) {
        e.preventDefault();
        setShowPreview(prev => !prev);
        return;
      }

      if (isInput || showPreview) return;

      // ? → Shortcuts modal
      if (e.key === '?' && !showShortcuts) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
      // Escape → close modals
      if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        if (showPromptLibrary) setShowPromptLibrary(false);
        if (showCalendar) setShowCalendar(false);
        return;
      }
      // 1-5 → wizard steps
      if (/^[1-5]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        const step = parseInt(e.key) as WizardStep;
        if (step <= wizardStep || (step === 4 && blocks.length > 0)) {
          e.preventDefault();
          setWizardStep(step);
        }
        return;
      }
      // p → prompt library
      if (e.key === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowPromptLibrary(prev => !prev);
        return;
      }
      // c → calendar
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowCalendar(prev => !prev);
        return;
      }
      // w → toggle writing assistant (step 4)
      if (e.key === 'w' && wizardStep === 4) {
        e.preventDefault();
        setShowWritingAssistant(prev => !prev);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, blocks.length, showShortcuts, showPromptLibrary, showCalendar, showPreview]);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  const typeInfo = CONTENT_TYPES.find(t => t.id === contentType);
  const TypeIcon = typeInfo?.icon || SparklesIcon;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ═══ HEADER BAR ═══ */}
      <PageHeader
        title="Campaigns"
        description={`${selectedLeads.length} leads targeted · ${(creditsTotal - creditsUsed).toLocaleString()} credits left · Step ${wizardStep}: ${WIZARD_STEPS[wizardStep - 1].label}`}
        actions={
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
              saved ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'
            }`}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        }
        advancedActions={
          <>
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center space-x-1.5 ${
                showCalendar ? 'bg-violet-50 border-violet-200 text-violet-600' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setShowPromptLibrary(!showPromptLibrary)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center space-x-1.5 ${
                showPromptLibrary ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-200'
              }`}
            >
              <LayersIcon className="w-3.5 h-3.5" />
              <span>Prompts</span>
            </button>
            <button
              onClick={() => { setShowPerformance(!showPerformance); if (!showPerformance) setShowCampaignHistory(false); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center space-x-1.5 ${
                showPerformance ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'
              }`}
            >
              <ChartIcon className="w-3.5 h-3.5" />
              <span>Performance</span>
            </button>
            <button
              onClick={() => { setShowCampaignHistory(!showCampaignHistory); if (!showCampaignHistory) { setShowPerformance(false); setSelectedCampaignId(null); } }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center space-x-1.5 ${
                showCampaignHistory ? 'bg-violet-50 border-violet-200 text-violet-600' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-200'
              }`}
            >
              <SendIcon className="w-3.5 h-3.5" />
              <span>Campaigns</span>
            </button>
            <button
              onClick={() => setShowImageGen(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              title="Generate Image"
            >
              <CameraIcon className="w-3.5 h-3.5" />
              <span>Generate Image</span>
            </button>
            {blocks.length > 0 && (
              <div className="relative">
                <button onClick={() => setShowDownloadMenu(prev => !prev)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" title="Download">
                  <DownloadIcon className="w-4 h-4" />
                </button>
                {showDownloadMenu && (
                  <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-40 py-1">
                    <button onClick={() => downloadAll('txt')} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Export as TXT</button>
                    <button onClick={() => downloadAll('pdf')} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Export as PDF</button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              title="Keyboard shortcuts"
            >
              <KeyboardIcon className="w-4 h-4" />
            </button>
          </>
        }
      />

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

      {/* ═══ KPI STATS BANNER ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Generated', value: kpiStats.totalGenerated, icon: <SparklesIcon className="w-4 h-4" />, color: 'indigo', trend: kpiStats.totalGenerated > 5 ? 'up' : null },
          { label: 'Active Sequences', value: kpiStats.activeSequences, icon: <ActivityIcon className="w-4 h-4" />, color: 'violet', trend: null },
          { label: 'Avg Open Rate', value: `${kpiStats.avgOpenRate}%`, icon: <EyeIcon className="w-4 h-4" />, color: 'emerald', trend: kpiStats.avgOpenRate > 30 ? 'up' : 'down' },
          { label: 'Best Type', value: kpiStats.bestType, icon: <StarIcon className="w-4 h-4" />, color: 'amber', trend: null },
          { label: 'Credits Left', value: kpiStats.creditsRemaining.toLocaleString(), icon: <BoltIcon className="w-4 h-4" />, color: 'blue', trend: null },
          { label: 'AI Accuracy', value: `${kpiStats.aiAccuracy}%`, icon: <BrainIcon className="w-4 h-4" />, color: 'rose', trend: kpiStats.aiAccuracy > 80 ? 'up' : null },
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

      {/* ═══ CONTENT CALENDAR MINI ═══ */}
      <AdvancedOnly>
      {showCalendar && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CalendarIcon className="w-4 h-4 text-violet-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Content Calendar — This Week</p>
            </div>
            <button onClick={() => setShowCalendar(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {(() => {
              const today = new Date();
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - today.getDay());
              return Array.from({ length: 7 }, (_, i) => {
                const day = new Date(startOfWeek);
                day.setDate(startOfWeek.getDate() + i);
                const dateStr = day.toISOString().split('T')[0];
                const entries = calendarEntries.filter(e => e.date === dateStr);
                const isToday = dateStr === today.toISOString().split('T')[0];
                return (
                  <div key={i} className={`p-3 rounded-xl border text-center min-h-[80px] ${isToday ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </p>
                    <p className={`text-sm font-black mb-1.5 ${isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {day.getDate()}
                    </p>
                    {entries.map((entry, ei) => (
                      <div key={ei} className={`px-1.5 py-0.5 rounded text-[8px] font-bold mb-0.5 truncate ${
                        entry.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                        entry.status === 'scheduled' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-200 text-slate-600'
                      }`}>
                        {entry.title.slice(0, 12)}
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center space-x-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[9px] font-bold text-slate-400">Sent</span></div>
            <div className="flex items-center space-x-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[9px] font-bold text-slate-400">Scheduled</span></div>
            <div className="flex items-center space-x-1.5"><div className="w-2 h-2 rounded-full bg-slate-400" /><span className="text-[9px] font-bold text-slate-400">Draft</span></div>
          </div>
        </div>
      )}

      {/* ═══ PROMPT LIBRARY PANEL ═══ */}
      {showPromptLibrary && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <LayersIcon className="w-4 h-4 text-amber-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prompt Library</p>
              <span className="text-[9px] bg-amber-50 text-amber-600 font-black px-2 py-0.5 rounded-lg">{customPrompts.length} saved</span>
            </div>
            <div className="flex items-center space-x-2">
              {activeBlock?.body && (
                <button
                  onClick={() => {
                    const label = `${contentType} — ${new Date().toLocaleDateString()}`;
                    handleSaveCustomPrompt(label);
                  }}
                  className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold hover:bg-amber-100 transition-colors flex items-center space-x-1"
                >
                  <PlusIcon className="w-3 h-3" />
                  <span>Save Current</span>
                </button>
              )}
              <button onClick={() => setShowPromptLibrary(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          {customPrompts.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {customPrompts.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (blocks.length > 0 && activeBlock) {
                      updateBlock('body', p.prompt);
                    }
                  }}
                  className="text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100">
                      {CONTENT_TYPES.find(t => t.id === p.category)?.label || p.category}
                    </span>
                    <TagIcon className="w-3 h-3 text-slate-300 group-hover:text-amber-400 transition-colors" />
                  </div>
                  <p className="text-xs font-bold text-slate-700 mb-1 truncate">{p.label}</p>
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{p.prompt}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <LayersIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-400 mb-1">No saved prompts yet</p>
              <p className="text-[10px] text-slate-300">Generate content first, then save your best prompts for reuse</p>
            </div>
          )}
        </div>
      )}
      </AdvancedOnly>

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
                    {/* Business Profile Banner */}
                    {!hasBusinessProfile && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                            <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
                          </div>
                          <div className="flex-grow min-w-0">
                            <p className="text-xs font-bold text-amber-800 mb-0.5">Set up your Business Profile for smarter AI content</p>
                            <p className="text-[10px] text-amber-600 leading-relaxed mb-2">AI generates better content when it knows your business. Add your company, services, and value proposition.</p>
                            <button
                              onClick={() => navigate('/portal/settings?tab=business_profile')}
                              className="text-[11px] font-bold text-amber-700 hover:text-amber-900 transition-colors"
                            >
                              Set Up Business Profile &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

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
                        <div className="mt-3 bg-slate-50 rounded-xl border border-slate-100 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recipients</p>
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                {selectedLeads.filter(l => l.email).length} / {selectedLeads.length} selected
                              </span>
                              <button
                                onClick={() => {
                                  if (excludedLeadIds.size === 0) {
                                    setExcludedLeadIds(new Set(targetLeads.map(l => l.id)));
                                  } else {
                                    setExcludedLeadIds(new Set());
                                  }
                                }}
                                className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
                              >
                                {excludedLeadIds.size === 0 ? 'Deselect all' : 'Select all'}
                              </button>
                            </div>
                          </div>
                          <div className="max-h-64 overflow-y-auto space-y-0 divide-y divide-slate-100">
                            {targetLeads.map(lead => {
                              const isChecked = !excludedLeadIds.has(lead.id);
                              const isExpanded = expandedLeadId === lead.id;
                              return (
                                <div key={lead.id} className="py-1.5 first:pt-0 last:pb-0">
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setExcludedLeadIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(lead.id)) next.delete(lead.id);
                                          else next.add(lead.id);
                                          return next;
                                        });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                                    />
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${
                                      lead.email && isChecked ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'
                                    }`}>
                                      {lead.name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <button
                                      onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}
                                      className="min-w-0 flex-1 text-left"
                                    >
                                      <p className={`text-[11px] font-bold truncate ${isChecked ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{lead.name}</p>
                                      <p className="text-[9px] text-slate-400 truncate">
                                        {lead.email || <span className="text-amber-500 italic">No email</span>}
                                        {lead.company && <span className="text-slate-300"> &middot; {lead.company}</span>}
                                      </p>
                                    </button>
                                    <button
                                      onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}
                                      className="shrink-0 p-0.5"
                                    >
                                      <ChevronDownIcon className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>
                                  {isExpanded && (
                                    <div className="ml-12 mt-1.5 mb-1 p-2.5 bg-white rounded-lg border border-slate-100 space-y-1.5">
                                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                        <div>
                                          <p className="text-[8px] font-bold text-slate-400 uppercase">Score</p>
                                          <p className="text-[11px] font-bold text-slate-700">{lead.score}/100</p>
                                        </div>
                                        <div>
                                          <p className="text-[8px] font-bold text-slate-400 uppercase">Status</p>
                                          <p className="text-[11px] font-bold text-slate-700">{lead.status}</p>
                                        </div>
                                        {lead.source && (
                                          <div>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase">Source</p>
                                            <p className="text-[11px] font-bold text-slate-700">{lead.source}</p>
                                          </div>
                                        )}
                                        {lead.lastActivity && (
                                          <div>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase">Last Activity</p>
                                            <p className="text-[11px] font-bold text-slate-700">{lead.lastActivity}</p>
                                          </div>
                                        )}
                                      </div>
                                      {lead.insights && (
                                        <div>
                                          <p className="text-[8px] font-bold text-slate-400 uppercase">Insights</p>
                                          <p className="text-[10px] text-slate-600">{lead.insights}</p>
                                        </div>
                                      )}
                                      {lead.knowledgeBase && (
                                        <div>
                                          <p className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Knowledge Base</p>
                                          <div className="space-y-0.5">
                                            {lead.knowledgeBase.website && <p className="text-[10px] text-indigo-600 truncate">{lead.knowledgeBase.website}</p>}
                                            {lead.knowledgeBase.linkedin && <p className="text-[10px] text-indigo-600 truncate">{lead.knowledgeBase.linkedin}</p>}
                                            {lead.knowledgeBase.extraNotes && <p className="text-[10px] text-slate-500">{lead.knowledgeBase.extraNotes}</p>}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {targetLeads.some(l => !l.email && !excludedLeadIds.has(l.id)) && (
                            <div className="flex items-center space-x-1.5 mt-2 pt-2 border-t border-slate-100">
                              <AlertTriangleIcon className="w-3 h-3 text-amber-500 shrink-0" />
                              <p className="text-[9px] text-amber-600 font-medium">
                                {selectedLeads.filter(l => !l.email).length} lead{selectedLeads.filter(l => !l.email).length > 1 ? 's' : ''} without email will be skipped
                              </p>
                            </div>
                          )}
                        </div>
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

                    {/* No leads warning */}
                    {leads.length > 0 && selectedLeads.length === 0 && (
                      <div className="flex items-center space-x-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                        <p className="text-xs font-bold text-amber-700">No leads selected. Select at least one segment or lead to continue.</p>
                      </div>
                    )}
                    {leads.length === 0 && !loadingLeads && (
                      <div className="flex items-center space-x-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                        <p className="text-xs font-bold text-amber-700">No leads available. Add leads first.</p>
                      </div>
                    )}

                    {/* Next Button */}
                    <button
                      onClick={() => setWizardStep(2)}
                      disabled={selectedLeads.length === 0}
                      className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 active:scale-95 ${
                        selectedLeads.length === 0
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-100/50'
                      }`}
                    >
                      <span>Next: Set Parameters</span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* STEP 2: AI CONTENT SETTINGS */}
                {wizardStep === 2 && (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-1">
                      <div className="flex items-center space-x-2">
                        <SparklesIcon className="w-4 h-4 text-indigo-600" />
                        <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">AI Content Settings</p>
                      </div>
                      <button
                        onClick={() => setWizardStep(1)}
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all"
                      >
                        <ArrowLeftIcon className="w-3 h-3" />
                        <span>Back</span>
                      </button>
                    </div>

                    {/* GOAL */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">1</span>
                        <span>Goal — What do you want to achieve?</span>
                      </p>
                      <select
                        value={goal}
                        onChange={e => setGoal(e.target.value as ContentGoal)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                      >
                        {GOAL_OPTIONS.map(g => (
                          <option key={g.id} value={g.id}>{g.icon} {g.label}</option>
                        ))}
                      </select>
                      {(() => {
                        const selected = GOAL_OPTIONS.find(g => g.id === goal);
                        return selected ? (
                          <p className="text-[10px] text-slate-400 mt-1.5 pl-1">{selected.desc}</p>
                        ) : null;
                      })()}
                    </div>

                    {/* TONE */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">2</span>
                        <span>Tone — How should it sound?</span>
                      </p>
                      <select
                        value={tone}
                        onChange={e => setTone(e.target.value as ToneType)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                      >
                        {TONE_OPTIONS.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      {(() => {
                        const selected = TONE_OPTIONS.find(t => t.id === tone);
                        return selected ? (
                          <p className="text-[10px] text-slate-400 mt-1.5 pl-1">{selected.desc}</p>
                        ) : null;
                      })()}
                    </div>

                    {/* LENGTH */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">3</span>
                        <span>Length — How detailed?</span>
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {LENGTH_OPTIONS.map(l => (
                          <button
                            key={l}
                            onClick={() => setLength(l)}
                            className={`p-2.5 rounded-xl text-center border-2 transition-all ${
                              length === l
                                ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                                : 'border-slate-200 hover:border-indigo-200'
                            }`}
                          >
                            <p className={`text-xs font-black ${length === l ? 'text-indigo-700' : 'text-slate-700'}`}>{l}</p>
                            <p className={`text-[9px] mt-0.5 ${length === l ? 'text-indigo-500' : 'text-slate-400'}`}>
                              {LENGTH_DETAILS[l].emails}
                            </p>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5 pl-1">{LENGTH_DETAILS[length].desc}</p>
                    </div>

                    {/* FOCUS (Advanced) */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">4</span>
                        <span>Approach — Content structure</span>
                      </p>
                      <select value={focus} onChange={e => setFocus(e.target.value as ContentFocus)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none">
                        {FOCUS_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>

                    {/* PERSONALIZATION */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">5</span>
                        <span>Personalization</span>
                      </p>
                      <div className="space-y-1.5">
                        {PERSONALIZATION_OPTIONS.map(opt => {
                          const active = !!personalization[opt.id];
                          return (
                            <button
                              key={opt.id}
                              onClick={() => togglePersonalization(opt.id)}
                              className={`w-full flex items-center space-x-2.5 p-2.5 rounded-xl text-left transition-all ${
                                active ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50 border border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                                active ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                              }`}>
                                {active && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="text-sm shrink-0">{opt.icon}</span>
                              <div className="min-w-0">
                                <p className={`text-[11px] font-bold ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{opt.label}</p>
                                <p className="text-[9px] text-slate-400">{opt.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* BUSINESS BRIEF */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center space-x-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center text-[10px] font-black">6</span>
                        <span>Business Brief — Help AI understand your offering</span>
                      </p>
                      {hasBusinessProfile && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold border border-emerald-100 mb-2">Auto-filled from Business Profile</span>
                      )}
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Key Differentiator</label>
                          <textarea
                            value={keyDifferentiator}
                            onChange={e => setKeyDifferentiator(e.target.value)}
                            placeholder="What makes your product/service unique?"
                            rows={2}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Additional Context</label>
                          <textarea
                            value={customContext}
                            onChange={e => setCustomContext(e.target.value)}
                            placeholder="Specific products, features, or pain points to highlight..."
                            rows={2}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Competitor Context</label>
                          <input
                            value={competitorContext}
                            onChange={e => setCompetitorContext(e.target.value)}
                            placeholder="Who are you competing against? (optional)"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-bold text-center">
                        {error}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── EDITOR (Step 4: Full Width / Steps 1-2: Right 70%) ─── */}
          <div className={wizardStep === 4 ? 'w-full' : 'lg:w-[70%]'}>
            {wizardStep === 4 ? (
              <div className="flex flex-col lg:flex-row gap-6">
              {/* Main Editor Column */}
              <div className={`space-y-6 ${showWritingAssistant && blocks.length > 0 ? 'lg:w-[70%]' : 'w-full'}`}>
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
                          <button
                            onClick={() => setShowCtaBuilder(true)}
                            className="flex items-center space-x-1 px-2 py-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors text-[10px] font-bold"
                            title="Add CTA Button"
                          >
                            <CursorClickIcon className="w-3.5 h-3.5" />
                            <span>CTA</span>
                          </button>
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
                          <button
                            onClick={() => navigate('/portal/social-scheduler', { state: { content: activeBlock.body } })}
                            className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Post to Social Scheduler"
                          >
                            <SendIcon className="w-4 h-4" />
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
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-slate-400">Words: {activeBlock.body.split(/\s+/).filter(Boolean).length}</span>
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

                      {/* Attached Images */}
                      {emailImages.length > 0 && (
                        <div>
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
                          <p className="text-[10px] text-slate-400 mt-1">These images will be included at the top of your email.</p>
                        </div>
                      )}

                      {/* AI Suggestions */}
                      {aiSuggestions.length > 0 && (
                        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                            <TargetIcon className="w-3.5 h-3.5" />
                            <span>AI Suggestions</span>
                          </p>
                          <div className="space-y-2">
                            {aiSuggestions.map((s, i) => (
                              <div key={i} className="flex items-center space-x-2 group">
                                <span className="text-sm shrink-0">{s.icon}</span>
                                <p className="text-xs text-slate-600 leading-relaxed flex-1">{s.text}</p>
                                {s.apply && (
                                  <button
                                    onClick={() => {
                                      if (activeBlock && s.apply) {
                                        updateBlock('body', s.apply(activeBlock.body));
                                      }
                                    }}
                                    className="shrink-0 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-200 transition-all opacity-70 group-hover:opacity-100"
                                  >
                                    Apply
                                  </button>
                                )}
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
                        onClick={() => { snapshotContent(); }}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:border-violet-200 hover:text-violet-600 transition-all"
                        title="Save version snapshot"
                      >
                        <GridIcon className="w-3.5 h-3.5" />
                        <span>Snapshot</span>
                      </button>
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

              {/* ═══ WRITING ASSISTANT SIDEBAR ═══ */}
              <AdvancedOnly>
              {showWritingAssistant && blocks.length > 0 && (
                <div className="lg:w-[30%] shrink-0 space-y-4 animate-in fade-in duration-300">
                  {/* Toggle */}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                      <BrainIcon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Writing Assistant</span>
                    </p>
                    <button onClick={() => setShowWritingAssistant(false)} className="p-1 text-slate-300 hover:text-slate-500 transition-colors">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content Quality Score */}
                  {contentQuality && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quality Score</p>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${
                          contentQuality.overall >= 80 ? 'bg-emerald-50 text-emerald-600' :
                          contentQuality.overall >= 60 ? 'bg-amber-50 text-amber-600' :
                          'bg-rose-50 text-rose-600'
                        }`}>
                          {contentQuality.overall}
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {[
                          { label: 'Personalization', value: contentQuality.personalization, color: 'indigo' },
                          { label: 'Engagement', value: contentQuality.engagement, color: 'emerald' },
                          { label: 'Clarity', value: contentQuality.clarity, color: 'blue' },
                          { label: 'CTA Strength', value: contentQuality.ctaStrength, color: 'amber' },
                          { label: 'Readability', value: contentQuality.readability, color: 'violet' },
                        ].map(s => (
                          <div key={s.label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-slate-500">{s.label}</span>
                              <span className={`text-[10px] font-black text-${s.color}-600`}>{s.value}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className={`bg-${s.color}-500 h-full rounded-full transition-all duration-500`} style={{ width: `${s.value}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Writing Metrics */}
                  {writingMetrics && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Writing Metrics</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-lg font-black text-slate-900">{writingMetrics.wordCount}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Words</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-lg font-black text-slate-900">{writingMetrics.readingTime}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Read Time</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-lg font-black text-slate-900">{writingMetrics.sentenceCount}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Sentences</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-lg font-black text-slate-900">{writingMetrics.avgSentenceLength}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Avg Length</p>
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-slate-500">Readability</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                            writingMetrics.readabilityScore >= 75 ? 'bg-emerald-50 text-emerald-600' :
                            writingMetrics.readabilityScore >= 50 ? 'bg-amber-50 text-amber-600' :
                            'bg-rose-50 text-rose-600'
                          }`}>
                            {writingMetrics.readabilityGrade}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${
                            writingMetrics.readabilityScore >= 75 ? 'bg-emerald-500' :
                            writingMetrics.readabilityScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`} style={{ width: `${writingMetrics.readabilityScore}%` }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tone Analysis */}
                  {toneAnalysis.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Tone Analysis</p>
                      <div className="space-y-2.5">
                        {toneAnalysis.map(t => (
                          <div key={t.label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-slate-500">{t.label}</span>
                              <span className="text-[10px] font-black text-slate-600">{t.value}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className={`bg-${t.color}-500 h-full rounded-full transition-all duration-500`} style={{ width: `${t.value}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Version History */}
                  {contentHistory.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Version History</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {contentHistory.map(snap => (
                          <button
                            key={snap.id}
                            onClick={() => restoreSnapshot(snap.id)}
                            className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-bold text-slate-700">{snap.label}</p>
                              <span className="text-[9px] text-indigo-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Restore</span>
                            </div>
                            <p className="text-[10px] text-slate-400">{snap.blocks.length} blocks</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Quick Actions</p>
                    <div className="space-y-1.5">
                      <button
                        onClick={() => setShowWritingAssistant(false)}
                        className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-700 transition-all"
                      >
                        Hide Assistant <kbd className="ml-1 px-1 py-0.5 bg-white border border-slate-200 rounded text-[8px]">W</kbd>
                      </button>
                      <button
                        onClick={() => { snapshotContent(); }}
                        className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-700 transition-all"
                      >
                        Save Snapshot
                      </button>
                      <button
                        onClick={() => setShowPreview(true)}
                        className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-700 transition-all"
                      >
                        Preview <kbd className="ml-1 px-1 py-0.5 bg-white border border-slate-200 rounded text-[8px]">Ctrl+P</kbd>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Show assistant toggle when hidden */}
              {!showWritingAssistant && blocks.length > 0 && wizardStep === 4 && (
                <button
                  onClick={() => setShowWritingAssistant(true)}
                  className="fixed bottom-6 right-6 p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all z-30"
                  title="Show Writing Assistant (W)"
                >
                  <BrainIcon className="w-5 h-5" />
                </button>
              )}
              </AdvancedOnly>
              </div>
            ) : (
              /* Steps 1-2 Right Panel: Quick Preview / AI Config Preview */
              <div className="space-y-4">
                {/* Business Context Card */}
                {hasBusinessProfile && (wizardStep === 1 || wizardStep === 2) && (
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center space-x-2">
                        <BriefcaseIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Business Context</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-bold text-emerald-500">{profileCompleteness}/{profileTotal}</span>
                        <button
                          onClick={() => navigate('/portal/settings?tab=business_profile')}
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          Edit Profile
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {bp?.companyName && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">{bp.companyName}</span>
                      )}
                      {bp?.industry && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">{bp.industry}</span>
                      )}
                      {bp?.productsServices && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold truncate max-w-[200px]">{bp.productsServices}</span>
                      )}
                      {bp?.targetAudience && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold truncate max-w-[200px]">{bp.targetAudience}</span>
                      )}
                      {bp?.valueProp && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold truncate max-w-[200px]">{bp.valueProp}</span>
                      )}
                      {bp?.pricingModel && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">{bp.pricingModel}</span>
                      )}
                      {bp?.salesApproach && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">{bp.salesApproach}</span>
                      )}
                    </div>
                  </div>
                )}

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                {blocks.length > 0 && wizardStep === 1 ? (
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
                ) : wizardStep === 2 ? (
                  /* Step 2: Live AI Configuration Preview */
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center mb-4">
                        <SparklesIcon className="w-8 h-8 text-indigo-600" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800 mb-1">AI Configuration Preview</h3>
                      <p className="text-[11px] text-slate-400">Your content will be generated with these settings</p>
                    </div>

                    {/* Visual Config Cards */}
                    <div className="space-y-3">
                      <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm">{GOAL_OPTIONS.find(g => g.id === goal)?.icon || '🎯'}</span>
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Goal</p>
                        </div>
                        <p className="text-sm font-bold text-indigo-800">{GOAL_OPTIONS.find(g => g.id === goal)?.label}</p>
                        <p className="text-[10px] text-indigo-500 mt-0.5">{GOAL_OPTIONS.find(g => g.id === goal)?.desc}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-violet-50 rounded-2xl border border-violet-100">
                          <p className="text-[10px] font-black text-violet-500 uppercase tracking-wider mb-1">Tone</p>
                          <p className="text-xs font-bold text-violet-800">{TONE_OPTIONS.find(t => t.id === tone)?.label}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-1">Length</p>
                          <p className="text-xs font-bold text-emerald-800">{length} ({LENGTH_DETAILS[length].emails})</p>
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider mb-1.5">Approach</p>
                        <p className="text-xs font-bold text-amber-800">{focus}</p>
                      </div>

                      {hasBusinessProfile && (
                        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1">Business Context</p>
                          <p className="text-xs font-bold text-emerald-800">{bp?.companyName || 'Your Business'}</p>
                          <p className="text-[10px] text-emerald-500 mt-0.5">
                            {[bp?.industry, bp?.targetAudience].filter(Boolean).join(' · ') || 'Profile loaded'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Active Personalization Tags */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Active Personalization</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PERSONALIZATION_OPTIONS.filter(p => personalization[p.id]).map(p => (
                          <span key={p.id} className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-100">
                            <span>{p.icon}</span>
                            <span>{p.label}</span>
                          </span>
                        ))}
                        {Object.values(personalization).every(v => !v) && (
                          <span className="text-[10px] text-slate-400 italic">No personalization enabled</span>
                        )}
                      </div>
                    </div>

                    {/* Expected Output */}
                    <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl text-white">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-wider mb-2">Expected Output</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Content blocks</span>
                          <span className="text-xs font-bold text-white">{LENGTH_DETAILS[length].emails}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Target audience</span>
                          <span className="text-xs font-bold text-white">{selectedLeads.length} leads</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Personalization tokens</span>
                          <span className="text-xs font-bold text-white">{Object.values(personalization).filter(Boolean).length} active</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">AI credit cost</span>
                          <span className="text-xs font-bold text-indigo-400">1 credit</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Business context</span>
                          <span className={`text-xs font-bold ${hasBusinessProfile ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {hasBusinessProfile ? `${profileCompleteness}/${profileTotal} fields` : 'Not configured'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Generate CTA */}
                    <button
                      onClick={runGeneration}
                      disabled={isGenerating || creditsUsed >= creditsTotal}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center space-x-2 ${
                        isGenerating || creditsUsed >= creditsTotal
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95'
                      }`}
                    >
                      <SparklesIcon className="w-4 h-4" />
                      <span>Generate with AI</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-black bg-white/20 rounded-md">{CREDIT_COSTS[contentType === ContentCategory.EMAIL_SEQUENCE ? 'email_sequence' : 'content_generation']} cr</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </button>
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
            {/* Social Post: direct route to Social Scheduler */}
            {contentType === ContentCategory.SOCIAL_MEDIA && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">Post to Social Platforms</p>
                <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 mb-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                      <SendIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-indigo-900">Schedule via Social Scheduler</p>
                      <p className="text-xs text-indigo-600 mt-1">Publish or schedule your social post on Facebook, Instagram, LinkedIn, and other connected platforms.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      const content = blocks.map(b => b.body).filter(Boolean).join('\n\n');
                      navigate('/portal/social-scheduler', { state: { content } });
                    }}
                    className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    <SendIcon className="w-4 h-4" />
                    <span>Open Social Scheduler</span>
                  </button>
                  <button
                    onClick={() => {
                      const full = blocks.map(b => b.body).filter(Boolean).join('\n\n');
                      copyToClipboard(full);
                    }}
                    className="flex items-center space-x-2 px-5 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-all"
                  >
                    <CopyIcon className="w-4 h-4" />
                    <span>{copied ? 'Copied!' : 'Copy Content'}</span>
                  </button>
                </div>
              </div>
            )}

            {contentType !== ContentCategory.SOCIAL_MEDIA && (<>
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

            {/* Email Integration Warning (non-social only) */}
            {schedule.mode !== 'draft' && providerLoading && (
              <div className="flex items-center space-x-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin"></div>
                <span className="text-xs text-slate-500">Checking email integration...</span>
              </div>
            )}
            {schedule.mode !== 'draft' && !providerLoading && connectedProvider === null && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-start space-x-3">
                  <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-800">No email integration connected</p>
                    <p className="text-xs text-amber-600 mt-1">Connect an email provider (SendGrid, Gmail, SMTP, or Mailchimp) to send emails.</p>
                    <button
                      onClick={() => navigate('/portal/integrations')}
                      className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold rounded-lg transition-colors"
                    >
                      <BoltIcon className="w-3.5 h-3.5" />
                      <span>Go to Integration Hub</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Progress */}
            {deliveryProgress && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-indigo-700">
                    {schedule.mode === 'now' && deliveryProgress.current === 1
                      ? `Sending block 1 of ${deliveryProgress.total}...`
                      : `Scheduling block ${deliveryProgress.current} of ${deliveryProgress.total}...`}
                  </span>
                </div>
                <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${(deliveryProgress.current / deliveryProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

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
                disabled={deliveryConfirmed || deliveryProgress !== null || (schedule.mode !== 'draft' && connectedProvider === null)}
                className={`flex items-center space-x-2 px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 ${
                  deliveryConfirmed
                    ? 'bg-emerald-500 text-white shadow-emerald-200'
                    : (deliveryProgress || (schedule.mode !== 'draft' && connectedProvider === null))
                    ? 'bg-slate-400 text-white cursor-not-allowed'
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
            </>)}
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
                  <span className="text-xs font-bold text-slate-700">{selectedLeads.length} leads</span>
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
                {connectedProvider && (
                  <div className="flex items-center justify-between py-2 border-t border-slate-50">
                    <span className="text-xs text-slate-500">Sending from</span>
                    <span className="text-xs font-bold text-slate-700 truncate ml-2">{connectedProvider.from_email} <span className="text-slate-400 font-medium">via {connectedProvider.provider}</span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Recipients List */}
            {selectedLeads.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipients</p>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {selectedLeads.filter(l => l.email).length} / {selectedLeads.length} with email
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-0 divide-y divide-slate-50 -mx-2">
                  {selectedLeads.map(lead => (
                    <div key={lead.id} className="flex items-center space-x-3 px-2 py-2.5 hover:bg-slate-50/50 rounded-lg transition-colors">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                        lead.email ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {lead.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700 truncate">{lead.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {lead.email || <span className="text-amber-500 italic">No email</span>}
                          {lead.company && <span className="text-slate-300"> &middot; {lead.company}</span>}
                        </p>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${lead.email ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    </div>
                  ))}
                </div>
                {selectedLeads.some(l => !l.email) && (
                  <div className="flex items-center space-x-2 mt-3 p-2.5 bg-amber-50 rounded-xl">
                    <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <p className="text-[10px] text-amber-700 font-medium">
                      {selectedLeads.filter(l => !l.email).length} lead{selectedLeads.filter(l => !l.email).length > 1 ? 's' : ''} without email will be skipped
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Predicted Impact */}
            {predictions && (
              <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-3xl p-6 text-white">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-4">Predicted Impact</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-indigo-200">Expected Opens</span>
                      <span className="text-sm font-black">{Math.round(selectedLeads.length * predictions.openRate / 100)}</span>
                    </div>
                    <div className="w-full bg-indigo-800/50 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-white/80 h-full rounded-full" style={{ width: `${predictions.openRate}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-indigo-200">Expected Clicks</span>
                      <span className="text-sm font-black">{Math.round(selectedLeads.length * predictions.clickRate / 100)}</span>
                    </div>
                    <div className="w-full bg-indigo-800/50 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${predictions.clickRate * 5}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-indigo-200">Expected Responses</span>
                      <span className="text-sm font-black">{Math.round(selectedLeads.length * predictions.responseRate / 100)}</span>
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
      <AdvancedOnly>
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

          {/* Loading / Empty State */}
          {performanceLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <span className="ml-3 text-sm text-slate-500">Loading performance data...</span>
            </div>
          )}
          {!performanceLoading && performanceData.length === 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center">
              <ChartIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">No campaigns sent yet</p>
              <p className="text-xs text-slate-300 mt-1">Send your first email sequence to see real performance data here.</p>
            </div>
          )}

          {/* Aggregate Metrics */}
          {!performanceLoading && perfMetrics && (
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

      {/* ═══ CAMPAIGN HISTORY PANEL ═══ */}
      {showCampaignHistory && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {selectedCampaignId ? (
                <>
                  <button
                    onClick={() => { setSelectedCampaignId(null); setCampaignRecipients([]); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                  </button>
                  <SendIcon className="w-5 h-5 text-violet-600" />
                  <div>
                    <h2 className="text-lg font-black text-slate-900 font-heading">
                      {campaignHistory.find(c => c.sequence_id === selectedCampaignId)?.subject ?? 'Campaign Details'}
                    </h2>
                    {campaignHistory.find(c => c.sequence_id === selectedCampaignId)?.from_email && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Sent from: {campaignHistory.find(c => c.sequence_id === selectedCampaignId)!.from_email}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <SendIcon className="w-5 h-5 text-violet-600" />
                  <h2 className="text-lg font-black text-slate-900 font-heading">Campaign History</h2>
                </>
              )}
            </div>
            <button
              onClick={() => { setShowCampaignHistory(false); setSelectedCampaignId(null); }}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Loading state */}
          {(selectedCampaignId ? campaignRecipientsLoading : campaignHistoryLoading) && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
              <span className="ml-3 text-sm text-slate-500">
                {selectedCampaignId ? 'Loading recipients...' : 'Loading campaigns...'}
              </span>
            </div>
          )}

          {/* Campaign list view */}
          {!selectedCampaignId && !campaignHistoryLoading && campaignHistory.length === 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center">
              <SendIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">No campaigns sent yet</p>
              <p className="text-xs text-slate-300 mt-1">Send your first email sequence to see campaign history here.</p>
            </div>
          )}

          {!selectedCampaignId && !campaignHistoryLoading && campaignHistory.length > 0 && (
            <div className="space-y-3">
              {campaignHistory.map(campaign => {
                const total = campaign.sent_count + campaign.pending_count + campaign.failed_count;
                return (
                  <button
                    key={campaign.sequence_id}
                    onClick={() => setSelectedCampaignId(campaign.sequence_id)}
                    className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-violet-200 hover:shadow-md transition-all text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{campaign.subject}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                        {campaign.from_email && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Sent from: {campaign.from_email}</p>
                        )}
                      </div>
                      <ArrowRightIcon className="w-4 h-4 text-slate-300 ml-3 flex-shrink-0 mt-1" />
                    </div>
                    <div className="flex items-center space-x-4 mt-3">
                      <span className="text-[10px] font-bold text-slate-500">
                        {campaign.recipient_count} recipient{campaign.recipient_count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {campaign.block_count} block{campaign.block_count !== 1 ? 's' : ''}
                      </span>
                      <div className="flex items-center space-x-2 ml-auto">
                        {campaign.sent_count > 0 && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-600">
                            {campaign.sent_count} sent
                          </span>
                        )}
                        {campaign.pending_count > 0 && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-600">
                            {campaign.pending_count} pending
                          </span>
                        )}
                        {campaign.failed_count > 0 && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-50 text-rose-600">
                            {campaign.failed_count} failed
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Campaign detail / recipients view */}
          {selectedCampaignId && !campaignRecipientsLoading && (() => {
            const campaign = campaignHistory.find(c => c.sequence_id === selectedCampaignId);
            const totalSent = campaignRecipients.reduce((a, r) => a + r.blocks.filter(b => b.status === 'sent').length, 0);
            const totalPending = campaignRecipients.reduce((a, r) => a + r.blocks.filter(b => b.status === 'pending').length, 0);
            const totalFailed = campaignRecipients.reduce((a, r) => a + r.blocks.filter(b => b.status === 'failed').length, 0);
            return (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Recipients', value: campaignRecipients.length.toString(), color: 'violet' },
                    { label: 'Sent', value: totalSent.toString(), color: 'emerald' },
                    { label: 'Pending', value: totalPending.toString(), color: 'amber' },
                    { label: 'Failed', value: totalFailed.toString(), color: 'rose' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <p className="text-xl font-black text-slate-900">{s.value}</p>
                      <p className={`text-[10px] font-bold text-${s.color}-500 uppercase`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Recipients table */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipients</p>
                  </div>
                  {campaignRecipients.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-slate-400">No recipients found for this campaign.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Lead</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Company</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Email</th>
                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Delivery Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaignRecipients.map((recipient, i) => (
                            <tr key={recipient.lead_id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                              <td className="px-6 py-3">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-black flex-shrink-0">
                                    {recipient.lead_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">{recipient.lead_name}</p>
                                    <p className="text-[10px] text-slate-400">Score: {recipient.lead_score}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">{recipient.lead_company || '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-500">{recipient.lead_email}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center space-x-1.5">
                                  {recipient.blocks.map(block => (
                                    <span
                                      key={block.block_index}
                                      title={`Block ${block.block_index + 1}: ${block.status}${block.sent_at ? ` (${new Date(block.sent_at).toLocaleDateString()})` : ''}`}
                                      className={`w-3 h-3 rounded-full ${
                                        block.status === 'sent' ? 'bg-emerald-400' :
                                        block.status === 'pending' ? 'bg-amber-400' :
                                        block.status === 'failed' ? 'bg-rose-400' :
                                        'bg-slate-300'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ═══ KEYBOARD SHORTCUTS MODAL ═══ */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-500" />
                <p className="text-sm font-bold text-slate-900">Keyboard Shortcuts</p>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {[
                { category: 'Navigation', shortcuts: [
                  { keys: '1-5', desc: 'Jump to wizard step' },
                  { keys: 'P', desc: 'Toggle prompt library' },
                  { keys: 'C', desc: 'Toggle content calendar' },
                  { keys: 'W', desc: 'Toggle writing assistant (Step 4)' },
                  { keys: '?', desc: 'Show this dialog' },
                  { keys: 'Esc', desc: 'Close panels & modals' },
                ]},
                { category: 'Actions', shortcuts: [
                  { keys: 'Ctrl+S', desc: 'Save draft' },
                  { keys: 'Ctrl+G', desc: 'Generate content (Step 2)' },
                  { keys: 'Ctrl+P', desc: 'Toggle preview' },
                ]},
              ].map(group => (
                <div key={group.category}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{group.category}</p>
                  <div className="space-y-1">
                    {group.shortcuts.map(s => (
                      <div key={s.keys} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50">
                        <span className="text-xs text-slate-600">{s.desc}</span>
                        <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </AdvancedOnly>

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
                  {emailImages.length > 0 && i === 0 && (
                    <div className="mb-3 space-y-2">
                      {emailImages.map((url, imgIdx) => (
                        <img key={imgIdx} src={url} alt="" className="max-w-full rounded-xl border border-slate-200" />
                      ))}
                    </div>
                  )}
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

      {/* Image Generator Drawer */}
      {/* ═══ TEST EMAIL MODAL ═══ */}
      {showTestEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTestEmailModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MailIcon className="w-5 h-5 text-amber-500" />
                <span className="text-sm font-black text-slate-900">Send Test Email</span>
              </div>
              <button onClick={() => setShowTestEmailModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
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
                  <div className="flex items-center justify-center space-x-2 mt-4">
                    <button
                      onClick={() => setTestEmailResult(null)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                    >
                      Send Another
                    </button>
                    <button
                      onClick={() => setShowTestEmailModal(false)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Recipient Email</label>
                  <input
                    type="email"
                    value={testEmailAddress}
                    onChange={e => setTestEmailAddress(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendTestEmail(); }}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
                    autoFocus
                  />
                  {!connectedProvider && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-2">No email provider connected. Connect one in Integration Hub first.</p>
                  )}
                  <div className="flex items-center justify-end space-x-2 mt-4">
                    <button
                      onClick={() => setShowTestEmailModal(false)}
                      className="px-4 py-2.5 text-slate-500 text-xs font-bold hover:text-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendTestEmail}
                      disabled={testEmailSending || !testEmailAddress.trim() || !connectedProvider}
                      className="flex items-center space-x-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 disabled:opacity-50"
                    >
                      {testEmailSending ? (
                        <>
                          <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <SendIcon className="w-3.5 h-3.5" />
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

      <CTAButtonBuilderModal
        open={showCtaBuilder}
        onClose={() => setShowCtaBuilder(false)}
        onInsert={(html) => {
          if (activeBlock) {
            updateBlock('body', activeBlock.body + '\n\n' + html);
          }
        }}
      />
      <ImageGeneratorDrawer
        open={showImageGen}
        onClose={() => setShowImageGen(false)}
        moduleType="newsletter"
        onInsertImage={(url) => setEmailImages(prev => [...prev, url])}
        businessProfile={user.businessProfile}
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

export default ContentGen;
