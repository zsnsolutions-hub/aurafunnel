import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const Hero: React.FC = () => (
  <section id="hero" className="relative pt-36 pb-24 lg:pt-52 lg:pb-36 overflow-hidden">
    {/* Background effects */}
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(13,148,136,0.18),transparent)]" />
    <div
      className="absolute inset-0 -z-10 opacity-30"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }}
    />

    <div className="max-w-[1200px] mx-auto px-6 text-center">
      {/* Badge */}
      <Reveal>
        <div className="inline-flex items-center gap-2.5 border border-teal-500/25 bg-teal-500/8 px-5 py-2 rounded-full mb-10">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-bold text-teal-300 uppercase tracking-[0.2em]">
            AI-Powered B2B Outbound
          </span>
        </div>
      </Reveal>

      {/* H1 */}
      <Reveal delay={150}>
        <h1 className="text-5xl sm:text-6xl lg:text-[76px] font-black tracking-tight leading-[1.05] mb-8 font-heading">
          Find, Engage &amp; Close Your Best Leads{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-teal-300">
            10x Faster with AI
          </span>
        </h1>
      </Reveal>

      {/* Subheadline */}
      <Reveal delay={300}>
        <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          Scaliyo is the AI-powered outbound platform that finds high-intent
          leads, enriches your pipeline, and launches personalized multi-channel
          outreach — so your team closes more, faster.
        </p>
      </Reveal>

      {/* CTAs */}
      <Reveal delay={450}>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'hero', label: 'start_free_trial' })}
            className="group px-9 py-4.5 bg-teal-500 text-white rounded-xl font-bold text-lg transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25"
          >
            Start Free Trial
            <span className="inline-block ml-2 transition-transform duration-300 group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
          <a
            href="#how-it-works"
            className="px-9 py-4.5 border border-slate-700 bg-white/5 backdrop-blur text-white rounded-xl font-bold text-lg hover:border-teal-500/40 hover:bg-teal-500/5 transition-all duration-300"
          >
            See How It Works
          </a>
        </div>
        <p className="text-sm text-slate-500 font-medium">
          No credit card required &middot; Setup in under 5 minutes
        </p>
      </Reveal>

      {/* Product Mockup */}
      <Reveal delay={600}>
        <div className="mt-20 max-w-5xl mx-auto" style={{ perspective: '1200px' }}>
          <div
            className="rounded-2xl border border-slate-700/60 bg-[#0F1D32] p-5 lg:p-8 shadow-2xl shadow-teal-500/8"
            style={{ transform: 'rotateX(2deg) rotateY(-1deg)' }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/50" />
              <div className="ml-4 h-2.5 w-48 rounded-full bg-slate-700/60" />
            </div>
            {/* Dashboard grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { label: 'Active Leads', value: '2,847', change: '+12%', color: 'text-teal-400' },
                { label: 'Intent Score', value: '94.2', change: '+3.1%', color: 'text-cyan-400' },
                { label: 'Response Rate', value: '34%', change: '+8%', color: 'text-indigo-400' },
                { label: 'Deals Closing', value: '$1.2M', change: '+22%', color: 'text-emerald-400' },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl bg-slate-800/60 border border-slate-700/40 p-4"
                >
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {card.label}
                  </p>
                  <p className={`text-xl font-black ${card.color} font-heading`}>{card.value}</p>
                  <p className="text-[10px] text-emerald-400 font-bold mt-1">{card.change}</p>
                </div>
              ))}
            </div>
            {/* Chart + Table */}
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-3 rounded-xl bg-slate-800/40 border border-slate-700/30 p-4 h-36">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Revenue Pipeline
                </p>
                <div className="flex items-end gap-1 h-20">
                  {[35, 42, 38, 55, 48, 62, 58, 70, 65, 78, 72, 85].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-gradient-to-t from-teal-500/40 to-teal-400/20"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-2 rounded-xl bg-slate-800/40 border border-slate-700/30 p-4 h-36">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Hot Leads
                </p>
                <div className="space-y-2">
                  {['Acme Corp', 'TechFlow', 'DataSync'].map((name, i) => (
                    <div key={name} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-[8px] font-bold text-teal-300">
                        {name[0]}
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-700 flex-1">
                        <div
                          className="h-1.5 rounded-full bg-teal-500/50"
                          style={{ width: `${90 - i * 15}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-teal-400">{95 - i * 5}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

export default Hero;
