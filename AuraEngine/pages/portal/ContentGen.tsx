import React, { useState, useEffect } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Lead, ContentType, ContentCategory, ToneType, EmailStep, User } from '../../types';
import { generateLeadContent, generateContentByCategory, AIResponse } from '../../lib/gemini';
import { SparklesIcon, MailIcon, GlobeIcon, HashIcon, BookIcon, FileTextIcon, BriefcaseIcon, ArrowLeftIcon, CopyIcon, CheckIcon, EditIcon } from '../../components/Icons';
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

const CONTENT_TYPES = [
  { category: ContentCategory.EMAIL_SEQUENCE, icon: MailIcon, color: 'bg-indigo-50 text-indigo-600 border-indigo-100', desc: 'Multi-step automated outreach campaigns', badge: 'Wizard' },
  { category: ContentCategory.LANDING_PAGE, icon: GlobeIcon, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', desc: 'High-converting page copy & structure' },
  { category: ContentCategory.SOCIAL_MEDIA, icon: HashIcon, color: 'bg-blue-50 text-blue-600 border-blue-100', desc: 'LinkedIn posts & social content' },
  { category: ContentCategory.BLOG_ARTICLE, icon: BookIcon, color: 'bg-amber-50 text-amber-600 border-amber-100', desc: 'SEO-optimized articles & outlines' },
  { category: ContentCategory.REPORT, icon: FileTextIcon, color: 'bg-purple-50 text-purple-600 border-purple-100', desc: 'Whitepapers & research reports' },
  { category: ContentCategory.PROPOSAL, icon: BriefcaseIcon, color: 'bg-rose-50 text-rose-600 border-rose-100', desc: 'Business proposals & pitch decks' },
];

const ContentGen: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const query = new URLSearchParams(useLocation().search);
  const initialLeadId = query.get('leadId');

  // State
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

  const creditsTotal = user.credits_total ?? 500;
  const creditsUsed = user.credits_used ?? 0;

  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id)
        .order('score', { ascending: false });

      if (data) setLeads(data);
      if (error) console.error("Error fetching leads:", error);
      setLoadingLeads(false);
    };

    if (user) fetchLeads();
  }, [user]);

  const selectedLead = leads.find(l => l.id === selectedLeadId);

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

      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        lead_id: selectedLead.id,
        action_type: `${selectedCategory.toLowerCase().replace(/\s+/g, '_')}_generation`,
        tokens_used: aiResponse.tokens_used,
        model_name: aiResponse.model_name,
        prompt_name: aiResponse.prompt_name,
        prompt_version: aiResponse.prompt_version
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED',
        details: `Generated ${selectedCategory} for ${selectedLead.name} (${selectedLead.company}). Tone: ${tone}.`
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
        prompt_version: response.prompt_version
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED',
        details: `Generated email sequence with ${steps.length} steps.`
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

  const goBack = () => {
    setSelectedCategory(null);
    setResult('');
    setError('');
    setSequenceSteps([]);
    setShowSequenceResult(false);
    setAdditionalContext('');
  };

  // Type Selector View
  if (!selectedCategory) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">AI Content Studio</h1>
            <p className="text-slate-500 mt-1">Generate hyper-personalized content using live intelligence across 6 content types.</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Budget</p>
            <p className="text-sm font-bold text-indigo-600">{(creditsTotal - creditsUsed).toLocaleString()} Generations Left</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONTENT_TYPES.map(({ category, icon: Icon, color, desc, badge }) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className="group p-6 bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all text-left"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${color} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                {badge && (
                  <span className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">{badge}</span>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-800 font-heading group-hover:text-indigo-600 transition-colors">{category}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>

        {/* Quick Generate Section - Legacy support for direct lead links */}
        {initialLeadId && selectedLead && (
          <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                <SparklesIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex-grow">
                <p className="text-sm font-bold text-slate-800">Quick Generate for {selectedLead.name}</p>
                <p className="text-xs text-slate-500">{selectedLead.company} &middot; Score: {selectedLead.score}</p>
              </div>
              <button
                onClick={() => setSelectedCategory(ContentCategory.EMAIL_SEQUENCE)}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
              >
                Start Sequence
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Email Sequence Builder (Special Wizard Flow)
  if (selectedCategory === ContentCategory.EMAIL_SEQUENCE && !showSequenceResult) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center space-x-4">
          <button
            onClick={goBack}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">Email Sequence Builder</h1>
            <p className="text-sm text-slate-500">Create multi-step automated outreach campaigns with AI.</p>
          </div>
        </div>

        <EmailSequenceBuilder
          leads={leads}
          onComplete={handleSequenceComplete}
          onCancel={goBack}
          isGenerating={isGenerating}
          setIsGenerating={setIsGenerating}
        />
      </div>
    );
  }

  // Email Sequence Result View
  if (selectedCategory === ContentCategory.EMAIL_SEQUENCE && showSequenceResult) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goBack}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">Sequence Complete</h1>
              <p className="text-sm text-slate-500">{sequenceSteps.length} emails generated and ready to deploy.</p>
            </div>
          </div>
          <button
            onClick={copyFullSequence}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center space-x-2 transition-colors"
          >
            <CopyIcon className="w-4 h-4" />
            <span>{copied ? 'Copied!' : 'Copy All'}</span>
          </button>
        </div>

        <div className="space-y-4">
          {sequenceSteps.map((emailStep) => (
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

        <div className="flex justify-center pt-4">
          <button
            onClick={() => { setShowSequenceResult(false); setSequenceSteps([]); }}
            className="px-6 py-3 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            Build Another Sequence
          </button>
        </div>
      </div>
    );
  }

  // General Content Generator (Landing Pages, Social Media, Blog, Report, Proposal)
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center space-x-4">
        <button
          onClick={goBack}
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-grow">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">{selectedCategory}</h1>
          <p className="text-sm text-slate-500">Generate AI-powered content with personalization and tone control.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Budget</p>
          <p className="text-sm font-bold text-indigo-600">{(creditsTotal - creditsUsed).toLocaleString()} Left</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration Panel */}
        <div className="space-y-6">
          {/* Lead Selection */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xs">1</span>
              <span>Select Target Lead</span>
            </h3>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              disabled={loadingLeads}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium"
            >
              <option value="">{loadingLeads ? 'Loading leads...' : 'Choose a prospect...'}</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>{l.name} — {l.company} (Score: {l.score})</option>
              ))}
            </select>

            {selectedLead && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.2em]">Lead Intelligence</p>
                  <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-full text-indigo-600 border border-indigo-100">{selectedLead.score}% Score</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed italic">"{selectedLead.insights}"</p>
              </div>
            )}
          </div>

          {/* Tone Selection */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xs">2</span>
              <span>Content Tone</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.values(ToneType).map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-4 py-3 text-xs rounded-xl font-bold transition-all border ${
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

          {/* Personalization Tags */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xs">3</span>
              <span>Personalization & Context</span>
            </h3>
            <div className="flex flex-wrap gap-2">
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
              placeholder="Add extra context, instructions, or paste personalization tags here..."
              rows={3}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all resize-none"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!selectedLead || isGenerating || creditsUsed >= creditsTotal}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center space-x-2 shadow-2xl ${
              !selectedLead || isGenerating || creditsUsed >= creditsTotal
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-indigo-100 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center space-x-3">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-white rounded-full animate-spin"></div>
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

        {/* Output Panel */}
        <div className="bg-slate-950 rounded-[2.5rem] shadow-3xl min-h-[600px] flex flex-col overflow-hidden border border-white/5 group">
          <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
              <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-heading">Neural Output</span>
            </div>
            <div className="flex items-center space-x-2">
              {result && (
                <>
                  <span className="text-[10px] text-white/20 font-bold">{tone}</span>
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
          <div className="flex-grow p-10 overflow-y-auto custom-scrollbar">
            {isGenerating ? (
              <div className="space-y-6">
                <div className="h-4 bg-white/5 rounded-full w-3/4 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-5/6 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-2/3 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-1/2 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-4/5 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-3/5 animate-pulse"></div>
              </div>
            ) : result ? (
              <div className="text-indigo-100/90 leading-relaxed font-mono text-sm whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-700">
                {result}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                  <SparklesIcon className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/20 text-sm font-medium leading-relaxed max-w-[280px]">
                  Select a lead, set your tone, and add any personalization context to generate {selectedCategory?.toLowerCase()}.
                </p>
              </div>
            )}
            {error && (
              <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-bold text-center">
                {error}
              </div>
            )}
          </div>
          <div className="p-4 bg-white/[0.01] border-t border-white/5 text-[9px] text-white/20 font-black uppercase tracking-[0.5em] text-center">
            Aura Content Engine v5.0
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentGen;
