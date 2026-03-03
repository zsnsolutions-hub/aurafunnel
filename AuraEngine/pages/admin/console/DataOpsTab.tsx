import React, { useState, useCallback } from 'react';
import { Search, Play, RefreshCw, CheckCircle, XCircle, Clock, Database } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { executeEdgeFn, executeRpc, ActionResult } from '../../../lib/adminActions';
import { logDataOp } from '../../../lib/auditLogger';

interface Props { adminId: string }

interface WorkspaceProfile {
  id: string;
  email: string;
  name: string;
  plan: string;
  status: string;
}

interface ActionLog {
  label: string;
  result: ActionResult;
  timestamp: Date;
}

const REPAIR_ACTIONS = [
  { key: 'kick_writing_queue', label: 'Kick Email Writing Queue', fn: 'process-email-writing-queue', type: 'edge' as const },
  { key: 'kick_scheduled', label: 'Process Scheduled Emails', fn: 'process-scheduled-emails', type: 'edge' as const },
  { key: 'kick_social', label: 'Run Social Scheduler', fn: 'social-run-scheduler', type: 'edge' as const },
  { key: 'refresh_analytics', label: 'Refresh Email Analytics', fn: 'refresh_email_analytics', type: 'rpc' as const },
  { key: 'reset_stuck', label: 'Reset Stuck Writing Items', fn: 'reset_stuck_writing_items', type: 'rpc' as const },
];

const DataOpsTab: React.FC<Props> = ({ adminId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceProfile | null>(null);
  const [searchResults, setSearchResults] = useState<WorkspaceProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);

  // Workspace data
  const [wsData, setWsData] = useState<{
    pendingEmails: number;
    failedEmails: number;
    totalMessages: number;
    imports: number;
    integrations: number;
  } | null>(null);

  const searchWorkspaces = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, plan, status')
      .or(`email.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`)
      .limit(10);
    setSearchResults((data ?? []) as WorkspaceProfile[]);
    setSearching(false);
  }, [searchQuery]);

  const selectWorkspace = async (ws: WorkspaceProfile) => {
    setWorkspace(ws);
    setSearchResults([]);

    const [pending, failed, messages, imports, integrations] = await Promise.all([
      supabase.from('scheduled_emails').select('id', { count: 'exact', head: true }).eq('owner_id', ws.id).eq('status', 'pending'),
      supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('owner_id', ws.id).eq('status', 'failed'),
      supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('owner_id', ws.id),
      supabase.from('import_batches').select('id', { count: 'exact', head: true }).eq('user_id', ws.id),
      supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('owner_id', ws.id),
    ]);

    setWsData({
      pendingEmails: pending.count ?? 0,
      failedEmails: failed.count ?? 0,
      totalMessages: messages.count ?? 0,
      imports: imports.count ?? 0,
      integrations: integrations.count ?? 0,
    });
  };

  const runAction = async (action: typeof REPAIR_ACTIONS[number]) => {
    setRunning(action.key);
    let result: ActionResult;

    if (action.type === 'edge') {
      result = await executeEdgeFn(adminId, action.fn, {}, action.label);
    } else {
      result = await executeRpc(adminId, action.fn, {}, action.label);
    }

    await logDataOp(adminId, 'data.repair_action' as any, { action: action.key, result: result.success });
    setActionLogs(prev => [{ label: action.label, result, timestamp: new Date() }, ...prev]);
    setRunning(null);
  };

  return (
    <div className="space-y-6">
      {/* Workspace search */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Workspace Investigation</h3>
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchWorkspaces()}
              placeholder="Search by email or name..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl"
            />
          </div>
          <button onClick={searchWorkspaces} disabled={searching} className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-xl divide-y divide-gray-100">
            {searchResults.map(r => (
              <button
                key={r.id}
                onClick={() => selectWorkspace(r)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.name || r.email}</p>
                  <p className="text-xs text-gray-400">{r.email}</p>
                </div>
                <span className="text-[10px] font-bold uppercase text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">{r.plan || 'free'}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected workspace data */}
        {workspace && wsData && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{workspace.name || workspace.email}</p>
                <p className="text-xs text-gray-400">{workspace.email} &middot; {workspace.plan} &middot; {workspace.status}</p>
              </div>
              <button onClick={() => { setWorkspace(null); setWsData(null); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Pending Emails', value: wsData.pendingEmails },
                { label: 'Failed Emails', value: wsData.failedEmails },
                { label: 'Total Messages', value: wsData.totalMessages },
                { label: 'Import Batches', value: wsData.imports },
                { label: 'Integrations', value: wsData.integrations },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                  <p className="text-[10px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Repair actions */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Repair & Maintenance Actions</h3>
        <p className="text-xs text-gray-400 mb-4">Run system maintenance tasks. Each action is audited.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPAIR_ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => runAction(a)}
              disabled={running === a.key}
              className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              {running === a.key ? (
                <RefreshCw size={16} className="animate-spin text-indigo-600 shrink-0" />
              ) : (
                <Play size={16} className="text-gray-400 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{a.label}</p>
                <p className="text-[10px] text-gray-400 font-mono">{a.fn}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Action log */}
      {actionLogs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Action Results</h3>
          <div className="space-y-2">
            {actionLogs.map((log, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${log.result.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                {log.result.success ? <CheckCircle size={16} className="text-emerald-600 shrink-0" /> : <XCircle size={16} className="text-red-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{log.label}</p>
                  <p className="text-xs text-gray-500 truncate">{log.result.message}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-mono text-gray-400">{log.result.requestId}</p>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1"><Clock size={10} /> {log.result.durationMs}ms</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataOpsTab;
