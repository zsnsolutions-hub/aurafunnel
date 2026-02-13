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
      const { data: logs } = await supabase
        .from('ai_usage_logs')
        .select('*, profiles(email, name, plan)')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (logs) setUsageLogs(logs);

      const { data: promptData } = await supabase
        .from('ai_prompts')
        .select('*')
        .order('version', { ascending: false });
      
      if (promptData) setPrompts(promptData);

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
      console.error("Telemetry sync error:", error);
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
        log.profiles?.email || '',
        log.profiles?.plan || '',
        log.action_type || '',
        log.tokens_used || 0,
        log.estimated_cost || 0,
        log.status || ''
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
          details: `Prompt ${name} updated.`
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
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">Syncing Neural Telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">AI Operations Center</h1>
          <p className="text-slate-500 mt-1">Real-time compute cost analysis and prompt version control.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={exportFinanceReport} 
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
          >
            <span>Export Financial Data</span>
          </button>
          <button onClick={fetchData} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
            <RefreshIcon className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compute Spend (24h)</p>
          <p className="text-2xl font-black font-heading text-slate-900">${totalCost.toFixed(4)}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Cost / Gen</p>
          <p className="text-2xl font-black font-heading text-indigo-600">${avgCostPerGen}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">System Error Rate</p>
          <p className={`text-2xl font-black font-heading ${parseFloat(errorRate) > 10 ? 'text-red-500' : 'text-emerald-500'}`}>{errorRate}%</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Node Gateway</p>
          <div className="flex items-center space-x-2 mt-1">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
             <span className="text-xs font-bold text-white uppercase tracking-wider">Live & Operational</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-1">
          <h3 className="text-lg font-bold text-slate-800 font-heading mb-8">Spend by Subscription</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planStats} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {planStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `$${value.toFixed(4)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4 text-[10px] font-black uppercase tracking-widest">
             {planStats.map((plan, i) => (
               <div key={plan.name} className="flex justify-between items-center">
                 <span className="text-slate-400">{plan.name}</span>
                 <span className="text-slate-900">${plan.value.toFixed(4)}</span>
               </div>
             ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-800 font-heading mb-8">Top Consumption Nodes</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="email" type="category" width={120} className="text-[9px] font-bold text-slate-400" />
                <Tooltip formatter={(value: any) => `$${value.toFixed(4)}`} />
                <Bar dataKey="cost" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-950 rounded-[2.5rem] border border-white/5 shadow-3xl overflow-hidden flex flex-col">
        <div className="p-8 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center space-x-3">
             <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
             <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">Neural Log</span>
          </div>
        </div>
        <div className="flex-grow overflow-x-auto overflow-y-auto max-h-80 custom-scrollbar">
          <table className="w-full text-left font-mono text-[10px]">
            <thead className="bg-white/[0.01] text-white/20 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Identity</th>
                <th className="px-8 py-4">Event</th>
                <th className="px-8 py-4 text-right">Milli-Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {usageLogs.slice(0, 15).map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-4 text-indigo-300 truncate max-w-[120px]">{log.profiles?.email || 'N/A'}</td>
                  <td className="px-8 py-4">
                    <span className={log.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>
                      {(log.status || 'UNKNOWN').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right text-white/30">
                    ${parseFloat(log.estimated_cost || 0).toFixed(5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="text-center py-10 opacity-20 text-[10px] font-black uppercase tracking-[0.6em] text-slate-400">
         Neural Governance Protocol • v9.6
      </div>
    </div>
  );
};

export default AIOperations;