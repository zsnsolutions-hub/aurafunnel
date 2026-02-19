import React, { useEffect, useState } from 'react';
import type { ImageGenGeneratedImage, ImageModuleType } from '../../types';
import { fetchGenerationHistory } from '../../lib/imageGen';
import { ClockIcon } from '../Icons';

interface HistoryPanelProps {
  moduleType?: ImageModuleType;
  onReuse: (image: ImageGenGeneratedImage) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ moduleType, onReuse }) => {
  const [history, setHistory] = useState<ImageGenGeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchGenerationHistory({ moduleType, limit: 30 })
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [moduleType]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl animate-pulse">
            <div className="w-12 h-12 bg-slate-200 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-slate-200 rounded w-3/4" />
              <div className="h-2 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <ClockIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-500">No generation history yet</p>
        <p className="text-xs text-slate-400 mt-1">Generated images will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map(img => {
        const url = img.final_image_url || img.base_image_url;
        return (
          <button
            key={img.id}
            onClick={() => onReuse(img)}
            className="w-full flex items-center space-x-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all text-left group"
          >
            <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{img.prompt.slice(0, 60)}…</p>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{img.module_type}</span>
                <span className="text-[10px] text-slate-400">{img.aspect_ratio}</span>
                <span className="text-[10px] text-slate-400">{new Date(img.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">Reuse</span>
          </button>
        );
      })}
    </div>
  );
};

export default HistoryPanel;
