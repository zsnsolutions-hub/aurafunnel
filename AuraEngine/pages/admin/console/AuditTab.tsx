import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Props { adminId: string }

interface AuditRow {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: { email?: string; name?: string } | null;
}

const ACTION_CATEGORIES = [
  { value: '', label: 'All Actions' },
  { value: 'user', label: 'User Management' },
  { value: 'config', label: 'Configuration' },
  { value: 'data', label: 'Data Operations' },
  { value: 'security', label: 'Security' },
  { value: 'dna', label: 'DNA Registry' },
  { value: 'AI', label: 'AI Operations' },
  { value: 'PAYMENT', label: 'Payments' },
  { value: 'AUTOMATION', label: 'Automation' },
];

const AuditTab: React.FC<Props> = ({ adminId }) => {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*, profiles(email, name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (categoryFilter) {
      query = query.ilike('action', `%${categoryFilter}%`);
    }

    const { data } = await query;
    setLogs((data ?? []) as AuditRow[]);
    setLoading(false);
  }, [limit, categoryFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.action?.toLowerCase().includes(q) ||
      l.entity_type?.toLowerCase().includes(q) ||
      l.entity_id?.toLowerCase().includes(q) ||
      l.profiles?.email?.toLowerCase().includes(q) ||
      l.profiles?.name?.toLowerCase().includes(q)
    );
  });

  const exportCsv = () => {
    const rows = [['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Details']];
    for (const l of filtered) {
      rows.push([
        l.created_at,
        l.profiles?.email || l.user_id,
        l.action,
        l.entity_type || '',
        l.entity_id || '',
        l.details ? JSON.stringify(l.details) : '',
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getActionColor = (action: string): string => {
    if (action.includes('FAIL') || action.includes('ERROR') || action.includes('suspend')) return 'bg-red-50 text-red-700';
    if (action.includes('SUCCESS') || action.includes('create') || action.includes('grant')) return 'bg-emerald-50 text-emerald-700';
    if (action.includes('security') || action.includes('session')) return 'bg-amber-50 text-amber-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search actions, users, entities..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl"
        >
          {ACTION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl"
        >
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={250}>Last 250</option>
          <option value={500}>Last 500</option>
        </select>
        <button onClick={fetchLogs} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          <Download size={14} /> Export CSV
        </button>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} entries</p>

      {/* Log table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 italic p-6">No audit logs found.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(l => {
              const isExpanded = expandedId === l.id;
              return (
                <div key={l.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : l.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50/50 transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                    <span className="text-[10px] text-gray-400 w-32 shrink-0">
                      {new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="text-xs text-gray-500 w-40 truncate shrink-0">{l.profiles?.email || l.user_id?.slice(0, 8) || 'system'}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md whitespace-nowrap ${getActionColor(l.action)}`}>
                      {l.action}
                    </span>
                    {l.entity_type && <span className="text-[10px] text-gray-400 ml-auto">{l.entity_type}{l.entity_id ? `:${l.entity_id.slice(0, 8)}` : ''}</span>}
                  </button>
                  {isExpanded && l.details && (
                    <div className="px-4 pb-4 pl-12">
                      <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {JSON.stringify(l.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditTab;
