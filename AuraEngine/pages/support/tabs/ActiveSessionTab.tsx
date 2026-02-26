import React, { useEffect, useState } from 'react';
import { Clock, Shield, User, CreditCard, Eye, EyeOff, Plug, Target } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { getTargetSubscription, getTargetIntegrations, getTargetEmailConfigs, getTargetLeads } from '../../../lib/support';

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m`;
  return `${mins}m`;
}

interface IntegrationSummary {
  total: number;
  connected: number;
  disconnected: number;
}

interface LeadSummary {
  total: number;
  byStatus: Record<string, number>;
  avgScore: number;
}

const ActiveSessionTab: React.FC = () => {
  const { activeSession, viewingAsUser, isImpersonating, impersonateUser, stopImpersonation, endSession } = useSupport();
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [integrationSummary, setIntegrationSummary] = useState<IntegrationSummary>({ total: 0, connected: 0, disconnected: 0 });
  const [leadSummary, setLeadSummary] = useState<LeadSummary>({ total: 0, byStatus: {}, avgScore: 0 });

  useEffect(() => {
    if (!activeSession) return;
    const tick = () => setTimeLeft(formatTimeLeft(activeSession.expires_at));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession?.target_user_id) return;
    const uid = activeSession.target_user_id;

    getTargetSubscription(uid).then(setSubscription);

    // Fetch integration summary
    Promise.all([
      getTargetIntegrations(uid),
      getTargetEmailConfigs(uid),
    ]).then(([integrations, emailConfigs]) => {
      const connected = integrations.filter((i: Record<string, unknown>) => i.is_connected === true).length + emailConfigs.length;
      const disconnected = integrations.filter((i: Record<string, unknown>) => i.is_connected === false).length;
      setIntegrationSummary({ total: integrations.length + emailConfigs.length, connected, disconnected });
    });

    // Fetch lead summary
    getTargetLeads(uid).then((leads) => {
      const byStatus: Record<string, number> = {};
      let totalScore = 0;
      leads.forEach((l: Record<string, unknown>) => {
        const status = (l.status as string) || 'Unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
        totalScore += (l.score as number) || 0;
      });
      setLeadSummary({
        total: leads.length,
        byStatus,
        avgScore: leads.length > 0 ? Math.round(totalScore / leads.length) : 0,
      });
    });
  }, [activeSession?.target_user_id]);

  if (!activeSession || !viewingAsUser) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-slate-400 text-sm">No active support session. Start one from the Workspace Browser tab.</p>
      </div>
    );
  }

  const statusCards = [
    { label: 'Plan', value: viewingAsUser.plan, icon: <CreditCard size={16} /> },
    { label: 'Status', value: viewingAsUser.status, icon: <Shield size={16} /> },
    { label: 'Credits', value: `${viewingAsUser.credits_used} / ${viewingAsUser.credits_total}`, icon: <User size={16} /> },
    { label: 'Session Timer', value: timeLeft, icon: <Clock size={16} /> },
  ];

  const creditsPct = viewingAsUser.credits_total > 0
    ? Math.min(100, Math.round((viewingAsUser.credits_used / viewingAsUser.credits_total) * 100))
    : 0;
  const circumference = 2 * Math.PI * 36;
  const strokeDasharray = `${(creditsPct / 100) * circumference} ${circumference}`;

  return (
    <div className="space-y-6">
      {/* Target user overview */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">{viewingAsUser.name || 'Unnamed User'}</h2>
            <p className="text-sm text-slate-500">{viewingAsUser.email}</p>
            <p className="text-xs text-slate-400 mt-1">ID: {viewingAsUser.id}</p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              viewingAsUser.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {viewingAsUser.role}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {activeSession.access_level}
            </span>
          </div>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statusCards.map((card) => (
            <div key={card.label} className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                {card.icon}
                <span className="text-[10px] font-bold uppercase tracking-wider">{card.label}</span>
              </div>
              <p className="text-sm font-black text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Status + Lead Stats + Credit Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Integration Status Grid */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Plug size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">Integration Status</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mb-2">{integrationSummary.total}</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-600">{integrationSummary.connected} connected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs text-slate-600">{integrationSummary.disconnected} disconnected</span>
            </div>
          </div>
        </div>

        {/* Lead Stats Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Target size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">Lead Stats</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 font-bold">Total</p>
              <p className="text-lg font-bold text-slate-900">{leadSummary.total}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold">Avg Score</p>
              <p className="text-lg font-bold text-slate-900">{leadSummary.avgScore}</p>
            </div>
          </div>
          {Object.keys(leadSummary.byStatus).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(leadSummary.byStatus).map(([status, count]) => (
                <span key={status} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                  {status}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Credit Usage Gauge */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col items-center justify-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Credit Usage</span>
          <svg viewBox="0 0 96 96" className="w-24 h-24">
            <circle cx="48" cy="48" r="36" fill="none" stroke="#f1f5f9" strokeWidth="7" />
            <circle cx="48" cy="48" r="36" fill="none"
              stroke={creditsPct >= 90 ? '#ef4444' : creditsPct >= 70 ? '#f59e0b' : '#6366f1'}
              strokeWidth="7" strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              transform="rotate(-90 48 48)" />
            <text x="48" y="45" textAnchor="middle" className="fill-slate-900" style={{ fontSize: '18px', fontWeight: 700 }}>
              {creditsPct}%
            </text>
            <text x="48" y="58" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>
              {viewingAsUser.credits_used}/{viewingAsUser.credits_total}
            </text>
          </svg>
        </div>
      </div>

      {/* Subscription info */}
      {subscription && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">Subscription</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-slate-400 font-bold">Plan</span>
              <p className="font-bold text-slate-900">{(subscription.plan_name as string) || 'N/A'}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold">Status</span>
              <p className="font-bold text-slate-900">{(subscription.status as string) || 'N/A'}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold">Period End</span>
              <p className="font-bold text-slate-900">
                {subscription.current_period_end ? new Date(subscription.current_period_end as string).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Session info & controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Session Controls</h3>
        <div className="text-xs text-slate-500 space-y-1 mb-4">
          <p><span className="font-bold">Session ID:</span> {activeSession.id}</p>
          <p><span className="font-bold">Started:</span> {new Date(activeSession.started_at).toLocaleString()}</p>
          <p><span className="font-bold">Expires:</span> {new Date(activeSession.expires_at).toLocaleString()}</p>
          <p><span className="font-bold">Reason:</span> {activeSession.reason}</p>
        </div>
        <div className="flex gap-3">
          {!isImpersonating ? (
            <button
              onClick={() => impersonateUser(activeSession.target_user_id)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors"
            >
              <Eye size={14} />
              Impersonate (Read-Only)
            </button>
          ) : (
            <button
              onClick={stopImpersonation}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors"
            >
              <EyeOff size={14} />
              Stop Impersonation
            </button>
          )}
          <button
            onClick={endSession}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors"
          >
            End Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActiveSessionTab;
