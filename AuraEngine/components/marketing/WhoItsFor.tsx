import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const personas = [
  {
    role: 'VP of Sales',
    company: '50-500 employees',
    pain: 'Flying blind on pipeline health — deals slip through, forecasts miss, reps waste time on the wrong accounts.',
    solution: 'AI pipeline intelligence gives you real-time deal visibility, predictive forecasting, and prioritized action lists for every rep.',
    tag: 'Hit your forecast within 5%',
  },
  {
    role: 'Head of Growth',
    company: '20-200 employees',
    pain: 'Spending $15K/mo on tools that don\u2019t talk to each other. Data lives in 6 places. Nothing is connected.',
    solution: 'Replace your entire outbound stack with one AI engine. Prospecting, enrichment, outreach, and analytics — unified.',
    tag: 'Cut CAC by 40% in 90 days',
  },
  {
    role: 'SDR Manager',
    company: '10-100 employees',
    pain: '200 emails a day, 3 replies. Your team is burning out on repetitive manual work with diminishing returns.',
    solution: 'AI-personalized sequences in seconds. Smart follow-ups that adapt. Your reps focus on conversations, not copy-pasting.',
    tag: '7x reply rates, zero burnout',
  },
  {
    role: 'RevOps Lead',
    company: '100-1000 employees',
    pain: 'Data scattered across 12 tools. 60% of your time is cleaning, deduping, and reconciling instead of strategizing.',
    solution: 'Unified data layer with one source of truth. Auto-enrichment, real-time sync, and clean data you can actually trust.',
    tag: 'One platform, zero data chaos',
  },
];

const WhoItsFor: React.FC = () => (
  <section id="who-its-for" className="py-24 lg:py-32">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
            Built For You
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Built for the teams that drive revenue
          </h2>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {personas.map((p, i) => (
          <Reveal key={p.role} delay={i * 120}>
            <div className="bg-[#0F1D32] rounded-2xl border border-slate-800 p-8 h-full group hover:border-teal-500/20 transition-all duration-500 relative overflow-hidden">
              <div className="relative z-10">
                {/* Role header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-bold font-heading text-white">{p.role}</h3>
                    <p className="text-xs text-slate-500 font-medium">{p.company}</p>
                  </div>
                </div>

                {/* Pain */}
                <p className="text-slate-400 text-sm leading-relaxed mb-4">{p.pain}</p>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-teal-500/30 to-transparent mb-4" />

                {/* Solution */}
                <p className="text-slate-200 text-sm leading-relaxed font-medium mb-5">{p.solution}</p>

                {/* Tag */}
                <span className="inline-block text-xs font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full">
                  {p.tag}
                </span>
              </div>
              <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-teal-500/5 group-hover:bg-teal-500/10 blur-3xl transition-all duration-700" />
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={500}>
        <div className="text-center mt-12">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'who_its_for', label: 'find_use_case' })}
            className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            Find your use case — start free &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default WhoItsFor;
