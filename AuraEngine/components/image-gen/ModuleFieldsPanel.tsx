import React, { useState } from 'react';
import type {
  ModuleFieldValues,
  NewsletterModuleFields,
  PricingModuleFields,
  PricingTierField,
  ProductsModuleFields,
  ProductItemField,
  ServicesModuleFields,
  ServiceItemField,
} from '../../types';

interface ModuleFieldsPanelProps {
  value: ModuleFieldValues;
  onChange: (v: ModuleFieldValues) => void;
}

const labelCls = 'text-[10px] font-bold text-slate-500 uppercase tracking-wider';
const inputCls = 'mt-1 w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none';
const textareaCls = `${inputCls} resize-none`;
const cardCls = 'p-3 border border-slate-200 rounded-xl space-y-2';

function hasContent(value: ModuleFieldValues): boolean {
  switch (value.type) {
    case 'newsletter': {
      const f = value.fields;
      return !!(f.headline || f.subheadline || f.ctaText || f.targetAudience);
    }
    case 'pricing':
      return value.fields.tiers.length > 0 || !!value.fields.pricingModelSummary;
    case 'products':
      return value.fields.items.length > 0 || value.fields.sellingPoints.length > 0;
    case 'services':
      return value.fields.items.length > 0 || !!value.fields.companyStory || !!value.fields.differentiators;
  }
}

// ── Newsletter fields ──

const NewsletterFields: React.FC<{
  fields: NewsletterModuleFields;
  onChange: (f: NewsletterModuleFields) => void;
}> = ({ fields, onChange }) => {
  const upd = (partial: Partial<NewsletterModuleFields>) => onChange({ ...fields, ...partial });
  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Headline</label>
        <input type="text" value={fields.headline} onChange={e => upd({ headline: e.target.value })} placeholder="Main newsletter headline" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Subheadline</label>
        <input type="text" value={fields.subheadline} onChange={e => upd({ subheadline: e.target.value })} placeholder="Supporting text" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>CTA Text</label>
        <input type="text" value={fields.ctaText} onChange={e => upd({ ctaText: e.target.value })} placeholder="e.g. Learn More" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Target Audience</label>
        <textarea rows={2} value={fields.targetAudience} onChange={e => upd({ targetAudience: e.target.value })} placeholder="Who is this for?" className={textareaCls} />
      </div>
    </div>
  );
};

// ── Pricing fields ──

const PricingFields: React.FC<{
  fields: PricingModuleFields;
  onChange: (f: PricingModuleFields) => void;
}> = ({ fields, onChange }) => {
  const updateTier = (id: string, partial: Partial<PricingTierField>) => {
    onChange({ ...fields, tiers: fields.tiers.map(t => t.id === id ? { ...t, ...partial } : t) });
  };
  const removeTier = (id: string) => {
    onChange({ ...fields, tiers: fields.tiers.filter(t => t.id !== id) });
  };
  const addTier = () => {
    onChange({ ...fields, tiers: [...fields.tiers, { id: crypto.randomUUID(), name: '', price: '', features: [], featured: false }] });
  };
  const updateFeature = (tierId: string, idx: number, val: string) => {
    const tier = fields.tiers.find(t => t.id === tierId);
    if (!tier) return;
    const features = [...tier.features];
    features[idx] = val;
    updateTier(tierId, { features });
  };
  const addFeature = (tierId: string) => {
    const tier = fields.tiers.find(t => t.id === tierId);
    if (!tier) return;
    updateTier(tierId, { features: [...tier.features, ''] });
  };
  const removeFeature = (tierId: string, idx: number) => {
    const tier = fields.tiers.find(t => t.id === tierId);
    if (!tier) return;
    updateTier(tierId, { features: tier.features.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Pricing Model Summary</label>
        <input type="text" value={fields.pricingModelSummary} onChange={e => onChange({ ...fields, pricingModelSummary: e.target.value })} placeholder="e.g. Monthly subscription tiers" className={inputCls} />
      </div>
      <div>
        <span className={labelCls}>Pricing Tiers</span>
        <div className="mt-1.5 space-y-3">
          {fields.tiers.map(tier => (
            <div key={tier.id} className={cardCls}>
              <div className="flex items-center space-x-2">
                <input type="text" value={tier.name} onChange={e => updateTier(tier.id, { name: e.target.value })} placeholder="Tier name" className={`${inputCls} mt-0 flex-1`} />
                <input type="text" value={tier.price} onChange={e => updateTier(tier.id, { price: e.target.value })} placeholder="$0/mo" className={`${inputCls} mt-0 w-28`} />
                <button onClick={() => updateTier(tier.id, { featured: !tier.featured })} className={`p-1.5 rounded-lg border transition-all ${tier.featured ? 'bg-amber-50 border-amber-300 text-amber-500' : 'border-slate-200 text-slate-300 hover:text-amber-400'}`} title="Featured">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                </button>
                <button onClick={() => removeTier(tier.id)} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all" title="Remove tier">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {/* Features */}
              <div className="pl-1 space-y-1">
                {tier.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center space-x-1.5">
                    <span className="text-[10px] text-slate-300">-</span>
                    <input type="text" value={feat} onChange={e => updateFeature(tier.id, idx, e.target.value)} placeholder="Feature" className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
                    <button onClick={() => removeFeature(tier.id, idx)} className="text-slate-300 hover:text-rose-400 transition-colors">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                <button onClick={() => addFeature(tier.id)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">+ Add Feature</button>
              </div>
            </div>
          ))}
          <button onClick={addTier} className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Tier</button>
        </div>
      </div>
    </div>
  );
};

// ── Products fields ──

const ProductsFields: React.FC<{
  fields: ProductsModuleFields;
  onChange: (f: ProductsModuleFields) => void;
}> = ({ fields, onChange }) => {
  const updateItem = (id: string, partial: Partial<ProductItemField>) => {
    onChange({ ...fields, items: fields.items.map(i => i.id === id ? { ...i, ...partial } : i) });
  };
  const removeItem = (id: string) => {
    onChange({ ...fields, items: fields.items.filter(i => i.id !== id) });
  };
  const addItem = () => {
    onChange({ ...fields, items: [...fields.items, { id: crypto.randomUUID(), name: '', description: '' }] });
  };
  const updateSellingPoint = (idx: number, val: string) => {
    const pts = [...fields.sellingPoints];
    pts[idx] = val;
    onChange({ ...fields, sellingPoints: pts });
  };
  const removeSellingPoint = (idx: number) => {
    onChange({ ...fields, sellingPoints: fields.sellingPoints.filter((_, i) => i !== idx) });
  };
  const addSellingPoint = () => {
    onChange({ ...fields, sellingPoints: [...fields.sellingPoints, ''] });
  };

  return (
    <div className="space-y-3">
      <div>
        <span className={labelCls}>Products</span>
        <div className="mt-1.5 space-y-2">
          {fields.items.map(item => (
            <div key={item.id} className={`${cardCls} flex items-start space-x-2`}>
              <div className="flex-1 space-y-1.5">
                <input type="text" value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} placeholder="Product name" className={`${inputCls} mt-0`} />
                <input type="text" value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Short description" className={`${inputCls} mt-0`} />
              </div>
              <button onClick={() => removeItem(item.id)} className="mt-1 p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all" title="Remove">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          <button onClick={addItem} className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Item</button>
        </div>
      </div>
      <div>
        <span className={labelCls}>Selling Points</span>
        <div className="mt-1.5 space-y-1.5">
          {fields.sellingPoints.map((pt, idx) => (
            <div key={idx} className="flex items-center space-x-1.5">
              <input type="text" value={pt} onChange={e => updateSellingPoint(idx, e.target.value)} placeholder="Selling point" className={`${inputCls} mt-0 flex-1`} />
              <button onClick={() => removeSellingPoint(idx)} className="p-1 text-slate-300 hover:text-rose-400 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          <button onClick={addSellingPoint} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">+ Add Selling Point</button>
        </div>
      </div>
    </div>
  );
};

// ── Services fields ──

const ServicesFields: React.FC<{
  fields: ServicesModuleFields;
  onChange: (f: ServicesModuleFields) => void;
}> = ({ fields, onChange }) => {
  const updateItem = (id: string, partial: Partial<ServiceItemField>) => {
    onChange({ ...fields, items: fields.items.map(i => i.id === id ? { ...i, ...partial } : i) });
  };
  const removeItem = (id: string) => {
    onChange({ ...fields, items: fields.items.filter(i => i.id !== id) });
  };
  const addItem = () => {
    onChange({ ...fields, items: [...fields.items, { id: crypto.randomUUID(), name: '', description: '' }] });
  };

  return (
    <div className="space-y-3">
      <div>
        <span className={labelCls}>Services</span>
        <div className="mt-1.5 space-y-2">
          {fields.items.map(item => (
            <div key={item.id} className={`${cardCls} flex items-start space-x-2`}>
              <div className="flex-1 space-y-1.5">
                <input type="text" value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} placeholder="Service name" className={`${inputCls} mt-0`} />
                <input type="text" value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Short description" className={`${inputCls} mt-0`} />
              </div>
              <button onClick={() => removeItem(item.id)} className="mt-1 p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all" title="Remove">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          <button onClick={addItem} className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Service</button>
        </div>
      </div>
      <div>
        <label className={labelCls}>Company Story</label>
        <textarea rows={2} value={fields.companyStory} onChange={e => onChange({ ...fields, companyStory: e.target.value })} placeholder="Brief company story or background" className={textareaCls} />
      </div>
      <div>
        <label className={labelCls}>Differentiators</label>
        <textarea rows={2} value={fields.differentiators} onChange={e => onChange({ ...fields, differentiators: e.target.value })} placeholder="What sets you apart?" className={textareaCls} />
      </div>
    </div>
  );
};

// ── Main panel ──

const ModuleFieldsPanel: React.FC<ModuleFieldsPanelProps> = ({ value, onChange }) => {
  const [expanded, setExpanded] = useState(true);
  const populated = hasContent(value);

  const MODULE_LABEL: Record<string, string> = {
    newsletter: 'Newsletter',
    pricing: 'Pricing',
    products: 'Products',
    services: 'Services',
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-xs font-bold text-slate-700">{MODULE_LABEL[value.type] || value.type} Details</span>
          {populated && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="p-4 border-t border-slate-100">
          {value.type === 'newsletter' && (
            <NewsletterFields
              fields={value.fields}
              onChange={fields => onChange({ type: 'newsletter', fields })}
            />
          )}
          {value.type === 'pricing' && (
            <PricingFields
              fields={value.fields}
              onChange={fields => onChange({ type: 'pricing', fields })}
            />
          )}
          {value.type === 'products' && (
            <ProductsFields
              fields={value.fields}
              onChange={fields => onChange({ type: 'products', fields })}
            />
          )}
          {value.type === 'services' && (
            <ServicesFields
              fields={value.fields}
              onChange={fields => onChange({ type: 'services', fields })}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ModuleFieldsPanel;
