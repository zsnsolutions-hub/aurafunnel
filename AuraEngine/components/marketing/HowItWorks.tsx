import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const steps = [
  {
    num: '01',
    title: 'Connect',
    desc: 'Sync your CRM and data sources in one click. We support 20+ platforms out of the box.',
  },
  {
    num: '02',
    title: 'Analyze',
    desc: 'Our AI scores, segments, and prioritizes every lead — surfacing buying intent in real time.',
  },
  {
    num: '03',
    title: 'Close',
    desc: 'Launch personalized outreach at scale. Smart follow-ups handle the rest.',
  },
];

const HowItWorks: React.FC = () => (
  <section id="how-it-works" className="py-24 lg:py-32 border-y border-slate-800/60">
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-20">
          <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
            How It Works
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Three steps to predictable revenue
          </h2>
          <p className="text-lg text-slate-400">
            From connected to closing in minutes, not months.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {/* Connecting line */}
        <div className="hidden md:block absolute top-14 left-[18%] right-[18%] h-px bg-gradient-to-r from-teal-500/40 via-cyan-500/40 to-teal-500/40" />

        {steps.map((item, i) => (
          <Reveal key={item.num} delay={i * 200}>
            <div className="text-center relative z-10">
              <div className="mx-auto w-28 h-28 rounded-full border-2 border-teal-500/30 bg-[#0F1D32] flex items-center justify-center mb-8 shadow-lg shadow-teal-500/10">
                <span className="text-2xl font-black font-heading text-teal-400 tracking-tight">
                  {item.num}
                </span>
              </div>
              <h3 className="text-2xl font-bold font-heading mb-3">{item.title}</h3>
              <p className="text-slate-400 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={600}>
        <div className="text-center mt-16">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'how_it_works', label: 'start_free_trial' })}
            className="group inline-flex items-center px-9 py-4 bg-teal-500 text-white rounded-xl font-bold text-lg transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25"
          >
            Start Free Trial
            <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default HowItWorks;
