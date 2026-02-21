// File: AuraEngine/components/social/Composer.tsx
import React, { useState } from 'react';
import { EditIcon, LinkIcon, SparklesIcon, RefreshIcon } from '../Icons';
import { BusinessProfile } from '../../types';
import { supabase } from '../../lib/supabase';
import { generateSocialCaption, SocialPlatform } from '../../lib/gemini';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';

interface Props {
  contentText: string;
  setContentText: (v: string) => void;
  linkUrl: string;
  setLinkUrl: (v: string) => void;
  trackClicks: boolean;
  setTrackClicks: (v: boolean) => void;
  userId?: string;
  businessProfile?: BusinessProfile;
}

const MAX_CHARS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
};

const Composer: React.FC<Props> = ({
  contentText, setContentText, linkUrl, setLinkUrl, trackClicks, setTrackClicks,
  userId, businessProfile,
}) => {
  const charCount = contentText.length;

  // AI caption generation state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiPlatform, setAiPlatform] = useState<SocialPlatform>('linkedin');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!aiTopic.trim() || !userId) return;
    setGenerating(true);
    setAiError(null);
    try {
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS.social_caption);
      if (!creditResult.success) {
        setAiError(creditResult.message);
        return;
      }
      const res = await generateSocialCaption({
        platform: aiPlatform,
        postTitle: aiTopic,
        postUrl: linkUrl,
        businessProfile,
      }, userId);
      if (res.text) {
        setContentText(res.text);
      } else {
        setAiError('No caption generated. Please try again.');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate caption');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <EditIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Compose Post</h3>
        </div>
        <div className="flex items-center space-x-2">
          {userId && (
            <button
              onClick={() => setShowAiPanel(!showAiPanel)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                showAiPanel
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-slate-50 text-slate-500 hover:bg-violet-50 hover:text-violet-600'
              }`}
            >
              <SparklesIcon className="w-3 h-3" />
              <span>AI Generate</span>
            </button>
          )}
          <span className={`text-[10px] font-bold ${charCount > 2200 ? 'text-amber-500' : 'text-slate-400'}`}>
            {charCount} characters
          </span>
        </div>
      </div>

      {/* AI Caption Generation Panel */}
      {showAiPanel && userId && (
        <div className="px-6 py-4 bg-violet-50/50 border-b border-violet-100 space-y-3">
          <div className="flex items-center space-x-2">
            <SparklesIcon className="w-3.5 h-3.5 text-violet-600" />
            <p className="text-xs font-bold text-violet-700">AI Caption Generator</p>
            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded text-[9px] font-bold">
              {CREDIT_COSTS.social_caption} credit
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              placeholder="Enter topic or key message..."
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-violet-200 text-sm focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none"
            />
            <select
              value={aiPlatform}
              onChange={e => setAiPlatform(e.target.value as SocialPlatform)}
              className="px-3 py-2 rounded-lg bg-white border border-violet-200 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-400 outline-none"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">Twitter</option>
              <option value="facebook">Facebook</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={generating || !aiTopic.trim()}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                generating || !aiTopic.trim()
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm'
              }`}
            >
              {generating ? (
                <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="w-3.5 h-3.5" />
              )}
              <span>{generating ? 'Generating...' : 'Generate'}</span>
            </button>
          </div>
          {aiError && (
            <p className="text-[11px] text-rose-600 font-semibold">{aiError}</p>
          )}
        </div>
      )}

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
