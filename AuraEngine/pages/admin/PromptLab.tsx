import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BoltIcon, SparklesIcon, CheckIcon, RefreshIcon, EditIcon, ShieldIcon } from '../../components/Icons';

const PromptLab: React.FC = () => {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testLead] = useState({ name: 'Alex Thompson', company: 'Global Dynamics', insights: 'Expanding cloud operations, seeking SaaS optimization.' });

  const fetchPrompts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('ai_prompts').select('*').order('created_at', { ascending: false });
    if (error) console.error('PromptLab fetch error:', error.message);
    if (data) setPrompts(data);
    setLoading(false);
  };

  useEffect(() => { fetchPrompts(); }, []);

  const handleSave = async () => {
    if (!editingPrompt.template) return;
    setIsSaving(true);
    
    const { error } = await supabase.from('ai_prompts').insert([{
      name: editingPrompt.name,
      template: editingPrompt.template,
      version: prompts.filter(p => p.name === editingPrompt.name).length + 1,
      is_active: false
    }]);
    
    if (!error) {
      await fetchPrompts();
      setEditingPrompt(null);
    }
    setIsSaving(false);
  };

  const getPreview = (template: string) => {
    if (!template) return '';
    return template
      .replace(/{{lead_name}}/g, testLead.name)
      .replace(/{{company}}/g, testLead.company)
      .replace(/{{insights}}/g, testLead.insights)
      .replace(/{{type}}/g, 'Cold Email');
  };

  if (loading) return <div className="py-32 text-center animate-pulse text-slate-400 uppercase tracking-[0.5em]">Tuning Workspace...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Prompt Lab</h1>
          <p className="text-slate-500 mt-1">Refine the AI's core reasoning patterns and outreach templates.</p>
        </div>
        <button 
          onClick={() => setEditingPrompt({ name: 'sales_outreach', template: 'Write a {{type}} to {{lead_name}} at {{company}}. \n\nContext: {{insights}}' })}
          className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl hover:bg-indigo-600 transition-all"
        >
          New Strategy
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">DNA Registry</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            {prompts.map(p => (
              <div 
                key={p.id} 
                className={`p-6 bg-white border rounded-[2rem] cursor-pointer transition-all hover:shadow-lg ${p.is_active ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-indigo-100' : 'border-slate-200 shadow-sm'}`} 
                onClick={() => setEditingPrompt(p)}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-black text-slate-900 truncate uppercase">{p.name}</span>
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">v{p.version}.0</span>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2 italic leading-relaxed">"{p.template}"</p>
                {p.is_active && <span className="mt-4 block text-[8px] font-black text-emerald-600 uppercase tracking-widest">Live in Production</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {editingPrompt ? (
            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><EditIcon className="w-6 h-6" /></div>
                  <h3 className="font-bold text-slate-900 font-heading">Logic Workspace</h3>
                </div>
                <div className="flex space-x-3">
                   <button onClick={() => setEditingPrompt(null)} className="px-5 py-2.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Discard</button>
                   <button 
                    onClick={handleSave} 
                    disabled={isSaving} 
                    className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all"
                   >
                     {isSaving ? 'Compiling...' : `Deploy v${editingPrompt.version ? editingPrompt.version + 1 : 1}`}
                   </button>
                </div>
              </div>
              <div className="p-10 space-y-8">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Intelligence Template</label>
                   <textarea 
                    value={editingPrompt.template}
                    onChange={(e) => setEditingPrompt({...editingPrompt, template: e.target.value})}
                    rows={10}
                    className="w-full p-8 bg-slate-50 border border-slate-200 rounded-[2rem] font-mono text-sm text-slate-700 focus:ring-4 focus:ring-indigo-100 outline-none transition-all resize-none shadow-inner"
                   ></textarea>
                </div>
                <div className="p-8 bg-slate-950 rounded-[2rem] text-indigo-100 border border-white/10 shadow-2xl">
                   <p className="text-sm leading-relaxed opacity-90 italic font-medium">
                      {getPreview(editingPrompt.template) || 'Neural link idle. Enter template logic above.'}
                   </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[500px] border-2 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center text-center p-20 bg-slate-50/30">
               <BoltIcon className="w-16 h-16 text-slate-100 mb-6" />
               <h3 className="text-2xl font-bold text-slate-900 mb-2 font-heading">Neural Workspace Idle</h3>
               <p className="text-slate-500 text-sm max-w-sm mx-auto leading-relaxed">Select a build from the registry or initialize a new neural branch.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptLab;