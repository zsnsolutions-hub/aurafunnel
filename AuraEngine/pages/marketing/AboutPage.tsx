
import React from 'react';

const AboutPage: React.FC = () => {
  return (
    <div className="bg-white">
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-4xl py-24 sm:py-32">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              Our Mission: Humanizing Sales with AI
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Founded in 2023, AuraFunnel was built to solve a simple problem: sales outreach has become too loud and impersonal. 
              We believe AI shouldn't just spam more people—it should help sales professionals build deeper, more meaningful connections.
            </p>
          </div>

          <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Our Vision</h3>
              <p className="text-slate-600 leading-relaxed">
                We envision a world where every sales conversation starts with a genuine understanding of the prospect's needs. 
                By automating the research and personalization phase, we free up sales reps to do what they do best: consult and advise.
              </p>
            </div>
            <div className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Our Story</h3>
              <p className="text-slate-600 leading-relaxed">
                AuraFunnel started in a small garage with a group of data scientists and sales veterans. 
                Today, we support thousands of sales teams globally, from high-growth startups to Fortune 500 enterprises.
              </p>
            </div>
          </div>

          <div className="mt-24 text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-8">Trusted by Industry Leaders</h2>
            <div className="flex flex-wrap justify-center items-center gap-12 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all">
              <span className="text-2xl font-black tracking-tighter text-slate-900">VERCEL</span>
              <span className="text-2xl font-black tracking-tighter text-slate-900">STRIPE</span>
              <span className="text-2xl font-black tracking-tighter text-slate-900">LINEAR</span>
              <span className="text-2xl font-black tracking-tighter text-slate-900">NOTION</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
