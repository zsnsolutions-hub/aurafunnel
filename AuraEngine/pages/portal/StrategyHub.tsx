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
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight font-heading">Neural Strategy Hub</h1>
          <p className="text-slate-500 mt-2 max-w-lg leading-relaxed font-medium">
            Monitor and influence the intelligence frameworks driving your outreach engine.
          </p>
        </div>
        <div className="bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100 flex items-center space-x-4 shadow-sm animate-float">
           <div className="relative">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
           </div>
           <span className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em]">Neural Link: Production</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-[480px] bg-white border border-slate-100 rounded-[3rem] animate-pulse"></div>
          ))
        ) : strategies.map((s) => (
          <div 
            key={s.id} 
            className={`bg-white rounded-[3rem] p-10 border-2 transition-all group relative overflow-hidden flex flex-col ${
              s.is_active ? 'border-indigo-600 shadow-2xl shadow-indigo-100' : 'border-slate-100 hover:border-indigo-200 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start mb-8">
               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                 s.is_active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'
               }`}>
                  <SparklesIcon className="w-7 h-7" />
               </div>
               {s.is_active && (
                 <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">Active DNA</span>
               )}
            </div>

            <div className="flex-grow">
               <h3 className="text-2xl font-bold text-slate-900 font-heading mb-3">Model Build v{s.version}.0</h3>
               <p className="text-slate-500 text-sm leading-relaxed line-clamp-4 italic border-l-4 border-slate-100 pl-4 bg-slate-50 py-3 rounded-r-2xl">
                 "{s.template}"
               </p>
            </div>

            <div className="pt-8 mt-8 border-t border-slate-50 space-y-5">
               <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  <span>Neural Confidence Index</span>
                  <span className="text-slate-900">{s.is_active ? '94.2%' : '88.1%'}</span>
               </div>
               <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className={`h-full transition-all duration-1000 ${s.is_active ? 'bg-indigo-600' : 'bg-slate-300'}`} 
                    style={{ width: s.is_active ? '94%' : '88%' }}
                  ></div>
               </div>
            </div>

            <button 
              disabled={s.is_active} 
              className={`mt-10 w-full py-5 rounded-[2rem] font-bold text-sm transition-all transform active:scale-95 flex items-center justify-center space-x-2 ${
                s.is_active ? 'bg-indigo-50 text-indigo-400 cursor-default' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl'
              }`}
            >
               {s.is_active ? 'Currently Powering Outreach' : 'Request Strategy Deployment'}
            </button>
          </div>
        ))}
      </div>
      
      <div className="flex items-center justify-center space-x-4 opacity-30 text-[9px] font-black uppercase tracking-[1em] text-slate-400 py-10">
         <ShieldIcon className="w-4 h-4" />
         <span>Neural Governance v1.4</span>
      </div>
    </div>
  );
};

export default StrategyHub;