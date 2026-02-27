import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../../components/marketing/Reveal';
import { track } from '../../lib/analytics';
import { PLANS, ANNUAL_DISCOUNT } from '../../lib/credits';
import { OUTBOUND_LIMITS } from '../../lib/planLimits';

/* ── Comparison table data ────────────────────────────────────────────────── */
type CellValue = string | boolean;
interface ComparisonRow {
  label: string;
  values: [CellValue, CellValue, CellValue];
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Price / month',           values: ['$29', '$79', '$199'] },
  { label: 'Contacts (workspace)',     values: ['1,000', '10,000', '50,000'] },
  { label: 'Storage',                  values: ['1 GB', '10 GB', '50 GB'] },
  { label: 'Users included',           values: ['1', '3', '10'] },
  { label: 'Extra seats',              values: ['$15/seat', '$12/seat', '$8/seat'] },
  { label: 'Max users',                values: ['3', '10', 'Flexible'] },
  { label: 'Email inboxes',            values: ['1', 'Up to 5', 'Up to 15'] },
  { label: 'Email / day',              values: ['40/day', '60/day per inbox', '80/day per inbox'] },
  { label: 'Email / month',            values: ['1,000', '10,000', '50,000'] },
  { label: 'LinkedIn actions / day',   values: ['20', '40', '100'] },
  { label: 'LinkedIn actions / month', values: ['600', '1,200', '3,000'] },
  { label: 'Multi-channel sequences',  values: [true, true, true] },
  { label: 'AI content (Gemini)',      values: [false, true, true] },
  { label: 'Enrichment',               values: [false, true, true] },
  { label: 'Automation',               values: ['Basic', 'Advanced', 'Advanced'] },
  { label: 'Analytics',                values: [false, true, 'Advanced'] },
  { label: 'API & Webhooks',           values: [false, false, true] },
  { label: 'Warm-up',                  values: ['Guidance', 'Automated', 'Advanced + Health'] },
];

const CheckSvg = () => (
  <svg className="w-4 h-4 text-teal-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const XSvg = () => (
  <svg className="w-4 h-4 text-slate-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function renderCell(v: CellValue) {
  if (v === true) return <CheckSvg />;
  if (v === false) return <XSvg />;
  return <span className="text-sm text-slate-300">{v}</span>;
}

/* ── Plan card limit helpers ──────────────────────────────────────────────── */
const PLAN_CARD_META: Record<string, {
  maxUsers: string; extraSeat: string; warmup: string;
}> = {
  Starter: { maxUsers: 'max 3', extraSeat: '+$15/seat', warmup: 'Warm-up guidance (manual)' },
  Growth:  { maxUsers: 'max 10', extraSeat: '+$12/seat', warmup: 'Automated warm-up + ramp-up included' },
  Scale:   { maxUsers: 'flexible', extraSeat: '+$8/seat', warmup: 'Advanced warm-up + inbox health monitoring' },
};

/* ── Component ────────────────────────────────────────────────────────────── */
const PricingPage: React.FC = () => {
  const [isAnnual, setIsAnnual] = useState(false);

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
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
              Every plan includes a 14-day free trial. No credit card required.
              Upgrade, downgrade, or cancel anytime.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-3 bg-[#0F1D32] border border-slate-700 rounded-full px-1.5 py-1.5">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                  !isAnnual ? 'bg-teal-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                  isAnnual ? 'bg-teal-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                Annual
                <span className="ml-1.5 text-xs font-black text-teal-300">-{Math.round(ANNUAL_DISCOUNT * 100)}%</span>
              </button>
            </div>
          </div>
        </Reveal>

        {/* ── Plan cards ──────────────────────────────────────────── */}
        <Reveal delay={200}>
          <div className="grid max-w-5xl mx-auto grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => {
              const isHighlighted = !!plan.popular;
              const displayPrice = isAnnual ? plan.annualPrice : plan.price;
              const outbound = OUTBOUND_LIMITS[plan.name] ?? OUTBOUND_LIMITS.Starter;
              const meta = PLAN_CARD_META[plan.name] ?? PLAN_CARD_META.Starter;

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

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-black font-heading">${displayPrice}</span>
                    <span className="text-sm text-slate-500 font-semibold">/month</span>
                  </div>
                  {isAnnual && (
                    <p className="text-xs text-teal-400 font-bold mb-4">
                      ${(plan.annualPrice * 12).toLocaleString()}/year — save ${((plan.price - plan.annualPrice) * 12).toLocaleString()}
                    </p>
                  )}
                  {!isAnnual && <div className="mb-4" />}

                  {/* Workspace limits */}
                  <div className="mb-4">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Workspace</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Contacts</span><span className="text-white font-semibold">{plan.contacts.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Storage</span><span className="text-white font-semibold">{plan.storage >= 1000 ? `${(plan.storage / 1000).toFixed(0)} GB` : `${plan.storage} MB`}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Users</span><span className="text-white font-semibold">{plan.seats} included <span className="text-slate-500 text-xs">({meta.extraSeat}, {meta.maxUsers})</span></span></div>
                    </div>
                  </div>

                  {/* Email limits */}
                  <div className="mb-4">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Email Sending</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Inboxes</span><span className="text-white font-semibold">{outbound.maxInboxes === 1 ? '1' : `Up to ${outbound.maxInboxes}`}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Daily</span><span className="text-white font-semibold">{outbound.emailsPerDayPerInbox}/day{outbound.maxInboxes > 1 ? ' per inbox' : ''}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Monthly</span><span className="text-white font-semibold">{outbound.emailsPerMonth.toLocaleString()}/mo</span></div>
                    </div>
                  </div>

                  {/* LinkedIn limits */}
                  <div className="mb-4">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">LinkedIn</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Daily</span><span className="text-white font-semibold">{outbound.linkedInPerDay} actions/day</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Monthly</span><span className="text-white font-semibold">{outbound.linkedInPerMonth.toLocaleString()}/mo</span></div>
                    </div>
                  </div>

                  {/* Warm-up */}
                  <div className="mb-6">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Warm-up</p>
                    <p className="text-sm text-slate-300">{meta.warmup}</p>
                  </div>

                  {/* CTA */}
                  <Link
                    to="/signup"
                    onClick={() => track('cta_click', { location: 'pricing', tier: plan.name })}
                    className={`block text-center px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 mb-2 ${
                      isHighlighted
                        ? 'bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/25 hover:scale-105 active:scale-95'
                        : 'bg-white/5 border border-slate-700 text-white hover:border-teal-500/40 hover:bg-teal-500/5'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                  <p className="text-[11px] text-slate-500 text-center mb-6">Free trial. Cancel anytime.</p>

                  {/* Feature list */}
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

        {/* ── Comparison table ────────────────────────────────────── */}
        <Reveal delay={300}>
          <div className="mt-24 max-w-5xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-black tracking-tight font-heading text-center mb-12">
              Compare plans
            </h2>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-4 pr-6 text-sm font-bold text-slate-400 w-[40%]">Feature</th>
                    {PLANS.map((p) => (
                      <th key={p.name} className="py-4 px-4 text-sm font-bold text-white text-center">
                        {p.name}
                        {p.popular && <span className="ml-1.5 text-[10px] text-teal-400">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, idx) => (
                    <tr key={row.label} className={idx % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                      <td className="py-3 pr-6 text-sm text-slate-400">{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className="py-3 px-4 text-center">{renderCell(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards */}
            <div className="md:hidden space-y-8">
              {PLANS.map((plan, planIdx) => (
                <div key={plan.name} className="bg-[#0F1D32] border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-lg font-bold font-heading mb-4">
                    {plan.name}
                    {plan.popular && <span className="ml-2 text-xs text-teal-400 font-bold">Most Popular</span>}
                  </h3>
                  <div className="space-y-2">
                    {COMPARISON_ROWS.map((row) => (
                      <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-slate-800/60 last:border-0">
                        <span className="text-sm text-slate-400">{row.label}</span>
                        <span className="text-sm">{renderCell(row.values[planIdx])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── How Limits Work ─────────────────────────────────────── */}
        <Reveal delay={400}>
          <div className="mt-24 max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight font-heading text-center mb-10">
              How sending limits work
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                { title: 'Workspace-level limits', text: 'Limits are per workspace, not per user. Adding seats gives collaboration access — it does not increase sending limits.' },
                { title: 'Daily & monthly caps', text: 'Daily limits protect deliverability. Monthly limits prevent surprise overuse. When you hit a limit, sending pauses automatically and resumes on reset.' },
                { title: 'LinkedIn safety', text: 'We enforce conservative hard limits to keep your LinkedIn account safe. Actions are paced to stay human-like.' },
                { title: 'Built for deliverability', text: 'Limits protect your domain reputation. Upgrade any time as you scale.' },
              ].map((item) => (
                <div key={item.title} className="bg-[#0F1D32] border border-slate-800 rounded-xl p-5">
                  <h4 className="text-sm font-bold text-white mb-2">{item.title}</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* FAQ teaser */}
        <Reveal delay={500}>
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
