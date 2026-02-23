import React from 'react';
import { Clock, MessageSquare } from 'lucide-react';
import type { Item, Lane, ItemTag } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../../../components/ui/Table';

// ─── Priority badge config (matches FlowItem) ───
const PRIORITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-red-500',   text: 'text-white',    label: 'HIGH' },
  medium: { bg: 'bg-blue-100',  text: 'text-blue-700', label: 'MEDIUM' },
  low:    { bg: 'bg-slate-100', text: 'text-slate-600', label: 'LOW' },
};

// Avatar colors
const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-600', 'bg-pink-500', 'bg-teal-600',
];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface FlowListViewProps {
  filteredLanes: (Lane & { cards: Item[] })[];
  onItemClick: (item: Item) => void;
  onItemContextMenu: (e: React.MouseEvent, item: Item) => void;
  permissions: FlowPermissions;
}

const FlowListView: React.FC<FlowListViewProps> = ({
  filteredLanes, onItemClick, onItemContextMenu,
}) => {
  // Flatten all items, tagging each with its lane info
  const rows = filteredLanes.flatMap(lane =>
    lane.cards.map(item => ({ item, laneName: lane.name, laneId: lane.id }))
  );

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-12">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">No items match the current filters</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or add new items</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-6 py-5">
      <Table>
        <TableHeader sticky>
          <tr>
            <TableHead>Title</TableHead>
            <TableHead>Lane</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Labels</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="text-center">Comments</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {rows.map(({ item, laneName }) => {
            const priority = item.priority ? PRIORITY_BADGE[item.priority] : null;
            const isOverdue = item.due_date && new Date(item.due_date) < new Date();
            const commentCount = item.comment_count ?? 0;
            const tags = item.labels || [];
            const members = item.assigned_members || [];

            return (
              <TableRow
                key={item.id}
                onClick={() => onItemClick(item)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium text-gray-900 max-w-[280px]">
                  <div
                    onContextMenu={e => onItemContextMenu(e, item)}
                    className="truncate"
                  >
                    {item.title}
                  </div>
                </TableCell>

                <TableCell>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                    {laneName}
                  </span>
                </TableCell>

                <TableCell>
                  {priority ? (
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${priority.bg} ${priority.text}`}>
                      {priority.label}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </TableCell>

                <TableCell>
                  {item.due_date ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      isOverdue ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      <Clock size={12} />
                      {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </TableCell>

                <TableCell>
                  {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag: ItemTag, i: number) => (
                        <span
                          key={i}
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200"
                        >
                          #{tag.text}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </TableCell>

                <TableCell>
                  {members.length > 0 ? (
                    <div className="flex items-center -space-x-1.5">
                      {members.slice(0, 3).map(m => (
                        <div
                          key={m.user_id}
                          title={m.user_name || m.user_email}
                          className={`w-6 h-6 rounded-full ${avatarColor(m.user_id)} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white`}
                        >
                          {(m.user_name || m.user_email || '?').charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {members.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600 ring-2 ring-white">
                          +{members.length - 3}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </TableCell>

                <TableCell className="text-center">
                  {commentCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <MessageSquare size={12} />
                      {commentCount}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default FlowListView;
