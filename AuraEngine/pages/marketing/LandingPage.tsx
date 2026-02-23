
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TargetIcon, EditIcon, ChartIcon, SparklesIcon, BoltIcon, ShieldIcon, PlugIcon, RefreshIcon } from '../../components/Icons';

const faqs = [
  {
    q: 'How much does AuraFunnel cost?',
    a: 'We offer a generous free tier for small teams. Paid plans start at $49/month per seat with volume discounts for larger organizations. All plans include a 14-day free trial.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. AuraFunnel is SOC 2 Type II certified and GDPR compliant. All data is encrypted at rest and in transit, and we never share your data with third parties.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most teams are fully onboarded in under 15 minutes. Connect your CRM, invite your team, and our AI begins scoring leads immediately—no manual configuration required.',
  },
  {
    q: 'How accurate is the AI lead scoring?',
    a: 'Our Gemini Pro-powered scoring engine achieves 94% accuracy on average across all customer accounts, validated against historical close data. Accuracy improves over time as the model learns your specific sales patterns.',
  },
  {
    q: 'Which CRMs and tools do you integrate with?',
    a: 'We offer native integrations with Salesforce, HubSpot, Pipedrive, Slack, Gmail, Zapier, Stripe, Notion, and more. Our API also supports custom integrations.',
  },
  {
    q: 'Can I try AuraFunnel before committing?',
    a: 'Yes! Every account starts with a 14-day free trial with full access to all features. No credit card required to get started.',
  },
];

const testimonials = [
  {
    quote: 'AuraFunnel cut our sales cycle by 40%. The AI scoring is scarily accurate—we close deals we would have completely missed before.',
    name: 'Sarah Chen',
    title: 'VP of Sales',
    company: 'Stackline',
    initials: 'SC',
  },
  {
    quote: 'We replaced three separate tools with AuraFunnel. The personalized outreach generation alone is worth 10x the price.',
    name: 'Marcus Rivera',
    title: 'Head of Growth',
    company: 'Nuvio',
    initials: 'MR',
  },
  {
    quote: 'The pipeline analytics finally give us visibility we never had. Our forecasting accuracy went from 60% to over 90%.',
    name: 'Priya Sharma',
    title: 'CRO',
    company: 'Meridian SaaS',
    initials: 'PS',
  },
];

const integrations = ['Salesforce', 'HubSpot', 'Slack', 'Gmail', 'Zapier', 'Pipedrive', 'Stripe', 'Notion'];

const LandingPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="bg-slate-950 text-white">
      {/* ───────── A. Hero ───────── */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Radial glow */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.25),transparent)]" />
        {/* Dot-grid overlay */}
        <div className="absolute inset-0 -z-10 dot-grid opacity-40" />

        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 rounded-full mb-10 animate-float">
            <SparklesIcon className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Powered by Gemini Pro</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-8 font-heading">
            Turn Cold Leads into{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400">
              Closed Deals
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed">
            AuraFunnel uses the Gemini Pro engine to score every lead, detect buying signals, and generate hyper-personalized outreach—so your team closes faster with less effort.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="px-8 py-4 bg-white text-slate-900 rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              Start Free
            </Link>
            <Link
              to="/contact"
              className="px-8 py-4 border border-slate-700 bg-white/5 backdrop-blur text-white rounded-xl font-bold text-lg hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all duration-300"
            >
              Watch Demo
            </Link>
          </div>

          {/* Abstract dashboard mockup */}
          <div className="mt-20 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 lg:p-8 shadow-2xl shadow-indigo-500/10">
              {/* Top bar */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <div className="ml-4 h-2 w-32 rounded bg-slate-700" />
              </div>
              {/* Dashboard grid */}
              <div className="grid grid-cols-3 gap-4">
                {/* Stat cards */}
                <div className="rounded-lg bg-slate-800 p-4 border border-slate-700/50">
                  <div className="h-2 w-16 bg-slate-600 rounded mb-3" />
                  <div className="h-6 w-20 bg-indigo-500/40 rounded mb-2" />
                  <div className="flex gap-1 mt-3">
                    {[60, 45, 70, 55, 80, 65, 90].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-indigo-500/30" style={{ height: `${h}%`, minHeight: `${h * 0.4}px` }} />
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800 p-4 border border-slate-700/50">
                  <div className="h-2 w-20 bg-slate-600 rounded mb-3" />
                  <div className="h-6 w-16 bg-purple-500/40 rounded mb-2" />
                  <div className="flex gap-1 mt-3">
                    {[40, 65, 50, 75, 60, 85, 70].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-purple-500/30" style={{ height: `${h}%`, minHeight: `${h * 0.4}px` }} />
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800 p-4 border border-slate-700/50">
                  <div className="h-2 w-14 bg-slate-600 rounded mb-3" />
                  <div className="h-6 w-24 bg-green-500/40 rounded mb-2" />
                  <div className="mt-3 space-y-2">
                    <div className="h-2 w-full bg-green-500/20 rounded-full"><div className="h-2 w-4/5 bg-green-500/50 rounded-full" /></div>
                    <div className="h-2 w-full bg-green-500/20 rounded-full"><div className="h-2 w-3/5 bg-green-500/50 rounded-full" /></div>
                    <div className="h-2 w-full bg-green-500/20 rounded-full"><div className="h-2 w-11/12 bg-green-500/50 rounded-full" /></div>
                  </div>
                </div>
              </div>
              {/* Table rows */}
              <div className="mt-4 space-y-2">
                {[1, 2, 3].map((r) => (
                  <div key={r} className="flex items-center gap-3 rounded-lg bg-slate-800/50 p-3 border border-slate-700/30">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20" />
                    <div className="h-2 w-28 bg-slate-600 rounded" />
                    <div className="h-2 w-16 bg-slate-700 rounded ml-auto" />
                    <div className="h-5 w-14 bg-indigo-500/20 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── B. Social Proof Numbers ───────── */}
      <section className="py-20 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
          {[
            { value: '2,400+', label: 'Teams worldwide' },
            { value: '94%', label: 'Scoring accuracy' },
            { value: '3.2x', label: 'Faster close rate' },
            { value: '50M+', label: 'Leads scored' },
          ].map((stat) => (
            <div key={stat.label} className="group">
              <p className="text-4xl lg:text-5xl font-black font-heading tracking-tight text-white group-hover:text-indigo-400 transition-colors duration-300">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-slate-500 font-medium uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── C. Features Bento Grid ───────── */}
      <section className="py-28 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">Built for modern sales teams</h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">Everything you need to find, score, engage, and close—powered by AI.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
            {/* Large card 1 — Lead Scoring */}
            <div className="md:col-span-4 bg-slate-900 rounded-2xl border border-slate-800 p-8 lg:p-10 flex flex-col justify-between group hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
              <div className="relative z-10">
                <TargetIcon className="w-10 h-10 text-indigo-400 mb-5" />
                <h3 className="text-2xl font-bold font-heading mb-3">Lead Scoring</h3>
                <p className="text-slate-400 max-w-md leading-relaxed">AI analyzes 50+ signals—company news, hiring trends, tech stack—to predict buying intent with 94% accuracy.</p>
              </div>
              {/* Abstract orb */}
              <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-indigo-500/10 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700" />
            </div>

            {/* Small card 1 — Content Generation */}
            <div className="md:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-8 group hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-500">
              <EditIcon className="w-10 h-10 text-purple-400 mb-5" />
              <h3 className="text-xl font-bold font-heading mb-2">Content Generation</h3>
              <p className="text-slate-400 text-sm leading-relaxed">One-click personalized emails, scripts, and follow-ups—unique for every lead.</p>
            </div>

            {/* Small card 2 — Pipeline Analytics */}
            <div className="md:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-8 group hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-500">
              <ChartIcon className="w-10 h-10 text-cyan-400 mb-5" />
              <h3 className="text-xl font-bold font-heading mb-2">Pipeline Analytics</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Real-time dashboards with conversion funnels, revenue forecasts, and rep performance.</p>
            </div>

            {/* Large card 2 — CRM Sync */}
            <div className="md:col-span-4 bg-slate-900 rounded-2xl border border-slate-800 p-8 lg:p-10 flex flex-col justify-between group hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
              <div className="relative z-10">
                <PlugIcon className="w-10 h-10 text-amber-400 mb-5" />
                <h3 className="text-2xl font-bold font-heading mb-3">CRM Sync</h3>
                <p className="text-slate-400 max-w-md leading-relaxed">Native two-way sync with Salesforce, HubSpot, Pipedrive, and 20+ platforms. Zero manual data entry.</p>
              </div>
              {/* Code block mockup */}
              <div className="absolute -bottom-6 -right-6 w-64 opacity-20 group-hover:opacity-40 transition-opacity duration-700">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 text-xs font-mono text-slate-400 space-y-1">
                  <div><span className="text-purple-400">sync</span>.connect({'{'}</div>
                  <div className="pl-4">crm: <span className="text-green-400">"salesforce"</span>,</div>
                  <div className="pl-4">mode: <span className="text-green-400">"bidirectional"</span></div>
                  <div>{'}'})</div>
                </div>
              </div>
            </div>

            {/* Small card 3 — Automated Follow-ups */}
            <div className="md:col-span-3 bg-slate-900 rounded-2xl border border-slate-800 p-8 group hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-500">
              <RefreshIcon className="w-10 h-10 text-emerald-400 mb-5" />
              <h3 className="text-xl font-bold font-heading mb-2">Automated Follow-ups</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Smart drip sequences that adapt tone and timing based on engagement signals.</p>
            </div>

            {/* Small card 4 — Security */}
            <div className="md:col-span-3 bg-slate-900 rounded-2xl border border-slate-800 p-8 group hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-500">
              <ShieldIcon className="w-10 h-10 text-rose-400 mb-5" />
              <h3 className="text-xl font-bold font-heading mb-2">Enterprise Security</h3>
              <p className="text-slate-400 text-sm leading-relaxed">SOC 2 Type II certified, GDPR compliant, with end-to-end encryption and SSO.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── D. How It Works ───────── */}
      <section className="py-28 lg:py-32 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">How it works</h2>
            <p className="text-lg text-slate-400">Three steps to transform your pipeline.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line — desktop only */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-indigo-500/50" />

            {[
              { step: '1', title: 'Connect', desc: 'Sync your CRM and import your leads in one click. We support 20+ platforms out of the box.' },
              { step: '2', title: 'Analyze', desc: 'Our AI scores and segments every lead in real time, surfacing the hottest opportunities first.' },
              { step: '3', title: 'Close', desc: 'Generate personalized outreach at scale and let smart follow-ups do the rest.' },
            ].map((item) => (
              <div key={item.step} className="text-center relative z-10">
                <div className="mx-auto w-24 h-24 rounded-full border-2 border-indigo-500/40 bg-slate-900 flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/10 animate-glow-pulse">
                  <span className="text-3xl font-black font-heading text-indigo-400">{item.step}</span>
                </div>
                <h3 className="text-2xl font-bold font-heading mb-3">{item.title}</h3>
                <p className="text-slate-400 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── E. Testimonials ───────── */}
      <section className="py-28 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">Loved by sales teams</h2>
            <p className="text-lg text-slate-400">See why thousands of teams trust AuraFunnel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-slate-900 rounded-2xl border border-slate-800 p-8 flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-500"
              >
                {/* Top gradient border */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-60" />
                <p className="text-slate-300 leading-relaxed mb-8 text-lg italic">"{t.quote}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-300">
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.title}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── F. Integrations Grid ───────── */}
      <section className="py-28 lg:py-32 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">Connects with your stack</h2>
          <p className="text-lg text-slate-400 mb-16 max-w-2xl mx-auto">Plug into the tools your team already uses—no migration required.</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {integrations.map((name) => (
              <div
                key={name}
                className="bg-slate-900 border border-slate-800 rounded-xl py-4 px-6 font-semibold text-slate-300 hover:border-indigo-500/40 hover:text-white hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 cursor-default"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── G. FAQ Accordion ───────── */}
      <section className="py-28 lg:py-32">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-slate-400">Everything you need to know to get started.</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-colors duration-300 hover:border-slate-700"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left"
                  >
                    <span className="font-semibold text-white pr-4">{faq.q}</span>
                    <svg
                      className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
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
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── H. Final CTA ───────── */}
      <section className="py-28 lg:py-32 relative overflow-hidden">
        {/* Mesh-gradient overlay */}
        <div className="absolute inset-0 mesh-gradient opacity-30 -z-10" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.15),transparent)]" />

        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight font-heading mb-6">
            Ready to sell smarter?
          </h2>
          <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Join 2,400+ teams that use AuraFunnel to close more deals with less effort. Get started in minutes—no credit card required.
          </p>
          <Link
            to="/auth"
            className="inline-block px-10 py-5 bg-white text-slate-900 rounded-xl font-bold text-lg hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-indigo-500/20"
          >
            Start Free
          </Link>
          <p className="mt-5 text-sm text-slate-500">No credit card required</p>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
