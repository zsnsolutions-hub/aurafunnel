import React from 'react';
import { Drawer } from '../ui/Drawer';
import { ScoreGauge } from './ScoreGauge';
import { BoltIcon, ClockIcon, BrainIcon } from '../Icons';
import type { TriggerAnalyticsData } from './types';

interface TriggerAnalyticsDrawerProps {
  open: boolean;
  onClose: () => void;
  triggerAnalytics: TriggerAnalyticsData;
}

export const TriggerAnalyticsDrawer: React.FC<TriggerAnalyticsDrawerProps> = ({
  open,
  onClose,
  triggerAnalytics,
}) => {
  const {
    triggerTypes,
    totalFired,
    totalConverted,
    overallConversion,
    weeklyTrend,
    peakHour,
  } = triggerAnalytics;

  const maxWeeklyCount = Math.max(...weeklyTrend.map((d) => d.count), 1);

  const getInsightText = (): string => {
    if (overallConversion >= 15) {
      return 'Outstanding trigger performance! Your conversion rate exceeds industry benchmarks. Consider scaling trigger volume to capture more leads.';
    }
    if (overallConversion >= 8) {
      return 'Good trigger conversion rate. Fine-tune trigger timing and conditions to push past the 15% threshold for elite performance.';
    }
    return 'Trigger conversion is below target. Review trigger conditions, ensure proper audience targeting, and consider A/B testing trigger timing.';
  };

  return (
    <Drawer open={open} onClose={onClose} title="Trigger Analytics">
      <div className="space-y-6">
        {/* Overview Score */}
        <div className="text-center">
          <ScoreGauge
            value={overallConversion}
            max={30}
            label="CONV"
            thresholds={{ good: 50, warn: 27 }}
          />
          <p className="mt-2 text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{totalFired.toLocaleString()}</span> triggers fired
          </p>
          <p className="text-xs text-gray-400">
            <span className="font-medium text-emerald-600">{totalConverted.toLocaleString()}</span> converted
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-xs font-medium text-gray-500">Fired</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{totalFired.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-xs font-medium text-gray-500">Converted</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">{totalConverted.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-xs font-medium text-gray-500">Conv Rate</p>
            <p className="mt-1 text-lg font-bold text-rose-600">{overallConversion.toFixed(1)}%</p>
          </div>
        </div>

        {/* Trigger Performance Breakdown */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Trigger Performance</h3>
          <div className="space-y-2">
            {triggerTypes.map((t) => (
              <div
                key={t.type}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
                    <BoltIcon className="w-4 h-4 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.label}</p>
                    <p className="text-xs text-gray-400">
                      {t.fired} fired &middot; {t.converted} conv
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{t.conversionRate.toFixed(1)}%</p>
                  <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
                    <ClockIcon className="w-3 h-3" />
                    <span>{t.avgResponseTime.toFixed(1)}s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 7-Day Trigger Volume */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">7-Day Trigger Volume</h3>
          <div className="rounded-xl bg-gray-900 p-4">
            <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
              {weeklyTrend.map((d) => {
                const heightPct = maxWeeklyCount > 0 ? (d.count / maxWeeklyCount) * 100 : 0;
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-medium text-rose-300">{d.count}</span>
                    <div className="w-full flex items-end" style={{ height: 80 }}>
                      <div
                        className="w-full rounded-t-md bg-rose-500"
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Peak Activity */}
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
            <ClockIcon className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-amber-800">Peak Activity</p>
            <p className="text-sm font-semibold text-amber-900">
              {peakHour.label} &mdash; {peakHour.triggers} triggers
            </p>
          </div>
        </div>

        {/* AI Trigger Insight */}
        <div className="rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 p-4 text-white">
          <div className="mb-2 flex items-center gap-2">
            <BrainIcon className="w-4 h-4 text-white" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">
              AI Trigger Insight
            </span>
          </div>
          <p className="text-sm leading-relaxed text-white/90">{getInsightText()}</p>
        </div>
      </div>
    </Drawer>
  );
};
