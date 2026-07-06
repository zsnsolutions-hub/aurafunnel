import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const Hero: React.FC = () => (
  <section id="hero" className="relative pt-40 pb-24 lg:pt-52 lg:pb-32 overflow-hidden">
    {/* Soft pastel wash */}
    <div className="absolute inset-0 -z-10 pointer-events-none">
      <div className="absolute -top-24 -left-24 w-[36rem] h-[36rem] rounded-full bg-[#E7F0ED] blur-3xl opacity-70" />
      <div className="absolute -top-10 right-0 w-[32rem] h-[32rem] rounded-full bg-[#F5E7DF] blur-3xl opacity-60" />
      <div className="absolute top-64 left-1/3 w-[28rem] h-[28rem] rounded-full bg-[#EDEAF3] blur-3xl opacity-50" />
    </div>

    <div className="max-w-[1180px] mx-auto px-6">
      <div className="text-center max-w-3xl mx-auto">
        {/* Eyebrow */}
        <Reveal>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[#E7E1D6] bg-white/70 backdrop-blur px-4 py-1.5 mb-8 shadow-chic-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
            <span className="eyebrow text-[#8A8178]">New&nbsp;·&nbsp;AI growth engine for B2B</span>
          </div>
        </Reveal>

        {/* H1 */}
        <Reveal delay={100}>
          <h1 className="font-display text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-[4.6rem] font-medium tracking-[-0.02em] text-[#1C1A17] mb-7">
            Grow smarter,
            <br />
            <span className="italic text-teal-700">not harder.</span>
          </h1>
        </Reveal>

        {/* Subheadline */}
        <Reveal delay={200}>
          <p className="text-lg lg:text-xl text-[#6F6860] max-w-xl mx-auto mb-10 leading-relaxed">
            Scaliyo finds your best-fit buyers, scores their intent in real time, and
            launches personal outreach for you — so a small team can sell like a big one.
          </p>
        </Reveal>

        {/* CTAs */}
        <Reveal delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-5">
            <Link
              to="/signup"
              onClick={() => track('cta_click', { location: 'hero', label: 'start_free_trial' })}
              className="group px-8 py-3.5 bg-[#1C1A17] text-white rounded-full font-semibold text-[15px] transition-all duration-300 hover:bg-black hover:-translate-y-0.5 active:translate-y-0 shadow-chic"
            >
              Start free
              <span className="inline-block ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </Link>
            <a
              href="#how-it-works"
              className="px-8 py-3.5 border border-[#E0D9CD] bg-white/60 backdrop-blur text-[#1C1A17] rounded-full font-semibold text-[15px] hover:bg-white hover:border-[#CFC7B8] transition-all duration-300"
            >
              See how it works
            </a>
          </div>
          <p className="text-sm text-[#9A9189]">
            No credit card&nbsp;·&nbsp;Early access open
          </p>
        </Reveal>
      </div>

      {/* Floating product glimpse */}
      <Reveal delay={400}>
        <div className="relative mt-16 lg:mt-20 max-w-4xl mx-auto">
          <div className="rounded-[1.75rem] border border-[#EAE4D8] bg-white shadow-chic p-2.5">
            <div className="rounded-[1.35rem] bg-[#FBFAF7] border border-[#F0EBE1] px-5 py-6 sm:px-8 sm:py-8">
              {/* faux toolbar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EBD9D1]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E7E0CF]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D9E6E1]" />
                </div>
                <span className="eyebrow text-[#B7AEA2]">Live pipeline</span>
              </div>

              {/* Lead rows */}
              <div className="space-y-3 text-left">
                {[
                  { name: 'Nadia Okafor', role: 'VP Ops · Northwind', score: 94, tone: 'teal' },
                  { name: 'Ben Alvarez', role: 'Head of Growth · Fathom', score: 81, tone: 'sage' },
                  { name: 'Priya Menon', role: 'Founder · Loop Labs', score: 62, tone: 'sand' },
                ].map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center justify-between rounded-2xl border border-[#EFE9DF] bg-white px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 shrink-0 rounded-full bg-[#F1ECE1] flex items-center justify-center text-sm font-semibold text-[#8A8178]">
                        {l.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1C1A17] truncate">{l.name}</p>
                        <p className="text-xs text-[#9A9189] truncate">{l.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:block w-28 h-1.5 rounded-full bg-[#F0EBE1] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            l.tone === 'teal' ? 'bg-teal-600' : l.tone === 'sage' ? 'bg-[#8FB3A3]' : 'bg-[#D8C08A]'
                          }`}
                          style={{ width: `${l.score}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-[#1C1A17] tabular-nums w-8 text-right">{l.score}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-2 text-xs text-[#9A9189]">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                AI drafted 3 personalized emails · ready to send
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

export default Hero;
