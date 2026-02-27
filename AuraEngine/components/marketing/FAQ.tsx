import React, { useState } from 'react';
import Reveal from './Reveal';

const faqs = [
  { q: 'How long does setup take?', a: 'Under 5 minutes. Connect your CRM, invite your team, and AI starts scoring immediately.' },
  { q: 'Do I need a credit card to start?', a: 'No. Start your free trial with just a work email. No credit card required until you upgrade.' },
  { q: 'How accurate is the AI scoring?', a: '94% accuracy on average, validated against historical close data. Improves over time as the model learns your patterns.' },
  { q: 'Which CRMs do you integrate with?', a: '20+ native integrations including Salesforce, HubSpot, Pipedrive, Gmail, LinkedIn, Slack, and more.' },
  { q: 'Is my data secure?', a: 'SOC 2 Type II certified, GDPR compliant. All data encrypted with AES-256 at rest and TLS 1.3 in transit.' },
  { q: 'Can I cancel anytime?', a: 'Yes. No contracts, no penalties. Cancel or change plans at any time.' },
];

const FAQ: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-6">
        <Reveal>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading text-center mb-14">
            Frequently Asked Questions
          </h2>
        </Reveal>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <Reveal key={i} delay={i * 60}>
                <div className="bg-[#0F1D32] border border-slate-800 rounded-xl overflow-hidden transition-colors duration-300 hover:border-slate-700">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="font-semibold text-white pr-4">{faq.q}</span>
                    <svg
                      className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
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
                      <p className="px-6 pb-5 text-slate-400 leading-relaxed">{faq.a}</p>
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
