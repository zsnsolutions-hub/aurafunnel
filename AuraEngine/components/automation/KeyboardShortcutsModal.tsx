import React from 'react';
import { KeyboardIcon, XIcon } from '../Icons';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-1.5 text-[11px] font-semibold text-gray-600 shadow-sm">
    {children}
  </kbd>
);

const ShortcutRow: React.FC<{ keys: string; label: string }> = ({ keys, label }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-sm text-gray-600">{label}</span>
    <Kbd>{keys}</Kbd>
  </div>
);

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyboardIcon className="w-5 h-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors duration-150"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-3 gap-6">
          {/* Actions */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              Actions
            </h3>
            <div className="space-y-1">
              <ShortcutRow keys="N" label="New workflow" />
              <ShortcutRow keys="T" label="Send campaign" />
              <ShortcutRow keys="O" label="AI optimize" />
              <ShortcutRow keys="Ctrl+S" label="Save workflow" />
            </div>
          </div>

          {/* Panels */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              Panels
            </h3>
            <div className="space-y-1">
              <ShortcutRow keys="E" label="Execution log" />
              <ShortcutRow keys="H" label="Health panel" />
              <ShortcutRow keys="A" label="Node analytics" />
              <ShortcutRow keys="R" label="ROI calculator" />
              <ShortcutRow keys="I" label="Trigger analytics" />
              <ShortcutRow keys="M" label="Template perf." />
              <ShortcutRow keys="C" label="Campaigns" />
            </div>
          </div>

          {/* System */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              System
            </h3>
            <div className="space-y-1">
              <ShortcutRow keys="?" label="Shortcuts" />
              <ShortcutRow keys="Esc" label="Close panels" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
