import React from 'react';
import { Drawer } from '../ui/Drawer';
import { BrainIcon } from '../Icons';
import type { RoiCalculation } from './types';

interface ROICalculatorDrawerProps {
  open: boolean;
  onClose: () => void;
  roiCalculation: RoiCalculation;
  workflowRoi: number;
}

export const ROICalculatorDrawer: React.FC<ROICalculatorDrawerProps> = ({ open, onClose, roiCalculation, workflowRoi }) => {
  const { manualCost, automatedCost, savings, savingsPct, totalTimeSaved, costPerLead, conversionLift, revenueImpact, monthlyBreakdown, totalLeads } = roiCalculation;

  const maxMonthlySavings = Math.max(...monthlyBreakdown.map(m => m.savings), 1);
  const maxCost = Math.max(manualCost, automatedCost, 1);

  const getAiInsight = () => {
    if (savingsPct >= 70) {
      return `Outstanding ROI! Your automation is saving ${savingsPct}% compared to manual processes. You're processing ${totalLeads} leads at a fraction of the cost. Consider scaling your workflows to capture even more value.`;
    } else if (savingsPct >= 40) {
      return `Strong ROI performance! With ${savingsPct}% savings and ${totalTimeSaved}hrs saved, your automation is delivering solid returns. Optimize your action nodes with AI personalization to push savings even higher.`;
    } else {
      return `Your automation is saving ${savingsPct}% so far. To improve ROI, consider adding more AI-powered action steps and optimizing your trigger conditions. Even small improvements can significantly boost your cost per lead.`;
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="ROI Calculator">
      <div className="space-y-5">
        {/* Savings Headline Card */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5">
          <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Total Savings</div>
          <div className="text-3xl font-black text-emerald-700">${savings.toLocaleString()}</div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <div className="text-lg font-bold text-emerald-600">{savingsPct}%</div>
              <div className="text-[10px] font-semibold text-emerald-500/70 uppercase tracking-wider">Savings %</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-600">{totalTimeSaved}hrs</div>
              <div className="text-[10px] font-semibold text-emerald-500/70 uppercase tracking-wider">Time Saved</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-600">{totalLeads.toLocaleString()}</div>
              <div className="text-[10px] font-semibold text-emerald-500/70 uppercase tracking-wider">Leads Processed</div>
            </div>
          </div>
        </div>

        {/* Cost Comparison */}
        <div className="border border-gray-100 rounded-xl p-4 bg-white">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Cost Comparison</div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">Manual Process</span>
                <span className="text-xs font-bold text-slate-800">${manualCost.toLocaleString()}</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-400 rounded-full transition-all duration-500"
                  style={{ width: `${(manualCost / maxCost) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">Automated Process</span>
                <span className="text-xs font-bold text-emerald-600">${automatedCost.toLocaleString()}</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(automatedCost / maxCost) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 6-Month Savings Trend */}
        <div className="border border-gray-100 rounded-xl p-4 bg-white">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">6-Month Savings Trend</div>
          <div className="flex items-end gap-2 h-32">
            {monthlyBreakdown.map((month, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] font-bold text-emerald-600">${month.savings}</div>
                <div
                  className="w-full bg-slate-800 rounded-t-md transition-all duration-500"
                  style={{ height: `${(month.savings / maxMonthlySavings) * 100}%`, minHeight: '4px' }}
                />
                <div className="text-[9px] font-medium text-slate-400">{month.month}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Impact Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-gray-100 rounded-xl p-3.5 bg-white text-center">
            <div className="text-lg font-black text-slate-800">${costPerLead.toFixed(2)}</div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cost per Lead</div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3.5 bg-white text-center">
            <div className="text-lg font-black text-indigo-600">+{conversionLift}%</div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Conversion Lift</div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3.5 bg-white text-center">
            <div className="text-lg font-black text-emerald-600">${revenueImpact.toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Revenue Impact</div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3.5 bg-white text-center">
            <div className="text-lg font-black text-amber-600">{workflowRoi}%</div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Overall ROI</div>
          </div>
        </div>

        {/* AI ROI Insight */}
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BrainIcon className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">AI ROI Insight</span>
          </div>
          <p className="text-sm text-indigo-800/80 leading-relaxed">{getAiInsight()}</p>
        </div>
      </div>
    </Drawer>
  );
};
