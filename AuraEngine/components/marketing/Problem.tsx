import React from 'react';
import Reveal from './Reveal';

const bullets = [
  'Reps waste hours researching manually',
  'High-intent buyers go unnoticed',
  'Generic outreach gets ignored',
  'Forecasting feels like guesswork',
];

const Problem: React.FC = () => (
  <section id="problem" className="py-24 lg:py-32">
    <div className="max-w-[1400px] mx-auto px-6">
      <div className="max-w-2xl mx-auto text-center">
        <Reveal>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-10">
            Your pipeline isn&rsquo;t broken.
            <br />
            <span className="text-slate-400">Your visibility is.</span>
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <ul className="space-y-4 mb-10 text-left inline-block">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-3 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0" />
                <span className="text-lg">{b}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={300}>
          <p className="text-lg font-semibold text-teal-400">
            Scaliyo fixes this with AI.
          </p>
        </Reveal>
      </div>
    </div>
  </section>
);

export default Problem;
