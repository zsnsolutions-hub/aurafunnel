import React from 'react';
import Reveal from './Reveal';

// Honest new-startup framing: instead of borrowed customer logos, show the
// stack Scaliyo plugs into — real, verifiable, and it signals capability.
const integrations = ['Salesforce', 'HubSpot', 'Pipedrive', 'Gmail', 'LinkedIn', 'Slack'];

const Logos: React.FC = () => (
  <section id="logos" className="py-16 lg:py-20 border-y border-[#EDE7DB]">
    <div className="max-w-[1180px] mx-auto px-6">
      <Reveal>
        <p className="text-center eyebrow text-[#B0A798] mb-9">
          Works with the tools your team already lives in
        </p>
        <div className="flex items-center gap-x-10 gap-y-5 lg:gap-x-16 flex-wrap justify-center">
          {integrations.map((name) => (
            <span
              key={name}
              className="text-base font-display font-medium text-[#8A8178] tracking-tight hover:text-[#1C1A17] transition-colors duration-300"
            >
              {name}
            </span>
          ))}
        </div>
      </Reveal>
    </div>
  </section>
);

export default Logos;
