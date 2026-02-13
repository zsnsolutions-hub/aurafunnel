import React, { useState } from 'react';
import { AIInsight } from '../../types';
import { SparklesIcon, RefreshIcon, FlameIcon, ClockIcon, ChartIcon, TargetIcon, BoltIcon } from '../Icons';

interface AIInsightsPanelProps {
  insights: AIInsight[];
  loading: boolean;
  onRefresh: () => void;
  onDeepAnalysis?: () => void;
  deepAnalysisLoading?: boolean;
  deepAnalysisResult?: string | null;
}

const categoryIcon = (category: AIInsight['category']) => {
  switch (category) {
    case 'score': return <BoltIcon className="w-4 h-4" />;
    case 'timing': return <ClockIcon className="w-4 h-4" />;
    case 'company': return <TargetIcon className="w-4 h-4" />;
    case 'conversion': return <ChartIcon className="w-4 h-4" />;
    case 'engagement': return <FlameIcon className="w-4 h-4" />;
    default: return <SparklesIcon className="w-4 h-4" />;
  }
};

const categoryColor = (category: AIInsight['category']) => {
  switch (category) {
    case 'score': return 'bg-indigo-50 text-indigo-600';
    case 'timing': return 'bg-blue-50 text-blue-600';
    case 'company': return 'bg-purple-50 text-purple-600';
    case 'conversion': return 'bg-emerald-50 text-emerald-600';
    case 'engagement': return 'bg-orange-50 text-orange-600';
    default: return 'bg-slate-50 text-slate-600';
  }
};

const AIInsightsPanel: React.FC<AIInsightsPanelProps> = ({
  insights,
  loading,
  onRefresh,
  onDeepAnalysis,
  deepAnalysisLoading,
  deepAnalysisResult
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 font-heading">AI Insights</h3>
            <p className="text-xs text-slate-400">{insights.length} recommendation{insights.length !== 1 ? 's' : ''} generated</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {onDeepAnalysis && (
            <button
              onClick={onDeepAnalysis}
              disabled={deepAnalysisLoading}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>{deepAnalysisLoading ? 'Analyzing...' : 'Deep Analysis'}</span>
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading && insights.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-slate-50 animate-pulse rounded-xl"></div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <p className="text-center text-slate-400 text-sm italic py-8">No insights available yet. Add more leads to generate recommendations.</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="p-4 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all cursor-pointer"
                onClick={() => setExpanded(expanded === insight.id ? null : insight.id)}
              >
                <div className="flex items-start space-x-3">
                  <div className={`p-2 rounded-lg ${categoryColor(insight.category)} flex-shrink-0`}>
                    {categoryIcon(insight.category)}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800">{insight.title}</h4>
                      <span className="text-[10px] font-bold text-slate-400 ml-2 flex-shrink-0">{insight.confidence}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                        style={{ width: `${insight.confidence}%` }}
                      ></div>
                    </div>
                    {expanded === insight.id && (
                      <div className="mt-3 animate-in fade-in duration-200">
                        <p className="text-xs text-slate-500 leading-relaxed">{insight.description}</p>
                        {insight.action && (
                          <span className="inline-block mt-2 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                            {insight.action}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {deepAnalysisResult && (
          <div className="mt-4 p-4 bg-slate-950 rounded-xl">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Gemini Deep Analysis</p>
            <p className="text-sm text-indigo-100 leading-relaxed whitespace-pre-wrap font-mono">{deepAnalysisResult}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInsightsPanel;
