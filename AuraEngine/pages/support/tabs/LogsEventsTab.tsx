import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { getAuditLogs, getTargetEmailMessages, getTargetWebhooks } from '../../../lib/support';

type SubTab = 'audit' | 'emails' | 'webhooks';

const LogsEventsTab: React.FC = () => {
  const { activeSession } = useSupport();
  const [subTab, setSubTab] = useState<SubTab>('audit');
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [emailMessages, setEmailMessages] = useState<Record<string, unknown>[]>([]);
  const [webhooks, setWebhooks] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const targetId = activeSession?.target_user_id;

  const refresh = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const [audit, emails, wh] = await Promise.all([
        getAuditLogs(targetId),
        getTargetEmailMessages(targetId),
        getTargetWebhooks(targetId),
      ]);
      setAuditLogs(audit);
      setEmailMessages(emails);
      setWebhooks(wh);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [targetId]);

  if (!activeSession) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-slate-400 text-sm">No active session.</p>
      </div>
    );
  }

  const subTabs: { id: SubTab; label: string; count: number }[] = [
    { id: 'audit', label: 'Audit Logs', count: auditLogs.length },
    { id: 'emails', label: 'Email Events', count: emailMessages.length },
    { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {subTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                subTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading...</div>
        ) : (
          <>
            {subTab === 'audit' && (
              <div className="divide-y divide-slate-100">
                {auditLogs.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">No audit logs yet.</div>
                )}
                {auditLogs.map((log, i) => (
                  <div key={i} className="px-6 py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{log.action as string}</span>
                      {log.resource_type && (
                        <span className="text-slate-400 ml-2">on {log.resource_type as string}</span>
                      )}
                    </div>
                    <span className="text-slate-400">
                      {new Date(log.created_at as string).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {subTab === 'emails' && (
              <div className="divide-y divide-slate-100">
                {emailMessages.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">No email messages found.</div>
                )}
                {emailMessages.map((msg, i) => (
                  <div key={i} className="px-6 py-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{(msg.subject as string) || '(no subject)'}</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        msg.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                        msg.status === 'bounced' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {(msg.status as string) || 'unknown'}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-1">
                      To: {(msg.to_email as string) || 'N/A'} — {msg.created_at ? new Date(msg.created_at as string).toLocaleString() : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {subTab === 'webhooks' && (
              <div className="divide-y divide-slate-100">
                {webhooks.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">No webhooks configured.</div>
                )}
                {webhooks.map((wh, i) => (
                  <div key={i} className="px-6 py-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{(wh.url as string) || (wh.endpoint as string) || 'N/A'}</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        wh.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {wh.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-1">
                      Events: {Array.isArray(wh.events) ? (wh.events as string[]).join(', ') : (wh.event_type as string) || 'all'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LogsEventsTab;
