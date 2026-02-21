// File: AuraEngine/components/social/PostPreview.tsx
import React from 'react';
import { PublishTarget } from '../../hooks/useSocialAccounts';
import {
  FacebookIcon, InstagramIcon, LinkedInIcon, EyeIcon, LinkIcon,
} from '../Icons';

interface Props {
  contentText: string;
  linkUrl: string;
  mediaPaths: string[];
  selectedTargets: PublishTarget[];
  mode: 'now' | 'scheduled';
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  facebook_page: <FacebookIcon className="w-3.5 h-3.5 text-blue-600" />,
  instagram: <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />,
  linkedin_member: <LinkedInIcon className="w-3.5 h-3.5 text-sky-700" />,
  linkedin_org: <LinkedInIcon className="w-3.5 h-3.5 text-sky-700" />,
};

const PostPreview: React.FC<Props> = ({
  contentText, linkUrl, mediaPaths, selectedTargets,
  mode, scheduledDate, scheduledTime, timezone,
}) => {
  const hasContent = contentText.trim().length > 0;
  const hasTargets = selectedTargets.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center space-x-2">
        <EyeIcon className="w-4 h-4 text-indigo-600" />
        <h3 className="font-bold text-slate-800 text-sm">Preview</h3>
      </div>
      <div className="p-6 space-y-4">
        {!hasContent ? (
          <p className="text-xs text-slate-400 text-center py-4">Start typing to see a preview...</p>
        ) : (
          <>
            {/* Content preview */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {contentText.length > 500 ? contentText.substring(0, 500) + '...' : contentText}
              </p>
              {linkUrl && (
                <div className="mt-3 flex items-center space-x-1 text-xs text-indigo-600">
                  <LinkIcon className="w-3 h-3" />
                  <span className="truncate">{linkUrl}</span>
                </div>
              )}
              {mediaPaths.length > 0 && (
                <p className="mt-2 text-[10px] text-slate-400 font-bold">
                  {mediaPaths.length} media file{mediaPaths.length !== 1 ? 's' : ''} attached
                </p>
              )}
            </div>

            {/* Publishing to */}
            {hasTargets && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Publishing to</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTargets.map(t => (
                    <span
                      key={`${t.channel}-${t.target_id}`}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-lg"
                    >
                      {CHANNEL_ICONS[t.channel]}
                      <span className="text-[10px] font-bold text-slate-600">{t.target_label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule info */}
            {mode === 'scheduled' && scheduledDate && scheduledTime && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-xs font-bold text-amber-700">
                  Scheduled for {scheduledDate} at {scheduledTime} ({timezone})
                </p>
              </div>
            )}

            {/* Warnings */}
            {selectedTargets.some(t => t.channel === 'instagram') && mediaPaths.length === 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                <p className="text-xs font-bold text-rose-600">
                  Instagram requires at least one image to publish.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PostPreview;
