import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';
import { CREDIT_LIMITS } from '../../config/creditLimits';

const plans = [
  { name: 'Free', price: 0, popular: false, aiCredits: CREDIT_LIMITS.free },
  { name: 'Starter', price: 29, popular: false, aiCredits: CREDIT_LIMITS.starter },
  { name: 'Growth', price: 79, popular: true, aiCredits: CREDIT_LIMITS.growth },
  { name: 'Scale', price: 199, popular: false, aiCredits: CREDIT_LIMITS.scale },
];

const PricingTeaser: React.FC = () => (
  <section id="pricing" className="py-24 lg:py-32 bg-[#F5F2EB] border-y border-[#EDE7DB]">
    <div className="max-w-[1180px] mx-auto px-6">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="eyebrow text-teal-700 mb-5">Pricing</p>
          <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
            Start free. Scale when it&rsquo;s working.
          </h2>
        </div>
      </Reveal>

      <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4 max-w-4xl mx-auto mb-10">
        {plans.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 100} className="flex-1">
            <div
              className={`h-full rounded-[1.5rem] p-7 text-center transition-all duration-300 ${
                plan.popular
                  ? 'bg-white border-2 border-teal-600/40 shadow-chic -translate-y-1'
                  : 'bg-white/70 border border-[#EAE3D6] shadow-chic-sm'
              }`}
            >
              {plan.popular && (
                <span className="inline-block eyebrow text-teal-700 mb-3">Most popular</span>
              )}
              <h3 className="font-display text-lg font-medium text-[#1C1A17] mb-2">{plan.name}</h3>
              <div className="flex items-baseline justify-center gap-1">
                <span className="font-display text-4xl font-medium text-[#1C1A17]">{plan.price === 0 ? 'Free' : `$${plan.price}`}</span>
                {plan.price > 0 && <span className="text-sm text-[#9A9189]">/mo</span>}
              </div>
              <p className="text-xs text-[#9A9189] mt-2">{plan.aiCredits.toLocaleString()} AI credits</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={400}>
        <p className="text-center text-[#6F6860] text-sm mb-7">
          Every plan includes AI-powered outreach. Upgrade or cancel anytime.
        </p>
        <div className="text-center">
          <Link
            to="/pricing"
            onClick={() => track('cta_click', { location: 'pricing_teaser', label: 'view_pricing' })}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition-colors"
          >
            Compare plans &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default PricingTeaser;
