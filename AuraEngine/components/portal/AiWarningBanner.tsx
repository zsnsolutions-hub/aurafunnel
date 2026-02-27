import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangleIcon, XIcon, SparklesIcon } from '../Icons';
import type { AiThresholdWarning } from '../../lib/aiUsage.service';

interface AiWarningBannerProps {
  warning: AiThresholdWarning;
}

const AiWarningBanner: React.FC<AiWarningBannerProps> = ({ warning }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isCritical = warning.level === 'critical';
  const remaining = warning.creditsLimit - warning.creditsUsed;

  return (
    <div
      className={`rounded-xl p-4 flex items-center justify-between gap-4 mb-4 ${
        isCritical
          ? 'bg-red-50 border border-red-200'
          : 'bg-amber-50 border border-amber-200'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
          isCritical ? 'bg-red-100' : 'bg-amber-100'
        }`}>
          {isCritical
            ? <AlertTriangleIcon className="w-5 h-5 text-red-500" />
            : <SparklesIcon className="w-5 h-5 text-amber-500" />
          }
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
            {isCritical
              ? `Almost out of AI credits \u2014 ${remaining.toLocaleString()} remaining`
              : `${warning.percent}% of AI credits used this month`
            }
          </p>
          <p className={`text-xs mt-0.5 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
            {isCritical
              ? 'AI will pause when credits run out. Upgrade to keep generating.'
              : `${warning.creditsUsed.toLocaleString()} of ${warning.creditsLimit.toLocaleString()} credits used. Consider upgrading for more capacity.`
            }
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/portal/billing"
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            isCritical
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          Upgrade
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className={`p-1 rounded-md transition-colors ${
            isCritical ? 'text-red-300 hover:text-red-500' : 'text-amber-300 hover:text-amber-500'
          }`}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AiWarningBanner;
