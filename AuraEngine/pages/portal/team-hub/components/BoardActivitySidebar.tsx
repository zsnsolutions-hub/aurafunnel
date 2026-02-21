import React, { useState, useEffect } from 'react';
import { X, BarChart3 } from 'lucide-react';
import type { Lane, Item, Activity as ActivityType } from '../teamHubApi';
import { fetchFlowActivity } from '../teamHubApi';

// ─── Action config ───
const ACTION_CONFIG: Record<string, { verb: string; color: string }> = {
  card_created:        { verb: 'created',         color: 'bg-emerald-500' },
  card_moved:          { verb: 'moved',           color: 'bg-gray-500' },
  card_archived:       { verb: 'completed',       color: 'bg-emerald-500' },
  comment_added:       { verb: 'commented on',    color: 'bg-green-500' },
  list_created:        { verb: 'created lane',    color: 'bg-blue-500' },
  member_added:        { verb: 'added',           color: 'bg-violet-500' },
  member_removed:      { verb: 'removed',         color: 'bg-rose-500' },
  member_role_changed: { verb: 'updated role for',color: 'bg-amber-500' },
  invite_sent:         { verb: 'invited',         color: 'bg-blue-500' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins} MINUTE${mins !== 1 ? 'S' : ''} AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} HOUR${hrs !== 1 ? 'S' : ''} AGO`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

interface BoardActivitySidebarProps {
  flowId: string;
  lanes: (Lane & { cards: Item[] })[];
  open: boolean;
  onClose: () => void;
}

const BoardActivitySidebar: React.FC<BoardActivitySidebarProps> = ({ flowId, lanes, open, onClose }) => {
  const [activity, setActivity] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchFlowActivity(flowId, 30)
      .then(data => { if (!cancelled) setActivity(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [flowId, open]);

  if (!open) return null;

  // Board progress
  const totalItems = lanes.reduce((sum, l) => sum + l.cards.length, 0);
  const archivedCount = activity.filter(a => a.action_type === 'card_archived').length;
  const totalForProgress = totalItems + archivedCount;
  const progressPct = totalForProgress > 0 ? Math.round((archivedCount / totalForProgress) * 100) : 0;

  return (
    <div className="w-[320px] border-l border-gray-200 bg-white flex flex-col shrink-0 h-full overflow-hidden">
      {/* ─── Header ─── */}
      <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <BarChart3 size={16} className="text-blue-600" />
          <span className="text-[14px] font-bold text-gray-900">Activity Feed</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* ─── Activity entries ─── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-5 py-12 text-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-400">Loading activity...</p>
          </div>
        ) : activity.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-400 font-medium">No activity yet</p>
            <p className="text-xs text-gray-300 mt-1">Activity will appear as your team works</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            {activity.map(item => {
              const meta = item.meta_json || {};
              const config = ACTION_CONFIG[item.action_type] || { verb: item.action_type, color: 'bg-gray-400' };

              // Build rich description
              let itemName = '';
              let detail = '';
              let quotedText = '';

              if (item.action_type === 'card_moved' && meta.from && meta.to) {
                itemName = String(meta.title || 'an item');
                detail = `from ${meta.from} to ${meta.to}`;
              } else if (item.action_type === 'card_created' && meta.title) {
                itemName = String(meta.title);
              } else if (item.action_type === 'list_created' && meta.list_name) {
                itemName = String(meta.list_name);
              } else if (item.action_type === 'comment_added') {
                itemName = 'an item';
                if (meta.body) quotedText = String(meta.body).slice(0, 100);
              } else if (item.action_type === 'card_archived' && meta.title) {
                itemName = String(meta.title);
              }

              const actorInitial = (item.actor_name || 'U').charAt(0).toUpperCase();

              return (
                <div key={item.id} className="flex items-start gap-3">
                  {/* Actor avatar */}
                  <div className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5`}>
                    {actorInitial}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-gray-700 leading-relaxed">
                      <span className="font-bold text-gray-900">{item.actor_name || 'You'}</span>{' '}
                      {config.verb}{' '}
                      {item.action_type === 'card_moved' && (
                        <>
                          <span className="font-semibold text-blue-600">{itemName}</span>
                          {' '}{detail}.
                        </>
                      )}
                      {item.action_type === 'comment_added' && (
                        <span className="font-semibold text-blue-600">{itemName}</span>
                      )}
                      {item.action_type !== 'card_moved' && item.action_type !== 'comment_added' && itemName && (
                        <>
                          <span className="font-semibold text-blue-600">{itemName}</span>.
                        </>
                      )}
                    </p>

                    {/* Quoted comment text */}
                    {quotedText && (
                      <div className="mt-1.5 px-3 py-2 bg-gray-50 rounded-lg border-l-2 border-gray-200">
                        <p className="text-[12px] text-gray-500 italic leading-relaxed">
                          "{quotedText}"
                        </p>
                      </div>
                    )}

                    <p className="text-[10px] font-bold text-gray-400 tracking-wider mt-1.5">
                      {timeAgo(item.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Board Progress footer ─── */}
      <div className="px-5 py-4 border-t border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium text-gray-700">Board Progress</span>
          <span className="text-[13px] font-bold text-gray-900">{progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <button className="mt-3 text-[12px] font-semibold text-blue-600 hover:text-blue-700">
          View Detailed Report
        </button>
      </div>
    </div>
  );
};

export default BoardActivitySidebar;
