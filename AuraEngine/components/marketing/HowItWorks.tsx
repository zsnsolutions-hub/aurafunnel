import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const steps = [
  { num: '01', title: 'Connect', desc: 'Plug in your CRM and inbox in a couple of clicks. No IT ticket required.' },
  { num: '02', title: 'AI researches & scores', desc: 'Every lead is enriched and ranked across 50+ buying signals in real time.' },
  { num: '03', title: 'Launch & close', desc: 'Personalized outreach goes out with smart, on-brand follow-ups.' },
];

const HowItWorks: React.FC = () => (
  <section id="how-it-works" className="py-24 lg:py-32 bg-[#F5F2EB] border-y border-[#EDE7DB]">
    <div className="max-w-[1180px] mx-auto px-6">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
          <p className="eyebrow text-teal-700 mb-5">How it works</p>
          <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
            From zero to pipeline in three moves
          </h2>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {steps.map((s, i) => (
          <Reveal key={s.num} delay={i * 150}>
            <div className="h-full rounded-[1.5rem] border border-[#EAE3D6] bg-white p-8 shadow-chic-sm">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full border border-[#EAE3D6] bg-[#FBFAF7] font-display text-lg font-semibold text-teal-700 mb-6">
                {s.num}
              </span>
              <h3 className="font-display text-2xl font-medium text-[#1C1A17] mb-3">{s.title}</h3>
              <p className="text-[15px] text-[#6F6860] leading-relaxed">{s.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={500}>
        <div className="text-center mt-14">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'how_it_works', label: 'start_free_trial' })}
            className="group inline-flex items-center px-8 py-3.5 bg-[#1C1A17] text-white rounded-full font-semibold text-[15px] transition-all duration-300 hover:bg-black hover:-translate-y-0.5 shadow-chic"
          >
            Start free
            <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default HowItWorks;
