// AuraEngine/pages/portal/DiscoverPage.tsx
//
// Roadmap 1.4 — Lead discovery (People Data Labs). Collects a few filters, runs
// the pdl-search edge function (metered as 'lead_discovery'), shows normalized
// prospects, and imports the selected ones into the current workspace/business
// via importProspects → import_leads_batch. Gated: if PDL isn't configured the
// page shows a setup state instead of erroring.

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import { Loader2, ArrowLeft, Search, Sparkles, Users, Download, AlertTriangle } from 'lucide-react';
import type { User } from '../../types';
import { searchProspects, importProspects, PDL_COMPANY_SIZES, type DiscoveredPerson } from '../../lib/discovery';
import { consumeCredits, resolvePlanName } from '../../lib/credits';
import { getOperationCost } from '../../config/aiCreditCosts';
import { resolveWorkspaceId } from '../../lib/tenancy';
import { activeBusinessId } from '../../lib/businessScope';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/ui/Toast';

const COST = getOperationCost('lead_discovery');
const splitCsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

const DiscoverPage: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [titles, setTitles] = useState('');
  const [keywords, setKeywords] = useState('');
  const [industries, setIndustries] = useState('');
  const [locations, setLocations] = useState('');
  const [sizes, setSizes] = useState<Set<string>>(new Set());
  const [requireEmail, setRequireEmail] = useState(true);
  const [count, setCount] = useState(25);

  const [searching, setSearching] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [results, setResults] = useState<DiscoveredPerson[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const toggleSize = (s: string) => setSizes(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const hasFilter = titles.trim() || keywords.trim() || industries.trim() || locations.trim() || sizes.size > 0;

  const runSearch = useCallback(async () => {
    if (!hasFilter) { toast('Add at least one filter to search.', 'error'); return; }
    setSearching(true); setResults(null); setSelected(new Set()); setNotConfigured(false);
    try {
      const credit = await consumeCredits(supabase, 'lead_discovery');
      if (!credit.success) { toast(credit.message || 'Insufficient credits.', 'error'); return; }
      const res = await searchProspects({
        titles: splitCsv(titles),
        keywords: keywords.trim() || undefined,
        industries: splitCsv(industries),
        locations: splitCsv(locations),
        company_sizes: Array.from(sizes),
        require_email: requireEmail,
        size: count,
      });
      if (res.notConfigured) { setNotConfigured(true); return; }
      setResults(res.people);
      setSelected(new Set(res.people.map(p => p.pdl_id)));
      if (res.people.length === 0) toast('No prospects matched — try broadening your filters.', 'info');
      else toast(`Found ${res.people.length} prospect${res.people.length === 1 ? '' : 's'}.`, 'success');
    } catch (e) {
      toast((e as Error).message || 'Discovery failed', 'error');
    } finally { setSearching(false); }
  }, [hasFilter, titles, keywords, industries, locations, sizes, requireEmail, count, toast]);

  const importSelected = useCallback(async () => {
    if (!results) return;
    const chosen = results.filter(p => selected.has(p.pdl_id));
    if (chosen.length === 0) { toast('Select at least one prospect to import.', 'error'); return; }
    setImporting(true);
    try {
      const workspaceId = await resolveWorkspaceId(user.id);
      if (!workspaceId) throw new Error('No workspace found for this account.');
      const result = await importProspects(chosen, {
        workspaceId,
        businessId: activeBusinessId() ?? undefined,
        planName: resolvePlanName(user.plan || 'Free'),
      });
      const parts = [`imported ${result.imported_count}`, result.skipped_count ? `skipped ${result.skipped_count} (duplicate/limit)` : ''].filter(Boolean).join(', ');
      toast(`Discovery import: ${parts}.`, 'success');
      navigate('/portal/leads');
    } catch (e) {
      toast((e as Error).message || 'Import failed', 'error');
    } finally { setImporting(false); }
  }, [results, selected, user, navigate, toast]);

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button onClick={() => navigate('/portal/leads')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={15} /> Leads
      </button>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Sparkles size={22} className="text-indigo-600" /> Discover leads</h1>
          <p className="text-sm text-gray-500 mt-1">Find new prospects by role, industry and location, then import the ones you want.</p>
        </div>
      </div>

      {notConfigured && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-bold">Lead discovery isn’t set up yet</p>
            <p>The data provider key (<code>PDL_API_KEY</code>) hasn’t been configured. An admin needs to add it in Supabase secrets before discovery can run.</p>
          </div>
        </div>
      )}

      {/* Search form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Job titles (comma-separated)</label>
            <input className={inputCls} value={titles} onChange={e => setTitles(e.target.value)} placeholder="VP Sales, Head of Marketing" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Keywords</label>
            <input className={inputCls} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="growth, demand gen" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Industries (comma-separated)</label>
            <input className={inputCls} value={industries} onChange={e => setIndustries(e.target.value)} placeholder="computer software, marketing" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Locations (comma-separated)</label>
            <input className={inputCls} value={locations} onChange={e => setLocations(e.target.value)} placeholder="united states, london" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company size</label>
          <div className="flex flex-wrap gap-1.5">
            {PDL_COMPANY_SIZES.map(s => (
              <button key={s} type="button" onClick={() => toggleSize(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${sizes.has(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input type="checkbox" checked={requireEmail} onChange={e => setRequireEmail(e.target.checked)} className="rounded" />
              Only with a work email
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              Results
              <select value={count} onChange={e => setCount(Number(e.target.value))} className="px-2 py-1 border border-gray-200 rounded-lg text-xs">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <button onClick={runSearch} disabled={searching || !hasFilter}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {searching ? 'Searching…' : `Search · ${COST} cr`}
          </button>
        </div>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Users size={16} className="text-indigo-600" /> {results.length} prospects · {selected.size} selected
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map(p => p.pdl_id)))}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                {selected.size === results.length ? 'Deselect all' : 'Select all'}
              </button>
              <button onClick={importSelected} disabled={importing || selected.size === 0}
                className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Import {selected.size || ''}
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
            {results.map(p => (
              <label key={p.pdl_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(p.pdl_id)} onChange={() => toggleSelect(p.pdl_id)} className="rounded flex-shrink-0" />
                <div className="min-w-0 flex-1 grid sm:grid-cols-3 gap-x-4 gap-y-0.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.full_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500 truncate">{p.title || '—'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">{p.company || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">{[p.industry, p.company_size].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 truncate">{p.email || <span className="text-gray-300">no email</span>}</p>
                    <p className="text-xs text-gray-400 truncate">{p.location || '—'}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {results && results.length === 0 && !searching && (
        <div className="text-center text-sm text-gray-400 py-12">No prospects matched. Try broadening your filters.</div>
      )}
    </div>
  );
};

export default DiscoverPage;
