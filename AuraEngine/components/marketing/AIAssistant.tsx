import React from 'react';
import Reveal from './Reveal';

const AIAssistant: React.FC = () => (
  <section id="ai-assistant" className="py-24 lg:py-32 border-y border-slate-800/60">
    <div className="max-w-[1400px] mx-auto px-6">
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <div className="text-center mb-12">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-5">
              Your AI Revenue Strategist
            </h2>
            <p className="text-lg text-slate-400">
              Ask questions about your pipeline. Get data-backed answers instantly.
            </p>
          </div>
        </Reveal>

        {/* Compact chat example */}
        <Reveal delay={200}>
          <div className="bg-[#0F1D32] rounded-2xl border border-slate-700/50 p-6 lg:p-8 max-w-lg mx-auto">
            {/* User */}
            <div className="flex justify-end mb-4">
              <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-sm text-white">Which deals should I focus on?</p>
              </div>
            </div>
            {/* AI */}
            <div className="flex justify-start">
              <div className="bg-slate-800/50 border border-slate-700/30 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-sm text-slate-300">
                  Here are your top 3 based on intent and close probability.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);

export default AIAssistant;
