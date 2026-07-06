import React from 'react';
import Reveal from './Reveal';

const AIAssistant: React.FC = () => (
  <section id="ai-assistant" className="py-24 lg:py-32 bg-[#F5F2EB] border-y border-[#EDE7DB]">
    <div className="max-w-[1180px] mx-auto px-6">
      <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
        <Reveal>
          <div>
            <p className="eyebrow text-teal-700 mb-5">Your AI strategist</p>
            <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
              Ask anything about your pipeline
            </h2>
            <p className="mt-6 text-lg text-[#6F6860] leading-relaxed max-w-md">
              Skip the spreadsheets. Ask in plain English and get an answer grounded in your
              own data — in seconds, not meetings.
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="rounded-[1.75rem] border border-[#EAE3D6] bg-white shadow-chic p-6 lg:p-8">
            {/* User */}
            <div className="flex justify-end mb-4">
              <div className="max-w-[80%] bg-[#1C1A17] rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-sm text-white">Which deals should I focus on this week?</p>
              </div>
            </div>
            {/* AI */}
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#F5F2EB] border border-[#EDE7DB] rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-sm text-[#4B453E] leading-relaxed">
                  Here are your top 3 by intent &amp; close probability — Northwind (94),
                  Fathom (81) and Loop Labs (62). Want me to draft outreach for each?
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#9A9189]">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              Grounded in your live CRM data
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);

export default AIAssistant;
