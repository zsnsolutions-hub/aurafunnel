import React, { useEffect, useState, useMemo } from 'react';
import { Plug, Mail, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { getTargetIntegrations, getTargetEmailConfigs, debugIntegration } from '../../../lib/support';

interface IntegrationRow {
  id: string;
  type: string;
  provider?: string;
  is_connected?: boolean;
  source: 'integration' | 'email_config';
}

const IntegrationDebuggerTab: React.FC = () => {
  const { activeSession, logAction } = useSupport();
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Record<string, unknown>>>({});

  const summary = useMemo(() => {
    const connected = rows.filter(r => r.is_connected === true).length;
    const disconnected = rows.filter(r => r.is_connected === false).length;
    return { total: rows.length, connected, disconnected };
  }, [rows]);

  useEffect(() => {
    if (!activeSession) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [integrations, emailConfigs] = await Promise.all([
          getTargetIntegrations(activeSession.target_user_id),
          getTargetEmailConfigs(activeSession.target_user_id),
        ]);

        const mapped: IntegrationRow[] = [
          ...integrations.map((i: Record<string, unknown>) => ({
            id: i.id as string,
            type: i.type as string,
            provider: i.provider as string,
            is_connected: i.is_connected as boolean,
            source: 'integration' as const,
          })),
          ...emailConfigs.map((c: Record<string, unknown>) => ({
            id: c.id as string,
            type: `email_${(c.provider as string) || 'unknown'}`,
            provider: c.provider as string,
            is_connected: true,
            source: 'email_config' as const,
          })),
        ];
        setRows(mapped);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeSession]);

  const handleTest = async (row: IntegrationRow) => {
    if (!activeSession) return;
    setTesting(row.id);
    try {
      const response = await debugIntegration(
        activeSession.target_user_id,
        row.type,
        row.id,
      );
      setResults((prev) => ({ ...prev, [row.id]: response.result ?? response }));
      await logAction('debug_integration_ui', row.type, row.id);
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [row.id]: { status: 'error', message: (err as Error).message },
      }));
    } finally {
      setTesting(null);
    }
  };

  if (!activeSession) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-slate-400 text-sm">No active session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            Total: {summary.total}
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
            Connected: {summary.connected}
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
            Disconnected: {summary.disconnected}
          </span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Integrations & Email Configs</h2>
          <span className="text-xs text-slate-400 font-bold">{rows.length} items</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No integrations found for this user.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Health dot */}
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      row.is_connected === true ? 'bg-emerald-500' :
                      row.is_connected === false ? 'bg-red-500' :
                      'bg-slate-300'
                    }`} />
                    {row.source === 'email_config' ? (
                      <Mail size={18} className="text-blue-500" />
                    ) : (
                      <Plug size={18} className="text-indigo-500" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-900">{row.type}</p>
                      <p className="text-xs text-slate-400">
                        {row.provider && `Provider: ${row.provider}`}
                        {row.is_connected !== undefined && (
                          <span className={`ml-2 ${row.is_connected ? 'text-emerald-500' : 'text-red-400'}`}>
                            {row.is_connected ? 'Connected' : 'Disconnected'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTest(row)}
                    disabled={testing === row.id}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={testing === row.id ? 'animate-spin' : ''} />
                    {testing === row.id ? 'Testing...' : 'Test'}
                  </button>
                </div>

                {/* Result display */}
                {results[row.id] && (
                  <div className="mt-3 bg-slate-50 rounded-xl p-4 text-xs">
                    <div className="flex items-center gap-2 mb-2">
                      {(results[row.id].status as string) === 'error' || (results[row.id].status as string) === 'not_found' ? (
                        <XCircle size={14} className="text-red-500" />
                      ) : (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      )}
                      <span className="font-bold text-slate-700">
                        Status: {results[row.id].status as string}
                      </span>
                    </div>
                    <pre className="text-slate-600 whitespace-pre-wrap break-all font-mono text-[11px]">
                      {JSON.stringify(results[row.id], null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationDebuggerTab;
