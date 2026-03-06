import React, { useState, useEffect } from 'react';
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { DnaVersion, getDnaVersions } from '../../../lib/dna';

interface Props {
  dnaId: string;
  currentVersion: number;
  onRestore: (versionNumber: number) => void;
}

const DnaVersionHistory: React.FC<Props> = ({ dnaId, currentVersion, onRestore }) => {
  const [versions, setVersions] = useState<DnaVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDnaVersions(dnaId)
      .then(data => { if (!cancelled) setVersions(data); })
      .catch(e => console.warn('[DNA] version history load failed:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dnaId, currentVersion]);

  const handleRestore = async (versionNumber: number) => {
    setRestoring(versionNumber);
    try {
      await onRestore(versionNumber);
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (versions.length === 0) {
    return <p className="text-sm text-gray-400 italic">No version history available.</p>;
  }

  return (
    <div className="space-y-2">
      {versions.map(v => {
        const isCurrent = v.version_number === currentVersion;
        const isExpanded = expanded === v.id;

        return (
          <div key={v.id} className={`border rounded-xl transition-colors ${isCurrent ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-200 bg-white'}`}>
            <button
              onClick={() => setExpanded(isExpanded ? null : v.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">v{v.version_number}</span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md uppercase">Current</span>
                    )}
                  </div>
                  {v.change_note && (
                    <p className="text-xs text-gray-500 mt-0.5">{v.change_note}</p>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-gray-400">
                {new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                {v.system_prompt && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">System Prompt</p>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{v.system_prompt}</pre>
                  </div>
                )}
                {v.prompt_template && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Prompt Template</p>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{v.prompt_template}</pre>
                  </div>
                )}
                {!isCurrent && (
                  <button
                    onClick={() => handleRestore(v.version_number)}
                    disabled={restoring === v.version_number}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    <RotateCcw size={13} />
                    {restoring === v.version_number ? 'Restoring...' : 'Restore this version'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DnaVersionHistory;
