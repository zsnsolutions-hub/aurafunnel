import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { User } from '../../types';

// ─── Constants ───

const ROLES = [
  { id: 'sdr', label: 'SDR / BDR', desc: 'Outbound prospecting & pipeline', icon: '🎯' },
  { id: 'revops', label: 'RevOps', desc: 'Revenue operations & analytics', icon: '⚙️' },
  { id: 'agency', label: 'Agency', desc: 'Managing multiple client accounts', icon: '🏢' },
  { id: 'founder', label: 'Founder', desc: 'Building & scaling the business', icon: '🚀' },
];

const TEAM_SIZES = ['Just me', '2-5', '6-20', '20+'];

const INDUSTRIES = [
  'SaaS / Software', 'Marketing Agency', 'Consulting', 'E-commerce',
  'Financial Services', 'Healthcare', 'Real Estate', 'Education',
  'Manufacturing', 'Media / Publishing', 'Other',
];

const GOALS = [
  { id: 'leads', label: 'More Leads', desc: 'Find and capture quality prospects', icon: '📈' },
  { id: 'scoring', label: 'Better Scoring', desc: 'AI-powered lead qualification', icon: '🧠' },
  { id: 'outreach', label: 'Faster Outreach', desc: 'Automate emails & follow-ups', icon: '⚡' },
  { id: 'pipeline', label: 'Pipeline Visibility', desc: 'Track deals end-to-end', icon: '📊' },
];

const PROCESSING_LINES = [
  'Analyzing your business profile…',
  'Configuring AI models for your industry…',
  'Setting up lead scoring algorithms…',
  'Workspace ready — let\'s go!',
];

// ─── Component ───

interface OnboardingPageProps {
  user: User;
  refreshProfile: () => Promise<void>;
}

const OnboardingPage: React.FC<OnboardingPageProps> = ({ user, refreshProfile }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1
  const [role, setRole] = useState('');
  const [teamSize, setTeamSize] = useState('');

  // Step 2
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [industry, setIndustry] = useState('');

  // Step 3
  const [goal, setGoal] = useState('');

  // Step 4 (processing)
  const [processingLine, setProcessingLine] = useState(0);
  const [saving, setSaving] = useState(false);

  const totalSteps = 4; // 0-3

  const canNext = useCallback(() => {
    if (step === 0) return !!role && !!teamSize;
    if (step === 1) return !!companyName;
    if (step === 2) return !!goal;
    return false;
  }, [step, role, teamSize, companyName, goal]);

  const skip = useCallback(() => {
    localStorage.setItem('scaliyo_onboarding_complete', 'true');
    navigate('/portal', { replace: true });
  }, [navigate]);

  const saveAndFinish = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    // Store UI-only metadata
    localStorage.setItem('scaliyo_onboarding_role', role);
    localStorage.setItem('scaliyo_onboarding_goal', goal);
    localStorage.setItem('scaliyo_onboarding_complete', 'true');
    localStorage.setItem('scaliyo_onboarding_ts', new Date().toISOString());

    // Save business data to Supabase
    try {
      const patch: Record<string, unknown> = {
        companyName,
        teamSize,
        industry: industry || undefined,
      };
      if (companyWebsite) patch.companyWebsite = companyWebsite;

      // Merge with existing businessProfile
      const existing = user.businessProfile ?? {};
      const merged = { ...existing, ...patch };

      await supabase
        .from('profiles')
        .update({ businessProfile: merged })
        .eq('id', user.id);

      await refreshProfile();
    } catch (err) {
      console.warn('Onboarding save failed:', err);
    }

    navigate('/portal', { replace: true });
  }, [saving, role, goal, companyName, companyWebsite, industry, teamSize, user, refreshProfile, navigate]);

  // Processing animation (step 3)
  useEffect(() => {
    if (step !== 3) return;
    setProcessingLine(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    PROCESSING_LINES.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setProcessingLine(i), i * 1000));
    });
    // Finish after all lines shown
    timers.push(setTimeout(() => saveAndFinish(), PROCESSING_LINES.length * 1000));
    return () => timers.forEach(clearTimeout);
  }, [step, saveAndFinish]);

  const next = () => {
    if (step < totalSteps - 1) setStep(step + 1);
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  // ─── Render helpers ───

  const renderProgressDots = () => (
    <div className="flex items-center space-x-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === step ? 'w-8 bg-teal-400' : i < step ? 'w-2 bg-teal-400/60' : 'w-2 bg-slate-600'
          }`}
        />
      ))}
    </div>
  );

  const renderStep0 = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">What's your role?</h2>
        <p className="text-slate-400">Help us tailor your experience</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRole(r.id)}
            className={`p-5 rounded-2xl border text-left transition-all duration-200 ${
              role === r.id
                ? 'border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/10'
                : 'border-slate-700/50 bg-white/5 hover:border-slate-600 hover:bg-white/[0.07]'
            }`}
          >
            <span className="text-2xl">{r.icon}</span>
            <h3 className="text-white font-semibold mt-3">{r.label}</h3>
            <p className="text-slate-400 text-sm mt-1">{r.desc}</p>
          </button>
        ))}
      </div>

      <div>
        <h3 className="text-white font-semibold mb-3">Team size</h3>
        <div className="flex flex-wrap gap-3">
          {TEAM_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setTeamSize(s)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                teamSize === s
                  ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                  : 'bg-white/5 text-slate-300 border border-slate-700/50 hover:border-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Tell us about your company</h2>
        <p className="text-slate-400">We'll use this to personalize your AI</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Company name *</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Inc."
            className="w-full px-4 py-3 bg-white/5 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Website URL</label>
          <input
            type="url"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            placeholder="https://acme.com"
            className="w-full px-4 py-3 bg-white/5 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Industry</label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors appearance-none"
          >
            <option value="" className="bg-slate-800">Select industry…</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind} className="bg-slate-800">{ind}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">What's your primary goal?</h2>
        <p className="text-slate-400">We'll prioritize features for you</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGoal(g.id)}
            className={`p-5 rounded-2xl border text-left transition-all duration-200 ${
              goal === g.id
                ? 'border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/10'
                : 'border-slate-700/50 bg-white/5 hover:border-slate-600 hover:bg-white/[0.07]'
            }`}
          >
            <span className="text-2xl">{g.icon}</span>
            <h3 className="text-white font-semibold mt-3">{g.label}</h3>
            <p className="text-slate-400 text-sm mt-1">{g.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in duration-700 py-12">
      {/* Spinner */}
      <div className="relative">
        <div className="w-20 h-20 border-4 border-slate-700 border-t-teal-400 rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 bg-teal-500/20 rounded-full animate-pulse" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Setting up your workspace</h2>
        <p className="text-slate-400">This will only take a moment…</p>
      </div>

      <div className="space-y-3 w-full max-w-sm">
        {PROCESSING_LINES.map((line, i) => (
          <div
            key={i}
            className={`flex items-center space-x-3 transition-all duration-500 ${
              i <= processingLine ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${
              i < processingLine
                ? 'bg-teal-500'
                : i === processingLine
                ? 'bg-teal-500/30 animate-pulse'
                : 'bg-slate-700'
            }`}>
              {i < processingLine && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
            <span className={`text-sm ${i <= processingLine ? 'text-slate-200' : 'text-slate-500'}`}>
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-10 py-6">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-indigo-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-sm">S</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Scaliyo</span>
        </div>
        {step < 3 && (
          <button
            onClick={skip}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Skip for now
          </button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 md:px-10 pb-10">
        <div className="w-full max-w-xl">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>

      {/* Footer */}
      {step < 3 && (
        <footer className="flex items-center justify-between px-6 md:px-10 py-6 border-t border-slate-800/50">
          {renderProgressDots()}
          <div className="flex items-center space-x-3">
            {step > 0 && (
              <button
                onClick={back}
                className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              disabled={!canNext()}
              className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                canNext()
                  ? 'bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/20'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              {step === 2 ? 'Finish Setup' : 'Next'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default OnboardingPage;
