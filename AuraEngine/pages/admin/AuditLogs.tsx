import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LockIcon, ShieldIcon, RefreshIcon, UsersIcon, BoltIcon } from '../../components/Icons';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('audit_logs')
        .select('*, profiles(email, name)')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (data) setLogs(data);
    } catch (e) {
      console.error("Forensic vault sync error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = logs.filter(l => filter === 'ALL' || (l.action && l.action.includes(filter)));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Forensic Audit Vault</h1>
          <p className="text-slate-500 mt-1 flex items-center space-x-2">
            <LockIcon className="w-4 h-4 text-indigo-500" />
            <span>Immutable system-wide event stream for compliance auditing.</span>
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {['ALL', 'AI', 'PAYMENT', 'USER', 'CONFIG'].map(f => (
              <button 
                key={f} 
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={fetchLogs} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
            <RefreshIcon className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="bg-slate-950 rounded-[3rem] shadow-3xl overflow-hidden border border-white/5 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"></div>
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-white/30 text-[10px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="px-10 py-6">Timestamp / Sequence</th>
                <th className="px-10 py-6">Identity Node</th>
                <th className="px-10 py-6">Operational Event</th>
                <th className="px-10 py-6 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {loading ? (
                <tr><td colSpan={4} className="px-10 py-24 text-center text-white/20 animate-pulse uppercase tracking-[0.5em]">Scanning Secure Archive...</td></tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors group">
                    <td className="px-10 py-6">
                      <p className="text-indigo-400/80">{new Date(log.created_at).toLocaleTimeString()}</p>
                      <p className="text-white/10 text-[9px] mt-1 font-bold">{new Date(log.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                        <span className="text-white/70 group-hover:text-indigo-300 transition-colors truncate max-w-[160px]">{log.profiles?.email || 'SYSTEM_NODE'}</span>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <span className={`px-2 py-0.5 rounded uppercase font-black tracking-widest text-[9px] ${
                        (log.action || '').includes('ERROR') || (log.action || '').includes('FAIL') ? 'bg-red-500/10 text-red-400' : 
                        (log.action || '').includes('SUCCESS') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-white/50'
                      }`}>
                        {log.action || 'UNDEFINED_EVENT'}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right text-white/30 max-w-sm truncate italic group-hover:text-white/60 transition-colors">
                      "{log.details || 'No descriptive metadata provided.'}"
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-10 py-24 text-center text-white/10 italic">No telemetry recorded in this sequence window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between px-10 opacity-30">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.5em]">Forensic Protocol v9.7</p>
        <div className="flex items-center space-x-2">
           <BoltIcon className="w-3 h-3 text-indigo-400" />
           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">End of Stream</span>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;