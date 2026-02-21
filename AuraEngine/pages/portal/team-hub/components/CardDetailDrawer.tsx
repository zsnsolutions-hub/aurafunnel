import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, Flag, Archive, Loader2 } from 'lucide-react';
import type { Card, Comment, Activity, CardPriority } from '../teamHubApi';
import * as api from '../teamHubApi';
import Comments from './Comments';
import ActivityFeed from './ActivityFeed';

interface CardDetailDrawerProps {
  card: Card | null;
  boardId: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onCardUpdated: () => void;
  onCardArchived: (cardId: string) => void;
}

const PRIORITIES: { value: CardPriority | ''; label: string; color: string }[] = [
  { value: '', label: 'None', color: 'text-slate-400' },
  { value: 'low', label: 'Low', color: 'text-sky-500' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500' },
  { value: 'high', label: 'High', color: 'text-rose-500' },
];

const CardDetailDrawer: React.FC<CardDetailDrawerProps> = ({
  card,
  boardId,
  userId,
  userName,
  onClose,
  onCardUpdated,
  onCardArchived,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<CardPriority | ''>('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load card detail
  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description || '');
    setDueDate(card.due_date || '');
    setPriority(card.priority || '');

    setLoading(true);
    api.fetchCardDetail(card.id)
      .then(({ comments: c, activity: a }) => {
        setComments(c);
        setActivity(a);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [card]);

  // Escape to close
  useEffect(() => {
    if (!card) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [card, onClose]);

  // Auto-save debounce for title/description
  const debouncedSave = useCallback((updates: Partial<Pick<Card, 'title' | 'description' | 'due_date' | 'priority'>>) => {
    if (!card) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.updateCard(card.id, updates);
        onCardUpdated();
      } catch (err) {
        console.error('Failed to save card:', err);
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [card, onCardUpdated]);

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

  const handlePriorityChange = (val: CardPriority | '') => {
    setPriority(val);
    debouncedSave({ priority: val || null });
  };

  const handleArchive = async () => {
    if (!card) return;
    await api.archiveCard(card.id, boardId);
    onCardArchived(card.id);
    onClose();
  };

  const handleAddComment = async (body: string) => {
    if (!card) return;
    const newComment = await api.addComment(card.id, userId, body, boardId);
    setComments(prev => [...prev, { ...newComment, user_name: userName }]);
    // Refresh activity
    const { activity: a } = await api.fetchCardDetail(card.id);
    setActivity(a);
    onCardUpdated();
  };

  if (!card) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[520px] bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Card Detail</span>
            {saving && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
                <Loader2 size={10} className="animate-spin" /> Saving...
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            className="w-full text-lg font-bold text-slate-800 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-indigo-400 transition-colors pb-1"
            placeholder="Card title"
          />

          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Due Date */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar size={10} />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => handleDueDateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Flag size={10} />
                Priority
              </label>
              <select
                value={priority}
                onChange={e => handlePriorityChange(e.target.value as CardPriority | '')}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
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
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
            />
          </div>

          {/* Divider */}
          <hr className="border-slate-100" />

          {/* Comments */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="text-slate-300 animate-spin" />
            </div>
          ) : (
            <>
              <Comments
                comments={comments}
                onAdd={handleAddComment}
                userName={userName}
              />

              <hr className="border-slate-100" />

              <ActivityFeed activity={activity} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={handleArchive}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
          >
            <Archive size={14} />
            Archive Card
          </button>
        </div>
      </div>
    </>
  );
};

export default CardDetailDrawer;
