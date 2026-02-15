
import React, { useState, useEffect } from 'react';
import { Plan } from '../../types';
import { supabase } from '../../lib/supabase';
import { CreditCardIcon, SparklesIcon, EditIcon, CheckIcon, BoltIcon } from '../../components/Icons';

const PricingManagement: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Form states for editing
  const [formPrice, setFormPrice] = useState('');
  const [formCredits, setFormCredits] = useState(0);
  const [formDesc, setFormDesc] = useState('');
  const [formFeatures, setFormFeatures] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('credits', { ascending: true });

      if (error) throw error;
      if (data) setPlans(data);
      setSchemaError(null);
    } catch (err: any) {
      console.error("Plan fetch failed:", err);
      if (err.message?.includes('description')) {
        setSchemaError("The 'description' column is missing from your 'plans' table in Supabase.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormPrice(plan.price);
    setFormCredits(plan.credits);
    setFormDesc(plan.description || '');
    setFormFeatures(plan.features.join('\n'));
  };

  const handleSave = async () => {
    if (!editingPlan) return;
    setIsSaving(true);

    try {
      const featureArray = formFeatures.split('\n').filter(f => f.trim() !== '');
      
      const { error } = await supabase
        .from('plans')
        .update({
          price: formPrice,
          credits: formCredits,
          description: formDesc,
          features: featureArray
        })
        .eq('id', editingPlan.id);

      if (error) {
        // Specifically catch the "column doesn't exist" or "schema cache" error
        if (error.message.includes('column') || error.message.includes('cache')) {
          setSchemaError(`Database Out of Sync: ${error.message}`);
          throw new Error("Schema sync required. See the notification in the dashboard header.");
        }
        throw new Error(error.message || error.details || "Database constraint violation.");
      }

      await fetchPlans();
      setEditingPlan(null);
      setSuccessMsg(`Successfully updated DNA for ${editingPlan.name}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error("Plan update failed:", err);
      const errorMsg = err?.message || (typeof err === 'string' ? err : 'Unknown network error');
      if (!errorMsg.includes('Schema sync required')) {
        alert(`System failed to update plan DNA: ${errorMsg}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Subscription Architect</h1>
          <p className="text-slate-500 mt-1">Configure global monetization logic and compute allocation.</p>
        </div>
        <div className="flex flex-col items-end space-y-2">
          {successMsg && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100 animate-in slide-in-from-right-4">
              ✓ {successMsg}
            </div>
          )}
          {schemaError && (
            <div className="px-4 py-2 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-100 animate-in shake">
              ⚠️ Database Out of Sync
            </div>
          )}
        </div>
      </div>

      {schemaError && (
        <div className="bg-amber-50 border border-amber-200 p-8 rounded-[2.5rem] flex items-center justify-between space-x-8 animate-in slide-in-from-top-4">
           <div className="flex items-center space-x-6">
              <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                 <BoltIcon className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                 <h3 className="text-lg font-bold text-amber-900 font-heading">Schema Evolution Required</h3>
                 <p className="text-amber-700 text-sm leading-relaxed max-w-xl">
                   The 'description' column is missing or stale in your Supabase schema cache. 
                   <br /><br />
                   <strong>Actionable Fix:</strong>
                   <ol className="list-decimal ml-5 mt-2 space-y-1">
                     <li>Run the updated SQL script (v6.3) from the Login page in your Supabase SQL Editor.</li>
                     <li>Go to your <strong>Supabase Dashboard</strong>.</li>
                     <li>Settings &rarr; API &rarr; PostgREST &rarr; <strong>Reload Schema</strong>.</li>
                   </ol>
                 </p>
              </div>
           </div>
           <button 
             onClick={fetchPlans}
             className="px-6 py-3 bg-white border border-amber-200 text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-100 transition-all shadow-sm"
           >
             Retry Sync
           </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 animate-pulse h-[400px]"></div>
          ))
        ) : (
          plans.map(plan => (
            <div key={plan.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
               <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <CreditCardIcon className="w-24 h-24" />
               </div>
               
               <div className="relative z-10 flex flex-col h-full">
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-black text-slate-900 font-heading">{plan.name}</h3>
                    <button 
                      onClick={() => handleEdit(plan)}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                 </div>

                 <div className="space-y-6 flex-grow">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pricing Node</p>
                       <p className="text-xl font-bold text-slate-900">{plan.price}</p>
                    </div>

                    <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                       <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Compute Capacity</p>
                       <p className="text-xl font-bold text-indigo-700">{plan.credits.toLocaleString()} Gen/Mo</p>
                    </div>

                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Display blurb</p>
                       <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 italic">
                         "{plan.description || 'No description configured.'}"
                       </p>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Feature Set ({plan.features.length})</p>
                       <div className="flex flex-wrap gap-2">
                          {plan.features.slice(0, 3).map((f, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-50 text-slate-500 text-[9px] font-black rounded-md border border-slate-100 truncate max-w-[120px]">
                              {f}
                            </span>
                          ))}
                          {plan.features.length > 3 && (
                            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-md border border-indigo-100">
                              +{plan.features.length - 3} More
                            </span>
                          )}
                       </div>
                    </div>
                 </div>
               </div>
            </div>
          ))
        )}
      </div>

      {/* EDIT MODAL */}
      {editingPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !isSaving && setEditingPlan(null)}></div>
          <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10">
              <div className="flex items-center space-x-4 mb-10">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <SparklesIcon className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-heading">Edit Plan DNA</h2>
                  <p className="text-slate-500 text-xs">Modifying architecture for the <span className="font-bold text-indigo-600">{editingPlan.name}</span> tier.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Price Point</label>
                  <input 
                    type="text" 
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gen Capacity</label>
                  <input 
                    type="number" 
                    value={formCredits}
                    onChange={(e) => setFormCredits(parseInt(e.target.value))}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-2 mb-8">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marketing Blurb</label>
                <textarea 
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-600 outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none" 
                  placeholder="Summarize the plan's purpose..."
                ></textarea>
              </div>

              <div className="space-y-2 mb-10">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Feature Bundle (One per line)</label>
                <textarea 
                  value={formFeatures}
                  onChange={(e) => setFormFeatures(e.target.value)}
                  rows={5}
                  className="w-full p-4 bg-slate-950 border border-white/10 rounded-2xl font-mono text-xs text-indigo-200 outline-none focus:ring-4 focus:ring-indigo-900/50 transition-all resize-none" 
                  placeholder="Advanced Scoring&#10;Priority Support&#10;Custom Integration..."
                ></textarea>
              </div>

              <div className="flex items-center space-x-4">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`flex-grow py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center space-x-3 shadow-2xl ${
                    isSaving 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 active:scale-95'
                  }`}
                >
                  {isSaving ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <CheckIcon className="w-5 h-5" />
                      <span>Commit DNA Changes</span>
                    </>
                  )}
                </button>
                <button 
                  onClick={() => setEditingPlan(null)}
                  disabled={isSaving}
                  className="px-8 py-5 text-slate-400 rounded-2xl font-bold hover:bg-slate-50 transition-all border border-transparent uppercase tracking-widest text-[10px]"
                >
                  Abort
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingManagement;
