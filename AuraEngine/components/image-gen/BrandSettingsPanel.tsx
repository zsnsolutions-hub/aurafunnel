import React, { useState } from 'react';
import type { ImageGenBrandSettings, ImageGenBrandAsset, FontVibe } from '../../types';
import ColorSchemePicker from './ColorSchemePicker';
import LogoPicker from './LogoPicker';

interface BrandSettingsPanelProps {
  settings: ImageGenBrandSettings;
  onChange: (settings: ImageGenBrandSettings) => void;
  logos: ImageGenBrandAsset[];
  onUploadLogo: (file: File) => Promise<void>;
  onDeleteLogo?: (id: string) => void;
  uploadingLogo: boolean;
}

const FONT_VIBES: { value: FontVibe; label: string }[] = [
  { value: 'modern', label: 'Modern' },
  { value: 'elegant', label: 'Elegant' },
  { value: 'bold', label: 'Bold' },
  { value: 'minimal', label: 'Minimal' },
];

const BrandSettingsPanel: React.FC<BrandSettingsPanelProps> = ({
  settings, onChange, logos, onUploadLogo, onDeleteLogo, uploadingLogo,
}) => {
  const [expanded, setExpanded] = useState(false);

  const update = (partial: Partial<ImageGenBrandSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header / Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className="text-xs font-bold text-slate-700">Brand Settings</span>
          {(settings.logoAssetId || settings.brandName) && (
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          )}
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-5 border-t border-slate-100">
          {/* Brand Name */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Brand Name</label>
            <input
              type="text"
              value={settings.brandName || ''}
              onChange={e => update({ brandName: e.target.value })}
              placeholder="e.g. AuraFunnel"
              className="mt-1 w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>

          {/* Font Vibe */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Font Vibe</span>
            <div className="mt-1.5 flex items-center space-x-2">
              {FONT_VIBES.map(v => (
                <button
                  key={v.value}
                  onClick={() => update({ fontVibe: v.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    settings.fontVibe === v.value
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Scheme */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Color Scheme</span>
            <ColorSchemePicker
              colors={settings.colors}
              onChange={colors => update({ colors })}
            />
          </div>

          {/* Logo */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Logo</span>
            <LogoPicker
              logos={logos}
              selectedId={settings.logoAssetId}
              onSelect={id => update({ logoAssetId: id })}
              onUpload={onUploadLogo}
              onDelete={onDeleteLogo}
              uploading={uploadingLogo}
              placement={settings.logoPlacement || 'top-right'}
              onPlacementChange={p => update({ logoPlacement: p })}
              size={settings.logoSize || 'medium'}
              onSizeChange={s => update({ logoSize: s })}
              opacity={settings.logoOpacity ?? 1}
              onOpacityChange={o => update({ logoOpacity: o })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandSettingsPanel;
