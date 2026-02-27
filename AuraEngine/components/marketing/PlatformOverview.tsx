import React from 'react';
import Reveal from './Reveal';

const capabilities = [
  'AI Prospect Discovery',
  'Deep Research Profiles',
  'Predictive Lead Scoring',
  'Hyper-Personalized Sequences',
  'Smart Follow-Ups',
  'Pipeline Intelligence',
];

const PlatformOverview: React.FC = () => (
  <section id="platform" className="py-24 lg:py-32">
    <div className="max-w-[1400px] mx-auto px-6">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-14">
            One AI Engine.{' '}
            <span className="text-teal-400">Find. Engage. Close.</span>
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-5 text-left inline-grid">
            {capabilities.map((c) => (
              <div key={c} className="flex items-center gap-3">
                <svg className="w-5 h-5 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-lg text-slate-300 font-medium">{c}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);

export default PlatformOverview;
