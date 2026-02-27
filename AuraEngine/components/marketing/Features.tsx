import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" />
      </svg>
    ),
    title: 'Find High-Intent Leads Instantly',
    desc: 'Detect buying signals from job changes, funding rounds, tech installs, and content engagement — before your competitors even know.',
    color: 'teal',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Score Every Lead Automatically',
    desc: 'AI scores leads in real-time using 50+ behavioral signals. Surface the hottest opportunities first so reps never waste time.',
    color: 'indigo',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    title: 'Personalize Outreach at Scale',
    desc: 'Auto-generate hyper-relevant emails, LinkedIn messages, and call scripts unique to every prospect — across every channel.',
    color: 'purple',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
    title: 'Optimize Campaigns Continuously',
    desc: 'AI learns what works — adjusting timing, messaging, and channels automatically to maximize your conversion rate.',
    color: 'emerald',
  },
];

const colorMap: Record<string, { icon: string; border: string; glow: string }> = {
  teal: { icon: 'text-teal-400', border: 'hover:border-teal-500/30', glow: 'bg-teal-500/10 group-hover:bg-teal-500/20' },
  indigo: { icon: 'text-indigo-400', border: 'hover:border-indigo-500/30', glow: 'bg-indigo-500/10 group-hover:bg-indigo-500/20' },
  purple: { icon: 'text-purple-400', border: 'hover:border-purple-500/30', glow: 'bg-purple-500/10 group-hover:bg-purple-500/20' },
  emerald: { icon: 'text-emerald-400', border: 'hover:border-emerald-500/30', glow: 'bg-emerald-500/10 group-hover:bg-emerald-500/20' },
};

const Features: React.FC = () => (
  <section id="features" className="py-24 lg:py-32">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
            The Intelligence Layer
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Everything you need to close more deals
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Scaliyo unifies lead finding, enrichment, outreach, and analytics into
            a single AI-powered growth engine.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((f, i) => {
          const c = colorMap[f.color];
          return (
            <Reveal key={f.title} delay={i * 120}>
              <div
                className={`bg-[#0F1D32] rounded-2xl border border-slate-800 p-8 lg:p-10 h-full group ${c.border} hover:-translate-y-1 transition-all duration-500 relative overflow-hidden`}
              >
                <div className="relative z-10">
                  <div className={`w-12 h-12 rounded-xl ${c.glow} flex items-center justify-center mb-5 transition-colors duration-500`}>
                    <span className={c.icon}>{f.icon}</span>
                  </div>
                  <h3 className="text-2xl font-bold font-heading mb-3">{f.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
                <div className={`absolute -bottom-20 -right-20 w-64 h-64 rounded-full ${c.glow} blur-3xl transition-all duration-700`} />
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={500}>
        <div className="text-center mt-12">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'features', label: 'start_free_trial' })}
            className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            Try all features free for 14 days &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default Features;
