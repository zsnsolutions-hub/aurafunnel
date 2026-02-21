import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface AddCardInlineProps {
  onAdd: (title: string) => void;
}

const AddCardInline: React.FC<AddCardInlineProps> = ({ onAdd }) => {
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
    // Keep open for rapid entry
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
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
      >
        <Plus size={14} />
        Add a card
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
        placeholder="Enter a title for this card..."
        rows={2}
        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Card
        </button>
        <button
          onClick={() => { setOpen(false); setTitle(''); }}
          className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default AddCardInline;
