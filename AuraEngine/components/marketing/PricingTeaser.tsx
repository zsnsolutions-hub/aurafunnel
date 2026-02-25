import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';
import { PLANS } from '../../lib/credits';

const highlighted = 'Professional';

const PricingTeaser: React.FC = () => (
  <section className="py-24 lg:py-32">
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
            Pricing
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Simple pricing. Powerful results.
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Every plan includes a 14-day free trial. No credit card required.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {PLANS.map((plan, i) => {
          const isHighlighted = plan.name === highlighted;
          return (
            <Reveal key={plan.name} delay={i * 150}>
              <div
                className={`rounded-2xl p-8 flex flex-col h-full transition-all duration-500 hover:-translate-y-1 ${
                  isHighlighted
                    ? 'bg-gradient-to-b from-teal-500/10 to-[#0F1D32] border-2 border-teal-500/30 shadow-xl shadow-teal-500/10 relative'
                    : 'bg-[#0F1D32] border border-slate-800 hover:border-slate-700'
                }`}
              >
                {isHighlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold bg-teal-500 text-white px-4 py-1 rounded-full shadow-lg">
                    Most popular
                  </span>
                )}

                <h3 className="text-lg font-bold font-heading mb-1">{plan.name}</h3>
                <p className="text-sm text-slate-500 mb-5">{plan.desc}</p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-black font-heading">${plan.price}</span>
                  <span className="text-sm text-slate-500 font-semibold">/month</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start gap-2.5 text-sm text-slate-400">
                    <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {plan.credits.toLocaleString()} AI credits/mo
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-slate-400">
                    <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {plan.leads >= 100000 ? 'Unlimited' : plan.leads.toLocaleString()} leads
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-slate-400">
                    <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {plan.emails.toLocaleString()} email credits
                  </li>
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-400">
                      <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/signup"
                  onClick={() => track('cta_click', { location: 'pricing_teaser', tier: plan.name })}
                  className={`block text-center px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                    isHighlighted
                      ? 'bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/25 hover:scale-105 active:scale-95'
                      : 'bg-white/5 border border-slate-700 text-white hover:border-teal-500/40 hover:bg-teal-500/5'
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={500}>
        <div className="text-center mt-10">
          <Link
            to="/pricing"
            onClick={() => track('cta_click', { location: 'pricing_teaser', label: 'see_all_plans' })}
            className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            Compare all plans in detail &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default PricingTeaser;
