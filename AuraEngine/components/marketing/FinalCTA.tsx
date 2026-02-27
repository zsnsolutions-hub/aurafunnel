import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const FinalCTA: React.FC = () => (
  <section id="cta" className="py-28 lg:py-40 relative overflow-hidden">
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(13,148,136,0.08),transparent)]" />

    <div className="max-w-2xl mx-auto px-6 text-center">
      <Reveal>
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight font-heading mb-6">
          Your competitors already use AI.{' '}
          <span className="text-teal-400">Will you?</span>
        </h2>
        <p className="text-lg text-slate-400 mb-10">
          Start your 14-day free trial. No credit card required.
        </p>
        <Link
          to="/signup"
          onClick={() => track('cta_click', { location: 'final_cta', label: 'start_free_trial' })}
          className="group inline-flex items-center px-10 py-4 bg-teal-500 text-white rounded-xl font-bold text-lg transition-all duration-300 hover:bg-teal-400 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25"
        >
          Start Free Trial
          <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
        </Link>
      </Reveal>
    </div>
  </section>
);

export default FinalCTA;
