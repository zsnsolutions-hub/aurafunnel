// AuraEngine/pages/portal/ImageStudio.tsx
//
// Image Campaign Studio (Phase E): upload an image -> AI analyzes it -> pick
// goal/channel/audience/tone -> generate channel content (short & long). Content
// is saved to generated_assets. Business-scoped + credit-gated.

import React, { useState, useCallback, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Upload, Sparkles, Loader2, Image as ImageIcon, Copy, Check, Send, Mail } from 'lucide-react';
import { User } from '../../types';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { workspaceFlagEnabled } from '../../lib/featureFlags';
import { useToast } from '../../components/ui/Toast';
import { consumeCredits } from '../../lib/credits';
import { supabase } from '../../lib/supabase';
import {
  MediaAsset, GeneratedPiece, Channel, Goal,
  uploadImageAsset, analyzeImage, generateFromImage,
} from '../../lib/imageStudio';

const GOALS: Goal[] = ['sell', 'educate', 'announce', 'nurture', 'follow_up', 'launch', 'promote', 'post'];
const CHANNELS: Channel[] = ['email', 'instagram', 'facebook', 'tiktok', 'linkedin', 'blog', 'campaign'];
const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const ImageStudio: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const { currentBusinessId, currentBusiness } = useCurrentBusiness();
  const workspaceId = currentBusiness?.workspace_id ?? null;
  const { toast } = useToast();
  const navigate = useNavigate();

  const [dataUri, setDataUri] = useState<string | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [busy, setBusy] = useState<'upload' | 'analyze' | 'generate' | null>(null);
  const [goal, setGoal] = useState<Goal>('sell');
  const [channel, setChannel] = useState<Channel>('email');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [pieces, setPieces] = useState<GeneratedPiece[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [posting, setPosting] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [flagChecked, setFlagChecked] = useState(false);
  useEffect(() => { workspaceFlagEnabled(user.id, 'image_studio').then(setEnabled).finally(() => setFlagChecked(true)); }, [user.id]);

  const onFile = useCallback(async (file: File) => {
    if (!currentBusinessId || !workspaceId) { toast('Select a business first.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const uri = reader.result as string;
      setDataUri(uri); setAsset(null); setPieces([]);
      setBusy('upload');
      try {
        const { asset: a } = await uploadImageAsset(currentBusinessId, workspaceId, user.id, uri, file.name);
        setAsset(a);
        // Auto-analyze
        setBusy('analyze');
        const credit = await consumeCredits(supabase, 'business_analysis');
        if (!credit.success) { toast(credit.message, 'error'); return; }
        setAsset(await analyzeImage(currentBusinessId, a.id, uri));
        toast('Image analyzed', 'success');
      } catch (e) { toast((e as Error).message || 'Upload/analyze failed', 'error'); }
      finally { setBusy(null); }
    };
    reader.readAsDataURL(file);
  }, [currentBusinessId, workspaceId, user.id, toast]);

  const generate = useCallback(async () => {
    if (!asset || !currentBusinessId || !workspaceId) return;
    setBusy('generate'); setPieces([]);
    try {
      const credit = await consumeCredits(supabase, 'content_generation');
      if (!credit.success) { toast(credit.message, 'error'); return; }
      const out = await generateFromImage(currentBusinessId, workspaceId, user.id, asset, { goal, channel, audience, tone });
      setPieces(out);
      if (out.length === 0) toast('No content produced — try again', 'error');
    } catch (e) { toast((e as Error).message || 'Generation failed', 'error'); }
    finally { setBusy(null); }
  }, [asset, currentBusinessId, workspaceId, user.id, goal, channel, audience, tone, toast]);

  const copy = useCallback((id: string, text: string) => {
    navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500);
  }, []);

  // Hand off a generated piece + its image to the Social Scheduler, ready to
  // publish. The image lives in the image-gen-assets bucket; the publisher signs
  // media from social_media, so copy it over first. If that fails, still hand off
  // the copy (image is optional — the user can re-attach in the scheduler).
  const hashLine = (pc: GeneratedPiece) =>
    (pc.hashtags ?? []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const postToSocial = useCallback(async (pc: GeneratedPiece) => {
    const content = [pc.title, pc.content, hashLine(pc)].filter(Boolean).join('\n\n');
    setPosting(pc.variant);
    let mediaPaths: string[] | undefined;
    try {
      if (asset?.file_url) {
        const resp = await fetch(asset.file_url);
        if (resp.ok) {
          const blob = await resp.blob();
          const ext = ((blob.type.split('/')[1] || 'png').split('+')[0]).replace(/[^a-z0-9]/gi, '') || 'png';
          const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
          const { error } = await supabase.storage.from('social_media').upload(path, blob, { contentType: blob.type });
          if (!error) mediaPaths = [path];
          else toast("Couldn't attach the image — you can add it in the scheduler.", 'error');
        }
      }
    } catch {
      toast("Couldn't attach the image — you can add it in the scheduler.", 'error');
    } finally {
      setPosting(null);
    }
    navigate('/portal/social-scheduler', { state: { content, mediaPaths } });
  }, [asset, user.id, navigate, toast]);

  // Hand a generated piece off to the email campaign composer. The image already
  // lives in image-gen-assets (the same public bucket the email builder embeds
  // from), so pass its URL straight through — no copy needed.
  const useInEmail = useCallback((pc: GeneratedPiece) => {
    navigate('/portal/content-studio', {
      state: {
        emailPrefill: {
          subject: pc.title || undefined,
          body: [pc.content, hashLine(pc)].filter(Boolean).join('\n\n'),
          imageUrl: asset?.file_url ?? undefined,
        },
      },
    });
  }, [asset, navigate]);

  if (flagChecked && !enabled) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-slate-400 text-sm">Image Campaign Studio isn't enabled for this workspace yet.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-1"><ImageIcon size={22} className="text-indigo-600" /> Image Campaign Studio</h1>
      <p className="text-sm text-slate-500 mb-8">Upload an image → AI reads it → generate email &amp; social content grounded in what it actually shows.</p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upload + analysis */}
        <div className="space-y-4">
          <label className="block border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-300 transition-colors bg-white">
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            {dataUri ? (
              <img src={dataUri} alt="upload" className="max-h-56 mx-auto rounded-lg" />
            ) : (
              <div className="py-8 text-slate-400"><Upload size={28} className="mx-auto mb-2" /><p className="text-sm font-medium">Click to upload an image</p></div>
            )}
          </label>

          {(busy === 'upload' || busy === 'analyze') && (
            <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> {busy === 'upload' ? 'Uploading…' : 'Analyzing image…'}</p>
          )}

          {asset?.ai_image_summary && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-sm">
              <p className="text-slate-700">{asset.ai_image_summary}</p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {asset.detected_style && <span className="px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">{asset.detected_style}</span>}
                {asset.mood && <span className="px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">{asset.mood}</span>}
                {asset.detected_product && <span className="px-2 py-0.5 bg-indigo-50 rounded-full text-indigo-600">{asset.detected_product}</span>}
              </div>
              {asset.suggested_campaign_angle && <p className="text-xs text-slate-500"><span className="font-semibold">Angle:</span> {asset.suggested_campaign_angle}</p>}
            </div>
          )}
        </div>

        {/* Config + generate */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Goal</label>
                <select value={goal} onChange={e => setGoal(e.target.value as Goal)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  {GOALS.map(g => <option key={g} value={g}>{label(g)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Channel</label>
                <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  {CHANNELS.map(c => <option key={c} value={c}>{label(c)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Audience</label>
              <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Defaults to your business audience" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tone</label>
              <input value={tone} onChange={e => setTone(e.target.value)} placeholder="e.g. bold, friendly, luxury — or brand default" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <button onClick={generate} disabled={!asset?.ai_image_summary || busy === 'generate'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40">
              {busy === 'generate' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate {label(channel)}
            </button>
          </div>

          {pieces.map(pc => (
            <div key={pc.variant} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{pc.variant}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => copy(pc.variant, [pc.title, pc.content, (pc.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n'))}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                    {copied === pc.variant ? <Check size={12} /> : <Copy size={12} />} Copy
                  </button>
                  <button onClick={() => useInEmail(pc)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    <Mail size={12} /> Use in Email
                  </button>
                  <button onClick={() => postToSocial(pc)} disabled={posting === pc.variant}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                    {posting === pc.variant ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Post to Social
                  </button>
                </div>
              </div>
              {pc.title && <p className="text-sm font-bold text-slate-900 mb-1">{pc.title}</p>}
              {pc.preview_text && <p className="text-xs text-slate-400 mb-1">{pc.preview_text}</p>}
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{pc.content}</p>
              {pc.hashtags && pc.hashtags.length > 0 && <p className="text-xs text-indigo-600 mt-2">{pc.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>}
              {pc.cta && <p className="text-xs text-slate-500 mt-2"><span className="font-semibold">CTA:</span> {pc.cta}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImageStudio;
