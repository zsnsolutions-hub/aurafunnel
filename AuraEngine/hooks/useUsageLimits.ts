import { useState, useEffect, useCallback } from 'react';
import {
  checkEmailAllowed,
  checkLinkedInAllowed,
  checkThreshold,
} from '../lib/usageTracker';
import type { LimitError, ThresholdWarning } from '../lib/usageTracker';

interface UseUsageLimitsReturn {
  /** Active threshold warnings (80%+ usage). Refreshed on mount and after checks. */
  warnings: ThresholdWarning[];
  /** Check if sending an email from this inbox is allowed. Returns true if OK. */
  checkEmail: (inboxId: string) => Promise<boolean>;
  /** Check if a LinkedIn action is allowed. Returns true if OK. */
  checkLinkedIn: () => Promise<boolean>;
  /** Set when a limit check fails — use to drive the UpgradeModal. */
  limitError: LimitError | null;
  /** Clear the current limit error (e.g. after the modal is dismissed). */
  clearError: () => void;
}

export function useUsageLimits(
  workspaceId: string | undefined,
  planName: string | undefined,
): UseUsageLimitsReturn {
  const [warnings, setWarnings] = useState<ThresholdWarning[]>([]);
  const [limitError, setLimitError] = useState<LimitError | null>(null);

  const clearError = useCallback(() => setLimitError(null), []);

  // Fetch threshold warnings on mount / when ids change
  useEffect(() => {
    if (!workspaceId || !planName) return;
    checkThreshold(workspaceId, planName).then(setWarnings).catch(() => {});
  }, [workspaceId, planName]);

  const refreshWarnings = useCallback(() => {
    if (!workspaceId || !planName) return;
    checkThreshold(workspaceId, planName).then(setWarnings).catch(() => {});
  }, [workspaceId, planName]);

  const checkEmail = useCallback(
    async (inboxId: string): Promise<boolean> => {
      if (!workspaceId || !planName) return false;
      const err = await checkEmailAllowed(workspaceId, inboxId, planName);
      if (err) {
        setLimitError(err);
        refreshWarnings();
        return false;
      }
      return true;
    },
    [workspaceId, planName, refreshWarnings],
  );

  const checkLinkedIn = useCallback(async (): Promise<boolean> => {
    if (!workspaceId || !planName) return false;
    const err = await checkLinkedInAllowed(workspaceId, planName);
    if (err) {
      setLimitError(err);
      refreshWarnings();
      return false;
    }
    return true;
  }, [workspaceId, planName, refreshWarnings]);

  return { warnings, checkEmail, checkLinkedIn, limitError, clearError };
}
