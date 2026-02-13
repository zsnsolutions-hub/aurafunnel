import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import {
  SparklesIcon, CogIcon, ChartIcon, TargetIcon, BoltIcon, RefreshIcon,
  CheckIcon, XIcon, TrendUpIcon, TrendDownIcon, ClockIcon, DownloadIcon,
  PlayIcon, PauseIcon, SlidersIcon, ShieldIcon, ActivityIcon, StarIcon,
  FlameIcon, EyeIcon, ArrowLeftIcon
} from '../../components/Icons';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
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
        <div className="flex items-center space-x-3">
          <span className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
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
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600">
            <TargetIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span>Active Model: Gemini Flash v{deployedVersion}</span>
          </div>
        </div>
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
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Training Parameters</h3>
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
    </div>
  );
};

export default ModelTraining;
