import React, { useEffect, useRef } from 'react';
import { MapPin, Check, X } from 'lucide-react';

interface VoiceToastProps {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const VoiceToast: React.FC<VoiceToastProps> = ({ label, onConfirm, onCancel }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onCancel, 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onCancel]);

  return (
    <div className="fixed bottom-24 right-6 z-[61] animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl shadow-lg px-4 py-3 min-w-[220px]">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
          <MapPin size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 font-medium">Navigating to</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{label}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onConfirm}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
            aria-label="Confirm navigation"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Cancel navigation"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceToast;
