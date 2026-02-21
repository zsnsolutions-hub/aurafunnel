// File: AuraEngine/components/IconPickerPopover.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { icons } from 'lucide-react';

const ALL_ICON_NAMES = Object.keys(icons);

function formatIconName(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').trim();
}

interface IconPickerPopoverProps {
  onSelect: (iconName: string) => void;
  trigger?: React.ReactNode;
}

const IconPickerPopover: React.FC<IconPickerPopoverProps> = ({ onSelect, trigger }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_ICON_NAMES.slice(0, 200);
    const q = search.toLowerCase();
    return ALL_ICON_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 200);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch('');
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
        title="Pick an icon"
        aria-label="Pick an icon"
      >
        {trigger ?? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[320px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-transparent outline-none"
            />
          </div>
          {/* Icon grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-[240px] overflow-y-auto">
            {filtered.map(name => {
              const Icon = icons[name as keyof typeof icons];
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onSelect(name);
                    setOpen(false);
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  title={formatIconName(name)}
                  tabIndex={0}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-6">No icons found</p>
          )}
        </div>
      )}
    </div>
  );
};

export default IconPickerPopover;
