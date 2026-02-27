import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../../components/marketing/Reveal';
import { track } from '../../lib/analytics';
import { PLANS, ANNUAL_DISCOUNT } from '../../lib/credits';
import { OUTBOUND_LIMITS } from '../../lib/planLimits';
import { AI_PLAN_CONFIG, CREDIT_CONVERSION_RATE } from '../../lib/pricing.config';

/* ── Comparison table data ────────────────────────────────────────────────── */
type CellValue = string | boolean;
interface ComparisonRow {
  label: string;
  values: [CellValue, CellValue, CellValue];
  section?: string;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Price / month',           values: ['$29', '$79', '$199'], section: 'Plan' },
  { label: 'Contacts',                values: ['1,000', '10,000', '50,000'] },
  { label: 'Storage',                 values: ['1 GB', '10 GB', '50 GB'] },
  { label: 'Team seats included',     values: ['1', '3', '10'] },
  { label: 'Extra seats',             values: ['$15/seat', '$12/seat', '$8/seat'] },
  { label: 'Email inboxes',           values: ['1', 'Up to 5', 'Up to 15'], section: 'Outbound Engine' },
  { label: 'Emails / day',            values: ['40/day', '60/day per inbox', '80/day per inbox'] },
  { label: 'Emails / month',          values: ['1,000', '10,000', '50,000'] },
  { label: 'LinkedIn actions / day',  values: ['20', '40', '100'] },
  { label: 'LinkedIn actions / month',values: ['600', '1,200', '3,000'] },
  { label: 'Multi-channel sequences', values: [true, true, true] },
  { label: 'AI credits / month',      values: ['\u2014', '2,000', '8,000'], section: 'AI Engine' },
  { label: 'AI drafts & rewrites',    values: [false, true, true] },
  { label: 'AI personalization',      values: [false, true, 'Advanced'] },
  { label: 'Hard AI stop (no overages)', values: ['\u2014', true, true] },
  { label: 'Auto warm-up',            values: [false, true, true], section: 'Deliverability' },
  { label: 'Inbox health monitoring', values: [false, false, true] },
  { label: 'Enrichment',              values: [false, true, true], section: 'Intelligence' },
  { label: 'Advanced automation',     values: [false, true, true] },
  { label: 'Analytics',               values: [false, true, 'Advanced'] },
  { label: 'API & Webhooks',          values: [false, false, true] },
];

const CheckSvg = () => (
  <svg className="w-4 h-4 text-teal-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const DashSvg = () => (
  <span className="text-slate-600 text-sm">&mdash;</span>
);
const XSvg = () => (
  <svg className="w-4 h-4 text-slate-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function renderCell(v: CellValue) {
  if (v === true) return <CheckSvg />;
  if (v === false) return <XSvg />;
  if (v === '\u2014') return <DashSvg />;
  return <span className="text-sm text-slate-300">{v}</span>;
}

/* ── Plan card meta ───────────────────────────────────────────────────────── */
const PLAN_CARD_META: Record<string, {
  maxUsers: string; extraSeat: string; warmup: string; tagline: string;
}> = {
  Starter: { maxUsers: 'max 3', extraSeat: '+$15/seat', warmup: 'Manual warm-up guidance', tagline: 'Validate' },
  Growth:  { maxUsers: 'max 10', extraSeat: '+$12/seat', warmup: 'Automated warm-up + ramp schedule', tagline: 'Compound' },
  Scale:   { maxUsers: 'flexible', extraSeat: '+$8/seat', warmup: 'Advanced warm-up + inbox health monitoring', tagline: 'Dominate' },
};

/* ── FAQ data ─────────────────────────────────────────────────────────────── */
const FAQ_ITEMS = [
  {
    q: 'What happens when I hit a sending limit?',
    a: 'Sending pauses automatically and resumes on the next daily or monthly reset. No emails are lost. No sequences break. The engine protects your deliverability so you don\u2019t have to think about it.',
  },
  {
    q: 'Do extra seats increase my sending volume?',
    a: 'No. Limits are per workspace, not per user. Adding seats gives your team collaboration access \u2014 it doesn\u2019t multiply volume. One engine, one set of controls.',
  },
  {
    q: 'Why a hard stop on AI credits?',
    a: 'Because surprise overages are unacceptable. You get a clear allocation every month. When it\u2019s spent, AI pauses until reset. No hidden charges. Upgrade when you\u2019re ready to scale.',
  },
  {
    q: 'Can I upgrade or downgrade instantly?',
    a: 'Yes. Upgrade takes effect immediately. Downgrade applies at the end of your billing cycle. No lock-in. No penalties. No phone calls.',
  },
  {
    q: 'How do AI credits work?',
    a: `1 credit = up to ${CREDIT_CONVERSION_RATE.toLocaleString()} tokens. Every AI action \u2014 drafts, rewrites, personalization \u2014 consumes credits based on output length. Credits reset monthly. You\u2019ll see your balance in the dashboard at all times.`,
  },
  {
    q: 'Is there a free trial?',
    a: 'Every plan starts with a 14-day free trial. Full access. No credit card. Cancel before it ends and you pay nothing.',
  },
];

/* ── Component ────────────────────────────────────────────────────────────── */
const PricingPage: React.FC = () => {
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  React.useEffect(() => { track('pricing_view'); }, []);

  return (
    <div className="bg-[#0A1628] text-white pt-32 pb-24">
      <div className="max-w-[1200px] mx-auto px-6">

        {/* ── Headline ────────────────────────────────────────────── */}
        <Reveal>
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
              Pricing
            </p>
            <h1 className="text-4xl lg:text-6xl font-black tracking-tight font-heading mb-5">
              Your outbound engine.<br className="hidden sm:block" />
              Pick the gear.
            </h1>
            <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Email + LinkedIn + AI personalization in one machine.
              Built-in deliverability protection. Hard limits that keep your domains alive.
              Start free. Scale when the pipeline demands it.
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
          <div className="grid max-w-5xl mx-auto grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map((plan) => {
              const isHighlighted = !!plan.popular;
              const displayPrice = isAnnual ? plan.annualPrice : plan.price;
              const outbound = OUTBOUND_LIMITS[plan.name] ?? OUTBOUND_LIMITS.Starter;
              const meta = PLAN_CARD_META[plan.name] ?? PLAN_CARD_META.Starter;
              const aiCfg = AI_PLAN_CONFIG[plan.name];

              return (
                <div
                  key={plan.name}
                  className={`h-full rounded-2xl p-8 flex flex-col transition-all duration-500 hover:-translate-y-1 ${
                    isHighlighted
                      ? 'bg-gradient-to-b from-teal-500/10 to-[#0F1D32] border-2 border-teal-500/30 shadow-xl shadow-teal-500/10 relative'
                      : 'bg-[#0F1D32] border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {isHighlighted && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold bg-teal-500 text-white px-4 py-1 rounded-full shadow-lg">
                      Most teams pick this
                    </span>
                  )}

                  {/* Content wrapper */}
                  <div>
                    {/* Plan name + tagline */}
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold font-heading">{plan.name}</h3>
                      <span className="text-[9px] font-black text-teal-400 uppercase tracking-widest">{meta.tagline}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1 mb-5 leading-relaxed">{plan.desc}</p>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-4xl font-black font-heading">${displayPrice}</span>
                      <span className="text-sm text-slate-500 font-semibold">/mo</span>
                    </div>
                    {isAnnual && (
                      <p className="text-xs text-teal-400 font-bold mb-4">
                        ${(plan.annualPrice * 12).toLocaleString()}/yr &mdash; save ${((plan.price - plan.annualPrice) * 12).toLocaleString()}
                      </p>
                    )}
                    {!isAnnual && <div className="mb-4" />}

                    {/* ── Engine specs ───────────────────────── */}
                    <div className="mb-4">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Workspace</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Contacts</span><span className="text-white font-semibold">{plan.contacts.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Storage</span><span className="text-white font-semibold">{plan.storage >= 1000 ? `${(plan.storage / 1000).toFixed(0)} GB` : `${plan.storage} MB`}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Team</span><span className="text-white font-semibold">{plan.seats} <span className="text-slate-500 text-xs">({meta.extraSeat}, {meta.maxUsers})</span></span></div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Outbound Engine</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Inboxes</span><span className="text-white font-semibold">{outbound.maxInboxes === 1 ? '1' : `Up to ${outbound.maxInboxes}`}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Email / day</span><span className="text-white font-semibold">{outbound.emailsPerDayPerInbox}{outbound.maxInboxes > 1 ? '/inbox' : ''}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Email / month</span><span className="text-white font-semibold">{outbound.emailsPerMonth.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">LinkedIn / day</span><span className="text-white font-semibold">{outbound.linkedInPerDay}</span></div>
                      </div>
                    </div>

                    {/* AI + warm-up */}
                    <div className="mb-4">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">AI + Deliverability</p>
                      <div className="space-y-1.5 text-sm">
                        {aiCfg?.hasAI ? (
                          <div className="flex justify-between">
                            <span className="text-slate-400">AI credits</span>
                            <span className="text-white font-semibold group relative cursor-help">
                              {aiCfg.aiCreditsMonthly.toLocaleString()}/mo
                              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-44 rounded-lg bg-slate-800 px-3 py-2 text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">
                                1 credit = {CREDIT_CONVERSION_RATE.toLocaleString()} tokens. Hard stop. No overages.
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex justify-between"><span className="text-slate-500">AI</span><span className="text-slate-600 text-xs">&mdash;</span></div>
                        )}
                        <div className="flex justify-between"><span className="text-slate-400">Warm-up</span><span className="text-white font-semibold text-xs">{meta.warmup}</span></div>
                      </div>
                    </div>

                    {/* Feature list */}
                    <ul className="space-y-2.5">
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

                  {/* CTA — pinned to bottom */}
                  <div className="mt-auto pt-6">
                    <Link
                      to="/signup"
                      onClick={() => track('cta_click', { location: 'pricing', tier: plan.name })}
                      className={`block text-center px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 ${
                        isHighlighted
                          ? 'bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/25 hover:scale-105 active:scale-95'
                          : 'bg-white/5 border border-slate-700 text-white hover:border-teal-500/40 hover:bg-teal-500/5'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                    <p className="text-[11px] text-slate-500 text-center mt-1.5">14 days free. No card. Cancel anytime.</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* ── Engine Control — Limits explanation ─────────────────── */}
        <Reveal delay={300}>
          <div className="mt-28 max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-3">Engine Control</p>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight font-heading mb-4">
                Hard limits. By design.
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Every limit exists to protect your domains, your LinkedIn account, and your sender reputation.
                This isn&apos;t restriction. It&apos;s discipline. The teams that scale fastest are the ones that don&apos;t get their accounts burned.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  ),
                  title: 'Email throttling',
                  text: 'Daily caps per inbox protect your sender reputation. Monthly caps prevent runaway spend. Hit a limit, sending pauses. Resumes on reset. No emails lost.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
                      <circle cx="4" cy="4" r="2" />
                    </svg>
                  ),
                  title: 'LinkedIn safety',
                  text: 'Conservative daily action limits. Human-like pacing. We keep your LinkedIn account alive so you can keep prospecting.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                  title: 'AI hard stop',
                  text: 'Clear allocation. No surprise overages. When credits run out, AI pauses. Upgrade when your pipeline demands it. No hidden charges, ever.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ),
                  title: 'Workspace-level',
                  text: 'All limits are per workspace. Adding seats gives your team access \u2014 it doesn\u2019t multiply volume. One engine, one set of controls.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-[#0F1D32] border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 mb-3">
                    {item.icon}
                  </div>
                  <h4 className="text-sm font-bold text-white mb-2">{item.title}</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── AI Credits explainer ────────────────────────────────── */}
        <Reveal delay={350}>
          <div className="mt-20 max-w-3xl mx-auto">
            <div className="bg-gradient-to-r from-violet-500/10 to-teal-500/10 border border-slate-700 rounded-2xl p-8 md:p-10">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold font-heading mb-2">AI that earns its keep</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-4">
                    Every AI action &mdash; drafts, rewrites, personalization &mdash; consumes credits based on output complexity.
                    1 credit = up to {CREDIT_CONVERSION_RATE.toLocaleString()} tokens. Growth gets 2,000 credits/month. Scale gets 8,000.
                    Credits reset monthly. Hard stop when they&apos;re spent.
                  </p>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    <span className="text-white font-semibold">No overages. No surprises. No fine print.</span>{' '}
                    You always see your remaining balance in the dashboard. When you need more, upgrade instantly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Comparison table ────────────────────────────────────── */}
        <Reveal delay={400}>
          <div className="mt-28 max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-3">Side by Side</p>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight font-heading">
                Every detail. No surprises.
              </h2>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#0F1D32] border-b border-slate-700">
                    <th className="py-4 pl-6 pr-4 text-sm font-bold text-slate-400 w-[40%]">Feature</th>
                    {PLANS.map((p) => (
                      <th key={p.name} className={`py-4 px-4 text-sm font-bold text-center ${p.popular ? 'text-teal-400' : 'text-white'}`}>
                        {p.name}
                        {p.popular && <span className="block text-[9px] font-black uppercase tracking-widest mt-0.5">Most Popular</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, idx) => (
                    <React.Fragment key={row.label}>
                      {row.section && (
                        <tr>
                          <td colSpan={4} className="px-6 pt-5 pb-2 text-[9px] font-black text-teal-400/60 uppercase tracking-[0.25em]">
                            {row.section}
                          </td>
                        </tr>
                      )}
                      <tr className={idx % 2 === 0 ? 'bg-white/[0.015]' : ''}>
                        <td className="py-3 pl-6 pr-4 text-sm text-slate-400">{row.label}</td>
                        {row.values.map((v, i) => (
                          <td key={i} className="py-3 px-4 text-center">{renderCell(v)}</td>
                        ))}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards */}
            <div className="md:hidden space-y-8">
              {PLANS.map((plan, planIdx) => (
                <div key={plan.name} className={`rounded-2xl p-6 ${plan.popular ? 'bg-gradient-to-b from-teal-500/10 to-[#0F1D32] border-2 border-teal-500/30' : 'bg-[#0F1D32] border border-slate-800'}`}>
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

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <Reveal delay={450}>
          <div className="mt-28 max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-3">FAQ</p>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight font-heading">
                Straight answers
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <div
                    key={i}
                    className="bg-[#0F1D32] border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors"
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left"
                    >
                      <span className="text-sm font-bold text-white pr-4">{item.q}</span>
                      <svg
                        className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-48' : 'max-h-0'}`}>
                      <p className="px-6 pb-5 text-sm text-slate-400 leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        {/* ── Final CTA ───────────────────────────────────────────── */}
        <Reveal delay={500}>
          <div className="mt-28 max-w-2xl mx-auto text-center">
            <h2 className="text-3xl lg:text-4xl font-black tracking-tight font-heading mb-4">
              Pipeline doesn&apos;t build itself.
            </h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              14 days free. Full access. No credit card.
              If it doesn&apos;t generate pipeline, cancel and pay nothing.
            </p>
            <Link
              to="/signup"
              onClick={() => track('cta_click', { location: 'pricing_final', label: 'start_trial' })}
              className="inline-block px-10 py-4 bg-teal-500 text-white font-bold rounded-xl shadow-lg shadow-teal-500/25 hover:bg-teal-400 hover:scale-105 active:scale-95 transition-all duration-300 text-sm"
            >
              Start Your Free Trial
            </Link>
            <p className="text-xs text-slate-600 mt-4">
              No card required &middot; Cancel anytime &middot; Upgrade in seconds
            </p>
          </div>
        </Reveal>

      </div>
    </div>
  );
};

export default PricingPage;
