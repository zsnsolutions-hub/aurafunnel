import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const rows = [
  { capability: 'Prospect Research', old: 'Manual. 20-30 min/lead.', scaliyo: 'AI Deep Research. 90 seconds.' },
  { capability: 'Data Enrichment', old: 'Separate tool ($$$). Stale.', scaliyo: 'Built-in. Real-time. Verified.' },
  { capability: 'Intent Detection', old: 'Basic filters. No behavioral signals.', scaliyo: '50+ real-time signals. 94% accuracy.' },
  { capability: 'Outreach', old: 'Generic templates. Separate tool.', scaliyo: 'AI-personalized. Multi-channel. One workflow.' },
  { capability: 'Follow-ups', old: 'Manual. Falls through cracks.', scaliyo: 'AI-automated. Adapts. Never misses.' },
  { capability: 'Lead Scoring', old: 'Gut feeling. Basic points.', scaliyo: 'AI-powered. 50+ signals. Predictive.' },
  { capability: 'Pipeline Analytics', old: 'Spreadsheets. Basic CRM reports.', scaliyo: 'AI forecasting. Real-time.' },
  { capability: 'Setup Time', old: '4-6 weeks across tools.', scaliyo: '5 minutes. One platform.' },
  { capability: 'Monthly Cost', old: '$500-2,000+/seat across tools.', scaliyo: 'Starts at $59/month. All included.' },
];

const replacedTools = ['Data Provider', 'Enrichment Tool', 'Email Platform', 'LinkedIn Tool', 'Lead Scoring', 'CRM Analytics'];

const Comparison: React.FC = () => (
  <section id="comparison" className="py-24 lg:py-32 border-y border-slate-800/60">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
            Why Scaliyo
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Everything you&rsquo;re cobbling together
            <br className="hidden sm:block" />
            — replaced by one AI engine
          </h2>
        </div>
      </Reveal>

      {/* Desktop comparison grid */}
      <Reveal delay={150}>
        <div className="hidden md:block">
          {/* Header */}
          <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 mb-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4">Capability</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4">The Old Way</div>
            <div className="text-xs font-bold text-teal-400 uppercase tracking-wider px-4">Scaliyo</div>
          </div>
          {/* Rows */}
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.capability}
                className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 rounded-xl overflow-hidden"
              >
                <div className="bg-[#0F1D32] px-5 py-4 flex items-center">
                  <span className="text-sm font-semibold text-white">{row.capability}</span>
                </div>
                <div className="bg-red-500/5 border-l-2 border-red-500/20 px-5 py-4 flex items-center">
                  <span className="text-sm text-slate-400">{row.old}</span>
                </div>
                <div className="bg-teal-500/5 border-l-2 border-teal-500/30 px-5 py-4 flex items-center">
                  <span className="text-sm text-slate-200 font-medium">{row.scaliyo}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {rows.map((row, i) => (
          <Reveal key={row.capability} delay={i * 60}>
            <div className="bg-[#0F1D32] rounded-xl border border-slate-800 p-5">
              <p className="text-sm font-bold text-white mb-3">{row.capability}</p>
              <div className="flex items-start gap-2 mb-2">
                <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-slate-400">{row.old}</span>
              </div>
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-slate-200 font-medium">{row.scaliyo}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Stack you replace */}
      <Reveal delay={300}>
        <div className="mt-16 text-center">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">
            The stack you replace
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {replacedTools.map((tool) => (
              <span
                key={tool}
                className="text-sm text-slate-500 line-through decoration-red-400/40 bg-[#0F1D32] border border-slate-800 px-4 py-2 rounded-lg"
              >
                {tool}
              </span>
            ))}
          </div>
          <p className="text-sm font-semibold text-teal-400">
            All replaced by one platform.
          </p>
        </div>
      </Reveal>

      <Reveal delay={400}>
        <div className="text-center mt-12">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'comparison', label: 'replace_your_stack' })}
            className="group inline-flex items-center px-8 py-4 bg-teal-500 text-white rounded-xl font-bold text-base transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25"
          >
            Replace your stack today — Start Free Trial
            <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default Comparison;
