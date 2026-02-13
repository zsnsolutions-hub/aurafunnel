import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BoltIcon, SparklesIcon, CheckIcon, RefreshIcon, EditIcon } from '../../components/Icons';

const PromptLab: React.FC = () => {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testLead] = useState({ name: 'Jordan Belfort', company: 'Stratton Oakmont', insights: 'Aggressive growth targets, focus on penny stocks.' });

  const fetchPrompts = async () => {
    setLoading(true);
    const { data } = await supabase.from('ai_prompts').select('*').order('created_at', { ascending: false });
    if (data) setPrompts(data);
    setLoading(false);
  };

  useEffect(() => { fetchPrompts(); }, []);

  const handleSave = async () => {
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
    return template
      .replace('{{lead_name}}', testLead.name)
      .replace('{{company}}', testLead.company)
      .replace('{{insights}}', testLead.insights)
      .replace('{{type}}', 'Cold Email');
  };

  if (loading) return <div className="py-20 text-center animate-pulse text-slate-400 font-black uppercase tracking-[0.5em]">Initializing Workspace...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Prompt Engineering Lab</h1>
          <p className="text-slate-500 mt-1">Develop and test new outreach logic before global deployment.</p>
        </div>
        <button 
          onClick={() => setEditingPrompt({ name: 'sales_outreach', template: 'Hey {{lead_name}} at {{company}}...' })}
          className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl hover:bg-indigo-600 transition-all"
        >
          New Strategy Draft
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Version History</h3>
          <div className="space-y-3">
            {prompts.map(p => (
              <div key={p.id} className={`p-5 bg-white border rounded-3xl cursor-pointer transition-all hover:shadow-lg ${p.is_active ? 'border-indigo-600 ring-4 ring-indigo-50' : 'border-slate-200'}`} onClick={() => setEditingPrompt(p)}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-slate-900">{p.name}</span>
                  <span className="text-[10px] font-black text-slate-400">v{p.version}</span>
                </div>
                <p className="text-[10px] text-slate-500 truncate">{p.template}</p>
                {p.is_active && <span className="mt-3 inline-block px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded uppercase tracking-widest">Live in Production</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {editingPrompt ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><EditIcon className="w-5 h-5" /></div>
                  <h3 className="font-bold text-slate-900 font-heading">Neural Workspace</h3>
                </div>
                <div className="flex space-x-2">
                   <button onClick={() => setEditingPrompt(null)} className="px-4 py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancel</button>
                   <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Save v{editingPrompt.version ? editingPrompt.version + 1 : 1}</button>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Strategy Template</label>
                   <textarea 
                    value={editingPrompt.template}
                    onChange={(e) => setEditingPrompt({...editingPrompt, template: e.target.value})}
                    rows={8}
                    className="w-full p-6 bg-slate-50 border border-slate-200 rounded-3xl font-mono text-sm text-slate-700 focus:ring-4 focus:ring-indigo-100 outline-none transition-all resize-none"
                   ></textarea>
                </div>
                <div className="p-6 bg-slate-950 rounded-3xl text-indigo-100 border border-white/5">
                   <div className="flex items-center space-x-2 mb-4">
                      <SparklesIcon className="w-4 h-4 text-indigo-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Real-time Neural Preview</span>
                   </div>
                   <p className="text-sm leading-relaxed opacity-90 italic">
                      {getPreview(editingPrompt.template)}
                   </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-center p-20">
               <BoltIcon className="w-16 h-16 text-slate-100 mb-6" />
               <h3 className="text-xl font-bold text-slate-900 mb-2">Select a version to inspect</h3>
               <p className="text-slate-400 text-sm max-w-xs">Modifying core prompts affects global outreach quality. Use caution when editing live versions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptLab;