import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const Hero: React.FC = () => (
  <section id="hero" className="relative pt-44 pb-28 lg:pt-60 lg:pb-40 overflow-hidden">
    {/* Background glow */}
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_45%_at_50%_-10%,rgba(13,148,136,0.15),transparent)]" />

    <div className="max-w-[1400px] mx-auto px-6 text-center">
      {/* Badge */}
      <Reveal>
        <div className="inline-flex items-center gap-2.5 border border-teal-500/20 bg-teal-500/5 px-5 py-2 rounded-full mb-8">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-bold text-teal-300 uppercase tracking-[0.2em]">
            AI Revenue Infrastructure
          </span>
        </div>
      </Reveal>

      {/* H1 */}
      <Reveal delay={100}>
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-8 font-heading max-w-4xl mx-auto">
          Stop Guessing Who Will Buy.
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-teal-300">
            Let AI Tell You.
          </span>
        </h1>
      </Reveal>

      {/* Subheadline */}
      <Reveal delay={200}>
        <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          Scaliyo researches every prospect, scores buying intent in real time,
          and launches hyper-personalized outreach automatically.
        </p>
      </Reveal>

      {/* CTAs */}
      <Reveal delay={300}>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-5">
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'hero', label: 'start_free_trial' })}
            className="group px-9 py-4 bg-teal-500 text-white rounded-xl font-bold text-lg transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25"
          >
            Start Free Trial
            <span className="inline-block ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
          </Link>
          <a
            href="#how-it-works"
            className="px-9 py-4 border border-slate-700 bg-white/5 backdrop-blur text-white rounded-xl font-bold text-lg hover:border-teal-500/40 hover:bg-teal-500/5 transition-all duration-300"
          >
            See How It Works
          </a>
        </div>
        <p className="text-sm text-slate-500 font-medium">
          No credit card required &middot; Setup in 5 minutes
        </p>
      </Reveal>
    </div>
  </section>
);

export default Hero;
