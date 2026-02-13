import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User, Lead, ToneType } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  SparklesIcon, MailIcon, CheckIcon, XIcon, PlusIcon, CopyIcon,
  EditIcon, EyeIcon, ChartIcon, RefreshIcon, FilterIcon,
  TrendUpIcon, TrendDownIcon, ClockIcon, TargetIcon, BoltIcon,
  DownloadIcon, FlameIcon, SlidersIcon, ArrowRightIcon, StarIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ─── Types ───
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
  audiencePercent: number;
}

type ViewTab = 'editor' | 'preview' | 'analytics';

const PERSONALIZATION_TAGS = [
  '{{first_name}}', '{{company}}', '{{industry}}', '{{recent_activity}}',
  '{{ai_insight}}', '{{pain_point}}', '{{your_name}}', '{{target_outcome}}',
  '{{company_size}}', '{{job_title}}'
];

const INITIAL_SUGGESTIONS: AISuggestion[] = [
  {
    id: 'sug-1', type: 'word', title: 'Try "streamline" instead of "help"',
    description: 'More action-oriented verbs increase engagement by conveying immediate value.',
    replacement: 'streamline', impactLabel: '+8% expected opens', impactPercent: 8, applied: false,
  },
  {
    id: 'sug-2', type: 'metric', title: 'Add a specific metric',
    description: 'Including data like "increase efficiency by 40%" adds credibility and specificity.',
    replacement: 'increase efficiency by 40%', impactLabel: '+12% credibility', impactPercent: 12, applied: false,
  },
  {
    id: 'sug-3', type: 'personalization', title: 'Personalize for industry',
    description: 'Opening with "As a {{industry}} leader..." signals that the email is tailored, not mass-sent.',
    replacement: 'As a {{industry}} leader, ', impactLabel: '+15% relevance', impactPercent: 15, applied: false,
  },
  {
    id: 'sug-4', type: 'cta', title: 'Strengthen the CTA',
    description: 'Replace generic "let\'s chat" with time-bounded urgency: "Grab a 15-min slot this week".',
    replacement: 'Grab a 15-min slot this week?', impactLabel: '+10% reply rate', impactPercent: 10, applied: false,
  },
  {
    id: 'sug-5', type: 'structure', title: 'Add a P.S. line',
    description: 'P.S. lines get read 79% of the time, even when the body is skimmed.',
    replacement: '\n\nP.S. {{personalized_ps}}', impactLabel: '+6% engagement', impactPercent: 6, applied: false,
  },
];

const INITIAL_RULES: PersonalizationRule[] = [
  { id: 'rule-1', condition: 'lead_score', conditionValue: '> 75', thenShow: 'Case study link + demo CTA', audiencePercent: 42 },
  { id: 'rule-2', condition: 'company_size', conditionValue: '> 200', thenShow: 'Enterprise pricing mention', audiencePercent: 28 },
  { id: 'rule-3', condition: 'industry', conditionValue: '= "tech"', thenShow: 'Industry-specific stats', audiencePercent: 15 },
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
  const [steps, setSteps] = useState<EmailStep[]>(() => {
    const s = createDefaultSteps();
    return s.map(step => ({ ...step, activeVariantId: step.variants[0].id }));
  });
  const [activeStepIdx, setActiveStepIdx] = useState(0);
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
  const [newRule, setNewRule] = useState<PersonalizationRule>({ id: '', condition: 'lead_score', conditionValue: '> 50', thenShow: '', audiencePercent: 0 });

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

  const baselineComparison = useMemo(() => ({
    opens: aggregatePerformance.openRate > 35 ? `+${(aggregatePerformance.openRate - 35).toFixed(0)}%` : `${(aggregatePerformance.openRate - 35).toFixed(0)}%`,
    clicks: aggregatePerformance.clickRate > 5 ? `+${(aggregatePerformance.clickRate - 5).toFixed(0)}%` : `${(aggregatePerformance.clickRate - 5).toFixed(0)}%`,
    replies: aggregatePerformance.replyRate > 3 ? `+${(aggregatePerformance.replyRate - 3).toFixed(0)}%` : `${(aggregatePerformance.replyRate - 3).toFixed(0)}%`,
  }), [aggregatePerformance]);

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
    if (!activeVariant) return;
    updateVariantField('body', activeVariant.body + ' ' + tag);
    setShowTagPicker(false);
  };

  const handleFindReplace = () => {
    if (!findText || !activeVariant) return;
    updateVariantField('body', activeVariant.body.replaceAll(findText, replaceText));
    updateVariantField('subject', activeVariant.subject.replaceAll(findText, replaceText));
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
    setNewRule({ id: '', condition: 'lead_score', conditionValue: '> 50', thenShow: '', audiencePercent: 0 });
    setShowRuleModal(false);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleExport = () => {
    const content = steps.map(step => {
      const v = step.variants.find(vr => vr.id === step.activeVariantId) || step.variants[0];
      return `=== Email ${step.stepNumber} (${step.delay}) ===\nSubject: ${v.subject}\n\n${v.body}`;
    }).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email_sequence_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
              <span className="text-indigo-600">Email Sequence</span>
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Multi-variant editor &middot; {steps.length} steps &middot; {activeStep?.variants.length || 0} variants
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
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
      {/* VARIANT MANAGER (Top Bar)                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Email Step Tabs */}
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

            {/* Variant Tabs */}
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
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFindReplace(!showFindReplace)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all"
            >
              <FilterIcon className="w-3.5 h-3.5" />
              <span>Find &amp; Replace</span>
            </button>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {(['editor', 'preview', 'analytics'] as ViewTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className={`px-3 py-2 text-xs font-bold transition-all ${
                    viewTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active variant info bar */}
        {activeVariant && (
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
      {/* MAIN LAYOUT                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ─── Editor / Preview Area (65%) ─── */}
        <div className="lg:w-[65%] space-y-5">

          {viewTab === 'editor' && activeVariant && (
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

          {viewTab === 'preview' && activeVariant && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center space-x-2 mb-4">
                <EyeIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 font-heading">AI Preview</h3>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Personalized</span>
              </div>

              {/* Simulated email preview */}
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

          {viewTab === 'analytics' && (
            <div className="space-y-5">
              {/* Variant Comparison Table */}
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

              {/* Sequence Performance Overview */}
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
                <button onClick={() => setShowRuleModal(true)} className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                  <PlusIcon className="w-3 h-3" />
                  <span>Add Rule</span>
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">If</th>
                    <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Then Show</th>
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
        <div className="lg:w-[35%] space-y-5">

          {/* AI Suggestions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <SparklesIcon className="w-4 h-4 text-indigo-600" />
                <span>AI Suggestions</span>
              </h3>
              <button onClick={refreshSuggestions} disabled={suggestionsRefreshing} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                <RefreshIcon className={`w-4 h-4 ${suggestionsRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="space-y-3">
              {suggestions.map(sug => (
                <div
                  key={sug.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    sug.applied ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <p className="text-xs font-bold text-slate-800">{sug.title}</p>
                    {sug.applied && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-2">{sug.description}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${sug.applied ? 'text-emerald-600' : 'text-indigo-600'}`}>
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
              ))}
            </div>
          </div>

          {/* Predictive Performance */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-4 flex items-center space-x-1.5">
              <ChartIcon className="w-4 h-4 text-violet-600" />
              <span>Predictive Performance</span>
            </h3>

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

            {/* Compared to Baseline */}
            <div className="p-3.5 bg-slate-50 rounded-xl mb-5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">vs. Baseline</p>
              <div className="space-y-1.5">
                {[
                  { label: 'Opens', value: baselineComparison.opens, up: aggregatePerformance.openRate > 35 },
                  { label: 'Clicks', value: baselineComparison.clicks, up: aggregatePerformance.clickRate > 5 },
                  { label: 'Replies', value: baselineComparison.replies, up: aggregatePerformance.replyRate > 3 },
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
        </div>
      </div>

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
                  placeholder="e.g. Enterprise pricing mention"
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
    </div>
  );
};

export default ContentStudio;
