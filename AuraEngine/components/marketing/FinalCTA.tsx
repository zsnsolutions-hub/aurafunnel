import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

const FinalCTA: React.FC = () => (
  <section id="cta" className="py-24 lg:py-32">
    <div className="max-w-[1180px] mx-auto px-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-[#EAE3D6] bg-white px-8 py-16 lg:py-20 text-center shadow-chic">
          {/* pastel wash */}
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute -top-16 left-1/4 w-96 h-96 rounded-full bg-[#E7F0ED] blur-3xl opacity-80" />
            <div className="absolute -bottom-20 right-1/4 w-96 h-96 rounded-full bg-[#F5E7DF] blur-3xl opacity-70" />
          </div>

          <p className="eyebrow text-teal-700 mb-6">Early access</p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-[3.75rem] leading-[1.05] font-medium tracking-[-0.02em] text-[#1C1A17] mb-5 max-w-2xl mx-auto">
            Give your reps their <span className="italic text-teal-700">time back</span>
          </h2>
          <p className="text-lg text-[#6F6860] mb-9 max-w-md mx-auto">
            Join the first cohort building on Scaliyo. Free to start, no credit card required.
          </p>
          <Link
            to="/signup"
            onClick={() => track('cta_click', { location: 'final_cta', label: 'start_free_trial' })}
            className="group inline-flex items-center px-9 py-4 bg-[#1C1A17] text-white rounded-full font-semibold text-[15px] transition-all duration-300 hover:bg-black hover:-translate-y-0.5 shadow-chic"
          >
            Start free
            <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

export default FinalCTA;
