import React from 'react';
import Reveal from './Reveal';

const companies = ['Stackline', 'Nuvio', 'Meridian', 'DataSync', 'TechFlow', 'Cloudshift'];

const Logos: React.FC = () => (
  <section id="logos" className="py-14 lg:py-20">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <p className="text-center text-xs font-bold text-slate-600 uppercase tracking-[0.25em] mb-8">
          Trusted by 2,400+ revenue teams
        </p>
        <div className="flex items-center gap-8 lg:gap-16 flex-wrap justify-center opacity-40">
          {companies.map((name) => (
            <span key={name} className="text-sm font-bold text-slate-400 tracking-wide">
              {name}
            </span>
          ))}
        </div>
      </Reveal>
    </div>
  </section>
);

export default Logos;
