import React, { useEffect, useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, Users, Hash } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { getSessionHistory, getAuditLogs, SupportSession } from '../../../lib/support';

type DateRange = '7d' | '30d' | 'all';

const SupportHistoryTab: React.FC = () => {
  const { adminId } = useSupport();
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionLogs, setSessionLogs] = useState<Record<string, Record<string, unknown>[]>>({});
  const [dateRange, setDateRange] = useState<DateRange>('all');

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      try {
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
      if (!sessionLogs[sessionId]) {
        const logs = await getAuditLogs(undefined, 200);
        const filtered = logs.filter((l: Record<string, unknown>) => l.session_id === sessionId);
        setSessionLogs((prev) => ({ ...prev, [sessionId]: filtered }));
      }
    }
    setExpanded(next);
  };

  // Filtered sessions by date range
  const filteredSessions = useMemo(() => {
    if (dateRange === 'all') return sessions;
    const now = Date.now();
    const cutoff = dateRange === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : now - 30 * 24 * 60 * 60 * 1000;
    return sessions.filter(s => new Date(s.started_at).getTime() >= cutoff);
  }, [sessions, dateRange]);

  // Summary stats
  const stats = useMemo(() => {
    const total = filteredSessions.length;

    // Average duration (only for ended sessions)
    const endedSessions = filteredSessions.filter(s => s.ended_at);
    let avgDuration = 0;
    if (endedSessions.length > 0) {
      const totalMs = endedSessions.reduce((acc, s) => {
        return acc + (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime());
      }, 0);
      avgDuration = Math.round(totalMs / endedSessions.length / 60_000); // in minutes
    }

    // Most accessed user
    const userCounts: Record<string, number> = {};
    filteredSessions.forEach(s => {
      userCounts[s.target_user_id] = (userCounts[s.target_user_id] || 0) + 1;
    });
    let mostAccessed = '';
    let maxCount = 0;
    Object.entries(userCounts).forEach(([uid, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostAccessed = uid;
      }
    });

    return { total, avgDuration, mostAccessed, mostAccessedCount: maxCount };
  }, [filteredSessions]);

  const dateRangeOptions: { id: DateRange; label: string }[] = [
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: 'all', label: 'All time' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Hash size={16} />
              <span className="text-[10px] font-black uppercase tracking-wider">Total Sessions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Clock size={16} />
              <span className="text-[10px] font-black uppercase tracking-wider">Avg Duration</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {stats.avgDuration > 0 ? `${stats.avgDuration}m` : 'N/A'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Users size={16} />
              <span className="text-[10px] font-black uppercase tracking-wider">Most Accessed User</span>
            </div>
            {stats.mostAccessed ? (
              <div>
                <p className="text-sm font-bold text-slate-900">{stats.mostAccessed.slice(0, 8)}...</p>
                <p className="text-[10px] text-slate-400">{stats.mostAccessedCount} sessions</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">N/A</p>
            )}
          </div>
        </div>
      )}

      {/* Date Filter */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {dateRangeOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setDateRange(opt.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              dateRange === opt.id
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Past Support Sessions</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            {sessions.length === 0 ? 'No session history found.' : 'No sessions in this date range.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSessions.map((session) => (
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
