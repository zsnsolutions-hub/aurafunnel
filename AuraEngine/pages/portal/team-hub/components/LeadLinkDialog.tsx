import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, UserCircle, AlertCircle, Link2 } from 'lucide-react';
import * as api from '../teamHubApi';

interface LeadLinkDialogProps {
  itemId: string;
  flowId: string;
  onLinked: (link: api.ItemLeadLink) => void;
  onClose: () => void;
}

const LeadLinkDialog: React.FC<LeadLinkDialogProps> = ({ itemId, flowId, onLinked, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.searchLeadsForLinking>>>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const data = await api.searchLeadsForLinking(query.trim());
        setResults(data);
      } catch {
        setError('Failed to search leads');
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleLink = async (leadId: string) => {
    setLinking(true);
    setError('');
    try {
      const link = await api.linkItemToLead(itemId, leadId, flowId);
      onLinked(link);
    } catch (err: any) {
      setError(err.message || 'Failed to link lead');
      setLinking(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-800">Link to Lead</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search leads by name, email, or company..."
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
              />
              {searching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto">
            {!query.trim() ? (
              <div className="px-5 py-8 text-center">
                <UserCircle size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Type to search for leads</p>
              </div>
            ) : results.length === 0 && !searching ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xs text-slate-400 font-medium">No leads found</p>
              </div>
            ) : (
              <div className="py-1">
                {results.map(lead => (
                  <button
                    key={lead.id}
                    disabled={lead.already_linked || linking}
                    onClick={() => handleLink(lead.id)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                      lead.already_linked
                        ? 'opacity-50 cursor-not-allowed bg-slate-50'
                        : 'hover:bg-indigo-50 cursor-pointer'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <UserCircle size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {lead.name || lead.email}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {lead.company && `${lead.company} · `}{lead.email}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        lead.status === 'New' ? 'bg-slate-100 text-slate-600' :
                        lead.status === 'Contacted' ? 'bg-blue-100 text-blue-600' :
                        lead.status === 'Qualified' ? 'bg-amber-100 text-amber-700' :
                        lead.status === 'Converted' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {lead.status}
                      </span>
                      {lead.already_linked && (
                        <span className="text-[9px] font-semibold text-amber-500">Already linked</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-[10px] text-slate-400 font-medium">
              Each lead can only be linked to one active item at a time.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeadLinkDialog;
