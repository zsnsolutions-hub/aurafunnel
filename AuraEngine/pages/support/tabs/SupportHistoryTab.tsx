import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { getSessionHistory, getAuditLogs, SupportSession } from '../../../lib/support';

const SupportHistoryTab: React.FC = () => {
  const { activeSession } = useSupport();
  const adminId = activeSession?.admin_id;
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionLogs, setSessionLogs] = useState<Record<string, Record<string, unknown>[]>>({});

  useEffect(() => {
    // We need an admin ID — use from the active session or fall back
    // If no active session, this tab still works for history browsing
    const fetchSessions = async () => {
      setLoading(true);
      try {
        // getSessionHistory requires admin ID; we'll get all sessions the current admin created
        if (adminId) {
          const data = await getSessionHistory(adminId, 100);
          setSessions(data);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [adminId]);

  const toggleExpand = async (sessionId: string) => {
    const next = new Set(expanded);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
      // Fetch logs for this session if not already loaded
      if (!sessionLogs[sessionId]) {
        const logs = await getAuditLogs(undefined, 200);
        const filtered = logs.filter((l: Record<string, unknown>) => l.session_id === sessionId);
        setSessionLogs((prev) => ({ ...prev, [sessionId]: filtered }));
      }
    }
    setExpanded(next);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Past Support Sessions</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No session history found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <div key={session.id}>
                <button
                  onClick={() => toggleExpand(session.id)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {expanded.has(session.id) ? (
                      <ChevronDown size={16} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {session.target_user_id.slice(0, 8)}...
                      </p>
                      <p className="text-xs text-slate-400">{session.reason || '(no reason)'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-2.5 py-1 rounded-full font-bold ${
                      session.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {session.is_active ? 'Active' : 'Ended'}
                    </span>
                    <span className="text-slate-400">
                      {new Date(session.started_at).toLocaleDateString()}
                    </span>
                    {session.ended_at && (
                      <span className="text-slate-400">
                        Duration: {Math.round(
                          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60_000
                        )}m
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded audit logs */}
                {expanded.has(session.id) && (
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-100">
                    {!sessionLogs[session.id] ? (
                      <p className="text-xs text-slate-400">Loading logs...</p>
                    ) : sessionLogs[session.id].length === 0 ? (
                      <p className="text-xs text-slate-400">No audit entries for this session.</p>
                    ) : (
                      <div className="space-y-2">
                        {sessionLogs[session.id].map((log, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-slate-700">{log.action as string}</span>
                              {log.resource_type && (
                                <span className="text-slate-400 ml-2">({log.resource_type as string})</span>
                              )}
                            </div>
                            <span className="text-slate-400">
                              {new Date(log.created_at as string).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportHistoryTab;
