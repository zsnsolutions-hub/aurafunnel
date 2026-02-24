
import React from 'react';
import { TargetIcon, EditIcon, ChartIcon, PlugIcon, RefreshIcon, ShieldIcon } from '../../components/Icons';

const features = [
  {
    title: "AI-Powered Lead Scoring",
    description: "Identify high-intent prospects automatically using advanced machine learning models trained on millions of sales interactions.",
    icon: <TargetIcon className="w-6 h-6" />,
    color: "bg-indigo-100 text-indigo-600"
  },
  {
    title: "Hyper-Personalized Content",
    description: "Generate unique outreach messages for email, LinkedIn, and SMS that resonate with each lead's specific business challenges.",
    icon: <EditIcon className="w-6 h-6" />,
    color: "bg-purple-100 text-purple-600"
  },
  {
    title: "Real-time Sales Analytics",
    description: "Track conversion rates, response times, and pipeline velocity with interactive dashboards and custom reporting.",
    icon: <ChartIcon className="w-6 h-6" />,
    color: "bg-emerald-100 text-emerald-600"
  },
  {
    title: "Seamless CRM Integration",
    description: "Connect with Salesforce, HubSpot, and Pipedrive to sync leads and insights effortlessly across your tech stack.",
    icon: <PlugIcon className="w-6 h-6" />,
    color: "bg-blue-100 text-blue-600"
  },
  {
    title: "Automated Follow-ups",
    description: "Never miss a lead with intelligent drip campaigns that adapt based on recipient behavior and sentiment.",
    icon: <RefreshIcon className="w-6 h-6" />,
    color: "bg-orange-100 text-orange-600"
  },
  {
    title: "Enterprise Security",
    description: "Rest easy with SOC2 Type II compliance, SSO support, and granular role-based access controls for your entire team.",
    icon: <ShieldIcon className="w-6 h-6" />,
    color: "bg-slate-100 text-slate-600"
  }
];

const FeaturesPage: React.FC = () => {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-indigo-600">Sell Smarter</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to scale your sales funnel
          </p>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Scaliyo combines state-of-the-art AI with intuitive workflows to help your sales team focus on what matters most: closing deals.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="flex flex-col p-8 rounded-3xl border border-slate-100 hover:shadow-xl transition-shadow bg-slate-50/50">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-slate-900">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${feature.color}`}>
                    {feature.icon}
                  </span>
                  {feature.title}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-slate-600">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default FeaturesPage;
