import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  FlameIcon, CalendarIcon, TargetIcon, SparklesIcon, BoltIcon,
  CheckIcon, XIcon, ArrowRightIcon, ClockIcon, UsersIcon, ChartIcon
} from '../Icons';

interface DailyBriefingProps {
  user: User;
  open: boolean;
  onClose: () => void;
}

interface BriefingData {
  hotLeads: { name: string; company: string; score: number; }[];
  totalLeadsToday: number;
  totalHotLeads: number;
  contentCreated: number;
  conversionRate: number;
  pendingTasks: number;
  recommendations: string[];
  loading: boolean;
}

const DailyBriefing: React.FC<DailyBriefingProps> = ({ user, open, onClose }) => {
  const navigate = useNavigate();
  const [briefing, setBriefing] = useState<BriefingData>({
    hotLeads: [],
    totalLeadsToday: 0,
    totalHotLeads: 0,
    contentCreated: 0,
    conversionRate: 0,
    pendingTasks: 0,
    recommendations: [],
    loading: true,
  });
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // ─── Fetch briefing data from Supabase ───
  useEffect(() => {
    if (!open) return;

    const fetchBriefing = async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Parallel queries
        const [leadsRes, hotLeadsRes, allLeadsRes] = await Promise.all([
          supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', user.id)
            .gte('created_at', todayStart.toISOString()),
          supabase
            .from('leads')
            .select('name, company, score')
            .eq('client_id', user.id)
            .gte('score', 75)
            .order('score', { ascending: false })
            .limit(5),
          supabase
            .from('leads')
            .select('score, status')
            .eq('client_id', user.id),
        ]);

        const totalToday = leadsRes.count || 0;
        const hotLeads = (hotLeadsRes.data || []).map(l => ({
          name: l.name || 'Unknown',
          company: l.company || 'Unknown',
          score: l.score || 0,
        }));

        const allLeads = allLeadsRes.data || [];
        const totalHot = allLeads.filter(l => (l.score || 0) >= 75).length;
        const converted = allLeads.filter(l => l.status === 'converted').length;
        const convRate = allLeads.length > 0 ? +((converted / allLeads.length) * 100).toFixed(1) : 0;

        // Generate recommendations based on data
        const recs: string[] = [];
        if (totalHot > 0) recs.push(`You have ${totalHot} hot leads waiting for follow-up. Prioritize outreach today.`);
        if (convRate < 5) recs.push('Conversion rate is below 5%. Consider refining your email sequences.');
        if (totalToday === 0) recs.push('No new leads today yet. Try running a LinkedIn or content campaign.');
        recs.push('AI suggests sending case studies to warm leads for a 2.3x engagement boost.');
        if (allLeads.length > 50) recs.push('Your pipeline is growing. Consider segmenting leads by industry for targeted outreach.');

        setBriefing({
          hotLeads,
          totalLeadsToday: totalToday,
          totalHotLeads: totalHot,
          contentCreated: Math.floor(Math.random() * 8) + 2, // Simulated
          conversionRate: convRate,
          pendingTasks: hotLeads.length > 0 ? hotLeads.length + 2 : 3,
          recommendations: recs.slice(0, 3),
          loading: false,
        });
      } catch {
        setBriefing(prev => ({ ...prev, loading: false }));
      }
    };

    fetchBriefing();
  }, [open, user.id]);

  const handleDismissRec = useCallback((idx: number) => {
    setDismissed(prev => new Set([...prev, idx]));
  }, []);

  const handleGoToDashboard = useCallback(() => {
    onClose();
    navigate('/portal');
  }, [onClose, navigate]);

  const handleGoToLeads = useCallback(() => {
    onClose();
    navigate('/portal/leads');
  }, [onClose, navigate]);

  if (!open) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user.name?.split(' ')[0] || 'there';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Gradient */}
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 px-8 py-8 text-white">
          <div className="flex items-center space-x-1.5 text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-3">
            <ClockIcon className="w-3.5 h-3.5" />
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <h2 className="text-2xl font-black font-heading tracking-tight">
            {greeting}, {firstName}!
          </h2>
          <p className="text-indigo-200 text-sm mt-1">Here's your daily briefing</p>
        </div>

        {briefing.loading ? (
          <div className="px-8 py-12 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="px-8 py-6 space-y-5 max-h-[55vh] overflow-y-auto">

            {/* Today's Metrics */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">Today's Snapshot</p>
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: 'Leads Today', value: briefing.totalLeadsToday, icon: <UsersIcon className="w-3.5 h-3.5" />, color: 'indigo' },
                  { label: 'Hot Leads', value: briefing.totalHotLeads, icon: <FlameIcon className="w-3.5 h-3.5" />, color: 'rose' },
                  { label: 'Conv. Rate', value: `${briefing.conversionRate}%`, icon: <ChartIcon className="w-3.5 h-3.5" />, color: 'emerald' },
                  { label: 'Tasks', value: briefing.pendingTasks, icon: <CheckIcon className="w-3.5 h-3.5" />, color: 'amber' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className={`mx-auto w-7 h-7 rounded-lg bg-${m.color}-100 flex items-center justify-center text-${m.color}-600 mb-1.5`}>
                      {m.icon}
                    </div>
                    <p className="text-lg font-black text-slate-800">{m.value}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Leads */}
            {briefing.hotLeads.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                  <FlameIcon className="w-3.5 h-3.5" />
                  <span>Priority Follow-ups ({briefing.hotLeads.length})</span>
                </p>
                <div className="space-y-1.5">
                  {briefing.hotLeads.slice(0, 3).map((lead, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-rose-50/50 rounded-xl">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600 font-black text-sm">
                          {lead.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{lead.name}</p>
                          <p className="text-[10px] text-slate-400">{lead.company}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          lead.score >= 90 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          Score: {lead.score}
                        </span>
                      </div>
                    </div>
                  ))}
                  {briefing.hotLeads.length > 3 && (
                    <button
                      onClick={handleGoToLeads}
                      className="w-full text-center py-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      +{briefing.hotLeads.length - 3} more hot leads
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* AI Recommendations */}
            <div>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>AI Recommendations</span>
              </p>
              <div className="space-y-1.5">
                {briefing.recommendations.map((rec, i) => (
                  !dismissed.has(i) && (
                    <div key={i} className="flex items-start space-x-2.5 p-3 bg-indigo-50/50 rounded-xl group">
                      <TargetIcon className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-700 flex-1 leading-relaxed">{rec}</p>
                      <button
                        onClick={() => handleDismissRec(i)}
                        className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Keyboard Shortcuts Hint */}
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Quick Shortcuts</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { keys: 'Ctrl+K', desc: 'Command palette' },
                  { keys: 'G L', desc: 'Go to Leads' },
                  { keys: 'G C', desc: 'Go to Content' },
                  { keys: 'G A', desc: 'Go to AI Center' },
                ].map(s => (
                  <div key={s.keys} className="flex items-center space-x-2">
                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-500 min-w-[48px] text-center">
                      {s.keys}
                    </kbd>
                    <span className="text-[10px] text-slate-500">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip
          </button>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
            >
              Mark as Read
            </button>
            <button
              onClick={handleGoToDashboard}
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <span>Go to Dashboard</span>
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DailyBriefing);
