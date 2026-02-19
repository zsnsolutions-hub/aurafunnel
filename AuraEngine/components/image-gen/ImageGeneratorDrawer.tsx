import React, { useState, useEffect, useCallback } from 'react';
import { Drawer } from '../ui/Drawer';
import BrandSettingsPanel from './BrandSettingsPanel';
import PreviewGrid from './PreviewGrid';
import HistoryPanel from './HistoryPanel';
import { MODULE_PRESETS } from '../../lib/imagePromptBuilder';
import { generateImages, compositeLogoOnImages, uploadLogo, listLogos, deleteLogo, saveToModule } from '../../lib/imageGen';
import type {
  ImageModuleType,
  ImageAspectRatio,
  ImageGenBrandSettings,
  ImageGenBrandAsset,
  ImageGenGeneratedImage,
} from '../../types';
import { SparklesIcon, ClockIcon } from '../Icons';

interface ImageGeneratorDrawerProps {
  open: boolean;
  onClose: () => void;
  moduleType: ImageModuleType;
  moduleId?: string;
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
  logoPlacement: 'top-right',
  logoSize: 'medium',
  logoOpacity: 1,
  fontVibe: 'modern',
};

const ImageGeneratorDrawer: React.FC<ImageGeneratorDrawerProps> = ({
  open, onClose, moduleType: initialModuleType, moduleId,
}) => {
  // ── Form state ──
  const [moduleType, setModuleType] = useState<ImageModuleType>(initialModuleType);
  const [prompt, setPrompt] = useState('');
  const [presetId, setPresetId] = useState<string | undefined>();
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [variations, setVariations] = useState(2);
  const [brand, setBrand] = useState<ImageGenBrandSettings>(DEFAULT_BRAND);

  // ── Data state ──
  const [logos, setLogos] = useState<ImageGenBrandAsset[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<ImageGenGeneratedImage[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'generate' | 'history'>('generate');

  // ── Sync initial module type when drawer opens ──
  useEffect(() => {
    if (open) setModuleType(initialModuleType);
  }, [open, initialModuleType]);

  // ── Fetch logos on open ──
  useEffect(() => {
    if (!open) return;
    listLogos().then(setLogos).catch(console.error);
  }, [open]);

  // ── Preset selection fills prompt ──
  const handlePresetClick = (id: string, presetPrompt: string) => {
    if (presetId === id) {
      setPresetId(undefined);
    } else {
      setPresetId(id);
      if (!prompt.trim()) setPrompt(presetPrompt);
    }
  };

  // ── Logo upload ──
  const handleUploadLogo = useCallback(async (file: File) => {
    setUploadingLogo(true);
    setError(null);
    try {
      const asset = await uploadLogo(file);
      setLogos(prev => [asset, ...prev]);
      setBrand(prev => ({ ...prev, logoAssetId: asset.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingLogo(false);
    }
  }, []);

  // ── Delete logo ──
  const handleDeleteLogo = useCallback(async (id: string) => {
    await deleteLogo(id);
    setLogos(prev => prev.filter(l => l.id !== id));
    if (brand.logoAssetId === id) {
      setBrand(prev => ({ ...prev, logoAssetId: undefined }));
    }
  }, [brand.logoAssetId]);

  // ── Generate ──
  const handleGenerate = async () => {
    if (!prompt.trim() && !presetId) { setError('Enter a prompt or select a preset'); return; }
    setGenerating(true);
    setError(null);
    setGenerated([]);
    setSavedIds(new Set());

    try {
      const res = await generateImages({
        moduleType,
        moduleId,
        prompt: prompt.trim(),
        presetId,
        aspectRatio,
        n: variations,
        brand,
      });

      let images = res.images.map(img => ({
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

      // Post-process: overlay logo if selected
      const selectedLogo = logos.find(l => l.id === brand.logoAssetId);
      if (selectedLogo && brand.logoPlacement && brand.logoSize) {
        try {
          images = await compositeLogoOnImages(
            images,
            selectedLogo.file_url,
            brand.logoPlacement,
            brand.logoSize,
            brand.logoOpacity ?? 1,
          );
        } catch (compositeErr) {
          console.warn('Logo compositing failed, using base images:', compositeErr);
        }
      }

      setGenerated(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── Save to module ──
  const handleSave = async (img: ImageGenGeneratedImage) => {
    if (!moduleId) return;
    try {
      await saveToModule({ generatedImageId: img.id, moduleType, moduleId });
      setSavedIds(prev => new Set(prev).add(img.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  // ── Reuse from history ──
  const handleReuse = (img: ImageGenGeneratedImage) => {
    setPrompt(img.prompt);
    setAspectRatio(img.aspect_ratio);
    if (img.brand_settings) setBrand(img.brand_settings);
    setTab('generate');
  };

  const presets = MODULE_PRESETS[moduleType] || [];

  return (
    <Drawer open={open} onClose={onClose} title="Generate Image" width="w-[640px]">
      {/* Tab bar */}
      <div className="flex items-center space-x-1 mb-5 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setTab('generate')}
          className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === 'generate' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          <span>Generate</span>
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === 'history' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ClockIcon className="w-3.5 h-3.5" />
          <span>History</span>
        </button>
      </div>

      {tab === 'history' ? (
        <HistoryPanel moduleType={moduleType} onReuse={handleReuse} />
      ) : (
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

          {/* Brand Settings (collapsed) */}
          <BrandSettingsPanel
            settings={brand}
            onChange={setBrand}
            logos={logos}
            onUploadLogo={handleUploadLogo}
            onDeleteLogo={handleDeleteLogo}
            uploadingLogo={uploadingLogo}
          />

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
            onSave={moduleId ? handleSave : undefined}
            savedIds={savedIds}
          />
        </div>
      )}
    </Drawer>
  );
};

export default ImageGeneratorDrawer;
