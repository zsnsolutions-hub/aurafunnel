import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const researchStreams = [
  { label: 'Company Intel', color: 'bg-teal-500', delay: 0 },
  { label: 'Buyer Signals', color: 'bg-cyan-500', delay: 400 },
  { label: 'Content Analysis', color: 'bg-indigo-500', delay: 800 },
  { label: 'Committee Map', color: 'bg-purple-500', delay: 1200 },
];

const capabilities = [
  {
    title: 'Company Intelligence',
    desc: 'Funding rounds, hiring patterns, tech stack changes, recent news — a complete picture before your first touch.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: 'Buyer Signal Detection',
    desc: '50+ intent signals tracked in real-time — job changes, funding events, tech installs, content engagement, and more.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: 'Personalization Blueprint',
    desc: 'A unique outreach strategy for every prospect — messaging angles, timing, channels, and conversation starters.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    title: 'Committee Mapping',
    desc: 'Full buying committee identification with role-based multi-thread strategy for complex enterprise deals.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

/** Animated progress bars that fill on scroll */
const ResearchVisual: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTriggered(true); },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="bg-[#0F1D32] rounded-2xl border border-slate-700/50 p-6 lg:p-8">
      {/* Prospect card */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center text-sm font-bold text-teal-300 border border-teal-500/20">
          JD
        </div>
        <div>
          <p className="text-sm font-bold text-white">Jane Doe</p>
          <p className="text-xs text-slate-500">VP Engineering, Acme Corp</p>
        </div>
        <span className="ml-auto text-[10px] font-bold text-teal-400 bg-teal-500/10 px-2 py-1 rounded-full">Researching...</span>
      </div>

      {/* Research stream bars */}
      <div className="space-y-4">
        {researchStreams.map((stream) => (
          <div key={stream.label}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-400">{stream.label}</span>
              <span className={`text-xs font-bold transition-opacity duration-500 ${triggered ? 'opacity-100 text-slate-300' : 'opacity-0'}`}
                style={{ transitionDelay: `${stream.delay + 800}ms` }}
              >
                Complete
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${stream.color} transition-all duration-1000 ease-out`}
                style={{
                  width: triggered ? '100%' : '0%',
                  transitionDelay: `${stream.delay}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary card that fades in */}
      <div
        className={`mt-6 p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl transition-all duration-700 ${
          triggered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: '2000ms' }}
      >
        <p className="text-xs font-bold text-teal-400 uppercase tracking-wider mb-1">AI Summary</p>
        <p className="text-sm text-slate-300 leading-relaxed">
          High-intent signal: Acme Corp raised Series C ($45M) last month. VP Engineering hired 12 devs in Q4. Tech stack includes tools Scaliyo replaces.
          Recommended approach: Multi-thread with CTO + VP Eng.
        </p>
      </div>
    </div>
  );
};

const DeepResearch: React.FC = () => (
  <section id="deep-research" className="py-24 lg:py-32">
    <div className="max-w-[1400px] mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em] mb-4">
            The Scaliyo Difference
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
            Other tools give you data.
            <br className="hidden sm:block" />
            <span className="text-teal-400">Scaliyo gives you understanding.</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Our AI Deep Research engine doesn&rsquo;t just scrape databases. It reads, analyzes,
            and synthesizes — building a complete intelligence profile on every prospect before
            your team makes a single move.
          </p>
        </div>
      </Reveal>

      {/* Two-column: explanation + visual */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 mb-20">
        <Reveal className="lg:col-span-3">
          <div className="space-y-6">
            <p className="text-slate-300 leading-relaxed">
              Traditional tools give you a name, an email, and a job title. Scaliyo&rsquo;s AI
              Deep Research engine goes further — analyzing company financials, hiring velocity,
              technology decisions, competitive positioning, and dozens of behavioral signals
              to build a true intelligence brief on every prospect.
            </p>
            <p className="text-slate-300 leading-relaxed">
              In <span className="text-teal-400 font-semibold">under 90 seconds</span>, your team
              gets a research profile that would take a human analyst 30+ minutes to compile. Every
              insight is verified, cross-referenced, and scored for relevance to your specific offering.
            </p>
            <p className="text-slate-300 leading-relaxed">
              The result? Your reps walk into every conversation with context that makes them sound
              like they&rsquo;ve been following the prospect&rsquo;s company for months. That&rsquo;s
              not just efficiency — it&rsquo;s an unfair competitive advantage.
            </p>
          </div>
        </Reveal>
        <Reveal delay={200} className="lg:col-span-2">
          <ResearchVisual />
        </Reveal>
      </div>

      {/* 4 capability cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {capabilities.map((cap, i) => (
          <Reveal key={cap.title} delay={i * 120}>
            <div className="bg-[#0F1D32] rounded-2xl border border-slate-800 p-8 h-full group hover:border-teal-500/20 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 group-hover:bg-teal-500/20 flex items-center justify-center mb-5 transition-colors duration-500 text-teal-400">
                  {cap.icon}
                </div>
                <h3 className="text-xl font-bold font-heading mb-3">{cap.title}</h3>
                <p className="text-slate-400 leading-relaxed">{cap.desc}</p>
              </div>
              <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-teal-500/5 group-hover:bg-teal-500/10 blur-3xl transition-all duration-700" />
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={500}>
        <div className="text-center mt-12">
          <Link
            to="/features"
            onClick={() => track('cta_click', { location: 'deep_research', label: 'see_in_action' })}
            className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            See AI Deep Research in action &rarr;
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default DeepResearch;
