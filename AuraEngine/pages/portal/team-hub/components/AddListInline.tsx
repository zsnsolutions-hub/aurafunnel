import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface AddListInlineProps {
  onAdd: (name: string) => void;
}

const AddListInline: React.FC<AddListInlineProps> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setName('');
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 w-72 flex items-center gap-2 px-4 py-3 bg-white/60 hover:bg-white border border-dashed border-slate-200 hover:border-slate-300 rounded-2xl text-sm font-semibold text-slate-400 hover:text-slate-600 transition-all"
      >
        <Plus size={16} />
        Add another list
      </button>
    );
  }

  return (
    <div className="shrink-0 w-72 bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter list title..."
        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add List
        </button>
        <button
          onClick={() => { setOpen(false); setName(''); }}
          className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default AddListInline;
