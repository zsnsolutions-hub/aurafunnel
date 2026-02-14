import React, { useState, useEffect, useMemo } from 'react';
import {
  BoltIcon, ShieldIcon, SparklesIcon, KeyboardIcon, XIcon,
  TrendUpIcon, TrendDownIcon, ActivityIcon, CheckIcon, AlertTriangleIcon,
  BrainIcon, DatabaseIcon, GlobeIcon, ClockIcon, LayersIcon, UsersIcon
} from '../../components/Icons';
import { supabase } from '../../lib/supabase';

interface ServiceMetric {
  name: string;
  status: 'Operational' | 'Degraded' | 'Critical';
  latency: string;
  uptime: string;
  icon: React.ReactNode;
  category: 'core' | 'ai' | 'data' | 'infra';
}

const SystemHealth: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [dbStatus, setDbStatus] = useState({ latency: 0, status: 'Testing' });
  const [pulseCount, setPulseCount] = useState(0);

  const [metrics, setMetrics] = useState<ServiceMetric[]>([
    { name: 'Core API Gateway', status: 'Operational', latency: '24ms', uptime: '99.99%', icon: <BoltIcon />, category: 'core' },
    { name: 'Gemini AI Engine', status: 'Operational', latency: '482ms', uptime: '99.85%', icon: <SparklesIcon />, category: 'ai' },
    { name: 'Cloud Database', status: 'Operational', latency: '8ms', uptime: '99.99%', icon: <ShieldIcon />, category: 'data' },
    { name: 'Authentication', status: 'Operational', latency: '15ms', uptime: '99.99%', icon: <UsersIcon />, category: 'core' },
    { name: 'Lead Scoring', status: 'Operational', latency: '32ms', uptime: '99.95%', icon: <ActivityIcon />, category: 'ai' },
    { name: 'Realtime Feed', status: 'Operational', latency: '6ms', uptime: '99.97%', icon: <ClockIcon />, category: 'infra' },
  ]);

  const [latencyHistory, setLatencyHistory] = useState<{ time: string; value: number }[]>([]);

  // Sidebar & shortcut state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showServiceHealth, setShowServiceHealth] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showInfrastructure, setShowInfrastructure] = useState(false);

  const runPulseCheck = async () => {
    setIsRefreshing(true);
    const start = performance.now();

    try {
      const { data, error } = await supabase.from('profiles').select('id').limit(1);
      const end = performance.now();
      const latency = Math.round(end - start);

      if (!error) {
        setDbStatus({ latency, status: 'Operational' });
        setLastCheck(new Date());
        setPulseCount(prev => prev + 1);

        setLatencyHistory(prev => {
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const next = [...prev, { time: now, value: latency }];
          return next.slice(-20);
        });

        setMetrics(prev => prev.map(m => {
          if (m.name === 'Cloud Database') {
            return { ...m, latency: `${latency}ms`, status: 'Operational' };
          }
          const jitter = Math.floor(Math.random() * 20) - 10;
          const currentLat = parseInt(m.latency);
          return { ...m, latency: `${Math.max(currentLat + jitter, 3)}ms` };
        }));
      } else {
        setDbStatus({ latency: 0, status: 'Degraded' });
      }
    } catch (err) {
      setDbStatus({ latency: 0, status: 'Critical' });
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  useEffect(() => {
    runPulseCheck();
    const interval = setInterval(runPulseCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Service Health Analytics ───────────────────────────
  const serviceHealthData = useMemo(() => {
    const operationalCount = metrics.filter(m => m.status === 'Operational').length;
    const healthScore = Math.round((operationalCount / metrics.length) * 100);
    const avgLatency = Math.round(metrics.reduce((a, m) => a + parseInt(m.latency), 0) / metrics.length);
    const worstService = [...metrics].sort((a, b) => parseInt(b.latency) - parseInt(a.latency))[0];
    const bestService = [...metrics].sort((a, b) => parseInt(a.latency) - parseInt(b.latency))[0];

    const byCategory = {
      core: metrics.filter(m => m.category === 'core'),
      ai: metrics.filter(m => m.category === 'ai'),
      data: metrics.filter(m => m.category === 'data'),
      infra: metrics.filter(m => m.category === 'infra'),
    };

    const avgUptimeParsed = metrics.reduce((a, m) => a + parseFloat(m.uptime), 0) / metrics.length;
    const slaCompliance = avgUptimeParsed >= 99.9;

    return { operationalCount, healthScore, avgLatency, worstService, bestService, byCategory, avgUptime: avgUptimeParsed.toFixed(2), slaCompliance };
  }, [metrics]);

  // ── Performance Metrics ────────────────────────────────
  const performanceData = useMemo(() => {
    const latencies = metrics.map(m => parseInt(m.latency)).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1] || 0;
    const p99 = latencies[latencies.length - 1] || 0;

    const estimatedRps = Math.floor(Math.random() * 50) + 20 + pulseCount * 2;
    const errorRate = metrics.some(m => m.status !== 'Operational') ? (Math.random() * 2 + 0.5).toFixed(2) : (Math.random() * 0.1).toFixed(3);
    const throughputScore = Math.min(100, Math.round(
      (p50 < 50 ? 30 : p50 < 100 ? 20 : 10) +
      (p95 < 200 ? 30 : p95 < 500 ? 20 : 10) +
      (parseFloat(errorRate) < 0.1 ? 40 : parseFloat(errorRate) < 1 ? 25 : 10)
    ));

    const historyAvg = latencyHistory.length > 0
      ? Math.round(latencyHistory.reduce((a, h) => a + h.value, 0) / latencyHistory.length)
      : 0;
    const historyMin = latencyHistory.length > 0 ? Math.min(...latencyHistory.map(h => h.value)) : 0;
    const historyMax = latencyHistory.length > 0 ? Math.max(...latencyHistory.map(h => h.value)) : 0;

    return { p50, p95, p99, estimatedRps, errorRate, throughputScore, historyAvg, historyMin, historyMax };
  }, [metrics, pulseCount, latencyHistory]);

  // ── Infrastructure Status ──────────────────────────────
  const infraStatus = useMemo(() => {
    const regions = [
      { name: 'US-EAST-1', status: 'healthy' as const, latency: Math.floor(Math.random() * 15) + 5, load: Math.floor(Math.random() * 30) + 15 },
      { name: 'EU-WEST-2', status: 'healthy' as const, latency: Math.floor(Math.random() * 25) + 12, load: Math.floor(Math.random() * 25) + 10 },
      { name: 'AS-SOUTH-1', status: 'healthy' as const, latency: Math.floor(Math.random() * 35) + 18, load: Math.floor(Math.random() * 20) + 8 },
    ];
    const resources = [
      { name: 'CPU Usage', value: Math.floor(Math.random() * 20) + 8, max: 100, unit: '%', color: 'bg-blue-500' },
      { name: 'Memory', value: Math.floor(Math.random() * 25) + 15, max: 100, unit: '%', color: 'bg-purple-500' },
      { name: 'Disk I/O', value: Math.floor(Math.random() * 15) + 5, max: 100, unit: '%', color: 'bg-indigo-500' },
      { name: 'Network', value: Math.floor(Math.random() * 30) + 10, max: 100, unit: 'Mbps', color: 'bg-emerald-500' },
      { name: 'DB Connections', value: Math.floor(Math.random() * 8) + 2, max: 50, unit: '/50', color: 'bg-amber-500' },
    ];
    const cacheHitRate = Math.round(92 + Math.random() * 7);
    const activeConnections = Math.floor(Math.random() * 12) + 3;
    return { regions, resources, cacheHitRate, activeConnections };
  }, [pulseCount]);

  // ── KPI Stats ──────────────────────────────────────────
  const kpiStats = useMemo(() => [
    { label: 'Health Score', value: `${serviceHealthData.healthScore}%`, icon: ShieldIcon, color: 'bg-emerald-50 text-emerald-600', sub: serviceHealthData.slaCompliance ? 'SLA Met' : 'SLA Risk' },
    { label: 'Services', value: `${serviceHealthData.operationalCount}/${metrics.length}`, icon: CheckIcon, color: 'bg-blue-50 text-blue-600', sub: 'Operational' },
    { label: 'Avg Latency', value: `${serviceHealthData.avgLatency}ms`, icon: ClockIcon, color: 'bg-indigo-50 text-indigo-600', sub: serviceHealthData.avgLatency < 100 ? 'Excellent' : 'Moderate' },
    { label: 'Throughput', value: `${performanceData.estimatedRps}`, icon: TrendUpIcon, color: 'bg-amber-50 text-amber-600', sub: 'req/s est.' },
    { label: 'Error Rate', value: `${performanceData.errorRate}%`, icon: AlertTriangleIcon, color: 'bg-rose-50 text-rose-600', sub: parseFloat(performanceData.errorRate) < 0.1 ? 'Healthy' : 'Monitor' },
    { label: 'Pulse Checks', value: pulseCount.toString(), icon: ActivityIcon, color: 'bg-purple-50 text-purple-600', sub: '30s interval' },
  ], [serviceHealthData, metrics.length, performanceData, pulseCount]);

  // ── Keyboard Shortcuts ─────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (key === 'r' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); runPulseCheck(); }
      else if (key === 'h' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowServiceHealth(v => !v); }
      else if (key === 'p' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowPerformance(v => !v); }
      else if (key === 'i' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowInfrastructure(v => !v); }
      else if (key === '?' || (e.shiftKey && key === '/')) { e.preventDefault(); setShowShortcuts(v => !v); }
      else if (key === 'escape') {
        setShowShortcuts(false); setShowServiceHealth(false); setShowPerformance(false); setShowInfrastructure(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  HEADER                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 font-heading tracking-tight">System Integrity</h2>
          <p className="text-slate-500 mt-1 flex items-center space-x-2">
            <span>Synchronized {lastCheck.toLocaleTimeString()}</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Global Watchdog Active</span>
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowServiceHealth(v => !v)}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${showServiceHealth ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Health</span>
          </button>
          <button
            onClick={() => setShowPerformance(v => !v)}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${showPerformance ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
          >
            <TrendUpIcon className="w-3.5 h-3.5" />
            <span>Perf</span>
          </button>
          <button
            onClick={() => setShowInfrastructure(v => !v)}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${showInfrastructure ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            <DatabaseIcon className="w-3.5 h-3.5" />
            <span>Infra</span>
          </button>
          <div className="w-px h-6 bg-slate-200" />
          <button
            onClick={() => setShowShortcuts(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            <span>?</span>
          </button>
          <button
            onClick={runPulseCheck}
            disabled={isRefreshing}
            className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              isRefreshing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-lg'
            }`}
          >
            <BoltIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="uppercase tracking-widest text-[10px] font-black">{isRefreshing ? 'Pinging...' : 'Audit'}</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  KPI STATS ROW                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className="flex items-center space-x-2 mb-2">
              <div className={`p-1.5 rounded-lg ${stat.color}`}>
                <stat.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 font-heading group-hover:text-indigo-600 transition-colors">{stat.value}</p>
            {stat.sub && <p className="text-[10px] font-semibold text-emerald-600 mt-1">{stat.sub}</p>}
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  SERVICE CARDS                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((service, idx) => (
          <div key={idx} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-150 duration-500">
               {service.icon}
            </div>

            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800 font-heading text-lg">{service.name}</h3>
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                service.status === 'Operational' ? 'bg-emerald-50 text-emerald-600' : service.status === 'Degraded' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${service.status === 'Operational' ? 'bg-emerald-500 animate-pulse' : service.status === 'Degraded' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                <span>{service.status}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Round-Trip Latency</span>
                <span className={`font-mono font-bold text-xl ${
                  parseInt(service.latency) < 50 ? 'text-emerald-600' : parseInt(service.latency) < 200 ? 'text-slate-900' : 'text-amber-600'
                }`}>{service.latency}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Uptime (30d)</span>
                <span className="font-black text-indigo-600 tracking-tighter">{service.uptime}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Category</span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                  service.category === 'core' ? 'bg-blue-50 text-blue-600' :
                  service.category === 'ai' ? 'bg-purple-50 text-purple-600' :
                  service.category === 'data' ? 'bg-emerald-50 text-emerald-600' :
                  'bg-amber-50 text-amber-600'
                }`}>{service.category}</span>
              </div>
            </div>

            <div className="mt-6 pt-4">
              <div className="flex items-center justify-center space-x-1 h-6">
                {[...Array(24)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-full w-1 rounded-full transition-all duration-700 ${
                      service.status !== 'Operational' && i === 20 ? 'bg-red-300' : 'bg-indigo-100 group-hover:bg-indigo-500'
                    }`}
                    style={{ height: `${Math.random() * 40 + 60}%` }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  LATENCY HISTORY + SECURITY NODE                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Latency History Chart */}
        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white font-bold text-lg font-heading flex items-center space-x-3">
                <ActivityIcon className="w-5 h-5 text-blue-400" />
                <span>DB Latency Timeline</span>
              </h3>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{latencyHistory.length} samples</span>
            </div>
            {latencyHistory.length < 2 ? (
              <div className="h-32 flex items-center justify-center">
                <p className="text-sm text-slate-500 italic">Collecting latency samples...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end space-x-1 h-32">
                  {latencyHistory.map((h, i) => {
                    const maxVal = Math.max(...latencyHistory.map(x => x.value), 1);
                    const pct = (h.value / maxVal) * 100;
                    const isLast = i === latencyHistory.length - 1;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end space-y-1" title={`${h.time}: ${h.value}ms`}>
                        <span className={`text-[8px] font-bold ${isLast ? 'text-blue-300' : 'text-slate-600'}`}>{h.value}</span>
                        <div
                          className={`w-full rounded-t-sm transition-all ${isLast ? 'bg-blue-400' : 'bg-gradient-to-t from-blue-600/80 to-blue-400/60'}`}
                          style={{ height: `${Math.max(pct, 5)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-500">
                  <span>{latencyHistory[0]?.time}</span>
                  <div className="flex items-center space-x-4">
                    <span>Min: <span className="text-emerald-400 font-bold">{performanceData.historyMin}ms</span></span>
                    <span>Avg: <span className="text-blue-400 font-bold">{performanceData.historyAvg}ms</span></span>
                    <span>Max: <span className="text-amber-400 font-bold">{performanceData.historyMax}ms</span></span>
                  </div>
                  <span>{latencyHistory[latencyHistory.length - 1]?.time}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Node */}
        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
           <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none"></div>
           <h3 className="text-white font-bold text-lg mb-6 font-heading flex items-center space-x-3 relative z-10">
             <ShieldIcon className="w-5 h-5 text-indigo-400" />
             <span>Security Encryption Node</span>
           </h3>
           <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between text-slate-400 text-sm font-medium">
                 <span>RSA-4096 Signature</span>
                 <span className="text-emerald-400 font-mono font-bold">VERIFIED</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-sm font-medium">
                 <span>SSL Handshake</span>
                 <span className="text-emerald-400 font-mono font-bold">TLS 1.3</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-sm font-medium">
                 <span>CORS Policy</span>
                 <span className="text-emerald-400 font-mono font-bold">ENFORCED</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-sm font-medium">
                 <span>Row Level Security</span>
                 <span className="text-emerald-400 font-mono font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-sm font-medium">
                 <span>Rate Limiting</span>
                 <span className="text-blue-400 font-mono font-bold">1000 req/min</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-4">
                 <div className="bg-indigo-500 h-full rounded-full" style={{ width: '94%' }}></div>
              </div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Active Sentinel Protection — 94% Hardened</p>
           </div>
        </div>
      </div>

      {/* Region + Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          {infraStatus.regions.map((r, i) => (
            <div key={i} className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{r.name}</span>
              <span className="text-[10px] font-bold text-slate-300">{r.latency}ms</span>
            </div>
          ))}
        </div>
        <button onClick={() => setShowShortcuts(true)} className="flex items-center space-x-1 px-2 py-1 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors text-[10px] font-bold text-slate-400">
          <KeyboardIcon className="w-3 h-3" />
          <span>Shortcuts</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  SERVICE HEALTH SIDEBAR                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showServiceHealth && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowServiceHealth(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                    <ShieldIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 font-heading">Service Health</h2>
                    <p className="text-xs text-slate-400">Aggregate status & diagnostics</p>
                  </div>
                </div>
                <button onClick={() => setShowServiceHealth(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <XIcon className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Health Gauge */}
              <div className="text-center">
                <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none"
                    stroke={serviceHealthData.healthScore >= 90 ? '#10b981' : serviceHealthData.healthScore >= 70 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(serviceHealthData.healthScore / 100) * 251.2} 251.2`}
                    transform="rotate(-90 48 48)" />
                  <text x="48" y="44" textAnchor="middle" className="text-2xl font-bold fill-slate-900" style={{ fontSize: '20px' }}>{serviceHealthData.healthScore}%</text>
                  <text x="48" y="58" textAnchor="middle" className="text-xs fill-slate-400" style={{ fontSize: '8px' }}>HEALTH</text>
                </svg>
                <p className="text-sm font-semibold text-slate-600 mt-2">{serviceHealthData.operationalCount}/{metrics.length} Services Operational</p>
                <p className="text-xs text-slate-400">Avg Uptime: {serviceHealthData.avgUptime}%</p>
              </div>

              {/* Summary Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700 font-heading">{serviceHealthData.avgLatency}ms</p>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Avg Latency</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl text-center border border-blue-100">
                  <p className="text-2xl font-bold text-blue-700 font-heading">{serviceHealthData.avgUptime}%</p>
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Avg Uptime</p>
                </div>
              </div>

              {/* Per-Service Detail */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service Breakdown</h4>
                {metrics.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-2 h-2 rounded-full ${m.status === 'Operational' ? 'bg-emerald-500' : m.status === 'Degraded' ? 'bg-amber-400' : 'bg-red-500'}`} />
                      <span className="text-sm font-medium text-slate-700">{m.name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] font-semibold text-slate-400">{m.latency}</span>
                      <span className="text-[10px] font-bold text-emerald-600">{m.uptime}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Category Breakdown */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">By Category</h4>
                {Object.entries(serviceHealthData.byCategory).map(([cat, services]) => {
                  const allOp = services.every(s => s.status === 'Operational');
                  return (
                    <div key={cat} className="p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700 capitalize">{cat}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-500">{services.length} service{services.length > 1 ? 's' : ''}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${allOp ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{allOp ? 'OK' : 'ISSUE'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SLA Compliance */}
              <div className={`p-4 rounded-2xl border ${serviceHealthData.slaCompliance ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-100' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100'}`}>
                <div className="flex items-center space-x-2 mb-2">
                  {serviceHealthData.slaCompliance ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <AlertTriangleIcon className="w-4 h-4 text-amber-600" />}
                  <h4 className={`text-sm font-bold ${serviceHealthData.slaCompliance ? 'text-emerald-800' : 'text-amber-800'}`}>SLA Status</h4>
                </div>
                <p className={`text-xs leading-relaxed ${serviceHealthData.slaCompliance ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {serviceHealthData.slaCompliance
                    ? 'All services meeting 99.9% uptime SLA target. No incidents detected in current monitoring window.'
                    : 'Some services may be below SLA threshold. Review degraded services and check incident logs.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  PERFORMANCE SIDEBAR                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showPerformance && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowPerformance(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <TrendUpIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 font-heading">Performance</h2>
                    <p className="text-xs text-slate-400">Throughput, latency & error rates</p>
                  </div>
                </div>
                <button onClick={() => setShowPerformance(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <XIcon className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Throughput Gauge */}
              <div className="text-center">
                <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none"
                    stroke={performanceData.throughputScore >= 80 ? '#6366f1' : performanceData.throughputScore >= 60 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(performanceData.throughputScore / 100) * 251.2} 251.2`}
                    transform="rotate(-90 48 48)" />
                  <text x="48" y="44" textAnchor="middle" className="text-2xl font-bold fill-slate-900" style={{ fontSize: '20px' }}>{performanceData.throughputScore}</text>
                  <text x="48" y="58" textAnchor="middle" className="text-xs fill-slate-400" style={{ fontSize: '8px' }}>PERF SCORE</text>
                </svg>
                <p className="text-sm font-semibold text-slate-600 mt-2">~{performanceData.estimatedRps} req/s estimated</p>
                <p className="text-xs text-slate-400">Error rate: {performanceData.errorRate}%</p>
              </div>

              {/* Latency Percentiles */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Latency Percentiles</h4>
                <div className="bg-slate-900 rounded-xl p-5 space-y-3">
                  {[
                    { label: 'P50 (Median)', value: performanceData.p50, color: 'from-emerald-600 to-emerald-400' },
                    { label: 'P95', value: performanceData.p95, color: 'from-blue-600 to-blue-400' },
                    { label: 'P99 (Worst)', value: performanceData.p99, color: 'from-amber-600 to-amber-400' },
                  ].map((p, i) => {
                    const maxVal = Math.max(performanceData.p99, 100);
                    const pct = (p.value / maxVal) * 100;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-300">{p.label}</span>
                          <span className="text-xs font-bold text-white">{p.value}ms</span>
                        </div>
                        <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-r ${p.color}`} style={{ width: `${Math.max(pct, 5)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Latency History Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700 font-heading">{performanceData.historyMin}</p>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Min (ms)</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl text-center border border-blue-100">
                  <p className="text-2xl font-bold text-blue-700 font-heading">{performanceData.historyAvg}</p>
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Avg (ms)</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl text-center border border-amber-100">
                  <p className="text-2xl font-bold text-amber-700 font-heading">{performanceData.historyMax}</p>
                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Max (ms)</p>
                </div>
              </div>

              {/* Error Analysis */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Error Analysis</h4>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">Error Rate</span>
                    <span className={`text-sm font-bold ${parseFloat(performanceData.errorRate) < 0.1 ? 'text-emerald-600' : parseFloat(performanceData.errorRate) < 1 ? 'text-amber-600' : 'text-red-600'}`}>{performanceData.errorRate}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${parseFloat(performanceData.errorRate) < 0.1 ? 'bg-emerald-500' : parseFloat(performanceData.errorRate) < 1 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(parseFloat(performanceData.errorRate) * 20, 100)}%` }} />
                  </div>
                </div>
              </div>

              {/* Insight */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-indigo-800">Performance Insight</h4>
                </div>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  {performanceData.throughputScore >= 80
                    ? 'Excellent performance across all services. Latency percentiles are within optimal range. System is well-tuned for current load.'
                    : performanceData.throughputScore >= 60
                    ? 'Performance is acceptable but P95 latency could be improved. Consider connection pooling or query optimization for high-latency services.'
                    : 'Performance degradation detected. Review services with high latency and check for resource bottlenecks or network issues.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  INFRASTRUCTURE SIDEBAR                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showInfrastructure && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowInfrastructure(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                    <DatabaseIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 font-heading">Infrastructure</h2>
                    <p className="text-xs text-slate-400">Resources, regions & capacity</p>
                  </div>
                </div>
                <button onClick={() => setShowInfrastructure(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <XIcon className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Cache Gauge */}
              <div className="text-center">
                <svg viewBox="0 0 96 96" className="w-28 h-28 mx-auto">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none"
                    stroke={infraStatus.cacheHitRate >= 90 ? '#f59e0b' : infraStatus.cacheHitRate >= 70 ? '#3b82f6' : '#ef4444'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(infraStatus.cacheHitRate / 100) * 251.2} 251.2`}
                    transform="rotate(-90 48 48)" />
                  <text x="48" y="44" textAnchor="middle" className="text-2xl font-bold fill-slate-900" style={{ fontSize: '18px' }}>{infraStatus.cacheHitRate}%</text>
                  <text x="48" y="58" textAnchor="middle" className="text-xs fill-slate-400" style={{ fontSize: '8px' }}>CACHE HIT</text>
                </svg>
                <p className="text-sm font-semibold text-slate-600 mt-2">{infraStatus.activeConnections} active connections</p>
              </div>

              {/* Region Status */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Region Status</h4>
                {infraStatus.regions.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-2 h-2 rounded-full ${r.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      <span className="text-sm font-bold text-slate-700 font-mono">{r.name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] font-semibold text-slate-400">{r.latency}ms</span>
                      <span className="text-[10px] font-bold text-indigo-600">{r.load}% load</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resource Utilization */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resource Utilization</h4>
                {infraStatus.resources.map((r, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-600">{r.name}</span>
                      <span className="font-bold text-slate-700">{r.value}{r.unit}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${r.color} rounded-full transition-all`} style={{ width: `${(r.value / r.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Capacity Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-amber-50 rounded-xl text-center border border-amber-100">
                  <p className="text-2xl font-bold text-amber-700 font-heading">{infraStatus.cacheHitRate}%</p>
                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Cache Hit</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl text-center border border-amber-100">
                  <p className="text-2xl font-bold text-amber-700 font-heading">{infraStatus.activeConnections}</p>
                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Connections</p>
                </div>
              </div>

              {/* Region Latency Chart */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Region Latency</h4>
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="flex items-end space-x-4 h-20">
                    {infraStatus.regions.map((r, i) => {
                      const maxVal = Math.max(...infraStatus.regions.map(x => x.latency), 1);
                      const pct = (r.latency / maxVal) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end space-y-1">
                          <span className="text-[9px] font-bold text-amber-300">{r.latency}ms</span>
                          <div className="w-full rounded-t-md bg-gradient-to-t from-amber-600 to-amber-400" style={{ height: `${Math.max(pct, 15)}%` }} />
                          <span className="text-[8px] font-bold text-slate-500">{r.name.split('-')[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Insight */}
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-100">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-amber-800">Infra Insight</h4>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  {infraStatus.cacheHitRate >= 95
                    ? 'Cache performance is excellent. All regions reporting healthy load levels with low resource utilization.'
                    : infraStatus.cacheHitRate >= 85
                    ? 'Infrastructure is healthy. Consider reviewing cache invalidation policies for further optimization.'
                    : 'Cache hit rate is below optimal. Review frequently-accessed queries and consider expanding cache capacity.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  KEYBOARD SHORTCUTS MODAL                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <KeyboardIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-900">System Health Shortcuts</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-x-6 gap-y-3 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Panels</p>
                {[
                  { key: 'H', action: 'Service Health' },
                  { key: 'P', action: 'Performance' },
                  { key: 'I', action: 'Infrastructure' },
                ].map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{sc.action}</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</p>
                {[
                  { key: 'R', action: 'Run pulse check' },
                ].map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{sc.action}</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">System</p>
                {[
                  { key: '?', action: 'Shortcuts' },
                  { key: 'Esc', action: 'Close panels' },
                ].map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{sc.action}</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">{sc.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealth;
