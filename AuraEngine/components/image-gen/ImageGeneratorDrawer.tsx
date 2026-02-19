import React, { useState, useEffect } from 'react';
import { Drawer } from '../ui/Drawer';
import PreviewGrid from './PreviewGrid';
import { MODULE_PRESETS } from '../../lib/imagePromptBuilder';
import { generateImages } from '../../lib/imageGen';
import type {
  ImageModuleType,
  ImageAspectRatio,
  ImageGenBrandSettings,
  ImageGenGeneratedImage,
  BusinessProfile,
} from '../../types';
import { SparklesIcon } from '../Icons';

interface ImageGeneratorDrawerProps {
  open: boolean;
  onClose: () => void;
  moduleType: ImageModuleType;
  moduleId?: string;
  onInsertImage?: (imageUrl: string) => void;
  businessProfile?: BusinessProfile;
}

const ASPECT_OPTIONS: { value: ImageAspectRatio; label: string; icon: string }[] = [
  { value: '1:1', label: '1 : 1', icon: '■' },
  { value: '4:5', label: '4 : 5', icon: '▮' },
  { value: '16:9', label: '16 : 9', icon: '▬' },
];

const MODULE_LABELS: Record<ImageModuleType, string> = {
  newsletter: 'Newsletter',
  pricing: 'Pricing',
  products: 'Products',
  services: 'Services',
};

const DEFAULT_BRAND: ImageGenBrandSettings = {
  colors: { primary: '#4F46E5', secondary: '#111827', accent: '#F59E0B', bgStyle: 'gradient' },
  fontVibe: 'modern',
};

const ImageGeneratorDrawer: React.FC<ImageGeneratorDrawerProps> = ({
  open, onClose, moduleType: initialModuleType, moduleId, onInsertImage, businessProfile,
}) => {
  const [moduleType, setModuleType] = useState<ImageModuleType>(initialModuleType);
  const [prompt, setPrompt] = useState('');
  const [presetId, setPresetId] = useState<string | undefined>();
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [variations, setVariations] = useState(2);
  const [brand, setBrand] = useState<ImageGenBrandSettings>(DEFAULT_BRAND);

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<ImageGenGeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setModuleType(initialModuleType);
  }, [open, initialModuleType]);

  const handlePresetClick = (id: string, presetPrompt: string) => {
    if (presetId === id) {
      setPresetId(undefined);
    } else {
      setPresetId(id);
      if (!prompt.trim()) setPrompt(presetPrompt);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && !presetId) { setError('Enter a prompt or select a preset'); return; }
    setGenerating(true);
    setError(null);
    setGenerated([]);

    try {
      const res = await generateImages({
        moduleType,
        moduleId,
        prompt: prompt.trim(),
        presetId,
        aspectRatio,
        n: variations,
        brand,
        businessProfile,
      });

      const images = res.images.map(img => ({
        id: img.id,
        user_id: '',
        module_type: moduleType,
        module_id: moduleId,
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
        provider: 'stub',
        base_image_url: img.baseImageUrl,
        final_image_url: img.finalImageUrl,
        brand_settings: brand,
        created_at: new Date().toISOString(),
      } as ImageGenGeneratedImage));

      setGenerated(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const presets = MODULE_PRESETS[moduleType] || [];

  return (
    <Drawer open={open} onClose={onClose} title="Generate Image" width="w-[640px]">
      <div className="space-y-5">
        {/* Module type */}
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Module</span>
          <div className="mt-1.5 flex items-center space-x-2">
            {(Object.keys(MODULE_LABELS) as ImageModuleType[]).map(mt => (
              <button
                key={mt}
                onClick={() => { setModuleType(mt); setPresetId(undefined); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  moduleType === mt
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {MODULE_LABELS[mt]}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        {presets.length > 0 && (
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Presets</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePresetClick(p.id, p.prompt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    presetId === p.id
                      ? 'bg-violet-50 border-violet-200 text-violet-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt */}
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prompt</span>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate…"
            rows={3}
            className="mt-1 w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none"
          />
        </div>

        {/* Aspect ratio + Variations */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aspect Ratio</span>
            <div className="mt-1.5 flex items-center space-x-2">
              {ASPECT_OPTIONS.map(ar => (
                <button
                  key={ar.value}
                  onClick={() => setAspectRatio(ar.value)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    aspectRatio === ar.value
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <span className="text-[10px]">{ar.icon}</span>
                  <span>{ar.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Variations</span>
            <div className="mt-1.5 flex items-center space-x-2">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => setVariations(n)}
                  className={`w-9 h-9 rounded-lg text-xs font-black border transition-all ${
                    variations === n
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Brand Color Pickers */}
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Brand Colors</span>
          <div className="mt-1.5 flex items-center space-x-3">
            {(['primary', 'secondary', 'accent'] as const).map(key => (
              <label key={key} className="flex items-center space-x-1.5">
                <input
                  type="color"
                  value={brand.colors[key]}
                  onChange={e => setBrand(prev => ({ ...prev, colors: { ...prev.colors, [key]: e.target.value } }))}
                  className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer"
                />
                <span className="text-[10px] font-bold text-slate-400 capitalize">{key}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600">
            {error}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl text-sm font-bold transition-all shadow-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <SparklesIcon className="w-4 h-4" />
          )}
          <span>{generating ? 'Generating…' : `Generate ${variations} Image${variations > 1 ? 's' : ''}`}</span>
        </button>

        {/* Results */}
        <PreviewGrid
          images={generated}
          loading={generating}
          onInsert={onInsertImage}
        />
      </div>
    </Drawer>
  );
};

export default ImageGeneratorDrawer;
