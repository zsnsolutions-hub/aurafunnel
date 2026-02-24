import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const FinalCTA: React.FC = () => (
  <section className="py-28 lg:py-36 relative overflow-hidden">
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(13,148,136,0.12),transparent)]" />
    <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-teal-500/3 to-transparent" />

    <div className="max-w-3xl mx-auto px-6 text-center">
      <Reveal>
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight font-heading mb-6">
          Stop losing deals you should be winning
        </h2>
        <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Join 2,400+ revenue teams using Scaliyo to find, engage, and close
          their best leads — powered by AI.
        </p>
        <Link
          to="/signup"
          onClick={() => track('cta_click', { location: 'final_cta', label: 'start_free_trial' })}
          className="group inline-flex items-center px-12 py-5 bg-teal-500 text-white rounded-xl font-bold text-xl transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-xl shadow-teal-500/25"
        >
          Start Free Trial
          <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
        <p className="mt-5 text-sm text-slate-500 font-medium">
          No credit card required &middot; Free 14-day trial &middot; Cancel
          anytime
        </p>

        {/* Trust logos */}
        <div className="flex items-center justify-center gap-8 mt-12 opacity-30 flex-wrap">
          {['Stackline', 'Nuvio', 'Meridian', 'DataSync', 'TechFlow'].map(
            (name) => (
              <span
                key={name}
                className="text-xs font-bold text-slate-400 tracking-wide"
              >
                {name}
              </span>
            ),
          )}
        </div>
      </Reveal>
    </div>
  </section>
);

export default FinalCTA;
