import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Lead } from '../../types';
import {
  ColorToken,
  StageColorMap,
  ColorOverrideMap,
  COLOR_TOKENS,
  resolveLeadColor,
  getColorClasses,
} from '../../lib/leadColors';

interface LeadColorDotProps {
  lead: Lead;
  stageColors: StageColorMap;
  overrides: ColorOverrideMap;
  onOverrideChange: (leadId: string, token: ColorToken | null) => void;
  size?: 'sm' | 'md';
}

const LeadColorDot: React.FC<LeadColorDotProps> = ({ lead, stageColors, overrides, onOverrideChange, size = 'sm' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const dotRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const token = resolveLeadColor(lead, stageColors, overrides);
  const classes = getColorClasses(token);
  const hasOverride = !!overrides[lead.id];
  const dotSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';

  const updatePosition = useCallback(() => {
    if (!dotRef.current) return;
    const rect = dotRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2 - 90,
    });
  }, []);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) updatePosition();
    setOpen(prev => !prev);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        dotRef.current && !dotRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = () => updatePosition();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={dotRef}
        onClick={handleOpen}
        className={`${dotSize} rounded-full ${classes.dot} cursor-pointer ring-1 ring-black/10 hover:ring-2 ${classes.ring} hover:ring-offset-2 hover:scale-125 transition-all flex-shrink-0`}
        title={`Click to change color · ${lead.status} · ${classes.label}`}
        aria-label={`Color: ${classes.label} (${lead.status}). Click to change.`}
      />
      {open && ReactDOM.createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl border border-slate-200 shadow-xl p-2.5 w-[180px] animate-in fade-in zoom-in-95 duration-150"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {hasOverride && (
            <button
              onClick={() => { onOverrideChange(lead.id, null); setOpen(false); }}
              className="w-full text-left text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg px-2 py-1.5 mb-1.5 transition-colors"
            >
              Use stage color
            </button>
          )}
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_TOKENS.map(({ token: t, label }) => {
              const tc = getColorClasses(t);
              const isActive = t === token;
              return (
                <button
                  key={t}
                  onClick={() => { onOverrideChange(lead.id, t); setOpen(false); }}
                  className={`w-6 h-6 rounded-full ${tc.dot} transition-all hover:scale-110 ${
                    isActive ? `ring-2 ${tc.ring} ring-offset-1` : ''
                  }`}
                  title={label}
                  aria-label={label}
                />
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default LeadColorDot;
