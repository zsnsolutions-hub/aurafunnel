import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface AddLaneInlineProps {
  onAdd: (name: string) => void;
}

const AddLaneInline: React.FC<AddLaneInlineProps> = ({ onAdd }) => {
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
        className="shrink-0 w-[272px] flex items-center gap-2 px-3 py-2.5 bg-slate-200/60 hover:bg-slate-200 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 transition-all"
      >
        <Plus size={16} />
        + Add lane
      </button>
    );
  }

  return (
    <div className="shrink-0 w-[272px] bg-white rounded-xl border border-slate-200 shadow-sm p-1.5">
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Lane title..."
        className="w-full px-2.5 py-2 text-sm bg-white border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 placeholder-slate-400"
      />
      <div className="flex items-center gap-1 mt-1">
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Lane
        </button>
        <button
          onClick={() => { setOpen(false); setName(''); }}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default AddLaneInline;
