import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon, BoltIcon, ArrowRightIcon, XIcon, CheckIcon } from '../Icons';
import { PLANS, resolvePlanName } from '../../lib/credits';
import { OUTBOUND_LIMITS } from '../../lib/planLimits';
import type { LimitType } from '../../lib/usageTracker';

interface UpgradeModalProps {
  limitType: LimitType;
  currentPlan: string;
  onClose: () => void;
}

const LIMIT_MESSAGES: Record<LimitType, { title: string; description: string }> = {
  DAILY_EMAIL: {
    title: 'Daily Email Limit Reached',
    description: 'You\u2019ve sent the maximum number of emails allowed per inbox today.',
  },
  MONTHLY_EMAIL: {
    title: 'Monthly Email Limit Reached',
    description: 'You\u2019ve reached your monthly email sending quota.',
  },
  DAILY_LINKEDIN: {
    title: 'Daily LinkedIn Limit Reached',
    description: 'You\u2019ve used all your LinkedIn actions for today.',
  },
  MONTHLY_LINKEDIN: {
    title: 'Monthly LinkedIn Limit Reached',
    description: 'You\u2019ve reached your monthly LinkedIn action quota.',
  },
};

function formatLimit(value: number): string {
  return value >= 1_000 ? `${(value / 1_000).toLocaleString()}k` : value.toLocaleString();
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ limitType, currentPlan, onClose }) => {
  const navigate = useNavigate();
  const resolved = resolvePlanName(currentPlan);
  const msg = LIMIT_MESSAGES[limitType];

  // Find current and next plan
  const planIndex = PLANS.findIndex((p) => p.name === resolved);
  const current = PLANS[planIndex] ?? PLANS[0];
  const next = PLANS[planIndex + 1];

  const currentLimits = OUTBOUND_LIMITS[current.name] ?? OUTBOUND_LIMITS.Starter;
  const nextLimits = next ? OUTBOUND_LIMITS[next.name] : null;

  const handleUpgrade = () => {
    onClose();
    navigate('/portal/billing');
  };

  const comparisonRows: { label: string; currentVal: string; nextVal: string | null }[] = [
    { label: 'Connected Inboxes', currentVal: String(currentLimits.maxInboxes), nextVal: nextLimits ? String(nextLimits.maxInboxes) : null },
    { label: 'Emails / day / inbox', currentVal: String(currentLimits.emailsPerDayPerInbox), nextVal: nextLimits ? String(nextLimits.emailsPerDayPerInbox) : null },
    { label: 'Emails / month', currentVal: formatLimit(currentLimits.emailsPerMonth), nextVal: nextLimits ? formatLimit(nextLimits.emailsPerMonth) : null },
    { label: 'LinkedIn / day', currentVal: String(currentLimits.linkedInPerDay), nextVal: nextLimits ? String(nextLimits.linkedInPerDay) : null },
    { label: 'LinkedIn / month', currentVal: formatLimit(currentLimits.linkedInPerMonth), nextVal: nextLimits ? formatLimit(nextLimits.linkedInPerMonth) : null },
  ];

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
          <div className="mx-auto w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-5">
            <AlertTriangleIcon className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-heading">{msg.title}</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed max-w-sm mx-auto">{msg.description}</p>
        </div>

        {/* Plan comparison */}
        {next && nextLimits && (
          <div className="mx-8 mb-6 rounded-2xl border border-slate-200 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-3 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 px-5 py-3 border-b border-slate-200">
              <span>Limit</span>
              <span className="text-center">{current.name}</span>
              <span className="text-center text-indigo-600">{next.name}</span>
            </div>

            {/* Rows */}
            {comparisonRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-3 px-5 py-3 border-b border-slate-100 last:border-b-0 text-sm"
              >
                <span className="text-slate-600 font-medium">{row.label}</span>
                <span className="text-center text-slate-400 font-bold">{row.currentVal}</span>
                <span className="text-center text-indigo-600 font-bold">{row.nextVal}</span>
              </div>
            ))}

            {/* Price row */}
            <div className="grid grid-cols-3 px-5 py-3 bg-slate-50 border-t border-slate-200 text-sm">
              <span className="text-slate-600 font-bold">Price</span>
              <span className="text-center text-slate-400 font-bold">${current.price}/mo</span>
              <span className="text-center text-indigo-600 font-bold">${next.price}/mo</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-8 pb-8 space-y-3">
          {next ? (
            <button
              onClick={handleUpgrade}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-2"
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
              <p className="text-slate-400 text-xs">Your limits will reset at the start of the next period.</p>
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

export default UpgradeModal;
