import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Copy, Trash2, Power } from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import {
  DnaRecord, DnaCategory, DnaModule,
  DNA_CATEGORIES, DNA_MODULES,
  listDna, deleteDna, duplicateDna, toggleDnaActive,
} from '../../../lib/dna';
import { supabase } from '../../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  sales_outreach: 'bg-orange-50 text-orange-700',
  analytics: 'bg-cyan-50 text-cyan-700',
  email: 'bg-blue-50 text-blue-700',
  content: 'bg-purple-50 text-purple-700',
  lead_research: 'bg-emerald-50 text-emerald-700',
  blog: 'bg-pink-50 text-pink-700',
  social: 'bg-yellow-50 text-yellow-700',
  automation: 'bg-red-50 text-red-700',
  strategy: 'bg-indigo-50 text-indigo-700',
  support: 'bg-teal-50 text-teal-700',
  general: 'bg-gray-100 text-gray-600',
};

const DnaRegistryPage: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<DnaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DnaCategory | ''>('');
  const [module, setModule] = useState<DnaModule | ''>('');
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDna({
        category: category || undefined,
        module: module || undefined,
        search: search || undefined,
      });
      setRecords(data);
    } catch (err) {
      console.error('Failed to load DNA registry:', err);
    }
    setLoading(false);
  }, [category, module, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDuplicate = async (id: string) => {
    if (!userId) return;
    try {
      await duplicateDna(id, userId);
      fetchData();
    } catch (err) {
      console.error('Duplicate failed:', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteDna(id);
      fetchData();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await toggleDnaActive(id, !isActive);
      setRecords(prev => prev.map(r => r.id === id ? { ...r, is_active: !isActive } : r));
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const stats = {
    total: records.length,
    active: records.filter(r => r.is_active).length,
    locked: records.filter(r => r.is_locked).length,
  };

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="DNA Registry"
        description="Versioned AI blueprints powering Email, Voice, Blog, Social, and Support modules."
        actions={
          <button
            onClick={() => navigate('/admin/prompts/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={16} /> New Blueprint
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search blueprints..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as DnaCategory | '')}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        >
          <option value="">All Categories</option>
          {DNA_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={module}
          onChange={e => setModule(e.target.value as DnaModule | '')}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        >
          <option value="">All Modules</option>
          {DNA_MODULES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6">
        <span className="text-sm text-gray-500">{stats.total} blueprints</span>
        <span className="text-sm text-emerald-600">{stats.active} active</span>
        <span className="text-sm text-amber-600">{stats.locked} locked</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <Search size={24} className="text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No blueprints found</h3>
          <p className="text-sm text-gray-500 mb-6">Create your first AI blueprint to get started.</p>
          <button
            onClick={() => navigate('/admin/prompts/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} /> New Blueprint
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {records.map(dna => (
            <div
              key={dna.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => navigate(`/admin/prompts/${dna.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{dna.name}</h3>
                  {dna.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{dna.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-3 shrink-0">
                  <div className={`w-2 h-2 rounded-full ${dna.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className="text-[10px] font-bold text-gray-400">v{dna.active_version}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${CATEGORY_COLORS[dna.category] || CATEGORY_COLORS.general}`}>
                  {dna.category.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                  {dna.module}
                </span>
                {dna.is_locked && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">Locked</span>
                )}
              </div>

              {/* Card actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleToggle(dna.id, dna.is_active)}
                  className={`p-1.5 rounded-lg transition-colors ${dna.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}
                  title={dna.is_active ? 'Deactivate' : 'Activate'}
                >
                  <Power size={14} />
                </button>
                <button
                  onClick={() => handleDuplicate(dna.id)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Duplicate"
                >
                  <Copy size={14} />
                </button>
                {!dna.is_locked && (
                  <button
                    onClick={() => handleDelete(dna.id, dna.name)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DnaRegistryPage;
