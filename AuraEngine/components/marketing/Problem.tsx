import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const painPoints = [
  {
    stat: '67%',
    title: 'Leads Die in Your Pipeline',
    body: "of leads go cold because reps can't prioritize fast enough.",
  },
  {
    stat: '40%',
    title: 'Reps Chase the Wrong Deals',
    body: 'of sales time is wasted on unqualified prospects that never close.',
  },
  {
    stat: '<2%',
    title: 'Outreach Gets Ignored',
    body: "reply rate on generic outreach — your messages sound like everyone else's.",
  },
];

const Problem: React.FC = () => (
  <section id="problem" className="py-24 lg:py-32 border-y border-slate-800/60">
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-red-400/80 uppercase tracking-[0.25em] mb-4">
            The Problem
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Your pipeline is leaking revenue
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Most sales teams lose deals they should have won — not because the
            product is wrong, but because the process is broken.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {painPoints.map((pain, i) => (
          <Reveal key={pain.title} delay={i * 150}>
            <div className="bg-[#0F1D32] rounded-2xl border border-red-500/10 p-8 relative overflow-hidden group hover:border-red-500/20 transition-all duration-500">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-5">
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-heading mb-3">{pain.title}</h3>
              <p className="text-slate-400 leading-relaxed mb-6">{pain.body}</p>
              <p className="text-3xl font-black text-red-400/70 font-heading">{pain.stat}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Inline CTA */}
      <Reveal delay={500}>
        <div className="text-center mt-12">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'problem', label: 'start_free_trial' })}
            className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            Fix your pipeline today &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default Problem;
