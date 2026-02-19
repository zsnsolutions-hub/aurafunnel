import React from 'react';
import type { ImageGenBrandColors, BackgroundStyle } from '../../types';

interface ColorSchemePickerProps {
  colors: ImageGenBrandColors;
  onChange: (colors: ImageGenBrandColors) => void;
}

const BG_OPTIONS: { value: BackgroundStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'minimal-texture', label: 'Texture' },
];

const ColorSchemePicker: React.FC<ColorSchemePickerProps> = ({ colors, onChange }) => {
  const setField = <K extends keyof ImageGenBrandColors>(key: K, value: ImageGenBrandColors[K]) =>
    onChange({ ...colors, [key]: value });

  return (
    <div className="space-y-3">
      {/* Color inputs */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: 'primary' as const, label: 'Primary' },
          { key: 'secondary' as const, label: 'Secondary' },
          { key: 'accent' as const, label: 'Accent' },
        ]).map(c => (
          <label key={c.key} className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{c.label}</span>
            <div className="mt-1 flex items-center space-x-2">
              <input
                type="color"
                value={colors[c.key]}
                onChange={e => setField(c.key, e.target.value)}
                className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0"
              />
              <input
                type="text"
                value={colors[c.key]}
                onChange={e => setField(c.key, e.target.value)}
                maxLength={7}
                className="flex-1 text-xs font-mono px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
              />
            </div>
          </label>
        ))}
      </div>

      {/* Preview swatch */}
      <div className="flex items-center space-x-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview</span>
        <div className="flex items-center space-x-1">
          <div className="w-6 h-6 rounded-md border border-slate-200" style={{ backgroundColor: colors.primary }} />
          <div className="w-6 h-6 rounded-md border border-slate-200" style={{ backgroundColor: colors.secondary }} />
          <div className="w-6 h-6 rounded-md border border-slate-200" style={{ backgroundColor: colors.accent }} />
        </div>
      </div>

      {/* Background style */}
      <div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Background Style</span>
        <div className="mt-1.5 flex items-center space-x-2">
          {BG_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setField('bgStyle', opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                colors.bgStyle === opt.value
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorSchemePicker;
