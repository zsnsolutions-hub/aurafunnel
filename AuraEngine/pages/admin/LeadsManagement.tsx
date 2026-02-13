
import React, { useState, useEffect } from 'react';
import { Lead, ManualList } from '../../types';
import { supabase } from '../../lib/supabase';
import { TargetIcon, SparklesIcon, BoltIcon } from '../../components/Icons';
import LeadActionsModal from '../../components/dashboard/LeadActionsModal';
import LeadSegmentation from '../../components/dashboard/LeadSegmentation';

const LISTS_STORAGE_KEY = 'aurafunnel_admin_manual_lists';

const LeadsManagement: React.FC = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Lead Actions
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  // Segmentation
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [manualLists, setManualLists] = useState<ManualList[]>(() => {
    try {
      const stored = localStorage.getItem(LISTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    fetchGlobalLeads();
  }, []);

  const fetchGlobalLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        profiles (
          id,
          name,
          email
        )
      `)
      .order('score', { ascending: false });

    if (data) {
      const formatted = data.map(l => ({
        ...l,
        sourceClient: l.profiles?.name || l.profiles?.email?.split('@')[0] || 'Unknown Source'
      }));
      setLeads(formatted);
      setFilteredLeads(formatted);
    }
    setLoading(false);
  };

  // Apply both status filter and segment filter
  const getDisplayLeads = () => {
    let result = activeSegmentId ? filteredLeads : leads;
    if (filter !== 'all') {
      result = result.filter(l => l.status === filter);
    }
    return result;
  };

  const displayLeads = getDisplayLeads();

  const handleStatusUpdate = (leadId: string, newStatus: Lead['status']) => {
    const updatedLeads = leads.map(l =>
      l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
    );
    setLeads(updatedLeads);
    if (activeSegmentId) {
      setFilteredLeads(filteredLeads.map(l =>
        l.id === leadId ? { ...l, status: newStatus, lastActivity: `Status changed to ${newStatus}` } : l
      ));
    } else {
      setFilteredLeads(updatedLeads);
    }
    if (selectedLead?.id === leadId) {
      setSelectedLead({ ...selectedLead, status: newStatus, lastActivity: `Status changed to ${newStatus}` });
    }
  };

  const handleSegmentSelect = (segmentId: string | null, filtered: Lead[]) => {
    setActiveSegmentId(segmentId);
    setFilteredLeads(segmentId ? filtered : leads);
  };

  const handleAddToManualList = (listId: string, leadId: string) => {
    const updated = manualLists.map(list =>
      list.id === listId ? { ...list, leadIds: [...list.leadIds, leadId] } : list
    );
    setManualLists(updated);
    localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(updated));
  };

  const openActionsModal = (lead: Lead) => {
    setSelectedLead(lead);
    setIsActionsOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Lead Repository</h1>
          <p className="text-slate-500 mt-1">Global aggregation of prospect data across all active client nodes.</p>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {['all', 'Qualified', 'New', 'Contacted', 'Lost'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Segmentation + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Segmentation Sidebar */}
        <div className="lg:col-span-1">
          <LeadSegmentation
            leads={leads}
            activeSegmentId={activeSegmentId}
            onSegmentSelect={handleSegmentSelect}
            manualLists={manualLists}
            onManualListsChange={(lists) => {
              setManualLists(lists);
              localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists));
            }}
          />
        </div>

        {/* Leads Table */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-24 text-center">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Scanning Unified Lead Vault...</p>
              </div>
            ) : (
              <>
                {activeSegmentId && (
                  <div className="px-8 py-3 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-600">
                      Segment active: {displayLeads.length} leads shown
                    </span>
                    <button
                      onClick={() => handleSegmentSelect(null, leads)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
                    >
                      Clear Filter
                    </button>
                  </div>
                )}
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                    <tr>
                      <th className="px-8 py-6">Prospect Detail</th>
                      <th className="px-8 py-6">Source Node</th>
                      <th className="px-8 py-6 text-center">Aura Score</th>
                      <th className="px-8 py-6">Status</th>
                      <th className="px-8 py-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-7">
                          <button onClick={() => openActionsModal(lead)} className="flex items-center space-x-4 text-left">
                            <div className="w-11 h-11 rounded-[1.25rem] bg-slate-100 flex items-center justify-center text-slate-400 font-black group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                              {lead.name[0]}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <p className="text-sm font-bold text-slate-900 font-heading hover:text-indigo-600 transition-colors">{lead.name}</p>
                                <span className="text-[10px] font-bold text-slate-400">&#8226; {lead.company}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono tracking-tighter mt-0.5">{lead.email}</p>
                            </div>
                          </button>
                        </td>
                        <td className="px-8 py-7">
                          <div className="flex items-center space-x-2 group/client">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-default transition-colors">{lead.sourceClient}</span>
                          </div>
                        </td>
                        <td className="px-8 py-7">
                          <div className="flex flex-col items-center space-y-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <SparklesIcon className={`w-3 h-3 ${lead.score > 80 ? 'text-indigo-600' : 'text-slate-300'}`} />
                              <span className={`text-sm font-black ${lead.score > 80 ? 'text-indigo-600' : 'text-slate-600'}`}>{lead.score}</span>
                            </div>
                            <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                               <div
                                className={`h-full rounded-full transition-all duration-1000 ${lead.score > 80 ? 'bg-indigo-500' : 'bg-slate-400'}`}
                                style={{ width: `${lead.score}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-7">
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                            lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                            lead.status === 'Contacted' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                            lead.status === 'Lost' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-600 border-slate-100'
                          }`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-8 py-7 text-right">
                          <button
                            onClick={() => openActionsModal(lead)}
                            className="inline-flex items-center px-4 py-2 bg-slate-50 text-slate-600 rounded-xl font-bold text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-slate-200 hover:border-indigo-200"
                          >
                            Actions
                          </button>
                        </td>
                      </tr>
                    ))}
                    {displayLeads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center">
                          <TargetIcon className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                            {activeSegmentId ? 'No leads match this segment.' : 'No prospects detected in global archive.'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-10 bg-indigo-50/50 rounded-[3rem] border border-indigo-100/50 flex items-center justify-between group">
        <div className="flex items-center space-x-5">
           <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100 group-hover:rotate-6 transition-transform">
              <BoltIcon className="w-7 h-7 text-indigo-600" />
           </div>
           <div>
              <p className="text-lg font-bold text-slate-900 font-heading">Neural Lead Ingestion</p>
              <p className="text-sm text-slate-500 font-medium">Global systems are processing incoming telemetry at 482ms latency.</p>
           </div>
        </div>
        <button
          onClick={fetchGlobalLeads}
          className="px-8 py-4 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:shadow-xl hover:-translate-y-1 transition-all"
        >
          Synchronize Vault
        </button>
      </div>

      {/* Lead Actions Modal */}
      {selectedLead && (
        <LeadActionsModal
          lead={selectedLead}
          allLeads={leads}
          isOpen={isActionsOpen}
          onClose={() => { setIsActionsOpen(false); setSelectedLead(null); }}
          onStatusUpdate={handleStatusUpdate}
          onSendEmail={() => {}}
          manualLists={manualLists}
          onAddToManualList={handleAddToManualList}
        />
      )}
    </div>
  );
};

export default LeadsManagement;
