import React, { useEffect, useRef } from 'react';
import ItemDetailsPanel from './ItemDetailsPanel';
import type { ItemDetailsPanelProps } from './ItemDetailsPanel';

type ItemDialogProps = Omit<ItemDetailsPanelProps, 'layout'>;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const ItemDialog: React.FC<ItemDialogProps> = (props) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (!props.item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [props.item]);

  // Focus trap — queries focusable elements on each Tab press to handle dynamic content
  useEffect(() => {
    if (!props.item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [props.item]);

  if (!props.item) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
        onClick={props.onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          className="w-full h-full sm:max-w-[1000px] sm:max-h-[90vh] bg-slate-50 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <ItemDetailsPanel {...props} layout="wide" />
        </div>
      </div>
    </>
  );
};

export default ItemDialog;
