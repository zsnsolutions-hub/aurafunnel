import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BoltIcon, SparklesIcon, CheckIcon, ShieldIcon } from '../../components/Icons';

const StrategyHub: React.FC = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStrategies = async () => {
      const { data } = await supabase.from('ai_prompts').select('*').order('version', { ascending: false });
      if (data) setStrategies(data);
      setLoading(false);
    };
    fetchStrategies();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight font-heading">Neural Strategy Hub</h1>
          <p className="text-slate-500 mt-1">Select the intelligence framework driving your prospect outreach.</p>
        </div>
        <div className="bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 flex items-center space-x-3">
           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
           <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Optimizer Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-80 bg-white border rounded-[2.5rem] animate-pulse"></div>)
        ) : strategies.map((s) => (
          <div key={s.id} className={`bg-white rounded-[2.5rem] p-10 border-2 transition-all group relative overflow-hidden flex flex-col ${s.is_active ? 'border-indigo-600 shadow-2xl shadow-indigo-100' : 'border-slate-100 hover:border-indigo-200 shadow-sm'}`}>
            <div className="flex justify-between items-start mb-8">
               <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${s.is_active ? 'bg-indigo-600 text-white shadow-xl' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors'}`}>
                  <SparklesIcon className="w-6 h-6" />
               </div>
               {s.is_active && <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm">Global Default</span>}
            </div>

            <div className="flex-grow">
               <h3 className="text-xl font-bold text-slate-900 font-heading mb-2">Build v{s.version}.0</h3>
               <p className="text-slate-500 text-xs leading-relaxed line-clamp-4 italic mb-6">
                 "{s.template}"
               </p>
            </div>

            <div className="pt-6 border-t border-slate-50 space-y-4">
               <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <span>Conversion Index</span>
                  <span className="text-slate-900">94.2%</span>
               </div>
               <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full w-[94%]"></div>
               </div>
            </div>

            <button disabled={s.is_active} className={`mt-8 w-full py-4 rounded-2xl font-bold text-sm transition-all ${s.is_active ? 'bg-indigo-50 text-indigo-400 cursor-default' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl'}`}>
               {s.is_active ? 'Currently Driving Outreach' : 'Request Strategy Deployment'}
            </button>
          </div>
        ))}
      </div>

      <div className="p-12 bg-slate-900 rounded-[3rem] shadow-3xl relative overflow-hidden group">
         <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
         <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10 text-center md:text-left">
            <div className="max-w-lg">
               <h3 className="text-2xl font-bold text-white font-heading mb-4 flex items-center justify-center md:justify-start space-x-3">
                  <BoltIcon className="w-7 h-7 text-indigo-400" />
                  <span>Custom Neural Persona</span>
               </h3>
               <p className="text-indigo-200 text-sm leading-relaxed">
                  Need a strategy that matches your unique brand voice? Our engineers can train a dedicated sub-model specifically for your company's outreach.
               </p>
            </div>
            <button className="px-10 py-5 bg-white text-slate-900 rounded-2xl font-bold hover:scale-105 transition-all shadow-2xl">Contact Solutions Lab</button>
         </div>
      </div>
      
      <div className="flex items-center justify-center space-x-3 opacity-20 text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 py-10">
         <ShieldIcon className="w-4 h-4" />
         <span>Strategy Integrity Protocol v1.4</span>
      </div>
    </div>
  );
};

export default StrategyHub;