import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_TOKENS, getColorClasses, ColorToken } from '../../lib/leadColors';

interface ColorPickerProps {
  x: number;
  y: number;
  currentColor: string | null;
  onSelect: (color: ColorToken | null) => void;
  onClose: () => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ x, y, currentColor, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Edge-clamp
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
      className="bg-white rounded-xl border border-gray-200 shadow-xl p-3 animate-in fade-in zoom-in-95 duration-100"
    >
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Card Color</p>
      <div className="grid grid-cols-6 gap-1.5">
        {COLOR_TOKENS.map(({ token, label }) => {
          const classes = getColorClasses(token);
          const isActive = currentColor === token;
          return (
            <button
              key={token}
              title={label}
              onClick={() => { onSelect(token); onClose(); }}
              className={`w-7 h-7 rounded-lg ${classes.dot} transition-all hover:scale-110 ${
                isActive ? 'ring-2 ring-offset-1 ' + classes.ring : ''
              }`}
            />
          );
        })}
      </div>
      <button
        onClick={() => { onSelect(null); onClose(); }}
        className={`mt-2 w-full text-center px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
          !currentColor
            ? 'bg-gray-100 text-gray-700 ring-2 ring-gray-300 ring-offset-1'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
        }`}
      >
        Default (no color)
      </button>
    </div>,
    document.body
  );
};

export default ColorPicker;
