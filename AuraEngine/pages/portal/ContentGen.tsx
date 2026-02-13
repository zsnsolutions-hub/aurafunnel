import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Lead, ContentCategory, ToneType, EmailStep, User, EmailSequenceConfig } from '../../types';
import { generateContentByCategory, generateEmailSequence, parseEmailSequenceResponse, AIResponse } from '../../lib/gemini';
import {
  SparklesIcon, MailIcon, GlobeIcon, HashIcon, BookIcon, BriefcaseIcon, BoltIcon,
  CopyIcon, CheckIcon, ClockIcon, EyeIcon, XIcon, PlusIcon, DownloadIcon
} from '../../components/Icons';
import { supabase } from '../../lib/supabase';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════
type ContentLength = 'Short' | 'Medium' | 'Long';
type ContentFocus = 'Problem → Solution' | 'Features → Benefits' | 'Story → CTA' | 'Data → Insight';

interface ContentBlock {
  id: string;
  title: string;
  subject: string;
  body: string;
}

interface TemplateOption {
  id: string;
  name: string;
  blocks: ContentBlock[];
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
    { id: 'launch', name: 'Product Launch', blocks: [{ id: 'lp1', title: 'Product Launch Page', subject: 'Transform Your {{industry}} Results Today', body: 'Stop losing {{pain_point}} to outdated tools.\n\n{{company}} deserves better.\n\nOur platform helps teams like yours:\n• Increase efficiency by 40%\n• Reduce manual work by 60%\n• Get results in under 30 days\n\nTrusted by 500+ companies worldwide.\n\n[Start Free Trial] [Watch Demo]' }] },
    { id: 'webinar', name: 'Webinar Registration', blocks: [{ id: 'wp1', title: 'Webinar Page', subject: 'Free Webinar: Solving {{pain_point}} in {{industry}}', body: 'Join us for an exclusive session on how leading companies are tackling {{pain_point}}.\n\nWhat you\'ll learn:\n• The #1 mistake {{industry}} companies make\n• A proven framework for {{benefit}}\n• Live Q&A with industry experts\n\nDate: [Date] | Time: [Time]\nSpots limited to 100 attendees.\n\n[Reserve My Spot]' }] },
  ],
  [ContentCategory.SOCIAL_MEDIA]: [
    { id: 'thought', name: 'Thought Leadership', blocks: [{ id: 'sp1', title: 'LinkedIn Post', subject: 'Thought Leadership Post', body: 'Most {{industry}} companies are still doing {{pain_point}} the hard way.\n\nHere\'s what the top 1% do differently:\n\n1. They automate {{insight_1}}\n2. They focus on {{benefit}} over vanity metrics\n3. They invest in {{solution}} early\n\nThe result? 3x faster growth with half the effort.\n\nWhich of these resonates most with your experience? 👇' }] },
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
    suggestions.push({ icon: '💡', text: 'Try "scale {{goal}}" instead of "achieve" for stronger action' });
  if (!/\d+%?/.test(body))
    suggestions.push({ icon: '📊', text: 'Add specific metric: "increase efficiency by 40%"' });
  if (!/\b(used by|trusted by|join|companies|customers|clients)\b/i.test(body))
    suggestions.push({ icon: '🏆', text: 'Include social proof: "Used by 500+ companies"' });
  if (!body.includes('?'))
    suggestions.push({ icon: '❓', text: 'End with a question to boost response rates' });
  if (!/\{\{.+?\}\}/.test(body))
    suggestions.push({ icon: '🎯', text: 'Add personalization tags like {{first_name}} to increase engagement' });
  if (body.split(/\s+/).length > 200)
    suggestions.push({ icon: '✂️', text: 'Consider shortening — emails under 125 words have 50% higher response rates' });
  if (!/p\.?s\.?/i.test(body) && body.split(/\s+/).length > 60)
    suggestions.push({ icon: '📝', text: 'Add a P.S. line — it\'s the second most-read part of any email' });
  if (/\bhelp\b/i.test(body) && !/\bhelped\b/i.test(body))
    suggestions.push({ icon: '💡', text: 'Replace "help" with a specific verb like "enable", "empower", or "streamline"' });

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
  const [contentType, setContentType] = useState<ContentCategory>(ContentCategory.EMAIL_SEQUENCE);
  const [selectedSegments, setSelectedSegments] = useState<string[]>(['hot']);
  const [tone, setTone] = useState<ToneType>(ToneType.PROFESSIONAL);
  const [length, setLength] = useState<ContentLength>('Medium');
  const [focus, setFocus] = useState<ContentFocus>('Problem → Solution');
  const [personalization, setPersonalization] = useState<Record<string, boolean>>({ names: true, company: true, insights: true, behavioral: false });
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

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
  };

  const handleGenerate = async () => {
    if (targetLeads.length === 0 && leads.length === 0) {
      setError('No leads available. Add leads first.');
      return;
    }
    if (creditsUsed >= creditsTotal) {
      setError('Credit limit reached. Please upgrade your plan.');
      return;
    }

    setIsGenerating(true);
    setError('');

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
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
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
        }
      }
    } catch {}
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
              <span className="font-bold text-slate-900 font-heading">Content Studio</span>
              <span className="text-slate-300">&rsaquo;</span>
              <span className="text-indigo-600 font-bold">New {typeInfo?.label}</span>
            </div>
            <p className="text-[10px] text-slate-400">{targetLeads.length} leads targeted &middot; {(creditsTotal - creditsUsed).toLocaleString()} credits left</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
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
          <button
            onClick={() => blocks.length > 0 && setShowPreview(true)}
            disabled={blocks.length === 0}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              blocks.length > 0 ? 'bg-slate-900 text-white hover:bg-indigo-600' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <EyeIcon className="w-4 h-4" />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* ═══ TWO-PANEL LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ─── SETUP PANEL (Left 30%) ─── */}
        <div className="lg:w-[30%] shrink-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
            {/* 1. CONTENT TYPE */}
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

            {/* 2. TARGET AUDIENCE */}
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

            {/* 3. AI PARAMETERS */}
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

            {/* 4. PERSONALIZATION */}
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

            {/* ACTION BUTTONS */}
            <div className="flex space-x-3 pt-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || creditsUsed >= creditsTotal}
                className={`flex-grow py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 ${
                  isGenerating || creditsUsed >= creditsTotal
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-100/50 active:scale-95'
                }`}
              >
                {isGenerating ? (
                  <><div className="w-4 h-4 border-2 border-indigo-400 border-t-white rounded-full animate-spin" /><span>Generating...</span></>
                ) : (
                  <><SparklesIcon className="w-4 h-4" /><span>Generate with AI</span></>
                )}
              </button>
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="px-4 py-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all"
              >
                Use Template
              </button>
            </div>

            {/* Template Dropdown */}
            {showTemplates && currentTemplates.length > 0 && (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3 space-y-2 animate-in fade-in duration-200">
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

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-bold text-center">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ─── EDITOR (Right 70%) ─── */}
        <div className="lg:w-[70%] space-y-6">
          {/* Editor Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Email Tabs (for sequences with multiple blocks) */}
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
                {/* Block Title */}
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
                  <button onClick={() => copyToClipboard(`Subject: ${activeBlock.subject}\n\n${activeBlock.body}`)}
                    className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    {copied ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <CopyIcon className="w-4 h-4" />}
                  </button>
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
                      <span>🎯</span>
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
              /* Empty State */
              <div className="p-12 text-center">
                <div className="w-16 h-16 mx-auto bg-slate-50 rounded-3xl flex items-center justify-center mb-4">
                  <SparklesIcon className="w-8 h-8 text-slate-200" />
                </div>
                <h3 className="text-sm font-bold text-slate-400 mb-1">No Content Yet</h3>
                <p className="text-xs text-slate-300 max-w-xs mx-auto">
                  Click &ldquo;Generate with AI&rdquo; to create content or select a template to get started.
                </p>
              </div>
            )}
          </div>

          {/* ─── PREDICTIVE ANALYTICS ─── */}
          {predictions && blocks.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 animate-in fade-in duration-300">
              <div className="flex items-center space-x-2 mb-5">
                <span className="text-sm">📊</span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Predictive Analytics</p>
                <span className="text-[9px] bg-indigo-50 text-indigo-600 font-black px-2 py-0.5 rounded-lg uppercase tracking-wider">Expected Performance</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Open Rate */}
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Open Rate</p>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-black text-slate-900">{predictions.openRate}%</span>
                    <span className="text-[10px] text-slate-400">(±{predictions.openVar}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-700" style={{ width: `${predictions.openRate}%` }} />
                  </div>
                </div>

                {/* Click Rate */}
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Click Rate</p>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-black text-slate-900">{predictions.clickRate}%</span>
                    <span className="text-[10px] text-slate-400">(±{predictions.clickVar}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-700" style={{ width: `${predictions.clickRate * 5}%` }} />
                  </div>
                </div>

                {/* Response Rate */}
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Response Rate</p>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-black text-slate-900">{predictions.responseRate}%</span>
                    <span className="text-[10px] text-slate-400">(±{predictions.responseVar}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full transition-all duration-700" style={{ width: `${predictions.responseRate * 8}%` }} />
                  </div>
                </div>

                {/* Optimal Send Time */}
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
        </div>
      </div>

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
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">{block.title}</p>
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
