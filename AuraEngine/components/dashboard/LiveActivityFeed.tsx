import React, { useEffect, useState, useRef } from 'react';
import { ActivityFeedItem } from '../../types';
import { ClockIcon } from '../Icons';
import { supabase } from '../../lib/supabase';

interface LiveActivityFeedProps {
  userId?: string;
  limit?: number;
  pollInterval?: number;
}

const formatRelativeTime = (dateStr: string): string => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

const actionColor = (action: string): string => {
  if (action.includes('LOGIN') || action.includes('AUTH')) return 'bg-blue-400';
  if (action.includes('GENERATE') || action.includes('AI')) return 'bg-purple-400';
  if (action.includes('LEAD') || action.includes('IMPORT')) return 'bg-emerald-400';
  if (action.includes('DELETE') || action.includes('DISABLE')) return 'bg-red-400';
  if (action.includes('PAYMENT') || action.includes('SUBSCRIBE')) return 'bg-orange-400';
  return 'bg-slate-400';
};

const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  userId,
  limit = 15,
  pollInterval = 30000
}) => {
  const [events, setEvents] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = async () => {
    let query = supabase
      .from('audit_logs')
      .select('id, action, details, created_at, user_id, profiles(name, email)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data } = await query;
    if (data) {
      setEvents(data.map((d: any) => ({
        id: d.id,
        action: d.action,
        details: d.details,
        created_at: d.created_at,
        user_email: d.profiles?.email,
        user_name: d.profiles?.name
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
    intervalRef.current = setInterval(fetchEvents, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, pollInterval]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <ClockIcon className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-800 font-heading">Live Activity Feed</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center space-x-3">
                <div className="w-2 h-2 rounded-full bg-slate-100 animate-pulse flex-shrink-0"></div>
                <div className="h-4 bg-slate-50 animate-pulse rounded-full flex-grow"></div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm italic">No activity events yet.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {events.map((event) => (
              <div key={event.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors flex items-start space-x-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${actionColor(event.action)}`}></div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-800 font-medium truncate">
                      {event.action.replace(/_/g, ' ')}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium ml-2 flex-shrink-0">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {event.user_name || event.user_email || 'System'}
                    {event.details && ` — ${event.details}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LiveActivityFeed);
