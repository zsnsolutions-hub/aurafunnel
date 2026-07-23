// AuraEngine/components/campaigns/TemplatePickerModal.tsx
//
// Roadmap 3.3 — pick / create / delete reusable email templates. Opened from a
// sequence step: "Templates" (insert one) or "Save as template" (prefilled create).

import React, { useEffect, useState } from 'react';
import { X, Loader2, Trash2, Plus, Check, FileText } from 'lucide-react';
import {
  listEmailTemplates, createEmailTemplate, deleteEmailTemplate,
  TEMPLATE_CATEGORIES, type EmailTemplate, type TemplateCategory,
} from '../../lib/emailTemplates';
import { useToast } from '../ui/Toast';

interface Props {
  onClose: () => void;
  onUse: (t: EmailTemplate) => void;
  /** When set (via "Save as template"), open straight into the prefilled create form. */
  initialSaveAs?: { subject: string; body: string };
}

const TemplatePickerModal: React.FC<Props> = ({ onClose, onUse, initialSaveAs }) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(!!initialSaveAs);
  const [saving, setSaving] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [subject, setSubject] = useState(initialSaveAs?.subject ?? '');
  const [body, setBody] = useState(initialSaveAs?.body ?? '');

  const load = async () => { setLoading(true); setTemplates(await listEmailTemplates()); setLoading(false); };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!name.trim()) { toast('Give the template a name.', 'error'); return; }
    if (!subject.trim() && !body.trim()) { toast('Add a subject or body.', 'error'); return; }
    setSaving(true);
    const created = await createEmailTemplate({ name, category, subject, body });
    setSaving(false);
    if (!created) { toast('Could not save template.', 'error'); return; }
    toast('Template saved.', 'success');
    setCreating(false);
    setName(''); setCategory('custom'); setSubject(''); setBody('');
    await load();
  };

  const remove = async (t: EmailTemplate) => {
    if (!(await deleteEmailTemplate(t.id))) { toast('Could not delete (system defaults are read-only).', 'error'); return; }
    setTemplates(prev => prev.filter(x => x.id !== t.id));
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><FileText size={18} className="text-indigo-600" /> Email templates</h2>
          <div className="flex items-center gap-2">
            {!creating && (
              <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
                <Plus size={14} /> New
              </button>
            )}
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500"><X size={20} /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-6">
          {creating ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Template name" value={name} onChange={e => setName(e.target.value)} />
                <select className={inputCls} value={category} onChange={e => setCategory(e.target.value as TemplateCategory)}>
                  {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="Subject (supports {{first_name}} etc.)" value={subject} onChange={e => setSubject(e.target.value)} />
              <textarea className={`${inputCls} resize-y`} rows={8} placeholder="Body — use {{first_name}}, {{company}}, {{industry}} merge tokens" value={body} onChange={e => setBody(e.target.value)} />
              <div className="flex items-center gap-2">
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save template
                </button>
                <button onClick={() => { setCreating(false); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : templates.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">No templates yet. Click <b>New</b> to create one.</div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">{t.name}</p>
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.category.replace('_', ' ')}</span>
                      {t.is_default && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">Default</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{t.subject_template || <span className="text-slate-300">no subject</span>}</p>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{t.body_template}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { onUse(t); onClose(); }} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">Use</button>
                    {!t.is_default && t.owner_id && (
                      <button onClick={() => remove(t)} title="Delete" className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplatePickerModal;
