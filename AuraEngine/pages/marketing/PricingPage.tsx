
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Plan } from '../../types';

const PricingPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .order('credits', { ascending: true });
        
        if (error) throw error;
        if (data) setPlans(data);
      } catch (err) {
        console.error("Error fetching plans:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  // Helper to provide design-specific descriptions not in the DB schema
  const getPlanDescription = (name: string) => {
    switch (name) {
      case 'Starter': return 'Perfect for solo founders and small sales teams.';
      case 'Professional': return 'For growing teams that need scale and precision.';
      case 'Enterprise': return 'Dedicated support and infrastructure for large companies.';
      default: return 'Custom intelligence tailored to your business needs.';
    }
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-indigo-600 uppercase tracking-widest">Pricing</h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl font-heading">
            Choose the plan that fits your growth
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-slate-600">
          Scale your outreach without breaking the bank. Start for free and upgrade as you grow.
        </p>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Syncing with Intelligence Grid...</p>
          </div>
        ) : (
          <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8">
            {plans.map((plan) => {
              const isMostPopular = plan.name === 'Professional';
              return (
                <div
                  key={plan.id}
                  className={`rounded-3xl p-8 ring-1 ring-slate-200 transition-all duration-500 ease-in-out hover:shadow-2xl hover:-translate-y-2 animate-in fade-in zoom-in-95 duration-700 ${
                    isMostPopular ? 'relative bg-slate-900 text-white ring-slate-900 shadow-2xl lg:scale-105 hover:lg:scale-[1.08]' : 'bg-white text-slate-900 hover:ring-indigo-200'
                  }`}
                >
                  {isMostPopular && (
                    <p className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-sm font-semibold leading-5 text-white shadow-lg animate-pulse">
                      Most popular
                    </p>
                  )}
                  <h3 className={`text-lg font-bold leading-8 font-heading ${isMostPopular ? 'text-white' : 'text-slate-900'}`}>
                    {plan.name}
                  </h3>
                  <p className={`mt-4 text-sm leading-6 ${isMostPopular ? 'text-slate-300' : 'text-slate-600'}`}>
                    {getPlanDescription(plan.name)}
                  </p>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-black tracking-tight font-heading">{plan.price}</span>
                    {plan.price !== 'Custom' && <span className="text-sm font-semibold leading-6">/month</span>}
                  </p>
                  <Link
                    to="/auth"
                    className={`mt-6 block rounded-xl px-3 py-3 text-center text-sm font-bold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-all duration-300 ${
                      isMostPopular
                        ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-500 hover:scale-105 active:scale-95'
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:scale-105 active:scale-95'
                    }`}
                  >
                    {plan.price === 'Custom' ? 'Contact Sales' : 'Start Free Trial'}
                  </Link>
                  <div className={`mt-8 p-4 rounded-2xl ${isMostPopular ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-100'}`}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Compute Capacity</p>
                    <p className={`text-xs font-bold ${isMostPopular ? 'text-white' : 'text-slate-900'}`}>{plan.credits.toLocaleString()} AI Generations / Mo</p>
                  </div>
                  <ul className={`mt-8 space-y-3 text-sm leading-6 ${isMostPopular ? 'text-slate-300' : 'text-slate-600'}`}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-x-3 group cursor-default">
                        <span className="text-indigo-500 transition-transform duration-300 group-hover:scale-125">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PricingPage;
