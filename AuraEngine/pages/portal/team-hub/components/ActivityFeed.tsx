import React from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import type { Activity } from '../teamHubApi';

const ACTION_LABELS: Record<string, string> = {
  card_created: 'created this card',
  card_moved: 'moved this card',
  card_archived: 'archived this card',
  comment_added: 'added a comment',
  list_created: 'created a list',
  member_assigned: 'assigned a member',
  member_unassigned: 'unassigned a member',
  lead_linked: 'linked a lead',
  lead_unlinked: 'unlinked a lead',
};

interface ActivityFeedProps {
  activity: Activity[];
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ activity }) => {
  return (
    <div>
      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ActivityIcon size={12} />
        Activity
      </h4>

      <div className="space-y-2.5">
        {activity.map(item => {
          const meta = item.meta_json || {};
          const label = ACTION_LABELS[item.action_type] || item.action_type;

          let detail = '';
          if (item.action_type === 'card_moved' && meta.from && meta.to) {
            detail = ` from ${meta.from} to ${meta.to}`;
          }

          return (
            <div key={item.id} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600">
                  <span className="font-bold text-slate-700">
                    {item.actor_name || 'Someone'}
                  </span>{' '}
                  {label}
                  {detail && <span className="text-slate-500">{detail}</span>}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(item.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          );
        })}
        {activity.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">No activity yet</p>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
