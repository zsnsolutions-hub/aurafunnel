import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { BrainIcon, MailIcon, GlobeIcon, ChartIcon, ArrowRightIcon } from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

// ── Phase 0: honest replacement ──────────────────────────────────────────────
// The previous version of this page rendered a full "AI lead scoring" dashboard
// (score history timelines, per-factor breakdowns, engagement heatmaps) that was
// entirely synthesized with Math.random() from a lead's score — which was itself
// random. None of it reflected real behaviour. That fabricated intelligence has
// been removed. Real lead scoring will be rebuilt on genuine signals
// (email engagement, enrichment, website/CRM activity) in a later phase.
// Until then this page points users to the surfaces that show REAL data today.

const LeadIntelligence: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();

  const real = [
    {
      icon: <MailIcon className="w-5 h-5" />,
      title: 'Email engagement',
      body: 'Real opens, clicks and send history per lead — tracked from actual email events.',
      cta: 'Open Analytics', to: '/portal/analytics',
    },
    {
      icon: <GlobeIcon className="w-5 h-5" />,
      title: 'Lead research',
      body: 'AI website research runs on demand from a lead profile and grounds outreach in real facts.',
      cta: 'Go to Leads', to: '/portal/leads',
    },
    {
      icon: <ChartIcon className="w-5 h-5" />,
      title: 'Pipeline insights',
      body: 'Deterministic pipeline stats — status distribution, multi-contact accounts, pipeline age.',
      cta: 'Open Analytics', to: '/portal/analytics',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <PageHeader
        title="Lead Intelligence"
        description="Signal-based lead scoring — rebuilding on real data"
      />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
          <BrainIcon className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Real lead scoring is on the way</h2>
        <p className="text-sm text-slate-600 mt-2 max-w-lg mx-auto leading-relaxed">
          We removed the old scoring dashboard because its scores, timelines and "buying signals"
          were generated randomly, not measured. A real model — driven by email engagement,
          enrichment and activity — is being built. We'd rather show you nothing than show you
          numbers that aren't true.
        </p>
        <p className="text-xs text-slate-400 mt-3">
          Signed in as {user.name || user.email}. Meanwhile, here's what's real today:
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {real.map((c) => (
          <div key={c.title} className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center mb-3">
              {c.icon}
            </div>
            <h3 className="text-sm font-bold text-slate-900">{c.title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed flex-1">{c.body}</p>
            <button
              onClick={() => navigate(c.to)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              {c.cta} <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeadIntelligence;
