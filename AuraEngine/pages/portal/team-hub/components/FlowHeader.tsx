import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import type { Flow } from '../teamHubApi';

interface FlowHeaderProps {
  flow: Flow;
  onBack: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

const FlowHeader: React.FC<FlowHeaderProps> = ({ flow, onBack, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(flow.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(flow.name);
  }, [flow.name]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [editing]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== flow.name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
      <button
        onClick={onBack}
        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
      >
        <ChevronLeft size={20} />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') { setEditing(false); setName(flow.name); }
          }}
          className="text-lg font-bold text-slate-800 bg-slate-100 border border-slate-300 outline-none rounded-lg px-2 py-0.5 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        />
      ) : (
        <h1
          onClick={() => setEditing(true)}
          className="text-lg font-bold text-slate-800 cursor-pointer hover:bg-slate-100 rounded-lg px-2 py-0.5 transition-colors"
        >
          {flow.name}
        </h1>
      )}

      <button
        onClick={() => setEditing(true)}
        className="p-1 text-slate-300 hover:text-slate-600 transition-colors"
      >
        <Pencil size={14} />
      </button>

      <div className="flex-1" />

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
};

export default FlowHeader;
