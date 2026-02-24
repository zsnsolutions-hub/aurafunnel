import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const faqs = [
  {
    q: 'How much does Scaliyo cost?',
    a: 'We offer a generous free tier for small teams. Paid plans start at $49/month per seat with volume discounts. All plans include a 14-day free trial.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. You can start your free trial with just an email address. No credit card required — ever — until you decide to upgrade.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most teams are fully onboarded in under 5 minutes. Connect your CRM, invite your team, and AI begins scoring immediately.',
  },
  {
    q: 'How accurate is the AI scoring?',
    a: 'Our scoring engine achieves 94% accuracy on average, validated against historical close data. Accuracy improves over time as the model learns your patterns.',
  },
  {
    q: 'Which CRMs do you integrate with?',
    a: 'Native integrations with Salesforce, HubSpot, Pipedrive, Slack, Gmail, Zapier, Stripe, Notion, and more. Our API supports custom integrations.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. Scaliyo is SOC 2 Type II certified and GDPR compliant. All data is encrypted at rest and in transit.',
  },
];

const FAQ: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section className="py-24 lg:py-32 border-t border-slate-800/60">
      <div className="max-w-3xl mx-auto px-6">
        <Reveal>
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
              Frequently asked questions
            </h2>
            <p className="text-lg text-slate-400">
              Everything you need to know to get started.
            </p>
          </div>
        </Reveal>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <Reveal key={i} delay={i * 80}>
                <div className="bg-[#0F1D32] border border-slate-800 rounded-xl overflow-hidden transition-colors duration-300 hover:border-slate-700">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="font-semibold text-white pr-4">{faq.q}</span>
                    <svg
                      className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
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

        <Reveal delay={500}>
          <div className="text-center mt-12">
            <Link
              to="/signup"
              onClick={() => track('cta_click', { location: 'faq', label: 'start_free_trial' })}
              className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
            >
              Still have questions? Start free and see for yourself &rarr;
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default FAQ;
