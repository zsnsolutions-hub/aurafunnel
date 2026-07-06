import React from 'react';
import Reveal from './Reveal';

const bullets = [
  'Reps burn hours researching prospects by hand',
  'High-intent buyers slip by unnoticed',
  'Generic, copy-paste outreach gets ignored',
  'Forecasting still feels like guesswork',
];

const Problem: React.FC = () => (
  <section id="problem" className="py-24 lg:py-32">
    <div className="max-w-[1180px] mx-auto px-6">
      <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
        <Reveal>
          <div>
            <p className="eyebrow text-teal-700 mb-5">The problem</p>
            <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
              Your pipeline isn&rsquo;t broken.
              <br />
              <span className="text-[#A79E90]">Your visibility is.</span>
            </h2>
            <p className="mt-6 text-lg text-[#6F6860] leading-relaxed max-w-md">
              Modern buyers leave signals everywhere. Most teams simply can&rsquo;t see
              them in time — so the best deals quietly get away.
            </p>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <ul className="space-y-4">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-center gap-4 rounded-2xl border border-[#EDE7DB] bg-white px-5 py-4 shadow-chic-sm"
              >
                <span className="w-6 h-6 shrink-0 rounded-full bg-[#F5E7DF] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#C98A6E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <span className="text-[15px] text-[#4B453E]">{b}</span>
              </li>
            ))}
            <li className="flex items-center gap-4 rounded-2xl border border-teal-600/20 bg-[#EAF2EF] px-5 py-4">
              <span className="w-6 h-6 shrink-0 rounded-full bg-teal-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-[15px] font-semibold text-teal-800">Scaliyo fixes all of this with AI.</span>
            </li>
          </ul>
        </Reveal>
      </div>
    </div>
  </section>
);

export default Problem;
