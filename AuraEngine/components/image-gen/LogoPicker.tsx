import React, { useRef } from 'react';
import type { ImageGenBrandAsset, LogoPlacement, LogoSize } from '../../types';
import { CheckIcon, XIcon } from '../Icons';
import { Trash2 as TrashIcon } from 'lucide-react';

interface LogoPickerProps {
  logos: ImageGenBrandAsset[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onUpload: (file: File) => Promise<void>;
  onDelete?: (id: string) => void;
  uploading: boolean;
  placement: LogoPlacement;
  onPlacementChange: (p: LogoPlacement) => void;
  size: LogoSize;
  onSizeChange: (s: LogoSize) => void;
  opacity: number;
  onOpacityChange: (o: number) => void;
}

const PLACEMENTS: { value: LogoPlacement; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'center-watermark', label: 'Watermark' },
];

const SIZES: { value: LogoSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];

const LogoPicker: React.FC<LogoPickerProps> = ({
  logos, selectedId, onSelect, onUpload, onDelete, uploading,
  placement, onPlacementChange, size, onSizeChange, opacity, onOpacityChange,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUpload(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  // If no logos and not uploading, show a single CTA
  if (logos.length === 0 && !uploading) {
    return (
      <div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span>Upload logo</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Saved logos */}
      <div className="flex items-center flex-wrap gap-2">
        {logos.map(logo => (
          <div key={logo.id} className="relative group">
            <button
              onClick={() => onSelect(selectedId === logo.id ? undefined : logo.id)}
              className={`w-14 h-14 rounded-xl border-2 overflow-hidden transition-all ${
                selectedId === logo.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <img src={logo.file_url} alt={logo.file_name || 'Logo'} className="w-full h-full object-contain p-1" />
            </button>
            {selectedId === logo.id && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center">
                <CheckIcon className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(logo.id)}
                className="absolute -top-1 -left-1 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XIcon className="w-2.5 h-2.5 text-white" />
              </button>
            )}
          </div>
        ))}

        {/* Upload more */}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all disabled:opacity-50"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          )}
        </button>
      </div>

      {/* Controls only when a logo is selected */}
      {selectedId && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          {/* Placement */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Placement</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PLACEMENTS.map(p => (
                <button
                  key={p.value}
                  onClick={() => onPlacementChange(p.value)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    placement === p.value
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Size</span>
            <div className="mt-1.5 flex items-center space-x-1.5">
              {SIZES.map(s => (
                <button
                  key={s.value}
                  onClick={() => onSizeChange(s.value)}
                  className={`w-8 h-8 rounded-lg text-xs font-black border transition-all ${
                    size === s.value
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Opacity</span>
              <span className="text-[10px] font-bold text-indigo-600">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={e => onOpacityChange(parseInt(e.target.value) / 100)}
              className="mt-1 w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LogoPicker;
