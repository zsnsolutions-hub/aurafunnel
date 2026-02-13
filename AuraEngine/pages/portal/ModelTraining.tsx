import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import {
  SparklesIcon, CogIcon, ChartIcon, TargetIcon, BoltIcon, RefreshIcon,
  CheckIcon, XIcon, TrendUpIcon, TrendDownIcon, ClockIcon, DownloadIcon,
  PlayIcon, PauseIcon, SlidersIcon, ShieldIcon, ActivityIcon, StarIcon,
  FlameIcon, EyeIcon, ArrowLeftIcon, KeyboardIcon, BrainIcon, LayersIcon,
  FilterIcon, PieChartIcon, UsersIcon, GitBranchIcon, AlertTriangleIcon
} from '../../components/Icons';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type ModelId = 'gemini-flash' | 'gemini-pro' | 'custom';
type TrainingStatus = 'idle' | 'training' | 'paused' | 'complete';

interface TrainingDataset {
  id: string;
  name: string;
  samples: number;
  enabled: boolean;
}

interface FocusArea {
  id: string;
  name: string;
  enabled: boolean;
}

interface TrainingParams {
  epochs: number;
  learningRate: number;
  batchSize: number;
  validationSplit: number;
}

interface EpochMetric {
  epoch: number;
  accuracy: number;
  loss: number;
  valAccuracy: number;
  valLoss: number;
}

interface ModelVersion {
  version: string;
  date: string;
  accuracy: number;
  speed: string;
  cost: string;
  notes: string;
  active: boolean;
}

interface TrainingExperiment {
  id: string;
  name: string;
  date: string;
  model: ModelId;
  epochs: number;
  finalAccuracy: number;
  finalLoss: number;
  duration: string;
  status: 'completed' | 'failed' | 'stopped';
  improvement: number;
}

interface ModelBenchmark {
  metric: string;
  yours: number;
  industry: number;
  topTen: number;
  unit: string;
}

const MOCK_EXPERIMENTS: TrainingExperiment[] = [
  { id: 'exp1', name: 'Tech Lead Scoring v2', date: '2 days ago', model: 'gemini-flash', epochs: 50, finalAccuracy: 94.2, finalLoss: 0.028, duration: '18m', status: 'completed', improvement: 2.4 },
  { id: 'exp2', name: 'Content Personalization', date: '5 days ago', model: 'gemini-pro', epochs: 100, finalAccuracy: 91.8, finalLoss: 0.041, duration: '42m', status: 'completed', improvement: 1.8 },
  { id: 'exp3', name: 'Conversion Prediction', date: '1 week ago', model: 'gemini-flash', epochs: 25, finalAccuracy: 88.5, finalLoss: 0.065, duration: '8m', status: 'completed', improvement: 3.1 },
  { id: 'exp4', name: 'Industry Adaptation', date: '1 week ago', model: 'custom', epochs: 200, finalAccuracy: 0, finalLoss: 0, duration: '1h 15m', status: 'failed', improvement: 0 },
  { id: 'exp5', name: 'Timing Optimization', date: '2 weeks ago', model: 'gemini-flash', epochs: 50, finalAccuracy: 86.2, finalLoss: 0.078, duration: '16m', status: 'stopped', improvement: -0.5 },
];

const MODEL_BENCHMARKS: ModelBenchmark[] = [
  { metric: 'Lead Scoring', yours: 94.2, industry: 82.5, topTen: 96.1, unit: '%' },
  { metric: 'Content Quality', yours: 91.3, industry: 78.0, topTen: 93.8, unit: '%' },
  { metric: 'Prediction Accuracy', yours: 92.1, industry: 80.4, topTen: 95.2, unit: '%' },
  { metric: 'Response Speed', yours: 1.2, industry: 2.8, topTen: 0.8, unit: 's' },
  { metric: 'Cost Efficiency', yours: 0.10, industry: 0.25, topTen: 0.08, unit: '$' },
];

const HYPERPARAMETER_PRESETS = [
  { name: 'Quick Test', epochs: 10, lr: 0.01, batch: 64, split: 15, desc: 'Fast validation run' },
  { name: 'Balanced', epochs: 50, lr: 0.001, batch: 32, split: 20, desc: 'Standard training config' },
  { name: 'High Accuracy', epochs: 200, lr: 0.0001, batch: 16, split: 25, desc: 'Maximum accuracy, slower' },
  { name: 'Cost Efficient', epochs: 25, lr: 0.005, batch: 128, split: 10, desc: 'Fast and cheap' },
];

const DEFAULT_DATASETS: TrainingDataset[] = [
  { id: 'campaigns', name: 'Successful campaigns', samples: 1242, enabled: true },
  { id: 'content', name: 'High-converting content', samples: 842, enabled: true },
  { id: 'feedback', name: 'Customer feedback', samples: 524, enabled: false },
  { id: 'industry', name: 'Industry-specific data (Tech)', samples: 896, enabled: true },
  { id: 'competitor', name: 'Competitor analysis', samples: 312, enabled: false },
];

const DEFAULT_FOCUS_AREAS: FocusArea[] = [
  { id: 'scoring', name: 'Lead Scoring Accuracy', enabled: true },
  { id: 'personalization', name: 'Content Personalization', enabled: true },
  { id: 'prediction', name: 'Conversion Prediction', enabled: true },
  { id: 'timing', name: 'Timing Optimization', enabled: false },
  { id: 'industry', name: 'Industry Adaptation', enabled: true },
];

const MODEL_VERSIONS: ModelVersion[] = [
  { version: '4.2', date: 'Jan 15', accuracy: 94.2, speed: '1.2s', cost: '$0.10', notes: 'Tech focus added', active: true },
  { version: '4.1', date: 'Jan 8', accuracy: 92.4, speed: '1.4s', cost: '$0.12', notes: 'Bug fixes', active: false },
  { version: '4.0', date: 'Jan 1', accuracy: 91.8, speed: '1.5s', cost: '$0.14', notes: 'Major update', active: false },
  { version: '3.2', date: 'Dec 24', accuracy: 89.7, speed: '1.6s', cost: '$0.15', notes: 'Holiday optimized', active: false },
  { version: '3.1', date: 'Dec 15', accuracy: 88.2, speed: '1.7s', cost: '$0.16', notes: 'Initial release', active: false },
];

const COMPARISON_METRICS = [
  { metric: 'Lead Scoring', current: 92.4, trained: 94.2, unit: '%', better: true },
  { metric: 'Content Quality', current: 88.7, trained: 91.3, unit: '%', better: true },
  { metric: 'Prediction', current: 89.5, trained: 92.1, unit: '%', better: true },
  { metric: 'Speed', current: 1.4, trained: 1.2, unit: 's', better: true },
  { metric: 'Cost/Request', current: 0.12, trained: 0.10, unit: '$', better: true },
];

// Generate realistic training curve data
const generateTrainingCurve = (maxEpoch: number): EpochMetric[] => {
  const data: EpochMetric[] = [];
  for (let e = 1; e <= maxEpoch; e++) {
    const progress = e / maxEpoch;
    // Accuracy: starts ~65%, approaches ~94% with some noise
    const baseAcc = 65 + 29 * (1 - Math.exp(-3.5 * progress));
    const noise = (Math.random() - 0.5) * 1.5;
    const accuracy = Math.min(96, +(baseAcc + noise).toFixed(1));

    // Loss: starts ~0.48, decreases toward ~0.02
    const baseLoss = 0.48 * Math.exp(-3.5 * progress) + 0.02;
    const lossNoise = (Math.random() - 0.5) * 0.015;
    const loss = Math.max(0.01, +(baseLoss + lossNoise).toFixed(3));

    // Validation metrics slightly worse
    const valAccuracy = Math.min(95, +(accuracy - 0.5 - Math.random() * 1.2).toFixed(1));
    const valLoss = +(loss + 0.005 + Math.random() * 0.01).toFixed(3);

    data.push({ epoch: e, accuracy, loss, valAccuracy, valLoss });
  }
  return data;
};

const ModelTraining: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [selectedModel, setSelectedModel] = useState<ModelId>('gemini-flash');
  const [datasets, setDatasets] = useState<TrainingDataset[]>(DEFAULT_DATASETS);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(DEFAULT_FOCUS_AREAS);
  const [params, setParams] = useState<TrainingParams>({ epochs: 50, learningRate: 0.001, batchSize: 32, validationSplit: 20 });
  const [status, setStatus] = useState<TrainingStatus>('idle');
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [trainingData, setTrainingData] = useState<EpochMetric[]>([]);
  const [fullCurve] = useState<EpochMetric[]>(() => generateTrainingCurve(50));
  const [showLogs, setShowLogs] = useState(false);
  const [deployedVersion, setDeployedVersion] = useState('4.2');
  const [versions, setVersions] = useState<ModelVersion[]>(MODEL_VERSIONS);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Enhanced Wireframe State ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExperiments, setShowExperiments] = useState(false);
  const [showBenchmarkPanel, setShowBenchmarkPanel] = useState(false);
  const [showDataInsights, setShowDataInsights] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // ─── Training Simulation ───
  const startTraining = useCallback(() => {
    setStatus('training');
    setCurrentEpoch(0);
    setTrainingData([]);
  }, []);

  const pauseTraining = () => setStatus('paused');

  const resumeTraining = () => setStatus('training');

  useEffect(() => {
    if (status === 'training') {
      intervalRef.current = setInterval(() => {
        setCurrentEpoch(prev => {
          const next = prev + 1;
          if (next > params.epochs) {
            setStatus('complete');
            if (intervalRef.current) clearInterval(intervalRef.current);
            return prev;
          }
          setTrainingData(td => [...td, fullCurve[next - 1]]);
          return next;
        });
      }, 400); // Speed up for demo: ~20s for 50 epochs
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status, params.epochs, fullCurve]);

  // ─── Computed ───
  const latestMetric = trainingData.length > 0 ? trainingData[trainingData.length - 1] : null;
  const totalSamples = datasets.filter(d => d.enabled).reduce((a, b) => a + b.samples, 0);
  const enabledFocusCount = focusAreas.filter(f => f.enabled).length;
  const timeRemaining = status === 'training' ? Math.max(0, Math.round((params.epochs - currentEpoch) * 0.4 / 60 * 100) / 100) : 0;
  const progressPct = params.epochs > 0 ? Math.round((currentEpoch / params.epochs) * 100) : 0;

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const avgAccuracy = versions.length > 0 ? versions.reduce((s, v) => s + v.accuracy, 0) / versions.length : 0;
    const bestVersion = versions.reduce((best, v) => v.accuracy > best.accuracy ? v : best, versions[0]);
    const completedExperiments = MOCK_EXPERIMENTS.filter(e => e.status === 'completed');
    const avgImprovement = completedExperiments.length > 0
      ? completedExperiments.reduce((s, e) => s + e.improvement, 0) / completedExperiments.length
      : 0;

    return [
      { label: 'Training Samples', value: totalSamples.toLocaleString(), icon: <LayersIcon className="w-5 h-5" />, color: 'indigo', trend: `${datasets.filter(d => d.enabled).length}/${datasets.length} datasets`, up: true },
      { label: 'Focus Areas', value: `${enabledFocusCount}/${focusAreas.length}`, icon: <TargetIcon className="w-5 h-5" />, color: 'emerald', trend: focusAreas.filter(f => f.enabled).map(f => f.name.split(' ')[0]).join(', '), up: true },
      { label: 'Best Accuracy', value: `${bestVersion?.accuracy || 0}%`, icon: <TrendUpIcon className="w-5 h-5" />, color: 'blue', trend: `v${bestVersion?.version || '?'} on ${bestVersion?.date || '?'}`, up: true },
      { label: 'Avg Improvement', value: `+${avgImprovement.toFixed(1)}%`, icon: <SparklesIcon className="w-5 h-5" />, color: 'violet', trend: `${completedExperiments.length} completed runs`, up: avgImprovement > 0 },
      { label: 'Model Versions', value: versions.length.toString(), icon: <GitBranchIcon className="w-5 h-5" />, color: 'amber', trend: `Active: v${deployedVersion}`, up: null },
      { label: 'Cost/Request', value: versions[0]?.cost || '$0.10', icon: <ShieldIcon className="w-5 h-5" />, color: 'fuchsia', trend: `Speed: ${versions[0]?.speed || '1.2s'}`, up: true },
    ];
  }, [totalSamples, datasets, enabledFocusCount, focusAreas, versions, deployedVersion]);

  // ─── Data Quality Insights ───
  const dataInsights = useMemo(() => {
    return datasets.map(ds => {
      const quality = 70 + Math.floor(Math.random() * 30);
      const freshness = ['Fresh', 'Recent', 'Aging', 'Stale'][Math.floor(Math.random() * 3)];
      const coverage = 50 + Math.floor(Math.random() * 50);
      return { ...ds, quality, freshness, coverage };
    });
  }, [datasets]);

  // ─── Handlers ───
  const toggleDataset = (id: string) => {
    setDatasets(prev => prev.map(d => d.id === id ? { ...d, enabled: !d.enabled } : d));
  };

  const toggleFocus = (id: string) => {
    setFocusAreas(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const handleDeploy = () => {
    const newVer = {
      version: '4.3',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      accuracy: latestMetric?.accuracy || 94.2,
      speed: '1.1s',
      cost: '$0.09',
      notes: `Custom training: ${enabledFocusCount} focus areas`,
      active: true,
    };
    setVersions(prev => [newVer, ...prev.map(v => ({ ...v, active: false }))]);
    setDeployedVersion('4.3');
    setStatus('idle');
  };

  const handleRollback = (version: string) => {
    setVersions(prev => prev.map(v => ({ ...v, active: v.version === version })));
    setDeployedVersion(version);
    setShowRollbackConfirm(null);
  };

  const handleExportReport = () => {
    const report = `AI Model Training Report
Generated: ${new Date().toLocaleDateString()}
User: ${user.name}

MODEL CONFIGURATION
- Base Model: ${selectedModel}
- Epochs: ${params.epochs}
- Learning Rate: ${params.learningRate}
- Batch Size: ${params.batchSize}
- Validation Split: ${params.validationSplit}%
- Training Samples: ${totalSamples}

TRAINING RESULTS
- Final Accuracy: ${latestMetric?.accuracy || 'N/A'}%
- Final Loss: ${latestMetric?.loss || 'N/A'}
- Val Accuracy: ${latestMetric?.valAccuracy || 'N/A'}%
- Epochs Completed: ${currentEpoch}/${params.epochs}

MODEL COMPARISON
${COMPARISON_METRICS.map(m => `- ${m.metric}: ${m.current}${m.unit} → ${m.trained}${m.unit}`).join('\n')}

VERSION HISTORY
${versions.map(v => `v${v.version} (${v.date}) - ${v.accuracy}% - ${v.notes}${v.active ? ' [ACTIVE]' : ''}`).join('\n')}`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model_training_report_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = useCallback((preset: typeof HYPERPARAMETER_PRESETS[0]) => {
    setParams({ epochs: preset.epochs, learningRate: preset.lr, batchSize: preset.batch, validationSplit: preset.split });
    setShowPresets(false);
  }, []);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (e.key === 'x' || e.key === 'X') { e.preventDefault(); setShowExperiments(s => !s); return; }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); setShowBenchmarkPanel(s => !s); return; }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setShowDataInsights(s => !s); return; }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setShowPresets(s => !s); return; }
      if ((e.key === 'Enter' || e.key === 'r' || e.key === 'R') && status === 'idle') { e.preventDefault(); startTraining(); return; }
      if (e.key === ' ' && status === 'training') { e.preventDefault(); pauseTraining(); return; }
      if (e.key === ' ' && status === 'paused') { e.preventDefault(); resumeTraining(); return; }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleExportReport(); return; }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowExperiments(false);
        setShowBenchmarkPanel(false);
        setShowDataInsights(false);
        setShowPresets(false);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, startTraining]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <CogIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
              AI Model Training Studio
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Train, compare &amp; deploy AI models &middot; Active: v{deployedVersion}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowExperiments(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showExperiments ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <ClockIcon className="w-3.5 h-3.5" />
            <span>Experiments</span>
          </button>
          <button
            onClick={() => setShowBenchmarkPanel(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showBenchmarkPanel ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <ChartIcon className="w-3.5 h-3.5" />
            <span>Benchmarks</span>
          </button>
          <button
            onClick={() => setShowDataInsights(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showDataInsights ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <PieChartIcon className="w-3.5 h-3.5" />
            <span>Data Quality</span>
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            <span>Shortcuts</span>
          </button>

          <span className={`flex items-center space-x-1.5 px-3 py-2 rounded-full text-xs font-bold ${
            status === 'training' ? 'bg-emerald-50 text-emerald-700' :
            status === 'paused' ? 'bg-amber-50 text-amber-700' :
            status === 'complete' ? 'bg-indigo-50 text-indigo-700' :
            'bg-slate-50 text-slate-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              status === 'training' ? 'bg-emerald-500 animate-pulse' :
              status === 'paused' ? 'bg-amber-500' :
              status === 'complete' ? 'bg-indigo-500' :
              'bg-slate-300'
            }`}></span>
            <span>{status === 'idle' ? 'Ready' : status === 'training' ? 'Training...' : status === 'paused' ? 'Paused' : 'Complete'}</span>
          </span>
          <div className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600">
            <TargetIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span>v{deployedVersion}</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KPI STATS BANNER                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                {stat.icon}
              </div>
              {stat.up !== null && (
                stat.up ? <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" /> : <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />
              )}
            </div>
            <p className="text-xl font-black text-slate-900">{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
            <p className="text-[10px] text-slate-400 mt-1 truncate">{stat.trend}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN 3-COLUMN LAYOUT                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col xl:flex-row gap-5">

        {/* ─── LEFT: Training Configuration (30%) ─── */}
        <div className="xl:w-[30%] space-y-5">

          {/* Model Selection */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Model Selection</h3>
            <div className="space-y-2">
              {([
                { id: 'gemini-flash' as ModelId, label: 'Gemini Flash', desc: 'Fast, cost-effective', badge: 'Current' },
                { id: 'gemini-pro' as ModelId, label: 'Gemini Pro', desc: 'Higher accuracy', badge: null },
                { id: 'custom' as ModelId, label: 'Custom Fine-tuned', desc: 'Your data, your model', badge: null },
              ]).map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  disabled={status === 'training'}
                  className={`w-full flex items-center space-x-3 p-3 rounded-xl border-2 transition-all text-left ${
                    selectedModel === m.id
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-100 hover:border-slate-200'
                  } disabled:opacity-50`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedModel === m.id ? 'border-indigo-600' : 'border-slate-300'
                  }`}>
                    {selectedModel === m.id && <div className="w-2 h-2 rounded-full bg-indigo-600"></div>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">{m.label}</p>
                    <p className="text-[10px] text-slate-400">{m.desc}</p>
                  </div>
                  {m.badge && (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold uppercase">{m.badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Training Data */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Training Data</h3>
              <span className="text-[10px] font-bold text-indigo-600">{totalSamples.toLocaleString()} samples</span>
            </div>
            <div className="space-y-2">
              {datasets.map(ds => (
                <button
                  key={ds.id}
                  onClick={() => toggleDataset(ds.id)}
                  disabled={status === 'training'}
                  className="w-full flex items-center space-x-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                    ds.enabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {ds.enabled && <CheckIcon className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{ds.name}</p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">{ds.samples.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Training Parameters */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Training Parameters</h3>
              <button
                onClick={() => setShowPresets(s => !s)}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                Presets
              </button>
            </div>
            {showPresets && (
              <div className="mb-3 space-y-1.5">
                {HYPERPARAMETER_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    disabled={status === 'training'}
                    className="w-full text-left p-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-700">{preset.name}</span>
                      <span className="text-[9px] text-indigo-500 font-medium">{preset.epochs}ep &middot; lr={preset.lr}</span>
                    </div>
                    <p className="text-[10px] text-indigo-500 mt-0.5">{preset.desc}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {([
                { label: 'Epochs', key: 'epochs' as keyof TrainingParams, options: [10, 25, 50, 100, 200] },
                { label: 'Learning Rate', key: 'learningRate' as keyof TrainingParams, options: [0.01, 0.005, 0.001, 0.0005, 0.0001] },
                { label: 'Batch Size', key: 'batchSize' as keyof TrainingParams, options: [8, 16, 32, 64, 128] },
                { label: 'Validation Split', key: 'validationSplit' as keyof TrainingParams, options: [10, 15, 20, 25, 30] },
              ]).map(p => (
                <div key={p.key} className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">{p.label}</span>
                  <select
                    value={params[p.key]}
                    onChange={e => setParams(prev => ({ ...prev, [p.key]: parseFloat(e.target.value) }))}
                    disabled={status === 'training'}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:opacity-50"
                  >
                    {p.options.map(o => (
                      <option key={o} value={o}>{p.key === 'validationSplit' ? `${o}%` : o}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Focus Areas */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Focus Areas</h3>
              <span className="text-[10px] font-bold text-indigo-600">{enabledFocusCount} active</span>
            </div>
            <div className="space-y-2">
              {focusAreas.map(fa => (
                <button
                  key={fa.id}
                  onClick={() => toggleFocus(fa.id)}
                  disabled={status === 'training'}
                  className="w-full flex items-center space-x-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                    fa.enabled ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {fa.enabled && <CheckIcon className="w-3 h-3" />}
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{fa.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {status === 'idle' && (
              <button
                onClick={startTraining}
                disabled={totalSamples === 0}
                className="w-full flex items-center justify-center space-x-2 py-3.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
              >
                <PlayIcon className="w-4 h-4" />
                <span>Start Training</span>
              </button>
            )}
            {status === 'training' && (
              <button
                onClick={pauseTraining}
                className="w-full flex items-center justify-center space-x-2 py-3.5 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 transition-all shadow-lg shadow-amber-200"
              >
                <PauseIcon className="w-4 h-4" />
                <span>Pause Training</span>
              </button>
            )}
            {status === 'paused' && (
              <button
                onClick={resumeTraining}
                className="w-full flex items-center justify-center space-x-2 py-3.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <PlayIcon className="w-4 h-4" />
                <span>Resume Training</span>
              </button>
            )}
            {status === 'complete' && (
              <button
                onClick={() => setStatus('idle')}
                className="w-full flex items-center justify-center space-x-2 py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
              >
                <RefreshIcon className="w-4 h-4" />
                <span>New Training Run</span>
              </button>
            )}
          </div>
        </div>

        {/* ─── CENTER: Training Progress (40%) ─── */}
        <div className="xl:w-[40%] space-y-5">

          {/* Progress Bar */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
                  <ActivityIcon className="w-5 h-5 text-emerald-600" />
                  <span>Training Progress</span>
                  {status === 'training' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                </h3>
              </div>
              {(status === 'training' || status === 'paused') && (
                <span className="text-xs text-slate-400">
                  ~{timeRemaining > 1 ? `${Math.round(timeRemaining)} min` : `${Math.round(timeRemaining * 60)}s`} remaining
                </span>
              )}
            </div>

            {/* Epoch + Metrics */}
            <div className="flex items-center space-x-6 mb-4">
              <div>
                <p className="text-2xl font-black text-slate-900">{currentEpoch}<span className="text-sm text-slate-400">/{params.epochs}</span></p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Epochs</p>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-600">{latestMetric?.accuracy || '—'}%</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Accuracy</p>
              </div>
              <div>
                <p className="text-2xl font-black text-amber-600">{latestMetric?.loss || '—'}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Loss</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-1">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  status === 'complete' ? 'bg-indigo-600' :
                  status === 'paused' ? 'bg-amber-500' :
                  'bg-gradient-to-r from-emerald-500 to-teal-500'
                }`}
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-slate-400 text-right">{progressPct}% complete</p>
          </div>

          {/* Accuracy Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 text-sm font-heading mb-3">Accuracy</h3>
            {trainingData.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trainingData}>
                  <defs>
                    <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} fill="url(#accGrad)" name="Training" />
                  <Line type="monotone" dataKey="valAccuracy" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Validation" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-300">
                <div className="text-center">
                  <ChartIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold">Start training to see accuracy curve</p>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-4 mt-2">
              <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1 bg-emerald-500 rounded-full"></span><span>Training</span></span>
              <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1 bg-indigo-500 rounded-full border-dashed"></span><span>Validation</span></span>
            </div>
          </div>

          {/* Loss Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 text-sm font-heading mb-3">Loss</h3>
            {trainingData.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trainingData}>
                  <defs>
                    <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="loss" stroke="#f59e0b" strokeWidth={2} fill="url(#lossGrad)" name="Training" />
                  <Line type="monotone" dataKey="valLoss" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Validation" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-300">
                <div className="text-center">
                  <ChartIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold">Start training to see loss curve</p>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-4 mt-2">
              <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1 bg-amber-500 rounded-full"></span><span>Training</span></span>
              <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1 bg-rose-500 rounded-full"></span><span>Validation</span></span>
            </div>
          </div>

          {/* Training Controls */}
          {(status === 'training' || status === 'paused') && (
            <div className="flex items-center space-x-2">
              <button onClick={() => setShowLogs(!showLogs)} className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                <EyeIcon className="w-3.5 h-3.5" />
                <span>{showLogs ? 'Hide' : 'View'} Logs</span>
              </button>
            </div>
          )}

          {/* Training Logs */}
          {showLogs && trainingData.length > 0 && (
            <div className="bg-slate-900 rounded-2xl p-4 max-h-48 overflow-y-auto">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Training Logs</p>
              <div className="font-mono text-[11px] text-slate-400 space-y-0.5">
                {trainingData.slice(-10).map(d => (
                  <p key={d.epoch}>
                    <span className="text-emerald-400">Epoch {d.epoch}/{params.epochs}</span>
                    {' — '}acc: <span className="text-white">{d.accuracy}%</span>
                    {' — '}loss: <span className="text-amber-400">{d.loss}</span>
                    {' — '}val_acc: <span className="text-indigo-400">{d.valAccuracy}%</span>
                    {' — '}val_loss: <span className="text-rose-400">{d.valLoss}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: Comparison & Validation (30%) ─── */}
        <div className="xl:w-[30%] space-y-5">

          {/* Model Comparison */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm font-heading">Current vs. New Model</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2 text-[10px] font-black text-slate-500 uppercase">Metric</th>
                    <th className="text-right px-4 py-2 text-[10px] font-black text-slate-500 uppercase">Current</th>
                    <th className="text-right px-4 py-2 text-[10px] font-black text-slate-500 uppercase">Trained</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {COMPARISON_METRICS.map(m => {
                    const diff = m.trained - m.current;
                    const pctDiff = m.metric === 'Speed' ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}s` :
                      m.metric === 'Cost/Request' ? `${Math.round((diff / m.current) * 100)}%` :
                      `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
                    return (
                      <tr key={m.metric} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{m.metric}</td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-500">
                          {m.metric === 'Cost/Request' ? `$${m.current}` : `${m.current}${m.unit}`}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-xs font-bold text-slate-800">
                            {m.metric === 'Cost/Request' ? `$${m.trained}` : `${m.trained}${m.unit}`}
                          </span>
                          <span className={`ml-1 text-[10px] font-bold ${m.better ? 'text-emerald-600' : 'text-rose-600'}`}>
                            ({pctDiff})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation Results */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Validation Results</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Test Set Accuracy', value: '93.8%', color: 'emerald' },
                { label: 'Overfitting', value: 'Minimal', color: 'emerald' },
                { label: 'Generalization', value: 'Excellent', color: 'emerald' },
                { label: 'Industry Adaptation', value: '+24% improvement', color: 'indigo' },
              ].map(v => (
                <div key={v.label} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                  <span className="text-xs font-semibold text-slate-600">{v.label}</span>
                  <span className={`text-xs font-black text-${v.color}-600`}>{v.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Business Impact */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg">
            <h3 className="text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-3">Business Impact Forecast</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-indigo-200">Conversion Rate</p>
                <p className="text-xl font-black">+2.3% <span className="text-sm text-indigo-200">expected increase</span></p>
              </div>
              <div>
                <p className="text-[10px] text-indigo-200">Revenue Impact</p>
                <p className="text-xl font-black">+$42K<span className="text-sm text-indigo-200">/month</span></p>
              </div>
              <div>
                <p className="text-[10px] text-indigo-200">Time Saved</p>
                <p className="text-xl font-black">8 hrs<span className="text-sm text-indigo-200">/week</span></p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {status === 'complete' && (
              <button
                onClick={handleDeploy}
                className="w-full flex items-center justify-center space-x-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <BoltIcon className="w-4 h-4" />
                <span>Deploy New Model</span>
              </button>
            )}
            <button
              onClick={handleExportReport}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
            >
              <DownloadIcon className="w-4 h-4" />
              <span>Export Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODEL PERFORMANCE HISTORY                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 font-heading flex items-center space-x-2">
              <ClockIcon className="w-5 h-5 text-violet-600" />
              <span>Model Performance History</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Version control &amp; rollback &middot; {versions.length} versions</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Version</th>
                <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Accuracy</th>
                <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Speed</th>
                <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Cost</th>
                <th className="text-left px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Notes</th>
                <th className="text-right px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {versions.map(v => (
                <tr key={v.version} className={`hover:bg-slate-50/50 transition-colors ${v.active ? 'bg-emerald-50/30' : ''}`}>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-sm text-slate-800">v{v.version}</span>
                      {v.active && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold uppercase">Active</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-600">{v.date}</td>
                  <td className="px-6 py-3.5 text-right">
                    <span className={`text-sm font-bold ${v.accuracy > 92 ? 'text-emerald-600' : v.accuracy > 89 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {v.accuracy}%
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right text-sm font-semibold text-slate-600">{v.speed}</td>
                  <td className="px-6 py-3.5 text-right text-sm font-semibold text-slate-600">{v.cost}</td>
                  <td className="px-6 py-3.5 text-sm text-slate-500">{v.notes}</td>
                  <td className="px-6 py-3.5 text-right">
                    {!v.active ? (
                      showRollbackConfirm === v.version ? (
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleRollback(v.version)}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded-lg text-[10px] font-bold hover:bg-amber-700 transition-all"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setShowRollbackConfirm(null)}
                            className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowRollbackConfirm(v.version)}
                          className="flex items-center space-x-1 px-2.5 py-1 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition-all"
                        >
                          <ArrowLeftIcon className="w-3 h-3" />
                          <span>Rollback</span>
                        </button>
                      )
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600">Deployed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* EXPERIMENT HISTORY SIDEBAR                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showExperiments && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowExperiments(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Experiment History</h3>
                <p className="text-xs text-slate-400 mt-0.5">Previous training runs and their results</p>
              </div>
              <button onClick={() => setShowExperiments(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  { label: 'Total Runs', value: MOCK_EXPERIMENTS.length, color: 'slate' },
                  { label: 'Completed', value: MOCK_EXPERIMENTS.filter(e => e.status === 'completed').length, color: 'emerald' },
                  { label: 'Best Acc', value: `${Math.max(...MOCK_EXPERIMENTS.filter(e => e.status === 'completed').map(e => e.finalAccuracy))}%`, color: 'indigo' },
                ].map((s, i) => (
                  <div key={i} className={`p-3 bg-${s.color}-50 rounded-xl text-center`}>
                    <p className={`text-lg font-black text-${s.color}-700`}>{s.value}</p>
                    <p className={`text-[9px] font-bold text-${s.color}-500 uppercase`}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Experiment Cards */}
              {MOCK_EXPERIMENTS.map(exp => (
                <div key={exp.id} className="p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-slate-800">{exp.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      exp.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                      exp.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {exp.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">{exp.date} &middot; {exp.model} &middot; {exp.duration}</p>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{exp.epochs}</p>
                      <p className="text-[9px] text-slate-400">Epochs</p>
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${exp.finalAccuracy > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {exp.finalAccuracy > 0 ? `${exp.finalAccuracy}%` : '—'}
                      </p>
                      <p className="text-[9px] text-slate-400">Accuracy</p>
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${exp.finalLoss > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {exp.finalLoss > 0 ? exp.finalLoss : '—'}
                      </p>
                      <p className="text-[9px] text-slate-400">Loss</p>
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${exp.improvement > 0 ? 'text-emerald-600' : exp.improvement < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {exp.improvement !== 0 ? `${exp.improvement > 0 ? '+' : ''}${exp.improvement}%` : '—'}
                      </p>
                      <p className="text-[9px] text-slate-400">Δ Accuracy</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODEL BENCHMARKS SIDEBAR                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showBenchmarkPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowBenchmarkPanel(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Industry Benchmarks</h3>
                <p className="text-xs text-slate-400 mt-0.5">How your models compare to industry standards</p>
              </div>
              <button onClick={() => setShowBenchmarkPanel(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Benchmark Chart */}
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Accuracy Benchmarks</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={MODEL_BENCHMARKS.filter(b => b.unit === '%')} layout="vertical" margin={{ left: 80, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis dataKey="metric" type="category" tick={{ fontSize: 10 }} stroke="#94a3b8" width={80} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                    <Bar dataKey="industry" fill="#94a3b8" name="Industry Avg" radius={[0, 4, 4, 0]} barSize={8} />
                    <Bar dataKey="yours" fill="#6366f1" name="Your Model" radius={[0, 4, 4, 0]} barSize={8} />
                    <Bar dataKey="topTen" fill="#10b981" name="Top 10%" radius={[0, 4, 4, 0]} barSize={8} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center space-x-4 mt-2">
                  <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1.5 bg-slate-400 rounded-full"></span><span>Industry</span></span>
                  <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1.5 bg-indigo-500 rounded-full"></span><span>Yours</span></span>
                  <span className="flex items-center space-x-1.5 text-[10px] text-slate-500"><span className="w-3 h-1.5 bg-emerald-500 rounded-full"></span><span>Top 10%</span></span>
                </div>
              </div>

              {/* Detailed Benchmark Cards */}
              {MODEL_BENCHMARKS.map((bm, i) => {
                const isSpeed = bm.unit === 's';
                const isCost = bm.unit === '$';
                const yoursIsBetter = isSpeed || isCost ? bm.yours <= bm.industry : bm.yours >= bm.industry;
                const percentile = isSpeed || isCost
                  ? Math.round(((bm.industry - bm.yours) / bm.industry) * 100)
                  : Math.round(((bm.yours - bm.industry) / bm.industry) * 100);
                return (
                  <div key={i} className="p-4 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-slate-800">{bm.metric}</h4>
                      <span className={`text-xs font-black ${yoursIsBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {yoursIsBetter ? `+${Math.abs(percentile)}% above avg` : `${Math.abs(percentile)}% below avg`}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <p className="text-xs font-bold text-slate-500">{isCost ? '$' : ''}{bm.industry}{bm.unit === '%' ? '%' : bm.unit === 's' ? 's' : ''}</p>
                        <p className="text-[9px] text-slate-400 font-medium">Industry</p>
                      </div>
                      <div className={`text-center p-2 rounded-lg ${yoursIsBetter ? 'bg-indigo-50' : 'bg-rose-50'}`}>
                        <p className={`text-xs font-black ${yoursIsBetter ? 'text-indigo-700' : 'text-rose-700'}`}>{isCost ? '$' : ''}{bm.yours}{bm.unit === '%' ? '%' : bm.unit === 's' ? 's' : ''}</p>
                        <p className="text-[9px] text-indigo-500 font-medium">Yours</p>
                      </div>
                      <div className="text-center p-2 bg-emerald-50 rounded-lg">
                        <p className="text-xs font-bold text-emerald-700">{isCost ? '$' : ''}{bm.topTen}{bm.unit === '%' ? '%' : bm.unit === 's' ? 's' : ''}</p>
                        <p className="text-[9px] text-emerald-500 font-medium">Top 10%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DATA QUALITY INSIGHTS SIDEBAR                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showDataInsights && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowDataInsights(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Data Quality Insights</h3>
                <p className="text-xs text-slate-400 mt-0.5">Quality analysis of your training datasets</p>
              </div>
              <button onClick={() => setShowDataInsights(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Overall Data Health */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-100">
                <p className="text-xs font-black text-indigo-700 uppercase tracking-wider mb-2">Overall Data Health</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-2xl font-black text-indigo-900">{totalSamples.toLocaleString()}</p>
                    <p className="text-[10px] text-indigo-500 font-bold">Total Samples</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-700">
                      {dataInsights.length > 0 ? Math.round(dataInsights.reduce((s, d) => s + d.quality, 0) / dataInsights.length) : 0}%
                    </p>
                    <p className="text-[10px] text-emerald-600 font-bold">Avg Quality</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-violet-700">
                      {dataInsights.length > 0 ? Math.round(dataInsights.reduce((s, d) => s + d.coverage, 0) / dataInsights.length) : 0}%
                    </p>
                    <p className="text-[10px] text-violet-500 font-bold">Avg Coverage</p>
                  </div>
                </div>
              </div>

              {/* Per-Dataset Quality */}
              {dataInsights.map((ds, i) => (
                <div key={i} className={`p-4 rounded-xl border ${ds.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{ds.name}</h4>
                      <p className="text-[10px] text-slate-400">{ds.samples.toLocaleString()} samples &middot; {ds.enabled ? 'Enabled' : 'Disabled'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      ds.freshness === 'Fresh' ? 'bg-emerald-50 text-emerald-700' :
                      ds.freshness === 'Recent' ? 'bg-blue-50 text-blue-700' :
                      ds.freshness === 'Aging' ? 'bg-amber-50 text-amber-700' :
                      'bg-rose-50 text-rose-700'
                    }`}>
                      {ds.freshness}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-slate-500">Quality Score</span>
                        <span className={`font-black ${ds.quality >= 85 ? 'text-emerald-600' : ds.quality >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{ds.quality}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div
                          className={`h-full rounded-full ${ds.quality >= 85 ? 'bg-emerald-500' : ds.quality >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${ds.quality}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-slate-500">Feature Coverage</span>
                        <span className="font-black text-indigo-600">{ds.coverage}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${ds.coverage}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Recommendations */}
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
                  <p className="text-xs font-black text-amber-700 uppercase tracking-wider">Suggestions</p>
                </div>
                <div className="space-y-1.5">
                  {dataInsights.filter(d => !d.enabled).length > 0 && (
                    <p className="text-xs text-amber-700">Enable {dataInsights.filter(d => !d.enabled).length} disabled dataset(s) for broader training coverage.</p>
                  )}
                  {dataInsights.some(d => d.quality < 80) && (
                    <p className="text-xs text-amber-700">Some datasets have low quality scores. Consider data cleaning.</p>
                  )}
                  {dataInsights.some(d => d.freshness === 'Stale' || d.freshness === 'Aging') && (
                    <p className="text-xs text-amber-700">Update aging datasets with fresh data for better model accuracy.</p>
                  )}
                  <p className="text-xs text-amber-700">Adding more customer feedback data could improve personalization by ~12%.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS MODAL                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {[
                { key: 'R / Enter', label: 'Start training (when idle)' },
                { key: 'Space', label: 'Pause/Resume training' },
                { key: 'E', label: 'Export training report' },
                { key: 'X', label: 'Toggle experiment history' },
                { key: 'B', label: 'Toggle benchmarks panel' },
                { key: 'D', label: 'Toggle data quality insights' },
                { key: 'P', label: 'Toggle hyperparameter presets' },
                { key: '?', label: 'Toggle this shortcuts panel' },
                { key: 'Esc', label: 'Close all panels' },
              ].map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <span className="text-sm text-slate-600">{shortcut.label}</span>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-500">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelTraining;
