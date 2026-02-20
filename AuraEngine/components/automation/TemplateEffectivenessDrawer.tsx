import React from 'react';
import { Drawer } from '../ui/Drawer';
import { ScoreGauge } from './ScoreGauge';
import { BrainIcon } from '../Icons';
import type { TemplateEffectivenessData } from './types';

interface TemplateEffectivenessDrawerProps {
  open: boolean;
  onClose: () => void;
  templateEffectiveness: TemplateEffectivenessData;
}

export const TemplateEffectivenessDrawer: React.FC<TemplateEffectivenessDrawerProps> = ({
  open,
  onClose,
  templateEffectiveness,
}) => {
  const {
    templates,
    aiLift,
    avgAiOpenRate,
    avgNonAiOpenRate,
    timingPerformance,
    bestTemplate,
    totalSent,
  } = templateEffectiveness;

  const sortedTemplates = [...templates].sort((a, b) => b.conversionScore - a.conversionScore);
  const maxTimingOpen = Math.max(...timingPerformance.map((t) => t.openRate), 1);

  const getInsightText = (): string => {
    if (bestTemplate.conversionScore >= 80) {
      return `"${bestTemplate.label}" is a top performer with a ${bestTemplate.conversionScore} conversion score. Replicate its structure and tone across other templates to boost overall engagement.`;
    }
    if (bestTemplate.conversionScore >= 50) {
      return `Your best template scores ${bestTemplate.conversionScore}/100. Consider testing subject line variations and stronger CTAs to break into the 80+ elite tier.`;
    }
    return `Template performance needs attention. Focus on AI-enhanced personalization, compelling subject lines, and clear calls to action to improve conversion scores.`;
  };

  return (
    <Drawer open={open} onClose={onClose} title="Template Effectiveness">
      <div className="space-y-6">
        {/* Quality Gauge */}
        <div className="text-center">
          <ScoreGauge
            value={bestTemplate.conversionScore}
            max={100}
            label="TOP SCORE"
          />
          <p className="mt-2 text-sm font-semibold text-gray-900">{bestTemplate.label}</p>
          <p className="text-xs text-gray-400">
            {totalSent.toLocaleString()} total sent
          </p>
        </div>

        {/* AI Personalization Impact */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">AI Personalization Impact</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-sky-50 p-3 text-center">
              <p className="text-xs font-medium text-sky-600">AI Open Rate</p>
              <p className="mt-1 text-lg font-bold text-sky-700">{avgAiOpenRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">Standard Rate</p>
              <p className="mt-1 text-lg font-bold text-gray-700">{avgNonAiOpenRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-xs font-medium text-emerald-600">AI Lift</p>
              <p className="mt-1 text-lg font-bold text-emerald-700">+{aiLift.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        {/* Template Rankings */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Template Rankings</h3>
          <div className="space-y-2">
            {sortedTemplates.map((t, i) => (
              <div
                key={t.id}
                className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{t.label}</p>
                      {t.aiEnhanced && (
                        <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                          AI
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-gray-400">Sent</p>
                        <p className="text-xs font-semibold text-gray-700">{t.sent.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Open</p>
                        <p className="text-xs font-semibold text-gray-700">{t.openRate.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Click</p>
                        <p className="text-xs font-semibold text-gray-700">{t.clickRate.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Reply</p>
                        <p className="text-xs font-semibold text-gray-700">{t.replyRate.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Send Timing Analysis */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Send Timing Analysis</h3>
          <div className="space-y-2">
            {timingPerformance.map((t) => {
              const widthPct = maxTimingOpen > 0 ? (t.openRate / maxTimingOpen) * 100 : 0;
              return (
                <div key={t.timing} className="rounded-xl border border-gray-100 bg-white p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-700">{t.label}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Open: <span className="font-semibold text-gray-900">{t.openRate.toFixed(1)}%</span></span>
                      <span>Click: <span className="font-semibold text-gray-900">{t.clickRate.toFixed(1)}%</span></span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-sky-500"
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Template Insight */}
        <div className="rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 p-4 text-white">
          <div className="mb-2 flex items-center gap-2">
            <BrainIcon className="w-4 h-4 text-white" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">
              AI Template Insight
            </span>
          </div>
          <p className="text-sm leading-relaxed text-white/90">{getInsightText()}</p>
        </div>
      </div>
    </Drawer>
  );
};
