import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangleIcon, XIcon, SparklesIcon } from '../Icons';
import type { AiThresholdWarning } from '../../lib/aiUsage.service';

/** Warning with optional upgrade suggestion. Compatible with AiThresholdWarning. */
export interface CreditWarning extends AiThresholdWarning {
  creditsRemaining: number;
  upgradePlan?: string;
}

type WarningProp = CreditWarning | AiThresholdWarning;

interface AiWarningBannerProps {
  warning: WarningProp;
}

const AiWarningBanner: React.FC<AiWarningBannerProps> = ({ warning }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isCritical = warning.level === 'critical';
  const isWarning = warning.level === 'warning';
  const remaining = warning.creditsLimit - warning.creditsUsed;
  const hasUpgradePlan = 'upgradePlan' in warning && warning.upgradePlan;
  const percent = warning.percent;

  const bgClass = isCritical
    ? 'bg-red-50 border border-red-200'
    : isWarning
      ? 'bg-amber-50 border border-amber-200'
      : 'bg-blue-50 border border-blue-200';

  const iconBgClass = isCritical
    ? 'bg-red-100'
    : isWarning
      ? 'bg-amber-100'
      : 'bg-blue-100';

  const textClass = isCritical
    ? 'text-red-800'
    : isWarning
      ? 'text-amber-800'
      : 'text-blue-800';

  const subTextClass = isCritical
    ? 'text-red-600'
    : isWarning
      ? 'text-amber-600'
      : 'text-blue-600';

  const btnClass = isCritical
    ? 'bg-red-600 text-white hover:bg-red-700'
    : isWarning
      ? 'bg-amber-500 text-white hover:bg-amber-600'
      : 'bg-blue-500 text-white hover:bg-blue-600';

  const dismissClass = isCritical
    ? 'text-red-300 hover:text-red-500'
    : isWarning
      ? 'text-amber-300 hover:text-amber-500'
      : 'text-blue-300 hover:text-blue-500';

  return (
    <div className={`rounded-xl p-4 flex items-center justify-between gap-4 mb-4 ${bgClass}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${iconBgClass}`}>
          {isCritical
            ? <AlertTriangleIcon className="w-5 h-5 text-red-500" />
            : <SparklesIcon className={`w-5 h-5 ${isWarning ? 'text-amber-500' : 'text-blue-500'}`} />
          }
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${textClass}`}>
            {warning.message}
          </p>
          <p className={`text-xs mt-0.5 ${subTextClass}`}>
            {warning.creditsUsed.toLocaleString()} of {warning.creditsLimit.toLocaleString()} credits used.
            {hasUpgradePlan && ` Upgrade for ${isCritical ? 'more' : 'additional'} AI capacity.`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/portal/billing"
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${btnClass}`}
        >
          {hasUpgradePlan ? 'Upgrade' : 'View Usage'}
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className={`p-1 rounded-md transition-colors ${dismissClass}`}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AiWarningBanner;
