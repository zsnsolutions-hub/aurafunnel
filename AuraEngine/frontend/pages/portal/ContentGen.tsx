import React, { useState, useEffect } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Lead, ContentType, User } from '../../types';
import { generateLeadContent } from '../../lib/gemini';
import { SparklesIcon } from '../../components/Icons';
import { supabase } from '../../lib/supabase';

const ContentGen: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const query = new URLSearchParams(useLocation().search);
  const initialLeadId = query.get('leadId');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId || '');
  const [contentType, setContentType] = useState<ContentType>(ContentType.EMAIL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const creditsTotal = user.credits_total ?? 500;
  const creditsUsed = user.credits_used ?? 0;

  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id)
        .order('score', { ascending: false });

      if (data) setLeads(data);
      if (error) console.error("Error fetching leads:", error);
      setLoadingLeads(false);
    };

    if (user) fetchLeads();
  }, [user]);

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const handleGenerate = async () => {
    if (!selectedLead) return;
    
    if (creditsUsed >= creditsTotal) {
      setError('Insufficient credits. Please upgrade your plan.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setResult('');
    
    try {
      // 1. AI Generation (Now resilient with timeout/retries/auto-logging)
      const aiResponse = await generateLeadContent(selectedLead, contentType);
      
      if (aiResponse.error_code) {
        setError(aiResponse.text);
        setIsGenerating(false);
        return;
      }

      // 2. Atomic Credit Consumption (Only on Success)
      const { data: rpcData, error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      
      if (rpcError) throw new Error(rpcError.message);
      
      if (rpcData.success) {
        setResult(aiResponse.text);
        if (refreshProfile) await refreshProfile();
      } else {
        throw new Error(rpcData.message || 'Credit verification failed.');
      }

    } catch (err: unknown) {
      console.error("Generation Lifecycle Error:", err);
      setError(err instanceof Error ? err.message : 'Critical system failure. No credits billed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">AI Outreach Studio</h1>
          <p className="text-slate-500 mt-1">Generate hyper-personalized outreach content using live intelligence.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Budget</p>
          <p className="text-sm font-bold text-indigo-600">{(creditsTotal - creditsUsed).toLocaleString()} Generations Left</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-slate-800 mb-4 flex items-center space-x-2">
                <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xs">1</span>
                <span>Select Target Lead</span>
              </h3>
              <select 
                value={selectedLeadId} 
                onChange={(e) => setSelectedLeadId(e.target.value)}
                disabled={loadingLeads}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium"
              >
                <option value="">{loadingLeads ? 'Loading leads...' : 'Choose a prospect...'}</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>{l.name} — {l.company}</option>
                ))}
              </select>
            </div>
            
            {selectedLead && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.2em]">Contextual Match</p>
                  <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-full text-indigo-600 border border-indigo-100">{selectedLead.score}% Score</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed italic">"{selectedLead.insights}"</p>
              </div>
            )}
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xs">2</span>
              <span>Content Strategy</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(Object.values(ContentType) as string[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setContentType(type as ContentType)}
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
            disabled={!selectedLead || isGenerating || creditsUsed >= creditsTotal}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center space-x-2 shadow-2xl ${
              !selectedLead || isGenerating || creditsUsed >= creditsTotal
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-indigo-100 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center space-x-3">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-white rounded-full animate-spin"></div>
                <span>Syncing with Gemini...</span>
              </span>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                <span>Build Personalized Asset</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-950 rounded-[2.5rem] shadow-3xl min-h-[500px] flex flex-col overflow-hidden border border-white/5 group">
          <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
              <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-heading">Neural Output</span>
            </div>
            {result && (
              <button onClick={copyToClipboard} className="px-4 py-1.5 bg-white/10 text-white hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Copy Content
              </button>
            )}
          </div>
          <div className="flex-grow p-10 overflow-y-auto custom-scrollbar">
            {isGenerating ? (
              <div className="space-y-6">
                <div className="h-4 bg-white/5 rounded-full w-3/4 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-5/6 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-2/3 animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded-full w-1/2 animate-pulse"></div>
              </div>
            ) : result ? (
              <div className="text-indigo-100/90 leading-relaxed font-mono text-sm whitespace-pre-wrap animate-in fade-in duration-700">
                {result}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-8 opacity-20">
                <SparklesIcon className="w-12 h-12 mb-6" />
                <p className="text-sm font-medium">Select a lead to initialize engine.</p>
              </div>
            )}
            {error && (
              <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-bold text-center">
                {error}
              </div>
            )}
          </div>
          <div className="p-4 bg-white/[0.01] border-t border-white/5 text-[9px] text-white/20 font-black uppercase tracking-[0.5em] text-center">
            Aura Intelligence Grid v9.5
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentGen;