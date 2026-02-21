// File: AuraEngine/components/social/MediaUploader.tsx
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { UploadIcon, XIcon, RefreshIcon, CameraIcon } from '../Icons';

interface Props {
  userId: string;
  mediaPaths: string[];
  setMediaPaths: (paths: string[]) => void;
}

const MediaUploader: React.FC<Props> = ({ userId, mediaPaths, setMediaPaths }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const newPaths: string[] = [];
      const newPreviews: string[] = [];

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          setError('Only image and video files are supported.');
          continue;
        }

        if (file.size > 50 * 1024 * 1024) {
          setError('File size must be under 50MB.');
          continue;
        }

        const ext = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('social_media')
          .upload(fileName, file);

        if (uploadErr) {
          setError(uploadErr.message);
          continue;
        }

        newPaths.push(fileName);

        if (file.type.startsWith('image/')) {
          newPreviews.push(URL.createObjectURL(file));
        } else {
          newPreviews.push('');
        }
      }

      setMediaPaths([...mediaPaths, ...newPaths]);
      setPreviews([...previews, ...newPreviews]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = async (index: number) => {
    const path = mediaPaths[index];
    await supabase.storage.from('social_media').remove([path]);

    const newPaths = mediaPaths.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);

    if (previews[index]) URL.revokeObjectURL(previews[index]);

    setMediaPaths(newPaths);
    setPreviews(newPreviews);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <CameraIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Media</h3>
        </div>
        <span className="text-[10px] text-slate-400 font-bold">{mediaPaths.length} file{mediaPaths.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-6 space-y-3">
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl font-bold">{error}</div>
        )}

        {/* Preview grid */}
        {mediaPaths.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {mediaPaths.map((path, i) => (
              <div key={path} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                {previews[i] ? (
                  <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-bold">
                    VIDEO
                  </div>
                )}
                <button
                  onClick={() => removeMedia(i)}
                  className="absolute top-1 right-1 p-0.5 bg-white/90 rounded-full text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload area */}
        <div className="relative h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center hover:border-indigo-300 transition-all cursor-pointer group">
          {uploading ? (
            <RefreshIcon className="w-5 h-5 animate-spin text-indigo-400" />
          ) : (
            <div className="text-center">
              <UploadIcon className="w-5 h-5 mx-auto mb-1 text-slate-300 group-hover:text-indigo-400 transition-colors" />
              <p className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-500">
                Click or drag to upload images
              </p>
              <p className="text-[9px] text-slate-300">JPG, PNG, GIF, MP4 up to 50MB</p>
            </div>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>

        <p className="text-[10px] text-slate-400">
          Instagram requires at least one image. Facebook and LinkedIn support text-only posts.
        </p>
      </div>
    </div>
  );
};

export default MediaUploader;
