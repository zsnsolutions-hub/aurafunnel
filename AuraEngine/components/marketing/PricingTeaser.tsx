import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const plans = [
  { name: 'Starter', price: 29, popular: false },
  { name: 'Growth', price: 79, popular: true },
  { name: 'Scale', price: 199, popular: false },
];

const PricingTeaser: React.FC = () => (
  <section id="pricing" className="py-24 lg:py-32 border-y border-slate-800/60">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading text-center mb-16">
          Invest in Revenue, Not Overhead
        </h2>
      </Reveal>

      <div className="flex flex-col sm:flex-row items-stretch justify-center gap-5 max-w-3xl mx-auto mb-10">
        {plans.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 100}>
            <div
              className={`flex-1 min-w-[200px] rounded-2xl p-8 text-center transition-all duration-500 ${
                plan.popular
                  ? 'bg-gradient-to-b from-teal-500/10 to-[#0F1D32] border-2 border-teal-500/30 shadow-xl shadow-teal-500/10 -translate-y-1'
                  : 'bg-[#0F1D32] border border-slate-800'
              }`}
            >
              {plan.popular && (
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-3 block">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold font-heading mb-2">{plan.name}</h3>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-black font-heading">${plan.price}</span>
                <span className="text-sm text-slate-500">/mo</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={400}>
        <p className="text-center text-slate-400 text-sm mb-8">
          All plans include AI-powered outreach. Upgrade anytime.
        </p>
        <div className="text-center">
          <Link
            to="/pricing"
            onClick={() => track('cta_click', { location: 'pricing_teaser', label: 'view_pricing' })}
            className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            View Pricing &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default PricingTeaser;
