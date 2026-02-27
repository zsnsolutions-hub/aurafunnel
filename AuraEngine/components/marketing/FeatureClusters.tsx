import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

interface Tab {
  key: string;
  label: string;
  headline: string;
  description: string;
  features: { name: string; desc: string }[];
}

const tabs: Tab[] = [
  {
    key: 'find',
    label: 'FIND',
    headline: 'Find your best prospects',
    description: 'Stop guessing who to target. Let AI surface the accounts and contacts most likely to buy — before your competitors find them.',
    features: [
      { name: 'AI Prospect Discovery', desc: 'Automatically surface high-fit accounts from 200M+ contacts.' },
      { name: 'Deep Research Profiles', desc: 'AI-generated intel briefs on every prospect in 90 seconds.' },
      { name: 'Data Enrichment', desc: 'Real-time verified emails, phones, tech stack, and firmographics.' },
      { name: 'Intent Signal Tracking', desc: '50+ buying signals tracked across the web in real-time.' },
    ],
  },
  {
    key: 'engage',
    label: 'ENGAGE',
    headline: 'Engage on every channel',
    description: 'Reach prospects where they are with AI-crafted messages that sound human, not robotic. Every touchpoint is personalized.',
    features: [
      { name: 'AI-Written Sequences', desc: 'Multi-step outreach crafted by AI, personalized per prospect.' },
      { name: 'Multi-Channel Orchestration', desc: 'Email, LinkedIn, calls, and SMS in one unified workflow.' },
      { name: 'Smart Follow-Ups', desc: 'AI adapts follow-up timing and messaging based on engagement.' },
      { name: 'Content Personalization Engine', desc: 'Dynamic content blocks that change per recipient.' },
    ],
  },
  {
    key: 'close',
    label: 'CLOSE',
    headline: 'Close with intelligence',
    description: 'Know which deals to focus on and exactly what to do next. AI turns pipeline chaos into a predictable revenue machine.',
    features: [
      { name: 'Predictive Lead Scoring', desc: 'AI scores every lead using 50+ signals with 94% accuracy.' },
      { name: 'Pipeline Intelligence', desc: 'Real-time visibility into deal health and next best actions.' },
      { name: 'Deal Recommendations', desc: 'AI suggests which deals to prioritize and what moves to make.' },
      { name: 'Revenue Forecasting', desc: 'Predictive forecasting that gets more accurate every week.' },
    ],
  },
  {
    key: 'scale',
    label: 'SCALE',
    headline: 'Scale without headcount',
    description: 'Do the work of a team twice your size. Automate the repetitive, focus your people on what humans do best — building relationships.',
    features: [
      { name: 'Workflow Automation', desc: 'Automate lead routing, task creation, and data syncing.' },
      { name: 'Team Collaboration', desc: 'Shared templates, playbooks, and real-time activity feeds.' },
      { name: 'Campaign Analytics', desc: 'Deep performance insights across every campaign and channel.' },
      { name: 'Integration Hub', desc: '20+ native integrations with your existing sales stack.' },
    ],
  },
];

const FeatureClusters: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const tab = tabs[activeTab];

  return (
    <section id="features" className="py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6">
        <Reveal>
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
              The Platform
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
              One platform for the entire revenue cycle
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Stop stitching together 6 tools that don&rsquo;t talk to each other.
            </p>
          </div>
        </Reveal>

        {/* Desktop tabs */}
        <Reveal delay={150}>
          <div className="hidden md:flex justify-center gap-2 mb-12">
            {tabs.map((t, i) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(i)}
                className={`px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                  activeTab === i
                    ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/25'
                    : 'bg-[#0F1D32] border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Desktop tab content */}
        <div className="hidden md:block">
          <div className="grid grid-cols-2 gap-10 items-start">
            <div>
              <h3 className="text-2xl font-bold font-heading mb-4">{tab.headline}</h3>
              <p className="text-slate-400 leading-relaxed mb-8">{tab.description}</p>
              <div className="space-y-4">
                {tab.features.map((f) => (
                  <div key={f.name} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-white">{f.name}</p>
                      <p className="text-sm text-slate-500">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Contextual mockup placeholder */}
            <div className="bg-[#0F1D32] rounded-2xl border border-slate-700/50 p-8 flex items-center justify-center min-h-[320px]">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-black text-teal-400 font-heading">{tab.label[0]}</span>
                </div>
                <p className="text-lg font-bold text-white mb-2">{tab.headline}</p>
                <p className="text-sm text-slate-500">Scaliyo {tab.label.toLowerCase()} module</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile accordion */}
        <div className="md:hidden space-y-3">
          {tabs.map((t, i) => {
            const isOpen = activeTab === i;
            return (
              <div key={t.key} className="bg-[#0F1D32] border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setActiveTab(i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-bold text-white">{t.label}: {t.headline}</span>
                  <svg
                    className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className="grid transition-all duration-300 ease-in-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-5">
                      <p className="text-slate-400 text-sm mb-4">{t.description}</p>
                      <div className="space-y-3">
                        {t.features.map((f) => (
                          <div key={f.name} className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                              <p className="text-sm font-semibold text-white">{f.name}</p>
                              <p className="text-xs text-slate-500">{f.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Reveal delay={400}>
          <div className="text-center mt-12">
            <Link
              to="/signup"
              onClick={() => track('cta_click', { location: 'feature_clusters', label: 'try_all_features' })}
              className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
            >
              Try all features free for 14 days &rarr;
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default FeatureClusters;
