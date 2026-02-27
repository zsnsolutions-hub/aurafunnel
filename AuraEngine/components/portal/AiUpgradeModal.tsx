import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon, BoltIcon, ArrowRightIcon, XIcon, CheckIcon, SparklesIcon } from '../Icons';
import { PLANS, resolvePlanName } from '../../lib/credits';
import { AI_PLAN_CONFIG } from '../../lib/pricing.config';
import type { AiLimitError, AiUsageSnapshot } from '../../lib/aiUsage.service';

interface AiUpgradeModalProps {
  error: AiLimitError;
  currentPlan: string;
  usage?: AiUsageSnapshot | null;
  onClose: () => void;
}

const AiUpgradeModal: React.FC<AiUpgradeModalProps> = ({ error, currentPlan, usage, onClose }) => {
  const navigate = useNavigate();
  const resolved = resolvePlanName(currentPlan);

  const isNoAI = error.code === 'AI_NOT_AVAILABLE';
  const title = isNoAI ? 'AI Features Unavailable' : 'AI Credits Exhausted';
  const description = isNoAI
    ? 'Your current plan doesn\u2019t include AI features. Upgrade to unlock AI-powered drafts, rewrites, and personalization.'
    : 'You\u2019ve used all your AI credits for this month. Your credits will reset at the start of next month, or you can upgrade for more.';

  // Build plan comparison
  const planIndex = PLANS.findIndex((p) => p.name === resolved);
  const current = PLANS[planIndex] ?? PLANS[0];
  const next = PLANS[planIndex + 1];

  const currentAi = AI_PLAN_CONFIG[current.name] ?? AI_PLAN_CONFIG.Starter;
  const nextAi = next ? AI_PLAN_CONFIG[next.name] : null;

  const comparisonRows = [
    {
      label: 'AI Credits / month',
      currentVal: currentAi.hasAI ? currentAi.aiCreditsMonthly.toLocaleString() : 'None',
      nextVal: nextAi ? nextAi.aiCreditsMonthly.toLocaleString() : null,
    },
    {
      label: 'AI Drafts & Rewrites',
      currentVal: currentAi.hasAI ? 'Included' : '\u2014',
      nextVal: nextAi?.hasAI ? 'Included' : null,
    },
    {
      label: 'AI Personalization',
      currentVal: currentAi.aiFeatures.some(f => f.includes('personalization')) ? 'Included' : '\u2014',
      nextVal: nextAi?.aiFeatures.some(f => f.includes('personalization')) ? (nextAi.aiFeatures.some(f => f.includes('Advanced')) ? 'Advanced' : 'Included') : null,
    },
    {
      label: 'Price',
      currentVal: `$${current.price}/mo`,
      nextVal: next ? `$${next.price}/mo` : null,
    },
  ];

  const handleUpgrade = () => {
    onClose();
    navigate('/portal/billing');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-500"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-3xl overflow-hidden animate-in zoom-in-95 duration-500">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-300 hover:text-slate-500 transition-colors z-10"
        >
          <XIcon className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="mx-auto w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mb-5">
            <SparklesIcon className="w-7 h-7 text-violet-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-heading">{title}</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed max-w-sm mx-auto">{description}</p>
        </div>

        {/* Usage bar (only when credits are exhausted, not when AI is unavailable) */}
        {!isNoAI && usage && usage.creditsLimit > 0 && (
          <div className="mx-8 mb-5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-500 font-bold">Credits used</span>
              <span className="text-slate-900 font-bold">
                {usage.creditsUsed.toLocaleString()} / {usage.creditsLimit.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
                style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Credits reset at the start of each billing month.</p>
          </div>
        )}

        {/* Plan comparison */}
        {next && nextAi && (
          <div className="mx-8 mb-6 rounded-2xl border border-slate-200 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-3 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 px-5 py-3 border-b border-slate-200">
              <span>Feature</span>
              <span className="text-center">{current.name}</span>
              <span className="text-center text-violet-600">{next.name}</span>
            </div>

            {/* Rows */}
            {comparisonRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-3 px-5 py-3 border-b border-slate-100 last:border-b-0 text-sm"
              >
                <span className="text-slate-600 font-medium">{row.label}</span>
                <span className="text-center text-slate-400 font-bold">{row.currentVal}</span>
                <span className="text-center text-violet-600 font-bold">{row.nextVal}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="px-8 pb-8 space-y-3">
          {next ? (
            <button
              onClick={handleUpgrade}
              className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-violet-100 hover:bg-violet-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              <BoltIcon className="w-5 h-5" />
              <span>Upgrade to {next.name}</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          ) : (
            <div className="text-center py-4">
              <div className="inline-flex items-center space-x-2 text-emerald-600 mb-2">
                <CheckIcon className="w-5 h-5" />
                <span className="font-bold text-sm">You&apos;re on our highest plan</span>
              </div>
              <p className="text-slate-400 text-xs">Your credits will reset at the start of the next billing month.</p>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiUpgradeModal;
