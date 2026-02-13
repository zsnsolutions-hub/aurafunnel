import React, { useState, useEffect } from 'react';
import { Lead, ContentType, User, DashboardQuickStats, AIInsight, ManualList } from '../../types';
import { FlameIcon, BoltIcon, CheckIcon, SparklesIcon } from '../../components/Icons';
import { generateLeadContent } from '../../lib/gemini';
import { generateDashboardInsights } from '../../lib/gemini';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { generateProgrammaticInsights } from '../../lib/insights';
import QuickStatsRow from '../../components/dashboard/QuickStatsRow';
import AIInsightsPanel from '../../components/dashboard/AIInsightsPanel';
import QuickActionsBar from '../../components/dashboard/QuickActionsBar';
import LiveActivityFeed from '../../components/dashboard/LiveActivityFeed';
import CSVImportModal from '../../components/dashboard/CSVImportModal';
import LeadActionsModal from '../../components/dashboard/LeadActionsModal';
import LeadSegmentation from '../../components/dashboard/LeadSegmentation';

const LISTS_STORAGE_KEY = 'aurafunnel_manual_lists';

interface ClientDashboardProps {
  user: User;
}

const ClientDashboard: React.FC<ClientDashboardProps> = ({ user: initialUser }) => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadForGen, setSelectedLeadForGen] = useState<Lead | null>(null);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isCSVOpen, setIsCSVOpen] = useState(false);

  // Lead Actions
  const [selectedLeadForActions, setSelectedLeadForActions] = useState<Lead | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  // Segmentation
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [manualLists, setManualLists] = useState<ManualList[]>(() => {
    try {
      const stored = localStorage.getItem(LISTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Quick Stats
  const [quickStats, setQuickStats] = useState<DashboardQuickStats>({
    leadsToday: 0, hotLeads: 0, contentCreated: 0, avgAiScore: 0,
    predictedConversions: 0, recommendations: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // AI Insights
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<string | null>(null);

  // Form states for adding lead
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', insights: '' });

  // Content Generation States
  const [contentType, setContentType] = useState<ContentType>(ContentType.EMAIL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');
  const [genError, setGenError] = useState('');

  useEffect(() => {
    fetchLeads();
    fetchQuickStats();
  }, [user]);

  const fetchLeads = async () => {
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('client_id', user.id)
      .order('score', { ascending: false });

    if (data) {
      setLeads(data);
      setFilteredLeads(data);
      setActiveSegmentId(null);
      setInsightsLoading(true);
      const programmaticInsights = generateProgrammaticInsights(data);
      setInsights(programmaticInsights);
      setInsightsLoading(false);
    }
    setLoadingLeads(false);
  };

  const fetchQuickStats = async () => {
    setStatsLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const [
        { data: allLeads },
        { count: leadsToday },
        { count: contentCreated }
      ] = await Promise.all([
        supabase.from('leads').select('*').eq('client_id', user.id),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', user.id).gte('created_at', todayStart),
        supabase.from('ai_usage_logs').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
      ]);

      const lds = allLeads || [];
      const hotLeads = lds.filter(l => l.score > 80).length;
      const avgScore = lds.length > 0
        ? Math.round(lds.reduce((a, b) => a + b.score, 0) / lds.length)
        : 0;
      const predictedConversions = Math.round(hotLeads * 0.35);
      const programmaticInsights = generateProgrammaticInsights(lds);

      setQuickStats({
        leadsToday: leadsToday || 0,
        hotLeads,
        contentCreated: contentCreated || 0,
        avgAiScore: avgScore,
        predictedConversions,
        recommendations: programmaticInsights.length
      });
    } catch (err) {
      console.error("Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const openGenModal = (lead: Lead) => {
    setSelectedLeadForGen(lead);
    setGenResult('');
    setGenError('');
    setIsGenModalOpen(true);
    setIsActionsOpen(false);
  };

  const openActionsModal = (lead: Lead) => {
    setSelectedLeadForActions(lead);
    setIsActionsOpen(true);
  };

  const handleGenerate = async () => {
    if (!selectedLeadForGen) return;

    setIsGenerating(true);
    setGenError('');

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('consume_credits', { amount: 1 });
      if (rpcError) throw new Error(rpcError.message);
      if (!rpcData.success) {
        setGenError(rpcData.message || 'Insufficient credits.');
        setIsGenerating(false);
        return;
      }

      const aiResponse = await generateLeadContent(selectedLeadForGen, contentType);
      setGenResult(aiResponse.text);

      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        lead_id: selectedLeadForGen.id,
        action_type: contentType.toLowerCase().replace(' ', '_') + '_generation_quick',
        tokens_used: aiResponse.tokens_used,
        model_name: aiResponse.model_name,
        prompt_name: aiResponse.prompt_name,
        prompt_version: aiResponse.prompt_version
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_CONTENT_GENERATED_QUICK',
        details: `Quick gen ${contentType} for ${selectedLeadForGen.name}. Template: ${aiResponse.prompt_name} v${aiResponse.prompt_version}`
      });

      if (refreshProfile) await refreshProfile();
      fetchQuickStats();

    } catch (err: any) {
      console.error("Quick Gen Error:", err);
      setGenError(err.message || "An error occurred during generation.");
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
      const updated = [data, ...leads];
      setLeads(updated);
      setFilteredLeads(updated);
      setActiveSegmentId(null);
      setIsAddLeadOpen(false);
      setNewLead({ name: '', email: '', company: '', insights: '' });
      fetchQuickStats();
    }
  };

  const handleStatusUpdate = (leadId: string, newStatus: Lead['status']) => {
    const updatedLeads = leads.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    );
    setLeads(updatedLeads);
    setFilteredLeads(activeSegmentId ? filteredLeads.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    ) : updatedLeads);
    // Update the selected lead for the modal
    if (selectedLeadForActions?.id === leadId) {
      setSelectedLeadForActions({ ...selectedLeadForActions, status: newStatus, lastActivity: `Status changed to ${newStatus}` });
    }
    fetchQuickStats();
  };

  const handleSegmentSelect = (segmentId: string | null, filtered: Lead[]) => {
    setActiveSegmentId(segmentId);
    setFilteredLeads(filtered);
  };

  const handleAddToManualList = (listId: string, leadId: string) => {
    const updated = manualLists.map(list =>
      list.id === listId ? { ...list, leadIds: [...list.leadIds, leadId] } : list
    );
    setManualLists(updated);
    localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleRefreshInsights = () => {
    setInsightsLoading(true);
    const programmaticInsights = generateProgrammaticInsights(leads);
    setInsights(programmaticInsights);
    setInsightsLoading(false);
  };

  const handleDeepAnalysis = async () => {
    setDeepAnalysisLoading(true);
    try {
      const result = await generateDashboardInsights(leads);
      setDeepAnalysisResult(result);
    } catch (err: any) {
      setDeepAnalysisResult(`Deep analysis unavailable: ${err.message}`);
    } finally {
      setDeepAnalysisLoading(false);
    }
  };

  const handleImportComplete = () => {
    fetchLeads();
    fetchQuickStats();
  };

  const copyResult = () => {
    navigator.clipboard.writeText(genResult);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Lead Intelligence</h1>
          <p className="text-slate-500 mt-1">Monitor and manage your high-intent prospects with AI-driven insights.</p>
        </div>
        <div className="flex items-center space-x-3">
          <QuickActionsBar
            onImportCSV={() => setIsCSVOpen(true)}
            onGenerateContent={() => {
              if (leads.length > 0) openGenModal(leads[0]);
            }}
          />
          <button
            onClick={() => setIsAddLeadOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
          >
            Add Lead
          </button>
        </div>
      </div>

      {/* Quick Stats Row */}
      <QuickStatsRow stats={quickStats} loading={statsLoading} />

      {/* AI Insights Panel */}
      <AIInsightsPanel
        insights={insights}
        loading={insightsLoading}
        onRefresh={handleRefreshInsights}
        onDeepAnalysis={handleDeepAnalysis}
        deepAnalysisLoading={deepAnalysisLoading}
        deepAnalysisResult={deepAnalysisResult}
      />

      {/* Leads Table + Segmentation Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Segmentation Sidebar */}
        <div className="lg:col-span-1">
          <LeadSegmentation
            leads={leads}
            activeSegmentId={activeSegmentId}
            onSegmentSelect={handleSegmentSelect}
            manualLists={manualLists}
            onManualListsChange={setManualLists}
          />
        </div>

        {/* Priority Prospect List */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h3 className="font-bold text-slate-800 font-heading">Priority Prospect List</h3>
                {activeSegmentId && (
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    Filtered: {filteredLeads.length} leads
                  </span>
                )}
              </div>
              {loadingLeads && <span className="text-xs text-indigo-600 animate-pulse font-bold">Syncing...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Lead Detail</th>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4 text-center">Aura Score</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <button onClick={() => openActionsModal(lead)} className="flex items-center space-x-3 text-left">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                            {lead.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate hover:text-indigo-600 transition-colors">{lead.name}</p>
                            <p className="text-xs text-slate-500 truncate">{lead.email}</p>
                          </div>
                        </button>
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
                          <span className="text-[10px] font-black text-slate-800 tracking-tighter">{lead.score}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                          lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-600' :
                          lead.status === 'New' ? 'bg-blue-50 text-blue-600' :
                          lead.status === 'Contacted' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openActionsModal(lead)}
                            className="inline-flex items-center px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg font-bold text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                          >
                            Actions
                          </button>
                          <button
                            onClick={() => openGenModal(lead)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all transform active:scale-90"
                          >
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span>GEN</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loadingLeads && filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                        {activeSegmentId ? 'No leads match this segment.' : 'No leads found. Start by adding your first prospect.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <LiveActivityFeed userId={user.id} />

      {/* Lead Actions Modal */}
      {selectedLeadForActions && (
        <LeadActionsModal
          lead={selectedLeadForActions}
          allLeads={leads}
          isOpen={isActionsOpen}
          onClose={() => { setIsActionsOpen(false); setSelectedLeadForActions(null); }}
          onStatusUpdate={handleStatusUpdate}
          onSendEmail={openGenModal}
          manualLists={manualLists}
          onAddToManualList={handleAddToManualList}
        />
      )}

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
                      {Object.values(ContentType).map((type) => (
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
                  {isGenerating ? 'Synchronizing with Neural Grid...' : genResult || 'Neural links ready for transmission.'}
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
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 font-heading">New Lead Profile</h2>
              <p className="text-sm text-slate-500 mt-1">Add details for manual AI enrichment.</p>
            </div>
            <form className="space-y-6 flex-grow" onSubmit={handleAddLead}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} placeholder="e.g. Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Email</label>
                <input required type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} placeholder="robert@stripe.com" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input required type="text" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} placeholder="e.g. Stripe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={4} value={newLead.insights} onChange={e => setNewLead({...newLead, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none"></textarea>
              </div>
              <div className="pt-6 flex flex-col space-y-3">
                <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl">Create Lead Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={isCSVOpen}
        onClose={() => setIsCSVOpen(false)}
        userId={user.id}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
};

export default ClientDashboard;
