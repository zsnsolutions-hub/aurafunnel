import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LockIcon, ShieldIcon, RefreshIcon, UsersIcon } from '../../components/Icons';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*, profiles(email)')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (data) setLogs(data);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = logs.filter(l => filter === 'ALL' || l.action.includes(filter));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Forensic Audit Vault</h1>
          <p className="text-slate-500 mt-1 flex items-center space-x-2">
            <ShieldIcon className="w-4 h-4 text-indigo-500" />
            <span>Immutable system-wide event stream for compliance auditing.</span>
          </p>
        </div>
        <button onClick={fetchLogs} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
           <RefreshIcon className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="flex space-x-2 bg-white p-1.5 rounded-2xl border border-slate-200 w-fit shadow-sm">
        {['ALL', 'AI', 'PAYMENT', 'USER'].map(f => (
          <button 
            key={f} 
            onClick={() => setFilter(f)}
            className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-slate-950 rounded-[3rem] shadow-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-white/30 text-[10px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="px-10 py-6">Timestamp / Event ID</th>
                <th className="px-10 py-6">Identity Node</th>
                <th className="px-10 py-6">Operational Event</th>
                <th className="px-10 py-6 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {loading ? (
                <tr><td colSpan={4} className="px-10 py-20 text-center text-white/20 animate-pulse">Scanning Archive...</td></tr>
              ) : filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.01] transition-colors group">
                  <td className="px-10 py-6">
                    <p className="text-white/60">{new Date(log.created_at).toLocaleTimeString()}</p>
                    <p className="text-white/20 text-[9px] mt-1">{log.id.slice(0, 8)}</p>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                      <span className="text-indigo-300">{log.profiles?.email || 'SYSTEM'}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <span className={`px-2 py-0.5 rounded uppercase font-black tracking-widest text-[9px] ${
                      log.action.includes('SUCCESS') ? 'bg-emerald-500/10 text-emerald-400' : 
                      log.action.includes('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-white/10 text-white/60'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-10 py-6 text-right text-white/40 max-w-xs truncate italic">
                    "{log.details}"
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-center py-10 opacity-20 text-[9px] font-black uppercase tracking-[0.6em] text-slate-500">
         End of Audit Stream • Aura Sentinel v9.7
      </div>
    </div>
  );
};

export default AuditLogs;