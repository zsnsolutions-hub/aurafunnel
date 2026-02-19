import React, { useState } from 'react';
import type { ImageGenGeneratedImage } from '../../types';
import { CheckIcon, DownloadIcon, EyeIcon, XIcon, PlusIcon } from '../Icons';

interface PreviewGridProps {
  images: ImageGenGeneratedImage[];
  loading: boolean;
  onSave?: (image: ImageGenGeneratedImage) => void;
  onInsert?: (imageUrl: string) => void;
  savedIds?: Set<string>;
}

const PreviewGrid: React.FC<PreviewGridProps> = ({ images, loading, onSave, onInsert, savedIds }) => {
  const [insertedIds, setInsertedIds] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="aspect-square bg-slate-100 rounded-xl animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ))}
      </div>
    );
  }

  if (images.length === 0) return null;

  const getDisplayUrl = (img: ImageGenGeneratedImage) => img.final_image_url || img.base_image_url;

  return (
    <>
      <div className={`grid ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
        {images.map(img => {
          const url = getDisplayUrl(img);
          const isSaved = savedIds?.has(img.id);
          return (
            <div key={img.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={url}
                alt="Generated"
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setLightboxUrl(url)}
                    className="p-2 bg-white/90 rounded-xl text-slate-700 hover:bg-white transition-all"
                    title="Preview"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                  <a
                    href={url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/90 rounded-xl text-slate-700 hover:bg-white transition-all"
                    title="Download"
                  >
                    <DownloadIcon className="w-4 h-4" />
                  </a>
                  {onInsert && (
                    <button
                      onClick={() => { onInsert(url); setInsertedIds(prev => new Set(prev).add(img.id)); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        insertedIds.has(img.id)
                          ? 'bg-emerald-500 text-white'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                      title={insertedIds.has(img.id) ? 'Added' : 'Use in Email'}
                    >
                      {insertedIds.has(img.id) ? (
                        <span className="flex items-center space-x-1"><CheckIcon className="w-3.5 h-3.5" /><span>Added</span></span>
                      ) : (
                        <span className="flex items-center space-x-1"><PlusIcon className="w-3.5 h-3.5" /><span>Use in Email</span></span>
                      )}
                    </button>
                  )}
                  {onSave && (
                    <button
                      onClick={() => onSave(img)}
                      disabled={isSaved}
                      className={`p-2 rounded-xl transition-all ${
                        isSaved
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/90 text-slate-700 hover:bg-white'
                      }`}
                      title={isSaved ? 'Saved' : 'Save to module'}
                    >
                      <CheckIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-8"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-6 right-6 p-2 bg-white/20 rounded-xl text-white hover:bg-white/30 transition-all"
          >
            <XIcon className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default PreviewGrid;
