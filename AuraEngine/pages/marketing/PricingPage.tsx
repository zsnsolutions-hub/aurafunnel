import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../../components/marketing/Reveal';
import { track } from '../../lib/analytics';
import { PLANS } from '../../lib/credits';

const highlighted = 'Professional';

const PricingPage: React.FC = () => {
  React.useEffect(() => { track('pricing_view'); }, []);

  return (
    <div className="bg-[#0A1628] text-white pt-32 pb-24">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <Reveal>
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
              Pricing
            </p>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight font-heading mb-4">
              Simple pricing. Powerful results.
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Every plan includes a 14-day free trial. No credit card required.
              Upgrade, downgrade, or cancel anytime.
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="grid max-w-5xl mx-auto grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => {
              const isHighlighted = plan.name === highlighted;
              return (
                <div
                  key={plan.name}
                  className={`rounded-2xl p-8 flex flex-col transition-all duration-500 hover:-translate-y-1 ${
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

                  <h3 className="text-lg font-bold font-heading">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mt-1 mb-5">{plan.desc}</p>

                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-4xl font-black font-heading">${plan.price}</span>
                    <span className="text-sm text-slate-500 font-semibold">/month</span>
                  </div>

                  {/* Limits grid */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <div className="bg-white/5 border border-slate-700/50 rounded-lg px-2.5 py-2">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">AI Credits</p>
                      <p className="text-xs font-bold text-white">{plan.credits.toLocaleString()}/mo</p>
                    </div>
                    <div className="bg-white/5 border border-slate-700/50 rounded-lg px-2.5 py-2">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Leads</p>
                      <p className="text-xs font-bold text-white">{plan.leads >= 100000 ? 'Unlimited' : plan.leads.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 border border-slate-700/50 rounded-lg px-2.5 py-2">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Email Credits</p>
                      <p className="text-xs font-bold text-white">{plan.emails.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 border border-slate-700/50 rounded-lg px-2.5 py-2">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Storage</p>
                      <p className="text-xs font-bold text-white">{plan.storage >= 100000 ? '100 GB' : `${(plan.storage / 1000).toFixed(0)} GB`}</p>
                    </div>
                  </div>

                  <Link
                    to="/signup"
                    onClick={() => track('cta_click', { location: 'pricing', tier: plan.name })}
                    className={`block text-center px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 mb-8 ${
                      isHighlighted
                        ? 'bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/25 hover:scale-105 active:scale-95'
                        : 'bg-white/5 border border-slate-700 text-white hover:border-teal-500/40 hover:bg-teal-500/5'
                    }`}
                  >
                    Start Free Trial
                  </Link>

                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-400">
                        <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* FAQ teaser */}
        <Reveal delay={400}>
          <div className="text-center mt-20">
            <p className="text-slate-500 mb-2">
              Have questions?{' '}
              <Link to="/contact" className="text-teal-400 font-bold hover:text-teal-300 transition-colors">
                Talk to us
              </Link>
            </p>
            <p className="text-xs text-slate-600">
              14-day free trial on all plans &middot; No credit card required &middot; Cancel anytime
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

export default PricingPage;
