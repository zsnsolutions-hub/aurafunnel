import React, { useState } from 'react';
import { Lead, EmailSequenceConfig, EmailStep, ToneType } from '../../types';
import { generateEmailSequence, parseEmailSequenceResponse, AIResponse } from '../../lib/gemini';
import { supabase } from '../../lib/supabase';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { MailIcon, ArrowRightIcon, ArrowLeftIcon, SparklesIcon, CheckIcon, EditIcon, CopyIcon, XIcon } from '../Icons';

interface EmailSequenceBuilderProps {
  leads: Lead[];
  onComplete: (steps: EmailStep[], response: AIResponse) => void;
  onCancel: () => void;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
}

const PERSONALIZATION_TAGS = [
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{company}}', label: 'Company' },
  { key: '{{industry}}', label: 'Industry' },
  { key: '{{city}}', label: 'City' },
  { key: '{{recent_activity}}', label: 'Recent Activity' },
  { key: '{{ai_insight}}', label: 'AI Insight' },
];

const GOALS = [
  { value: 'book_meeting', label: 'Book a Meeting', desc: 'Drive prospects to schedule a call' },
  { value: 'product_demo', label: 'Product Demo', desc: 'Get prospects to see your product in action' },
  { value: 'nurture', label: 'Nurture & Build', desc: 'Build long-term relationships with warm leads' },
  { value: 're_engage', label: 'Re-engage', desc: 'Revive cold or stagnant leads' },
  { value: 'upsell', label: 'Upsell', desc: 'Expand existing customer accounts' },
];

const EmailSequenceBuilder: React.FC<EmailSequenceBuilderProps> = ({
  leads,
  onComplete,
  onCancel,
  isGenerating,
  setIsGenerating
}) => {
  const [step, setStep] = useState(1);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [config, setConfig] = useState<EmailSequenceConfig>({
    audienceLeadIds: [],
    goal: 'book_meeting',
    sequenceLength: 5,
    cadence: 'every_2_days',
    tone: ToneType.PROFESSIONAL
  });
  const [generatedSteps, setGeneratedSteps] = useState<EmailStep[]>([]);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState('');
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);

  const toggleLead = (id: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    const finalConfig = { ...config, audienceLeadIds: selectedLeadIds };

    try {
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS['email_sequence']);
      if (!creditResult.success) {
        setError(creditResult.message || 'Insufficient credits.');
        setIsGenerating(false);
        return;
      }
      const selectedLeads = leads.filter(l => selectedLeadIds.includes(l.id));
      const response = await generateEmailSequence(selectedLeads, finalConfig);
      setRawResponse(response);

      if (response.text.startsWith('SEQUENCE GENERATION FAILED') || response.text === 'CRITICAL FAILURE') {
        setError(response.text);
        setIsGenerating(false);
        return;
      }

      const parsed = parseEmailSequenceResponse(response.text, finalConfig);
      if (parsed.length > 0) {
        setGeneratedSteps(parsed);
        setStep(4);
      } else {
        setError('Could not parse sequence. Raw output available.');
        setGeneratedSteps([{
          id: 'raw-1',
          stepNumber: 1,
          subject: 'Generated Sequence',
          body: response.text,
          delay: 'Day 1',
          tone: finalConfig.tone
        }]);
        setStep(4);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateStep = (stepId: string, field: 'subject' | 'body' | 'tone', value: string) => {
    setGeneratedSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, [field]: field === 'tone' ? value as ToneType : value } : s
    ));
  };

  const insertTag = (stepId: string, tag: string) => {
    setGeneratedSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, body: s.body + ' ' + tag } : s
    ));
  };

  const copyStep = (s: EmailStep) => {
    navigator.clipboard.writeText(`Subject: ${s.subject}\n\n${s.body}`);
  };

  const stepLabels = ['Define Audience', 'Set Goals', 'AI Generation', 'Customization'];

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="flex items-center space-x-2">
        {stepLabels.map((label, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center space-x-2 ${i + 1 <= step ? 'text-indigo-600' : 'text-slate-300'}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                i + 1 < step ? 'bg-indigo-600 text-white' :
                i + 1 === step ? 'bg-indigo-50 text-indigo-600 border-2 border-indigo-200' :
                'bg-slate-50 text-slate-300 border border-slate-200'
              }`}>
                {i + 1 < step ? <CheckIcon className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-xs font-bold hidden md:inline">{label}</span>
            </div>
            {i < 3 && <div className={`flex-grow h-0.5 ${i + 1 < step ? 'bg-indigo-600' : 'bg-slate-100'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Define Audience */}
      {step === 1 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 font-heading">Define Your Audience</h3>
              <p className="text-sm text-slate-500 mt-1">Select leads to include in this email sequence.</p>
            </div>
            <button
              onClick={selectAll}
              className="px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
            >
              {selectedLeadIds.length === leads.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
            {leads.map(lead => (
              <button
                key={lead.id}
                onClick={() => toggleLead(lead.id)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                  selectedLeadIds.includes(lead.id)
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                    selectedLeadIds.includes(lead.id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {selectedLeadIds.includes(lead.id) ? <CheckIcon className="w-4 h-4" /> : lead.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{lead.name}</p>
                    <p className="text-xs text-slate-400">{lead.company} &middot; Score: {lead.score}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                  lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-600' :
                  lead.status === 'New' ? 'bg-emerald-50 text-emerald-600' :
                  lead.status === 'Contacted' ? 'bg-amber-50 text-amber-600' :
                  'bg-red-50 text-red-600'
                }`}>{lead.status}</span>
              </button>
            ))}
            {leads.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-400 italic">No leads available. Add leads first.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button onClick={onCancel} className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-400">{selectedLeadIds.length} leads selected</span>
              <button
                onClick={() => setStep(2)}
                disabled={selectedLeadIds.length === 0}
                className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center space-x-2 transition-all ${
                  selectedLeadIds.length > 0
                    ? 'bg-slate-900 text-white hover:bg-indigo-600'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                <span>Next: Set Goals</span>
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Set Goals */}
      {step === 2 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6 animate-in fade-in duration-300">
          <div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Set Sequence Goals</h3>
            <p className="text-sm text-slate-500 mt-1">Configure the objective, length, and cadence of your sequence.</p>
          </div>

          {/* Goal Selection */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conversion Goal</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setConfig({ ...config, goal: g.value as EmailSequenceConfig['goal'] })}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    config.goal === g.value
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <p className={`text-sm font-bold ${config.goal === g.value ? 'text-indigo-700' : 'text-slate-700'}`}>{g.label}</p>
                  <p className="text-xs text-slate-400 mt-1">{g.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Sequence Length */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sequence Length</p>
            <div className="flex space-x-3">
              {[3, 5, 7].map(n => (
                <button
                  key={n}
                  onClick={() => setConfig({ ...config, sequenceLength: n })}
                  className={`px-6 py-3 rounded-xl font-bold text-sm border transition-all ${
                    config.sequenceLength === n
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  {n} Emails
                </button>
              ))}
            </div>
          </div>

          {/* Cadence */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Send Cadence</p>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'daily', label: 'Daily' },
                { value: 'every_2_days', label: 'Every 2 Days' },
                { value: 'every_3_days', label: 'Every 3 Days' },
                { value: 'weekly', label: 'Weekly' }
              ].map(c => (
                <button
                  key={c.value}
                  onClick={() => setConfig({ ...config, cadence: c.value as EmailSequenceConfig['cadence'] })}
                  className={`px-5 py-3 rounded-xl font-bold text-xs border transition-all ${
                    config.cadence === c.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tone</p>
            <div className="flex flex-wrap gap-3">
              {Object.values(ToneType).map(t => (
                <button
                  key={t}
                  onClick={() => setConfig({ ...config, tone: t })}
                  className={`px-5 py-3 rounded-xl font-bold text-xs border transition-all ${
                    config.tone === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tracking */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking</p>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center space-x-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setTrackOpens(!trackOpens)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${trackOpens ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${trackOpens ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs font-bold text-slate-600">Track Opens</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setTrackClicks(!trackClicks)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${trackClicks ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${trackClicks ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs font-bold text-slate-600">Track Clicks</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button onClick={() => setStep(1)} className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 flex items-center space-x-2 transition-colors">
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => { setStep(3); handleGenerate(); }}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-slate-900 text-white hover:bg-indigo-600 flex items-center space-x-2 transition-all"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>Generate Sequence</span>
              <span className="px-1.5 py-0.5 text-[9px] font-black bg-white/20 rounded-md">{CREDIT_COSTS['email_sequence']} cr</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: AI Generation (Loading) */}
      {step === 3 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 animate-in fade-in duration-300">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-indigo-50 rounded-3xl flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 font-heading">Generating Your Sequence</h3>
              <p className="text-sm text-slate-500 mt-2">Crafting {config.sequenceLength} personalized emails for {selectedLeadIds.length} leads...</p>
            </div>
            <div className="flex justify-center space-x-1">
              {Array.from({ length: config.sequenceLength }).map((_, i) => (
                <div key={i} className="w-8 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                </div>
              ))}
            </div>
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
                {error}
                <button onClick={() => { setError(''); handleGenerate(); }} className="ml-3 text-red-700 font-bold underline">Retry</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Customization */}
      {step === 4 && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 font-heading">Customize Your Sequence</h3>
              <p className="text-sm text-slate-500 mt-1">{generatedSteps.length} emails generated. Edit subjects, bodies, and insert personalization tags.</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center space-x-2 transition-colors"
              >
                <ArrowLeftIcon className="w-3 h-3" />
                <span>Re-configure</span>
              </button>
              <button
                onClick={() => rawResponse && onComplete(generatedSteps, rawResponse)}
                className="px-6 py-2.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center space-x-2 transition-colors shadow-lg shadow-indigo-100"
              >
                <CheckIcon className="w-4 h-4" />
                <span>Finalize Sequence</span>
              </button>
            </div>
          </div>

          {generatedSteps.map((emailStep) => (
            <div key={emailStep.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-xs font-black">
                    {emailStep.stepNumber}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">{emailStep.delay}</p>
                    <select
                      value={emailStep.tone}
                      onChange={(e) => updateStep(emailStep.id, 'tone', e.target.value)}
                      className="text-[10px] text-slate-400 bg-transparent border-none outline-none cursor-pointer"
                    >
                      {Object.values(ToneType).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setEditingStepId(editingStepId === emailStep.id ? null : emailStep.id)}
                    className={`p-2 rounded-lg transition-colors ${editingStepId === emailStep.id ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                  >
                    <EditIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => copyStep(emailStep)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {editingStepId === emailStep.id ? (
                  <>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Subject Line</label>
                      <input
                        value={emailStep.subject}
                        onChange={(e) => updateStep(emailStep.id, 'subject', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Email Body</label>
                      <textarea
                        value={emailStep.body}
                        onChange={(e) => updateStep(emailStep.id, 'body', e.target.value)}
                        rows={8}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium leading-relaxed focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Insert Tag</label>
                      <div className="flex flex-wrap gap-2">
                        {PERSONALIZATION_TAGS.map(tag => (
                          <button
                            key={tag.key}
                            onClick={() => insertTag(emailStep.id, tag.key)}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                          >
                            {tag.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center space-x-2">
                      <MailIcon className="w-4 h-4 text-slate-300" />
                      <p className="text-sm font-bold text-slate-800">{emailStep.subject}</p>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{emailStep.body}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmailSequenceBuilder;
