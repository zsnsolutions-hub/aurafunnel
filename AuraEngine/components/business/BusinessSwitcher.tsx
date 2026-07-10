// AuraEngine/components/business/BusinessSwitcher.tsx
//
// Sidebar business switcher (Growth Platform v2, Phase A). Renders nothing until
// the `multi_business` flag is on, so it's invisible in production until we're
// ready. Lets the user switch the current business and create a new one inline.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Building2, ChevronsUpDown, Plus, Check, Loader2 } from 'lucide-react';
import { useCurrentBusiness } from './BusinessProvider';
import { createBusiness } from '../../lib/businesses';

export const BusinessSwitcher: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const { businesses, currentBusiness, currentBusinessId, setCurrentBusiness, multiBusinessEnabled, refresh } = useCurrentBusiness();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false); setErr(null); }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true); setErr(null);
    try {
      const id = await createBusiness({ name });
      await refresh();
      if (id) setCurrentBusiness(id);
      setNewName(''); setCreating(false); setOpen(false);
    } catch (e) {
      setErr((e as Error).message || 'Could not create business.');
    } finally { setBusy(false); }
  }, [newName, refresh, setCurrentBusiness]);

  // Dark until the flag is on (and until a current business exists).
  if (!multiBusinessEnabled || !currentBusiness) return null;

  const initial = currentBusiness.name.charAt(0).toUpperCase() || 'B';

  const dropdown = open && (
    <div className="absolute bottom-full mb-2 left-0 w-60 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
      <div className="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Businesses</div>
      <div className="max-h-56 overflow-y-auto py-1">
        {businesses.map(b => (
          <button key={b.id} onClick={() => { setCurrentBusiness(b.id); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
              {b.name.charAt(0).toUpperCase() || 'B'}
            </span>
            <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{b.name}</span>
            {b.id === currentBusinessId && <Check size={15} className="text-indigo-600 shrink-0" />}
          </button>
        ))}
      </div>
      <div className="border-t border-gray-100 p-1.5">
        {creating ? (
          <div className="p-1.5">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
              placeholder="Business name" disabled={busy}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
            <div className="flex gap-1.5 mt-2">
              <button onClick={() => void handleCreate()} disabled={busy || !newName.trim()}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
              </button>
              <button onClick={() => { setCreating(false); setErr(null); }} disabled={busy}
                className="px-2 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            <Plus size={15} /> New business
          </button>
        )}
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <div className="relative" ref={ref}>
        <button onClick={() => setOpen(o => !o)} title={currentBusiness.name}
          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-indigo-600 font-bold text-sm hover:border-indigo-300 transition-colors">
          {initial}
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div className="relative mb-3" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 transition-colors">
        <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold shrink-0">{initial}</span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest leading-tight">Business</span>
          <span className="block text-sm font-semibold text-gray-900 truncate leading-tight">{currentBusiness.name}</span>
        </span>
        <Building2 size={14} className="text-gray-300 shrink-0" />
        <ChevronsUpDown size={14} className="text-gray-400 shrink-0" />
      </button>
      {dropdown}
    </div>
  );
};

export default BusinessSwitcher;
