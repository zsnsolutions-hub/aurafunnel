import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { SparklesIcon, BoltIcon, ChartIcon, UsersIcon, ShieldIcon, RefreshIcon, CreditCardIcon } from '../../components/Icons';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

const AIOperations: React.FC = () => {
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any[]>([]);
  const [planStats, setPlanStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch AI Usage Logs with Plan Context
      const { data: logs } = await supabase
        .from('ai_usage_logs')
        .select('*, profiles(email, name, plan)')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (logs) setUsageLogs(logs);

      // 2. Fetch Prompt Library
      const { data: promptData } = await supabase
        .from('ai_prompts')
        .select('*')
        .order('version', { ascending: false });
      
      if (promptData) setPrompts(promptData);

      // 3. Financial Intelligence Aggregation
      const userMap: Record<string, any> = {};
      const planMap: Record<string, any> = { 'Starter': 0, 'Professional': 0, 'Enterprise': 0 };

      logs?.forEach(log => {
        const email = log.profiles?.email || 'Unknown';
        const plan = log.profiles?.plan || 'Starter';
        const cost = parseFloat(log.estimated_cost || 0);

        if (!userMap[email]) {
          userMap[email] = { email, tokens: 0, cost: 0, successes: 0 };
        }
        userMap[email].tokens += log.tokens_used;
        userMap[email].cost += cost;
        if (log.status === 'success') userMap[email].successes += 1;

        if (planMap[plan] !== undefined) planMap[plan] += cost;
      });

      setUserStats(Object.values(userMap).sort((a, b) => b.cost - a.cost).slice(0, 5));
      setPlanStats(Object.entries(planMap).map(([name, value]) => ({ name, value })));

    } catch (error) {
      console.error("Telemetry fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const exportFinanceReport = () => {
    const headers = ['Timestamp', 'User', 'Plan', 'Action', 'Tokens', 'Cost', 'Status'];
    const csvContent = [
      headers.join(','),
      ...usageLogs.map(log => [
        new Date(log.created_at).toISOString(),
        log.profiles?.email,
        log.profiles?.plan,
        log.action_type,
        log.tokens_used,
        log.estimated_cost,
        log.status
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AuraFunnel_AI_Finance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const togglePrompt = async (id: string, name: string, currentStatus: boolean) => {
    setIsSyncing(true);
    try {
      if (!currentStatus) {
        await supabase.from('ai_prompts').update({ is_active: false }).eq('name', name);
      }
      const { error } = await supabase.from('ai_prompts').update({ is_active: !currentStatus }).eq('id', id);
      if (!error) {
        await supabase.from('audit_logs').insert({
          action: 'AI_PROMPT_MODIFIED',
          details: `Prompt ${name} v${prompts.find(p => p.id === id)?.version} toggled.`
        });
        await fetchData();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const totalCost = usageLogs.reduce((a, b) => a + parseFloat(b.estimated_cost || 0), 0);
  const avgCostPerGen = usageLogs.length > 0 ? (totalCost / usageLogs.length).toFixed(4) : '0';
  const errorRate = usageLogs.length > 0 
    ? ((usageLogs.filter(l => l.status === 'error').length / usageLogs.length) * 100).toFixed(1)
    : '0';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Auditing Compute Margins...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Neural Control Center</h1>
          <p className="text-slate-500 mt-1">AI unit economics, prompt engineering, and operational telemetry.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={exportFinanceReport} 
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
          >
            <span>Generate Finance Report</span>
          </button>
          <button 
            onClick={fetchData} 
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <RefreshIcon className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compute Spend (Logged)</p>
          <p className="text-2xl font-black font-heading text-slate-900">${totalCost.toFixed(4)}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Cost / Gen</p>
          <p className="text-2xl font-black font-heading text-indigo-600">${avgCostPerGen}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Margin Risk Index</p>
          <p className={`text-2xl font-black font-heading ${parseFloat(errorRate) > 10 ? 'text-red-500' : 'text-emerald-500'}`}>{errorRate}%</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Node Status</p>
          <div className="flex items-center space-x-2 mt-1">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
             <span className="text-sm font-bold text-white uppercase tracking-tighter">Live Systems</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cost by Plan */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-800 font-heading">Compute by Tier</h3>
            <CreditCardIcon className="w-5 h-5 text-slate-300" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planStats} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {planStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => `$${value.toFixed(4)}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4">
             {planStats.map((plan, i) => (
               <div key={plan.name} className="flex justify-between items-center text-xs font-bold">
                 <span className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }}></div>
                    <span className="text-slate-500">{plan.name}</span>
                 </span>
                 <span className="text-slate-900">${plan.value.toFixed(4)}</span>
               </div>
             ))}
          </div>
        </div>

        {/* User Cost Chart */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-800 font-heading">Top Consumer Nodes</h3>
            <UsersIcon className="w-5 h-5 text-slate-300" />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="email" type="category" width={140} className="text-[9px] font-bold text-slate-400" />
                <Tooltip 
                   formatter={(value: any) => `$${value.toFixed(4)}`}
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="cost" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Prompt Lab */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 font-heading">Prompt Laboratory</h3>
            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">Compute Optimized</span>
          </div>
          <div className="flex-grow overflow-y-auto max-h-80 custom-scrollbar">
            <table className="w-full text-left">
              <tbody className="divide-y divide-slate-100">
                {prompts.map(p => (
                  <tr key={p.id} className="group hover:bg-slate-50/50">
                    <td className="px-8 py-5">
                      <p className="text-xs font-bold text-slate-900">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">Build v{p.version}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {p.is_active ? 'ACTIVE' : 'STANDBY'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => togglePrompt(p.id, p.name, p.is_active)}
                        disabled={isSyncing}
                        className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                          p.is_active ? 'text-red-500 hover:bg-red-50' : 'text-indigo-600 hover:bg-indigo-50'
                        }`}
                      >
                        {p.is_active ? 'DEACTIVATE' : 'DEPLOY'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Exception Feed */}
        <div className="bg-slate-950 rounded-[2.5rem] border border-white/5 shadow-3xl overflow-hidden">
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center space-x-3">
               <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
               <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">Exception Stream</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-white/[0.01] text-white/30 text-[9px] font-black uppercase tracking-widest">
                <tr>
                  <th className="px-8 py-4">Identity</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4 text-right">Cost Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[10px]">
                {usageLogs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-4">
                      <p className="text-indigo-300 truncate max-w-[120px]">{log.profiles?.email}</p>
                    </td>
                    <td className="px-8 py-4">
                      <span className={log.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>
                        {log.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right text-white/40">
                      ${parseFloat(log.estimated_cost || 0).toFixed(6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center space-x-3 opacity-30 text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 py-10">
         <ShieldIcon className="w-4 h-4" />
         <span>Neural Financial Protocol v9.6 • Encryption GCM-256</span>
      </div>
    </div>
  );
};

export default AIOperations;