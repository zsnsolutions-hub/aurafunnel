import React, { useState, useEffect } from 'react';
import { Lead, ContentType, User } from '../../types';
import { FlameIcon, BoltIcon, CheckIcon, SparklesIcon } from '../../components/Icons';
import { generateLeadContent } from '../../lib/gemini';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';

interface ClientDashboardProps {
  user: User;
}

const ClientDashboard: React.FC<ClientDashboardProps> = ({ user: initialUser }) => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadForGen, setSelectedLeadForGen] = useState<Lead | null>(null);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', insights: '' });
  
  const [contentType, setContentType] = useState<ContentType>(ContentType.EMAIL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');
  const [genError, setGenError] = useState('');

  useEffect(() => {
    fetchLeads();
  }, [user]);

  const fetchLeads = async () => {
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('client_id', user.id)
      .order('score', { ascending: false });

    if (data) setLeads(data);
    setLoadingLeads(false);
  };

  const openGenModal = (lead: Lead) => {
    setSelectedLeadForGen(lead);
    setGenResult('');
    setGenError('');
    setIsGenModalOpen(true);
  };

  const handleGenerate = async () => {
    if (!selectedLeadForGen) return;

    if (user.credits_used >= user.credits_total) {
      setGenError('Insufficient credits.');
      return;
    }
    
    setIsGenerating(true);
    setGenError('');
    
    try {
      // 1. AI Generation (Now includes pre-flight checks and telemetry)
      const aiResponse = await generateLeadContent(selectedLeadForGen, contentType);
      
      if (aiResponse.error_code) {
        setGenError(aiResponse.text);
        setIsGenerating(false);
        return;
      }

      // 2. Atomic Credit Consumption
      const { data: rpcData, error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      
      if (rpcError) throw new Error(rpcError.message);
      
      if (rpcData.success) {
        setGenResult(aiResponse.text);
        if (refreshProfile) await refreshProfile();
      } else {
        throw new Error(rpcData.message || 'Verification failed.');
      }
      
    } catch (err: unknown) {
      console.error("Quick Gen Error:", err);
      setGenError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const mockScore = Math.floor(Math.random() * 40) + 60;
    
    const { data, error } = await supabase
      .from('leads')
      .insert([{
        ...newLead,
        client_id: user.id,
        score: mockScore,
        status: 'New',
        lastActivity: 'Just now'
      }])
      .select()
      .single();

    if (data) {
      setLeads([data, ...leads]);
      setIsAddLeadOpen(false);
      setNewLead({ name: '', email: '', company: '', insights: '' });
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(genResult);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Lead Intelligence</h1>
          <p className="text-slate-500 mt-1">Monitor and manage high-intent prospects.</p>
        </div>
        <button 
          onClick={() => setIsAddLeadOpen(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
        >
          Add Lead
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center">
            <FlameIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Hot Leads</p>
            <p className="text-2xl font-bold text-slate-900">{leads.filter(l => l.score > 80).length} Active</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
            <BoltIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Avg. Score</p>
            <p className="text-2xl font-bold text-slate-900">
              {leads.length > 0 ? (leads.reduce((a, b) => a + b.score, 0) / leads.length).toFixed(1) : '0'}%
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
            <CheckIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Total Prospects</p>
            <p className="text-2xl font-bold text-slate-900">{leads.length}</p>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 font-heading">Priority Prospect List</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Lead Detail</th>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4 text-center">Aura Score</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                        {lead.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{lead.name}</p>
                        <p className="text-xs text-slate-500 truncate">{lead.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">{lead.company}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center space-y-1">
                      <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${lead.score > 80 ? 'bg-indigo-500' : lead.score > 50 ? 'bg-orange-400' : 'bg-red-400'}`} 
                          style={{ width: `${lead.score}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-black text-slate-800 tracking-tighter">{lead.score}% MATCH</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                      lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                      lead.status === 'New' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openGenModal(lead)}
                      className="inline-flex items-center space-x-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all transform active:scale-90"
                    >
                      <SparklesIcon className="w-3.5 h-3.5" />
                      <span>GENERATE</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI CONTENT MODAL */}
      {isGenModalOpen && selectedLeadForGen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !isGenerating && setIsGenModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex flex-col md:flex-row h-full">
              <div className="w-full md:w-1/2 p-10 border-r border-slate-100">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                    <SparklesIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 font-heading">Content Studio</h2>
                    <p className="text-xs text-slate-500">Powering outreach for {selectedLeadForGen.name}</p>
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Target Context</p>
                    <p className="text-sm font-bold text-slate-800 mb-1">{selectedLeadForGen.company}</p>
                    <p className="text-xs text-slate-500 italic leading-relaxed">"{selectedLeadForGen.insights}"</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-4">Select Channel</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(Object.values(ContentType) as ContentType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setContentType(type)}
                          disabled={isGenerating}
                          className={`px-4 py-3 text-xs rounded-xl font-bold transition-all border ${
                            contentType === type 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' 
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center space-x-2 ${
                      isGenerating ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-slate-200'
                    }`}
                  >
                    {isGenerating ? 'AI Reasoning...' : 'Build Outreach'}
                  </button>
                  {genError && <p className="text-center text-xs text-red-500 font-bold uppercase tracking-tight">{genError}</p>}
                </div>
              </div>
              <div className="w-full md:w-1/2 bg-slate-950 flex flex-col">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Preview Mode</span>
                  {genResult && <button onClick={copyResult} className="px-3 py-1 bg-white/10 text-white hover:bg-white/20 rounded-md text-[10px] font-bold">COPY</button>}
                </div>
                <div className="flex-grow p-10 overflow-y-auto custom-scrollbar text-indigo-100 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {isGenerating ? 'Neural synchronization in progress...' : genResult || 'Ready for generation.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD LEAD MODAL */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsAddLeadOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col">
            <h2 className="text-2xl font-bold text-slate-900 font-heading mb-10">New Lead Profile</h2>
            <form className="space-y-6 flex-grow" onSubmit={handleAddLead}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} placeholder="Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Email</label>
                <input required type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} placeholder="robert@stripe.com" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input required type="text" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} placeholder="Stripe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={4} value={newLead.insights} onChange={e => setNewLead({...newLead, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none"></textarea>
              </div>
              <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl">Create Lead Profile</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;