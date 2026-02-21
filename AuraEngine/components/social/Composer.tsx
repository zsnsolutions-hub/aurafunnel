// File: AuraEngine/components/social/Composer.tsx
import React from 'react';
import { EditIcon, LinkIcon } from '../Icons';

interface Props {
  contentText: string;
  setContentText: (v: string) => void;
  linkUrl: string;
  setLinkUrl: (v: string) => void;
  trackClicks: boolean;
  setTrackClicks: (v: boolean) => void;
}

const MAX_CHARS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
};

const Composer: React.FC<Props> = ({
  contentText, setContentText, linkUrl, setLinkUrl, trackClicks, setTrackClicks,
}) => {
  const charCount = contentText.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <EditIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Compose Post</h3>
        </div>
        <span className={`text-[10px] font-bold ${charCount > 2200 ? 'text-amber-500' : 'text-slate-400'}`}>
          {charCount} characters
        </span>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Post Content</label>
          <textarea
            value={contentText}
            onChange={e => setContentText(e.target.value)}
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            placeholder="Write your post content here... This will be published to all selected platforms."
          />
          <div className="flex items-center space-x-3 text-[10px] text-slate-400">
            {Object.entries(MAX_CHARS).map(([platform, max]) => (
              <span key={platform} className={charCount > max ? 'text-rose-500 font-bold' : ''}>
                {platform.charAt(0).toUpperCase() + platform.slice(1)}: {charCount}/{max}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center space-x-1">
            <LinkIcon className="w-3 h-3" />
            <span>Link URL (optional)</span>
          </label>
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            placeholder="https://example.com/your-page"
          />
        </div>

        {linkUrl.trim() && (
          <label className="flex items-center space-x-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-all">
            <input
              type="checkbox"
              checked={trackClicks}
              onChange={e => setTrackClicks(e.target.checked)}
              className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-bold text-indigo-700">Track CTA Clicks</p>
              <p className="text-[10px] text-indigo-500">Replace link with a tracking URL to measure clicks per channel</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
};

export default Composer;
