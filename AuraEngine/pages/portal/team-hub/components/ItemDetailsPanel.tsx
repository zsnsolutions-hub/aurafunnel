import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, Flag, XCircle, Loader2, Tag, Plus, Users, Link2, Unlink, MessageSquare, AlertTriangle } from 'lucide-react';
import type { Item, Comment, Activity, ItemPriority, ItemTag, CardMember, FlowMember, ItemLeadLink } from '../teamHubApi';
import type { FlowPermissions } from '../hooks/useFlowPermissions';
import * as api from '../teamHubApi';
import Comments from './Comments';
import ActivityFeed from './ActivityFeed';
import LeadLinkDialog from './LeadLinkDialog';

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

export interface ItemDetailsPanelProps {
  item: Item | null;
  flowId: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onItemUpdated: () => void;
  onItemClosed: (itemId: string) => void;
  permissions: FlowPermissions;
  members: FlowMember[];
  layout?: 'narrow' | 'wide';
}

const PRIORITIES: { value: ItemPriority | ''; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const TAG_COLORS: { key: string; bg: string; ring: string }[] = [
  { key: 'green',  bg: 'bg-emerald-500', ring: 'ring-emerald-300' },
  { key: 'yellow', bg: 'bg-amber-400',   ring: 'ring-amber-300' },
  { key: 'orange', bg: 'bg-orange-500',  ring: 'ring-orange-300' },
  { key: 'red',    bg: 'bg-rose-500',    ring: 'ring-rose-300' },
  { key: 'purple', bg: 'bg-violet-500',  ring: 'ring-violet-300' },
  { key: 'blue',   bg: 'bg-blue-500',    ring: 'ring-blue-300' },
  { key: 'sky',    bg: 'bg-sky-400',     ring: 'ring-sky-300' },
  { key: 'pink',   bg: 'bg-pink-500',    ring: 'ring-pink-300' },
  { key: 'teal',   bg: 'bg-teal-500',    ring: 'ring-teal-300' },
];

const TAG_BG: Record<string, string> = Object.fromEntries(TAG_COLORS.map(c => [c.key, c.bg]));

const ItemDetailsPanel: React.FC<ItemDetailsPanelProps> = ({
  item,
  flowId,
  userId,
  userName,
  onClose,
  onItemUpdated,
  onItemClosed,
  permissions,
  members,
  layout = 'narrow',
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<ItemPriority | ''>('');
  const [tags, setTags] = useState<ItemTag[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardMembers, setCardMembers] = useState<CardMember[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [leadLink, setLeadLink] = useState<ItemLeadLink | null>(null);
  const [showLeadLinkDialog, setShowLeadLinkDialog] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [newTagColor, setNewTagColor] = useState('green');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load item detail
  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description || '');
    setDueDate(item.due_date || '');
    setPriority(item.priority || '');
    setTags(item.labels || []);
    setCardMembers(item.assigned_members || []);
    setLeadLink(item.lead_link || null);
    setShowAssignDropdown(false);
    setShowLeadLinkDialog(false);

    setLoading(true);
    api.fetchItemDetail(item.id)
      .then(({ comments: c, activity: a, cardMembers: cm, leadLink: ll }) => {
        setComments(c);
        setActivity(a);
        setCardMembers(cm);
        setLeadLink(ll);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [item]);

  // Escape to close (guarded: skip when LeadLinkDialog is open)
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showLeadLinkDialog) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [item, onClose, showLeadLinkDialog]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  // Auto-save debounce
  const debouncedSave = useCallback((updates: Partial<Pick<Item, 'title' | 'description' | 'due_date' | 'priority' | 'labels'>>) => {
    if (!item) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.updateItem(item.id, updates);
        onItemUpdated();
      } catch (err) {
        console.error('Failed to save item:', err);
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [item, onItemUpdated]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (val.trim()) debouncedSave({ title: val.trim() });
  };

  const handleDescChange = (val: string) => {
    setDescription(val);
    debouncedSave({ description: val || null });
  };

  const handleDueDateChange = (val: string) => {
    setDueDate(val);
    debouncedSave({ due_date: val || null });
  };

  const handlePriorityChange = (val: ItemPriority | '') => {
    setPriority(val);
    debouncedSave({ priority: val || null });
  };

  const handleAddTag = () => {
    const text = newTagText.trim();
    if (!text) return;
    const newTags = [...tags, { text, color: newTagColor }];
    setTags(newTags);
    debouncedSave({ labels: newTags });
    setNewTagText('');
  };

  const handleRemoveTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    setTags(newTags);
    debouncedSave({ labels: newTags });
  };

  const handleCloseItem = async () => {
    if (!item) return;
    await api.archiveItem(item.id, flowId);
    onItemClosed(item.id);
    onClose();
  };

  const handleAssignMember = async (memberId: string) => {
    if (!item) return;
    const member = members.find(m => m.user_id === memberId);
    if (!member) return;
    const newMember: CardMember = { user_id: memberId, user_name: member.user_name, user_email: member.user_email };
    const prev = cardMembers;
    setCardMembers(old => [...old, newMember]);
    try {
      await api.addCardMember(item.id, memberId, flowId);
      onItemUpdated();
    } catch (err) {
      console.error('Failed to assign member:', err);
      setCardMembers(prev);
    }
  };

  const handleUnassignMember = async (memberId: string) => {
    if (!item) return;
    const prev = cardMembers;
    setCardMembers(old => old.filter(m => m.user_id !== memberId));
    try {
      await api.removeCardMember(item.id, memberId, flowId);
      onItemUpdated();
    } catch (err) {
      console.error('Failed to unassign member:', err);
      setCardMembers(prev);
    }
  };

  // Close assign dropdown on outside click
  useEffect(() => {
    if (!showAssignDropdown) return;
    const handler = (e: MouseEvent) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAssignDropdown]);

  const handleLeadLinked = (link: ItemLeadLink) => {
    setLeadLink(link);
    setShowLeadLinkDialog(false);
    onItemUpdated();
  };

  const handleUnlinkLead = async () => {
    if (!item) return;
    try {
      await api.unlinkItemFromLead(item.id, flowId);
      setLeadLink(null);
      onItemUpdated();
    } catch (err) {
      console.error('Failed to unlink lead:', err);
    }
  };

  const handleAddComment = async (body: string) => {
    if (!item) return;
    const newComment = await api.addComment(item.id, userId, body, flowId, userName);
    setComments(prev => [...prev, { ...newComment, user_name: userName }]);
    const { activity: a } = await api.fetchItemDetail(item.id);
    setActivity(a);
    onItemUpdated();
  };

  if (!item) return null;

  /* ─── Shared UI fragments ─── */

  const headerBar = (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500">
          {layout === 'wide' ? 'Item Details' : 'Item Inspector'}
        </span>
        {saving && (
          <span className="flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
            <Loader2 size={10} className="animate-spin" /> Saving...
          </span>
        )}
      </div>
      <button
        onClick={onClose}
        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
      >
        <X size={18} />
      </button>
    </div>
  );

  const titleInput = (
    <input
      ref={titleRef}
      value={title}
      onChange={e => handleTitleChange(e.target.value)}
      readOnly={!permissions.canEditItems}
      className={`w-full ${layout === 'wide' ? 'text-xl' : 'text-lg'} font-bold text-slate-800 bg-transparent outline-none border-b-2 border-transparent transition-colors pb-1 ${permissions.canEditItems ? 'hover:border-slate-200 focus:border-indigo-500' : ''}`}
      placeholder="Item title"
    />
  );

  const tagsSection = (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Tag size={10} />
        Tags
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold text-white ${TAG_BG[tag.color] || 'bg-slate-400'}`}
          >
            {tag.text}
            {permissions.canEditItems && (
              <button
                onClick={() => handleRemoveTag(i)}
                className="ml-0.5 hover:opacity-70 transition-opacity"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {permissions.canEditItems && (
          <button
            onClick={() => setShowTagEditor(!showTagEditor)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
          >
            <Plus size={10} />
            Add
          </button>
        )}
      </div>

      {showTagEditor && permissions.canEditItems && (
        <div className="bg-white rounded-lg p-3 border border-slate-200 space-y-2">
          <input
            autoFocus
            value={newTagText}
            onChange={e => setNewTagText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }}
            placeholder="Tag text..."
            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 placeholder-slate-400"
          />
          <div className="flex gap-1.5">
            {TAG_COLORS.map(c => (
              <button
                key={c.key}
                onClick={() => setNewTagColor(c.key)}
                className={`w-7 h-5 rounded ${c.bg} transition-all ${newTagColor === c.key ? `ring-2 ${c.ring} scale-110` : 'hover:scale-105'}`}
              />
            ))}
          </div>
          <button
            onClick={handleAddTag}
            disabled={!newTagText.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Add Tag
          </button>
        </div>
      )}
    </div>
  );

  const metaGrid = (
    <div className={layout === 'wide' ? 'space-y-3' : 'grid grid-cols-2 gap-3'}>
      <div>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
          <Flag size={10} />
          Priority
        </label>
        {permissions.canEditItems ? (
          <select
            value={priority}
            onChange={e => handlePriorityChange(e.target.value as ItemPriority | '')}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
          >
            {PRIORITIES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        ) : (
          <p className="px-3 py-2 text-sm text-slate-600 capitalize">{priority || 'None'}</p>
        )}
      </div>
      <div>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
          <Calendar size={10} />
          Due Date
        </label>
        {permissions.canEditItems ? (
          <input
            type="date"
            value={dueDate}
            onChange={e => handleDueDateChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
          />
        ) : (
          <p className="px-3 py-2 text-sm text-slate-600">{dueDate || 'None'}</p>
        )}
      </div>
    </div>
  );

  const membersSection = (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Users size={10} />
        Members
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {cardMembers.map(m => (
          <span
            key={m.user_id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700"
          >
            <span className={`w-5 h-5 rounded-full ${avatarColor(m.user_id)} flex items-center justify-center text-[9px] font-bold text-white`}>
              {(m.user_name || m.user_email || '?').charAt(0).toUpperCase()}
            </span>
            {m.user_name || m.user_email}
            {permissions.canEditItems && (
              <button
                onClick={() => handleUnassignMember(m.user_id)}
                className="ml-0.5 hover:opacity-70 transition-opacity"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {permissions.canEditItems && (
          <div className="relative" ref={assignDropdownRef}>
            <button
              onClick={() => setShowAssignDropdown(s => !s)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
            >
              <Plus size={10} />
              Assign
            </button>
            {showAssignDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 max-h-48 overflow-y-auto">
                {members.map(m => {
                  const isAssigned = cardMembers.some(cm => cm.user_id === m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      onClick={() => isAssigned ? handleUnassignMember(m.user_id) : handleAssignMember(m.user_id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className={`w-6 h-6 rounded-full ${avatarColor(m.user_id)} flex items-center justify-center text-[10px] font-bold text-white`}>
                        {(m.user_name || m.user_email || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 truncate text-slate-700">{m.user_name || m.user_email}</span>
                      {isAssigned && <span className="text-indigo-500 font-bold text-xs">●</span>}
                    </button>
                  );
                })}
                {members.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">No team members</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const leadLinkSection = (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Link2 size={10} />
        Linked Lead
      </label>
      {leadLink ? (
        <div className="flex items-center gap-2 p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Link2 size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-indigo-700 truncate">{leadLink.lead_name || leadLink.lead_email}</p>
            <p className="text-[10px] text-indigo-500 truncate">
              {leadLink.lead_email}{leadLink.lead_status ? ` · ${leadLink.lead_status}` : ''}
            </p>
          </div>
          {(permissions.isAdmin || permissions.isOwner) && (
            <button
              onClick={handleUnlinkLead}
              className="p-1.5 text-indigo-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
              title="Unlink lead"
            >
              <Unlink size={13} />
            </button>
          )}
        </div>
      ) : (
        (permissions.isAdmin || permissions.isOwner) ? (
          <button
            onClick={() => setShowLeadLinkDialog(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-200 hover:border-indigo-200"
          >
            <Link2 size={12} />
            Link to Lead
          </button>
        ) : (
          <p className="text-xs text-slate-400">No linked lead</p>
        )
      )}
    </div>
  );

  const descriptionSection = (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
        Description
      </label>
      <textarea
        value={description}
        onChange={e => handleDescChange(e.target.value)}
        readOnly={!permissions.canEditItems}
        rows={layout === 'wide' ? 6 : 4}
        placeholder={permissions.canEditItems ? 'Add a more detailed description...' : 'No description'}
        className={`w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg resize-none outline-none transition-all placeholder-slate-400 ${permissions.canEditItems ? 'focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400' : ''}`}
      />
    </div>
  );

  const commentsAndActivity = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="text-slate-300 animate-spin" />
        </div>
      ) : (
        <>
          {layout === 'wide' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <MessageSquare size={14} className="text-slate-500" />
                <span className="text-xs font-bold text-slate-700">Discussion</span>
                {comments.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-600">
                    {comments.length}
                  </span>
                )}
              </div>
              <div className="p-4">
                <Comments comments={comments} onAdd={handleAddComment} userName={userName} readOnly={!permissions.canComment} />
              </div>
            </div>
          ) : (
            <Comments comments={comments} onAdd={handleAddComment} userName={userName} readOnly={!permissions.canComment} />
          )}
          <hr className="border-slate-200" />
          <ActivityFeed activity={activity} />
        </>
      )}
    </>
  );

  const closeItemFooter = permissions.canEditItems ? (
    <div className={layout === 'wide' ? 'pt-3' : 'px-6 py-3 border-t border-slate-200 bg-white'}>
      {!showCloseConfirm ? (
        <button
          onClick={() => setShowCloseConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
        >
          <XCircle size={14} />
          Close Item
        </button>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700 font-medium flex-1">Are you sure? This will archive the item.</p>
          <button
            onClick={() => setShowCloseConfirm(false)}
            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { setShowCloseConfirm(false); handleCloseItem(); }}
            className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  ) : null;

  const leadLinkDialogRender = showLeadLinkDialog && item ? (
    <LeadLinkDialog
      itemId={item.id}
      flowId={flowId}
      onLinked={handleLeadLinked}
      onClose={() => setShowLeadLinkDialog(false)}
    />
  ) : null;

  /* ─── Narrow layout (drawer body, identical to original) ─── */
  if (layout === 'narrow') {
    return (
      <>
        {headerBar}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {titleInput}
          {tagsSection}

          {/* Meta row — original grid order: Due Date | Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar size={10} />
                Due Date
              </label>
              {permissions.canEditItems ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => handleDueDateChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                />
              ) : (
                <p className="px-3 py-2 text-sm text-slate-600">{dueDate || 'None'}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Flag size={10} />
                Priority
              </label>
              {permissions.canEditItems ? (
                <select
                  value={priority}
                  onChange={e => handlePriorityChange(e.target.value as ItemPriority | '')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                >
                  {PRIORITIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              ) : (
                <p className="px-3 py-2 text-sm text-slate-600 capitalize">{priority || 'None'}</p>
              )}
            </div>
          </div>

          {membersSection}
          {leadLinkSection}
          {descriptionSection}
          <hr className="border-slate-200" />
          {commentsAndActivity}
        </div>

        {closeItemFooter}
        {leadLinkDialogRender}
      </>
    );
  }

  /* ─── Wide layout (dialog body, two-column on sm+) ─── */
  return (
    <>
      {headerBar}

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col sm:flex-row min-h-0">
          {/* Left column — main content */}
          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
            {titleInput}
            {descriptionSection}
            <hr className="border-slate-200" />
            {commentsAndActivity}
          </div>

          {/* Right column — sidebar metadata */}
          <div className="w-full sm:w-[300px] shrink-0 bg-slate-50/50 border-t sm:border-t-0 sm:border-l border-slate-200 px-5 py-5 space-y-5 overflow-y-auto">
            {metaGrid}
            {tagsSection}
            {membersSection}
            {leadLinkSection}
            {closeItemFooter}
          </div>
        </div>
      </div>

      {leadLinkDialogRender}
    </>
  );
};

export default ItemDetailsPanel;
