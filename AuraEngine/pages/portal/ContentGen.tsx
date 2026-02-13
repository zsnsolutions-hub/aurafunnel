import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Lead, ContentCategory, ToneType, EmailStep, User } from '../../types';
import { generateContentByCategory, AIResponse } from '../../lib/gemini';
import { SparklesIcon, MailIcon, GlobeIcon, HashIcon, BookIcon, FileTextIcon, BriefcaseIcon, CopyIcon, CheckIcon, ClockIcon, BoltIcon, DownloadIcon } from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import EmailSequenceBuilder from '../../components/dashboard/EmailSequenceBuilder';

const PERSONALIZATION_TAGS = [
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{company}}', label: 'Company' },
  { key: '{{industry}}', label: 'Industry' },
  { key: '{{city}}', label: 'City' },
  { key: '{{recent_activity}}', label: 'Recent Activity' },
  { key: '{{ai_insight}}', label: 'AI Insight' },
];

const CONTENT_TYPES: { category: ContentCategory; icon: React.FC<{ className?: string }>; color: string; desc: string; badge?: string }[] = [
  { category: ContentCategory.EMAIL_SEQUENCE, icon: MailIcon, color: 'text-indigo-600 bg-indigo-50', desc: 'Multi-step campaigns', badge: 'Wizard' },
  { category: ContentCategory.LANDING_PAGE, icon: GlobeIcon, color: 'text-emerald-600 bg-emerald-50', desc: 'High-converting copy' },
  { category: ContentCategory.SOCIAL_MEDIA, icon: HashIcon, color: 'text-blue-600 bg-blue-50', desc: 'LinkedIn & social' },
  { category: ContentCategory.BLOG_ARTICLE, icon: BookIcon, color: 'text-amber-600 bg-amber-50', desc: 'SEO-optimized articles' },
  { category: ContentCategory.REPORT, icon: FileTextIcon, color: 'text-purple-600 bg-purple-50', desc: 'Whitepapers & reports' },
  { category: ContentCategory.PROPOSAL, icon: BriefcaseIcon, color: 'text-rose-600 bg-rose-50', desc: 'Proposals & pitches' },
];

const TEMPLATES: Record<string, { id: string; name: string; prompt: string }[]> = {
  [ContentCategory.LANDING_PAGE]: [
    { id: 'hero', name: 'Hero Section', prompt: 'Focus on a compelling hero headline with subheadline and primary CTA. Include social proof elements.' },
    { id: 'features', name: 'Features Overview', prompt: 'Create a features section with 4-6 benefit cards. Each needs icon placeholder, bold title, and description.' },
    { id: 'pricing', name: 'Pricing Page', prompt: 'Design a 3-tier pricing comparison. Include a feature checklist for each tier and annual discount.' },
  ],
  [ContentCategory.SOCIAL_MEDIA]: [
    { id: 'thought', name: 'Thought Leadership', prompt: 'Write a thought leadership post with a bold opening hook and industry data points. End with a question.' },
    { id: 'case', name: 'Mini Case Study', prompt: 'Structure as: Problem faced → Solution applied → Results achieved. Include specific numbers.' },
    { id: 'engage', name: 'Engagement Post', prompt: 'Write a question-based post that drives comments and shares. Include a poll suggestion.' },
  ],
  [ContentCategory.BLOG_ARTICLE]: [
    { id: 'howto', name: 'How-To Guide', prompt: 'Create a step-by-step tutorial with numbered steps, pro tips, and a summary checklist.' },
    { id: 'listicle', name: 'Top 10 Listicle', prompt: 'Write a top 10 list with SEO-optimized title, engaging intro, and detailed entries.' },
    { id: 'comparison', name: 'Comparison Article', prompt: 'Write a detailed comparison with pros/cons table, scoring criteria, and final recommendation.' },
  ],
  [ContentCategory.REPORT]: [
    { id: 'exec', name: 'Executive Summary', prompt: 'Write a concise executive summary: key findings, analysis highlights, and strategic recommendations.' },
    { id: 'industry', name: 'Industry Analysis', prompt: 'Produce an industry analysis: market trends, competitive landscape, growth projections, and risk factors.' },
    { id: 'roi', name: 'ROI Framework', prompt: 'Generate an ROI analysis with cost breakdown, projected returns, payback period, and sensitivity analysis.' },
  ],
  [ContentCategory.PROPOSAL]: [
    { id: 'saas', name: 'SaaS Proposal', prompt: 'Write a SaaS product proposal: implementation roadmap, pricing tiers, SLA terms, and success metrics.' },
    { id: 'consulting', name: 'Consulting Pitch', prompt: 'Create a consulting proposal: project scope, methodology, team bios, deliverables, and investment.' },
    { id: 'partner', name: 'Partnership Pitch', prompt: 'Draft a strategic partnership proposal: mutual benefits, revenue model, joint GTM strategy.' },
  ],
};

interface HistoryItem {
  id: string;
  category: ContentCategory;
  leadName: string;
  tone: ToneType;
  preview: string;
  fullContent: string;
  createdAt: Date;
  wordCount: number;
}

const ContentGen: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const query = new URLSearchParams(useLocation().search);
  const initialLeadId = query.get('leadId');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ContentCategory | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId || '');
  const [tone, setTone] = useState<ToneType>(ToneType.PROFESSIONAL);
  const [additionalContext, setAdditionalContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sequenceSteps, setSequenceSteps] = useState<EmailStep[]>([]);
  const [showSequenceResult, setShowSequenceResult] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const creditsTotal = user.credits_total ?? 500;
  const creditsUsed = user.credits_used ?? 0;
  const creditsRemaining = creditsTotal - creditsUsed;
  const usagePercentage = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);

  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id)
        .order('score', { ascending: false });
      if (data) setLeads(data);
      if (error) console.error('Error fetching leads:', error);
      setLoadingLeads(false);
    };
    if (user) fetchLeads();
  }, [user]);

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const contentStats = useMemo(() => {
    if (!result) return null;
    const words = result.split(/\s+/).filter(Boolean).length;
    const sentences = result.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    const avgSentenceLen = sentences > 0 ? Math.round(words / sentences) : 0;
    const score = Math.min(98, Math.max(45,
      85 - Math.abs(avgSentenceLen - 16) * 1.5 + (words > 100 ? 5 : 0) + (words < 500 ? 3 : -2)
    ));
    return { words, sentences, readingTime, score: Math.round(score) };
  }, [result]);

  const handleGenerate = async () => {
    if (!selectedLead || !selectedCategory) return;
    if (creditsUsed >= creditsTotal) {
      setError('Credit limit reached. Please upgrade your plan.');
      return;
    }
    setIsGenerating(true);
    setError('');
    setResult('');

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      if (rpcError) throw new Error(rpcError.message);
      if (!rpcData.success) {
        setError(rpcData.message || 'Credit consumption failed.');
        setIsGenerating(false);
        return;
      }

      const aiResponse = await generateContentByCategory(selectedLead, selectedCategory, tone, additionalContext);
      setResult(aiResponse.text);

      const words = aiResponse.text.split(/\s+/).filter(Boolean).length;
      setHistory(prev => [{
        id: `gen-${Date.now()}`,
        category: selectedCategory,
        leadName: selectedLead.name,
        tone,
        preview: aiResponse.text.slice(0, 80) + '...',
        fullContent: aiResponse.text,
        createdAt: new Date(),
        wordCount: words,
      }, ...prev].slice(0, 20));

      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        lead_id: selectedLead.id,
        action_type: `${selectedCategory.toLowerCase().replace(/\s+/g, '_')}_generation`,
        tokens_used: aiResponse.tokens_used,
        model_name: aiResponse.model_name,
        prompt_name: aiResponse.prompt_name,
        prompt_version: aiResponse.prompt_version,
      });
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED',
        details: `Generated ${selectedCategory} for ${selectedLead.name} (${selectedLead.company}). Tone: ${tone}.`,
      });
      if (refreshProfile) await refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSequenceComplete = async (steps: EmailStep[], response: AIResponse) => {
    setSequenceSteps(steps);
    setShowSequenceResult(true);
    try {
      const { error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      if (rpcError) console.error('Credit error:', rpcError);
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        action_type: 'email_sequence_generation',
        tokens_used: response.tokens_used,
        model_name: response.model_name,
        prompt_name: response.prompt_name,
        prompt_version: response.prompt_version,
      });
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED',
        details: `Generated email sequence with ${steps.length} steps.`,
      });
      if (refreshProfile) await refreshProfile();
    } catch (err) {
      console.error('Post-sequence error:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyFullSequence = () => {
    const full = sequenceSteps.map(s =>
      `--- ${s.delay} ---\nSubject: ${s.subject}\n\n${s.body}`
    ).join('\n\n');
    copyToClipboard(full);
  };

  const insertTagIntoContext = (tag: string) => {
    setAdditionalContext(prev => prev + ' ' + tag);
  };

  const selectCategory = (cat: ContentCategory) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    setResult('');
    setError('');
    setSequenceSteps([]);
    setShowSequenceResult(false);
    setActiveTemplate(null);
    setAdditionalContext('');
  };

  const applyTemplate = (template: { id: string; name: string; prompt: string }) => {
    setActiveTemplate(template.id);
    setAdditionalContext(template.prompt);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setSelectedCategory(item.category);
    setResult(item.fullContent);
    setShowSequenceResult(false);
    setSequenceSteps([]);
  };

  const downloadContent = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCategory?.toLowerCase().replace(/\s+/g, '-') || 'content'}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTemplates = selectedCategory && selectedCategory !== ContentCategory.EMAIL_SEQUENCE
    ? TEMPLATES[selectedCategory] || []
    : [];

  const isEmailMode = selectedCategory === ContentCategory.EMAIL_SEQUENCE;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ═══ HEADER ═══ */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">AI Content Generation Studio</h1>
          <p className="text-slate-500 mt-1">Neural-powered content engine with templates, history, and real-time analysis.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compute Budget</p>
          <p className="text-sm font-bold text-indigo-600">{creditsRemaining.toLocaleString()} Generations Left</p>
        </div>
      </div>

      {/* ═══ TWO-PANEL LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ─── LEFT PANEL (28%) ─── */}
        <div className="lg:w-[28%] space-y-4 shrink-0">
          {/* Content Types */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Content Types</p>
            <div className="space-y-1.5">
              {CONTENT_TYPES.map(({ category, icon: Icon, color, desc, badge }) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    onClick={() => selectCategory(category)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all text-left group ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                      isActive ? 'bg-white/15' : color
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-grow">
                      <div className="flex items-center space-x-2">
                        <p className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-slate-700'}`}>{category}</p>
                        {badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 ${
                            isActive ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600'
                          }`}>{badge}</span>
                        )}
                      </div>
                      <p className={`text-[10px] truncate ${isActive ? 'text-white/60' : 'text-slate-400'}`}>{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Templates */}
          {currentTemplates.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 animate-in fade-in duration-300">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Quick Templates</p>
              <div className="space-y-2">
                {currentTemplates.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      activeTemplate === tmpl.id
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <BoltIcon className={`w-3.5 h-3.5 shrink-0 ${activeTemplate === tmpl.id ? 'text-indigo-500' : 'text-slate-300'}`} />
                      <span className={`text-xs font-bold ${activeTemplate === tmpl.id ? 'text-indigo-700' : 'text-slate-600'}`}>{tmpl.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generation History */}
          {history.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Recent Generations</p>
                <span className="text-[9px] font-bold text-slate-300">{history.length}</span>
              </div>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {history.slice(0, 10).map(item => {
                  const typeInfo = CONTENT_TYPES.find(t => t.category === item.category);
                  const TypeIcon = typeInfo?.icon || SparklesIcon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <TypeIcon className="w-3 h-3 text-slate-300 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-600 truncate">{item.leadName}</span>
                        <span className="text-[9px] text-slate-300 shrink-0 ml-auto">{item.wordCount}w</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate pl-5">{item.preview}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Credit Gauge */}
          <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-2xl">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-3">Neural Compute</p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-black">{creditsRemaining.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500">/ {creditsTotal.toLocaleString()}</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-indigo-300 h-full rounded-full transition-all duration-1000"
                style={{ width: `${100 - usagePercentage}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-2">{usagePercentage}% consumed this cycle</p>
          </div>
        </div>

        {/* ─── RIGHT PANEL (72%) ─── */}
        <div className="lg:w-[72%] space-y-6">

          {/* ── Welcome Panel (no selection) ── */}
          {!selectedCategory && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center animate-in fade-in duration-500">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl flex items-center justify-center mb-6">
                <SparklesIcon className="w-10 h-10 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 font-heading mb-2">Welcome to the Studio</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">
                Select a content type from the left panel to start generating AI-powered content.
                Use templates for quick results or customize every detail.
              </p>
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
                {[
                  { label: 'Content Types', value: '6', sub: 'Available' },
                  { label: 'Templates', value: String(Object.values(TEMPLATES).flat().length), sub: 'Pre-built' },
                  { label: 'Credits', value: String(creditsRemaining), sub: 'Remaining' },
                ].map(stat => (
                  <div key={stat.label} className="p-4 bg-slate-50 rounded-2xl">
                    <p className="text-lg font-black text-slate-900">{stat.value}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Quick Launch Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
                {CONTENT_TYPES.map(({ category, icon: Icon, color, desc }) => (
                  <button
                    key={category}
                    onClick={() => selectCategory(category)}
                    className="group p-4 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all text-left"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} group-hover:scale-110 transition-transform mb-3`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{category}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>

              {/* Quick Generate Banner (if arrived with leadId) */}
              {initialLeadId && selectedLead && (
                <div className="mt-8 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 max-w-lg mx-auto">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      <SparklesIcon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-grow text-left">
                      <p className="text-sm font-bold text-slate-800">Quick Generate for {selectedLead.name}</p>
                      <p className="text-xs text-slate-500">{selectedLead.company} &middot; Score: {selectedLead.score}</p>
                    </div>
                    <button
                      onClick={() => selectCategory(ContentCategory.EMAIL_SEQUENCE)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shrink-0"
                    >
                      Start
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Email Sequence Builder ── */}
          {isEmailMode && !showSequenceResult && (
            <div className="animate-in fade-in duration-300">
              <EmailSequenceBuilder
                leads={leads}
                onComplete={handleSequenceComplete}
                onCancel={() => setSelectedCategory(null)}
                isGenerating={isGenerating}
                setIsGenerating={setIsGenerating}
              />
            </div>
          )}

          {/* ── Email Sequence Results ── */}
          {isEmailMode && showSequenceResult && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Sequence Complete</h2>
                  <p className="text-sm text-slate-500">{sequenceSteps.length} emails generated and ready to deploy.</p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={copyFullSequence}
                    className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center space-x-2 transition-colors"
                  >
                    <CopyIcon className="w-4 h-4" />
                    <span>{copied ? 'Copied!' : 'Copy All'}</span>
                  </button>
                  <button
                    onClick={() => { setShowSequenceResult(false); setSequenceSteps([]); }}
                    className="px-4 py-2.5 text-indigo-600 bg-indigo-50 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                  >
                    New Sequence
                  </button>
                </div>
              </div>

              {sequenceSteps.map(emailStep => (
                <div key={emailStep.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-xs font-black">
                        {emailStep.stepNumber}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">{emailStep.delay}</p>
                        <p className="text-[10px] text-slate-400">{emailStep.tone}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(`Subject: ${emailStep.subject}\n\n${emailStep.body}`)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-6 space-y-3">
                    <div className="flex items-center space-x-2">
                      <MailIcon className="w-4 h-4 text-slate-300" />
                      <p className="text-sm font-bold text-slate-800">{emailStep.subject}</p>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{emailStep.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── General Content Generator (non-email) ── */}
          {selectedCategory && !isEmailMode && (
            <>
              {/* Configuration Card */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 font-heading text-lg">{selectedCategory}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuration</p>
                </div>

                {/* Lead + Tone (side by side on desktop) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Target Lead</label>
                    <select
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                      disabled={loadingLeads}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                    >
                      <option value="">{loadingLeads ? 'Loading leads...' : 'Choose a prospect...'}</option>
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>{l.name} — {l.company} ({l.score})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Content Tone</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(ToneType).map(t => (
                        <button
                          key={t}
                          onClick={() => setTone(t)}
                          className={`px-3 py-2.5 text-xs rounded-xl font-bold transition-all border ${
                            tone === t
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Lead Intelligence */}
                {selectedLead && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in zoom-in-95 duration-300">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.2em]">Lead Intelligence</p>
                      <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-full text-indigo-600 border border-indigo-100">{selectedLead.score}% Score</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed italic">&ldquo;{selectedLead.insights}&rdquo;</p>
                  </div>
                )}

                {/* Personalization Tags + Context */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Personalization Tags</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {PERSONALIZATION_TAGS.map(tag => (
                      <button
                        key={tag.key}
                        onClick={() => insertTagIntoContext(tag.key)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                      >
                        {tag.key}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder="Add context, instructions, or apply a template from the left panel..."
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all resize-none"
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={!selectedLead || isGenerating || creditsUsed >= creditsTotal}
                  className={`w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center space-x-2 ${
                    !selectedLead || isGenerating || creditsUsed >= creditsTotal
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-indigo-100/50 hover:scale-[1.01] active:scale-95'
                  }`}
                >
                  {isGenerating ? (
                    <span className="flex items-center space-x-3">
                      <div className="w-5 h-5 border-2 border-indigo-400 border-t-white rounded-full animate-spin" />
                      <span>Generating {selectedCategory}...</span>
                    </span>
                  ) : (
                    <>
                      <SparklesIcon className="w-5 h-5" />
                      <span>Generate Content</span>
                    </>
                  )}
                </button>
                {creditsUsed >= creditsTotal && (
                  <p className="text-center text-[10px] text-red-500 font-bold uppercase tracking-widest animate-pulse">
                    Limit reached. Upgrade your plan to continue.
                  </p>
                )}
              </div>

              {/* Neural Output Panel */}
              <div className="bg-slate-950 rounded-[2rem] shadow-3xl min-h-[400px] flex flex-col overflow-hidden border border-white/5 group">
                {/* Output Header */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                    <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-heading">Neural Output</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {result && (
                      <>
                        <span className="text-[10px] text-white/20 font-bold">{tone}</span>
                        <button
                          onClick={downloadContent}
                          className="p-2 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 rounded-lg transition-all"
                          title="Download"
                        >
                          <DownloadIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => copyToClipboard(result)}
                          className="px-4 py-1.5 bg-white/10 text-white hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-90"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Output Body */}
                <div className="flex-grow p-8 overflow-y-auto custom-scrollbar">
                  {isGenerating ? (
                    <div className="space-y-5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-3.5 bg-white/5 rounded-full animate-pulse"
                          style={{ width: `${55 + Math.random() * 35}%`, animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  ) : result ? (
                    <div className="text-indigo-100/90 leading-relaxed font-mono text-sm whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-700">
                      {result}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
                      <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                        <SparklesIcon className="w-7 h-7 text-white/20" />
                      </div>
                      <p className="text-white/20 text-sm font-medium leading-relaxed max-w-[280px]">
                        Select a lead, set your tone, and generate {selectedCategory?.toLowerCase()}.
                      </p>
                    </div>
                  )}
                  {error && (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-bold text-center">
                      {error}
                    </div>
                  )}
                </div>

                {/* Content Stats Bar */}
                {contentStats && (
                  <div className="px-6 py-3 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center space-x-5">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[9px] font-bold text-white/20 uppercase">Words</span>
                        <span className="text-[10px] font-black text-white/50">{contentStats.words}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[9px] font-bold text-white/20 uppercase">Sentences</span>
                        <span className="text-[10px] font-black text-white/50">{contentStats.sentences}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <ClockIcon className="w-3 h-3 text-white/20" />
                        <span className="text-[10px] font-black text-white/50">{contentStats.readingTime}m read</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] font-bold text-white/20 uppercase">Quality</span>
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            contentStats.score >= 80 ? 'bg-emerald-400' : contentStats.score >= 60 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${contentStats.score}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-black ${
                        contentStats.score >= 80 ? 'text-emerald-400' : contentStats.score >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}>{contentStats.score}</span>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="px-4 py-3 bg-white/[0.01] border-t border-white/5 text-[9px] text-white/15 font-black uppercase tracking-[0.5em] text-center">
                  Aura Content Engine v5.0
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentGen;
