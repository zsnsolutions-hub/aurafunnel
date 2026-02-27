import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const steps = [
  { num: '01', title: 'Connect', desc: 'Plug in your CRM and email. No IT required.' },
  { num: '02', title: 'AI Researches & Scores', desc: 'Every lead analyzed across 50+ signals.' },
  { num: '03', title: 'Launch & Close', desc: 'Hyper-personalized outreach with smart follow-ups.' },
];

const HowItWorks: React.FC = () => (
  <section id="how-it-works" className="py-24 lg:py-32 border-y border-slate-800/60">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading text-center mb-20">
          From zero to pipeline in three moves
        </h2>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
        {/* Connecting line */}
        <div className="hidden md:block absolute top-12 left-[18%] right-[18%] h-px bg-gradient-to-r from-teal-500/30 via-cyan-500/30 to-teal-500/30" />

        {steps.map((s, i) => (
          <Reveal key={s.num} delay={i * 150}>
            <div className="text-center relative z-10">
              <div className="mx-auto w-24 h-24 rounded-full border-2 border-teal-500/25 bg-[#0F1D32] flex items-center justify-center mb-6 shadow-lg shadow-teal-500/5">
                <span className="text-xl font-black font-heading text-teal-400">{s.num}</span>
              </div>
              <h3 className="text-xl font-bold font-heading mb-3">{s.title}</h3>
              <p className="text-slate-400 max-w-xs mx-auto">{s.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={500}>
        <div className="text-center mt-16">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'how_it_works', label: 'start_free_trial' })}
            className="group inline-flex items-center px-9 py-4 bg-teal-500 text-white rounded-xl font-bold text-lg transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25"
          >
            Start Free Trial
            <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default HowItWorks;
