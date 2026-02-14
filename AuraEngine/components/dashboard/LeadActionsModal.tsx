import React, { useState } from 'react';
import { Lead, AIInsight } from '../../types';
import { PhoneIcon, MailIcon, ChartIcon, RefreshIcon, SparklesIcon, FolderIcon, XIcon, FlameIcon, BoltIcon, ClockIcon } from '../Icons';
import { supabase } from '../../lib/supabase';
import { generateLeadInsights } from '../../lib/insights';

interface LeadActionsModalProps {
  lead: Lead;
  allLeads: Lead[];
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (leadId: string, newStatus: Lead['status']) => void;
  onSendEmail: (lead: Lead) => void;
  onAddToList?: (lead: Lead) => void;
  manualLists?: { id: string; name: string; leadIds: string[] }[];
  onAddToManualList?: (listId: string, leadId: string) => void;
}

const scoreStars = (score: number): number => {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
};

const categoryIcon = (category: AIInsight['category']) => {
  switch (category) {
    case 'score': return <BoltIcon className="w-3.5 h-3.5" />;
    case 'timing': return <ClockIcon className="w-3.5 h-3.5" />;
    case 'company': return <FolderIcon className="w-3.5 h-3.5" />;
    case 'conversion': return <ChartIcon className="w-3.5 h-3.5" />;
    case 'engagement': return <FlameIcon className="w-3.5 h-3.5" />;
    default: return <SparklesIcon className="w-3.5 h-3.5" />;
  }
};

const LeadActionsModal: React.FC<LeadActionsModalProps> = ({
  lead,
  allLeads,
  isOpen,
  onClose,
  onStatusUpdate,
  onSendEmail,
  onAddToList,
  manualLists,
  onAddToManualList
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'insights' | 'analytics' | 'lists'>('actions');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [scheduleSaved, setScheduleSaved] = useState(false);

  if (!isOpen) return null;

  const stars = scoreStars(lead.score);
  const leadInsights = generateLeadInsights(lead, allLeads);

  const handleStatusChange = async (newStatus: Lead['status']) => {
    setStatusUpdating(true);
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, lastActivity: `Status changed to ${newStatus}` })
      .eq('id', lead.id);

    if (!error) {
      await supabase.from('audit_logs').insert({
        user_id: lead.client_id,
        action: 'LEAD_STATUS_UPDATED',
        details: `${lead.name} moved to ${newStatus}`
      });
      onStatusUpdate(lead.id, newStatus);
    }
    setStatusUpdating(false);
  };

  const handleScheduleContact = async () => {
    if (!scheduleDate) return;
    await supabase.from('audit_logs').insert({
      user_id: lead.client_id,
      action: 'CONTACT_SCHEDULED',
      details: `Scheduled contact with ${lead.name} on ${scheduleDate}. Note: ${scheduleNote || 'N/A'}`
    });
    setScheduleSaved(true);
    setTimeout(() => { setScheduleSaved(false); setShowSchedule(false); }, 1500);
  };

  // Build engagement timeline from audit logs
  const daysSinceCreated = lead.created_at
    ? Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const statuses: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
  const PIPELINE_STAGES: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Converted'];
  const STAGE_COLORS: Record<Lead['status'], { bg: string; text: string; ring: string }> = {
    New: { bg: 'bg-slate-500', text: 'text-slate-700', ring: 'ring-slate-400' },
    Contacted: { bg: 'bg-blue-500', text: 'text-blue-700', ring: 'ring-blue-400' },
    Qualified: { bg: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-400' },
    Converted: { bg: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-400' },
    Lost: { bg: 'bg-red-500', text: 'text-red-700', ring: 'ring-red-400' },
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl animate-in slide-in-from-right duration-400 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                {lead.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-heading">{lead.name}</h2>
                <p className="text-sm text-slate-500">{lead.company}</p>
                <div className="flex items-center space-x-2 mt-1.5">
                  <div className="flex items-center space-x-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <svg key={i} className={`w-4 h-4 ${i <= stars ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-600">Score: {lead.score}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                    lead.status === 'New' ? 'bg-slate-50 text-slate-600' :
                    lead.status === 'Contacted' ? 'bg-blue-50 text-blue-600' :
                    lead.status === 'Qualified' ? 'bg-amber-50 text-amber-600' :
                    lead.status === 'Converted' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-red-50 text-red-600'
                  }`}>{lead.status}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Stepper */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center">
            {PIPELINE_STAGES.map((stage, i) => {
              const currentIdx = PIPELINE_STAGES.indexOf(lead.status);
              const isLost = lead.status === 'Lost';
              const isCompleted = !isLost && currentIdx >= 0 && i < currentIdx;
              const isCurrent = !isLost && i === currentIdx;
              const colors = STAGE_COLORS[stage];
              return (
                <React.Fragment key={stage}>
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 mx-1 rounded-full ${
                      isCompleted || isCurrent ? colors.bg : 'bg-slate-200'
                    }`} />
                  )}
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      isCompleted ? `${colors.bg} text-white` :
                      isCurrent ? `${colors.bg} text-white ring-3 ${colors.ring}/30` :
                      'bg-slate-200 text-slate-400'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[8px] font-black">{i + 1}</span>
                      )}
                    </div>
                    <span className={`mt-1 text-[8px] font-bold ${
                      isCompleted || isCurrent ? colors.text : 'text-slate-400'
                    }`}>{stage}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          {lead.status === 'Lost' && (
            <div className="flex items-center justify-center mt-2">
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-bold">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Lost</span>
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {(['actions', 'insights', 'analytics', 'lists'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeTab === tab
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6">
          {activeTab === 'actions' && (
            <div className="space-y-3">
              {/* Contact Now */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="w-full flex items-center space-x-4 p-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <PhoneIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-grow">
                    <p className="text-sm font-bold text-slate-800">Contact Now</p>
                    <p className="text-xs text-slate-400">Schedule a call or meeting</p>
                  </div>
                </button>
                {showSchedule && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={e => setScheduleDate(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Note</label>
                      <input
                        type="text"
                        value={scheduleNote}
                        onChange={e => setScheduleNote(e.target.value)}
                        placeholder="Discussion topics..."
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300"
                      />
                    </div>
                    <button
                      onClick={handleScheduleContact}
                      disabled={!scheduleDate}
                      className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {scheduleSaved ? 'Scheduled!' : 'Schedule Contact'}
                    </button>
                  </div>
                )}
              </div>

              {/* Send Email */}
              <button
                onClick={() => onSendEmail(lead)}
                className="w-full flex items-center space-x-4 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MailIcon className="w-5 h-5" />
                </div>
                <div className="flex-grow">
                  <p className="text-sm font-bold text-slate-800">Send Email</p>
                  <p className="text-xs text-slate-400">AI-generated outreach template</p>
                </div>
              </button>

              {/* View Analytics */}
              <button
                onClick={() => setActiveTab('analytics')}
                className="w-full flex items-center space-x-4 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ChartIcon className="w-5 h-5" />
                </div>
                <div className="flex-grow">
                  <p className="text-sm font-bold text-slate-800">View Analytics</p>
                  <p className="text-xs text-slate-400">Engagement timeline & metrics</p>
                </div>
              </button>

              {/* Update Status */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center space-x-4 mb-3">
                  <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <RefreshIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Update Status</p>
                    <p className="text-xs text-slate-400">Move through pipeline</p>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {statuses.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={lead.status === s || statusUpdating}
                      className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        lead.status === s
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200'
                      } disabled:opacity-50`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Insights */}
              <button
                onClick={() => setActiveTab('insights')}
                className="w-full flex items-center space-x-4 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <SparklesIcon className="w-5 h-5" />
                </div>
                <div className="flex-grow">
                  <p className="text-sm font-bold text-slate-800">AI Insights</p>
                  <p className="text-xs text-slate-400">Get personalized recommendations</p>
                </div>
              </button>

              {/* Add to List */}
              <button
                onClick={() => setActiveTab('lists')}
                className="w-full flex items-center space-x-4 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FolderIcon className="w-5 h-5" />
                </div>
                <div className="flex-grow">
                  <p className="text-sm font-bold text-slate-800">Add to List</p>
                  <p className="text-xs text-slate-400">Segment management</p>
                </div>
              </button>
            </div>
          )}

          {activeTab === 'insights' && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">AI Recommendations for {lead.name}</p>
              {leadInsights.map(insight => (
                <div key={insight.id} className="p-4 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all">
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      insight.category === 'score' ? 'bg-indigo-50 text-indigo-600' :
                      insight.category === 'timing' ? 'bg-blue-50 text-blue-600' :
                      insight.category === 'company' ? 'bg-purple-50 text-purple-600' :
                      insight.category === 'conversion' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-orange-50 text-orange-600'
                    }`}>
                      {categoryIcon(insight.category)}
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800">{insight.title}</h4>
                        <span className="text-[10px] font-bold text-slate-400">{insight.confidence}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${insight.confidence}%` }}></div>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mt-2">{insight.description}</p>
                      {insight.action && (
                        <span className="inline-block mt-2 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                          {insight.action}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Engagement Timeline</p>

              {/* Profile Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aura Score</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{lead.score}<span className="text-sm text-slate-400">/100</span></p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Days in Pipeline</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{daysSinceCreated !== null ? daysSinceCreated : '—'}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Stage</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">{lead.status}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Activity</p>
                  <p className="text-sm font-bold text-slate-900 mt-1 truncate">{lead.lastActivity || '—'}</p>
                </div>
              </div>

              {/* Pipeline Progress */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Pipeline Progress</p>
                <div className="flex items-center space-x-1">
                  {statuses.map((s, i) => {
                    const currentIdx = statuses.indexOf(lead.status);
                    const isPast = i <= currentIdx && lead.status !== 'Lost';
                    const isLost = lead.status === 'Lost' && s === 'Lost';
                    return (
                      <div key={s} className="flex-1">
                        <div className={`h-2 rounded-full ${
                          isLost ? 'bg-red-400' : isPast ? 'bg-indigo-500' : 'bg-slate-100'
                        }`}></div>
                        <p className={`text-[9px] font-bold uppercase tracking-wider mt-1 text-center ${
                          isLost ? 'text-red-500' : isPast ? 'text-indigo-600' : 'text-slate-300'
                        }`}>{s}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lead Info */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Contact Information</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">Email</span>
                    <span className="text-xs font-bold text-slate-800">{lead.email}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">Company</span>
                    <span className="text-xs font-bold text-slate-800">{lead.company}</span>
                  </div>
                  {lead.created_at && (
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-xs text-slate-500">Added</span>
                      <span className="text-xs font-bold text-slate-800">{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Insights */}
              {lead.insights && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">AI Detected Insights</p>
                  <p className="text-xs text-slate-600 leading-relaxed italic p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    "{lead.insights}"
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'lists' && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add to Segment</p>

              {manualLists && manualLists.length > 0 ? (
                <div className="space-y-2">
                  {manualLists.map(list => {
                    const isInList = list.leadIds.includes(lead.id);
                    return (
                      <button
                        key={list.id}
                        onClick={() => !isInList && onAddToManualList?.(list.id, lead.id)}
                        disabled={isInList}
                        className={`w-full flex items-center justify-between p-4 border rounded-xl transition-all text-left ${
                          isInList
                            ? 'border-indigo-200 bg-indigo-50'
                            : 'border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isInList ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <FolderIcon className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-bold text-slate-800">{list.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                          {isInList ? 'Added' : `${list.leadIds.length} leads`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FolderIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 italic">No manual lists created yet.</p>
                  <p className="text-xs text-slate-300 mt-1">Create lists from the Segmentation panel.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadActionsModal;
