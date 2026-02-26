import React, { useEffect, useState } from 'react';
import { Clock, Shield, User, CreditCard, Eye, EyeOff } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { getTargetSubscription } from '../../../lib/support';

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m`;
  return `${mins}m`;
}

const ActiveSessionTab: React.FC = () => {
  const { activeSession, viewingAsUser, isImpersonating, impersonateUser, stopImpersonation, endSession } = useSupport();
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!activeSession) return;
    const tick = () => setTimeLeft(formatTimeLeft(activeSession.expires_at));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [activeSession]);

  useEffect(() => {
    if (activeSession?.target_user_id) {
      getTargetSubscription(activeSession.target_user_id).then(setSubscription);
    }
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
