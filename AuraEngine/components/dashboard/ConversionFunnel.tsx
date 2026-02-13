import React from 'react';
import { FunnelStage } from '../../types';
import { ChartIcon } from '../Icons';

interface ConversionFunnelProps {
  stages: FunnelStage[];
  loading: boolean;
}

const ConversionFunnel: React.FC<ConversionFunnelProps> = ({ stages, loading }) => {
  const maxCount = stages.length > 0 ? Math.max(...stages.map(s => s.count)) : 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
          <ChartIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 font-heading">Conversion Funnel</h3>
          <p className="text-xs text-slate-400">Lead progression through pipeline stages</p>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-slate-50 animate-pulse rounded-xl" style={{ width: `${100 - i * 15}%`, margin: '0 auto' }}></div>
            ))}
          </div>
        ) : stages.length === 0 || stages.every(s => s.count === 0) ? (
          <p className="text-center text-slate-400 text-sm italic py-8">No funnel data available yet.</p>
        ) : (
          <div className="space-y-4">
            {stages.map((stage, index) => {
              const widthPct = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 8) : 8;
              return (
                <div key={stage.label} className="flex items-center space-x-4">
                  <div className="w-24 flex-shrink-0 text-right">
                    <p className="text-xs font-bold text-slate-700">{stage.label}</p>
                    <p className="text-[10px] text-slate-400">{stage.percentage}%</p>
                  </div>
                  <div className="flex-grow">
                    <div className="relative h-10 rounded-xl overflow-hidden bg-slate-50">
                      <div
                        className="h-full rounded-xl flex items-center justify-end pr-3 transition-all duration-1000 ease-out"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: stage.color,
                          animationDelay: `${index * 150}ms`
                        }}
                      >
                        <span className="text-white text-xs font-bold drop-shadow-sm">{stage.count}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversionFunnel;
