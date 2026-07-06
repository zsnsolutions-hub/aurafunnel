import React from 'react';
import { Link } from 'react-router-dom';
import { TargetIcon, EditIcon, ChartIcon, PlugIcon, RefreshIcon, ShieldIcon } from '../../components/Icons';
import Reveal from '../../components/marketing/Reveal';
import { track } from '../../lib/analytics';

const features = [
  {
    title: 'AI-powered lead scoring',
    description: 'Surface high-intent prospects automatically with models that read across 50+ buying signals in real time.',
    icon: <TargetIcon className="w-6 h-6" />,
  },
  {
    title: 'Hyper-personalized content',
    description: 'Generate outreach for email, LinkedIn and SMS that speaks to each lead’s actual context — never a template.',
    icon: <EditIcon className="w-6 h-6" />,
  },
  {
    title: 'Real-time sales analytics',
    description: 'Track conversion, response times and pipeline velocity with clean, ask-anything dashboards.',
    icon: <ChartIcon className="w-6 h-6" />,
  },
  {
    title: 'Seamless CRM integration',
    description: 'Connect Salesforce, HubSpot and Pipedrive to sync leads and insights across your stack effortlessly.',
    icon: <PlugIcon className="w-6 h-6" />,
  },
  {
    title: 'Automated follow-ups',
    description: 'Never drop a lead with adaptive sequences that respond to recipient behavior and sentiment.',
    icon: <RefreshIcon className="w-6 h-6" />,
  },
  {
    title: 'Security by default',
    description: 'Data encrypted in transit and at rest, SOC 2 practices, SSO and role-based access for your whole team.',
    icon: <ShieldIcon className="w-6 h-6" />,
  },
];

const FeaturesPage: React.FC = () => {
  return (
    <div className="bg-[#FBFAF7] text-[#1C1A17] pt-36 pb-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-teal-700 mb-5">Sell smarter</p>
            <h1 className="font-display text-4xl lg:text-[3.75rem] leading-[1.05] font-medium tracking-[-0.02em] text-[#1C1A17]">
              Everything you need to <span className="italic text-teal-700">scale your funnel</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#6F6860]">
              Scaliyo pairs state-of-the-art AI with calm, intuitive workflows — so your team can focus on the one thing that matters: closing deals.
            </p>
          </div>
        </Reveal>

        <div className="mx-auto mt-16 sm:mt-20 grid max-w-xl grid-cols-1 gap-6 lg:max-w-none lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 120}>
              <div className="group h-full flex flex-col rounded-[1.5rem] border border-[#EAE3D6] bg-white p-8 shadow-chic-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-chic">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF2EF] text-teal-700 mb-5 transition-colors duration-300 group-hover:bg-teal-600 group-hover:text-white">
                  {feature.icon}
                </span>
                <h3 className="font-display text-xl font-medium text-[#1C1A17] mb-2.5">{feature.title}</h3>
                <p className="text-[15px] leading-relaxed text-[#6F6860]">{feature.description}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <div className="mt-20 text-center">
            <Link
              to="/signup"
              onClick={() => track('cta_click', { location: 'features', label: 'start_free_trial' })}
              className="group inline-flex items-center px-8 py-3.5 bg-[#1C1A17] text-white rounded-full font-semibold text-[15px] transition-all duration-300 hover:bg-black hover:-translate-y-0.5 shadow-chic"
            >
              Start free
              <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

export default FeaturesPage;
