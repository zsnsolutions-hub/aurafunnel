// AuraEngine/pages/portal/BusinessSettingsPage.tsx
//
// Deep settings for the CURRENT business (Growth Platform v2, Phase A). Edits the
// business row (name/site/industry/…) and its business_profiles "brain" (brand
// voice, positioning, sender/compliance) that feeds AI generation. Reached from
// the Businesses page. Scoped to the current business via BusinessProvider.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { getBusinessProfile, updateBusiness, upsertBusinessProfile, BusinessProfilePatch } from '../../lib/businesses';
import InviteMemberForm from '../../components/team/InviteMemberForm';
import { useToast } from '../../components/ui/Toast';

type Src = 'business' | 'profile';
type FieldType = 'text' | 'textarea' | 'list';
interface Field { key: string; label: string; type: FieldType; src: Src; ph?: string }

const SECTIONS: { title: string; hint: string; fields: Field[] }[] = [
  { title: 'Business', hint: 'Basics shown across the app.', fields: [
    { key: 'name', label: 'Name', type: 'text', src: 'business' },
    { key: 'website', label: 'Website', type: 'text', src: 'business', ph: 'acme.com' },
    { key: 'industry', label: 'Industry', type: 'text', src: 'business' },
    { key: 'default_tone', label: 'Default tone', type: 'text', src: 'business', ph: 'Professional' },
    { key: 'description', label: 'Description', type: 'textarea', src: 'business' },
  ]},
  { title: 'Brand voice & style', hint: 'How AI writes for this business.', fields: [
    { key: 'brand_voice', label: 'Brand voice', type: 'textarea', src: 'profile', ph: 'Confident, warm, plain-spoken…' },
    { key: 'tone', label: 'Tone', type: 'text', src: 'profile' },
    { key: 'visual_style_notes', label: 'Visual style notes', type: 'textarea', src: 'profile' },
    { key: 'preferred_ctas', label: 'Preferred CTAs (comma-separated)', type: 'list', src: 'profile', ph: 'Book a demo, Start free trial' },
  ]},
  { title: 'Positioning', hint: 'Feeds lead research & content generation.', fields: [
    { key: 'products_services', label: 'Products / services', type: 'textarea', src: 'profile' },
    { key: 'audience', label: 'Target audience', type: 'textarea', src: 'profile' },
    { key: 'value_prop', label: 'Value proposition', type: 'textarea', src: 'profile' },
    { key: 'unique_selling_points', label: 'Unique selling points (comma-separated)', type: 'list', src: 'profile' },
    { key: 'competitive_advantage', label: 'Competitive advantage', type: 'textarea', src: 'profile' },
    { key: 'offers', label: 'Offers', type: 'textarea', src: 'profile' },
    { key: 'competitors', label: 'Competitors', type: 'textarea', src: 'profile' },
    { key: 'objections', label: 'Common objections', type: 'textarea', src: 'profile' },
    { key: 'case_studies', label: 'Case studies', type: 'textarea', src: 'profile' },
    { key: 'company_story', label: 'Company story', type: 'textarea', src: 'profile' },
  ]},
  { title: 'Sender & compliance', hint: 'Used on outbound email.', fields: [
    { key: 'sender_name', label: 'Sender name', type: 'text', src: 'profile' },
    { key: 'sender_email', label: 'Sender email', type: 'text', src: 'profile', ph: 'hello@acme.com' },
    { key: 'postal_address', label: 'Postal address', type: 'textarea', src: 'profile' },
  ]},
];

const LIST_KEYS = new Set(['preferred_ctas', 'unique_selling_points']);

const BusinessSettingsPage: React.FC = () => {
  const { currentBusiness, currentBusinessId, refresh } = useCurrentBusiness();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        <button onClick={save} disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shrink-0">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
        </button>
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
                    <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                    {f.type === 'textarea' ? (
                      <textarea value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} rows={2} placeholder={f.ph}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y" />
                    ) : (
                      <input value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.ph}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <InviteMemberForm businessId={currentBusinessId} businessName={currentBusiness.name} />
      </div>
    </div>
  );
};

export default BusinessSettingsPage;
