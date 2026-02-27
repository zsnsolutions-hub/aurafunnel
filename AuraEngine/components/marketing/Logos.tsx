import React from 'react';
import Reveal from './Reveal';

const companies = ['Stackline', 'Nuvio', 'Meridian', 'DataSync', 'TechFlow', 'Cloudshift'];

const Logos: React.FC = () => (
  <section id="logos" className="py-12 lg:py-16">
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal>
        <div className="flex flex-col items-center">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-[0.25em] mb-8">
            Trusted by 2,400+ revenue teams worldwide
          </p>
          <div className="flex items-center gap-8 lg:gap-14 flex-wrap justify-center opacity-40">
            {companies.map((name) => (
              <span key={name} className="text-sm font-bold text-slate-400 tracking-wide">
                {name}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

export default Logos;
