import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({ open, onClose, title, children, width = 'w-[520px]' }) => {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/15 backdrop-blur-[2px] transition-opacity duration-150 ease-out ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Side panel'}
        className={`fixed top-0 right-0 z-50 h-full ${width} max-w-[calc(100vw-48px)] bg-white border-l border-gray-200 shadow-xl flex flex-col transition-transform duration-150 ease-out rounded-l-2xl ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-grow overflow-y-auto p-6">{children}</div>
      </aside>
    </>
  );
};
