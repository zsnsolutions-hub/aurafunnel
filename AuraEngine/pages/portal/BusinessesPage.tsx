// AuraEngine/pages/portal/BusinessesPage.tsx
//
// Businesses management (Growth Platform v2, Phase A). Create, edit, switch, and
// archive the businesses in the current workspace. Reachable from the sidebar
// business switcher ("Manage businesses"). Uses the BusinessProvider context so
// it stays in sync with the switcher.

import React, { useState, useCallback } from 'react';
import { Building2, Plus, Check, Pencil, Archive, Globe, Loader2, X } from 'lucide-react';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { createBusiness, updateBusiness, archiveBusiness, Business, NewBusinessInput } from '../../lib/businesses';
import { useToast } from '../../components/ui/Toast';

type Draft = NewBusinessInput & { id?: string };

const EMPTY: Draft = { name: '', website: '', industry: '', description: '', defaultTone: '' };

const BusinessesPage: React.FC = () => {
  const { businesses, currentBusinessId, setCurrentBusiness, refresh, multiBusinessEnabled } = useCurrentBusiness();
  const { toast } = useToast();
  const [editor, setEditor] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = useCallback(() => setEditor({ ...EMPTY }), []);
  const openEdit = useCallback((b: Business) => setEditor({
    id: b.id, name: b.name, website: b.website ?? '', industry: b.industry ?? '',
    description: b.description ?? '', defaultTone: b.default_tone ?? '',
  }), []);

  const save = useCallback(async () => {
    if (!editor || !editor.name.trim()) return;
    setBusy(true);
    try {
      if (editor.id) {
        await updateBusiness(editor.id, {
          name: editor.name.trim(),
          website: editor.website?.trim() || null,
          industry: editor.industry?.trim() || null,
          description: editor.description?.trim() || null,
          default_tone: editor.defaultTone?.trim() || null,
        });
        toast('Business updated', 'success');
      } else {
        const id = await createBusiness({
          name: editor.name.trim(),
          website: editor.website?.trim() || null,
          industry: editor.industry?.trim() || null,
          description: editor.description?.trim() || null,
          defaultTone: editor.defaultTone?.trim() || null,
        });
        await refresh();
        if (id) setCurrentBusiness(id);
        toast('Business created', 'success');
      }
      await refresh();
      setEditor(null);
    } catch (e) {
      toast((e as Error).message || 'Something went wrong', 'error');
    } finally { setBusy(false); }
  }, [editor, refresh, setCurrentBusiness, toast]);

  const onArchive = useCallback(async (b: Business) => {
    if (businesses.length <= 1) { toast('You need at least one active business.', 'error'); return; }
    if (!window.confirm(`Archive "${b.name}"? Its data is kept and it can be restored later.`)) return;
    try {
      await archiveBusiness(b.id);
      if (currentBusinessId === b.id) {
        const next = businesses.find(x => x.id !== b.id);
        if (next) setCurrentBusiness(next.id);
      }
      await refresh();
      toast('Business archived', 'success');
    } catch (e) {
      toast((e as Error).message || 'Could not archive', 'error');
    }
  }, [businesses, currentBusinessId, setCurrentBusiness, refresh, toast]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={22} className="text-indigo-600" /> Businesses
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage the brands in this workspace. Each keeps its own leads, content, and settings.</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shrink-0">
          <Plus size={16} /> New business
        </button>
      </div>

      {!multiBusinessEnabled && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Multi-business is not yet enabled for this workspace — switching won't filter your data until it's turned on. You can still set up your brands here.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {businesses.map(b => {
          const isCurrent = b.id === currentBusinessId;
          return (
            <div key={b.id} className={`rounded-2xl border p-5 bg-white transition-shadow ${isCurrent ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-gray-200 hover:shadow-sm'}`}>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold shrink-0">
                  {b.name.charAt(0).toUpperCase() || 'B'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">{b.name}</h3>
                    {isCurrent && <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Current</span>}
                  </div>
                  {b.industry && <p className="text-xs text-gray-500 mt-0.5 truncate">{b.industry}</p>}
                  {b.website && (
                    <a href={b.website.startsWith('http') ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1">
                      <Globe size={12} /> {b.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
              {b.description && <p className="text-sm text-gray-600 mt-3 line-clamp-2">{b.description}</p>}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check size={14} /> Active</span>
                ) : (
                  <button onClick={() => setCurrentBusiness(b.id)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Switch to</button>
                )}
                <div className="flex-1" />
                <button onClick={() => openEdit(b)} title="Edit" className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                <button onClick={() => onArchive(b)} title="Archive" className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Archive size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setEditor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editor.id ? 'Edit business' : 'New business'}</h2>
              <button onClick={() => setEditor(null)} disabled={busy} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {([
                ['name', 'Name', 'Acme Inc.'],
                ['website', 'Website', 'acme.com'],
                ['industry', 'Industry', 'SaaS'],
                ['defaultTone', 'Default tone', 'Professional'],
              ] as const).map(([key, label, ph]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{key === 'name' && ' *'}</label>
                  <input value={(editor[key] as string) ?? ''} onChange={e => setEditor(d => d && { ...d, [key]: e.target.value })}
                    placeholder={ph} disabled={busy}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <textarea value={editor.description ?? ''} onChange={e => setEditor(d => d && { ...d, description: e.target.value })}
                  rows={2} disabled={busy}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditor(null)} disabled={busy} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={busy || !editor.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />} {editor.id ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessesPage;
