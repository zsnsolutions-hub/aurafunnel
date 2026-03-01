import React, { useState, useEffect, useCallback } from 'react';
import { perfTracker, type PerfEntry } from '../../lib/perfTracker';

const PerfPanel: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [entries, setEntries] = useState<PerfEntry[]>([]);

  // Toggle with Ctrl+Shift+P
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Subscribe to entries
  useEffect(() => {
    if (!visible) return;
    setEntries(perfTracker.getEntries());
    return perfTracker.subscribe(setEntries);
  }, [visible]);

  const handleClear = useCallback(() => perfTracker.clear(), []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        width: 420,
        maxHeight: 360,
        zIndex: 99999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
      }}
      className="bg-slate-900/95 text-slate-200 rounded-xl shadow-2xl border border-slate-700 backdrop-blur-sm flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/80 bg-slate-800/60 shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Perf Panel</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{entries.length} entries</span>
          <button
            onClick={handleClear}
            className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => setVisible(false)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-3 py-6 text-center text-slate-500 text-[10px]">
            No events recorded yet. Queries will appear here.
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700/60">
                <th className="text-left px-2 py-1.5 font-semibold">Label</th>
                <th className="text-left px-2 py-1.5 font-semibold w-14">Type</th>
                <th className="text-right px-2 py-1.5 font-semibold w-16">Time</th>
                <th className="text-right px-2 py-1.5 font-semibold w-10">#</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((e, i) => (
                <tr
                  key={`${e.id}-${e.type}-${i}`}
                  className={`border-b border-slate-800/50 hover:bg-slate-800/50 ${
                    e.type === 'error' ? 'text-rose-400' :
                    e.type === 'retry' ? 'text-amber-400' :
                    e.type === 'abort' ? 'text-slate-500' :
                    (e.elapsed && e.elapsed > 800) ? 'text-amber-300' :
                    'text-slate-300'
                  }`}
                >
                  <td className="px-2 py-1 truncate max-w-[200px]" title={e.label}>
                    {e.label}
                    {e.error && (
                      <span className="ml-1 text-rose-500" title={e.error}>!</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-bold ${
                      e.type === 'success' ? 'bg-emerald-900/50 text-emerald-400' :
                      e.type === 'error' ? 'bg-rose-900/50 text-rose-400' :
                      e.type === 'retry' ? 'bg-amber-900/50 text-amber-400' :
                      e.type === 'abort' ? 'bg-slate-700 text-slate-400' :
                      'bg-blue-900/50 text-blue-400'
                    }`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {e.elapsed != null ? `${e.elapsed.toFixed(0)}ms` : e.delay != null ? `+${e.delay}ms` : '-'}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-500">
                    {e.attempt ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PerfPanel;
