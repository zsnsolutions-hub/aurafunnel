import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  dividerAfter?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  header?: string;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, header, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Edge-clamp after first render
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const nx = x + rect.width > window.innerWidth - 8 ? window.innerWidth - rect.width - 8 : x;
    const ny = y + rect.height > window.innerHeight - 8 ? window.innerHeight - rect.height - 8 : y;
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  // Dismiss on mousedown-outside or Escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999 }}
      className="min-w-[200px] bg-white rounded-xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.12)] py-1.5 animate-in fade-in zoom-in-95 duration-100"
    >
      {header && (
        <div className="px-3 py-2 border-b border-gray-100/80 mb-1">
          <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">{header}</p>
        </div>
      )}
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <button
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium rounded-md mx-auto transition-colors ${
              item.danger
                ? 'text-rose-600 hover:bg-rose-50'
                : 'text-gray-700 hover:bg-gray-50/80'
            }`}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
            {item.label}
          </button>
          {item.dividerAfter && <div className="my-1 border-t border-gray-100" />}
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
};

export default ContextMenu;
