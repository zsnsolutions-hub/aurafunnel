import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Pencil, Trash2, LayoutGrid } from 'lucide-react';
import type { Board } from '../teamHubApi';

interface BoardHeaderProps {
  board: Board;
  onBack: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

const BoardHeader: React.FC<BoardHeaderProps> = ({ board, onBack, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(board.name);
  }, [board.name]);

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
    if (trimmed && trimmed !== board.name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white">
      <button
        onClick={onBack}
        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
      >
        <ChevronLeft size={20} />
      </button>

      <LayoutGrid size={20} className="text-indigo-500" />

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') { setEditing(false); setName(board.name); }
          }}
          className="text-lg font-bold text-slate-800 bg-transparent border-b-2 border-indigo-400 outline-none px-1"
        />
      ) : (
        <h1
          onClick={() => setEditing(true)}
          className="text-lg font-bold text-slate-800 cursor-pointer hover:text-indigo-600 transition-colors"
        >
          {board.name}
        </h1>
      )}

      <button
        onClick={() => setEditing(true)}
        className="p-1.5 text-slate-300 hover:text-slate-500 transition-colors"
      >
        <Pencil size={14} />
      </button>

      <div className="flex-1" />

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
      >
        <Trash2 size={14} />
        Delete Board
      </button>
    </div>
  );
};

export default BoardHeader;
