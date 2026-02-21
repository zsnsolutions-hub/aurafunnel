import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface AddItemInlineProps {
  onAdd: (title: string) => void;
}

const AddItemInline: React.FC<AddItemInlineProps> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setTitle('');
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-b-xl transition-colors"
      >
        <Plus size={16} />
        <span className="font-medium">+ Add item</span>
      </button>
    );
  }

  return (
    <div className="px-1.5 pb-1.5">
      <textarea
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Item title..."
        rows={3}
        className="w-full px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-sm resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 placeholder-slate-400"
      />
      <div className="flex items-center gap-1 mt-1">
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Item
        </button>
        <button
          onClick={() => { setOpen(false); setTitle(''); }}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default AddItemInline;
