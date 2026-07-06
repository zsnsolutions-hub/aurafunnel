import React from 'react';
import { Search, FileText, Gauge, Sparkles, Send, LineChart } from 'lucide-react';
import Reveal from './Reveal';

const capabilities = [
  {
    icon: Search,
    title: 'AI prospect discovery',
    desc: 'Describe your ideal customer and Scaliyo surfaces fresh, matching accounts — no list-buying.',
  },
  {
    icon: FileText,
    title: 'Deep research profiles',
    desc: 'One-click dossiers on every lead: role, company, tech stack, hiring, funding and recent signals.',
  },
  {
    icon: Gauge,
    title: 'Predictive lead scoring',
    desc: 'Real-time intent scores across 50+ signals so you always know who to call first.',
  },
  {
    icon: Sparkles,
    title: 'Hyper-personalized outreach',
    desc: 'On-brand emails written for each prospect, drawing on their actual context — not templates.',
  },
  {
    icon: Send,
    title: 'Smart follow-ups',
    desc: 'Autonomous sequences that adapt to replies and keep deals warm around the clock.',
  },
  {
    icon: LineChart,
    title: 'Pipeline intelligence',
    desc: 'Ask plain-English questions and get data-backed answers on your funnel and forecast.',
  },
];

const PlatformOverview: React.FC = () => (
  <section id="platform" className="py-24 lg:py-32">
    <div className="max-w-[1180px] mx-auto px-6">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
          <p className="eyebrow text-teal-700 mb-5">What Scaliyo does</p>
          <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
            One AI engine to <span className="text-teal-700">find, engage &amp; close</span>
          </h2>
          <p className="mt-6 text-lg text-[#6F6860] leading-relaxed">
            Everything a modern revenue team needs — without stitching together five different tools.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
        {capabilities.map((c, i) => {
          const Icon = c.icon;
          return (
            <Reveal key={c.title} delay={(i % 3) * 120}>
              <div className="group h-full rounded-[1.5rem] border border-[#EAE3D6] bg-white p-7 shadow-chic-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-chic">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#EAF2EF] text-teal-700 mb-5 transition-colors duration-300 group-hover:bg-teal-600 group-hover:text-white">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </span>
                <h3 className="font-display text-xl font-medium text-[#1C1A17] mb-2.5">{c.title}</h3>
                <p className="text-[15px] text-[#6F6860] leading-relaxed">{c.desc}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
);

export default PlatformOverview;
