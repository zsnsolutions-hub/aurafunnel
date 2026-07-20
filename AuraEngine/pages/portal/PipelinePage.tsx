// AuraEngine/pages/portal/PipelinePage.tsx
//
// Cross-lead sales pipeline board + forecast. Every deal in the active business
// (deals table), grouped into stage columns with a weighted forecast summary.
// Move a deal by dragging its card between stage columns (or the per-card stage
// select); click a deal's lead to open the lead.
// Scoped to the current business via BusinessProvider (RLS already scopes to the
// workspace). Deterministic — no AI.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Loader2, Plus, TrendingUp, DollarSign, Trophy, Percent, X, Trash2, ArrowUpRight } from 'lucide-react';
import type { User } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { useToast } from '../../components/ui/Toast';
import {
  listDeals, createDeal, setDealStage, deleteDeal, computeForecast,
  DEAL_STAGES, type DealWithLead, type DealStage,
} from '../../lib/deals';

interface LayoutContext { user: User }

const STAGE_META: Record<DealStage, { label: string; dot: string; head: string }> = {
  discovery:   { label: 'Discovery',   dot: 'bg-slate-400',   head: 'text-slate-600' },
  qualified:   { label: 'Qualified',   dot: 'bg-sky-500',     head: 'text-sky-700' },
  proposal:    { label: 'Proposal',    dot: 'bg-indigo-500',  head: 'text-indigo-700' },
  negotiation: { label: 'Negotiation', dot: 'bg-amber-500',   head: 'text-amber-700' },
  won:         { label: 'Won',         dot: 'bg-emerald-500', head: 'text-emerald-700' },
  lost:        { label: 'Lost',        dot: 'bg-rose-400',    head: 'text-rose-600' },
};
const COLUMN_ORDER: DealStage[] = ['discovery', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const PipelinePage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const { currentBusinessId, multiBusinessEnabled } = useCurrentBusiness();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [deals, setDeals] = useState<DealWithLead[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState<DealStage>('discovery');
  const [saving, setSaving] = useState(false);

  // Drag-and-drop (native HTML5). The <select> on each card stays as the
  // keyboard/touch-accessible fallback.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);

  const bizId = multiBusinessEnabled ? currentBusinessId : null;

  const load = useCallback(async () => {
    setLoading(true);
    try { setDeals(await listDeals(bizId)); }
    finally { setLoading(false); }
  }, [bizId]);

  useEffect(() => { void load(); }, [load]);

  const forecast = useMemo(() => computeForecast(deals), [deals]);
  const byStage = useMemo(() => {
    const m: Record<DealStage, DealWithLead[]> = { discovery: [], qualified: [], proposal: [], negotiation: [], won: [], lost: [] };
    for (const d of deals) (m[d.stage] ?? m.discovery).push(d);
    return m;
  }, [deals]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const amount = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    const saved = await createDeal(user.id, { title: title.trim(), valueAmount: amount, stage, businessId: bizId });
    setSaving(false);
    if (!saved) { toast('Could not create deal', 'error'); return; }
    setCreateOpen(false); setTitle(''); setValue(''); setStage('discovery');
    await load();
  };

  const handleMove = async (id: string, next: DealStage) => {
    const prev = deals;
    setDeals(p => p.map(d => d.id === id ? { ...d, stage: next } : d)); // optimistic
    const saved = await setDealStage(id, next);
    if (saved) setDeals(p => p.map(d => d.id === id ? { ...saved, leadName: d.leadName, leadCompany: d.leadCompany } : d));
    else { setDeals(prev); toast('Could not move deal', 'error'); }
  };

  const handleDelete = async (id: string) => {
    const prev = deals;
    setDeals(p => p.filter(d => d.id !== id)); // optimistic
    if (!(await deleteDeal(id))) { setDeals(prev); toast('Could not delete deal', 'error'); }
  };

  const handleDropOn = (col: DealStage) => {
    const id = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    if (!id) return;
    const dragged = deals.find(d => d.id === id);
    if (dragged && dragged.stage !== col) void handleMove(id, col);
  };

  const cards: { label: string; value: string; icon: React.ReactNode; tint: string }[] = [
    { label: 'Open pipeline', value: money(forecast.openValue), icon: <DollarSign size={16} />, tint: 'text-slate-700 bg-slate-100' },
    { label: 'Weighted forecast', value: money(forecast.weightedValue), icon: <TrendingUp size={16} />, tint: 'text-indigo-700 bg-indigo-100' },
    { label: 'Won', value: money(forecast.wonValue), icon: <Trophy size={16} />, tint: 'text-emerald-700 bg-emerald-100' },
    { label: 'Win rate', value: `${Math.round(forecast.winRate * 100)}%`, icon: <Percent size={16} />, tint: 'text-amber-700 bg-amber-100' },
  ];

  return (
    <div className="pb-10">
      <PageHeader
        title="Deals"
        description={`${forecast.openCount} open · ${money(forecast.openValue)} in pipeline`}
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New deal</span>
          </button>
        }
      />

      {/* Forecast summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${c.tint}`}>{c.icon}</div>
            <p className="text-2xl font-black text-slate-900 tabular-nums">{c.value}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading pipeline…
        </div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 border-dashed rounded-2xl">
          <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700 mb-1">No deals yet</p>
          <p className="text-xs text-slate-400 mb-4">Create a deal to start tracking value and forecast — or add one from a lead's profile.</p>
          <button onClick={() => setCreateOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">New deal</button>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {COLUMN_ORDER.map(col => {
              const items = byStage[col];
              const colValue = items.reduce((s, d) => s + d.valueAmount, 0);
              const meta = STAGE_META[col];
              const isDropTarget = dragOverStage === col && draggingId !== null;
              return (
                <div
                  key={col}
                  onDragOver={e => { if (draggingId) { e.preventDefault(); if (dragOverStage !== col) setDragOverStage(col); } }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(s => (s === col ? null : s)); }}
                  onDrop={e => { e.preventDefault(); handleDropOn(col); }}
                  className={`w-72 flex-shrink-0 rounded-2xl transition-colors ${isDropTarget ? 'bg-indigo-50/70 ring-2 ring-indigo-200' : ''}`}
                >
                  <div className="flex items-center justify-between px-1 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      <span className={`text-xs font-bold ${meta.head}`}>{meta.label}</span>
                      <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">{money(colValue)}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(d => (
                      <div
                        key={d.id}
                        draggable
                        onDragStart={e => { setDraggingId(d.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.id); }}
                        onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                        className={`group bg-white border border-slate-200 rounded-xl p-3 hover:border-indigo-200 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${draggingId === d.id ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold ${col === 'lost' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{d.title}</p>
                          <button onClick={() => handleDelete(d.id)} title="Delete deal" className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm font-black text-slate-900 tabular-nums mt-0.5">{money(d.valueAmount)}<span className="text-[10px] font-semibold text-slate-400"> · {d.probability}%</span></p>
                        {d.leadId && (
                          <button onClick={() => navigate(`/portal/leads/${d.leadId}`)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 mt-1">
                            {d.leadName || d.leadCompany || 'View lead'} <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                        {d.expectedCloseDate && (
                          <p className="text-[10px] text-slate-400 mt-1">Close {new Date(d.expectedCloseDate).toLocaleDateString()}</p>
                        )}
                        <select
                          value={d.stage}
                          onChange={e => handleMove(d.id, e.target.value as DealStage)}
                          className="mt-2 w-full text-[11px] font-bold rounded-lg px-2 py-1.5 border border-slate-200 bg-slate-50 text-slate-600 outline-none cursor-pointer focus:border-indigo-300"
                        >
                          {DEAL_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-[10px] text-slate-300 text-center py-6 border border-dashed border-slate-100 rounded-xl">Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create deal modal */}
      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !saving && setCreateOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">New deal</h3>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Deal name</label>
                <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="e.g. Acme — Annual plan" autoFocus
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Value ($)</label>
                  <input value={value} onChange={e => setValue(e.target.value)} placeholder="12000"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Stage</label>
                  <select value={stage} onChange={e => setStage(e.target.value as DealStage)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300">
                    {DEAL_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">Tip: to link a deal to a specific lead, create it from that lead's profile → Deals tab.</p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setCreateOpen(false)} disabled={saving} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 disabled:opacity-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !title.trim()} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Creating…' : 'Create deal'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelinePage;
