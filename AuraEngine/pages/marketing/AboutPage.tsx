import React from 'react';

const values = [
  {
    title: 'Our vision',
    body: 'Every sales conversation should start from genuine understanding. By automating the research and personalization grind, we free reps to do what they do best — consult and advise.',
  },
  {
    title: 'Our story',
    body: 'Scaliyo began in 2026 with a small team of data scientists and sales operators who were tired of watching great reps lose their week to busywork. We’re building it in the open, alongside our first cohort of teams.',
  },
];

const principles = [
  { label: 'Honest by default', body: 'No dark patterns, no surprise charges, no fake urgency. Ever.' },
  { label: 'Small teams, big leverage', body: 'We build so a handful of people can outperform a whole department.' },
  { label: 'Signal over noise', body: 'Better outreach means fewer, sharper touches — not more spam.' },
];

const AboutPage: React.FC = () => {
  return (
    <div className="bg-[#FBFAF7] text-[#1C1A17]">
      <div className="relative isolate px-6 pt-36 lg:px-8">
        <div className="mx-auto max-w-4xl pb-24 sm:pb-32">
          <div className="text-center">
            <p className="eyebrow text-teal-700 mb-5">Our mission</p>
            <h1 className="font-display text-4xl sm:text-[3.75rem] leading-[1.04] font-medium tracking-[-0.02em] text-[#1C1A17]">
              Humanizing sales <span className="text-teal-700">with AI</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#6F6860] max-w-2xl mx-auto">
              Scaliyo was built to solve a simple problem: outreach has become too loud and impersonal.
              AI shouldn’t just help you spam more people — it should help you build deeper, more genuine connections.
            </p>
          </div>

          <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((v) => (
              <div key={v.title} className="bg-white p-8 rounded-[1.5rem] border border-[#EAE3D6] shadow-chic-sm">
                <h3 className="font-display text-2xl font-medium text-[#1C1A17] mb-4">{v.title}</h3>
                <p className="text-[#6F6860] leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-24">
            <div className="text-center mb-12">
              <p className="eyebrow text-teal-700 mb-4">What we stand for</p>
              <h2 className="font-display text-3xl lg:text-[2.5rem] leading-[1.1] font-medium tracking-[-0.02em] text-[#1C1A17]">
                A few principles we won’t bend on
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              {principles.map((p) => (
                <div key={p.label} className="bg-[#F5F2EB] border border-[#EAE3D6] rounded-2xl p-6">
                  <h4 className="font-display text-lg font-medium text-[#1C1A17] mb-2">{p.label}</h4>
                  <p className="text-sm text-[#6F6860] leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
