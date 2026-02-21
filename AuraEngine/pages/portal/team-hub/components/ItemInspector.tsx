import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, Flag, XCircle, Loader2, Tag, Plus } from 'lucide-react';
import type { Item, Comment, Activity, ItemPriority, ItemTag } from '../teamHubApi';
import * as api from '../teamHubApi';
import Comments from './Comments';
import ActivityFeed from './ActivityFeed';

interface ItemInspectorProps {
  item: Item | null;
  flowId: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onItemUpdated: () => void;
  onItemClosed: (itemId: string) => void;
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

const ItemInspector: React.FC<ItemInspectorProps> = ({
  item,
  flowId,
  userId,
  userName,
  onClose,
  onItemUpdated,
  onItemClosed,
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
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [newTagColor, setNewTagColor] = useState('green');
  const drawerRef = useRef<HTMLDivElement>(null);
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

    setLoading(true);
    api.fetchItemDetail(item.id)
      .then(({ comments: c, activity: a }) => {
        setComments(c);
        setActivity(a);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [item]);

  // Escape to close
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [item, onClose]);

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

  const handleAddComment = async (body: string) => {
    if (!item) return;
    const newComment = await api.addComment(item.id, userId, body, flowId);
    setComments(prev => [...prev, { ...newComment, user_name: userName }]);
    const { activity: a } = await api.fetchItemDetail(item.id);
    setActivity(a);
    onItemUpdated();
  };

  if (!item) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[520px] bg-slate-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Item Inspector</span>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            className="w-full text-lg font-bold text-slate-800 bg-transparent outline-none border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 transition-colors pb-1"
            placeholder="Item title"
          />

          {/* ─── Tags ─── */}
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
                  <button
                    onClick={() => handleRemoveTag(i)}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setShowTagEditor(!showTagEditor)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
              >
                <Plus size={10} />
                Add
              </button>
            </div>

            {showTagEditor && (
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

          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar size={10} />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => handleDueDateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Flag size={10} />
                Priority
              </label>
              <select
                value={priority}
                onChange={e => handlePriorityChange(e.target.value as ItemPriority | '')}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => handleDescChange(e.target.value)}
              rows={4}
              placeholder="Add a more detailed description..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
            />
          </div>

          <hr className="border-slate-200" />

          {/* Comments & Activity */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="text-slate-300 animate-spin" />
            </div>
          ) : (
            <>
              <Comments comments={comments} onAdd={handleAddComment} userName={userName} />
              <hr className="border-slate-200" />
              <ActivityFeed activity={activity} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white">
          <button
            onClick={handleCloseItem}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
          >
            <XCircle size={14} />
            Close Item
          </button>
        </div>
      </div>
    </>
  );
};

export default ItemInspector;
