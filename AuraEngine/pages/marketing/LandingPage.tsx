
import React from 'react';
import { Link } from 'react-router-dom';
import { TargetIcon, EditIcon, ChartIcon, SparklesIcon, BoltIcon, ShieldIcon, PlugIcon } from '../../components/Icons';

const LandingPage: React.FC = () => {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 hero-glow -z-10"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-20 opacity-30">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200 rounded-full blur-[120px]"></div>
          <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-purple-200 rounded-full blur-[100px]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 bg-white/80 border border-slate-200 px-4 py-1.5 rounded-full shadow-sm mb-10 animate-float">
            <SparklesIcon className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Next-Gen Sales Intelligence</span>
          </div>
          
          <h1 className="text-6xl lg:text-8xl font-black text-slate-900 tracking-tight leading-[0.9] mb-8">
            The Operating System <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-gradient">
              for High-Growth Sales
            </span>
          </h1>
          
          <p className="text-xl text-slate-500 max-w-3xl mx-auto mb-12 leading-relaxed">
            Stop manually hunting. AuraFunnel leverages the Gemini Pro engine to score leads, 
            detect buying signals, and generate hyper-personalized content—all in one place.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth" className="group relative px-10 py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg transition-all duration-300 ease-out hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-200">
              <span className="relative z-10">Get Started for Free</span>
              <div className="absolute inset-0 rounded-2xl bg-indigo-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300"></div>
            </Link>
            <Link to="/contact" className="px-10 py-5 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all duration-300 ease-in-out shadow-sm hover:shadow-md">
              Schedule Private Demo
            </Link>
          </div>

          <div className="mt-24 relative max-w-6xl mx-auto group">
            <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/20 to-transparent blur-3xl -z-10 group-hover:opacity-100 transition-opacity duration-700 opacity-0"></div>
            <div className="rounded-[2.5rem] border-[8px] border-white bg-slate-100 shadow-2xl overflow-hidden ring-1 ring-slate-200">
               <img 
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426" 
                alt="Product Interface" 
                className="w-full grayscale-[0.2] hover:grayscale-0 transition-all duration-700 ease-in-out"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Logo Marquee */}
      <section className="py-20 bg-white border-y border-slate-100 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 mb-10 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em]">Fueling growth for the world's best teams</p>
        </div>
        <div className="relative">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-20">
            {['VERCEL', 'STRIPE', 'LINEAR', 'RAILS', 'NOTION', 'FIGMA', 'REVOLUT', 'AIRBNB'].map((logo) => (
              <span key={logo} className="text-3xl font-black text-slate-200 tracking-tighter hover:text-indigo-600 transition-colors duration-500 cursor-default">
                {logo}
              </span>
            ))}
            {/* Repeat for seamless loop */}
            {['VERCEL', 'STRIPE', 'LINEAR', 'RAILS', 'NOTION', 'FIGMA', 'REVOLUT', 'AIRBNB'].map((logo) => (
              <span key={`${logo}-2`} className="text-3xl font-black text-slate-200 tracking-tighter hover:text-indigo-600 transition-colors duration-500 cursor-default">
                {logo}
              </span>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-white to-transparent"></div>
          <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-white to-transparent"></div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-16 gap-8">
            <div className="max-w-2xl">
              <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-4 font-heading">
                Sales velocity starts with <br /> better intelligence.
              </h2>
              <p className="text-lg text-slate-500">Traditional CRMs are just databases. AuraFunnel is a brain that proactively finds your next million dollars in revenue.</p>
            </div>
            <Link to="/features" className="text-indigo-600 font-bold flex items-center gap-2 hover:gap-4 transition-all duration-300 ease-in-out group">
              Explore All Capabilities <BoltIcon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 grid-rows-2 gap-6 h-auto md:h-[800px]">
            {/* Large Card */}
            <div className="md:col-span-4 md:row-span-1 bg-white rounded-[2rem] border border-slate-200 p-10 flex flex-col justify-between group overflow-hidden relative shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 ease-in-out">
              <div className="relative z-10">
                <TargetIcon className="w-12 h-12 text-indigo-600 mb-6 group-hover:rotate-[15deg] transition-transform duration-500 ease-out" />
                <h3 className="text-3xl font-bold mb-4 tracking-tight font-heading">Dynamic Lead Scoring</h3>
                <p className="text-slate-500 max-w-md leading-relaxed">Our AI analyzes 50+ signals including company news, hiring trends, and tech stack changes to predict buying intent with 94% accuracy.</p>
              </div>
              <div className="absolute right-[-10%] bottom-[-10%] w-1/2 opacity-20 group-hover:opacity-40 group-hover:scale-110 transition-all duration-700 ease-in-out">
                <ChartIcon className="w-full h-full text-indigo-200" />
              </div>
            </div>

            {/* Vertical Card */}
            <div className="md:col-span-2 md:row-span-2 bg-slate-900 rounded-[2rem] p-10 flex flex-col justify-between text-white shadow-2xl relative overflow-hidden group hover:shadow-indigo-500/20 transition-all duration-500">
              <div className="absolute top-0 right-0 p-6">
                <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-bold mb-4 tracking-tight font-heading">Gemini Pro Personalization</h3>
                <p className="text-slate-400 leading-relaxed">One-click outreach generation. No more "Hi {'{{first_name}}'}". We generate unique, context-aware messages for every single lead.</p>
              </div>
              <div className="mt-12 bg-slate-800 p-6 rounded-2xl border border-slate-700 group-hover:border-slate-600 transition-colors duration-500">
                <div className="h-2 w-20 bg-indigo-500 rounded-full mb-3"></div>
                <div className="space-y-2">
                  <div className="h-1.5 w-full bg-slate-700 rounded-full"></div>
                  <div className="h-1.5 w-3/4 bg-slate-700 rounded-full"></div>
                  <div className="h-1.5 w-5/6 bg-slate-700 rounded-full"></div>
                </div>
              </div>
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
            </div>

            {/* Square Card 1 */}
            <div className="md:col-span-2 md:row-span-1 bg-indigo-600 rounded-[2rem] p-10 text-white shadow-xl hover:-translate-y-2 hover:shadow-indigo-500/30 transition-all duration-500 ease-in-out group">
              <PlugIcon className="w-12 h-12 mb-6 group-hover:scale-110 transition-transform duration-500" />
              <h3 className="text-2xl font-bold mb-2 font-heading">Instant CRM Sync</h3>
              <p className="text-indigo-100 text-sm leading-relaxed">Native integrations with Salesforce, HubSpot, and 20+ other platforms.</p>
            </div>

            {/* Square Card 2 */}
            <div className="md:col-span-2 md:row-span-1 bg-white rounded-[2rem] border border-slate-200 p-10 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 ease-in-out group">
              <ShieldIcon className="w-12 h-12 text-slate-800 mb-6 group-hover:scale-110 group-hover:text-indigo-600 transition-all duration-500" />
              <h3 className="text-2xl font-bold mb-2 font-heading text-slate-900 transition-colors duration-500 group-hover:text-indigo-600">SOC2 Certified</h3>
              <p className="text-slate-500 text-sm leading-relaxed">Enterprise-grade security and compliance for your mission-critical data.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-32 bg-white relative">
        <div className="max-w-5xl mx-auto px-6 bg-slate-900 rounded-[3rem] p-16 lg:p-24 text-center relative overflow-hidden shadow-3xl transition-transform duration-700 hover:scale-[1.01]">
          <div className="absolute inset-0 mesh-gradient opacity-40 -z-10"></div>
          <h2 className="text-4xl lg:text-6xl font-black text-white mb-8 tracking-tight font-heading leading-tight">
            Ready to outpace <br /> the competition?
          </h2>
          <p className="text-indigo-200 text-xl max-w-2xl mx-auto mb-12">
            Join 1,200+ companies who have replaced their manual workflows with AuraFunnel Intelligence.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link to="/auth" className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 rounded-2xl font-bold text-lg hover:bg-slate-100 hover:scale-105 transition-all duration-300 shadow-xl">
              Start Your Free Trial
            </Link>
            <p className="text-slate-400 text-sm font-medium">No credit card required. Cancel anytime.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
