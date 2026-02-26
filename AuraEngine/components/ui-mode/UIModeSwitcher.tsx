import React from 'react';
import { useUIMode } from './UIModeProvider';

interface UIModeSwitcherProps {
  collapsed?: boolean;
}

export const UIModeSwitcher: React.FC<UIModeSwitcherProps> = ({ collapsed = false }) => {
  const { isSimplified, toggle } = useUIMode();

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-150 group relative"
        aria-label={`Switch to ${isSimplified ? 'advanced' : 'simplified'} mode`}
        title={isSimplified ? 'Advanced mode' : 'Simplified mode'}
      >
        <span className="text-xs font-bold">{isSimplified ? 'S' : 'A'}</span>
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50 pointer-events-none shadow-lg">
          {isSimplified ? 'Advanced mode' : 'Simplified mode'}
        </div>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between px-1 py-1">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {isSimplified ? 'Simplified' : 'Advanced'}
      </span>
      <button
        onClick={toggle}
        role="switch"
        aria-checked={!isSimplified}
        aria-label={`Switch to ${isSimplified ? 'advanced' : 'simplified'} mode`}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${
          isSimplified ? 'bg-gray-200' : 'bg-indigo-500'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            isSimplified ? 'translate-x-[3px]' : 'translate-x-[19px]'
          }`}
        />
      </button>
    </div>
  );
};
