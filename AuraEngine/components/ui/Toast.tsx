// components/ui/Toast.tsx
//
// Phase 0: a minimal global toast layer. The audit found the app had no
// notification surface, so many caught errors and optimistic rollbacks failed
// silently — actions appeared to succeed when they hadn't. `useToast()` gives
// any component a way to surface success/warning/error feedback.

import React, { createContext, useContext, useCallback, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

interface ToastItem { id: number; msg: string; kind: ToastKind }
interface ToastApi { toast: (msg: string, kind?: ToastKind) => void }

const ToastContext = createContext<ToastApi>({ toast: () => {} });

/** Hook: `const { toast } = useToast();` then `toast('Saved', 'success')`. */
export const useToast = (): ToastApi => useContext(ToastContext);

const STYLES: Record<ToastKind, string> = {
  info: 'bg-white border-slate-200 text-slate-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
};

let counter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, msg, kind }]);
    // Auto-dismiss after 5s (errors linger a little longer).
    window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed z-[200] bottom-4 right-4 flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0 pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm animate-in slide-in-from-bottom-2 motion-reduce:animate-none ${STYLES[t.kind]}`}
          >
            <span className="flex-1 leading-snug">{t.msg}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity font-bold"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
