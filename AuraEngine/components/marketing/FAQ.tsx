import React, { useState } from 'react';
import Reveal from './Reveal';

const faqs = [
  { q: 'How long does setup take?', a: 'Under 5 minutes. Connect your CRM, invite your team, and the AI starts scoring leads right away.' },
  { q: 'Do I need a credit card to start?', a: 'No. Start free with just a work email — no card required until you decide to upgrade.' },
  { q: 'You look brand new — is Scaliyo ready to use?', a: 'Yes. Scaliyo is in early access: the core engine (discovery, scoring, and outreach) is live today, and we ship improvements weekly alongside our first cohort of teams.' },
  { q: 'Which tools do you integrate with?', a: 'Native integrations for Salesforce, HubSpot, Pipedrive, Gmail, LinkedIn, Slack and more, with new connectors added regularly.' },
  { q: 'Is my data secure?', a: 'Data is encrypted in transit (TLS 1.3) and at rest (AES-256). We follow SOC 2 practices and are GDPR-aligned, and we never sell your data.' },
  { q: 'Can I cancel anytime?', a: 'Always. No contracts and no penalties — change or cancel your plan whenever you like.' },
];

const FAQ: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-6">
        <Reveal>
          <div className="text-center mb-14">
            <p className="eyebrow text-teal-700 mb-5">Questions</p>
            <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
              Good to know
            </h2>
          </div>
        </Reveal>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <Reveal key={i} delay={i * 60}>
                <div className="bg-white border border-[#EAE3D6] rounded-2xl overflow-hidden transition-colors duration-300 hover:border-[#D9D0C0] shadow-chic-sm">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="font-semibold text-[#1C1A17] pr-4">{faq.q}</span>
                    <svg
                      className={`w-5 h-5 text-[#B0A798] shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className="grid transition-all duration-300 ease-in-out"
                    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 text-[#6F6860] leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
