// AuraEngine/pages/portal/BusinessSettingsPage.tsx
//
// Deep settings for the CURRENT business (Growth Platform v2, Phase A). Edits the
// business row (name/site/industry/…) and its business_profiles "brain" (brand
// voice, positioning, sender/compliance) that feeds AI generation. Reached from
// the Businesses page. Scoped to the current business via BusinessProvider.
//
// AI assists (mirror the single-profile ProfilePage toolkit, but scoped to the
// active business — both helpers are stateless and take a context object, so no
// business_id plumbing is needed):
//   • "Analyze website" — analyzeBusinessFromWeb(website) auto-fills empty fields
//     (and overwrites filled ones only on high AI confidence). Costs 5 credits.
//   • Per-field "Write with AI" — generateProfileField(field, context) drafts one
//     field from everything else on the form. Costs 1 credit.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Save, Sparkles, Globe, AlertTriangle } from 'lucide-react';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { getBusinessProfile, updateBusiness, upsertBusinessProfile, BusinessProfilePatch } from '../../lib/businesses';
import { supabase } from '../../lib/supabase';
import { consumeCredits } from '../../lib/credits';
import { analyzeBusinessFromWeb, generateProfileField, type ProfileGenField } from '../../lib/gemini';
import type { BusinessProfile } from '../../types';
import InviteMemberForm from '../../components/team/InviteMemberForm';
import MembersPanel from '../../components/team/MembersPanel';
import { useToast } from '../../components/ui/Toast';

type Src = 'business' | 'profile';
type FieldType = 'text' | 'textarea' | 'list';
interface Field { key: string; label: string; type: FieldType; src: Src; ph?: string; gen?: ProfileGenField }

const SECTIONS: { title: string; hint: string; fields: Field[] }[] = [
  { title: 'Business', hint: 'Basics shown across the app.', fields: [
    { key: 'name', label: 'Name', type: 'text', src: 'business' },
    { key: 'website', label: 'Website', type: 'text', src: 'business', ph: 'acme.com' },
    { key: 'industry', label: 'Industry', type: 'text', src: 'business' },
    { key: 'default_tone', label: 'Default tone', type: 'text', src: 'business', ph: 'Professional' },
    { key: 'description', label: 'Description', type: 'textarea', src: 'business', gen: 'businessDescription' },
  ]},
  { title: 'Brand voice & style', hint: 'How AI writes for this business.', fields: [
    { key: 'brand_voice', label: 'Brand voice', type: 'textarea', src: 'profile', ph: 'Confident, warm, plain-spoken…', gen: 'brandVoice' },
    { key: 'tone', label: 'Tone', type: 'text', src: 'profile', gen: 'contentTone' },
    { key: 'visual_style_notes', label: 'Visual style notes', type: 'textarea', src: 'profile', gen: 'visualStyle' },
    { key: 'preferred_ctas', label: 'Preferred CTAs (comma-separated)', type: 'list', src: 'profile', ph: 'Book a demo, Start free trial', gen: 'preferredCtas' },
  ]},
  { title: 'Positioning', hint: 'Feeds lead research & content generation.', fields: [
    { key: 'products_services', label: 'Products / services', type: 'textarea', src: 'profile', gen: 'productsServices' },
    { key: 'audience', label: 'Target audience', type: 'textarea', src: 'profile', gen: 'targetAudience' },
    { key: 'value_prop', label: 'Value proposition', type: 'textarea', src: 'profile', gen: 'valueProp' },
    { key: 'unique_selling_points', label: 'Unique selling points (comma-separated)', type: 'list', src: 'profile', gen: 'uniqueSellingPoints' },
    { key: 'competitive_advantage', label: 'Competitive advantage', type: 'textarea', src: 'profile', gen: 'competitiveAdvantage' },
    { key: 'offers', label: 'Offers', type: 'textarea', src: 'profile', gen: 'offers' },
    { key: 'competitors', label: 'Competitors', type: 'textarea', src: 'profile', gen: 'competitors' },
    { key: 'objections', label: 'Common objections', type: 'textarea', src: 'profile', gen: 'objections' },
    { key: 'case_studies', label: 'Case studies', type: 'textarea', src: 'profile', gen: 'caseStudies' },
    { key: 'company_story', label: 'Company story', type: 'textarea', src: 'profile', gen: 'companyStory' },
  ]},
  { title: 'Sender & compliance', hint: 'Used on outbound email.', fields: [
    { key: 'sender_name', label: 'Sender name', type: 'text', src: 'profile' },
    { key: 'sender_email', label: 'Sender email', type: 'text', src: 'profile', ph: 'hello@acme.com' },
    { key: 'postal_address', label: 'Postal address', type: 'textarea', src: 'profile' },
  ]},
];

const LIST_KEYS = new Set(['preferred_ctas', 'unique_selling_points']);

/** Turn "acme.com" / "https://acme.com/" into a normalized https URL for analysis. */
const normalizeUrl = (raw: string): string | null => {
  const t = (raw || '').trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { return new URL(withScheme).toString(); } catch { return null; }
};

/** Inline "Write with AI" chip beside a field label. Spends 1 credit, drafts the
 *  field from the current form context, and hands the text back via onResult. */
const WriteWithAIChip: React.FC<{
  field: ProfileGenField;
  getContext: () => BusinessProfile;
  onResult: (value: string) => void;
}> = ({ field, getContext, onResult }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setLoading(true); setError(null);
    try {
      const credit = await consumeCredits(supabase, 'profile_field_generation');
      if (!credit.success) throw new Error(credit.message || 'Insufficient credits.');
      const result = await generateProfileField(field, getContext());
      if (!result.value?.trim()) throw new Error('The AI returned nothing — please try again.');
      onResult(result.value.trim());
    } catch (e) {
      const msg = (e as Error).message || 'Generation failed';
      console.error('[BusinessSettings/WriteWithAI] failed:', msg);
      setError(msg);
    } finally { setLoading(false); }
  };
  return (
    <>
      <button type="button" onClick={run} disabled={loading} title="Generate this field with AI · 1 credit"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed">
        {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
        {loading ? 'Writing…' : 'Write with AI · 1 cr'}
      </button>
      {error && (
        <div role="alert" className="basis-full mt-1 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-rose-500" />
          <div className="flex-1 min-w-0">
            <p className="font-bold leading-snug">Couldn't write this field with AI</p>
            <p className="font-medium leading-snug break-words">{error}</p>
          </div>
          <button type="button" onClick={run} disabled={loading} className="flex-shrink-0 font-bold text-rose-700 underline hover:text-rose-900 disabled:opacity-60">Retry</button>
        </div>
      )}
    </>
  );
};

const BusinessSettingsPage: React.FC = () => {
  const { currentBusiness, currentBusinessId, refresh } = useCurrentBusiness();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentBusiness || !currentBusinessId) { setLoading(false); return; }
      setLoading(true);
      const profile = await getBusinessProfile(currentBusinessId);
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const s of SECTIONS) for (const f of s.fields) {
        const raw = f.src === 'business'
          ? (currentBusiness as unknown as Record<string, unknown>)[f.key]
          : ((profile ?? {}) as unknown as Record<string, unknown>)[f.key];
        next[f.key] = Array.isArray(raw) ? raw.join(', ') : (raw == null ? '' : String(raw));
      }
      setForm(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentBusinessId, currentBusiness]);

  const set = useCallback((key: string, val: string) => setForm(f => ({ ...f, [key]: val })), []);

  // Build a BusinessProfile-shaped context from the current form so the AI
  // helpers can ground their output in whatever the user has typed so far.
  const buildContext = useCallback((): BusinessProfile => {
    const usp = (form['unique_selling_points'] ?? '').trim();
    return {
      companyName: form['name'] || currentBusiness?.name || undefined,
      industry: form['industry'] || undefined,
      companyWebsite: form['website'] || undefined,
      businessDescription: form['description'] || undefined,
      productsServices: form['products_services'] || undefined,
      valueProp: form['value_prop'] || undefined,
      targetAudience: form['audience'] || undefined,
      competitiveAdvantage: form['competitive_advantage'] || undefined,
      companyStory: form['company_story'] || undefined,
      contentTone: form['tone'] || form['default_tone'] || undefined,
      uniqueSellingPoints: usp ? usp.split(',').map(x => x.trim()).filter(Boolean) : undefined,
    };
  }, [form, currentBusiness]);

  // ─── Analyze website → auto-fill ──────────────────────────────────────
  // Fills empty fields with anything the AI returns; only overwrites a field
  // the user already filled when AI confidence is high (>=70), so re-running
  // never silently clobbers curated copy.
  const analyze = useCallback(async () => {
    const url = normalizeUrl(form['website'] ?? '');
    if (!url) { toast('Add a website first (e.g. acme.com) so AI has something to read.', 'error'); return; }
    setAnalyzing(true);
    const withDeadline = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(label)), ms))]);
    try {
      const credit = await withDeadline(
        consumeCredits(supabase, 'business_analysis'), 15_000,
        'Could not verify your credits (the request timed out). Please try again.',
      );
      if (!credit.success) throw new Error(credit.message || 'Insufficient credits.');
      const result = await withDeadline(
        analyzeBusinessFromWeb(url), 240_000,
        'Analysis timed out. Try again, or fill your details in manually.',
      );
      if (!result.analysis) throw new Error('Could not extract a profile from that site. Try a different URL or fill fields manually.');

      const a = result.analysis as unknown as Record<string, { value?: unknown; confidence?: number } | undefined>;
      const HIGH = 70;
      let added = 0, updated = 0;
      const next = { ...form };
      const merge = (formKey: string, value: unknown, confidence: number) => {
        const str = Array.isArray(value) ? value.join(', ') : (value == null ? '' : String(value));
        if (!str.trim()) return;
        const cur = (next[formKey] ?? '').trim();
        if (!cur) { next[formKey] = str; added++; }
        else if (confidence >= HIGH && cur !== str) { next[formKey] = str; updated++; }
      };
      // analysis field (source) → form key (target)
      const MAP: [string, string][] = [
        ['companyName', 'name'], ['industry', 'industry'], ['contentTone', 'tone'],
        ['productsServices', 'products_services'], ['targetAudience', 'audience'],
        ['valueProp', 'value_prop'], ['uniqueSellingPoints', 'unique_selling_points'],
        ['competitiveAdvantage', 'competitive_advantage'], ['companyStory', 'company_story'],
        ['businessEmail', 'sender_email'], ['address', 'postal_address'],
      ];
      for (const [src, dst] of MAP) {
        const node = a[src];
        if (node && node.value != null) merge(dst, node.value, node.confidence ?? 0);
      }
      // default_tone (business) mirrors the discovered content tone when blank.
      const tone = a['contentTone'];
      if (tone?.value != null) merge('default_tone', tone.value, tone.confidence ?? 0);

      setForm(next);
      if (added + updated === 0) {
        toast('Analysis finished, but nothing new was confident enough to add. Your fields look complete.', 'info');
      } else {
        const parts = [added && `filled ${added}`, updated && `updated ${updated}`].filter(Boolean).join(', ');
        toast(`Website analyzed — ${parts} field${added + updated === 1 ? '' : 's'}. Review and Save.`, 'success');
      }
    } catch (e) {
      toast((e as Error).message || 'Website analysis failed', 'error');
    } finally { setAnalyzing(false); }
  }, [form, toast]);

  const save = useCallback(async () => {
    if (!currentBusiness || !currentBusinessId) return;
    if (!(form['name'] ?? '').trim()) { toast('Business name is required.', 'error'); return; }
    setSaving(true);
    try {
      const bizPatch: Record<string, string | null> = {};
      const profPatch: BusinessProfilePatch = {};
      for (const s of SECTIONS) for (const f of s.fields) {
        const v = (form[f.key] ?? '').trim();
        if (f.src === 'business') {
          bizPatch[f.key] = v || null;
        } else if (LIST_KEYS.has(f.key)) {
          (profPatch as Record<string, unknown>)[f.key] = v ? v.split(',').map(x => x.trim()).filter(Boolean) : null;
        } else {
          (profPatch as Record<string, unknown>)[f.key] = v || null;
        }
      }
      await updateBusiness(currentBusinessId, bizPatch);
      await upsertBusinessProfile(currentBusinessId, currentBusiness.workspace_id, profPatch);
      await refresh();
      toast('Business settings saved', 'success');
    } catch (e) {
      toast((e as Error).message || 'Could not save', 'error');
    } finally { setSaving(false); }
  }, [form, currentBusiness, currentBusinessId, refresh, toast]);

  if (!currentBusiness) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-500">No business selected.</div>;
  }

  const busy = saving || loading || analyzing;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button onClick={() => navigate('/portal/businesses')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Businesses
      </button>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{currentBusiness.name} — Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Brand voice and positioning here feed every AI generation for this business.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={analyze} disabled={busy} title="Read the website and auto-fill this profile · 5 credits"
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-indigo-200 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-50 disabled:opacity-50">
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            {analyzing ? 'Analyzing…' : 'Analyze website'}
          </button>
          <button onClick={save} disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-10"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(section => (
            <div key={section.title} className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="font-semibold text-gray-900">{section.title}</h2>
              <p className="text-xs text-gray-500 mb-4">{section.hint}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.fields.map(f => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <label htmlFor={`bs-${f.key}`} className="block text-xs font-semibold text-gray-600">{f.label}</label>
                      {f.gen && !analyzing && (
                        <WriteWithAIChip field={f.gen} getContext={buildContext} onResult={v => set(f.key, v)} />
                      )}
                    </div>
                    {f.type === 'textarea' ? (
                      <textarea id={`bs-${f.key}`} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} rows={2} placeholder={f.ph}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y" />
                    ) : (
                      <input id={`bs-${f.key}`} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.ph}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-6">
        <MembersPanel />
        <InviteMemberForm businessId={currentBusinessId} businessName={currentBusiness.name} />
      </div>
    </div>
  );
};

export default BusinessSettingsPage;
